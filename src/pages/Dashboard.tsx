import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  CheckSquare, Warehouse, Send, MessageCircle,
  AlertTriangle, Truck, TrendingUp, Mic, ChevronRight, Trash2, RefreshCw, Paperclip,
} from "lucide-react";

type Task = {
  id: string; title: string; description: string | null;
  status: string | null; priority: string | null; task_type: string | null;
  due_date: string | null; order_id: string | null; source_type: string | null;
  created_at: string | null; assigned_to: string | null;
  attachment_url: string | null; attachment_name: string | null; attachment_type: string | null;
};
type ChatMsg = { role: "user" | "assistant"; content: string; actions?: ActionButton[] };
type ActionButton = { label: string; route: string };
type Order = {
  id: string; status: string; manufacturer_id: string | null; customer_id: string | null;
  from_inventory: boolean | null; qb_estimate_id: string | null; qb_po_id: string | null;
  qb_bill_id: string | null; qb_invoice_id: string | null;
  manufacturers: { name: string; short_name: string } | null;
  base_models: { name: string; category: string | null } | null;
};
type Estimate = {
  id: string; order_id: string | null; status: string | null;
  estimate_number: string | null; contract_name: string | null;
  total_price: number | null; created_at: string; emailed_at: string | null;
  converted_to_order: boolean | null;
  customers: { name: string; company: string | null } | null;
};
type VoiceMemo = {
  id: string; transcript: string | null; ai_summary: string | null; created_at: string; processing_status: string | null; archived: boolean | null;
};

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function getLeadHeat(estimate: Estimate): "hot" | "warm" | "cold" {
  const daysSince = Math.floor((Date.now() - new Date(estimate.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const effective = estimate.emailed_at ? daysSince - 2 : daysSince;
  if (effective <= 7) return "hot";
  if (effective <= 14) return "warm";
  return "cold";
}

function heatColor(heat: "hot" | "warm" | "cold"): string {
  return heat === "hot" ? "#E8503A" : heat === "warm" ? "#F3D12A" : "#717182";
}

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 my-1.5 pl-3">
          {listItems.map((li, i) => (
            <li key={i} className="flex gap-1.5 items-start">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#55BAAA" }} />
              <span>{formatInline(li)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^\s*[-•*]\s+(.+)/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)/);

    if (bulletMatch || numberedMatch) {
      inList = true;
      listItems.push(bulletMatch ? bulletMatch[1] : numberedMatch![1]);
    } else {
      flushList();
      if (line.trim() === "") {
        if (i > 0 && i < lines.length - 1) {
          elements.push(<div key={`br-${i}`} className="h-1.5" />);
        }
      } else {
        elements.push(<p key={`p-${i}`} className="my-0.5">{formatInline(line)}</p>);
      }
    }
  }
  flushList();

  return <div>{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function fmt$(n: number | null): string {
  if (!n) return "—";
  return "$" + Math.round(n).toLocaleString();
}

const SUGGESTIONS = [
  "Who needs a call today?",
  "Draft a follow-up email",
  "What inventory is available?",
  "Orders missing paperwork",
];

const stageLabels: Record<string, string> = {
  estimate: "Estimate", order_pending: "Pending", building: "Building",
  ready: "Ready", delivered: "Delivered",
};
const stageColors: Record<string, string> = {
  estimate: "#F3D12A", order_pending: "#55BAAA",
  building: "#0E2646", ready: "#27AE60", delivered: "#717182",
};
const pipelineStages = ["estimate", "order_pending", "building", "ready", "delivered"];
const categoryLabels: Record<string, string> = {
  chute: "Chutes", alley: "Alleys", processor: "Processors",
  corral: "Corrals", panel: "Panels", gate: "Gates", other: "Other",
};
const priorityColors: Record<string, string> = {
  urgent: "bg-[#FDECEA] text-[#D4183D]", high: "bg-[#FFF8E1] text-[#854F0B]",
  normal: "bg-gray-100 text-gray-600", low: "bg-gray-50 text-gray-400",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [openEstimates, setOpenEstimates] = useState<Estimate[]>([]);
  const [recentMemos, setRecentMemos] = useState<VoiceMemo[]>([]);
  const [openTaskCount, setOpenTaskCount] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssign, setNewTaskAssign] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("normal");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [savingNewTask, setSavingNewTask] = useState(false);
  const TEAM = ["Tim", "Caleb", "Chandy", "Jen"];
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(searchParams.get("chat") === "open");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const greetingCalled = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecRef = useRef<any>(null);

  const fetchAll = useCallback(async () => {
    const [tasksRes, ordersRes, estimatesRes, memosRes, taskCountRes, readyRes] =
      await Promise.all([
        supabase.from("tasks").select("*").eq("status", "open").order("created_at", { ascending: false }),
        (supabase.from("orders").select(
          "id, status, manufacturer_id, customer_id, from_inventory, qb_estimate_id, qb_po_id, qb_bill_id, qb_invoice_id, manufacturers(name, short_name), base_models(name, category)"
        ) as any).order("created_at", { ascending: false }),
        (supabase.from("estimates").select(
          "id, order_id, status, estimate_number, contract_name, total_price, created_at, emailed_at, converted_to_order, customers(name, company)"
        ) as any)
          .eq("converted_to_order", false)
          .not("status", "in", '("closed","rejected")')
          .order("created_at", { ascending: false })
          .limit(15),
        supabase.from("voice_memos").select("id, transcript, ai_summary, created_at, processing_status, archived")
          .eq("processing_status", "complete").or("archived.is.null,archived.eq.false")
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "ready"),
      ]);

    const sorted = ((tasksRes.data as Task[]) || []).sort(
      (a, b) => (priorityOrder[a.priority || "normal"] ?? 2) - (priorityOrder[b.priority || "normal"] ?? 2)
    );
    setTasks(sorted);
    setOrders((ordersRes.data as Order[]) || []);
    setOpenEstimates((estimatesRes.data as Estimate[]) || []);
    setRecentMemos((memosRes.data as VoiceMemo[]) || []);
    setOpenTaskCount(taskCountRes.count ?? 0);
    setReadyCount(readyRes.count ?? 0);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const ch = supabase.channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_memos" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "estimates" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  useEffect(() => {
    if (greetingCalled.current) return;
    greetingCalled.current = true;
    sendChat("Generate a brief greeting for Tim based on the current time of day. Use bullet points for any lists. Mention the most important thing he should focus on right now based on overdue tasks, open estimates, orders ready to deliver, and any unlinked voice memos.", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const sendChat = async (message: string, isGreeting = false) => {
    if (!message.trim()) return;
    const newHistory = isGreeting ? [] : [...chatHistory, { role: "user" as const, content: message }];
    if (!isGreeting) setChatHistory(newHistory);
    setChatLoading(true);
    setChatInput("");
    try {
      const { data, error } = await supabase.functions.invoke("chat-assistant", {
        body: { message, history: newHistory },
      });
      if (error) throw error;
      const assistantMsg = data?.response || "Sorry, I couldn't process that.";
      const lower = assistantMsg.toLowerCase();
      const actions: ActionButton[] = [];
      if (lower.includes("estimate") || lower.includes("quote") || lower.includes("draft")) {
        actions.push({ label: "New estimate →", route: "/estimates/new" });
      }
      if (lower.includes("order") || lower.includes("inventory")) {
        actions.push({ label: "View orders →", route: "/equipment" });
      }
      if (lower.includes("task")) {
        actions.push({ label: "View tasks →", route: "/tasks" });
      }
      const newMsg: ChatMsg = { role: "assistant", content: assistantMsg, actions };
      setChatHistory(isGreeting ? [newMsg] : prev => [...prev, newMsg]);
      if (data?.actions?.length) {
        for (const action of data.actions) {
          if (action.type === "task_created" && action.success) toast.success("✅ Task created: " + (action.title || ""));
          else if (action.type === "note_logged" && action.success) toast.success("✅ Note logged");
          else if (action.type === "memo_linked" && action.success) toast.success("✅ Memo linked to " + (action.customer || "customer"));
          else if (action.type === "timeline_added" && action.success) toast.success("✅ Timeline event added: " + (action.title || ""));
          else if (action.type === "status_updated" && action.success) toast.success(`✅ ${action.order}: ${action.from} → ${action.to}`);
          else if (!action.success) toast.error(`Failed: ${action.type} — ${action.error || "unknown error"}`);
        }
        fetchAll();
      }
    } catch {
      setChatHistory(prev => [
        ...(isGreeting ? [] : prev),
        { role: "assistant", content: "Sorry, something went wrong." },
      ]);
    }
    setChatLoading(false);
  };

  const completeTask = async (id: string) => {
    await supabase.from("tasks").update({ status: "complete", completed_at: new Date().toISOString() } as any).eq("id", id);
    toast.success("Task completed");
    fetchAll();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Task deleted");
    fetchAll();
  };

  const createNewTask = async () => {
    if (!newTaskTitle.trim()) return;
    setSavingNewTask(true);
    const { error } = await supabase.from("tasks").insert({
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      assigned_to: newTaskAssign || null,
      due_date: newTaskDueDate || null,
      status: "open",
      source_type: "manual",
      task_type: "manual_task",
      created_by: "tim",
    } as any);
    setSavingNewTask(false);
    if (error) { toast.error("Failed to create task"); return; }
    toast.success("Task created");
    setNewTaskTitle("");
    setNewTaskAssign("");
    setNewTaskPriority("normal");
    setNewTaskDueDate("");
    setShowNewTask(false);
    fetchAll();
  };

  const deleteMemo = async (id: string) => {
    if (!confirm("Archive this voice memo?")) return;
    await supabase.from("voice_memos").update({ archived: true } as any).eq("id", id);
    toast.success("Memo archived");
    fetchAll();
  };

  const refreshMemos = async () => {
    toast.info("Checking for new memos...");
    const { data, error } = await supabase.functions.invoke("drive-watch-memos", { body: {} });
    if (error) { toast.error("Refresh failed"); return; }
    if (data?.results?.length > 0) {
      const r = data.results[0];
      toast.success(r.success ? `Processed: ${r.summary || r.file}` : (r.error || "Processing..."));
    } else if (data?.mode === "retry_stuck") {
      toast.success("Retried a stuck memo");
    } else {
      toast.info(data?.message || "No new memos");
    }
    fetchAll();
  };

  // Derived
  const unsoldInventory = orders.filter(o => o.from_inventory && !o.customer_id);
  const unsoldTotal = unsoldInventory.length;
  const invByCategory: Record<string, number> = {};
  for (const o of unsoldInventory) {
    const cat = (o.base_models as any)?.category || "other";
    invByCategory[cat] = (invByCategory[cat] || 0) + 1;
  }

  const statusCounts: Record<string, number> = { estimate: openEstimates.length };
  for (const o of orders) { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; }

  const activeOrders = orders.filter(o => !["delivered", "closed"].includes(o.status));
  const missingBill = activeOrders.filter(o => !o.qb_bill_id).length;
  const missingInvoice = activeOrders.filter(o => !o.qb_invoice_id).length;
  const missingPO = activeOrders.filter(o => !o.qb_po_id).length;
  const missingEstimate = activeOrders.filter(o => !o.qb_estimate_id).length;

  const leads = [...openEstimates].sort((a, b) => {
    const hOrder = { hot: 0, warm: 1, cold: 2 };
    const hA = getLeadHeat(a), hB = getLeadHeat(b);
    if (hOrder[hA] !== hOrder[hB]) return hOrder[hA] - hOrder[hB];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const hotCount = leads.filter(l => getLeadHeat(l) === "hot").length;
  const warmCount = leads.filter(l => getLeadHeat(l) === "warm").length;
  const coldCount = leads.filter(l => getLeadHeat(l) === "cold").length;
  const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < today).length;
  const maxPipeCount = Math.max(...pipelineStages.map(s => statusCounts[s] || 0), 1);

  // Segmented pipeline: count orders per stage by manufacturer
  const mfgColors: Record<string, string> = {
    "MOLY": "#0E2646", "Moly": "#0E2646", "Silencer": "#0E2646",
    "DAN": "#55BAAA", "Daniels": "#55BAAA",
    "RAW": "#F3D12A", "Rawhide": "#F3D12A",
    "MJE": "#8B5CF6", "Conquistador": "#8B5CF6",
    "LEM": "#E8503A", "Rupp": "#E8503A",
    "LINN": "#717182", "Linn": "#717182",
  };
  const pipelineSegments: Record<string, { mfg: string; count: number; color: string }[]> = {};
  for (const stage of pipelineStages) {
    const stageOrders = orders.filter(o => o.status === stage);
    const mfgCounts: Record<string, number> = {};
    for (const o of stageOrders) {
      const mfgName = o.manufacturers?.short_name || o.manufacturers?.name || "Other";
      mfgCounts[mfgName] = (mfgCounts[mfgName] || 0) + 1;
    }
    pipelineSegments[stage] = Object.entries(mfgCounts).map(([mfg, count]) => ({
      mfg, count, color: mfgColors[mfg] || "#717182",
    })).sort((a, b) => b.count - a.count);
  }

  return (
    <div className="flex gap-3 lg:h-[calc(100vh)] lg:overflow-hidden lg:-m-8 lg:-mt-8" style={{ minWidth: 0, background: "#F5F5F0" }}>

      {/* LEFT — mobile: natural page flow. Desktop: scrolls inside flex with chat */}
      <div className="flex-1 min-w-0 lg:overflow-y-auto lg:p-6" style={{ background: "#F5F5F0" }}>

        {/* Header — same width as content cards */}
        <div className="rounded-xl mb-4 px-5 py-4 flex items-center justify-between"
          style={{ background: "linear-gradient(180deg, #153566 0%, #081020 100%)" }}>
          <div>
            <p className="text-[10px] font-semibold tracking-widest mb-0.5" style={{ color: "#55BAAA" }}>CATL RESOURCES</p>
            <h1 className="text-[17px] font-bold text-white leading-tight">Equipment Manager</h1>
          </div>
          <div className="text-right">
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{dateStr}</p>
            <p className="text-[11px] font-bold tracking-widest mt-0.5" style={{ color: "#F3D12A" }}>CATL</p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Open Estimates */}
          <button onClick={() => navigate("/leads")}
            className="rounded-xl p-4 text-left active:scale-[0.97] transition-transform"
            style={{ background: "linear-gradient(150deg, #0E2646 0%, #0D4A40 60%, #55BAAA 100%)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp size={11} style={{ color: "rgba(255,255,255,0.45)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Open Estimates</span>
            </div>
            <p className="text-[26px] font-semibold text-white leading-none mb-2" style={{ letterSpacing: "-0.02em" }}>{openEstimates.length}</p>
            <div className="flex items-center gap-3">
              {hotCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#E8503A" }} /><span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{hotCount} hot</span></span>}
              {warmCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#F3D12A" }} /><span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{warmCount} warm</span></span>}
              {coldCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#717182" }} /><span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{coldCount} cold</span></span>}
              {openEstimates.length === 0 && <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>No open estimates</span>}
            </div>
          </button>

          {/* Ready to Deliver */}
          <button onClick={() => navigate("/equipment?tab=assigned")}
            className="rounded-xl p-4 text-left active:scale-[0.97] transition-transform"
            style={{ background: "linear-gradient(150deg, #0E2646 0%, #0A3020 60%, #22763A 100%)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Truck size={11} style={{ color: "rgba(255,255,255,0.45)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Ready to Deliver</span>
            </div>
            <p className="text-[26px] font-semibold text-white leading-none mb-2" style={{ letterSpacing: "-0.02em" }}>{readyCount}</p>
            <p className="text-[11px]" style={{ color: readyCount > 0 ? "#6EE7A0" : "rgba(255,255,255,0.35)" }}>
              {readyCount > 0 ? "Awaiting customer pickup" : "None staged yet"}
            </p>
          </button>

          {/* Unsold Inventory */}
          <button onClick={() => navigate("/equipment?tab=instock")}
            className="rounded-xl p-4 text-left active:scale-[0.97] transition-transform"
            style={{ background: "linear-gradient(150deg, #0E2646 0%, #163A5E 60%, #1E5A7A 100%)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Warehouse size={11} style={{ color: "rgba(255,255,255,0.45)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Unsold Inventory</span>
            </div>
            <p className="text-[26px] font-semibold text-white leading-none mb-2" style={{ letterSpacing: "-0.02em" }}>{unsoldTotal}</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(invByCategory).map(([cat, count]) => (
                <span key={cat} className="text-[10px] rounded px-1.5 py-0.5"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)" }}>
                  {count} {categoryLabels[cat] || cat}
                </span>
              ))}
              {unsoldTotal === 0 && <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Nothing on the lot</span>}
            </div>
          </button>

          {/* Open Tasks */}
          <button onClick={() => navigate("/dashboard")}
            className="rounded-xl p-4 text-left active:scale-[0.97] transition-transform"
            style={{ background: overdueCount > 0
              ? "linear-gradient(150deg, #0E2646 0%, #3A0E0E 60%, #7A1A1A 100%)"
              : "linear-gradient(150deg, #0E2646 0%, #163A5E 60%, #1E5A7A 100%)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckSquare size={11} style={{ color: "rgba(255,255,255,0.45)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Open Tasks</span>
            </div>
            <p className="text-[26px] font-semibold text-white leading-none mb-2" style={{ letterSpacing: "-0.02em" }}>{openTaskCount}</p>
            <p className="text-[11px]" style={{ color: overdueCount > 0 ? "#FFA07A" : "rgba(255,255,255,0.35)" }}>
              {overdueCount > 0 ? `${overdueCount} overdue` : "All current"}
            </p>
          </button>
        </div>

        {/* Follow-up Leads */}
        <div className="bg-white rounded-xl mb-4 overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "#0E2646" }}>Follow-up Leads</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#F5F5F0", color: "#0E2646" }}>{leads.length}</span>
            <span className="text-[10px] ml-auto" style={{ color: "#717182" }}>sorted by priority</span>
          </div>
          {leads.length === 0 && <p className="text-sm text-center py-6" style={{ color: "#717182" }}>No open estimates</p>}
          {leads.slice(0, 6).map(lead => {
            const heat = getLeadHeat(lead);
            const customerName = (lead.customers as any)?.company || (lead.customers as any)?.name || "Unknown Customer";
            const daysSince = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
            return (
              <button key={lead.id} onClick={() => navigate(`/estimates/${lead.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F9F9F7] active:scale-[0.99] transition-all"
                style={{ borderBottom: "0.5px solid #F5F5F0" }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: heatColor(heat) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "#1A1A1A" }}>{customerName}</p>
                  <p className="text-[11px] truncate" style={{ color: "#717182" }}>
                    {lead.contract_name || lead.estimate_number || "Estimate"} · {lead.emailed_at ? "estimate sent" : "not yet emailed"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[12px] font-bold" style={{ color: "#0E2646" }}>{fmt$(lead.total_price)}</p>
                  <p className="text-[11px]" style={{ color: daysSince > 14 ? "#E8503A" : "#717182" }}>{daysAgo(lead.created_at)}</p>
                </div>
                <ChevronRight size={14} style={{ color: "#D4D4D0", flexShrink: 0 }} />
              </button>
            );
          })}
        </div>

        {/* Order Pipeline */}
        <div className="bg-white rounded-xl mb-4 overflow-hidden" style={{ border: "0.5px solid #D4D4D0" }}>
          <div className="px-4 py-3" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <span className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "#0E2646" }}>Order Pipeline</span>
          </div>
          <div className="py-1">
            {pipelineStages.map(stage => {
              const count = statusCounts[stage] || 0;
              const widthPct = Math.max((count / maxPipeCount) * 100, 0);
              return (
                <button key={stage} onClick={() => navigate(`/orders?status=${stage}`)}
                  className="flex items-center gap-3 w-full px-4 py-2 hover:bg-[#F9F9F7] active:scale-[0.99] transition-all text-left">
                  <span className="text-[12px] font-medium w-[85px] flex-shrink-0" style={{ color: "#1A1A1A" }}>{stageLabels[stage]}</span>
                  <div className="flex-1 h-6 rounded-md overflow-hidden flex" style={{ background: "#F5F5F0" }}>
                    {(pipelineSegments[stage] || []).map((seg, si) => {
                      const segPct = (seg.count / maxPipeCount) * 100;
                      return (
                        <div key={si} className="h-full transition-all duration-500 first:rounded-l-md last:rounded-r-md"
                          style={{ width: `${segPct}%`, background: seg.color, minWidth: seg.count > 0 ? "8px" : "0" }}
                          title={`${seg.mfg}: ${seg.count}`} />
                      );
                    })}
                  </div>
                  <span className="text-[14px] font-bold w-8 text-right" style={{ color: count > 0 ? "#0E2646" : "#D4D4D0" }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tasks — full width */}
        <div className="bg-white rounded-xl overflow-hidden mb-4" style={{ border: "0.5px solid #D4D4D0" }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <CheckSquare size={12} style={{ color: "#55BAAA" }} />
            <span className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "#0E2646" }}>Tasks</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#F5F5F0", color: "#0E2646" }}>{tasks.length}</span>
            <button onClick={() => setShowNewTask(!showNewTask)} className="ml-auto w-6 h-6 rounded-full flex items-center justify-center active:scale-[0.95] transition-transform"
              style={{ backgroundColor: showNewTask ? "#D4183D" : "#F3D12A", color: showNewTask ? "#fff" : "#0E2646" }}>
              {showNewTask ? <span className="text-sm leading-none">&times;</span> : <span className="text-sm leading-none">+</span>}
            </button>
          </div>
          {/* Inline quick-add */}
          {showNewTask && (
            <div className="px-4 py-3 space-y-2" style={{ backgroundColor: "#FAFAF7", borderBottom: "0.5px solid #EBEBEB" }}>
              <form onSubmit={e => { e.preventDefault(); createNewTask(); }} className="flex gap-2 items-center">
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="What needs doing?"
                  className="flex-1 min-w-0 text-[13px] rounded-lg px-3 py-2 bg-white outline-none"
                  style={{ border: "0.5px solid #D4D4D0", color: "#0E2646" }}
                  autoFocus
                />
                <button type="submit" disabled={!newTaskTitle.trim() || savingNewTask}
                  className="text-[11px] font-bold px-4 py-2 rounded-full active:scale-[0.97] transition-transform disabled:opacity-40"
                  style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
                  {savingNewTask ? "…" : "Add"}
                </button>
              </form>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold" style={{ color: "#717182" }}>Assign:</span>
                {TEAM.map(name => (
                  <button key={name} onClick={() => setNewTaskAssign(newTaskAssign === name ? "" : name)}
                    className="text-[10px] font-bold px-2 py-1 rounded-full transition-colors"
                    style={{ backgroundColor: newTaskAssign === name ? "#0E2646" : "rgba(14,38,70,0.08)", color: newTaskAssign === name ? "#F3D12A" : "#0E2646" }}>
                    {name}
                  </button>
                ))}
                <span className="text-[10px] font-semibold ml-3" style={{ color: "#717182" }}>Priority:</span>
                {["urgent", "high", "normal"].map(p => (
                  <button key={p} onClick={() => setNewTaskPriority(p)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${newTaskPriority === p ? (priorityColors[p] || "") : ""}`}
                    style={newTaskPriority !== p ? { backgroundColor: "rgba(113,113,130,0.08)", color: "#717182" } : {}}>
                    {p}
                  </button>
                ))}
                <span className="text-[10px] font-semibold ml-3" style={{ color: "#717182" }}>Due:</span>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={e => setNewTaskDueDate(e.target.value)}
                  className="text-[10px] px-2 py-1 rounded-lg bg-white outline-none"
                  style={{ border: "0.5px solid #D4D4D0", color: "#0E2646" }}
                />
              </div>
            </div>
          )}
          <div>
            {tasks.map(t => {
              const isOverdue = t.due_date && new Date(t.due_date) < today;
              const isToday = t.due_date && new Date(t.due_date).toDateString() === today.toDateString();
              const isEditing = editingTaskId === t.id;
              return (
                <div key={t.id}>
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-[#F9F9F7] transition-colors group"
                    style={{ borderBottom: isEditing ? "none" : "0.5px solid #F5F5F0" }}>
                    <Checkbox onCheckedChange={() => completeTask(t.id)} className="flex-shrink-0 h-3.5 w-3.5" />
                    <button onClick={() => setEditingTaskId(isEditing ? null : t.id)}
                      className="flex-1 text-[13px] text-left font-medium leading-snug min-w-0" style={{ color: "#1A1A1A" }}>
                      {t.title}
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {t.priority && t.priority !== "normal" && (
                        <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${priorityColors[t.priority] || ""}`}>{t.priority}</span>
                      )}
                      {t.assigned_to && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
                          @{t.assigned_to}
                        </span>
                      )}
                      {t.due_date && (
                        <span className="text-[10px] whitespace-nowrap"
                          style={{ color: isOverdue ? "#E8503A" : isToday ? "#F3D12A" : "#717182", fontWeight: isOverdue ? 600 : 400 }}>
                          {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {t.attachment_url && (
                        <a href={t.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          <Paperclip size={10} style={{ color: "#55BAAA" }} />
                        </a>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }} className="p-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 size={11} style={{ color: "#D4183D" }} /></button>
                  </div>
                  {/* Inline edit panel */}
                  {isEditing && (
                    <div className="px-4 pb-3 pt-1 flex items-center gap-2 flex-wrap" style={{ backgroundColor: "#F9F9F7", borderBottom: "0.5px solid #F5F5F0" }}>
                      <span className="text-[10px] font-semibold" style={{ color: "#717182" }}>Assign:</span>
                      {TEAM.map(name => (
                        <button key={name} onClick={async () => {
                          const newVal = t.assigned_to === name ? null : name;
                          await supabase.from("tasks").update({ assigned_to: newVal } as any).eq("id", t.id);
                          setTasks(prev => prev.map(tk => tk.id === t.id ? { ...tk, assigned_to: newVal } : tk));
                          toast.success(newVal ? `Assigned to ${newVal}` : "Unassigned");
                        }}
                          className="text-[10px] font-bold px-2 py-1 rounded-full transition-colors"
                          style={{ backgroundColor: t.assigned_to === name ? "#0E2646" : "rgba(14,38,70,0.08)", color: t.assigned_to === name ? "#F3D12A" : "#0E2646" }}>
                          {name}
                        </button>
                      ))}
                      <span className="text-[10px] font-semibold ml-3" style={{ color: "#717182" }}>Priority:</span>
                      {["urgent", "high", "normal", "low"].map(p => (
                        <button key={p} onClick={async () => {
                          await supabase.from("tasks").update({ priority: p } as any).eq("id", t.id);
                          setTasks(prev => prev.map(tk => tk.id === t.id ? { ...tk, priority: p } : tk));
                        }}
                          className={`text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${t.priority === p ? priorityColors[p] || "" : ""}`}
                          style={t.priority !== p ? { backgroundColor: "rgba(113,113,130,0.08)", color: "#717182" } : {}}>
                          {p}
                        </button>
                      ))}
                      {t.order_id && (
                        <button onClick={() => navigate(`/orders/${t.order_id}`)} className="text-[10px] font-medium ml-auto" style={{ color: "#55BAAA" }}>
                          Go to order →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {tasks.length === 0 && <p className="text-sm text-center py-5" style={{ color: "#717182" }}>No open tasks</p>}
          </div>
        </div>

        {/* Recent Memos — full width */}
        <div className="bg-white rounded-xl overflow-hidden mb-4" style={{ border: "0.5px solid #D4D4D0" }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid #EBEBEB" }}>
            <Mic size={12} style={{ color: "#55BAAA" }} />
            <span className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "#0E2646" }}>Recent Memos</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#F5F5F0", color: "#0E2646" }}>{recentMemos.length}</span>
            <button onClick={refreshMemos} className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full active:scale-[0.95] transition-transform" style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}><RefreshCw size={10} className="inline mr-1" />Refresh</button>
          </div>
          {recentMemos.length === 0 && <p className="text-sm text-center py-4" style={{ color: "#717182" }}>No recent memos</p>}
          {recentMemos.map(memo => (
            <div key={memo.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-[#F9F9F7] transition-colors group"
              style={{ borderBottom: "0.5px solid #F5F5F0" }}>
              <Mic size={11} style={{ color: "#55BAAA", flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: "#1A1A1A" }}>
                  {memo.ai_summary ? memo.ai_summary.slice(0, 120) + (memo.ai_summary.length > 120 ? "…" : "") : memo.transcript ? memo.transcript.slice(0, 100) + (memo.transcript.length > 100 ? "…" : "") : "Processing…"}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "#717182" }}>
                  {formatTime(memo.created_at)}
                </p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteMemo(memo.id); }} className="p-1 opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 size={11} style={{ color: "#D4183D" }} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — Chat */}
      <div className="hidden lg:flex flex-col w-[440px] min-w-[420px] flex-shrink-0 overflow-hidden"
        style={{ background: "#F5F5F0" }}>
        <div className="px-3 pt-3 md:px-4 md:pt-4 flex-shrink-0">
          <div className="rounded-xl px-5 py-4 flex items-center gap-3"
            style={{ background: "linear-gradient(180deg, #153566 0%, #081020 100%)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#55BAAA" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" fill="#fff" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">CATL Assistant</p>
              <p className="text-[11px]" style={{ color: "#55BAAA" }}>Online</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col mx-3 mt-3 mb-3 md:mx-4 md:mb-4 rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid #D4D4D0" }}>
        <ScrollArea className="flex-1 px-5 py-4">
          <div className="space-y-3">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className="max-w-[90%] px-3.5 py-2.5 text-[13px] leading-relaxed rounded-xl"
                  style={msg.role === "user"
                    ? { background: "#0E2646", color: "#fff", borderBottomRightRadius: 4, overflowWrap: "break-word", wordBreak: "break-word" }
                    : { background: "#F5F5F0", color: "#1A1A1A", borderBottomLeftRadius: 4, overflowWrap: "break-word", wordBreak: "break-word" }}>
                  {msg.role === "user" ? msg.content : <FormattedMessage text={msg.content} />}
                </div>
                {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[90%]">
                    {msg.actions.map((action, ai) => (
                      <button key={ai} onClick={() => navigate(action.route)}
                        className="text-[11px] font-bold rounded-full px-3 py-1 active:scale-[0.97] transition-transform"
                        style={{ background: "#F3D12A", color: "#0E2646" }}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm px-4 py-3 flex gap-1" style={{ background: "#F5F5F0" }}>
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: "#717182", animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        <div className="px-5 py-2 flex flex-wrap gap-1.5 flex-shrink-0" style={{ borderTop: "0.5px solid #EBEBEB" }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setChatInput(s)}
              className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
              style={{ border: "0.5px solid #D4D4D0", color: "#717182", background: "#F5F5F0" }}>
              {s}
            </button>
          ))}
        </div>

        <div className="px-5 pb-4 pt-2 flex-shrink-0">
          <form onSubmit={e => { e.preventDefault(); sendChat(chatInput); }} className="flex gap-2 items-center flex-nowrap">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              placeholder="Ask about orders, leads, inventory..."
              className="flex-1 min-w-0 text-[12px] rounded-full px-4 py-2.5 transition-colors focus:outline-none"
              style={{ background: "#F5F5F0", border: "0.5px solid #D4D4D0", color: "#1A1A1A" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#F3D12A"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(243,209,42,0.2)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#D4D4D0"; e.currentTarget.style.boxShadow = "none"; }} />
            <button type="button" onClick={() => {
              if (isRecording) {
                mediaRecorderRef.current?.stop();
                setIsRecording(false);
              } else {
                navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                  const mr = new MediaRecorder(stream);
                  mediaRecorderRef.current = mr;
                  const chunks: Blob[] = [];
                  mr.ondataavailable = e => chunks.push(e.data);
                  mr.onstop = async () => {
                    stream.getTracks().forEach(t => t.stop());
                    const blob = new Blob(chunks, { type: "audio/webm" });
                    // Use browser SpeechRecognition if available, otherwise send to process-voice-memo
                    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                      // Already handled by recognition below
                    } else {
                      setChatInput("(Voice memo recorded — processing...)");
                    }
                  };
                  mr.start();
                  setIsRecording(true);
                  // Also start SpeechRecognition for live transcription
                  try {
                    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (SpeechRec) {
                      const recognition = new SpeechRec();
                      recognition.continuous = false;
                      recognition.interimResults = false;
                      recognition.lang = "en-US";
                      recognition.onresult = (event: any) => {
                        const transcript = event.results[0][0].transcript;
                        setChatInput(transcript);
                      };
                      recognition.onerror = () => {};
                      recognition.onend = () => {
                        mr.stop();
                        setIsRecording(false);
                      };
                      recognition.start();
                      speechRecRef.current = recognition;
                    }
                  } catch {}
                }).catch(() => toast.error("Microphone access denied"));
              }
            }}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
              style={{ background: isRecording ? "#D4183D" : "#F5F5F0", border: isRecording ? "none" : "0.5px solid #D4D4D0" }}>
              <Mic size={15} color={isRecording ? "#fff" : "#717182"} />
            </button>
            <button type="submit" disabled={chatLoading || !chatInput.trim()}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 flex-shrink-0"
              style={{ background: "#55BAAA" }}>
              <Send size={15} color="#fff" />
            </button>
          </form>
        </div>
        </div>
      </div>

      {/* MOBILE — Floating chat button (visible below lg breakpoint) */}
      {!mobileChatOpen && (
        <button
          onClick={() => setMobileChatOpen(true)}
          className="lg:hidden fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          style={{ background: "linear-gradient(180deg, #153566 0%, #081020 100%)" }}>
          <MessageCircle size={22} color="#55BAAA" />
        </button>
      )}

      {/* MOBILE — Full-screen chat overlay */}
      {mobileChatOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col" style={{ background: "#F5F5F0" }}>
          {/* Header */}
          <div className="px-4 pt-4 flex-shrink-0">
            <div className="rounded-xl px-5 py-4 flex items-center gap-3"
              style={{ background: "linear-gradient(180deg, #153566 0%, #081020 100%)" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#55BAAA" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" fill="#fff" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-white">CATL Assistant</p>
                <p className="text-[11px]" style={{ color: "#55BAAA" }}>Online</p>
              </div>
              <button onClick={() => setMobileChatOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.1)" }}>
                <span className="text-white text-lg leading-none">&times;</span>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col mx-4 mt-3 mb-3 rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid #D4D4D0" }}>
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-3">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className="max-w-[90%] px-3.5 py-2.5 text-[13px] leading-relaxed rounded-xl"
                      style={msg.role === "user"
                        ? { background: "#0E2646", color: "#fff", borderBottomRightRadius: 4, overflowWrap: "break-word", wordBreak: "break-word" }
                        : { background: "#F5F5F0", color: "#1A1A1A", borderBottomLeftRadius: 4, overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {msg.role === "user" ? msg.content : <FormattedMessage text={msg.content} />}
                    </div>
                    {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[90%]">
                        {msg.actions.map((action, ai) => (
                          <button key={ai} onClick={() => { setMobileChatOpen(false); navigate(action.route); }}
                            className="text-[11px] font-bold rounded-full px-3 py-1 active:scale-[0.97] transition-transform"
                            style={{ background: "#F3D12A", color: "#0E2646" }}>
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-xl rounded-bl-sm px-4 py-3 flex gap-1" style={{ background: "#F5F5F0" }}>
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-2 h-2 rounded-full animate-bounce"
                          style={{ background: "#717182", animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Suggestions */}
            <div className="px-5 py-2 flex flex-wrap gap-1.5 flex-shrink-0" style={{ borderTop: "0.5px solid #EBEBEB" }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setChatInput(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
                  style={{ border: "0.5px solid #D4D4D0", color: "#717182", background: "#F5F5F0" }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-5 pb-4 pt-2 flex-shrink-0">
              <form onSubmit={e => { e.preventDefault(); sendChat(chatInput); }} className="flex gap-2 items-center flex-nowrap">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  placeholder="Ask about orders, leads, inventory..."
                  className="flex-1 min-w-0 text-[13px] rounded-full px-4 py-2.5 transition-colors focus:outline-none"
                  style={{ background: "#F5F5F0", border: "0.5px solid #D4D4D0", color: "#1A1A1A" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#F3D12A"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(243,209,42,0.2)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#D4D4D0"; e.currentTarget.style.boxShadow = "none"; }} />
                <button type="submit" disabled={chatLoading || !chatInput.trim()}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 flex-shrink-0"
                  style={{ background: "#55BAAA" }}>
                  <Send size={15} color="#fff" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
