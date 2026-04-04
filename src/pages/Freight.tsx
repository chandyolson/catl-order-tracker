import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, Plus, ArrowLeft, MapPin, Phone, ChevronDown, ChevronUp,
  Trash2, Check, Share2, Package, GripVertical, User, Edit2, X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// ─── types ──────────────────────────────────────────────────
type RunStatus = "planning" | "scheduled" | "loading" | "in_transit" | "completed" | "cancelled";
type StopStatus = "pending" | "en_route" | "delivered" | "skipped";
type CarrierType = "external_trucker" | "catl_vehicle";

interface Carrier {
  id: string; name: string; type: CarrierType; phone: string | null;
  vehicle_description: string | null; notes: string | null; is_active: boolean;
}
interface FreightRun {
  id: string; name: string | null; pickup_location: string; pickup_address: string | null;
  pickup_city: string | null; pickup_state: string | null; carrier_id: string | null;
  driver_name: string | null; status: RunStatus; pickup_date: string | null;
  estimated_arrival: string | null; actual_cost: number | null; freight_notes: string | null;
  share_token: string | null; created_at: string; carriers?: Carrier | null;
}
interface FreightStop {
  id: string; freight_run_id: string; order_id: string | null; stop_order: number;
  customer_name: string | null; delivery_address: string | null; delivery_city: string | null;
  delivery_state: string | null; delivery_zip: string | null; delivery_phone: string | null;
  delivery_instructions: string | null; unloading_equipment: string | null;
  status: StopStatus; delivered_at: string | null; notes: string | null;
  orders?: any;
}
interface ReadyOrder {
  id: string; moly_contract_number: string | null; contract_name: string | null;
  base_model: string | null; build_shorthand: string | null; customer_id: string | null;
  delivery_instructions: string | null; status: string;
  customers?: { name: string; phone: string | null; address_line1: string | null; address_city: string | null; address_state: string | null; address_zip: string | null; } | null;
}

const PICKUP_LOCATIONS: Record<string, { label: string; city: string; state: string }> = {
  lorraine_ks: { label: "Moly Mfg — Lorraine, KS", city: "Lorraine", state: "KS" },
  ainsworth_ne: { label: "Daniels — Ainsworth, NE", city: "Ainsworth", state: "NE" },
  el_dorado_ks: { label: "MJE — El Dorado, KS", city: "El Dorado", state: "KS" },
  custom: { label: "Custom location", city: "", state: "" },
};

const STATUS_COLORS: Record<RunStatus, { bg: string; text: string; label: string }> = {
  planning: { bg: "#FAEEDA", text: "#633806", label: "Planning" },
  scheduled: { bg: "#E6F1FB", text: "#0C447C", label: "Scheduled" },
  loading: { bg: "#EEEDFE", text: "#3C3489", label: "Loading" },
  in_transit: { bg: "#E1F5EE", text: "#085041", label: "In transit" },
  completed: { bg: "#EAF3DE", text: "#27500A", label: "Completed" },
  cancelled: { bg: "#F1EFE8", text: "#444441", label: "Cancelled" },
};

const UNLOADING_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "forklift", label: "Forklift" },
  { value: "tractor_forks", label: "Tractor w/ forks" },
  { value: "skid_steer", label: "Skid steer" },
  { value: "loader", label: "Loader" },
  { value: "telehandler", label: "Telehandler" },
  { value: "crane", label: "Crane" },
  { value: "none", label: "None — need to bring" },
  { value: "other", label: "Other" },
];

const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "MMM d") : "TBD";
const fmtCurrency = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

