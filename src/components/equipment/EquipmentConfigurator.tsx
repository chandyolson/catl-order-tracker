import { useState, useMemo, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FullOption, OptionSelection, SelectedOptionItem, CustomLineItem,
  ConfiguratorState, ConfiguratorInitialValues,
  fmtCurrency, CurrencyInput, SidePill, QtyStepper,
} from "./shared";

/* ─── Recommended option IDs (from spec) ─────────────────── */

const RECOMMENDED_OPTION_IDS = new Set([
  "8ae10596-a7f2-4c78-9412-e6f1c43c876c", // HL
  "781cc905-05f0-4537-b2e0-a550275d646e", // DC
  "99ca3ab9-eee2-484b-a8fa-8e24217e9f6b", // WD
  "77e99584-7462-40aa-b8c8-dc071963d0bd", // NA
  "61764474-4f25-43a9-8885-271d3ef4973e", // NB
  "89cc9ae7-32ef-46ac-92f0-4e132c62e696", // HNB
  "639108fc-8857-4428-90bf-c55c7f9493e4", // RH
  "b2a248c9-3d4f-417e-bf8c-16bc53c6627e", // CB-STD
]);

const EXT_OPTION_ID = "67f39bf6-3f61-4529-802c-9f5d4feb4079";

/* ─── Types ──────────────────────────────────────────────── */

export type ConfiguratorHandle = {
  getState: () => ConfiguratorState;
};

type Props = {
  initialValues?: ConfiguratorInitialValues;
  onChange?: (state: ConfiguratorState) => void;
  /** Parent controls the manufacturer — configurator uses this and does not render its own selector */
  manufacturerId?: string;
  /** Legacy override — kept for backward compat */
  manufacturerIdOverride?: string;
  /** Optional controlled tax values set by parent when customer is selected */
  taxStateOverride?: string;
  taxRateOverride?: number;
};

/* ─── Component ──────────────────────────────────────────── */

