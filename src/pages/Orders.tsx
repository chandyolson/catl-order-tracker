import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Package, FileText } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import NewOrderPicker from "@/components/NewOrderPicker";
import { formatSavedOptionPill } from "@/lib/optionDisplay";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "estimate", label: "Estimate" },
  { value: "purchase_order", label: "Purchase order" },
  { value: "order_pending", label: "Order pending" },
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

const PAGE_SIZE = 20;

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "MMM d"); } catch { return d; }
}

export default function Orders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mfgFilter, setMfgFilter] = useState("all");
  const [sortIdx, setSortIdx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const mfgQuery = useQuery({
    queryKey: ["manufacturers_filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("id, name, short_name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Paperwork counts per order
  const paperworkQuery = useQuery({
    queryKey: ["paperwork_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("paperwork").select("order_id, status");
      if (error) throw error;
      const map: Record<string, { total: number; complete: number }> = {};
      (data || []).forEach((p: any) => {
        if (!p.order_id) return;
        if (!map[p.order_id]) map[p.order_id] = { total: 0, complete: 0 };
        map[p.order_id].total++;
        if (p.status === "complete") map[p.order_id].complete++;
      });
      return map;
    },
  });

  const sort = SORTS[sortIdx];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["orders-list", debouncedSearch, statusFilter, mfgFilter, sortIdx],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("orders")
        .select("*, customers(name), manufacturers(name, short_name), order_documents(id)", { count: "exact" });

      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`;
        query = query.or(`order_number.ilike.${s},build_shorthand.ilike.${s},customers.name.ilike.${s},contract_name.ilike.${s},moly_contract_number.ilike.${s}`);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (mfgFilter !== "all") {
        query = query.eq("manufacturer_id", mfgFilter);
      }

      if ((sort as any).isCustomer) {
        query = query.order("customers(name)", { ascending: sort.asc });
      } else {
        query = query.order(sort.col, { ascending: sort.asc, nullsFirst: false });
      }

      const from = pageParam * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0, page: pageParam };
    },
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.page + 1) * PAGE_SIZE;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 0,
  });

  const allOrders = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);
  const totalCount = data?.pages[0]?.total ?? 0;
  const paperworkMap = paperworkQuery.data ?? {};

  return (
    <div className="max-w-3xl mx-auto pb-24 overflow-x-hidden space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-bold text-foreground">Orders</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{totalCount} total</span>
          <button
            onClick={() => setShowPicker(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-[0.95] transition-transform"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 border border-border rounded-lg bg-card px-3 py-2">
        <Search size={16} className="text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, customer, or build…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {/* Filters & Sort */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-lg bg-card px-3 py-2 text-sm outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={mfgFilter}
          onChange={(e) => setMfgFilter(e.target.value)}
          className="border border-border rounded-lg bg-card px-3 py-2 text-sm outline-none"
        >
          <option value="all">All Manufacturers</option>
          {(mfgQuery.data || []).map((m: any) => (
            <option key={m.id} value={m.id}>{m.short_name || m.name}</option>
          ))}
        </select>
        <select
          value={sortIdx}
          onChange={(e) => setSortIdx(Number(e.target.value))}
          className="border border-border rounded-lg bg-card px-3 py-2 text-sm outline-none ml-auto"
        >
          {SORTS.map((s, i) => (
            <option key={i} value={i}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Order Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : allOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Package size={48} className="text-border mb-4" />
          <p className="text-base font-medium text-muted-foreground mb-4">No orders yet</p>
          <button
            onClick={() => setShowPicker(true)}
            className="px-6 py-3 rounded-full font-bold text-sm active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            Create your first order
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {allOrders.map((order) => {
            const customer = order.customers as any;
            const manufacturer = order.manufacturers as any;
            const pw = paperworkMap[order.id];
            const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];
            const docCount = Array.isArray((order as any).order_documents) ? (order as any).order_documents.length : 0;
            const margin = order.customer_price && order.our_cost
              ? { amount: order.customer_price - order.our_cost, percent: ((order.customer_price - order.our_cost) / order.customer_price) * 100 }
              : null;
            const marginColor = margin
              ? margin.percent >= 15 ? "#27AE60" : margin.percent >= 10 ? "#F3D12A" : "#D4183D"
              : "#717182";

            return (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-border"
              >
                {/* Card Header — Navy */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#0E2646" }}>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-[14px] font-bold" style={{ color: "#F0F0F0" }}>
                      {(order as any).contract_name || order.moly_contract_number || order.order_number || "Unnamed"}
                    </span>
                    {order.moly_contract_number && !(order as any).contract_name && null}
                    {order.moly_contract_number && (order as any).contract_name && (
                      <span className="text-[12px] font-medium" style={{ color: "rgba(240,240,240,0.5)" }}>
                        #{order.moly_contract_number}
                      </span>
                    )}
                    <StatusBadge status={order.status} />
                  </div>
                  {order.customer_price != null && (
                    <span className="text-[17px] font-bold shrink-0" style={{ color: "#F3D12A" }}>
                      {fmtCurrency(order.customer_price)}
                    </span>
                  )}
                </div>

                {/* Card Body — White */}
                <div className="px-4 py-3 bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium text-foreground">
                      {customer?.name || <span className="italic text-muted-foreground">Unassigned</span>}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {order.moly_contract_number && !(order as any).contract_name?.includes(order.moly_contract_number) && (
                        <span className="text-[10px] text-muted-foreground">#{order.moly_contract_number}</span>
                      )}
                      {manufacturer && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
                          {manufacturer.short_name || manufacturer.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[13px]" style={{ color: "#55BAAA" }}>{order.build_shorthand}</p>

                  {/* Option pills */}
                  {options.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {options.map((opt: any, i: number) => {
                        const label = formatSavedOptionPill(opt);
                        if (!label) return null;
                        const isAddon = !opt.is_included;
                        return (
                          <span
                            key={i}
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={
                              isAddon
                                ? { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" }
                                : { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                            }
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Key dates */}
                  <div className="flex gap-4 text-[11px] text-muted-foreground">
                    <span>Ordered: {fmtDate(order.ordered_date)}</span>
                    <span>ETA: {fmtDate(order.est_completion_date)}</span>
                    <span>Delivered: {fmtDate(order.delivered_date)}</span>
                  </div>
                </div>

                {/* Card Footer — Cream */}
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#F5F5F0" }}>
                  <div className="flex items-center gap-3">
                    {/* Margin */}
                    <span className="text-[12px] font-medium" style={{ color: marginColor }}>
                      {margin ? `${margin.percent.toFixed(1)}% · ${fmtCurrency(margin.amount)}` : "No margin"}
                    </span>
                    {/* Source type */}
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={
                        order.source_type === "estimate"
                          ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                          : { backgroundColor: "rgba(243,209,42,0.2)", color: "#8B7A0A" }
                      }
                    >
                      {order.source_type === "estimate" ? "Estimate" : "Direct Order"}
                    </span>
                    {/* Document count */}
                    <span
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={
                        docCount > 0
                          ? { backgroundColor: "rgba(39,174,96,0.12)", color: "#27AE60" }
                          : { backgroundColor: "rgba(212,24,61,0.08)", color: "#D4183D" }
                      }
                    >
                      <FileText size={10} />
                      {docCount > 0 ? `${docCount} doc${docCount !== 1 ? "s" : ""}` : "No docs"}
                    </span>
                  </div>
                  {/* Paperwork indicator */}
                  {pw && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Docs: {pw.complete}/{pw.total}</span>
                      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pw.total > 0 ? (pw.complete / pw.total) * 100 : 0}%`, backgroundColor: "#27AE60" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div className="pt-2 space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Showing {allOrders.length} of {totalCount} orders
            </p>
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
                style={{ color: "#55BAAA" }}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}

      <NewOrderPicker open={showPicker} onClose={() => setShowPicker(false)} />
    </div>
  );
}
