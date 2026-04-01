import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, ExternalLink, RefreshCw, Plus, Trash2, FileText, Image, File, FolderOpen, Link, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

interface DocumentsTabProps {
  orderId: string;
  molyContractNumber?: string | null;
  driveFolderUrl?: string | null;
}

const DOC_TYPES = [
  { value: "moly_sales_order",    label: "Moly Sales Order",    bg: "rgba(59,130,246,0.12)",  color: "#3B82F6" },
  { value: "signed_moly_so",      label: "Signed Sales Order",  bg: "rgba(14,38,70,0.10)",    color: "#0E2646" },
  { value: "mfg_so_confirmation", label: "Order Confirmation",  bg: "rgba(85,186,170,0.15)",  color: "#2A8A7C" },
  { value: "moly_invoice",        label: "Moly Invoice",        bg: "rgba(39,174,96,0.12)",   color: "#27AE60" },
  { value: "catl_purchase_order", label: "CATL Purchase Order", bg: "rgba(243,209,42,0.20)",  color: "#854F0B" },
  { value: "catl_estimate",       label: "CATL Estimate",       bg: "rgba(243,209,42,0.15)",  color: "#854F0B" },
  { value: "catl_customer_invoice", label: "Customer Invoice",  bg: "rgba(39,174,96,0.15)",   color: "#166534" },
  { value: "qb_bill",             label: "QB Bill",             bg: "rgba(59,130,246,0.10)",  color: "#1D4ED8" },
  { value: "other",               label: "Other",               bg: "rgba(113,113,130,0.12)", color: "#717182" },
];

function typeBadge(docType: string) {
  const t = DOC_TYPES.find((d) => d.value === docType) || DOC_TYPES[DOC_TYPES.length - 1];
  const label = t.label !== "Other" ? t.label : (docType?.replace(/_/g, " ") || "Other");
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      {label}
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
  const [newDoc, setNewDoc] = useState({ title: "", document_type: "moly_sales_order", file_url: "", description: "" });
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
        source: "upload",
        created_by: "user",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document added");
      setNewDoc({ title: "", document_type: "moly_sales_order", file_url: "", description: "" });
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
          <div className="flex items-start justify-between">
            <p className="text-[13px] font-semibold" style={{ color: "#0E2646" }}>Add Document</p>
            {driveFolderUrl && (
              <a
                href={driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "rgba(85,186,170,0.12)", color: "#2A8A7C" }}
              >
                <FolderOpen size={11} /> Open Drive folder
              </a>
            )}
          </div>

          {/* Step-by-step Drive instructions */}
          <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: "rgba(243,209,42,0.08)", border: "1px solid rgba(243,209,42,0.3)" }}>
            <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "#854F0B" }}>
              <Info size={11} /> How to get a Drive link
            </p>
            <ol className="text-[11px] space-y-1 pl-3 list-decimal" style={{ color: "#5C3D0A" }}>
              <li>Click <strong>Open Drive folder</strong> above to open this order's folder</li>
              <li>Find the file, right-click it → <strong>Share → Copy link</strong></li>
              <li>Make sure sharing is set to <strong>"Anyone with the link"</strong></li>
              <li>Paste the link in the field below</li>
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Title *</label>
              <input
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                placeholder="e.g. 44270 Signed Sales Order"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 focus:border-[#F3D12A]"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Document Type</label>
              <select
                value={newDoc.document_type}
                onChange={(e) => setNewDoc({ ...newDoc, document_type: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 bg-card"
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium flex items-center gap-1" style={{ color: "#717182" }}>
              <Link size={10} /> Google Drive link *
            </label>
            <input
              value={newDoc.file_url}
              onChange={(e) => setNewDoc({ ...newDoc, file_url: e.target.value })}
              placeholder="Paste Google Drive share link here..."
              className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 focus:border-[#F3D12A]"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Notes (optional)</label>
            <input
              value={newDoc.description}
              onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
              placeholder="Any additional context..."
              className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none mt-1 focus:border-[#F3D12A]"
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
              onClick={() => { setShowAddForm(false); setNewDoc({ title: "", document_type: "moly_sales_order", file_url: "", description: "" }); }}
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
                  {doc.source === "email" ? `Gmail · ${doc.source_email_from || ""}` : 
                   doc.source === "upload" ? "Manually linked" :
                   doc.source === "system" ? "Auto-scanned" :
                   doc.source === "quickbooks" ? "QuickBooks" :
                   doc.source || "Manual"}
                  {doc.created_at && ` · ${format(new Date(doc.created_at), "MMM d, yyyy")}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc.file_url && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const url = doc.file_url as string;
                      if (url.startsWith("http")) {
                        window.open(url, "_blank");
                      } else {
                        // Supabase Storage path — generate signed URL
                        const { data, error } = await supabase.storage
                          .from("order-documents")
                          .createSignedUrl(url.replace("order-documents/", ""), 3600);
                        if (error || !data?.signedUrl) {
                          toast.error("Could not open file");
                          return;
                        }
                        window.open(data.signedUrl, "_blank");
                      }
                    }}
                    className="flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
                    style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}
                  >
                    <ExternalLink size={12} />
                    Open
                  </button>
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
