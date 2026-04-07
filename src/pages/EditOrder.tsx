import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import EquipmentConfigurator, { ConfiguratorHandle } from "@/components/equipment/EquipmentConfigurator";
import { ConfiguratorState, ConfiguratorInitialValues, CustomLineItem } from "@/components/equipment/shared";

const STATE_TAX_RATES: Record<string, { rate: number }> = {
  SD: { rate: 4.2 },
  ND: { rate: 3.0 },
  MN: { rate: 6.875 },
  MT: { rate: 0 },
  WY: { rate: 4.0 },
  NE: { rate: 5.5 },
  CO: { rate: 2.9 },
  KS: { rate: 6.5 },
  IA: { rate: 6.0 },
  MO: { rate: 4.225 },
};

/* ─── Two-track status definitions ───────────────────────── */

const EQUIPMENT_STATUSES = ["ordered", "building", "ready", "in_transit", "at_catl", "delivered"];
const EQUIPMENT_LABELS: Record<string, string> = {
  ordered: "Ordered", building: "Building", ready: "Ready",
  in_transit: "In Transit", at_catl: "At CATL", delivered: "Delivered",
};

const CUSTOMER_STATUSES = ["estimate", "sold", "awaiting_delivery", "delivered", "paid", "closed"];
const CUSTOMER_LABELS: Record<string, string> = {
  estimate: "Estimate", sold: "Sold", awaiting_delivery: "Awaiting",
  delivered: "Delivered", paid: "Paid", closed: "Closed",
};

