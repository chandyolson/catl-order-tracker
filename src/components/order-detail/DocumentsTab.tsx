import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, ExternalLink, RefreshCw, Plus, Trash2, FileText, Image, File, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

interface DocumentsTabProps {
  orderId: string;
  molyContractNumber?: string | null;
  driveFolderUrl?: string | null;
}

const DOC_TYPES = [
  { value: "invoice", label: "Invoice", bg: "rgba(39,174,96,0.12)", color: "#27AE60" },
  { value: "sales_order", label: "Sales Order", bg: "rgba(59,130,246,0.12)", color: "#3B82F6" },
  { value: "estimate", label: "Estimate", bg: "rgba(243,209,42,0.15)", color: "#854F0B" },
  { value: "contract", label: "Contract", bg: "rgba(14,38,70,0.08)", color: "#0E2646" },
  { value: "correspondence", label: "Correspondence", bg: "rgba(113,113,130,0.12)", color: "#717182" },
  { value: "photo", label: "Photo", bg: "rgba(168,85,247,0.12)", color: "#A855F7" },
  { value: "other", label: "Other", bg: "rgba(113,113,130,0.12)", color: "#717182" },
];

function typeBadge(docType: string) {
  const t = DOC_TYPES.find((d) => d.value === docType) || DOC_TYPES[DOC_TYPES.length - 1];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      {t.label}
    </span>
  );
}

function docIcon(fileType: string | null) {
  if (!fileType) return <File size={18} style={{ color: "#717182" }} />;
  if (fileType.includes("image") || fileType.includes("photo") || fileType.includes("png") || fileType.includes("jpg")) return <Image size={18} style={{ color: "#A855F7" }} />;
  if (fileType.includes("pdf")) return <FileText size={18} style={{ color: "#D4183D" }} />;
  return <File size={18} style={{ color: "#717182" }} />;
}

export default function DocumentsTab({ orderId, molyContractNumber, driveFolderUrl }: DocumentsTabProps) {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", document_type: "invoice", file_url: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

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

  const addDocMutation = useMutation({
    mutationFn: async () => {
      if (!newDoc.title.trim()) throw new Error("Title is required");
      if (!newDoc.file_url.trim()) throw new Error("URL or Drive link is required");
      const { error } = await supabase.from("order_documents").insert({
        order_id: orderId,
        title: newDoc.title.trim(),
        document_type: newDoc.document_type,
        file_url: newDoc.file_url.trim(),
        description: newDoc.description.trim() || null,
        file_name: newDoc.title.trim(),
        source: "manual",
        created_by: "user",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document added");
      setNewDoc({ title: "", document_type: "invoice", file_url: "", description: "" });
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ["order_documents", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order_documents_summary", orderId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add document"),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.from("order_documents").delete().eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document removed");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["order_documents", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order_documents_summary", orderId] });
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
      queryClient.invalidateQueries({ queryKey: ["order_documents_summary", orderId] });
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const docs = docsQuery.data || [];

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-[15px] font-semibold" style={{ color: "#0E2646" }}>
          Documents
          {docs.length > 0 && (
            <span className="ml-2 text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
              {docs.length}
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          {driveFolderUrl && (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
              style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
            >
              <FolderOpen size={13} />
              Drive Folder
            </a>
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-[13px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#55BAAA", color: "#FFFFFF" }}
          >
            <Plus size={14} /> Add Document
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || !molyContractNumber}
            className="flex items-center gap-1 text-[13px] font-semibold rounded-full px-3 py-1.5 active:scale-[0.97] transition-transform disabled:opacity-50"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Scan Gmail"}
          </button>
        </div>
      </div>

      {/* Add document form */}
      {showAddForm && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "rgba(85,186,170,0.3)", background: "rgba(85,186,170,0.04)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "#0E2646" }}>Add Document</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Title *</label>
              <input
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                placeholder="e.g. Moly Invoice #45821"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 text-[16px] focus:border-[#F3D12A]"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Type</label>
              <select
                value={newDoc.document_type}
                onChange={(e) => setNewDoc({ ...newDoc, document_type: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 text-[16px] bg-card"
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Google Drive link or URL *</label>
            <input
              value={newDoc.file_url}
              onChange={(e) => setNewDoc({ ...newDoc, file_url: e.target.value })}
              placeholder="Paste Google Drive share link or any URL..."
              className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 text-[16px] focus:border-[#F3D12A]"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Notes (optional)</label>
            <input
              value={newDoc.description}
              onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
              placeholder="Any additional context..."
              className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 text-[16px] focus:border-[#F3D12A]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addDocMutation.mutate()}
              disabled={!newDoc.title.trim() || !newDoc.file_url.trim() || addDocMutation.isPending}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#55BAAA" }}
            >
              {addDocMutation.isPending ? "Saving..." : "Save Document"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewDoc({ title: "", document_type: "invoice", file_url: "", description: "" }); }}
              className="px-4 py-2 rounded-lg text-[13px] text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(14,38,70,0.06)" }}>
            <Inbox size={24} style={{ color: "#717182" }} />
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#0E2646" }}>No documents yet</p>
          <p className="text-[12px] mt-1" style={{ color: "#717182" }}>
            Click "Add Document" to link a file from Google Drive, or "Scan Gmail" to find invoices automatically
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg p-3 flex items-start gap-3"
              style={{ backgroundColor: "#FFFFFF", border: "0.5px solid #D4D4D0" }}
            >
              <div className="mt-0.5 shrink-0">
                {docIcon(doc.file_type || doc.document_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {typeBadge(doc.document_type)}
                  <span className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                    {doc.title || doc.file_name}
                  </span>
                </div>
                {doc.description && (
                  <p className="text-[11px] mb-1" style={{ color: "#717182" }}>{doc.description}</p>
                )}
                <p className="text-[11px]" style={{ color: "#B4B2A9" }}>
                  {doc.source === "gmail_scan" ? `Gmail · ${doc.source_email_from || ""}` : "Manual"}
                  {doc.created_at && ` · ${format(new Date(doc.created_at), "MMM d, yyyy")}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
                    style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}
                  >
                    <ExternalLink size={12} />
                    Open
                  </a>
                )}
                <button
                  onClick={() => setDeleteTarget(doc)}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  title="Remove document"
                >
                  <Trash2 size={13} style={{ color: "#D4183D" }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Remove document?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              "{deleteTarget?.title || deleteTarget?.file_name}" will be removed from this order. The file in Google Drive is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteDocMutation.mutate(deleteTarget.id)}
              disabled={deleteDocMutation.isPending}
              className="text-sm"
              style={{ backgroundColor: "#D4183D", color: "#FFFFFF" }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
