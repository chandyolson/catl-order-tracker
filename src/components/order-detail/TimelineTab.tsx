import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function eventDotColor(eventType: string) {
  const green = ["created", "customer_approved", "document_signed", "payment_received"];
  const teal = ["estimate_sent", "order_placed", "so_received", "mfg_completed", "invoiced"];
  const gold = ["eta_updated", "estimate_revised"];
  const red = ["change_order"];
  if (green.includes(eventType)) return "#27AE60";
  if (teal.includes(eventType)) return "#55BAAA";
  if (gold.includes(eventType)) return "#F3D12A";
  if (red.includes(eventType)) return "#D4183D";
  return "#5B8DEF";
}

interface TimelineTabProps {
  orderId: string;
  events: any[];
  queryClient: any;
}

export default function TimelineTab({ orderId, events, queryClient }: TimelineTabProps) {
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
          className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 mb-4 active:scale-[0.97] transition-transform"
          style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
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
              className="px-4 py-2 rounded-full text-sm font-bold active:scale-[0.97] disabled:opacity-50"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
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
  const relativeTime = event.created_at
    ? formatDistanceToNow(new Date(event.created_at), { addSuffix: true })
    : "";
  const fullDate = event.created_at
    ? format(new Date(event.created_at), "MMM d, yyyy 'at' h:mm a")
    : "";

  return (
    <div className="relative pb-5 pl-7">
      <div
        className="absolute left-0 top-1.5 w-[10px] h-[10px] rounded-full border-2 border-white"
        style={{ backgroundColor: dotColor, marginLeft: 4 }}
      />
      <div className="text-[13px] font-semibold text-foreground">{event.title}</div>
      {event.description && (
        <p
          className={cn("text-xs text-muted-foreground mt-0.5", !expanded && "line-clamp-2 cursor-pointer")}
          onClick={() => setExpanded(!expanded)}
        >
          {event.description}
        </p>
      )}
      <span className="text-[11px] text-muted-foreground" title={fullDate}>
        {relativeTime}
      </span>
      {event.created_by && event.created_by !== "user" && (
        <span className="text-[11px] text-muted-foreground italic ml-2">by {event.created_by}</span>
      )}
    </div>
  );
}
