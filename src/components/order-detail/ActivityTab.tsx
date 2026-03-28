import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Phone, Mail, CheckCircle, Lock, Clock, ChevronDown } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

/* ─── Constants ──────────────────────────────────────────── */

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
  // Legacy names
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

/* ─── Types ──────────────────────────────────────────────── */

type FilterType = "all" | "paperwork" | "conversations" | "changes";

interface ActivityItem {
  id: string;
  type: "paperwork" | "timeline" | "change_order";
  sortDate: Date;
  sortPriority: number; // 0 = pending paperwork (top), 1 = normal, 2 = blocked (bottom)
  data: any;
}

interface ActivityTabProps {
  orderId: string;
  docs: any[];
  events: any[];
  changes: any[];
  order: any;
  queryClient: any;
}

/* ─── Main Component ─────────────────────────────────────── */

export default function ActivityTab({ orderId, docs, events, changes, order, queryClient }: ActivityTabProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<"note" | "phone_call" | "email">("note");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [contactWith, setContactWith] = useState("");

  const completeCount = docs.filter((d) => d.status === "complete").length;
  const totalCount = docs.length;

  /* ─── Build unified feed ────────────────────────────────── */

  const items = useMemo(() => {
    const all: ActivityItem[] = [];

    // Paperwork items
    for (const doc of docs) {
      const isComplete = doc.status === "complete";
      const isPending = doc.status === "pending" || doc.status === "missing";
      const isBlocked = doc.status === "blocked";

      all.push({
        id: `pw-${doc.id}`,
        type: "paperwork",
        sortDate: isComplete && doc.completed_date
          ? new Date(doc.completed_date + "T12:00:00")
          : isPending
          ? new Date("2999-01-01") // pending floats to top
          : new Date("1970-01-01"), // blocked sinks to bottom
        sortPriority: isPending ? 0 : isBlocked ? 2 : 1,
        data: doc,
      });
    }

    // Timeline events
    for (const ev of events) {
      all.push({
        id: `tl-${ev.id}`,
        type: "timeline",
        sortDate: ev.created_at ? new Date(ev.created_at) : new Date(),
        sortPriority: 1,
        data: ev,
      });
    }

    // Change orders
    for (const co of changes) {
      all.push({
        id: `co-${co.id}`,
        type: "change_order",
        sortDate: co.created_at ? new Date(co.created_at) : new Date(),
        sortPriority: 1,
        data: co,
      });
    }

    // Sort: pending first (priority 0), then by date desc, blocked last (priority 2)
    all.sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
      return b.sortDate.getTime() - a.sortDate.getTime();
    });

    return all;
  }, [docs, events, changes]);

  /* ─── Filtered items ────────────────────────────────────── */

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "paperwork") return items.filter((i) => i.type === "paperwork");
    if (filter === "conversations") return items.filter((i) => i.type === "timeline");
    if (filter === "changes") return items.filter((i) => i.type === "change_order");
    return items;
  }, [items, filter]);

  /* ─── Mutations ─────────────────────────────────────────── */

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

  /* ─── Render ────────────────────────────────────────────── */

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "paperwork", label: "Paperwork" },
    { key: "conversations", label: "Conversations" },
    { key: "changes", label: "Changes" },
  ];

  return (
    <div>
      {/* Filter pills + progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="text-[11px] px-3 py-1 rounded-full font-medium transition-colors"
              style={{
                background: filter === f.key ? "#0E2646" : "white",
                color: filter === f.key ? "#F0F0F0" : "#717182",
                border: filter === f.key ? "none" : "0.5px solid #D4D4D0",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {completeCount}/{totalCount} done
        </span>
      </div>

      {/* Action buttons */}
      <div className="mb-3">
        {!showForm && (
          <div className="flex gap-2">
            <button
              onClick={() => { setEntryType("note"); setShowForm(true); }}
              className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
              style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
            >
              <Plus size={12} /> Note
            </button>
            <button
              onClick={() => { setEntryType("phone_call"); setShowForm(true); }}
              className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
              style={{ border: "1px solid #5B8DEF", color: "#5B8DEF" }}
            >
              <Phone size={12} /> Call
            </button>
            <button
              onClick={() => { setEntryType("email"); setShowForm(true); }}
              className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
              style={{ border: "1px solid #B8860B", color: "#B8860B" }}
            >
              <Mail size={12} /> Email
            </button>
          </div>
        )}
      </div>

      {/* Entry form */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-3 mb-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-foreground">
              {entryType === "phone_call" ? "Phone call" : entryType === "email" ? "Email" : "Note"}
            </span>
          </div>
          {(entryType === "phone_call" || entryType === "email") && (
            <input
              value={contactWith}
              onChange={(e) => setContactWith(e.target.value)}
              placeholder="Who did you talk to?"
              className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]"
            />
          )}
          <input
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
            placeholder={entryType === "phone_call" ? "What was discussed?" : entryType === "email" ? "Email subject" : "Note title"}
            className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]"
          />
          <textarea
            value={entryDesc}
            onChange={(e) => setEntryDesc(e.target.value)}
            placeholder="Details (optional)"
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none text-[16px]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => addEntryMutation.mutate()}
              disabled={addEntryMutation.isPending || !entryTitle.trim()}
              className="px-4 py-2 rounded-full text-sm font-bold active:scale-[0.97] disabled:opacity-50"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
            >
              Save
            </button>
            <button
              onClick={() => { setShowForm(false); setEntryTitle(""); setEntryDesc(""); setContactWith(""); }}
              className="text-sm text-muted-foreground px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unified timeline feed */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No activity yet.</p>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5" style={{ backgroundColor: "#E8E8E3" }} />
          {filtered.map((item) => (
            <div key={item.id}>
              {item.type === "paperwork" && (
                <PaperworkRow
                  doc={item.data}
                  onComplete={(docId, docType) => markCompleteMutation.mutate({ docId, docType })}
                  isPending={markCompleteMutation.isPending}
                />
              )}
              {item.type === "timeline" && (
                <TimelineRow event={item.data} />
              )}
              {item.type === "change_order" && (
                <ChangeOrderRow
                  co={item.data}
                  onToggleCascade={(coId, field, value) => toggleChangeCascade.mutate({ coId, field, value })}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Paperwork Row ──────────────────────────────────────── */

function PaperworkRow({ doc, onComplete, isPending }: { doc: any; onComplete: (id: string, type: string) => void; isPending: boolean }) {
  const isComplete = doc.status === "complete";
  const isActionable = doc.status === "pending" || doc.status === "missing";
  const isBlocked = doc.status === "blocked";
  const track = DOC_TRACK[doc.document_type] || "Customer";
  const trackStyle = TRACK_STYLE[track] || TRACK_STYLE.Customer;
  const name = DOC_NAMES[doc.document_type] || doc.document_type;

  const dotColor = isComplete ? "#27AE60" : isActionable ? "#F3D12A" : "#B4B2A9";

  return (
    <div className={cn("relative pb-2 pl-7", isBlocked && "opacity-40")}>
      <div
        className="absolute left-0 top-[9px] w-[10px] h-[10px] rounded-full"
        style={{ backgroundColor: dotColor, border: "2px solid #F5F5F0", marginLeft: 2 }}
      />
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-3 rounded-lg",
          isActionable ? "bg-card border border-border cursor-pointer hover:bg-muted/50 transition-colors" : isComplete ? "bg-card border border-border" : ""
        )}
        onClick={() => {
          if (isActionable && !isPending) onComplete(doc.id, doc.document_type);
        }}
      >
        {/* Checkbox */}
        {isComplete ? (
          <div
            className="w-4 h-4 rounded flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#27AE60" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        ) : isActionable ? (
          <div
            className="w-4 h-4 rounded shrink-0"
            style={{ border: "1.5px solid #F3D12A" }}
          />
        ) : (
          <div
            className="w-4 h-4 rounded shrink-0"
            style={{ border: "1.5px solid #B4B2A9" }}
          />
        )}

        {/* Name */}
        <span className={cn("text-[12px] flex-1 min-w-0", isComplete ? "text-muted-foreground" : isBlocked ? "text-muted-foreground" : "font-medium text-foreground")}>
          {name}
        </span>

        {/* Track badge */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: trackStyle.bg, color: trackStyle.color }}
        >
          {track}
        </span>

        {/* Date or blocked reason */}
        {isComplete && doc.completed_date && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {format(new Date(doc.completed_date + "T00:00:00"), "MMM d")}
          </span>
        )}
        {isBlocked && doc.blocked_reason && (
          <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[120px]">
            {doc.blocked_reason}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Timeline Row ───────────────────────────────────────── */

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

function TimelineRow({ event }: { event: any }) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = eventDotColor(event.event_type);
  const isConversation = event.event_type === "phone_call" || event.event_type === "email";
  const relativeTime = event.created_at ? formatDistanceToNow(new Date(event.created_at), { addSuffix: true }) : "";

  if (isConversation) {
    return (
      <div className="relative pb-3 pl-7">
        <div
          className="absolute left-0 top-[9px] w-[10px] h-[10px] rounded-full"
          style={{ backgroundColor: dotColor, border: "2px solid #F5F5F0", marginLeft: 2 }}
        />
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-1.5">
              {event.event_type === "phone_call" ? (
                <Phone size={12} style={{ color: "#5B8DEF" }} />
              ) : (
                <Mail size={12} style={{ color: "#B8860B" }} />
              )}
              <span className="text-[12px] font-medium text-foreground">
                {event.contact_with || event.title}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
          </div>
          {event.title && event.contact_with && (
            <p className="text-[12px] font-medium text-foreground mb-0.5">{event.title}</p>
          )}
          {event.description && (
            <p
              className={cn("text-[11px] text-muted-foreground", !expanded && "line-clamp-2 cursor-pointer")}
              onClick={() => setExpanded(!expanded)}
            >
              {event.description}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Simple timeline event (status change, created, note, etc.)
  const hasDescription = !!event.description;
  return (
    <div className="relative pb-2 pl-7">
      <div
        className="absolute left-0 top-[7px] w-[10px] h-[10px] rounded-full"
        style={{ backgroundColor: dotColor, border: "2px solid #F5F5F0", marginLeft: 2 }}
      />
      {hasDescription ? (
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[12px] font-medium text-foreground">{event.title}</span>
            <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
          </div>
          <p
            className={cn("text-[11px] text-muted-foreground", !expanded && "line-clamp-2 cursor-pointer")}
            onClick={() => setExpanded(!expanded)}
          >
            {event.description}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <span className="text-[12px] font-medium text-foreground">{event.title}</span>
          <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Change Order Row ───────────────────────────────────── */

function ChangeOrderRow({ co, onToggleCascade }: { co: any; onToggleCascade: (coId: string, field: string, value: boolean) => void }) {
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
    <div className="relative pb-3 pl-7">
      <div
        className="absolute left-0 top-[9px] w-[10px] h-[10px] rounded-full"
        style={{ backgroundColor: "#D4183D", border: "2px solid #F5F5F0", marginLeft: 2 }}
      />
      <div className="bg-card border border-border rounded-lg p-2.5" style={{ borderColor: allApplied ? "#27AE60" : "#E8863A" }}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[12px] font-medium text-foreground">CO #{co.change_number} — {co.description?.slice(0, 50) || "Change order"}</span>
          <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
        </div>

        {/* Badges */}
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {co.source && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: co.source === "customer" ? "#E1F5EE" : co.source === "moly" ? "#FAEEDA" : "#F1EFE8",
                color: co.source === "customer" ? "#085041" : co.source === "moly" ? "#633806" : "#5F5E5A",
              }}
            >
              {co.source === "customer" ? "Customer" : co.source === "moly" ? "MOLY" : "Internal"}
            </span>
          )}
          {co.requires_approval && !co.approved && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#FAEEDA", color: "#633806" }}>
              Needs approval
            </span>
          )}
          {co.requires_approval && co.approved && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#E1F5EE", color: "#085041" }}>
              Approved
            </span>
          )}
          {allApplied && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#E1F5EE", color: "#085041" }}>
              All applied
            </span>
          )}
        </div>

        {/* Price impact */}
        {co.price_impact != null && co.price_impact !== 0 && (
          <div className="text-[12px] font-medium mb-1" style={{ color: co.price_impact >= 0 ? "#27AE60" : "#D4183D" }}>
            {co.price_impact >= 0 ? "+" : "−"}${Math.abs(co.price_impact).toLocaleString()}
            <span className="text-muted-foreground font-normal ml-1">→ {fmtCurrency(co.new_total)}</span>
          </div>
        )}

        {/* Changes summary */}
        {Array.isArray(co.changes_summary) && co.changes_summary.length > 0 && (
          <div className="space-y-0.5 mb-1.5">
            {(co.changes_summary as any[]).map((change: any, i: number) => (
              <div
                key={i}
                className="text-[11px]"
                style={{
                  color: change.type === "added" ? "#27AE60" : change.type === "removed" ? "#D4183D" : "#B8860B",
                }}
              >
                {change.type === "added" ? "+ " : change.type === "removed" ? "− " : "~ "}
                {change.option || change.field}
                {change.detail ? ` (${change.detail})` : ""}
                {change.from && change.to ? `: ${change.from} → ${change.to}` : ""}
              </div>
            ))}
          </div>
        )}

        {/* Cascade checkboxes (expandable) */}
        {!allApplied && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] mt-1"
            style={{ color: "#55BAAA" }}
          >
            <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Show"} cascade ({cascadeItems.filter((ci) => co[ci.field]).length}/5 applied)
          </button>
        )}
        {expanded && !allApplied && (
          <div className="mt-2 space-y-1.5">
            {cascadeItems.map((item) => (
              <label key={item.field} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!co[item.field]}
                  onCheckedChange={(checked) => onToggleCascade(co.id, item.field, !!checked)}
                  className="h-4 w-4"
                />
                <span className="text-[12px] text-foreground">{item.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
