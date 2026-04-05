import { useEffect, useRef, useState, useCallback } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Navigation, RefreshCw, Save, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";

const GOOGLE_MAPS_KEY = "AIzaSyB1o0qtjbf8Lx554cxK6BQmowqIoK-ccM0";

interface RoutePoint {
  label: string; subtitle?: string; city: string; state: string; address?: string;
  type: "start"|"end"|"pickup"|"delivery"|"waypoint"|"catl";
}
interface LegResult { from: string; to: string; miles: number; duration: string; }
interface FreightMapProps {
  points: RoutePoint[]; totalMiles: number|null;
  onMilesCalculated?: (total: number, legs: LegResult[]) => void;
  onSaveMiles?: (miles: number) => void; height?: number;
}

const svgPin = (fill: string, label: string, border = "#fff") =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="${fill}" stroke="${border}" stroke-width="2.5"/><text x="14" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="${label === "S" || label === "E" ? "#F3D12A" : "#fff"}" font-family="sans-serif">${label}</text></svg>`)}`;

const PIN_FILL: Record<string, string> = { start:"#0E2646", end:"#0E2646", pickup:"#55BAAA", delivery:"#E24B4A", waypoint:"#888780", catl:"#F3D12A" };
const PIN_LABEL: Record<string, string> = { start:"S", end:"E", pickup:"P", delivery:"D", waypoint:"W", catl:"C" };

