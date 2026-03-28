import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Warehouse, Package, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import NewOrderPicker from "@/components/NewOrderPicker";
import { cn } from "@/lib/utils";

type TabKey = "assigned" | "instock" | "onorder";

const ASSIGNED_STATUSES = ["ordered", "so_received", "in_production", "completed", "freight_arranged"];
const INSTOCK_STATUSES = ["completed", "freight_arranged"];
const ONORDER_STATUSES = ["ordered", "so_received", "in_production"];

const selectStr = "*, customers(name), manufacturers(name, short_name), base_models:base_model_id(name, short_name)";

function useInventoryQuery(key: string, filterFn: (q: any) => any) {
  return useQuery({
    queryKey: ["inventory", key],
    queryFn: async () => {
      let q = supabase.from("orders").select(selectStr);
      q = filterFn(q);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("assigned");
  const [search, setSearch] = useState("");
  const [mfgFilter, setMfgFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const assigned = useInventoryQuery("assigned", (q: any) =>
    q.eq("source_type", "direct_order").not("customer_id", "is", null).in("status", ASSIGNED_STATUSES)
  );
  const instock = useInventoryQuery("instock", (q: any) =>
    q.eq("from_inventory", true).is("customer_id", null).in("status", INSTOCK_STATUSES)
  );
  const onorder = useInventoryQuery("onorder", (q: any) =>
    q.eq("source_type", "direct_order").is("customer_id", null).in("status", ONORDER_STATUSES)
  );

  const { data: manufacturers } = useQuery({
    queryKey: ["manufacturers-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("manufacturers").select("id, name, short_name").order("name");
      return data || [];
    },
  });

  const dataMap = { assigned: assigned.data || [], instock: instock.data || [], onorder: onorder.data || [] };
  const loadingMap = { assigned: assigned.isLoading, instock: instock.isLoading, onorder: onorder.isLoading };

  const filtered = useMemo(() => {
    let items = dataMap[tab] as any[];
    if (mfgFilter) items = items.filter((o: any) => o.manufacturer_id === mfgFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter((o: any) =>
        (o.build_shorthand || "").toLowerCase().includes(s) ||
        (o.order_number || "").toLowerCase().includes(s) ||
        (o.serial_number || "").toLowerCase().includes(s) ||
        ((o.customers as any)?.name || "").toLowerCase().includes(s)
      );
    }
    return items;
  }, [tab, search, mfgFilter, dataMap]);

  const counts = {
    assigned: (assigned.data || []).length,
    instock: (instock.data || []).length,
    onorder: (onorder.data || []).length,
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "assigned", label: "Assigned", count: counts.assigned },
    { key: "instock", label: "In Stock", count: counts.instock },
    { key: "onorder", label: "On Order", count: counts.onorder },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F0" }}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0E2646" }}>Equipment Inventory</h1>
          <p className="text-sm mt-1" style={{ color: "#717182" }}>Track assigned, in-stock, and on-order equipment</p>
        </div>

        {/* KPI pills */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          <span className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-white" style={{ backgroundColor: "#0E2646" }}>
            {counts.assigned} Assigned
          </span>
          <span className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-white" style={{ backgroundColor: "#55BAAA" }}>
            {counts.instock} In Stock
          </span>
          <span className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>
            {counts.onorder} On Order
          </span>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#717182" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search build, order #, customer, serial…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm bg-white"
              style={{ borderColor: "#D1D1D6", color: "#0E2646" }}
            />
          </div>
          <select
            value={mfgFilter}
            onChange={(e) => setMfgFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm bg-white"
            style={{ borderColor: "#D1D1D6", color: "#0E2646" }}
          >
            <option value="">All Manufacturers</option>
            {(manufacturers || []).map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "#D1D1D6" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-center py-2.5 text-sm font-semibold transition-colors"
              style={{
                color: tab === t.key ? "#0E2646" : "#717182",
                borderBottom: tab === t.key ? "3px solid #F3D12A" : "3px solid transparent",
              }}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Card list */}
        {loadingMap[tab] ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} onOrder={() => setPickerOpen(true)} />
        ) : (
          <div className="space-y-4">
            {filtered.map((order: any) => (
              <InventoryCard key={order.id} order={order} tab={tab} navigate={navigate} />
            ))}
          </div>
        )}
      </div>
      <NewOrderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

function EmptyState({ tab, onOrder }: { tab: TabKey; onOrder: () => void }) {
  const config = {
    assigned: { icon: <Package size={40} style={{ color: "#717182" }} />, msg: "No equipment currently assigned to customers" },
    instock: { icon: <Warehouse size={40} style={{ color: "#717182" }} />, msg: "No equipment in stock" },
    onorder: { icon: <Package size={40} style={{ color: "#717182" }} />, msg: "No unassigned equipment on order" },
  }[tab];

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      {config.icon}
      <p className="text-sm" style={{ color: "#717182" }}>{config.msg}</p>
      {(tab === "instock" || tab === "onorder") && (
        <button
          onClick={onOrder}
          className="rounded-full px-5 py-2 text-sm font-semibold active:scale-[0.97] transition-transform"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
        >
          Order Equipment
        </button>
      )}
    </div>
  );
}

function InventoryCard({ order, tab, navigate }: { order: any; tab: TabKey; navigate: any }) {
  const custName = (order.customers as any)?.name;
  const mfg = order.manufacturers as any;
  const options = Array.isArray(order.selected_options) ? order.selected_options : [];
  const pills = options.map((o: any) => ({ label: formatSavedOptionPill(o), included: o.is_included })).filter((p: any) => p.label);

  const price = order.customer_price;
  const eta = order.est_completion_date;

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ border: "1px solid #E5E5E0" }}>
      {/* Navy header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#0E2646" }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-sm">{order.order_number}</span>
          <StatusBadge status={order.status} />
        </div>
        {price != null && (
          <span className="font-bold text-sm" style={{ color: "#F3D12A" }}>
            ${Number(price).toLocaleString()}
          </span>
        )}
      </div>

      {/* White body */}
      <div className="px-4 py-3 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <p className={cn("text-sm", custName ? "font-medium" : "italic")} style={{ color: custName ? "#0E2646" : "#717182" }}>
            {custName || "Unassigned"}
          </p>
          {mfg && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }}>
              {mfg.short_name || mfg.name}
            </span>
          )}
        </div>
        <p className="text-sm font-medium" style={{ color: "#55BAAA" }}>{order.build_shorthand}</p>
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p: any, i: number) => (
              <span
                key={i}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={
                  p.included
                    ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                    : { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" }
                }
              >
                {p.label}
              </span>
            ))}
          </div>
        )}
        {tab === "instock" && (order.serial_number || order.inventory_location) && (
          <div className="flex gap-4 text-[11px]" style={{ color: "#717182" }}>
            {order.serial_number && <span>SN: {order.serial_number}</span>}
            {order.inventory_location && <span>Loc: {order.inventory_location}</span>}
          </div>
        )}
      </div>

      {/* Cream footer */}
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#F5F5F0" }}>
        <span className="text-[11px]" style={{ color: "#717182" }}>
          {eta ? `ETA: ${format(new Date(eta), "MMM d, yyyy")}` : tab === "instock" && order.inventory_location ? `📍 ${order.inventory_location}` : ""}
        </span>
        {tab === "assigned" && (
          <ActionButton label="View Order" variant="outline" onClick={() => navigate(`/orders/${order.id}`)} />
        )}
        {tab === "instock" && (
          <ActionButton label="Assign to Customer" variant="gold" onClick={() => navigate(`/orders/${order.id}`)} />
        )}
        {tab === "onorder" && (
          <ActionButton label="Claim for Customer" variant="teal" onClick={() => navigate(`/orders/${order.id}`)} />
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, variant, onClick }: { label: string; variant: "outline" | "gold" | "teal"; onClick: () => void }) {
  const styles = {
    outline: { backgroundColor: "transparent", color: "#0E2646", border: "1px solid #0E2646" },
    gold: { backgroundColor: "#F3D12A", color: "#0E2646", border: "none" },
    teal: { backgroundColor: "#55BAAA", color: "#ffffff", border: "none" },
  }[variant];

  return (
    <button
      onClick={onClick}
      className="rounded-full text-[12px] font-semibold px-4 py-1.5 active:scale-[0.97] transition-transform flex items-center gap-1.5"
      style={styles}
    >
      {label} <ArrowRight size={12} />
    </button>
  );
}
