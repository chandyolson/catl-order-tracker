import { useEffect, useRef, useState, useMemo } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, AlertTriangle, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";

const GOOGLE_MAPS_KEY = "AIzaSyB1o0qtjbf8Lx554cxK6BQmowqIoK-ccM0";

const CATL_HQ = { lat: 44.236, lng: -103.728 }; // St. Onge, SD

interface OrderPin {
  id: string;
  contract: string | null;
  name: string;
  customer: string;
  equipment: string;
  status: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  customerId: string;
}

const STATUS_PIN: Record<string, { color: string; label: string }> = {
  order_pending: { color: "#F3D12A", label: "On order" },
  building: { color: "#EEEDFE", label: "Building" },
  ready: { color: "#55BAAA", label: "Ready" },
  shipped: { color: "#378ADD", label: "Shipped" },
  delivered: { color: "#E24B4A", label: "Delivered" },
};

export default function EquipmentMap() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch orders with customer addresses
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["equipment_map_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, moly_contract_number, contract_name, base_model, build_shorthand, status, customer_id, customers(id, name, address_city, address_state, latitude, longitude, geocoded_at)")
        .not("customer_id", "is", null)
        .order("moly_contract_number", { ascending: false });
      if (error) throw error;
      return (data || []).filter((o: any) => o.customers?.address_city && o.customers?.address_state).map((o: any) => ({
        id: o.id,
        contract: o.moly_contract_number,
        name: o.contract_name || "",
        customer: o.customers?.name || "",
        equipment: o.build_shorthand?.split(",")[0] || o.base_model || "",
        status: o.status || "order_pending",
        city: o.customers?.address_city,
        state: o.customers?.address_state,
        lat: o.customers?.latitude,
        lng: o.customers?.longitude,
        customerId: o.customers?.id,
      })) as OrderPin[];
    },
  });

  const needsGeocoding = useMemo(() => orders.filter(o => !o.lat || !o.lng), [orders]);
  const mappable = useMemo(() => orders.filter(o => o.lat && o.lng), [orders]);
  const byState = useMemo(() => {
    const m: Record<string, OrderPin[]> = {};
    orders.forEach(o => { const k = o.state; if (!m[k]) m[k] = []; m[k].push(o); });
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [orders]);

  // Load Google Maps
  useEffect(() => {
    if (!mapRef.current) return;
    const loader = new Loader({ apiKey: GOOGLE_MAPS_KEY, version: "weekly", libraries: ["places", "marker"] });
    loader.load().then(() => {
      if (!mapRef.current) return;
      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: CATL_HQ, zoom: 5, mapId: "DEMO_MAP_ID", mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      });
      setMapLoaded(true);
    }).catch(err => { console.error("Maps load error:", err); setError("Failed to load Google Maps"); });
  }, []);

  // Geocode customers that need it, then cache
  useEffect(() => {
    if (!mapLoaded || needsGeocoding.length === 0) return;
    setGeocoding(true);
    const geocoder = new google.maps.Geocoder();
    const seen = new Set<string>();

    (async () => {
      for (const o of needsGeocoding) {
        if (seen.has(o.customerId)) continue;
        seen.add(o.customerId);
        try {
          const res = await geocoder.geocode({ address: `${o.city}, ${o.state}` });
          if (res.results[0]) {
            const loc = res.results[0].geometry.location;
            const lat = loc.lat(), lng = loc.lng();
            // Cache to DB
            await supabase.from("customers").update({ latitude: lat, longitude: lng, geocoded_at: new Date().toISOString() }).eq("id", o.customerId);
            // Update local data
            orders.forEach(ord => { if (ord.customerId === o.customerId) { ord.lat = lat; ord.lng = lng; } });
          }
        } catch (e) { console.warn(`Geocode failed for ${o.city}, ${o.state}:`, e); }
        // Throttle to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
      }
      setGeocoding(false);
      qc.invalidateQueries({ queryKey: ["equipment_map_orders"] });
    })();
  }, [mapLoaded, needsGeocoding.length]);

  // Place markers when data is ready
  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;

    // Clear old markers
    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();

    // CATL HQ pin
    const hqEl = document.createElement("div");
    hqEl.style.cssText = "width:32px;height:32px;border-radius:50%;background:#0E2646;border:3px solid #F3D12A;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#F3D12A;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;";
    hqEl.textContent = "HQ";
    const hqMarker = new google.maps.marker.AdvancedMarkerElement({
      map: mapInstance.current, position: CATL_HQ, content: hqEl, title: "CATL Resources — St. Onge, SD",
    });
    const hqInfo = new google.maps.InfoWindow({
      content: `<div style="font-family:Inter,system-ui,sans-serif;padding:4px;"><strong style="font-size:13px;color:#0E2646;">CATL Resources</strong><br><span style="font-size:11px;color:#717182;">St. Onge, SD — Home base</span></div>`,
    });
    hqMarker.addListener("click", () => hqInfo.open({ anchor: hqMarker, map: mapInstance.current }));
    markersRef.current.push(hqMarker);
    bounds.extend(CATL_HQ);

    // Order pins
    const pinned = orders.filter(o => o.lat && o.lng);
    pinned.forEach(o => {
      const pos = { lat: o.lat!, lng: o.lng! };
      bounds.extend(pos);

      const sc = STATUS_PIN[o.status] || STATUS_PIN.order_pending;
      const el = document.createElement("div");
      el.style.cssText = `width:24px;height:24px;border-radius:50%;background:${sc.color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;`;
      // Small inner dot for visibility on yellow pins
      const dot = document.createElement("div");
      dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${o.status === "order_pending" ? "#0E2646" : "#fff"};opacity:0.7;`;
      el.appendChild(dot);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstance.current!, position: pos, content: el,
        title: `${o.contract || ""} ${o.customer}`,
      });

      const info = new google.maps.InfoWindow({
        content: `<div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;min-width:180px;">
          <strong style="font-size:13px;color:#0E2646;">${o.contract ? o.contract + " — " : ""}${o.customer}</strong>
          <br><span style="font-size:11px;color:#717182;">${o.equipment}</span>
          <br><span style="font-size:11px;color:#717182;">${o.city}, ${o.state}</span>
          <br><span style="font-size:10px;display:inline-block;margin-top:4px;padding:2px 6px;border-radius:99px;background:${sc.color};color:${o.status === "order_pending" ? "#0E2646" : "#fff"};">${sc.label}</span>
        </div>`,
      });
      marker.addListener("click", () => info.open({ anchor: marker, map: mapInstance.current }));
      markersRef.current.push(marker);
    });

    if (pinned.length > 0) {
      mapInstance.current.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    }
  }, [mapLoaded, orders, geocoding]);

  const inventoryCount = useMemo(() => {
    // Count orders without customers (loaded separately isn't ideal, but we can estimate)
    return 0; // Will be set from parent or separate query
  }, []);

  return (
    <div>
      {/* Map */}
      <div className="rounded-xl overflow-hidden mb-3" style={{ border: "0.5px solid #D4D4D0" }}>
        {error && (
          <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: "#FCEBEB" }}>
            <AlertTriangle size={14} style={{ color: "#A32D2D" }} />
            <span className="text-[12px]" style={{ color: "#A32D2D" }}>{error}</span>
          </div>
        )}
        <div ref={mapRef} style={{ height: 360, width: "100%", backgroundColor: "#E8E6DE" }}>
          {(!mapLoaded && !error) && (
            <div className="flex items-center justify-center h-full">
              <p className="text-[13px]" style={{ color: "#717182" }}>Loading map...</p>
            </div>
          )}
        </div>

        {/* Legend + stats */}
        <div className="px-3 py-2.5 border-t" style={{ borderColor: "#F0F0EC", backgroundColor: "#fff" }}>
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0E2646", border: "1.5px solid #F3D12A" }} />
              <span className="text-[11px]" style={{ color: "#717182" }}>CATL HQ</span>
            </div>
            {Object.entries(STATUS_PIN).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                <span className="text-[11px]" style={{ color: "#717182" }}>{v.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "#F5F5F0" }}>
              <span className="text-[10px]" style={{ color: "#717182" }}>On map</span>
              <p className="text-[16px] font-medium m-0" style={{ color: "#0E2646" }}>{orders.filter(o => o.lat && o.lng).length}</p>
            </div>
            <div className="flex-1 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "#F5F5F0" }}>
              <span className="text-[10px]" style={{ color: "#717182" }}>States</span>
              <p className="text-[16px] font-medium m-0" style={{ color: "#0E2646" }}>{byState.length}</p>
            </div>
            <div className="flex-1 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "#F5F5F0" }}>
              <span className="text-[10px]" style={{ color: "#717182" }}>Geocoding</span>
              <p className="text-[16px] font-medium m-0" style={{ color: "#0E2646" }}>{geocoding ? `${needsGeocoding.length}...` : "Done"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders grouped by state */}
      {byState.map(([state, stateOrders]) => (
        <div key={state} className="mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1.5 px-1" style={{ color: "#717182" }}>
            {state} ({stateOrders.length})
          </p>
          {stateOrders.map(o => {
            const sc = STATUS_PIN[o.status] || STATUS_PIN.order_pending;
            return (
              <button key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                className="w-full text-left rounded-xl p-2.5 mb-1" style={{ backgroundColor: "#fff", border: "0.5px solid #D4D4D0" }}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium truncate block" style={{ color: "#0E2646" }}>
                      {o.contract ? `${o.contract} — ` : ""}{o.customer}
                    </span>
                    <span className="text-[11px]" style={{ color: "#717182" }}>
                      {o.equipment}{o.city ? ` · ${o.city}, ${o.state}` : ""}
                    </span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2"
                    style={{ backgroundColor: sc.color, color: o.status === "order_pending" ? "#0E2646" : "#fff" }}>
                    {sc.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {orders.length === 0 && !isLoading && (
        <div className="text-center py-8">
          <Package size={28} style={{ color: "#D4D4D0" }} className="mx-auto mb-2" />
          <p className="text-[13px]" style={{ color: "#717182" }}>No orders with customer addresses</p>
        </div>
      )}
    </div>
  );
}
