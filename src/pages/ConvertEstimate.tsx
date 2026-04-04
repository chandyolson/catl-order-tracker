import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ShoppingCart, Link2, Package } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function ConvertEstimate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState(false);
  const [molyContractNumber, setMolyContractNumber] = useState("");
  const [contractName, setContractName] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");

  // Fetch the estimate
  const estimateQuery = useQuery({
    queryKey: ["estimate_convert", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*, customers(*), base_models:base_model_id(name, short_name), manufacturers:manufacturer_id(id, name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch unassigned orders (on-order equipment with no customer)
  const onOrderQuery = useQuery({
    queryKey: ["unassigned_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, contract_name, moly_contract_number, base_model, build_shorthand, our_cost, status, base_model_id")
        .is("customer_id", null)
        .in("status", ["purchase_order", "order_pending", "building"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch inventory (on-lot equipment with no customer)
  const inventoryQuery = useQuery({
    queryKey: ["inventory_available"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, contract_name, moly_contract_number, base_model, build_shorthand, our_cost, status, base_model_id")
        .is("customer_id", null)
        .eq("from_inventory", true)
        .eq("status", "ready")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const estimate = estimateQuery.data;
  const customer = estimate?.customers as any;
  const baseModel = estimate?.base_models as any;

  // Set contract name default from customer
  if (customer?.name && !contractName) {
    // Don't auto-set in render, use effect or leave for user
  }

  async function handleNewOrder() {
    if (!estimate) return;
    setConverting(true);
    try {
      const { data: order, error: orderError } = await supabase.from("orders").insert({
        customer_id: estimate.customer_id,
        manufacturer_id: estimate.manufacturer_id,
        base_model_id: estimate.base_model_id,
        base_model: baseModel?.name || null,
        contract_name: contractName || customer?.name || null,
        moly_contract_number: molyContractNumber || null,
        mfg_contract_number: molyContractNumber || null,
        build_shorthand: estimate.build_shorthand,
        build_description: estimate.notes || null,
        subtotal: estimate.subtotal,
        customer_price: estimate.total_price,
        our_cost: estimate.our_cost,
        discount_type: estimate.discount_type || "$",
        discount_amount: estimate.discount_amount || 0,
        freight_estimate: estimate.freight_estimate,
        status: "purchase_order",
        source_type: "estimate",
        estimate_date: estimate.estimate_date || format(new Date(), "yyyy-MM-dd"),
        ordered_date: format(new Date(), "yyyy-MM-dd"),
        selected_options: estimate.selected_options || estimate.line_items || [],
        notes: estimate.notes,
        tax_state: estimate.tax_state,
        tax_rate: estimate.tax_rate || 0,
        tax_amount: estimate.tax_amount || 0,
        total_with_tax: estimate.total_with_tax,
      }).select().single();
      if (orderError) throw orderError;

      // Link estimate to order
      await supabase.from("estimates").update({
        order_id: order.id,
        converted_to_order: true,
        converted_at: new Date().toISOString(),
        conversion_type: "new_order",
        status: "approved",
      }).eq("id", estimate.id);

      // Timeline entry
      await supabase.from("order_timeline").insert({
        order_id: order.id,
        event_type: "order_created",
        title: "Order created from estimate",
        description: `Estimate ${estimate.estimate_number || ""} converted to new order. ${molyContractNumber ? `Contract #${molyContractNumber}` : ""}`,
        created_by: "system",
      });

      queryClient.invalidateQueries({ queryKey: ["open_estimates"] });
      toast.success(`Order created from ${estimate.estimate_number || "estimate"}`);
      navigate(`/orders/${order.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setConverting(false);
    }
  }

  async function handleMatchExisting() {
    if (!estimate || !selectedOrderId) return;
    setConverting(true);
    try {
      // Assign customer to the existing order
      await supabase.from("orders").update({
        customer_id: estimate.customer_id,
        customer_price: estimate.total_price,
        source_type: "estimate",
        tax_state: estimate.tax_state,
        tax_rate: estimate.tax_rate || 0,
        tax_amount: estimate.tax_amount || 0,
        total_with_tax: estimate.total_with_tax,
      }).eq("id", selectedOrderId);

      // Link estimate to order
      await supabase.from("estimates").update({
        order_id: selectedOrderId,
        converted_to_order: true,
        converted_at: new Date().toISOString(),
        conversion_type: "match_existing",
        status: "approved",
      }).eq("id", estimate.id);

      // Timeline entry
      await supabase.from("order_timeline").insert({
        order_id: selectedOrderId,
        event_type: "customer_assigned",
        title: `Customer assigned from estimate`,
        description: `${customer?.name || "Customer"} linked via estimate ${estimate.estimate_number || ""}`,
        created_by: "system",
      });

      queryClient.invalidateQueries({ queryKey: ["open_estimates"] });
      toast.success(`Estimate matched to existing order`);
      navigate(`/orders/${selectedOrderId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to match order");
    } finally {
      setConverting(false);
    }
  }

  async function handleAssignInventory() {
    if (!estimate || !selectedOrderId) return;
    setConverting(true);
    try {
      // Assign customer and update status
      await supabase.from("orders").update({
        customer_id: estimate.customer_id,
        customer_price: estimate.total_price,
        status: "ready",
        source_type: "estimate",
        tax_state: estimate.tax_state,
        tax_rate: estimate.tax_rate || 0,
        tax_amount: estimate.tax_amount || 0,
        total_with_tax: estimate.total_with_tax,
      }).eq("id", selectedOrderId);

      // Link estimate to order
      await supabase.from("estimates").update({
        order_id: selectedOrderId,
        converted_to_order: true,
        converted_at: new Date().toISOString(),
        conversion_type: "assign_inventory",
        status: "approved",
      }).eq("id", estimate.id);

      // Timeline entry
      await supabase.from("order_timeline").insert({
        order_id: selectedOrderId,
        event_type: "customer_assigned",
        title: `Sold from inventory`,
        description: `${customer?.name || "Customer"} assigned to inventory item via estimate ${estimate.estimate_number || ""}`,
        created_by: "system",
      });

      queryClient.invalidateQueries({ queryKey: ["open_estimates"] });
      toast.success(`Equipment assigned to ${customer?.name || "customer"} from inventory`);
      navigate(`/orders/${selectedOrderId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to assign inventory");
    } finally {
      setConverting(false);
    }
  }

  if (estimateQuery.isLoading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!estimate) return <div className="p-6 text-center text-muted-foreground">Estimate not found</div>;

  const onOrderItems = onOrderQuery.data || [];
  const inventoryItems = inventoryQuery.data || [];
  // Highlight items with matching base model
  const matchingOnOrder = onOrderItems.filter(o => o.base_model_id === estimate.base_model_id);
  const otherOnOrder = onOrderItems.filter(o => o.base_model_id !== estimate.base_model_id);
  const matchingInventory = inventoryItems.filter(o => o.base_model_id === estimate.base_model_id);
  const otherInventory = inventoryItems.filter(o => o.base_model_id !== estimate.base_model_id);

  return (
    <div className="max-w-2xl mx-auto pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/leads")} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-foreground">Convert to Order</h1>
          <p className="text-[13px] text-muted-foreground">
            {estimate.estimate_number && <span className="font-bold" style={{ color: "#F3D12A" }}>{estimate.estimate_number}</span>}
            {" · "}{baseModel?.name || estimate.build_shorthand} · {fmtCurrency(estimate.total_price)}
            {customer && <span> · {customer.name}</span>}
          </p>
        </div>
      </div>

      {/* Option 1: Order new from manufacturer */}
      <div className="rounded-xl border-2 border-border p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(14,38,70,0.08)" }}>
            <ShoppingCart size={20} style={{ color: "#0E2646" }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">Order new from manufacturer</p>
            <p className="text-[12px] text-muted-foreground">Place a new order based on this estimate's configuration</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Contract Name</p>
            <input
              type="text"
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              placeholder={customer?.name || "e.g. Smith Ranch Chute"}
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px]"
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1">MOLY Contract #</p>
            <input
              type="text"
              value={molyContractNumber}
              onChange={(e) => setMolyContractNumber(e.target.value)}
              placeholder="e.g. 44275"
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px]"
            />
          </div>
        </div>
        <button
          onClick={handleNewOrder}
          disabled={converting}
          className="w-full rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: "#0E2646", color: "#F3D12A" }}
        >
          {converting ? "Creating order..." : "Create Order & Place with Manufacturer"}
        </button>
      </div>

      {/* Option 2: Match to existing on-order equipment */}
      <div className="rounded-xl border-2 border-border p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(85,186,170,0.08)" }}>
            <Link2 size={20} style={{ color: "#55BAAA" }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">Match to on-order equipment</p>
            <p className="text-[12px] text-muted-foreground">Assign this customer to equipment already ordered but not yet assigned</p>
          </div>
        </div>
        {onOrderItems.length === 0 ? (
          <p className="text-[13px] text-muted-foreground italic py-2">No unassigned on-order equipment</p>
        ) : (
          <div className="space-y-1.5 mb-3 max-h-60 overflow-y-auto">
            {[...matchingOnOrder, ...otherOnOrder].map((o) => {
              const isMatch = o.base_model_id === estimate.base_model_id;
              return (
                <label key={o.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedOrderId === o.id ? "border-2" : "border-border"}`}
                  style={selectedOrderId === o.id ? { borderColor: "#55BAAA" } : undefined}
                >
                  <input type="radio" name="matchOrder" checked={selectedOrderId === o.id} onChange={() => setSelectedOrderId(o.id)} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isMatch && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#0F6E56" }}>Match</span>}
                      <span className="text-[12px] font-medium truncate" style={{ color: "#0E2646" }}>{o.contract_name || o.moly_contract_number || "Unnamed"}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{o.build_shorthand || o.base_model} · {fmtCurrency(o.our_cost)}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <button
          onClick={handleMatchExisting}
          disabled={converting || !selectedOrderId || !onOrderItems.some(o => o.id === selectedOrderId)}
          className="w-full rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ border: "2px solid #55BAAA", color: "#55BAAA", backgroundColor: "transparent" }}
        >
          {converting ? "Matching..." : "Assign Customer to Selected Order"}
        </button>
      </div>

      {/* Option 3: Assign from inventory */}
      <div className="rounded-xl border-2 border-border p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(243,209,42,0.1)" }}>
            <Package size={20} style={{ color: "#B8930A" }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">Sell from inventory</p>
            <p className="text-[12px] text-muted-foreground">Assign this customer to equipment already on the lot</p>
          </div>
        </div>
        {inventoryItems.length === 0 ? (
          <p className="text-[13px] text-muted-foreground italic py-2">No inventory available</p>
        ) : (
          <div className="space-y-1.5 mb-3 max-h-60 overflow-y-auto">
            {[...matchingInventory, ...otherInventory].map((o) => {
              const isMatch = o.base_model_id === estimate.base_model_id;
              return (
                <label key={o.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedOrderId === o.id ? "border-2" : "border-border"}`}
                  style={selectedOrderId === o.id ? { borderColor: "#F3D12A" } : undefined}
                >
                  <input type="radio" name="matchOrder" checked={selectedOrderId === o.id} onChange={() => setSelectedOrderId(o.id)} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isMatch && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.2)", color: "#854F0B" }}>Match</span>}
                      <span className="text-[12px] font-medium truncate" style={{ color: "#0E2646" }}>{o.contract_name || o.moly_contract_number || "Unnamed"}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{o.build_shorthand || o.base_model} · {fmtCurrency(o.our_cost)}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <button
          onClick={handleAssignInventory}
          disabled={converting || !selectedOrderId || !inventoryItems.some(o => o.id === selectedOrderId)}
          className="w-full rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
        >
          {converting ? "Assigning..." : "Sell from Inventory to Customer"}
        </button>
      </div>
    </div>
  );
}
