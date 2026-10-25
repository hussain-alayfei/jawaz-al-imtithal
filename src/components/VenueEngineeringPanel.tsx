import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileCode2, FileText, FolderOpen, Info, Layers3, LoaderCircle, MousePointer2, ShieldAlert, XCircle } from "lucide-react";
import { SERVICE_META, type ServiceKey } from "./EngineeringNetworks3D";
import { getVenueEngineeringElements, getVenueMetrics, VENUE_DISCIPLINES, type VenueBimElement } from "./VenueEngineeringData";
import type { VenueKind } from "./VenueScene3D";

type VenueManifest={version:string;kind:VenueKind;files:{id:string;name:string;label:string;desc:string;count:number;elements:VenueBimElement[]}[]};
export function VenueBimPanel({kind,onPick}:{kind:VenueKind;onPick:(item:VenueBimElement)=>void}){
 const [manifest,setManifest]=useState<VenueManifest|null>(null);
 const [active,setActive]=useState<string|null>(null);
 const [message,setMessage]=useState("");
 const [error,setError]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);
 const [system,setSystem]=useState<string>("all");
 useEffect(()=>{
  const controller=new AbortController();
  setManifest(null);setActive(null);setMessage("");setError(false);setSystem("all");
  fetch("/demo-bim/venues/"+kind+"/manifest.json",{signal:controller.signal}).then(r=>{
   if(!r.ok)throw Error("ملفات المنشأة غير متوفرة");return r.json();
  }).then((data:VenueManifest)=>{
   if(data.version!=="MIYAR-VENUES-1"||data.kind!==kind||data.files?.length!==4)
    throw Error("بيانات المكتبة غير متوافقة مع المنشأة");
   setManifest(data);
  }).catch(e=>{if(!controller.signal.aborted){setError(true);setMessage(String(e.message||e));}});
  return ()=>controller.abort();
 },[kind]);
 async function open(file:VenueManifest["files"][number]){
  setBusy(file.id);setMessage("");setError(false);
  try {
   const r=await fetch("/demo-bim/venues/"+kind+"/"+encodeURIComponent(file.name));
   if(!r.ok)throw Error("تعذر تحميل ملف IFC");
   const content=await r.text();
   if(!content.includes("FILE_SCHEMA(('IFC4'))")||!content.includes("Pset_MiyarDigitalTwinDemo"))throw Error("ليس ملف IFC4 التجريبي المطلوب");
   const missing=file.elements.find(x=>!content.includes("'"+x.sceneId+"'"));
   if(missing)throw Error("لم يُعثر على ربط العنصر "+missing.sceneId);
   setActive(file.id);setSystem("all");
   setMessage("قُرئ "+file.count+" عنصرًا دلاليًا من "+file.name+" وتم التحقق من معرفاتهم.");
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"تعذر فتح الملف");}
  finally{setBusy(null);}
 }
 const file=manifest?.files.find(x=>x.id===active);
 const listed=file?.elements.filter(x=>system==="all"||x.system===system)??[];
 const total=manifest?.files.reduce((n,f)=>n+f.count,0);
 return <section className="bim-library venue-bim" data-testid={"venue-bim-"+kind}>
  <div className="bim-library__intro">
   <div className="bim-library__title"><FolderOpen size={18}/><strong>ملفات {kind==="cafe"?"المقهى":"المطعم"} الهندسية</strong></div>
   <p>٤ ملفات IFC4 خاصة بهذه المنشأة، تحتوي بيانات معمارية وإنشائية وتمديدات وحريق لطابق واحد.</p>
   <span className="bim-library__demo"><Info size={13}/> بيانات دلالية تجريبية؛ ليست مخططات مصدقة ولا هندسة IFC مستوردة.</span>
  </div>
  <div className="venue-bim__metric"><strong>{total??"—"}</strong><span>عنصر تجريبي مرتبط بمشهد {kind==="cafe"?"المقهى":"المطعم"}</span></div>
  {!manifest&&!error&&<p className="bim-library__loading"><LoaderCircle size={14}/> فتح ملفات التجربة…</p>}
  <div className="bim-library__files">
   {manifest?.files.map(f=>{
    const def=VENUE_DISCIPLINES.find(d=>d.id===f.id);
    return <article className={"bim-library__file"+(active===f.id?" is-loaded":"")} key={f.id} data-file={f.name}>
     <div className="bim-library__file-head">
      <span className="bim-library__file-icon" style={{borderColor:def?.color,color:def?.color}}><FileCode2 size={18}/></span>
      <span><strong dir="ltr">{f.name}</strong><small>{f.label}</small></span><b>{f.count}</b>
     </div>
     <p>{f.desc}</p>
     <div className="bim-library__file-actions">
      <button type="button" disabled={busy!==null} onClick={()=>void open(f)}>
       {busy===f.id?<LoaderCircle size={13}/>:active===f.id?<CheckCircle2 size={13}/>:<Layers3 size={13}/>}
       {active===f.id?"العناصر معروضة":"فتح العناصر"}
      </button>
      <a href={"/demo-bim/venues/"+kind+"/"+encodeURIComponent(f.name)} download={f.name}><Download size={13}/> تنزيل</a>
     </div>
    </article>;
   })}
  </div>
  <article className="bim-library__file" data-file="FurnitureDemo.gltf">
    <div className="bim-library__file-head"><span className="bim-library__file-icon"><FileCode2 size={17}/></span>
      <span><strong dir="ltr">FurnitureDemo.gltf</strong><small>ملف أثاث هندسي اختياري</small></span><b>3D</b></div>
    <p>قطعة أثاث نموذجية مستقلة بصيغة glTF، ليست المصدر الفعلي لمجسمات المنشأة المعروضة.</p>
    <div className="bim-library__file-actions"><a href={"/demo-bim/venues/"+kind+"/FurnitureDemo.gltf"} download="FurnitureDemo.gltf">
      <Download size={13}/> تنزيل نموذج الأثاث
    </a></div>
  </article>
  {message&&<p role="status" className={"bim-library__status"+(error?" is-error":"")}>
   {error?<XCircle size={14}/>:<CheckCircle2 size={14}/>} {message}
  </p>}
  {file&&<div className="bim-library__content" data-testid="venue-bim-elements">
   <header><span><FileText size={14}/> عناصر {file.name}</span><b>{listed.length} عنصر</b></header>
   {file.id==="mep"&&<label>فلترة عناصر التمديدات
    <select aria-label="فلتر نظام عناصر الملف" value={system} onChange={e=>setSystem(e.target.value)}>
     <option value="all">كل أنظمة الملف</option>
     {getVenueMetrics(kind).bySystem.filter(x=>x.system!=="fire").map(x=>
      <option key={x.system} value={x.system}>{x.label}</option>)}
    </select></label>}
   <div className="bim-library__elements">
    {listed.map(item=><button type="button" key={item.id} data-scene-id={item.sceneId}
      onClick={()=>onPick(item)}>
      <MousePointer2 size={13}/><span><strong>{item.label}</strong>
        <small>{item.type} · {item.system?SERVICE_META[item.system].label:"الدور الأرضي"}</small>
      </span></button>)}
   </div>
   <small className="bim-library__footnote">اختيار العنصر يُظهر عنصره الإجرائي المقابل في المشهد ويركز عليه. لا يُنشئ هندسة من IFC.</small>
  </div>}
 </section>;
}
export function VenueAnalysisPanel({kind,onSystem,onPick}:{
 kind:VenueKind;onSystem:(system:ServiceKey)=>void;onPick:(item:VenueBimElement)=>void;
}){
 const metrics=getVenueMetrics(kind),elements=getVenueEngineeringElements(kind);
 const [focused,setFocused]=useState<ServiceKey|null>(null);
 useEffect(()=>setFocused(null),[kind]);
 return <section className="venue-analysis" data-testid={"venue-analysis-"+kind}>
  <div className="venue-analysis__heading"><ShieldAlert size={18}/>
   <div><strong>قراءة هندسية تجريبية</strong><span>معلومات مبدئية من عناصر النموذج، بدون أحمال أو حسابات امتثال.</span></div>
  </div>
  <div className="venue-analysis__stats">
   <div><strong>{metrics.total}</strong><span>عنصر مفهرس</span></div>
   <div><strong>{metrics.areas}</strong><span>مناطق تشغيل</span></div>
   <div><strong>{metrics.structural}</strong><span>عناصر إنشائية</span></div>
   <div><strong>{metrics.networkPoints}</strong><span>نقاط تمديدات</span></div>
  </div>
  <h3>تحليل الأنظمة وتفاصيل المراجعة</h3>
  <div className="venue-analysis__systems">
   {metrics.bySystem.map(x=><article key={x.system} className={focused===x.system?"is-active":""}>
    <button type="button" onClick={()=>{setFocused(focused===x.system?null:x.system);onSystem(x.system);}}>
     <span className="venue-analysis__color" style={{background:SERVICE_META[x.system].color}}/>
     <strong>{x.title}</strong><b>{x.count} نقاط</b>
    </button>
    <p>{x.spec}</p>
    <div className="venue-analysis__review"><ShieldAlert size={13}/>{x.risk}</div>
    {focused===x.system&&<div className="venue-analysis__points">
     {elements.filter(e=>e.system===x.system).map(point=><button key={point.sceneId} type="button"
       onClick={()=>onPick(point)}><MousePointer2 size={12}/>{point.label}</button>)}
    </div>}
   </article>)}
  </div>
  <div className="venue-analysis__limit">
   <strong>حدود التحليل</strong>
   <p>الأعداد تعكس اكتمال فهرسة عناصر العرض فقط، وليست نسبة سلامة أو مطابقة. مطلوب نموذج IFC هندسي حقيقي وحسابات وفحوص مختصين قبل أي قرار ترخيص.</p>
  </div>
 </section>;
}
