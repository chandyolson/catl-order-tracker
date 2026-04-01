import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Send, ExternalLink, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pushing, setPushing] = useState(false);

  const estimateQuery = useQuery({
    queryKey: ["estimate_detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*, customers(*), base_models:base_model_id(name, short_name, retail_price, cost_price), manufacturers:manufacturer_id(name, short_name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const estimate = estimateQuery.data;
  if (estimateQuery.isLoading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (!estimate) return <div className="p-6 text-center text-muted-foreground">Estimate not found</div>;

  const customer = estimate.customers as any;
  const baseModel = estimate.base_models as any;
  const manufacturer = estimate.manufacturers as any;
  const lineItems = estimate.line_items || [];
  const selectedOptions = estimate.selected_options || [];
  const isConverted = estimate.converted_to_order || !!estimate.order_id;
  const isSynced = estimate.qb_sync_status === "synced";
  const isOutOfSync = estimate.qb_sync_status === "out_of_sync";

  const options = (lineItems as any[]).filter((li: any) => li.type === "option");
  const baseItem = (lineItems as any[]).find((li: any) => li.type === "base_model");

  const subtotal = estimate.subtotal || estimate.total_price || 0;
  const discount = estimate.discount_amount || 0;
  const discountDisplay = estimate.discount_type === "%" ? `${discount}%` : fmtCurrency(discount);
  const tax = estimate.tax_amount || 0;
  const total = estimate.total_with_tax || estimate.total_price || 0;

  async function handlePushToQB() {
    if (!estimate.order_id) {
      toast.error("Convert to an order first before pushing to QuickBooks");
      return;
    }
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke("qb-push-estimate", {
        body: { estimate_id: estimate.id },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Pushed to QB as #${data.qb_doc_number}`);
        queryClient.invalidateQueries({ queryKey: ["estimate_detail", id] });
      } else {
        toast.error(data?.error || "QB push failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Push failed");
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "#0E2646" }}>
        <div className="p-4 pb-3">
          <div className="flex items-start gap-2">
            <button onClick={() => navigate("/estimates")} className="p-1 shrink-0 mt-0.5" style={{ color: "#55BAAA" }}>
              <ChevronLeft size={22} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {estimate.estimate_number && (
                  <span className="text-[14px] font-bold" style={{ color: "#F3D12A" }}>{estimate.estimate_number}</span>
                )}
                <h1 className="text-[18px] font-bold" style={{ color: "#F0F0F0" }}>
                  {estimate.contract_name || baseModel?.name || estimate.build_shorthand || "Estimate"}
                </h1>
              </div>
              <p className="text-[14px] font-semibold mt-1" style={{ color: "rgba(240,240,240,0.85)" }}>
                {customer?.name || "No customer"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(240,240,240,0.5)" }}>
                {manufacturer?.name || "No manufacturer"} · v{estimate.version_number}
                {estimate.label && ` · "${estimate.label}"`}
              </p>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={isConverted
              ? { backgroundColor: "rgba(39,174,96,0.2)", color: "#27AE60" }
              : { backgroundColor: "rgba(243,209,42,0.2)", color: "#F3D12A" }}>
            {isConverted ? "Ordered" : estimate.status === "sent" ? "Sent" : "Open"}
          </span>
          {isSynced && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,174,96,0.2)", color: "#27AE60" }}>
              QB ✓
            </span>
          )}
          {isOutOfSync && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(243,161,42,0.2)", color: "#F3A12A" }}>
              QB out of sync
            </span>
          )}
          {estimate.qb_doc_number && (
            <span className="text-[10px] font-medium" style={{ color: "rgba(240,240,240,0.5)" }}>
              QB #{estimate.qb_doc_number}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="px-4 pb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px]" style={{ color: "rgba(240,240,240,0.4)" }}>Total</p>
            <p className="text-[24px] font-bold" style={{ color: "#F0F0F0" }}>{fmtCurrency(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px]" style={{ color: "rgba(240,240,240,0.4)" }}>Created</p>
            <p className="text-[13px] font-medium" style={{ color: "#F0F0F0" }}>
              {fmtDate(estimate.estimate_date || estimate.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-5">
        {!isConverted && (
          <button
            onClick={() => navigate(`/estimates/${estimate.id}/convert`)}
            className="flex-1 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#0E2646", color: "#F3D12A" }}
          >
            Convert to Order
          </button>
        )}
        {isConverted && estimate.order_id && (
          <button
            onClick={() => navigate(`/orders/${estimate.order_id}`)}
            className="flex-1 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform"
            style={{ border: "2px solid #55BAAA", color: "#55BAAA" }}
          >
            View Order
          </button>
        )}
        {estimate.order_id && (
          <button
            onClick={handlePushToQB}
            disabled={pushing}
            className="flex-1 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-50"
            style={isOutOfSync
              ? { backgroundColor: "#F3A12A", color: "#0E2646" }
              : { border: "2px solid #0E2646", color: "#0E2646" }}
          >
            {pushing ? "Pushing..." : isOutOfSync ? "Re-push to QB" : isSynced ? "Re-push to QB" : "Push to QB"}
          </button>
        )}
      </div>

      {/* Customer */}
      {customer && (
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>Customer</p>
          <p className="text-[18px] font-bold" style={{ color: "#0E2646" }}>{customer.name}</p>
          {customer.email && <p className="text-[13px] text-muted-foreground mt-1">{customer.email}</p>}
          {customer.phone && <p className="text-[13px] text-muted-foreground">{customer.phone}</p>}
        </div>
      )}

      {/* Equipment */}
      <div className="rounded-xl border border-border bg-card p-4 mb-4">
        <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>Equipment</p>
        <p className="text-[14px] font-semibold" style={{ color: "#0E2646" }}>
          {baseModel?.name || baseItem?.name || "No base model"}
        </p>
        <p className="text-[12px] text-muted-foreground mb-3">{estimate.build_shorthand}</p>

        {/* Line items */}
        {baseItem && (
          <div className="flex justify-between py-1.5 border-b border-border">
            <span className="text-[12px] font-medium" style={{ color: "#0E2646" }}>{baseItem.name}</span>
            <span className="text-[12px] font-medium" style={{ color: "#0E2646" }}>{fmtCurrency(baseItem.retail_price)}</span>
          </div>
        )}
        {options.map((opt: any, i: number) => (
          <div key={i} className="flex justify-between py-1.5 border-b border-border last:border-0">
            <span className="text-[12px]" style={{ color: "#717182" }}>
              {opt.display_name || opt.name}
              {opt.quantity > 1 && ` × ${opt.quantity}`}
              {opt.left_qty > 0 && ` (L:${opt.left_qty})`}
              {opt.right_qty > 0 && ` (R:${opt.right_qty})`}
            </span>
            <span className="text-[12px]" style={{ color: "#717182" }}>
              {opt.total_retail > 0 ? fmtCurrency(opt.total_retail) : "Included"}
            </span>
          </div>
        ))}

        {/* Totals */}
        <div className="mt-3 pt-2 border-t border-border space-y-1">
          <div className="flex justify-between">
            <span className="text-[12px]" style={{ color: "#717182" }}>Subtotal</span>
            <span className="text-[12px] font-medium" style={{ color: "#0E2646" }}>{fmtCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between">
              <span className="text-[12px]" style={{ color: "#D4183D" }}>Discount ({discountDisplay})</span>
              <span className="text-[12px]" style={{ color: "#D4183D" }}>-{fmtCurrency(estimate.discount_type === "%" ? subtotal * discount / 100 : discount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between">
              <span className="text-[12px]" style={{ color: "#717182" }}>Tax ({estimate.tax_state} {estimate.tax_rate}%)</span>
              <span className="text-[12px]" style={{ color: "#717182" }}>{fmtCurrency(tax)}</span>
            </div>
          )}
          {estimate.freight_estimate > 0 && (
            <div className="flex justify-between">
              <span className="text-[12px]" style={{ color: "#717182" }}>Freight (est.)</span>
              <span className="text-[12px]" style={{ color: "#717182" }}>{fmtCurrency(estimate.freight_estimate)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1">
            <span className="text-[13px] font-bold" style={{ color: "#0E2646" }}>Total</span>
            <span className="text-[13px] font-bold" style={{ color: "#0E2646" }}>{fmtCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {estimate.notes && (
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>Notes</p>
          <p className="text-[13px]" style={{ color: "#0E2646" }}>{estimate.notes}</p>
        </div>
      )}
    </div>
  );
}
