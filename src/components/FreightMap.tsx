import { useEffect, useRef, useState, useCallback } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin, Navigation, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const GOOGLE_MAPS_KEY = "AIzaSyB1o0qtjbf8Lx554cxK6BQmowqIoK-ccM0";

interface RoutePoint {
  label: string;
  subtitle?: string;
  city: string;
  state: string;
  address?: string;
  type: "start" | "end" | "pickup" | "delivery" | "waypoint" | "catl";
}

interface LegResult {
  from: string;
  to: string;
  miles: number;
  duration: string;
}

interface FreightMapProps {
  points: RoutePoint[];
  totalMiles: number | null;
  onMilesCalculated?: (total: number, legs: LegResult[]) => void;
  onSaveMiles?: (miles: number) => void;
  height?: number;
}

const PIN_COLORS: Record<RoutePoint["type"], string> = {
  start: "#0E2646",
  end: "#0E2646",
  pickup: "#55BAAA",
  delivery: "#E24B4A",
  waypoint: "#888780",
  catl: "#F3D12A",
};

const PIN_LABELS: Record<RoutePoint["type"], string> = {
  start: "S",
  end: "E",
  pickup: "P",
  delivery: "D",
  waypoint: "W",
  catl: "C",
};

export default function FreightMap({ points, totalMiles, onMilesCalculated, onSaveMiles, height = 280 }: FreightMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const routeRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const [legs, setLegs] = useState<LegResult[]>([]);
  const [calcTotal, setCalcTotal] = useState<number | null>(null);
  const [overrideMiles, setOverrideMiles] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Load Google Maps
  useEffect(() => {
    if (!mapRef.current || points.length < 2) return;

    const loader = new Loader({
      apiKey: GOOGLE_MAPS_KEY,
      version: "weekly",
      libraries: ["places", "geometry", "marker"],
    });

    loader.load().then(() => {
      if (!mapRef.current) return;

      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 42.5, lng: -100 },
        zoom: 6,
        mapId: "DEMO_MAP_ID",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapInstance.current = map;
      routeRenderer.current = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: "#55BAAA",
          strokeWeight: 4,
          strokeOpacity: 0.8,
        },
      });

      setMapLoaded(true);
    }).catch(err => {
      console.error("Google Maps load error:", err);
      setError("Failed to load Google Maps. Check your API key and enabled APIs.");
    });
  }, [points.length]);

  // Geocode and route when map is ready
  const calculateRoute = useCallback(async () => {
    if (!mapInstance.current || points.length < 2) return;
    setLoading(true);
    setError(null);

    try {
      const geocoder = new google.maps.Geocoder();
      const directionsService = new google.maps.DirectionsService();

      // Geocode all points
      const geocoded: { point: RoutePoint; location: google.maps.LatLng }[] = [];
      for (const pt of points) {
        const addr = pt.address
          ? `${pt.address}, ${pt.city}, ${pt.state}`
          : `${pt.city}, ${pt.state}`;
        try {
          const result = await geocoder.geocode({ address: addr });
          if (result.results[0]) {
            geocoded.push({ point: pt, location: result.results[0].geometry.location });
          }
        } catch (e) {
          console.warn(`Geocode failed for ${addr}:`, e);
        }
      }

      if (geocoded.length < 2) {
        setError("Could not geocode enough addresses to calculate a route.");
        setLoading(false);
        return;
      }

      // Clear old markers
      markersRef.current.forEach(m => m.map = null);
      markersRef.current = [];

      // Add markers
      const bounds = new google.maps.LatLngBounds();
      geocoded.forEach(({ point, location }) => {
        bounds.extend(location);

        const pinColor = PIN_COLORS[point.type] || "#888780";
        const pinLabel = PIN_LABELS[point.type] || "•";

        const pinEl = document.createElement("div");
        pinEl.style.cssText = `width:28px;height:28px;border-radius:50%;background:${pinColor};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${point.type === "start" || point.type === "end" ? "#F3D12A" : "#fff"};box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;`;
        pinEl.textContent = pinLabel;

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapInstance.current!,
          position: location,
          content: pinEl,
          title: `${point.label}${point.subtitle ? " — " + point.subtitle : ""}`,
        });

        // Info window on click
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;">
            <strong style="font-size:13px;color:#0E2646;">${point.label}</strong>
            ${point.subtitle ? `<br><span style="font-size:11px;color:#717182;">${point.subtitle}</span>` : ""}
            <br><span style="font-size:11px;color:#717182;">${point.city}, ${point.state}</span>
          </div>`,
        });
        marker.addListener("click", () => infoWindow.open({ anchor: marker, map: mapInstance.current }));

        markersRef.current.push(marker);
      });

      mapInstance.current.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });

      // Calculate directions
      const origin = geocoded[0].location;
      const destination = geocoded[geocoded.length - 1].location;
      const waypoints = geocoded.slice(1, -1).map(g => ({
        location: g.location,
        stopover: true,
      }));

      const dirResult = await directionsService.route({
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      });

      if (dirResult.routes[0]) {
        routeRenderer.current?.setDirections(dirResult);

        const legResults: LegResult[] = dirResult.routes[0].legs.map((leg, i) => ({
          from: i === 0 ? geocoded[0].point.label : geocoded[i].point.label,
          to: geocoded[i + 1]?.point.label || geocoded[geocoded.length - 1].point.label,
          miles: Math.round((leg.distance?.value || 0) * 0.000621371),
          duration: leg.duration?.text || "",
        }));

        const total = legResults.reduce((sum, l) => sum + l.miles, 0);
        setLegs(legResults);
        setCalcTotal(total);
        setOverrideMiles(total.toString());
        onMilesCalculated?.(total, legResults);
      }
    } catch (err: any) {
      console.error("Route calculation error:", err);
      setError(err.message || "Route calculation failed. Directions API may not be enabled.");
    }

    setLoading(false);
  }, [points, onMilesCalculated]);

  // Auto-calculate when map loads
  useEffect(() => {
    if (mapLoaded && points.length >= 2) {
      calculateRoute();
    }
  }, [mapLoaded, calculateRoute]);

  // Init override from DB value
  useEffect(() => {
    if (totalMiles && !calcTotal) {
      setOverrideMiles(totalMiles.toString());
    }
  }, [totalMiles]);

  if (points.length < 2) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "#F5F5F0", border: "0.5px solid #D4D4D0" }}>
        <MapPin size={24} style={{ color: "#D4D4D0" }} className="mx-auto mb-2" />
        <p className="text-[13px]" style={{ color: "#717182" }}>Add at least 2 stops to see the route map</p>
      </div>
    );
  }

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
        <div ref={mapRef} style={{ height, width: "100%", backgroundColor: "#E8E6DE" }}>
          {!mapLoaded && !error && (
            <div className="flex items-center justify-center h-full">
              <p className="text-[13px]" style={{ color: "#717182" }}>Loading map...</p>
            </div>
          )}
        </div>
      </div>

      {/* Mileage breakdown */}
      {(legs.length > 0 || loading) && (
        <div className="rounded-xl p-3" style={{ backgroundColor: "#fff", border: "0.5px solid #D4D4D0" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>
              Route mileage
            </p>
            <div className="flex items-center gap-2">
              {calcTotal !== null && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#E1F5EE", color: "#085041" }}>
                  Auto-calculated
                </span>
              )}
              <button onClick={calculateRoute} disabled={loading}
                className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1"
                style={{ border: "0.5px solid #D4D4D0", color: loading ? "#D4D4D0" : "#717182" }}>
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                {loading ? "Calculating..." : "Recalculate"}
              </button>
            </div>
          </div>

          {/* Total */}
          {calcTotal !== null && (
            <div className="flex items-end gap-2 mb-3">
              <span className="text-[28px] font-bold leading-none" style={{ color: "#0E2646" }}>
                {calcTotal.toLocaleString()}
              </span>
              <span className="text-[14px] pb-0.5" style={{ color: "#717182" }}>miles total</span>
              {legs.length > 0 && (
                <span className="text-[12px] pb-0.5" style={{ color: "#B4B2A9" }}>
                  ({legs.reduce((s, l) => {
                    const hrs = l.duration.match(/(\d+)\s*hour/);
                    const mins = l.duration.match(/(\d+)\s*min/);
                    return s + (hrs ? parseInt(hrs[1]) * 60 : 0) + (mins ? parseInt(mins[1]) : 0);
                  }, 0)} min drive)
                </span>
              )}
            </div>
          )}

          {/* Legs */}
          <div className="space-y-0.5 mb-3">
            {legs.map((leg, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex flex-col items-center" style={{ width: 12 }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i === 0 ? "#0E2646" : "#55BAAA" }} />
                  {i < legs.length - 1 && <div className="w-px flex-1 my-0.5" style={{ backgroundColor: "#D4D4D0", minHeight: 8 }} />}
                </div>
                <span className="text-[12px] flex-1" style={{ color: "#1A1A1A" }}>
                  {leg.from} → {leg.to}
                </span>
                <span className="text-[11px] font-medium" style={{ color: "#55BAAA" }}>
                  {leg.miles} mi
                </span>
                <span className="text-[10px]" style={{ color: "#B4B2A9" }}>
                  {leg.duration}
                </span>
              </div>
            ))}
            {legs.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center" style={{ width: 12 }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0E2646" }} />
                </div>
                <span className="text-[12px]" style={{ color: "#1A1A1A" }}>{legs[legs.length - 1].to}</span>
              </div>
            )}
          </div>

          {/* Override + save */}
          <div className="flex gap-2 items-center pt-2 border-t" style={{ borderColor: "#F0F0EC" }}>
            <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ border: "0.5px solid #D4D4D0" }}>
              <Navigation size={12} style={{ color: "#717182" }} />
              <input
                type="text"
                value={overrideMiles}
                onChange={e => setOverrideMiles(e.target.value.replace(/[^0-9]/g, ""))}
                className="flex-1 text-[13px] font-medium bg-transparent outline-none"
                style={{ color: "#0E2646", border: "none" }}
                placeholder="Miles"
              />
              <span className="text-[11px]" style={{ color: "#717182" }}>mi</span>
            </div>
            {onSaveMiles && (
              <button onClick={() => {
                const v = parseInt(overrideMiles);
                if (v > 0) { onSaveMiles(v); toast.success(`Miles saved: ${v.toLocaleString()}`); }
              }}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
                style={{ backgroundColor: "#55BAAA", color: "#fff" }}>
                <Save size={12} /> Save
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
