import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, ExternalLink, CheckCircle, XCircle, Clock, Inbox, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

function typeBadge(docType: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    invoice: { bg: "rgba(39,174,96,0.12)", color: "#27AE60", label: "Invoice" },
    sales_order: { bg: "rgba(59,130,246,0.12)", color: "#3B82F6", label: "Sales Order" },
    correspondence: { bg: "rgba(113,113,130,0.12)", color: "#717182", label: "Correspondence" },
  };
  const t = map[docType] || { bg: "rgba(113,113,130,0.12)", color: "#717182", label: docType };
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: t.bg, color: t.color }}>
      {t.label}
    </span>
  );
}

function statusIcon(status: string) {
  if (status === "matched") return <CheckCircle size={14} style={{ color: "#27AE60" }} />;
  if (status === "unmatched") return <XCircle size={14} style={{ color: "#D4183D" }} />;
  if (status === "error") return <XCircle size={14} style={{ color: "#D4183D" }} />;
  return <Clock size={14} style={{ color: "#717182" }} />;
}

export default function Documents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"matched" | "unmatched" | "log">("matched");
  const [scanning, setScanning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);

  // Google connection status
  const googleQuery = useQuery({
    queryKey: ["google_tokens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("google_tokens").select("account_email").limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  // Matched documents
  const matchedQuery = useQuery({
    queryKey: ["order_documents_matched"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_documents")
        .select("*, orders!order_documents_order_id_fkey(order_number, build_shorthand)")
        .or("is_unmatched.is.null,is_unmatched.eq.false")
        .not("order_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  // Unmatched documents
  const unmatchedQuery = useQuery({
    queryKey: ["order_documents_unmatched"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_documents")
        .select("*")
        .eq("is_unmatched", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  // Scan log
  const logQuery = useQuery({
    queryKey: ["doc_scan_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_scan_log")
        .select("*")
        .order("scanned_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  async function handleScan(dryRun: boolean) {
    if (dryRun) setDryRunning(true);
    else setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-scan-invoices", {
        body: { dryRun, maxResults: 50 },
      });
      if (error) throw error;
      if (dryRun) {
        const count = data?.preview_count || data?.emails_found || 0;
        toast.success(`Dry run: ${count} emails would be processed`);
      } else {
        const count = data?.documents_saved || 0;
        toast.success(`Scan complete — ${count} document${count !== 1 ? "s" : ""} saved`);
        queryClient.invalidateQueries({ queryKey: ["order_documents_matched"] });
        queryClient.invalidateQueries({ queryKey: ["order_documents_unmatched"] });
        queryClient.invalidateQueries({ queryKey: ["doc_scan_log"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
      setDryRunning(false);
    }
  }

  const matched = matchedQuery.data || [];
  const unmatched = unmatchedQuery.data || [];
  const log = logQuery.data || [];

  const s = search.toLowerCase();
  const filteredMatched = s ? matched.filter((d) =>
    (d.file_name || "").toLowerCase().includes(s) || (d.title || "").toLowerCase().includes(s) || d.document_type.toLowerCase().includes(s)
  ) : matched;
  const filteredUnmatched = s ? unmatched.filter((d) =>
    (d.file_name || "").toLowerCase().includes(s) || (d.title || "").toLowerCase().includes(s) || (d.manufacturer_ref || "").toLowerCase().includes(s)
  ) : unmatched;
  const filteredLog = s ? log.filter((d) =>
    (d.subject || "").toLowerCase().includes(s) || (d.matched_contract_number || "").toLowerCase().includes(s) || (d.sender_email || "").toLowerCase().includes(s)
  ) : log;

  const tabs = [
    { key: "matched" as const, label: "Matched", count: matched.length, color: "#27AE60" },
    { key: "unmatched" as const, label: "Unmatched", count: unmatched.length, color: "#D4183D" },
    { key: "log" as const, label: "Scan Log", count: log.length, color: "#717182" },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "#0E2646" }}>Documents</h1>
          {googleQuery.data?.account_email && (
            <p className="text-[12px] mt-0.5" style={{ color: "#717182" }}>
              Connected: <span style={{ color: "#55BAAA" }}>{googleQuery.data.account_email}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleScan(true)}
            disabled={dryRunning || scanning}
            className="flex items-center gap-1.5 text-[13px] font-medium rounded-full px-4 py-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ backgroundColor: "rgba(14,38,70,0.06)", color: "#0E2646" }}
          >
            <Search size={14} />
            {dryRunning ? "Previewing…" : "Dry Run"}
          </button>
          <button
            onClick={() => handleScan(false)}
            disabled={scanning || dryRunning}
            className="flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Scan for Documents"}
          </button>
        </div>
      </div>

      {/* KPI Pills */}
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer"
            style={{
              backgroundColor: tab === t.key ? t.color : "rgba(14,38,70,0.04)",
              color: tab === t.key ? "#FFFFFF" : t.color,
            }}
            onClick={() => setTab(t.key)}
          >
            {t.count} {t.label}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#717182" }} />
        <input
          type="text"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg text-[14px] outline-none"
          style={{ border: "1px solid #D4D4D0", backgroundColor: "#FFFFFF" }}
        />
      </div>

      {/* Tab Content */}
      {tab === "matched" && (
        <div className="space-y-2">
          {filteredMatched.length === 0 ? (
            <EmptyState message="No matched documents found" />
          ) : (
            filteredMatched.map((doc) => {
              const order = (doc as any).orders;
              return (
                <div
                  key={doc.id}
                  className="rounded-lg p-3 flex items-center gap-3"
                  style={{ backgroundColor: "#FFFFFF", border: "0.5px solid #D4D4D0" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {typeBadge(doc.document_type)}
                      <span className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                        {doc.file_name || doc.title}
                      </span>
                    </div>
                    {order && (
                      <button
                        onClick={() => navigate(`/orders/${doc.order_id}`)}
                        className="text-[11px] font-medium"
                        style={{ color: "#55BAAA" }}
                      >
                        {order.order_number} — {order.build_shorthand}
                      </button>
                    )}
                  </div>
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[12px] font-medium shrink-0 px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}
                    >
                      <ExternalLink size={12} />
                      Open
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "unmatched" && (
        <div className="space-y-2">
          {filteredUnmatched.length === 0 ? (
            <EmptyState message="No unmatched documents" />
          ) : (
            filteredUnmatched.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg p-3 flex items-center gap-3"
                style={{ backgroundColor: "#FFFFFF", border: "0.5px solid #D4D4D0", borderLeft: "3px solid #D4183D" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {typeBadge(doc.document_type)}
                    <span className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                      {doc.file_name || doc.title}
                    </span>
                  </div>
                  {doc.manufacturer_ref && (
                    <p className="text-[11px]" style={{ color: "#717182" }}>
                      Contract: {doc.manufacturer_ref} — <span style={{ color: "#D4183D" }}>no matching order found</span>
                    </p>
                  )}
                  {doc.source_email_from && (
                    <p className="text-[11px]" style={{ color: "#717182" }}>From: {doc.source_email_from}</p>
                  )}
                </div>
                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[12px] font-medium shrink-0 px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}
                  >
                    <ExternalLink size={12} />
                    Open
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "log" && (
        <div className="space-y-2">
          {filteredLog.length === 0 ? (
            <EmptyState message="No scan log entries" />
          ) : (
            filteredLog.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg p-3 flex items-center gap-3"
                style={{ backgroundColor: "#FFFFFF", border: "0.5px solid #D4D4D0" }}
              >
                <div className="shrink-0">{statusIcon(entry.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                    {entry.subject || "No subject"}
                  </p>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: "#717182" }}>
                    {entry.matched_contract_number && <span>Contract: {entry.matched_contract_number}</span>}
                    {entry.scanned_at && <span>{format(new Date(entry.scanned_at), "MMM d, yyyy h:mm a")}</span>}
                  </div>
                  {entry.error_message && (
                    <p className="text-[11px] mt-0.5" style={{ color: "#D4183D" }}>{entry.error_message}</p>
                  )}
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: entry.status === "matched" ? "rgba(39,174,96,0.12)" : entry.status === "error" ? "rgba(212,24,61,0.12)" : "rgba(113,113,130,0.12)",
                    color: entry.status === "matched" ? "#27AE60" : entry.status === "error" ? "#D4183D" : "#717182",
                  }}
                >
                  {entry.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(14,38,70,0.06)" }}>
        <Inbox size={24} style={{ color: "#717182" }} />
      </div>
      <p className="text-[14px] font-medium" style={{ color: "#0E2646" }}>{message}</p>
    </div>
  );
}