const EquipmentConfigurator = forwardRef<ConfiguratorHandle, Props>(function EquipmentConfigurator(
  { initialValues, onChange, manufacturerId: manufacturerIdProp, manufacturerIdOverride, taxStateOverride, taxRateOverride },
  ref
) {
  /* ── State ──────────────────────────────────────────────── */
  const [manufacturerId, setManufacturerId] = useState(initialValues?.manufacturerId || "");
  const [baseModelId, setBaseModelId] = useState(initialValues?.baseModelId || "");
  const [quickBuildId, setQuickBuildId] = useState(initialValues?.quickBuildId || "");
  const [selections, setSelections] = useState<Map<string, OptionSelection>>(new Map());
  const [pickOneSelections, setPickOneSelections] = useState<Map<string, string>>(new Map());
  const [buildShorthand, setBuildShorthand] = useState(initialValues?.buildShorthand || "");
  const [buildShorthandManual, setBuildShorthandManual] = useState(!!initialValues?.buildShorthand);
  const [discountType, setDiscountType] = useState<"$" | "%">(initialValues?.discountType || "$");
  const [discountAmount, setDiscountAmount] = useState(initialValues?.discountAmount || "");
  const [freightEstimate, setFreightEstimate] = useState(initialValues?.freightEstimate || "");
  const [customLineItems, setCustomLineItems] = useState<CustomLineItem[]>(initialValues?.customLineItems || []);
  const [taxState, setTaxState] = useState(initialValues?.taxState || "");
  const [taxRate, setTaxRate] = useState(initialValues?.taxRate || 0);
  const [pivotSide, setPivotSide] = useState<"Left" | "Right" | "">("");
  const [pivotType, setPivotType] = useState<"side_to_side" | "front_to_back" | "">("");
  const [dualChecked, setDualChecked] = useState(false);
  const [pivotChecked, setPivotChecked] = useState(false);
  const [controlsSide, setControlsSide] = useState<"left" | "right" | "">(initialValues?.controlsSide || "left");
  const [initialized, setInitialized] = useState(!initialValues?.selectedOptions);
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    recommended: false,
    all_options: false,
    custom: false,
  });

  /* ── Queries ────────────────────────────────────────────── */
  const effectiveManufacturerId = manufacturerIdProp || manufacturerIdOverride || manufacturerId;

  /* Sync tax override from parent (e.g. when customer state changes) */
  useEffect(() => {
    if (taxStateOverride !== undefined) setTaxState(taxStateOverride);
  }, [taxStateOverride]);
  useEffect(() => {
    if (taxRateOverride !== undefined) setTaxRate(taxRateOverride);
  }, [taxRateOverride]);

  const manufacturersQuery = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const baseModelsQuery = useQuery({
    queryKey: ["base_models", effectiveManufacturerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("base_models").select("*")
        .eq("manufacturer_id", effectiveManufacturerId).eq("is_active", true)
        .order("sort_order").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveManufacturerId,
  });

  const quickBuildsQuery = useQuery({
    queryKey: ["quick_builds", effectiveManufacturerId],
    queryFn: async () => {
      if (!baseModelsQuery.data) return [];
      const ids = baseModelsQuery.data.map((m) => m.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("quick_builds").select("*")
        .or(`base_model_id.in.(${ids.join(",")}),base_model_id.is.null`)
        .eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!baseModelsQuery.data && baseModelsQuery.data.length > 0,
  });

  const optionsQuery = useQuery({
    queryKey: ["model_options_full", effectiveManufacturerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_options")
        .select("id, name, display_name, short_code, option_group, retail_price, cost_price, selection_type, allows_quantity, max_per_side, requires_extended, requires_options, conflicts_with, model_restriction, is_upgrade_of, is_included, sort_order")
        .eq("manufacturer_id", effectiveManufacturerId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }).order("display_name", { ascending: true });
      if (error) throw error;
      return data as FullOption[];
    },
    enabled: !!effectiveManufacturerId,
  });

  /* ── Auto-select Moly manufacturer ─────────────────────── */
  useEffect(() => {
    if (manufacturerIdOverride) return;
    if (manufacturersQuery.data && !manufacturerId && !initialValues?.manufacturerId) {
      const moly = manufacturersQuery.data.find(
        (m) => m.short_name?.toLowerCase().includes("moly") || m.name?.toLowerCase().includes("moly")
      );
      if (moly) setManufacturerId(moly.id);
      else if (manufacturersQuery.data.length > 0) setManufacturerId(manufacturersQuery.data[0].id);
    }
  }, [manufacturersQuery.data, manufacturerIdOverride]);

  /* ── Initialize from saved options (edit mode) ─────────── */
  useEffect(() => {
    if (initialized || !initialValues?.selectedOptions || !optionsQuery.data) return;
    const savedOpts = initialValues.selectedOptions;
    const allOpts = optionsQuery.data;
    const newSel = new Map<string, OptionSelection>();
    const newPickOne = new Map<string, string>();

    for (const saved of savedOpts) {
      if (saved.is_custom) continue;
      const opt = allOpts.find((o) => o.id === saved.option_id);
      if (!opt) continue;
      if (opt.short_code === "DC") { setDualChecked(true); continue; }
      if (opt.short_code === "PC" || opt.short_code === "PC-FB") {
        setPivotChecked(true);
        setPivotType(saved.pivot_type || (opt.short_code === "PC-FB" ? "front_to_back" : "side_to_side"));
        setPivotSide(saved.side || "");
        continue;
      }
      if (opt.selection_type === "pick_one") {
        newPickOne.set(opt.option_group || "", opt.id);
      } else {
        newSel.set(opt.id, {
          optionId: opt.id,
          left: saved.left_qty || saved.left || 0,
          right: saved.right_qty || saved.right || 0,
          selected: true,
          quantity: saved.quantity || 1,
        });
      }
    }
    setSelections(newSel);
    setPickOneSelections(newPickOne);
    setInitialized(true);
  }, [initialized, initialValues?.selectedOptions, optionsQuery.data]);

  /* ── Clear controlsSide when Dual is selected (both sides) ── */
  useEffect(() => {
    if (dualChecked && controlsSide) setControlsSide("");
    if (!dualChecked && !controlsSide) setControlsSide("left");
  }, [dualChecked]);

  /* ── Derived state ─────────────────────────────────────── */
  const selectedManufacturer = manufacturersQuery.data?.find((m) => m.id === effectiveManufacturerId);
  const selectedBaseModel = baseModelsQuery.data?.find((m) => m.id === baseModelId);
  const selectedQuickBuild = quickBuildsQuery.data?.find((q) => q.id === quickBuildId);
  const isMoly = selectedManufacturer?.name?.toLowerCase().includes("moly") || selectedManufacturer?.short_name?.toLowerCase().includes("moly");

  const extendedChuteOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.id === EXT_OPTION_ID || o.short_code.toLowerCase() === "ext" || o.name.toLowerCase().includes("extended chute")),
    [optionsQuery.data]
  );
  const isExtendedSelected = extendedChuteOption ? (selections.get(extendedChuteOption.id)?.selected ?? false) : false;

  const isExtendedVariant = (opt: FullOption) => /\(ext(ended)?\)/i.test(opt.name) || opt.requires_extended;
  const isCarrierOption = (opt: FullOption) => (opt.option_group || "").toLowerCase() === "carrier" || opt.name.toLowerCase().includes("carrier");
  const isScalesOption = (opt: FullOption) => (opt.option_group || "").toLowerCase() === "scales" || opt.name.toLowerCase().includes("scales");
  const isStandardCarrierOrScales = (opt: FullOption) => (isCarrierOption(opt) || isScalesOption(opt)) && !isExtendedVariant(opt);
  const isExtendedCarrierOrScales = (opt: FullOption) => (isCarrierOption(opt) || isScalesOption(opt)) && isExtendedVariant(opt);
  const isQuantityOnlyOption = (opt: FullOption) => opt.allows_quantity && opt.selection_type !== "side";

  const visibleOptions = useMemo(() => {
    if (!optionsQuery.data) return [];
    return optionsQuery.data.filter((opt) => {
      if (opt.model_restriction?.length && selectedBaseModel) {
        if (!opt.model_restriction.includes(selectedBaseModel.short_name)) return false;
      }
      if (isExtendedSelected) { if (isStandardCarrierOrScales(opt)) return false; }
      else { if (isExtendedCarrierOrScales(opt)) return false; }
      if (opt.requires_extended && !isExtendedSelected && !isCarrierOption(opt) && !isScalesOption(opt)) return false;
      if (opt.requires_options?.length) {
        const anySelected = opt.requires_options.some((reqCode) => {
          const matchOpt = optionsQuery.data?.find((o) => o.short_code === reqCode || o.id === reqCode);
          if (!matchOpt) return false;
          const sel = selections.get(matchOpt.id);
          if (sel && (sel.selected || sel.left > 0 || sel.right > 0)) return true;
          for (const [, selId] of pickOneSelections) { if (selId === matchOpt.id) return true; }
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
    const groups = new Map<string, FullOption[]>();
    for (const opt of visibleOptions) {
      if (isMoly && RECOMMENDED_OPTION_IDS.has(opt.id) && opt.id !== extendedChuteOption?.id) continue;
      const g = opt.option_group || "Misc";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return Array.from(groups.entries());
  }, [visibleOptions, isMoly, extendedChuteOption]);

  /* ── Selected options list ─────────────────────────────── */
  const selectedOptionsList = useMemo(() => {
    const result: SelectedOptionItem[] = [];
    for (const [group, optId] of pickOneSelections) {
      if (group.toLowerCase() === "controls") continue;
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (opt && opt.is_included !== true) result.push({ option: opt, quantity: 1, left: 0, right: 0 });
    }
    if (dualChecked) {
      const dcOpt = optionsQuery.data?.find((o) => o.short_code === "DC");
      if (dcOpt) result.push({ option: dcOpt, quantity: 1, left: 0, right: 0 });
    }
    if (pivotChecked) {
      const pcCode = pivotType === "front_to_back" ? "PC-FB" : "PC";
      const pcOpt = optionsQuery.data?.find((o) => o.short_code === pcCode);
      if (pcOpt) result.push({ option: pcOpt, quantity: 1, left: 0, right: 0, pivotType: pivotType || undefined, pivotSide: pivotSide || undefined });
    }
    for (const [optId, sel] of selections) {
      const opt = optionsQuery.data?.find((o) => o.id === optId);
      if (!opt || opt.selection_type === "pick_one") continue;
      const qty = (sel.selected && sel.left === 0 && sel.right === 0) ? (sel.quantity || 1) : sel.left + sel.right;
      if (qty > 0) result.push({ option: opt, quantity: qty, left: sel.left, right: sel.right });
    }
    return result;
  }, [selections, pickOneSelections, optionsQuery.data, pivotSide, pivotType, dualChecked, pivotChecked]);

  /* ── Pricing ───────────────────────────────────────────── */
  const customRetailTotal = customLineItems.reduce((s, c) => s + (parseFloat(c.retail) || 0), 0);
  const customCostTotal = customLineItems.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
  const calcRetail = useMemo(() => {
    let total = selectedBaseModel?.retail_price || 0;
    for (const { option, quantity } of selectedOptionsList) total += option.retail_price * quantity;
    return total + customRetailTotal;
  }, [selectedBaseModel, selectedOptionsList, customRetailTotal]);
  const calcCost = useMemo(() => {
    let total = selectedBaseModel?.cost_price || 0;
    for (const { option, quantity } of selectedOptionsList) total += option.cost_price * quantity;
    return total + customCostTotal;
  }, [selectedBaseModel, selectedOptionsList, customCostTotal]);
  const discountValue = useMemo(() => {
    const amt = parseFloat(discountAmount) || 0;
    if (amt <= 0) return 0;
    return discountType === "%" ? Math.round(calcRetail * amt / 100 * 100) / 100 : amt;
  }, [discountAmount, discountType, calcRetail]);
  const customerPrice = calcRetail - discountValue;
  const ourCost = calcCost;
  const taxAmount = taxRate > 0 ? Math.round(customerPrice * taxRate) / 100 : 0;
  const totalWithTax = customerPrice + taxAmount;
  const margin = useMemo(() => {
    if (customerPrice <= 0 || ourCost <= 0) return null;
    const amount = customerPrice - ourCost;
    return { amount, percent: (amount / customerPrice) * 100 };
  }, [customerPrice, ourCost]);
  const marginColor = margin ? (margin.percent >= 15 ? "#55BAAA" : margin.percent >= 10 ? "#F3D12A" : "#E87461") : undefined;

  /* ── Build shorthand ───────────────────────────────────── */
  useEffect(() => {
    if (buildShorthandManual) return;
    if (!selectedBaseModel) { setBuildShorthand(""); return; }
    const parts: string[] = [];
    const qbIds = new Set(selectedQuickBuild?.included_option_ids || []);
    if (selectedQuickBuild) parts.push(selectedQuickBuild.name);
    else parts.push(selectedBaseModel.short_name);
    for (const { option, left, right, quantity } of selectedOptionsList) {
      if (selectedQuickBuild && qbIds.has(option.id)) continue;
      let code = option.short_code;
      if (left > 0 || right > 0) {
        const sides: string[] = [];
        if (left > 0) sides.push(left > 1 ? `L×${left}` : "L");
        if (right > 0) sides.push(right > 1 ? `R×${right}` : "R");
        code += ` · ${sides.join(", ")}`;
      } else if (quantity > 1) { code += ` ×${quantity}`; }
      parts.push(code);
    }
    setBuildShorthand(parts.join(", "));
  }, [selectedBaseModel, selectedQuickBuild, selectedOptionsList, buildShorthandManual]);

  /* ── Side conflict logic ───────────────────────────────── */
  const getSideConflicts = useCallback((optId: string, side: "left" | "right"): string | null => {
    if (isExtendedSelected) return null;
    const opt = optionsQuery.data?.find((o) => o.id === optId);
    if (!opt) return null;
    const isWTD = opt.short_code === "WD" || opt.name.toLowerCase().includes("walk-through");
    const isSideExit = ["SE", "SSH", "HE"].includes(opt.short_code) ||
      opt.name.toLowerCase().includes("side exit") || opt.name.toLowerCase().includes("slam shut") || opt.name.toLowerCase().includes("hydraulic exit");
    if (isWTD) {
      const exits = optionsQuery.data?.filter((o) => ["SE", "SSH", "HE"].includes(o.short_code) ||
        o.name.toLowerCase().includes("side exit") || o.name.toLowerCase().includes("slam shut") || o.name.toLowerCase().includes("hydraulic exit")) || [];
      for (const ex of exits) {
        const exSel = selections.get(ex.id);
        if (exSel && (side === "left" ? exSel.left : exSel.right) > 0)
          return `${side === "left" ? "Left" : "Right"} blocked — ${ex.display_name || ex.name} on ${side}`;
      }
    }
    if (isSideExit) {
      const wtds = optionsQuery.data?.filter((o) => o.short_code === "WD" || o.name.toLowerCase().includes("walk-through")) || [];
      for (const w of wtds) {
        const wSel = selections.get(w.id);
        if (wSel && (side === "left" ? wSel.left : wSel.right) > 0)
          return `${side === "left" ? "Left" : "Right"} blocked — walk-through door on ${side}`;
      }
    }
    return null;
  }, [isExtendedSelected, optionsQuery.data, selections]);

  /* ── Extended chute toggle effect ──────────────────────── */
  useEffect(() => {
    if (!extendedChuteOption) return;
    const opts = optionsQuery.data || [];
    let changed = false;
    const newSelections = new Map(selections);
    const newPickOne = new Map(pickOneSelections);
    for (const opt of opts) {
      if (isExtendedSelected) {
        if (isStandardCarrierOrScales(opt)) {
          if (newSelections.has(opt.id)) { newSelections.delete(opt.id); changed = true; }
          for (const [group, selId] of newPickOne) { if (selId === opt.id) { newPickOne.delete(group); changed = true; } }
        }
      } else {
        if (isExtendedCarrierOrScales(opt) || opt.requires_extended) {
          if (newSelections.has(opt.id)) { newSelections.delete(opt.id); changed = true; }
          for (const [group, selId] of newPickOne) { if (selId === opt.id) { newPickOne.delete(group); changed = true; } }
        }
      }
    }
    if (changed) {
      setSelections(newSelections);
      setPickOneSelections(newPickOne);
      toast.info(isExtendedSelected ? "Standard carrier/scales removed — select extended versions" : "Extended options removed");
    }
  }, [isExtendedSelected]);

  /* ── Handlers ──────────────────────────────────────────── */
  function handleManufacturerChange(id: string) {
    setManufacturerId(id); setBaseModelId(""); setQuickBuildId("");
    setSelections(new Map()); setPickOneSelections(new Map());
    setPivotSide(""); setPivotType(""); setDualChecked(false); setPivotChecked(false);
    setBuildShorthandManual(false);
  }
  function handleBaseModelChange(id: string) {
    setBaseModelId(id); setSelections(new Map()); setPickOneSelections(new Map());
    setPivotSide(""); setPivotType(""); setDualChecked(false); setPivotChecked(false);
    setQuickBuildId(""); setBuildShorthandManual(false);
  }
  function handleQuickBuildChange(id: string) {
    setQuickBuildId(id);
    if (!id) { setSelections(new Map()); setPickOneSelections(new Map()); return; }
    const qb = quickBuildsQuery.data?.find((q) => q.id === id);
    if (!qb) return;
    if (qb.base_model_id) setBaseModelId(qb.base_model_id);
    const defaults = (qb.default_selections || {}) as Record<string, { left?: number; right?: number; quantity?: number }>;
    const allOpts = optionsQuery.data || [];
    const newSel = new Map<string, OptionSelection>();
    const newPickOne = new Map<string, string>();
    for (const optId of qb.included_option_ids || []) {
      const opt = allOpts.find((o) => o.id === optId);
      const override = defaults[optId];
      if (opt?.selection_type === "pick_one") { newPickOne.set(opt.option_group || "", optId); }
      else if (override) {
        newSel.set(optId, { optionId: optId, left: override.left ?? 0, right: override.right ?? 0, selected: true, quantity: override.quantity ?? (((override.left ?? 0) + (override.right ?? 0)) || 1) });
      } else {
        newSel.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 });
      }
    }
    setSelections(newSel); setPickOneSelections(newPickOne); setBuildShorthandManual(false);
  }
  function toggleSimpleOption(optId: string) {
    setSelections((prev) => { const next = new Map(prev); if (next.get(optId)?.selected) next.delete(optId); else next.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 }); return next; });
    setBuildShorthandManual(false);
  }
  function toggleQuantityOption(optId: string) {
    setSelections((prev) => { const next = new Map(prev); if (next.get(optId)?.selected) next.delete(optId); else next.set(optId, { optionId: optId, left: 0, right: 0, selected: true, quantity: 1 }); return next; });
    setBuildShorthandManual(false);
  }
  function setQuantityOptionQty(optId: string, qty: number) {
    setSelections((prev) => { const next = new Map(prev); const existing = next.get(optId); if (existing) next.set(optId, { ...existing, quantity: qty }); return next; });
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
    setPickOneSelections((prev) => { const next = new Map(prev); if (optId) next.set(group, optId); else next.delete(group); return next; });
    setBuildShorthandManual(false);
  }

  /* ── Overhead scales + pivot ───────────────────────────── */
  const isOverheadScalesSelected = useMemo(() => {
    const opts = optionsQuery.data || [];
    const scalesOpts = opts.filter((o) => (o.option_group || "").toLowerCase() === "scales" && o.name.toLowerCase().includes("overhead"));
    return scalesOpts.some((o) => pickOneSelections.get("scales") === o.id || pickOneSelections.get("Scales") === o.id);
  }, [optionsQuery.data, pickOneSelections]);
  const pivotOnScalesOption = useMemo(() =>
    optionsQuery.data?.find((o) => o.name.toLowerCase().includes("pivot on overhead") || o.name.toLowerCase().includes("pivot overhead")),
    [optionsQuery.data]
  );

  /* ── Expose state to parent ────────────────────────────── */
  const getState = useCallback((): ConfiguratorState => ({
    manufacturerId: effectiveManufacturerId, baseModelId, quickBuildId, buildShorthand,
    selections, pickOneSelections, selectedOptionsList, customLineItems,
    discountType, discountAmount, freightEstimate, taxState, taxRate,
    calcRetail, calcCost, discountValue, customerPrice, ourCost, taxAmount, totalWithTax, margin,
    dualChecked, pivotChecked, pivotType, pivotSide, controlsSide,
  }), [effectiveManufacturerId, baseModelId, quickBuildId, buildShorthand, selections, pickOneSelections, selectedOptionsList, customLineItems, discountType, discountAmount, freightEstimate, taxState, taxRate, calcRetail, calcCost, discountValue, customerPrice, ourCost, taxAmount, totalWithTax, margin, dualChecked, pivotChecked, pivotType, pivotSide, controlsSide]);

  useImperativeHandle(ref, () => ({ getState }), [getState]);
  useEffect(() => { onChange?.(getState()); }, [getState]);

  function toggleSection(key: string) {
    setSectionsOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  /* ══════════════════════════════════════════════════════════
     RENDER HELPERS
     ══════════════════════════════════════════════════════════ */

  function renderSimpleOption(opt: FullOption) {
    const isChecked = selections.get(opt.id)?.selected ?? false;
    const conflictCodes: Record<string, string[]> = { "HR": ["DH"], "DH": ["HR"], "SCB": ["HDCB"], "HDCB": ["SCB"] };
    const conflicting = conflictCodes[opt.short_code];
    const isDisabled = conflicting?.some((code) => { const c = optionsQuery.data?.find((o) => o.short_code === code); return c && selections.get(c.id)?.selected; }) ?? false;
    return (
      <label key={opt.id} className={cn("flex items-center gap-2.5 py-1.5 px-2 rounded-md min-h-[32px]", isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted/50")}>
        <input type="checkbox" checked={isChecked} onChange={() => { if (!isDisabled) toggleSimpleOption(opt.id); }} disabled={isDisabled} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
        <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name}</span>
        {opt.retail_price === 0
          ? <span className="text-xs flex-shrink-0 italic" style={{ color: "#717182" }}>TBD</span>
          : <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)}</span>
        }
      </label>
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
    return (
      <div key={opt.id} className="mb-1 overflow-hidden">
        <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
          <input type="checkbox" checked={isChecked} onChange={() => toggleSideOption(opt.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
          <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{(opt.display_name || opt.name).replace(/\s*\(per sidegate\)/i, "")}</span>
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
                {totalQty > 1 ? `${totalQty} × $${fmtCurrency(opt.retail_price)} = $${fmtCurrency(totalQty * opt.retail_price)}` : `$${fmtCurrency(opt.retail_price)}`}
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
    return (
      <div key={opt.id} className="mb-1 overflow-hidden">
        <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
          <input type="checkbox" checked={isChecked} onChange={() => toggleQuantityOption(opt.id)} className="w-[18px] h-[18px] accent-catl-teal rounded flex-shrink-0" />
          <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{opt.display_name || opt.name}</span>
          <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(opt.retail_price)} ea</span>
        </label>
        {isChecked && (
          <div className="ml-[26px] mt-1 mb-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "#717182", width: 28 }}>Qty:</span>
              <QtyStepper value={qty} min={1} max={maxQty} onChange={(v) => setQuantityOptionQty(opt.id, v)} />
            </div>
            {qty > 1 && <p className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>{qty} × ${fmtCurrency(opt.retail_price)} = ${fmtCurrency(qty * opt.retail_price)}</p>}
          </div>
        )}
      </div>
    );
  }

  function renderPickOneGroup(group: string, options: FullOption[]) {
    if (group.toLowerCase() === "controls") return renderControlsGroup(options);
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
                } else setPivotChecked(true);
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
                </div>
                {pivotType && (
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#717182" }}>{pivotType === "side_to_side" ? "Dominant side:" : "Mounted on:"}</p>
                    <div className="flex items-center gap-2">
                      <SidePill label="Left" active={pivotSide === "Left"} onClick={() => setPivotSide("Left")} />
                      <SidePill label="Right" active={pivotSide === "Right"} onClick={() => setPivotSide("Right")} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {pivotChecked && isOverheadScalesSelected && pivotOnScalesOption && (
          <div className="border-t border-border pt-2">
            <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 min-h-[32px]">
              <input type="checkbox" checked={selections.get(pivotOnScalesOption.id)?.selected ?? false} onChange={() => toggleSimpleOption(pivotOnScalesOption.id)} className="w-[18px] h-[18px] accent-catl-teal rounded" />
              <span className="text-[13px] flex-1 break-words min-w-0" style={{ color: "#1A1A1A" }}>{pivotOnScalesOption.display_name || pivotOnScalesOption.name}</span>
              <span className="text-xs flex-shrink-0" style={{ color: "#717182" }}>${fmtCurrency(pivotOnScalesOption.retail_price)}</span>
            </label>
          </div>
        )}
        {!dualChecked && !pivotChecked && (
          <div className="px-2 space-y-1.5">
            <p className="text-[11px]" style={{ color: "#717182" }}>Standard controls (included).</p>
            <div>
              <p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Controls side:</p>
              <div className="flex items-center gap-2">
                <SidePill label="Left" active={controlsSide === "left"} onClick={() => setControlsSide("left")} />
                <SidePill label="Right" active={controlsSide === "right"} onClick={() => setControlsSide("right")} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderScalesContent(options: FullOption[]) {
    const platforms = options.filter((o) => o.selection_type === "pick_one");
    const indicators = options.filter((o) => o.selection_type !== "pick_one");
    return (
      <>
        {platforms.length > 0 && <div className="mb-2"><p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Platform (pick one):</p>{renderPickOneGroup("Scales", platforms)}</div>}
        {indicators.length > 0 && (
          <div className={platforms.length > 0 ? "pt-2 border-t" : ""} style={platforms.length > 0 ? { borderColor: "#D4D4D0" } : undefined}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "#717182" }}>Indicators (select any):</p>
            <div className="space-y-0.5">{indicators.map((opt) => renderSimpleOption(opt))}</div>
          </div>
        )}
      </>
    );
  }

  function renderGroupContent(group: string, options: FullOption[]) {
    const filtered = options.filter((o) => o.id !== extendedChuteOption?.id);
    if (filtered.length === 0) return null;
    if (group.toLowerCase() === "scales") return renderScalesContent(filtered);
    const isPick = filtered.every((o) => o.selection_type === "pick_one");
    if (isPick) return renderPickOneGroup(group, filtered);
    return (
      <div className="space-y-0.5">
        {filtered.map((opt) => {
          if (opt.selection_type === "side") return renderSideOption(opt);
          if (opt.selection_type === "pick_one") return renderSimpleOption(opt);
          if (isQuantityOnlyOption(opt)) return renderQuantityOption(opt);
          return renderSimpleOption(opt);
        })}
      </div>
    );
  }

  /* ── Recommended option helpers ────────────────────────── */
  function isRecommendedSelected(optId: string, side?: "left" | "right"): boolean {
    if (optId === "781cc905-05f0-4537-b2e0-a550275d646e") return dualChecked;
    const sel = selections.get(optId);
    if (!sel) return false;
    if (side === "left") return sel.left > 0;
    if (side === "right") return sel.right > 0;
    return sel.selected || sel.left > 0 || sel.right > 0;
  }

  function toggleRecommended(optId: string, side?: "left" | "right") {
    if (optId === "781cc905-05f0-4537-b2e0-a550275d646e") { setDualChecked(!dualChecked); return; }
    if (side) {
      const sel = selections.get(optId);
      if (!sel) {
        setSelections(prev => { const next = new Map(prev); next.set(optId, { optionId: optId, left: side === "left" ? 1 : 0, right: side === "right" ? 1 : 0, selected: false, quantity: 0 }); return next; });
      } else { toggleSide(optId, side); }
    } else { toggleSimpleOption(optId); }
  }

  function renderRecommendedCheckmark(optId: string, label: string, side?: "left" | "right") {
    const active = isRecommendedSelected(optId, side);
    const opt = optionsQuery.data?.find((o) => o.id === optId);
    const price = opt?.retail_price || 0;
    return (
      <button type="button" onClick={() => toggleRecommended(optId, side)}
        className="flex items-center gap-2 py-2 px-3 rounded-lg border transition-all w-full text-left"
        style={{ borderColor: active ? "#55BAAA" : "#D4D4D0", background: active ? "rgba(85,186,170,0.06)" : "#FFFFFF" }}>
        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ background: active ? "#55BAAA" : "transparent", border: active ? "none" : "2px solid #D4D4D0" }}>
          {active && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
        <span className="text-[13px] font-medium flex-1" style={{ color: "#0E2646" }}>{label}</span>
        {price > 0 && <span className="text-[11px]" style={{ color: "#717182" }}>${fmtCurrency(price)}</span>}
      </button>
    );
  }

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-3">
      {/* Manufacturer — only shown when no parent is controlling it */}
      {!manufacturerIdProp && !manufacturerIdOverride && (
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: "#D4D4D0" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] mb-2" style={{ color: "#0E2646" }}>Manufacturer</p>
          <select value={effectiveManufacturerId} onChange={(e) => handleManufacturerChange(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2.5 bg-card text-foreground outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25">
            <option value="">Select manufacturer</option>
            {manufacturersQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {/* Model + Length + Quick Build — one card */}
      {effectiveManufacturerId && (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>

          {/* Model row */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Model</span>
            <select value={baseModelId} onChange={(e) => handleBaseModelChange(e.target.value)}
              className="flex-1 border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none text-[15px] focus:border-catl-gold">
              <option value="">Select model</option>
              {baseModelsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name} — ${fmtCurrency(m.retail_price)}</option>)}
            </select>
          </div>

          {/* Extended length (Moly only) */}
          {selectedBaseModel && isMoly && extendedChuteOption && (
            <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Length</span>
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleSimpleOption(extendedChuteOption.id)}>
                <input type="checkbox" checked={isExtendedSelected} readOnly className="w-[16px] h-[16px] accent-catl-teal rounded shrink-0" />
                <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>Extended</span>
                <span className="text-[11px]" style={{ color: "#717182" }}>+${fmtCurrency(extendedChuteOption.retail_price)}</span>
              </div>
            </div>
          )}

          {/* Quick build pills (Moly only) */}
          {selectedBaseModel && isMoly && quickBuildsQuery.data && quickBuildsQuery.data.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0 pt-1" style={{ color: "#717182" }}>Quick build</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleQuickBuildChange("")}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors", !quickBuildId ? "border-catl-teal text-catl-teal" : "border-border text-muted-foreground")}
                  style={!quickBuildId ? { background: "rgba(85,186,170,0.12)" } : undefined}>Custom</button>
                {quickBuildsQuery.data.map((q) => (
                  <button key={q.id} type="button" onClick={() => handleQuickBuildChange(q.id)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors", quickBuildId === q.id ? "border-catl-teal text-catl-teal" : "border-border text-muted-foreground")}
                    style={quickBuildId === q.id ? { background: "rgba(85,186,170,0.12)" } : undefined}>{q.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pricing adjustments */}
      {selectedBaseModel && (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider px-4 py-2" style={{ color: "#717182", borderBottom: "0.5px solid #EBEBEB" }}>Pricing adjustments</p>

          {/* Discount */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Discount</span>
            <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0">
              <button type="button" onClick={() => setDiscountType("$")} className={cn("px-2.5 py-1.5 text-xs font-semibold", discountType === "$" ? "bg-catl-navy text-white" : "text-muted-foreground")}>$</button>
              <button type="button" onClick={() => setDiscountType("%")} className={cn("px-2.5 py-1.5 text-xs font-semibold", discountType === "%" ? "bg-catl-navy text-white" : "text-muted-foreground")}>%</button>
            </div>
            <input type="text" inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0" className="w-24 border border-border rounded-lg px-3 py-1.5 text-[14px] outline-none focus:border-catl-gold" />
          </div>

          {/* Tax */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Tax</span>
            <input type="text" value={taxState} onChange={(e) => setTaxState(e.target.value)} placeholder="State"
              className="w-16 border border-border rounded-lg px-2 py-1.5 text-[14px] outline-none focus:border-catl-gold" />
            <input type="text" inputMode="decimal" value={taxRate ? String(taxRate) : ""} onChange={(e) => setTaxRate(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
              placeholder="0" className="w-16 border border-border rounded-lg px-2 py-1.5 text-[14px] outline-none focus:border-catl-gold" />
            <span className="text-[11px]" style={{ color: "#717182" }}>%</span>
          </div>

          {/* Freight */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide w-20 shrink-0" style={{ color: "#717182" }}>Freight</span>
            <CurrencyInput value={freightEstimate} onChange={setFreightEstimate} placeholder="0" />
          </div>
        </div>
      )}

      {/* Fully itemized pricing table */}
      {selectedBaseModel && (
        <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: "#D4D4D0" }}>
          <div className="px-4 py-3" style={{ background: "#0E2646" }}>
            <div className="flex gap-2.5 mb-3">
              <div className="flex-1 rounded-lg p-3" style={{ background: "rgba(85,186,170,0.12)" }}>
                <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(85,186,170,0.7)" }}>Our cost</p>
                <p className="text-[20px] font-medium" style={{ color: "#55BAAA" }}>${fmtCurrency(ourCost)}</p>
              </div>
              <div className="flex-1 rounded-lg p-3" style={{ background: "rgba(243,209,42,0.08)" }}>
                <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "rgba(243,209,42,0.7)" }}>Customer total</p>
                <p className="text-[20px] font-medium" style={{ color: "#F3D12A" }}>${fmtCurrency(customerPrice + (freightEstimate ? parseFloat(freightEstimate) : 0))}</p>
              </div>
            </div>
            {/* Headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1.5">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(245,245,240,0.35)" }}>Item</span>
              <span className="text-[9px] uppercase tracking-wider text-right" style={{ color: "rgba(85,186,170,0.6)" }}>Cost</span>
              <span className="text-[9px] uppercase tracking-wider text-right" style={{ color: "rgba(245,245,240,0.35)" }}>Retail</span>
            </div>
            <div className="my-1.5" style={{ height: 1, background: "rgba(245,245,240,0.06)" }} />
            {/* Base */}
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "rgba(85,186,170,0.5)" }}>Base model</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1.5">
              <span className="text-[12px] truncate pr-2" style={{ color: "#F5F5F0" }}>{selectedBaseModel.name}</span>
              <span className="text-[12px] text-right" style={{ color: "#55BAAA" }}>${fmtCurrency(selectedBaseModel.cost_price || 0)}</span>
              <span className="text-[12px] text-right" style={{ color: "rgba(245,245,240,0.7)" }}>${fmtCurrency(selectedBaseModel.retail_price)}</span>
            </div>
            {/* Options */}
            {selectedOptionsList.length > 0 && (<>
              <div className="my-1.5" style={{ height: 1, background: "rgba(245,245,240,0.06)" }} />
              <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "rgba(85,186,170,0.5)" }}>Options</p>
              {selectedOptionsList.map(({ option, quantity }, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1">
                  <span className="text-[12px] truncate pr-2" style={{ color: "#F5F5F0" }}>{option.display_name || option.name}{quantity > 1 ? ` ×${quantity}` : ""}</span>
                  <span className="text-[12px] text-right" style={{ color: "#55BAAA" }}>${fmtCurrency(option.cost_price * quantity)}</span>
                  <span className="text-[12px] text-right" style={{ color: "rgba(245,245,240,0.7)" }}>${fmtCurrency(option.retail_price * quantity)}</span>
                </div>
              ))}
            </>)}
            {/* Custom */}
            {customLineItems.filter(c => c.name.trim()).length > 0 && (<>
              <div className="my-1.5" style={{ height: 1, background: "rgba(245,245,240,0.06)" }} />
              <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "rgba(85,186,170,0.5)" }}>Custom items</p>
              {customLineItems.filter(c => c.name.trim()).map((c, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1">
                  <span className="text-[12px] truncate pr-2" style={{ color: "#F5F5F0" }}>{c.name}</span>
                  <span className="text-[12px] text-right" style={{ color: "#55BAAA" }}>${fmtCurrency(parseFloat(c.cost) || 0)}</span>
                  <span className="text-[12px] text-right" style={{ color: "rgba(245,245,240,0.7)" }}>${fmtCurrency(parseFloat(c.retail) || 0)}</span>
                </div>
              ))}
            </>)}
            {/* Discount */}
            {discountValue > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1">
                <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.5)" }}>Discount</span>
                <span className="text-[12px] text-right col-span-2" style={{ color: "#F3D12A" }}>-${fmtCurrency(discountValue)}</span>
              </div>
            )}
            <div className="my-2" style={{ height: 1, background: "rgba(245,245,240,0.1)" }} />
            {/* Subtotals */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1">
              <span className="text-[12px] font-medium" style={{ color: "rgba(245,245,240,0.7)" }}>Subtotals</span>
              <span className="text-[13px] font-medium text-right" style={{ color: "#55BAAA" }}>${fmtCurrency(ourCost)}</span>
              <span className="text-[13px] font-medium text-right" style={{ color: "#F5F5F0" }}>${fmtCurrency(calcRetail)}</span>
            </div>
            {taxRate > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1">
                <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.5)" }}>Tax ({taxState} {taxRate}%)</span>
                <span className="text-[12px] text-right col-span-2" style={{ color: "#F5F5F0" }}>${fmtCurrency(taxAmount)}</span>
              </div>
            )}
            {freightEstimate && parseFloat(freightEstimate) > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px" }} className="mb-1">
                <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.5)" }}>Freight</span>
                <span className="text-[12px] text-right col-span-2" style={{ color: "#F5F5F0" }}>${fmtCurrency(parseFloat(freightEstimate))}</span>
              </div>
            )}
            <div className="my-2" style={{ height: 1, background: "rgba(245,245,240,0.1)" }} />
            <div className="flex justify-between">
              <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.5)" }}>Margin</span>
              <span className="text-[13px] font-medium" style={{ color: marginColor || "#55BAAA" }}>{margin ? `$${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)` : "—"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recommended options (Moly only) — collapsible */}
      {selectedBaseModel && isMoly && (() => {
        const selectedCount = [
          "8ae10596-a7f2-4c78-9412-e6f1c43c876c",
          "54277864-a9e6-4edc-a9fb-9362c16cc1a6",
          "781cc905-05f0-4537-b2e0-a550275d646e",
          "99ca3ab9-eee2-484b-a8fa-8e24217e9f6b",
          "77e99584-7462-40aa-b8c8-dc071963d0bd",
          "61764474-4f25-43a9-8885-271d3ef4973e",
          "89cc9ae7-32ef-46ac-92f0-4e132c62e696",
          "639108fc-8857-4428-90bf-c55c7f9493e4",
          "b2a248c9-3d4f-417e-bf8c-16bc53c6627e",
        ].filter(id => isRecommendedSelected(id)).length;
        const isOpen = sectionsOpen.recommended;
        return (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
            <button type="button" onClick={() => toggleSection("recommended")}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#0E2646" }}>Recommended options</span>
              <div className="flex items-center gap-2">
                {selectedCount > 0 && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#2e7e74" }}>{selectedCount} selected</span>
                )}
                <span className="text-[16px]" style={{ color: "#717182", transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>›</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2" style={{ borderTop: "0.5px solid #EBEBEB" }}>
                <div className="pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("8ae10596-a7f2-4c78-9412-e6f1c43c876c", "Hyd lower squeeze")}
                    {renderRecommendedCheckmark("54277864-a9e6-4edc-a9fb-9362c16cc1a6", "Xtra Power squeeze")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("781cc905-05f0-4537-b2e0-a550275d646e", "Dual controls")}
                    <div />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("99ca3ab9-eee2-484b-a8fa-8e24217e9f6b", "Walk-thru door L", "left")}
                    {renderRecommendedCheckmark("99ca3ab9-eee2-484b-a8fa-8e24217e9f6b", "Walk-thru door R", "right")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("77e99584-7462-40aa-b8c8-dc071963d0bd", "Neck access L", "left")}
                    {renderRecommendedCheckmark("77e99584-7462-40aa-b8c8-dc071963d0bd", "Neck access R", "right")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("61764474-4f25-43a9-8885-271d3ef4973e", "Neckbar L", "left")}
                    {renderRecommendedCheckmark("61764474-4f25-43a9-8885-271d3ef4973e", "Neckbar R", "right")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("89cc9ae7-32ef-46ac-92f0-4e132c62e696", "Neck extenders")}
                    {renderRecommendedCheckmark("639108fc-8857-4428-90bf-c55c7f9493e4", "Rear hookup")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {renderRecommendedCheckmark("b2a248c9-3d4f-417e-bf8c-16bc53c6627e", "Chest bar")}
                    <div />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* All options by group — collapsible */}
      {selectedBaseModel && groupedOptions.length > 0 && (() => {
        const totalSelected = selectedOptionsList.length;
        const isOpen = sectionsOpen.all_options;
        return (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
            <button type="button" onClick={() => toggleSection("all_options")}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#0E2646" }}>All options</span>
              <div className="flex items-center gap-2">
                {totalSelected > 0 && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#2e7e74" }}>{totalSelected} selected</span>
                )}
                <span className="text-[16px]" style={{ color: "#717182", transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>›</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4" style={{ borderTop: "0.5px solid #EBEBEB" }}>
                <div className="space-y-4 pt-3">
                  {groupedOptions.map(([group, opts]) => {
                    const content = renderGroupContent(group, opts);
                    if (!content) return null;
                    return (
                      <div key={group}>
                        <p className="text-[12px] font-bold uppercase tracking-wide mb-2 pb-1 border-b" style={{ color: "#0E2646", borderColor: "#D4D4D0" }}>{group.replace(/[-_]/g, " ")}</p>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Custom line items — collapsible */}
      {selectedBaseModel && (() => {
        const isOpen = sectionsOpen.custom;
        const hasItems = customLineItems.filter(c => c.name.trim()).length > 0;
        return (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
            <button type="button" onClick={() => toggleSection("custom")}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#0E2646" }}>Custom items</span>
              <div className="flex items-center gap-2">
                {hasItems && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#9a7a00" }}>{customLineItems.filter(c => c.name.trim()).length} added</span>
                )}
                <span className="text-[16px]" style={{ color: "#717182", transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>›</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4" style={{ borderTop: "0.5px solid #EBEBEB" }}>
                <div className="flex items-center justify-between mt-3 mb-2">
                  <p className="text-[11px] text-muted-foreground">Spool valves, bottle holders, or any custom-priced item.</p>
                  <button type="button" onClick={() => setCustomLineItems(prev => [...prev, { name: "", retail: "", cost: "" }])}
                    className="text-[11px] font-medium px-2.5 py-0.5 rounded-full active:scale-[0.95] transition-transform shrink-0 ml-2"
                    style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}>+ Add</button>
                </div>
                {customLineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end mb-2">
                    <div className="flex-1">
                      {idx === 0 && <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#717182" }}>Item name</p>}
                      <input value={item.name} onChange={e => setCustomLineItems(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} placeholder="e.g. Additional Spool Valves"
                        className="w-full border border-border rounded px-2 py-1.5 bg-card text-sm outline-none text-[16px] focus:border-catl-gold focus:ring-2 focus:ring-catl-gold/25" />
                    </div>
                    <div style={{ width: 90 }}>
                      {idx === 0 && <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#717182" }}>Retail $</p>}
                      <CurrencyInput value={item.retail} onChange={v => setCustomLineItems(prev => prev.map((c, i) => i === idx ? { ...c, retail: v } : c))} placeholder="0" />
                    </div>
                    <div style={{ width: 90 }}>
                      {idx === 0 && <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#717182" }}>Cost $</p>}
                      <CurrencyInput value={item.cost} onChange={v => setCustomLineItems(prev => prev.map((c, i) => i === idx ? { ...c, cost: v } : c))} placeholder="0" />
                    </div>
                    <button type="button" onClick={() => setCustomLineItems(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0 mb-0.5">
                      <Trash2 size={14} style={{ color: "#D4183D" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
});

export default EquipmentConfigurator;
