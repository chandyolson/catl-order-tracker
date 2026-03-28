import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, ExternalLink, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface DocumentsTabProps {
  orderId: string;
  molyContractNumber?: string | null;
}

function typeBadge(docType: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    invoice: { bg: "rgba(39,174,96,0.12)", color: "#27AE60", label: "Invoice" },
    sales_order: { bg: "rgba(59,130,246,0.12)", color: "#3B82F6", label: "Sales Order" },
    correspondence: { bg: "rgba(113,113,130,0.12)", color: "#717182", label: "Correspondence" },
  };
  const t = map[docType] || { bg: "rgba(113,113,130,0.12)", color: "#717182", label: docType };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      {t.label}
    </span>
  );
}

export default function DocumentsTab({ orderId, molyContractNumber }: DocumentsTabProps) {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const docsQuery = useQuery({
    queryKey: ["order_documents", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_documents")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleScan() {
    if (!molyContractNumber) {
      toast.error("No contract number to search for");
      return;
    }
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-scan-invoices", {
        body: { contractNumbers: [molyContractNumber], maxResults: 20, dryRun: false },
      });
      if (error) throw error;
      const count = data?.documents_saved || 0;
      toast.success(`Scan complete — ${count} document${count !== 1 ? "s" : ""} found`);
      queryClient.invalidateQueries({ queryKey: ["order_documents", orderId] });
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const docs = docsQuery.data || [];

  return (
    <div className="space-y-4">
      {/* Scan button */}
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold" style={{ color: "#0E2646" }}>Documents</h3>
        <button
          onClick={handleScan}
          disabled={scanning || !molyContractNumber}
          className="flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform disabled:opacity-50"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning…" : "Scan Gmail"}
        </button>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(14,38,70,0.06)" }}>
            <Inbox size={24} style={{ color: "#717182" }} />
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#0E2646" }}>No documents yet</p>
          <p className="text-[12px] mt-1" style={{ color: "#717182" }}>
            {molyContractNumber
              ? "Click Scan Gmail to search for invoices and sales orders"
              : "Add a contract number to enable Gmail scanning"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg p-3 flex items-center gap-3"
              style={{ backgroundColor: "#FFFFFF", border: "0.5px solid #D4D4D0" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {typeBadge(doc.document_type)}
                  <span className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                    {doc.file_name || doc.title}
                  </span>
                </div>
                {doc.source_email_from && (
                  <p className="text-[11px]" style={{ color: "#717182" }}>
                    From: {doc.source_email_from}
                    {doc.source_email_date && ` · ${format(new Date(doc.source_email_date), "MMM d, yyyy")}`}
                  </p>
                )}
              </div>
              {doc.file_url && (
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[12px] font-medium shrink-0 px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}
                >
                  <ExternalLink size={12} />
                  Open
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
