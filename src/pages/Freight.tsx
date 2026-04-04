import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Plus, ArrowLeft, MapPin, Phone, ChevronDown, ChevronUp, Trash2, Check, Share2, Package, User, Edit2, X, Printer, ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
type RunStatus = "planning"|"scheduled"|"loading"|"in_transit"|"completed"|"cancelled";
type StopStatus = "pending"|"en_route"|"delivered"|"skipped";
type CarrierType = "external_trucker"|"catl_vehicle";
interface Carrier { id:string; name:string; type:CarrierType; phone:string|null; email:string|null; vehicle_description:string|null; notes:string|null; is_active:boolean; }
interface FreightRun { id:string; name:string|null; pickup_location:string; start_location:string|null; start_city:string|null; start_state:string|null; end_location:string|null; end_city:string|null; end_state:string|null; total_miles:number|null; carrier_id:string|null; driver_name:string|null; status:RunStatus; pickup_date:string|null; estimated_arrival:string|null; actual_cost:number|null; freight_notes:string|null; share_token:string|null; created_at:string; carriers?:Carrier|null; }
interface FreightStop { id:string; freight_run_id:string; order_id:string|null; stop_order:number; stop_type:"pickup"|"delivery"; customer_name:string|null; delivery_address:string|null; delivery_city:string|null; delivery_state:string|null; delivery_zip:string|null; delivery_phone:string|null; delivery_instructions:string|null; unloading_equipment:string|null; status:StopStatus; delivered_at:string|null; notes:string|null; orders?:any; }
interface ReadyOrder { id:string; moly_contract_number:string|null; contract_name:string|null; base_model:string|null; build_shorthand:string|null; customer_id:string|null; delivery_instructions:string|null; status:string; customers?:{name:string;phone:string|null;address_line1:string|null;address_city:string|null;address_state:string|null;address_zip:string|null;}|null; }

const KL: Record<string,{label:string;short:string;city:string;state:string}> = {
  catl_wall_sd:{label:"CATL Resources — Wall, SD",short:"CATL Wall SD",city:"Wall",state:"SD"},
  lorraine_ks:{label:"Moly Mfg — Lorraine, KS",short:"Moly Lorraine KS",city:"Lorraine",state:"KS"},
  ainsworth_ne:{label:"Daniels — Ainsworth, NE",short:"Daniels Ainsworth NE",city:"Ainsworth",state:"NE"},
  el_dorado_ks:{label:"MJE — El Dorado, KS",short:"MJE El Dorado KS",city:"El Dorado",state:"KS"},
  custom:{label:"Custom location",short:"Custom",city:"",state:""},
};
const SC: Record<RunStatus,{bg:string;text:string;label:string}> = {
  planning:{bg:"#FAEEDA",text:"#633806",label:"Planning"},scheduled:{bg:"#E6F1FB",text:"#0C447C",label:"Scheduled"},
  loading:{bg:"#EEEDFE",text:"#3C3489",label:"Loading"},in_transit:{bg:"#E1F5EE",text:"#085041",label:"In transit"},
  completed:{bg:"#EAF3DE",text:"#27500A",label:"Completed"},cancelled:{bg:"#F1EFE8",text:"#444441",label:"Cancelled"},
};
const UO = [{value:"",label:"Select..."},{value:"forklift",label:"Forklift"},{value:"tractor_forks",label:"Tractor w/ forks"},{value:"skid_steer",label:"Skid steer"},{value:"loader",label:"Loader"},{value:"telehandler",label:"Telehandler"},{value:"crane",label:"Crane"},{value:"none",label:"None — need to bring"},{value:"other",label:"Other"}];
const fd = (d:string|null) => d ? format(new Date(d+"T12:00:00"),"MMM d") : "TBD";
const fc = (n:number) => "$"+n.toLocaleString("en-US",{maximumFractionDigits:0});
const ll = (k:string|null) => k && KL[k] ? KL[k].label : k || "";
const ls = (k:string|null,c?:string|null,s?:string|null) => { if(k&&KL[k]&&k!=="custom") return KL[k].short; return [c,s].filter(Boolean).join(", ")||"Custom"; };