// ─── component ──────────────────────────────────────────────
export default function Freight() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showAddStop, setShowAddStop] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [showCarriers, setShowCarriers] = useState(false);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");

  // ─── queries ────────────────────────────────────────────
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["freight_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freight_runs")
        .select("*, carriers(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as FreightRun[];
    },
  });

  const { data: stops = [] } = useQuery({
    queryKey: ["freight_stops", activeRunId],
    enabled: !!activeRunId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freight_run_stops")
        .select("*, orders(id, moly_contract_number, contract_name, base_model, build_shorthand, customer_id, customers(name))")
        .eq("freight_run_id", activeRunId!)
        .order("stop_order", { ascending: true });
      if (error) throw error;
      return data as FreightStop[];
    },
  });

  const { data: carriers = [] } = useQuery({
    queryKey: ["carriers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carriers")
        .select("*")
        .eq("is_active", true)
        .order("type", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Carrier[];
    },
  });

  const { data: readyOrders = [] } = useQuery({
    queryKey: ["ready_orders_for_freight"],
    enabled: showAddStop,
    queryFn: async () => {
      // Get orders that are ready/building/order_pending that aren't already on an active run
      const { data: onRuns } = await supabase
        .from("freight_run_stops")
        .select("order_id, freight_runs!inner(status)")
        .not("freight_runs.status", "in", "(completed,cancelled)");
      const usedOrderIds = new Set((onRuns || []).map((s: any) => s.order_id).filter(Boolean));

      const { data, error } = await supabase
        .from("orders")
        .select("id, moly_contract_number, contract_name, base_model, build_shorthand, customer_id, delivery_instructions, status, customers(name, phone, address_line1, address_city, address_state, address_zip)")
        .in("status", ["ready", "building", "order_pending"])
        .order("moly_contract_number", { ascending: true });
      if (error) throw error;
      return (data || []).filter((o: any) => !usedOrderIds.has(o.id)) as ReadyOrder[];
    },
  });

  const activeRun = useMemo(() => runs.find(r => r.id === activeRunId) || null, [runs, activeRunId]);

  const filteredRuns = useMemo(() => {
    if (filter === "active") return runs.filter(r => !["completed", "cancelled"].includes(r.status));
    if (filter === "completed") return runs.filter(r => r.status === "completed");
    return runs;
  }, [runs, filter]);

  // ─── mutations ──────────────────────────────────────────
  const createRun = useMutation({
    mutationFn: async (data: { name: string; pickup_location: string; pickup_address?: string; pickup_city?: string; pickup_state?: string; carrier_id?: string; driver_name?: string; pickup_date?: string }) => {
      const { data: run, error } = await supabase.from("freight_runs").insert(data).select().single();
      if (error) throw error;
      return run;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["freight_runs"] });
      setActiveRunId(run.id);
      setShowNewRun(false);
      toast.success("Freight run created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRun = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("freight_runs").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["freight_runs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRun = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("freight_runs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freight_runs"] });
      setActiveRunId(null);
      toast.success("Freight run deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addStop = useMutation({
    mutationFn: async (data: Partial<FreightStop>) => {
      const { error } = await supabase.from("freight_run_stops").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freight_stops", activeRunId] });
      qc.invalidateQueries({ queryKey: ["ready_orders_for_freight"] });
      toast.success("Stop added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStop = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("freight_run_stops").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["freight_stops", activeRunId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeStop = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("freight_run_stops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freight_stops", activeRunId] });
      qc.invalidateQueries({ queryKey: ["ready_orders_for_freight"] });
      toast.success("Stop removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createCarrier = useMutation({
    mutationFn: async (data: { name: string; type: CarrierType; phone?: string; vehicle_description?: string }) => {
      const { error } = await supabase.from("carriers").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Carrier added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCarrier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carriers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carriers"] });
      toast.success("Carrier removed");
    },
  });

  // ─── run detail view ───────────────────────────────────
  if (activeRunId && activeRun) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F0" }}>
        <RunDetail
          run={activeRun}
          stops={stops}
          carriers={carriers}
          onBack={() => setActiveRunId(null)}
          onUpdateRun={(data) => updateRun.mutate({ id: activeRun.id, ...data })}
          onDeleteRun={() => { if (confirm("Delete this freight run and all its stops?")) deleteRun.mutate(activeRun.id); }}
          onAddStop={() => setShowAddStop(true)}
          onUpdateStop={(id, data) => updateStop.mutate({ id, ...data })}
          onRemoveStop={(id) => { if (confirm("Remove this stop?")) removeStop.mutate(id); }}
          onMarkDelivered={(id) => updateStop.mutate({ id, status: "delivered", delivered_at: new Date().toISOString() })}
          navigate={navigate}
        />
        {showAddStop && (
          <AddStopModal
            runId={activeRun.id}
            readyOrders={readyOrders}
            currentStopCount={stops.length}
            onAdd={(data) => { addStop.mutate(data); setShowAddStop(false); }}
            onClose={() => setShowAddStop(false)}
          />
        )}
      </div>
    );
  }

  // ─── runs list view ────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F0" }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Truck size={20} style={{ color: "#0E2646" }} />
            <h1 className="text-[18px] font-bold" style={{ color: "#0E2646" }}>Freight</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCarriers(true)}
              className="text-[12px] px-3 py-1.5 rounded-full border active:scale-[0.97] transition-transform"
              style={{ borderColor: "#D4D4D0", color: "#717182" }}>
              <User size={13} className="inline mr-1" />Carriers
            </button>
            <button onClick={() => setShowNewRun(true)}
              className="text-[12px] font-medium px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
              style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
              <Plus size={13} className="inline mr-1" />New run
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-3">
          {(["active", "completed", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="text-[12px] px-3 py-1 rounded-full transition-colors capitalize"
              style={filter === f
                ? { backgroundColor: "#0E2646", color: "#F5F5F0" }
                : { backgroundColor: "#fff", color: "#717182", border: "0.5px solid #D4D4D0" }}>
              {f === "active" ? "Active" : f === "completed" ? "Completed" : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Runs list */}
      <div className="px-4 space-y-2 pb-24">
        {runsLoading && <p className="text-center text-[13px]" style={{ color: "#717182" }}>Loading...</p>}
        {!runsLoading && filteredRuns.length === 0 && (
          <div className="text-center py-12">
            <Truck size={32} style={{ color: "#D4D4D0" }} className="mx-auto mb-3" />
            <p className="text-[14px]" style={{ color: "#717182" }}>No freight runs yet</p>
            <p className="text-[12px]" style={{ color: "#B4B2A9" }}>Tap "New run" to plan a trip</p>
          </div>
        )}
        {filteredRuns.map(run => {
          const sc = STATUS_COLORS[run.status] || STATUS_COLORS.planning;
          return (
            <button key={run.id} onClick={() => setActiveRunId(run.id)}
              className="w-full text-left rounded-xl p-3 active:scale-[0.99] transition-transform"
              style={{ backgroundColor: "#fff", border: "0.5px solid #D4D4D0" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[14px] font-medium" style={{ color: "#0E2646" }}>
                  {run.name || PICKUP_LOCATIONS[run.pickup_location]?.label || "Freight run"}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.text }}>
                  {sc.label}
                </span>
              </div>
              <div className="flex gap-4 text-[12px]" style={{ color: "#717182" }}>
                <span>{fmtDate(run.pickup_date)}</span>
                <span>{run.carriers?.name || run.driver_name || "No carrier"}</span>
                {run.pickup_location !== "custom" && (
                  <span>{PICKUP_LOCATIONS[run.pickup_location]?.label.split("—")[0]?.trim()}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* New Run Modal */}
      {showNewRun && (
        <NewRunModal carriers={carriers} onCreate={(data) => createRun.mutate(data)} onClose={() => setShowNewRun(false)} />
      )}

      {/* Carriers Modal */}
      {showCarriers && (
        <CarriersModal
          carriers={carriers}
          onAdd={(data) => createCarrier.mutate(data)}
          onDelete={(id) => deleteCarrier.mutate(id)}
          onClose={() => setShowCarriers(false)}
        />
      )}
    </div>
  );
}

// ─── Run Detail ──────────────────────────────────────────
function RunDetail({ run, stops, carriers, onBack, onUpdateRun, onDeleteRun, onAddStop, onUpdateStop, onRemoveStop, onMarkDelivered, navigate }: {
  run: FreightRun; stops: FreightStop[]; carriers: Carrier[];
  onBack: () => void; onDeleteRun: () => void; onAddStop: () => void;
  onUpdateRun: (data: any) => void; onUpdateStop: (id: string, data: any) => void;
  onRemoveStop: (id: string) => void; onMarkDelivered: (id: string) => void;
  navigate: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(run.name || "");
  const [editCarrier, setEditCarrier] = useState(run.carrier_id || "");
  const [editDriver, setEditDriver] = useState(run.driver_name || "");
  const [editDate, setEditDate] = useState(run.pickup_date || "");
  const [editStatus, setEditStatus] = useState(run.status);
  const [editNotes, setEditNotes] = useState(run.freight_notes || "");
  const [editCost, setEditCost] = useState(run.actual_cost ? String(run.actual_cost) : "");

  const sc = STATUS_COLORS[run.status] || STATUS_COLORS.planning;
  const pickupInfo = PICKUP_LOCATIONS[run.pickup_location];

  const handleSaveEdit = () => {
    onUpdateRun({
      name: editName || null,
      carrier_id: editCarrier || null,
      driver_name: editDriver || null,
      pickup_date: editDate || null,
      status: editStatus,
      freight_notes: editNotes || null,
      actual_cost: editCost ? parseFloat(editCost) : null,
    });
    setEditing(false);
    toast.success("Run updated");
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/freight/share/${run.share_token}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied to clipboard");
  };

  return (
    <div>
      {/* Navy header */}
      <div style={{ backgroundColor: "#0E2646" }} className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack} className="flex items-center gap-1 text-[13px] active:opacity-70" style={{ color: "rgba(245,245,240,0.7)" }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex gap-2">
            <button onClick={() => setEditing(!editing)} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: "rgba(245,245,240,0.15)", color: "#F5F5F0" }}>
              <Edit2 size={12} className="inline mr-1" />{editing ? "Cancel" : "Edit"}
            </button>
            <button onClick={handleShare} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: "rgba(245,245,240,0.15)", color: "#F5F5F0" }}>
              <Share2 size={12} className="inline mr-1" />Share
            </button>
            <button onClick={onDeleteRun} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: "rgba(220,50,50,0.2)", color: "#F09595" }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Run name (e.g. Lorraine → SD route)"
              className="w-full text-[14px] rounded-lg px-3 py-2" style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }} />
            <div className="grid grid-cols-2 gap-2">
              <select value={editCarrier} onChange={e => setEditCarrier(e.target.value)}
                className="text-[12px] rounded-lg px-2 py-2" style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }}>
                <option value="">No carrier</option>
                {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={editDriver} onChange={e => setEditDriver(e.target.value)} placeholder="Driver name"
                className="text-[12px] rounded-lg px-2 py-2" style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="text-[12px] rounded-lg px-2 py-2" style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }} />
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as RunStatus)}
                className="text-[12px] rounded-lg px-2 py-2" style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }}>
                {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input value={editCost} onChange={e => setEditCost(e.target.value)} placeholder="Actual cost"
                className="text-[12px] rounded-lg px-2 py-2" style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }} />
            </div>
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes..."
              className="w-full text-[12px] rounded-lg px-3 py-2 resize-none" rows={2} style={{ background: "rgba(245,245,240,0.1)", color: "#F5F5F0", border: "0.5px solid rgba(245,245,240,0.2)" }} />
            <button onClick={handleSaveEdit} className="w-full text-[13px] font-medium py-2 rounded-lg" style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
              Save changes
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "#F5F5F0" }}>
              {run.name || pickupInfo?.label || "Freight run"}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.text }}>{sc.label}</span>
              <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.7)" }}>
                Pickup: {fmtDate(run.pickup_date)}
              </span>
              {(run.carriers?.name || run.driver_name) && (
                <span className="text-[12px]" style={{ color: "rgba(245,245,240,0.7)" }}>
                  {run.carriers?.name}{run.driver_name ? ` · ${run.driver_name}` : ""}
                </span>
              )}
              {run.carriers?.phone && (
                <a href={`tel:${run.carriers.phone}`} className="text-[12px]" style={{ color: "#55BAAA" }}>
                  <Phone size={11} className="inline mr-0.5" />{run.carriers.phone}
                </a>
              )}
              {run.actual_cost && (
                <span className="text-[12px]" style={{ color: "#F3D12A" }}>{fmtCurrency(run.actual_cost)}</span>
              )}
            </div>
            {run.freight_notes && (
              <p className="text-[12px] mt-2" style={{ color: "rgba(245,245,240,0.5)" }}>{run.freight_notes}</p>
            )}
          </>
        )}
      </div>

      {/* Pickup point */}
      <div className="mx-4 mt-3 rounded-xl p-3" style={{ backgroundColor: "rgba(85,186,170,0.08)", border: "0.5px solid rgba(85,186,170,0.2)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium" style={{ backgroundColor: "#55BAAA", color: "#fff" }}>P</div>
          <div>
            <p className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
              Pickup: {pickupInfo?.label || run.pickup_address || "Custom location"}
            </p>
            {run.pickup_location === "custom" && run.pickup_city && (
              <p className="text-[11px]" style={{ color: "#717182" }}>{run.pickup_city}, {run.pickup_state}</p>
            )}
            <p className="text-[11px]" style={{ color: "#717182" }}>
              Load {stops.length} unit{stops.length !== 1 ? "s" : ""} — load last delivers first
            </p>
          </div>
        </div>
      </div>

      {/* Stops */}
      <div className="px-4 mt-2 space-y-2 pb-4">
        {stops.map((stop, idx) => (
          <StopCard key={stop.id} stop={stop} index={idx + 1}
            onUpdate={(data) => onUpdateStop(stop.id, data)}
            onRemove={() => onRemoveStop(stop.id)}
            onMarkDelivered={() => onMarkDelivered(stop.id)}
            navigate={navigate} />
        ))}

        {/* Add stop button */}
        <button onClick={onAddStop}
          className="w-full text-center rounded-xl py-3 text-[13px] font-medium active:scale-[0.99] transition-transform"
          style={{ border: "1.5px dashed #D4D4D0", color: "#717182", backgroundColor: "transparent" }}>
          <Plus size={14} className="inline mr-1" />Add stop
        </button>
      </div>
    </div>
  );
}

