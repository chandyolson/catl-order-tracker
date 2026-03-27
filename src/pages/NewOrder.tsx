import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronDown, Plus } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  "estimate", "approved", "ordered", "so_received", "in_production",
  "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed",
];

function FormRow({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <label className="text-sm font-semibold text-foreground flex-shrink-0 pt-2.5" style={{ width: 85 }}>
          {label}
        </label>
        <div className="flex-1">{children}</div>
      </div>
      {error && <p className="text-xs mt-1 ml-[93px]" style={{ color: "#D4183D" }}>{error}</p>}
    </div>
  );
}

function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden focus-within:ring-2 focus-within:ring-catl-gold/25 focus-within:border-catl-gold">
      <span className="pl-3 text-muted-foreground text-sm font-medium">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          onChange(raw);
        }}
        placeholder={placeholder}
        className="flex-1 px-2 py-2.5 bg-transparent outline-none text-foreground"
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-[13px] font-bold text-catl-navy mt-6 mb-3 uppercase tracking-wide">{title}</h3>;
}

export default function NewOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", city: "", state: "", type: "" });
  const [manufacturerId, setManufacturerId] = useState("");
  const [baseModel, setBaseModel] = useState("");
  const [buildShorthand, setBuildShorthand] = useState("");
  const [buildDescription, setBuildDescription] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [ourCost, setOurCost] = useState("");
  const [freightEstimate, setFreightEstimate] = useState("");
  const [status, setStatus] = useState("estimate");
  const [estimateDate, setEstimateDate] = useState<Date>(new Date());
  const [estCompletionDate, setEstCompletionDate] = useState<Date | undefined>();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [fromInventory, setFromInventory] = useState(false);
  const [inventoryLocation, setInventoryLocation] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Queries
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const manufacturersQuery = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Default manufacturer to MOLY
  useMemo(() => {
    if (manufacturersQuery.data && !manufacturerId) {
      const moly = manufacturersQuery.data.find((m) => m.short_name?.toLowerCase().includes("moly") || m.name?.toLowerCase().includes("moly"));
      if (moly) setManufacturerId(moly.id);
    }
  }, [manufacturersQuery.data, manufacturerId]);

  // Margin calculation
  const margin = useMemo(() => {
    const price = parseFloat(customerPrice);
    const cost = parseFloat(ourCost);
    if (!price || !cost || price <= 0 || cost <= 0) return null;
    const amount = price - cost;
    const percent = (amount / price) * 100;
    return { amount, percent };
  }, [customerPrice, ourCost]);

  const marginColor = margin
    ? margin.percent >= 15 ? "#27AE60"
    : margin.percent >= 10 ? "#F3D12A"
    : "#D4183D"
    : undefined;

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    if (!customersQuery.data) return [];
    if (!customerSearch) return customersQuery.data;
    const q = customerSearch.toLowerCase();
    return customersQuery.data.filter((c) => c.name.toLowerCase().includes(q));
  }, [customersQuery.data, customerSearch]);

  const selectedCustomer = customersQuery.data?.find((c) => c.id === customerId);

  // Add new customer mutation
  const addCustomerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("customers").insert({
        name: newCustomer.name,
        email: newCustomer.email || null,
        phone: newCustomer.phone || null,
        address_city: newCustomer.city || null,
        address_state: newCustomer.state || null,
        customer_type: newCustomer.type || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setCustomerId(data.id);
      setCustomerSearch(data.name);
      setShowNewCustomerForm(false);
      setShowCustomerDropdown(false);
      setNewCustomer({ name: "", email: "", phone: "", city: "", state: "", type: "" });
    },
  });

  // Validate
  function validate() {
    const e: Record<string, string> = {};
    if (!customerId) e.customer = "Customer is required";
    if (!manufacturerId) e.manufacturer = "Manufacturer is required";
    if (!buildShorthand.trim()) e.buildShorthand = "Build shorthand is required";
    if (!customerPrice || parseFloat(customerPrice) <= 0) e.customerPrice = "Customer price must be greater than 0";
    if (!ourCost || parseFloat(ourCost) <= 0) e.ourCost = "Our cost must be greater than 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Submit
  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Generate order number
      const { data: orderNumber, error: rpcError } = await supabase.rpc("generate_order_number");
      if (rpcError) throw rpcError;

      const priceNum = parseFloat(customerPrice);
      const costNum = parseFloat(ourCost);
      const marginAmount = priceNum - costNum;
      const marginPercent = (marginAmount / priceNum) * 100;

      // Insert order
      const { data: order, error: orderError } = await supabase.from("orders").insert({
        order_number: orderNumber,
        customer_id: customerId,
        manufacturer_id: manufacturerId,
        base_model: baseModel || null,
        build_shorthand: buildShorthand,
        build_description: buildDescription || null,
        customer_price: priceNum,
        our_cost: costNum,
        margin_amount: marginAmount,
        margin_percent: marginPercent,
        freight_estimate: freightEstimate ? parseFloat(freightEstimate) : null,
        status,
        estimate_date: format(estimateDate, "yyyy-MM-dd"),
        est_completion_date: estCompletionDate ? format(estCompletionDate, "yyyy-MM-dd") : null,
        from_inventory: fromInventory,
        inventory_location: fromInventory ? inventoryLocation || null : null,
        serial_number: fromInventory ? serialNumber || null : null,
        notes: notes || null,
      }).select().single();
      if (orderError) throw orderError;

      // Insert estimate v1
      const { error: estError } = await supabase.from("estimates").insert({
        order_id: order.id,
        version_number: 1,
        build_shorthand: buildShorthand,
        total_price: priceNum,
        is_current: true,
        line_items: [],
      });
      if (estError) throw estError;

      toast.success(`Order ${orderNumber} created`);
      navigate(`/orders/${order.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)} className="text-catl-teal p-1">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-[17px] font-bold text-foreground">New Order</h1>
      </div>

      {/* Form card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        {/* Customer & Manufacturer */}
        <SectionHeader title="Customer & Manufacturer" />

        <FormRow label="Customer" error={errors.customer}>
          <div className="relative">
            <input
              value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerId("");
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Search customers..."
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
            />
            {showCustomerDropdown && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-auto">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerSearch(c.name);
                      setShowCustomerDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm"
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.address_city && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {c.address_city}, {c.address_state}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setShowNewCustomerForm(true);
                    setShowCustomerDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm font-semibold text-catl-teal flex items-center gap-1 border-t border-border"
                >
                  <Plus size={14} /> Add New Customer
                </button>
              </div>
            )}
          </div>
        </FormRow>

        {/* Inline new customer form */}
        {showNewCustomerForm && (
          <div className="ml-[93px] border border-catl-teal/30 rounded-lg p-3 space-y-2 bg-catl-teal/5">
            <input placeholder="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
              <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="City" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
              <input placeholder="State" value={newCustomer.state} onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
            </div>
            <select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none">
              <option value="">Type (optional)</option>
              <option value="rancher">Rancher</option>
              <option value="feedlot">Feedlot</option>
              <option value="dealer">Dealer</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => addCustomerMutation.mutate()} disabled={!newCustomer.name || addCustomerMutation.isPending} className="px-4 py-2 rounded-lg bg-catl-teal text-white text-sm font-semibold disabled:opacity-50">
                {addCustomerMutation.isPending ? "Saving..." : "Save Customer"}
              </button>
              <button onClick={() => setShowNewCustomerForm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}

        <FormRow label="Manufacturer" error={errors.manufacturer}>
          <select value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none">
            <option value="">Select manufacturer</option>
            {manufacturersQuery.data?.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </FormRow>

        {/* Build Details */}
        <SectionHeader title="Build Details" />

        <FormRow label="Base Model">
          <input value={baseModel} onChange={(e) => setBaseModel(e.target.value)} placeholder="e.g. Ranch Wide Body, HD Wide Body, 44ft Portable..." className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" />
        </FormRow>

        <FormRow label="Build Short" error={errors.buildShorthand}>
          <input
            value={buildShorthand}
            onChange={(e) => setBuildShorthand(e.target.value)}
            placeholder="e.g. CATL Special, Gas, Yoke"
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card outline-none"
            style={{ fontWeight: buildShorthand ? 500 : 400, color: buildShorthand ? "hsl(168, 37%, 53%)" : undefined }}
          />
        </FormRow>

        <FormRow label="Description">
          <textarea value={buildDescription} onChange={(e) => setBuildDescription(e.target.value)} rows={3} placeholder="Detailed notes about the build, special requests, etc." className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none resize-none" />
        </FormRow>

        {/* Pricing */}
        <SectionHeader title="Pricing" />

        <FormRow label="Cust. Price" error={errors.customerPrice}>
          <CurrencyInput value={customerPrice} onChange={setCustomerPrice} />
        </FormRow>

        <FormRow label="Our Cost" error={errors.ourCost}>
          <CurrencyInput value={ourCost} onChange={setOurCost} />
        </FormRow>

        <FormRow label="Margin">
          <div className="py-2.5 text-sm font-semibold" style={{ color: marginColor }}>
            {margin
              ? `$${margin.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${margin.percent.toFixed(1)}%)`
              : "—"}
          </div>
        </FormRow>

        <FormRow label="Freight Est.">
          <CurrencyInput value={freightEstimate} onChange={setFreightEstimate} />
        </FormRow>

        {/* Status & Dates */}
        <SectionHeader title="Status & Dates" />

        <FormRow label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none capitalize">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Est. Date">
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn("w-full text-left border border-border rounded-lg px-3 py-2.5 bg-card text-sm", !estimateDate && "text-muted-foreground")}>
                {estimateDate ? format(estimateDate, "PPP") : "Pick a date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={estimateDate} onSelect={(d) => d && setEstimateDate(d)} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </FormRow>

        <FormRow label="Completion">
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn("w-full text-left border border-border rounded-lg px-3 py-2.5 bg-card text-sm", !estCompletionDate && "text-muted-foreground")}>
                {estCompletionDate ? format(estCompletionDate, "PPP") : "Optional"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={estCompletionDate} onSelect={setEstCompletionDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </FormRow>

        {/* Inventory (collapsible) */}
        <button
          onClick={() => setInventoryOpen(!inventoryOpen)}
          className="flex items-center gap-2 mt-6 mb-2"
        >
          <ChevronDown size={16} className={`text-catl-navy transition-transform ${inventoryOpen ? "rotate-180" : ""}`} />
          <span className="text-[13px] font-bold text-catl-navy uppercase tracking-wide">Inventory Details</span>
        </button>

        {inventoryOpen && (
          <div className="space-y-4 pl-1">
            <FormRow label="From Inv.">
              <div className="py-2">
                <Switch checked={fromInventory} onCheckedChange={setFromInventory} />
              </div>
            </FormRow>
            {fromInventory && (
              <>
                <FormRow label="Location">
                  <input value={inventoryLocation} onChange={(e) => setInventoryLocation(e.target.value)} placeholder="e.g. Warehouse Bay 3, Yard Pad A" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" />
                </FormRow>
                <FormRow label="Serial #">
                  <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" />
                </FormRow>
              </>
            )}
          </div>
        )}

        {/* Notes */}
        <SectionHeader title="Notes" />
        <FormRow label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none resize-none" />
        </FormRow>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-6 w-full md:w-auto px-8 py-3.5 rounded-full bg-catl-gold text-catl-navy font-bold text-base active:scale-[0.97] transition-transform disabled:opacity-60"
      >
        {submitting ? "Creating..." : "Create Order"}
      </button>
    </div>
  );
}
