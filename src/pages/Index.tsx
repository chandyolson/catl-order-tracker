import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardList, Calendar, FileCheck, Plus } from "lucide-react";
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
  const activeOrders = useActiveOrdersCount();
  const eoCounts = useEstimateVsOrderCounts();
  const attentionItems = useAttentionItems();
  const dueThisMonth = useDueThisMonth();
  const readyToInvoice = useReadyToInvoice();
  const recentOrders = useRecentOrders();

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
                          <span className="font-bold text-sm text-catl-navy">{order.order_number}</span>
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