// ─── Stop Card ───────────────────────────────────────────
function StopCard({ stop, index, onUpdate, onRemove, onMarkDelivered, navigate }: {
  stop: FreightStop; index: number; onUpdate: (data: any) => void;
  onRemove: () => void; onMarkDelivered: () => void; navigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editInstructions, setEditInstructions] = useState(stop.delivery_instructions || "");
  const [editPhone, setEditPhone] = useState(stop.delivery_phone || "");
  const [editAddress, setEditAddress] = useState(stop.delivery_address || "");
  const [editCity, setEditCity] = useState(stop.delivery_city || "");
  const [editState, setEditState] = useState(stop.delivery_state || "");
  const [editZip, setEditZip] = useState(stop.delivery_zip || "");
  const [editUnloading, setEditUnloading] = useState(stop.unloading_equipment || "");
  const [editNotes, setEditNotes] = useState(stop.notes || "");

  const isDelivered = stop.status === "delivered";
  const orderName = stop.orders?.contract_name || stop.orders?.moly_contract_number || stop.customer_name || "Custom stop";
  const equipment = stop.orders?.build_shorthand?.split(",")[0] || stop.orders?.base_model || "";
  const fullAddress = [stop.delivery_address, stop.delivery_city, stop.delivery_state, stop.delivery_zip].filter(Boolean).join(", ");

  const handleSave = () => {
    onUpdate({
      delivery_instructions: editInstructions || null,
      delivery_phone: editPhone || null,
      delivery_address: editAddress || null,
      delivery_city: editCity || null,
      delivery_state: editState || null,
      delivery_zip: editZip || null,
      unloading_equipment: editUnloading || null,
      notes: editNotes || null,
    });
    setEditMode(false);
    toast.success("Stop updated");
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#fff", border: "0.5px solid #D4D4D0", opacity: isDelivered ? 0.6 : 1 }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0 mt-0.5"
            style={isDelivered ? { backgroundColor: "#EAF3DE", color: "#27500A" } : { backgroundColor: "#F3D12A", color: "#0E2646" }}>
            {isDelivered ? <Check size={12} /> : index}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium truncate" style={{ color: "#0E2646" }}>{orderName}</span>
              {expanded ? <ChevronUp size={14} style={{ color: "#717182" }} /> : <ChevronDown size={14} style={{ color: "#717182" }} />}
            </div>
            <p className="text-[12px] truncate" style={{ color: "#717182" }}>{equipment}{equipment && fullAddress ? " · " : ""}{stop.delivery_city ? `${stop.delivery_city}, ${stop.delivery_state}` : ""}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t" style={{ borderColor: "#F0F0EC" }}>
          {editMode ? (
            <div className="space-y-2 mt-2">
              <div>
                <label className="text-[10px] font-medium" style={{ color: "#717182" }}>Delivery address</label>
                <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Address" className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-medium" style={{ color: "#717182" }}>City</label>
                  <input value={editCity} onChange={e => setEditCity(e.target.value)} className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                </div>
                <div>
                  <label className="text-[10px] font-medium" style={{ color: "#717182" }}>State</label>
                  <input value={editState} onChange={e => setEditState(e.target.value)} className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                </div>
                <div>
                  <label className="text-[10px] font-medium" style={{ color: "#717182" }}>Zip</label>
                  <input value={editZip} onChange={e => setEditZip(e.target.value)} className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium" style={{ color: "#717182" }}>Phone</label>
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                </div>
                <div>
                  <label className="text-[10px] font-medium" style={{ color: "#717182" }}>Unloading equipment</label>
                  <select value={editUnloading} onChange={e => setEditUnloading(e.target.value)} className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }}>
                    {UNLOADING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: "#717182" }}>Delivery instructions</label>
                <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} rows={2}
                  className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5 resize-none" style={{ border: "0.5px solid #D4D4D0" }} />
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: "#717182" }}>Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={1}
                  className="w-full text-[12px] rounded-lg px-2 py-1.5 mt-0.5 resize-none" style={{ border: "0.5px solid #D4D4D0" }} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} className="flex-1 text-[12px] font-medium py-1.5 rounded-lg" style={{ backgroundColor: "#55BAAA", color: "#fff" }}>Save</button>
                <button onClick={() => setEditMode(false)} className="text-[12px] py-1.5 px-3 rounded-lg" style={{ border: "0.5px solid #D4D4D0", color: "#717182" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {/* Delivery info display */}
              <div className="rounded-lg p-2" style={{ backgroundColor: "#F5F5F0" }}>
                {fullAddress && (
                  <div className="flex items-start gap-1.5 mb-1">
                    <MapPin size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#717182" }} />
                    <span className="text-[12px]" style={{ color: "#1A1A1A" }}>{fullAddress}</span>
                  </div>
                )}
                {stop.delivery_phone && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Phone size={12} style={{ color: "#717182" }} />
                    <a href={`tel:${stop.delivery_phone}`} className="text-[12px]" style={{ color: "#55BAAA" }}>{stop.delivery_phone}</a>
                  </div>
                )}
                {stop.delivery_instructions && (
                  <p className="text-[11px]" style={{ color: "#717182" }}>{stop.delivery_instructions}</p>
                )}
                {stop.unloading_equipment && (
                  <p className="text-[11px] mt-0.5" style={{ color: "#717182" }}>
                    Unloading: {UNLOADING_OPTIONS.find(o => o.value === stop.unloading_equipment)?.label || stop.unloading_equipment}
                  </p>
                )}
                {stop.notes && <p className="text-[11px] mt-0.5 italic" style={{ color: "#717182" }}>{stop.notes}</p>}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                {stop.order_id && (
                  <button onClick={() => navigate(`/orders/${stop.order_id}`)}
                    className="text-[11px] px-2.5 py-1 rounded-full" style={{ border: "0.5px solid #D4D4D0", color: "#717182" }}>
                    <Package size={11} className="inline mr-0.5" />View order
                  </button>
                )}
                <button onClick={() => setEditMode(true)}
                  className="text-[11px] px-2.5 py-1 rounded-full" style={{ border: "0.5px solid #D4D4D0", color: "#717182" }}>
                  <Edit2 size={11} className="inline mr-0.5" />Edit
                </button>
                {!isDelivered && (
                  <button onClick={onMarkDelivered}
                    className="text-[11px] px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}>
                    <Check size={11} className="inline mr-0.5" />Delivered
                  </button>
                )}
                <button onClick={onRemove}
                  className="text-[11px] px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(220,50,50,0.08)", color: "#E24B4A" }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Stop Modal ──────────────────────────────────────
