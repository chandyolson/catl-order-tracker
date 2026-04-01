import { Lock } from "lucide-react";

interface FinancialsTabProps {
  order: any;
  margin?: { amount: number; percent: number } | null;
  marginColor?: string;
}

function fmt$(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toFixed(1) + "%";
}

export default function FinancialsTab({ order, margin, marginColor = "#717182" }: FinancialsTabProps) {
  const options: any[] = Array.isArray(order.selected_options) ? order.selected_options : [];

  // Totals from line items
  const lineRetailTotal = options.reduce((sum: number, opt: any) => {
    const qty = opt.quantity || 1;
    const retail = opt.retail_price_each ?? 0;
    return sum + retail * qty;
  }, 0);
  const lineCostTotal = options.reduce((sum: number, opt: any) => {
    const qty = opt.quantity || 1;
    const cost = opt.cost_price_each ?? 0;
    return sum + cost * qty;
  }, 0);

  const freight = parseFloat(order.freight_estimate) || 0;
  const discountAmt = parseFloat(order.discount_amount) || 0;
  const discountIsPercent = order.discount_type === "%";
  const discountValue = discountIsPercent ? lineRetailTotal * (discountAmt / 100) : discountAmt;
  const taxRate = parseFloat(order.tax_rate) || 0;
  const taxAmount = parseFloat(order.tax_amount) || 0;

  const retailAfterDiscount = lineRetailTotal - discountValue;
  const retailWithFreight = retailAfterDiscount + freight;
  const totalWithTax = retailWithFreight + taxAmount;

  const marginPct = retailWithFreight > 0 ? ((retailWithFreight - lineCostTotal) / retailWithFreight) * 100 : 0;
  const marginAmt = retailWithFreight - lineCostTotal;

  const marginClr = marginPct >= 18 ? "#27AE60" : marginPct >= 12 ? "#F59E0B" : "#D4183D";

  return (
    <div className="space-y-4">
      {/* Internal badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(14,38,70,0.06)", border: "1px solid rgba(14,38,70,0.12)" }}>
        <Lock size={12} style={{ color: "#0E2646" }} />
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#0E2646" }}>
          Internal — do not share with customer
        </p>
      </div>

      {/* Line items table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#F5F5F0" }}>
          <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Line Items</h3>
          <div className="flex gap-6">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#717182" }}>Cost</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#0E2646" }}>Retail</span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {options.map((opt: any, i: number) => {
            const qty = opt.quantity || 1;
            const cost = opt.cost_price_each ?? null;
            const retail = opt.retail_price_each ?? null;
            const lineMargin = retail && cost ? ((retail - cost) / retail) * 100 : null;
            const missingRetail = retail == null;
            return (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>
                    {opt.name}
                    {qty > 1 && <span className="ml-1 text-[11px]" style={{ color: "#717182" }}>×{qty}</span>}
                  </p>
                  {lineMargin != null && (
                    <p className="text-[10px]" style={{ color: lineMargin >= 18 ? "#27AE60" : lineMargin >= 12 ? "#F59E0B" : "#D4183D" }}>
                      {fmtPct(lineMargin)} margin
                    </p>
                  )}
                </div>
                <div className="w-24 text-right">
                  <p className="text-[12px]" style={{ color: "#717182" }}>
                    {cost != null ? fmt$(cost * qty) : "—"}
                  </p>
                </div>
                <div className="w-24 text-right">
                  {missingRetail ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(212,24,61,0.1)", color: "#D4183D" }}>
                      Missing
                    </span>
                  ) : (
                    <p className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
                      {fmt$(retail! * qty)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Subtotal row */}
        <div className="px-4 py-2.5 flex items-center gap-3 border-t-2" style={{ borderColor: "#E5E5E0", backgroundColor: "#FAFAF8" }}>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#717182" }}>Equipment Subtotal</p>
          </div>
          <div className="w-24 text-right">
            <p className="text-[13px] font-semibold" style={{ color: "#717182" }}>{fmt$(lineCostTotal)}</p>
          </div>
          <div className="w-24 text-right">
            <p className="text-[14px] font-bold" style={{ color: "#0E2646" }}>{fmt$(lineRetailTotal)}</p>
          </div>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
          <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Deal Summary</h3>
        </div>
        <div className="p-4 space-y-2.5">

          {/* Equipment */}
          <div className="flex justify-between items-baseline">
            <span className="text-[13px] text-muted-foreground">Equipment (retail)</span>
            <div className="flex gap-6">
              <span className="text-[12px] w-24 text-right" style={{ color: "#717182" }}>{fmt$(lineCostTotal)}</span>
              <span className="text-[13px] font-medium w-24 text-right">{fmt$(lineRetailTotal)}</span>
            </div>
          </div>

          {/* Discount */}
          {discountValue > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-muted-foreground">
                Discount {discountIsPercent ? `(${discountAmt}%)` : ""}
              </span>
              <div className="flex gap-6">
                <span className="w-24" />
                <span className="text-[13px] font-medium w-24 text-right" style={{ color: "#D4183D" }}>
                  −{fmt$(discountValue)}
                </span>
              </div>
            </div>
          )}

          {/* Freight */}
          {freight > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-muted-foreground">Freight</span>
              <div className="flex gap-6">
                <span className="w-24" />
                <span className="text-[13px] font-medium w-24 text-right">{fmt$(freight)}</span>
              </div>
            </div>
          )}

          <div className="h-px bg-border" />

          {/* Subtotal after discount + freight */}
          <div className="flex justify-between items-baseline">
            <span className="text-[13px] font-semibold">Subtotal</span>
            <div className="flex gap-6">
              <span className="text-[12px] w-24 text-right" style={{ color: "#717182" }}>{fmt$(lineCostTotal)}</span>
              <span className="text-[14px] font-bold w-24 text-right">{fmt$(retailWithFreight)}</span>
            </div>
          </div>

          {/* Tax */}
          {taxRate > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-muted-foreground">
                Sales Tax {order.tax_state ? `(${order.tax_state})` : ""} {taxRate > 0 ? `${fmtPct(taxRate)}` : ""}
              </span>
              <div className="flex gap-6">
                <span className="w-24" />
                <span className="text-[13px] font-medium w-24 text-right">{fmt$(taxAmount)}</span>
              </div>
            </div>
          )}

          {taxRate > 0 && <div className="h-px bg-border" />}

          {/* Total */}
          <div className="flex justify-between items-baseline">
            <span className="text-[14px] font-bold">Total</span>
            <div className="flex gap-6">
              <span className="text-[13px] font-semibold w-24 text-right" style={{ color: "#717182" }}>{fmt$(lineCostTotal)}</span>
              <span className="text-[16px] font-bold w-24 text-right" style={{ color: "#0E2646" }}>{fmt$(taxRate > 0 ? totalWithTax : retailWithFreight)}</span>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Margin */}
          <div className="flex justify-between items-baseline">
            <span className="text-[13px] font-semibold" style={{ color: marginClr }}>Gross Margin</span>
            <span className="text-[15px] font-bold" style={{ color: marginClr }}>
              {fmt$(marginAmt)} ({fmtPct(marginPct)})
            </span>
          </div>

          {/* Margin bar */}
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(14,38,70,0.08)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(marginPct, 40)}%`, backgroundColor: marginClr }}
            />
          </div>
          <p className="text-[10px]" style={{ color: "#717182" }}>
            Target: ≥20% · {marginPct >= 20 ? "✓ On target" : marginPct >= 15 ? "⚠ Below target" : "✗ Needs review"}
          </p>
        </div>
      </div>
    </div>
  );
}
