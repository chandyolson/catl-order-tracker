import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Phone, Truck, Package, Clock, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

const PICKUP_LABELS: Record<string, string> = {
  lorraine_ks: "Moly Manufacturing — Lorraine, KS",
  ainsworth_ne: "Daniels — Ainsworth, NE",
  el_dorado_ks: "MJE — El Dorado, KS",
  custom: "Custom location",
};

const UNLOADING_LABELS: Record<string, string> = {
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
      const { data, error } = await supabase
        .from("freight_runs")
        .select("*, carriers(*)")
        .eq("share_token", token!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stops = [] } = useQuery({
    queryKey: ["driver_share_stops", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freight_run_stops")
        .select("*, orders(moly_contract_number, contract_name, base_model, build_shorthand)")
        .eq("freight_run_id", run!.id)
        .order("stop_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <Truck size={32} style={{ color: "#0E2646", margin: "0 auto 12px" }} />
        <p style={{ color: "#717182", fontSize: 14 }}>Loading run sheet...</p>
      </div>
    </div>
  );

  if (error || !run) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <Truck size={32} style={{ color: "#D4D4D0", margin: "0 auto 12px" }} />
        <p style={{ color: "#0E2646", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Run not found</p>
        <p style={{ color: "#717182", fontSize: 13 }}>This link may have expired or been removed.</p>
      </div>
    </div>
  );

  const pickupLabel = run.pickup_location === "custom"
    ? [run.pickup_address, run.pickup_city, run.pickup_state].filter(Boolean).join(", ") || "Custom location"
    : PICKUP_LABELS[run.pickup_location] || run.pickup_location;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#0E2646", padding: "20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <img src="" alt="" style={{ display: "none" }} />
          <p style={{ color: "#F3D12A", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", margin: 0 }}>CATL RESOURCES</p>
        </div>
        <h1 style={{ color: "#F5F5F0", fontSize: 20, fontWeight: 600, margin: "8px 0 4px" }}>
          {run.name || "Freight run"}
        </h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "rgba(245,245,240,0.7)", fontSize: 13 }}>
          <span><Clock size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />{fmtDate(run.pickup_date)}</span>
          {run.carriers?.name && <span><Truck size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />{run.carriers.name}</span>}
          {run.driver_name && <span>Driver: {run.driver_name}</span>}
        </div>
        {run.freight_notes && (
          <p style={{ color: "rgba(245,245,240,0.5)", fontSize: 12, margin: "8px 0 0" }}>{run.freight_notes}</p>
        )}
      </div>

      {/* Pickup */}
      <div style={{ margin: "12px 12px 0", padding: "12px 14px", borderRadius: 12, backgroundColor: "rgba(85,186,170,0.08)", border: "1px solid rgba(85,186,170,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#55BAAA", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>P</div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "#0E2646", margin: 0 }}>Pickup: {pickupLabel}</p>
            <p style={{ fontSize: 12, color: "#717182", margin: "2px 0 0" }}>
              Load {stops.length} unit{stops.length !== 1 ? "s" : ""} — load last → deliver first
            </p>
          </div>
        </div>
      </div>

      {/* Loading order note */}
      {stops.length > 1 && (
        <div style={{ margin: "8px 12px 0", padding: "8px 14px", borderRadius: 8, backgroundColor: "#FAEEDA" }}>
          <p style={{ fontSize: 12, color: "#633806", margin: 0, fontWeight: 500 }}>
            Loading order (load first → last off truck):
          </p>
          <p style={{ fontSize: 12, color: "#854F0B", margin: "4px 0 0" }}>
            {[...stops].reverse().map((s, i) => `${i + 1}. ${s.customer_name || s.orders?.contract_name || `Stop ${s.stop_order}`}`).join("  →  ")}
          </p>
        </div>
      )}

      {/* Stops */}
      <div style={{ padding: "8px 12px 80px" }}>
        {stops.map((stop: any, idx: number) => (
          <DriverStopCard key={stop.id} stop={stop} index={idx + 1} />
        ))}
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, backgroundColor: "#0E2646", padding: "10px 16px", textAlign: "center" }}>
        <p style={{ color: "rgba(245,245,240,0.5)", fontSize: 11, margin: 0 }}>
          CATL Resources · Livestock Equipment · {stops.length} stop{stops.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

function DriverStopCard({ stop, index }: { stop: any; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const isDelivered = stop.status === "delivered";
  const name = stop.customer_name || stop.orders?.contract_name || stop.orders?.moly_contract_number || `Stop ${index}`;
  const equipment = stop.orders?.build_shorthand?.split(",")[0] || stop.orders?.base_model || "";
  const fullAddress = [stop.delivery_address, stop.delivery_city, stop.delivery_state, stop.delivery_zip].filter(Boolean).join(", ");
  const mapsUrl = fullAddress ? `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}` : null;

  return (
    <div style={{ marginTop: 8, borderRadius: 12, backgroundColor: isDelivered ? "rgba(255,255,255,0.6)" : "#fff", border: "1px solid #D4D4D0", overflow: "hidden" }}>
      {/* Header */}
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 600, flexShrink: 0,
          backgroundColor: isDelivered ? "#EAF3DE" : "#F3D12A",
          color: isDelivered ? "#27500A" : "#0E2646",
        }}>
          {isDelivered ? "✓" : index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#0E2646", margin: 0 }}>{name}</p>
          {equipment && <p style={{ fontSize: 12, color: "#717182", margin: "2px 0 0" }}>{equipment}</p>}
        </div>
        <ChevronDown size={16} style={{ color: "#717182", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </div>

      {/* Details */}
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F0F0EC" }}>
          {/* Address with maps link */}
          {fullAddress && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <MapPin size={16} style={{ color: "#55BAAA", flexShrink: 0, marginTop: 1 }} />
              <div>
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#55BAAA", textDecoration: "none", fontWeight: 500 }}>
                    {fullAddress}
                  </a>
                ) : (
                  <p style={{ fontSize: 14, color: "#1A1A1A", margin: 0 }}>{fullAddress}</p>
                )}
              </div>
            </div>
          )}

          {/* Phone — tap to call */}
          {stop.delivery_phone && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={16} style={{ color: "#55BAAA", flexShrink: 0 }} />
              <a href={`tel:${stop.delivery_phone}`} style={{ fontSize: 15, color: "#55BAAA", textDecoration: "none", fontWeight: 500 }}>
                {stop.delivery_phone}
              </a>
            </div>
          )}

          {/* Delivery instructions */}
          {stop.delivery_instructions && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, backgroundColor: "#F5F5F0" }}>
              <p style={{ fontSize: 11, color: "#717182", margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Delivery instructions</p>
              <p style={{ fontSize: 14, color: "#1A1A1A", margin: 0, lineHeight: 1.5 }}>{stop.delivery_instructions}</p>
            </div>
          )}

          {/* Unloading equipment */}
          {stop.unloading_equipment && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Package size={14} style={{ color: "#717182" }} />
              <span style={{ fontSize: 13, color: "#717182" }}>
                Unloading: <strong style={{ color: "#0E2646" }}>{UNLOADING_LABELS[stop.unloading_equipment] || stop.unloading_equipment}</strong>
              </span>
            </div>
          )}

          {/* Notes */}
          {stop.notes && (
            <p style={{ marginTop: 8, fontSize: 13, color: "#717182", fontStyle: "italic" }}>{stop.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
