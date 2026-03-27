import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Edit2, Check, X, Mail, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy 'at' h:mm a"); } catch { return d; }
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [showEmailLog, setShowEmailLog] = useState(false);

  useEffect(() => {
    if (searchParams.get("qb_connected") === "true") {
      toast.success("QuickBooks connected successfully");
      searchParams.delete("qb_connected");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ─── QB Status ──────────────────────────────────────────
  const qbStatusQuery = useQuery({
    queryKey: ["qb-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qb_tokens")
        .select("id, realm_id, refresh_token_expires_at, access_token_expires_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { connected: false, expired: false };
      const expired = new Date(data.refresh_token_expires_at) < new Date();
      return { connected: !expired, expired, realm_id: data.realm_id, expires: data.refresh_token_expires_at };
    },
  });

  // ─── Email Log Stats ───────────────────────────────────
  const emailStatsQuery = useQuery({
    queryKey: ["email_stats"],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("email_log")
        .select("*", { count: "exact" })
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const total = count || 0;
      const failed = (data || []).filter((e: any) => e.status === "failed" || e.status === "error").length;
      const lastSent = data && data.length > 0 ? data[0].sent_at : null;
      return { total, failed, lastSent, recent: data || [] };
    },
  });

  // ─── Manufacturers ─────────────────────────────────────
  const mfgQuery = useQuery({
    queryKey: ["manufacturers_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const qb = qbStatusQuery.data;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://dubzwbfqlwhkpmpuejsy.supabase.co";

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("qb-sync-customers");
      if (error) throw new Error(error.message);
      toast.success(data?.message || `Synced ${data?.created || 0} new, updated ${data?.updated || 0} customers`);
    } catch (err: any) {
      toast.error("Sync failed: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 overflow-x-hidden space-y-6">
      <h1 className="text-[20px] font-bold text-foreground">Settings</h1>

      {/* ═══ QuickBooks ═══ */}
      <SettingsCard title="QuickBooks Connection">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#E8F5E8" }}>
            <span className="text-lg font-bold" style={{ color: "#2CA01C" }}>QB</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: qb?.connected ? "#27AE60" : "#D4183D" }} />
              <span className="text-[13px] font-medium" style={{ color: qb?.connected ? "#27AE60" : "#D4183D" }}>
                {qbStatusQuery.isLoading ? "Checking…" : qb?.connected ? "Connected" : "Not Connected"}
              </span>
            </div>
            {qb?.connected && (
              <div className="text-[12px] text-muted-foreground mt-0.5">
                Realm ID: {qb.realm_id} · Token expires: {fmtDate(qb.expires)}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(!qb?.connected || qb?.expired) && !qbStatusQuery.isLoading && (
            <a
              href={`${supabaseUrl}/functions/v1/qb-auth-start`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
            >
              {qb?.expired ? "Reconnect QuickBooks" : "Connect QuickBooks"}
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Customers"}
          </button>
        </div>
      </SettingsCard>

      {/* ═══ Email Configuration ═══ */}
      <SettingsCard title="Email Configuration">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(85,186,170,0.1)" }}>
            <Mail size={20} style={{ color: "#55BAAA" }} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">Tim Olson — CATL Resources</p>
            <p className="text-[12px] text-muted-foreground">tim@catlresources.com</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Emails Sent</div>
            <div className="text-[18px] font-bold text-foreground">{emailStatsQuery.data?.total ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last Sent</div>
            <div className="text-[13px] font-medium text-foreground mt-1">
              {emailStatsQuery.data?.lastSent ? format(new Date(emailStatsQuery.data.lastSent), "MMM d") : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: emailStatsQuery.data?.failed ? "#D4183D" : "#717182" }}>Failed</div>
            <div className="text-[18px] font-bold" style={{ color: emailStatsQuery.data?.failed ? "#D4183D" : "#717182" }}>
              {emailStatsQuery.data?.failed ?? 0}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowEmailLog(!showEmailLog)}
          className="flex items-center gap-1 text-[13px] font-medium"
          style={{ color: "#55BAAA" }}
        >
          <ChevronDown size={14} className={cn("transition-transform", showEmailLog && "rotate-180")} />
          {showEmailLog ? "Hide" : "View"} recent email log
        </button>

        {showEmailLog && (
          <div className="mt-3 rounded-lg border border-border overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1.2fr_80px_120px] gap-2 px-3 py-2" style={{ backgroundColor: "#0E2646" }}>
              {["Recipient", "Subject", "Status", "Sent"].map((h) => (
                <div key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.6)" }}>{h}</div>
              ))}
            </div>
            {(emailStatsQuery.data?.recent || []).length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">No emails sent yet.</p>
            )}
            {(emailStatsQuery.data?.recent || []).map((log: any, idx: number) => (
              <div key={log.id} className={cn(
                "grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_80px_120px] gap-1 sm:gap-2 px-3 py-2.5 border-b border-border last:border-0 items-center",
                idx % 2 === 1 ? "bg-[#FAFAF7]" : "bg-card"
              )}>
                <div className="text-[12px] text-foreground truncate">{log.recipient_email}</div>
                <div className="text-[12px] text-muted-foreground truncate">{log.subject}</div>
                <div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={
                      log.status === "sent"
                        ? { backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }
                        : log.status === "failed" || log.status === "error"
                        ? { backgroundColor: "rgba(212,24,61,0.1)", color: "#D4183D" }
                        : { backgroundColor: "rgba(113,113,130,0.1)", color: "#717182" }
                    }
                  >
                    {log.status}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">{log.sent_at ? format(new Date(log.sent_at), "MMM d, h:mm a") : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {/* ═══ Manufacturers ═══ */}
      <SettingsCard title="Manufacturers">
        <ManufacturersTable manufacturers={mfgQuery.data || []} queryClient={queryClient} />
      </SettingsCard>

      {/* ═══ About ═══ */}
      <SettingsCard title="About">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-[13px] text-muted-foreground">App</span>
            <span className="text-[13px] font-medium text-foreground">CATL Equipment Manager</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-muted-foreground">Version</span>
            <span className="text-[13px] font-medium text-foreground">1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-muted-foreground">Database</span>
            <span className="text-[13px] font-medium text-foreground">Supabase CRLE</span>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Settings Card wrapper
// ═══════════════════════════════════════════════════════════════
function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3" style={{ backgroundColor: "#0E2646" }}>
        <h2 className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "#F0F0F0" }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Manufacturers Table with inline edit
// ═══════════════════════════════════════════════════════════════
function ManufacturersTable({ manufacturers, queryClient }: { manufacturers: any[]; queryClient: any }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});

  const startEdit = (m: any) => {
    setEditId(m.id);
    setForm({
      name: m.name || "",
      short_name: m.short_name || "",
      contact_name: m.contact_name || "",
      contact_email: m.contact_email || "",
      ordering_method: m.ordering_method || "",
      avg_lead_days: m.avg_lead_days ?? "",
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("manufacturers").update({
        ...form,
        avg_lead_days: form.avg_lead_days !== "" ? parseInt(form.avg_lead_days) : null,
      }).eq("id", editId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manufacturers_settings"] });
      setEditId(null);
      toast.success("Manufacturer updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (manufacturers.length === 0) return <p className="text-sm text-muted-foreground">No manufacturers found.</p>;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="hidden sm:grid grid-cols-[1fr_80px_1fr_1fr_100px_70px_60px] gap-2 px-3 py-2" style={{ backgroundColor: "#F5F5F0" }}>
        {["Name", "Short", "Contact", "Email", "Method", "Lead", ""].map((h) => (
          <div key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#0E2646" }}>{h}</div>
        ))}
      </div>
      {manufacturers.map((m: any, idx: number) => {
        const isEditing = editId === m.id;
        return (
          <div key={m.id} className={cn(
            "grid grid-cols-1 sm:grid-cols-[1fr_80px_1fr_1fr_100px_70px_60px] gap-1 sm:gap-2 px-3 py-2.5 border-b border-border last:border-0 items-center",
            idx % 2 === 1 ? "bg-[#FAFAF7]" : "bg-card"
          )}>
            {isEditing ? (
              <>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-[12px] border border-border rounded px-2 py-1 bg-card outline-none" />
                <input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} className="text-[12px] border border-border rounded px-2 py-1 bg-card outline-none" />
                <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="text-[12px] border border-border rounded px-2 py-1 bg-card outline-none" />
                <input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="text-[12px] border border-border rounded px-2 py-1 bg-card outline-none" />
                <input value={form.ordering_method} onChange={(e) => setForm({ ...form, ordering_method: e.target.value })} className="text-[12px] border border-border rounded px-2 py-1 bg-card outline-none" />
                <input value={form.avg_lead_days} onChange={(e) => setForm({ ...form, avg_lead_days: e.target.value.replace(/\D/g, "") })} className="text-[12px] border border-border rounded px-2 py-1 bg-card outline-none w-16" />
                <div className="flex gap-1">
                  <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="p-1" style={{ color: "#27AE60" }}><Check size={14} /></button>
                  <button onClick={() => setEditId(null)} className="p-1" style={{ color: "#717182" }}><X size={14} /></button>
                </div>
              </>
            ) : (
              <>
                <span className="text-[13px] font-medium text-foreground">{m.name}</span>
                <span className="text-[12px] text-muted-foreground">{m.short_name}</span>
                <span className="text-[12px] text-muted-foreground truncate">{m.contact_name || "—"}</span>
                <span className="text-[12px] text-muted-foreground truncate">{m.contact_email || "—"}</span>
                <span className="text-[12px] text-muted-foreground">{m.ordering_method || "—"}</span>
                <span className="text-[12px] text-muted-foreground">{m.avg_lead_days ?? "—"}d</span>
                <button onClick={() => startEdit(m)} className="p-1" style={{ color: "#717182" }}><Edit2 size={13} /></button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
