import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Plus, Package, Warehouse, LayoutGrid, List, Columns3,
  CalendarIcon, AlertTriangle, MapPin,
} from "lucide-react";
import { format, differenceInDays, addDays, addMonths } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import StatusBadge from "@/components/StatusBadge";
import NewOrderPicker from "@/components/NewOrderPicker";
import EquipmentMap from "@/components/EquipmentMap";
import { formatSavedOptionPill } from "@/lib/optionDisplay";

// ─── constants ───────────────────────────────────────────────
type TabKey = "all" | "assigned" | "instock" | "onorder" | "delivered";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "instock", label: "In Stock" },
  { key: "onorder", label: "On Order" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "estimate", label: "Estimate" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "order_pending", label: "Order Pending" },
  { value: "building", label: "Building" },
  { value: "ready", label: "Ready" },
  { value: "delivered", label: "Delivered" },
  { value: "closed", label: "Closed" },
];

const SORTS = [
  { label: "Newest first", col: "updated_at", asc: false },
  { label: "ETA soonest", col: "est_completion_date", asc: true },
  { label: "Customer A-Z", col: "customer_name", asc: true, isCustomer: true },
  { label: "Price high-low", col: "customer_price", asc: false },
] as const;

const BOARD_COLUMNS = [
  { status: "estimate", label: "Estimate", bg: "#F5F5F0", color: "#0E2646" },
  { status: "purchase_order", label: "PO", bg: "#55BAAA", color: "#FFFFFF" },
  { status: "order_pending", label: "Pending", bg: "#7B93AD", color: "#FFFFFF" },
  { status: "building", label: "Building", bg: "#0E2646", color: "#F0F0F0" },
  { status: "ready", label: "Ready", bg: "#F3D12A", color: "#0E2646" },
  { status: "delivered", label: "Delivered", bg: "#27AE60", color: "#FFFFFF" },
];

const selectStr = "*, customers(name, address_city, address_state), manufacturers(name, short_name), base_models:base_model_id(name, short_name)";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "MMM d"); } catch { return d; }
}

function etaInfo(eta: string | null | undefined, delivered: string | null | undefined) {
  if (!eta) return { text: "No ETA", overdue: false, days: null };
  const etaDate = new Date(eta + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = differenceInDays(etaDate, today);
  if (delivered) return { text: "Delivered", overdue: false, days: null };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true, days };
  if (days === 0) return { text: "Due today", overdue: false, days: 0 };
  return { text: `${days}d`, overdue: false, days };
}

