import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";

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
};

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
  other: "bg-muted text-muted-foreground",
};

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState("");
  const statusFilter = searchParams.get("status") || "open";

  const fetchTasks = async () => {
    let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data } = await q;
    setTasks((data as Task[]) || []);
  };

  useEffect(() => { fetchTasks(); }, [statusFilter]);

  const completeTask = async (id: string) => {
    await supabase.from("tasks").update({ status: "complete", completed_at: new Date().toISOString() } as any).eq("id", id);
    toast.success("Task completed");
    fetchTasks();
  };

  const filtered = tasks.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1 className="text-[22px] font-bold text-primary mb-1">Tasks</h1>
      <p className="text-muted-foreground text-sm mb-4">Showing {statusFilter} tasks</p>
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      <div className="space-y-2">
        {filtered.map(t => (
          <div key={t.id} className="flex items-center gap-3 bg-card rounded-lg border p-3">
            <Checkbox onCheckedChange={() => completeTask(t.id)} />
            <span className="flex-1 text-sm font-medium">{t.title}</span>
            {t.priority && <Badge className={priorityColors[t.priority] || ""}>{t.priority}</Badge>}
            {t.task_type && <Badge className={typeColors[t.task_type] || typeColors.other}>{t.task_type}</Badge>}
            {t.due_date && <span className="text-xs text-muted-foreground">{new Date(t.due_date).toLocaleDateString()}</span>}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm py-8 text-center">No tasks found</p>}
      </div>
    </div>
  );
}
