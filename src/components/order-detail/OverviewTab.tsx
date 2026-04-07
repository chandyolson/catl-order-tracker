import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import { toast } from "sonner";
import {
  Edit2, Check, X, Phone, Mail, ArrowRightCircle, ExternalLink,
  FileText, Users, Search, Trash2, Plus, FolderOpen, Mic, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TEAM = ["Tim", "Caleb", "Chandy", "Jen"];

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const DOC_LABELS: Record<string, string> = {
  customer_estimate_sent: "Send estimate to customer",
  customer_approved: "Customer approval",
  customer_deposit: "Collect deposit",
  customer_contract_signed: "Get contract signed",
  customer_notified: "Notify customer",
  customer_invoice_sent: "Send invoice",
  customer_payment_final: "Collect final payment",
  vendor_po_submitted: "Submit PO to manufacturer",
  vendor_deposit_sent: "Send deposit to manufacturer",
  vendor_so_received: "Receive SO from manufacturer",
  vendor_in_production: "Confirm in production",
  vendor_equipment_complete: "Equipment complete",
  vendor_invoice_received: "Receive manufacturer invoice",
  vendor_bill_paid: "Pay manufacturer bill",
  logistics_freight_arranged: "Arrange freight",
  logistics_delivered_to_yard: "Deliver to yard",
  logistics_ready_for_pickup: "Ready for customer pickup",
  logistics_delivered_to_customer: "Deliver to customer",
  customer_estimate_signed: "Get contract signed",
  vendor_po_signed: "Submit PO to manufacturer",
  vendor_invoice_filed: "File manufacturer invoice",
  vendor_bill_entered: "Enter manufacturer bill",
  manual_task: "Task",
};

interface OverviewTabProps {
  order: any;
  customer: any;
  manufacturer: any;
  baseModel: { name: string; short_name: string } | null | undefined;
  paperwork: any[];
  margin?: { amount: number; percent: number } | null;
  marginColor?: string;
  events?: any[];
  queryClient: any;
}

export default function OverviewTab({
  order, customer, manufacturer, baseModel, paperwork,
  margin, marginColor = "#717182", events = [], queryClient,
}: OverviewTabProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(order.notes || "");
  const [creatingPO, setCreatingPO] = useState(false);
  const [portalOrdered, setPortalOrdered] = useState(false);
  const [contractName, setContractName] = useState(order.contract_name || "");
  const [editingContractName, setEditingContractName] = useState(false);
  const [molyContractNum, setMolyContractNum] = useState(order.moly_contract_number || "");
  const [editingMolyNum, setEditingMolyNum] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [debouncedCustSearch, setDebouncedCustSearch] = useState("");
  const [editingDriveUrl, setEditingDriveUrl] = useState(false);
  const [driveUrl, setDriveUrl] = useState(order.google_drive_folder_url || "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("normal");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [unmatchedDriveFiles, setUnmatchedDriveFiles] = useState<{ id: string; name: string; url: string; size: string }[]>([]);
  const [linkingSlot, setLinkingSlot] = useState<string | null>(null);
  const [browseFiles, setBrowseFiles] = useState<{ id: string; name: string; url: string; size: string; mime_type?: string; subfolder?: string | null }[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSlot, setBrowseSlot] = useState<string | null>(null);
  const [convertingBill, setConvertingBill] = useState(false);
  const [convertingInvoice, setConvertingInvoice] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustSearch(custSearch), 300);
    return () => clearTimeout(t);
  }, [custSearch]);

  const custSearchQuery = useQuery({
    queryKey: ["customer-search-overview", debouncedCustSearch],
    queryFn: async () => {
      if (!debouncedCustSearch || debouncedCustSearch.length < 2) return [];
      const { data } = await supabase.from("customers").select("id, name, company, address_city, address_state").or(`name.ilike.%${debouncedCustSearch}%,company.ilike.%${debouncedCustSearch}%`).limit(6);
      return data || [];
    },
    enabled: debouncedCustSearch.length >= 2,
  });

  const slotsQuery = useQuery({
    queryKey: ["order_document_slots", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_document_slots").select("*, order_documents:document_id(id, file_url, file_name, title)").eq("order_id", order.id).order("slot_type");
      if (error) throw error;
      return data || [];
    },
  });

  const orderTasksQuery = useQuery({
    queryKey: ["order_tasks", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("order_id", order.id).order("status").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const orderMemosQuery = useQuery({
    queryKey: ["order_memos", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("voice_memos").select("*").eq("order_id", order.id).eq("archived", false).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const contactHistoryQuery = useQuery({
    queryKey: ["contact_history", order.id, (order as any).customer_id],
    queryFn: async () => {
      const customerId = (order as any).customer_id;
      if (!customerId) return [];
      const { data: emails } = await supabase
        .from("gmail_inbox")
        .select("id, from_name, from_email, to_email, subject, snippet, ai_summary, received_at, gmail_thread_id, matched_order_id")
        .eq("customer_id", customerId)
        .order("received_at", { ascending: false })
        .limit(25);
      const { data: orderEmails } = await supabase
        .from("gmail_inbox")
        .select("id, from_name, from_email, to_email, subject, snippet, ai_summary, received_at, gmail_thread_id, matched_order_id")
        .eq("matched_order_id", order.id)
        .order("received_at", { ascending: false })
        .limit(10);
      const all = [...(emails || []), ...(orderEmails || [])];
      const seen = new Set<string>();
      return all
        .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    },
    enabled: !!(order as any).customer_id,
  });

  const assignCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { error } = await supabase.from("orders").update({ customer_id: customerId }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order", order.id] }); setShowCustomerSearch(false); setCustSearch(""); toast.success("Customer assigned"); },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("orders").update({ notes }).eq("id", order.id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order", order.id] }); setEditingNotes(false); toast.success("Notes saved"); },
  });

  const saveContractNameMutation = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("orders").update({ contract_name: contractName || null } as any).eq("id", order.id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order", order.id] }); setEditingContractName(false); toast.success("Contract name saved"); },
  });

  const saveMolyNumMutation = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("orders").update({ moly_contract_number: molyContractNum || null }).eq("id", order.id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order", order.id] }); setEditingMolyNum(false); toast.success("MOLY contract # saved"); },
  });

  const saveDriveUrlMutation = useMutation({
    mutationFn: async () => {
      let folderId = driveUrl;
      const folderMatch = driveUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) folderId = folderMatch[1];
      const { error } = await supabase.from("orders").update({ google_drive_folder_url: driveUrl || null, google_drive_folder_id: folderId || null }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order", order.id] }); setEditingDriveUrl(false); toast.success("Drive folder linked"); },
    onError: (err: any) => toast.error(err.message || "Failed to save Drive URL"),
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      await supabase.from("orders").update({ status: "purchase_order", ordered_date: today, approved_date: today }).eq("id", order.id);
      await supabase.from("estimates").update({ is_approved: true, approved_date: today }).eq("order_id", order.id).eq("is_current", true);
      await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "status_change", title: "Estimate converted to order" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order", order.id] }); queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] }); toast.success("Converted to order"); if (manufacturer?.ordering_portal_url) window.open(manufacturer.ordering_portal_url, "_blank"); },
    onError: (err: any) => toast.error(err.message || "Failed to convert"),
  });

  const addTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from("tasks").insert({ order_id: order.id, title, status: "open", priority: newTaskPriority || "normal", assigned_to: newTaskAssignee || null, task_type: "manual_task", created_by: "user" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order_tasks", order.id] }); setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskPriority("normal"); setShowAddTask(false); toast.success("Task added"); },
    onError: (err: any) => toast.error(err.message || "Failed to add task"),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, done }: { taskId: string; done: boolean }) => {
      const { error } = await supabase.from("tasks").update({ status: done ? "complete" : "open", completed_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["order_tasks", order.id] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => { const { error } = await supabase.from("tasks").delete().eq("id", taskId); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["order_tasks", order.id] }); toast.success("Task removed"); },
  });

  async function handlePlaceOrderOnPortal() {
    if (manufacturer?.ordering_portal_url) window.open(manufacturer.ordering_portal_url, "_blank");
    try {
      await supabase.from("paperwork").update({ status: "complete", completed_date: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() }).eq("order_id", order.id).eq("document_type", "vendor_po_submitted");
      await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "note", title: "Order placed on manufacturer portal", created_by: "system" });
      setPortalOrdered(true);
      queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
      toast.success("Portal opened — marked as ordered");
    } catch { toast.error("Portal opened but failed to update paperwork"); }
  }

  async function handleCreateQBPO() {
    setCreatingPO(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("qb-push-po", { body: { order_id: order.id } });
      if (fnError) {
        // Try to parse the error response body for details
        const errMsg = data?.error || fnError.message || "Failed to create QB PO";
        toast.error(errMsg);
        if (data?.steps) console.error("QB PO steps:", data.steps);
        return;
      }
      if (data?.success) {
        toast.success(data.already_exists ? `QB PO exists: #${data.qb_po_doc_number}` : `QB PO #${data.qb_po_doc_number} created`);
        queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      } else toast.error(data?.error || "Failed to create QB PO");
    } catch (err: any) { toast.error(err.message || "Failed to create QB PO"); }
    finally { setCreatingPO(false); }
  }

  async function handleConvertPOToBill() {
    setConvertingBill(true);
    try {
      const { data, error } = await supabase.functions.invoke("qb-convert-po-to-bill", { body: { order_id: order.id } });
      if (error) { toast.error(data?.error || error.message || "Failed to create bill"); return; }
      if (data?.success) {
        toast.success(data.already_exists ? `QB Bill already exists: #${data.qb_bill_doc_number}` : `QB Bill #${data.qb_bill_doc_number} created from PO`);
        queryClient.invalidateQueries({ queryKey: ["order", order.id] });
        slotsQuery.refetch();
      } else toast.error(data?.error || "Failed to create QB Bill");
    } catch (err: any) { toast.error(err.message || "Failed to create QB Bill"); }
    finally { setConvertingBill(false); }
  }

  async function handleConvertEstimateToInvoice() {
    setConvertingInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke("qb-convert-estimate-to-invoice", { body: { order_id: order.id } });
      if (error) { toast.error(data?.error || error.message || "Failed to create invoice"); return; }
      if (data?.success) {
        toast.success(data.already_exists ? `QB Invoice already exists: #${data.qb_invoice_doc_number}` : `QB Invoice #${data.qb_invoice_doc_number} created from Estimate`);
        queryClient.invalidateQueries({ queryKey: ["order", order.id] });
        slotsQuery.refetch();
      } else toast.error(data?.error || "Failed to create QB Invoice");
    } catch (err: any) { toast.error(err.message || "Failed to create QB Invoice"); }
    finally { setConvertingInvoice(false); }
  }

  const isEstimate = order.source_type === "estimate" && order.status === "estimate";
  const isPortalDone = portalOrdered || paperwork.some((p) => p.document_type === "vendor_po_submitted" && p.status === "complete");
  const isQBPODone = !!order.qb_po_id;
  const canConvertToBill = !!order.qb_po_id && !order.qb_bill_id;
  const isQBBillDone = !!order.qb_bill_id;
  const canConvertToInvoice = !!order.qb_estimate_id && !order.qb_invoice_id && !!order.customer_id;
  const isQBInvoiceDone = !!order.qb_invoice_id;
  const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];
  const orderTasks = orderTasksQuery.data || [];
  const pendingTasks = orderTasks.filter((t: any) => t.status === "open");
  const completedTasks = orderTasks.filter((t: any) => t.status === "complete");
  const orderMemos = orderMemosQuery.data || [];
  const slots = slotsQuery.data || [];

  const slotConfig: Record<string, { label: string; color: string }> = {
    catl_estimate: { label: "CATL Estimate", color: "#B8930A" },
    approved_estimate: { label: "Approved Estimate", color: "#F3D12A" },
    catl_purchase_order: { label: "CATL Purchase Order", color: "#0E2646" },
    mfg_web_order: { label: "Mfg Web Order", color: "#55BAAA" },
    mfg_sales_order: { label: "Mfg Sales Order", color: "#3B82F6" },
    signed_sales_order: { label: "Signed Sales Order", color: "#1E40AF" },
    mfg_invoice: { label: "Mfg Invoice", color: "#8B5CF6" },
    qb_bill: { label: "QB Bill", color: "#EF4444" },
    catl_customer_invoice: { label: "Customer Invoice", color: "#27AE60" },
  };
  const slotOrder = ["catl_estimate", "approved_estimate", "catl_purchase_order", "mfg_web_order", "mfg_sales_order", "signed_sales_order", "mfg_invoice", "qb_bill", "catl_customer_invoice"];

  return (
    <div className="space-y-5">

      {/* ━━━ 1. CUSTOMER BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between gap-2" style={{ backgroundColor: "#F5F5F0" }}>
          {customer ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(39,174,96,0.15)" }}>
                  <span style={{ color: "#27AE60", fontSize: 11, fontWeight: 700 }}>✓</span>
                </span>
                <span className="text-[13px] font-semibold" style={{ color: "#0E2646" }}>{customer.name}</span>
                {(customer.address_city || customer.address_state) && (
                  <span className="text-[11px]" style={{ color: "#717182" }}>{[customer.address_city, customer.address_state].filter(Boolean).join(", ")}</span>
                )}
              </div>
              <button onClick={() => setShowCustomerSearch(true)} className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ color: "#717182", backgroundColor: "rgba(113,113,130,0.1)" }}>Change</button>
            </>
          ) : (
            <div className="w-full">
              {!showCustomerSearch ? (
                <button onClick={() => setShowCustomerSearch(true)} className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#55BAAA" }}><Users size={14} /> Assign a customer</button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers..." className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-[14px] outline-none text-[16px] bg-white" autoFocus />
                  </div>
                  {custSearchQuery.data && custSearchQuery.data.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden bg-white">
                      {custSearchQuery.data.map((c: any) => (
                        <div key={c.id} className="px-3 py-2 cursor-pointer hover:bg-muted/50 border-b border-border last:border-b-0" onClick={() => assignCustomerMutation.mutate(c.id)}>
                          <p className="text-[13px] font-medium text-foreground">{c.name}</p>
                          {(c.address_city || c.company) && <p className="text-[11px] text-muted-foreground">{[c.company, c.address_city, c.address_state].filter(Boolean).join(", ")}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => { setShowCustomerSearch(false); setCustSearch(""); }} className="text-[12px] text-muted-foreground">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Show search when changing customer on assigned orders */}
        {customer && showCustomerSearch && (
          <div className="px-4 pb-3 space-y-2" style={{ borderTop: "0.5px solid #EBEBEB" }}>
            <div className="relative mt-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customers..." className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-[14px] outline-none text-[16px] bg-white" autoFocus />
            </div>
            {custSearchQuery.data && custSearchQuery.data.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden bg-white">
                {custSearchQuery.data.map((c: any) => (
                  <div key={c.id} className="px-3 py-2 cursor-pointer hover:bg-muted/50 border-b border-border last:border-b-0" onClick={() => { assignCustomerMutation.mutate(c.id); setShowCustomerSearch(false); setCustSearch(""); }}>
                    <p className="text-[13px] font-medium text-foreground">{c.name}</p>
                    {(c.address_city || c.company) && <p className="text-[11px] text-muted-foreground">{[c.company, c.address_city, c.address_state].filter(Boolean).join(", ")}</p>}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setShowCustomerSearch(false); setCustSearch(""); }} className="text-[12px] text-muted-foreground">Cancel</button>
          </div>
        )}
      </div>

      {/* ━━━ 2. ORDER DETAILS + TASKS ━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LEFT: Order Details */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 h-12 flex items-center" style={{ backgroundColor: "#0E2646" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FFFFFF" }}>Order Details</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={order.source_type === "estimate" ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" } : { backgroundColor: "rgba(243,209,42,0.2)", color: "#8B7A0A" }}>
                {order.source_type === "estimate" ? "Estimate" : "Direct Order"}
              </span>
              {isEstimate && <button onClick={() => convertToOrderMutation.mutate()} disabled={convertToOrderMutation.isPending} className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}><ArrowRightCircle size={12} /> Convert</button>}
            </div>

            {(order.status === "purchase_order" || order.status === "order_pending") && (
              <div className="rounded-lg p-3" style={{ background: "rgba(85,186,170,0.06)", border: "1px solid rgba(85,186,170,0.2)" }}>
                <p className="text-[12px] text-muted-foreground mb-2">{order.status === "order_pending" ? `Waiting on ${manufacturer?.short_name || "manufacturer"}.` : "Place order, then create QB PO."}</p>
                <div className="flex gap-2 flex-wrap">
                  {manufacturer?.ordering_portal_url && <button onClick={isPortalDone ? undefined : handlePlaceOrderOnPortal} disabled={isPortalDone} className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-3 py-1.5" style={{ backgroundColor: isPortalDone ? "#27AE60" : "#F3D12A", color: isPortalDone ? "#fff" : "#0E2646" }}>{isPortalDone ? <><Check size={12} /> Portal ✓</> : <><ExternalLink size={12} /> Order</>}</button>}
                  <button onClick={isQBPODone ? undefined : handleCreateQBPO} disabled={creatingPO || isQBPODone} className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-3 py-1.5" style={{ backgroundColor: isQBPODone ? "#27AE60" : "#F3D12A", color: isQBPODone ? "#fff" : "#0E2646" }}>{isQBPODone ? <><Check size={12} /> QB PO #{order.qb_po_doc_number}</> : <><FileText size={12} /> {creatingPO ? "..." : "QB PO"}</>}</button>
                </div>
              </div>
            )}

            {baseModel && <div><span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Base Model</span><p className="text-[14px] font-medium text-foreground">{baseModel.name}</p></div>}

            <div className="grid grid-cols-3 gap-3">
              <div><span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Order #</span><p className="text-[13px] font-medium text-foreground mt-0.5">{order.order_number || "—"}</p></div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Contract Name</span>
                {editingContractName ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input value={contractName} onChange={(e) => setContractName(e.target.value)} className="flex-1 border border-border rounded-lg px-2 py-1 text-[13px] outline-none min-w-0 text-[16px]" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveContractNameMutation.mutate(); if (e.key === "Escape") { setContractName(order.contract_name || ""); setEditingContractName(false); }}} />
                    <button onClick={() => saveContractNameMutation.mutate()} className="p-1"><Check size={14} style={{ color: "#27AE60" }} /></button>
                    <button onClick={() => { setContractName(order.contract_name || ""); setEditingContractName(false); }} className="p-1"><X size={14} /></button>
                  </div>
                ) : <p className="text-[13px] font-medium cursor-pointer hover:text-[#55BAAA] mt-0.5" style={{ color: order.contract_name ? undefined : "#B4B2A9" }} onClick={() => setEditingContractName(true)}>{order.contract_name || "Click to name"}</p>}
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>MOLY #</span>
                {editingMolyNum ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input value={molyContractNum} onChange={(e) => setMolyContractNum(e.target.value)} className="flex-1 border border-border rounded-lg px-2 py-1 text-[13px] outline-none min-w-0 text-[16px]" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveMolyNumMutation.mutate(); if (e.key === "Escape") { setMolyContractNum(order.moly_contract_number || ""); setEditingMolyNum(false); }}} />
                    <button onClick={() => saveMolyNumMutation.mutate()} className="p-1"><Check size={14} style={{ color: "#27AE60" }} /></button>
                    <button onClick={() => { setMolyContractNum(order.moly_contract_number || ""); setEditingMolyNum(false); }} className="p-1"><X size={14} /></button>
                  </div>
                ) : <p className="text-[13px] font-medium cursor-pointer hover:text-[#55BAAA] mt-0.5" style={{ color: order.moly_contract_number ? undefined : "#B4B2A9" }} onClick={() => setEditingMolyNum(true)}>{order.moly_contract_number || "Pending"}</p>}
              </div>
            </div>

            {options.length > 0 && <div><span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Options</span><div className="flex flex-wrap gap-1 mt-1">{options.map((opt: any, i: number) => { const label = formatSavedOptionPill(opt); if (!label) return null; return <span key={i} className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium" style={!opt.is_included ? { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" } : { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>{label}</span>; })}</div></div>}

            {/* Freight, Discount, Dates */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Freight</span>
                <p className="text-[13px] font-medium mt-0.5" style={{ color: order.freight_estimate ? "#0E2646" : "#B4B2A9" }}>
                  {order.freight_estimate ? `$${Number(order.freight_estimate).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Discount</span>
                <p className="text-[13px] font-medium mt-0.5" style={{ color: order.discount_amount && parseFloat(order.discount_amount) > 0 ? "#0E2646" : "#B4B2A9" }}>
                  {order.discount_amount && parseFloat(order.discount_amount) > 0
                    ? `${order.discount_type === "%" ? `${order.discount_amount}%` : `$${Number(order.discount_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}`
                    : "None"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Est. Completion</span>
                <p className="text-[13px] font-medium mt-0.5" style={{ color: order.est_completion_date ? "#0E2646" : "#B4B2A9" }}>
                  {order.est_completion_date ? (() => {
                    const eta = new Date(order.est_completion_date + "T12:00:00");
                    const today = new Date();
                    today.setHours(12, 0, 0, 0);
                    const days = Math.round((eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const dateStr = eta.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    const relStr = days === 0 ? "today" : days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
                    const relColor = days < 0 ? "#D4183D" : days <= 7 ? "#F3D12A" : "#27AE60";
                    return (
                      <span>
                        {dateStr}{" "}
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: days < 0 ? "rgba(212,24,61,0.1)" : days <= 7 ? "rgba(243,209,42,0.15)" : "rgba(39,174,96,0.1)", color: relColor }}>
                          {relStr}
                        </span>
                      </span>
                    );
                  })() : "—"}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Notes</span>{!editingNotes && <button onClick={() => { setNotes(order.notes || ""); setEditingNotes(true); }} className="p-1" style={{ color: "#717182" }}><Edit2 size={12} /></button>}</div>
              {editingNotes ? (<div className="mt-1"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none resize-none" /><div className="flex gap-2 mt-1"><button onClick={() => saveNotesMutation.mutate()} className="p-1" style={{ color: "#27AE60" }}><Check size={16} /></button><button onClick={() => setEditingNotes(false)} className="p-1"><X size={16} /></button></div></div>) : (<p className="text-[13px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{order.notes || "No notes"}</p>)}
            </div>
          </div>
        </div>

        {/* RIGHT: Task List */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 h-12 flex items-center justify-between" style={{ backgroundColor: "#0E2646" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FFFFFF" }}>Tasks ({completedTasks.length}/{orderTasks.length})</h3>
            <button onClick={() => setShowAddTask(!showAddTask)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-[0.95] transition-transform" style={{ backgroundColor: "#55BAAA", color: "#fff" }}><Plus size={12} /> Add task</button>
          </div>
          <div className="p-3 space-y-1">
            {showAddTask && (
              <div className="mb-3 px-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="New task..." className="flex-1 border border-border rounded-lg px-3 py-2 text-[13px] outline-none text-[16px]" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim()) addTaskMutation.mutate(newTaskTitle.trim()); if (e.key === "Escape") { setShowAddTask(false); setNewTaskTitle(""); }}} />
                  <button onClick={() => { if (newTaskTitle.trim()) addTaskMutation.mutate(newTaskTitle.trim()); }} disabled={!newTaskTitle.trim()} className="px-3 py-2 rounded-lg text-[12px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#55BAAA" }}>Add</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold" style={{ color: "#717182" }}>Assign:</span>
                  {TEAM.map(name => (
                    <button key={name} onClick={() => setNewTaskAssignee(newTaskAssignee === name ? "" : name)}
                      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: newTaskAssignee === name ? "#0E2646" : "rgba(14,38,70,0.08)", color: newTaskAssignee === name ? "#F3D12A" : "#0E2646" }}>
                      {name}
                    </button>
                  ))}
                  <span className="text-[10px] font-semibold ml-2" style={{ color: "#717182" }}>Priority:</span>
                  {["urgent", "high", "normal"].map(p => (
                    <button key={p} onClick={() => setNewTaskPriority(p)}
                      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: newTaskPriority === p ? (p === "urgent" ? "#E8503A" : p === "high" ? "#F3D12A" : "#55BAAA") : "rgba(113,113,130,0.08)", color: newTaskPriority === p ? (p === "urgent" ? "#fff" : "#0E2646") : "#717182" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pendingTasks.map((task: any) => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date();
              const isEditing = editingTaskId === task.id;
              return (
                <div key={task.id}>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 group">
                    <button onClick={() => toggleTaskMutation.mutate({ taskId: task.id, done: true })} className="w-4 h-4 rounded border border-border shrink-0 hover:border-[#55BAAA]" />
                    <button onClick={() => setEditingTaskId(isEditing ? null : task.id)} className="text-[12px] text-foreground flex-1 text-left font-medium leading-snug min-w-0">{task.title}</button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {task.assigned_to && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>@{task.assigned_to}</span>}
                      {task.priority && task.priority !== "normal" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: task.priority === "urgent" ? "rgba(232,80,58,0.15)" : "rgba(243,209,42,0.2)", color: task.priority === "urgent" ? "#E8503A" : "#854F0B" }}>{task.priority}</span>}
                      {task.due_date && <span className="text-[10px]" style={{ color: isOverdue ? "#E8503A" : "#717182", fontWeight: isOverdue ? 600 : 400 }}>{new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                      {task.attachment_url && <a href={task.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Paperclip size={10} style={{ color: "#55BAAA" }} /></a>}
                    </div>
                    <button onClick={() => deleteTaskMutation.mutate(task.id)} className="p-0.5 opacity-0 group-hover:opacity-100"><Trash2 size={11} style={{ color: "#D4183D" }} /></button>
                  </div>
                  {isEditing && (
                    <div className="px-4 pb-2 pt-1 flex items-center gap-2 flex-wrap" style={{ backgroundColor: "#F9F9F7", borderBottom: "0.5px solid #F5F5F0" }}>
                      <span className="text-[10px] font-semibold" style={{ color: "#717182" }}>Assign:</span>
                      {TEAM.map(name => (
                        <button key={name} onClick={async () => {
                          const newVal = task.assigned_to === name ? null : name;
                          const { error } = await supabase.from("tasks").update({ assigned_to: newVal }).eq("id", task.id);
                          if (!error) { queryClient.invalidateQueries({ queryKey: ["order_tasks", order.id] }); toast.success(newVal ? `Assigned to ${newVal}` : "Unassigned"); }
                        }}
                          className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: task.assigned_to === name ? "#0E2646" : "rgba(14,38,70,0.08)", color: task.assigned_to === name ? "#F3D12A" : "#0E2646" }}>
                          {name}
                        </button>
                      ))}
                      <span className="text-[10px] font-semibold ml-2" style={{ color: "#717182" }}>Priority:</span>
                      {["urgent", "high", "normal", "low"].map(p => (
                        <button key={p} onClick={async () => {
                          const { error } = await supabase.from("tasks").update({ priority: p }).eq("id", task.id);
                          if (!error) queryClient.invalidateQueries({ queryKey: ["order_tasks", order.id] });
                        }}
                          className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: task.priority === p ? (p === "urgent" ? "#E8503A" : p === "high" ? "#F3D12A" : "#55BAAA") : "rgba(113,113,130,0.08)", color: task.priority === p ? (p === "urgent" ? "#fff" : "#0E2646") : "#717182" }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {completedTasks.length > 0 && (
              <>
                <div className="text-[10px] font-medium uppercase tracking-wider pt-2 px-2" style={{ color: "#717182" }}>Done</div>
                {completedTasks.map((task: any) => (
                  <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg group">
                    <button onClick={() => toggleTaskMutation.mutate({ taskId: task.id, done: false })} className="w-4 h-4 rounded border shrink-0 flex items-center justify-center" style={{ backgroundColor: "#27AE60", borderColor: "#27AE60" }}><Check size={10} className="text-white" /></button>
                    <span className="text-[12px] text-muted-foreground flex-1 line-through">{task.title}</span>
                    <button onClick={() => deleteTaskMutation.mutate(task.id)} className="p-0.5 opacity-0 group-hover:opacity-100"><Trash2 size={11} style={{ color: "#D4183D" }} /></button>
                  </div>
                ))}
              </>
            )}
            {orderTasks.length === 0 && <p className="text-[12px] text-muted-foreground px-2 py-3">No tasks yet</p>}
          </div>
        </div>
      </div>

      {/* ━━━ 3. CONTACT HISTORY (emails linked to this customer) ━━━ */}
      {(order as any).customer_id && (() => {
        const emails = contactHistoryQuery.data || [];
        const isLoading = contactHistoryQuery.isLoading;
        const TIM_EMAIL = "timselect@gmail.com";
        return (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 h-12 flex items-center gap-2" style={{ backgroundColor: "#0E2646" }}>
              <Mail size={12} style={{ color: "#55BAAA" }} />
              <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FFFFFF" }}>Contact History</h3>
              {emails.length > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>{emails.length}</span>
              )}
            </div>
            <div className="p-3 space-y-1.5">
              {isLoading && <p className="text-[12px] text-muted-foreground py-2 text-center">Loading emails…</p>}
              {!isLoading && emails.length === 0 && (
                <p className="text-[12px] py-2 text-center" style={{ color: "#717182" }}>
                  No emails on file for this customer yet.<br />
                  <span className="text-[11px]">Emails will appear here as Gmail syncs.</span>
                </p>
              )}
              {emails.map((email: any) => {
                const isInbound = email.from_email?.toLowerCase() !== TIM_EMAIL.toLowerCase();
                const displayName = isInbound ? (email.from_name || email.from_email) : `To: ${email.to_email}`;
                const date = email.received_at ? format(new Date(email.received_at), "MMM d, yyyy") : "";
                const summary = email.ai_summary || email.snippet || "";
                return (
                  <div key={email.id} className="rounded-lg p-3" style={{ backgroundColor: "#FAFAF8", border: "0.5px solid #EBEBEB" }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={isInbound
                            ? { backgroundColor: "rgba(85,186,170,0.12)", color: "#2e7e74" }
                            : { backgroundColor: "rgba(243,209,42,0.15)", color: "#9a7a00" }}>
                          {isInbound ? "↓ In" : "↑ Out"}
                        </span>
                        <span className="text-[11px] font-semibold truncate" style={{ color: "#0E2646" }}>{email.subject || "(no subject)"}</span>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: "#717182" }}>{date}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: "#717182" }}>{displayName}</p>
                    {summary && (
                      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "#333" }}>{summary.slice(0, 200)}{summary.length > 200 ? "…" : ""}</p>
                    )}
                    {email.matched_order_id && email.matched_order_id !== order.id && (
                      <p className="text-[10px] mt-1" style={{ color: "#55BAAA" }}>Also linked to another order</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ━━━ 4. TIMELINE + DOCUMENT CHAIN ━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LEFT: Timeline */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 h-12 flex items-center" style={{ backgroundColor: "#0E2646" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FFFFFF" }}>Timeline</h3>
          </div>
          <div className="p-3">
            {events.length === 0 ? <p className="text-[12px] text-muted-foreground px-2 py-4">No events yet</p> : (
              <div className="space-y-0">
                {events.map((ev, i) => {
                  const isLast = i === events.length - 1;
                  const evDate = ev.created_at ? format(new Date(ev.created_at), "MMM d, yyyy") : "";
                  const dotColors: Record<string, string> = { status_change: "#F3D12A", note: "#55BAAA", phone_call: "#3B82F6", email: "#8B5CF6", qb_event: "#27AE60", document: "#0E2646" };
                  return (
                    <div key={ev.id} className="flex gap-3 px-1">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dotColors[ev.event_type] || "#717182" }} />
                        {!isLast && <div className="w-px flex-1 bg-border" />}
                      </div>
                      <div className={cn("pb-4 flex-1 min-w-0", isLast && "pb-1")}>
                        <p className="text-[12px] font-medium text-foreground">{ev.title}</p>
                        {ev.description && <p className="text-[11px] text-muted-foreground mt-0.5">{ev.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{evDate}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Document Chain */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 h-12 flex items-center justify-between" style={{ backgroundColor: "#0E2646" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FFFFFF" }}>Document Chain</h3>
            <div className="flex items-center gap-2">
              {(order.qb_estimate_id || order.qb_po_id || order.qb_bill_id || order.qb_invoice_id) && (
                <button onClick={async (e) => {
                  const btn = e.currentTarget;
                  const origText = btn.textContent;
                  btn.textContent = "Syncing...";
                  btn.style.opacity = "0.6";
                  btn.disabled = true;
                  try {
                    const { data, error } = await supabase.functions.invoke("qb-check-sync", { body: { order_id: order.id } });
                    if (error) throw error;
                    if (data?.success) {
                      const downloadCount = data.downloads ? Object.values(data.downloads).filter((d: any) => d?.success).length : 0;
                      toast[data.has_issues ? "error" : "success"](
                        data.has_issues ? data.summary : `Synced! ${downloadCount} PDF(s) downloaded.`
                      );
                      slotsQuery.refetch();
                    } else {
                      toast.error(data?.error || "Sync failed");
                    }
                  } catch (err: any) { toast.error(err.message); }
                  finally { btn.textContent = origText || "QB Sync"; btn.style.opacity = "1"; btn.disabled = false; }
                }} className="text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors active:scale-[0.95]" style={{ backgroundColor: "#0E2646", color: "#F3D12A" }}>QB Sync</button>
              )}
              {order.google_drive_folder_id && (
                <button onClick={async (e) => {
                  const btn = e.currentTarget;
                  const origText = btn.textContent;
                  btn.textContent = "Scanning...";
                  btn.style.opacity = "0.6";
                  btn.disabled = true;
                  try {
                    const { data, error } = await supabase.functions.invoke("drive-scan-documents", { body: { order_id: order.id } });
                    if (error) throw error;
                    if (data?.success) {
                      toast[data.matched > 0 || data.updated > 0 ? "success" : "info"](data.summary);
                      if (data.unmatched_files?.length) setUnmatchedDriveFiles(data.unmatched_files);
                      else setUnmatchedDriveFiles([]);
                      slotsQuery.refetch();
                    } else {
                      toast.error(data?.error || "Scan failed");
                    }
                  } catch (err: any) { toast.error(err.message); }
                  finally { btn.textContent = origText || "Scan Drive"; btn.style.opacity = "1"; btn.disabled = false; }
                }} className="text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors active:scale-[0.95]" style={{ backgroundColor: "#55BAAA", color: "#fff" }}>Scan Drive</button>
              )}
              {order.google_drive_folder_url ? (
                <a href={order.google_drive_folder_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}><ExternalLink size={10} /> Drive</a>
              ) : <button onClick={() => setEditingDriveUrl(true)} className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "#55BAAA", color: "#FFFFFF" }}>+ Link Drive</button>}
            </div>
          </div>
          <div className="p-3 space-y-2">
            {editingDriveUrl && (
              <div className="space-y-2 mb-2">
                <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="Paste Drive folder URL..." className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none text-[16px]" autoFocus />
                <div className="flex gap-2">
                  <button onClick={() => saveDriveUrlMutation.mutate()} disabled={!driveUrl.trim()} className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#55BAAA" }}>Save</button>
                  <button onClick={() => { setEditingDriveUrl(false); setDriveUrl(order.google_drive_folder_url || ""); }} className="text-[12px] text-muted-foreground">Cancel</button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              {slotOrder.map((slotType) => {
                const slot = slots.find((s: any) => s.slot_type === slotType);
                const isFilled = slot?.is_filled;
                const doc = slot?.order_documents as any;
                const fileUrl = doc?.file_url;
                const isPending = isFilled && !fileUrl;
                const isComplete = isFilled && !!fileUrl;
                const cfg = slotConfig[slotType] || { label: slotType, color: "#717182" };
                const isDriveLink = fileUrl && (fileUrl.includes("drive.google.com") || fileUrl.includes("docs.google.com"));
                const qbSync: Record<string, string | undefined> = { catl_purchase_order: order.qb_po_sync_status, qb_bill: order.qb_bill_sync_status, catl_customer_invoice: order.qb_invoice_sync_status };
                const isOutOfSync = qbSync[slotType] === "out_of_sync";
                const isVoided = qbSync[slotType] === "voided";
                return (
                  <div key={slotType}>
                  <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors" style={{ backgroundColor: isVoided ? "rgba(212,24,61,0.04)" : isOutOfSync ? "rgba(243,161,42,0.06)" : isComplete ? "rgba(39,174,96,0.06)" : isPending ? "rgba(243,209,42,0.06)" : "rgba(113,113,130,0.04)", border: isOutOfSync ? "1px solid rgba(243,161,42,0.3)" : isVoided ? "1px solid rgba(212,24,61,0.2)" : "1px solid transparent" }}>
                    {/* Checkbox */}
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{
                      backgroundColor: isComplete ? "#27AE60" : isPending ? "#F3D12A" : isVoided ? "#D4183D" : "transparent",
                      border: isComplete || isPending || isVoided ? "none" : "2px solid #D1D5DB",
                    }}>
                      {isComplete && <Check size={12} color="#fff" strokeWidth={3} />}
                      {isPending && <span className="text-[10px] text-white font-bold">!</span>}
                      {isVoided && <X size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate" style={{ color: isComplete ? "#0E2646" : cfg.color }}>{cfg.label}{isOutOfSync && <span className="text-[9px] ml-1" style={{ color: "#B8930A" }}>⚡ out of sync</span>}</p>
                      {isComplete && slot.qb_doc_number && <p className="text-[10px] text-muted-foreground">#{slot.qb_doc_number}</p>}
                      {isPending && <p className="text-[10px]" style={{ color: "#B8930A" }}>In QB — click Sync to download</p>}
                    </div>
                    {/* Clickable file icon */}
                    {isComplete && fileUrl && (() => {
                      const driveMatch = fileUrl.match(/\/file\/d\/([^/]+)\//);
                      const fileId = driveMatch ? driveMatch[1] : null;
                      const downloadUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : fileUrl;
                      return (
                        <div className="flex items-center gap-1">
                          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/80 transition-colors active:scale-[0.95]" style={{ backgroundColor: "rgba(85,186,170,0.1)" }}>
                            <FileText size={14} style={{ color: "#55BAAA" }} />
                            <span className="text-[10px] font-bold" style={{ color: "#55BAAA" }}>View</span>
                          </a>
                          {fileId && (
                            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/80 transition-colors active:scale-[0.95]" style={{ backgroundColor: "rgba(243,209,42,0.1)" }}>
                              <span className="text-[10px] font-bold" style={{ color: "#9a7a00" }}>↓</span>
                            </a>
                          )}
                        </div>
                      );
                    })()}
                    {isComplete && (
                      <button onClick={async () => {
                        if (!confirm(`Unlink ${cfg.label}? The file won't be deleted, just removed from this slot.`)) return;
                        try {
                          const { error: slotErr } = await supabase.from("order_document_slots").update({
                            document_id: null, is_filled: false, filled_at: null, parsed_by: null, comparison_status: null, updated_at: new Date().toISOString(),
                          }).eq("id", slot.id);
                          if (slotErr) throw slotErr;
                          toast.success(`${cfg.label} unlinked`);
                          slotsQuery.refetch();
                        } catch (err: any) { toast.error(err.message); }
                      }} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors active:scale-[0.95]" title="Unlink document">
                        <X size={12} style={{ color: "#D4183D" }} />
                      </button>
                    )}
                    {order.google_drive_folder_url && (
                      <button onClick={async () => {
                        if (browseSlot === slotType) { setBrowseSlot(null); return; }
                        setBrowseSlot(slotType);
                        if (browseFiles.length === 0) {
                          setBrowseLoading(true);
                          try {
                            const { data, error } = await supabase.functions.invoke("list-drive-files", { body: { order_id: order.id } });
                            if (error) throw error;
                            if (data?.success) setBrowseFiles(data.files || []);
                            else toast.error(data?.error || "Failed to list files");
                          } catch (err: any) { toast.error(err.message); }
                          finally { setBrowseLoading(false); }
                        }
                      }} className="text-[10px] font-medium px-2 py-1 rounded-full transition-colors active:scale-[0.95] flex items-center gap-1" style={{ backgroundColor: browseSlot === slotType ? "#0E2646" : "rgba(14,38,70,0.08)", color: browseSlot === slotType ? "#F3D12A" : "#0E2646" }}>
                        <FolderOpen size={10} />Browse
                      </button>
                    )}
                    {!isFilled && !order.google_drive_folder_url && <span className="text-[10px] text-muted-foreground">No Drive folder</span>}
                  </div>
                  {/* Browse Drive file picker */}
                  {browseSlot === slotType && (
                    <div className="px-3 pb-2 space-y-1">
                      {browseLoading && <p className="text-[11px] text-muted-foreground py-2">Loading Drive files...</p>}
                      {!browseLoading && browseFiles.length === 0 && <p className="text-[11px] text-muted-foreground py-2">No files in Drive folder</p>}
                      {!browseLoading && browseFiles.map((f) => (
                        <button key={f.id} onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke("link-document-to-slot", {
                              body: { order_id: order.id, slot_type: slotType, drive_file_id: f.id, drive_file_name: f.name, drive_file_url: f.url }
                            });
                            if (error) throw error;
                            if (data?.success) {
                              toast.success(data.summary || `Linked ${f.name}`);
                              setBrowseSlot(null);
                              setBrowseFiles([]);
                              slotsQuery.refetch();
                            } else {
                              toast.error(data?.error || "Link failed");
                            }
                          } catch (err: any) { toast.error(err.message); }
                        }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/80 transition-colors text-[11px]" style={{ backgroundColor: "rgba(14,38,70,0.04)" }}>
                          <FileText size={12} style={{ color: "#0E2646" }} />
                          <div className="flex-1 min-w-0">
                            <span className="truncate block font-medium" style={{ color: "#0E2646" }}>{f.name}</span>
                            {f.subfolder && <span className="text-[9px] text-muted-foreground">in {f.subfolder}/</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
            {/* QB Conversion Actions */}
            {(canConvertToBill || canConvertToInvoice || isQBBillDone || isQBInvoiceDone) && (
              <div className="pt-2 mt-1 flex flex-wrap gap-2" style={{ borderTop: "1px solid #EBEBEB" }}>
                {canConvertToBill && (
                  <button onClick={handleConvertPOToBill} disabled={convertingBill}
                    className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-3 py-1.5 transition-colors active:scale-[0.95] disabled:opacity-50"
                    style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
                    <ArrowRightCircle size={12} /> {convertingBill ? "Creating..." : "PO → Bill"}
                  </button>
                )}
                {isQBBillDone && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-3 py-1.5" style={{ backgroundColor: "#27AE60", color: "#fff" }}>
                    <Check size={12} /> Bill #{order.qb_bill_doc_number}
                  </span>
                )}
                {canConvertToInvoice && (
                  <button onClick={handleConvertEstimateToInvoice} disabled={convertingInvoice}
                    className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-3 py-1.5 transition-colors active:scale-[0.95] disabled:opacity-50"
                    style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
                    <ArrowRightCircle size={12} /> {convertingInvoice ? "Creating..." : "Estimate → Invoice"}
                  </button>
                )}
                {isQBInvoiceDone && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-3 py-1.5" style={{ backgroundColor: "#27AE60", color: "#fff" }}>
                    <Check size={12} /> Invoice #{order.qb_invoice_doc_number}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ 4. VOICE MEMOS (linked to this order) ━━━━━━━━ */}
      {orderMemos.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 h-12 flex items-center gap-2" style={{ backgroundColor: "#0E2646" }}>
            <Mic size={12} style={{ color: "#F3D12A" }} />
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FFFFFF" }}>Voice Memos</h3>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(216,90,48,0.1)", color: "#D85A30" }}>{orderMemos.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {orderMemos.map((memo: any) => (
              <div key={memo.id} className="rounded-lg border border-border p-3" style={{ backgroundColor: "#FAFAF8" }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {memo.memo_type && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(216,90,48,0.1)", color: "#993C1D" }}>{memo.memo_type.replace(":", " · ")}</span>
                    )}
                    {memo.assigned_to && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>@{memo.assigned_to}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{memo.created_at ? format(new Date(memo.created_at), "MMM d") : ""}</span>
                </div>
                {memo.ai_summary && (
                  <p className="text-[12px] text-foreground leading-relaxed mb-1.5">{memo.ai_summary}</p>
                )}
                {memo.notes && (
                  <p className="text-[11px] italic" style={{ color: "#717182" }}>{memo.notes}</p>
                )}
                {memo.commitments && Array.isArray(memo.commitments) && memo.commitments.length > 0 && (
                  <div className="mt-1.5 pt-1.5" style={{ borderTop: "0.5px solid #EBEBEB" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#F3D12A" }}>Commitments</p>
                    {memo.commitments.map((c: any, i: number) => (
                      <p key={i} className="text-[11px]" style={{ color: "#0E2646" }}>• {typeof c === "string" ? c : c.description || c.text || JSON.stringify(c)}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {!memo.assigned_to && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px]" style={{ color: "#717182" }}>Assign:</span>
                      {TEAM.map(name => (
                        <button key={name} onClick={async () => {
                          const { error } = await supabase.from("voice_memos").update({ assigned_to: name } as any).eq("id", memo.id);
                          if (!error) { queryClient.invalidateQueries({ queryKey: ["order_memos", order.id] }); toast.success(`Memo assigned to ${name}`); }
                        }} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.06)", color: "#0E2646" }}>{name}</button>
                      ))}
                    </div>
                  )}
                  {memo.assigned_to && (
                    <button onClick={async () => {
                      const { error } = await supabase.from("voice_memos").update({ assigned_to: null } as any).eq("id", memo.id);
                      if (!error) { queryClient.invalidateQueries({ queryKey: ["order_memos", order.id] }); toast.success("Unassigned"); }
                    }} className="text-[9px] text-muted-foreground hover:text-foreground">Unassign</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