// ─── main component ──────────────────────────────────────────
export default function Equipment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven state
  const urlTab = (searchParams.get("tab") as TabKey) || "all";
  const urlStatus = searchParams.get("status") || "all";
  const urlMfg = searchParams.get("manufacturer") || "all";

  const [tab, setTab] = useState<TabKey>(urlTab);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [mfgFilter, setMfgFilter] = useState(urlMfg);
  const [sortIdx, setSortIdx] = useState(0);
  const [etaFilter, setEtaFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"card" | "list" | "board" | "map">("card");
  const [showPicker, setShowPicker] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll(ids: string[]) { setSelectedIds(new Set(ids)); }
  function clearSelection() { setSelectedIds(new Set()); setSelectMode(false); }
  async function bulkUpdateStatus(newStatus: string) {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    const { error } = await supabase.from("orders").update({ status: newStatus }).in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else { toast.success(`${selectedIds.size} orders → ${newStatus.replace(/_/g, " ")}`); clearSelection(); queryClient.invalidateQueries({ queryKey: ["equipment_orders"] }); }
    setBulkUpdating(false);
  }
  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} orders? This cannot be undone.`)) return;
    setBulkUpdating(true);
    const { error } = await supabase.from("orders").delete().in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else { toast.success(`${selectedIds.size} orders deleted`); clearSelection(); queryClient.invalidateQueries({ queryKey: ["equipment_orders"] }); }
    setBulkUpdating(false);
  }

  useEffect(() => { setTab((searchParams.get("tab") as TabKey) || "all"); }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const switchTab = useCallback((t: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (t === "all") next.delete("tab"); else next.set("tab", t);
    setSearchParams(next, { replace: true });
    setTab(t);
    setStatusFilter("all");
  }, [searchParams, setSearchParams]);

  // ─── queries ─────────────────────────────────────────────
  const mfgQuery = useQuery({
    queryKey: ["manufacturers_filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("id, name, short_name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["equipment_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(selectStr)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // ─── filtering ───────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = (ordersQuery.data || []) as any[];

    // Tab filter
    switch (tab) {
      case "assigned":
        items = items.filter(o => o.customer_id && ["purchase_order", "order_pending", "building", "ready"].includes(o.status));
        break;
      case "instock":
        items = items.filter(o => !o.customer_id && o.status === "ready");
        break;
      case "onorder":
        items = items.filter(o => !o.customer_id && ["purchase_order", "order_pending", "building"].includes(o.status));
        break;
      case "delivered":
        items = items.filter(o => o.status === "delivered");
        break;
    }

    if (statusFilter !== "all") items = items.filter(o => o.status === statusFilter);
    if (mfgFilter !== "all") items = items.filter(o => o.manufacturer_id === mfgFilter);

    const todayStr = new Date().toISOString().split("T")[0];
    if (etaFilter === "this_week") {
      const end = addDays(new Date(), 7).toISOString().split("T")[0];
      items = items.filter(o => o.est_completion_date && o.est_completion_date >= todayStr && o.est_completion_date <= end);
    } else if (etaFilter === "this_month") {
      const end = addMonths(new Date(), 1).toISOString().split("T")[0];
      items = items.filter(o => o.est_completion_date && o.est_completion_date >= todayStr && o.est_completion_date <= end);
    } else if (etaFilter === "ready") {
      items = items.filter(o => o.status === "ready");
    } else if (etaFilter === "no_eta") {
      items = items.filter(o => !o.est_completion_date);
    }

    if (debouncedSearch.trim()) {
      const s = debouncedSearch.toLowerCase();
      items = items.filter(o =>
        (o.build_shorthand || "").toLowerCase().includes(s) ||
        (o.order_number || "").toLowerCase().includes(s) ||
        (o.serial_number || "").toLowerCase().includes(s) ||
        (o.contract_name || "").toLowerCase().includes(s) ||
        (o.moly_contract_number || "").toLowerCase().includes(s) ||
        ((o.customers as any)?.name || "").toLowerCase().includes(s) ||
        (o.customer_location || "").toLowerCase().includes(s)
      );
    }

    const sort = SORTS[sortIdx];
    items = [...items].sort((a, b) => {
      let aVal: any, bVal: any;
      if ((sort as any).isCustomer) {
        aVal = (a.customers as any)?.name || "";
        bVal = (b.customers as any)?.name || "";
      } else {
        aVal = a[sort.col] ?? "";
        bVal = b[sort.col] ?? "";
      }
      if (aVal < bVal) return sort.asc ? -1 : 1;
      if (aVal > bVal) return sort.asc ? 1 : -1;
      return 0;
    });

    return items;
  }, [ordersQuery.data, tab, statusFilter, mfgFilter, etaFilter, debouncedSearch, sortIdx]);

  // ─── counts ──────────────────────────────────────────────
  const counts = useMemo(() => {
    const all = (ordersQuery.data || []) as any[];
    return {
      all: all.length,
      assigned: all.filter(o => o.customer_id && ["purchase_order", "order_pending", "building", "ready"].includes(o.status)).length,
      instock: all.filter(o => !o.customer_id && o.status === "ready").length,
      onorder: all.filter(o => !o.customer_id && ["purchase_order", "order_pending", "building"].includes(o.status)).length,
      delivered: all.filter(o => o.status === "delivered").length,
    };
  }, [ordersQuery.data]);

  const kpis = useMemo(() => {
    const all = (ordersQuery.data || []) as any[];
    const todayStr = new Date().toISOString().split("T")[0];
    const ready = all.filter(o => o.status === "ready").length;
    const weekEnd = addDays(new Date(), 7).toISOString().split("T")[0];
    const dueWeek = all.filter(o => o.est_completion_date && o.est_completion_date >= todayStr && o.est_completion_date <= weekEnd && o.status !== "delivered").length;
    return { ready, dueWeek };
  }, [ordersQuery.data]);

  const hasActiveFilters = statusFilter !== "all" || mfgFilter !== "all" || etaFilter !== "all" || debouncedSearch.trim();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F0" }}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#0E2646" }}>Equipment</h1>
            <p className="text-sm mt-0.5" style={{ color: "#717182" }}>
              {filtered.length} of {counts.all} orders
              {kpis.ready > 0 && <span style={{ color: "#55BAAA" }}> · {kpis.ready} ready</span>}
              {kpis.dueWeek > 0 && <span style={{ color: "#55BAAA" }}> · {kpis.dueWeek} due this week</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #D1D1D6" }}>
              <button onClick={() => setViewMode("card")} className="px-2.5 py-2 transition-colors"
                style={{ backgroundColor: viewMode === "card" ? "#0E2646" : "transparent" }}>
                <LayoutGrid size={14} color={viewMode === "card" ? "#F3D12A" : "#717182"} />
              </button>
              <button onClick={() => setViewMode("list")} className="px-2.5 py-2 transition-colors"
                style={{ backgroundColor: viewMode === "list" ? "#0E2646" : "transparent" }}>
                <List size={14} color={viewMode === "list" ? "#F3D12A" : "#717182"} />
              </button>
              <button onClick={() => setViewMode("board")} className="px-2.5 py-2 transition-colors"
                style={{ backgroundColor: viewMode === "board" ? "#0E2646" : "transparent" }}>
                <Columns3 size={14} color={viewMode === "board" ? "#F3D12A" : "#717182"} />
              </button>
              <button onClick={() => setViewMode("map")} className="px-2.5 py-2 transition-colors"
                style={{ backgroundColor: viewMode === "map" ? "#0E2646" : "transparent" }}>
                <MapPin size={14} color={viewMode === "map" ? "#F3D12A" : "#717182"} />
              </button>
            </div>
            {(viewMode === "card" || viewMode === "list") && (
              <button onClick={() => { if (selectMode) clearSelection(); else setSelectMode(true); }}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: selectMode ? "#55BAAA" : "transparent", color: selectMode ? "#0E2646" : "#55BAAA", border: selectMode ? "none" : "1px solid #55BAAA" }}>
                {selectMode ? "Done" : "Select"}
              </button>
            )}
            <button onClick={() => setShowPicker(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-[0.95] transition-transform"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* KPI pills */}
        <div className="flex gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "#0E2646" }}>
            {counts.assigned} Assigned
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "#55BAAA" }}>
            {counts.instock} In Stock
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
            {counts.onorder} On Order
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "#27AE60" }}>
            {counts.delivered} Delivered
          </span>
          {kpis.ready > 0 && (
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "#55BAAA" }}>
              {kpis.ready} Ready for Pickup
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid #D1D1D6" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className="flex-1 text-center py-2.5 text-sm font-semibold transition-colors"
              style={{
                color: tab === t.key ? "#0E2646" : "#717182",
                borderBottom: tab === t.key ? "3px solid #F3D12A" : "3px solid transparent",
              }}>
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#717182" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search build, order #, customer, contract…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm bg-white"
              style={{ borderColor: "#D1D1D6", color: "#0E2646" }} />
          </div>
          <select value={mfgFilter} onChange={e => setMfgFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: "#D1D1D6", color: "#0E2646" }}>
            <option value="all">All Manufacturers</option>
            {(mfgQuery.data || []).map((m: any) => (
              <option key={m.id} value={m.id}>{m.short_name || m.name}</option>
            ))}
          </select>
          {tab === "all" && (
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: "#D1D1D6", color: "#0E2646" }}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          <select value={etaFilter} onChange={e => setEtaFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: "#D1D1D6", color: "#0E2646" }}>
            <option value="all">All ETAs</option>
            <option value="this_week">Due this week</option>
            <option value="this_month">Due this month</option>
            <option value="ready">Ready for Pickup</option>
            <option value="no_eta">No ETA</option>
          </select>
          <select value={sortIdx} onChange={e => setSortIdx(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: "#D1D1D6", color: "#0E2646" }}>
            {SORTS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm" style={{ color: "#717182" }}>Filtered:</span>
            {statusFilter !== "all" && (
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: "rgba(85,186,170,0.12)", color: "#2A8A7C" }}>
                {statusFilter.replace(/_/g, " ")}
              </span>
            )}
            {mfgFilter !== "all" && (
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
                {(mfgQuery.data || []).find((m: any) => m.id === mfgFilter)?.short_name || "Mfg"}
              </span>
            )}
            {etaFilter !== "all" && (
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" }}>
                ETA: {etaFilter.replace(/_/g, " ")}
              </span>
            )}
            <button onClick={() => { setStatusFilter("all"); setMfgFilter("all"); setEtaFilter("all"); setSearch(""); }}
              className="text-xs underline" style={{ color: "#717182" }}>Clear</button>
          </div>
        )}

        {/* Content */}
        {viewMode === "map" ? (
          <EquipmentMap />
        ) : ordersQuery.isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-xl bg-white/50 animate-pulse" />)}
          </div>
        ) : viewMode === "board" ? (
          <BoardView orders={filtered} navigate={navigate} queryClient={queryClient} />
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} onOrder={() => setShowPicker(true)} />
        ) : (
          <>
            {/* Select-all row */}
            {selectMode && (
              <div className="flex items-center gap-3 py-2 px-1" style={{ color: "#717182", fontSize: 13 }}>
                <button onClick={() => {
                  const allIds = filtered.map((o: any) => o.id);
                  if (selectedIds.size === allIds.length) clearSelection();
                  else { selectAll(allIds); setSelectMode(true); }
                }}
                  style={{ width: 20, height: 20, borderRadius: 4, border: selectedIds.size === filtered.length && filtered.length > 0 ? "none" : "1.5px solid #D4D4D0",
                    backgroundColor: selectedIds.size === filtered.length && filtered.length > 0 ? "#55BAAA" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  {selectedIds.size === filtered.length && filtered.length > 0 && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
                <span>Select all ({filtered.length})</span>
              </div>
            )}
            {viewMode === "list" ? (
              <ListView orders={filtered} navigate={navigate} selectMode={selectMode} selectedIds={selectedIds} onToggle={toggleSelect} />
            ) : (
              <div className="space-y-3">
                {filtered.map((order: any) => (
                  <EquipmentCard key={order.id} order={order} tab={tab} navigate={navigate} selectMode={selectMode} selected={selectedIds.has(order.id)} onToggle={() => toggleSelect(order.id)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Bulk action bar */}
        {selectMode && selectedIds.size > 0 && (
          <div style={{ position: "sticky", bottom: 16, zIndex: 20, background: "#0E2646", borderRadius: 16, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#F5F5F0", flex: 1 }}>{selectedIds.size} selected</span>
            <div style={{ position: "relative" }}>
              <select
                onChange={(e) => { if (e.target.value) { bulkUpdateStatus(e.target.value); e.target.value = ""; } }}
                disabled={bulkUpdating}
                style={{ fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 20, border: "none", background: "#55BAAA", color: "#0E2646", cursor: "pointer", appearance: "none", paddingRight: 28 }}>
                <option value="">Status ▾</option>
                {STATUS_OPTIONS.filter(s => s.value !== "all").map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button onClick={bulkDelete} disabled={bulkUpdating}
              style={{ fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 20, border: "none", background: "rgba(255,255,255,0.1)", color: "#E87461", cursor: "pointer" }}>
              Delete
            </button>
            <button onClick={clearSelection}
              style={{ background: "transparent", border: "none", color: "rgba(245,245,240,0.5)", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>
              ×
            </button>
          </div>
        )}
      </div>
      <NewOrderPicker open={showPicker} onClose={() => setShowPicker(false)} />
    </div>
  );
}

// ─── equipment card ──────────────────────────────────────────
function EquipmentCard({ order, tab, navigate, selectMode, selected, onToggle }: { order: any; tab: TabKey; navigate: any; selectMode?: boolean; selected?: boolean; onToggle?: () => void }) {
  const custName = (order.customers as any)?.name;
  const mfg = order.manufacturers as any;
  const options = Array.isArray(order.selected_options) ? order.selected_options : [];
  const pills = options.map((o: any) => ({ label: formatSavedOptionPill(o), included: o.is_included })).filter((p: any) => p.label);
  const margin = order.customer_price && order.our_cost
    ? { amount: order.customer_price - order.our_cost, percent: ((order.customer_price - order.our_cost) / order.customer_price) * 100 }
    : null;
  const marginColor = margin ? (margin.percent >= 15 ? "#27AE60" : margin.percent >= 10 ? "#F3D12A" : "#D4183D") : "#717182";
  const etaData = etaInfo(order.est_completion_date, order.delivered_date);

  return (
    <div className="rounded-xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.99] transition-transform flex"
      style={{ border: selected ? "2px solid #55BAAA" : "1px solid #E5E5E0", background: selected ? "rgba(85,186,170,0.03)" : undefined }}
      onClick={() => { if (selectMode) onToggle?.(); else navigate(`/orders/${order.id}`); }}>

      {/* Selection checkbox */}
      {selectMode && (
        <div className="flex items-center pl-3 shrink-0 bg-white" onClick={(e) => { e.stopPropagation(); onToggle?.(); }}>
          <div style={{
            width: 22, height: 22, borderRadius: 4, flexShrink: 0,
            border: selected ? "none" : "1.5px solid #D4D4D0",
            backgroundColor: selected ? "#55BAAA" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            {selected && <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
      {/* Navy header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#0E2646" }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {order.moly_contract_number && (
            <span className="font-bold text-sm" style={{ color: "#F3D12A" }}>{order.moly_contract_number}</span>
          )}
          {order.contract_name && (
            <span className="text-[12px] truncate" style={{ color: "rgba(245,245,240,0.7)" }}>
              {order.contract_name.replace(/^Contract \d+ [–-] /, "")}
            </span>
          )}
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {order.customer_price != null && (
            <span className="font-bold text-sm" style={{ color: "#F3D12A" }}>
              ${Number(order.customer_price).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* White body */}
      <div className="px-4 py-3 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <p className={cn("text-sm", custName ? "font-medium" : "italic")} style={{ color: custName ? "#0E2646" : "#717182" }}>
            {custName || "Unassigned"}
          </p>
          {mfg && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
              {mfg.short_name || mfg.name}
            </span>
          )}
        </div>
        <p className="text-sm font-medium" style={{ color: "#55BAAA" }}>{order.build_shorthand}</p>
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p: any, i: number) => (
              <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={p.included
                  ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                  : { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" }}>
                {p.label}
              </span>
            ))}
          </div>
        )}
        {(order.serial_number || order.inventory_location) && (
          <div className="flex gap-4 text-[11px]" style={{ color: "#717182" }}>
            {order.serial_number && <span>SN: {order.serial_number}</span>}
            {order.inventory_location && <span>Loc: {order.inventory_location}</span>}
          </div>
        )}
      </div>

      {/* Cream footer */}
      <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#F5F5F0" }}>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium" style={{ color: marginColor }}>
            {margin ? `${Math.round(margin.percent)}% · ${fmtCurrency(margin.amount)}` : "No margin"}
          </span>
          <span className={cn("text-[11px] font-medium", etaData.overdue && "font-semibold")}
            style={{ color: etaData.overdue ? "#D4183D" : "#717182" }}>
            {order.est_completion_date ? `ETA: ${fmtDate(order.est_completion_date)}` : "No ETA"}
            {etaData.overdue && ` (${etaData.text})`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={order.source_type === "estimate"
              ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
              : { backgroundColor: "rgba(243,209,42,0.2)", color: "#8B7A0A" }}>
            {order.source_type === "estimate" ? "Estimate" : "Direct"}
          </span>
          {tab === "instock" && !custName && (
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full text-white" style={{ backgroundColor: "#55BAAA" }}>
              Assign →
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── list view ──────────────────────────────────────────────
function ListView({ orders, navigate, selectMode, selectedIds, onToggle }: { orders: any[]; navigate: any; selectMode?: boolean; selectedIds?: Set<string>; onToggle?: (id: string) => void }) {
  const cols = selectMode
    ? "grid-cols-[32px_1.6fr_1fr_1.4fr_90px_70px]"
    : "grid-cols-[1.6fr_1fr_1.4fr_90px_70px]";
  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
      <div className={cn("hidden sm:grid gap-3 px-3 py-2", cols)} style={{ backgroundColor: "#0E2646" }}>
        {selectMode && <div />}
        {["Contract", "Location", "Build", "Status", "ETA"].map(h => (
          <div key={h} className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.6)" }}>{h}</div>
        ))}
      </div>
      {orders.map((order: any, idx: number) => {
        const customer = order.customers as any;
        const mfg = order.manufacturers as any;
        const eta = etaInfo(order.est_completion_date, order.delivered_date);
        const isSelected = selectMode && selectedIds?.has(order.id);
        const location = [customer?.address_city, customer?.address_state].filter(Boolean).join(", ");
        return (
          <div
            key={order.id}
            onClick={() => { if (selectMode) onToggle?.(order.id); else navigate(`/orders/${order.id}`); }}
            className={cn(
              "grid grid-cols-1 sm:gap-3 px-3 items-center cursor-pointer hover:bg-muted/50 transition-colors border-b",
              cols,
              isSelected ? "bg-[rgba(85,186,170,0.04)]" : idx % 2 === 1 ? "bg-[#FAFAF7]" : "bg-white",
              eta.overdue && "ring-1 ring-inset ring-red-300"
            )}
            style={{ borderColor: "rgba(212,212,208,0.5)", minHeight: 48 }}
          >
            {selectMode && (
              <div className="flex items-center justify-center">
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  border: isSelected ? "none" : "1.5px solid #D4D4D0",
                  backgroundColor: isSelected ? "#55BAAA" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSelected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              </div>
            )}
            {/* Contract # + Name — one line, two colors */}
            <div className="min-w-0 py-3 sm:py-0">
              <span className="text-[12px] truncate block leading-snug">
                {order.moly_contract_number && (
                  <span className="font-normal mr-1.5" style={{ color: "#717182" }}>#{order.moly_contract_number}</span>
                )}
                <span className="font-semibold" style={{ color: "#0E2646" }}>
                  {order.contract_name || order.order_number || "—"}
                </span>
              </span>
              <span className="text-[11px] sm:hidden block mt-0.5" style={{ color: "#717182" }}>
                {location || (customer?.name ? customer.name : "No customer")}
              </span>
            </div>
            {/* Location (city, state) + customer name below — desktop */}
            <div className="hidden sm:block min-w-0">
              <span className="text-[12px] truncate block" style={{ color: location ? "#0E2646" : "#717182" }}>
                {location || "—"}
              </span>
              {customer?.name && (
                <span className="text-[10px] truncate block" style={{ color: "#717182" }}>{customer.name}</span>
              )}
            </div>
            {/* Build specs — mfg chip + full shorthand */}
            <div className="hidden sm:flex items-center gap-1.5 min-w-0">
              {mfg && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
                  {mfg.short_name || mfg.name}
                </span>
              )}
              <span className="text-[11px] truncate" style={{ color: "#55BAAA" }}>{order.build_shorthand || "—"}</span>
            </div>
            {/* Status */}
            <div className="hidden sm:block"><StatusBadge status={order.equipment_status || order.status} /></div>
            {/* ETA */}
            <span className={cn("hidden sm:block text-[11px]", eta.overdue ? "font-semibold" : "")} style={{ color: eta.overdue ? "#D4183D" : "#717182" }}>
              {fmtDate(order.est_completion_date)}
            </span>
          </div>
        );
      })}
      {orders.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color: "#717182" }}>No orders match filters.</p>
      )}
    </div>
  );
}

// ─── board view ──────────────────────────────────────────────
function BoardView({ orders, navigate, queryClient }: { orders: any[]; navigate: any; queryClient: any }) {
  return (
    <div className="overflow-x-auto pb-4 -mx-4 px-4">
      <div className="flex gap-3 min-w-max">
        {BOARD_COLUMNS.map(col => {
          const colOrders = orders.filter(o => o.status === col.status);
          return (
            <div key={col.status} className="w-[240px] shrink-0">
              <div className="rounded-t-lg px-3 py-2 flex items-center justify-between" style={{ backgroundColor: col.bg, color: col.color }}>
                <span className="text-[12px] font-bold uppercase tracking-wider">{col.label}</span>
                <span className="text-[12px] font-semibold opacity-70">{colOrders.length}</span>
              </div>
              <div className="space-y-2 pt-2 min-h-[80px]">
                {colOrders.length === 0 && <p className="text-[11px] text-center py-4" style={{ color: "#717182" }}>No orders</p>}
                {colOrders.map(order => (
                  <BoardCard key={order.id} order={order} navigate={navigate} queryClient={queryClient} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ order, navigate, queryClient }: { order: any; navigate: any; queryClient: any }) {
  const customer = order.customers as any;
  const manufacturer = order.manufacturers as any;

  return (
    <div onClick={() => navigate(`/orders/${order.id}`)}
      className="bg-white border rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderColor: "#E5E5E0" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold" style={{ color: "#0E2646" }}>
          {order.moly_contract_number || order.order_number}
        </span>
        {manufacturer && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
            {manufacturer.short_name || manufacturer.name}
          </span>
        )}
      </div>
      <p className="text-[12px] truncate" style={{ color: "#717182" }}>{customer?.name || "Unassigned"}</p>
      <p className="text-[11px] truncate mt-0.5" style={{ color: "#55BAAA" }}>{order.build_shorthand}</p>
      <div className="flex items-center justify-between mt-2">
        <EtaButton order={order} queryClient={queryClient} />
        {order.customer_price != null && (
          <span className="text-[11px] font-bold" style={{ color: "#0E2646" }}>{fmtCurrency(order.customer_price)}</span>
        )}
      </div>
    </div>
  );
}

// ─── ETA button ──────────────────────────────────────────────
function EtaButton({ order, queryClient }: { order: any; queryClient: any }) {
  const [newDate, setNewDate] = useState<Date | undefined>(
    order.est_completion_date ? new Date(order.est_completion_date + "T00:00:00") : undefined
  );
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const eta = etaInfo(order.est_completion_date, order.delivered_date);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!newDate) return;
      const d = format(newDate, "yyyy-MM-dd");
      const { error } = await supabase.from("orders").update({ est_completion_date: d }).eq("id", order.id);
      if (error) throw error;
      await supabase.from("eta_updates").insert({
        order_id: order.id, previous_date: order.est_completion_date || null,
        new_date: d, reason: reason || null, source: "manual",
      });
      await supabase.from("order_timeline").insert({
        order_id: order.id, event_type: "eta_updated", title: "ETA updated",
        description: `${order.est_completion_date ? fmtDate(order.est_completion_date) : "None"} → ${fmtDate(d)}${reason ? `. ${reason}` : ""}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_orders"] });
      setOpen(false); setReason("");
      toast.success("ETA updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("text-[11px] font-medium flex items-center gap-1", eta.overdue && "font-semibold")}
          style={{ color: eta.overdue ? "#D4183D" : "#717182" }} onClick={e => e.stopPropagation()}>
          <CalendarIcon size={11} />
          {order.est_completion_date ? fmtDate(order.est_completion_date) : "Set ETA"}
          {eta.overdue && <AlertTriangle size={10} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={e => e.stopPropagation()}>
        <div className="p-3 space-y-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Current ETA</div>
            <div className="text-[13px] font-medium" style={{ color: "#0E2646" }}>{order.est_completion_date ? fmtDate(order.est_completion_date) : "Not set"}</div>
          </div>
          <Calendar mode="single" selected={newDate} onSelect={setNewDate} className="p-3 pointer-events-auto" />
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none" style={{ borderColor: "#D1D1D6" }} />
          <button onClick={() => updateMutation.mutate()} disabled={!newDate || updateMutation.isPending}
            className="w-full py-2 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
            {updateMutation.isPending ? "Updating…" : "Update ETA"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── empty state ─────────────────────────────────────────────
function EmptyState({ tab, onOrder }: { tab: TabKey; onOrder: () => void }) {
  const msgs: Record<TabKey, string> = {
    all: "No equipment found",
    assigned: "No equipment assigned to customers",
    instock: "No equipment in stock",
    onorder: "No unassigned equipment on order",
    delivered: "No delivered equipment",
  };
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      {tab === "instock" ? <Warehouse size={40} style={{ color: "#717182" }} /> : <Package size={40} style={{ color: "#717182" }} />}
      <p className="text-sm" style={{ color: "#717182" }}>{msgs[tab]}</p>
      {["instock", "onorder", "all"].includes(tab) && (
        <button onClick={onOrder} className="rounded-full px-5 py-2 text-sm font-semibold active:scale-[0.97] transition-transform"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
          Order Equipment
        </button>
      )}
    </div>
  );
}