function LocSel({value,onChange,noHome}:{value:string;onChange:(v:string)=>void;noHome?:boolean}) {
  return <select value={value} onChange={e=>onChange(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}>{Object.entries(KL).filter(([k])=>!noHome||k!=="catl_wall_sd").map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>;
}
function CarSel({value,onChange,carriers}:{value:string;onChange:(v:string)=>void;carriers:Carrier[]}) {
  const cv=carriers.filter(c=>c.type==="catl_vehicle"), et=carriers.filter(c=>c.type==="external_trucker");
  return <select value={value} onChange={e=>onChange(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}><option value="">Select...</option>{cv.length>0&&<optgroup label="CATL Vehicles">{cv.map(c=><option key={c.id} value={c.id}>{c.name}{c.vehicle_description?` — ${c.vehicle_description}`:""}</option>)}</optgroup>}{et.length>0&&<optgroup label="Truckers">{et.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}</select>;
}

export default function Freight() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string|null>(null);
  const [showAddStop, setShowAddStop] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [showCarriers, setShowCarriers] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [filter, setFilter] = useState<"active"|"completed"|"all">("active");

  const { data: runs=[], isLoading } = useQuery({ queryKey:["freight_runs"], queryFn: async()=>{ const{data,error}=await supabase.from("freight_runs").select("*, carriers(*)").order("created_at",{ascending:false}); if(error)throw error; return data as FreightRun[]; }});
  const { data: stopCounts={} } = useQuery({ queryKey:["freight_stop_counts"], queryFn: async()=>{ const{data,error}=await supabase.from("freight_run_stops").select("freight_run_id, stop_type, orders(base_model, build_shorthand)"); if(error)throw error; const c:Record<string,{p:number;d:number;eq:string[]}>={}; (data||[]).forEach((s:any)=>{ if(!c[s.freight_run_id])c[s.freight_run_id]={p:0,d:0,eq:[]}; if(s.stop_type==="pickup")c[s.freight_run_id].p++;else c[s.freight_run_id].d++; const e=s.orders?.build_shorthand?.split(",")[0]||s.orders?.base_model; if(e)c[s.freight_run_id].eq.push(e); }); return c; }});
  const { data: stops=[] } = useQuery({ queryKey:["freight_stops",activeRunId], enabled:!!activeRunId, queryFn: async()=>{ const{data,error}=await supabase.from("freight_run_stops").select("*, orders(id, moly_contract_number, contract_name, base_model, build_shorthand, customer_id, customers(name))").eq("freight_run_id",activeRunId!).order("stop_order",{ascending:true}); if(error)throw error; return data as FreightStop[]; }});
  const { data: carriers=[] } = useQuery({ queryKey:["carriers"], queryFn: async()=>{ const{data,error}=await supabase.from("carriers").select("*").eq("is_active",true).order("type").order("name"); if(error)throw error; return data as Carrier[]; }});
  const { data: readyOrders=[] } = useQuery({ queryKey:["ready_orders_for_freight"], enabled:showAddStop, queryFn: async()=>{ const{data:onRuns}=await supabase.from("freight_run_stops").select("order_id, freight_runs!inner(status)").not("freight_runs.status","in","(completed,cancelled)"); const used=new Set((onRuns||[]).map((s:any)=>s.order_id).filter(Boolean)); const{data,error}=await supabase.from("orders").select("id, moly_contract_number, contract_name, base_model, build_shorthand, customer_id, delivery_instructions, status, customers(name, phone, address_line1, address_city, address_state, address_zip)").in("status",["ready"]).order("moly_contract_number",{ascending:true}); if(error)throw error; return(data||[]).filter((o:any)=>!used.has(o.id)) as ReadyOrder[]; }});

  const activeRun = useMemo(()=>runs.find(r=>r.id===activeRunId)||null,[runs,activeRunId]);
  const filteredRuns = useMemo(()=>{ if(filter==="active")return runs.filter(r=>!["completed","cancelled"].includes(r.status)); if(filter==="completed")return runs.filter(r=>r.status==="completed"); return runs; },[runs,filter]);
  const pickupStops = useMemo(()=>stops.filter(s=>s.stop_type==="pickup"),[stops]);
  const deliveryStops = useMemo(()=>stops.filter(s=>s.stop_type==="delivery"),[stops]);

  const inv = () => { qc.invalidateQueries({queryKey:["freight_runs"]}); qc.invalidateQueries({queryKey:["freight_stops",activeRunId]}); qc.invalidateQueries({queryKey:["freight_stop_counts"]}); qc.invalidateQueries({queryKey:["ready_orders_for_freight"]}); };
  const createRun = useMutation({ mutationFn:async(d:any)=>{ const{data:r,error}=await supabase.from("freight_runs").insert(d).select().single(); if(error)throw error; return r; }, onSuccess:(r)=>{inv();setActiveRunId(r.id);setShowNewRun(false);toast.success("Run created");}, onError:(e:any)=>toast.error(e.message) });
  const updateRun = useMutation({ mutationFn:async({id,...d}:any)=>{ const{error}=await supabase.from("freight_runs").update({...d,updated_at:new Date().toISOString()}).eq("id",id); if(error)throw error; }, onSuccess:()=>inv(), onError:(e:any)=>toast.error(e.message) });
  const deleteRun = useMutation({ mutationFn:async(id:string)=>{ const{error}=await supabase.from("freight_runs").delete().eq("id",id); if(error)throw error; }, onSuccess:()=>{inv();setActiveRunId(null);toast.success("Run deleted");}, onError:(e:any)=>toast.error(e.message) });
  const addStop = useMutation({ mutationFn:async(d:any)=>{ const{error}=await supabase.from("freight_run_stops").insert(d); if(error)throw error; }, onSuccess:()=>{inv();toast.success("Stop added");}, onError:(e:any)=>toast.error(e.message) });
  const updateStop = useMutation({ mutationFn:async({id,...d}:any)=>{ const{error}=await supabase.from("freight_run_stops").update(d).eq("id",id); if(error)throw error; }, onSuccess:()=>inv(), onError:(e:any)=>toast.error(e.message) });
  const removeStop = useMutation({ mutationFn:async(id:string)=>{ const{error}=await supabase.from("freight_run_stops").delete().eq("id",id); if(error)throw error; }, onSuccess:()=>{inv();toast.success("Stop removed");}, onError:(e:any)=>toast.error(e.message) });
  const createCarrier = useMutation({ mutationFn:async(d:any)=>{ const{error}=await supabase.from("carriers").insert(d); if(error)throw error; }, onSuccess:()=>{qc.invalidateQueries({queryKey:["carriers"]});toast.success("Carrier added");}, onError:(e:any)=>toast.error(e.message) });
  const deleteCarrier = useMutation({ mutationFn:async(id:string)=>{ const{error}=await supabase.from("carriers").update({is_active:false}).eq("id",id); if(error)throw error; }, onSuccess:()=>{qc.invalidateQueries({queryKey:["carriers"]});toast.success("Carrier removed");} });

  // Print view
  if (showPrint && activeRun) return <PrintSheet run={activeRun} stops={stops} onBack={()=>setShowPrint(false)} />;

  // Run detail
  if (activeRunId && activeRun) {
    const sc = SC[activeRun.status]||SC.planning;
    return (
      <div className="min-h-screen" style={{backgroundColor:"#F5F5F0"}}>
        <div style={{backgroundColor:"#0E2646"}} className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={()=>setActiveRunId(null)} className="flex items-center gap-1 text-[13px]" style={{color:"rgba(245,245,240,0.7)"}}><ArrowLeft size={16}/> Back</button>
            <div className="flex gap-2">
              <button onClick={()=>setShowPrint(true)} className="text-[11px] px-2.5 py-1 rounded-full" style={{background:"rgba(245,245,240,0.15)",color:"#F5F5F0"}}><Printer size={12} className="inline mr-1"/>Print</button>
              <button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/freight/share/${activeRun.share_token}`);toast.success("Share link copied");}} className="text-[11px] px-2.5 py-1 rounded-full" style={{background:"rgba(245,245,240,0.15)",color:"#F5F5F0"}}><Share2 size={12} className="inline mr-1"/>Share</button>
              <button onClick={()=>{if(confirm("Delete this freight run?"))deleteRun.mutate(activeRun.id);}} className="text-[11px] px-2.5 py-1 rounded-full" style={{background:"rgba(220,50,50,0.2)",color:"#F09595"}}><Trash2 size={12}/></button>
            </div>
          </div>
          <h2 className="text-[18px] font-bold mb-1" style={{color:"#F5F5F0"}}>{activeRun.name||"Freight run"}</h2>
          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{backgroundColor:sc.bg,color:sc.text}}>{sc.label}</span>
            <span style={{color:"rgba(245,245,240,0.7)"}}>Pickup: {fd(activeRun.pickup_date)}</span>
            {(activeRun.carriers?.name||activeRun.driver_name)&&<span style={{color:"rgba(245,245,240,0.7)"}}>{activeRun.carriers?.name}{activeRun.driver_name?` · ${activeRun.driver_name}`:""}</span>}
            {activeRun.carriers?.phone&&<a href={`tel:${activeRun.carriers.phone}`} style={{color:"#55BAAA"}}><Phone size={11} className="inline mr-0.5"/>{activeRun.carriers.phone}</a>}
            {activeRun.carriers?.email&&<a href={`mailto:${activeRun.carriers.email}`} style={{color:"#55BAAA"}}>{activeRun.carriers.email}</a>}
            {activeRun.total_miles&&<span style={{color:"#F3D12A"}}>{activeRun.total_miles} mi</span>}
            {activeRun.actual_cost?<span style={{color:"#F3D12A"}}>{fc(activeRun.actual_cost)}</span>:null}
          </div>
          <div className="flex gap-2 mt-3">
            <select value={activeRun.status} onChange={e=>updateRun.mutate({id:activeRun.id,status:e.target.value})} className="text-[12px] rounded-lg px-2 py-1.5 flex-1" style={{background:"rgba(245,245,240,0.1)",color:"#F5F5F0",border:"0.5px solid rgba(245,245,240,0.2)"}}>{Object.entries(SC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
            <button onClick={()=>{const m=prompt("Total miles:",activeRun.total_miles?.toString()||"");if(m!==null)updateRun.mutate({id:activeRun.id,total_miles:m?parseFloat(m):null});}} className="text-[11px] px-2.5 py-1.5 rounded-lg" style={{background:"rgba(245,245,240,0.1)",color:"#F5F5F0",border:"0.5px solid rgba(245,245,240,0.2)"}}>Miles</button>
            <button onClick={()=>{const c=prompt("Actual cost:",activeRun.actual_cost?.toString()||"");if(c!==null)updateRun.mutate({id:activeRun.id,actual_cost:c?parseFloat(c):null});}} className="text-[11px] px-2.5 py-1.5 rounded-lg" style={{background:"rgba(245,245,240,0.1)",color:"#F5F5F0",border:"0.5px solid rgba(245,245,240,0.2)"}}>Cost</button>
          </div>
        </div>
        <div className="px-4 mt-3 space-y-2 pb-24">
          <div className="rounded-xl p-3 flex items-center gap-2" style={{backgroundColor:"rgba(14,38,70,0.06)",border:"0.5px solid rgba(14,38,70,0.15)"}}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{backgroundColor:"#0E2646",color:"#F3D12A"}}>S</div>
            <p className="text-[13px] font-medium" style={{color:"#0E2646"}}>Start: {ll(activeRun.start_location)}</p>
          </div>
          {pickupStops.length>0&&<p className="text-[10px] font-medium uppercase tracking-wider pt-1" style={{color:"#717182"}}>Manufacturer pickups ({pickupStops.length})</p>}
          {pickupStops.map((s,i)=><StopCard key={s.id} stop={s} index={i+1} isPickup onUpdate={d=>updateStop.mutate({id:s.id,...d})} onRemove={()=>{if(confirm("Remove?"))removeStop.mutate(s.id);}} onMarkDone={()=>updateStop.mutate({id:s.id,status:"delivered",delivered_at:new Date().toISOString()})} navigate={navigate}/>)}
          {pickupStops.length>0&&deliveryStops.length>0&&<div className="flex justify-center py-1"><ArrowDown size={18} style={{color:"#D4D4D0"}}/></div>}
          {deliveryStops.length>0&&<p className="text-[10px] font-medium uppercase tracking-wider pt-1" style={{color:"#717182"}}>Customer deliveries ({deliveryStops.length})</p>}
          {deliveryStops.map((s,i)=><StopCard key={s.id} stop={s} index={i+1} isPickup={false} onUpdate={d=>updateStop.mutate({id:s.id,...d})} onRemove={()=>{if(confirm("Remove?"))removeStop.mutate(s.id);}} onMarkDone={()=>updateStop.mutate({id:s.id,status:"delivered",delivered_at:new Date().toISOString()})} navigate={navigate}/>)}
          <button onClick={()=>setShowAddStop(true)} className="w-full text-center rounded-xl py-3 text-[13px] font-medium" style={{border:"1.5px dashed #D4D4D0",color:"#717182"}}><Plus size={14} className="inline mr-1"/>Add stop</button>
          <div className="rounded-xl p-3 flex items-center gap-2" style={{backgroundColor:"rgba(14,38,70,0.06)",border:"0.5px solid rgba(14,38,70,0.15)"}}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{backgroundColor:"#0E2646",color:"#F3D12A"}}>E</div>
            <div><p className="text-[13px] font-medium" style={{color:"#0E2646"}}>End: {ll(activeRun.end_location)}</p>{activeRun.total_miles&&<p className="text-[11px]" style={{color:"#717182"}}>Total route: {activeRun.total_miles} miles</p>}</div>
          </div>
        </div>
        {showAddStop&&<AddStopModal runId={activeRun.id} readyOrders={readyOrders} cnt={stops.length} onAdd={d=>{addStop.mutate(d);setShowAddStop(false);}} onClose={()=>setShowAddStop(false)}/>}
      </div>
    );
  }

  // Runs list
  return (
    <div className="min-h-screen" style={{backgroundColor:"#F5F5F0"}}>
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Truck size={20} style={{color:"#0E2646"}}/><h1 className="text-[18px] font-bold" style={{color:"#0E2646"}}>Freight</h1></div>
          <div className="flex gap-2">
            <button onClick={()=>setShowCarriers(true)} className="text-[12px] px-3 py-1.5 rounded-full border" style={{borderColor:"#D4D4D0",color:"#717182"}}><User size={13} className="inline mr-1"/>Carriers</button>
            <button onClick={()=>setShowNewRun(true)} className="text-[12px] font-medium px-3 py-1.5 rounded-full" style={{backgroundColor:"#55BAAA",color:"#fff"}}><Plus size={13} className="inline mr-1"/>New run</button>
          </div>
        </div>
        <div className="flex gap-2 mb-3">{(["active","completed","all"] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className="text-[12px] px-3 py-1 rounded-full" style={filter===f?{backgroundColor:"#0E2646",color:"#F5F5F0"}:{backgroundColor:"#fff",color:"#717182",border:"0.5px solid #D4D4D0"}}>{f==="active"?"Active":f==="completed"?"Completed":"All"}</button>)}</div>
      </div>
      <div className="px-4 space-y-2 pb-24">
        {isLoading&&<p className="text-center text-[13px]" style={{color:"#717182"}}>Loading...</p>}
        {!isLoading&&filteredRuns.length===0&&<div className="text-center py-12"><Truck size={32} style={{color:"#D4D4D0"}} className="mx-auto mb-3"/><p className="text-[14px]" style={{color:"#717182"}}>No freight runs yet</p><p className="text-[12px]" style={{color:"#B4B2A9"}}>Tap "New run" to plan a trip</p></div>}
        {filteredRuns.map(run=>{const sc=SC[run.status]||SC.planning;const rc=stopCounts[run.id];const tot=(rc?.p||0)+(rc?.d||0);return(
          <button key={run.id} onClick={()=>setActiveRunId(run.id)} className="w-full text-left rounded-xl p-3" style={{backgroundColor:"#fff",border:"0.5px solid #D4D4D0"}}>
            <div className="flex items-center justify-between mb-1"><span className="text-[14px] font-medium" style={{color:"#0E2646"}}>{run.name||"Freight run"}</span><span className="text-[11px] px-2 py-0.5 rounded-full" style={{backgroundColor:sc.bg,color:sc.text}}>{sc.label}</span></div>
            <div className="flex gap-3 text-[12px] flex-wrap" style={{color:"#717182"}}><span>{fd(run.pickup_date)}</span><span>{run.carriers?.name||run.driver_name||"No carrier"}</span><span>{tot} stop{tot!==1?"s":""}</span>{run.total_miles&&<span>{run.total_miles} mi</span>}{ls(run.start_location)!==ls(run.end_location)&&<span>{ls(run.start_location)} → {ls(run.end_location)}</span>}</div>
          </button>);})}
      </div>
      {showNewRun&&<NewRunModal carriers={carriers} onCreate={d=>createRun.mutate(d)} onClose={()=>setShowNewRun(false)}/>}
      {showCarriers&&<CarriersModal carriers={carriers} onAdd={d=>createCarrier.mutate(d)} onDelete={id=>deleteCarrier.mutate(id)} onClose={()=>setShowCarriers(false)}/>}
    </div>
  );
}

function StopCard({stop,index,isPickup,onUpdate,onRemove,onMarkDone,navigate}:{stop:FreightStop;index:number;isPickup:boolean;onUpdate:(d:any)=>void;onRemove:()=>void;onMarkDone:()=>void;navigate:(p:string)=>void}) {
  const [exp,setExp]=useState(false);
  const [edit,setEdit]=useState(false);
  const [ef,setEf]=useState({addr:stop.delivery_address||"",city:stop.delivery_city||"",state:stop.delivery_state||"",zip:stop.delivery_zip||"",phone:stop.delivery_phone||"",instr:stop.delivery_instructions||"",unload:stop.unloading_equipment||"",notes:stop.notes||""});
  const done=stop.status==="delivered";
  const name=stop.customer_name||stop.orders?.contract_name||stop.orders?.moly_contract_number||(isPickup?"Pickup":`Stop ${index}`);
  const eq=stop.orders?.build_shorthand?.split(",")[0]||stop.orders?.base_model||"";
  const city=stop.delivery_city?`${stop.delivery_city}, ${stop.delivery_state||""}`:"";
  const full=[stop.delivery_address,stop.delivery_city,stop.delivery_state,stop.delivery_zip].filter(Boolean).join(", ");
  const badge=isPickup?{backgroundColor:"#55BAAA",color:"#fff"}:done?{backgroundColor:"#EAF3DE",color:"#27500A"}:{backgroundColor:"#F3D12A",color:"#0E2646"};

  return (
    <div className="rounded-xl overflow-hidden" style={{backgroundColor:"#fff",border:"0.5px solid #D4D4D0",opacity:done?0.6:1}}>
      <button onClick={()=>setExp(!exp)} className="w-full text-left p-3">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0 mt-0.5" style={badge}>{done?<Check size={12}/>:isPickup?"P":index}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between"><span className="text-[13px] font-medium truncate" style={{color:"#0E2646"}}>{name}</span>{exp?<ChevronUp size={14} style={{color:"#717182"}}/>:<ChevronDown size={14} style={{color:"#717182"}}/>}</div>
            <p className="text-[12px] truncate" style={{color:"#717182"}}>{isPickup?"Pickup":""}{isPickup&&city?" · ":""}{city}{eq?(city?" · ":"")+eq:""}</p>
          </div>
        </div>
      </button>
      {exp&&<div className="px-3 pb-3 border-t" style={{borderColor:"#F0F0EC"}}>
        {edit?<div className="space-y-2 mt-2">
          <input value={ef.addr} onChange={e=>setEf(p=>({...p,addr:e.target.value}))} placeholder="Address" className="w-full text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/>
          <div className="grid grid-cols-3 gap-2"><input value={ef.city} onChange={e=>setEf(p=>({...p,city:e.target.value}))} placeholder="City" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/><input value={ef.state} onChange={e=>setEf(p=>({...p,state:e.target.value}))} placeholder="State" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/><input value={ef.zip} onChange={e=>setEf(p=>({...p,zip:e.target.value}))} placeholder="Zip" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/></div>
          <div className="grid grid-cols-2 gap-2"><input value={ef.phone} onChange={e=>setEf(p=>({...p,phone:e.target.value}))} placeholder="Phone" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/><select value={ef.unload} onChange={e=>setEf(p=>({...p,unload:e.target.value}))} className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}>{UO.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <textarea value={ef.instr} onChange={e=>setEf(p=>({...p,instr:e.target.value}))} placeholder="Instructions" rows={2} className="w-full text-[12px] rounded-lg px-2 py-1.5 resize-none" style={{border:"0.5px solid #D4D4D0"}}/>
          <div className="flex gap-2"><button onClick={()=>{onUpdate({delivery_address:ef.addr||null,delivery_city:ef.city||null,delivery_state:ef.state||null,delivery_zip:ef.zip||null,delivery_phone:ef.phone||null,delivery_instructions:ef.instr||null,unloading_equipment:ef.unload||null,notes:ef.notes||null});setEdit(false);toast.success("Updated");}} className="flex-1 text-[12px] font-medium py-1.5 rounded-lg" style={{backgroundColor:"#55BAAA",color:"#fff"}}>Save</button><button onClick={()=>setEdit(false)} className="text-[12px] py-1.5 px-3 rounded-lg" style={{border:"0.5px solid #D4D4D0",color:"#717182"}}>Cancel</button></div>
        </div>:<div className="mt-2 space-y-1.5">
          {full&&<div className="rounded-lg p-2" style={{backgroundColor:"#F5F5F0"}}>
            {full&&<div className="flex items-start gap-1.5 mb-1"><MapPin size={12} className="mt-0.5 flex-shrink-0" style={{color:"#717182"}}/><span className="text-[12px]" style={{color:"#1A1A1A"}}>{full}</span></div>}
            {stop.delivery_phone&&<div className="flex items-center gap-1.5 mb-1"><Phone size={12} style={{color:"#717182"}}/><a href={`tel:${stop.delivery_phone}`} className="text-[12px]" style={{color:"#55BAAA"}}>{stop.delivery_phone}</a></div>}
            {stop.delivery_instructions&&<p className="text-[11px]" style={{color:"#717182"}}>{stop.delivery_instructions}</p>}
            {stop.unloading_equipment&&<p className="text-[11px] mt-0.5" style={{color:"#717182"}}>Unloading: {UO.find(o=>o.value===stop.unloading_equipment)?.label||stop.unloading_equipment}</p>}
          </div>}
          <div className="flex gap-2 pt-1 flex-wrap">
            {stop.order_id&&<button onClick={()=>navigate(`/orders/${stop.order_id}`)} className="text-[11px] px-2.5 py-1 rounded-full" style={{border:"0.5px solid #D4D4D0",color:"#717182"}}><Package size={11} className="inline mr-0.5"/>Order</button>}
            <button onClick={()=>setEdit(true)} className="text-[11px] px-2.5 py-1 rounded-full" style={{border:"0.5px solid #D4D4D0",color:"#717182"}}><Edit2 size={11} className="inline mr-0.5"/>Edit</button>
            {!done&&<button onClick={onMarkDone} className="text-[11px] px-2.5 py-1 rounded-full" style={{backgroundColor:"rgba(85,186,170,0.1)",color:"#55BAAA"}}><Check size={11} className="inline mr-0.5"/>{isPickup?"Picked up":"Delivered"}</button>}
            <button onClick={onRemove} className="text-[11px] px-2.5 py-1 rounded-full" style={{backgroundColor:"rgba(220,50,50,0.08)",color:"#E24B4A"}}><Trash2 size={11}/></button>
          </div>
        </div>}
      </div>}
    </div>
  );
}

function AddStopModal({runId,readyOrders,cnt,onAdd,onClose}:{runId:string;readyOrders:ReadyOrder[];cnt:number;onAdd:(d:any)=>void;onClose:()=>void}) {
  const [st,setSt]=useState<"pickup"|"delivery">("delivery");
  const [sel,setSel]=useState<ReadyOrder|null>(null);
  const [mfg,setMfg]=useState("lorraine_ks");
  const [pc,setPc]=useState({city:"",state:""});
  const [addr,setAddr]=useState("");const[city,setCity]=useState("");const[state,setState]=useState("");const[zip,setZip]=useState("");
  const [phone,setPhone]=useState("");const[instr,setInstr]=useState("");const[unload,setUnload]=useState("");const[custom,setCustom]=useState("");

  const pick=(o:ReadyOrder)=>{setSel(o);const c=o.customers;setAddr(c?.address_line1||"");setCity(c?.address_city||"");setState(c?.address_state||"");setZip(c?.address_zip||"");setPhone(c?.phone||"");setInstr(o.delivery_instructions||"");};
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{backgroundColor:"#fff"}}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{borderColor:"#F0F0EC",backgroundColor:"#fff",zIndex:1}}><h3 className="text-[15px] font-medium" style={{color:"#0E2646"}}>Add stop</h3><button onClick={onClose}><X size={18} style={{color:"#717182"}}/></button></div>
        <div className="p-4">
          <div className="flex gap-2 mb-4">{(["pickup","delivery"] as const).map(t=><button key={t} onClick={()=>{setSt(t);setSel(null);}} className="flex-1 text-[13px] font-medium py-2 rounded-lg" style={st===t?{backgroundColor:"#0E2646",color:"#F5F5F0"}:{border:"0.5px solid #D4D4D0",color:"#717182"}}>{t==="pickup"?"Manufacturer pickup":"Customer delivery"}</button>)}</div>

          {st==="pickup"&&<>
            <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{color:"#717182"}}>Pickup at</p>
            <LocSel value={mfg} onChange={setMfg}/>
            {mfg==="custom"&&<div className="grid grid-cols-2 gap-2 mt-2"><input value={pc.city} onChange={e=>setPc(p=>({...p,city:e.target.value}))} placeholder="City" className="text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/><input value={pc.state} onChange={e=>setPc(p=>({...p,state:e.target.value}))} placeholder="State" className="text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/></div>}
            <button onClick={()=>{const l=KL[mfg];onAdd({freight_run_id:runId,stop_order:cnt+1,stop_type:"pickup",customer_name:l?.label||pc.city||"Pickup",delivery_city:mfg==="custom"?pc.city:l?.city,delivery_state:mfg==="custom"?pc.state:l?.state});}} className="w-full mt-3 text-[14px] font-medium py-3 rounded-xl" style={{backgroundColor:"#55BAAA",color:"#fff"}}>Add pickup stop</button>
          </>}

          {st==="delivery"&&!sel&&<>
            {/* Quick option: deliver to CATL yard */}
            <button onClick={()=>onAdd({freight_run_id:runId,stop_order:cnt+1,stop_type:"delivery",customer_name:"CATL Resources — Wall, SD",delivery_city:"Wall",delivery_state:"SD",delivery_instructions:"Deliver to CATL yard"})}
              className="w-full text-left p-3 rounded-xl mb-3 active:scale-[0.99] transition-transform" style={{backgroundColor:"rgba(14,38,70,0.06)",border:"1.5px solid rgba(14,38,70,0.15)"}}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{backgroundColor:"#0E2646",color:"#F3D12A"}}>C</div>
                <div><p className="text-[13px] font-medium" style={{color:"#0E2646"}}>Deliver to CATL — Wall, SD</p><p className="text-[11px]" style={{color:"#717182"}}>Bring to our yard (will ship to customer later)</p></div>
              </div>
            </button>

            <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{color:"#717182"}}>Or deliver to customer ({readyOrders.length} ready)</p>
            {readyOrders.length===0&&<p className="text-[12px] py-4 text-center" style={{color:"#B4B2A9"}}>No orders with "ready" status. Mark equipment as ready first.</p>}
            <div className="space-y-1 mb-4">{readyOrders.map(o=><button key={o.id} onClick={()=>pick(o)} className="w-full text-left p-2.5 rounded-lg" style={{border:"0.5px solid #D4D4D0"}}><span className="text-[13px] font-medium" style={{color:"#0E2646"}}>{o.moly_contract_number||"—"} — {o.contract_name||"Unnamed"}</span><p className="text-[11px]" style={{color:"#717182"}}>{o.build_shorthand?.split(",")[0]||o.base_model||""}{o.customers?.name?` · ${o.customers.name}`:" · Inventory"}</p></button>)}</div>
            <div className="border-t pt-3" style={{borderColor:"#F0F0EC"}}><p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{color:"#717182"}}>Or custom stop</p><input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Stop name" className="w-full text-[12px] rounded-lg px-3 py-2 mb-2" style={{border:"0.5px solid #D4D4D0"}}/>{custom&&<button onClick={()=>setSel({id:"",moly_contract_number:null,contract_name:custom,base_model:null,build_shorthand:null,customer_id:null,delivery_instructions:null,status:""} as any)} className="text-[12px] font-medium px-4 py-1.5 rounded-full" style={{backgroundColor:"#55BAAA",color:"#fff"}}>Continue</button>}</div>
          </>}

          {st==="delivery"&&sel&&<>
            <button onClick={()=>setSel(null)} className="flex items-center gap-1 text-[12px] mb-3" style={{color:"#55BAAA"}}><ArrowLeft size={13}/> Back</button>
            <div className="rounded-lg p-2.5 mb-3" style={{backgroundColor:"#F5F5F0"}}><p className="text-[13px] font-medium" style={{color:"#0E2646"}}>{sel.moly_contract_number||"Custom"} — {sel.contract_name||custom}</p><p className="text-[11px]" style={{color:"#717182"}}>{sel.build_shorthand?.split(",")[0]||sel.base_model||""}</p></div>
            <div className="space-y-2">
              <div><label className="text-[11px]" style={{color:"#717182"}}>Address</label><input value={addr} onChange={e=>setAddr(e.target.value)} placeholder="1234 Ranch Rd" className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}/></div>
              <div className="grid grid-cols-3 gap-2"><div><label className="text-[11px]" style={{color:"#717182"}}>City</label><input value={city} onChange={e=>setCity(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}/></div><div><label className="text-[11px]" style={{color:"#717182"}}>State</label><input value={state} onChange={e=>setState(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}/></div><div><label className="text-[11px]" style={{color:"#717182"}}>Zip</label><input value={zip} onChange={e=>setZip(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}/></div></div>
              <div className="grid grid-cols-2 gap-2"><div><label className="text-[11px]" style={{color:"#717182"}}>Phone</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(605) 555-1234" className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}/></div><div><label className="text-[11px]" style={{color:"#717182"}}>Unloading</label><select value={unload} onChange={e=>setUnload(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}>{UO.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div></div>
              <div><label className="text-[11px]" style={{color:"#717182"}}>Delivery instructions</label><textarea value={instr} onChange={e=>setInstr(e.target.value)} placeholder="Where to drop, gate codes, call before..." rows={3} className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5 resize-none" style={{border:"0.5px solid #D4D4D0"}}/></div>
            </div>
            <button onClick={()=>onAdd({freight_run_id:runId,order_id:sel.id||null,stop_order:cnt+1,stop_type:"delivery",customer_name:sel.customers?.name||custom||null,delivery_address:addr||null,delivery_city:city||null,delivery_state:state||null,delivery_zip:zip||null,delivery_phone:phone||null,delivery_instructions:instr||null,unloading_equipment:unload||null})} className="w-full mt-4 text-[14px] font-medium py-3 rounded-xl" style={{backgroundColor:"#55BAAA",color:"#fff"}}>Add delivery stop</button>
          </>}
        </div>
      </div>
    </div>
  );
}

function NewRunModal({carriers,onCreate,onClose}:{carriers:Carrier[];onCreate:(d:any)=>void;onClose:()=>void}) {
  const [name,setName]=useState("");const[sl,setSl]=useState("catl_wall_sd");const[el,setEl]=useState("catl_wall_sd");
  const [sc,setSc]=useState({city:"",state:""});const[ec,setEc]=useState({city:"",state:""});
  const [cid,setCid]=useState("");const[drv,setDrv]=useState("");const[dt,setDt]=useState("");const[mi,setMi]=useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{backgroundColor:"#fff"}}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{borderColor:"#F0F0EC",backgroundColor:"#fff"}}><h3 className="text-[15px] font-medium" style={{color:"#0E2646"}}>New freight run</h3><button onClick={onClose}><X size={18} style={{color:"#717182"}}/></button></div>
        <div className="p-4 space-y-3">
          <div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Run name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Wall → Lorraine → NE deliveries → Wall" className="w-full text-[13px] rounded-lg px-3 py-2 mt-0.5" style={{border:"0.5px solid #D4D4D0"}}/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Starting from</label><LocSel value={sl} onChange={setSl}/>{sl==="custom"&&<div className="grid grid-cols-2 gap-1 mt-1"><input value={sc.city} onChange={e=>setSc(p=>({...p,city:e.target.value}))} placeholder="City" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/><input value={sc.state} onChange={e=>setSc(p=>({...p,state:e.target.value}))} placeholder="State" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/></div>}</div>
            <div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Ending at</label><LocSel value={el} onChange={setEl}/>{el==="custom"&&<div className="grid grid-cols-2 gap-1 mt-1"><input value={ec.city} onChange={e=>setEc(p=>({...p,city:e.target.value}))} placeholder="City" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/><input value={ec.state} onChange={e=>setEc(p=>({...p,state:e.target.value}))} placeholder="State" className="text-[12px] rounded-lg px-2 py-1.5" style={{border:"0.5px solid #D4D4D0"}}/></div>}</div>
          </div>
          <div className="grid grid-cols-2 gap-2"><div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Carrier / vehicle</label><CarSel value={cid} onChange={setCid} carriers={carriers}/></div><div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Driver</label><input value={drv} onChange={e=>setDrv(e.target.value)} placeholder="Who's driving" className="w-full text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/></div></div>
          <div className="grid grid-cols-2 gap-2"><div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Pickup date</label><input type="date" value={dt} onChange={e=>setDt(e.target.value)} className="w-full text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/></div><div><label className="text-[11px] font-medium" style={{color:"#717182"}}>Total miles (est.)</label><input value={mi} onChange={e=>setMi(e.target.value)} placeholder="850" className="w-full text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/></div></div>
          <button onClick={()=>{const si=KL[sl],ei=KL[el];onCreate({name:name||null,pickup_location:sl==="catl_wall_sd"?"custom":sl,start_location:sl,start_city:sl==="custom"?sc.city||null:si?.city,start_state:sl==="custom"?sc.state||null:si?.state,end_location:el,end_city:el==="custom"?ec.city||null:ei?.city,end_state:el==="custom"?ec.state||null:ei?.state,total_miles:mi?parseFloat(mi):null,carrier_id:cid||null,driver_name:drv||null,pickup_date:dt||null});}} className="w-full text-[14px] font-medium py-3 rounded-xl" style={{backgroundColor:"#55BAAA",color:"#fff"}}>Create run</button>
        </div>
      </div>
    </div>
  );
}

function CarriersModal({carriers,onAdd,onDelete,onClose}:{carriers:Carrier[];onAdd:(d:any)=>void;onDelete:(id:string)=>void;onClose:()=>void}) {
  const [n,setN]=useState("");const[t,setT]=useState<CarrierType>("external_trucker");const[p,setP]=useState("");const[em,setEm]=useState("");const[v,setV]=useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{backgroundColor:"#fff"}}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{borderColor:"#F0F0EC",backgroundColor:"#fff"}}><h3 className="text-[15px] font-medium" style={{color:"#0E2646"}}>Carriers & vehicles</h3><button onClick={onClose}><X size={18} style={{color:"#717182"}}/></button></div>
        <div className="p-4">
          <div className="space-y-2 mb-4">{carriers.map(c=><div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{border:"0.5px solid #D4D4D0"}}><div><div className="flex items-center gap-2"><span className="text-[13px] font-medium" style={{color:"#0E2646"}}>{c.name}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full" style={c.type==="catl_vehicle"?{backgroundColor:"#E1F5EE",color:"#085041"}:{backgroundColor:"#E6F1FB",color:"#0C447C"}}>{c.type==="catl_vehicle"?"CATL":"Trucker"}</span></div><p className="text-[11px]" style={{color:"#717182"}}>{[c.phone,c.email,c.vehicle_description].filter(Boolean).join(" · ")||"No details"}</p></div><button onClick={()=>{if(confirm(`Remove ${c.name}?`))onDelete(c.id);}} className="p-1" style={{color:"#E24B4A"}}><Trash2 size={14}/></button></div>)}</div>
          <div className="border-t pt-3" style={{borderColor:"#F0F0EC"}}>
            <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{color:"#717182"}}>Add carrier or vehicle</p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2"><input value={n} onChange={e=>setN(e.target.value)} placeholder="Name" className="text-[13px] rounded-lg px-3 py-2" style={{border:"0.5px solid #D4D4D0"}}/><select value={t} onChange={e=>setT(e.target.value as CarrierType)} className="text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}><option value="external_trucker">Trucker</option><option value="catl_vehicle">CATL Vehicle</option></select></div>
              <div className="grid grid-cols-2 gap-2"><input value={p} onChange={e=>setP(e.target.value)} placeholder="Phone" className="text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/><input value={em} onChange={e=>setEm(e.target.value)} placeholder="Email" className="text-[13px] rounded-lg px-2 py-2" style={{border:"0.5px solid #D4D4D0"}}/></div>
              <input value={v} onChange={e=>setV(e.target.value)} placeholder="Vehicle description (e.g. White F-350 + 40ft gooseneck)" className="w-full text-[13px] rounded-lg px-3 py-2" style={{border:"0.5px solid #D4D4D0"}}/>
              <button onClick={()=>{if(!n.trim())return toast.error("Name required");onAdd({name:n.trim(),type:t,phone:p||null,email:em||null,vehicle_description:v||null});setN("");setP("");setEm("");setV("");}} className="w-full text-[13px] font-medium py-2 rounded-lg" style={{backgroundColor:"#55BAAA",color:"#fff"}}>Add carrier</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintSheet({run,stops,onBack}:{run:FreightRun;stops:FreightStop[];onBack:()=>void}) {
  const pickups=stops.filter(s=>s.stop_type==="pickup"),deliveries=stops.filter(s=>s.stop_type==="delivery");
  return (
    <div style={{minHeight:"100vh",backgroundColor:"#fff",fontFamily:"Inter, system-ui, sans-serif"}}>
      <div className="print:hidden" style={{backgroundColor:"#0E2646",padding:"10px 16px",display:"flex",justifyContent:"space-between"}}>
        <button onClick={onBack} style={{color:"rgba(245,245,240,0.7)",fontSize:13,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><ArrowLeft size={16}/> Back</button>
        <button onClick={()=>window.print()} style={{color:"#F3D12A",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><Printer size={16}/> Print</button>
      </div>
      <div style={{maxWidth:700,margin:"0 auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"2px solid #0E2646",paddingBottom:16,marginBottom:20}}>
          <div><p style={{fontSize:11,fontWeight:800,letterSpacing:"0.08em",color:"#0E2646",margin:0}}>CATL RESOURCES</p><h1 style={{fontSize:20,fontWeight:700,color:"#0E2646",margin:"4px 0 0"}}>{run.name||"Freight Run"}</h1></div>
          <div style={{textAlign:"right",fontSize:13,color:"#717182"}}>
            <p style={{margin:0}}><strong>Date:</strong> {run.pickup_date?format(new Date(run.pickup_date+"T12:00:00"),"EEEE, MMM d, yyyy"):"TBD"}</p>
            {run.carriers?.name&&<p style={{margin:"2px 0 0"}}><strong>Carrier:</strong> {run.carriers.name}</p>}
            {run.driver_name&&<p style={{margin:"2px 0 0"}}><strong>Driver:</strong> {run.driver_name}</p>}
            {run.carriers?.phone&&<p style={{margin:"2px 0 0"}}><strong>Ph:</strong> {run.carriers.phone}</p>}
            {run.total_miles&&<p style={{margin:"2px 0 0"}}><strong>Route:</strong> {run.total_miles} miles</p>}
          </div>
        </div>
        <div style={{backgroundColor:"#F5F5F0",borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:13}}>
          <strong>Route:</strong> {ls(run.start_location,run.start_city,run.start_state)}
          {pickups.map(s=>` → ${s.customer_name||s.delivery_city||"Pickup"}`)}
          {deliveries.map(s=>` → ${s.customer_name||s.delivery_city||"Delivery"}`)}
          {` → ${ls(run.end_location,run.end_city,run.end_state)}`}
        </div>
        {deliveries.length>1&&<div style={{border:"1px solid #F59E0B",borderRadius:8,padding:"10px 14px",marginBottom:20,backgroundColor:"#FEFCE8"}}><p style={{fontSize:12,fontWeight:700,color:"#854F0B",margin:"0 0 4px"}}>LOADING ORDER (load first → last off):</p><p style={{fontSize:13,color:"#854F0B",margin:0}}>{[...deliveries].reverse().map((s,i)=>`${i+1}. ${s.customer_name||"Stop"}`).join("  →  ")}</p></div>}
        {pickups.length>0&&<><h2 style={{fontSize:14,fontWeight:700,color:"#0E2646",textTransform:"uppercase",letterSpacing:"0.05em",margin:"0 0 8px",borderBottom:"1px solid #D4D4D0",paddingBottom:4}}>Manufacturer Pickups</h2>{pickups.map((s,i)=><PStop key={s.id} stop={s} idx={i+1} isP/>)}</>}
        {deliveries.length>0&&<><h2 style={{fontSize:14,fontWeight:700,color:"#0E2646",textTransform:"uppercase",letterSpacing:"0.05em",margin:"20px 0 8px",borderBottom:"1px solid #D4D4D0",paddingBottom:4}}>Customer Deliveries</h2>{deliveries.map((s,i)=><PStop key={s.id} stop={s} idx={i+1} isP={false}/>)}</>}
        <div style={{borderTop:"2px solid #0E2646",marginTop:24,paddingTop:8,textAlign:"center",fontSize:11,color:"#B4B2A9"}}>CATL Resources · Freight Run Sheet · Generated {format(new Date(),"MMM d, yyyy h:mm a")}</div>
      </div>
      <style>{`@media print{.print\\:hidden{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
    </div>
  );
}

function PStop({stop,idx,isP}:{stop:FreightStop;idx:number;isP:boolean}) {
  const name=stop.customer_name||stop.orders?.contract_name||stop.orders?.moly_contract_number||`Stop ${idx}`;
  const eq=stop.orders?.build_shorthand?.split(",")[0]||stop.orders?.base_model||"";
  const full=[stop.delivery_address,stop.delivery_city,stop.delivery_state,stop.delivery_zip].filter(Boolean).join(", ");
  return (
    <div style={{border:"1px solid #D4D4D0",borderRadius:8,padding:"10px 14px",marginBottom:8,pageBreakInside:"avoid"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,backgroundColor:isP?"#55BAAA":"#F3D12A",color:isP?"#fff":"#0E2646"}}>{isP?"P":idx}</div>
        <div style={{flex:1}}><span style={{fontSize:14,fontWeight:600,color:"#0E2646"}}>{name}</span>{eq&&<span style={{fontSize:12,color:"#717182",marginLeft:8}}>{eq}</span>}</div>
      </div>
      <div style={{fontSize:13,color:"#1A1A1A",paddingLeft:32}}>
        {full&&<p style={{margin:"2px 0"}}>{full}</p>}
        {stop.delivery_phone&&<p style={{margin:"2px 0"}}>Ph: {stop.delivery_phone}</p>}
        {stop.delivery_instructions&&<p style={{margin:"4px 0 0",fontSize:12,color:"#717182",backgroundColor:"#F5F5F0",padding:"6px 10px",borderRadius:6}}>{stop.delivery_instructions}</p>}
        {stop.unloading_equipment&&<p style={{margin:"2px 0",fontSize:12,color:"#717182"}}>Unloading: <strong>{UO.find(o=>o.value===stop.unloading_equipment)?.label||stop.unloading_equipment}</strong></p>}
      </div>
    </div>
  );
}
