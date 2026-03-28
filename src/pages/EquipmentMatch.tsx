import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
}

type MatchType = "exact" | "close" | "different";

function scoreMatch(
  estimate: { base_model_id: string | null; selected_options: any[] },
  equipment: { base_model_id: string | null; selected_options: any[] }
): MatchType {
  if (estimate.base_model_id !== equipment.base_model_id) return "different";
  const estIds = new Set((estimate.selected_options || []).map((o: any) => {
    const key = o.option_id + (o.left_qty || 0) + (o.right_qty || 0) + (o.quantity || 0) + (o.pivot_type || "") + (o.side || "");
    return key;
  }));
  const eqIds = new Set((equipment.selected_options || []).map((o: any) => {
    const key = o.option_id + (o.left_qty || 0) + (o.right_qty || 0) + (o.quantity || 0) + (o.pivot_type || "") + (o.side || "");
    return key;
  }));
  if (estIds.size === eqIds.size && [...estIds].every((id) => eqIds.has(id))) return "exact";
  return "close";
}

function getOptionDiffs(estOpts: any[], eqOpts: any[]) {
  const estIds = new Set(estOpts.map((o: any) => o.option_id));
  const eqIds = new Set(eqOpts.map((o: any) => o.option_id));
  const extra = eqOpts.filter((o: any) => !estIds.has(o.option_id));
  const missing = estOpts.filter((o: any) => !eqIds.has(o.option_id));
  const matching = eqOpts.filter((o: any) => estIds.has(o.option_id));
  return { extra, missing, matching };
}

const MATCH_BADGE: Record<MatchType, { bg: string; text: string; label: string }> = {
  exact: { bg: "rgba(85,186,170,0.2)", text: "#5DCAA5", label: "EXACT MATCH" },
  close: { bg: "rgba(243,209,42,0.2)", text: "#F3D12A", label: "CLOSE MATCH" },
  different: { bg: "rgba(240,240,240,0.1)", text: "rgba(240,240,240,0.5)", label: "DIFFERENT MODEL" },
};

