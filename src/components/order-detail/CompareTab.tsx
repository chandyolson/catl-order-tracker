import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, AlertTriangle, Check, RefreshCw, X, MessageSquare } from "lucide-react";
import { toast } from "sonner";

function fmt$(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SLOT_LABELS: Record<string, string> = {
  catl_estimate: "CATL Estimate",
  catl_purchase_order: "Purchase Order",
  moly_sales_order: "Mfg Sales Order",
  signed_moly_so: "Signed Sales Order",
  moly_invoice: "Mfg Invoice",
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
  const [rightSlot, setRightSlot] = useState("moly_sales_order");

  const slotsQuery = useQuery({
    queryKey: ["compare_slots", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_document_slots")
        .select("*, order_documents:document_id(id, file_url, file_name, title)")
        .eq("order_id", orderId);
      if (error) throw error;
      return data || [];
    },
  });

  // Run comparison via database function
  const compareMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("compare_document_slots", {
        p_order_id: orderId,
        p_left_slot: leftSlot,
        p_right_slot: rightSlot,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["compare_slots", orderId] });
      if (data?.success) {
        toast[data.has_issues ? "error" : "success"](data.summary);
      } else {
        toast.error(data?.error || "Comparison failed");
      }
    },
    onError: (err: any) => toast.error(err.message || "Comparison failed"),
  });

  const slots = slotsQuery.data || [];
  const left = slots.find((s: any) => s.slot_type === leftSlot);
  const right = slots.find((s: any) => s.slot_type === rightSlot);
  const leftDoc = left?.order_documents as any;
  const rightDoc = right?.order_documents as any;
  const leftHasData = left?.line_items && (left.line_items as any[]).length > 0;
  const rightHasData = right?.line_items && (right.line_items as any[]).length > 0;

  // Use stored comparison results if available
  const results = left?.comparison_results as any;
  const isStale = results?.compared_against !== rightSlot;
  const lineMatches: any[] = results?.line_matches || [];

  return (
    <div className="space-y-5">
      {/* Document selectors + Run button */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Document A</label>
          <select value={leftSlot} onChange={(e) => setLeftSlot(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none">
            {Object.entries(SLOT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {leftDoc?.file_url && (
            <a href={leftDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium mt-1.5 hover:underline" style={{ color: "#55BAAA" }}>
              <ExternalLink size={10} /> View PDF
            </a>
          )}
          {!leftHasData && <p className="text-[10px] mt-1" style={{ color: "#B8930A" }}>No line items</p>}
        </div>
        <button
          onClick={() => compareMutation.mutate()}
          disabled={compareMutation.isPending || (!leftHasData && !rightHasData)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold active:scale-[0.97] transition-transform disabled:opacity-50 mb-0.5"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
        >
          <RefreshCw size={12} className={compareMutation.isPending ? "animate-spin" : ""} />
          {compareMutation.isPending ? "Comparing..." : "Run Comparison"}
        </button>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Document B</label>
          <select value={rightSlot} onChange={(e) => setRightSlot(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none">
            {Object.entries(SLOT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {rightDoc?.file_url && (
            <a href={rightDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium mt-1.5 hover:underline" style={{ color: "#55BAAA" }}>
              <ExternalLink size={10} /> View PDF
            </a>
          )}
          {!rightHasData && <p className="text-[10px] mt-1" style={{ color: "#B8930A" }}>No line items</p>}
        </div>
      </div>

      {/* Stale warning */}
      {results && isStale && (
        <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(243,209,42,0.1)", border: "1px solid rgba(243,209,42,0.3)" }}>
          <p className="text-[11px] font-medium" style={{ color: "#854F0B" }}>Last comparison was against a different document. Click "Run Comparison" to update.</p>
        </div>
      )}

      {/* Summary */}
      {results && !isStale && (
        <div className="flex gap-3 flex-wrap items-center">
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
          {results.left_only > 0 && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#854F0B" }}>{results.left_only} only in A</span>}
          {results.right_only > 0 && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{results.right_only} only in B</span>}
          {results.total_diff && Math.abs(results.total_diff) > 0.01 && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(212,24,61,0.08)", color: "#D4183D" }}>
              Total Δ {fmt$(Math.abs(results.total_diff))}
            </span>
          )}
        </div>
      )}

      {/* Comparison table */}
      {lineMatches.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ backgroundColor: "#F5F5F0" }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Our Item</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Our Price</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Their Item</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Their Price</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lineMatches.map((row: any, i: number) => {
                const bgColor = row.dismissed ? "rgba(113,113,130,0.04)" :
                  row.match ? "rgba(39,174,96,0.03)" :
                  row.status === "price_mismatch" ? "rgba(212,24,61,0.04)" :
                  "rgba(243,209,42,0.04)";
                return (
                  <tr key={i} className="border-t border-border" style={{ backgroundColor: bgColor }}>
                    <td className="px-3 py-2 text-foreground font-medium">{row.our_item || "—"}</td>
                    <td className="px-3 py-2 text-right text-foreground">{fmt$(row.our_price)}</td>
                    <td className="px-3 py-2 text-foreground">{row.their_item || "—"}</td>
                    <td className="px-3 py-2 text-right text-foreground">{fmt$(row.their_price)}</td>
                    <td className="px-3 py-2 text-center">
                      {row.dismissed ? (
                        <span className="text-[10px] font-bold text-muted-foreground">Dismissed</span>
                      ) : row.match ? (
                        <span className="flex items-center justify-center gap-0.5">
                          <Check size={10} style={{ color: "#27AE60" }} />
                          <span className="text-[9px] text-muted-foreground">{row.match_method === "mapping_table" ? "mapped" : row.match_method === "fuzzy" ? "fuzzy" : ""}</span>
                        </span>
                      ) : row.status === "price_mismatch" ? (
                        <span className="text-[10px] font-bold" style={{ color: "#D4183D" }}>Δ {fmt$(Math.abs(row.diff || 0))}</span>
                      ) : row.status === "missing_from_their_doc" ? (
                        <span className="text-[10px] font-bold" style={{ color: "#854F0B" }}>A only</span>
                      ) : (
                        <span className="text-[10px] font-bold" style={{ color: "#8B5CF6" }}>B only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border" style={{ backgroundColor: "#F5F5F0" }}>
                <td className="px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Total</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: "#0E2646" }}>{fmt$(results?.our_total)}</td>
                <td className="px-3 py-2 font-semibold" style={{ color: "#0E2646" }}></td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: "#0E2646" }}>{fmt$(results?.their_total)}</td>
                <td className="px-3 py-2 text-center">
                  {results?.total_match ? (
                    <Check size={12} style={{ color: "#27AE60" }} />
                  ) : results?.total_diff ? (
                    <span className="text-[10px] font-bold" style={{ color: "#D4183D" }}>Δ {fmt$(Math.abs(results.total_diff))}</span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : !results ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-[13px] text-muted-foreground">Select two documents and click "Run Comparison" to see a line-by-line diff.</p>
          <p className="text-[11px] text-muted-foreground mt-1">The engine uses the item name mapping table + fuzzy matching to pair items across documents.</p>
        </div>
      ) : null}

      {/* Side-by-side PDF viewing */}
      {(leftDoc?.file_url || rightDoc?.file_url) && (
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: "#0E2646" }}>Side-by-Side PDFs</h3>
          <div className="grid grid-cols-2 gap-4">
            {leftDoc?.file_url ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between text-[11px] font-semibold" style={{ backgroundColor: "#F5F5F0", color: "#0E2646" }}>
                  {SLOT_LABELS[leftSlot]}
                  <a href={leftDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px]" style={{ color: "#55BAAA" }}><ExternalLink size={9} /> Open</a>
                </div>
                <div className="h-[500px]">
                  <iframe src={leftDoc.file_url.replace("/view", "/preview")} className="w-full h-full border-0" title={SLOT_LABELS[leftSlot]} />
                </div>
              </div>
            ) : <div className="rounded-xl border border-dashed border-border flex items-center justify-center h-[540px] text-[12px] text-muted-foreground">No PDF for {SLOT_LABELS[leftSlot]}</div>}
            {rightDoc?.file_url ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between text-[11px] font-semibold" style={{ backgroundColor: "#F5F5F0", color: "#0E2646" }}>
                  {SLOT_LABELS[rightSlot]}
                  <a href={rightDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px]" style={{ color: "#55BAAA" }}><ExternalLink size={9} /> Open</a>
                </div>
                <div className="h-[500px]">
                  <iframe src={rightDoc.file_url.replace("/view", "/preview")} className="w-full h-full border-0" title={SLOT_LABELS[rightSlot]} />
                </div>
              </div>
            ) : <div className="rounded-xl border border-dashed border-border flex items-center justify-center h-[540px] text-[12px] text-muted-foreground">No PDF for {SLOT_LABELS[rightSlot]}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
