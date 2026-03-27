import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronDown, Plus, Minus } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatOptionPillLabel } from "@/lib/optionDisplay";

const STATUS_OPTIONS = [
  "estimate", "approved", "ordered", "so_received", "in_production",
  "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed",
];

const GROUP_ORDER = [
  "Controls", "Squeeze", "Head / Neck", "Doors / Exits",
  "Floor / Pan", "Power", "Scales", "Carrier", "Misc",
];

type FullOption = {
  id: string;
  name: string;
  display_name: string | null;
  short_code: string;
  option_group: string | null;
  retail_price: number;
  cost_price: number;
  selection_type: string | null;
  allows_quantity: boolean | null;
  max_per_side: number | null;
  requires_extended: boolean | null;
  requires_options: string[] | null;
  conflicts_with: string[] | null;
  model_restriction: string[] | null;
  is_upgrade_of: string | null;
  is_included: boolean | null;
};

type OptionSelection = {
  optionId: string;
  left: number;
  right: number;
  selected: boolean;
  quantity: number;
};

function FormRow({ label, error, children, narrow }: { label: string; error?: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="overflow-hidden">
      <div className="flex items-start gap-2">
        <label className="text-sm font-semibold text-foreground flex-shrink-0 pt-2.5 break-words" style={{ width: 120, minWidth: 0 }}>{label}</label>
        <div className={cn("flex-1 min-w-0", narrow ? "md:max-w-[200px]" : "md:max-w-[360px]")}>{children}</div>
      </div>
      {error && <p className="text-xs mt-1 ml-[128px]" style={{ color: "#D4183D" }}>{error}</p>}
    </div>
  );
}

function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden focus-within:ring-2 focus-within:ring-catl-gold/25 focus-within:border-catl-gold md:max-w-[200px]">
      <span className="pl-3 text-muted-foreground text-sm font-medium">$</span>
      <input type="text" inputMode="decimal" value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="flex-1 px-2 py-2.5 bg-transparent outline-none text-foreground min-w-0"
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

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function SidePill({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
        active ? "border-catl-teal/30 text-catl-teal" : disabled ? "border-border text-muted-foreground/40 line-through cursor-not-allowed" : "border-border text-muted-foreground hover:border-catl-teal/30"
      )}
      style={active ? { background: "rgba(85,186,170,0.12)" } : undefined}
    >{label}</button>
  );
}

function QtyStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="flex items-center justify-center border rounded-md transition-colors"
        style={{ width: 28, height: 28, borderColor: "#D4D4D0", opacity: value <= min ? 0.3 : 1 }}>
        <Minus size={14} />
      </button>
      <span className="text-center font-semibold text-sm" style={{ width: 28, color: "#1A1A1A" }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="flex items-center justify-center border rounded-md transition-colors"
        style={{ width: 28, height: 28, borderColor: "#D4D4D0", opacity: value >= max ? 0.3 : 1 }}>
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [initialized, setInitialized] = useState(false);
  const [manufacturerId, setManufacturerId] = useState("");
  const [baseModelId, setBaseModelId] = useState("");
  const [quickBuildId, setQuickBuildId] = useState("");
  const [selections, setSelections] = useState<Map<string, OptionSelection>>(new Map());
  const [pickOneSelections, setPickOneSelections] = useState<Map<string, string>>(new Map());
  const [buildShorthand, setBuildShorthand] = useState("");
  const [buildShorthandManual, setBuildShorthandManual] = useState(true); // start manual for edit
  const [discountType, setDiscountType] = useState<"$" | "%">("$");
  const [discountAmount, setDiscountAmount] = useState("");
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
  const [pivotType, setPivotType] = useState<"side_to_side" | "front_to_back" | "">("");
  const [pivotSide, setPivotSide] = useState<"Left" | "Right" | "">("");

  // Store original values for change detection
  const [originalStatus, setOriginalStatus] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [originalCost, setOriginalCost] = useState("");
  const [originalOptionsJson, setOriginalOptionsJson] = useState("");

  // ─── Queries ───────────────────────────────────────────
  const orderQuery = useQuery({
    queryKey: ["order-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, phone, email)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

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
        .from("base_models").select("*")
        .eq("manufacturer_id", manufacturerId).eq("is_active", true)
        .order("sort_order").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!manufacturerId,
  });

  const quickBuildsQuery = useQuery({
    queryKey: ["quick_builds", manufacturerId],
    queryFn: async () => {
      if (!baseModelsQuery.data) return [];
      const ids = baseModelsQuery.data.map((m) => m.id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("quick_builds").select("*").in("base_model_id", ids).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!baseModelsQuery.data && baseModelsQuery.data.length > 0,
  });

  const optionsQuery = useQuery({
    queryKey: ["model_options_full", manufacturerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_options")
        .select("id, name, display_name, short_code, option_group, retail_price, cost_price, selection_type, allows_quantity, max_per_side, requires_extended, requires_options, conflicts_with, model_restriction, is_upgrade_of, is_included")
        .eq("manufacturer_id", manufacturerId).eq("is_active", true)
        .order("option_group").order("sort_order");
      if (error) throw error;
      return data as FullOption[];
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

  // ─── Pre-fill from order ─────────────────────────────
  useEffect(() => {
    if (!orderQuery.data || initialized) return;
    const o = orderQuery.data;
    setManufacturerId(o.manufacturer_id || "");
    setBaseModelId(o.base_model_id || "");
    setBuildShorthand(o.build_shorthand || "");
    setDiscountType(((o as any).discount_type as "$" | "%") || "$");
    setDiscountAmount((o as any).discount_amount ? String((o as any).discount_amount) : "");
    setFreightEstimate(o.freight_estimate ? String(o.freight_estimate) : "");
    setCatlNumber(o.catl_number || "");
    setSerialNumber(o.serial_number || "");
    setStatus(o.status || "estimate");
    setEstimateDate(o.estimate_date ? new Date(o.estimate_date + "T00:00:00") : new Date());
    setEstCompletionDate(o.est_completion_date ? new Date(o.est_completion_date + "T00:00:00") : undefined);
    setCustomerId(o.customer_id || "");
    const cust = o.customers as any;
    setCustomerSearch(cust?.name || "");
    setFromInventory(o.from_inventory || false);
    setInventoryLocation(o.inventory_location || "");
    setNotes(o.notes || "");

    setOriginalStatus(o.status || "");
    setOriginalPrice(o.customer_price ? String(o.customer_price) : "");
    setOriginalCost(o.our_cost ? String(o.our_cost) : "");
    setOriginalOptionsJson(JSON.stringify(o.selected_options || []));

    setInitialized(true);
  }, [orderQuery.data, initialized]);

  // Pre-fill selections from saved selected_options once options are loaded
  useEffect(() => {
    if (!initialized || !optionsQuery.data || !orderQuery.data) return;
    const savedOpts = (orderQuery.data.selected_options || []) as any[];
    if (savedOpts.length === 0) return;

    const newSel = new Map<string, OptionSelection>();
    const newPick = new Map<string, string>();

    for (const saved of savedOpts) {
      const opt = optionsQuery.data.find((o) => o.id === saved.option_id);
      if (!opt) continue;

      if (opt.selection_type === "pick_one") {
        const group = opt.option_group || "Misc";
        newPick.set(group, opt.id);
        // Pivot data
        if (saved.pivot_type) {
          setPivotType(saved.pivot_type as any);
          setPivotSide((saved.side || "") as any);
        }
      } else if (opt.selection_type === "side") {
        const left = saved.left_qty ?? saved.left ?? 0;
        const right = saved.right_qty ?? saved.right ?? 0;
        newSel.set(opt.id, { optionId: opt.id, left, right, selected: false, quantity: left + right });
      } else if (opt.allows_quantity) {
        newSel.set(opt.id, { optionId: opt.id, left: 0, right: 0, selected: true, quantity: saved.quantity || 1 });
      } else {
        newSel.set(opt.id, { optionId: opt.id, left: 0, right: 0, selected: true, quantity: 1 });
      }
    }

    setSelections(newSel);
    setPickOneSelections(newPick);
  }, [initialized, optionsQuery.data]);

  // ─── Derived ──────────────────────────────────────────
  const selectedBaseModel = baseModelsQuery.data?.find((m) => m.id === baseModelId);
  const selectedQuickBuild = quickBuildsQuery.data?.find((q) => q.id === quickBuildId);

  const extendedChuteOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.short_code.toLowerCase() === "ext" || o.name.toLowerCase().includes("extended chute")),
    [optionsQuery.data]
  );
  const isExtendedSelected = extendedChuteOption ? (selections.get(extendedChuteOption.id)?.selected ?? false) : false;

  const isExtendedVariant = (opt: FullOption) => /\(ext(ended)?\)/i.test(opt.name) || opt.requires_extended;
  const isCarrierOption = (opt: FullOption) => opt.option_group === "Carrier" || opt.name.toLowerCase().includes("carrier");
  const isScalesOption = (opt: FullOption) => opt.option_group === "Scales" || opt.name.toLowerCase().includes("scales");
  const isStandardCarrierOrScales = (opt: FullOption) => (isCarrierOption(opt) || isScalesOption(opt)) && !isExtendedVariant(opt);
  const isExtendedCarrierOrScales = (opt: FullOption) => (isCarrierOption(opt) || isScalesOption(opt)) && isExtendedVariant(opt);
  const isQuantityOnlyOption = (opt: FullOption) => opt.allows_quantity && opt.selection_type !== "side";

  const visibleOptions = useMemo(() => {
    if (!optionsQuery.data) return [];
    return optionsQuery.data.filter((opt) => {
      if (opt.model_restriction && opt.model_restriction.length > 0 && selectedBaseModel) {
        if (!opt.model_restriction.includes(selectedBaseModel.short_name)) return false;
      }
      if (isExtendedSelected) { if (isStandardCarrierOrScales(opt)) return false; }
      else { if (isExtendedCarrierOrScales(opt)) return false; }
      if (opt.requires_extended && !isExtendedSelected && !isCarrierOption(opt) && !isScalesOption(opt)) return false;
      if (opt.requires_options && opt.requires_options.length > 0) {
        const allRequired = opt.requires_options.every((reqId) => {
          const sel = selections.get(reqId);
          return sel && (sel.selected || sel.left > 0 || sel.right > 0);
        });
        if (!allRequired) return false;
      }
      return true;
    });
  }, [optionsQuery.data, selectedBaseModel, isExtendedSelected, selections]);

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, FullOption[]>();
    for (const opt of visibleOptions) {
      const g = opt.option_group || "Misc";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    const sorted: [string, FullOption[]][] = [];
    for (const g of GROUP_ORDER) { if (groups.has(g)) { sorted.push([g, groups.get(g)!]); groups.delete(g); } }
    for (const [g, opts] of groups) sorted.push([g, opts]);
    return sorted;
  }, [visibleOptions]);

  const selectedOptionsList = useMemo(() => {
    const result: { option: FullOption; quantity: number; left: number; right: number; pivotType?: string; pivotSide?: string }[] = [];
    for (const [group, optId] of pickOneSelections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (opt && opt.is_included !== true) {
        const isPivot = group === "Controls" && opt.name.toLowerCase().includes("pivot");
        result.push({ option: opt, quantity: 1, left: 0, right: 0, ...(isPivot ? { pivotType: pivotType || undefined, pivotSide: pivotSide || undefined } : {}) });
      }
    }
    for (const [optId, sel] of selections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (!opt || opt.selection_type === "pick_one") continue;
      let qty: number;
      if (sel.selected && sel.left === 0 && sel.right === 0) qty = sel.quantity || 1;
      else qty = sel.left + sel.right;
      if (qty > 0) result.push({ option: opt, quantity: qty, left: sel.left, right: sel.right });
    }
    return result;
  }, [selections, pickOneSelections, optionsQuery.data, pivotType, pivotSide]);

  const getSideConflicts = useCallback((optId: string, side: "left" | "right"): string | null => {
    if (isExtendedSelected) return null;
    const opt = optionsQuery.data?.find((o) => o.id === optId);
    if (!opt) return null;
    const isWTD = opt.short_code === "WD" || opt.name.toLowerCase().includes("walk-through");
    const isSideExit = opt.short_code === "SE" || opt.short_code === "SSH" || opt.short_code === "HE" ||
      opt.name.toLowerCase().includes("side exit") || opt.name.toLowerCase().includes("slam shut") || opt.name.toLowerCase().includes("hydraulic exit");
    if (isWTD && side === "right") {
      const exits = optionsQuery.data?.filter((o) => o.short_code === "SE" || o.short_code === "SSH" || o.short_code === "HE" || o.name.toLowerCase().includes("side exit") || o.name.toLowerCase().includes("slam shut") || o.name.toLowerCase().includes("hydraulic exit")) || [];
      for (const ex of exits) { const exSel = selections.get(ex.id); if (exSel && exSel.right > 0) return `Right blocked — ${ex.name} on right`; }
    }
    if (isSideExit && side === "right") {
      const wtds = optionsQuery.data?.filter((o) => o.short_code === "WD" || o.name.toLowerCase().includes("walk-through")) || [];
      for (const w of wtds) { const wSel = selections.get(w.id); if (wSel && wSel.right > 0) return `Right blocked — walk-through door on right`; }
    }
    return null;
  }, [isExtendedSelected, optionsQuery.data, selections]);

  // Extended chute toggle
  useEffect(() => {
    if (!extendedChuteOption) return;
    const opts = optionsQuery.data || [];
    let changed = false, removedStd = false, removedExt = false;
    const newSel = new Map(selections);
    const newPick = new Map(pickOneSelections);
    for (const opt of opts) {
      if (isExtendedSelected) {
        if (isStandardCarrierOrScales(opt)) {
          if (newSel.has(opt.id)) { newSel.delete(opt.id); changed = true; removedStd = true; }
          for (const [g, selId] of newPick) { if (selId === opt.id) { newPick.delete(g); changed = true; removedStd = true; } }
        }
      } else {
        if (isExtendedCarrierOrScales(opt) || opt.requires_extended) {
          if (newSel.has(opt.id)) { newSel.delete(opt.id); changed = true; if (isCarrierOption(opt) || isScalesOption(opt)) removedExt = true; }
          for (const [g, selId] of newPick) { if (selId === opt.id) { newPick.delete(g); changed = true; if (isCarrierOption(opt) || isScalesOption(opt)) removedExt = true; } }
        }
      }
    }
    if (changed) {
      setSelections(newSel);
      setPickOneSelections(newPick);
      if (removedStd) toast.info("Standard carrier removed — select an extended carrier");
      else if (removedExt) toast.info("Extended carrier removed");
    }
  }, [isExtendedSelected]);

  // Auto-calculate prices
  const calcRetail = useMemo(() => {
    let total = selectedBaseModel?.retail_price || 0;
    for (const { option, quantity } of selectedOptionsList) total += option.retail_price * quantity;
    return total;
  }, [selectedBaseModel, selectedOptionsList]);

  const calcCost = useMemo(() => {
    let total = selectedBaseModel?.cost_price || 0;
    for (const { option, quantity } of selectedOptionsList) total += option.cost_price * quantity;
    return total;
  }, [selectedBaseModel, selectedOptionsList]);

  const discountValue = useMemo(() => {
    const amt = parseFloat(discountAmount) || 0;
    if (amt <= 0) return 0;
    if (discountType === "%") return Math.round(calcRetail * amt / 100 * 100) / 100;
    return amt;
  }, [discountAmount, discountType, calcRetail]);

  const customerPrice = calcRetail - discountValue;
  const ourCost = calcCost;

  const margin = useMemo(() => {
    if (customerPrice <= 0 || ourCost <= 0) return null;
    const amount = customerPrice - ourCost;
    const percent = (amount / customerPrice) * 100;
    return { amount, percent };
  }, [customerPrice, ourCost]);
  const marginColor = margin ? margin.percent >= 15 ? "#27AE60" : margin.percent >= 10 ? "#F3D12A" : "#D4183D" : undefined;

  function handleManufacturerChange(mid: string) {
    setManufacturerId(mid); setBaseModelId(""); setQuickBuildId("");
    setSelections(new Map()); setPickOneSelections(new Map());
    setPivotType(""); setPivotSide("");
    setBuildShorthandManual(false);
  }

  function handleBaseModelChange(mid: string) {
    setBaseModelId(mid); setSelections(new Map()); setPickOneSelections(new Map());
    setPivotType(""); setPivotSide(""); setQuickBuildId("");
    setBuildShorthandManual(false);
  }

  function handleQuickBuildChange(qid: string) {
    setQuickBuildId(qid);
    if (!qid) { setSelections(new Map()); setPickOneSelections(new Map()); return; }
    const qb = quickBuildsQuery.data?.find((q) => q.id === qid);
    if (qb) {
      if (qb.base_model_id) setBaseModelId(qb.base_model_id);
      const newSel = new Map<string, OptionSelection>();
      for (const optId of qb.included_option_ids || []) newSel.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      setSelections(newSel); setPickOneSelections(new Map());
      setBuildShorthandManual(false);
    }
  }

  function toggleSimpleOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing?.selected) next.delete(optId);
      else next.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      return next;
    });
  }

  function toggleQuantityOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing?.selected) next.delete(optId);
      else next.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      return next;
    });
  }

  function setQuantityOptionQty(optId: string, qty: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing) next.set(optId, { ...existing, quantity: qty });
      return next;
    });
  }

  function toggleSideOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing && (existing.left > 0 || existing.right > 0)) next.delete(optId);
      else if (!existing) next.set(optId, { optionId: optId, left: 0, right: 0, selected: false, quantity: 0 });
      else next.delete(optId);
      return next;
    });
  }

  function toggleSide(optId: string, side: "left" | "right") {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId) || { optionId: optId, left: 0, right: 0, selected: false, quantity: 0 };
      const current = side === "left" ? existing.left : existing.right;
      next.set(optId, { ...existing, [side]: current > 0 ? 0 : 1 });
      return next;
    });
  }

  function setSideQty(optId: string, side: "left" | "right", qty: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId) || { optionId: optId, left: 0, right: 0, selected: false, quantity: 0 };
      next.set(optId, { ...existing, [side]: qty });
      return next;
    });
  }

  function selectPickOne(group: string, optId: string | null) {
    setPickOneSelections((prev) => {
      const next = new Map(prev);
      if (optId) next.set(group, optId); else next.delete(group);
      return next;
    });
    if (group === "Controls") {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (!opt || !opt.name.toLowerCase().includes("pivot")) { setPivotType(""); setPivotSide(""); }
    }
  }

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
        name: newCustomer.name, email: newCustomer.email || null, phone: newCustomer.phone || null,
        address_city: newCustomer.city || null, address_state: newCustomer.state || null, customer_type: newCustomer.type || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setCustomerId(data.id); setCustomerSearch(data.name);
      setShowNewCustomerForm(false); setShowCustomerDropdown(false);
      setNewCustomer({ name: "", email: "", phone: "", city: "", state: "", type: "" });
    },
  });

  // Validate
  function validate() {
    const e: Record<string, string> = {};
    if (!manufacturerId) e.manufacturer = "Required";
    if (!baseModelId) e.baseModel = "Required";
    if (!buildShorthand.trim()) e.buildShorthand = "Required";
    if (customerPrice <= 0) e.customerPrice = "Must be > 0";
    if (ourCost <= 0) e.ourCost = "Must be > 0";
    const controlsSelId = pickOneSelections.get("Controls");
    if (controlsSelId) {
      const copt = optionsQuery.data?.find((o) => o.id === controlsSelId);
      if (copt?.name.toLowerCase().includes("pivot")) {
        if (!pivotType) e.pivotType = "Select pivot type";
        if (!pivotSide) e.pivotSide = "Select a side";
      }
    }
    for (const [optId, sel] of selections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (opt?.selection_type === "side" && sel.left === 0 && sel.right === 0 && !sel.selected) e[`side_${optId}`] = "Select a side";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Submit (UPDATE)
  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const priceNum = customerPrice;
      const costNum = ourCost;

      const selectedOptionsJson = selectedOptionsList.map((s) => {
        const qty = s.quantity;
        const isPivot = s.pivotType != null;
        return {
          option_id: s.option.id,
          display_name: s.option.display_name || s.option.name,
          name: s.option.name,
          short_code: s.option.short_code,
          cost_price_each: s.option.cost_price, retail_price_each: s.option.retail_price,
          ...(isPivot ? { pivot_type: s.pivotType, side: s.pivotSide } : { left_qty: s.left, right_qty: s.right }),
          quantity: qty, total_cost: s.option.cost_price * qty, total_retail: s.option.retail_price * qty,
        };
      });

      const { error: updateError } = await supabase.from("orders").update({
        manufacturer_id: manufacturerId,
        base_model_id: baseModelId,
        base_model: selectedBaseModel?.name || null,
        build_shorthand: buildShorthand,
        build_description: notes || null,
        customer_price: priceNum,
        our_cost: costNum,
        discount_type: discountType,
        discount_amount: parseFloat(discountAmount) || 0,
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
        customer_id: customerId || null,
      }).eq("id", id!);
      if (updateError) throw updateError;

      // Timeline entries for changes
      const timelineInserts: any[] = [];

      if (status !== originalStatus) {
        timelineInserts.push({
          order_id: id, event_type: "status_change",
          title: `Status changed to ${status.replace(/_/g, " ")}`,
          description: `Changed from ${originalStatus.replace(/_/g, " ")}`,
        });
      }

      if (String(customerPrice) !== originalPrice || String(ourCost) !== originalCost) {
        const parts: string[] = [];
        if (String(customerPrice) !== originalPrice) parts.push(`Customer price changed from $${Number(originalPrice).toLocaleString()} to $${priceNum.toLocaleString()}`);
        if (String(ourCost) !== originalCost) parts.push(`Our cost changed from $${Number(originalCost).toLocaleString()} to $${costNum.toLocaleString()}`);
        timelineInserts.push({
          order_id: id, event_type: "note",
          title: "Pricing updated", description: parts.join(". "),
        });
      }

      if (JSON.stringify(selectedOptionsJson) !== originalOptionsJson) {
        timelineInserts.push({
          order_id: id, event_type: "note",
          title: "Build updated", description: "Options modified",
        });
      }

      if (timelineInserts.length > 0) {
        await supabase.from("order_timeline").insert(timelineInserts);
      }

      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order updated");
      navigate(`/orders/${id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    } finally {
      setSubmitting(false);
    }
  }

  // Option counts
  const optionCount = selectedOptionsList.length;
  const optionRetailTotal = selectedOptionsList.reduce((s, { option, quantity }) => s + option.retail_price * quantity, 0);

  const isOverheadScalesSelected = useMemo(() => {
    const opts = optionsQuery.data || [];
    return opts.filter((o) => o.option_group === "Scales" && o.name.toLowerCase().includes("overhead")).some((o) => pickOneSelections.get("Scales") === o.id);
  }, [optionsQuery.data, pickOneSelections]);

  const pivotOnScalesOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.name.toLowerCase().includes("pivot on overhead") || o.name.toLowerCase().includes("pivot overhead")),
    [optionsQuery.data]
  );

  const controlsSelectedId = pickOneSelections.get("Controls") || null;
  const isPivotSelected = useMemo(() => {
    if (!controlsSelectedId) return false;
    const opt = optionsQuery.data?.find((o) => o.id === controlsSelectedId);
    return opt?.name.toLowerCase().includes("pivot") ?? false;
  }, [controlsSelectedId, optionsQuery.data]);

  // ─── Render helpers (same as NewOrder) ─────────────────

  function renderPickOneGroup(group: string, options: FullOption[]) {
    if (group === "Controls") return renderControlsGroup(options);
    const selectedId = pickOneSelections.get(group) || null;
    const hasIncluded = options.some((o) => o.is_included);
    return (
      <div className="space-y-1">
        {!hasIncluded && (
          <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
            <input type="radio" name={`pickone-${group}`} checked={selectedId === null} onChange={() => selectPickOne(group, null)} className="w-[18px] h-[18px] accent-catl-teal" />
            <span className="text-[13px]" style={{ color: "#1A1A1A" }}>None</span>
          </label>
        )}
        {options.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
            <input type="radio" name={`pickone-${group}`} checked={selectedId === opt.id} onChange={() => selectPickOne(group, opt.id)} className="w-[18px] h-[18px] accent-catl-teal" />
            <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name}{opt.is_included ? " — included" : ""}</span>
            {!opt.is_included && <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>}
          </label>
        ))}
      </div>
    );
  }

  function renderControlsGroup(options: FullOption[]) {
    const selectedId = pickOneSelections.get("Controls") || null;
    const hasIncluded = options.some((o) => o.is_included);
    const mainOptions = options.filter((o) => !(o.name.toLowerCase().includes("pivot on overhead") || o.name.toLowerCase().includes("pivot overhead")));
    return (
      <div className="space-y-1">
        {!hasIncluded && (
          <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
            <input type="radio" name="pickone-Controls" checked={selectedId === null} onChange={() => selectPickOne("Controls", null)} className="w-[18px] h-[18px] accent-catl-teal" />
            <span className="text-[13px]" style={{ color: "#1A1A1A" }}>None</span>
          </label>
        )}
        {mainOptions.map((opt) => {
          const isSelected = selectedId === opt.id;
          const isPivot = opt.name.toLowerCase().includes("pivot");
          const isDual = opt.name.toLowerCase().includes("dual");
          return (
            <div key={opt.id}>
              <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
                <input type="radio" name="pickone-Controls" checked={isSelected} onChange={() => selectPickOne("Controls", opt.id)} className="w-[18px] h-[18px] accent-catl-teal" />
                <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name}{opt.is_included ? " — included" : ""}{isDual ? " (both sides)" : ""}</span>
                {!opt.is_included && <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>}
              </label>
              {isSelected && isPivot && (
                <div className="ml-[26px] mt-2 mb-2 p-3 rounded-lg border space-y-3" style={{ borderColor: "#D4D4D0" }}>
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>Pivot type:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <SidePill label="Side-to-Side" active={pivotType === "side_to_side"} onClick={() => setPivotType("side_to_side")} />
                      <SidePill label="Front-to-Back" active={pivotType === "front_to_back"} onClick={() => setPivotType("front_to_back")} />
                    </div>
                    {errors.pivotType && <p className="text-[11px] mt-1" style={{ color: "#D4183D" }}>{errors.pivotType}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>{pivotType === "front_to_back" ? "Mounted on:" : "Dominant side:"}</p>
                    <div className="flex items-center gap-2">
                      <SidePill label="Left" active={pivotSide === "Left"} onClick={() => setPivotSide("Left")} />
                      <SidePill label="Right" active={pivotSide === "Right"} onClick={() => setPivotSide("Right")} />
                    </div>
                    {errors.pivotSide && <p className="text-[11px] mt-1" style={{ color: "#D4183D" }}>{errors.pivotSide}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {isPivotSelected && isOverheadScalesSelected && pivotOnScalesOption && (
          <div className="mt-2 border-t border-border pt-2">
            <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
              <input type="checkbox" checked={selections.get(pivotOnScalesOption.id)?.selected ?? false} onChange={() => toggleSimpleOption(pivotOnScalesOption.id)} className="w-[18px] h-[18px] accent-catl-teal rounded" />
              <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{pivotOnScalesOption.name}</span>
              <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(pivotOnScalesOption.retail_price)}</span>
            </label>
          </div>
        )}
      </div>
    );
  }

  function renderSideOption(opt: FullOption) {
    const sel = selections.get(opt.id);
    const isChecked = sel != null;
    const hasAnySide = sel && (sel.left > 0 || sel.right > 0);
    const maxSide = opt.max_per_side || 1;
    const leftConflict = getSideConflicts(opt.id, "left");
    const rightConflict = getSideConflicts(opt.id, "right");
    const totalQty = (sel?.left || 0) + (sel?.right || 0);
    const totalPrice = totalQty * opt.retail_price;
    return (
      <div key={opt.id} className="mb-1 overflow-hidden">
        <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
          <input type="checkbox" checked={isChecked} onChange={() => toggleSideOption(opt.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
          <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>
            {(opt.display_name || opt.name).replace(/\s*\(per sidegate\)/i, "")} — <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)} ea</span>
          </span>
        </label>
        {isChecked && (
          <div className="ml-[26px] mt-1 mb-2 space-y-2 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold" style={{ color: "#717182", width: 40 }}>Sides:</span>
              <SidePill label="Left" active={(sel?.left || 0) > 0} disabled={!!leftConflict} onClick={() => { if (!leftConflict) toggleSide(opt.id, "left"); }} />
              <SidePill label="Right" active={(sel?.right || 0) > 0} disabled={!!rightConflict} onClick={() => { if (!rightConflict) toggleSide(opt.id, "right"); }} />
            </div>
            {maxSide > 1 && (sel?.left || 0) > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: "#717182", width: 40 }}>Left:</span>
                <QtyStepper value={sel?.left || 1} min={1} max={maxSide} onChange={(v) => setSideQty(opt.id, "left", v)} />
              </div>
            )}
            {maxSide > 1 && (sel?.right || 0) > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: "#717182", width: 40 }}>Right:</span>
                <QtyStepper value={sel?.right || 1} min={1} max={maxSide} onChange={(v) => setSideQty(opt.id, "right", v)} />
              </div>
            )}
            {!hasAnySide && <p className="text-[11px]" style={{ color: "#D4183D" }}>Select a side</p>}
            {rightConflict && <p className="text-[11px]" style={{ color: "#D4183D" }}>{rightConflict}</p>}
            {leftConflict && <p className="text-[11px]" style={{ color: "#D4183D" }}>{leftConflict}</p>}
            {totalQty > 0 && <p className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>Total: {totalQty} × ${fmtCurrency(opt.retail_price)} = ${fmtCurrency(totalPrice)}</p>}
          </div>
        )}
      </div>
    );
  }

  function renderQuantityOption(opt: FullOption) {
    const sel = selections.get(opt.id);
    const isChecked = sel?.selected ?? false;
    const qty = sel?.quantity || 1;
    const maxQty = opt.max_per_side || 4;
    return (
      <div key={opt.id} className="mb-1 overflow-hidden">
        <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
          <input type="checkbox" checked={isChecked} onChange={() => toggleQuantityOption(opt.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
          <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name} — <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)} ea</span></span>
        </label>
        {isChecked && (
          <div className="ml-[26px] mt-1 mb-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "#717182", width: 28 }}>Qty:</span>
              <QtyStepper value={qty} min={1} max={maxQty} onChange={(v) => setQuantityOptionQty(opt.id, v)} />
            </div>
            {qty > 1 && <p className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>Total: {qty} × ${fmtCurrency(opt.retail_price)} = ${fmtCurrency(qty * opt.retail_price)}</p>}
          </div>
        )}
      </div>
    );
  }

  function renderSimpleOption(opt: FullOption) {
    return (
      <label key={opt.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
        <input type="checkbox" checked={selections.get(opt.id)?.selected ?? false} onChange={() => toggleSimpleOption(opt.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
        <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name}</span>
        <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>
      </label>
    );
  }

  function renderGroupCard(group: string, options: FullOption[]) {
    const isPick = options.every((o) => o.selection_type === "pick_one");
    return (
      <div key={group} className="border rounded-lg p-3 overflow-hidden" style={{ borderColor: "#D4D4D0", background: "#FFFFFF" }}>
        <h4 className="text-[11px] font-bold uppercase mb-2" style={{ color: "#0E2646" }}>{group}</h4>
        {isPick ? renderPickOneGroup(group, options) : (
          <div className="space-y-0.5">
            {options.map((opt) => {
              if (opt.selection_type === "side") return renderSideOption(opt);
              if (opt.selection_type === "pick_one") return renderSimpleOption(opt);
              if (isQuantityOnlyOption(opt)) return renderQuantityOption(opt);
              return renderSimpleOption(opt);
            })}
          </div>
        )}
      </div>
    );
  }

  // Build summary pills
  const summaryPills = useMemo(() => {
    const pills: { label: string; variant: "base" | "standard" | "addon" }[] = [];
    if (selectedBaseModel) pills.push({ label: selectedBaseModel.short_name, variant: "base" });
    const qbIds = new Set(selectedQuickBuild?.included_option_ids || []);
    for (const item of selectedOptionsList) {
      const { option, left, right, quantity, pivotType: pt, pivotSide: ps } = item;
      const dn = option.display_name || option.name;
      let label: string;
      if (pt) {
        const typeLabel = pt === "side_to_side" ? "Side-to-Side" : pt === "front_to_back" ? "Front-to-Back" : "";
        label = [dn, typeLabel, ps].filter(Boolean).join(" · ");
      } else if (left > 0 || right > 0) {
        label = formatOptionPillLabel(dn, left, right);
      } else if (quantity > 1) {
        label = `${dn} ×${quantity}`;
      } else {
        label = dn;
      }
      pills.push({ label, variant: qbIds.has(option.id) ? "standard" : "addon" });
    }
    return pills;
  }, [selectedBaseModel, selectedQuickBuild, selectedOptionsList]);

  // Loading
  if (orderQuery.isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading order…</div>;
  }
  if (!orderQuery.data) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Order not found</div>;
  }

  return (
    <div className="mx-auto pb-40 overflow-x-hidden max-w-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(`/orders/${id}`)} className="text-catl-teal p-1 flex items-center gap-1">
          <ChevronLeft size={24} />
          <span className="text-sm font-medium">Cancel</span>
        </button>
        <h1 className="text-[17px] font-bold text-foreground ml-auto">Edit Order</h1>
        <span className="text-xs text-muted-foreground ml-2">{orderQuery.data.order_number}</span>
      </div>

      {/* Form card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4 md:max-w-[680px] md:mx-auto overflow-x-hidden">

        <SectionHeader title="Equipment" />

        <FormRow label="Manufacturer" error={errors.manufacturer}>
          <select value={manufacturerId} onChange={(e) => handleManufacturerChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none">
            <option value="">Select manufacturer</option>
            {manufacturersQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormRow>

        <FormRow label="Base Model" error={errors.baseModel}>
          <select value={baseModelId} onChange={(e) => handleBaseModelChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" disabled={!manufacturerId}>
            <option value="">Select base model</option>
            {baseModelsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name} — ${m.retail_price.toLocaleString()}</option>)}
          </select>
        </FormRow>

        {quickBuildsQuery.data && quickBuildsQuery.data.length > 0 && (
          <FormRow label="Quick Build">
            <select value={quickBuildId} onChange={(e) => handleQuickBuildChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none">
              <option value="">None — custom build</option>
              {quickBuildsQuery.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </FormRow>
        )}

        <SectionHeader title="Options" subtitle={optionCount > 0 ? `${optionCount} selected · $${fmtCurrency(optionRetailTotal)}` : undefined} />

        {extendedChuteOption && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg border overflow-hidden" style={{ borderColor: isExtendedSelected ? "#55BAAA" : "#D4D4D0", background: isExtendedSelected ? "rgba(85,186,170,0.06)" : "#FFFFFF" }}>
            <input type="checkbox" checked={isExtendedSelected} onChange={() => toggleSimpleOption(extendedChuteOption.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
            <span className="text-[13px] font-semibold flex-1 break-words min-w-0" style={{ color: "#0E2646" }}>Extended Chute</span>
            <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(extendedChuteOption.retail_price)}</span>
          </div>
        )}

        {groupedOptions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupedOptions.map(([group, opts]) => {
              const filtered = opts.filter((o) => o.id !== extendedChuteOption?.id);
              if (filtered.length === 0) return null;
              return renderGroupCard(group, filtered);
            })}
          </div>
        )}

        <SectionHeader title="Build Summary" />
        <div className="flex flex-wrap gap-1.5 mb-3 max-w-full overflow-hidden">
          {summaryPills.map((pill, i) => (
            <span key={i} className="px-2.5 py-1 rounded-full text-xs font-semibold break-words"
              style={{
                background: pill.variant === "base" ? "#0E2646" : pill.variant === "standard" ? "rgba(85,186,170,0.15)" : "rgba(243,209,42,0.2)",
                color: pill.variant === "base" ? "#F0F0F0" : pill.variant === "standard" ? "#55BAAA" : "#8B7A1A",
              }}>{pill.label}</span>
          ))}
        </div>

        <FormRow label="Build Short" error={errors.buildShorthand}>
          <input value={buildShorthand} onChange={(e) => { setBuildShorthand(e.target.value); setBuildShorthandManual(true); }}
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card outline-none min-w-0"
            style={{ fontWeight: buildShorthand ? 500 : 400, color: buildShorthand ? "hsl(168, 37%, 53%)" : undefined }} />
        </FormRow>

        {selectedBaseModel && (
          <div className="text-xs space-y-0.5 px-1" style={{ color: "#717182" }}>
            <div>Base: ${fmtCurrency(selectedBaseModel.retail_price)}
              {optionCount > 0 && <> + {optionCount} option{optionCount !== 1 ? "s" : ""}: ${fmtCurrency(optionRetailTotal)}</>}
              {" = "}<span className="font-semibold text-foreground">${fmtCurrency(calcRetail)}</span>
            </div>
          </div>
        )}

        <SectionHeader title="Pricing" />
        <FormRow label="Cust. Price" error={errors.customerPrice}>
          <CurrencyInput value={customerPrice} onChange={(v) => { setCustomerPrice(v); setCustomerPriceManual(true); }} />
        </FormRow>
        <FormRow label="Our Cost" error={errors.ourCost}>
          <CurrencyInput value={ourCost} onChange={(v) => { setOurCost(v); setOurCostManual(true); }} />
        </FormRow>
        <FormRow label="Margin">
          <div className="py-2.5 text-sm font-semibold" style={{ color: marginColor }}>
            {margin ? `$${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)` : "—"}
          </div>
        </FormRow>
        <FormRow label="Freight Est.">
          <CurrencyInput value={freightEstimate} onChange={setFreightEstimate} />
        </FormRow>

        <SectionHeader title="Tracking" />
        <FormRow label="CATL #">
          <input value={catl_number} onChange={(e) => setCatlNumber(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none min-w-0" />
        </FormRow>
        <FormRow label="Serial #">
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none min-w-0" />
        </FormRow>

        <SectionHeader title="Status" />
        <FormRow label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none capitalize">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
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

        <SectionHeader title="Customer" />
        <p className="text-xs text-muted-foreground italic -mt-2 mb-3">Optional — can be assigned later</p>
        <FormRow label="Customer">
          <div className="relative">
            <input value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); setShowCustomerDropdown(true); }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Search customers..."
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none min-w-0" />
            {showCustomerDropdown && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-auto">
                {filteredCustomers.map((c) => (
                  <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); setShowCustomerDropdown(false); }} className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.address_city && <span className="text-muted-foreground ml-2 text-xs">{c.address_city}, {c.address_state}</span>}
                  </button>
                ))}
                <button onClick={() => { setShowNewCustomerForm(true); setShowCustomerDropdown(false); }} className="w-full text-left px-3 py-2.5 text-sm font-semibold text-catl-teal flex items-center gap-1 border-t border-border">
                  <Plus size={14} /> Add New Customer
                </button>
              </div>
            )}
          </div>
        </FormRow>

        {showNewCustomerForm && (
          <div className="ml-[128px] border border-catl-teal/30 rounded-lg p-3 space-y-2 bg-catl-teal/5 overflow-hidden">
            <input placeholder="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0" />
              <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="City" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0" />
              <input placeholder="State" value={newCustomer.state} onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0" />
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

        <button type="button" onClick={() => setInventoryOpen(!inventoryOpen)}
          className="-mx-4 mt-6 mb-3 px-4 py-2 flex items-center justify-between w-[calc(100%+2rem)]" style={{ background: "#F5F5F0" }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: "#0E2646" }}>Inventory Details</span>
          <ChevronDown size={14} className={cn("transition-transform", inventoryOpen && "rotate-180")} style={{ color: "#717182" }} />
        </button>
        {inventoryOpen && (
          <div className="mt-3 space-y-4">
            <FormRow label="From Inv."><div className="flex items-center h-[42px]"><Switch checked={fromInventory} onCheckedChange={setFromInventory} /></div></FormRow>
            {fromInventory && (
              <FormRow label="Inv. Location"><input value={inventoryLocation} onChange={(e) => setInventoryLocation(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none min-w-0" /></FormRow>
            )}
          </div>
        )}

        <SectionHeader title="Notes" />
        <FormRow label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none resize-none min-w-0" />
        </FormRow>
      </div>

      {/* Price Summary Bar */}
      <div className="sticky bottom-0 mt-4 bg-catl-cream border-t border-border px-4 py-3 -mx-4 md:mx-0 md:rounded-xl md:border overflow-hidden">
        {selectedBaseModel ? (
          <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
            <div>Base: ${fmtCurrency(selectedBaseModel.retail_price)}
              {optionCount > 0 && <> + {optionCount} option{optionCount !== 1 ? "s" : ""}: ${fmtCurrency(optionRetailTotal)}</>}
              {" = "}<span className="font-semibold text-foreground">${fmtCurrency(calcRetail)}</span>
            </div>
            <div>Cost: ${fmtCurrency(calcCost)}
              {margin && <> · Margin: <span style={{ color: marginColor }}>${fmtCurrency(margin.amount)} ({margin.percent.toFixed(1)}%)</span></>}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mb-3">Select a base model to see pricing</div>
        )}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full md:w-auto bg-catl-gold text-catl-navy rounded-full py-3.5 px-8 text-base font-bold active:scale-[0.97] transition-transform disabled:opacity-50">
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
