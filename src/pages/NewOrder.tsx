import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronDown, Plus, Minus } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatOptionPillLabel } from "@/lib/optionDisplay";

const STATUS_OPTIONS = [
  "estimate", "approved", "ordered", "so_received", "in_production",
  "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed",
];

// Group order is driven by sort_order from the database, not hardcoded.

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
  sort_order: number | null;
};

type OptionSelection = {
  optionId: string;
  left: number;
  right: number;
  selected: boolean;
  quantity: number;
};

/* ─── Shared sub-components ──────────────────────────────────── */

function FormRow({ label, error, children, narrow }: { label: string; error?: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="overflow-hidden">
      <div className="flex items-start gap-2">
        <label className="text-[13px] font-semibold text-foreground flex-shrink-0 pt-2.5 break-words" style={{ width: 120, minWidth: 0 }}>
          {label}
        </label>
        <div className={cn("flex-1 min-w-0", narrow ? "md:max-w-[200px]" : "md:max-w-[360px]")}>{children}</div>
      </div>
      {error && <p className="text-[11px] mt-1 ml-[128px]" style={{ color: "#D4183D" }}>{error}</p>}
    </div>
  );
}

function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden focus-within:ring-2 focus-within:ring-catl-gold/25 focus-within:border-catl-gold" style={{ maxWidth: 140 }}>
      <span className="pl-3 text-muted-foreground text-sm font-medium">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="flex-1 px-2 py-2.5 bg-transparent outline-none text-foreground min-w-0 text-[16px]"
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
        active
          ? "border-catl-teal/30 text-catl-teal"
          : disabled
          ? "border-border text-muted-foreground/40 line-through cursor-not-allowed"
          : "border-border text-muted-foreground hover:border-catl-teal/30"
      )}
      style={active ? { background: "rgba(85,186,170,0.12)" } : undefined}
    >
      {label}
    </button>
  );
}

function QtyStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex items-center justify-center border rounded-md transition-colors"
        style={{ width: 28, height: 28, borderColor: "#D4D4D0", color: value <= min ? "#D4D4D0" : "#1A1A1A" }}
      >
        <Minus size={14} />
      </button>
      <span className="text-center text-sm font-semibold" style={{ width: 28, color: "#1A1A1A" }}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex items-center justify-center border rounded-md transition-colors"
        style={{ width: 28, height: 28, borderColor: "#D4D4D0", color: value >= max ? "#D4D4D0" : "#1A1A1A" }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") === "order" ? "order" : "estimate";
  const isDirectOrder = orderType === "order";
  const queryClient = useQueryClient();

  const [manufacturerId, setManufacturerId] = useState("");
  const [baseModelId, setBaseModelId] = useState("");
  const [quickBuildId, setQuickBuildId] = useState("");
  const [selections, setSelections] = useState<Map<string, OptionSelection>>(new Map());
  const [pickOneSelections, setPickOneSelections] = useState<Map<string, string>>(new Map());
  const [buildShorthand, setBuildShorthand] = useState("");
  const [buildShorthandManual, setBuildShorthandManual] = useState(false);
  const [discountType, setDiscountType] = useState<"$" | "%">("$");
  const [discountAmount, setDiscountAmount] = useState("");
  const [freightEstimate, setFreightEstimate] = useState("");
  const [catl_number, setCatlNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState(isDirectOrder ? "ordered" : "estimate");
  const [estimateDate, setEstimateDate] = useState<Date>(new Date());
  const [estCompletionDate, setEstCompletionDate] = useState<Date | undefined>();
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", city: "", state: "", type: "" });
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [fromInventory, setFromInventory] = useState(false);
  const [inventoryLocation, setInventoryLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pivotSide, setPivotSide] = useState<"Left" | "Right" | "">("");
  const [pivotType, setPivotType] = useState<"side_to_side" | "front_to_back" | "">("");
  const [dualChecked, setDualChecked] = useState(false);
  const [pivotChecked, setPivotChecked] = useState(false);

  /* ─── Queries ──────────────────────────────────────────────── */

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
      const { data, error } = await supabase
        .from("quick_builds").select("*").in("base_model_id", ids)
        .eq("is_active", true).order("sort_order");
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
        .select("id, name, display_name, short_code, option_group, retail_price, cost_price, selection_type, allows_quantity, max_per_side, requires_extended, requires_options, conflicts_with, model_restriction, is_upgrade_of, is_included, sort_order")
        .eq("manufacturer_id", manufacturerId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }).order("display_name", { ascending: true });
      if (error) throw error;
      return data as FullOption[];
    },
    enabled: !!manufacturerId,
  });

  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const customerSearchQuery = useQuery({
    queryKey: ["customer-search", debouncedCustomerSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, company, address_city, address_state, customer_type")
        .ilike("name", `%${debouncedCustomerSearch}%`)
        .order("name")
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: debouncedCustomerSearch.length >= 2,
  });

  const selectedCustomerQuery = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, address_city, address_state, customer_type")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  /* ─── Derived state ────────────────────────────────────────── */

  useEffect(() => {
    if (manufacturersQuery.data && !manufacturerId) {
      const moly = manufacturersQuery.data.find(
        (m) => m.short_name?.toLowerCase().includes("moly") || m.name?.toLowerCase().includes("moly")
      );
      if (moly) setManufacturerId(moly.id);
      else if (manufacturersQuery.data.length > 0) setManufacturerId(manufacturersQuery.data[0].id);
    }
  }, [manufacturersQuery.data]);

  const selectedManufacturer = manufacturersQuery.data?.find((m) => m.id === manufacturerId);
  const selectedBaseModel = baseModelsQuery.data?.find((m) => m.id === baseModelId);
  const selectedQuickBuild = quickBuildsQuery.data?.find((q) => q.id === quickBuildId);

  const extendedChuteOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.short_code.toLowerCase() === "ext" || o.name.toLowerCase().includes("extended chute")),
    [optionsQuery.data]
  );
  const isExtendedSelected = extendedChuteOption
    ? (selections.get(extendedChuteOption.id)?.selected ?? false)
    : false;

  const isExtendedVariant = (opt: FullOption) =>
    /\(ext(ended)?\)/i.test(opt.name) || opt.requires_extended;
  const isCarrierOption = (opt: FullOption) =>
    opt.option_group === "Carrier" || opt.name.toLowerCase().includes("carrier");
  const isScalesOption = (opt: FullOption) =>
    opt.option_group === "Scales" || opt.name.toLowerCase().includes("scales");
  const isStandardCarrierOrScales = (opt: FullOption) =>
    (isCarrierOption(opt) || isScalesOption(opt)) && !isExtendedVariant(opt);
  const isExtendedCarrierOrScales = (opt: FullOption) =>
    (isCarrierOption(opt) || isScalesOption(opt)) && isExtendedVariant(opt);
  const isQuantityOnlyOption = (opt: FullOption) =>
    opt.allows_quantity && opt.selection_type !== "side";

  const visibleOptions = useMemo(() => {
    if (!optionsQuery.data) return [];
    return optionsQuery.data.filter((opt) => {
      if (opt.model_restriction && opt.model_restriction.length > 0 && selectedBaseModel) {
        if (!opt.model_restriction.includes(selectedBaseModel.short_name)) return false;
      }
      if (isExtendedSelected) {
        if (isStandardCarrierOrScales(opt)) return false;
      } else {
        if (isExtendedCarrierOrScales(opt)) return false;
      }
      if (opt.requires_extended && !isExtendedSelected && !isCarrierOption(opt) && !isScalesOption(opt)) return false;
      if (opt.requires_options && opt.requires_options.length > 0) {
        // OR logic: show if ANY required option is selected
        const anySelected = opt.requires_options.some((reqCode) => {
          // reqCode can be short_code or ID
          const matchOpt = optionsQuery.data?.find((o) => o.short_code === reqCode || o.id === reqCode);
          if (!matchOpt) return false;
          const sel = selections.get(matchOpt.id);
          if (sel && (sel.selected || sel.left > 0 || sel.right > 0)) return true;
          // Check pickOne
          for (const [, selId] of pickOneSelections) {
            if (selId === matchOpt.id) return true;
          }
          // Check controls
          if (matchOpt.short_code === "PC" && pivotChecked && pivotType === "side_to_side") return true;
          if (matchOpt.short_code === "PC-FB" && pivotChecked && pivotType === "front_to_back") return true;
          if (matchOpt.short_code === "DC" && dualChecked) return true;
          return false;
        });
        if (!anySelected) return false;
      }
      return true;
    });
  }, [optionsQuery.data, selectedBaseModel, isExtendedSelected, selections, pickOneSelections, pivotChecked, pivotType, dualChecked]);

  const groupedOptions = useMemo(() => {
    // Preserve insertion order from the query (sorted by sort_order, display_name)
    const groups = new Map<string, FullOption[]>();
    for (const opt of visibleOptions) {
      const g = opt.option_group || "Misc";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return Array.from(groups.entries());
  }, [visibleOptions]);

  const isOptionSelected = useCallback((optId: string): boolean => {
    const sel = selections.get(optId);
    if (!sel) return false;
    return sel.selected || sel.left > 0 || sel.right > 0;
  }, [selections]);

  // All selected options for pricing/summary/submit
  const selectedOptionsList = useMemo(() => {
    const result: { option: FullOption; quantity: number; left: number; right: number; pivotType?: string; pivotSide?: string }[] = [];
    // Pick-one groups (exclude Controls)
    for (const [group, optId] of pickOneSelections) {
      if (group === "Controls") continue;
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (opt && opt.is_included !== true) {
        result.push({ option: opt, quantity: 1, left: 0, right: 0 });
      }
    }
    // Controls: Dual
    if (dualChecked) {
      const dcOpt = optionsQuery.data?.find((o) => o.short_code === "DC");
      if (dcOpt) result.push({ option: dcOpt, quantity: 1, left: 0, right: 0 });
    }
    // Controls: Pivot
    if (pivotChecked) {
      const pcCode = pivotType === "front_to_back" ? "PC-FB" : "PC";
      const pcOpt = optionsQuery.data?.find((o) => o.short_code === pcCode);
      if (pcOpt) result.push({ option: pcOpt, quantity: 1, left: 0, right: 0, pivotType: pivotType || undefined, pivotSide: pivotSide || undefined });
    }
    // Selections map
    for (const [optId, sel] of selections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (!opt) continue;
      if (opt.selection_type === "pick_one") continue;
      let qty: number;
      if (sel.selected && sel.left === 0 && sel.right === 0) {
        qty = sel.quantity || 1;
      } else {
        qty = sel.left + sel.right;
      }
      if (qty > 0) {
        result.push({ option: opt, quantity: qty, left: sel.left, right: sel.right });
      }
    }
    return result;
  }, [selections, pickOneSelections, optionsQuery.data, pivotSide, pivotType, dualChecked, pivotChecked]);

  // Side conflict logic
  const getSideConflicts = useCallback((optId: string, side: "left" | "right"): string | null => {
    if (isExtendedSelected) return null;
    const opt = optionsQuery.data?.find((o) => o.id === optId);
    if (!opt) return null;
    const isWTD = opt.short_code === "WD" || opt.name.toLowerCase().includes("walk-through");
    const isSideExit = opt.short_code === "SE" || opt.short_code === "SSH" || opt.short_code === "HE" ||
      opt.name.toLowerCase().includes("side exit") || opt.name.toLowerCase().includes("slam shut") || opt.name.toLowerCase().includes("hydraulic exit");

    if (isWTD) {
      const exits = optionsQuery.data?.filter((o) =>
        o.short_code === "SE" || o.short_code === "SSH" || o.short_code === "HE" ||
        o.name.toLowerCase().includes("side exit") || o.name.toLowerCase().includes("slam shut") || o.name.toLowerCase().includes("hydraulic exit")
      ) || [];
      for (const ex of exits) {
        const exSel = selections.get(ex.id);
        if (exSel && (side === "left" ? exSel.left : exSel.right) > 0)
          return `${side === "left" ? "Left" : "Right"} blocked — ${ex.display_name || ex.name} on ${side} (non-extended)`;
      }
    }
    if (isSideExit) {
      const wtds = optionsQuery.data?.filter((o) =>
        o.short_code === "WD" || o.name.toLowerCase().includes("walk-through")
      ) || [];
      for (const w of wtds) {
        const wSel = selections.get(w.id);
        if (wSel && (side === "left" ? wSel.left : wSel.right) > 0)
          return `${side === "left" ? "Left" : "Right"} blocked — walk-through door on ${side} (non-extended)`;
      }
    }
    return null;
  }, [isExtendedSelected, optionsQuery.data, selections]);

  // Extended chute toggle effect
  useEffect(() => {
    if (!extendedChuteOption) return;
    const opts = optionsQuery.data || [];
    let changed = false;
    let removedStandard = false;
    let removedExtended = false;
    const newSelections = new Map(selections);
    const newPickOne = new Map(pickOneSelections);

    for (const opt of opts) {
      if (isExtendedSelected) {
        if (isStandardCarrierOrScales(opt)) {
          if (newSelections.has(opt.id)) { newSelections.delete(opt.id); changed = true; removedStandard = true; }
          for (const [group, selId] of newPickOne) {
            if (selId === opt.id) { newPickOne.delete(group); changed = true; removedStandard = true; }
          }
        }
      } else {
        if (isExtendedCarrierOrScales(opt) || opt.requires_extended) {
          if (newSelections.has(opt.id)) { newSelections.delete(opt.id); changed = true; if (isCarrierOption(opt) || isScalesOption(opt)) removedExtended = true; }
          for (const [group, selId] of newPickOne) {
            if (selId === opt.id) { newPickOne.delete(group); changed = true; if (isCarrierOption(opt) || isScalesOption(opt)) removedExtended = true; }
          }
        }
      }
    }
    if (changed) {
      setSelections(newSelections);
      setPickOneSelections(newPickOne);
      if (removedStandard) toast.info("Standard carrier removed — select an extended carrier");
      else if (removedExtended) toast.info("Extended carrier removed");
      else toast.info("Extended options removed");
    }
  }, [isExtendedSelected]);

  /* ─── Pricing ──────────────────────────────────────────────── */

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

  const marginColor = margin
    ? margin.percent >= 15 ? "#55BAAA" : margin.percent >= 10 ? "#F3D12A" : "#E87461"
    : undefined;

  /* ─── Build shorthand ──────────────────────────────────────── */

  useEffect(() => {
    if (buildShorthandManual) return;
    if (!selectedBaseModel) { setBuildShorthand(""); return; }
    const parts: string[] = [];
    if (selectedQuickBuild) {
      parts.push(selectedQuickBuild.name);
      const qbIds = new Set(selectedQuickBuild.included_option_ids || []);
      for (const { option, left, right, quantity } of selectedOptionsList) {
        if (qbIds.has(option.id)) continue;
        let code = option.short_code;
        if (left > 0 || right > 0) {
          const sides: string[] = [];
          if (left > 0) sides.push(left > 1 ? `L×${left}` : "L");
          if (right > 0) sides.push(right > 1 ? `R×${right}` : "R");
          code += ` · ${sides.join(", ")}`;
        } else if (quantity > 1) {
          code += ` ×${quantity}`;
        }
        parts.push(code);
      }
    } else {
      parts.push(selectedBaseModel.short_name);
      for (const { option, left, right, quantity } of selectedOptionsList) {
        let code = option.short_code;
        if (left > 0 || right > 0) {
          const sides: string[] = [];
          if (left > 0) sides.push(left > 1 ? `L×${left}` : "L");
          if (right > 0) sides.push(right > 1 ? `R×${right}` : "R");
          code += ` · ${sides.join(", ")}`;
        } else if (quantity > 1) {
          code += ` ×${quantity}`;
        }
        parts.push(code);
      }
    }
    setBuildShorthand(parts.join(", "));
  }, [selectedBaseModel, selectedQuickBuild, selectedOptionsList, buildShorthandManual]);

  /* ─── Handlers ─────────────────────────────────────────────── */

  function handleManufacturerChange(id: string) {
    setManufacturerId(id);
    setBaseModelId(""); setQuickBuildId("");
    setSelections(new Map()); setPickOneSelections(new Map());
    setPivotSide(""); setPivotType(""); setDualChecked(false); setPivotChecked(false);
    setBuildShorthandManual(false);
  }

  function handleBaseModelChange(id: string) {
    setBaseModelId(id);
    setSelections(new Map()); setPickOneSelections(new Map());
    setPivotSide(""); setPivotType(""); setDualChecked(false); setPivotChecked(false);
    setQuickBuildId(""); setBuildShorthandManual(false);
  }

  function handleQuickBuildChange(id: string) {
    setQuickBuildId(id);
    if (!id) { setSelections(new Map()); setPickOneSelections(new Map()); return; }
    const qb = quickBuildsQuery.data?.find((q) => q.id === id);
    if (qb) {
      if (qb.base_model_id) setBaseModelId(qb.base_model_id);
      const newSel = new Map<string, OptionSelection>();
      for (const optId of qb.included_option_ids || []) {
        newSel.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      }
      setSelections(newSel);
      setPickOneSelections(new Map());
      setBuildShorthandManual(false);
    }
  }

  function toggleSimpleOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.get(optId)?.selected) next.delete(optId);
      else next.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      return next;
    });
    setBuildShorthandManual(false);
  }

  function toggleQuantityOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.get(optId)?.selected) next.delete(optId);
      else next.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      return next;
    });
    setBuildShorthandManual(false);
  }

  function setQuantityOptionQty(optId: string, qty: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing) next.set(optId, { ...existing, quantity: qty });
      return next;
    });
    setBuildShorthandManual(false);
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
    setBuildShorthandManual(false);
  }

  function toggleSide(optId: string, side: "left" | "right") {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId) || { optionId: optId, left: 0, right: 0, selected: false, quantity: 0 };
      const current = side === "left" ? existing.left : existing.right;
      next.set(optId, { ...existing, [side]: current > 0 ? 0 : 1 });
      return next;
    });
    setBuildShorthandManual(false);
  }

  function setSideQty(optId: string, side: "left" | "right", qty: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId) || { optionId: optId, left: 0, right: 0, selected: false, quantity: 0 };
      next.set(optId, { ...existing, [side]: qty });
      return next;
    });
    setBuildShorthandManual(false);
  }

  function selectPickOne(group: string, optId: string | null) {
    setPickOneSelections((prev) => {
      const next = new Map(prev);
      if (optId) next.set(group, optId); else next.delete(group);
      return next;
    });
    setBuildShorthandManual(false);
  }

  /* ─── Customer ─────────────────────────────────────────────── */

  const filteredCustomers = customerSearchQuery.data || [];

  const selectedCustomer = customerId ? selectedCustomerQuery.data ?? null : null;


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
      queryClient.invalidateQueries({ queryKey: ["customer-search"] });
      setCustomerId(data.id);
      setCustomerSearch(data.name);
      setShowNewCustomerForm(false);
      setCustomerPopoverOpen(false);
      setNewCustomer({ name: "", email: "", phone: "", city: "", state: "", type: "" });
    },
  });

  /* ─── Validation ───────────────────────────────────────────── */

  function validate() {
    const e: Record<string, string> = {};
    if (!manufacturerId) e.manufacturer = "Manufacturer is required";
    if (!baseModelId) e.baseModel = "Base model is required";
    if (!buildShorthand.trim()) e.buildShorthand = "Build shorthand is required";
    if (pivotChecked) {
      if (!pivotType) e.pivotType = "Select pivot type";
      if (!pivotSide) e.pivotSide = pivotType === "front_to_back" ? "Select mounted side" : "Select dominant side";
    }
    for (const [optId, sel] of selections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (opt?.selection_type === "side" && sel.left === 0 && sel.right === 0 && !sel.selected) {
        e[`side_${optId}`] = "Select a side";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ─── Submit ───────────────────────────────────────────────── */

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data: orderNumber, error: rpcError } = await supabase.rpc("generate_order_number");
      if (rpcError) throw rpcError;

      const selectedOptionsJson = selectedOptionsList.map((s) => {
        const qty = s.quantity;
        const isPivot = s.pivotType != null;
        const pivotDisplayName = s.pivotType === "side_to_side" ? "Pivot · Side-to-Side" : s.pivotType === "front_to_back" ? "Pivot · Front-to-Back" : undefined;
        const sideLabel = s.pivotType === "side_to_side" ? "Dominant side" : s.pivotType === "front_to_back" ? "Mounted on" : undefined;
        return {
          option_id: s.option.id,
          display_name: pivotDisplayName || s.option.display_name || s.option.name,
          name: s.option.name,
          short_code: s.option.short_code,
          cost_price_each: s.option.cost_price,
          retail_price_each: s.option.retail_price,
          ...(isPivot ? { pivot_type: s.pivotType, side: s.pivotSide, side_label: sideLabel } : {
            left_qty: s.left,
            right_qty: s.right,
          }),
          quantity: qty,
          total_cost: s.option.cost_price * qty,
          total_retail: s.option.retail_price * qty,
        };
      });

      const subtotal = calcRetail;

      const { data: order, error: orderError } = await supabase.from("orders").insert({
        order_number: orderNumber,
        customer_id: customerId || null,
        manufacturer_id: manufacturerId,
        base_model_id: baseModelId,
        base_model: selectedBaseModel?.name || null,
        build_shorthand: buildShorthand,
        build_description: notes || null,
        subtotal,
        customer_price: customerPrice,
        our_cost: ourCost,
        discount_type: discountType,
        discount_amount: parseFloat(discountAmount) || 0,
        freight_estimate: freightEstimate ? parseFloat(freightEstimate) : null,
        catl_number: catl_number || null,
        serial_number: serialNumber || null,
        status,
        source_type: isDirectOrder ? "direct_order" : "estimate",
        estimate_date: format(estimateDate, "yyyy-MM-dd"),
        ordered_date: isDirectOrder ? format(new Date(), "yyyy-MM-dd") : null,
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

      await supabase.from("estimates").insert({
        order_id: order.id,
        version_number: 1,
        build_shorthand: buildShorthand,
        total_price: customerPrice,
        is_current: true,
        line_items: lineItems,
      });

      toast.success(`${isDirectOrder ? "Order" : "Estimate"} ${orderNumber} created`);
      navigate(`/orders/${order.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Computed display values ──────────────────────────────── */

  const optionCount = selectedOptionsList.length;
  const optionRetailTotal = selectedOptionsList.reduce((s, { option, quantity }) => s + option.retail_price * quantity, 0);

  const isOverheadScalesSelected = useMemo(() => {
    const opts = optionsQuery.data || [];
    const scalesOpts = opts.filter((o) =>
      o.option_group === "Scales" && o.name.toLowerCase().includes("overhead")
    );
    return scalesOpts.some((o) => pickOneSelections.get("Scales") === o.id);
  }, [optionsQuery.data, pickOneSelections]);

  const pivotOnScalesOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.name.toLowerCase().includes("pivot on overhead") || o.name.toLowerCase().includes("pivot overhead")),
    [optionsQuery.data]
  );

  const isPivotSelected = pivotChecked;

  const summaryPills = useMemo(() => {
    const pills: { label: string; variant: "base" | "standard" | "addon"; optionId?: string }[] = [];
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
      pills.push({ label, variant: qbIds.has(option.id) ? "standard" : "addon", optionId: option.id });
    }
    return pills;
  }, [selectedBaseModel, selectedQuickBuild, selectedOptionsList]);

  /* ─── Render helpers ───────────────────────────────────────── */

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
            <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>
              {opt.display_name || opt.name}{opt.is_included ? " — included" : ""}
            </span>
            {!opt.is_included && (
              <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>
            )}
          </label>
        ))}
      </div>
    );
  }

  function renderControlsGroup(options: FullOption[]) {
    const dcOpt = options.find((o) => o.short_code === "DC" || o.name.toLowerCase().includes("dual"));
    const pcOpt = options.find((o) => o.short_code === "PC");
    const pcFbOpt = options.find((o) => o.short_code === "PC-FB");
    return (
      <div className="space-y-2">
        {dcOpt && (
          <label className="flex items-start gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
            <input type="checkbox" checked={dualChecked} onChange={() => setDualChecked(!dualChecked)} className="w-[18px] h-[18px] accent-catl-teal rounded mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium" style={{ color: "#1A1A1A" }}>Dual Controls</span>
              <p className="text-[11px] mt-0.5" style={{ color: "#717182" }}>Stationary controls on both sides.</p>
            </div>
            <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: "#717182" }}>${fmtCurrency(dcOpt.retail_price)}</span>
          </label>
        )}
        {(pcOpt || pcFbOpt) && (
          <div>
            <label className="flex items-start gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
              <input type="checkbox" checked={pivotChecked} onChange={() => {
                if (pivotChecked) {
                  setPivotChecked(false); setPivotType(""); setPivotSide("");
                  if (pivotOnScalesOption) setSelections(prev => { const n = new Map(prev); n.delete(pivotOnScalesOption.id); return n; });
                } else {
                  setPivotChecked(true);
                }
              }} className="w-[18px] h-[18px] accent-catl-teal rounded mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium" style={{ color: "#1A1A1A" }}>Pivot Controls</span>
                <p className="text-[11px] mt-0.5" style={{ color: "#717182" }}>Upgrades one side from stationary to pivot.</p>
              </div>
              <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: "#717182" }}>${fmtCurrency(pcOpt?.retail_price || pcFbOpt?.retail_price || 0)}</span>
            </label>
            {pivotChecked && (
              <div className="ml-[26px] mt-2 mb-2 p-3 rounded-lg border space-y-3" style={{ borderColor: "#D4D4D0" }}>
                <div>
                  <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>Pivot type (pick one):</p>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 py-1 cursor-pointer">
                      <input type="radio" name="pivot-type" checked={pivotType === "side_to_side"} onChange={() => setPivotType("side_to_side")} className="w-[16px] h-[16px] accent-catl-teal" />
                      <span className="text-[13px]" style={{ color: "#1A1A1A" }}>Side-to-side</span>
                    </label>
                    <label className="flex items-center gap-2 py-1 cursor-pointer">
                      <input type="radio" name="pivot-type" checked={pivotType === "front_to_back"} onChange={() => setPivotType("front_to_back")} className="w-[16px] h-[16px] accent-catl-teal" />
                      <span className="text-[13px]" style={{ color: "#1A1A1A" }}>Front-to-back</span>
                    </label>
                  </div>
                  {errors.pivotType && <p className="text-[11px] mt-1" style={{ color: "#D4183D" }}>{errors.pivotType}</p>}
                </div>
                {pivotType && (
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>
                      {pivotType === "side_to_side" ? "Dominant side:" : "Mounted on:"}
                    </p>
                    <div className="flex items-center gap-2">
                      <SidePill label="Left" active={pivotSide === "Left"} onClick={() => setPivotSide("Left")} />
                      <SidePill label="Right" active={pivotSide === "Right"} onClick={() => setPivotSide("Right")} />
                    </div>
                    {errors.pivotSide && <p className="text-[11px] mt-1" style={{ color: "#D4183D" }}>{errors.pivotSide}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {isPivotSelected && isOverheadScalesSelected && pivotOnScalesOption && (
          <div className="border-t border-border pt-2">
            <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
              <input
                type="checkbox"
                checked={selections.get(pivotOnScalesOption.id)?.selected ?? false}
                onChange={() => toggleSimpleOption(pivotOnScalesOption.id)}
                className="w-[18px] h-[18px] accent-catl-teal rounded"
              />
              <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{pivotOnScalesOption.display_name || pivotOnScalesOption.name}</span>
              <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(pivotOnScalesOption.retail_price)}</span>
            </label>
          </div>
        )}
        {!dualChecked && !pivotChecked && (
          <p className="text-[11px] px-2" style={{ color: "#717182" }}>Standard controls (included). One side, fixed position, no additional cost.</p>
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
            {(opt.display_name || opt.name).replace(/\s*\(per sidegate\)/i, "")}
          </span>
          <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)} ea</span>
        </label>
        {isChecked && (
          <div className="ml-[26px] mt-1 mb-2 space-y-2 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
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
            {leftConflict && <p className="text-[11px]" style={{ color: "#D4183D" }}>{leftConflict}</p>}
            {rightConflict && <p className="text-[11px]" style={{ color: "#D4183D" }}>{rightConflict}</p>}
            {totalQty > 0 && (
              <p className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>
                {totalQty > 1 ? `${totalQty} × $${fmtCurrency(opt.retail_price)} = $${fmtCurrency(totalPrice)}` : `$${fmtCurrency(totalPrice)}`}
              </p>
            )}
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
    const totalPrice = qty * opt.retail_price;

    return (
      <div key={opt.id} className="mb-1 overflow-hidden">
        <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
          <input type="checkbox" checked={isChecked} onChange={() => toggleQuantityOption(opt.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
          <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>
            {opt.display_name || opt.name}
          </span>
          <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)} ea</span>
        </label>
        {isChecked && (
          <div className="ml-[26px] mt-1 mb-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "#717182", width: 28 }}>Qty:</span>
              <QtyStepper value={qty} min={1} max={maxQty} onChange={(v) => setQuantityOptionQty(opt.id, v)} />
            </div>
            {qty > 1 && (
              <p className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>
                {qty} × ${fmtCurrency(opt.retail_price)} = ${fmtCurrency(totalPrice)}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderSimpleOption(opt: FullOption) {
    const isChecked = selections.get(opt.id)?.selected ?? false;
    // Conflict logic: Head Restraint vs De-Horner, Std Chest Bar vs HD Chest Bar
    const conflictCodes: Record<string, string[]> = { "HR": ["DH"], "DH": ["HR"], "SCB": ["HDCB"], "HDCB": ["SCB"] };
    const conflicting = conflictCodes[opt.short_code];
    const isDisabled = conflicting?.some((code) => {
      const conflictOpt = optionsQuery.data?.find((o) => o.short_code === code);
      return conflictOpt && selections.get(conflictOpt.id)?.selected;
    }) ?? false;
    const priceDisplay = opt.retail_price === 0
      ? <span className="text-xs flex-shrink-0 italic" style={{ color: "#717182" }}>TBD</span>
      : <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>;
    return (
      <label key={opt.id} className={cn("flex items-center gap-2.5 py-1.5 px-2 rounded-md min-h-[32px]", isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted/50")}>
        <input type="checkbox" checked={isChecked} onChange={() => { if (!isDisabled) toggleSimpleOption(opt.id); }} disabled={isDisabled} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
        <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name}</span>
        {priceDisplay}
      </label>
    );
  }

  function renderGroupCard(group: string, options: FullOption[]) {
    const isPick = options.every((o) => o.selection_type === "pick_one");

    if (group === "Scales") {
      const platforms = options.filter((o) => o.selection_type === "pick_one");
      const indicators = options.filter((o) => o.selection_type !== "pick_one");
      return (
        <div key={group} className="border rounded-lg p-3 overflow-hidden" style={{ borderColor: "#D4D4D0", background: "#FFFFFF" }}>
          <h4 className="text-[11px] font-bold uppercase mb-2" style={{ color: "#0E2646" }}>{group.replace(/[-_]/g, " ")}</h4>
          {platforms.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Platform (pick one):</p>
              {renderPickOneGroup(group, platforms)}
            </div>
          )}
          {indicators.length > 0 && (
            <div className={platforms.length > 0 ? "pt-2 border-t" : ""} style={platforms.length > 0 ? { borderColor: "#D4D4D0" } : undefined}>
              <p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Indicators (select any):</p>
              <div className="space-y-0.5">{indicators.map((opt) => renderSimpleOption(opt))}</div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={group} className="border rounded-lg p-3 overflow-hidden" style={{ borderColor: "#D4D4D0", background: "#FFFFFF" }}>
        <h4 className="text-[11px] font-bold uppercase mb-2" style={{ color: "#0E2646" }}>{group.replace(/[-_]/g, " ")}</h4>
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

  function handlePillClick(pill: { optionId?: string }) {
    if (!pill.optionId) return;
    // Find the option and remove it
    const opt = optionsQuery.data?.find((o) => o.id === pill.optionId);
    if (!opt) return;
    if (opt.short_code === "DC") { setDualChecked(false); return; }
    if (opt.short_code === "PC" || opt.short_code === "PC-FB") {
      setPivotChecked(false); setPivotType(""); setPivotSide("");
      if (pivotOnScalesOption) setSelections(prev => { const n = new Map(prev); n.delete(pivotOnScalesOption.id); return n; });
      return;
    }
    if (opt.selection_type === "pick_one") {
      for (const [group, selId] of pickOneSelections) {
        if (selId === pill.optionId) { selectPickOne(group, null); return; }
      }
    }
    setSelections(prev => { const n = new Map(prev); n.delete(pill.optionId!); return n; });
    setBuildShorthandManual(false);
  }

  // Status visibility for completion date
  const showCompletionDate = ["ordered", "so_received", "in_production", "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed"].includes(status);

  /* ─── RENDER ───────────────────────────────────────────────── */

  const modelLabel = selectedBaseModel
    ? `${selectedBaseModel.short_name} · ${selectedManufacturer?.short_name || ""}`
    : "Select a model";

  const discountDisplay = discountValue > 0
    ? (discountType === "%" ? `−${parseFloat(discountAmount) || 0}%` : `−$${fmtCurrency(discountValue)}`)
    : "—";

  return (
    <div className="mx-auto pb-40 overflow-x-hidden max-w-full" style={{ background: "#F5F5F0" }}>
      {/* ─── Sticky Navy Price Bar ──────────────────────────── */}
      <div className="sticky top-0 z-10 md:max-w-[680px] md:mx-auto" style={{ background: "#0E2646", borderRadius: "0 0 12px 12px", padding: "12px 16px" }}>
        {/* Row 1 */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.05em]" style={{ color: "rgba(240,240,240,0.45)" }}>
            {isDirectOrder ? "New order" : "New estimate"}
          </span>
          <span className="text-[11px] truncate ml-2" style={{ color: "rgba(240,240,240,0.45)" }}>
            {modelLabel}
          </span>
        </div>
        {/* Row 2 — Desktop */}
        <div className="hidden sm:flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-[10px]" style={{ color: "rgba(240,240,240,0.35)" }}>Subtotal</p>
              <p className="text-[18px] font-medium" style={{ color: "#F0F0F0" }}>${fmtCurrency(calcRetail)}</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: "rgba(240,240,240,0.35)" }}>Discount</p>
              <p className="text-[14px] font-medium" style={{ color: discountValue > 0 ? "#F3D12A" : "rgba(240,240,240,0.25)" }}>{discountDisplay}</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: "rgba(240,240,240,0.35)" }}>Customer price</p>
              <p className="text-[18px] font-medium" style={{ color: "#F0F0F0" }}>${fmtCurrency(customerPrice)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: "rgba(240,240,240,0.35)" }}>Margin</p>
            <p className="text-[14px] font-medium" style={{ color: marginColor || "rgba(240,240,240,0.25)" }}>
              {margin ? `$${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)` : "—"}
            </p>
          </div>
        </div>
        {/* Row 2 — Mobile */}
        <div className="flex sm:hidden items-baseline justify-between">
          <p className="text-[18px] font-medium" style={{ color: "#F0F0F0" }}>${fmtCurrency(customerPrice)}</p>
          <p className="text-[14px] font-medium" style={{ color: marginColor || "rgba(240,240,240,0.25)" }}>
            {margin ? `${margin.percent.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* ─── Page Header ────────────────────────────────────── */}
      <div className="flex items-center gap-2 my-4 px-4 md:max-w-[680px] md:mx-auto">
        <button onClick={() => navigate(-1)} className="p-1" style={{ color: "#55BAAA" }}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-[17px] font-bold text-foreground">{isDirectOrder ? "New order" : "New estimate"}</h1>
      </div>

      {/* ─── Form Card ──────────────────────────────────────── */}
      <div className="bg-white border rounded-xl p-4 space-y-4 md:max-w-[680px] md:mx-auto mx-4 overflow-x-hidden" style={{ borderColor: "#D4D4D0" }}>

        {/* ── CUSTOMER ─────────────────────────────────────── */}
        <>
          <SectionHeader title={isDirectOrder ? "Customer (optional)" : "Customer"} />

            <FormRow label="Customer">
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] text-left focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25">
                    {selectedCustomer ? selectedCustomer.name : (
                      <span className="text-muted-foreground">Search customers...</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type 2+ letters to search..."
                      value={customerSearch}
                      onValueChange={(val) => {
                        setCustomerSearch(val);
                        setCustomerId("");
                      }}
                    />
                    <CommandList>
                      {debouncedCustomerSearch.length < 2 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground">
                          Type 2+ letters to search...
                        </div>
                      ) : customerSearchQuery.isLoading ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground">Searching...</div>
                      ) : (
                        <>
                          <CommandEmpty>No customers found</CommandEmpty>
                          <CommandGroup>
                            {filteredCustomers.map((c: any) => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  setCustomerId(c.id);
                                  setCustomerSearch(c.name);
                                  setCustomerPopoverOpen(false);
                                }}
                              >
                                <span className="font-medium">{c.name}</span>
                                {c.address_city && (
                                  <span className="text-muted-foreground ml-2 text-xs">
                                    {c.address_city}, {c.address_state}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                      <div className="border-t border-border">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewCustomerForm(true);
                            setCustomerPopoverOpen(false);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm font-semibold flex items-center gap-1"
                          style={{ color: "#55BAAA" }}
                        >
                          <Plus size={14} /> Add New Customer
                        </button>
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedCustomer && (
                <button type="button" onClick={() => { setCustomerId(""); setCustomerSearch(""); }} className="text-xs text-muted-foreground mt-1 hover:text-foreground">
                  Clear selection
                </button>
              )}
            </FormRow>

            {showNewCustomerForm && (
              <div className="ml-[128px] border rounded-lg p-3 space-y-2 overflow-hidden" style={{ borderColor: "rgba(85,186,170,0.3)", background: "rgba(85,186,170,0.05)" }}>
                <input placeholder="Name *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0 text-[16px]" />
                  <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0 text-[16px]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="City" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0 text-[16px]" />
                  <input placeholder="State" value={newCustomer.state} onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none min-w-0 text-[16px]" />
                </div>
                <select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]">
                  <option value="">Type (optional)</option>
                  <option value="rancher">Rancher</option>
                  <option value="feedlot">Feedlot</option>
                  <option value="dealer">Dealer</option>
                  <option value="other">Other</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => addCustomerMutation.mutate()} disabled={!newCustomer.name || addCustomerMutation.isPending} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#55BAAA" }}>
                    {addCustomerMutation.isPending ? "Saving..." : "Save Customer"}
                  </button>
                  <button onClick={() => setShowNewCustomerForm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground">Cancel</button>
                </div>
              </div>
            )}
        </>

        {/* ── EQUIPMENT ──────────────────────────────────────── */}
        <SectionHeader title="Equipment" />

        <FormRow label="Manufacturer" error={errors.manufacturer}>
          <select value={manufacturerId} onChange={(e) => handleManufacturerChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25">
            <option value="">Select manufacturer</option>
            {manufacturersQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormRow>

        <FormRow label="Base Model" error={errors.baseModel}>
          <select value={baseModelId} onChange={(e) => handleBaseModelChange(e.target.value)} disabled={!manufacturerId} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25">
            <option value="">Select base model</option>
            {baseModelsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name} — ${m.retail_price.toLocaleString()}</option>)}
          </select>
        </FormRow>

        {quickBuildsQuery.data && quickBuildsQuery.data.length > 0 && (
          <FormRow label="Quick Build">
            <select value={quickBuildId} onChange={(e) => handleQuickBuildChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25">
              <option value="">None — custom build</option>
              {quickBuildsQuery.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </FormRow>
        )}

        {/* ── OPTIONS ────────────────────────────────────────── */}
        <SectionHeader
          title="Options"
          subtitle={optionCount > 0 ? `${optionCount} selected · $${fmtCurrency(optionRetailTotal)}` : undefined}
        />

        {extendedChuteOption && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg border overflow-hidden" style={{ borderColor: isExtendedSelected ? "#55BAAA" : "#D4D4D0", background: isExtendedSelected ? "rgba(85,186,170,0.06)" : "#FFFFFF" }}>
            <input type="checkbox" checked={isExtendedSelected} onChange={() => toggleSimpleOption(extendedChuteOption.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
            <span className="text-[13px] font-semibold flex-1 break-words min-w-0" style={{ color: "#0E2646" }}>Extended Chute</span>
            <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(extendedChuteOption.retail_price)}</span>
          </div>
        )}

        {groupedOptions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {groupedOptions.map(([group, opts]) => {
              const filtered = opts.filter((o) => o.id !== extendedChuteOption?.id);
              if (filtered.length === 0) return null;
              return renderGroupCard(group, filtered);
            })}
          </div>
        )}

        {/* ── BUILD SUMMARY ──────────────────────────────────── */}
        <SectionHeader title="Build Summary" />

        {selectedBaseModel && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "#0E2646", color: "#F0F0F0" }}>
              {selectedBaseModel.short_name}
            </span>
            <span className="text-xs" style={{ color: "#717182" }}>{selectedManufacturer?.name}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3 max-w-full overflow-hidden">
          {summaryPills.filter(p => p.variant !== "base").map((pill, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handlePillClick(pill)}
              className="px-2.5 py-1 rounded-full text-xs font-semibold break-words cursor-pointer active:scale-[0.95] transition-transform"
              style={{
                background: pill.variant === "standard" ? "rgba(85,186,170,0.12)" : "rgba(243,209,42,0.15)",
                border: pill.variant === "standard" ? "1px solid rgba(85,186,170,0.3)" : "1px solid rgba(243,209,42,0.35)",
                color: pill.variant === "standard" ? "#55BAAA" : "#B8860B",
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <FormRow label="Build Short" error={errors.buildShorthand}>
          <input
            value={buildShorthand}
            onChange={(e) => { setBuildShorthand(e.target.value); setBuildShorthandManual(true); }}
            placeholder="Auto-generated from selections"
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card outline-none min-w-0 text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25"
            style={{ fontWeight: buildShorthand ? 500 : 400, color: buildShorthand ? "#55BAAA" : undefined }}
          />
        </FormRow>

        {/* Pricing breakdown in build summary */}
        {selectedBaseModel && (
          <div className="mt-3 pt-3 space-y-2 overflow-hidden" style={{ borderTop: "1px solid #D4D4D0" }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#1A1A1A" }}>Base model</span>
              <span style={{ color: "#1A1A1A" }}>${fmtCurrency(selectedBaseModel.retail_price)}</span>
            </div>
            {optionCount > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: "#1A1A1A" }}>Options ({optionCount})</span>
                <span style={{ color: "#1A1A1A" }}>${fmtCurrency(optionRetailTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-medium pt-1" style={{ borderTop: "1px solid #D4D4D0" }}>
              <span>Subtotal</span>
              <span>${fmtCurrency(calcRetail)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#717182" }}>Our Cost</span>
              <span style={{ color: "#717182" }}>${fmtCurrency(ourCost)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span style={{ color: marginColor || "#717182" }}>Margin</span>
              <span style={{ color: marginColor || "#717182" }}>
                {margin ? `$${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)` : "—"}
              </span>
            </div>
          </div>
        )}

        {/* ── DISCOUNT & FREIGHT ─────────────────────────────── */}
        <SectionHeader title="Discount & Freight" />

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1" style={{ minWidth: 160 }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Discount</p>
            <div className="flex items-center gap-1.5">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "$" | "%")} className="border border-border rounded-md px-2 py-2 bg-card text-sm outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" style={{ width: 60 }}>
                <option value="$">$</option>
                <option value="%">%</option>
              </select>
              <input type="text" inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="border border-border rounded-md px-2 py-2 bg-card text-sm outline-none text-right text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" style={{ maxWidth: 120 }} />
            </div>
          </div>
          <div style={{ minWidth: 140 }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Freight estimate</p>
            <CurrencyInput value={freightEstimate} onChange={setFreightEstimate} placeholder="0" />
          </div>
        </div>

        {/* ── TRACKING ───────────────────────────────────────── */}
        <SectionHeader title="Tracking" />

        <div className="flex flex-wrap gap-4">
          <div className="flex-1" style={{ minWidth: 160 }}>
            <FormRow label="CATL #">
              <input value={catl_number} onChange={(e) => setCatlNumber(e.target.value)} placeholder="e.g. CATL-2026-042" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none min-w-0 text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" />
            </FormRow>
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <FormRow label="Serial #">
              <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Assigned when manufactured" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none min-w-0 text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" />
            </FormRow>
          </div>
        </div>

        {/* ── STATUS ─────────────────────────────────────────── */}
        <SectionHeader title="Status" />

        <div className="flex flex-wrap gap-4">
          <div className="flex-1" style={{ minWidth: 160 }}>
            <FormRow label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none capitalize text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </FormRow>
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <FormRow label="Est. Date" narrow>
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn("w-full text-left border border-border rounded-lg px-3 py-2.5 bg-card text-[16px]", !estimateDate && "text-muted-foreground")}>
                    {estimateDate ? format(estimateDate, "PPP") : "Pick a date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={estimateDate} onSelect={(d) => d && setEstimateDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </FormRow>
          </div>
        </div>

        {showCompletionDate && (
          <FormRow label="Completion" narrow>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("w-full text-left border border-border rounded-lg px-3 py-2.5 bg-card text-[16px]", !estCompletionDate && "text-muted-foreground")}>
                  {estCompletionDate ? format(estCompletionDate, "PPP") : "Pick a date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={estCompletionDate} onSelect={setEstCompletionDate} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </FormRow>
        )}




        {/* ── NOTES ──────────────────────────────────────────── */}
        <SectionHeader title="Notes" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none resize-none min-w-0 text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" />
      </div>

      {/* ─── Save Button ────────────────────────────────────── */}
      <div className="px-4 mt-4 md:max-w-[680px] md:mx-auto">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-full py-3.5 text-[15px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
          style={{ background: "#F3D12A", color: "#0E2646" }}
        >
          {submitting ? "Creating..." : isDirectOrder ? "Create order" : "Create estimate"}
        </button>
      </div>
    </div>
  );
}
