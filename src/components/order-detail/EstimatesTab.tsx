import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ChevronDown, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
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
  const [showForm, setShowForm] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [newShorthand, setNewShorthand] = useState(order.build_shorthand || "");
  const [newTotal, setNewTotal] = useState(String(order.customer_price || ""));
  const [newNotes, setNewNotes] = useState("");
  const customer = order?.customers as any;
  const currentEstimate = estimates.find((e) => e.is_current);
  const maxVersion = estimates.length > 0 ? Math.max(...estimates.map((e) => e.version_number)) : 0;

  const createEstimateMutation = useMutation({
    mutationFn: async () => {
      const nextVersion = maxVersion + 1;
      const totalNum = parseFloat(newTotal);
      await supabase.from("estimates").update({ is_current: false }).eq("order_id", orderId);
      const { error } = await supabase.from("estimates").insert({
        order_id: orderId,
        version_number: nextVersion,
        build_shorthand: newShorthand,
        total_price: totalNum,
        is_current: true,
        line_items: [],
        notes: newNotes || null,
      });
      if (error) throw error;
      await supabase.from("orders").update({
        current_estimate_version: nextVersion,
        build_shorthand: newShorthand,
        customer_price: totalNum,
      }).eq("id", orderId);
      await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: "estimate_revised",
        title: `Estimate #${nextVersion} created`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      setShowForm(false);
      toast.success("New estimate created");
    },
  });

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
            style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
          >
            <Plus size={14} /> New estimate version
          </button>
        )}
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

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 space-y-2">
          <input value={newShorthand} onChange={(e) => setNewShorthand(e.target.value)} placeholder="Build shorthand" className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
          <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden">
            <span className="pl-3 text-muted-foreground text-sm">$</span>
            <input value={newTotal} onChange={(e) => setNewTotal(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Total price" className="flex-1 px-2 py-2 bg-transparent text-sm outline-none" />
          </div>
          <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={() => createEstimateMutation.mutate()} disabled={createEstimateMutation.isPending || !newTotal} className="px-4 py-2 rounded-full text-sm font-bold active:scale-[0.97] disabled:opacity-50" style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>Save</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-muted-foreground px-3">Cancel</button>
          </div>
        </div>
      )}

      {estimates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates yet.</p>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => (
            <EstimateCard key={est.id} estimate={est} />
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

function EstimateCard({ estimate }: { estimate: any }) {
  const [expanded, setExpanded] = useState(false);
  const isCurrent = estimate.is_current;
  const isApproved = estimate.is_approved;
  const isSigned = estimate.signed;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  return (
    <div
      className={cn(
        "border rounded-xl p-3.5 bg-card",
        isCurrent || isApproved ? "border-2" : "border-border opacity-50"
      )}
      style={(isCurrent || isApproved) ? { borderColor: "#55BAAA" } : undefined}
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {isCurrent && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#55BAAA", backgroundColor: "rgba(85,186,170,0.1)" }}>Current</span>}
        {isApproved && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.1)" }}>Approved</span>}
        {isSigned && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#0E2646", backgroundColor: "rgba(14,38,70,0.1)" }}>Signed</span>}
        {!isCurrent && !isApproved && <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Superseded</span>}
      </div>
      <div className="text-sm font-semibold text-foreground">Estimate #{estimate.version_number}</div>
      <div className="text-[13px] font-medium" style={{ color: "#55BAAA" }}>{estimate.build_shorthand}</div>
      <div className="text-lg font-medium text-foreground mt-1">{fmtCurrency(estimate.total_price)}</div>
      <div className="text-xs text-muted-foreground">{fmtDate(estimate.created_at?.split("T")[0], true)}</div>

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
              <span>{fmtCurrency(item.retail_price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
