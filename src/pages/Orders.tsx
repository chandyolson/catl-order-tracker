import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, AlertTriangle, Package } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import { formatSavedOptionPill } from "@/lib/optionDisplay";

const FILTERS = [
  { label: "All", key: "all", statuses: [] },
  { label: "Estimates", key: "estimates", statuses: ["estimate", "approved"] },
  { label: "Ordered", key: "ordered", statuses: ["ordered", "so_received"] },
  { label: "In Production", key: "production", statuses: ["in_production"] },
  { label: "Ready to Invoice", key: "ready", statuses: ["completed", "freight_arranged", "delivered"] },
  { label: "Closed", key: "closed", statuses: ["invoiced", "paid", "closed"] },
] as const;

const SORTS = [
  { label: "Newest first", col: "updated_at", asc: false, isCustomer: false },
  { label: "Oldest first", col: "updated_at", asc: true, isCustomer: false },
  { label: "Customer A-Z", col: "customer_name", asc: true, isCustomer: true },
  { label: "Price high-low", col: "customer_price", asc: false, isCustomer: false },
] as const;

const PAGE_SIZE = 20;

export default function Orders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortIdx, setSortIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filterStatuses = FILTERS.find((f) => f.key === activeFilter)?.statuses ?? [];
  const sort = SORTS[sortIdx];

  // Attention items lookup
  const attentionQuery = useQuery({
    queryKey: ["attention-items-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attention_items").select("*");
      if (error) throw error;
      const map: Record<string, { title: string; attention_type: string }[]> = {};
      for (const item of data ?? []) {
        if (item.order_id) {
          if (!map[item.order_id]) map[item.order_id] = [];
          map[item.order_id].push({ title: item.title ?? "", attention_type: item.attention_type ?? "" });
        }
      }
      return map;
    },
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["orders-list", debouncedSearch, activeFilter, sortIdx],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("orders")
        .select("*, customers(name, address_city, address_state)", { count: "exact" });

      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`;
        query = query.or(`order_number.ilike.${s},build_shorthand.ilike.${s},customers.name.ilike.${s}`);
      }

      if (filterStatuses.length > 0) {
        query = query.in("status", filterStatuses as unknown as string[]);
      }

      if (sort.isCustomer) {
        query = query.order("customers(name)", { ascending: sort.asc });
      } else {
        query = query.order(sort.col, { ascending: sort.asc, nullsFirst: false });
      }

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

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
  const attentionMap = attentionQuery.data ?? {};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-catl-navy" style={{ letterSpacing: "-0.02em" }}>
          Orders
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{totalCount} total</span>
          <button
            onClick={() => navigate("/orders/new")}
            className="w-10 h-10 rounded-full bg-catl-gold text-catl-navy flex items-center justify-center active:scale-[0.95] transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, order #, or build..."
          className="w-full h-[46px] rounded-full border border-border bg-card pl-11 pr-4 text-foreground outline-none"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 overflow-x-auto py-1 -mx-1 px-1 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === f.key
                ? "bg-catl-gold text-catl-navy font-bold"
                : "bg-card border border-border text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex justify-end">
        <select
          value={sortIdx}
          onChange={(e) => setSortIdx(Number(e.target.value))}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-muted-foreground outline-none"
        >
          {SORTS.map((s, i) => (
            <option key={i} value={i}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Order cards */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : allOrders.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20">
          <Package size={48} className="text-border mb-4" />
          <p className="text-base font-medium text-muted-foreground mb-4">No orders yet</p>
          <button
            onClick={() => navigate("/orders/new")}
            className="px-6 py-3 rounded-full bg-catl-gold text-catl-navy font-bold text-sm active:scale-[0.97] transition-transform"
          >
            Create your first order
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {allOrders.map((order) => {
            const customer = order.customers as { name: string; address_city: string | null; address_state: string | null } | null;
            const alerts = attentionMap[order.id];
            return (
              <button
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="w-full text-left rounded-xl p-3.5 active:scale-[0.98] transition-transform cursor-pointer"
                style={{ backgroundColor: "#0E2646" }}
              >
                {/* Row 1 */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[15px] font-semibold ${customer?.name ? '' : 'italic'}`} style={{ color: customer?.name ? "#F0F0F0" : "#717182" }}>
                    {customer?.name ?? "Unassigned"}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                {/* Row 2 */}
                <p className="text-[13px] font-medium text-catl-teal mt-0.5">{order.build_shorthand}</p>
                {/* Option pills */}
                {Array.isArray(order.selected_options) && (order.selected_options as any[]).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(order.selected_options as any[]).map((opt: any, i: number) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: "rgba(85,186,170,0.15)",
                          color: "#55BAAA",
                        }}
                      >
                        {formatOptionPillLabel(opt.name || opt.short_code || "Option", opt.left || 0, opt.right || 0)}
                      </span>
                    ))}
                  </div>
                )}
                {/* Row 3 */}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs" style={{ color: "rgba(240,240,240,0.45)" }}>
                    {order.order_number}
                    {order.estimate_date && ` · ${format(new Date(order.estimate_date + "T00:00:00"), "MMM d, yyyy")}`}
                  </span>
                  {order.customer_price != null && (
                    <span className="text-[15px] font-semibold" style={{ color: "#F0F0F0" }}>
                      ${Number(order.customer_price).toLocaleString("en-US")}
                    </span>
                  )}
                </div>
                {/* Row 4 - attention */}
                {alerts && alerts.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertTriangle size={14} className="text-catl-gold flex-shrink-0" />
                    <span className="text-xs font-medium text-catl-gold truncate">
                      {alerts[0].title}
                      {alerts.length > 1 && ` +${alerts.length - 1} more`}
                    </span>
                  </div>
                )}
              </button>
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
                className="w-full py-3 rounded-xl border border-border text-catl-teal font-semibold text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
