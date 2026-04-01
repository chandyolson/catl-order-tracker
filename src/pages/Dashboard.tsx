import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  CheckSquare, ShoppingCart, Warehouse, Mic, Send,
  MessageCircle, AlertTriangle,
} from "lucide-react";

/* ──────── types ──────── */
type Task = {
  id: string; title: string; description: string | null;
  status: string | null; priority: string | null; task_type: string | null;
  due_date: string | null; order_id: string | null; source_type: string | null;
  created_at: string | null;
};
type ChatMsg = { role: "user" | "assistant"; content: string };
type Order = {
  id: string; status: string; manufacturer_id: string | null; customer_id: string | null;
  from_inventory: boolean | null; qb_estimate_id: string | null; qb_po_id: string | null;
  qb_bill_id: string | null; qb_invoice_id: string | null;
  manufacturers: { name: string; short_name: string } | null;
};
type Estimate = { id: string; order_id: string | null; status: string };

/* ──────── helpers ──────── */
const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const priorityColors: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-catl-orange text-white",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted/50 text-muted-foreground",
};
const typeColors: Record<string, string> = {
  send_estimate: "bg-blue-100 text-blue-800",
  followup: "bg-blue-100 text-blue-800",
  inventory: "bg-green-100 text-green-800",
  paperwork: "bg-amber-100 text-amber-800",
};

const SUGGESTIONS = [
  "What needs attention today?",
  "Draft an estimate",
  "What did I promise?",
  "Available inventory",
  "Orders missing paperwork",
];

