import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import EquipmentConfigurator, { ConfiguratorHandle } from "@/components/equipment/EquipmentConfigurator";
import { ConfiguratorState } from "@/components/equipment/shared";

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDirectOrder = searchParams.get("type") === "order";
  const configuratorRef = useRef<ConfiguratorHandle>(null);

  /* ── Page-level state ──────────────────────────────────── */
  const [molyContractNumber, setMolyContractNumber] = useState("");
  const [contractName, setContractName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerToggle, setCustomerToggle] = useState(false);
  const [notes, setNotes] = useState("");
  const [estimateNumber, setEstimateNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMolyPortal, setShowMolyPortal] = useState(false);
  const [portalUrl, setPortalUrl] = useState("");

  /* ── Auto-fill estimate number ─────────────────────────── */
  useEffect(() => {
    if (!isDirectOrder && !estimateNumber) {
      supabase.rpc("generate_estimate_number").then(({ data, error }) => {
        if (!error && data) setEstimateNumber(data);
      });
    }
  }, [isDirectOrder]);

  /* ── Customer search ───────────────────────────────────── */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(customerSearch), 300); return () => clearTimeout(t); }, [customerSearch]);

  const customerSearchQuery = useQuery({
    queryKey: ["customer-search", debouncedSearch],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers")
        .select("id, name, email, phone, company, address_city, address_state, customer_type")
        .ilike("name", `%${debouncedSearch}%`).order("name").limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: debouncedSearch.length >= 2,
  });

  const selectedCustomerQuery = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers")
        .select("id, name, email, phone, address_city, address_state, customer_type")
        .eq("id", customerId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });
  const selectedCustomer = customerId ? selectedCustomerQuery.data ?? null : null;

  /* ── Manufacturer query for portal URL ─────────────────── */
  const manufacturersQuery = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => { const { data, error } = await supabase.from("manufacturers").select("*").order("name"); if (error) throw error; return data; },
  });

  const handleConfigChange = useCallback((state: ConfiguratorState) => {
    const mfr = manufacturersQuery.data?.find((m) => m.id === state.manufacturerId);
    const isMoly = mfr?.name?.toLowerCase().includes("moly") || mfr?.short_name?.toLowerCase().includes("moly");
    setShowMolyPortal(!!isMoly);
    setPortalUrl(mfr?.ordering_portal_url || "https://ordering.molymfg.com/login.php");
  }, [manufacturersQuery.data]);

  /* ── Submit ────────────────────────────────────────────── */
  async function handleSubmit() {
    const state = configuratorRef.current?.getState();
    if (!state) return;
    if (!state.manufacturerId) { toast.error("Select a manufacturer"); return; }
    if (!state.baseModelId) { toast.error("Select a base model"); return; }

    setSubmitting(true);
    try {
      const selectedBaseModel = (await supabase.from("base_models").select("*").eq("id", state.baseModelId).single()).data;

      const selectedOptionsJson = state.selectedOptionsList.map((s) => {
        const isPivot = s.pivotType != null;
        return {
          option_id: s.option.id,
          display_name: isPivot ? (s.pivotType === "side_to_side" ? "Pivot · Side-to-Side" : "Pivot · Front-to-Back") : (s.option.display_name || s.option.name),
          name: s.option.name, short_code: s.option.short_code,
          cost_price_each: s.option.cost_price, retail_price_each: s.option.retail_price,
          ...(isPivot ? { pivot_type: s.pivotType, side: s.pivotSide, side_label: s.pivotType === "side_to_side" ? "Dominant side" : "Mounted on" } : { left_qty: s.left, right_qty: s.right }),
          quantity: s.quantity, total_cost: s.option.cost_price * s.quantity, total_retail: s.option.retail_price * s.quantity,
        };
      });
      const customOptionsJson = state.customLineItems.filter(c => c.name.trim()).map(c => ({
        option_id: null, is_custom: true, display_name: c.name.trim(), name: c.name.trim(), short_code: "",
        cost_price_each: parseFloat(c.cost) || 0, retail_price_each: parseFloat(c.retail) || 0,
        left_qty: 0, right_qty: 0, quantity: 1, total_cost: parseFloat(c.cost) || 0, total_retail: parseFloat(c.retail) || 0,
      }));
      const allOptionsJson = [...selectedOptionsJson, ...customOptionsJson];

      if (isDirectOrder) {
        const { data: order, error: orderError } = await supabase.from("orders").insert({
          order_number: molyContractNumber || null, customer_id: customerId || null,
          manufacturer_id: state.manufacturerId, base_model_id: state.baseModelId,
          base_model: selectedBaseModel?.name || null, contract_name: contractName || null,
          moly_contract_number: molyContractNumber || null, build_shorthand: state.buildShorthand,
          build_description: notes || null, subtotal: state.calcRetail,
          customer_price: state.customerPrice, our_cost: state.ourCost,
          discount_type: state.discountType, discount_amount: parseFloat(state.discountAmount) || 0,
          freight_estimate: state.freightEstimate ? parseFloat(state.freightEstimate) : null,
          status: "purchase_order", equipment_status: "ordered",
          customer_status: customerId ? "sold" : null, source_type: "direct_order",
          ordered_date: format(new Date(), "yyyy-MM-dd"), from_inventory: !customerId,
          selected_options: allOptionsJson, notes: notes || null,
          tax_state: state.taxState || null, tax_rate: state.taxRate || 0,
          tax_amount: state.taxAmount || 0, total_with_tax: state.taxRate > 0 ? state.totalWithTax : null,
          controls_side: state.controlsSide || null,
        }).select().single();
        if (orderError) throw orderError;
        toast.success(`Order ${molyContractNumber || contractName || "created"}`);
        navigate(`/orders/${order.id}`);
      } else {
        const lineItems = [
          { type: "base_model", id: state.baseModelId, name: selectedBaseModel?.name, retail_price: selectedBaseModel?.retail_price, cost_price: selectedBaseModel?.cost_price },
          ...selectedOptionsJson.map((o) => ({ type: "option" as const, ...o })),
          ...customOptionsJson.map((o) => ({ type: "custom" as const, ...o })),
        ];
        const { data: est, error: estError } = await supabase.from("estimates").insert({
          customer_id: customerId || null, manufacturer_id: state.manufacturerId,
          base_model_id: state.baseModelId || null, estimate_number: estimateNumber,
          estimate_date: format(new Date(), "yyyy-MM-dd"), contract_name: contractName || null,
          status: "open", version_number: 1, build_shorthand: state.buildShorthand,
          subtotal: state.calcRetail, total_price: state.customerPrice, our_cost: state.ourCost,
          discount_type: state.discountType, discount_amount: parseFloat(state.discountAmount) || 0,
          freight_estimate: state.freightEstimate ? parseFloat(state.freightEstimate) : null,
          is_current: true, line_items: lineItems, selected_options: allOptionsJson,
          tax_state: state.taxState || null, tax_rate: state.taxRate || 0,
          tax_amount: state.taxAmount || 0, total_with_tax: state.taxRate > 0 ? state.totalWithTax : null,
          notes: notes || null,
        }).select().single();
        if (estError) throw estError;
        toast.success(`Estimate ${estimateNumber || ""} created`);
        navigate(`/leads`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create");
    } finally { setSubmitting(false); }
  }

  /* ─── RENDER ───────────────────────────────────────────── */
  return (
    <div className="mx-auto pb-40 overflow-x-hidden max-w-full" style={{ background: "#F5F5F0" }}>
      {/* Navy header */}
      <div className="sticky top-0 z-10 md:max-w-[680px] md:mx-auto" style={{ background: "#0E2646", borderRadius: "0 0 12px 12px", padding: "12px 16px" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-0.5" style={{ color: "#55BAAA" }}><ChevronLeft size={20} /></button>
            <span className="text-[15px] font-medium" style={{ color: "#F5F5F0" }}>{isDirectOrder ? "New order" : "New estimate"}</span>
          </div>
          <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.5)" }}>{contractName || molyContractNumber || "Untitled"}</span>
        </div>
      </div>

      <div className="md:max-w-[680px] md:mx-auto px-4 mt-4 space-y-3">
        {/* Contract / Estimate # */}
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: "#D4D4D0" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] mb-2" style={{ color: "#0E2646" }}>{isDirectOrder ? "Contract #" : "Estimate #"}</p>
          {isDirectOrder ? (
            <>
              <input value={molyContractNumber} onChange={(e) => setMolyContractNumber(e.target.value)} placeholder="Moly contract number"
                className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" />
              <input value={contractName} onChange={(e) => setContractName(e.target.value)} placeholder="Contract name (e.g. Smith Ranch)"
                className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25 mt-2" />
            </>
          ) : (
            <input value={estimateNumber} onChange={(e) => setEstimateNumber(e.target.value)} placeholder="Auto-generated"
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25"
              style={{ fontWeight: 500, color: "#55BAAA" }} />
          )}
        </div>

        {/* Customer toggle */}
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: "#D4D4D0" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "#0E2646" }}>Assign customer</p>
              <p className="text-[11px]" style={{ color: "#717182" }}>{customerToggle ? "Customer order" : "Inventory — no customer yet"}</p>
            </div>
            <Switch checked={customerToggle} onCheckedChange={(v) => { setCustomerToggle(v); if (!v) { setCustomerId(""); setCustomerSearch(""); } }} />
          </div>
          {customerToggle && (
            <div className="mt-3">
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="w-full border border-border rounded-lg px-3 py-2.5 text-left text-[16px] bg-card"
                    style={{ color: selectedCustomer ? "#0E2646" : "#717182" }}>
                    {selectedCustomer ? selectedCustomer.name : "Search customers..."}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type a name..." value={customerSearch} onValueChange={setCustomerSearch} />
                    <CommandList>
                      <CommandEmpty>No customers found</CommandEmpty>
                      <CommandGroup>
                        {(customerSearchQuery.data || []).map((c) => (
                          <CommandItem key={c.id} onSelect={() => { setCustomerId(c.id); setCustomerSearch(c.name); setCustomerPopoverOpen(false); if (!contractName && c.name) setContractName(c.name); }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium truncate">{c.name}</p>
                              <p className="text-[11px] text-muted-foreground">{[c.address_city, c.address_state].filter(Boolean).join(", ")}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedCustomer && (
                <div className="mt-2 px-1 text-[11px]" style={{ color: "#717182" }}>
                  {[selectedCustomer.address_city, selectedCustomer.address_state].filter(Boolean).join(", ")}
                  {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Equipment Configurator */}
        <EquipmentConfigurator ref={configuratorRef} onChange={handleConfigChange} />

        {/* Notes */}
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: "#D4D4D0" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] mb-2" style={{ color: "#0E2646" }}>Notes</p>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this order..." rows={3}
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] resize-none focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" />
        </div>

        {/* Buttons */}
        <div className="mt-4 space-y-2">
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full rounded-full py-3.5 text-[15px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ background: "#55BAAA", color: "#0E2646" }}>
            {submitting ? "Creating..." : isDirectOrder ? "Create order" : "Create estimate"}
          </button>
          {showMolyPortal && isDirectOrder && (
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"
              className="w-full rounded-full py-3 text-[14px] font-medium flex items-center justify-center gap-2 border transition-colors"
              style={{ borderColor: "#0E2646", color: "#0E2646" }}>
              Enter on Moly portal <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
