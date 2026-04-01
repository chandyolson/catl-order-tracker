import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, AlertTriangle, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt$(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface CompareTabProps {
  orderId: string;
  order: any;
}

export default function CompareTab({ orderId, order }: CompareTabProps) {
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

  const slots = slotsQuery.data || [];
  const slotLabels: Record<string, string> = {
    catl_estimate: "CATL Estimate",
    catl_purchase_order: "Purchase Order",
    moly_sales_order: "Mfg Sales Order",
    signed_moly_so: "Signed Sales Order",
    moly_invoice: "Mfg Invoice",
    qb_bill: "QB Bill",
    catl_customer_invoice: "Customer Invoice",
  };

  const filledSlots = slots.filter((s: any) => s.is_filled || (s.line_items && (s.line_items as any[]).length > 0));
  const left = slots.find((s: any) => s.slot_type === leftSlot);
  const right = slots.find((s: any) => s.slot_type === rightSlot);
  const leftItems: any[] = Array.isArray(left?.line_items) ? left.line_items : [];
  const rightItems: any[] = Array.isArray(right?.line_items) ? right.line_items : [];
  const leftDoc = left?.order_documents as any;
  const rightDoc = right?.order_documents as any;

  // Build comparison — match by name/short_code
  type CompareRow = { name: string; leftQty?: number; leftPrice?: number; rightQty?: number; rightPrice?: number; match: "match" | "mismatch" | "left_only" | "right_only" };
  const rows: CompareRow[] = [];
  const rightUsed = new Set<number>();

  for (const li of leftItems) {
    const name = li.display_name || li.name || li.short_code || "Item";
    const price = li.total_cost || li.cost_price_each || li.total_retail || li.retail_price_each || 0;
    const qty = li.quantity || 1;
    // Find match in right
    const rIdx = rightItems.findIndex((ri, idx) => {
      if (rightUsed.has(idx)) return false;
      const rName = ri.display_name || ri.name || ri.short_code || "";
      return rName.toLowerCase().includes(name.toLowerCase().substring(0, 10)) || name.toLowerCase().includes((rName || "").toLowerCase().substring(0, 10));
    });
    if (rIdx >= 0) {
      rightUsed.add(rIdx);
      const ri = rightItems[rIdx];
      const rPrice = ri.total_cost || ri.cost_price_each || ri.total_retail || ri.retail_price_each || 0;
      const rQty = ri.quantity || 1;
      rows.push({ name, leftQty: qty, leftPrice: price, rightQty: rQty, rightPrice: rPrice, match: Math.abs(price - rPrice) < 0.01 && qty === rQty ? "match" : "mismatch" });
    } else {
      rows.push({ name, leftQty: qty, leftPrice: price, match: "left_only" });
    }
  }
  for (let i = 0; i < rightItems.length; i++) {
    if (rightUsed.has(i)) continue;
    const ri = rightItems[i];
    rows.push({ name: ri.display_name || ri.name || ri.short_code || "Item", rightQty: ri.quantity || 1, rightPrice: ri.total_cost || ri.cost_price_each || ri.total_retail || ri.retail_price_each || 0, match: "right_only" });
  }

  const mismatches = rows.filter((r) => r.match === "mismatch").length;
  const leftOnly = rows.filter((r) => r.match === "left_only").length;
  const rightOnly = rows.filter((r) => r.match === "right_only").length;
  const matches = rows.filter((r) => r.match === "match").length;
  const hasIssues = mismatches > 0 || leftOnly > 0 || rightOnly > 0;

  return (
    <div className="space-y-5">
      {/* Document selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Left Document</label>
          <select value={leftSlot} onChange={(e) => setLeftSlot(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none">
            {Object.entries(slotLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {leftDoc?.file_url && (
            <a href={leftDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium mt-1.5 hover:underline" style={{ color: "#55BAAA" }}>
              <ExternalLink size={10} /> View PDF in Drive
            </a>
          )}
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider block mb-1" style={{ color: "#717182" }}>Right Document</label>
          <select value={rightSlot} onChange={(e) => setRightSlot(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none">
            {Object.entries(slotLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {rightDoc?.file_url && (
            <a href={rightDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium mt-1.5 hover:underline" style={{ color: "#55BAAA" }}>
              <ExternalLink size={10} /> View PDF in Drive
            </a>
          )}
        </div>
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {matches > 0 && <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }}><Check size={10} /> {matches} match{matches !== 1 ? "es" : ""}</span>}
          {mismatches > 0 && <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ backgroundColor: "rgba(212,24,61,0.1)", color: "#D4183D" }}><AlertTriangle size={10} /> {mismatches} mismatch{mismatches !== 1 ? "es" : ""}</span>}
          {leftOnly > 0 && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#854F0B" }}>{leftOnly} only in {slotLabels[leftSlot]}</span>}
          {rightOnly > 0 && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ backgroundColor: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{rightOnly} only in {slotLabels[rightSlot]}</span>}
        </div>
      )}

      {/* Comparison table */}
      {rows.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ backgroundColor: "#F5F5F0" }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Item</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>{slotLabels[leftSlot]}</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>{slotLabels[rightSlot]}</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border" style={row.match === "mismatch" ? { backgroundColor: "rgba(212,24,61,0.03)" } : row.match !== "match" ? { backgroundColor: "rgba(243,209,42,0.04)" } : undefined}>
                  <td className="px-3 py-2 text-foreground font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-right text-foreground">{row.leftPrice != null ? fmt$(row.leftPrice) : "—"}</td>
                  <td className="px-3 py-2 text-right text-foreground">{row.rightPrice != null ? fmt$(row.rightPrice) : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {row.match === "match" && <span className="text-[10px] font-bold" style={{ color: "#27AE60" }}>✓</span>}
                    {row.match === "mismatch" && <span className="text-[10px] font-bold" style={{ color: "#D4183D" }}>≠ {fmt$(Math.abs((row.leftPrice || 0) - (row.rightPrice || 0)))}</span>}
                    {row.match === "left_only" && <span className="text-[10px] font-bold" style={{ color: "#854F0B" }}>Left only</span>}
                    {row.match === "right_only" && <span className="text-[10px] font-bold" style={{ color: "#8B5CF6" }}>Right only</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border" style={{ backgroundColor: "#F5F5F0" }}>
                <td className="px-3 py-2 font-semibold" style={{ color: "#0E2646" }}>Total</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: "#0E2646" }}>{fmt$(left?.total_amount)}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: "#0E2646" }}>{fmt$(right?.total_amount)}</td>
                <td className="px-3 py-2 text-center">
                  {left?.total_amount && right?.total_amount && Math.abs(left.total_amount - right.total_amount) > 0.01 ? (
                    <span className="text-[10px] font-bold" style={{ color: "#D4183D" }}>Δ {fmt$(Math.abs(left.total_amount - right.total_amount))}</span>
                  ) : left?.total_amount && right?.total_amount ? (
                    <span className="text-[10px] font-bold" style={{ color: "#27AE60" }}>✓</span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-[13px] text-muted-foreground">Select two documents with line item data to compare.</p>
          <p className="text-[11px] text-muted-foreground mt-1">Line items are extracted when documents are processed (SO vs PO, invoice vs bill, etc.)</p>
        </div>
      )}

      {/* Side-by-side PDF viewing */}
      {(leftDoc?.file_url || rightDoc?.file_url) && (
        <div className="grid grid-cols-2 gap-4">
          {leftDoc?.file_url ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 text-[11px] font-semibold" style={{ backgroundColor: "#F5F5F0", color: "#0E2646" }}>{slotLabels[leftSlot]}</div>
              <div className="h-[500px]">
                <iframe src={leftDoc.file_url.replace("/view", "/preview")} className="w-full h-full border-0" title={slotLabels[leftSlot]} />
              </div>
            </div>
          ) : <div className="rounded-xl border border-dashed border-border flex items-center justify-center h-[540px] text-[12px] text-muted-foreground">No PDF linked for {slotLabels[leftSlot]}</div>}
          {rightDoc?.file_url ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 text-[11px] font-semibold" style={{ backgroundColor: "#F5F5F0", color: "#0E2646" }}>{slotLabels[rightSlot]}</div>
              <div className="h-[500px]">
                <iframe src={rightDoc.file_url.replace("/view", "/preview")} className="w-full h-full border-0" title={slotLabels[rightSlot]} />
              </div>
            </div>
          ) : <div className="rounded-xl border border-dashed border-border flex items-center justify-center h-[540px] text-[12px] text-muted-foreground">No PDF linked for {slotLabels[rightSlot]}</div>}
        </div>
      )}
    </div>
  );
}
