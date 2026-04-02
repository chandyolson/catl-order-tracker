import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
  RefreshCw,
  Mic,
  Search,
  User,
  ShoppingCart,
  AlertCircle,
  Trash2,
} from "lucide-react";

/* ──── types ──── */
type Memo = {
  id: string;
  ai_summary: string | null;
  memo_type: string | null;
  processing_status: string | null;
  processing_error: string | null;
  duration_seconds: number | null;
  created_at: string | null;
  customer_name_detected: string | null;
  customer_id: string | null;
  order_id: string | null;
  transcript: string | null;
  equipment_mentioned: any;
  commitments: any;
  audio_storage_path: string | null;
  source_app: string | null;
  customers: { id: string; name: string } | null;
};

type Customer = { id: string; name: string };
type OrderOption = { id: string; contract_name: string | null; order_number: string | null; build_shorthand: string | null };

/* ──── constants ──── */
const categoryColors: Record<string, string> = {
  equipment: "border-l-accent",
  vet: "border-l-catl-gold",
  general: "border-l-muted-foreground",
};
const categoryBadge: Record<string, string> = {
  equipment: "bg-accent/20 text-accent",
  vet: "bg-catl-gold/20 text-catl-gold",
  general: "bg-muted text-muted-foreground",
};

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

/* ──── searchable link dropdown ──── */
function LinkDropdown<T extends { id: string }>({
  label,
  icon: Icon,
  searchFn,
  renderItem,
  onSelect,
}: {
  label: string;
  icon: typeof User;
  searchFn: (q: string) => Promise<T[]>;
  renderItem: (item: T) => string;
  onSelect: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<T[]>([]);

  useEffect(() => {
    if (search.length < 1) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setResults(await searchFn(search));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchFn]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Icon size={12} /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            {results.map(item => (
              <CommandItem key={item.id} onSelect={() => { onSelect(item); setOpen(false); }}>
                {renderItem(item)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ──── audio player ──── */
function AudioPlayer({ storagePath }: { storagePath: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const loadAndPlay = async () => {
    if (!url) {
      const { data } = await supabase.storage.from("voice-memos").createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) {
        setUrl(data.signedUrl);
        // wait for state to propagate
        setTimeout(() => audioRef.current?.play(), 100);
      }
    } else {
      if (playing) audioRef.current?.pause();
      else audioRef.current?.play();
    }
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      if (el.duration) setProgress((el.currentTime / el.duration) * 100);
    };
    const onEnded = () => { setPlaying(false); setProgress(0); };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    return () => { el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnded); };
  }, [url]);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={loadAndPlay}>
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </Button>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      {url && <audio ref={audioRef} src={url} preload="auto" />}
    </div>
  );
}

/* ──── processing dot ──── */
function StatusDot({ status }: { status: string | null }) {
  if (status === "complete") return <span className="w-2 h-2 rounded-full bg-catl-green inline-block" />;
  if (status === "processing" || status === "transcribing" || status === "uploaded")
    return <span className="w-2 h-2 rounded-full bg-catl-gold inline-block animate-pulse" />;
  if (status === "failed") return <span className="w-2 h-2 rounded-full bg-destructive inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />;
}

/* ──── main page ──── */
export default function VoiceMemos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const dateFilter = searchParams.get("date") || "all";
  const categoryFilter = searchParams.get("category") || "all";
  const statusFilter = searchParams.get("status") || "all";

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      value === "all" ? next.delete(key) : next.set(key, value);
      return next;
    });
  };

  const now = new Date();
  const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgoISO = new Date(now.getTime() - 7 * 86400000).toISOString();

  const { data: memos = [], isLoading } = useQuery({
    queryKey: ["voice_memos", dateFilter, categoryFilter, statusFilter],
    queryFn: async () => {
      let query = (supabase.from("voice_memos").select("*, customers(id, name)") as any)
        .order("created_at", { ascending: false }).limit(50);
      if (dateFilter === "today") query = query.gte("created_at", todayISO);
      else if (dateFilter === "week") query = query.gte("created_at", weekAgoISO);
      if (statusFilter !== "all") query = query.eq("processing_status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      let results = (data || []) as Memo[];
      if (categoryFilter !== "all") {
        results = results.filter(m => (m.memo_type || "general") === categoryFilter);
      }
      return results;
    },
  });

  const filtered = memos.filter(m =>
    !search ||
    m.ai_summary?.toLowerCase().includes(search.toLowerCase()) ||
    m.customer_name_detected?.toLowerCase().includes(search.toLowerCase()) ||
    m.customers?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // link to customer
  const linkCustomer = async (memoId: string, customer: Customer) => {
    await supabase.from("voice_memos").update({ customer_id: customer.id, customer_name_detected: customer.name } as any).eq("id", memoId);
    toast.success(`Linked to ${customer.name}`);
    queryClient.invalidateQueries({ queryKey: ["voice_memos"] });
  };

  // link to order
  const linkOrder = async (memoId: string, order: OrderOption) => {
    await supabase.from("voice_memos").update({ order_id: order.id } as any).eq("id", memoId);
    toast.success("Linked to order");
    queryClient.invalidateQueries({ queryKey: ["voice_memos"] });
  };

  // search helpers
  const searchCustomers = async (q: string): Promise<Customer[]> => {
    const { data } = await supabase.from("customers").select("id, name").ilike("name", `%${q}%`).limit(20);
    return (data as Customer[]) || [];
  };

  const searchOrders = async (q: string): Promise<OrderOption[]> => {
    const { data } = await (supabase.from("orders").select("id, contract_name, order_number, build_shorthand") as any)
      .or(`contract_name.ilike.%${q}%,order_number.ilike.%${q}%,build_shorthand.ilike.%${q}%`).limit(20);
    return (data as OrderOption[]) || [];
  };

  // reprocess
  const reprocess = async (memoId: string) => {
    toast.info("Reprocessing memo...");
    const { error } = await supabase.functions.invoke("process-voice-memo", { body: { memo_id: memoId } });
    if (error) toast.error("Failed to reprocess");
    else { toast.success("Reprocessing started"); queryClient.invalidateQueries({ queryKey: ["voice_memos"] }); }
  };

  const deleteMemo = async (memoId: string) => {
    if (!confirm("Delete this voice memo and its tasks?")) return;
    await supabase.from("tasks").delete().eq("source_id", memoId).eq("source_type", "voice_memo");
    await supabase.from("voice_memos").delete().eq("id", memoId);
    toast.success("Memo deleted");
    queryClient.invalidateQueries({ queryKey: ["voice_memos"] });
  };

  // realtime
  useEffect(() => {
    const channel = supabase.channel("voice-memos-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_memos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["voice_memos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const fmtDuration = (s: number | null) => {
    if (!s) return "";
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-primary">Voice memos</h1>
          <Badge variant="secondary" className="text-xs">{memos.length}</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Date</span>
          {[{ v: "all", l: "All" }, { v: "today", l: "Today" }, { v: "week", l: "This Week" }].map(f => (
            <FilterPill key={f.v} label={f.l} active={dateFilter === f.v} onClick={() => setFilter("date", f.v)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Category</span>
          {["all", "equipment", "vet", "general"].map(c => (
            <FilterPill key={c} label={c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)} active={categoryFilter === c} onClick={() => setFilter("category", c)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Status</span>
          {["all", "complete", "processing", "failed"].map(s => (
            <FilterPill key={s} label={s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)} active={statusFilter === s} onClick={() => setFilter("status", s)} />
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search summaries, customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 text-base" />
      </div>

      {/* Memo list */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading memos...</p>}
        {!isLoading && filtered.map(m => {
          const isOpen = expanded.has(m.id);
          const cat = m.memo_type || "general";
          const equipment = Array.isArray(m.equipment_mentioned) ? m.equipment_mentioned : [];
          const commitments = Array.isArray(m.commitments) ? m.commitments : [];

          return (
            <Collapsible key={m.id} open={isOpen} onOpenChange={() => toggle(m.id)}>
              <div className={cn("bg-card rounded-lg border border-l-4 overflow-hidden transition-all", categoryColors[cat] || categoryColors.general)}>
                {/* Collapsed row */}
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/20 transition-colors">
                    {isOpen ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                    <StatusDot status={m.processing_status} />
                    <Badge className={cn("text-[10px] shrink-0", categoryBadge[cat] || categoryBadge.general)}>{cat}</Badge>
                    <span className="flex-1 text-sm text-foreground line-clamp-2 min-w-0">
                      {m.ai_summary || (m.processing_status === "complete" ? "No summary" : m.processing_status === "failed" ? "Processing failed" : "Processing...")}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      {m.duration_seconds != null && <span className="text-xs text-muted-foreground">{fmtDuration(m.duration_seconds)}</span>}
                      {m.created_at && <span className="text-xs text-muted-foreground hidden sm:inline">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>}
                    </div>
                  </button>
                </CollapsibleTrigger>

                {/* Customer row (always visible) */}
                <div className="px-3 pb-2 flex items-center gap-2 ml-8">
                  {m.customers?.name ? (
                    <button onClick={() => navigate(`/customers/${m.customers!.id}`)} className="text-xs text-accent hover:underline">
                      {m.customers.name}
                    </button>
                  ) : m.customer_name_detected ? (
                    <span className="text-xs text-catl-gold">{m.customer_name_detected} (unlinked)</span>
                  ) : (
                    <span className="text-xs text-catl-gold">No customer linked</span>
                  )}
                </div>

                {/* Expanded content */}
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t ml-4 mr-2">
                    {/* Error */}
                    {m.processing_status === "failed" && m.processing_error && (
                      <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span>{m.processing_error}</span>
                      </div>
                    )}

                    {/* Transcript */}
                    {m.transcript && (
                      <div className="bg-primary/5 rounded-md p-3">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Transcript</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{m.transcript}</p>
                      </div>
                    )}

                    {/* Equipment mentioned */}
                    {equipment.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Equipment mentioned</p>
                        <div className="flex flex-wrap gap-1">
                          {equipment.map((e: any, i: number) => (
                            <Badge key={i} className="bg-accent/20 text-accent text-[10px]">{typeof e === "string" ? e : e?.name || JSON.stringify(e)}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Commitments */}
                    {commitments.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Commitments</p>
                        <ul className="space-y-1">
                          {commitments.map((c: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="w-4 h-4 rounded border border-border flex items-center justify-center text-[10px] shrink-0 mt-0.5">✓</span>
                              <span>{typeof c === "string" ? c : c?.text || c?.commitment || JSON.stringify(c)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Audio player */}
                    {m.audio_storage_path && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Audio</p>
                        <AudioPlayer storagePath={m.audio_storage_path} />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <LinkDropdown<Customer>
                        label="Link customer"
                        icon={User}
                        searchFn={searchCustomers}
                        renderItem={c => c.name}
                        onSelect={c => linkCustomer(m.id, c)}
                      />
                      <LinkDropdown<OrderOption>
                        label="Link order"
                        icon={ShoppingCart}
                        searchFn={searchOrders}
                        renderItem={o => o.contract_name || o.order_number || o.build_shorthand || o.id.slice(0, 8)}
                        onSelect={o => linkOrder(m.id, o)}
                      />
                      {(m.processing_status === "failed" || m.processing_status === "transcribed") && (
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => reprocess(m.id)}>
                          <RefreshCw size={12} /> Reprocess
                        </Button>
                      )}
                      {m.order_id && (
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate(`/orders/${m.order_id}`)}>
                          View order
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMemo(m.id)}>
                        <Trash2 size={12} /> Delete
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Mic size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm mb-1">No voice memos yet</p>
            <p className="text-muted-foreground text-xs">Record a memo using Easy Voice Recorder — it'll appear here automatically within 5 minutes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
