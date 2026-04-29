import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Edit2, Check, X, Mail, ChevronDown, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy 'at' h:mm a"); } catch { return d; }
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
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

  // ─── Google Status ─────────────────────────────────────
  const googleStatusQuery = useQuery({
    queryKey: ["google-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_tokens")
        .select("id, account_email, account_name, access_token_expires_at, updated_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { connected: false };
      const expired = new Date(data.access_token_expires_at) < new Date();
      return { connected: true, expired, email: data.account_email, name: data.account_name, tokenExpires: data.access_token_expires_at, lastUpdated: data.updated_at };
    },
  });

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  async function handleConnectGoogle() {
    setConnectingGoogle(true);
    try {
      // Note: edge function reads action from query string (?action=auth_url),
      // so we hit it via raw fetch with auth headers (apikey + Authorization)
      // rather than supabase.functions.invoke which strips query params.
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/google-oauth-callback?action=auth_url`,
        {
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || anonKey}`,
          },
        }
      );
      if (!resp.ok) {
        toast.error(`Auth URL fetch failed: ${resp.status} ${resp.statusText}`);
        return;
      }
      const data = await resp.json();
      if (data.authUrl) window.open(data.authUrl, "_blank");
      else toast.error("Failed to get Google auth URL");
    } catch (err: any) {
      toast.error(`Connect Google failed: ${err.message}`);
    } finally {
      setConnectingGoogle(false);
    }
  }

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

  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingItems, setSyncingItems] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const handleSyncCustomers = async () => {
    setSyncingCustomers(true);
    setSyncResult(null);
    try {
      let totalSynced = 0;
      let totalInQB = 0;
      let page = 1;
      // Paginate through all customers
      while (true) {
        const { data, error } = await supabase.functions.invoke("qb-sync-customers", {
          body: {},
          headers: { "x-page": String(page) },
        });
        // The function uses URL params, so call with query string workaround
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/qb-sync-customers?page=${page}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
              "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY || ""}`,
            },
          }
        );
        const result = await resp.json();
        if (!result.success && result.error) throw new Error(result.error);
        totalSynced += result.synced_this_page || 0;
        totalInQB = result.total_in_qb || totalInQB;
        if (!result.has_more) break;
        page++;
      }
      setSyncResult({ type: "customers", totalInQB, totalSynced, pages: page });
      toast.success(`Customers synced — ${totalSynced} records across ${page} page${page > 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["customers_with_stats"] });
    } catch (err: any) {
      toast.error("Customer sync failed: " + err.message);
    } finally {
      setSyncingCustomers(false);
    }
  };

  const handleSyncItems = async () => {
    setSyncingItems(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("qb-sync-items", { body: {} });
      if (error) throw new Error(error.message);
      if (data && !data.success) throw new Error(data.error || "Item sync failed");
      setSyncResult({ type: "items", ...data });
      const totalChanges = (data.base_models?.updated || 0) + (data.options?.updated || 0);
      if (totalChanges > 0) {
        toast.success(`Items synced — ${totalChanges} price/name update${totalChanges !== 1 ? "s" : ""}`);
      } else {
        toast.success("Items synced — everything matches QB");
      }
      queryClient.invalidateQueries({ queryKey: ["base_models"] });
      queryClient.invalidateQueries({ queryKey: ["model_options_full"] });
    } catch (err: any) {
      toast.error("Item sync failed: " + err.message);
    } finally {
      setSyncingItems(false);
    }
  };

  const handleSyncAll = async () => {
    await handleSyncCustomers();
    await handleSyncItems();
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
            onClick={handleSyncCustomers}
            disabled={syncingCustomers || syncingItems}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
          >
            <RefreshCw size={14} className={syncingCustomers ? "animate-spin" : ""} />
            {syncingCustomers ? "Syncing…" : "Sync Customers"}
          </button>
          <button
            onClick={handleSyncItems}
            disabled={syncingCustomers || syncingItems}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
          >
            <RefreshCw size={14} className={syncingItems ? "animate-spin" : ""} />
            {syncingItems ? "Syncing…" : "Sync Items & Prices"}
          </button>
          <button
            onClick={handleSyncAll}
            disabled={syncingCustomers || syncingItems}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            <RefreshCw size={14} className={syncingCustomers || syncingItems ? "animate-spin" : ""} />
            {syncingCustomers || syncingItems ? "Syncing…" : "Sync Everything"}
          </button>
        </div>

        {/* Sync results */}
        {syncResult && (
          <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: "rgba(85,186,170,0.06)", border: "1px solid rgba(85,186,170,0.2)" }}>
            {syncResult.type === "customers" && (
              <p className="text-[13px]" style={{ color: "#0F6E56" }}>
                <strong>Customers:</strong> {syncResult.totalSynced} synced from QB ({syncResult.totalInQB} total in QuickBooks)
              </p>
            )}
            {syncResult.type === "items" && (
              <div className="space-y-1">
                <p className="text-[13px]" style={{ color: "#0F6E56" }}>
                  <strong>Base Models:</strong> {syncResult.base_models?.updated || 0} updated, {syncResult.base_models?.unchanged || 0} unchanged
                </p>
                <p className="text-[13px]" style={{ color: "#0F6E56" }}>
                  <strong>Options:</strong> {syncResult.options?.updated || 0} updated, {syncResult.options?.unchanged || 0} unchanged
                </p>
                {syncResult.changes && syncResult.changes.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#717182" }}>Changes applied:</p>
                    {syncResult.changes.map((c: any, i: number) => (
                      <p key={i} className="text-[12px]" style={{ color: "#0E2646" }}>
                        {c.item}: {c.diffs?.join(", ")}
                      </p>
                    ))}
                  </div>
                )}
                {syncResult.missing_in_qb && syncResult.missing_in_qb.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#D4183D" }}>Not found in QB:</p>
                    {syncResult.missing_in_qb.map((m: string, i: number) => (
                      <p key={i} className="text-[12px]" style={{ color: "#D4183D" }}>{m}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      {/* ═══ Google Drive & Gmail ═══ */}
      <SettingsCard title="Google Drive & Gmail">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(66,133,244,0.1)" }}>
            <span className="text-lg font-bold" style={{ color: "#4285F4" }}>G</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: googleStatusQuery.data?.connected && !googleStatusQuery.data?.expired ? "#27AE60" : "#D4183D" }} />
              <span className="text-[13px] font-medium" style={{ color: googleStatusQuery.data?.connected && !googleStatusQuery.data?.expired ? "#27AE60" : "#D4183D" }}>
                {googleStatusQuery.isLoading ? "Checking…" : googleStatusQuery.data?.connected && !googleStatusQuery.data?.expired ? "Connected" : googleStatusQuery.data?.expired ? "Token Expired" : "Not Connected"}
              </span>
            </div>
            {googleStatusQuery.data?.connected && (
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {googleStatusQuery.data.email} · Token: {googleStatusQuery.data.expired ? "expired — reconnect below" : `expires ${fmtDate(googleStatusQuery.data.tokenExpires)}`}
              </div>
            )}
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Used for document chain (Drive scan, Gmail attachments), voice memo processing, and email scanning.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleConnectGoogle}
            disabled={connectingGoogle}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ backgroundColor: googleStatusQuery.data?.connected && !googleStatusQuery.data?.expired ? "rgba(85,186,170,0.1)" : "#F3D12A", color: googleStatusQuery.data?.connected && !googleStatusQuery.data?.expired ? "#55BAAA" : "#0E2646", border: googleStatusQuery.data?.connected && !googleStatusQuery.data?.expired ? "1px solid #55BAAA" : "none" }}
          >
            {connectingGoogle ? "Opening…" : googleStatusQuery.data?.expired ? "Reconnect Google" : googleStatusQuery.data?.connected ? "Reconnect Google" : "Connect Google"}
            <ExternalLink size={14} />
          </button>
          <button
            onClick={() => { googleStatusQuery.refetch(); toast.success("Refreshed"); }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
            style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
          >
            <RefreshCw size={14} /> Check Status
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

      {/* ═══ Quick Builds ═══ */}
      <SettingsCard title="Quick Builds">
        <QuickBuildsManager queryClient={queryClient} />
      </SettingsCard>

      {/* ═══ Orange Sheet Standards ═══ */}
      <SettingsCard title="Orange Sheet Standards">
        <OrangeSheetStandardsManager queryClient={queryClient} />
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

// ═══════════════════════════════════════════════════════════════
// Quick Builds Manager
// ═══════════════════════════════════════════════════════════════
function QuickBuildsManager({ queryClient }: { queryClient: any }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: quickBuilds = [] } = useQuery({
    queryKey: ["quick_builds_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_builds")
        .select("id, name, base_model_id, base_models:base_model_id(name)")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const { error } = await supabase.from("quick_builds").update({ name: editName.trim() }).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Quick build updated");
    queryClient.invalidateQueries({ queryKey: ["quick_builds_settings"] });
    queryClient.invalidateQueries({ queryKey: ["quick_builds"] });
    setEditingId(null);
  }

  async function deleteQuickBuild(id: string, name: string) {
    if (!confirm(`Delete quick build "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("quick_builds").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Quick build deleted");
    queryClient.invalidateQueries({ queryKey: ["quick_builds_settings"] });
    queryClient.invalidateQueries({ queryKey: ["quick_builds"] });
  }

  async function createQuickBuild() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("quick_builds").insert({ name: newName.trim(), included_option_ids: [] });
    if (error) { toast.error("Failed to create"); return; }
    toast.success("Quick build created");
    queryClient.invalidateQueries({ queryKey: ["quick_builds_settings"] });
    queryClient.invalidateQueries({ queryKey: ["quick_builds"] });
    setNewName(""); setAddingNew(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px]" style={{ color: "#717182" }}>Quick builds are preset option combinations shown as one-tap pills on new orders. Option assignments require direct DB editing for now.</p>
      {quickBuilds.map((qb: any) => (
        <div key={qb.id} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ border: "0.5px solid #D4D4D0" }}>
          {editingId === qb.id ? (
            <>
              <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(qb.id)}
                className="flex-1 text-[13px] px-2.5 py-1.5 rounded-lg outline-none" style={{ border: "0.5px solid #D4D4D0" }} autoFocus />
              <button onClick={() => saveEdit(qb.id)} className="p-1.5 rounded-lg" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.08)" }}><Check size={13} /></button>
              <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg" style={{ color: "#717182", backgroundColor: "rgba(113,113,130,0.08)" }}><X size={13} /></button>
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>{qb.name}</span>
                {qb.base_models?.name && <span className="text-[11px] ml-2" style={{ color: "#717182" }}>{qb.base_models.name}</span>}
              </div>
              <button onClick={() => { setEditingId(qb.id); setEditName(qb.name); }} className="p-1.5 rounded-lg" style={{ color: "#55BAAA", backgroundColor: "rgba(85,186,170,0.08)" }}><Edit2 size={13} /></button>
              <button onClick={() => deleteQuickBuild(qb.id, qb.name)} className="p-1.5 rounded-lg" style={{ color: "#E24B4A", backgroundColor: "rgba(226,75,74,0.08)" }}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      ))}
      {addingNew ? (
        <div className="flex items-center gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && createQuickBuild()}
            placeholder="Quick build name" autoFocus
            className="flex-1 text-[13px] px-2.5 py-1.5 rounded-lg outline-none" style={{ border: "0.5px solid #D4D4D0" }} />
          <button onClick={createQuickBuild} className="p-1.5 rounded-lg" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.08)" }}><Check size={13} /></button>
          <button onClick={() => { setAddingNew(false); setNewName(""); }} className="p-1.5 rounded-lg" style={{ color: "#717182", backgroundColor: "rgba(113,113,130,0.08)" }}><X size={13} /></button>
        </div>
      ) : (
        <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}>
          <Plus size={13} /> Add quick build
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Orange Sheet Standards Manager
// ═══════════════════════════════════════════════════════════════
function OrangeSheetStandardsManager({ queryClient }: { queryClient: any }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState("inspection");
  const CATEGORIES = ["inspection", "setup", "delivery", "other"];
  const CATEGORY_COLORS: Record<string, string> = { inspection: "#2e7e74", setup: "#9a7a00", delivery: "#0E2646", other: "#717182" };

  const { data: standards = [] } = useQuery({
    queryKey: ["orange_sheet_standards_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orange_sheet_standards").select("*").order("sort_order").order("category");
      if (error) throw error;
      return data || [];
    },
  });

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    const { error } = await supabase.from("orange_sheet_standards").update({ item_text: editText.trim(), category: editCategory }).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Standard updated");
    queryClient.invalidateQueries({ queryKey: ["orange_sheet_standards_settings"] });
    queryClient.invalidateQueries({ queryKey: ["orange_sheet_standards"] });
    setEditingId(null);
  }

  async function deleteStandard(id: string, text: string) {
    if (!confirm(`Delete "${text}"?`)) return;
    const { error } = await supabase.from("orange_sheet_standards").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Standard deleted");
    queryClient.invalidateQueries({ queryKey: ["orange_sheet_standards_settings"] });
    queryClient.invalidateQueries({ queryKey: ["orange_sheet_standards"] });
  }

  async function createStandard() {
    if (!newText.trim()) return;
    const maxSort = Math.max(0, ...standards.map((s: any) => s.sort_order || 0));
    const { error } = await supabase.from("orange_sheet_standards").insert({ item_text: newText.trim(), category: newCategory, sort_order: maxSort + 1 });
    if (error) { toast.error("Failed to create"); return; }
    toast.success("Standard added");
    queryClient.invalidateQueries({ queryKey: ["orange_sheet_standards_settings"] });
    queryClient.invalidateQueries({ queryKey: ["orange_sheet_standards"] });
    setNewText(""); setAddingNew(false);
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = standards.filter((s: any) => s.category === cat);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-3">
      <p className="text-[11px]" style={{ color: "#717182" }}>These are the quick-add pills shown on every Orange Sheet. Changes apply to new orders going forward.</p>
      {CATEGORIES.map(cat => {
        const items = grouped[cat] || [];
        if (items.length === 0 && cat === "other") return null;
        return (
          <div key={cat}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1" style={{ color: CATEGORY_COLORS[cat] }}>{cat}</p>
            <div className="space-y-1.5">
              {items.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ border: "0.5px solid #D4D4D0" }}>
                  {editingId === s.id ? (
                    <>
                      <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(s.id)}
                        className="flex-1 text-[13px] px-2.5 py-1 rounded-lg outline-none" style={{ border: "0.5px solid #D4D4D0" }} autoFocus />
                      <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="text-[12px] px-2 py-1 rounded-lg outline-none" style={{ border: "0.5px solid #D4D4D0" }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={() => saveEdit(s.id)} className="p-1.5 rounded-lg" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.08)" }}><Check size={13} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg" style={{ color: "#717182", backgroundColor: "rgba(113,113,130,0.08)" }}><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-[13px]" style={{ color: "#1A1A1A" }}>{s.item_text}</span>
                      <button onClick={() => { setEditingId(s.id); setEditText(s.item_text); setEditCategory(s.category); }} className="p-1.5 rounded-lg" style={{ color: "#55BAAA", backgroundColor: "rgba(85,186,170,0.08)" }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteStandard(s.id, s.item_text)} className="p-1.5 rounded-lg" style={{ color: "#E24B4A", backgroundColor: "rgba(226,75,74,0.08)" }}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {addingNew ? (
        <div className="flex items-center gap-2">
          <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === "Enter" && createStandard()}
            placeholder="Checklist item text" autoFocus
            className="flex-1 text-[13px] px-2.5 py-1.5 rounded-lg outline-none" style={{ border: "0.5px solid #D4D4D0" }} />
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="text-[12px] px-2 py-1.5 rounded-lg outline-none" style={{ border: "0.5px solid #D4D4D0" }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={createStandard} className="p-1.5 rounded-lg" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.08)" }}><Check size={13} /></button>
          <button onClick={() => { setAddingNew(false); setNewText(""); }} className="p-1.5 rounded-lg" style={{ color: "#717182", backgroundColor: "rgba(113,113,130,0.08)" }}><X size={13} /></button>
        </div>
      ) : (
        <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}>
          <Plus size={13} /> Add standard item
        </button>
      )}
    </div>
  );
}
