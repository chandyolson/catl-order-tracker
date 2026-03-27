import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, Clock, Lock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
}

interface PaperworkTabProps {
  orderId: string;
  docs: any[];
  queryClient: any;
}

export default function PaperworkTab({ orderId, docs, queryClient }: PaperworkTabProps) {
  const complete = docs.filter((d) => d.status === "complete").length;
  const total = docs.length;
  const customerDocs = docs.filter((d) => d.side === "customer");
  const vendorDocs = docs.filter((d) => d.side === "vendor");

  const markCompleteMutation = useMutation({
    mutationFn: async ({ docId, docType }: { docId: string; docType: string }) => {
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
      queryClient.invalidateQueries({ queryKey: ["paperwork", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      toast.success("Document marked complete");
    },
  });

  return (
    <div>
      <div className="mb-4">
        <p className="text-[13px] font-medium text-foreground mb-1">{complete} of {total} complete</p>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${total > 0 ? (complete / total) * 100 : 0}%`, backgroundColor: "#27AE60" }} />
        </div>
      </div>
      <DocSection title="Customer Side" docs={customerDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
      <DocSection title="Vendor Side" docs={vendorDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
    </div>
  );
}

function DocSection({ title, docs, onComplete, pending }: { title: string; docs: any[]; onComplete: (id: string, type: string) => void; pending: boolean }) {
  const statusIcon = (s: string) => {
    if (s === "complete") return <CheckCircle size={20} color="#27AE60" />;
    if (s === "missing") return <XCircle size={20} color="#D4183D" />;
    if (s === "pending") return <Clock size={20} color="#F3D12A" />;
    return <Lock size={20} color="#717182" />;
  };

  const statusBadge = (s: string) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      complete: { bg: "rgba(39,174,96,0.1)", color: "#27AE60", label: "Complete" },
      missing: { bg: "rgba(212,24,61,0.1)", color: "#D4183D", label: "Missing" },
      pending: { bg: "rgba(243,209,42,0.15)", color: "#8B7A0A", label: "Pending" },
      blocked: { bg: "rgba(113,113,130,0.1)", color: "#717182", label: "Blocked" },
    };
    const cfg = styles[s] || styles.blocked;
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="mb-5">
      <div className="px-3 py-2" style={{ backgroundColor: "#F5F5F0" }}>
        <h4 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>{title}</h4>
      </div>
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 py-3 px-1 border-b border-border last:border-0">
          <div className="shrink-0">{statusIcon(doc.status)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground">{DOC_NAMES[doc.document_type] || doc.document_type}</span>
              {statusBadge(doc.status)}
            </div>
            {doc.status === "blocked" && doc.blocked_reason && (
              <div className="text-[11px] text-muted-foreground italic">{doc.blocked_reason}</div>
            )}
            {doc.status === "complete" && doc.completed_date && (
              <div className="text-[11px] text-muted-foreground">{fmtDate(doc.completed_date)}</div>
            )}
          </div>
          {(doc.status === "missing" || doc.status === "pending") && (
            <button
              onClick={() => onComplete(doc.id, doc.document_type)}
              disabled={pending}
              className="text-xs font-semibold rounded-full px-3 py-1 active:scale-[0.97] transition-transform disabled:opacity-50 shrink-0"
              style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
            >
              Mark complete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
