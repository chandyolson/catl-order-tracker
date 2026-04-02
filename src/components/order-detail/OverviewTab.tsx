import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import { toast } from "sonner";
import {
  Edit2, Check, X, Phone, Mail, ArrowRightCircle, ExternalLink,
  FileText, Users, Search, Trash2, Plus, FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  const [unmatchedDriveFiles, setUnmatchedDriveFiles] = useState<{ id: string; name: string; url: string; size: string }[]>([]);
  const [linkingSlot, setLinkingSlot] = useState<string | null>(null);
  const [browseFiles, setBrowseFiles] = useState<{ id: string; name: string; url: string; size: string; mime_type?: string; subfolder?: string | null }[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSlot, setBrowseSlot] = useState<string | null>(null);

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
      const { error } = await supabase.from("paperwork").insert({ order_id: order.id, title, is_manual: true, status: "pending", side: "customer", document_type: "manual_task" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] }); setNewTaskTitle(""); setShowAddTask(false); toast.success("Task added"); },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, done }: { taskId: string; done: boolean }) => {
      const { error } = await supabase.from("paperwork").update({ status: done ? "complete" : "pending", completed_date: done ? new Date().toISOString().split("T")[0] : null, updated_at: new Date().toISOString() }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => { const { error } = await supabase.from("paperwork").delete().eq("id", taskId); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] }); toast.success("Task removed"); },
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
      if (fnError) throw new Error(fnError.message);
      if (data?.success) {
        toast.success(data.already_exists ? `QB PO exists: #${data.qb_po_doc_number}` : `QB PO #${data.qb_po_doc_number} created`);
        queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      } else toast.error(data?.error || "Failed to create QB PO");
    } catch (err: any) { toast.error(err.message || "Failed to create QB PO"); }
    finally { setCreatingPO(false); }
  }

  const isEstimate = order.source_type === "estimate" && order.status === "estimate";
  const isPortalDone = portalOrdered || paperwork.some((p) => p.document_type === "vendor_po_submitted" && p.status === "complete");
  const isQBPODone = !!order.qb_po_id;
  const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];
  const manualTasks = paperwork.filter((p) => p.is_manual);
  const pendingTasks = manualTasks.filter((p) => p.status === "pending" || p.status === "missing");
  const completedTasks = manualTasks.filter((p) => p.status === "complete");
  const slots = slotsQuery.data || [];

  const slotConfig: Record<string, { label: string; color: string }> = {
    catl_estimate: { label: "CATL Estimate", color: "#F3D12A" }, catl_purchase_order: { label: "Purchase Order", color: "#0E2646" },
    moly_sales_order: { label: "Mfg Sales Order", color: "#3B82F6" },
    moly_invoice: { label: "Mfg Invoice", color: "#8B5CF6" }, qb_bill: { label: "QB Bill", color: "#EF4444" },
    catl_customer_invoice: { label: "Customer Invoice", color: "#27AE60" },
  };
  const slotOrder = ["catl_estimate", "catl_purchase_order", "moly_sales_order", "moly_invoice", "qb_bill", "catl_customer_invoice"];

  return (
    <div className="space-y-5">

      {/* ━━━ 1. CUSTOMER BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#F5F5F0" }}>
          {customer ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white" style={{ backgroundColor: "#0E2646" }}>
                  {(customer.name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "#0E2646" }}>{customer.name}</p>
                  <p className="text-[11px] text-muted-foreground">{[customer.company, customer.address_city, customer.address_state].filter(Boolean).join(", ") || "Customer"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}><Phone size={12} /> {customer.phone}</a>}
                {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}><Mail size={12} /> Email</a>}
              </div>
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
      </div>

      {/* ━━━ 2. ORDER DETAILS + TASKS ━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LEFT: Order Details */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Order Details</h3>
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

            {options.length > 0 && <div><span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Options</span><div className="flex flex-wrap gap-1 mt-1">{options.map((opt: any, i: number) => { const label = formatSavedOptionPill(opt); if (!label) return null; return <span key={i} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium" style={!opt.is_included ? { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" } : { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>{label}</span>; })}</div></div>}

            <div>
              <div className="flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Notes</span>{!editingNotes && <button onClick={() => { setNotes(order.notes || ""); setEditingNotes(true); }} className="p-1" style={{ color: "#717182" }}><Edit2 size={12} /></button>}</div>
              {editingNotes ? (<div className="mt-1"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none resize-none" /><div className="flex gap-2 mt-1"><button onClick={() => saveNotesMutation.mutate()} className="p-1" style={{ color: "#27AE60" }}><Check size={16} /></button><button onClick={() => setEditingNotes(false)} className="p-1"><X size={16} /></button></div></div>) : (<p className="text-[13px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{order.notes || "No notes"}</p>)}
            </div>
          </div>
        </div>

        {/* RIGHT: Task List */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#F5F5F0" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Tasks ({completedTasks.length}/{manualTasks.length})</h3>
            <button onClick={() => setShowAddTask(!showAddTask)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-[0.95] transition-transform" style={{ backgroundColor: "#55BAAA", color: "#fff" }}><Plus size={12} /> Add task</button>
          </div>
          <div className="p-3 space-y-1">
            {showAddTask && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="New task..." className="flex-1 border border-border rounded-lg px-3 py-2 text-[13px] outline-none text-[16px]" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim()) addTaskMutation.mutate(newTaskTitle.trim()); if (e.key === "Escape") { setShowAddTask(false); setNewTaskTitle(""); }}} />
                <button onClick={() => { if (newTaskTitle.trim()) addTaskMutation.mutate(newTaskTitle.trim()); }} disabled={!newTaskTitle.trim()} className="px-3 py-2 rounded-lg text-[12px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#55BAAA" }}>Add</button>
              </div>
            )}
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 group">
                <button onClick={() => toggleTaskMutation.mutate({ taskId: task.id, done: true })} className="w-4 h-4 rounded border border-border shrink-0 hover:border-[#55BAAA]" />
                <span className="text-[12px] text-foreground flex-1">{task.title}</span>
                <button onClick={() => deleteTaskMutation.mutate(task.id)} className="p-0.5 opacity-0 group-hover:opacity-100"><Trash2 size={11} style={{ color: "#D4183D" }} /></button>
              </div>
            ))}
            {completedTasks.length > 0 && (
              <>
                <div className="text-[10px] font-medium uppercase tracking-wider pt-2 px-2" style={{ color: "#717182" }}>Done</div>
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg group">
                    <button onClick={() => toggleTaskMutation.mutate({ taskId: task.id, done: false })} className="w-4 h-4 rounded border shrink-0 flex items-center justify-center" style={{ backgroundColor: "#27AE60", borderColor: "#27AE60" }}><Check size={10} className="text-white" /></button>
                    <span className="text-[12px] text-muted-foreground flex-1 line-through">{task.title}</span>
                    <button onClick={() => deleteTaskMutation.mutate(task.id)} className="p-0.5 opacity-0 group-hover:opacity-100"><Trash2 size={11} style={{ color: "#D4183D" }} /></button>
                  </div>
                ))}
              </>
            )}
            {manualTasks.length === 0 && <p className="text-[12px] text-muted-foreground px-2 py-3">No tasks yet</p>}
          </div>
        </div>
      </div>

      {/* ━━━ 3. TIMELINE + DOCUMENT CHAIN ━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LEFT: Timeline */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Timeline</h3>
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
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#F5F5F0" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Document Chain</h3>
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
              ) : <button onClick={() => setEditingDriveUrl(true)} className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#854F0B" }}>+ Link Drive</button>}
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
                    {isComplete && fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/80 transition-colors active:scale-[0.95]" style={{ backgroundColor: "rgba(85,186,170,0.1)" }}>
                        <FileText size={14} style={{ color: "#55BAAA" }} />
                        <span className="text-[10px] font-bold" style={{ color: "#55BAAA" }}>View</span>
                      </a>
                    )}
                    {slot && !isFilled && !isVoided && order.google_drive_folder_url && (
                      <button onClick={async () => {
                        if (browseSlot === slotType) { setBrowseSlot(null); return; }
                        setBrowseSlot(slotType);
                        setLinkingSlot(null);
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
                    {slot && !isFilled && !isVoided && unmatchedDriveFiles.length > 0 && (
                      <button onClick={() => { setLinkingSlot(linkingSlot === slotType ? null : slotType); setBrowseSlot(null); }} className="text-[10px] font-medium px-2 py-1 rounded-full transition-colors active:scale-[0.95]" style={{ backgroundColor: linkingSlot === slotType ? "#55BAAA" : "rgba(85,186,170,0.1)", color: linkingSlot === slotType ? "#fff" : "#55BAAA" }}>
                        <Plus size={10} className="inline mr-0.5" />Link
                      </button>
                    )}
                    {!isFilled && !isVoided && unmatchedDriveFiles.length === 0 && !order.google_drive_folder_url && <span className="text-[10px] text-muted-foreground">—</span>}
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
                  {/* Unmatched file picker (from scan) */}
                  {linkingSlot === slotType && unmatchedDriveFiles.length > 0 && (
                    <div className="px-3 pb-2 space-y-1">
                      {unmatchedDriveFiles.map((f) => (
                        <button key={f.id} onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke("link-document-to-slot", {
                              body: { order_id: order.id, slot_type: slotType, drive_file_id: f.id, drive_file_name: f.name, drive_file_url: f.url }
                            });
                            if (error) throw error;
                            if (data?.success) {
                              toast.success(data.summary);
                              setLinkingSlot(null);
                              setUnmatchedDriveFiles(prev => prev.filter(uf => uf.id !== f.id));
                              slotsQuery.refetch();
                            } else {
                              toast.error(data?.error || "Link failed");
                            }
                          } catch (err: any) { toast.error(err.message); }
                        }} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/80 transition-colors text-[11px]" style={{ backgroundColor: "rgba(14,38,70,0.04)" }}>
                          <FileText size={12} style={{ color: "#0E2646" }} />
                          <span className="truncate flex-1 font-medium" style={{ color: "#0E2646" }}>{f.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
