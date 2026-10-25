import { SERVICE_KEYS, SERVICE_META, type ServiceKey } from "./EngineeringNetworks3D";
import type { VenueKind, VenueSpot } from "./VenueScene3D";
import { VENUE_SPOTS } from "./VenueScene3D";

export type VenueDiscipline = "architectural" | "structural" | "mep" | "fire";
export interface VenueBimElement {
  id: string;
  sceneId: string;
  floor: 0;
  label: string;
  description: string;
  type: string;
  system?: ServiceKey;
  area?: string;
  position: [number, number, number];
  discipline: VenueDiscipline;
  review: string;
}
export const VENUE_SERVICE_POSITIONS: Record<ServiceKey, [number,number,number][]> = {
 electricity:[[-5.7,2.95,3.7],[-.2,2.95,2.8],[4.7,2.95,-3.4]],
 water:[[-3.6,.9,.75],[3.0,.9,-1.7],[5.2,.9,-4.25]],
 drainage:[[-3.7,.26,.68],[3,.26,-1.8],[5.25,.26,-4.3]],
 hvac:[[-4.9,3.4,-.3],[0,3.45,.1],[3.65,3.45,-3.3]],
 fire:[[-4.2,3.55,1.65],[.3,3.55,1.65],[4.8,3.55,-3.2]],
 grounding:[[-5.7,.15,3.7],[0,.15,-4.25],[5.8,.15,-4.25]]
};
export const VENUE_SERVICE_DETAILS: Record<VenueKind,Record<ServiceKey, {title:string;units:[string,string,string];risk:string;spec:string}>> = {
 cafe:{
  electricity:{title:"دوائر كهرباء المقهى",units:["لوحة الكاونتر وماكينة القهوة","دائرة إنارة وجلسات","تغذية مبردات التحضير"],risk:"لم تُحسب أحمال ماكينة الإسبريسو أو القواطع",spec:"تحديد مسار الكابلات واللوحات فقط، بلا مقطع معتمد"},
  water:{title:"تغذية المياه للمقهى",units:["مياه بار القهوة","تغذية حوض الغسيل","محبس تغذية التحضير"],risk:"لم تُعتمد أقطار المواسير وضغط التغذية",spec:"مياه باردة افتراضية بخط وفروع توضيحية"},
  drainage:{title:"صرف التحضير والغسيل",units:["مصرف تحضير القهوة","صرف حوض الغسيل","نقطة تجميع الخدمة"],risk:"ميل الصرف وتصريف المعدّات غير محسوبين",spec:"توصيلات صرف افتراضية بفرع وتجميع"},
  hvac:{title:"التهوية والتكييف",units:["تغذية هواء منطقة الكاونتر","ناشر صالة الجلوس","تهوية خلفية للتحضير"],risk:"لم تحسب أحمال التكييف أو الهواء الخارجي",spec:"مجاري هواء وناشرات تخطيطية"},
  fire:{title:"شبكة إنذار ورشاشات",units:["رشاش الكاونتر","رشاش منطقة الجلوس","رشاش الخدمة"],risk:"التغطية والتدفق وضغط شبكة الحريق غير محسوبة",spec:"نقاط رش تجريبية ولا تمثل اعتماد دفاع مدني"},
  grounding:{title:"الأرضي والحماية",units:["ربط ماكينة الإسبريسو","ربط اللوحة الفرعية","تأريض تجهيزات الغسيل"],risk:"قياسات مقاومة الأرضي وفحص العزل غير متوفرة",spec:"مسار ربط أرضي توضيحي"}
 },
 restaurant:{
  electricity:{title:"التغذية الكهربائية للمطعم",units:["لوحة الاستقبال والدفع","دوائر إنارة الصالة","لوحة تغذية المطبخ"],risk:"أحمال خط الطبخ والأجهزة الحرارية لم تُحسب",spec:"دوائر تغذية مفترضة، لا مقاطع تنفيذية"},
  water:{title:"خطوط مياه المطعم",units:["تغذية نقطة الخدمة","تغذية حوض غسيل الأطباق","تغذية التحضير والطبخ"],risk:"ضغط التدفق وأقطار الخطوط غير محسوبين",spec:"مواسير ومحابس تمثيلية"},
  drainage:{title:"صرف المطبخ",units:["مصرف نقطة الدفع","صرف حوض الغسيل","صرف تجهيزات التحضير"],risk:"يلزم مراجعة المصيدة الدهنية وميل المواسير",spec:"توزيع صرف تمثيلي غير مصمم"},
  hvac:{title:"التهوية وشفاط المطبخ",units:["تكييف منطقة الاستقبال","ناشر صالة الطعام","شفاط طبخ وتهوية مطبخ"],risk:"تدفق شفاط الطبخ وهواء التعويض غير محسوبين",spec:"دكت تخطيطي وشفاط غير معتمد"},
  fire:{title:"الحريق والرشاشات",units:["رشاش منطقة الدفع","رشاش الصالة","رشاش المطبخ"],risk:"قد تتطلب معدات الطبخ نظام إطفاء خاص؛ لم يتحقق منه",spec:"مواضع رش توضيحية دون اعتماد نظامي"},
  grounding:{title:"تأريض المعدات",units:["تأريض نقطة الدفع","تأريض معدات الصالة","ربط خط الطبخ والتبريد"],risk:"الربط والاختبارات الكهربائية لم تُنفذ",spec:"كابلات ربط افتراضية"}
 }
};
const types: Record<ServiceKey,string>={
 electricity:"IFCCABLESEGMENT",water:"IFCPIPESEGMENT",drainage:"IFCPIPESEGMENT",
 hvac:"IFCDUCTSEGMENT",fire:"IFCFIREPROTECTIONTERMINAL",grounding:"IFCCABLESEGMENT"
};
const STRUCTURE_POSITIONS: [number,number,number][]=[
 [-7.55,2.05,-5.6],[-7.55,2.05,5.6],[7.55,2.05,-5.6],[7.55,2.05,5.6],[0,4.3,-5.8],[0,4.3,5.8]
];
export const VENUE_DISCIPLINES: {id:VenueDiscipline;file:string;label:string;description:string;color:string}[]=[
 {id:"architectural",file:"Architectural.ifc",label:"المخطط المعماري",description:"مدخل، كاونتر، جلسات، منطقة خدمة ومساحات افتراضية",color:"#b5cbbf"},
 {id:"structural",file:"Structural.ifc",label:"الهيكل الإنشائي",description:"أعمدة محيطية وعتبات أسقف مرجعية توضيحية",color:"#bbb2a5"},
 {id:"mep",file:"MEP.ifc",label:"الكهرباء والمياه والصرف والتكييف والتأريض",description:"15 نقطة خدمة مرتبطة بعناصر واضحة داخل المشهد",color:"#daa951"},
 {id:"fire",file:"FireSafety.ifc",label:"الحريق والسلامة",description:"3 نقاط رش افتراضية مع متطلبات فحص هندسي",color:"#d67361"}
];
export function getVenueEngineeringElements(kind:VenueKind):VenueBimElement[]{
  const architecture:VenueBimElement[]=VENUE_SPOTS[kind].map((spot:VenueSpot,index)=>({
    id:"A-"+kind+"-"+index,sceneId:spot.id,floor:0,label:spot.title,description:spot.description,
    discipline:"architectural",type:"IFCSPACE",position:spot.position,area:spot.area,
    review:"توزيع وظيفي توضيحي، المساحة والأبواب غير مستخرجة من ملف IFC"
  }));
  const structure:VenueBimElement[]=STRUCTURE_POSITIONS.map((position,index)=>({
    id:"S-"+kind+"-"+index,sceneId:"VENUE-"+kind+"-struct-"+index,
    floor:0,label:index<4?"عمود محيطي "+(index+1):"عتبة الواجهة "+(index-3),
    description:index<4?"عنصر إنشائي تخطيطي على محيط المنشأة":"عتبة مرجعية في أعلى واجهة المنشأة",
    discipline:"structural",type:index<4?"IFCCOLUMN":"IFCBEAM",position,
    review:"أبعاد وتسليح وقدرة تحمل غير مدققة"
  }));
  const services:VenueBimElement[]=SERVICE_KEYS.flatMap(system=>
    VENUE_SERVICE_POSITIONS[system].map((position,index)=>{
      const details=VENUE_SERVICE_DETAILS[kind][system];
      return {
        id:"M-"+kind+"-"+system+"-"+index,
        sceneId:"VENUE-"+kind+"-"+system+"-"+index,floor:0,
        label:details.units[index],description:details.title+" · "+details.spec,
        type:types[system],position,system,discipline:(system==="fire"?"fire":"mep") as VenueDiscipline,
        review:details.risk
      };
    })
  );
  return [...architecture,...structure,...services];
}
export function getVenueElement(kind:VenueKind,id:string|null|undefined):VenueBimElement|undefined{
  return id ? getVenueEngineeringElements(kind).find(item=>item.sceneId===id) : undefined;
}
export function getVenueMetrics(kind:VenueKind){
 const elements=getVenueEngineeringElements(kind);
 return {total:elements.length,areas:4,structural:6,systems:SERVICE_KEYS.length,
   networkPoints:18,bySystem:SERVICE_KEYS.map(system=>({
     system,label:SERVICE_META[system].label,count:elements.filter(e=>e.system===system).length,
     ...VENUE_SERVICE_DETAILS[kind][system],
   }))};
}
