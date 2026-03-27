import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft, ChevronDown, ChevronRight, Edit2, Plus, CheckCircle, XCircle, Clock, Lock,
  Circle, AlertCircle, Mail, Phone, MoreVertical, Trash2, AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { format, differenceInDays } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import StatusBadge from "@/components/StatusBadge";

const DOC_NAMES: Record<string, string> = {
  customer_estimate_signed: "Estimate — signed by customer",
  customer_deposit: "Deposit / down payment",
  customer_invoice_sent: "Invoice sent to customer",
  customer_payment_final: "Final payment received",
  vendor_po_signed: "Purchase order — signed & submitted",
  vendor_so_received: "Vendor sales order — received",
  vendor_invoice_filed: "Vendor invoice PDF — received & filed",
  vendor_bill_entered: "Bill entered in QuickBooks",
};

const STATUS_ORDER = [
  "estimate", "approved", "ordered", "so_received", "in_production",
  "completed", "freight_arranged", "delivered", "invoiced", "paid", "closed",
];

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

// ─── Event dot color ────────────────────────────────────────────
function eventDotColor(eventType: string) {
  const green = ["created", "customer_approved", "document_signed", "payment_received"];
  const teal = ["estimate_sent", "order_placed", "so_received", "mfg_completed", "invoiced"];
  const gold = ["eta_updated"];
  if (green.includes(eventType)) return "#27AE60";
  if (teal.includes(eventType)) return "#55BAAA";
  if (gold.includes(eventType)) return "#F3D12A";
  return "#5B8DEF";
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"timeline" | "documents" | "estimates" | "changes">("timeline");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  const deleteOrderMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.error(`Order ${orderQuery.data?.order_number} deleted`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate("/orders");
    },
    onError: (err: any) => {
      toast.error("Failed to delete order: " + err.message);
    },
  });

  // (conversion hooks moved below after order is declared)

  // ─── QUERIES ────────────────────────────────────────────
  const orderQuery = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, phone, email, address_city, address_state), manufacturers(name, avg_lead_days)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const timelineQuery = useQuery({
    queryKey: ["order_timeline", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_timeline")
        .select("*")
        .eq("order_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const paperworkQuery = useQuery({
    queryKey: ["paperwork", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paperwork")
        .select("*")
        .eq("order_id", id!)
        .order("side")
        .order("document_type");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const estimatesQuery = useQuery({
    queryKey: ["estimates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*")
        .eq("order_id", id!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const changeOrdersQuery = useQuery({
    queryKey: ["change_orders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_orders")
        .select("*")
        .eq("order_id", id!)
        .order("change_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const order = orderQuery.data;
  const customer = order?.customers as any;
  const manufacturer = order?.manufacturers as any;

  // ─── MARGIN ─────────────────────────────────────────────
  const margin = useMemo(() => {
    if (!order?.customer_price || !order?.our_cost) return null;
    const amount = order.customer_price - order.our_cost;
    const percent = (amount / order.customer_price) * 100;
    return { amount, percent };
  }, [order]);

  const marginColor = margin
    ? margin.percent >= 15 ? "#27AE60" : margin.percent >= 10 ? "#F3D12A" : "#D4183D"
    : "#717182";

  if (orderQuery.isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading order…</div>;
  }
  if (!order) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Order not found</div>;
  }

  const tabs = [
    { key: "timeline" as const, label: "Timeline" },
    { key: "documents" as const, label: "Documents" },
    { key: "estimates" as const, label: "Estimates" },
    { key: "changes" as const, label: "Changes" },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-32">
      {/* ─── HEADER — Navy Card ──────────────────────────── */}
      <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: "#0E2646" }}>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate("/orders")} className="p-1 shrink-0" style={{ color: "#55BAAA" }}>
            <ChevronLeft size={24} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold truncate" style={{ color: "#F0F0F0" }}>
              {customer?.name || <span className="italic" style={{ color: "rgba(240,240,240,0.45)" }}>No customer</span>}
            </h1>
            <p className="text-sm font-medium" style={{ color: "#55BAAA" }}>{order.build_shorthand}</p>
          </div>
          <div className="ml-auto shrink-0 flex items-center gap-2">
            <button
              onClick={() => navigate(`/orders/${id}/edit`)}
              className="flex items-center justify-center rounded-lg active:scale-[0.95] transition-all"
              style={{
                width: 36, height: 36,
                color: "rgba(240,240,240,0.5)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#F0F0F0";
                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(240,240,240,0.5)";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Edit2 size={16} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center rounded-lg active:scale-[0.95] transition-all"
                  style={{
                    width: 36, height: 36,
                    color: "rgba(240,240,240,0.5)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#F0F0F0";
                    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "rgba(240,240,240,0.5)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <MoreVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-[#D4183D] focus:text-[#D4183D] focus:bg-red-50 cursor-pointer"
                >
                  <Trash2 size={14} className="mr-2" />
                  Delete order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <StatusBadge status={order.status} />
          </div>
        </div>
        {/* Option pills */}
        {Array.isArray(order.selected_options) && (order.selected_options as any[]).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(order.selected_options as any[]).map((opt: any, i: number) => {
              const pillLabel = formatSavedOptionPill(opt);
              if (!pillLabel) return null;
              return (
                <span
                  key={i}
                  className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{
                    backgroundColor: "rgba(85,186,170,0.15)",
                    color: "#55BAAA",
                  }}
                >
                  {pillLabel}
                </span>
              );
            })}
          </div>
        )}
        <p className="text-xs mt-2" style={{ color: "rgba(240,240,240,0.45)" }}>
          {order.order_number} · {fmtDate(order.estimate_date, true)}
        </p>
      </div>

      {/* ─── KPI ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-card border border-border rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-muted-foreground">Customer price</div>
          <div className="text-lg font-medium text-foreground">{fmtCurrency(order.customer_price)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-muted-foreground">Our cost</div>
          <div className="text-lg font-medium text-foreground">{fmtCurrency(order.our_cost)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-muted-foreground">Margin</div>
          <div className="text-lg font-medium" style={{ color: marginColor }}>
            {margin ? `${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)` : "—"}
          </div>
        </div>
      </div>

      {/* ─── TABS ────────────────────────────────────────── */}
      <div className="flex border-b border-border mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium text-center transition-colors",
              activeTab === t.key
                ? "text-foreground border-b-2"
                : "text-muted-foreground"
            )}
            style={activeTab === t.key ? { borderBottomColor: "#F3D12A" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────── */}
      {activeTab === "timeline" && (
        <TimelineTab orderId={id!} events={timelineQuery.data || []} queryClient={queryClient} />
      )}
      {activeTab === "documents" && (
        <DocumentsTab orderId={id!} docs={paperworkQuery.data || []} queryClient={queryClient} />
      )}
      {activeTab === "estimates" && (
        <EstimatesTab orderId={id!} estimates={estimatesQuery.data || []} order={order} queryClient={queryClient} />
      )}
      {activeTab === "changes" && (
        <ChangesTab orderId={id!} changes={changeOrdersQuery.data || []} order={order} queryClient={queryClient} />
      )}

      {/* ─── PROCESS CHECKLIST ───────────────────────────── */}
      <ProcessChecklist order={order} paperwork={paperworkQuery.data || []} timeline={timelineQuery.data || []} manufacturer={manufacturer} />

      {/* ─── QUICK ACTIONS ───────────────────────────────── */}
      <div className="mt-6 flex gap-2 flex-wrap">
        <button
          onClick={() => toast.info("Email integration coming in Phase 3")}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-catl-teal text-white text-sm font-semibold active:scale-[0.97] transition-transform"
        >
          <Mail size={16} /> Email Customer
        </button>
        <button
          onClick={() => toast.info("Email integration coming in Phase 3")}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-catl-teal text-catl-teal text-sm font-semibold active:scale-[0.97] transition-transform"
        >
          <Mail size={16} /> Email Manufacturer
        </button>
        <button
          onClick={() => {
            if (customer?.phone && /Mobi|Android/i.test(navigator.userAgent)) {
              window.open(`tel:${customer.phone}`);
            } else {
              toast.info(customer?.phone ? `Phone: ${customer.phone}` : "No phone number on file");
            }
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-catl-teal text-catl-teal text-sm font-semibold active:scale-[0.97] transition-transform"
        >
          <Phone size={16} /> Call Customer
        </button>
      </div>

      {/* ─── DELETE CONFIRMATION DIALOG ──────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-sm rounded-xl p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(212,24,61,0.1)" }}>
              <AlertTriangle size={24} style={{ color: "#D4183D" }} />
            </div>
            <AlertDialogHeader className="sm:text-center">
              <AlertDialogTitle className="text-base font-semibold" style={{ color: "#1A1A1A" }}>
                Delete this order?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] mt-1" style={{ color: "#717182" }}>
                This will permanently delete order {order.order_number} and all associated paperwork, timeline events, estimates, and change orders. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="mt-4 flex-row gap-2">
            <AlertDialogCancel className="flex-1 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrderMutation.mutate()}
              className="flex-1 active:scale-[0.97] transition-transform"
              style={{ backgroundColor: "#D4183D", color: "#fff" }}
              disabled={deleteOrderMutation.isPending}
            >
              {deleteOrderMutation.isPending ? "Deleting…" : "Delete order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: TIMELINE
// ═══════════════════════════════════════════════════════════════
function TimelineTab({ orderId, events, queryClient }: { orderId: string; events: any[]; queryClient: any }) {
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDesc, setNoteDesc] = useState("");

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: "note",
        title: noteTitle || "Note",
        description: noteDesc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      setShowNoteForm(false);
      setNoteTitle("");
      setNoteDesc("");
      toast.success("Note added");
    },
  });

  return (
    <div>
      {!showNoteForm ? (
        <button
          onClick={() => setShowNoteForm(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-catl-teal border border-catl-teal rounded-full px-4 py-2 mb-4 active:scale-[0.97] transition-transform"
        >
          <Plus size={14} /> Add note
        </button>
      ) : (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 space-y-2">
          <input
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Note title"
            className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none"
          />
          <textarea
            value={noteDesc}
            onChange={(e) => setNoteDesc(e.target.value)}
            placeholder="Details (optional)"
            rows={2}
            className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => addNoteMutation.mutate()}
              disabled={addNoteMutation.isPending}
              className="px-4 py-2 rounded-full bg-catl-gold text-catl-navy text-sm font-bold active:scale-[0.97] disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={() => setShowNoteForm(false)} className="text-sm text-muted-foreground px-3">Cancel</button>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timeline events yet.</p>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
          {events.map((ev) => (
            <TimelineEvent key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineEvent({ event }: { event: any }) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = eventDotColor(event.event_type);
  const dateStr = event.created_at ? format(new Date(event.created_at), "MMM d") : "";

  return (
    <div className="relative pb-5 pl-7">
      <div
        className="absolute left-0 top-1.5 w-[10px] h-[10px] rounded-full border-2 border-white"
        style={{ backgroundColor: dotColor, marginLeft: 4 }}
      />
      <div className="text-xs font-semibold text-foreground">{dateStr}</div>
      <div className="text-[13px] font-medium text-foreground">{event.title}</div>
      {event.description && (
        <p
          className={cn("text-xs text-muted-foreground mt-0.5", !expanded && "line-clamp-2 cursor-pointer")}
          onClick={() => setExpanded(!expanded)}
        >
          {event.description}
        </p>
      )}
      {event.created_by && event.created_by !== "user" && (
        <p className="text-[11px] text-muted-foreground italic mt-0.5">by {event.created_by}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: DOCUMENTS
// ═══════════════════════════════════════════════════════════════
function DocumentsTab({ orderId, docs, queryClient }: { orderId: string; docs: any[]; queryClient: any }) {
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
      const humanName = DOC_NAMES[docType] || docType;
      await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: "document_signed",
        title: `${humanName} completed`,
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
      {/* Progress */}
      <div className="mb-4">
        <p className="text-[13px] font-medium text-foreground mb-1">{complete} of {total} complete</p>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${total > 0 ? (complete / total) * 100 : 0}%`, backgroundColor: "#27AE60" }} />
        </div>
      </div>

      <DocSection title="Customer side" docs={customerDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
      <DocSection title="Vendor side" docs={vendorDocs} onComplete={(id, type) => markCompleteMutation.mutate({ docId: id, docType: type })} pending={markCompleteMutation.isPending} />
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

  return (
    <div className="mb-5">
      <h4 className="text-[13px] font-bold text-catl-navy uppercase tracking-wide mb-1">{title}</h4>
      <div className="h-px bg-border mb-2" />
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
          <div className="shrink-0">{statusIcon(doc.status)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground">{DOC_NAMES[doc.document_type] || doc.document_type}</div>
            {doc.status === "blocked" && doc.blocked_reason && (
              <div className="text-[11px] text-muted-foreground italic">{doc.blocked_reason}</div>
            )}
            {doc.status === "complete" && doc.completed_date && (
              <div className="text-[11px] text-muted-foreground">{fmtDate(doc.completed_date, true)}</div>
            )}
          </div>
          {(doc.status === "missing" || doc.status === "pending") && (
            <button
              onClick={() => onComplete(doc.id, doc.document_type)}
              disabled={pending}
              className="text-xs font-semibold text-catl-teal border border-catl-teal rounded-full px-3 py-1 active:scale-[0.97] transition-transform disabled:opacity-50 shrink-0"
            >
              Mark complete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: ESTIMATES
// ═══════════════════════════════════════════════════════════════
function EstimatesTab({ orderId, estimates, order, queryClient }: { orderId: string; estimates: any[]; order: any; queryClient: any }) {
  const [showForm, setShowForm] = useState(false);
  const [newShorthand, setNewShorthand] = useState(order.build_shorthand || "");
  const [newTotal, setNewTotal] = useState(String(order.customer_price || ""));
  const [newNotes, setNewNotes] = useState("");

  const maxVersion = estimates.length > 0 ? Math.max(...estimates.map((e) => e.version_number)) : 0;

  const createEstimateMutation = useMutation({
    mutationFn: async () => {
      const nextVersion = maxVersion + 1;
      const totalNum = parseFloat(newTotal);
      // Mark all existing as not current
      await supabase.from("estimates").update({ is_current: false }).eq("order_id", orderId);
      // Insert new
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
      // Update order
      await supabase.from("orders").update({
        current_estimate_version: nextVersion,
        build_shorthand: newShorthand,
        customer_price: totalNum,
      }).eq("id", orderId);
      // Timeline
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
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-catl-teal border border-catl-teal rounded-full px-4 py-2 mb-4 active:scale-[0.97] transition-transform"
        >
          <Plus size={14} /> New estimate version
        </button>
      ) : (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 space-y-2">
          <input value={newShorthand} onChange={(e) => setNewShorthand(e.target.value)} placeholder="Build shorthand" className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
          <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden">
            <span className="pl-3 text-muted-foreground text-sm">$</span>
            <input value={newTotal} onChange={(e) => setNewTotal(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Total price" className="flex-1 px-2 py-2 bg-transparent text-sm outline-none" />
          </div>
          <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={() => createEstimateMutation.mutate()} disabled={createEstimateMutation.isPending || !newTotal} className="px-4 py-2 rounded-full bg-catl-gold text-catl-navy text-sm font-bold active:scale-[0.97] disabled:opacity-50">Save</button>
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
    </div>
  );
}

function EstimateCard({ estimate }: { estimate: any }) {
  const [expanded, setExpanded] = useState(false);
  const isCurrent = estimate.is_current;
  const isApproved = estimate.is_approved;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  return (
    <div
      className={cn(
        "border rounded-xl p-3.5 bg-card",
        isCurrent || isApproved ? "border-catl-teal border-2" : "border-border opacity-50"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {isCurrent && <span className="text-[11px] font-bold text-catl-teal bg-catl-teal/10 px-2 py-0.5 rounded-full">Current</span>}
        {isApproved && <span className="text-[11px] font-bold text-catl-teal bg-catl-teal/10 px-2 py-0.5 rounded-full">Approved</span>}
        {!isCurrent && !isApproved && <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Superseded</span>}
      </div>
      <div className="text-sm font-semibold text-foreground">Estimate #{estimate.version_number}</div>
      <div className="text-[13px] font-medium" style={{ color: "#55BAAA" }}>{estimate.build_shorthand}</div>
      <div className="text-lg font-medium text-foreground mt-1">{fmtCurrency(estimate.total_price)}</div>
      <div className="text-xs text-muted-foreground">{fmtDate(estimate.created_at?.split("T")[0], true)}</div>

      {lineItems.length > 0 ? (
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-catl-teal mt-2">
          <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
          {expanded ? "Hide" : "Show"} line items
        </button>
      ) : (
        <p className="text-xs text-muted-foreground mt-2 italic">Line items will be added when the configurator is built</p>
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

// ═══════════════════════════════════════════════════════════════
// TAB 4: CHANGES
// ═══════════════════════════════════════════════════════════════
function ChangesTab({ orderId, changes, order, queryClient }: { orderId: string; changes: any[]; order: any; queryClient: any }) {
  const [showForm, setShowForm] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [via, setVia] = useState("Phone");
  const [description, setDescription] = useState("");
  const [priceImpact, setPriceImpact] = useState("");

  const maxNum = changes.length > 0 ? Math.max(...changes.map((c) => c.change_number)) : 0;
  const currentPrice = order.customer_price || 0;
  const impactNum = parseFloat(priceImpact) || 0;
  const newTotal = currentPrice + impactNum;

  const createChangeMutation = useMutation({
    mutationFn: async () => {
      const nextNum = maxNum + 1;
      const { error } = await supabase.from("change_orders").insert({
        order_id: orderId,
        change_number: nextNum,
        requested_by: requestedBy || "internal",
        requested_via: via,
        description,
        price_impact: impactNum,
        new_total: newTotal,
      });
      if (error) throw error;
      await supabase.from("orders").update({ customer_price: newTotal }).eq("id", orderId);
      await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: "change_order",
        title: `Change order #${nextNum}`,
        description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["change_orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      setShowForm(false);
      setRequestedBy("");
      setDescription("");
      setPriceImpact("");
      toast.success("Change order logged");
    },
  });

  return (
    <div>
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-catl-teal border border-catl-teal rounded-full px-4 py-2 mb-4 active:scale-[0.97] transition-transform"
        >
          <Plus size={14} /> Log change order
        </button>
      ) : (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 space-y-2">
          <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by (e.g. customer name or 'internal')" className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
          <select value={via} onChange={(e) => setVia(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none">
            <option>Phone</option><option>Email</option><option>In Person</option><option>Other</option>
          </select>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What changed?" rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none" />
          <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden">
            <span className="pl-3 text-muted-foreground text-sm">$</span>
            <input value={priceImpact} onChange={(e) => setPriceImpact(e.target.value.replace(/[^0-9.\-]/g, ""))} placeholder="+0.00 or -0.00" className="flex-1 px-2 py-2 bg-transparent text-sm outline-none" />
          </div>
          <div className="text-xs text-muted-foreground">New total: {fmtCurrency(newTotal)}</div>
          <div className="flex gap-2">
            <button onClick={() => createChangeMutation.mutate()} disabled={createChangeMutation.isPending || !description} className="px-4 py-2 rounded-full bg-catl-gold text-catl-navy text-sm font-bold active:scale-[0.97] disabled:opacity-50">Save</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-muted-foreground px-3">Cancel</button>
          </div>
        </div>
      )}

      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change orders yet.</p>
      ) : (
        <div className="space-y-3">
          {changes.map((co) => (
            <ChangeOrderCard key={co.id} co={co} orderId={orderId} queryClient={queryClient} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeOrderCard({ co, orderId, queryClient }: { co: any; orderId: string; queryClient: any }) {
  const allApplied = co.all_applied;

  const toggleField = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: boolean }) => {
      const { error } = await supabase.from("change_orders").update({ [field]: value }).eq("id", co.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["change_orders", orderId] });
    },
  });

  const cascadeItems = [
    { field: "applied_internal", label: "Internal configurator" },
    { field: "applied_customer_estimate", label: "Customer estimate" },
    { field: "applied_qb_estimate", label: "QuickBooks estimate" },
    { field: "applied_mfg_order", label: "Manufacturer order" },
    { field: "applied_qb_po", label: "QuickBooks PO" },
  ];

  if (allApplied) {
    return (
      <div className="border rounded-xl p-3.5 bg-card" style={{ borderColor: "#27AE60" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.1)" }}>Applied to all systems</span>
          <span className="text-[13px] font-semibold text-foreground flex-1">Change order #{co.change_number}</span>
          <span className="text-xs text-muted-foreground">{fmtDate(co.created_at?.split("T")[0])}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-3.5 bg-card" style={{ borderColor: "#E8863A" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#D4183D", backgroundColor: "rgba(212,24,61,0.1)" }}>Not applied everywhere</span>
      </div>
      <div className="text-[13px] font-semibold text-foreground">Change order #{co.change_number} — {fmtDate(co.created_at?.split("T")[0])}</div>
      <div className="text-xs text-muted-foreground mb-1">Requested by: {co.requested_by}{co.requested_via ? ` (${co.requested_via})` : ""}</div>
      <p className="text-[13px] text-foreground mb-1">{co.description}</p>
      <div className="flex gap-4 text-sm mb-3">
        <span className="font-medium" style={{ color: (co.price_impact || 0) >= 0 ? "#27AE60" : "#D4183D" }}>
          {(co.price_impact || 0) >= 0 ? "+" : "−"}${Math.abs(co.price_impact || 0).toLocaleString()}
        </span>
        <span className="font-medium text-foreground">Total: {fmtCurrency(co.new_total)}</span>
      </div>

      <div className="space-y-1.5">
        {cascadeItems.map((item) => (
          <label key={item.field} className="flex items-center gap-2.5 cursor-pointer py-1">
            <Checkbox
              checked={!!co[item.field]}
              onCheckedChange={(checked) => toggleField.mutate({ field: item.field, value: !!checked })}
              className="h-5 w-5"
            />
            <span className="text-sm text-foreground">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROCESS CHECKLIST
// ═══════════════════════════════════════════════════════════════
function ProcessChecklist({ order, paperwork, timeline, manufacturer }: { order: any; paperwork: any[]; timeline: any[]; manufacturer: any }) {
  const getDocStatus = (type: string) => paperwork.find((d) => d.document_type === type)?.status;
  const hasTimelineEvent = (type: string) => timeline.some((t) => t.event_type === type);
  const statusIdx = STATUS_ORDER.indexOf(order.status);

  const steps = [
    {
      name: "Customer created",
      done: !!order.customer_id,
      date: null,
    },
    {
      name: "Estimate created & sent",
      done: !!order.estimate_date,
      date: order.estimate_date,
    },
    {
      name: "Estimate approved (signed)",
      done: !!order.approved_date,
      date: order.approved_date,
    },
    {
      name: "Deposit received",
      done: getDocStatus("customer_deposit") === "complete",
      date: paperwork.find((d) => d.document_type === "customer_deposit")?.completed_date,
    },
    {
      name: "PO submitted to manufacturer",
      done: !!order.ordered_date,
      date: order.ordered_date,
    },
    {
      name: "Vendor sales order received",
      done: !!order.so_received_date,
      date: order.so_received_date,
      overdue: !!(order.ordered_date && !order.so_received_date && manufacturer?.avg_lead_days && differenceInDays(new Date(), new Date(order.ordered_date + "T00:00:00")) > manufacturer.avg_lead_days),
    },
    {
      name: "SO reconciled against PO",
      done: hasTimelineEvent("reconciled"),
      date: null,
    },
    {
      name: "Manufacturer completed & invoiced",
      done: getDocStatus("vendor_invoice_filed") === "complete",
      date: paperwork.find((d) => d.document_type === "vendor_invoice_filed")?.completed_date,
      overdue: !!(order.est_completion_date && new Date(order.est_completion_date + "T00:00:00") < new Date() && getDocStatus("vendor_invoice_filed") !== "complete"),
    },
    {
      name: "Bill entered in QB",
      done: getDocStatus("vendor_bill_entered") === "complete",
      date: paperwork.find((d) => d.document_type === "vendor_bill_entered")?.completed_date,
    },
    {
      name: "Freight arranged",
      done: statusIdx >= STATUS_ORDER.indexOf("freight_arranged"),
      date: null,
    },
    {
      name: "Delivered & customer invoiced",
      done: !!order.delivered_date && !!order.invoiced_date,
      date: order.delivered_date,
    },
    {
      name: "Payment received & closed",
      done: !!order.paid_date,
      date: order.paid_date,
    },
  ];

  return (
    <div className="mt-8">
      <h3 className="text-[13px] font-bold text-catl-navy uppercase tracking-wide mb-3">Process checklist</h3>
      <div className="space-y-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5">
            {step.done ? (
              <CheckCircle size={20} color="#27AE60" />
            ) : step.overdue ? (
              <AlertCircle size={20} color="#D4183D" />
            ) : (
              <Circle size={20} color="#D4D4D0" />
            )}
            <span className="flex-1 text-[13px] font-medium text-foreground">{step.name}</span>
            <span className={cn("text-xs", step.overdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
              {step.done && step.date ? fmtDate(step.date) : step.overdue ? "Overdue" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
