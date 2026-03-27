import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, startOfWeek, endOfWeek, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { Search, LayoutGrid, List, CalendarIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import StatusBadge from "@/components/StatusBadge";

const ACTIVE_STATUSES = ["estimate", "approved", "ordered", "so_received", "in_production", "completed", "freight_arranged", "delivered"];

const BOARD_COLUMNS = [
  { status: "estimate", label: "Estimate", bg: "#F5F5F0", color: "#0E2646" },
  { status: "ordered", label: "Ordered", bg: "#55BAAA", color: "#FFFFFF" },
  { status: "in_production", label: "In Production", bg: "#0E2646", color: "#F0F0F0" },
  { status: "completed", label: "Completed", bg: "#F3D12A", color: "#0E2646" },
  { status: "freight_arranged", label: "Freight", bg: "#7DD3C0", color: "#0E2646" },
  { status: "delivered", label: "Delivered", bg: "#27AE60", color: "#FFFFFF" },
];

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "MMM d"); } catch { return d; }
}

function etaInfo(eta: string | null | undefined, delivered: string | null | undefined) {
  if (!eta) return { text: "No ETA", overdue: false, days: null };
  const etaDate = new Date(eta + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = differenceInDays(etaDate, today);
  if (delivered) return { text: `Delivered`, overdue: false, days: null };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true, days };
  if (days === 0) return { text: "Due today", overdue: false, days: 0 };
  return { text: `${days}d`, overdue: false, days };
}

