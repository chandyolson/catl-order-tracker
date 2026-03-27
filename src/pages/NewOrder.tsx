import { useState, useMemo, useEffect, useCallback } from "react";
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
import { formatOptionPillLabel, getOptionDisplayName } from "@/lib/optionDisplay";

const STATUS_OPTIONS = [
  "estimate", "approved", "ordered", "so_received", "in_production",
  "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed",
];

// Group display order
const GROUP_ORDER = [
  "Controls", "Squeeze", "Head / Neck", "Doors / Exits",
  "Floor / Pan", "Power", "Scales", "Carrier", "Misc",
];

type FullOption = {
  id: string;
  name: string;
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

// Represents how an option is selected
type OptionSelection = {
  optionId: string;
  left: number;   // quantity on left side (0 = not selected)
  right: number;  // quantity on right side
  selected: boolean; // for simple/pick_one
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

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// Side picker pill
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

export default function NewOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [manufacturerId, setManufacturerId] = useState("");
  const [baseModelId, setBaseModelId] = useState("");
  const [quickBuildId, setQuickBuildId] = useState("");
  const [selections, setSelections] = useState<Map<string, OptionSelection>>(new Map());
  const [pickOneSelections, setPickOneSelections] = useState<Map<string, string>>(new Map()); // group -> optionId
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
  const [pivotType, setPivotType] = useState<"side_to_side" | "front_to_back" | "">("");
  const [pivotSide, setPivotSide] = useState<"Left" | "Right" | "">("");

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
        .select("id, name, short_code, option_group, retail_price, cost_price, selection_type, allows_quantity, max_per_side, requires_extended, requires_options, conflicts_with, model_restriction, is_upgrade_of, is_included")
        .eq("manufacturer_id", manufacturerId)
        .eq("is_active", true)
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

  // Is the "Extended Chute" option selected?
  const extendedChuteOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.short_code.toLowerCase() === "ext" || o.name.toLowerCase().includes("extended chute")),
    [optionsQuery.data]
  );
  const isExtendedSelected = extendedChuteOption
    ? (selections.get(extendedChuteOption.id)?.selected ?? false)
    : false;

  // Filter options based on model restrictions, requires_extended, requires_options
  const visibleOptions = useMemo(() => {
    if (!optionsQuery.data) return [];
    const selectedModel = selectedBaseModel;
    return optionsQuery.data.filter((opt) => {
      // Model restriction
      if (opt.model_restriction && opt.model_restriction.length > 0 && selectedModel) {
        if (!opt.model_restriction.includes(selectedModel.short_name)) return false;
      }
      // Requires extended
      if (opt.requires_extended && !isExtendedSelected) return false;
      // Requires other options
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

  // Group visible options
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, FullOption[]>();
    for (const opt of visibleOptions) {
      const g = opt.option_group || "Misc";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    // Sort by GROUP_ORDER
    const sorted: [string, FullOption[]][] = [];
    for (const g of GROUP_ORDER) {
      if (groups.has(g)) {
        sorted.push([g, groups.get(g)!]);
        groups.delete(g);
      }
    }
    // Any remaining groups
    for (const [g, opts] of groups) sorted.push([g, opts]);
    return sorted;
  }, [visibleOptions]);

  // Helpers to check if an option is selected (any form)
  const isOptionSelected = useCallback((optId: string): boolean => {
    const sel = selections.get(optId);
    if (!sel) return false;
    return sel.selected || sel.left > 0 || sel.right > 0;
  }, [selections]);

  // Get total quantity for an option
  const getOptionQuantity = useCallback((optId: string): number => {
    const sel = selections.get(optId);
    if (!sel) return 0;
    if (sel.selected && sel.left === 0 && sel.right === 0) return 1; // simple
    return sel.left + sel.right;
  }, [selections]);

  // All selected options (for pricing, summary, submit)
  const selectedOptionsList = useMemo(() => {
    const result: { option: FullOption; quantity: number; left: number; right: number; pivotType?: string; pivotSide?: string }[] = [];
    // pick_one selections
    for (const [group, optId] of pickOneSelections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (opt && opt.is_included !== true) {
        const isPivot = group === "Controls" && opt.name.toLowerCase().includes("pivot");
        result.push({
          option: opt, quantity: 1, left: 0, right: 0,
          ...(isPivot ? { pivotType: pivotType || undefined, pivotSide: pivotSide || undefined } : {}),
        });
      }
    }
    // Other selections
    for (const [optId, sel] of selections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (!opt) continue;
      // Skip if this option is in a pick_one group (handled above)
      if (opt.selection_type === "pick_one") continue;
      const qty = sel.selected ? Math.max(1, sel.left + sel.right) : sel.left + sel.right;
      if (qty > 0) {
        result.push({ option: opt, quantity: qty, left: sel.left, right: sel.right });
      }
    }
    return result;
  }, [selections, pickOneSelections, optionsQuery.data, pivotType, pivotSide]);

  // Side conflict logic: WTD right blocks side exit right (non-extended only)
  const getSideConflicts = useCallback((optId: string, side: "left" | "right"): string | null => {
    if (isExtendedSelected) return null;
    const opt = optionsQuery.data?.find((o) => o.id === optId);
    if (!opt) return null;
    const isWTD = opt.short_code === "WD" || opt.name.toLowerCase().includes("walk-through");
    const isSideExit = opt.short_code === "SE" || opt.short_code === "SSH" || opt.short_code === "HE" ||
      opt.name.toLowerCase().includes("side exit") || opt.name.toLowerCase().includes("slam shut") || opt.name.toLowerCase().includes("hydraulic exit");

    if (isWTD && side === "right") {
      // Check if any side exit has right selected
      const exits = optionsQuery.data?.filter((o) =>
        o.short_code === "SE" || o.short_code === "SSH" || o.short_code === "HE" ||
        o.name.toLowerCase().includes("side exit") || o.name.toLowerCase().includes("slam shut") || o.name.toLowerCase().includes("hydraulic exit")
      ) || [];
      for (const ex of exits) {
        const exSel = selections.get(ex.id);
        if (exSel && exSel.right > 0) return `Right blocked — ${ex.name} on right (non-extended chute)`;
      }
    }
    if (isSideExit && side === "right") {
      // Check if WTD has right selected
      const wtds = optionsQuery.data?.filter((o) =>
        o.short_code === "WD" || o.name.toLowerCase().includes("walk-through")
      ) || [];
      for (const w of wtds) {
        const wSel = selections.get(w.id);
        if (wSel && wSel.right > 0) return `Right blocked — walk-through door on right (non-extended chute)`;
      }
    }
    return null;
  }, [isExtendedSelected, optionsQuery.data, selections]);

  // When extended chute is deselected, remove extended-only options
  useEffect(() => {
    if (!extendedChuteOption) return;
    if (isExtendedSelected) return;
    // Remove any extended-only options that are selected
    const opts = optionsQuery.data || [];
    let changed = false;
    const newSelections = new Map(selections);
    const newPickOne = new Map(pickOneSelections);
    for (const opt of opts) {
      if (opt.requires_extended) {
        if (newSelections.has(opt.id)) {
          newSelections.delete(opt.id);
          changed = true;
        }
        // Check pick_one groups
        for (const [group, selId] of newPickOne) {
          if (selId === opt.id) {
            newPickOne.delete(group);
            changed = true;
          }
        }
      }
    }
    if (changed) {
      setSelections(newSelections);
      setPickOneSelections(newPickOne);
      toast.info("Extended options removed");
    }
  }, [isExtendedSelected]);

  // Auto-calculate prices with quantities
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

  useEffect(() => {
    if (!customerPriceManual && calcRetail > 0) setCustomerPrice(String(calcRetail));
  }, [calcRetail, customerPriceManual]);

  useEffect(() => {
    if (!ourCostManual && calcCost > 0) setOurCost(String(calcCost));
  }, [calcCost, ourCostManual]);

  // Auto-generate build shorthand with side info
  useEffect(() => {
    if (buildShorthandManual) return;
    if (!selectedBaseModel) { setBuildShorthand(""); return; }
    const parts: string[] = [];
    if (selectedQuickBuild) {
      parts.push(selectedQuickBuild.name);
      const qbIds = new Set(selectedQuickBuild.included_option_ids || []);
      for (const { option, left, right } of selectedOptionsList) {
        if (qbIds.has(option.id)) continue;
        let code = option.short_code;
        if (left > 0 || right > 0) {
          const sides: string[] = [];
          if (left > 0) sides.push(left > 1 ? `L×${left}` : "L");
          if (right > 0) sides.push(right > 1 ? `R×${right}` : "R");
          code += ` · ${sides.join(", ")}`;
        }
        parts.push(code);
      }
    } else {
      parts.push(selectedBaseModel.short_name);
      for (const { option, left, right } of selectedOptionsList) {
        let code = option.short_code;
        if (left > 0 || right > 0) {
          const sides: string[] = [];
          if (left > 0) sides.push(left > 1 ? `L×${left}` : "L");
          if (right > 0) sides.push(right > 1 ? `R×${right}` : "R");
          code += ` · ${sides.join(", ")}`;
        }
        parts.push(code);
      }
    }
    setBuildShorthand(parts.join(", "));
  }, [selectedBaseModel, selectedQuickBuild, selectedOptionsList, buildShorthandManual]);

  // Handlers
  function handleManufacturerChange(id: string) {
    setManufacturerId(id);
    setBaseModelId("");
    setQuickBuildId("");
    setSelections(new Map());
    setPickOneSelections(new Map());
    setPivotType("");
    setPivotSide("");
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function handleBaseModelChange(id: string) {
    setBaseModelId(id);
    setSelections(new Map());
    setPickOneSelections(new Map());
    setPivotType("");
    setPivotSide("");
    setQuickBuildId("");
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function handleQuickBuildChange(id: string) {
    setQuickBuildId(id);
    if (!id) {
      setSelections(new Map());
      setPickOneSelections(new Map());
      return;
    }
    const qb = quickBuildsQuery.data?.find((q) => q.id === id);
    if (qb) {
      if (qb.base_model_id) setBaseModelId(qb.base_model_id);
      // Set all quick build options as selected (simple)
      const newSel = new Map<string, OptionSelection>();
      for (const optId of qb.included_option_ids || []) {
        newSel.set(optId, { optionId: optId, left: 0, right: 0, selected: true });
      }
      setSelections(newSel);
      setPickOneSelections(new Map());
      setCustomerPriceManual(false);
      setOurCostManual(false);
      setBuildShorthandManual(false);
    }
  }

  function toggleSimpleOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing?.selected) {
        next.delete(optId);
      } else {
        next.set(optId, { optionId: optId, left: 0, right: 0, selected: true });
      }
      return next;
    });
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function toggleSideOption(optId: string) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId);
      if (existing && (existing.left > 0 || existing.right > 0)) {
        next.delete(optId);
      } else if (!existing) {
        // Default to left side
        next.set(optId, { optionId: optId, left: 1, right: 0, selected: false });
      } else {
        next.delete(optId);
      }
      return next;
    });
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function cycleSide(optId: string, side: "left" | "right", maxPerSide: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(optId) || { optionId: optId, left: 0, right: 0, selected: false };
      const current = side === "left" ? existing.left : existing.right;
      const newVal = current >= maxPerSide ? 0 : current + 1;
      const updated = { ...existing, [side]: newVal };
      if (updated.left === 0 && updated.right === 0) {
        next.delete(optId);
      } else {
        next.set(optId, updated);
      }
      return next;
    });
    setCustomerPriceManual(false);
    setOurCostManual(false);
    setBuildShorthandManual(false);
  }

  function selectPickOne(group: string, optId: string | null) {
    setPickOneSelections((prev) => {
      const next = new Map(prev);
      if (optId) next.set(group, optId);
      else next.delete(group);
      return next;
    });
    // Reset pivot state when Controls selection changes
    if (group === "Controls") {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (!opt || !opt.name.toLowerCase().includes("pivot")) {
        setPivotType("");
        setPivotSide("");
      }
    }
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

  function validate() {
    const e: Record<string, string> = {};
    if (!manufacturerId) e.manufacturer = "Manufacturer is required";
    if (!baseModelId) e.baseModel = "Base model is required";
    if (!buildShorthand.trim()) e.buildShorthand = "Build shorthand is required";
    if (!customerPrice || parseFloat(customerPrice) <= 0) e.customerPrice = "Customer price must be greater than 0";
    if (!ourCost || parseFloat(ourCost) <= 0) e.ourCost = "Our cost must be greater than 0";
    // Pivot validation
    const controlsSelId = pickOneSelections.get("Controls");
    if (controlsSelId) {
      const controlsOpt = optionsQuery.data?.find((o) => o.id === controlsSelId);
      if (controlsOpt?.name.toLowerCase().includes("pivot")) {
        if (!pivotType) e.pivotType = "Select pivot type";
        if (!pivotSide) e.pivotSide = "Select a side";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data: orderNumber, error: rpcError } = await supabase.rpc("generate_order_number");
      if (rpcError) throw rpcError;

      const priceNum = parseFloat(customerPrice);
      const costNum = parseFloat(ourCost);

      const selectedOptionsJson = selectedOptionsList.map((s) => {
        const qty = s.quantity;
        const isPivot = s.pivotType != null;
        return {
          option_id: s.option.id,
          name: s.option.name,
          short_code: s.option.short_code,
          cost_price_each: s.option.cost_price,
          retail_price_each: s.option.retail_price,
          ...(isPivot ? { pivot_type: s.pivotType, side: s.pivotSide } : {
            sides: (() => {
              const parts: string[] = [];
              if (s.left > 0) parts.push(s.left > 1 ? `Left ×${s.left}` : "Left");
              if (s.right > 0) parts.push(s.right > 1 ? `Right ×${s.right}` : "Right");
              return parts.join(", ");
            })(),
          }),
          quantity: qty,
          total_cost: s.option.cost_price * qty,
          total_retail: s.option.retail_price * qty,
          left: s.left,
          right: s.right,
        };
      });

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

  // Option counts for header
  const optionCount = selectedOptionsList.length;
  const optionRetailTotal = selectedOptionsList.reduce((s, { option, quantity }) => s + option.retail_price * quantity, 0);

  // Check if any overhead scales option is selected
  const isOverheadScalesSelected = useMemo(() => {
    const opts = optionsQuery.data || [];
    const scalesOpts = opts.filter((o) =>
      o.option_group === "Scales" && o.name.toLowerCase().includes("overhead")
    );
    return scalesOpts.some((o) => {
      const groupSel = pickOneSelections.get("Scales");
      return groupSel === o.id;
    });
  }, [optionsQuery.data, pickOneSelections]);

  // Find "Pivot on Overhead Scales" option
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

  // Render pick_one group — special case for Controls
  function renderPickOneGroup(group: string, options: FullOption[]) {
    if (group === "Controls") return renderControlsGroup(options);
    const selectedId = pickOneSelections.get(group) || null;
    const hasIncluded = options.some((o) => o.is_included);
    return (
      <div className="space-y-1">
        {!hasIncluded && (
          <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
            <input
              type="radio"
              name={`pickone-${group}`}
              checked={selectedId === null}
              onChange={() => selectPickOne(group, null)}
              className="w-[18px] h-[18px] accent-catl-teal"
            />
            <span className="text-[13px]" style={{ color: "#1A1A1A" }}>None</span>
          </label>
        )}
        {options.map((opt) => {
          const isSelected = selectedId === opt.id;
          return (
            <div key={opt.id}>
              <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
                <input
                  type="radio"
                  name={`pickone-${group}`}
                  checked={isSelected}
                  onChange={() => selectPickOne(group, opt.id)}
                  className="w-[18px] h-[18px] accent-catl-teal"
                />
                <span className="text-[13px] flex-1" style={{ color: "#1A1A1A" }}>
                  {opt.name}{opt.is_included ? " — included" : ""}
                </span>
                {!opt.is_included && (
                  <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>
                )}
              </label>
            </div>
          );
        })}
      </div>
    );
  }

  // Controls group with pivot sub-selections
  function renderControlsGroup(options: FullOption[]) {
    const selectedId = pickOneSelections.get("Controls") || null;
    const hasIncluded = options.some((o) => o.is_included);
    // Filter out "Pivot on Overhead Scales" — it's rendered conditionally below
    const mainOptions = options.filter((o) => !(o.name.toLowerCase().includes("pivot on overhead") || o.name.toLowerCase().includes("pivot overhead")));
    return (
      <div className="space-y-1">
        {hasIncluded ? null : (
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
                <span className="text-[13px] flex-1" style={{ color: "#1A1A1A" }}>
                  {opt.name}{opt.is_included ? " — included" : ""}
                  {isDual ? " (both sides)" : ""}
                </span>
                {!opt.is_included && (
                  <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>
                )}
              </label>
              {/* Pivot sub-selections */}
              {isSelected && isPivot && (
                <div className="ml-[26px] mt-2 mb-2 p-3 rounded-lg border space-y-3" style={{ borderColor: "#D4D4D0" }}>
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>Pivot type:</p>
                    <div className="flex items-center gap-2">
                      <SidePill label="Side-to-Side" active={pivotType === "side_to_side"} onClick={() => setPivotType("side_to_side")} />
                      <SidePill label="Front-to-Back" active={pivotType === "front_to_back"} onClick={() => setPivotType("front_to_back")} />
                    </div>
                    {errors.pivotType && <p className="text-[11px] mt-1" style={{ color: "#D4183D" }}>{errors.pivotType}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>
                      {pivotType === "front_to_back" ? "Mounted on:" : "Dominant side:"}
                    </p>
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
        {/* Pivot on Overhead Scales — only when pivot + overhead scales */}
        {isPivotSelected && isOverheadScalesSelected && pivotOnScalesOption && (
          <div className="mt-2 border-t border-border pt-2">
            <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
              <input
                type="checkbox"
                checked={selections.get(pivotOnScalesOption.id)?.selected ?? false}
                onChange={() => toggleSimpleOption(pivotOnScalesOption.id)}
                className="w-[18px] h-[18px] accent-catl-teal rounded"
              />
              <span className="text-[13px] flex-1" style={{ color: "#1A1A1A" }}>{pivotOnScalesOption.name}</span>
              <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(pivotOnScalesOption.retail_price)}</span>
            </label>
          </div>
        )}
      </div>
    );
  }

  // Render side option
  function renderSideOption(opt: FullOption) {
    const sel = selections.get(opt.id);
    const isChecked = sel && (sel.left > 0 || sel.right > 0);
    const maxSide = opt.max_per_side || 1;
    const leftConflict = getSideConflicts(opt.id, "left");
    const rightConflict = getSideConflicts(opt.id, "right");
    const totalQty = (sel?.left || 0) + (sel?.right || 0);
    const totalPrice = totalQty * opt.retail_price;

    function sideLabel(side: "left" | "right") {
      const val = side === "left" ? sel?.left || 0 : sel?.right || 0;
      const label = side === "left" ? "Left" : "Right";
      if (maxSide > 1 && val > 0) return `${label} ×${val}`;
      return label;
    }

    return (
      <div key={opt.id} className="mb-1">
        <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
          <input
            type="checkbox"
            checked={!!isChecked}
            onChange={() => toggleSideOption(opt.id)}
            className="w-[18px] h-[18px] accent-catl-teal rounded"
          />
          <span className="text-[13px] flex-1" style={{ color: "#1A1A1A" }}>
            {opt.name.replace(/\s*\(per sidegate\)/i, "")}
            {" — "}
            <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)} ea</span>
          </span>
        </label>
        {isChecked && (
          <div className="ml-[26px] mt-1 mb-2 space-y-1">
            <div className="flex items-center gap-2">
              <SidePill
                label={sideLabel("left")}
                active={(sel?.left || 0) > 0}
                disabled={!!leftConflict}
                onClick={() => {
                  if (leftConflict) return;
                  cycleSide(opt.id, "left", maxSide);
                }}
              />
              <SidePill
                label={sideLabel("right")}
                active={(sel?.right || 0) > 0}
                disabled={!!rightConflict}
                onClick={() => {
                  if (rightConflict) return;
                  cycleSide(opt.id, "right", maxSide);
                }}
              />
            </div>
            {totalQty === 0 && (
              <p className="text-[11px]" style={{ color: "#D4183D" }}>Select a side</p>
            )}
            {rightConflict && (
              <p className="text-[11px]" style={{ color: "#D4183D" }}>{rightConflict}</p>
            )}
            {leftConflict && (
              <p className="text-[11px]" style={{ color: "#D4183D" }}>{leftConflict}</p>
            )}
            {totalQty > 0 && (
              <p className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>
                {totalQty} {totalQty === 1 ? "unit" : "units"} · ${fmtCurrency(totalPrice)}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Render simple option
  function renderSimpleOption(opt: FullOption) {
    const isChecked = selections.get(opt.id)?.selected ?? false;
    return (
      <label
        key={opt.id}
        className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]"
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleSimpleOption(opt.id)}
          className="w-[18px] h-[18px] accent-catl-teal rounded"
        />
        <span className="text-[13px] flex-1" style={{ color: "#1A1A1A" }}>{opt.name}</span>
        <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>
      </label>
    );
  }

  // Render a group card
  function renderGroupCard(group: string, options: FullOption[]) {
    // Determine if this is a pick_one group
    const isPick = options.every((o) => o.selection_type === "pick_one");
    const hasSide = options.some((o) => o.selection_type === "side");

    return (
      <div key={group} className="border rounded-lg p-3" style={{ borderColor: "#D4D4D0", background: "#FFFFFF" }}>
        <h4 className="text-[11px] font-bold uppercase mb-2" style={{ color: "#0E2646" }}>{group}</h4>
        {isPick ? (
          renderPickOneGroup(group, options)
        ) : (
          <div className="space-y-0.5">
            {options.map((opt) => {
              if (opt.selection_type === "side") return renderSideOption(opt);
              if (opt.selection_type === "pick_one") {
                // Mixed group with a pick_one item — render as simple for now
                return renderSimpleOption(opt);
              }
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
      const { option, left, right, pivotType: pt, pivotSide: ps } = item;
      let label: string;
      if (pt) {
        // Pivot Controls with detail
        const typeLabel = pt === "side_to_side" ? "Side-to-Side" : pt === "front_to_back" ? "Front-to-Back" : "";
        const parts = [getOptionDisplayName(option.name)];
        if (typeLabel) parts.push(typeLabel);
        if (ps) parts.push(ps);
        label = parts.join(" · ");
      } else if (option.name.toLowerCase().includes("dual control")) {
        label = getOptionDisplayName(option.name);
      } else {
        label = formatOptionPillLabel(option.name, left, right);
      }
      pills.push({ label, variant: qbIds.has(option.id) ? "standard" : "addon" });
    }
    return pills;
  }, [selectedBaseModel, selectedQuickBuild, selectedOptionsList]);

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

        {/* EQUIPMENT */}
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

        {/* OPTIONS */}
        <SectionHeader
          title="Options"
          subtitle={optionCount > 0 ? `${optionCount} selected · $${fmtCurrency(optionRetailTotal)}` : undefined}
        />

        {/* Extended Chute toggle */}
        {extendedChuteOption && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg border" style={{ borderColor: isExtendedSelected ? "#55BAAA" : "#D4D4D0", background: isExtendedSelected ? "rgba(85,186,170,0.06)" : "#FFFFFF" }}>
            <input
              type="checkbox"
              checked={isExtendedSelected}
              onChange={() => toggleSimpleOption(extendedChuteOption.id)}
              className="w-[18px] h-[18px] accent-catl-teal rounded"
            />
            <span className="text-[13px] font-semibold flex-1" style={{ color: "#0E2646" }}>Extended Chute</span>
            <span className="text-xs" style={{ color: "#717182" }}>${fmtCurrency(extendedChuteOption.retail_price)}</span>
          </div>
        )}

        {groupedOptions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupedOptions.map(([group, opts]) => {
              // Don't render extended chute in the grid, it's shown above
              const filtered = opts.filter((o) => o.id !== extendedChuteOption?.id);
              if (filtered.length === 0) return null;
              return renderGroupCard(group, filtered);
            })}
          </div>
        )}

        {/* BUILD SUMMARY */}
        <SectionHeader title="Build Summary" />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {summaryPills.map((pill, i) => (
            <span
              key={i}
              className="px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{
                background: pill.variant === "base" ? "#0E2646" : pill.variant === "standard" ? "rgba(85,186,170,0.15)" : "rgba(243,209,42,0.2)",
                color: pill.variant === "base" ? "#F0F0F0" : pill.variant === "standard" ? "#55BAAA" : "#8B7A1A",
              }}
            >
              {pill.label}
            </span>
          ))}
        </div>

        <FormRow label="Build Short" error={errors.buildShorthand}>
          <input
            value={buildShorthand}
            onChange={(e) => { setBuildShorthand(e.target.value); setBuildShorthandManual(true); }}
            placeholder="Auto-generated from selections"
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card outline-none"
            style={{ fontWeight: buildShorthand ? 500 : 400, color: buildShorthand ? "hsl(168, 37%, 53%)" : undefined }}
          />
        </FormRow>

        {selectedBaseModel && (
          <div className="text-xs space-y-0.5 px-1" style={{ color: "#717182" }}>
            <div>
              Base: ${fmtCurrency(selectedBaseModel.retail_price)}
              {optionCount > 0 && <> + {optionCount} option{optionCount !== 1 ? "s" : ""}: ${fmtCurrency(optionRetailTotal)}</>}
              {" = "}
              <span className="font-semibold text-foreground">${fmtCurrency(calcRetail)}</span>
            </div>
          </div>
        )}

        {/* PRICING */}
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

        {/* TRACKING */}
        <SectionHeader title="Tracking" />

        <FormRow label="CATL #">
          <input value={catl_number} onChange={(e) => setCatlNumber(e.target.value)} placeholder="e.g. CATL-2026-042" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" />
        </FormRow>

        <FormRow label="Serial #">
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Assigned when manufactured" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" />
        </FormRow>

        {/* STATUS */}
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

        {/* CUSTOMER */}
        <SectionHeader title="Customer" />
        <p className="text-xs text-muted-foreground italic -mt-2 mb-3">Optional — can be assigned later</p>

        <FormRow label="Customer">
          <div className="relative">
            <input
              value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); setShowCustomerDropdown(true); }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Search customers..."
              className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none"
            />
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
          <div className="ml-[128px] border border-catl-teal/30 rounded-lg p-3 space-y-2 bg-catl-teal/5">
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

        {/* INVENTORY */}
        <button
          type="button"
          onClick={() => setInventoryOpen(!inventoryOpen)}
          className="-mx-4 mt-6 mb-3 px-4 py-2 flex items-center justify-between w-[calc(100%+2rem)]"
          style={{ background: "#F5F5F0" }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: "#0E2646" }}>Inventory Details</span>
          <ChevronDown size={14} className={cn("transition-transform", inventoryOpen && "rotate-180")} style={{ color: "#717182" }} />
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
                <input value={inventoryLocation} onChange={(e) => setInventoryLocation(e.target.value)} placeholder="e.g. Warehouse Bay 3" className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none" />
              </FormRow>
            )}
          </div>
        )}

        {/* NOTES */}
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
