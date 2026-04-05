import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";

const GKEY = "AIzaSyB1o0qtjbf8Lx554cxK6BQmowqIoK-ccM0";
const HQ = { lat: 44.236, lng: -103.728 };

interface OP { id:string; contract:string|null; name:string; customer:string; equipment:string; status:string; city:string; state:string; lat:number|null; lng:number|null; customerId:string; }
const SP: Record<string,{color:string;label:string;text:string}> = {
  order_pending:{color:"#F3D12A",label:"On order",text:"#0E2646"}, building:{color:"#EEEDFE",label:"Building",text:"#3C3489"},
  ready:{color:"#55BAAA",label:"Ready",text:"#fff"}, shipped:{color:"#378ADD",label:"Shipped",text:"#fff"}, delivered:{color:"#E24B4A",label:"Delivered",text:"#fff"},
};
const svgDot = (f:string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${f}" stroke="#fff" stroke-width="2"/></svg>`)}`;
const svgHQ = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="13" fill="#0E2646" stroke="#F3D12A" stroke-width="3"/><text x="16" y="20" text-anchor="middle" font-size="10" font-weight="700" fill="#F3D12A" font-family="sans-serif">HQ</text></svg>`)}`;

function loadMapsApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && google.maps) { resolve(); return; }
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GKEY}&libraries=places&callback=__gmcb__`;
    s.async = true; s.defer = true;
    (window as any).__gmcb__ = () => { delete (window as any).__gmcb__; resolve(); };
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
}

export default function EquipmentMap() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement|null>(null);
  const mapRef = useRef<google.maps.Map|null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready,setReady] = useState(false);
  const [geocoding,setGeocoding] = useState(false);
  const [error,setError] = useState<string|null>(null);

  const { data:orders=[], isLoading } = useQuery({
    queryKey:["equipment_map_orders"],
    queryFn:async()=>{
      const{data,error}=await supabase.from("orders").select("id, moly_contract_number, contract_name, base_model, build_shorthand, status, customer_id, customers(id, name, address_city, address_state, latitude, longitude, geocoded_at)").not("customer_id","is",null).order("moly_contract_number",{ascending:false});
      if(error)throw error;
      return(data||[]).filter((o:any)=>o.customers?.address_city&&o.customers?.address_state).map((o:any)=>({id:o.id,contract:o.moly_contract_number,name:o.contract_name||"",customer:o.customers?.name||"",equipment:o.build_shorthand?.split(",")[0]||o.base_model||"",status:o.status||"order_pending",city:o.customers?.address_city,state:o.customers?.address_state,lat:o.customers?.latitude,lng:o.customers?.longitude,customerId:o.customers?.id})) as OP[];
    },
  });
  const needsGeo=useMemo(()=>orders.filter(o=>!o.lat||!o.lng),[orders]);
  const byState=useMemo(()=>{const m:Record<string,OP[]>={};orders.forEach(o=>{if(!m[o.state])m[o.state]=[];m[o.state].push(o);});return Object.entries(m).sort((a,b)=>b[1].length-a[1].length);},[orders]);

  // Init map with detached div
  useEffect(()=>{
    if(!containerRef.current) return;
    const div=document.createElement("div");
    div.style.cssText="width:100%;height:360px;";
    containerRef.current.appendChild(div);
    mapDivRef.current=div;
    loadMapsApi().then(()=>{
      mapRef.current=new google.maps.Map(div,{center:HQ,zoom:5,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,styles:[{featureType:"poi",stylers:[{visibility:"off"}]},{featureType:"transit",stylers:[{visibility:"off"}]}]});
      setReady(true);
    }).catch(err=>{console.error("Maps:",err);setError("Failed to load Google Maps");});
    return()=>{
      markersRef.current.forEach(m=>m.setMap(null));markersRef.current=[];
      mapRef.current=null;
      if(div.parentNode)div.parentNode.removeChild(div);
      mapDivRef.current=null;setReady(false);
    };
  },[]);

  // Geocode
  useEffect(()=>{
    if(!ready||needsGeo.length===0)return;
    setGeocoding(true);
    const gc=new google.maps.Geocoder();const seen=new Set<string>();
    (async()=>{
      for(const o of needsGeo){if(seen.has(o.customerId))continue;seen.add(o.customerId);
        try{const r=await gc.geocode({address:`${o.city}, ${o.state}`});if(r.results[0]){const l=r.results[0].geometry.location;await supabase.from("customers").update({latitude:l.lat(),longitude:l.lng(),geocoded_at:new Date().toISOString()}).eq("id",o.customerId);orders.forEach(x=>{if(x.customerId===o.customerId){x.lat=l.lat();x.lng=l.lng();}});}}catch(e){console.warn(`Geocode fail ${o.city},${o.state}`);}
        await new Promise(r=>setTimeout(r,200));
      }
      setGeocoding(false);qc.invalidateQueries({queryKey:["equipment_map_orders"]});
    })();
  },[ready,needsGeo.length]);

  // Place markers
  useEffect(()=>{
    if(!mapRef.current||!ready)return;
    markersRef.current.forEach(m=>m.setMap(null));markersRef.current=[];
    const bounds=new google.maps.LatLngBounds();
    const hq=new google.maps.Marker({map:mapRef.current,position:HQ,icon:{url:svgHQ,scaledSize:new google.maps.Size(32,32),anchor:new google.maps.Point(16,16)},title:"CATL Resources — St. Onge, SD"});
    const hi=new google.maps.InfoWindow({content:`<div style="font-family:Inter,system-ui,sans-serif;padding:4px;"><strong style="font-size:13px;color:#0E2646;">CATL Resources</strong><br><span style="font-size:11px;color:#717182;">St. Onge, SD — Home base</span></div>`});
    hq.addListener("click",()=>hi.open({anchor:hq,map:mapRef.current!}));
    markersRef.current.push(hq);bounds.extend(HQ);
    const pinned=orders.filter(o=>o.lat&&o.lng);
    pinned.forEach(o=>{const pos={lat:o.lat!,lng:o.lng!};bounds.extend(pos);const sc=SP[o.status]||SP.order_pending;
      const mk=new google.maps.Marker({map:mapRef.current!,position:pos,icon:{url:svgDot(sc.color),scaledSize:new google.maps.Size(20,20),anchor:new google.maps.Point(10,10)},title:`${o.contract||""} ${o.customer}`});
      const iw=new google.maps.InfoWindow({content:`<div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;min-width:180px;"><strong style="font-size:13px;color:#0E2646;">${o.contract?o.contract+" — ":""}${o.customer}</strong><br><span style="font-size:11px;color:#717182;">${o.equipment}</span><br><span style="font-size:11px;color:#717182;">${o.city}, ${o.state}</span><br><span style="font-size:10px;display:inline-block;margin-top:4px;padding:2px 6px;border-radius:99px;background:${sc.color};color:${sc.text};">${sc.label}</span></div>`});
      mk.addListener("click",()=>iw.open({anchor:mk,map:mapRef.current!}));markersRef.current.push(mk);
    });
    if(pinned.length>0)mapRef.current.fitBounds(bounds,{top:40,bottom:40,left:40,right:40});
  },[ready,orders,geocoding]);

  return (
    <div>
      <div className="rounded-xl overflow-hidden mb-3" style={{border:"0.5px solid #D4D4D0"}}>
        {error&&<div className="px-3 py-2 flex items-center gap-2" style={{backgroundColor:"#FCEBEB"}}><AlertTriangle size={14} style={{color:"#A32D2D"}}/><span className="text-[12px]" style={{color:"#A32D2D"}}>{error}</span></div>}
        <div ref={containerRef} style={{minHeight:360,backgroundColor:"#E8E6DE"}}>
          {!ready&&!error&&<div className="flex items-center justify-center" style={{height:360}}><p className="text-[13px]" style={{color:"#717182"}}>Loading map...</p></div>}
        </div>
        <div className="px-3 py-2.5 border-t" style={{borderColor:"#F0F0EC",backgroundColor:"#fff"}}>
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor:"#0E2646",border:"1.5px solid #F3D12A"}}/><span className="text-[11px]" style={{color:"#717182"}}>CATL HQ</span></div>
            {Object.entries(SP).map(([k,v])=><div key={k} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor:v.color}}/><span className="text-[11px]" style={{color:"#717182"}}>{v.label}</span></div>)}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 px-2.5 py-1.5 rounded-lg" style={{backgroundColor:"#F5F5F0"}}><span className="text-[10px]" style={{color:"#717182"}}>On map</span><p className="text-[16px] font-medium m-0" style={{color:"#0E2646"}}>{orders.filter(o=>o.lat&&o.lng).length}</p></div>
            <div className="flex-1 px-2.5 py-1.5 rounded-lg" style={{backgroundColor:"#F5F5F0"}}><span className="text-[10px]" style={{color:"#717182"}}>States</span><p className="text-[16px] font-medium m-0" style={{color:"#0E2646"}}>{byState.length}</p></div>
            <div className="flex-1 px-2.5 py-1.5 rounded-lg" style={{backgroundColor:"#F5F5F0"}}><span className="text-[10px]" style={{color:"#717182"}}>Geocoding</span><p className="text-[16px] font-medium m-0" style={{color:"#0E2646"}}>{geocoding?`${needsGeo.length}...`:"Done"}</p></div>
          </div>
        </div>
      </div>
      {byState.map(([state,so])=>(
        <div key={state} className="mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1.5 px-1" style={{color:"#717182"}}>{state} ({so.length})</p>
          {so.map(o=>{const sc=SP[o.status]||SP.order_pending;return(
            <button key={o.id} onClick={()=>navigate(`/orders/${o.id}`)} className="w-full text-left rounded-xl p-2.5 mb-1" style={{backgroundColor:"#fff",border:"0.5px solid #D4D4D0"}}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0"><span className="text-[13px] font-medium truncate block" style={{color:"#0E2646"}}>{o.contract?`${o.contract} — `:""}{o.customer}</span><span className="text-[11px]" style={{color:"#717182"}}>{o.equipment}{o.city?` · ${o.city}, ${o.state}`:""}</span></div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2" style={{backgroundColor:sc.color,color:sc.text}}>{sc.label}</span>
              </div>
            </button>
          );})}
        </div>
      ))}
      {orders.length===0&&!isLoading&&<div className="text-center py-8"><Package size={28} style={{color:"#D4D4D0"}} className="mx-auto mb-2"/><p className="text-[13px]" style={{color:"#717182"}}>No orders with customer addresses</p></div>}
    </div>
  );
}
