import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Plus, Search, Trash2, ChevronRight, List, LayoutGrid, Phone, Mail } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

type TabKey = "hot" | "warm" | "cold" | "won" | "all";
type ViewMode = "pipeline" | "list";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "MMM d"); } catch { return d; }
}

function getLeadHeat(est: any): "hot" | "warm" | "cold" | "won" {
  if (est.converted_to_order) return "won";
  const daysSince = differenceInDays(new Date(), new Date(est.created_at));
  const adjusted = est.emailed_at ? daysSince - 2 : daysSince;
  if (adjusted <= 7) return "hot";
  if (adjusted <= 21) return "warm";
  return "cold";
}

function heatConfig(heat: "hot" | "warm" | "cold" | "won") {
  return {
    hot: { color: "#E8503A", bg: "rgba(232,80,58,0.1)", label: "Hot", dot: "#E8503A" },
    warm: { color: "#8B7A0A", bg: "rgba(243,209,42,0.12)", label: "Warm", dot: "#F3D12A" },
    cold: { color: "#717182", bg: "rgba(113,113,130,0.08)", label: "Cold", dot: "#717182" },
    won: { color: "#27AE60", bg: "rgba(39,174,96,0.1)", label: "Won", dot: "#27AE60" },
  }[heat];
}

function daysAgoLabel(iso: string): string {
  const days = differenceInDays(new Date(), new Date(iso));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function Leads() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("hot");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["leads_estimates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*, customers(*), base_models(name, short_name)")
        .in("status", ["open", "sent", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute heat for each estimate
  const withHeat = useMemo(() => estimates.map((e: any) => ({ ...e, heat: getLeadHeat(e) })), [estimates]);

  // Counts
  const counts = useMemo(() => {
    const c = { hot: 0, warm: 0, cold: 0, won: 0, all: 0 };
    for (const e of withHeat) {
      c[e.heat]++;
      c.all++;
    }
    return c;
  }, [withHeat]);

  // Total pipeline value
  const totalValue = useMemo(() => withHeat.reduce((sum: number, e: any) => sum + (e.total_price || 0), 0), [withHeat]);

  // Filter
  const filtered = useMemo(() => {
    let items = tab === "all" ? withHeat : withHeat.filter((e: any) => e.heat === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((e: any) => {
        const custName = (e.customers as any)?.name?.toLowerCase() || "";
        const build = e.build_shorthand?.toLowerCase() || "";
        const estNum = e.estimate_number?.toLowerCase() || "";
        return custName.includes(q) || build.includes(q) || estNum.includes(q);
      });
    }
    return items;
  }, [withHeat, tab, search]);

  const TABS: { key: TabKey; label: string; color: string }[] = [
    { key: "hot", label: "Hot", color: "#E8503A" },
    { key: "warm", label: "Warm", color: "#F3D12A" },
    { key: "cold", label: "Cold", color: "#717182" },
    { key: "won", label: "Won", color: "#27AE60" },
    { key: "all", label: "All", color: "#0E2646" },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F0" }}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#0E2646" }}>Leads</h1>
            <p className="text-sm mt-0.5" style={{ color: "#717182" }}>
              {counts.all} open estimates · {fmtCurrency(totalValue)} pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#D1D1D6" }}>
              <button onClick={() => setViewMode("pipeline")} className="px-2.5 py-2 transition-colors"
                style={{ backgroundColor: viewMode === "pipeline" ? "#0E2646" : "transparent" }}>
                <LayoutGrid size={14} color={viewMode === "pipeline" ? "#F3D12A" : "#717182"} />
              </button>
              <button onClick={() => setViewMode("list")} className="px-2.5 py-2 transition-colors"
                style={{ backgroundColor: viewMode === "list" ? "#0E2646" : "transparent" }}>
                <List size={14} color={viewMode === "list" ? "#F3D12A" : "#717182"} />
              </button>
            </div>
            <button
              onClick={() => navigate("/orders/new?type=estimate")}
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-[0.95] transition-transform shadow-sm"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
            >
              <Plus size={22} />
            </button>
          </div>
        </div>

        {/* Heat pills */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                backgroundColor: tab === t.key ? t.color : "rgba(14,38,70,0.06)",
                color: tab === t.key ? (t.key === "warm" ? "#0E2646" : "#FFFFFF") : t.color,
              }}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#717182" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, build, estimate #…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm bg-white"
            style={{ borderColor: "#D1D1D6", color: "#0E2646" }}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ borderColor: "#D4D4D0" }}>
                <div className="h-4 w-40 rounded bg-muted mb-2" />
                <div className="h-3 w-60 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt size={48} style={{ color: "#D4D4D0" }} />
            <p className="text-base font-medium mt-4" style={{ color: "#0E2646" }}>
              {tab === "all" ? "No open estimates" : `No ${tab} leads`}
            </p>
            <button
              onClick={() => navigate("/orders/new?type=estimate")}
              className="flex items-center gap-1.5 text-sm font-bold rounded-full px-5 py-2.5 mt-5 active:scale-[0.97] transition-transform"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
            >
              <Plus size={14} /> New Estimate
            </button>
          </div>
        ) : viewMode === "list" ? (
          <EstimateListReport estimates={filtered} navigate={navigate} queryClient={queryClient} />
        ) : (
          <PipelineView estimates={filtered} navigate={navigate} queryClient={queryClient} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE VIEW — lead cards with temperature
// ═══════════════════════════════════════════════════════════════

function PipelineView({ estimates, navigate, queryClient }: { estimates: any[]; navigate: any; queryClient: any }) {
  return (
    <div className="space-y-3">
      {estimates.map((est: any) => (
        <LeadCard key={est.id} estimate={est} navigate={navigate} queryClient={queryClient} />
      ))}
    </div>
  );
}

function LeadCard({ estimate, navigate, queryClient }: { estimate: any; navigate: any; queryClient: any }) {
  const [showDelete, setShowDelete] = useState(false);
  const heat = heatConfig(estimate.heat);
  const customer = estimate.customers as any;
  const customerName = customer?.company || customer?.name || "Unassigned";
  const model = (estimate.base_models as any)?.name || estimate.build_shorthand || "Estimate";
  const daysSince = differenceInDays(new Date(), new Date(estimate.created_at));
  const isConverted = estimate.converted_to_order || !!estimate.order_id;
  const displayNumber = estimate.estimate_number || estimate.qb_doc_number;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (estimate.qb_estimate_id) {
        const { data, error } = await supabase.functions.invoke("qb-void-estimate", {
          body: { estimate_id: estimate.id, action: "delete_local_only" },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Delete failed");
      } else {
        const { error } = await supabase.from("estimates").delete().eq("id", estimate.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Estimate deleted");
      queryClient.invalidateQueries({ queryKey: ["leads_estimates"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  return (
    <>
      <div
        className="rounded-xl overflow-hidden bg-white cursor-pointer active:scale-[0.995] transition-transform"
        style={{ border: "0.5px solid #D4D4D0", borderLeft: `4px solid ${heat.dot}` }}
        onClick={() => navigate(`/estimates/${estimate.id}`)}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Heat dot */}
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: heat.dot }} />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold" style={{ color: "#0E2646" }}>{customerName}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: heat.bg, color: heat.color }}>
                {heat.label}
              </span>
              {isConverted && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }}>
                  Ordered
                </span>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "#717182" }}>
              {model}
              {displayNumber ? ` · ${displayNumber}` : ""}
              {" · "}
              {estimate.emailed_at ? "Sent" : "Not sent"}
              {" · "}
              {daysAgoLabel(estimate.created_at)}
            </p>
          </div>

          {/* Right side */}
          <div className="text-right flex-shrink-0">
            <p className="text-[14px] font-bold" style={{ color: "#0E2646" }}>{fmtCurrency(estimate.total_price)}</p>
            <p className="text-[10px]" style={{ color: daysSince > 14 ? "#E8503A" : "#717182" }}>
              {daysSince}d old
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {!isConverted && (
              <button
                onClick={() => navigate(`/estimates/${estimate.id}/convert`)}
                className="text-[10px] font-bold px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
                style={{ backgroundColor: "#0E2646", color: "#F3D12A" }}
              >
                Convert
              </button>
            )}
            {isConverted && estimate.order_id && (
              <button
                onClick={() => navigate(`/orders/${estimate.order_id}`)}
                className="text-[10px] font-bold px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
                style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
              >
                View Order
              </button>
            )}
            <button
              onClick={() => setShowDelete(true)}
              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} style={{ color: "#D4183D" }} />
            </button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete estimate?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {displayNumber ? `Estimate ${displayNumber}` : "This estimate"} — {model} ({fmtCurrency(estimate.total_price)}) will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-sm"
              style={{ backgroundColor: "#D4183D", color: "#FFFFFF" }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// ESTIMATE LIST REPORT — flat sortable list
// ═══════════════════════════════════════════════════════════════

function EstimateListReport({ estimates, navigate, queryClient }: { estimates: any[]; navigate: any; queryClient: any }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
      <div className="hidden sm:grid grid-cols-[1fr_140px_100px_70px_80px_70px] gap-2 px-3 py-2.5" style={{ backgroundColor: "#0E2646" }}>
        {["Customer", "Equipment", "Estimate #", "Status", "Value", "Age"].map(h => (
          <div key={h} className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.6)" }}>{h}</div>
        ))}
      </div>
      {estimates.map((est: any, idx: number) => {
        const customer = est.customers as any;
        const heat = heatConfig(est.heat);
        const model = (est.base_models as any)?.name || est.build_shorthand || "—";
        const daysSince = differenceInDays(new Date(), new Date(est.created_at));

        const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
          open: { bg: "rgba(243,209,42,0.15)", color: "#854F0B", label: "Open" },
          sent: { bg: "rgba(85,186,170,0.1)", color: "#0F6E56", label: "Sent" },
          approved: { bg: "rgba(39,174,96,0.1)", color: "#27AE60", label: "Approved" },
        };
        const status = statusStyles[est.status] || statusStyles.open;

        return (
          <div
            key={est.id}
            onClick={() => navigate(`/estimates/${est.id}`)}
            className="grid grid-cols-1 sm:grid-cols-[1fr_140px_100px_70px_80px_70px] gap-1 sm:gap-2 px-3 py-2.5 border-b items-center cursor-pointer hover:bg-muted/50 transition-colors"
            style={{ borderColor: "rgba(212,212,208,0.5)", backgroundColor: idx % 2 === 1 ? "#FAFAF7" : "#FFFFFF" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: heat.dot }} />
              <span className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                {customer?.company || customer?.name || "Unassigned"}
              </span>
            </div>
            <span className="text-[12px] truncate" style={{ color: "#55BAAA" }}>{model}</span>
            <span className="text-[12px]" style={{ color: "#F3D12A" }}>{est.estimate_number || est.qb_doc_number || "—"}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block w-fit" style={{ backgroundColor: status.bg, color: status.color }}>
              {status.label}
            </span>
            <span className="text-[13px] font-semibold" style={{ color: "#0E2646" }}>{fmtCurrency(est.total_price)}</span>
            <span className="text-[11px]" style={{ color: daysSince > 14 ? "#E8503A" : "#717182" }}>{daysSince}d</span>
          </div>
        );
      })}
    </div>
  );
}
