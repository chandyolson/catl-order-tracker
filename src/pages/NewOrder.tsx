import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronDown, Plus } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  "estimate", "approved", "ordered", "so_received", "in_production",
  "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed",
];

type OptionItem = {
  id: string;
  name: string;
  short_code: string;
  option_group: string | null;
  retail_price: number;
  cost_price: number;
};

function FormRow({ label, error, children, narrow }: { label: string; error?: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <label className="text-sm font-semibold text-foreground flex-shrink-0 pt-2.5 whitespace-nowrap" style={{ width: 120 }}>
          {label}
        </label>
        <div className={cn("flex-1", narrow ? "md:max-w-[200px]" : "md:max-w-[360px]")}>{children}</div>
      </div>
      {error && <p className="text-xs mt-1 ml-[128px]" style={{ color: "#D4183D" }}>{error}</p>}
    </div>
  );
}

function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden focus-within:ring-2 focus-within:ring-catl-gold/25 focus-within:border-catl-gold md:max-w-[200px]">
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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="-mx-4 mt-6 mb-3 px-4 py-2" style={{ background: "#F5F5F0" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: "#0E2646" }}>{title}</h3>
        {subtitle && <span className="text-[11px]" style={{ color: "#717182" }}>{subtitle}</span>}
      </div>
    </div>
  );
}