export default function Dashboard() {
  const navigate = useNavigate();

  /* ── metrics ── */
  const [openTasks, setOpenTasks] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [unsoldInv, setUnsoldInv] = useState(0);
  const [memosToday, setMemosToday] = useState(0);

  /* ── data ── */
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);

  /* ── chat ── */
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const greetingCalled = useRef(false);

  /* ── fetch helpers ── */
  const fetchMetrics = useCallback(async () => {
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("orders").select("*", { count: "exact", head: true }),
      supabase.from("orders").select("*", { count: "exact", head: true }).is("customer_id", null).eq("from_inventory", true),
      supabase.from("voice_memos").select("*", { count: "exact", head: true }).gte("created_at", todayISO),
    ]);
    setOpenTasks(r1.count ?? 0);
    setTotalOrders(r2.count ?? 0);
    setUnsoldInv(r3.count ?? 0);
    setMemosToday(r4.count ?? 0);
  }, []);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase.from("tasks").select("*").eq("status", "open").order("created_at", { ascending: false });
    const sorted = ((data as Task[]) || []).sort((a, b) => (priorityOrder[a.priority || "normal"] ?? 2) - (priorityOrder[b.priority || "normal"] ?? 2));
    setTasks(sorted);
  }, []);

  const fetchOrders = useCallback(async () => {
    const { data } = await (supabase.from("orders").select("id, status, manufacturer_id, customer_id, from_inventory, qb_estimate_id, qb_po_id, qb_bill_id, qb_invoice_id, manufacturers(name, short_name)") as any).order("created_at", { ascending: false });
    setOrders((data as Order[]) || []);
  }, []);

  const fetchEstimates = useCallback(async () => {
    const { data } = await supabase.from("estimates").select("id, order_id, status");
    setEstimates((data as Estimate[]) || []);
  }, []);

  /* ── initial load ── */
  useEffect(() => {
    fetchMetrics();
    fetchTasks();
    fetchOrders();
    fetchEstimates();
  }, [fetchMetrics, fetchTasks, fetchOrders, fetchEstimates]);

  /* ── realtime ── */
  useEffect(() => {
    const channel = supabase.channel("dashboard-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, () => { fetchTasks(); fetchMetrics(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "voice_memos" }, () => fetchMetrics())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks, fetchMetrics]);

  /* ── chat greeting ── */
  useEffect(() => {
    if (greetingCalled.current) return;
    greetingCalled.current = true;
    sendChat("Generate a brief morning greeting for Tim. Mention the most important thing he should know today.", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── scroll chat ── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  /* ── chat send ── */
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
      setChatHistory(prev => [...(isGreeting ? [] : prev), ...(isGreeting ? [] : []), { role: "assistant" as const, content: assistantMsg }]);
      if (!isGreeting) {
        setChatHistory(prev => prev); // already appended
      } else {
        setChatHistory([{ role: "assistant", content: assistantMsg }]);
      }
      // handle actions
      if (data?.actions?.length) {
        for (const action of data.actions) {
          if (action.type === "task_created") toast.success("Task created: " + (action.title || ""));
          else if (action.type === "note_logged") toast.success("Note saved");
          else if (action.type === "memo_linked") toast.success("Memo linked");
        }
        fetchTasks();
        fetchMetrics();
      }
    } catch {
      setChatHistory(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
    }
    setChatLoading(false);
  };

  /* ── task complete ── */
  const completeTask = async (id: string) => {
    await supabase.from("tasks").update({ status: "complete", completed_at: new Date().toISOString() } as any).eq("id", id);
    toast.success("Task completed");
    fetchTasks();
    fetchMetrics();
  };

  /* ── derived data ── */
  // Inventory by manufacturer
  const inventoryOrders = orders.filter(o => o.from_inventory);
  const byMfg = inventoryOrders.reduce<Record<string, { count: number; name: string; id: string }>>((acc, o) => {
    if (!o.manufacturer_id) return acc;
    if (!acc[o.manufacturer_id]) acc[o.manufacturer_id] = { count: 0, name: (o.manufacturers as any)?.short_name || "Unknown", id: o.manufacturer_id };
    acc[o.manufacturer_id].count++;
    return acc;
  }, {});
  const assignedCount = orders.filter(o => o.customer_id).length;

  // Pipeline counts
  const standaloneEstimates = estimates.filter(e => !e.order_id).length;
  const statusCounts: Record<string, number> = { estimate: standaloneEstimates };
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  }
  const pipelineStages = ["estimate", "order_pending", "building", "ready", "delivered", "closed"];
  const maxStage = pipelineStages.reduce((a, b) => (statusCounts[a] || 0) >= (statusCounts[b] || 0) ? a : b);

  // Paperwork gaps
  const activeOrders = orders.filter(o => !["estimate", "closed"].includes(o.status));
  const missingBill = activeOrders.filter(o => !o.qb_bill_id).length;
  const missingInvoice = activeOrders.filter(o => !o.qb_invoice_id).length;
  const missingPO = activeOrders.filter(o => !o.qb_po_id).length;
  const missingEstimate = activeOrders.filter(o => !o.qb_estimate_id).length;

  const stageLabels: Record<string, string> = {
    estimate: "Estimate", order_pending: "Pending", building: "Building",
    ready: "Ready", delivered: "Delivered", closed: "Closed",
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });


  return (
    <div className="flex gap-0 h-[calc(100vh-56px)] md:h-screen overflow-hidden -m-4 md:-m-8" style={{ minWidth: 0 }}>
      {/* ═══ LEFT — Dashboard ═══ */}
      <div className="flex-1 min-w-0 lg:min-w-[600px] overflow-y-auto p-4 md:p-8 bg-background">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-accent text-[11px] font-semibold uppercase tracking-[1.5px] mb-1">CATL Resources</p>
            <h1 className="text-[22px] font-medium text-primary">Equipment dashboard</h1>
          </div>
          <span className="text-sm text-muted-foreground">{dateStr}</span>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Open tasks", value: openTasks, icon: CheckSquare, to: "/tasks?status=open" },
            { label: "Active orders", value: totalOrders, icon: ShoppingCart, to: "/orders" },
            { label: "Unsold inventory", value: unsoldInv, icon: Warehouse, to: "/orders?filter=inventory" },
            { label: "Memos today", value: memosToday, icon: Mic, to: "/voice-memos" },
          ].map(m => (
            <button
              key={m.label}
              onClick={() => navigate(m.to)}
              className="bg-secondary rounded-lg p-3 text-left cursor-pointer transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-2 mb-2">
                <m.icon size={16} className="text-accent" />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-[22px] font-semibold text-primary">{m.value}</p>
            </button>
          ))}
        </div>

        {/* Action Items */}
        <div className="bg-card rounded-xl border border-border mb-6 shadow-none">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <span className="text-accent text-[11px] font-semibold uppercase tracking-[1.5px]">Action Items</span>
            <Badge variant="secondary" className="text-[10px] font-semibold rounded-full">{tasks.length}</Badge>
          </div>
          <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
            {tasks.slice(0, 15).map(t => {
              const isOverdue = t.due_date && new Date(t.due_date) < today;
              const isToday = t.due_date && new Date(t.due_date).toDateString() === today.toDateString();
              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-secondary transition-colors">
                  <Checkbox onCheckedChange={() => completeTask(t.id)} />
                  <button
                    onClick={() => t.order_id ? navigate(`/orders/${t.order_id}`) : undefined}
                    className="flex-1 text-sm text-left font-medium text-primary hover:text-accent truncate"
                  >
                    {t.title}
                  </button>
                  {t.priority && <Badge className={`text-[10px] font-semibold rounded-full ${priorityColors[t.priority] || ""}`}>{t.priority}</Badge>}
                  {t.task_type && <Badge className={`text-[10px] font-semibold rounded-full ${typeColors[t.task_type] || "bg-muted text-muted-foreground"}`}>{t.task_type}</Badge>}
                  {t.due_date && (
                    <span className={`text-[11px] ${isOverdue ? "text-destructive font-medium" : isToday ? "text-catl-gold font-medium" : "text-muted-foreground"}`}>
                      {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {t.source_type === "voice_memo" && <Mic size={12} className="text-muted-foreground" />}
                  {t.source_type === "chat" && <MessageCircle size={12} className="text-muted-foreground" />}
                </div>
              );
            })}
            {tasks.length === 0 && <p className="text-muted-foreground text-sm py-6 text-center">No open tasks</p>}
          </div>
        </div>

        {/* Inventory by Manufacturer */}
        <div className="mb-6">
          <p className="text-accent text-[11px] font-semibold uppercase tracking-[1.5px] mb-3">Inventory by Manufacturer</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(byMfg).map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/orders?manufacturer=${m.id}`)}
                className="bg-secondary rounded-lg px-4 py-3 cursor-pointer transition-colors hover:bg-muted"
              >
                <p className="text-xl font-semibold text-primary">{m.count}</p>
                <p className="text-xs text-muted-foreground">{m.name}</p>
              </button>
            ))}
            <button
              onClick={() => navigate("/orders?filter=assigned")}
              className="bg-secondary rounded-lg px-4 py-3 cursor-pointer transition-colors hover:bg-muted"
            >
              <p className="text-xl font-semibold text-primary">{assignedCount}</p>
              <p className="text-xs text-muted-foreground">With customer</p>
            </button>
            {Object.keys(byMfg).length === 0 && <p className="text-sm text-muted-foreground">No inventory orders</p>}
          </div>
        </div>

        {/* Pipeline */}
        <div className="bg-card rounded-xl border border-border p-5 mb-6 shadow-none">
          <p className="text-accent text-[11px] font-semibold uppercase tracking-[1.5px] mb-3">Order pipeline</p>
          <div className="space-y-2">
            {pipelineStages.filter(s => s !== "closed").map(stage => {
              const count = statusCounts[stage] || 0;
              const maxCount = Math.max(...pipelineStages.map(s => statusCounts[s] || 0), 1);
              const widthPercent = Math.max((count / maxCount) * 100, 0);
              const stageColors: Record<string, string> = {
                estimate: "hsl(var(--accent))",
                order_pending: "hsl(210 80% 55%)",
                building: "hsl(38 92% 50%)",
                ready: "hsl(160 60% 45%)",
                delivered: "hsl(var(--muted-foreground))",
              };
              return (
                <button
                  key={stage}
                  onClick={() => navigate(`/orders?status=${stage}`)}
                  className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-secondary cursor-pointer transition-colors w-full text-left"
                >
                  <span className="text-sm text-primary font-medium w-[140px] shrink-0">
                    {stageLabels[stage]}
                  </span>
                  <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: stageColors[stage] || "hsl(var(--accent))",
                        minWidth: count > 0 ? '24px' : '0px',
                      }}
                    />
                  </div>
                  <span className="text-lg font-semibold text-primary w-[40px] text-right">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Paperwork Gaps */}
        <div className="mb-6">
          <p className="text-accent text-[11px] font-semibold uppercase tracking-[1.5px] mb-3">Paperwork Gaps</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Missing estimate in QB", count: missingEstimate },
              { label: "Missing PO in QB", count: missingPO },
              { label: "Missing bill in QB", count: missingBill },
              { label: "Missing invoice in QB", count: missingInvoice },
            ].map(g => (
              <button
                key={g.label}
                onClick={() => navigate("/orders")}
                className="bg-card border border-border rounded-xl p-4 text-left cursor-pointer transition-colors hover:border-accent shadow-none"
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className={g.count > 0 ? "text-catl-gold" : "text-catl-green"} />
                  <span className="text-lg font-semibold text-primary">{g.count}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{g.label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — Chat Panel ═══ */}
      <div className="hidden lg:flex flex-col w-[380px] min-w-[360px] flex-shrink-0 border-l border-border bg-card">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Mic size={16} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">CATL assistant</p>
            <p className="text-[11px] text-accent">Online</p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-xl rounded-br-sm"
                    : "bg-secondary text-primary rounded-xl rounded-bl-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-xl rounded-bl-sm px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {/* Suggestion chips */}
        <div className="px-4 py-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.slice(0, 3).map(s => (
            <button
              key={s}
              onClick={() => setChatInput(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors bg-secondary"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-1">
          <form
            onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}
            className="flex gap-2"
          >
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask about orders, customers, inventory..."
              className="flex-1 text-sm bg-secondary border border-border rounded-full px-4 py-2.5 text-primary placeholder:text-muted-foreground focus:border-accent focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="w-10 h-10 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
