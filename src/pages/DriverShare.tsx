import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Phone, Truck, Package, Clock, ChevronDown, ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";

const LOC: Record<string, string> = {
  catl_wall_sd: "CATL Resources — St. Onge, SD",
  lorraine_ks: "Moly Mfg — Lorraine, KS",
  ainsworth_ne: "Daniels — Ainsworth, NE",
  el_dorado_ks: "MJE — El Dorado, KS",
  custom: "Custom",
};
const locLabel = (k: string | null, city?: string | null, state?: string | null) => {
  if (k && LOC[k] && k !== "custom") return LOC[k];
  return [city, state].filter(Boolean).join(", ") || k || "—";
};

const UL: Record<string, string> = {
  forklift: "Forklift", tractor_forks: "Tractor w/ forks", skid_steer: "Skid steer",
  loader: "Loader", telehandler: "Telehandler", crane: "Crane",
  none: "None available", other: "Other",
};

const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "EEEE, MMMM d, yyyy") : "TBD";

export default function DriverShare() {
  const { token } = useParams<{ token: string }>();

  const { data: run, isLoading, error } = useQuery({
    queryKey: ["driver_share", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.from("freight_runs").select("*, carriers(*)").eq("share_token", token!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stops = [] } = useQuery({
    queryKey: ["driver_share_stops", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("freight_run_stops")
        .select("*, orders(moly_contract_number, contract_name, base_model, build_shorthand)")
        .eq("freight_run_id", run!.id).order("stop_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const pickups = useMemo(() => stops.filter((s: any) => s.stop_type === "pickup"), [stops]);
  const deliveries = useMemo(() => stops.filter((s: any) => s.stop_type === "delivery"), [stops]);

  if (isLoading) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}><Truck size={32} style={{ color: "#0E2646", margin: "0 auto 12px" }} /><p style={{ color: "#717182", fontSize: 14 }}>Loading run sheet...</p></div>
    </div>
  );

  if (error || !run) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "0 24px" }}><Truck size={32} style={{ color: "#D4D4D0", margin: "0 auto 12px" }} /><p style={{ color: "#0E2646", fontSize: 16, fontWeight: 500 }}>Run not found</p><p style={{ color: "#717182", fontSize: 13 }}>This link may have expired or been removed.</p></div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#0E2646", padding: "20px 16px" }}>
        <p style={{ color: "#F3D12A", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", margin: 0 }}>CATL RESOURCES</p>
        <h1 style={{ color: "#F5F5F0", fontSize: 20, fontWeight: 600, margin: "8px 0 4px" }}>{run.name || "Freight Run"}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "rgba(245,245,240,0.7)", fontSize: 13 }}>
          <span><Clock size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />{fmtDate(run.pickup_date)}</span>
          {run.carriers?.name && <span><Truck size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />{run.carriers.name}</span>}
          {run.driver_name && <span>Driver: {run.driver_name}</span>}
          {run.total_miles && <span>{run.total_miles} miles</span>}
        </div>
        {run.carriers?.phone && (
          <a href={`tel:${run.carriers.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, color: "#55BAAA", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
            <Phone size={14} />{run.carriers.phone}
          </a>
        )}
      </div>

      {/* Route summary */}
      <div style={{ margin: "12px 12px 0", padding: "10px 14px", borderRadius: 10, backgroundColor: "rgba(14,38,70,0.06)", border: "1px solid rgba(14,38,70,0.12)", fontSize: 13, color: "#0E2646" }}>
        <strong>Route:</strong> {locLabel(run.start_location, run.start_city, run.start_state)}
        {pickups.map((s: any) => ` → ${s.customer_name || s.delivery_city || "Pickup"}`)}
        {deliveries.map((s: any) => ` → ${s.customer_name || s.delivery_city || "Delivery"}`)}
        {` → ${locLabel(run.end_location, run.end_city, run.end_state)}`}
      </div>

      {/* Loading order */}
      {deliveries.length > 1 && (
        <div style={{ margin: "8px 12px 0", padding: "10px 14px", borderRadius: 10, backgroundColor: "#FAEEDA", border: "1px solid rgba(243,209,42,0.3)" }}>
          <p style={{ fontSize: 12, color: "#633806", margin: 0, fontWeight: 600 }}>LOADING ORDER (load first → last off truck):</p>
          <p style={{ fontSize: 13, color: "#854F0B", margin: "4px 0 0" }}>
            {[...deliveries].reverse().map((s: any, i: number) => `${i + 1}. ${s.customer_name || "Stop"}`).join("  →  ")}
          </p>
        </div>
      )}

      <div style={{ padding: "8px 12px 80px" }}>
        {/* Start */}
        <RouteBadge label={`Start: ${locLabel(run.start_location, run.start_city, run.start_state)}`} type="start" />

        {/* Pickups */}
        {pickups.length > 0 && (
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#717182", margin: "12px 0 4px 4px" }}>
            Manufacturer Pickups ({pickups.length})
          </p>
        )}
        {pickups.map((s: any, i: number) => <DriverStopCard key={s.id} stop={s} index={i + 1} isPickup />)}

        {/* Arrow */}
        {pickups.length > 0 && deliveries.length > 0 && (
          <div style={{ textAlign: "center", padding: "6px 0" }}><ArrowDown size={18} style={{ color: "#D4D4D0" }} /></div>
        )}

        {/* Deliveries */}
        {deliveries.length > 0 && (
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#717182", margin: "12px 0 4px 4px" }}>
            Customer Deliveries ({deliveries.length})
          </p>
        )}
        {deliveries.map((s: any, i: number) => <DriverStopCard key={s.id} stop={s} index={i + 1} isPickup={false} />)}

        {/* End */}
        <div style={{ marginTop: 12 }}>
          <RouteBadge label={`End: ${locLabel(run.end_location, run.end_city, run.end_state)}`} type="end" miles={run.total_miles} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, backgroundColor: "#0E2646", padding: "10px 16px", textAlign: "center" }}>
        <p style={{ color: "rgba(245,245,240,0.5)", fontSize: 11, margin: 0 }}>
          CATL Resources · Livestock Equipment · {pickups.length} pickup{pickups.length !== 1 ? "s" : ""} · {deliveries.length} deliver{deliveries.length !== 1 ? "ies" : "y"}
        </p>
      </div>
    </div>
  );
}

function RouteBadge({ label, type, miles }: { label: string; type: "start" | "end"; miles?: number | null }) {
  return (
    <div style={{ marginTop: 8, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, backgroundColor: "rgba(14,38,70,0.06)", border: "1px solid rgba(14,38,70,0.12)" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#0E2646", color: "#F3D12A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        {type === "start" ? "S" : "E"}
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 500, color: "#0E2646", margin: 0 }}>{label}</p>
        {miles && type === "end" && <p style={{ fontSize: 12, color: "#717182", margin: "2px 0 0" }}>Total route: {miles} miles</p>}
      </div>
    </div>
  );
}

function DriverStopCard({ stop, index, isPickup }: { stop: any; index: number; isPickup: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const isDelivered = stop.status === "delivered";
  const name = stop.customer_name || stop.orders?.contract_name || stop.orders?.moly_contract_number || (isPickup ? "Pickup" : `Stop ${index}`);
  const equipment = stop.orders?.build_shorthand?.split(",")[0] || stop.orders?.base_model || "";
  const fullAddress = [stop.delivery_address, stop.delivery_city, stop.delivery_state, stop.delivery_zip].filter(Boolean).join(", ");
  const mapsUrl = fullAddress ? `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}` : null;

  const badgeBg = isPickup ? "#55BAAA" : isDelivered ? "#EAF3DE" : "#F3D12A";
  const badgeColor = isPickup ? "#fff" : isDelivered ? "#27500A" : "#0E2646";

  return (
    <div style={{ marginTop: 8, borderRadius: 12, backgroundColor: isDelivered ? "rgba(255,255,255,0.6)" : "#fff", border: "1px solid #D4D4D0", overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0, backgroundColor: badgeBg, color: badgeColor }}>
          {isDelivered ? "✓" : isPickup ? "P" : index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#0E2646", margin: 0 }}>{name}</p>
          <p style={{ fontSize: 12, color: "#717182", margin: "2px 0 0" }}>
            {isPickup ? "Pickup" : "Delivery"}{equipment ? ` · ${equipment}` : ""}
          </p>
        </div>
        <ChevronDown size={16} style={{ color: "#717182", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F0F0EC" }}>
          {fullAddress && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <MapPin size={16} style={{ color: "#55BAAA", flexShrink: 0, marginTop: 1 }} />
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#55BAAA", textDecoration: "none", fontWeight: 500 }}>{fullAddress}</a>
              ) : (
                <p style={{ fontSize: 14, color: "#1A1A1A", margin: 0 }}>{fullAddress}</p>
              )}
            </div>
          )}

          {stop.delivery_phone && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={16} style={{ color: "#55BAAA", flexShrink: 0 }} />
              <a href={`tel:${stop.delivery_phone}`} style={{ fontSize: 15, color: "#55BAAA", textDecoration: "none", fontWeight: 500 }}>{stop.delivery_phone}</a>
            </div>
          )}

          {stop.delivery_instructions && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, backgroundColor: "#F5F5F0" }}>
              <p style={{ fontSize: 11, color: "#717182", margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {isPickup ? "Pickup instructions" : "Delivery instructions"}
              </p>
              <p style={{ fontSize: 14, color: "#1A1A1A", margin: 0, lineHeight: 1.5 }}>{stop.delivery_instructions}</p>
            </div>
          )}

          {stop.unloading_equipment && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Package size={14} style={{ color: "#717182" }} />
              <span style={{ fontSize: 13, color: "#717182" }}>Unloading: <strong style={{ color: "#0E2646" }}>{UL[stop.unloading_equipment] || stop.unloading_equipment}</strong></span>
            </div>
          )}

          {stop.notes && <p style={{ marginTop: 8, fontSize: 13, color: "#717182", fontStyle: "italic" }}>{stop.notes}</p>}
        </div>
      )}
    </div>
  );
}