function OptionGroup({ group, options, checked, onToggle }: {
  group: string;
  options: OptionItem[];
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left text-xs font-bold text-catl-navy uppercase tracking-wide mb-1.5"
      >
        <ChevronDown size={14} className={cn("transition-transform", !open && "-rotate-90")} />
        {group}
      </button>
      {open && (
        <div className="space-y-1 pl-1">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[36px]"
            >
              <Checkbox
                checked={checked.has(opt.id)}
                onCheckedChange={() => onToggle(opt.id)}
                className="h-5 w-5"
              />
              <span className="text-sm text-foreground flex-1">
                {opt.name} ({opt.short_code}) — ${opt.retail_price.toLocaleString()}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function NewOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [manufacturerId, setManufacturerId] = useState("");
  const [baseModelId, setBaseModelId] = useState("");
  const [quickBuildId, setQuickBuildId] = useState("");
  const [checkedOptions, setCheckedOptions] = useState<Set<string>>(new Set());
  const [buildShorthand, setBuildShorthand] = useState("");
  const [buildShorthandManual, setBuildShorthandManual] = useState(false);
  const [customerPrice, setCustomerPrice] = useState("");
  const [customerPriceManual, setCustomerPriceManual] = useState(false);
  const [ourCost, setOurCost] = useState("");
  const [ourCostManual, setOurCostManual] = useState(false);
  const [freightEstimate, setFreightEstimate] = useState("");
  const [catl_number, setCatlNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState("estimate");
  const [estimateDate, setEstimateDate] = useState<Date>(new Date());
  const [estCompletionDate, setEstCompletionDate] = useState<Date | undefined>();
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", city: "", state: "", type: "" });
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [fromInventory, setFromInventory] = useState(false);
  const [inventoryLocation, setInventoryLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Queries
  const manufacturersQuery = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const baseModelsQuery = useQuery({
    queryKey: ["base_models", manufacturerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("base_models")
        .select("*")
        .eq("manufacturer_id", manufacturerId)
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!manufacturerId,
  });

  const quickBuildsQuery = useQuery({
    queryKey: ["quick_builds", manufacturerId],
    queryFn: async () => {
      if (!baseModelsQuery.data) return [];
      const modelIds = baseModelsQuery.data.map((m) => m.id);
      if (modelIds.length === 0) return [];
      const { data, error } = await supabase
        .from("quick_builds")
        .select("*")
        .in("base_model_id", modelIds)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!baseModelsQuery.data && baseModelsQuery.data.length > 0,
  });

  const optionsQuery = useQuery({
    queryKey: ["model_options", manufacturerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_options")
        .select("id, name, short_code, option_group, retail_price, cost_price")
        .eq("manufacturer_id", manufacturerId)
        .eq("is_active", true)
        .order("option_group")
        .order("sort_order");
      if (error) throw error;
      return data as OptionItem[];
    },
    enabled: !!manufacturerId,
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Default manufacturer
  useEffect(() => {
    if (manufacturersQuery.data && !manufacturerId) {
      const moly = manufacturersQuery.data.find(
        (m) => m.short_name?.toLowerCase().includes("moly") || m.name?.toLowerCase().includes("moly")
      );
      if (moly) setManufacturerId(moly.id);
      else if (manufacturersQuery.data.length > 0) setManufacturerId(manufacturersQuery.data[0].id);
    }
  }, [manufacturersQuery.data]);

  // Derived
  const selectedBaseModel = baseModelsQuery.data?.find((m) => m.id === baseModelId);
  const selectedQuickBuild = quickBuildsQuery.data?.find((q) => q.id === quickBuildId);
  const checkedOptionsList = useMemo(
    () => (optionsQuery.data || []).filter((o) => checkedOptions.has(o.id)),
    [optionsQuery.data, checkedOptions]
  );

  const groupedOptions = useMemo(() => {
    if (!optionsQuery.data) return [];
    const groups = new Map<string, OptionItem[]>();
    for (const opt of optionsQuery.data) {
      const g = opt.option_group || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return Array.from(groups.entries());
  }, [optionsQuery.data]);

  // Auto-calculate prices
  const calcRetail = useMemo(() => {
    let total = selectedBaseModel?.retail_price || 0;
    for (const o of checkedOptionsList) total += o.retail_price;
    return total;
  }, [selectedBaseModel, checkedOptionsList]);

  const calcCost = useMemo(() => {
    let total = selectedBaseModel?.cost_price || 0;
    for (const o of checkedOptionsList) total += o.cost_price;
    return total;
  }, [selectedBaseModel, checkedOptionsList]);

  // Sync auto-calculated prices when not manually overridden
  useEffect(() => {
    if (!customerPriceManual && calcRetail > 0) setCustomerPrice(String(calcRetail));
  }, [calcRetail, customerPriceManual]);

  useEffect(() => {
    if (!ourCostManual && calcCost > 0) setOurCost(String(calcCost));
  }, [calcCost, ourCostManual]);

  // Auto-generate build shorthand
  useEffect(() => {
    if (buildShorthandManual) return;
    if (!selectedBaseModel) { setBuildShorthand(""); return; }
    if (selectedQuickBuild) {
      const qbOptionIds = new Set(selectedQuickBuild.included_option_ids || []);
      const extras = checkedOptionsList.filter((o) => !qbOptionIds.has(o.id));
      const parts = [selectedQuickBuild.name];
      if (extras.length > 0) parts.push(...extras.map((o) => o.short_code));
      setBuildShorthand(parts.join(", "));
    } else {
      const codes = checkedOptionsList.map((o) => o.short_code);
      setBuildShorthand(
        codes.length > 0
          ? `${selectedBaseModel.short_name} · ${codes.join(", ")}`
          : selectedBaseModel.short_name
      );
    }
  }, [selectedBaseModel, selectedQuickBuild, checkedOptionsList, buildShorthandManual]);

  // Handlers
  function handleManufacturerChange(id: string) {
    setManufacturerId(id);
    setBaseModelId("");
    setQuickBuildId("");
    setCheckedOptions(new Set());
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function handleBaseModelChange(id: string) {
    setBaseModelId(id);
    setCheckedOptions(new Set());
    setQuickBuildId("");
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function handleQuickBuildChange(id: string) {
    setQuickBuildId(id);
    if (!id) {
      setCheckedOptions(new Set());
      return;
    }
    const qb = quickBuildsQuery.data?.find((q) => q.id === id);
    if (qb) {
      if (qb.base_model_id) setBaseModelId(qb.base_model_id);
      setCheckedOptions(new Set(qb.included_option_ids || []));
      setCustomerPriceManual(false);
      setOurCostManual(false);
      setBuildShorthandManual(false);
    }
  }

  function toggleOption(id: string) {
    setCheckedOptions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  // Margin
  const margin = useMemo(() => {
    const price = parseFloat(customerPrice);
    const cost = parseFloat(ourCost);
    if (!price || !cost || price <= 0 || cost <= 0) return null;
    const amount = price - cost;
    const percent = (amount / price) * 100;
    return { amount, percent };
  }, [customerPrice, ourCost]);

  const marginColor = margin
    ? margin.percent >= 15 ? "#27AE60" : margin.percent >= 10 ? "#F3D12A" : "#D4183D"
    : undefined;

  // Customer
  const filteredCustomers = useMemo(() => {
    if (!customersQuery.data) return [];
    if (!customerSearch) return customersQuery.data;
    const q = customerSearch.toLowerCase();
    return customersQuery.data.filter((c) => c.name.toLowerCase().includes(q));
  }, [customersQuery.data, customerSearch]);

  const selectedCustomer = customersQuery.data?.find((c) => c.id === customerId);

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
    if (!manufacturerId) e.manufacturer = "Manufacturer is required";
    if (!baseModelId) e.baseModel = "Base model is required";
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
      const { data: orderNumber, error: rpcError } = await supabase.rpc("generate_order_number");
      if (rpcError) throw rpcError;

      const priceNum = parseFloat(customerPrice);
      const costNum = parseFloat(ourCost);
      const marginAmount = priceNum - costNum;
      const marginPercent = (marginAmount / priceNum) * 100;

      const selectedOptionsJson = checkedOptionsList.map((o) => ({
        option_id: o.id,
        name: o.name,
        short_code: o.short_code,
        cost_price: o.cost_price,
        retail_price: o.retail_price,
      }));

      const { data: order, error: orderError } = await supabase.from("orders").insert({
        order_number: orderNumber,
        customer_id: customerId || null,
        manufacturer_id: manufacturerId,
        base_model_id: baseModelId,
        base_model: selectedBaseModel?.name || null,
        build_shorthand: buildShorthand,
        build_description: notes || null,
        customer_price: priceNum,
        our_cost: costNum,
        margin_amount: marginAmount,
        margin_percent: marginPercent,
        freight_estimate: freightEstimate ? parseFloat(freightEstimate) : null,
        catl_number: catl_number || null,
        serial_number: serialNumber || null,
        status,
        estimate_date: format(estimateDate, "yyyy-MM-dd"),
        est_completion_date: estCompletionDate ? format(estCompletionDate, "yyyy-MM-dd") : null,
        from_inventory: fromInventory,
        inventory_location: fromInventory ? inventoryLocation || null : null,
        selected_options: selectedOptionsJson,
        notes: notes || null,
      }).select().single();
      if (orderError) throw orderError;

      const lineItems = [
        { type: "base_model", id: baseModelId, name: selectedBaseModel?.name, retail_price: selectedBaseModel?.retail_price, cost_price: selectedBaseModel?.cost_price },
        ...selectedOptionsJson.map((o) => ({ type: "option", ...o })),
      ];

      const { error: estError } = await supabase.from("estimates").insert({
        order_id: order.id,
        version_number: 1,
        build_shorthand: buildShorthand,
        total_price: priceNum,
        is_current: true,
        line_items: lineItems,
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

  // Price summary
  const optionCount = checkedOptionsList.length;
  const optionRetailTotal = checkedOptionsList.reduce((s, o) => s + o.retail_price, 0);

  return (
    <div className="mx-auto pb-40 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)} className="text-catl-teal p-1">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-[17px] font-bold text-foreground">New Order</h1>
      </div>

      {/* Form card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4 md:max-w-[680px] md:mx-auto overflow-x-hidden">

        {/* SECTION 1: Equipment */}
        <SectionHeader title="Equipment" />

        <FormRow label="Manufacturer" error={errors.manufacturer}>
          <select
            value={manufacturerId}
            onChange={(e) => handleManufacturerChange(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
          >
            <option value="">Select manufacturer</option>
            {manufacturersQuery.data?.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Base Model" error={errors.baseModel}>
          <select
            value={baseModelId}
            onChange={(e) => handleBaseModelChange(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
            disabled={!manufacturerId}
          >
            <option value="">Select base model</option>
            {baseModelsQuery.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — ${m.retail_price.toLocaleString()}
              </option>
            ))}
          </select>
        </FormRow>

        {quickBuildsQuery.data && quickBuildsQuery.data.length > 0 && (
          <FormRow label="Quick Build">
            <select
              value={quickBuildId}
              onChange={(e) => handleQuickBuildChange(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
            >
              <option value="">None — custom build</option>
              {quickBuildsQuery.data.map((q) => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
          </FormRow>
        )}

        {groupedOptions.length > 0 && (
          <FormRow label="Options">
            <div className="border border-border rounded-lg p-3 bg-card max-h-[400px] overflow-y-auto">
              {groupedOptions.map(([group, opts]) => (
                <OptionGroup
                  key={group}
                  group={group}
                  options={opts}
                  checked={checkedOptions}
                  onToggle={toggleOption}
                />
              ))}
            </div>
          </FormRow>
        )}

        <FormRow label="Build Short" error={errors.buildShorthand}>
          <input
            value={buildShorthand}
            onChange={(e) => {
              setBuildShorthand(e.target.value);
              setBuildShorthandManual(true);
            }}
            placeholder="Auto-generated from selections"
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card outline-none"
            style={{ fontWeight: buildShorthand ? 500 : 400, color: buildShorthand ? "hsl(168, 37%, 53%)" : undefined }}
          />
        </FormRow>

        {/* SECTION 2: Pricing */}
        <SectionHeader title="Pricing" />

        <FormRow label="Cust. Price" error={errors.customerPrice}>
          <CurrencyInput
            value={customerPrice}
            onChange={(v) => { setCustomerPrice(v); setCustomerPriceManual(true); }}
          />
        </FormRow>

        <FormRow label="Our Cost" error={errors.ourCost}>
          <CurrencyInput
            value={ourCost}
            onChange={(v) => { setOurCost(v); setOurCostManual(true); }}
          />
        </FormRow>

        <FormRow label="Margin">
          <div className="py-2.5 text-sm font-semibold" style={{ color: marginColor }}>
            {margin
              ? `$${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)`
              : "—"}
          </div>
        </FormRow>

        <FormRow label="Freight Est.">
          <CurrencyInput value={freightEstimate} onChange={setFreightEstimate} />
        </FormRow>

        {/* SECTION 3: Tracking */}
        <SectionHeader title="Tracking" />

        <FormRow label="CATL #">
          <input
            value={catl_number}
            onChange={(e) => setCatlNumber(e.target.value)}
            placeholder="e.g. CATL-2026-042"
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
          />
        </FormRow>

        <FormRow label="Serial #">
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Assigned when manufactured"
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
          />
        </FormRow>

        {/* SECTION 4: Status */}
        <SectionHeader title="Status" />

        <FormRow label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none capitalize">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Est. Date" narrow>
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

        <FormRow label="Completion" narrow>
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn("w-full text-left border border-border rounded-lg px-3 py-2.5 bg-card text-sm", !estCompletionDate && "text-muted-foreground")}>
                {estCompletionDate ? format(estCompletionDate, "PPP") : "Pick a date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={estCompletionDate} onSelect={setEstCompletionDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </FormRow>

        {/* SECTION 5: Customer */}
        <SectionHeader title="Customer" />
        <p className="text-xs text-muted-foreground italic -mt-2 mb-3">Optional — can be assigned later</p>

        <FormRow label="Customer">
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
                  onClick={() => { setShowNewCustomerForm(true); setShowCustomerDropdown(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm font-semibold text-catl-teal flex items-center gap-1 border-t border-border"
                >
                  <Plus size={14} /> Add New Customer
                </button>
              </div>
            )}
          </div>
        </FormRow>

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

        {/* SECTION 6: Inventory */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setInventoryOpen(!inventoryOpen)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            <ChevronDown size={16} className={cn("text-catl-navy transition-transform", inventoryOpen && "rotate-180")} />
            <span className="text-[13px] font-bold text-catl-navy uppercase tracking-wide">Inventory Details</span>
          </button>
          {inventoryOpen && (
            <div className="mt-3 space-y-4">
              <FormRow label="From Inv.">
                <div className="flex items-center h-[42px]">
                  <Switch checked={fromInventory} onCheckedChange={setFromInventory} />
                </div>
              </FormRow>
              {fromInventory && (
                <FormRow label="Inv. Location">
                  <input
                    value={inventoryLocation}
                    onChange={(e) => setInventoryLocation(e.target.value)}
                    placeholder="e.g. Warehouse Bay 3"
                    className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
                  />
                </FormRow>
              )}
            </div>
          )}
        </div>

        {/* SECTION 7: Notes */}
        <SectionHeader title="Notes" />
        <FormRow label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none resize-none" />
        </FormRow>
      </div>

      {/* Price Summary Bar */}
      <div className="sticky bottom-0 mt-4 bg-catl-cream border-t border-border px-4 py-3 -mx-4 md:mx-0 md:rounded-xl md:border">
        {selectedBaseModel ? (
          <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
            <div>
              Base: ${fmtCurrency(selectedBaseModel.retail_price)}
              {optionCount > 0 && <> + {optionCount} option{optionCount !== 1 ? "s" : ""}: ${fmtCurrency(optionRetailTotal)}</>}
              {" = "}
              <span className="font-semibold text-foreground">${fmtCurrency(calcRetail)}</span>
            </div>
            <div>
              Cost: ${fmtCurrency(calcCost)}
              {margin && (
                <> · Margin: <span style={{ color: marginColor }}>${fmtCurrency(margin.amount)} ({margin.percent.toFixed(1)}%)</span></>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mb-3">Select a base model to see pricing</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full md:w-auto bg-catl-gold text-catl-navy rounded-full py-3.5 px-8 text-base font-bold active:scale-[0.97] transition-transform disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Order"}
        </button>
      </div>
    </div>
  );
}