export default function Production() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [mfgFilter, setMfgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const ordersQuery = useQuery({
    queryKey: ["production_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name), manufacturers(name, short_name)")
        .in("status", ACTIVE_STATUSES)
        .order("est_completion_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const mfgQuery = useQuery({
    queryKey: ["manufacturers_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("id, name, short_name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!ordersQuery.data) return [];
    let items = ordersQuery.data as any[];
    if (mfgFilter !== "all") items = items.filter((o) => o.manufacturer_id === mfgFilter);
    if (statusFilter !== "all") items = items.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((o) => {
        const num = o.order_number?.toLowerCase() || "";
        const name = (o.customers as any)?.name?.toLowerCase() || "";
        return num.includes(q) || name.includes(q);
      });
    }
    return items;
  }, [ordersQuery.data, mfgFilter, statusFilter, search]);

  // KPIs
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthEnd = endOfMonth(today);

  const kpis = useMemo(() => {
    const all = ordersQuery.data || [];
    const active = all as any[];
    const overdue = active.filter((o) => o.est_completion_date && !o.delivered_date && new Date(o.est_completion_date + "T00:00:00") < today);
    const dueWeek = active.filter((o) => {
      if (!o.est_completion_date || o.delivered_date) return false;
      const d = new Date(o.est_completion_date + "T00:00:00");
      return d >= today && d <= weekEnd;
    });
    const dueMonth = active.filter((o) => {
      if (!o.est_completion_date || o.delivered_date) return false;
      const d = new Date(o.est_completion_date + "T00:00:00");
      return d >= today && d <= monthEnd;
    });
    return {
      total: active.length,
      overdue: overdue.length,
      dueWeek: dueWeek.length,
      dueMonth: dueMonth.length,
    };
  }, [ordersQuery.data]);

  return (
    <div className="max-w-full mx-auto pb-24 overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-1">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[20px] font-bold text-foreground">Production</h1>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-card">
            <button
              onClick={() => setView("board")}
              className={cn("p-2 rounded-md transition-colors", view === "board" ? "bg-muted" : "")}
              title="Board view"
            >
              <LayoutGrid size={16} className={view === "board" ? "text-foreground" : "text-muted-foreground"} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("p-2 rounded-md transition-colors", view === "list" ? "bg-muted" : "")}
              title="List view"
            >
              <List size={16} className={view === "list" ? "text-foreground" : "text-muted-foreground"} />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active</div>
            <div className="text-[22px] font-bold text-foreground">{kpis.total}</div>
          </div>
          <div className="rounded-xl border border-border p-3 text-center" style={{ backgroundColor: "rgba(212,24,61,0.06)" }}>
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#D4183D" }}>Overdue</div>
            <div className="text-[22px] font-bold" style={{ color: "#D4183D" }}>{kpis.overdue}</div>
          </div>
          <div className="rounded-xl border border-border p-3 text-center" style={{ backgroundColor: "rgba(243,209,42,0.1)" }}>
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#8B7A0A" }}>This Week</div>
            <div className="text-[22px] font-bold" style={{ color: "#8B7A0A" }}>{kpis.dueWeek}</div>
          </div>
          <div className="rounded-xl border border-border p-3 text-center" style={{ backgroundColor: "rgba(85,186,170,0.08)" }}>
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#55BAAA" }}>This Month</div>
            <div className="text-[22px] font-bold" style={{ color: "#55BAAA" }}>{kpis.dueMonth}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-4">
          <div className="flex items-center gap-2 border border-border rounded-lg bg-card px-3 py-2 flex-1 min-w-[180px]">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <select
            value={mfgFilter}
            onChange={(e) => setMfgFilter(e.target.value)}
            className="border border-border rounded-lg bg-card px-3 py-2 text-sm outline-none"
          >
            <option value="all">All Manufacturers</option>
            {(mfgQuery.data || []).map((m: any) => (
              <option key={m.id} value={m.id}>{m.short_name || m.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-border rounded-lg bg-card px-3 py-2 text-sm outline-none"
          >
            <option value="all">All Statuses</option>
            {BOARD_COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : view === "board" ? (
        <BoardView orders={filtered} navigate={navigate} queryClient={queryClient} />
      ) : (
        <div className="max-w-4xl mx-auto px-1">
          <ListView orders={filtered} navigate={navigate} queryClient={queryClient} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BOARD VIEW
// ═══════════════════════════════════════════════════════════════
function BoardView({ orders, navigate, queryClient }: { orders: any[]; navigate: any; queryClient: any }) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 px-2 min-w-max">
        {BOARD_COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className="w-[260px] shrink-0">
              {/* Column header */}
              <div className="rounded-t-lg px-3 py-2 flex items-center justify-between" style={{ backgroundColor: col.bg, color: col.color }}>
                <span className="text-[12px] font-bold uppercase tracking-wider">{col.label}</span>
                <span className="text-[12px] font-semibold opacity-70">{colOrders.length}</span>
              </div>
              {/* Cards */}
              <div className="space-y-2 pt-2 min-h-[100px]">
                {colOrders.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">No orders</p>
                )}
                {colOrders.map((order) => (
                  <OrderCard key={order.id} order={order} navigate={navigate} queryClient={queryClient} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ order, navigate, queryClient }: { order: any; navigate: any; queryClient: any }) {
  const customer = order.customers as any;
  const manufacturer = order.manufacturers as any;
  const eta = etaInfo(order.est_completion_date, order.delivered_date);

  return (
    <div
      onClick={() => navigate(`/orders/${order.id}`)}
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-bold text-foreground">{order.order_number}</span>
        {manufacturer && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
            {manufacturer.short_name || manufacturer.name}
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground truncate">{customer?.name || "Unassigned"}</p>
      <p className="text-[12px] text-foreground truncate mt-0.5">{order.build_shorthand}</p>
      <div className="flex items-center justify-between mt-2">
        <EtaDisplay order={order} queryClient={queryClient} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════════
function ListView({ orders, navigate, queryClient }: { orders: any[]; navigate: any; queryClient: any }) {
  // Sort: overdue first, then by ETA ASC
  const sorted = [...orders].sort((a, b) => {
    const aEta = etaInfo(a.est_completion_date, a.delivered_date);
    const bEta = etaInfo(b.est_completion_date, b.delivered_date);
    if (aEta.overdue && !bEta.overdue) return -1;
    if (!aEta.overdue && bEta.overdue) return 1;
    const aD = a.est_completion_date || "9999";
    const bD = b.est_completion_date || "9999";
    return aD.localeCompare(bD);
  });

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="hidden sm:grid grid-cols-[100px_1fr_1fr_100px_100px_90px_80px_90px] gap-2 px-3 py-2.5" style={{ backgroundColor: "#0E2646" }}>
        {["Order #", "Customer", "Build", "Mfg", "Status", "ETA", "Days", "Ordered"].map((h) => (
          <div key={h} className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.6)" }}>{h}</div>
        ))}
      </div>
      {sorted.map((order, idx) => {
        const customer = order.customers as any;
        const manufacturer = order.manufacturers as any;
        const eta = etaInfo(order.est_completion_date, order.delivered_date);

        return (
          <div
            key={order.id}
            onClick={() => navigate(`/orders/${order.id}`)}
            className={cn(
              "grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_100px_100px_90px_80px_90px] gap-1 sm:gap-2 px-3 py-3 border-b border-border last:border-0 items-center cursor-pointer hover:bg-muted/50 transition-colors",
              idx % 2 === 1 ? "bg-[#FAFAF7]" : "bg-card",
              eta.overdue && "ring-1 ring-inset"
            )}
            style={eta.overdue ? { ringColor: "rgba(212,24,61,0.3)" } : undefined}
          >
            <span className="text-[13px] font-bold" style={{ color: "#55BAAA" }}>{order.order_number}</span>
            <span className="text-[13px] text-foreground truncate">{customer?.name || "Unassigned"}</span>
            <span className="text-[12px] text-muted-foreground truncate">{order.build_shorthand}</span>
            <span className="text-[11px] text-muted-foreground">{manufacturer?.short_name || "—"}</span>
            <div><StatusBadge status={order.status} /></div>
            <div onClick={(e) => e.stopPropagation()}>
              <EtaDisplay order={order} queryClient={queryClient} />
            </div>
            <span className={cn("text-[12px] font-medium", eta.overdue ? "text-[#D4183D] font-semibold" : "text-muted-foreground")}>
              {eta.text}
            </span>
            <span className="text-[12px] text-muted-foreground">{fmtDate(order.ordered_date)}</span>
          </div>
        );
      })}
      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No orders match filters.</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ETA DISPLAY + UPDATE POPOVER
// ═══════════════════════════════════════════════════════════════
function EtaDisplay({ order, queryClient }: { order: any; queryClient: any }) {
  const [newDate, setNewDate] = useState<Date | undefined>(
    order.est_completion_date ? new Date(order.est_completion_date + "T00:00:00") : undefined
  );
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const eta = etaInfo(order.est_completion_date, order.delivered_date);

  const updateEtaMutation = useMutation({
    mutationFn: async () => {
      if (!newDate) return;
      const newDateStr = format(newDate, "yyyy-MM-dd");
      const { error } = await supabase.from("orders").update({ est_completion_date: newDateStr }).eq("id", order.id);
      if (error) throw error;
      await supabase.from("eta_updates").insert({
        order_id: order.id,
        previous_date: order.est_completion_date || null,
        new_date: newDateStr,
        reason: reason || null,
        source: "manual",
      });
      await supabase.from("order_timeline").insert({
        order_id: order.id,
        event_type: "eta_updated",
        title: "ETA updated",
        description: `${order.est_completion_date ? fmtDate(order.est_completion_date) : "None"} → ${fmtDate(newDateStr)}${reason ? `. ${reason}` : ""}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
      setOpen(false);
      setReason("");
      toast.success("ETA updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-[12px] font-medium flex items-center gap-1",
            eta.overdue ? "text-[#D4183D]" : "text-muted-foreground"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarIcon size={12} />
          {order.est_completion_date ? fmtDate(order.est_completion_date) : "Set ETA"}
          {eta.overdue && <AlertTriangle size={10} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 space-y-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Current ETA</div>
            <div className="text-[13px] font-medium text-foreground">{order.est_completion_date ? fmtDate(order.est_completion_date) : "Not set"}</div>
          </div>
          <Calendar
            mode="single"
            selected={newDate}
            onSelect={setNewDate}
            className={cn("p-3 pointer-events-auto")}
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for change (optional)"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card outline-none"
          />
          <button
            onClick={() => updateEtaMutation.mutate()}
            disabled={!newDate || updateEtaMutation.isPending}
            className="w-full py-2 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            {updateEtaMutation.isPending ? "Updating…" : "Update ETA"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
