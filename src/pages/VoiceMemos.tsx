import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Mic } from "lucide-react";

type Memo = {
  id: string;
  ai_summary: string | null;
  memo_type: string | null;
  processing_status: string | null;
  duration_seconds: number | null;
  created_at: string | null;
  customer_name_detected: string | null;
};

export default function VoiceMemos() {
  const [memos, setMemos] = useState<Memo[]>([]);

  useEffect(() => {
    supabase.from("voice_memos").select("*").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setMemos((data as Memo[]) || []));
  }, []);

  return (
    <div>
      <h1 className="text-[22px] font-bold text-primary mb-1">Voice Memos</h1>
      <p className="text-muted-foreground text-sm mb-4">Recent voice memos with AI summaries</p>
      <div className="space-y-3">
        {memos.map(m => (
          <div key={m.id} className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mic size={14} className="text-accent" />
              <span className="text-xs text-muted-foreground">{m.created_at ? new Date(m.created_at).toLocaleString() : ""}</span>
              {m.memo_type && <Badge variant="secondary">{m.memo_type}</Badge>}
              {m.processing_status && <Badge variant={m.processing_status === "complete" ? "default" : "secondary"}>{m.processing_status}</Badge>}
            </div>
            {m.ai_summary && <p className="text-sm">{m.ai_summary}</p>}
            {m.customer_name_detected && <p className="text-xs text-muted-foreground mt-1">Customer: {m.customer_name_detected}</p>}
          </div>
        ))}
        {memos.length === 0 && <p className="text-muted-foreground text-sm py-8 text-center">No voice memos yet</p>}
      </div>
    </div>
  );
}
