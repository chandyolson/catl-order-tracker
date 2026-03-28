import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Phone, Mail, CheckCircle, Lock, ChevronDown, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

const DOC_NAMES: Record<string, string> = {
  customer_estimate_sent: "Estimate sent",
  customer_approved: "Customer approved",
  customer_deposit: "Customer deposit received",
  customer_contract_signed: "Contract signed",
  customer_notified: "Customer notified",
  customer_invoice_sent: "Invoice sent to customer",
  customer_payment_final: "Final payment received",
  vendor_po_submitted: "PO submitted to MOLY",
  vendor_deposit_sent: "Deposit sent to MOLY",
  vendor_so_received: "SO received from MOLY",
  vendor_in_production: "In production",
  vendor_equipment_complete: "Equipment complete",
  vendor_invoice_received: "MOLY invoice received",
  vendor_bill_paid: "MOLY bill paid",
  logistics_freight_arranged: "Freight arranged",
  logistics_delivered_to_yard: "Delivered to yard",
  logistics_ready_for_pickup: "Ready for customer pickup",
  logistics_delivered_to_customer: "Delivered to customer",
  customer_estimate_signed: "Contract signed",
  vendor_po_signed: "PO submitted to MOLY",
  vendor_invoice_filed: "MOLY invoice received",
  vendor_bill_entered: "MOLY bill paid",
};

const DOC_TRACK: Record<string, string> = {
  customer_estimate_sent: "Customer",
  customer_approved: "Customer",
  customer_deposit: "Customer",
  customer_contract_signed: "Customer",
  customer_notified: "Customer",
  customer_invoice_sent: "Customer",
  customer_payment_final: "Customer",
  vendor_po_submitted: "MOLY",
  vendor_deposit_sent: "MOLY",
  vendor_so_received: "MOLY",
  vendor_in_production: "MOLY",
  vendor_equipment_complete: "MOLY",
  vendor_invoice_received: "MOLY",
  vendor_bill_paid: "MOLY",
  logistics_freight_arranged: "Logistics",
  logistics_delivered_to_yard: "Logistics",
  logistics_ready_for_pickup: "Logistics",
  logistics_delivered_to_customer: "Logistics",
};

const TRACK_STYLE: Record<string, { bg: string; color: string }> = {
  Customer: { bg: "#E1F5EE", color: "#085041" },
  MOLY: { bg: "#FAEEDA", color: "#633806" },
  Logistics: { bg: "#F1EFE8", color: "#5F5E5A" },
};

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function eventDotColor(eventType: string) {
  const green = ["created", "customer_approved", "document_signed", "payment_received"];
  const teal = ["estimate_sent", "order_placed", "so_received", "mfg_completed", "invoiced", "note"];
  const gold = ["eta_updated", "estimate_revised", "email"];
  const red = ["change_order"];
  const blue = ["phone_call", "status_change"];
  if (green.includes(eventType)) return "#27AE60";
  if (teal.includes(eventType)) return "#55BAAA";
  if (gold.includes(eventType)) return "#F3D12A";
  if (red.includes(eventType)) return "#D4183D";
  if (blue.includes(eventType)) return "#5B8DEF";
  return "#888780";
}

interface ActivityTabProps {
  orderId: string;
  docs: any[];
  events: any[];
  changes: any[];
  order: any;
  queryClient: any;
}

