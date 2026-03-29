import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardList, Calendar, FileCheck, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { attentionConfig } from "@/components/AttentionBadge";
import NewOrderPicker from "@/components/NewOrderPicker";
import {
  useActiveOrdersCount,
  useEstimateVsOrderCounts,
  useAttentionItems,
  useDueThisMonth,
  useReadyToInvoice,
  useRecentOrders,
} from "@/hooks/useDashboardData";

function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  subtitle,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  loading: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-xl p-5 text-white flex items-center gap-4"
      style={{ background: "linear-gradient(135deg, #153566 0%, #0d6b5c 100%)" }}
    >
      <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold">{loading ? "–" : value}</p>
        <p className="text-sm text-white/70">{label}</p>
        {subtitle && <p className="text-[11px] text-white/50 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const activeOrders = useActiveOrdersCount();
  const eoCounts = useEstimateVsOrderCounts();
  const attentionItems = useAttentionItems();
  const dueThisMonth = useDueThisMonth();
  const readyToInvoice = useReadyToInvoice();
  const recentOrders = useRecentOrders();

  // Debounce search
  useState(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  });
  // Actually use useEffect for debounce
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => setDebouncedSearch(val), 300));
  }

  // Search query — searches orders, estimates, and customers
  const searchQuery = useQuery({
    queryKey: ["dashboard-search", debouncedSearch],
    queryFn: async () => {
      const s = `%${debouncedSearch}%`;
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, contract_name, moly_contract_number, build_shorthand, status, customer_price, customers(name)")
        .or(`order_number.ilike.${s},contract_name.ilike.${s},moly_contract_number.ilike.${s},build_shorthand.ilike.${s}`)
        .order("created_at", { ascending: false })
        .limit(5);
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, email, phone, address_city, address_state")
        .or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`)
        .order("name")
        .limit(5);
      const { data: estimates } = await supabase
        .from("estimates")
        .select("id, estimate_number, qb_doc_number, build_shorthand, total_price, status, order_id, customers(name)")
        .or(`estimate_number.ilike.${s},qb_doc_number.ilike.${s},build_shorthand.ilike.${s}`)
        .order("created_at", { ascending: false })
        .limit(5);
      return { orders: orders || [], customers: customers || [], estimates: estimates || [] };
    },
    enabled: debouncedSearch.length >= 2,
  });

  const hasResults = debouncedSearch.length >= 2 && searchQuery.data;
  const totalResults = hasResults
    ? (searchQuery.data.orders.length + searchQuery.data.customers.length + searchQuery.data.estimates.length)
    : 0;

  const attentionCount = attentionItems.data?.length ?? 0;
  const estCount = eoCounts.data?.estimates ?? 0;
  const ordCount = eoCounts.data?.orders ?? 0;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <button
          onClick={() => setShowPicker(true)}
          className="w-10 h-10 rounded-full bg-catl-gold text-catl-navy flex items-center justify-center active:scale-[0.95] transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <div className="flex items-center border border-border rounded-xl bg-card overflow-hidden focus-within:ring-2 focus-within:ring-catl-gold/25 focus-within:border-catl-gold">
          <Search size={18} className="ml-3 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search orders, estimates, customers..."
            className="w-full px-3 py-3 bg-transparent outline-none text-[16px] text-foreground placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => { setSearch(""); setDebouncedSearch(""); }} className="pr-3 text-muted-foreground hover:text-foreground text-sm">
              ✕
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {hasResults && totalResults > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-[400px] overflow-y-auto">
            {searchQuery.data!.orders.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold px-3 pt-3 pb-1" style={{ color: "#717182" }}>Orders</p>
                {searchQuery.data!.orders.map((o: any) => (
                  <button key={o.id} onClick={() => { navigate(`/orders/${o.id}`); setSearch(""); setDebouncedSearch(""); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">{o.contract_name || o.moly_contract_number || o.order_number || "Unnamed"}</span>
                      {o.moly_contract_number && o.contract_name && (
                        <span className="text-xs text-muted-foreground ml-2">#{o.moly_contract_number}</span>
                      )}
                      <StatusBadge status={o.status} />
                      {o.customers?.name && <span className="text-xs text-muted-foreground ml-2">{o.customers.name}</span>}
                    </div>
                    {o.customer_price != null && (
                      <span className="text-sm font-bold shrink-0" style={{ color: "#F3D12A" }}>
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(o.customer_price)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {searchQuery.data!.estimates.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold px-3 pt-3 pb-1" style={{ color: "#717182" }}>Estimates</p>
                {searchQuery.data!.estimates.map((e: any) => (
                  <button key={e.id} onClick={() => { if (e.order_id) navigate(`/orders/${e.order_id}`); setSearch(""); setDebouncedSearch(""); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-bold" style={{ color: "#F3D12A" }}>{e.estimate_number || e.qb_doc_number || "—"}</span>
                      <span className="text-xs text-muted-foreground ml-2">{e.build_shorthand}</span>
                      {e.customers?.name && <span className="text-xs text-muted-foreground ml-2">· {e.customers.name}</span>}
                    </div>
                    {e.total_price != null && (
                      <span className="text-sm font-medium shrink-0 text-foreground">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(e.total_price)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {searchQuery.data!.customers.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold px-3 pt-3 pb-1" style={{ color: "#717182" }}>Customers</p>
                {searchQuery.data!.customers.map((c: any) => (
                  <button key={c.id} onClick={() => { navigate(`/customers/${c.id}`); setSearch(""); setDebouncedSearch(""); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50">
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                    {c.address_city && <span className="text-xs text-muted-foreground ml-2">{c.address_city}, {c.address_state}</span>}
                    {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {hasResults && totalResults === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-50 px-4 py-3">
            <p className="text-sm text-muted-foreground">No results for "{debouncedSearch}"</p>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active"
          value={activeOrders.data ?? 0}
          icon={ClipboardList}
          loading={activeOrders.isLoading}
          subtitle={!activeOrders.isLoading && !eoCounts.isLoading ? `${estCount} estimates · ${ordCount} orders` : undefined}
        />
        <KpiCard label="Needs Attention" value={attentionCount} icon={AlertTriangle} loading={attentionItems.isLoading} />
        <KpiCard label="Due This Month" value={dueThisMonth.data ?? 0} icon={Calendar} loading={dueThisMonth.isLoading} />
        <KpiCard label="Ready to Invoice" value={readyToInvoice.data ?? 0} icon={FileCheck} loading={readyToInvoice.isLoading} />
      </div>

      {/* Attention banner */}
      {attentionCount > 0 && (
        <div className="bg-catl-red/10 border border-catl-red/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-catl-red" />
            <span className="font-bold text-catl-red text-sm">
              {attentionCount} item{attentionCount !== 1 ? "s" : ""} need attention
            </span>
          </div>
          <div className="space-y-2">
            {attentionItems.data?.map((item) => {
              const config = attentionConfig[item.attention_type ?? ""] ?? attentionConfig.pending_approval;
              return (
                <button
                  key={`${item.order_id}-${item.attention_type}`}
                  onClick={() => item.order_id && navigate(`/orders/${item.order_id}`)}
                  className={`w-full text-left rounded-lg border-l-4 ${config.border} bg-card p-3 hover:shadow-sm transition-shadow`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-foreground">{item.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{item.order_number}</span>
                    </div>
                    <span className={`text-xs font-semibold capitalize ${config.text}`}>
                      {item.attention_type?.replace(/_/g, " ")}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Recent Orders</h2>
          <button
            onClick={() => navigate("/orders")}
            className="text-sm font-semibold text-catl-teal hover:underline"
          >
            View All
          </button>
        </div>
        <div className="space-y-3">
          {recentOrders.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
              ))
            : recentOrders.data?.map((order) => {
                const customer = order.customers as { name: string; address_city: string | null; address_state: string | null } | null;
                return (
                  <button
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="w-full text-left rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-catl-navy">{(order as any).contract_name || order.moly_contract_number || order.order_number || "Unnamed"}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-sm font-medium text-catl-teal mt-1 truncate">{order.build_shorthand}</p>
                        {customer && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {customer.name}
                            {customer.address_city && ` · ${customer.address_city}, ${customer.address_state ?? ""}`}
                          </p>
                        )}
                      </div>
                      {order.customer_price != null && (
                        <span className="text-sm font-bold text-foreground flex-shrink-0">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(order.customer_price)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
        </div>
      </div>

      <NewOrderPicker open={showPicker} onClose={() => setShowPicker(false)} />
    </div>
  );
}