function StatusPipeline({ statuses, labels, current, onChange, color }: {
  statuses: string[]; labels: Record<string, string>; current: string;
  onChange: (s: string) => void; color: string;
}) {
  const idx = statuses.indexOf(current);
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((s, i) => {
        const isActive = i <= idx;
        const isCurrent = s === current;
        return (
          <button key={s} type="button" onClick={() => onChange(s)}
            className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap transition-all",
              isCurrent ? "ring-2 ring-offset-1 ring-offset-[#0E2646]" : "")}
            style={{
              background: isActive ? color : "rgba(245,245,240,0.12)",
              color: isActive ? "#0E2646" : "rgba(245,245,240,0.45)",
              ["--tw-ring-color" as string]: color,
            }}>
            {labels[s] || s}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────── */

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const configuratorRef = useRef<ConfiguratorHandle>(null);

  /* ── Page-level state ──────────────────────────────────── */
  const [molyContractNumber, setMolyContractNumber] = useState("");
  const [contractName, setContractName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [equipmentStatus, setEquipmentStatus] = useState("ordered");
  const [customerStatus, setCustomerStatus] = useState("");
  const [showMolyPortal, setShowMolyPortal] = useState(false);
  const [portalUrl, setPortalUrl] = useState("");
  const [initialValues, setInitialValues] = useState<ConfiguratorInitialValues | undefined>();
  const [pageReady, setPageReady] = useState(false);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState("");

  /* ── Load existing order ───────────────────────────────── */
  const orderQuery = useQuery({
    queryKey: ["order_edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, manufacturers:manufacturer_id(id, name, short_name, ordering_portal_url)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  /* ── Populate page state from loaded order ─────────────── */
  useEffect(() => {
    if (!orderQuery.data || pageReady) return;
    const o = orderQuery.data;
    setMolyContractNumber(o.moly_contract_number || "");
    setContractName(o.contract_name || "");
    setCustomerId(o.customer_id || "");
    setNotes(o.notes || o.build_description || "");
    setEquipmentStatus(o.equipment_status || "ordered");
    setCustomerStatus(o.customer_status || "");

    // Manufacturer portal + controlled manufacturer state
    const mfr = o.manufacturers as any;
    const isMoly = mfr?.name?.toLowerCase().includes("moly") || mfr?.short_name?.toLowerCase().includes("moly");
    setShowMolyPortal(!!isMoly);
    setPortalUrl(mfr?.ordering_portal_url || "https://ordering.molymfg.com/login.php");
    setSelectedManufacturerId(o.manufacturer_id || "");

    // Build custom line items from saved options
    const savedCustom = ((o.selected_options || []) as any[]).filter((opt: any) => opt.is_custom);
    const customItems: CustomLineItem[] = savedCustom.map((c: any) => ({
      name: c.name || c.display_name || "",
      retail: String(c.retail_price_each || c.total_retail || ""),
      cost: String(c.cost_price_each || c.total_cost || ""),
    }));

    // Set initial values for configurator
    setInitialValues({
      manufacturerId: o.manufacturer_id || "",
      baseModelId: o.base_model_id || "",
      buildShorthand: o.build_shorthand || "",
      selectedOptions: (o.selected_options || []) as any[],
      customLineItems: customItems,
      discountType: (o.discount_type as "$" | "%") || "$",
      discountAmount: o.discount_amount ? String(o.discount_amount) : "",
      freightEstimate: o.freight_estimate ? String(o.freight_estimate) : "",
      taxState: o.tax_state || "",
      taxRate: o.tax_rate || 0,
      controlsSide: (o as any).controls_side || "",
    });

    setPageReady(true);
  }, [orderQuery.data, pageReady]);

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

  const manufacturersQuery = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => { const { data, error } = await supabase.from("manufacturers").select("*").order("name"); if (error) throw error; return data; },
  });

  const handleConfigChange = useCallback((state: ConfiguratorState) => {}, []);

  /* ── Save ──────────────────────────────────────────────── */
  async function handleSave() {
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

      const { error: updateError } = await supabase.from("orders").update({
        customer_id: customerId || null,
        manufacturer_id: state.manufacturerId,
        base_model_id: state.baseModelId,
        base_model: selectedBaseModel?.name || null,
        contract_name: contractName || null,
        moly_contract_number: molyContractNumber || null,
        build_shorthand: state.buildShorthand,
        build_description: notes || null,
        subtotal: state.calcRetail,
        customer_price: state.customerPrice,
        our_cost: state.ourCost,
        discount_type: state.discountType,
        discount_amount: parseFloat(state.discountAmount) || 0,
        freight_estimate: state.freightEstimate ? parseFloat(state.freightEstimate) : null,
        equipment_status: equipmentStatus,
        customer_status: customerId ? customerStatus || "sold" : null,
        from_inventory: !customerId,
        selected_options: allOptionsJson,
        notes: notes || null,
        tax_state: state.taxState || null,
        tax_rate: state.taxRate || 0,
        tax_amount: state.taxAmount || 0,
        total_with_tax: state.taxRate > 0 ? state.totalWithTax : null,
        controls_side: state.controlsSide || null,
      }).eq("id", id!);

      if (updateError) throw updateError;
      toast.success("Saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally { setSubmitting(false); }
  }

  /* ─── Loading state ────────────────────────────────────── */
  if (orderQuery.isLoading) {
    return <div className="p-6 text-center text-muted-foreground" style={{ background: "#F5F5F0", minHeight: "100vh" }}>Loading order...</div>;
  }
  if (!orderQuery.data) {
    return <div className="p-6 text-center text-muted-foreground" style={{ background: "#F5F5F0", minHeight: "100vh" }}>Order not found</div>;
  }

  /* ─── RENDER ───────────────────────────────────────────── */
  return (
    <div className="mx-auto pb-40 overflow-x-hidden max-w-full" style={{ background: "#F5F5F0" }}>
      {/* Navy header with two-track pipeline */}
      <div className="sticky top-0 z-10 md:max-w-[680px] md:mx-auto" style={{ background: "#0E2646", borderRadius: "0 0 12px 12px", padding: "12px 16px" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-0.5" style={{ color: "#55BAAA" }}><ChevronLeft size={20} /></button>
            <span className="text-[15px] font-medium" style={{ color: "#F5F5F0" }}>
              Edit: {molyContractNumber || contractName || "Order"}
            </span>
          </div>
          {selectedCustomer && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.18)", border: "1px solid rgba(243,209,42,0.4)" }}>
              <span className="text-[11px] font-bold" style={{ color: "#F3D12A" }}>{selectedCustomer.name}</span>
            </div>
          )}
        </div>
        <div className="mb-1.5">
          <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "rgba(85,186,170,0.6)" }}>Equipment</p>
          <StatusPipeline statuses={EQUIPMENT_STATUSES} labels={EQUIPMENT_LABELS} current={equipmentStatus} onChange={setEquipmentStatus} color="#55BAAA" />
        </div>
        {customerId && (
          <div>
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "rgba(243,209,42,0.6)" }}>Customer</p>
            <StatusPipeline statuses={CUSTOMER_STATUSES} labels={CUSTOMER_LABELS} current={customerStatus || "estimate"} onChange={setCustomerStatus} color="#F3D12A" />
          </div>
        )}
      </div>

      <div className="md:max-w-[680px] md:mx-auto px-4 mt-4 space-y-3">

        {/* ── Order info card: Mfg + Contract + Customer ── */}
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>

          {/* Manufacturer row */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Mfg</span>
            <select
              value={selectedManufacturerId}
              onChange={(e) => {
                const mfr = manufacturersQuery.data?.find((m) => m.id === e.target.value);
                const isMoly = mfr?.name?.toLowerCase().includes("moly");
                setShowMolyPortal(!!isMoly);
                setPortalUrl(mfr?.ordering_portal_url || "https://ordering.molymfg.com/login.php");
                setSelectedManufacturerId(e.target.value);
              }}
              className="flex-1 border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none text-[15px] focus:border-catl-gold">
              <option value="">Select manufacturer</option>
              {manufacturersQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Contract # + Name on same line */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Contract</span>
            <input value={molyContractNumber} onChange={(e) => setMolyContractNumber(e.target.value)}
              placeholder="#####" style={{ width: 96, fontWeight: 700, color: "#0E2646" }}
              className="border border-border rounded-lg px-2 py-2 bg-card text-foreground outline-none text-[15px] focus:border-catl-gold text-center shrink-0" />
            <input value={contractName} onChange={(e) => setContractName(e.target.value)}
              placeholder="Name"
              className="flex-1 border border-border rounded-lg px-2 py-2 bg-card text-foreground outline-none text-[14px] focus:border-catl-gold" style={{ color: "#717182" }} />
          </div>

          {/* Customer row */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: customerId ? "0.5px solid #EBEBEB" : "none" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Customer</span>
            {customerId && selectedCustomer ? (
              <div className="flex-1 flex items-center justify-between min-w-0">
                <div className="min-w-0">
                  <span className="text-[14px] font-medium truncate block" style={{ color: "#0E2646" }}>{selectedCustomer.name}</span>
                </div>
                <button onClick={() => { setCustomerId(""); setCustomerSearch(""); setCustomerStatus(""); }}
                  className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ml-2"
                  style={{ backgroundColor: "rgba(212,24,61,0.08)", color: "#D4183D" }}>✕ Clear</button>
              </div>
            ) : (
              <Popover open={customerPopoverOpen} onOpenChange={(open) => { setCustomerPopoverOpen(open); if (open) setCustomerSearch(""); }}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex-1 border border-border rounded-lg px-3 py-2 text-left text-[15px] bg-card"
                    style={{ color: "#717182" }}>Search customers…</button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Type a name..." value={customerSearch} onValueChange={setCustomerSearch} />
                    <CommandList>
                      <CommandEmpty>{debouncedSearch.length < 2 ? "Type at least 2 characters..." : "No customers found"}</CommandEmpty>
                      <CommandGroup>
                        {(customerSearchQuery.data || []).map((c) => (
                          <CommandItem key={c.id} value={c.id} onSelect={() => { setCustomerId(c.id); setCustomerPopoverOpen(false); if (!customerStatus) setCustomerStatus("sold"); if (!contractName && c.name) setContractName(c.name); }}>
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
            )}
          </div>

          {/* Customer detail line */}
          {customerId && selectedCustomer && (
            <div className="px-4 pb-2.5" style={{ paddingLeft: "calc(1rem + 80px + 0.75rem)" }}>
              <span className="text-[11px]" style={{ color: "#717182" }}>
                {[selectedCustomer.address_city, selectedCustomer.address_state].filter(Boolean).join(", ")}
                {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
              </span>
            </div>
          )}
        </div>

        {/* ── Equipment Configurator ── */}
        {pageReady && initialValues && (
          <EquipmentConfigurator
            ref={configuratorRef}
            initialValues={initialValues}
            manufacturerId={selectedManufacturerId}
            onChange={handleConfigChange}
          />
        )}

        {/* ── Notes ── */}
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
          <div className="flex items-start gap-3 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0 pt-2" style={{ color: "#717182" }}>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this order..." rows={2}
              className="flex-1 border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none text-[15px] resize-none focus:border-catl-gold" />
          </div>
        </div>

        {/* ── Buttons ── */}
        <div className="mt-4 space-y-2">
          <button onClick={handleSave} disabled={submitting}
            className="w-full rounded-full py-3.5 text-[15px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ background: "#F3D12A", color: "#0E2646" }}>
            {submitting ? "Saving..." : "Save order"}
          </button>
          {showMolyPortal && (
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
