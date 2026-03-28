import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Plus, ChevronDown } from "lucide-react";
import { format } from "date-fns";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try {
    return format(new Date(d), "MMM d");
  } catch {
    return d;
  }
}

type FilterStatus = "all" | "open" | "sent";

interface CustomerGroup {
  customerId: string | null;
  customerName: string;
  totalValue: number;
  lastActivity: string;
  estimates: any[];
}

export default function Estimates() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["open_estimates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*, customers(*), base_models(name, short_name)")
        .in("status", ["open", "sent"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (filter === "all") return estimates;
    return estimates.filter((e: any) => e.status === filter);
  }, [estimates, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, CustomerGroup>();
    for (const est of filtered) {
      const key = est.customer_id || "__unassigned__";
      const cust = est.customers as any;
      if (!map.has(key)) {
        map.set(key, {
          customerId: est.customer_id,
          customerName: cust?.name || "Unassigned",
          totalValue: 0,
          lastActivity: est.created_at || "",
          estimates: [],
        });
      }
      const group = map.get(key)!;
      group.totalValue += est.total_price || 0;
      if (est.created_at && est.created_at > group.lastActivity) {
        group.lastActivity = est.created_at;
      }
      group.estimates.push(est);
    }
    // Sort: named customers first alphabetically, Unassigned last
    const sorted = Array.from(map.values()).sort((a, b) => {
      if (!a.customerId) return 1;
      if (!b.customerId) return -1;
      return a.customerName.localeCompare(b.customerName);
    });
    return sorted;
  }, [filtered]);

  const toggleCustomer = (key: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalCount = estimates.length;

  const filters: { label: string; value: FilterStatus }[] = [
    { label: "All", value: "all" },
    { label: "Open", value: "open" },
    { label: "Sent", value: "sent" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold" style={{ color: "#0E2646" }}>
            Estimates
          </h1>
          {totalCount > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}
            >
              {totalCount}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate("/orders/new?type=estimate")}
          className="flex items-center gap-1.5 text-[13px] font-bold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
        >
          <Plus size={14} /> New Estimate
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap transition-colors"
            style={
              filter === f.value
                ? { backgroundColor: "#0E2646", color: "#FFFFFF" }
                : { backgroundColor: "rgba(14,38,70,0.06)", color: "#717182" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ borderColor: "#D4D4D0" }}>
              <div className="h-4 w-40 rounded bg-muted mb-2" />
              <div className="h-3 w-60 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Receipt size={48} style={{ color: "#D4D4D0" }} />
          <p className="text-[16px] font-medium mt-4" style={{ color: "#0E2646" }}>
            No open estimates
          </p>
          <p className="text-[13px] mt-1" style={{ color: "#717182" }}>
            Create an estimate when a customer calls for a quote
          </p>
          <button
            onClick={() => navigate("/orders/new?type=estimate")}
            className="flex items-center gap-1.5 text-[13px] font-bold rounded-full px-5 py-2.5 mt-5 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            <Plus size={14} /> New Estimate
          </button>
        </div>
      ) : (
        /* Customer cards */
        <div className="space-y-2">
          {groups.map((group) => {
            const key = group.customerId || "__unassigned__";
            const isExpanded = expandedCustomers.has(key);
            return (
              <div
                key={key}
                className="rounded-xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "0.5px solid #D4D4D0" }}
              >
                {/* Customer header */}
                <button
                  onClick={() => toggleCustomer(key)}
                  className="w-full text-left px-3.5 py-3 flex items-start sm:items-center justify-between gap-2 active:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <span className="text-[14px] font-medium truncate" style={{ color: "#0E2646" }}>
                        {group.customerName}
                      </span>
                      <span className="text-[15px] font-medium sm:hidden" style={{ color: "#0E2646" }}>
                        {fmtCurrency(group.totalValue)}
                      </span>
                    </div>
                    <p className="text-[12px] mt-0.5" style={{ color: "#717182" }}>
                      {group.estimates.length} open estimate{group.estimates.length !== 1 ? "s" : ""} · Last activity{" "}
                      {fmtDate(group.lastActivity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[15px] font-medium hidden sm:block" style={{ color: "#0E2646" }}>
                      {fmtCurrency(group.totalValue)}
                    </span>
                    <ChevronDown
                      size={16}
                      className="transition-transform"
                      style={{
                        color: "#717182",
                        transform: isExpanded ? "rotate(180deg)" : undefined,
                      }}
                    />
                  </div>
                </button>

                {/* Estimate rows */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 space-y-1.5">
                    {group.estimates.map((est: any) => (
                      <EstimateRow key={est.id} estimate={est} navigate={navigate} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EstimateRow({ estimate, navigate }: { estimate: any; navigate: (path: string) => void }) {
  const baseModel = estimate.base_models as any;
  const modelName = baseModel?.name || baseModel?.short_name || estimate.build_shorthand || "Estimate";
  const hasOrder = !!estimate.order_id;

  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "rgba(243,209,42,0.15)", color: "#854F0B", label: "Open" },
    sent: { bg: "rgba(85,186,170,0.1)", color: "#0F6E56", label: "Sent" },
    approved: { bg: "rgba(39,174,96,0.1)", color: "#27AE60", label: "Approved" },
  };
  const status = statusStyles[estimate.status] || statusStyles.open;

  return (
    <button
      onClick={() => {
        if (hasOrder) navigate(`/orders/${estimate.order_id}`);
      }}
      className="w-full text-left rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
      style={{
        background: "#F5F5F0",
        cursor: hasOrder ? "pointer" : "default",
      }}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
          {modelName}
        </p>
        <p className="text-[11px] truncate" style={{ color: "#717182" }}>
          v{estimate.version_number}
          {estimate.label ? ` — ${estimate.label}` : ""}
          {" · "}
          {estimate.status === "sent"
            ? `Sent ${fmtDate(estimate.emailed_at || estimate.created_at)}`
            : `Created ${fmtDate(estimate.created_at)}`}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
          {fmtCurrency(estimate.total_price)}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: status.bg, color: status.color }}
        >
          {status.label}
        </span>
      </div>
    </button>
  );
}
