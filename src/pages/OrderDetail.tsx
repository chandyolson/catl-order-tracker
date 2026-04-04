import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft, ChevronRight, Edit2, MoreVertical, Trash2, AlertTriangle, ExternalLink, ClipboardList, Copy,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import StatusBadge from "@/components/StatusBadge";
import OverviewTab from "@/components/order-detail/OverviewTab";
import EstimatesTab from "@/components/order-detail/EstimatesTab";
import FinancialsTab from "@/components/order-detail/FinancialsTab";
import CompareTab from "@/components/order-detail/CompareTab";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  estimate: { label: "Estimate", bg: "#F1EFE8", text: "#444441" },
  purchase_order: { label: "Purchase order", bg: "#E6F1FB", text: "#0C447C" },
  order_pending: { label: "Order pending", bg: "#EEEDFE", text: "#3C3489" },
  building: { label: "Building", bg: "#FAEEDA", text: "#633806" },
  ready: { label: "Ready", bg: "#E1F5EE", text: "#085041" },
  delivered: { label: "Delivered", bg: "#EAF3DE", text: "#27500A" },
  closed: { label: "Closed", bg: "#F1EFE8", text: "#717182" },
};

function StatusDropdown({ orderId, currentStatus, onChanged }: { orderId: string; currentStatus: string; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const cfg = STATUS_CONFIG[currentStatus] || { label: currentStatus, bg: "#F1EFE8", text: "#444441" };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
      if (error) throw error;
      await supabase.from("order_timeline").insert({
        order_id: orderId, event_type: "status_change",
        title: `Status → ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
        description: `Changed from ${cfg.label}`,
      });
      toast.success(`Status → ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      onChanged();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold cursor-pointer active:scale-[0.95] transition-transform"
          style={{ backgroundColor: cfg.bg, color: cfg.text, opacity: saving ? 0.5 : 1 }}>
          {cfg.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {Object.entries(STATUS_CONFIG).map(([key, val]) => (
          <DropdownMenuItem key={key} onClick={() => handleStatusChange(key)} className="cursor-pointer">
            <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: val.text }} />
            <span style={{ fontWeight: key === currentStatus ? 700 : 400 }}>{val.label}</span>
            {key === currentStatus && <span className="ml-auto text-[10px]">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fmtDate(d: string | null | undefined, includeYear = false) {
  if (!d) return "—";
  try {
    const date = new Date(d + "T00:00:00");
    return format(date, includeYear ? "MMM d, yyyy" : "MMM d");
  } catch { return d; }
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "estimates" | "financials" | "compare">("overview");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  // ─── QUERIES ────────────────────────────────────────────
  const orderQuery = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, phone, email, company, address_city, address_state), manufacturers(name, short_name, avg_lead_days, ordering_portal_url, qb_vendor_id)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const baseModelQuery = useQuery({
    queryKey: ["base_model", orderQuery.data?.base_model_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("base_models")
        .select("name, short_name")
        .eq("id", orderQuery.data!.base_model_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderQuery.data?.base_model_id,
  });

  const paperworkQuery = useQuery({
    queryKey: ["paperwork", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paperwork")
        .select("*")
        .eq("order_id", id!)
        .order("side")
        .order("document_type");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const timelineQuery = useQuery({
    queryKey: ["order_timeline", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_timeline")
        .select("*")
        .eq("order_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const estimatesQuery = useQuery({
    queryKey: ["estimates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*")
        .eq("order_id", id!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const order = orderQuery.data;
  const customer = order?.customers as any;
  const manufacturer = order?.manufacturers as any;

  const isEstimate = order?.status === "estimate";

  // ─── MUTATIONS ──────────────────────────────────────────
  const deleteOrderMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.error(`Order ${order?.order_number} deleted`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate("/equipment");
    },
    onError: (err: any) => toast.error("Failed to delete: " + err.message),
  });

  const duplicateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("No order to duplicate");
      const { data: newOrder, error } = await supabase.from("orders").insert({
        manufacturer_id: order.manufacturer_id,
        base_model_id: order.base_model_id,
        base_model: order.base_model,
        build_shorthand: order.build_shorthand,
        selected_options: order.selected_options,
        subtotal: order.subtotal,
        our_cost: order.our_cost,
        customer_price: order.customer_price,
        discount_amount: order.discount_amount,
        discount_type: order.discount_type,
        freight_estimate: order.freight_estimate,
        from_inventory: true,
        status: "order_pending",
        contract_name: order.contract_name ? `${order.contract_name} (copy)` : null,
      }).select("id").single();
      if (error) throw error;
      return newOrder;
    },
    onSuccess: (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ["equipment_orders"] });
      toast.success("Order duplicated — edit the new one to set contract details");
      navigate(`/orders/${newOrder.id}/edit`);
    },
    onError: (err: any) => toast.error("Failed to duplicate: " + err.message),
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({
        status: "purchase_order",
        ordered_date: format(new Date(), "yyyy-MM-dd"),
      }).eq("id", id!);
      if (error) throw error;
      await supabase.from("order_timeline").insert({
        order_id: id,
        event_type: "status_change",
        title: "Estimate converted to order",
        description: `New order placed with ${manufacturer?.name || "manufacturer"}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", id] });
      toast.success("Estimate converted to order");
      setShowConvertModal(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const onOrderCountQuery = useQuery({
    queryKey: ["on-order-count", id, order?.manufacturer_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("source_type", "direct_order")
        .is("customer_id", null)
        .in("status", ["purchase_order", "order_pending", "building"])
        .eq("manufacturer_id", order?.manufacturer_id || "");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!order?.manufacturer_id && isEstimate,
  });

  const inventoryCountQuery = useQuery({
    queryKey: ["inventory-count", id, order?.manufacturer_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("source_type", "direct_order")
        .is("customer_id", null)
        .in("status", ["ready"])
        .eq("from_inventory", true)
        .eq("manufacturer_id", order?.manufacturer_id || "");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!order?.manufacturer_id && isEstimate,
  });

  // ─── MARGIN ─────────────────────────────────────────────
  const margin = useMemo(() => {
    if (!order?.customer_price || !order?.our_cost) return null;
    const amount = order.customer_price - order.our_cost;
    const percent = (amount / order.customer_price) * 100;
    return { amount, percent };
  }, [order]);

  const marginColor = margin
    ? margin.percent >= 15 ? "#27AE60" : margin.percent >= 10 ? "#F3D12A" : "#D4183D"
    : "rgba(240,240,240,0.45)";

  // ─── KEY DATES ──────────────────────────────────────────
  const etaOverdue = order?.est_completion_date && !order?.actual_completion_date && !order?.delivered_date
    && new Date(order.est_completion_date + "T00:00:00") < new Date();

  if (orderQuery.isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading order…</div>;
  }
  if (!order) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Order not found</div>;
  }

  const hasEstimates = order?.source_type === "estimate" || !!order?.customer_id || (estimatesQuery.data && estimatesQuery.data.length > 0);
  const tabs = [
    { key: "overview" as const, label: "Overview" },
    ...(hasEstimates ? [{ key: "estimates" as const, label: "Estimates" }] : []),
    { key: "financials" as const, label: "Financials 🔒" },
    { key: "compare" as const, label: "Compare" },
  ];

  const keyDates = [
    { label: "Estimate", value: fmtDate(order.estimate_date) },
    { label: "Ordered", value: fmtDate(order.ordered_date) },
    { label: "ETA", value: fmtDate(order.est_completion_date), overdue: etaOverdue },
    { label: "Delivered", value: fmtDate(order.delivered_date) },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-32 overflow-x-hidden">
      {/* ─── HEADER — Navy Card ──────────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "#0E2646" }}>
        {/* Top section */}
        <div className="p-4 pb-3">
          <div className="flex items-start gap-2">
            <button onClick={() => navigate("/equipment")} className="p-1 shrink-0 mt-0.5" style={{ color: "#55BAAA" }}>
              <ChevronLeft size={22} />
            </button>
            <div className="min-w-0 flex-1">
              {/* Row 1: Contract Name + MOLY # + Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[20px] font-bold" style={{ color: "#F0F0F0" }}>
                  {(order as any).contract_name || "Untitled Order"}
                </h1>
                {(order as any).moly_contract_number && (
                  <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#F3D12A" }}>
                    #{(order as any).moly_contract_number}
                  </span>
                )}
                <StatusDropdown orderId={order.id} currentStatus={order.status} onChanged={() => queryClient.invalidateQueries({ queryKey: ["order", id] })} />
              </div>

              {/* Row 2: Manufacturer + Base Model + Extended (the blue build box) */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {manufacturer && (
                  <span className="text-[12px] font-semibold px-2.5 py-1 rounded-lg" style={{ backgroundColor: "rgba(85,186,170,0.12)", color: "#55BAAA" }}>
                    {manufacturer.short_name || manufacturer.name}
                  </span>
                )}
                {baseModelQuery.data && (
                  <span className="text-[14px] font-bold" style={{ color: "#F0F0F0" }}>
                    {baseModelQuery.data.name}
                  </span>
                )}
                {/* Extended length indicator */}
                {Array.isArray(order.selected_options) && (order.selected_options as any[]).some((opt: any) => {
                  const name = (opt.name || opt.display_name || "").toLowerCase();
                  return name.includes("extended") || (opt.short_code || "").toLowerCase() === "ext";
                }) && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.2)", color: "#F3D12A" }}>
                    Extended
                  </span>
                )}
                {customer?.name && (
                  <span className="text-[13px] font-medium ml-auto" style={{ color: "rgba(240,240,240,0.5)" }}>
                    {customer.name}
                  </span>
                )}
              </div>

              {/* Row 3: Spec pills */}
              {Array.isArray(order.selected_options) && (order.selected_options as any[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(order.selected_options as any[]).map((opt: any, i: number) => {
                    const pillLabel = formatSavedOptionPill(opt);
                    if (!pillLabel) return null;
                    // Skip base model and extended (already shown above)
                    if (opt.is_base_model) return null;
                    const name = (opt.name || opt.display_name || "").toLowerCase();
                    if (name.includes("extended") && (name.includes("length") || name.includes("chute"))) return null;
                    return (
                      <span key={i} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
                        {pillLabel}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Build shorthand if set */}
              {order.build_shorthand && (
                <p className="text-[12px] font-medium mt-1.5" style={{ color: "rgba(240,240,240,0.4)" }}>
                  {order.build_shorthand}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => navigate(`/orders/${id}/edit`)}
                className="flex items-center justify-center rounded-lg w-9 h-9 active:scale-[0.95] transition-all"
                style={{ color: "rgba(240,240,240,0.5)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#F0F0F0"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(240,240,240,0.5)"; e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Edit2 size={16} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center rounded-lg w-9 h-9 active:scale-[0.95] transition-all"
                    style={{ color: "rgba(240,240,240,0.5)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#F0F0F0"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(240,240,240,0.5)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <MoreVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  <DropdownMenuItem
                    onClick={() => navigate(`/orders/${id}/orange-sheet`)}
                    className="cursor-pointer"
                  >
                    <ClipboardList size={14} className="mr-2" style={{ color: "#F59E0B" }} />
                    Orange Sheet
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { if (confirm("Duplicate this order's specs into a new order?")) duplicateOrderMutation.mutate(); }}
                    className="cursor-pointer"
                  >
                    <Copy size={14} className="mr-2" style={{ color: "#55BAAA" }} />
                    Duplicate Specs
                  </DropdownMenuItem>
                  {manufacturer?.ordering_portal_url && (
                    <DropdownMenuItem
                      onClick={() => window.open(manufacturer.ordering_portal_url, "_blank")}
                      className="cursor-pointer"
                    >
                      <ExternalLink size={14} className="mr-2" />
                      Order on {manufacturer.short_name || manufacturer.name} Portal
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-[#D4183D] focus:text-[#D4183D] focus:bg-red-50 cursor-pointer"
                  >
                    <Trash2 size={14} className="mr-2" />
                    Delete order
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Key dates bar */}
        <div className="grid grid-cols-4 gap-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          {keyDates.map((d) => (
            <div key={d.label} className="px-3 py-2.5 text-center" style={{ backgroundColor: "#0E2646" }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.35)" }}>{d.label}</div>
              <div
                className="text-[13px] font-medium mt-0.5"
                style={{ color: d.overdue ? "#D4183D" : d.value === "—" ? "rgba(240,240,240,0.3)" : "#F0F0F0" }}
              >
                {d.value}
                {d.overdue && <span className="text-[10px] ml-1" style={{ color: "#D4183D" }}>OVERDUE</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── CONVERT TO ORDER BAR ────────────────────────── */}
      {isEstimate && (
        <div
          className="rounded-lg p-3 mb-5 flex items-center justify-between"
          style={{ backgroundColor: "#E1F5EE", border: "0.5px solid #5DCAA5" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium" style={{ color: "#085041" }}>Ready to convert?</span>
          </div>
          <button
            onClick={() => setShowConvertModal(true)}
            className="px-4 py-1.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            Convert to order
          </button>
        </div>
      )}

      {/* ─── TABS ────────────────────────────────────────── */}
      <div className="flex border-b border-border mb-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium text-center transition-colors whitespace-nowrap min-w-0",
              activeTab === t.key ? "text-foreground border-b-2" : "text-muted-foreground"
            )}
            style={activeTab === t.key ? { borderBottomColor: "#F3D12A" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────── */}
      {activeTab === "overview" && (
        <OverviewTab
          order={order}
          customer={customer}
          manufacturer={manufacturer}
          baseModel={baseModelQuery.data}
          paperwork={paperworkQuery.data || []}
          margin={margin}
          marginColor={marginColor}
          events={timelineQuery.data || []}
          queryClient={queryClient}
        />
      )}
      {activeTab === "estimates" && (
        <EstimatesTab
          orderId={id!}
          estimates={estimatesQuery.data || []}
          order={order}
          queryClient={queryClient}
        />
      )}
      {activeTab === "financials" && (
        <FinancialsTab
          order={order}
          margin={margin}
          marginColor={marginColor}
        />
      )}
      {activeTab === "compare" && (
        <CompareTab orderId={id!} order={order} />
      )}

      {/* ─── DELETE CONFIRMATION DIALOG ──────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-sm rounded-xl p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(212,24,61,0.1)" }}>
              <AlertTriangle size={24} style={{ color: "#D4183D" }} />
            </div>
            <AlertDialogHeader className="sm:text-center">
              <AlertDialogTitle className="text-base font-semibold" style={{ color: "#1A1A1A" }}>
                Delete this order?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] mt-1" style={{ color: "#717182" }}>
                This will permanently delete order {order.order_number} and all associated data. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="mt-4 flex-row gap-2">
            <AlertDialogCancel className="flex-1 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrderMutation.mutate()}
              className="flex-1 active:scale-[0.97] transition-transform"
              style={{ backgroundColor: "#D4183D", color: "#fff" }}
              disabled={deleteOrderMutation.isPending}
            >
              {deleteOrderMutation.isPending ? "Deleting…" : "Delete order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── CONVERT TO ORDER MODAL ─────────────────────── */}
      <AlertDialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <AlertDialogContent className="max-w-sm rounded-xl p-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-medium" style={{ color: "#1A1A1A" }}>
              Convert to order
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs" style={{ color: "#717182" }}>
              How do you want to fulfill this?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 mt-3">
            <button
              onClick={() => convertToOrderMutation.mutate()}
              disabled={convertToOrderMutation.isPending}
              className="w-full text-left rounded-lg p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: "#E1F5EE", border: "0.5px solid #5DCAA5" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "#085041" }}>Order new from manufacturer</p>
                <p className="text-[11px]" style={{ color: "#0F6E56" }}>
                  Submit PO to {manufacturer?.name || "manufacturer"}
                </p>
              </div>
              <ChevronRight size={16} style={{ color: "#5DCAA5" }} className="flex-shrink-0" />
            </button>
            <button
              onClick={() => { setShowConvertModal(false); navigate(`/orders/${id}/match?pool=purchase_order`); }}
              className="w-full text-left rounded-lg p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: "#E6F1FB", border: "0.5px solid #85B7EB" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "#0C447C" }}>Assign to equipment on order</p>
                <p className="text-[11px]" style={{ color: "#185FA5" }}>
                  {onOrderCountQuery.data ?? "…"} compatible units being built
                </p>
              </div>
              <ChevronRight size={16} style={{ color: "#85B7EB" }} className="flex-shrink-0" />
            </button>
            <button
              onClick={() => { setShowConvertModal(false); navigate(`/orders/${id}/match?pool=inventory`); }}
              className="w-full text-left rounded-lg p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: "#FAEEDA", border: "0.5px solid #EF9F27" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "#633806" }}>Sell from inventory</p>
                <p className="text-[11px]" style={{ color: "#854F0B" }}>
                  {inventoryCountQuery.data ?? "…"} matching units in stock
                </p>
              </div>
              <ChevronRight size={16} style={{ color: "#EF9F27" }} className="flex-shrink-0" />
            </button>
          </div>
          <AlertDialogFooter className="mt-3">
            <AlertDialogCancel className="w-full mt-0">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
