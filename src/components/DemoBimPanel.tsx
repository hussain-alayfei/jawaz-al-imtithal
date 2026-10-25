import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileCode2, FileText, FolderOpen, Info, Layers3, LoaderCircle, MousePointer2, XCircle } from "lucide-react";
type Kind="architecture"|"mep"|"fire";
export interface DemoFileElement {
 id:string;sceneId:string;label:string;type:string;floor:number;position:[number,number,number];description:string;system?:string;
}
interface DemoFile {
 id:string;name:string;label:string;desc:string;group:Kind;count:number;color:string;elements:DemoFileElement[];
}
type Manifest={version:string;disclaimer:string;files:DemoFile[]};
export function DemoBimPanel({onPick}:{onPick:(element:DemoFileElement)=>void}){
 const [manifest,setManifest]=useState<Manifest|null>(null);
 const [message,setMessage]=useState("");
 const [active,setActive]=useState<string|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [floor,setFloor]=useState("all");
 const [error,setError]=useState(false);
 useEffect(()=>{
   const controller=new AbortController();
   fetch("/demo-bim/manifest.json",{signal:controller.signal}).then(r=>{
     if(!r.ok)throw Error("تعذر قراءة فهرس ملفات BIM");
     return r.json();
   }).then((data:Manifest)=>{
     if(data.version!=="MIYAR-DEMO-BIM-2"||data.files?.length!==4)throw Error("فهرس ملفات BIM غير متوافق");
     setManifest(data);
   }).catch(e=>{if(!controller.signal.aborted){setMessage(String(e.message||e));setError(true);}});
   return ()=>controller.abort();
 },[]);
 async function load(file:DemoFile){
  setBusy(file.id);setMessage("");setError(false);
  try{
   const response=await fetch("/demo-bim/"+encodeURIComponent(file.name));
   if(!response.ok)throw Error("ملف IFC غير موجود على الخادم");
   const value=await response.text();
   if(!value.includes("FILE_SCHEMA(('IFC4'))")||!value.includes("Pset_MiyarDigitalTwinDemo"))
    throw Error("ملف IFC لا يحتوي بيانات التجربة المتوقعة");
   for(const element of file.elements){
    if(!value.includes("'"+element.sceneId+"'"))
      throw Error("الملف ينقصه عنصر مطلوب: "+element.sceneId);
   }
   setActive(file.id);setFloor("all");
   setMessage("تمت قراءة "+file.count+" عنصرًا من "+file.name+" وربط معرفاتها بعناصر المجسم التجريبي.");
   if(file.elements[0])onPick(file.elements[0]);
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:"تعذرت قراءة الملف");}
  finally{setBusy(null);}
 }
 const file=manifest?.files.find(x=>x.id===active);
 const listed=file?.elements.filter(x=>floor==="all"||x.floor===Number(floor))||[];
 return <section className="bim-library" data-testid="bim-demo-library" aria-label="ملفات BIM النموذجية">
   <div className="bim-library__intro">
     <div className="bim-library__title"><FolderOpen size={18}/><strong>ملفات BIM الجاهزة</strong></div>
     <p>٤ ملفات IFC4 مملوءة ببيانات توضيحية لخمس طوابق. اختر ملفًا لاستعراض عناصره داخل التوأم الرقمي.</p>
     <span className="bim-library__demo"><Info size={13}/> تجربة دلالية اصطناعية؛ المجسم مولّد بالكود وليس من هندسة IFC</span>
   </div>
   {!manifest && !error && <div className="bim-library__loading"><LoaderCircle size={15}/> فتح الفهرس…</div>}
   <div className="bim-library__files">
    {manifest?.files.map(f=><article className={"bim-library__file"+(active===f.id?" is-loaded":"")} key={f.id} data-file={f.name}>
      <div className="bim-library__file-head">
       <span className="bim-library__file-icon" style={{borderColor:f.color,color:f.color}}><FileCode2 size={18}/></span>
       <span><strong dir="ltr">{f.name}</strong><small>{f.label}</small></span>
       <b>{f.count}</b>
      </div>
      <p>{f.desc}</p>
      <div className="bim-library__file-actions">
       <button type="button" onClick={()=>void load(f)} disabled={busy!==null} aria-label={"عرض "+f.name+" في المشهد"}>
        {busy===f.id?<LoaderCircle size={13}/>:active===f.id?<CheckCircle2 size={13}/>:<Layers3 size={13}/>}
        {active===f.id?"معروض الآن":"عرض في 3D"}
       </button>
       <a download={f.name} href={"/demo-bim/"+encodeURIComponent(f.name)}>
        <Download size={13}/> تنزيل
       </a>
      </div>
    </article>)}
   </div>
   <article className="bim-library__file bim-library__asset" data-file="FurnitureDemo.gltf">
     <div className="bim-library__file-head">
       <span className="bim-library__file-icon" style={{borderColor:"#97d1a9",color:"#97d1a9"}}><FileCode2 size={18}/></span>
       <span><strong dir="ltr">FurnitureDemo.gltf</strong><small>أثاث ثلاثي الأبعاد (اختياري)</small></span>
       <b>3D</b>
     </div>
     <p>ملف glTF حقيقي يحتوي مجسم خزانة مستقل، ويظهر داخل مشهد الدور الأرضي.</p>
     <div className="bim-library__file-actions">
      <button type="button" onClick={()=>onPick({id:"GLTF-1",sceneId:"DEMO-GLTF-CABINET",label:"خزانة أثاث من glTF",
        type:"glTF mesh",floor:0,position:[5.85,.95,-4.85],description:"قطعة أثاث تجريبية محملة من ملف glTF داخل المشروع"})}>
        <Layers3 size={13}/> تحديد في 3D
      </button>
      <a href="/demo-bim/FurnitureDemo.gltf" download="FurnitureDemo.gltf"><Download size={13}/> تنزيل</a>
     </div>
   </article>
   {message && <p role="status" className={"bim-library__status"+(error?" is-error":"")}>
    {error?<XCircle size={14}/>:<CheckCircle2 size={14}/>} {message}
   </p>}
   {file && <div className="bim-library__content" data-testid="bim-file-elements">
     <header><span><FileText size={14}/><strong>عناصر {file.name}</strong></span><b>{listed.length} عنصر</b></header>
     <label>عرض العناصر حسب الدور
       <select aria-label="تصفية عناصر BIM حسب الدور" value={floor} onChange={e=>setFloor(e.target.value)}>
        <option value="all">جميع الأدوار (٥)</option>
        {[0,1,2,3,4].map(n=><option value={n} key={n}>الدور {n+1}</option>)}
       </select>
     </label>
     <div className="bim-library__elements">
       {listed.map(el=><button type="button" key={el.id} onClick={()=>onPick(el)}
         title={el.description} data-scene-id={el.sceneId}>
         <MousePointer2 size={13}/><span><strong>{el.label}</strong><small>{el.type} · #{el.floor+1}</small></span>
       </button>)}
     </div>
     <small className="bim-library__footnote">الضغط على أي عنصر يحدد غرفته أو معدته التوضيحية بالكاميرا في المشهد.</small>
   </div>}
  </section>;
}