export default function ActivityTab({ orderId, docs, events, changes, order, queryClient }: ActivityTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<"note" | "phone_call" | "email">("note");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [contactWith, setContactWith] = useState("");

  const completedDocs = docs.filter((d) => d.status === "complete");
  const pendingDocs = docs.filter((d) => d.status === "pending" || d.status === "missing");
  const blockedDocs = docs.filter((d) => d.status === "blocked");
  const completeCount = completedDocs.length;
  const totalCount = docs.length;

  const timelineItems = useMemo(() => {
    const items: { id: string; type: "paperwork" | "timeline" | "change_order"; date: Date; data: any }[] = [];

    for (const doc of completedDocs) {
      items.push({
        id: `pw-${doc.id}`,
        type: "paperwork",
        date: doc.completed_date ? new Date(doc.completed_date + "T12:00:00") : new Date(doc.updated_at || doc.created_at),
        data: doc,
      });
    }
    for (const ev of events) {
      items.push({
        id: `tl-${ev.id}`,
        type: "timeline",
        date: ev.created_at ? new Date(ev.created_at) : new Date(),
        data: ev,
      });
    }
    for (const co of changes) {
      items.push({
        id: `co-${co.id}`,
        type: "change_order",
        date: co.created_at ? new Date(co.created_at) : new Date(),
        data: co,
      });
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime());
    return items;
  }, [completedDocs, events, changes]);

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
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      toast.success("Marked complete");
    },
  });

  const addEntryMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: entryType,
        title: entryTitle || (entryType === "phone_call" ? "Phone call" : entryType === "email" ? "Email" : "Note"),
        description: entryDesc || null,
        contact_method: entryType === "note" ? null : entryType,
        contact_with: contactWith || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      setShowForm(false);
      setEntryTitle("");
      setEntryDesc("");
      setContactWith("");
      toast.success(entryType === "phone_call" ? "Call logged" : entryType === "email" ? "Email logged" : "Note added");
    },
  });

  const toggleChangeCascade = useMutation({
    mutationFn: async ({ coId, field, value }: { coId: string; field: string; value: boolean }) => {
      const { error } = await supabase.from("change_orders").update({ [field]: value }).eq("id", coId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["change_orders", orderId] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>Activity</span>
        <span className="text-[11px] text-muted-foreground">
          {completeCount}/{totalCount} paperwork done
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* LEFT: Timeline */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>
            Timeline
          </p>

          {timelineItems.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-3">No activity yet.</p>
          ) : (
            <div className="relative pl-5">
              <div className="absolute left-[3px] top-2 bottom-2 w-px" style={{ backgroundColor: "#E8E8E3" }} />
              {timelineItems.map((item) => (
                <div key={item.id}>
                  {item.type === "paperwork" && <TimelineDocRow doc={item.data} />}
                  {item.type === "timeline" && <TimelineEventRow event={item.data} />}
                  {item.type === "change_order" && (
                    <TimelineChangeRow co={item.data} onToggleCascade={(coId, field, value) => toggleChangeCascade.mutate({ coId, field, value })} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            {!showForm && (
              <div className="flex gap-2">
                <button onClick={() => { setEntryType("note"); setShowForm(true); }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
                  style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}>
                  <Plus size={12} /> Note
                </button>
                <button onClick={() => { setEntryType("phone_call"); setShowForm(true); }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
                  style={{ border: "1px solid #5B8DEF", color: "#5B8DEF" }}>
                  <Phone size={12} /> Call
                </button>
                <button onClick={() => { setEntryType("email"); setShowForm(true); }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
                  style={{ border: "1px solid #B8860B", color: "#B8860B" }}>
                  <Mail size={12} /> Email
                </button>
              </div>
            )}
            {showForm && (
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <span className="text-[12px] font-semibold text-foreground">
                  {entryType === "phone_call" ? "Phone call" : entryType === "email" ? "Email" : "Note"}
                </span>
                {(entryType === "phone_call" || entryType === "email") && (
                  <input value={contactWith} onChange={(e) => setContactWith(e.target.value)}
                    placeholder="Who did you talk to?"
                    className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]" />
                )}
                <input value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)}
                  placeholder={entryType === "phone_call" ? "What was discussed?" : entryType === "email" ? "Email subject" : "Note title"}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]" />
                <textarea value={entryDesc} onChange={(e) => setEntryDesc(e.target.value)}
                  placeholder="Details (optional)" rows={3}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none text-[16px]" />
                <div className="flex gap-2">
                  <button onClick={() => addEntryMutation.mutate()}
                    disabled={addEntryMutation.isPending || !entryTitle.trim()}
                    className="px-4 py-2 rounded-full text-sm font-bold active:scale-[0.97] disabled:opacity-50"
                    style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>Save</button>
                  <button onClick={() => { setShowForm(false); setEntryTitle(""); setEntryDesc(""); setContactWith(""); }}
                    className="text-sm text-muted-foreground px-3">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: To Do */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>To do</p>
            <span className="text-[11px] text-muted-foreground">{pendingDocs.length + blockedDocs.length} remaining</span>
          </div>

          {pendingDocs.length === 0 && blockedDocs.length === 0 ? (
            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: "rgba(85,186,170,0.06)", border: "1px solid rgba(85,186,170,0.2)" }}>
              <CheckCircle size={24} style={{ color: "#27AE60", margin: "0 auto 6px" }} />
              <p className="text-[13px] font-medium" style={{ color: "#0F6E56" }}>All caught up</p>
              <p className="text-[11px] text-muted-foreground">Every paperwork item is complete.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {pendingDocs.map((doc) => {
                const track = DOC_TRACK[doc.document_type] || "Customer";
                const trackStyle = TRACK_STYLE[track] || TRACK_STYLE.Customer;
                const name = DOC_NAMES[doc.document_type] || doc.document_type;
                return (
                  <div key={doc.id}
                    className="flex items-center gap-2 py-2 px-3 rounded-lg bg-card border border-border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { if (!markCompleteMutation.isPending) markCompleteMutation.mutate({ docId: doc.id, docType: doc.document_type }); }}>
                    <div className="w-4 h-4 rounded shrink-0" style={{ border: "1.5px solid #F3D12A" }} />
                    <span className="text-[12px] font-medium text-foreground flex-1 min-w-0">{name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: trackStyle.bg, color: trackStyle.color }}>{track}</span>
                  </div>
                );
              })}
              {blockedDocs.map((doc) => {
                const track = DOC_TRACK[doc.document_type] || "Customer";
                const trackStyle = TRACK_STYLE[track] || TRACK_STYLE.Customer;
                const name = DOC_NAMES[doc.document_type] || doc.document_type;
                return (
                  <div key={doc.id} className="flex items-center gap-2 py-2 px-3 rounded-lg opacity-40">
                    <Lock size={12} className="shrink-0 text-muted-foreground" />
                    <span className="text-[12px] text-muted-foreground flex-1 min-w-0">{name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: trackStyle.bg, color: trackStyle.color }}>{track}</span>
                    {doc.blocked_reason && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{doc.blocked_reason}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineDocRow({ doc }: { doc: any }) {
  const track = DOC_TRACK[doc.document_type] || "Customer";
  const trackStyle = TRACK_STYLE[track] || TRACK_STYLE.Customer;
  const name = DOC_NAMES[doc.document_type] || doc.document_type;
  const dateStr = doc.completed_date ? format(new Date(doc.completed_date + "T00:00:00"), "MMM d") : "";

  return (
    <div className="relative pb-2 pl-5">
      <div className="absolute left-0 top-[8px] w-[7px] h-[7px] rounded-full"
        style={{ backgroundColor: "#27AE60", border: "2px solid #F5F5F0" }} />
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-card border border-border">
        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: "#27AE60" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <span className="text-[12px] text-muted-foreground flex-1 min-w-0">{name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: trackStyle.bg, color: trackStyle.color }}>{track}</span>
        {dateStr && <span className="text-[10px] text-muted-foreground shrink-0">{dateStr}</span>}
        {doc.document_url && (
          <a href={doc.document_url} target="_blank" rel="noopener noreferrer" className="shrink-0"
            onClick={(e) => e.stopPropagation()}>
            <ExternalLink size={11} style={{ color: "#55BAAA" }} />
          </a>
        )}
      </div>
    </div>
  );
}

function TimelineEventRow({ event }: { event: any }) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = eventDotColor(event.event_type);
  const isConversation = event.event_type === "phone_call" || event.event_type === "email";
  const relativeTime = event.created_at ? formatDistanceToNow(new Date(event.created_at), { addSuffix: true }) : "";

  if (isConversation) {
    return (
      <div className="relative pb-2 pl-5">
        <div className="absolute left-0 top-[8px] w-[7px] h-[7px] rounded-full"
          style={{ backgroundColor: dotColor, border: "2px solid #F5F5F0" }} />
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-1.5">
              {event.event_type === "phone_call" ? (
                <Phone size={12} style={{ color: "#5B8DEF" }} />
              ) : (
                <Mail size={12} style={{ color: "#B8860B" }} />
              )}
              <span className="text-[12px] font-medium text-foreground">{event.contact_with || event.title}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
          </div>
          {event.title && event.contact_with && (
            <p className="text-[12px] font-medium text-foreground mb-0.5">{event.title}</p>
          )}
          {event.description && (
            <p className={cn("text-[11px] text-muted-foreground", !expanded && "line-clamp-2 cursor-pointer")}
              onClick={() => setExpanded(!expanded)}>{event.description}</p>
          )}
        </div>
      </div>
    );
  }

  const hasDescription = !!event.description;
  return (
    <div className="relative pb-2 pl-5">
      <div className="absolute left-0 top-[7px] w-[7px] h-[7px] rounded-full"
        style={{ backgroundColor: dotColor, border: "2px solid #F5F5F0" }} />
      {hasDescription ? (
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[12px] font-medium text-foreground">{event.title}</span>
            <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
          </div>
          <p className={cn("text-[11px] text-muted-foreground", !expanded && "line-clamp-2 cursor-pointer")}
            onClick={() => setExpanded(!expanded)}>{event.description}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <span className="text-[12px] text-muted-foreground">{event.title}</span>
          <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
        </div>
      )}
    </div>
  );
}

function TimelineChangeRow({ co, onToggleCascade }: { co: any; onToggleCascade: (coId: string, field: string, value: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const allApplied = co.all_applied;
  const relativeTime = co.created_at ? formatDistanceToNow(new Date(co.created_at), { addSuffix: true }) : "";
  const cascadeItems = [
    { field: "applied_internal", label: "Internal" },
    { field: "applied_customer_estimate", label: "Customer est." },
    { field: "applied_qb_estimate", label: "QB est." },
    { field: "applied_mfg_order", label: "MOLY" },
    { field: "applied_qb_po", label: "QB PO" },
  ];

  return (
    <div className="relative pb-2 pl-5">
      <div className="absolute left-0 top-[8px] w-[7px] h-[7px] rounded-full"
        style={{ backgroundColor: "#D4183D", border: "2px solid #F5F5F0" }} />
      <div className="bg-card border border-border rounded-lg p-2.5" style={{ borderColor: allApplied ? "#27AE60" : "#E8863A" }}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[12px] font-medium text-foreground">CO #{co.change_number} — {co.description?.slice(0, 50) || "Change order"}</span>
          <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {co.source && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: co.source === "customer" ? "#E1F5EE" : co.source === "moly" ? "#FAEEDA" : "#F1EFE8",
                color: co.source === "customer" ? "#085041" : co.source === "moly" ? "#633806" : "#5F5E5A",
              }}>
              {co.source === "customer" ? "Customer" : co.source === "moly" ? "MOLY" : "Internal"}
            </span>
          )}
          {co.requires_approval && !co.approved && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#FAEEDA", color: "#633806" }}>Needs approval</span>
          )}
          {allApplied && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#E1F5EE", color: "#085041" }}>All applied</span>
          )}
        </div>
        {co.price_impact != null && co.price_impact !== 0 && (
          <div className="text-[12px] font-medium mb-1" style={{ color: co.price_impact >= 0 ? "#27AE60" : "#D4183D" }}>
            {co.price_impact >= 0 ? "+" : "−"}${Math.abs(co.price_impact).toLocaleString()}
            <span className="text-muted-foreground font-normal ml-1">→ {fmtCurrency(co.new_total)}</span>
          </div>
        )}
        {Array.isArray(co.changes_summary) && co.changes_summary.length > 0 && (
          <div className="space-y-0.5 mb-1.5">
            {(co.changes_summary as any[]).map((change: any, i: number) => (
              <div key={i} className="text-[11px]"
                style={{ color: change.type === "added" ? "#27AE60" : change.type === "removed" ? "#D4183D" : "#B8860B" }}>
                {change.type === "added" ? "+ " : change.type === "removed" ? "− " : "~ "}
                {change.option || change.field}{change.detail ? ` (${change.detail})` : ""}
                {change.from && change.to ? `: ${change.from} → ${change.to}` : ""}
              </div>
            ))}
          </div>
        )}
        {!allApplied && (
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[11px] mt-1" style={{ color: "#55BAAA" }}>
            <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Show"} cascade ({cascadeItems.filter((ci) => co[ci.field]).length}/5 applied)
          </button>
        )}
        {expanded && !allApplied && (
          <div className="mt-2 space-y-1.5">
            {cascadeItems.map((item) => (
              <label key={item.field} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={!!co[item.field]} onCheckedChange={(checked) => onToggleCascade(co.id, item.field, !!checked)} className="h-4 w-4" />
                <span className="text-[12px] text-foreground">{item.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
