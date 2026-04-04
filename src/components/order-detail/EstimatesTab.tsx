import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ChevronDown, Send, Trash2, ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import SendEstimateModal from "@/components/SendEstimateModal";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined, includeYear = false) {
  if (!d) return "";
  try {
    const date = new Date(d + "T00:00:00");
    return format(date, includeYear ? "MMM d, yyyy" : "MMM d");
  } catch { return d; }
}

interface EstimatesTabProps {
  orderId: string;
  estimates: any[];
  order: any;
  queryClient: any;
}

export default function EstimatesTab({ orderId, estimates, order, queryClient }: EstimatesTabProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const navigate = useNavigate();
  const customer = order?.customers as any;
  const currentEstimate = estimates.find((e) => e.is_current);

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => navigate(`/orders/${orderId}/edit?forEstimate=true`)}
          className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
          style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
        >
          <Plus size={14} /> {estimates.length === 0 ? "Create estimate" : "New version"}
        </button>
        {currentEstimate && (
          <button
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
            title={!customer?.email ? "Add customer email to send estimate" : undefined}
          >
            <Send size={14} /> Send Estimate
          </button>
        )}
      </div>

      {/* QB Estimate from Document Chain */}
      <QBEstimateCard orderId={orderId} />

      {estimates.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No app-created estimates yet.</p>
          {customer && (
            <p className="text-xs text-muted-foreground mt-1">Create an estimate to quote {customer.name || "this customer"} on this equipment with add-ons.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => (
            <EstimateCard key={est.id} estimate={est} orderId={orderId} />
          ))}
        </div>
      )}

      {currentEstimate && (
        <SendEstimateModal
          open={showSendModal}
          onClose={() => setShowSendModal(false)}
          estimate={currentEstimate}
          order={order}
          customer={customer}
        />
      )}
    </div>
  );
}

function QBEstimateCard({ orderId }: { orderId: string }) {
  const slotsQuery = useQuery({
    queryKey: ["estimate_slots", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_document_slots")
        .select("id, slot_type, is_filled, document_id, total_amount, order_documents:document_id(id, file_url, file_name, title)")
        .eq("order_id", orderId)
        .in("slot_type", ["approved_estimate", "catl_estimate", "catl_customer_invoice"]);
      if (error) throw error;
      return data || [];
    },
  });

  const slots = slotsQuery.data || [];
  const filledSlots = slots.filter((s: any) => s.is_filled && s.order_documents?.file_url);

  if (filledSlots.length === 0) return null;

  const labels: Record<string, string> = {
    catl_estimate: "CATL Estimate",
    approved_estimate: "QB Estimate",
    catl_customer_invoice: "Customer Invoice",
  };

  return (
    <div className="mb-4 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#717182" }}>From QuickBooks</p>
      {filledSlots.map((slot: any) => {
        const doc = slot.order_documents as any;
        return (
          <div key={slot.id} className="flex items-center justify-between px-3.5 py-3 rounded-xl border-2" style={{ borderColor: "#27AE60", backgroundColor: "rgba(39,174,96,0.04)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(39,174,96,0.1)" }}>
                <FileText size={16} style={{ color: "#27AE60" }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "#0E2646" }}>{labels[slot.slot_type] || slot.slot_type}</p>
                <p className="text-[11px] text-muted-foreground">{doc?.file_name || "PDF document"}</p>
                {slot.total_amount && <p className="text-[12px] font-medium" style={{ color: "#27AE60" }}>${Number(slot.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>}
              </div>
            </div>
            <a href={doc?.file_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-[0.95]"
              style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}>
              <ExternalLink size={12} /> View PDF
            </a>
          </div>
        );
      })}
    </div>
  );
}

