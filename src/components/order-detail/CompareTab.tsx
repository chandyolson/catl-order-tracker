import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, AlertTriangle, Check, RefreshCw, X, FileText, Zap, Link2 } from "lucide-react";
import { toast } from "sonner";

function fmt$(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SLOT_LABELS: Record<string, string> = {
  catl_estimate: "CATL Estimate",
  approved_estimate: "Approved Estimate",
  catl_purchase_order: "CATL Purchase Order",
  mfg_web_order: "Mfg Web Order",
  mfg_sales_order: "Mfg Sales Order",
  signed_sales_order: "Signed Sales Order",
  mfg_invoice: "Mfg Invoice",
  qb_bill: "QB Bill",
  catl_customer_invoice: "Customer Invoice",
};

interface CompareTabProps {
  orderId: string;
  order: any;
}

export default function CompareTab({ orderId, order }: CompareTabProps) {
  const queryClient = useQueryClient();
  const [leftSlot, setLeftSlot] = useState("catl_purchase_order");
  const [rightSlot, setRightSlot] = useState("mfg_sales_order");
  const [extractingSlot, setExtractingSlot] = useState<string | null>(null);
  const [mappingItem, setMappingItem] = useState<{ our: string; their: string } | null>(null);

  // Fetch slots — only select the fields we need (avoid pulling huge raw_extracted_text)
  const slotsQuery = useQuery({
    queryKey: ["compare_slots", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_document_slots")
        .select("id, order_id, slot_type, is_filled, document_id, line_items, total_amount, comparison_status, comparison_notes, compared_against_slot, order_documents:document_id(id, file_url, file_name, title)")
        .eq("order_id", orderId) as any;
      if (error) throw error;
      return data || [];
    },
  });

  // Extract text from PDF — separate from render cycle
  const extractMutation = useMutation({
    mutationFn: async (slotType: string) => {
      const { data, error } = await supabase.functions.invoke("extract-document-text", {
        body: { order_id: orderId, slot_type: slotType, force: true },
      });
      if (error) throw error;
      return data;
    },
    onMutate: (slotType: string) => {
      setExtractingSlot(slotType);
    },
    onSuccess: (data: any) => {
      setExtractingSlot(null);
      if (data?.success) {
        toast.success(data.summary || `Extracted ${data.line_count} items`);
        slotsQuery.refetch();
      } else {
        toast.error(data?.error || "Extraction failed");
      }
    },
    onError: (err: any) => {
      setExtractingSlot(null);
      toast.error(err.message || "Extraction failed");
    },
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("compare_document_slots", {
        p_order_id: orderId, p_left_slot: leftSlot, p_right_slot: rightSlot,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.success) toast[data.has_issues ? "error" : "success"](data.summary);
      else toast.error(data?.error || "Comparison failed");
      slotsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message || "Comparison failed"),
  });

  const addMappingMutation = useMutation({
    mutationFn: async ({ ourName, theirName }: { ourName: string; theirName: string }) => {
      const { error } = await supabase.from("manufacturer_item_mappings").insert({
        manufacturer_id: order.manufacturer_id, our_item_name: ourName,
        mfg_item_name: theirName, confidence: 0.95, confirmed_by: "tim",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Mapping saved — re-run comparison to see the match"); setMappingItem(null); },
    onError: (err: any) => toast.error(err.message || "Failed to save mapping"),
  });

  const slots = slotsQuery.data || [];
  const left = slots.find((s: any) => s.slot_type === leftSlot);
  const right = slots.find((s: any) => s.slot_type === rightSlot);
  const leftDoc = left?.order_documents as any;
  const rightDoc = right?.order_documents as any;
  const leftHasData = left?.line_items && Array.isArray(left.line_items) && left.line_items.length > 0;
  const rightHasData = right?.line_items && Array.isArray(right.line_items) && right.line_items.length > 0;
  const leftHasPdf = !!leftDoc?.file_url;
  const rightHasPdf = !!rightDoc?.file_url;
  const results = left?.comparison_results as any;
  const isStale = results?.compared_against !== rightSlot;
  const lineMatches: any[] = results?.line_matches || [];
  const leftOnly = lineMatches.filter((r: any) => r.status === "missing_from_their_doc" && !r.dismissed);
  const rightOnly = lineMatches.filter((r: any) => r.status === "missing_from_our_doc" && !r.dismissed);

  return (
    <div className="space-y-5">
      {/* Document selectors */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Our Document</label>
            <select value={leftSlot} onChange={(e) => setLeftSlot(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none">
              {Object.entries(SLOT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {leftDoc?.file_url ? (
                <a href={leftDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium hover:underline" style={{ color: "#55BAAA" }}><ExternalLink size={10} /> View</a>
              ) : (
                <p className="text-[10px] font-medium" style={{ color: left?.is_filled ? "#B8930A" : "#D1D5DB" }}>{left?.is_filled ? "⚠ Run QB Sync" : "⬡ Not uploaded"}</p>
              )}
              {leftHasData ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }}>{(left!.line_items as any[]).length} items</span>
              ) : leftHasPdf ? (
                <button onClick={() => extractMutation.mutate(leftSlot)} disabled={!!extractingSlot} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full active:scale-[0.95] disabled:opacity-50" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
                  <Zap size={10} className={extractingSlot === leftSlot ? "animate-spin" : ""} />{extractingSlot === leftSlot ? "Extracting..." : "Extract Items"}
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Their Document</label>
            <select value={rightSlot} onChange={(e) => setRightSlot(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none">
              {Object.entries(SLOT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {rightDoc?.file_url ? (
                <a href={rightDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium hover:underline" style={{ color: "#55BAAA" }}><ExternalLink size={10} /> View</a>
              ) : (
                <p className="text-[10px] font-medium" style={{ color: right?.is_filled ? "#B8930A" : "#D1D5DB" }}>{right?.is_filled ? "⚠ Run QB Sync" : "⬡ Not uploaded"}</p>
              )}
              {rightHasData ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }}>{(right!.line_items as any[]).length} items</span>
              ) : rightHasPdf ? (
                <button onClick={() => extractMutation.mutate(rightSlot)} disabled={!!extractingSlot} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full active:scale-[0.95] disabled:opacity-50" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
                  <Zap size={10} className={extractingSlot === rightSlot ? "animate-spin" : ""} />{extractingSlot === rightSlot ? "Extracting..." : "Extract Items"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <button onClick={() => compareMutation.mutate()} disabled={compareMutation.isPending || (!leftHasData && !rightHasData)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold active:scale-[0.97] transition-transform disabled:opacity-50"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
          <RefreshCw size={14} className={compareMutation.isPending ? "animate-spin" : ""} />
          {compareMutation.isPending ? "Comparing..." : "Run Comparison"}
        </button>
      </div>

      {results && isStale && (
        <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(243,209,42,0.1)", border: "1px solid rgba(243,209,42,0.3)" }}>
          <p className="text-[11px] font-medium" style={{ color: "#854F0B" }}>Last comparison was against a different document. Click "Run Comparison" to update.</p>
        </div>
      )}

      {results && !isStale && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold" style={
            results.overall_status === "match" ? { backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" } :
            results.overall_status === "partial" ? { backgroundColor: "rgba(243,209,42,0.15)", color: "#854F0B" } :
            { backgroundColor: "rgba(212,24,61,0.1)", color: "#D4183D" }
          }>
            {results.overall_status === "match" ? <Check size={12} /> : <AlertTriangle size={12} />}
            {results.overall_status === "match" ? "All items match" : results.overall_status === "partial" ? "Partial match" : "Mismatch"}
          </span>
          {results.matches > 0 && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }}>{results.matches} match{results.matches !== 1 ? "es" : ""}</span>}
          {results.mismatches > 0 && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(212,24,61,0.1)", color: "#D4183D" }}>{results.mismatches} price diff{results.mismatches !== 1 ? "s" : ""}</span>}
          {results.left_only > 0 && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#854F0B" }}>{results.left_only} ours only</span>}
          {results.right_only > 0 && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{results.right_only} theirs only</span>}
          {results.total_diff != null && Math.abs(results.total_diff) > 0.01 && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(212,24,61,0.08)", color: "#D4183D" }}>Δ {fmt$(Math.abs(results.total_diff))}</span>
          )}
        </div>
      )}

      {lineMatches.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-[12px]">
            <thead><tr style={{ backgroundColor: "#F5F5F0" }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Our Item</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Our $</th>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Their Item</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Their $</th>
              <th className="text-center px-2 py-2 font-semibold w-14" style={{ color: "#0E2646" }}></th>
            </tr></thead>
            <tbody>
              {lineMatches.map((row: any, i: number) => {
                const bgColor = row.dismissed ? "rgba(113,113,130,0.04)" : row.match ? "rgba(39,174,96,0.03)" : row.status === "price_mismatch" ? "rgba(212,24,61,0.04)" : "rgba(243,209,42,0.04)";
                return (
                  <tr key={i} className="border-t border-border" style={{ backgroundColor: bgColor }}>
                    <td className="px-3 py-2 text-foreground font-medium">{row.our_item || <span className="text-muted-foreground italic">—</span>}</td>
                    <td className="px-3 py-2 text-right text-foreground">{fmt$(row.our_price)}</td>
                    <td className="px-3 py-2 text-foreground">{row.their_item || <span className="text-muted-foreground italic">—</span>}</td>
                    <td className="px-3 py-2 text-right text-foreground">{fmt$(row.their_price)}</td>
                    <td className="px-2 py-2 text-center">
                      {row.dismissed ? <span className="text-[10px] text-muted-foreground">✗</span>
                      : row.match ? <span className="flex items-center justify-center gap-0.5"><Check size={10} style={{ color: "#27AE60" }} /><span className="text-[9px] text-muted-foreground">{row.match_method === "mapping_table" ? "map" : row.match_method === "fuzzy" ? "~" : row.match_method === "combo" ? "⊕" : row.match_method === "qty_split" ? "×" : ""}</span></span>
                      : row.status === "price_mismatch" ? <span className="text-[10px] font-bold" style={{ color: "#D4183D" }}>Δ{fmt$(Math.abs(row.diff || 0))}</span>
                      : (row.status === "missing_from_their_doc" || row.status === "missing_from_our_doc") ? (
                        <button onClick={() => setMappingItem({ our: row.our_item || "", their: row.their_item || "" })}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full active:scale-[0.95]"
                          style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}>
                          <Link2 size={9} className="inline mr-0.5" />Map
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t-2 border-border" style={{ backgroundColor: "#F5F5F0" }}>
              <td className="px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Total</td>
              <td className="px-3 py-2 text-right font-semibold" style={{ color: "#0E2646" }}>{fmt$(results?.our_total)}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-semibold" style={{ color: "#0E2646" }}>{fmt$(results?.their_total)}</td>
              <td className="px-2 py-2 text-center">{results?.total_match ? <Check size={12} style={{ color: "#27AE60" }} /> : results?.total_diff ? <span className="text-[10px] font-bold" style={{ color: "#D4183D" }}>Δ{fmt$(Math.abs(results.total_diff))}</span> : null}</td>
            </tr></tfoot>
          </table>
        </div>
      ) : !results ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <FileText size={24} className="mx-auto mb-2" style={{ color: "#D1D5DB" }} />
          <p className="text-[13px] text-muted-foreground">Select two documents and click "Run Comparison"</p>
          <p className="text-[11px] text-muted-foreground mt-1">If a document has a PDF but no line items, click "Extract Items" first.</p>
        </div>
      ) : null}

      {mappingItem && (
        <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#55BAAA", backgroundColor: "rgba(85,186,170,0.04)" }}>
          <div className="flex items-center gap-2">
            <Link2 size={14} style={{ color: "#55BAAA" }} />
            <h4 className="text-[12px] font-bold" style={{ color: "#0E2646" }}>Create Item Mapping</h4>
            <button onClick={() => setMappingItem(null)} className="ml-auto"><X size={14} className="text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Our Name</label>
              {mappingItem.our ? (
                <p className="text-[12px] font-semibold px-2 py-1.5 rounded-lg bg-card border border-border">{mappingItem.our}</p>
              ) : (
                <select value={mappingItem.our} onChange={(e) => setMappingItem({ ...mappingItem, our: e.target.value })} className="w-full border border-border rounded-lg px-2 py-1.5 text-[12px] bg-card outline-none">
                  <option value="">Pick our item...</option>
                  {leftOnly.map((r: any, i: number) => <option key={i} value={r.our_item}>{r.our_item} ({fmt$(r.our_price)})</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Their Name</label>
              {mappingItem.their ? (
                <p className="text-[12px] font-semibold px-2 py-1.5 rounded-lg bg-card border border-border">{mappingItem.their}</p>
              ) : (
                <select value={mappingItem.their} onChange={(e) => setMappingItem({ ...mappingItem, their: e.target.value })} className="w-full border border-border rounded-lg px-2 py-1.5 text-[12px] bg-card outline-none">
                  <option value="">Pick their item...</option>
                  {rightOnly.map((r: any, i: number) => <option key={i} value={r.their_item}>{r.their_item} ({fmt$(r.their_price)})</option>)}
                </select>
              )}
            </div>
          </div>
          <button onClick={() => { if (mappingItem.our && mappingItem.their) addMappingMutation.mutate({ ourName: mappingItem.our, theirName: mappingItem.their }); }}
            disabled={!mappingItem.our || !mappingItem.their || addMappingMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold active:scale-[0.97] disabled:opacity-50"
            style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
            {addMappingMutation.isPending ? "Saving..." : "Save Mapping"}
          </button>
        </div>
      )}

      {(leftDoc?.file_url || rightDoc?.file_url) && (
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: "#0E2646" }}>Side-by-Side PDFs</h3>
          <div className="grid grid-cols-2 gap-3">
            {leftDoc?.file_url ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between text-[11px] font-semibold" style={{ backgroundColor: "#F5F5F0", color: "#0E2646" }}>
                  {SLOT_LABELS[leftSlot]}
                  <a href={leftDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px]" style={{ color: "#55BAAA" }}><ExternalLink size={9} /> Open</a>
                </div>
                <div className="h-[500px]"><iframe src={leftDoc.file_url.replace("/view", "/preview")} className="w-full h-full border-0" title={SLOT_LABELS[leftSlot]} /></div>
              </div>
            ) : <div className="rounded-xl border border-dashed border-border flex items-center justify-center h-[540px] text-[12px] text-muted-foreground">No PDF for {SLOT_LABELS[leftSlot]}</div>}
            {rightDoc?.file_url ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between text-[11px] font-semibold" style={{ backgroundColor: "#F5F5F0", color: "#0E2646" }}>
                  {SLOT_LABELS[rightSlot]}
                  <a href={rightDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px]" style={{ color: "#55BAAA" }}><ExternalLink size={9} /> Open</a>
                </div>
                <div className="h-[500px]"><iframe src={rightDoc.file_url.replace("/view", "/preview")} className="w-full h-full border-0" title={SLOT_LABELS[rightSlot]} /></div>
              </div>
            ) : <div className="rounded-xl border border-dashed border-border flex items-center justify-center h-[540px] text-[12px] text-muted-foreground">No PDF for {SLOT_LABELS[rightSlot]}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
