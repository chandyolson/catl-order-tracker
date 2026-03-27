import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { Search, CheckCircle, XCircle, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const DOC_NAMES: Record<string, string> = {
  customer_estimate_signed: "Signed Estimate",
  customer_deposit: "Deposit Received",
  customer_invoice_sent: "Invoice Sent",
  customer_payment_final: "Final Payment",
  vendor_po_signed: "PO Submitted",
  vendor_so_received: "SO Received",
  vendor_invoice_filed: "Vendor Invoice Filed",
  vendor_bill_entered: "Bill Entered in QB",
};

const STATUS_PRIORITY: Record<string, number> = { missing: 0, pending: 1, blocked: 2, complete: 3 };

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  missing: { bg: "rgba(212,24,61,0.1)", color: "#D4183D", label: "Missing" },
  pending: { bg: "rgba(243,209,42,0.15)", color: "#8B7A0A", label: "Pending" },
  blocked: { bg: "rgba(113,113,130,0.1)", color: "#717182", label: "Blocked" },
  complete: { bg: "rgba(39,174,96,0.1)", color: "#27AE60", label: "Complete" },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
}

export default function Paperwork() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("all");
  const [search, setSearch] = useState("");

  const paperworkQuery = useQuery({
    queryKey: ["all_paperwork"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paperwork")
        .select("*, orders!inner(id, order_number, created_at, customer_id, customers(name))")
        .order("status");
      if (error) throw error;
      return data;
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: async ({ docId, docType, orderId }: { docId: string; docType: string; orderId: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase
        .from("paperwork")
        .update({ status: "complete", completed_date: today, updated_at: new Date().toISOString() })
        .eq("id", docId);
      if (error) throw error;
      await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: "document_signed",
        title: `${DOC_NAMES[docType] || docType} completed`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_paperwork"] });
      toast.success("Document marked complete");
    },
  });

  const items = useMemo(() => {
    if (!paperworkQuery.data) return [];
    let filtered = paperworkQuery.data as any[];

    if (statusFilter !== "all") filtered = filtered.filter((d) => d.status === statusFilter);
    if (sideFilter !== "all") filtered = filtered.filter((d) => d.side === sideFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((d) => {
        const orderNum = d.orders?.order_number?.toLowerCase() || "";
        const custName = d.orders?.customers?.name?.toLowerCase() || "";
        return orderNum.includes(q) || custName.includes(q);
      });
    }

    filtered.sort((a: any, b: any) => {
      const sp = (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9);
      if (sp !== 0) return sp;
      const dateA = a.orders?.created_at || "";
      const dateB = b.orders?.created_at || "";
      return dateB.localeCompare(dateA);
    });

    return filtered;
  }, [paperworkQuery.data, statusFilter, sideFilter, search]);

  const allDocs = paperworkQuery.data || [];
  const counts = {
    missing: allDocs.filter((d: any) => d.status === "missing").length,
    pending: allDocs.filter((d: any) => d.status === "pending").length,
    blocked: allDocs.filter((d: any) => d.status === "blocked").length,
    complete: allDocs.filter((d: any) => d.status === "complete").length,
  };
  const completionRate = allDocs.length > 0 ? Math.round((counts.complete / allDocs.length) * 100) : 0;

  const statusFilters = [
    { key: "all", label: "All" },
    { key: "missing", label: "Missing" },
    { key: "pending", label: "Pending" },
    { key: "blocked", label: "Blocked" },
    { key: "complete", label: "Complete" },
  ];
  const sideFilters = [
    { key: "all", label: "All" },
    { key: "customer", label: "Customer" },
    { key: "vendor", label: "Vendor" },
  ];

  const statusIcon = (s: string) => {
    if (s === "complete") return <CheckCircle size={16} color="#27AE60" />;
    if (s === "missing") return <XCircle size={16} color="#D4183D" />;
    if (s === "pending") return <Clock size={16} color="#F3D12A" />;
    return <Lock size={16} color="#717182" />;
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 overflow-x-hidden">
      <h1 className="text-[20px] font-bold text-foreground mb-5">Paperwork</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Missing", count: counts.missing, color: "#D4183D", bg: "rgba(212,24,61,0.08)" },
          { label: "Pending", count: counts.pending, color: "#8B7A0A", bg: "rgba(243,209,42,0.12)" },
          { label: "Blocked", count: counts.blocked, color: "#717182", bg: "rgba(113,113,130,0.08)" },
          { label: "Complete", count: counts.complete, color: "#27AE60", bg: "rgba(39,174,96,0.08)" },
          { label: "Completion", count: `${completionRate}%`, color: "#0E2646", bg: "#F5F5F0" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border p-3 text-center" style={{ backgroundColor: kpi.bg }}>
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: kpi.color }}>{kpi.label}</div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: kpi.color }}>{kpi.count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 border border-border rounded-lg bg-card px-3 py-2">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order # or customer..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                statusFilter === f.key
                  ? "text-white"
                  : "bg-card border border-border text-muted-foreground"
              )}
              style={statusFilter === f.key ? { backgroundColor: "#0E2646" } : undefined}
            >
              {f.label}
            </button>
          ))}
          <div className="w-px bg-border mx-1" />
          {sideFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setSideFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                sideFilter === f.key
                  ? "text-white"
                  : "bg-card border border-border text-muted-foreground"
              )}
              style={sideFilter === f.key ? { backgroundColor: "#0E2646" } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {paperworkQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading paperwork…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No documents match your filters.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1.2fr_80px_90px_100px_1fr_90px] gap-2 px-3 py-2.5" style={{ backgroundColor: "#0E2646" }}>
            {["Order", "Customer", "Document", "Side", "Status", "Date", "Blocked Reason", "Action"].map((h) => (
              <div key={h} className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.6)" }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {items.map((doc: any, idx: number) => {
            const order = doc.orders;
            const customerName = order?.customers?.name || "Unassigned";
            const sc = STATUS_COLORS[doc.status] || STATUS_COLORS.blocked;
            const isActionable = doc.status === "missing" || doc.status === "pending";

            return (
              <div
                key={doc.id}
                className={cn(
                  "grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.2fr_80px_90px_100px_1fr_90px] gap-1 sm:gap-2 px-3 py-3 border-b border-border last:border-0 items-center",
                  idx % 2 === 1 ? "bg-[#FAFAF7]" : "bg-card"
                )}
              >
                {/* Order # */}
                <button
                  onClick={() => navigate(`/orders/${order?.id}`)}
                  className="text-[13px] font-semibold text-left truncate"
                  style={{ color: "#55BAAA" }}
                >
                  {order?.order_number || "—"}
                </button>

                {/* Customer */}
                <div className="text-[13px] text-foreground truncate">{customerName}</div>

                {/* Document type */}
                <div className="text-[13px] font-medium text-foreground truncate">
                  {DOC_NAMES[doc.document_type] || doc.document_type}
                </div>

                {/* Side */}
                <div className="text-[12px] text-muted-foreground capitalize">{doc.side}</div>

                {/* Status badge */}
                <div>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ backgroundColor: sc.bg, color: sc.color }}
                  >
                    {statusIcon(doc.status)}
                    {sc.label}
                  </span>
                </div>

                {/* Date */}
                <div className="text-[12px] text-muted-foreground hidden sm:block">
                  {doc.status === "complete" ? fmtDate(doc.completed_date) : ""}
                </div>

                {/* Blocked reason */}
                <div className="text-[11px] text-muted-foreground italic truncate hidden sm:block">
                  {doc.status === "blocked" ? doc.blocked_reason || "" : ""}
                </div>

                {/* Action */}
                <div>
                  {isActionable && (
                    <button
                      onClick={() => markCompleteMutation.mutate({ docId: doc.id, docType: doc.document_type, orderId: order?.id })}
                      disabled={markCompleteMutation.isPending}
                      className="text-[11px] font-semibold rounded-full px-2.5 py-1 active:scale-[0.97] transition-transform disabled:opacity-50"
                      style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