function EstimateCard({ estimate, orderId }: { estimate: any; orderId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const isCurrent = estimate.is_current;
  const isApproved = estimate.is_approved;
  const isSigned = estimate.signed;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  const displayNumber = estimate.estimate_number || estimate.qb_doc_number;
  const hasQBEstimate = !!estimate.qb_estimate_id;

  const deleteMutation = useMutation({
    mutationFn: async (action: string) => {
      if (hasQBEstimate) {
        const { data, error } = await supabase.functions.invoke("qb-void-estimate", {
          body: { estimate_id: estimate.id, action },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Delete failed");
      } else {
        const { error } = await supabase.from("estimates").delete().eq("id", estimate.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, action) => {
      const msg = action === "void_in_qb"
        ? `Estimate${displayNumber ? ` ${displayNumber}` : ""} deleted from app and QuickBooks`
        : `Estimate${displayNumber ? ` ${displayNumber}` : ""} deleted`;
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["estimates", orderId] });
      queryClient.invalidateQueries({ queryKey: ["open_estimates"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete estimate");
    },
  });

  return (
    <>
      <div
        className={cn(
          "border rounded-xl p-3.5 bg-card",
          isCurrent || isApproved ? "border-2" : "border-border opacity-50"
        )}
        style={(isCurrent || isApproved) ? { borderColor: "#55BAAA" } : undefined}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isCurrent && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#55BAAA", backgroundColor: "rgba(85,186,170,0.1)" }}>Current</span>}
              {isApproved && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.1)" }}>Approved</span>}
              {isSigned && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#0E2646", backgroundColor: "rgba(14,38,70,0.1)" }}>Signed</span>}
              {!isCurrent && !isApproved && <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Superseded</span>}
            </div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
              <span>v{estimate.version_number}</span>
              {estimate.estimate_number && (
                <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#F3D12A", backgroundColor: "rgba(243,209,42,0.12)" }}>{estimate.estimate_number}</span>
              )}
              {estimate.label && (
                <span className="font-normal text-muted-foreground"> — {estimate.label}</span>
              )}
            </div>
            <div className="text-[13px] font-medium" style={{ color: "#55BAAA" }}>{estimate.build_shorthand}</div>
            <div className="text-lg font-medium text-foreground mt-1">{fmtCurrency(estimate.total_price)}</div>
            <div className="text-xs text-muted-foreground">{fmtDate(estimate.created_at?.split("T")[0], true)}</div>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0 mt-1"
            title="Delete estimate"
          >
            <Trash2 size={14} style={{ color: "#D4183D" }} />
          </button>
        </div>

        {estimate.emailed_at && (
          <p className="text-[11px] mt-1" style={{ color: "#55BAAA" }}>
            Emailed to {estimate.emailed_to} on {fmtDate(estimate.emailed_at?.split("T")[0], true)}
          </p>
        )}
        {estimate.qb_doc_number && (
          <p className="text-[11px] mt-0.5" style={{ color: "#717182" }}>
            QB Ref: {estimate.qb_doc_number}
          </p>
        )}

        {lineItems.length > 0 ? (
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs mt-2" style={{ color: "#55BAAA" }}>
            <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Show"} line items
          </button>
        ) : (
          <p className="text-xs text-muted-foreground mt-2 italic">Line items will populate from configurator</p>
        )}
        {expanded && lineItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {lineItems.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-xs text-foreground">
                <span>{item.display_name || item.name || item.short_code || "Item"}</span>
                <span>{fmtCurrency(item.total_retail || item.retail_price || item.retail_price_each || 0)}</span>
              </div>
            ))}
            {/* ─── Totals ─── */}
            <div className="border-t border-border mt-2 pt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmtCurrency(estimate.total_price)}</span>
              </div>
              {estimate.discount_amount > 0 && (
                <div className="flex justify-between text-xs" style={{ color: "#55BAAA" }}>
                  <span>Discount {estimate.discount_type === "%" ? `(${estimate.discount_amount}%)` : ""}</span>
                  <span>−{estimate.discount_type === "%" ? fmtCurrency(Math.round((estimate.total_price || 0) * estimate.discount_amount / 100)) : fmtCurrency(estimate.discount_amount)}</span>
                </div>
              )}
              {estimate.tax_amount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sales Tax{estimate.tax_state ? ` (${estimate.tax_state} ${estimate.tax_rate}%)` : ""}</span>
                  <span>{fmtCurrency(estimate.tax_amount)}</span>
                </div>
              )}
              {(estimate.discount_amount > 0 || estimate.tax_amount > 0) && (
                <div className="flex justify-between text-sm font-semibold text-foreground pt-1">
                  <span>Total</span>
                  <span>{fmtCurrency(estimate.total_with_tax || estimate.total_price)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete estimate?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {displayNumber ? `Estimate ${displayNumber}` : "This estimate"} — v{estimate.version_number} ({fmtCurrency(estimate.total_price)}) will be permanently deleted.
              {hasQBEstimate && (
                <span className="block mt-2 font-medium" style={{ color: "#D4183D" }}>
                  This estimate exists in QuickBooks as #{estimate.qb_doc_number || estimate.qb_estimate_id}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={hasQBEstimate ? "flex-col gap-2 sm:flex-col" : ""}>
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            {hasQBEstimate && (
              <AlertDialogAction
                onClick={() => deleteMutation.mutate("void_in_qb")}
                disabled={deleteMutation.isPending}
                className="text-sm"
                style={{ backgroundColor: "#D4183D", color: "#FFFFFF" }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete from app AND QuickBooks"}
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => deleteMutation.mutate("delete_local_only")}
              disabled={deleteMutation.isPending}
              className="text-sm"
              style={hasQBEstimate ? { backgroundColor: "#717182", color: "#FFFFFF" } : { backgroundColor: "#D4183D", color: "#FFFFFF" }}
            >
              {deleteMutation.isPending ? "Deleting..." : hasQBEstimate ? "Delete from app only (keep in QB)" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