export default function EquipmentMatch() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const pool = searchParams.get("pool") || "purchase_order";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmEquipment, setConfirmEquipment] = useState<any>(null);

  const estimateQuery = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const estimate = estimateQuery.data;

  const equipmentQuery = useQuery({
    queryKey: ["equipment-match", id, pool, estimate?.manufacturer_id],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, customers(name)")
        .eq("source_type", "direct_order")
        .is("customer_id", null)
        .eq("manufacturer_id", estimate!.manufacturer_id!);

      if (pool === "purchase_order") {
        query = query.in("status", ["purchase_order", "order_pending", "building"])
          .order("est_completion_date", { ascending: true });
      } else {
        query = query.in("status", ["ready"])
          .eq("from_inventory", true)
          .order("created_at", { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!estimate?.manufacturer_id,
  });

  const scored = useMemo(() => {
    if (!estimate || !equipmentQuery.data) return [];
    return equipmentQuery.data
      .map((eq) => ({
        ...eq,
        matchType: scoreMatch(
          { base_model_id: estimate.base_model_id, selected_options: (estimate.selected_options || []) as any[] },
          { base_model_id: eq.base_model_id, selected_options: (eq.selected_options || []) as any[] }
        ),
      }))
      .sort((a, b) => {
        const order: Record<MatchType, number> = { exact: 0, close: 1, different: 2 };
        return order[a.matchType] - order[b.matchType];
      });
  }, [estimate, equipmentQuery.data]);

  const assignMutation = useMutation({
    mutationFn: async (equipmentOrder: any) => {
      // Update equipment order: assign customer
      const { error: e1 } = await supabase.from("orders").update({
        customer_id: estimate!.customer_id,
        updated_at: new Date().toISOString(),
      }).eq("id", equipmentOrder.id);
      if (e1) throw e1;

      // Update estimate: link and approve
      const { error: e2 } = await supabase.from("orders").update({
        linked_order_id: equipmentOrder.id,
        status: "estimate",
        approved_date: format(new Date(), "yyyy-MM-dd"),
      }).eq("id", id!);
      if (e2) throw e2;

      // Timeline on equipment order
      const customerName = (estimate!.customers as any)?.name || "Customer";
      const { error: tlErr } = await supabase.from("order_timeline").insert([
        {
          order_id: equipmentOrder.id,
          event_type: "customer_approved",
          title: `${customerName} assigned`,
          description: `Linked from estimate #${estimate!.order_number}`,
        },
        {
          order_id: id,
          event_type: "status_change",
          title: "Estimate fulfilled",
          description: `Assigned to order #${equipmentOrder.order_number}`,
        },
      ]);
      if (tlErr) throw tlErr;

      return equipmentOrder;
    },
    onSuccess: (equipmentOrder) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", equipmentOrder.id] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success(`Customer assigned to order #${equipmentOrder.order_number}`);
      navigate(`/orders/${equipmentOrder.id}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (estimateQuery.isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>;
  }
  if (!estimate) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Order not found</div>;
  }

  const customerName = (estimate.customers as any)?.name || "Customer";

  return (
    <div className="max-w-3xl mx-auto pb-20 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => navigate(`/orders/${id}`)} className="p-1" style={{ color: "#55BAAA" }}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-[17px] font-bold text-foreground">Compatible equipment</h1>
      </div>
      <p className="text-sm font-medium mb-5 ml-9" style={{ color: "#55BAAA" }}>{estimate.build_shorthand}</p>

      {equipmentQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : scored.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">No compatible equipment found</p>
          <button onClick={() => navigate(`/orders/${id}`)} className="mt-4 px-6 py-2.5 rounded-full bg-catl-gold text-catl-navy font-semibold text-sm">
            Go back
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {scored.map((eq) => {
            const badge = MATCH_BADGE[eq.matchType];
            const estOpts = (estimate.selected_options || []) as any[];
            const eqOpts = (eq.selected_options || []) as any[];
            const { extra, missing, matching } = getOptionDiffs(estOpts, eqOpts);

            const diffParts: string[] = [];
            if (missing.length > 0) diffParts.push(`missing ${missing.map((o: any) => o.display_name || o.name).join(", ")}`);
            if (extra.length > 0) diffParts.push(`has ${extra.map((o: any) => o.display_name || o.name).join(", ")}`);

            return (
              <button
                key={eq.id}
                onClick={() => setConfirmEquipment(eq)}
                className="w-full text-left rounded-xl p-3.5 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: "#0E2646", minHeight: 44 }}
              >
                {/* Row 1 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium truncate" style={{ color: "#F0F0F0" }}>
                      {eq.order_number}
                    </span>
                    <span className="text-[13px] italic" style={{ color: "rgba(240,240,240,0.45)" }}>unassigned</span>
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: badge.bg, color: badge.text }}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Row 2 — option pills */}
                <div className="flex flex-wrap gap-1 mt-2 max-w-full overflow-hidden">
                  {matching.map((opt: any, i: number) => (
                    <span key={`m-${i}`} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
                      {formatSavedOptionPill(opt)}
                    </span>
                  ))}
                  {extra.map((opt: any, i: number) => (
                    <span key={`e-${i}`} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: "rgba(91,141,239,0.2)", color: "#5B8DEF" }}>
                      {formatSavedOptionPill(opt)}
                    </span>
                  ))}
                  {missing.map((opt: any, i: number) => (
                    <span key={`x-${i}`} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium line-through"
                      style={{ backgroundColor: "rgba(212,24,61,0.15)", color: "#F09595" }}>
                      {formatSavedOptionPill(opt)}
                    </span>
                  ))}
                </div>

                {/* Row 3 — detail */}
                <p className="text-[11px] mt-2" style={{ color: "rgba(240,240,240,0.45)" }}>
                  {pool === "purchase_order" ? (
                    <>
                      {eq.est_completion_date && `ETA: ${fmtDate(eq.est_completion_date)} (${differenceInDays(new Date(eq.est_completion_date + "T00:00:00"), new Date())} days)`}
                      {eq.est_completion_date && " · "}In production
                    </>
                  ) : (
                    <>
                      {eq.inventory_location && `${eq.inventory_location} · `}
                      {eq.serial_number && `S/N: ${eq.serial_number}`}
                    </>
                  )}
                </p>

                {/* Row 4 — close match diff */}
                {eq.matchType === "close" && diffParts.length > 0 && (
                  <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#F3D12A" }}>
                    Difference: {diffParts.join("; ")}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmEquipment} onOpenChange={(open) => !open && setConfirmEquipment(null)}>
        <AlertDialogContent className="max-w-sm rounded-xl p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold" style={{ color: "#1A1A1A" }}>
              Assign {customerName} to order #{confirmEquipment?.order_number}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]" style={{ color: "#717182" }}>
              This links the estimate to this equipment. The customer will be added to the order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex-row gap-2">
            <AlertDialogCancel className="flex-1 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmEquipment && assignMutation.mutate(confirmEquipment)}
              className="flex-1 active:scale-[0.97] transition-transform"
              style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending ? "Assigning…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