export default function FreightMap({ points, totalMiles, onMilesCalculated, onSaveMiles, height = 280 }: FreightMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map|null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const rendererRef = useRef<google.maps.DirectionsRenderer|null>(null);
  const [legs, setLegs] = useState<LegResult[]>([]);
  const [calcTotal, setCalcTotal] = useState<number|null>(null);
  const [overrideMiles, setOverrideMiles] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapRef.current || points.length < 2) return;
    const loader = new Loader({ apiKey: GOOGLE_MAPS_KEY, version: "weekly", libraries: ["places","geometry"] });
    loader.load().then(() => {
      if (!mapRef.current) return;
      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: { lat: 42.5, lng: -100 }, zoom: 6,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [{ featureType:"poi", stylers:[{visibility:"off"}] }, { featureType:"transit", stylers:[{visibility:"off"}] }],
      });
      rendererRef.current = new google.maps.DirectionsRenderer({
        map: mapInstance.current, suppressMarkers: true,
        polylineOptions: { strokeColor:"#55BAAA", strokeWeight:4, strokeOpacity:0.8 },
      });
      setMapLoaded(true);
    }).catch(err => { console.error("Maps load:", err); setError("Failed to load Google Maps."); });
  }, [points.length]);

  const calculateRoute = useCallback(async () => {
    if (!mapInstance.current || points.length < 2) return;
    setLoading(true); setError(null);
    try {
      const geocoder = new google.maps.Geocoder();
      const dirSvc = new google.maps.DirectionsService();
      const geocoded: { point: RoutePoint; location: google.maps.LatLng }[] = [];
      for (const pt of points) {
        const addr = pt.address ? `${pt.address}, ${pt.city}, ${pt.state}` : `${pt.city}, ${pt.state}`;
        try {
          const r = await geocoder.geocode({ address: addr });
          if (r.results[0]) geocoded.push({ point: pt, location: r.results[0].geometry.location });
        } catch (e) { console.warn(`Geocode fail ${addr}:`, e); }
      }
      if (geocoded.length < 2) { setError("Could not geocode enough addresses."); setLoading(false); return; }

      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      const bounds = new google.maps.LatLngBounds();

      geocoded.forEach(({ point, location }) => {
        bounds.extend(location);
        const fill = PIN_FILL[point.type] || "#888";
        const label = PIN_LABEL[point.type] || "•";
        const marker = new google.maps.Marker({
          map: mapInstance.current!, position: location,
          icon: { url: svgPin(fill, label, point.type === "start" || point.type === "end" ? "#F3D12A" : "#fff"), scaledSize: new google.maps.Size(28,28), anchor: new google.maps.Point(14,14) },
          title: `${point.label}${point.subtitle ? " — " + point.subtitle : ""}`,
        });
        const info = new google.maps.InfoWindow({
          content: `<div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;"><strong style="font-size:13px;color:#0E2646;">${point.label}</strong>${point.subtitle ? `<br><span style="font-size:11px;color:#717182;">${point.subtitle}</span>` : ""}<br><span style="font-size:11px;color:#717182;">${point.city}, ${point.state}</span></div>`,
        });
        marker.addListener("click", () => info.open({ anchor: marker, map: mapInstance.current! }));
        markersRef.current.push(marker);
      });
      mapInstance.current.fitBounds(bounds, { top:40, bottom:40, left:40, right:40 });

      const origin = geocoded[0].location;
      const destination = geocoded[geocoded.length - 1].location;
      const waypoints = geocoded.slice(1, -1).map(g => ({ location: g.location, stopover: true }));
      const dirResult = await dirSvc.route({ origin, destination, waypoints, travelMode: google.maps.TravelMode.DRIVING, optimizeWaypoints: false });

      if (dirResult.routes[0]) {
        rendererRef.current?.setDirections(dirResult);
        const legResults: LegResult[] = dirResult.routes[0].legs.map((leg, i) => ({
          from: geocoded[i].point.label,
          to: geocoded[i + 1]?.point.label || geocoded[geocoded.length - 1].point.label,
          miles: Math.round((leg.distance?.value || 0) * 0.000621371),
          duration: leg.duration?.text || "",
        }));
        const total = legResults.reduce((s, l) => s + l.miles, 0);
        setLegs(legResults); setCalcTotal(total); setOverrideMiles(total.toString());
        onMilesCalculated?.(total, legResults);
      }
    } catch (err: any) { console.error("Route error:", err); setError(err.message || "Route calculation failed."); }
    setLoading(false);
  }, [points, onMilesCalculated]);

  useEffect(() => { if (mapLoaded && points.length >= 2) calculateRoute(); }, [mapLoaded, calculateRoute]);
  useEffect(() => { if (totalMiles && !calcTotal) setOverrideMiles(totalMiles.toString()); }, [totalMiles]);

  if (points.length < 2) return (
    <div className="rounded-xl p-6 text-center" style={{ backgroundColor:"#F5F5F0", border:"0.5px solid #D4D4D0" }}>
      <MapPin size={24} style={{ color:"#D4D4D0" }} className="mx-auto mb-2" />
      <p className="text-[13px]" style={{ color:"#717182" }}>Add at least 2 stops to see the route map</p>
    </div>
  );

  return (
    <div>
      <div className="rounded-xl overflow-hidden mb-3" style={{ border:"0.5px solid #D4D4D0" }}>
        {error && <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor:"#FCEBEB" }}><AlertTriangle size={14} style={{ color:"#A32D2D" }}/><span className="text-[12px]" style={{ color:"#A32D2D" }}>{error}</span></div>}
        <div ref={mapRef} style={{ height, width:"100%", backgroundColor:"#E8E6DE" }}>
          {!mapLoaded && !error && <div className="flex items-center justify-center h-full"><p className="text-[13px]" style={{ color:"#717182" }}>Loading map...</p></div>}
        </div>
      </div>
      {(legs.length > 0 || loading) && (
        <div className="rounded-xl p-3" style={{ backgroundColor:"#fff", border:"0.5px solid #D4D4D0" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color:"#717182" }}>Route mileage</p>
            <div className="flex items-center gap-2">
              {calcTotal !== null && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor:"#E1F5EE", color:"#085041" }}>Auto-calculated</span>}
              <button onClick={calculateRoute} disabled={loading} className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1" style={{ border:"0.5px solid #D4D4D0", color: loading ? "#D4D4D0" : "#717182" }}>
                <RefreshCw size={11} className={loading ? "animate-spin" : ""}/>{loading ? "Calculating..." : "Recalculate"}
              </button>
            </div>
          </div>
          {calcTotal !== null && (
            <div className="flex items-end gap-2 mb-3">
              <span className="text-[28px] font-bold leading-none" style={{ color:"#0E2646" }}>{calcTotal.toLocaleString()}</span>
              <span className="text-[14px] pb-0.5" style={{ color:"#717182" }}>miles total</span>
              {legs.length > 0 && <span className="text-[12px] pb-0.5" style={{ color:"#B4B2A9" }}>({legs.reduce((s,l)=>{ const h=l.duration.match(/(\d+)\s*hour/); const m=l.duration.match(/(\d+)\s*min/); return s+(h?parseInt(h[1])*60:0)+(m?parseInt(m[1]):0); },0)} min drive)</span>}
            </div>
          )}
          <div className="space-y-0.5 mb-3">
            {legs.map((leg,i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex flex-col items-center" style={{ width:12 }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i===0 ? "#0E2646" : "#55BAAA" }}/>
                  {i < legs.length-1 && <div className="w-px flex-1 my-0.5" style={{ backgroundColor:"#D4D4D0", minHeight:8 }}/>}
                </div>
                <span className="text-[12px] flex-1" style={{ color:"#1A1A1A" }}>{leg.from} → {leg.to}</span>
                <span className="text-[11px] font-medium" style={{ color:"#55BAAA" }}>{leg.miles} mi</span>
                <span className="text-[10px]" style={{ color:"#B4B2A9" }}>{leg.duration}</span>
              </div>
            ))}
            {legs.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center" style={{ width:12 }}><div className="w-2 h-2 rounded-full" style={{ backgroundColor:"#0E2646" }}/></div>
                <span className="text-[12px]" style={{ color:"#1A1A1A" }}>{legs[legs.length-1].to}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 items-center pt-2 border-t" style={{ borderColor:"#F0F0EC" }}>
            <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ border:"0.5px solid #D4D4D0" }}>
              <Navigation size={12} style={{ color:"#717182" }}/>
              <input type="text" value={overrideMiles} onChange={e=>setOverrideMiles(e.target.value.replace(/[^0-9]/g,""))} className="flex-1 text-[13px] font-medium bg-transparent outline-none" style={{ color:"#0E2646", border:"none" }} placeholder="Miles"/>
              <span className="text-[11px]" style={{ color:"#717182" }}>mi</span>
            </div>
            {onSaveMiles && <button onClick={()=>{ const v=parseInt(overrideMiles); if(v>0){onSaveMiles(v);toast.success(`Miles saved: ${v.toLocaleString()}`);} }} className="text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ backgroundColor:"#55BAAA", color:"#fff" }}><Save size={12}/> Save</button>}
          </div>
        </div>
      )}
    </div>
  );
}
