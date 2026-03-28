import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, Clock, Lock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const DOC_NAMES: Record<string, string> = {
  // Customer side (7)
  customer_estimate_sent: "Estimate sent",
  customer_approved: "Customer approved",
  customer_deposit: "Customer deposit received",
  customer_contract_signed: "Contract signed",
  customer_notified: "Customer notified",
  customer_invoice_sent: "Invoice sent to customer",
  customer_payment_final: "Final payment received",
  // Manufacturer side (7)
  vendor_po_submitted: "PO submitted to MOLY",
  vendor_deposit_sent: "Deposit sent to MOLY",
  vendor_so_received: "SO received from MOLY",
  vendor_in_production: "In production",
  vendor_equipment_complete: "Equipment complete",
  vendor_invoice_received: "MOLY invoice received",
  vendor_bill_paid: "MOLY bill paid",
  // Logistics (4)
  logistics_freight_arranged: "Freight arranged",
  logistics_delivered_to_yard: "Delivered to yard",
  logistics_ready_for_pickup: "Ready for customer pickup",
  logistics_delivered_to_customer: "Delivered to customer",
};

const DOC_SORT: Record<string, number> = {
  customer_estimate_sent: 1, customer_approved: 2, customer_deposit: 3,
  customer_contract_signed: 4, customer_notified: 5, customer_invoice_sent: 6, customer_payment_final: 7,
  vendor_po_submitted: 1, vendor_deposit_sent: 2, vendor_so_received: 3,
  vendor_in_production: 4, vendor_equipment_complete: 5, vendor_invoice_received: 6, vendor_bill_paid: 7,
  logistics_freight_arranged: 1, logistics_delivered_to_yard: 2,
  logistics_ready_for_pickup: 3, logistics_delivered_to_customer: 4,
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

  const customerDocs = docs.filter((d) => d.document_type?.startsWith("customer_"))
    .sort((a, b) => (DOC_SORT[a.document_type] || 99) - (DOC_SORT[b.document_type] || 99));
  const vendorDocs = docs.filter((d) => d.document_type?.startsWith("vendor_"))
    .sort((a, b) => (DOC_SORT[a.document_type] || 99) - (DOC_SORT[b.document_type] || 99));
  const logisticsDocs = docs.filter((d) => d.document_type?.startsWith("logistics_"))
    .sort((a, b) => (DOC_SORT[a.document_type] || 99) - (DOC_SORT[b.document_type] || 99));

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
      <DocSection title="Customer" docs={customerDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
      <DocSection title="Manufacturer" docs={vendorDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
      <DocSection title="Logistics" docs={logisticsDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
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

  if (docs.length === 0) return null;

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
