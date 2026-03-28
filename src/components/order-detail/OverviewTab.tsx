import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import { toast } from "sonner";
import { Edit2, Check, X, Phone, Mail, ArrowRightCircle } from "lucide-react";
import { format } from "date-fns";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

interface OverviewTabProps {
  order: any;
  customer: any;
  manufacturer: any;
  baseModel: { name: string; short_name: string } | null | undefined;
  paperwork: any[];
  margin?: { amount: number; percent: number } | null;
  marginColor?: string;
}

export default function OverviewTab({ order, customer, manufacturer, baseModel, paperwork, margin, marginColor = "#717182" }: OverviewTabProps) {
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(order.notes || "");

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({ notes }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      setEditingNotes(false);
      toast.success("Notes saved");
    },
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      // Update order status
      const { error: orderErr } = await supabase.from("orders").update({
        status: "ordered",
        ordered_date: today,
        approved_date: today,
      }).eq("id", order.id);
      if (orderErr) throw orderErr;

      // Approve current estimate
      const { error: estErr } = await supabase.from("estimates").update({
        is_approved: true,
        approved_date: today,
      }).eq("order_id", order.id).eq("is_current", true);
      if (estErr) throw estErr;

      // Timeline entry
      const { error: tlErr } = await supabase.from("order_timeline").insert({
        order_id: order.id,
        event_type: "status_change",
        title: "Estimate approved and converted to order",
        description: `Status changed from estimate to ordered. Ordered date set to ${today}.`,
      });
      if (tlErr) throw tlErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
      toast.success("Estimate converted to order");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to convert");
    },
  });

  const isEstimate = order.source_type === "estimate" && order.status === "estimate";

  const customerDocs = paperwork.filter((d) => d.side === "customer");
  const vendorDocs = paperwork.filter((d) => d.side === "vendor");
  const customerComplete = customerDocs.filter((d) => d.status === "complete").length;
  const vendorComplete = vendorDocs.filter((d) => d.status === "complete").length;

  const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];


  return (
    <div className="space-y-5">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ─── LEFT: Order Details ─────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Order Details</h3>
          </div>
          <div className="p-4 space-y-3">
            {/* Source type badge */}
            <div>
              <span
                className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={
                  order.source_type === "estimate"
                    ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                    : { backgroundColor: "rgba(243,209,42,0.2)", color: "#8B7A0A" }
                }
              >
                {order.source_type === "estimate" ? "Estimate" : "Direct Order"}
              </span>
            </div>

            {/* Convert to Order button */}
            {isEstimate && (
              <button
                onClick={() => convertToOrderMutation.mutate()}
                disabled={convertToOrderMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold active:scale-[0.97] transition-transform disabled:opacity-50"
                style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
              >
                <ArrowRightCircle size={16} />
                {convertToOrderMutation.isPending ? "Converting…" : "Convert to Order"}
              </button>
            )}

            {/* Base model */}
            {baseModel && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Base Model</span>
                <p className="text-[14px] font-medium text-foreground">{baseModel.name}</p>
              </div>
            )}

            {/* Selected options as pills */}
            {options.length > 0 && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Options</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {options.map((opt: any, i: number) => {
                    const label = formatSavedOptionPill(opt);
                    if (!label) return null;
                    const isAddon = !opt.is_included;
                    return (
                      <span
                        key={i}
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={
                          isAddon
                            ? { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" }
                            : { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                        }
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reference numbers */}
            <div className="grid grid-cols-2 gap-3">
              {order.catl_number && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>CATL #</span>
                  <p className="text-[13px] font-medium text-foreground">{order.catl_number}</p>
                </div>
              )}
              {order.serial_number && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Serial #</span>
                  <p className="text-[13px] font-medium text-foreground">{order.serial_number}</p>
                </div>
              )}
              {order.mfg_so_number && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Mfg SO #</span>
                  <p className="text-[13px] font-medium text-foreground">{order.mfg_so_number}</p>
                </div>
              )}
              {order.mfg_po_number && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>PO #</span>
                  <p className="text-[13px] font-medium text-foreground">{order.mfg_po_number}</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Notes</span>
                {!editingNotes && (
                  <button onClick={() => { setNotes(order.notes || ""); setEditingNotes(true); }} className="p-1" style={{ color: "#717182" }}>
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="mt-1">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none resize-none"
                  />
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => saveNotesMutation.mutate()} disabled={saveNotesMutation.isPending} className="p-1" style={{ color: "#27AE60" }}>
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingNotes(false)} className="p-1" style={{ color: "#717182" }}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground mt-0.5 whitespace-pre-wrap">
                  {order.notes || "No notes"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Financials ──────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
            <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Financials</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-muted-foreground">Customer Price</span>
              <span className="text-[15px] font-semibold text-foreground">{fmtCurrency(order.customer_price)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-muted-foreground">Our Cost</span>
              <span className="text-[15px] font-semibold text-foreground">{fmtCurrency(order.our_cost)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-muted-foreground">Margin</span>
              <span className="text-[15px] font-semibold" style={{ color: marginColor }}>
                {margin ? `${fmtCurrency(margin.amount)} (${margin.percent.toFixed(1)}%)` : "—"}
              </span>
            </div>
            {order.freight_estimate != null && (
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] text-muted-foreground">Freight Estimate</span>
                <span className="text-[13px] font-medium text-foreground">{fmtCurrency(order.freight_estimate)}</span>
              </div>
            )}
            {(order.discount_amount != null && order.discount_amount > 0) && (
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] text-muted-foreground">Discount</span>
                <span className="text-[13px] font-medium" style={{ color: "#D4183D" }}>
                  {order.discount_type === "%" ? `${order.discount_amount}%` : fmtCurrency(order.discount_amount)}
                </span>
              </div>
            )}
            {order.subtotal != null && (
              <>
                <div className="h-px bg-border" />
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] font-medium text-foreground">Subtotal</span>
                  <span className="text-[15px] font-bold text-foreground">{fmtCurrency(order.subtotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── QUICK ACTIONS ───────────────────────────────── */}
      {customer && (
        <div className="flex gap-2 flex-wrap">
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
              style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
            >
              <Phone size={14} /> Call Customer
            </a>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
              style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
            >
              <Mail size={14} /> Email Customer
            </a>
          )}
        </div>
      )}

      {/* ─── PAPERWORK STATUS CARDS ──────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Customer Side</div>
          <div className="text-[18px] font-semibold text-foreground mt-1">
            {customerComplete}/{customerDocs.length} <span className="text-[13px] font-normal text-muted-foreground">complete</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${customerDocs.length > 0 ? (customerComplete / customerDocs.length) * 100 : 0}%`, backgroundColor: "#27AE60" }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Vendor Side</div>
          <div className="text-[18px] font-semibold text-foreground mt-1">
            {vendorComplete}/{vendorDocs.length} <span className="text-[13px] font-normal text-muted-foreground">complete</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${vendorDocs.length > 0 ? (vendorComplete / vendorDocs.length) * 100 : 0}%`, backgroundColor: "#27AE60" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
