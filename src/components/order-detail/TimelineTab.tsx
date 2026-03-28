import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Phone, Mail } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function eventDotColor(eventType: string) {
  const green = ["created", "customer_approved", "document_signed", "payment_received"];
  const teal = ["estimate_sent", "order_placed", "so_received", "mfg_completed", "invoiced", "note"];
  const gold = ["eta_updated", "estimate_revised", "email"];
  const red = ["change_order"];
  const blue = ["phone_call", "status_change"];
  if (green.includes(eventType)) return "#27AE60";
  if (teal.includes(eventType)) return "#55BAAA";
  if (gold.includes(eventType)) return "#F3D12A";
  if (red.includes(eventType)) return "#D4183D";
  if (blue.includes(eventType)) return "#5B8DEF";
  return "#888780";
}

interface TimelineTabProps {
  orderId: string;
  events: any[];
  queryClient: any;
}

export default function TimelineTab({ orderId, events, queryClient }: TimelineTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<"note" | "phone_call" | "email">("note");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [contactWith, setContactWith] = useState("");

  const addEntryMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: entryType,
        title: entryTitle || (entryType === "phone_call" ? "Phone call" : entryType === "email" ? "Email" : "Note"),
        description: entryDesc || null,
        contact_method: entryType === "note" ? null : entryType,
        contact_with: contactWith || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      setShowForm(false);
      setEntryTitle("");
      setEntryDesc("");
      setContactWith("");
      toast.success(entryType === "phone_call" ? "Phone call logged" : entryType === "email" ? "Email logged" : "Note added");
    },
  });

  return (
    <div>
      {!showForm ? (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => { setEntryType("note"); setShowForm(true); }}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
            style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
          >
            <Plus size={14} /> Note
          </button>
          <button
            onClick={() => { setEntryType("phone_call"); setShowForm(true); }}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
            style={{ border: "1px solid #5B8DEF", color: "#5B8DEF" }}
          >
            <Phone size={14} /> Phone call
          </button>
          <button
            onClick={() => { setEntryType("email"); setShowForm(true); }}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform"
            style={{ border: "1px solid #F3D12A", color: "#B8860B" }}
          >
            <Mail size={14} /> Email
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
              background: entryType === "phone_call" ? "rgba(91,141,239,0.12)" : entryType === "email" ? "rgba(243,209,42,0.15)" : "rgba(85,186,170,0.12)",
              color: entryType === "phone_call" ? "#5B8DEF" : entryType === "email" ? "#B8860B" : "#55BAAA",
            }}>
              {entryType === "phone_call" ? "Phone call" : entryType === "email" ? "Email" : "Note"}
            </span>
          </div>
          {(entryType === "phone_call" || entryType === "email") && (
            <input
              value={contactWith}
              onChange={(e) => setContactWith(e.target.value)}
              placeholder="Who did you talk to?"
              className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]"
            />
          )}
          <input
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
            placeholder={entryType === "phone_call" ? "What was discussed?" : entryType === "email" ? "Email subject" : "Note title"}
            className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none text-[16px]"
          />
          <textarea
            value={entryDesc}
            onChange={(e) => setEntryDesc(e.target.value)}
            placeholder="Details (optional)"
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none text-[16px]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => addEntryMutation.mutate()}
              disabled={addEntryMutation.isPending || !entryTitle.trim()}
              className="px-4 py-2 rounded-full text-sm font-bold active:scale-[0.97] disabled:opacity-50"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
            >
              Save
            </button>
            <button onClick={() => { setShowForm(false); setEntryTitle(""); setEntryDesc(""); setContactWith(""); }}
              className="text-sm text-muted-foreground px-3">Cancel</button>
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
      <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
        {event.contact_method === "phone" || event.event_type === "phone_call" ? (
          <Phone size={12} style={{ color: "#5B8DEF" }} />
        ) : event.contact_method === "email" || event.event_type === "email" ? (
          <Mail size={12} style={{ color: "#B8860B" }} />
        ) : null}
        {event.title}
      </div>
      {event.contact_with && (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          with {event.contact_with}
        </p>
      )}
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
