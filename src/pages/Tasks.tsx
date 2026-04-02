import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow, isToday, isBefore, startOfDay } from "date-fns";
import {
  Plus,
  Search,
  CalendarIcon,
  MoreVertical,
  Mic,
  MessageCircle,
  Bot,
  User,
  Trash2,
  Pencil,
  Link as LinkIcon,
} from "lucide-react";

/* ──────── types ──────── */
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  task_type: string | null;
  due_date: string | null;
  order_id: string | null;
  customer_id: string | null;
  source_type: string | null;
  created_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  customers: { id: string; name: string } | null;
};

type Customer = { id: string; name: string };

const TEAM_MEMBERS = ["Tim", "Caleb", "Chandy", "Jen"];

/* ──────── constants ──────── */
const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const priorityColors: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-catl-orange text-white",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted/50 text-muted-foreground",
};

const priorityBorderColors: Record<string, string> = {
  urgent: "border-l-destructive",
  high: "border-l-catl-gold",
  normal: "border-l-transparent",
  low: "border-l-transparent",
};

const typeColors: Record<string, string> = {
  send_estimate: "bg-blue-100 text-blue-800",
  followup: "bg-accent/20 text-accent",
  check_order: "bg-blue-100 text-blue-800",
  delivery: "bg-blue-100 text-blue-800",
  inventory: "bg-green-100 text-green-800",
  paperwork: "bg-amber-100 text-amber-800",
  customer_service: "bg-blue-100 text-blue-800",
  vet_task: "bg-purple-100 text-purple-800",
  personal: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

const sourceIcons: Record<string, typeof Mic> = {
  voice_memo: Mic,
  chat: MessageCircle,
  system: Bot,
  manual: User,
};

const TASK_TYPES = [
  "followup", "send_estimate", "check_order", "delivery", "paperwork",
  "inventory", "customer_service", "vet_task", "personal", "other",
];

const PRIORITIES = ["urgent", "high", "normal", "low"];

/* ──────── filter pill component ──────── */
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "bg-muted/60 text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

/* ──────── customer search component ──────── */
function CustomerSearch({ value, onChange }: { value: string | null; onChange: (id: string | null, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (search.length < 1) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("customers").select("id, name").ilike("name", `%${search}%`).limit(20);
      setCustomers((data as Customer[]) || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal">
          {value ? customers.find(c => c.id === value)?.name || "Selected" : "Select customer..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search customers..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No customers found</CommandEmpty>
            <CommandItem onSelect={() => { onChange(null, ""); setOpen(false); }}>
              <span className="text-muted-foreground">None</span>
            </CommandItem>
            {customers.map(c => (
              <CommandItem key={c.id} onSelect={() => { onChange(c.id, c.name); setOpen(false); }}>
                {c.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ──────── new task form ──────── */
function NewTaskForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [taskType, setTaskType] = useState("followup");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      priority,
      task_type: taskType,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      customer_id: customerId,
      description: description.trim() || null,
      assigned_to: assignedTo && assignedTo !== "unassigned" ? assignedTo : null,
      status: "open",
      source_type: "manual",
      created_by: "tim",
    } as any);
    setSaving(false);
    if (error) { toast.error("Failed to create task"); return; }
    toast.success("Task created");
    onCreated();
    onClose();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." className="text-base" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Priority</label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Type</label>
          <Select value={taskType} onValueChange={setTaskType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Due Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dueDate ? format(dueDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Customer</label>
        <CustomerSearch value={customerId} onChange={(id) => setCustomerId(id)} />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Assign to</label>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {TEAM_MEMBERS.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          {saving ? "Creating..." : "Create Task"}
        </Button>
      </div>
    </div>
  );
}

/* ──────── main page ──────── */
export default function Tasks() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const statusFilter = searchParams.get("status") || "open";
  const priorityFilter = searchParams.get("priority") || "all";
  const sourceFilter = searchParams.get("source") || "all";
  const assigneeFilter = searchParams.get("assignee") || "all";

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === "all" || value === "open" && key === "status") {
        if (value === "all") next.delete(key);
        else next.set(key, value);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }, [setSearchParams]);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", statusFilter, priorityFilter, sourceFilter, assigneeFilter],
    queryFn: async () => {
      let query = (supabase.from("tasks").select("*, customers(id, name)") as any)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);
      if (sourceFilter !== "all") query = query.eq("source_type", sourceFilter);
      if (assigneeFilter !== "all") query = query.eq("assigned_to", assigneeFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  // Sort: open tasks by priority, completed to bottom
  const sortedTasks = [...tasks].sort((a, b) => {
    const aComplete = a.status === "complete" ? 1 : 0;
    const bComplete = b.status === "complete" ? 1 : 0;
    if (aComplete !== bComplete) return aComplete - bComplete;
    return (priorityOrder[a.priority || "normal"] ?? 2) - (priorityOrder[b.priority || "normal"] ?? 2);
  });

  const filtered = sortedTasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.customers?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = tasks.filter(t => t.status === "open").length;

  // Toggle task status
  const toggleTask = async (task: Task) => {
    const newStatus = task.status === "open" ? "complete" : "open";
    await supabase.from("tasks").update({
      status: newStatus,
      completed_at: newStatus === "complete" ? new Date().toISOString() : null,
    } as any).eq("id", task.id);
    toast.success(newStatus === "complete" ? "Task completed" : "Task reopened");
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  // Delete task
  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Task deleted");
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  // Realtime
  useEffect(() => {
    const channel = supabase.channel("tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const today = startOfDay(new Date());

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-primary">Tasks</h1>
          <Badge variant="secondary" className="text-xs">{openCount} open</Badge>
        </div>
        <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5">
              <Plus size={16} /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <NewTaskForm
              onCreated={() => queryClient.invalidateQueries({ queryKey: ["tasks"] })}
              onClose={() => setNewTaskOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Status</span>
          {["all", "open", "complete"].map(s => (
            <FilterPill key={s} label={s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)} active={statusFilter === s} onClick={() => setFilter("status", s)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Priority</span>
          {["all", ...PRIORITIES].map(p => (
            <FilterPill key={p} label={p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)} active={priorityFilter === p} onClick={() => setFilter("priority", p)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Source</span>
          {["all", "voice_memo", "chat", "system", "manual"].map(s => (
            <FilterPill key={s} label={s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} active={sourceFilter === s} onClick={() => setFilter("source", s)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Assigned</span>
          {["all", ...TEAM_MEMBERS].map(name => (
            <FilterPill key={name} label={name === "all" ? "All" : name} active={assigneeFilter === name} onClick={() => setFilter("assignee", name)} />
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search tasks or customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 text-base" />
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading tasks...</p>}
        {!isLoading && filtered.map(t => {
          const isComplete = t.status === "complete";
          const isOverdue = t.due_date && isBefore(new Date(t.due_date), today) && !isComplete;
          const isDueToday = t.due_date && isToday(new Date(t.due_date));
          const SourceIcon = sourceIcons[t.source_type || ""] || null;

          return (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-3 bg-card rounded-lg border border-l-4 p-3 transition-all",
                priorityBorderColors[t.priority || "normal"],
                isComplete && "opacity-60"
              )}
            >
              <Checkbox
                checked={isComplete}
                onCheckedChange={() => toggleTask(t)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-sm font-semibold text-foreground", isComplete && "line-through text-muted-foreground")}>
                    {t.title}
                  </span>
                  {t.priority && <Badge className={cn("text-[10px]", priorityColors[t.priority])}>{t.priority}</Badge>}
                  {t.task_type && <Badge className={cn("text-[10px]", typeColors[t.task_type] || typeColors.other)}>{t.task_type.replace(/_/g, " ")}</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {t.assigned_to && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.08)", color: "#0E2646" }}>
                      @{t.assigned_to}
                    </span>
                  )}
                  {t.customers?.name && (
                    <button onClick={() => navigate(`/customers/${t.customers!.id}`)} className="text-xs text-accent hover:underline">
                      {t.customers.name}
                    </button>
                  )}
                  {t.due_date && (
                    <span className={cn(
                      "text-[11px]",
                      isOverdue ? "text-destructive font-medium" : isDueToday ? "text-catl-gold font-medium" : "text-muted-foreground"
                    )}>
                      Due {format(new Date(t.due_date), "MMM d")}
                    </span>
                  )}
                  {SourceIcon && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <SourceIcon size={11} /> {(t.source_type || "").replace(/_/g, " ")}
                    </span>
                  )}
                  {t.created_at && (
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {TEAM_MEMBERS.map(name => (
                    <DropdownMenuItem key={name} onClick={async () => {
                      await supabase.from("tasks").update({ assigned_to: t.assigned_to === name ? null : name } as any).eq("id", t.id);
                      toast.success(t.assigned_to === name ? "Unassigned" : `Assigned to ${name}`);
                      queryClient.invalidateQueries({ queryKey: ["tasks"] });
                    }}>
                      <User size={14} className="mr-2" /> {t.assigned_to === name ? `✓ ${name}` : name}
                    </DropdownMenuItem>
                  ))}
                  <div className="h-px bg-border my-1" />
                  {t.order_id && (
                    <DropdownMenuItem onClick={() => navigate(`/orders/${t.order_id}`)}>
                      <LinkIcon size={14} className="mr-2" /> View Order
                    </DropdownMenuItem>
                  )}
                  {t.customers?.id && (
                    <DropdownMenuItem onClick={() => navigate(`/customers/${t.customers!.id}`)}>
                      <User size={14} className="mr-2" /> View Customer
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => deleteTask(t.id)} className="text-destructive">
                    <Trash2 size={14} className="mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm mb-2">No tasks found</p>
            <p className="text-muted-foreground text-xs">Record a voice memo or use the chat assistant to create tasks automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}