function AddStopModal({ runId, readyOrders, currentStopCount, onAdd, onClose }: {
  runId: string; readyOrders: ReadyOrder[]; currentStopCount: number;
  onAdd: (data: any) => void; onClose: () => void;
}) {
  const [selectedOrder, setSelectedOrder] = useState<ReadyOrder | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [unloading, setUnloading] = useState("");
  const [customName, setCustomName] = useState("");

  const selectOrder = (order: ReadyOrder) => {
    setSelectedOrder(order);
    const c = order.customers;
    setDeliveryAddress(c?.address_line1 || "");
    setDeliveryCity(c?.address_city || "");
    setDeliveryState(c?.address_state || "");
    setDeliveryZip(c?.address_zip || "");
    setDeliveryPhone(c?.phone || "");
    setDeliveryInstructions(order.delivery_instructions || "");
  };

  const handleAdd = () => {
    onAdd({
      freight_run_id: runId,
      order_id: selectedOrder?.id || null,
      stop_order: currentStopCount + 1,
      customer_name: selectedOrder?.customers?.name || customName || null,
      delivery_address: deliveryAddress || null,
      delivery_city: deliveryCity || null,
      delivery_state: deliveryState || null,
      delivery_zip: deliveryZip || null,
      delivery_phone: deliveryPhone || null,
      delivery_instructions: deliveryInstructions || null,
      unloading_equipment: unloading || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{ backgroundColor: "#fff" }}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{ borderColor: "#F0F0EC", backgroundColor: "#fff" }}>
          <h3 className="text-[15px] font-medium" style={{ color: "#0E2646" }}>Add stop</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#717182" }} /></button>
        </div>

        <div className="p-4">
          {/* Ready orders list */}
          {!selectedOrder && (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>
                Ready for pickup ({readyOrders.length})
              </p>
              {readyOrders.length === 0 && (
                <p className="text-[12px] py-4 text-center" style={{ color: "#B4B2A9" }}>No orders ready to ship</p>
              )}
              <div className="space-y-1 mb-4">
                {readyOrders.map(order => (
                  <button key={order.id} onClick={() => selectOrder(order)}
                    className="w-full text-left p-2.5 rounded-lg active:scale-[0.99] transition-transform"
                    style={{ border: "0.5px solid #D4D4D0" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
                        {order.moly_contract_number || "—"} — {order.contract_name || "Unnamed"}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "#E6F1FB", color: "#0C447C" }}>{order.status?.replace("_", " ")}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: "#717182" }}>
                      {order.build_shorthand?.split(",")[0] || order.base_model || ""}
                      {order.customers?.name ? ` · ${order.customers.name}` : " · Inventory"}
                    </p>
                  </button>
                ))}
              </div>
              <div className="border-t pt-3" style={{ borderColor: "#F0F0EC" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>Or add a custom stop</p>
                <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Stop name (e.g. Bob's Ranch)"
                  className="w-full text-[12px] rounded-lg px-3 py-2 mb-2" style={{ border: "0.5px solid #D4D4D0" }} />
                {customName && (
                  <button onClick={() => setSelectedOrder({ id: "", moly_contract_number: null, contract_name: customName, base_model: null, build_shorthand: null, customer_id: null, delivery_instructions: null, status: "" } as any)}
                    className="text-[12px] font-medium px-4 py-1.5 rounded-full" style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
                    Continue with custom stop
                  </button>
                )}
              </div>
            </>
          )}

          {/* Delivery details form */}
          {selectedOrder && (
            <>
              <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-1 text-[12px] mb-3" style={{ color: "#55BAAA" }}>
                <ArrowLeft size={13} /> Change selection
              </button>
              <div className="rounded-lg p-2.5 mb-3" style={{ backgroundColor: "#F5F5F0" }}>
                <p className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
                  {selectedOrder.moly_contract_number || "Custom"} — {selectedOrder.contract_name || customName}
                </p>
                <p className="text-[11px]" style={{ color: "#717182" }}>{selectedOrder.build_shorthand?.split(",")[0] || selectedOrder.base_model || ""}</p>
              </div>

              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>Delivery details</p>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px]" style={{ color: "#717182" }}>Delivery address</label>
                  <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="1234 Ranch Rd"
                    className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px]" style={{ color: "#717182" }}>City</label>
                    <input value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)}
                      className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                  </div>
                  <div>
                    <label className="text-[11px]" style={{ color: "#717182" }}>State</label>
                    <input value={deliveryState} onChange={e => setDeliveryState(e.target.value)}
                      className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                  </div>
                  <div>
                    <label className="text-[11px]" style={{ color: "#717182" }}>Zip</label>
                    <input value={deliveryZip} onChange={e => setDeliveryZip(e.target.value)}
                      className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px]" style={{ color: "#717182" }}>Phone</label>
                    <input value={deliveryPhone} onChange={e => setDeliveryPhone(e.target.value)} placeholder="(605) 555-1234"
                      className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
                  </div>
                  <div>
                    <label className="text-[11px]" style={{ color: "#717182" }}>Unloading equipment</label>
                    <select value={unloading} onChange={e => setUnloading(e.target.value)}
                      className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }}>
                      {UNLOADING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px]" style={{ color: "#717182" }}>Delivery instructions</label>
                  <textarea value={deliveryInstructions} onChange={e => setDeliveryInstructions(e.target.value)}
                    placeholder="Where to drop, gate codes, call before arrival, etc."
                    className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5 resize-none" rows={3} style={{ border: "0.5px solid #D4D4D0" }} />
                </div>
              </div>

              <button onClick={handleAdd}
                className="w-full mt-4 text-[14px] font-medium py-3 rounded-xl active:scale-[0.98] transition-transform"
                style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
                Add to run
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Run Modal ───────────────────────────────────────
function NewRunModal({ carriers, onCreate, onClose }: {
  carriers: Carrier[]; onCreate: (data: any) => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("lorraine_ks");
  const [customAddress, setCustomAddress] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [customState, setCustomState] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [pickupDate, setPickupDate] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl" style={{ backgroundColor: "#fff" }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#F0F0EC" }}>
          <h3 className="text-[15px] font-medium" style={{ color: "#0E2646" }}>New freight run</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#717182" }} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Run name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lorraine → SD/NE route"
              className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Pickup location</label>
            <select value={pickup} onChange={e => setPickup(e.target.value)}
              className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }}>
              {Object.entries(PICKUP_LOCATIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {pickup === "custom" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <input value={customAddress} onChange={e => setCustomAddress(e.target.value)} placeholder="Address"
                  className="w-full text-[13px] rounded-lg px-3 py-2" style={{ border: "0.5px solid #D4D4D0" }} />
              </div>
              <input value={customCity} onChange={e => setCustomCity(e.target.value)} placeholder="City"
                className="text-[13px] rounded-lg px-2 py-2" style={{ border: "0.5px solid #D4D4D0" }} />
              <input value={customState} onChange={e => setCustomState(e.target.value)} placeholder="State"
                className="text-[13px] rounded-lg px-2 py-2" style={{ border: "0.5px solid #D4D4D0" }} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Carrier / vehicle</label>
              <select value={carrierId} onChange={e => setCarrierId(e.target.value)}
                className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }}>
                <option value="">Select...</option>
                {carriers.filter(c => c.type === "catl_vehicle").length > 0 && (
                  <optgroup label="CATL Vehicles">
                    {carriers.filter(c => c.type === "catl_vehicle").map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.vehicle_description ? ` — ${c.vehicle_description}` : ""}</option>
                    ))}
                  </optgroup>
                )}
                {carriers.filter(c => c.type === "external_trucker").length > 0 && (
                  <optgroup label="Truckers">
                    {carriers.filter(c => c.type === "external_trucker").map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Driver</label>
              <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Who's driving"
                className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: "#717182" }}>Pickup date</label>
            <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)}
              className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5" style={{ border: "0.5px solid #D4D4D0" }} />
          </div>
          <button onClick={() => onCreate({
            name: name || null,
            pickup_location: pickup,
            pickup_address: pickup === "custom" ? customAddress || null : null,
            pickup_city: pickup === "custom" ? customCity || null : PICKUP_LOCATIONS[pickup]?.city,
            pickup_state: pickup === "custom" ? customState || null : PICKUP_LOCATIONS[pickup]?.state,
            carrier_id: carrierId || null,
            driver_name: driverName || null,
            pickup_date: pickupDate || null,
          })}
            className="w-full text-[14px] font-medium py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
            Create run
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carriers Modal ──────────────────────────────────────
function CarriersModal({ carriers, onAdd, onDelete, onClose }: {
  carriers: Carrier[]; onAdd: (data: any) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CarrierType>("external_trucker");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return toast.error("Name required");
    onAdd({ name: name.trim(), type, phone: phone || null, vehicle_description: vehicle || null });
    setName(""); setPhone(""); setVehicle("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{ backgroundColor: "#fff" }}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{ borderColor: "#F0F0EC", backgroundColor: "#fff" }}>
          <h3 className="text-[15px] font-medium" style={{ color: "#0E2646" }}>Carriers & vehicles</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#717182" }} /></button>
        </div>

        <div className="p-4">
          {/* Existing carriers */}
          <div className="space-y-2 mb-4">
            {carriers.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ border: "0.5px solid #D4D4D0" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>{c.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={c.type === "catl_vehicle" ? { backgroundColor: "#E1F5EE", color: "#085041" } : { backgroundColor: "#E6F1FB", color: "#0C447C" }}>
                      {c.type === "catl_vehicle" ? "CATL" : "Trucker"}
                    </span>
                  </div>
                  {(c.phone || c.vehicle_description) && (
                    <p className="text-[11px]" style={{ color: "#717182" }}>
                      {c.phone}{c.phone && c.vehicle_description ? " · " : ""}{c.vehicle_description}
                    </p>
                  )}
                </div>
                <button onClick={() => { if (confirm(`Remove ${c.name}?`)) onDelete(c.id); }}
                  className="p-1 rounded" style={{ color: "#E24B4A" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add new carrier */}
          <div className="border-t pt-3" style={{ borderColor: "#F0F0EC" }}>
            <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "#717182" }}>Add carrier or vehicle</p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
                  className="text-[13px] rounded-lg px-3 py-2" style={{ border: "0.5px solid #D4D4D0" }} />
                <select value={type} onChange={e => setType(e.target.value as CarrierType)}
                  className="text-[13px] rounded-lg px-2 py-2" style={{ border: "0.5px solid #D4D4D0" }}>
                  <option value="external_trucker">Trucker</option>
                  <option value="catl_vehicle">CATL Vehicle</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
                  className="text-[13px] rounded-lg px-2 py-2" style={{ border: "0.5px solid #D4D4D0" }} />
                <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Vehicle description"
                  className="text-[13px] rounded-lg px-2 py-2" style={{ border: "0.5px solid #D4D4D0" }} />
              </div>
              <button onClick={handleAdd}
                className="w-full text-[13px] font-medium py-2 rounded-lg" style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
                Add carrier
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
