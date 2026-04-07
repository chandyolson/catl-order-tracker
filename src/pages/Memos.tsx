import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Trash2, Archive, ChevronDown, ChevronUp, Search, RefreshCw, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Memo = {
  id: string;
  ai_summary: string | null;
  transcript: string | null;
  memo_type: string | null;
  processing_status: string;
  created_at: string;
  customer_id: string | null;
  order_id: string | null;
  archived: boolean;
  assigned_to: string | null;
  recorded_by: string | null;
  commitments: any[] | null;
  equipment_mentioned: any[] | null;
  duration_seconds: number | null;
  customers?: { name: string } | null;
  orders?: { contract_name: string | null; moly_contract_number: string | null } | null;
};

export default function Memos() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTranscript, setEditTranscript] = useState("");

  async function saveMemoEdit(id: string) {
    const { error } = await supabase.from("voice_memos").update({
      ai_summary: editSummary || null,
      notes: editNotes || null,
      transcript: editTranscript || null,
    } as any).eq("id", id);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Memo saved");
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ["all_memos"] });
  }

  const { data: memos = [], isLoading, refetch } = useQuery({
    queryKey: ["all_memos", showArchived],
    queryFn: async () => {
      let q = supabase
        .from("voice_memos")
        .select("*, customers(name), orders(contract_name, moly_contract_number)")
        .order("created_at", { ascending: false });
      if (!showArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Memo[];
    },
  });

  async function deleteMemo(id: string) {
    if (!confirm("Delete this memo permanently?")) return;
    const { error } = await supabase.from("voice_memos").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Memo deleted");
    queryClient.invalidateQueries({ queryKey: ["all_memos"] });
  }

  async function archiveMemo(id: string, archived: boolean) {
    const { error } = await supabase.from("voice_memos").update({ archived: !archived } as any).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(archived ? "Memo restored" : "Memo archived");
    queryClient.invalidateQueries({ queryKey: ["all_memos"] });
  }

  const filtered = memos.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      m.ai_summary?.toLowerCase().includes(s) ||
      m.transcript?.toLowerCase().includes(s) ||
      m.memo_type?.toLowerCase().includes(s) ||
      (m.customers as any)?.name?.toLowerCase().includes(s) ||
      (m.orders as any)?.contract_name?.toLowerCase().includes(s) ||
      (m.orders as any)?.moly_contract_number?.includes(s)
    );
  });

  function fmtDuration(secs: number | null) {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 px-4 pt-4" style={{ background: "#F5F5F0", minHeight: "100vh" }}>

      {/* Header */}
      <div className="rounded-xl mb-4 px-4 py-3 flex items-center justify-between" style={{ background: "#0E2646" }}>
        <div className="flex items-center gap-2">
          <Mic size={16} style={{ color: "#55BAAA" }} />
          <h1 className="text-[16px] font-bold text-white">Memos</h1>
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "rgba(85,186,170,0.2)", color: "#55BAAA" }}>
            {filtered.length}
          </span>
        </div>
        <button onClick={() => refetch()} className="p-1.5 rounded-lg" style={{ color: "#55BAAA" }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#717182" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memos…"
            className="w-full rounded-lg pl-8 pr-3 py-2 text-[14px] outline-none"
            style={{ background: "#fff", border: "0.5px solid #D4D4D0" }}
          />
        </div>
        <button
          onClick={() => setShowArchived(v => !v)}
          className="px-3 py-2 rounded-lg text-[12px] font-medium shrink-0"
          style={{ background: showArchived ? "rgba(85,186,170,0.15)" : "#fff", color: showArchived ? "#2e7e74" : "#717182", border: "0.5px solid #D4D4D0" }}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      {/* List */}
      {isLoading && <p className="text-center py-8 text-sm" style={{ color: "#717182" }}>Loading memos…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-center py-8 text-sm" style={{ color: "#717182" }}>No memos found</p>
      )}

      <div className="space-y-2">
        {filtered.map(memo => {
          const isExpanded = expandedId === memo.id;
          const fullText = memo.ai_summary || memo.transcript || "";
          const preview = fullText.slice(0, 140) + (fullText.length > 140 ? "…" : "");
          const customer = (memo.customers as any)?.name;
          const order = (memo.orders as any);
          const orderLabel = order?.moly_contract_number || order?.contract_name;
          const typeLabel = memo.memo_type?.replace(":", " · ") || "memo";
          const duration = fmtDuration(memo.duration_seconds);
          const date = format(new Date(memo.created_at), "MMM d, yyyy · h:mm a");

          return (
            <div key={memo.id}
              className="rounded-xl overflow-hidden"
              style={{ background: memo.archived ? "rgba(245,245,240,0.6)" : "#fff", border: "0.5px solid #D4D4D0", opacity: memo.archived ? 0.7 : 1 }}>

              {/* Header row — always visible */}
              <div className="px-4 pt-3 pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : memo.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: "rgba(85,186,170,0.12)", color: "#2e7e74" }}>
                      {typeLabel}
                    </span>
                    {customer && (
                      <span className="text-[11px] font-semibold truncate" style={{ color: "#0E2646" }}>{customer}</span>
                    )}
                    {orderLabel && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(243,209,42,0.15)", color: "#9a7a00" }}>#{orderLabel}</span>
                    )}
                    {memo.archived && (
                      <span className="text-[10px] font-medium" style={{ color: "#717182" }}>archived</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isExpanded ? <ChevronUp size={14} style={{ color: "#717182" }} /> : <ChevronDown size={14} style={{ color: "#717182" }} />}
                  </div>
                </div>

                <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "#1A1A1A" }}>
                  {fullText ? (isExpanded ? fullText : preview) : "Processing…"}
                </p>

                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px]" style={{ color: "#717182" }}>{date}</span>
                  {duration && <span className="text-[10px]" style={{ color: "#717182" }}>{duration}</span>}
                  {memo.assigned_to && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(14,38,70,0.08)", color: "#0E2646" }}>@{memo.assigned_to}</span>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-3" style={{ borderTop: "0.5px solid #F0F0EC" }}>
                  {editingId === memo.id ? (
                    /* ── Edit mode ── */
                    <div className="space-y-3 pt-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#717182" }}>Summary / AI notes</p>
                        <textarea value={editSummary} onChange={e => setEditSummary(e.target.value)} rows={4}
                          className="w-full text-[13px] px-3 py-2 rounded-lg outline-none resize-none"
                          style={{ border: "0.5px solid #D4D4D0", background: "#fff" }} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#717182" }}>Your notes</p>
                        <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                          placeholder="Add your own notes, corrections, context..."
                          className="w-full text-[13px] px-3 py-2 rounded-lg outline-none resize-none"
                          style={{ border: "0.5px solid #D4D4D0", background: "#fff" }} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#717182" }}>Transcript (correct if needed)</p>
                        <textarea value={editTranscript} onChange={e => setEditTranscript(e.target.value)} rows={5}
                          className="w-full text-[11px] px-3 py-2 rounded-lg outline-none resize-none"
                          style={{ border: "0.5px solid #D4D4D0", background: "#fafaf8", color: "#717182" }} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveMemoEdit(memo.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold"
                          style={{ background: "#55BAAA", color: "#fff" }}>
                          <Check size={13} /> Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px]"
                          style={{ background: "#F5F5F0", color: "#717182" }}>
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── View mode ── */
                    <>
                      {/* Notes (user-added) */}
                      {memo.notes && (
                        <div className="mt-2.5 px-3 py-2 rounded-lg" style={{ background: "rgba(243,209,42,0.08)", border: "0.5px solid rgba(243,209,42,0.2)" }}>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9a7a00" }}>Your notes</p>
                          <p className="text-[12px] leading-relaxed" style={{ color: "#1A1A1A" }}>{memo.notes}</p>
                        </div>
                      )}
                      {memo.commitments && Array.isArray(memo.commitments) && memo.commitments.length > 0 && (
                        <div className="mt-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#F3D12A" }}>Commitments</p>
                          {memo.commitments.map((c: any, i: number) => (
                            <p key={i} className="text-[12px]" style={{ color: "#0E2646" }}>• {typeof c === "string" ? c : c.description || c.text || JSON.stringify(c)}</p>
                          ))}
                        </div>
                      )}
                      {memo.equipment_mentioned && Array.isArray(memo.equipment_mentioned) && memo.equipment_mentioned.length > 0 && (
                        <div className="mt-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#55BAAA" }}>Equipment mentioned</p>
                          <div className="flex flex-wrap gap-1">
                            {memo.equipment_mentioned.map((e: any, i: number) => (
                              <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full" style={{ background: "rgba(85,186,170,0.12)", color: "#2e7e74" }}>
                                {typeof e === "string" ? e : e.name || JSON.stringify(e)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {memo.transcript && memo.ai_summary && (
                        <details className="mt-2.5">
                          <summary className="text-[10px] font-bold uppercase tracking-wider cursor-pointer" style={{ color: "#717182" }}>Full transcript</summary>
                          <p className="text-[11px] mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: "#717182" }}>{memo.transcript}</p>
                        </details>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3 pt-2.5" style={{ borderTop: "0.5px solid #F0F0EC" }}>
                        <button
                          onClick={() => { setEditingId(memo.id); setEditSummary(memo.ai_summary || ""); setEditNotes(memo.notes || ""); setEditTranscript(memo.transcript || ""); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
                          style={{ background: "rgba(85,186,170,0.08)", color: "#55BAAA" }}>
                          <Edit2 size={12} /> Edit / Add notes
                        </button>
                        <button
                          onClick={() => archiveMemo(memo.id, memo.archived)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
                          style={{ background: "rgba(113,113,130,0.08)", color: "#717182" }}>
                          <Archive size={12} />
                          {memo.archived ? "Restore" : "Archive"}
                        </button>
                        <button
                          onClick={() => deleteMemo(memo.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
                          style={{ background: "rgba(212,24,61,0.07)", color: "#D4183D" }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
