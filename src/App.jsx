import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const META_TOKEN   = import.meta.env.VITE_META_TOKEN;
const META_ACCOUNT = import.meta.env.VITE_META_ACCOUNT;
const CLAUDE_KEY        = import.meta.env.VITE_CLAUDE_KEY;
const supabase     = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Analítica: registrar evento de uso ───────────────────────────────────────
async function logActividad(session,evento,detalle=null,duracion=null){
  try{
    await supabase.from("activity_logs").insert([{
      usuario:session.usuario,sucursal_id:session.id,sucursal_nombre:session.nombre,
      rol:session.rol,evento,detalle,duracion_segundos:duracion
    }]);
  }catch(_){}
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#22264A;font-family:'Albert Sans',sans-serif;font-size:15px;}
  ::-webkit-scrollbar{width:5px;height:5px;background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px;}
  .glass{background:rgba(255,255,255,0.07);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.12);border-radius:16px;}
  .glass-dark{background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:12px;}
  .kpi{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:20px 22px;}
  .kpi.hi{border-color:rgba(39,33,232,0.55);background:rgba(39,33,232,0.1);}
  .kpi.green{border-color:rgba(16,185,129,0.45);background:rgba(16,185,129,0.08);}
  .kpi.orange{border-color:rgba(249,115,22,0.45);background:rgba(249,115,22,0.08);}
  .inp{background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:11px 14px;color:#fff;font-family:'Albert Sans',sans-serif;font-size:14px;width:100%;outline:none;transition:border 0.2s;}
  .inp:focus{border-color:#4f46e5;box-shadow:0 0 0 2px rgba(79,70,229,0.2);}
  .inp::placeholder{color:rgba(255,255,255,0.25);}
  select.inp{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.35)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;}
  select.inp option{background:#22264A;color:#fff;}
  .btn-blue{background:#2721E8;color:#fff;border:none;border-radius:10px;padding:11px 22px;font-family:'Albert Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;}
  .btn-blue:hover{background:#3d38f0;}
  .btn-blue:disabled{background:rgba(39,33,232,0.3);cursor:default;}
  .btn-ghost{background:transparent;color:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:9px 18px;font-family:'Albert Sans',sans-serif;font-size:13px;cursor:pointer;transition:all 0.2s;}
  .btn-ghost:hover{border-color:#4f46e5;color:#fff;}
  .nav-tab{padding:11px 22px;font-size:14px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;color:rgba(255,255,255,0.4);transition:all 0.18s;}
  .nav-tab:hover{color:rgba(255,255,255,0.75);}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center;}
  .tab-dash{padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:rgba(255,255,255,0.45);transition:all 0.18s;letter-spacing:0.2px;display:flex;align-items:center;gap:6px;white-space:nowrap;}
  .tab-dash:hover{color:rgba(255,255,255,0.85);}
  .tab-dash.active{color:#fff;}
  @keyframes meta-spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  .meta-spinner{width:28px;height:28px;border:2.5px solid rgba(255,255,255,0.1);border-top-color:#a855f7;border-radius:50%;animation:meta-spin 0.8s linear infinite;}
  .meta-loading-overlay{position:absolute;inset:-4px;z-index:10;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:rgba(34,38,74,0.72);border-radius:16px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;transition:opacity 0.3s;}
  .rank-row{display:grid;grid-template-columns:32px 110px 1fr 110px 110px 100px;gap:0;padding:15px 20px;border-bottom:1px solid rgba(255,255,255,0.05);align-items:center;font-size:14px;}
  .rank-row:hover{background:rgba(255,255,255,0.03);}
  .clienta-sugg{padding:11px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);transition:background 0.15s;font-size:14px;}
  .clienta-sugg:hover{background:rgba(39,33,232,0.22);}
`;

let cssInjected = false;
function useCSSInjection(){useEffect(()=>{if(cssInjected)return;const s=document.createElement("style");s.textContent=CSS;document.head.appendChild(s);cssInjected=true;},[]);}

const USUARIOS=[
  {id:1,nombre:"Coapa",usuario:"coapa",password:"cire2026",rol:"sucursal",color:"#2721E8"},
  {id:2,nombre:"Valle",usuario:"valle",password:"cire2026",rol:"sucursal",color:"#49B8D3"},
  {id:3,nombre:"Oriente",usuario:"oriente",password:"cire2026",rol:"sucursal",color:"#2721E8"},
  {id:4,nombre:"Polanco",usuario:"polanco",password:"cire2026",rol:"sucursal",color:"#49B8D3"},
  {id:5,nombre:"Metepec",usuario:"metepec",password:"cire2026",rol:"sucursal",color:"#2721E8"},
  {id:0,nombre:"Admin",usuario:"cire.admin",password:"cire.admin2026",rol:"admin",color:"#a855f7"},
  {id:10,nombre:"Jaz Vázquez",usuario:"jaz_vazquez",password:"jaz.cire2026",rol:"duena_general",color:"#f0c040",sucursalesPropias:["Polanco","Valle"]},
  {id:11,nombre:"Fabiola Tinoco",usuario:"fabiola_tinoco",password:"fabiola2026",rol:"socia",color:"#2721E8",sucursales:["Coapa"]},
  {id:12,nombre:"Gerencia Metepec",usuario:"gerencia_metepec",password:"metepec2026",rol:"socia",color:"#10b981",sucursales:["Metepec"]},
  {id:13,nombre:"Gerencia Oriente",usuario:"gerencia_oriente",password:"oriente2026",rol:"socia",color:"#a855f7",sucursales:["Oriente"]},
  {id:14,nombre:"Fer Ayala",usuario:"fer_ayala",password:"fer.cire2026",rol:"duena_general",color:"#a855f7"},
];
const SUCURSALES_NAMES=["Coapa","Valle","Oriente","Polanco","Metepec"];
const COLORES={Coapa:"#2721E8",Valle:"#49B8D3",Oriente:"#a855f7",Polanco:"#f97316",Metepec:"#10b981"};
const TERMINALES_DEFAULT=[
  {nombre:"Zettle",comision:2.29,activa:true},
  {nombre:"BBVA",comision:2.75,activa:true},
  {nombre:"Banorte",comision:2.50,activa:true},
  {nombre:"Mercado Pago",comision:3.29,activa:true},
];
const netoTarjeta=(monto,comision)=>Math.round(monto*(1-(comision*1.16/100)));
const fmt=(n)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:0}).format(n||0);
const fmtN=(n)=>new Intl.NumberFormat("es-MX").format(n||0);
const cdmx=(d=new Date())=>d.toLocaleDateString("en-CA",{timeZone:"America/Mexico_City"});
const hoy=()=>cdmx();
const ayer=()=>{const h=cdmx();const d=new Date(h+"T12:00:00");d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);};
const nextTicketNum=async()=>{const{data}=await supabase.from("tickets").select("ticket_num").order("ticket_num",{ascending:false}).limit(1);return(data?.[0]?.ticket_num||0)+1;};
const inicioMes=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;};
const normName=n=>(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," ").trim();
const mesLabel=()=>new Date().toLocaleDateString("es-MX",{month:"long",year:"numeric"});
const defaultMes=()=>{const d=new Date();if(d.getDate()<=5){const p=new Date(d.getFullYear(),d.getMonth()-1,1);return`${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,"0")}`;}return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;};

const CATALOGO=[
  {categoria:"Combos Láser",items:[{nombre:"Full Body (8 ses)",precio:10000,msi:[3,6,9]},{nombre:"Combo Rostro (8 ses)",precio:9000,msi:[3,6,9]},{nombre:"Combo Sexy (8 ses)",precio:8000,msi:[3,6,9]},{nombre:"Combo Playa (8 ses)",precio:6500,msi:[3,6]},{nombre:"Combo Piernas (8 ses)",precio:6500,msi:[3,6]},{nombre:"Combo Bikini (8 ses)",precio:5500,msi:[3,6]},{nombre:"Combo Axilas (8 ses)",precio:5500,msi:[3,6]}]},
  {categoria:"Zonas Individuales",items:[{nombre:"Piernas Completas (8 ses)",precio:3500,msi:[3]},{nombre:"Medias Piernas (8 ses)",precio:2500,msi:[3]},{nombre:"Brazos (8 ses)",precio:3500,msi:[3]},{nombre:"Medios Brazos (8 ses)",precio:2500,msi:[3]},{nombre:"Axilas (8 ses)",precio:1500,msi:[3]},{nombre:"Espalda Completa (8 ses)",precio:4000,msi:[3]},{nombre:"Media Espalda (8 ses)",precio:2500,msi:[3]},{nombre:"Glúteos (8 ses)",precio:2500,msi:[3]},{nombre:"Zona Interglútea (8 ses)",precio:1500,msi:[3]},{nombre:"Abdomen (8 ses)",precio:2500,msi:[3]},{nombre:"Línea Abdomen (8 ses)",precio:1500,msi:[3]},{nombre:"Pecho (8 ses)",precio:2500,msi:[3]}]},
  {categoria:"Facial Láser",items:[{nombre:"Rostro Completo (8 ses)",precio:2500,msi:[3]},{nombre:"Medio Rostro (8 ses)",precio:2000,msi:[3]},{nombre:"Bigote/Mentón/Patillas (8s)",precio:1000,msi:[3]},{nombre:"Bikini Brazilian (8 ses)",precio:3500,msi:[3]},{nombre:"French Bikini (8 ses)",precio:3000,msi:[3]},{nombre:"Sexy Bikini (8 ses)",precio:2500,msi:[3]},{nombre:"Bikini Básico (8 ses)",precio:2000,msi:[3]}]},
  {categoria:"Faciales",items:[{nombre:"Baby Clean (1 ses)",precio:549,msi:[]},{nombre:"FullFace (1 ses)",precio:849,msi:[]},{nombre:"6 ses FullFace",precio:3500,msi:[3]},{nombre:"10 ses FullFace",precio:6000,msi:[3]}]},
  {categoria:"HIFU 4D",items:[{nombre:"HIFU 1 persona",precio:3000,msi:[3]},{nombre:"HIFU 2 personas",precio:5000,msi:[3]}]},
  {categoria:"Corporal",items:[{nombre:"Moldeo 1ª sesión",precio:699,msi:[]},{nombre:"Moldeo Subsecuente",precio:999,msi:[]},{nombre:"6 ses Moldeo",precio:3999,msi:[3]},{nombre:"12 ses Moldeo + Facial",precio:6999,msi:[3]},{nombre:"Anticelulítico 1ª ses",precio:699,msi:[]},{nombre:"6 ses Anticelulítico",precio:3999,msi:[3]},{nombre:"Moldeo Brasileño 1ª ses",precio:699,msi:[]},{nombre:"6 ses Moldeo Brasileño",precio:3999,msi:[3]},{nombre:"Aparatología 1 zona",precio:649,msi:[]}]},
  {categoria:"Post Operatorio",items:[{nombre:"Post Op 1ª ses",precio:999,msi:[]},{nombre:"10 ses Post Op",precio:9999,msi:[3]},{nombre:"15 ses Post Op",precio:13999,msi:[3]},{nombre:"20 ses Post Op + Facial",precio:17999,msi:[3]}]},
];
const TIPOS_SVC=[{id:"laser",label:"Láser",duracion:60,color:"#039BE5"},{id:"facial_baby",label:"Baby Clean",duracion:60,color:"#E67C73"},{id:"facial_full",label:"FullFace",duracion:90,color:"#E67C73"},{id:"corporal",label:"Corporal/Moldeo",duracion:60,color:"#8E24AA"},{id:"hifu",label:"HIFU 4D",duracion:90,color:"#3F51B5"},{id:"post_op",label:"Post operatorio",duracion:60,color:"#10b981"},{id:"cera",label:"Cera",duracion:45,color:"#33B679"}];
// Tiempos reales por zona según tabla de tiempos (minutos)
const TIEMPOS_ZONA={
  laser:{
    "bikini basico":15,"sexy bikini":15,"french bikini":30,"bikini brazilian":30,
    "crack":15,"coxis":15,"gluteos":20,"medias piernas":20,"piernas completas":40,
    "pies":15,"combo abdomen pecho":30,"abdomen":15,"brazos completos":30,"brazos":30,
    "medios brazos":20,"axilas":15,"espalda completa":30,"media espalda":20,
    "hombros":15,"linea de abdomen":15,"linea abdomen":15,"manos":15,"pecho":20,"pezones":15,
    "rostro completo":30,"medio rostro":15,"barba":15,"bigote":15,"entreceja":15,
    "frente":15,"mejillas":15,"menton":15,"patillas":15,"cuello":15,"nariz":15,"nuca":15,"orejas":15,
    "combo axilas":30,"combo bikini":30,"combo piernas":45,"combo playa":45,
    "combo sexy":45,"combo rostro":45,"cuerpo completo":60,
  },
  cera:{
    "bikini basico":15,"sexy bikini":15,"french bikini":30,"bikini brazilian":30,
    "crack":15,"coxis":15,"gluteos":30,"medias piernas":30,"piernas completas":30,
    "pies":15,"combo abdomen pecho":30,"abdomen":15,"brazos completos":30,"brazos":30,
    "medios brazos":15,"axilas":15,"espalda completa":15,"media espalda":15,
    "hombros":15,"linea de abdomen":15,"linea abdomen":15,"manos":15,"pecho":15,"pezones":15,
    "barba":15,"bigote":15,"diseno de cejas":30,"entreceja":15,"frente":15,
    "mantenimiento de cejas":30,"medio rostro":30,"mejillas":15,"menton":15,"patillas":15,
    "rostro completo":30,"nariz":15,"nuca":15,"orejas":15,
    "combo sexy":60,"combo playa":60,"combo piernas":60,"cuerpo completo":180,
  }
};
const getDuracionServicio=(nombre,tipoId)=>{
  const mapa=TIEMPOS_ZONA[tipoId];if(!mapa)return null;
  const n=normName(nombre.replace(/\([^)]*\)/gi,""));
  const entries=Object.entries(mapa).sort((a,b)=>b[0].length-a[0].length);
  for(const[key,min]of entries){if(n.includes(key))return min;}
  return null;
};
const HORARIOS={1:{a:"10:00",c:"20:00"},2:{a:"10:00",c:"20:00"},3:{a:"10:00",c:"20:00"},4:{a:"10:00",c:"20:00"},5:{a:"10:00",c:"20:00"},6:{a:"09:00",c:"16:00"},0:null};
const DIAS_L=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const HORAS=Array.from({length:12},(_,i)=>i+9);
const PX_POR_MIN=64/60;
const colorT=(t)=>TIPOS_SVC.find(x=>x.id===t)?.color||"#2721E8";
// Colores estilo Google Calendar: azul fuerte=HIFU, rosa=Facial, morado=Moldeo, verde=Cera, rojo=1ª ses, azul=Láser
const colorCita=(c)=>{
  if(c.estado==="perdida")return"#eab308";
  if(c.datos_pendientes&&c.estado==="completada")return"#f59e0b";
  if(c.tipo_servicio==="hifu")return"#3F51B5";
  if(["facial_baby","facial_full"].includes(c.tipo_servicio))return"#E67C73";
  if(c.tipo_servicio==="corporal")return"#8E24AA";
  if(c.tipo_servicio==="cera")return"#33B679";
  if(c.sesion_numero===1)return"#D50000";
  return"#039BE5";
};
const detectTipo=(n)=>{const l=(n||"").toLowerCase();if(l.includes("baby"))return TIPOS_SVC[1];if(l.includes("fullface")||l.includes("facial"))return TIPOS_SVC[2];if(l.includes("hifu"))return TIPOS_SVC[4];if(l.includes("post"))return TIPOS_SVC[5];if(l.includes("moldeo")||l.includes("corporal")||l.includes("anticel"))return TIPOS_SVC[3];if(l.includes("cera"))return TIPOS_SVC[6];return TIPOS_SVC[0];};
const horaFin=(h,dur)=>{if(!h)return"";const[hh,mm]=h.split(":").map(Number);const f=hh*60+mm+dur;return`${String(Math.floor(f/60)).padStart(2,"0")}:${String(f%60).padStart(2,"0")}`;};
function semanaD(f){const b=new Date(f+"T12:00:00"),d=b.getDay(),l=new Date(b);l.setDate(b.getDate()-(d===0?6:d-1));return Array.from({length:6},(_,i)=>{const x=new Date(l);x.setDate(l.getDate()+i);return x.toISOString().slice(0,10);});}
const FILTROS=["Todos","Combos","Rostro","Superior","Inferior","Bikini","Faciales","Corporales","Mantenimiento","Personalizado","Cera"];
const ZONAS_CERA=["Piernas Completas","Medias Piernas","Brazos","Medios Brazos","Axilas","Espalda Completa","Media Espalda","Glúteos","Zona Interglútea","Abdomen","Línea Abdomen","Pecho","Pezones","Rostro Completo","Medio Rostro","Bigote","Mentón","Patillas","Bikini Brazilian","French Bikini","Sexy Bikini","Bikini Básico","Ingles"];
const ITEM_FILTRO=(item,f)=>{if(f==="Todos")return true;const n=item.nombre.toLowerCase();if(f==="Combos")return n.includes("combo")||n.includes("full body");if(f==="Rostro")return n.includes("rostro")||n.includes("bigote")||n.includes("patillas");if(f==="Superior")return["axilas","brazos","pecho","abdomen","espalda","línea abdomen","glúteos","zona interg"].some(k=>n.includes(k));if(f==="Inferior")return["piernas","medias piernas"].some(k=>n.includes(k));if(f==="Bikini")return["bikini","french","sexy bikini"].some(k=>n.includes(k));if(f==="Faciales")return n.includes("baby clean")||n.includes("fullface")||n.includes("hifu");if(f==="Corporales")return["moldeo","anticel","post op","aparatolog"].some(k=>n.includes(k));return true;};
const MESES_ES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const ZONAS_EQUIPO=["Piernas","Brazos","Axilas","Pezones","Espalda","Glúteos","Zona Interglútea","Abdomen","Línea Abdomen","Pecho","Rostro Completo","Medio Rostro","Bigote","Mentón","Patillas","Bikini","General"];
const ZONAS_PACK=["Piernas Completas","Medias Piernas","Brazos","Medios Brazos","Axilas","Espalda Completa","Media Espalda","Glúteos","Zona Interglútea","Abdomen","Línea Abdomen","Pecho","Pezones","Rostro Completo","Medio Rostro","Bigote","Mentón","Patillas","Bikini Brazilian","French Bikini","Sexy Bikini","Bikini Básico"];

// ══════════════════════════════════════════════════════════════════════════════
// MINI AGENDA — vista inline del día para sidebar POS
// ══════════════════════════════════════════════════════════════════════════════
function MiniAgendaDia({session,fecha,onSelectHora,horaSeleccionada,duracion}){
  const[citas,setCitas]=useState([]);
  useEffect(()=>{if(!fecha)return;(async()=>{const{data}=await supabase.from("citas").select("*").eq("sucursal_id",session.id).eq("fecha",fecha).neq("estado","cancelada").order("hora_inicio");setCitas(data||[]);})();},[fecha,session.id]);
  const dow=new Date(fecha+"T12:00:00").getDay(),h=HORARIOS[dow];
  if(!h)return<div style={{fontSize:"11px",color:"#ff6b6b",padding:"8px"}}>Domingo — cerrado</div>;
  const[hA]=h.a.split(":").map(Number),[hC]=h.c.split(":").map(Number);
  const hrs=Array.from({length:hC-hA},(_,i)=>i+hA);
  return(
    <div style={{border:"1px solid #d0d0d0",borderRadius:"10px",overflow:"hidden",background:"#fff"}}>
      <div style={{padding:"8px 10px",borderBottom:"1px solid #e0e0e0",fontSize:"10px",color:"#333",letterSpacing:"1px",display:"flex",justifyContent:"space-between"}}>
        <span>{new Date(fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"short"}).toUpperCase()}</span>
        <span>{citas.length} cita{citas.length!==1?"s":""}</span>
      </div>
      <div style={{maxHeight:"260px",overflowY:"auto"}}>
        {hrs.map(hr=>{const pad=String(hr).padStart(2,"0");const s0=`${pad}:00`,s15=`${pad}:15`,s30=`${pad}:30`,s45=`${pad}:45`;
          const citasHr=citas.filter(c=>{const[ch]=c.hora_inicio.split(":").map(Number);return ch===hr;});
          return(<div key={hr} style={{display:"flex",borderBottom:"1px solid #f0f0f0"}}>
            <div style={{width:"42px",padding:"4px 6px",fontSize:"9px",color:"#666",textAlign:"right",flexShrink:0,paddingTop:"6px"}}>{hr>12?`${hr-12}pm`:hr===12?"12pm":`${hr}am`}</div>
            <div style={{flex:1,minHeight:"44px",position:"relative"}}>
              {[s0,s15,s30,s45].map((slot,si)=>{const sel=horaSeleccionada===slot;return(
                <div key={slot} onClick={()=>onSelectHora(slot)} style={{height:"11px",cursor:"pointer",background:sel?"rgba(39,33,232,0.12)":"transparent",borderLeft:sel?"2px solid #2721E8":"2px solid transparent",borderTop:si===2?"1px dashed #eee":"none",transition:"all 0.1s",display:"flex",alignItems:"center",paddingLeft:"4px"}}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(0,0,0,0.04)";}} onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=sel?"rgba(39,33,232,0.12)":"transparent";}}>
                  {sel&&<span style={{fontSize:"9px",color:"#2721E8",fontWeight:600}}>{slot}</span>}
                </div>);
              })}
              {citasHr.map(c=>{const[,cm]=c.hora_inicio.split(":").map(Number);const top=Math.round((cm/60)*44)+1;const durReal=c.hora_fin?(()=>{const[fh,fm]=c.hora_fin.split(":").map(Number);const[ih,im]=c.hora_inicio.split(":").map(Number);return(fh*60+fm)-(ih*60+im);})():(c.duracion_min||60);const hPx=Math.max(durReal*(44/60)-2,10);const col=colorCita(c);
                return(<div key={c.id} style={{position:"absolute",left:"28px",right:"2px",top:`${top}px`,height:`${hPx}px`,background:`${col}22`,border:`1px solid ${col}55`,borderRadius:"4px",padding:"1px 4px",pointerEvents:"none",overflow:"hidden",zIndex:2}}>
                  <div style={{fontSize:"8px",fontWeight:600,color:col,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.hora_inicio} {c.clienta_nombre}</div>
                </div>);
              })}
            </div>
          </div>);
        })}
      </div>
      {horaSeleccionada&&<div style={{padding:"6px 10px",borderTop:"1px solid rgba(39,33,232,0.3)",background:"rgba(39,33,232,0.08)",fontSize:"11px",color:"#2721E8",fontWeight:600}}>✓ {horaSeleccionada} – {horaFin(horaSeleccionada,duracion)} ({duracion}min)</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FICHA CLIENTA
// ══════════════════════════════════════════════════════════════════════════════
function FichaClienta({clientaId,session,onClose,isAdmin=false}){
  const[clienta,setClienta]=useState(null);const[paquetes,setPaquetes]=useState([]);const[citasH,setCitasH]=useState([]);const[loading,setLoading]=useState(true);
  const[editMode,setEditMode]=useState(false);const[saving,setSaving]=useState(false);
  const[editNombre,setEditNombre]=useState("");const[editTel,setEditTel]=useState("");const[editNac,setEditNac]=useState("");const[editComo,setEditComo]=useState("");
  const[editPaquetes,setEditPaquetes]=useState([]);const[deletingCita,setDeletingCita]=useState(null);const[confirmDelPaq,setConfirmDelPaq]=useState(null);const[newPaqForm,setNewPaqForm]=useState(null);const[savingNewPaq,setSavingNewPaq]=useState(false);
  const[editingTotalId,setEditingTotalId]=useState(null);const[newTotalVal,setNewTotalVal]=useState("");
  const[editCitasParams,setEditCitasParams]=useState([]);const[zonaNewMap,setZonaNewMap]=useState({});const[valNewMap,setValNewMap]=useState({});
  const[reagendarAbierta,setReagendarAbierta]=useState(null);const[fechaRAb,setFechaRAb]=useState("");const[horaRAb,setHoraRAb]=useState("");const[savingReag,setSavingReag]=useState(false);

  const cargar=async()=>{setLoading(true);const{data:c}=await supabase.from("clientas").select("*").eq("id",clientaId).single();const{data:p}=await supabase.from("paquetes").select("*").eq("clienta_id",clientaId).order("fecha_compra",{ascending:false});const{data:ci}=await supabase.from("citas").select("*").eq("clienta_id",clientaId).order("fecha",{ascending:false});setClienta(c);setPaquetes(p||[]);setCitasH(ci||[]);setLoading(false);};
  useEffect(()=>{cargar();},[clientaId]);

  const abrirEdit=()=>{
    setEditNombre(clienta.nombre||"");setEditTel(clienta.telefono||"");setEditNac(clienta.fecha_nacimiento||"");setEditComo(clienta.como_nos_conocio||"");
    setEditPaquetes(paquetes.map(p=>({...p,sesEdit:String(p.sesiones_usadas),servicioEdit:p.servicio,totalEdit:String(p.total_sesiones),precioEdit:String(p.precio)})));
    const citasConParams=(citasH||[]).filter(c=>c.parametros_equipo?.length>0||c.datos_pendientes);
    setEditCitasParams(citasConParams.map(c=>({...c,paramsEdit:[...(c.parametros_equipo||[]).map(p=>({...p}))]})));
    setZonaNewMap({});setValNewMap({});
    setEditMode(true);
  };
  const guardarTotalSesiones=async(paqId)=>{const tot=parseInt(newTotalVal);if(isNaN(tot)||tot<1)return;const paq=paquetes.find(p=>p.id===paqId);const activo=paq?paq.sesiones_usadas<tot:true;await supabase.from("paquetes").update({total_sesiones:tot,activo}).eq("id",paqId);setEditingTotalId(null);setNewTotalVal("");await cargar();};
  const guardarEdit=async()=>{setSaving(true);try{
    await supabase.from("clientas").update({nombre:editNombre.trim(),telefono:editTel.trim(),fecha_nacimiento:editNac||null,como_nos_conocio:editComo.trim()}).eq("id",clientaId);
    for(const ep of editPaquetes){
      const ses=parseInt(ep.sesEdit);const tot=parseInt(ep.totalEdit);const pre=parseInt(ep.precioEdit);
      const updates={};
      if(!isNaN(ses)&&ses>=0&&ses!==ep.sesiones_usadas){updates.sesiones_usadas=ses;updates.activo=!isNaN(tot)?ses<tot:ses<ep.total_sesiones;}
      if(ep.servicioEdit.trim()&&ep.servicioEdit.trim()!==ep.servicio)updates.servicio=ep.servicioEdit.trim();
      if(!isNaN(tot)&&tot>0&&tot!==ep.total_sesiones)updates.total_sesiones=tot;
      if(!isNaN(pre)&&pre>0&&pre!==ep.precio)updates.precio=pre;
      if(Object.keys(updates).length>0)await supabase.from("paquetes").update(updates).eq("id",ep.id);
    }
    for(const ec of editCitasParams){
      const orig=citasH.find(c=>c.id===ec.id);
      const origParams=JSON.stringify(orig?.parametros_equipo||[]);
      const upd={};
      if(JSON.stringify(ec.paramsEdit)!==origParams)upd.parametros_equipo=ec.paramsEdit;
      if(orig?.datos_pendientes&&ec.paramsEdit.length>0)upd.datos_pendientes=false;
      if(Object.keys(upd).length>0)await supabase.from("citas").update(upd).eq("id",ec.id);
    }
    setEditMode(false);await cargar();
  }catch(e){console.error(e);}setSaving(false);};
  const eliminarCita=async(cita)=>{setDeletingCita(null);try{await supabase.from("citas").delete().eq("id",cita.id);if(cita.paquete_id&&cita.estado==="completada"){const paq=paquetes.find(p=>p.id===cita.paquete_id);if(paq){const ns=Math.max(0,paq.sesiones_usadas-1);await supabase.from("paquetes").update({sesiones_usadas:ns,activo:true}).eq("id",paq.id);}}await cargar();}catch(e){console.error(e);}};
  const updateParam=(citaId,idx,campo,valor)=>{setEditCitasParams(prev=>prev.map(ec=>ec.id!==citaId?ec:{...ec,paramsEdit:ec.paramsEdit.map((p,i)=>i!==idx?p:{...p,[campo]:valor})}));};
  const removeParam=(citaId,idx)=>{setEditCitasParams(prev=>prev.map(ec=>ec.id!==citaId?ec:{...ec,paramsEdit:ec.paramsEdit.filter((_,i)=>i!==idx)}));};
  const addParam=(citaId)=>{const z=zonaNewMap[citaId]||"";const v=valNewMap[citaId]||"";if(!z||!v.trim())return;setEditCitasParams(prev=>prev.map(ec=>ec.id!==citaId?ec:{...ec,paramsEdit:[...ec.paramsEdit,{zona:z,valores:v.trim()}]}));setZonaNewMap(m=>({...m,[citaId]:""}));setValNewMap(m=>({...m,[citaId]:""}));};
  const updatePaq=(i,campo,valor)=>{setEditPaquetes(prev=>prev.map((ep,idx)=>idx!==i?ep:{...ep,[campo]:valor}));};
  const eliminarPaquete=async(paqId)=>{setConfirmDelPaq(null);try{await supabase.from("citas").update({paquete_id:null}).eq("paquete_id",paqId);await supabase.from("paquetes").delete().eq("id",paqId);setEditPaquetes(prev=>prev.filter(p=>p.id!==paqId));await cargar();}catch(e){console.error(e);}};
  const agregarPaquete=async()=>{if(!newPaqForm?.servicio)return;setSavingNewPaq(true);try{const ms=newPaqForm.servicio.match(/(\d+)[ªa°]?\s*ses/i);const tot=newPaqForm.totalEdit?parseInt(newPaqForm.totalEdit):(ms?parseInt(ms[1]):8);const ses=parseInt(newPaqForm.sesEdit||"0")||0;const pre=parseInt(newPaqForm.precioEdit||"0")||0;const{data:pD,error}=await supabase.from("paquetes").insert([{clienta_id:clientaId,clienta_nombre:clienta.nombre,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:newPaqForm.servicio,total_sesiones:tot,sesiones_usadas:ses,precio:pre,fecha_compra:hoy(),activo:ses<tot}]).select();if(error)throw error;setNewPaqForm(null);await cargar();}catch(e){console.error(e);}setSavingNewPaq(false);};
  const reagendarDesdeAbierta=async()=>{if(!reagendarAbierta||!fechaRAb||!horaRAb)return;setSavingReag(true);try{const tipoRA=TIPOS_SVC.find(t=>t.id===reagendarAbierta.tipo_servicio);const dur=getDuracionServicio(reagendarAbierta.servicio,reagendarAbierta.tipo_servicio)??tipoRA?.duracion??60;await supabase.from("citas").update({estado:"agendada",fecha:fechaRAb,hora_inicio:horaRAb,hora_fin:horaFin(horaRAb,dur)}).eq("id",reagendarAbierta.id);setReagendarAbierta(null);setFechaRAb("");setHoraRAb("");await cargar();}catch(e){console.error(e);}setSavingReag(false);};

  if(loading)return<div style={{padding:"40px",textAlign:"center",color:"rgba(255,255,255,0.3)"}}>Cargando ficha...</div>;
  if(!clienta)return<div style={{padding:"40px",textAlign:"center",color:"rgba(255,255,255,0.3)"}}>No encontrada</div>;
  const prox=citasH.find(c=>c.estado==="agendada");
  const abiertas=citasH.filter(c=>c.estado==="abierta");

  if(editMode)return(
    <div style={{padding:"20px 24px",overflowY:"auto",flex:1,color:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"20px"}}>
        <button className="btn-ghost" onClick={()=>setEditMode(false)} style={{fontSize:"11px"}}>← Cancelar</button>
        <div style={{fontSize:"16px",fontWeight:700,flex:1}}>Editar ficha · {clienta.nombre}</div>
        <button className="btn-blue" onClick={guardarEdit} disabled={saving||!editNombre.trim()} style={{padding:"8px 20px"}}>{saving?"Guardando...":"✓ Guardar"}</button>
      </div>

      <div className="glass" style={{padding:"18px",marginBottom:"16px"}}>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"12px"}}>DATOS DE LA CLIENTA</div>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>NOMBRE *</div><input className="inp" value={editNombre} onChange={e=>setEditNombre(e.target.value)} placeholder="Nombre completo"/></div>
          <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>TELÉFONO / WHATSAPP</div><input className="inp" value={editTel} onChange={e=>setEditTel(e.target.value)} placeholder="10 dígitos"/></div>
          <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>FECHA DE NACIMIENTO</div><input type="date" className="inp" value={editNac} onChange={e=>setEditNac(e.target.value)} style={{colorScheme:"dark"}}/></div>
          <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>¿CÓMO NOS CONOCIÓ?</div><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{["Redes sociales","Recomendación","Google","Otro"].map(op=><button key={op} onClick={()=>setEditComo(editComo===op?"":op)} style={{padding:"7px 14px",borderRadius:"8px",border:"1px solid",fontSize:"12px",cursor:"pointer",background:editComo===op?"#2721E8":"transparent",borderColor:editComo===op?"#2721E8":"rgba(255,255,255,0.15)",color:editComo===op?"#fff":"rgba(255,255,255,0.45)"}}>{op}</button>)}</div><input className="inp" value={editComo} onChange={e=>setEditComo(e.target.value)} placeholder="Otro (escribe aquí)" style={{marginTop:"6px",fontSize:"12px"}}/></div>
        </div>
      </div>

      <div className="glass" style={{padding:"18px",marginBottom:"16px"}}>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"12px"}}>PAQUETES</div>
        {editPaquetes.map((ep,i)=><div key={ep.id} style={{marginBottom:"14px",padding:"14px",background:"rgba(0,0,0,0.2)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              <div style={{flex:1}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>SERVICIO / PAQUETE</div>
              <select className="inp" value={ep.servicioEdit} onChange={e=>{
                const nombre=e.target.value;
                const item=CATALOGO.flatMap(c=>c.items).find(x=>x.nombre===nombre);
                const ses=nombre.match(/(\d+)[ªa°]?\s*ses/i)?.[1];
                setEditPaquetes(prev=>prev.map((p,idx)=>idx!==i?p:{...p,servicioEdit:nombre,precioEdit:item?String(item.precio):p.precioEdit,totalEdit:ses?ses:p.totalEdit}));
              }} style={{fontSize:"13px"}}>
                {CATALOGO.map(cat=>(
                  <optgroup key={cat.categoria} label={cat.categoria}>
                    {cat.items.map(it=><option key={it.nombre} value={it.nombre}>{it.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
              </div>
              {confirmDelPaq===ep.id
                ?<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"6px",flexShrink:0}}>
                    <div style={{fontSize:"10px",color:"#ef4444",textAlign:"center",lineHeight:"1.3"}}>¿Borrar<br/>paquete?</div>
                    <div style={{display:"flex",gap:"4px"}}>
                      <button onClick={()=>eliminarPaquete(ep.id)} style={{background:"rgba(239,68,68,0.2)",border:"1px solid #ef4444",color:"#ef4444",borderRadius:"6px",cursor:"pointer",fontSize:"10px",padding:"3px 8px",fontWeight:700}}>Sí</button>
                      <button onClick={()=>setConfirmDelPaq(null)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.5)",borderRadius:"6px",cursor:"pointer",fontSize:"10px",padding:"3px 8px"}}>No</button>
                    </div>
                  </div>
                :<button onClick={()=>setConfirmDelPaq(ep.id)} style={{background:"none",border:"1px solid rgba(239,68,68,0.25)",color:"rgba(239,68,68,0.5)",borderRadius:"6px",cursor:"pointer",fontSize:"11px",padding:"6px 10px",flexShrink:0,alignSelf:"flex-end"}} title="Eliminar paquete">🗑</button>
              }
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
              <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.5)",marginBottom:"4px"}}>TOTAL SESIONES ✎</div><input type="number" min="1" className="inp" value={ep.totalEdit} onChange={e=>updatePaq(i,"totalEdit",e.target.value)} style={{textAlign:"center",fontSize:"14px",fontWeight:700}}/></div>
              <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>PRECIO $</div><input type="number" className="inp" value={ep.precioEdit} readOnly style={{fontSize:"13px",opacity:0.6,cursor:"not-allowed"}}/></div>
              <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>SES. USADAS</div><input type="number" className="inp" value={ep.sesEdit} min="0" max={ep.totalEdit||ep.total_sesiones} onChange={e=>updatePaq(i,"sesEdit",e.target.value)} style={{textAlign:"center",fontSize:"14px",fontWeight:700}}/></div>
            </div>
            {(ep.servicioEdit!==ep.servicio||ep.totalEdit!==String(ep.total_sesiones)||ep.precioEdit!==String(ep.precio)||ep.sesEdit!==String(ep.sesiones_usadas))&&<div style={{fontSize:"11px",color:"#f59e0b"}}>⚠ Hay cambios pendientes en este paquete</div>}
          </div>
        </div>)}
        {/* Formulario nuevo paquete */}
        {newPaqForm
          ?<div style={{padding:"14px",background:"rgba(39,33,232,0.08)",borderRadius:"10px",border:"1px solid rgba(39,33,232,0.3)",marginBottom:"8px"}}>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"10px",letterSpacing:"1px"}}>NUEVO PAQUETE</div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>SERVICIO</div>
                <select className="inp" value={newPaqForm.servicio||""} onChange={e=>{const nombre=e.target.value;const item=CATALOGO.flatMap(c=>c.items).find(x=>x.nombre===nombre);const ms=nombre.match(/(\d+)[ªa°]?\s*ses/i);setNewPaqForm(f=>({...f,servicio:nombre,precioEdit:item?String(item.precio):f.precioEdit,totalEdit:ms?ms[1]:f.totalEdit}));}} style={{fontSize:"13px"}}>
                  <option value="">Seleccionar servicio...</option>
                  {CATALOGO.map(cat=><optgroup key={cat.categoria} label={cat.categoria}>{cat.items.map(it=><option key={it.nombre} value={it.nombre}>{it.nombre}</option>)}</optgroup>)}
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
                <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.5)",marginBottom:"4px"}}>TOTAL SESIONES</div><input type="number" min="1" className="inp" value={newPaqForm.totalEdit||""} onChange={e=>setNewPaqForm(f=>({...f,totalEdit:e.target.value}))} style={{textAlign:"center",fontSize:"14px",fontWeight:700}}/></div>
                <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>PRECIO $</div><input type="number" className="inp" value={newPaqForm.precioEdit||""} onChange={e=>setNewPaqForm(f=>({...f,precioEdit:e.target.value}))} style={{fontSize:"13px"}}/></div>
                <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>SES. USADAS</div><input type="number" className="inp" value={newPaqForm.sesEdit||"0"} min="0" onChange={e=>setNewPaqForm(f=>({...f,sesEdit:e.target.value}))} style={{textAlign:"center",fontSize:"14px",fontWeight:700}}/></div>
              </div>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={agregarPaquete} disabled={!newPaqForm.servicio||savingNewPaq} style={{flex:1,padding:"8px",borderRadius:"8px",background:"#2721E8",border:"none",color:"#fff",cursor:"pointer",fontSize:"12px",fontWeight:700,opacity:(!newPaqForm.servicio||savingNewPaq)?0.5:1}}>{savingNewPaq?"Guardando...":"+ Agregar paquete"}</button>
                <button onClick={()=>setNewPaqForm(null)} style={{padding:"8px 16px",borderRadius:"8px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:"12px"}}>Cancelar</button>
              </div>
            </div>
          </div>
          :<button onClick={()=>setNewPaqForm({servicio:"",totalEdit:"8",sesEdit:"0",precioEdit:""})} style={{width:"100%",padding:"10px",borderRadius:"8px",background:"rgba(39,33,232,0.1)",border:"1px dashed rgba(39,33,232,0.4)",color:"rgba(165,180,252,0.7)",cursor:"pointer",fontSize:"12px",fontWeight:600}}>+ Agregar paquete</button>
        }
      </div>

      {editCitasParams.length>0&&<div className="glass" style={{padding:"18px",marginBottom:"16px"}}>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"12px"}}>PARÁMETROS DE EQUIPO — POTENCIAS POR SESIÓN</div>
        {editCitasParams.map(ec=>(
          <div key={ec.id} style={{marginBottom:"18px",padding:"12px",background:"rgba(0,0,0,0.2)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"12px",fontWeight:600,marginBottom:"2px"}}>{ec.servicio} <span style={{color:"#49B8D3",fontWeight:700}}>· S{ec.sesion_numero}</span></div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>{new Date(ec.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · {ec.hora_inicio}</div>
            {ec.paramsEdit.map((p,pi)=>{
              const st=p.status;
              const stColor=st==="completado"?"#10b981":st==="pendiente"?"#f59e0b":st==="perdida"?"#ef4444":null;
              return(
              <div key={pi} style={{marginBottom:"8px",background:"rgba(255,255,255,0.03)",borderRadius:"8px",padding:"8px 10px",border:stColor?`1px solid ${stColor}44`:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"7px"}}>
                  <div style={{flex:1,fontSize:"11px",color:"rgba(255,255,255,0.7)",background:"rgba(255,255,255,0.04)",borderRadius:"6px",padding:"6px 10px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.zona}</div>
                  <input className="inp" value={p.valores} onChange={e=>updateParam(ec.id,pi,"valores",e.target.value)} style={{width:"90px",fontSize:"12px",padding:"6px 8px",textAlign:"center",fontFamily:"monospace"}} placeholder="000/000"/>
                  <button onClick={()=>removeParam(ec.id,pi)} style={{background:"none",border:"none",color:"rgba(255,100,100,0.6)",cursor:"pointer",fontSize:"16px",padding:"0 4px",lineHeight:1,flexShrink:0}}>×</button>
                </div>
                <div style={{display:"flex",gap:"4px"}}>
                  {[{s:"completado",label:"✓ Completado",color:"#10b981",bg:"rgba(16,185,129,"},{s:"pendiente",label:"⏸ Pendiente",color:"#f59e0b",bg:"rgba(245,158,11,"},{s:"perdida",label:"✕ Perdida",color:"#ef4444",bg:"rgba(239,68,68,"}].map(({s,label,color,bg})=>(
                    <button key={s} onClick={()=>updateParam(ec.id,pi,"status",st===s?null:s)} style={{flex:1,background:st===s?`${bg}0.2))`:"rgba(255,255,255,0.04)",border:`1px solid ${st===s?color:"rgba(255,255,255,0.1)"}`,borderRadius:"6px",color:st===s?color:"rgba(255,255,255,0.28)",cursor:"pointer",fontSize:"9px",padding:"4px 3px",fontWeight:st===s?700:400,letterSpacing:"0.2px",transition:"all 0.15s"}}>{label}</button>
                  ))}
                </div>
                {st&&st!=="completado"&&(
                  <input className="inp" value={p.razon||""} onChange={e=>updateParam(ec.id,pi,"razon",e.target.value)} style={{marginTop:"6px",fontSize:"10px",padding:"5px 8px"}} placeholder={st==="perdida"?"¿Por qué no se realizó esta zona?":"¿Por qué está pendiente esta zona?"}/>
                )}
              </div>);
            })}
            <div style={{display:"flex",gap:"6px",alignItems:"center",marginTop:"8px",paddingTop:"8px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
              <select className="inp" value={zonaNewMap[ec.id]||""} onChange={e=>setZonaNewMap(m=>({...m,[ec.id]:e.target.value}))} style={{flex:1,fontSize:"11px",padding:"6px 8px"}}>
                <option value="">+ Zona...</option>
                {ZONAS_EQUIPO.filter(z=>!ec.paramsEdit.find(p=>p.zona===z)).map(z=><option key={z} value={z}>{z}</option>)}
              </select>
              <input className="inp" value={valNewMap[ec.id]||""} onChange={e=>setValNewMap(m=>({...m,[ec.id]:e.target.value}))} style={{width:"90px",fontSize:"12px",padding:"6px 8px",textAlign:"center",fontFamily:"monospace"}} placeholder="000/000"/>
              <button onClick={()=>addParam(ec.id)} style={{background:"rgba(39,33,232,0.35)",border:"1px solid rgba(39,33,232,0.5)",borderRadius:"6px",color:"#fff",cursor:"pointer",fontSize:"18px",padding:"1px 10px",lineHeight:1,flexShrink:0}}>+</button>
            </div>
          </div>
        ))}
        {editCitasParams.length===0&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.2)"}}>No hay sesiones con parámetros registrados</div>}
      </div>}

      <div className="glass" style={{padding:"18px"}}>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"12px"}}>SESIONES — ELIMINAR REGISTRO</div>
        {citasH.length===0&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.15)"}}>Sin sesiones registradas</div>}
        {citasH.map(c=><div key={c.id} style={{display:"flex",gap:"10px",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:"12px",fontWeight:500}}>{c.servicio} <span style={{color:"rgba(255,255,255,0.3)"}}>· S{c.sesion_numero}</span></div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{new Date(c.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})} · {c.hora_inicio}</div>
          </div>
          <div style={{fontSize:"10px",fontWeight:600,color:c.estado==="completada"?"#10b981":c.estado==="agendada"?"#49B8D3":"rgba(255,255,255,0.2)",marginRight:"4px"}}>{c.estado==="completada"?"✓":c.estado==="agendada"?"Próx.":"✕"}</div>
          <button onClick={()=>setDeletingCita(c)} style={{background:"rgba(255,60,60,0.12)",border:"1px solid rgba(255,60,60,0.3)",borderRadius:"6px",color:"#ff6b6b",cursor:"pointer",padding:"4px 10px",fontSize:"11px",fontWeight:600}}>Borrar</button>
        </div>)}
      </div>

      {deletingCita&&<div className="overlay" onClick={()=>setDeletingCita(null)}><div className="glass" style={{width:380,padding:"28px",borderColor:"rgba(255,80,80,0.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:"16px",fontWeight:700,marginBottom:"8px",color:"#ff6b6b"}}>¿Eliminar sesión?</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.6)",marginBottom:"6px"}}>{deletingCita.servicio} · S{deletingCita.sesion_numero}</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginBottom:"20px"}}>{new Date(deletingCita.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})} · {deletingCita.hora_inicio}</div>
        {deletingCita.estado==="completada"&&<div style={{fontSize:"11px",color:"#f59e0b",padding:"8px 12px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:"8px",marginBottom:"16px"}}>⚠ Sesión completada — el contador del paquete se reducirá en 1.</div>}
        <div style={{display:"flex",gap:"10px"}}><button className="btn-ghost" onClick={()=>setDeletingCita(null)} style={{flex:1}}>Cancelar</button><button onClick={()=>eliminarCita(deletingCita)} style={{flex:1,padding:"10px",borderRadius:"10px",border:"none",background:"rgba(255,60,60,0.25)",color:"#ff6b6b",fontSize:"13px",fontWeight:700,cursor:"pointer"}}>Sí, eliminar</button></div>
      </div></div>}
    </div>
  );

  const SH=({children,count})=>(
    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
      <div style={{fontSize:"12px",fontWeight:700,letterSpacing:"1.5px",color:"rgba(255,255,255,0.55)",textTransform:"uppercase"}}>{children}</div>
      {count!=null&&<div style={{fontSize:"11px",fontWeight:600,color:"rgba(255,255,255,0.25)",background:"rgba(255,255,255,0.06)",borderRadius:"20px",padding:"1px 8px"}}>{count}</div>}
    </div>
  );
  return(
    <div style={{padding:"24px 28px",overflowY:"auto",flex:1,color:"#fff"}}>
      {/* TOP BAR */}
      <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"24px"}}>
        {onClose&&<button className="btn-ghost" onClick={onClose} style={{fontSize:"12px",padding:"8px 16px"}}>← Volver</button>}
        <div style={{flex:1}}/>
        <button className="btn-ghost" onClick={abrirEdit} style={{fontSize:"12px",borderColor:"rgba(39,33,232,0.4)",color:"#a5b4fc",padding:"8px 18px"}}>✏ Editar ficha</button>
      </div>

      {/* HEADER CLIENTE */}
      <div style={{display:"flex",gap:"20px",marginBottom:"28px",alignItems:"center"}}>
        <div style={{width:"72px",height:"72px",borderRadius:"50%",background:"rgba(39,33,232,0.25)",border:"2px solid rgba(39,33,232,0.5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"28px",fontWeight:700,color:"#818cf8",flexShrink:0}}>{clienta.nombre?.charAt(0)?.toUpperCase()||"?"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:"24px",fontWeight:700,marginBottom:"6px",lineHeight:1.2}}>{clienta.nombre}</div>
          <div style={{display:"flex",gap:"16px",fontSize:"13px",color:"rgba(255,255,255,0.6)",flexWrap:"wrap",marginBottom:"4px"}}>
            {clienta.telefono&&<span>📱 {clienta.telefono}</span>}
            {clienta.fecha_nacimiento&&<span>🎂 {new Date(clienta.fecha_nacimiento+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})}</span>}
            {clienta.como_nos_conocio&&<span>📣 {clienta.como_nos_conocio}</span>}
          </div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>Desde {new Date(clienta.created_at).toLocaleDateString("es-MX",{month:"short",year:"numeric"})} · {clienta.sucursal_nombre}</div>
        </div>
      </div>

      {/* PRÓXIMA CITA */}
      {prox&&<div className="glass" style={{padding:"18px 20px",marginBottom:"24px",borderColor:"rgba(73,184,211,0.35)",background:"rgba(73,184,211,0.05)"}}>
        <SH>Próxima cita</SH>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>{prox.servicio}</div>
            <div style={{fontSize:"13px",color:"rgba(255,255,255,0.55)",textTransform:"capitalize"}}>{new Date(prox.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})} · {prox.hora_inicio}</div>
          </div>
          <div style={{fontSize:"20px",fontWeight:700,color:"#49B8D3"}}>S{prox.sesion_numero}</div>
        </div>
      </div>}

      {/* CITAS ABIERTAS */}
      {abiertas.length>0&&<div className="glass" style={{padding:"18px 20px",marginBottom:"24px",borderColor:"rgba(245,158,11,0.4)",background:"rgba(245,158,11,0.04)"}}>
        <SH>Pendiente de reagendar</SH>
        {abiertas.map(c=>(
          <div key={c.id} style={{marginBottom:"12px",padding:"12px 14px",background:"rgba(0,0,0,0.2)",borderRadius:"10px",border:"1px solid rgba(245,158,11,0.15)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"10px"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:"14px",fontWeight:700,marginBottom:"3px"}}>{c.servicio}</div>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginBottom:c.razon_perdida?"6px":"0"}}>Sesión {c.sesion_numero} · Fecha original: {new Date(c.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</div>
                {c.razon_perdida&&<div style={{fontSize:"12px",color:"rgba(255,200,50,0.8)",fontStyle:"italic",lineHeight:1.4}}>"{c.razon_perdida}"</div>}
              </div>
              <button className="btn-ghost" style={{color:"#f59e0b",borderColor:"rgba(245,158,11,0.4)",fontSize:"12px",padding:"8px 14px",whiteSpace:"nowrap",flexShrink:0}} onClick={()=>{setReagendarAbierta(c);setFechaRAb("");setHoraRAb("");}}>↻ Reagendar</button>
            </div>
          </div>
        ))}
      </div>}

      {/* PAQUETES */}
      <div style={{marginBottom:"28px"}}>
        <SH count={paquetes.length}>Paquetes</SH>
        {paquetes.map(p=>{const isManten=/mantenimiento/i.test(p.servicio);const isZonas=/Pack Zonas?:/i.test(p.servicio);const barColor=isManten?(p.activo?"#f59e0b":"#10b981"):(p.activo?"#49B8D3":"#10b981");const pct=Math.min((p.sesiones_usadas/p.total_sesiones)*100,100);return(<div key={p.id} className="glass" style={{padding:"18px 20px",marginBottom:"10px",borderColor:isManten?"rgba(245,158,11,0.25)":"rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              <div style={{fontSize:"15px",fontWeight:700}}>{p.servicio}</div>
              {isManten&&<div style={{fontSize:"10px",padding:"3px 8px",borderRadius:"10px",background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.35)",color:"#f59e0b",fontWeight:700}}>MANTEN.</div>}
            </div>
            <div style={{fontSize:"13px",fontWeight:700,color:p.activo?"#10b981":"rgba(255,255,255,0.35)"}}>{p.activo?"Activo":"Completado"}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isZonas?"0":"8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              <div style={{fontSize:"13px",color:"rgba(255,255,255,0.55)"}}>Sesión {p.sesiones_usadas} de {p.total_sesiones}</div>
              {editingTotalId===p.id?(
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                  <input type="number" min="1" className="inp" value={newTotalVal} onChange={e=>setNewTotalVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")guardarTotalSesiones(p.id);if(e.key==="Escape"){setEditingTotalId(null);setNewTotalVal("");}}} style={{width:"60px",fontSize:"13px",padding:"3px 8px",textAlign:"center"}} autoFocus placeholder={String(p.total_sesiones)}/>
                  <button onClick={()=>guardarTotalSesiones(p.id)} style={{fontSize:"11px",padding:"3px 10px",borderRadius:"6px",background:"#10b981",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>OK</button>
                  <button onClick={()=>{setEditingTotalId(null);setNewTotalVal("");}} style={{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.1)",border:"none",color:"rgba(255,255,255,0.6)",cursor:"pointer"}}>✕</button>
                </div>
              ):(
                <button onClick={()=>{setEditingTotalId(p.id);setNewTotalVal(String(p.total_sesiones));}} style={{fontSize:"10px",padding:"2px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.45)",cursor:"pointer"}} title="Ajustar total de sesiones">✎ Total</button>
              )}
            </div>
            {!isZonas&&<div style={{fontSize:"13px",fontWeight:600,color:barColor}}>{pct.toFixed(0)}%</div>}
          </div>
          {!isZonas&&<div style={{height:"6px",background:"rgba(255,255,255,0.08)",borderRadius:"3px"}}><div style={{width:`${pct}%`,height:"100%",background:barColor,borderRadius:"3px",transition:"width 0.3s"}}/></div>}
        </div>);})}
        {paquetes.length===0&&<div style={{fontSize:"14px",color:"rgba(255,255,255,0.25)",padding:"16px 0"}}>Sin paquetes registrados</div>}
      </div>

      {/* AVANCE POR ZONA */}
      {paquetes.map(paq=>{
        const totalReq=paq.total_sesiones||8;
        const citasPaq=citasH.filter(c=>c.paquete_id===paq.id&&c.parametros_equipo?.length>0).sort((a,b)=>a.sesion_numero-b.sesion_numero);
        const zonasDelNombre=(()=>{const m=paq.servicio?.match(/Pack Zonas?:\s*(.+?)\s*\(\d+\s*ses\)/i);if(!m)return[];return m[1].split(",").map(z=>z.trim()).filter(Boolean);})();
        const zonasDeEquipo=[...new Set(citasPaq.flatMap(c=>(c.parametros_equipo||[]).map(p=>p.zona)))];
        const zonas=[...new Set([...zonasDelNombre,...zonasDeEquipo])];
        if(!zonas.length)return null;
        const zonData={};
        zonas.forEach(zona=>{zonData[zona]=citasPaq.map(c=>{const param=(c.parametros_equipo||[]).find(p=>p.zona===zona);if(!param)return null;return{sesion:c.sesion_numero,fecha:c.fecha,valores:param.valores,status:param.status||null,razon:param.razon||""};}).filter(Boolean);});
        return(<div key={paq.id} style={{marginBottom:"28px"}}>
          <SH>Avance por zona — {paq.servicio}</SH>
          {zonas.map(zona=>{
            const registros=zonData[zona];
            const completadas=registros.filter(r=>r.status==="completado").length;
            const noCompletadas=registros.filter(r=>r.status==="pendiente"||r.status==="perdida");
            const pct=Math.min(completadas/totalReq,1);
            const barColor=completadas===totalReq?"#10b981":completadas>0?"#49B8D3":"rgba(255,255,255,0.15)";
            return(<div key={zona} style={{marginBottom:"12px",background:"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"16px",border:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                <div style={{fontSize:"14px",fontWeight:600}}>{zona}</div>
                <div style={{fontSize:"13px",fontWeight:700,color:completadas===totalReq?"#10b981":completadas>0?"#49B8D3":"rgba(255,255,255,0.35)"}}>{completadas}/{totalReq} <span style={{fontWeight:400,fontSize:"11px",color:"rgba(255,255,255,0.35)"}}>completadas</span></div>
              </div>
              <div style={{height:"6px",background:"rgba(255,255,255,0.08)",borderRadius:"3px",marginBottom:"12px",overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:barColor,borderRadius:"3px",transition:"width 0.3s"}}/></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:noCompletadas.length>0?"12px":"0"}}>
                {registros.map(r=>{const sc=r.status==="completado"?"#10b981":r.status==="pendiente"?"#f59e0b":r.status==="perdida"?"#ef4444":"rgba(255,255,255,0.3)";const sbg=r.status==="completado"?"rgba(16,185,129,0.12)":r.status==="pendiente"?"rgba(245,158,11,0.12)":r.status==="perdida"?"rgba(239,68,68,0.12)":"rgba(255,255,255,0.05)";const icon=r.status==="completado"?"✓":r.status==="pendiente"?"⏸":r.status==="perdida"?"✕":"·";return(<div key={r.sesion} style={{display:"flex",alignItems:"center",gap:"5px",background:sbg,border:`1px solid ${sc}44`,borderRadius:"8px",padding:"5px 10px"}}><span style={{fontSize:"11px",color:sc,fontWeight:700}}>{icon}</span><span style={{fontSize:"11px",color:"rgba(255,255,255,0.65)"}}>S{r.sesion}</span>{r.valores&&<span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",fontFamily:"monospace"}}>{r.valores}</span>}</div>);})}
              </div>
              {noCompletadas.map(r=>(<div key={r.sesion} style={{marginTop:"6px",padding:"10px 12px",background:r.status==="perdida"?"rgba(239,68,68,0.07)":"rgba(245,158,11,0.07)",border:`1px solid ${r.status==="perdida"?"rgba(239,68,68,0.25)":"rgba(245,158,11,0.25)"}`,borderRadius:"8px"}}><div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:r.razon?"5px":"0"}}><span style={{fontSize:"10px",fontWeight:700,color:r.status==="perdida"?"#ef4444":"#f59e0b",textTransform:"uppercase",letterSpacing:"0.5px"}}>{r.status==="perdida"?"✕ Perdida":"⏸ Pendiente"}</span><span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Ses. {r.sesion} · {new Date(r.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</span></div>{r.razon&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.6)",fontStyle:"italic"}}>"{r.razon}"</div>}</div>))}
            </div>);
          })}
        </div>);
      })}

      {/* HISTORIAL DE SESIONES */}
      <div style={{marginBottom:"28px"}}>
        <SH count={citasH.filter(c=>c.estado==="completada").length+" completadas"}>Historial</SH>
        {citasH.map(c=>{
          const esComp=c.estado==="completada",esProx=c.estado==="agendada",esAb=c.estado==="abierta",esPerd=c.estado==="perdida";
          return(<div key={c.id} style={{display:"flex",gap:"14px",alignItems:"center",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{width:"8px",height:"8px",borderRadius:"50%",background:esComp?"#10b981":esProx?colorCita(c):esAb?"#f59e0b":esPerd?"#eab308":"rgba(255,255,255,0.15)",flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:"14px",fontWeight:600,marginBottom:"2px"}}>{c.servicio} <span style={{color:"rgba(255,255,255,0.35)",fontWeight:400}}>· S{c.sesion_numero}</span></div>
              <div style={{fontSize:"12px",color:"rgba(255,255,255,0.45)"}}>{new Date(c.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})} · {c.hora_inicio}</div>
              {esPerd&&c.razon_perdida&&<div style={{fontSize:"11px",color:"rgba(234,179,8,0.7)",marginTop:"2px"}}>✗ {c.razon_perdida}</div>}
            </div>
            <div style={{fontSize:"12px",fontWeight:700,color:esComp?"#10b981":esProx?"#49B8D3":esAb?"#f59e0b":esPerd?"#eab308":"rgba(255,255,255,0.2)"}}>{esComp?"✓":esProx?"Próx.":esAb?"📅":esPerd?"✗":"✕"}</div>
          </div>);
        })}
        {citasH.length===0&&<div style={{fontSize:"14px",color:"rgba(255,255,255,0.2)",padding:"16px 0"}}>Sin sesiones</div>}
      </div>

      {/* REAGENDAR CITA ABIERTA */}
      {reagendarAbierta&&<div className="overlay"><div className="glass" style={{width:500,maxHeight:"90vh",overflow:"auto",padding:"28px",borderColor:"rgba(245,158,11,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:"20px"}}><div style={{fontSize:"28px",marginBottom:"8px"}}>↻</div><div style={{fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>Reagendar cita abierta</div><div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>Sesión {reagendarAbierta.sesion_numero} · {reagendarAbierta.servicio}</div></div>
        <div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>NUEVA FECHA</div><input type="date" className="inp" value={fechaRAb} onChange={e=>{setFechaRAb(e.target.value);setHoraRAb("");}} style={{colorScheme:"dark"}}/></div>
        {fechaRAb&&new Date(fechaRAb+"T12:00:00").getDay()!==0&&<div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>NUEVA HORA</div><MiniAgendaDia session={session} fecha={fechaRAb} onSelectHora={h=>setHoraRAb(h)} horaSeleccionada={horaRAb} duracion={getDuracionServicio(reagendarAbierta.servicio,reagendarAbierta.tipo_servicio)??TIPOS_SVC.find(t=>t.id===reagendarAbierta.tipo_servicio)?.duracion??60}/></div>}
        {fechaRAb&&new Date(fechaRAb+"T12:00:00").getDay()===0&&<div style={{fontSize:"11px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ Domingo — cerrado</div>}
        <div style={{display:"flex",gap:"8px"}}><button className="btn-ghost" style={{flex:1}} onClick={()=>{setReagendarAbierta(null);setFechaRAb("");setHoraRAb("");}}>Cancelar</button><button className="btn-ghost" style={{flex:2,padding:"12px",color:"#f59e0b",borderColor:"rgba(245,158,11,0.4)",fontWeight:600,fontSize:"13px"}} disabled={!fechaRAb||!horaRAb||savingReag||new Date(fechaRAb+"T12:00:00").getDay()===0} onClick={reagendarDesdeAbierta}>{savingReag?"Reagendando...":"↻ Confirmar reagendamiento"}</button></div>
      </div></div>}

      {/* HISTORIAL DE PAGOS */}
      {(()=>{
        const entradas=citasH.flatMap(c=>{
          const res=[];
          // Anticipo guardado en campos dedicados (flujo nuevo)
          if(c.anticipo_metodo)res.push({key:`${c.id}-ant`,fecha:c.fecha,hora:c.hora_inicio,tipo:"anticipo",metodo:c.anticipo_metodo,monto:c.anticipo_monto,ticket:c.anticipo_ticket,servicio:c.servicio,sesion:c.sesion_numero});
          // Liquidación
          if(c.es_cobro&&c.metodo_pago)res.push({key:`${c.id}-liq`,fecha:c.fecha,hora:c.hora_inicio,tipo:"liquidacion",metodo:c.metodo_pago,monto:c.total_pagado,ticket:c.ticket_zettle,servicio:c.servicio,sesion:c.sesion_numero});
          // Backward compat: anticipo guardado en metodo_pago antes de tener anticipo_metodo
          if(!c.anticipo_metodo&&!c.es_cobro&&c.metodo_pago)res.push({key:`${c.id}-ant`,fecha:c.fecha,hora:c.hora_inicio,tipo:"anticipo",metodo:c.metodo_pago,monto:c.total_pagado,ticket:c.ticket_zettle,servicio:c.servicio,sesion:c.sesion_numero});
          return res;
        }).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora));
        if(!entradas.length)return null;
        return(<div style={{marginBottom:"28px"}}>
          <SH count={entradas.length}>Historial de pagos</SH>
          {entradas.map(e=>{const esAnt=e.tipo==="anticipo";return(
            <div key={e.key} style={{padding:"16px 18px",marginBottom:"10px",background:esAnt?"rgba(249,115,22,0.07)":"rgba(16,185,129,0.07)",border:`1px solid ${esAnt?"rgba(249,115,22,0.25)":"rgba(16,185,129,0.2)"}`,borderRadius:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{fontSize:"18px",fontWeight:700,color:esAnt?"#f97316":"#10b981"}}>{e.monto?fmt(e.monto):"—"}</div>
                  <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.5px",padding:"3px 8px",borderRadius:"8px",background:esAnt?"rgba(249,115,22,0.15)":"rgba(16,185,129,0.15)",color:esAnt?"#f97316":"#10b981"}}>{esAnt?"ANTICIPO":"LIQUIDACIÓN"}</div>
                </div>
                {e.ticket&&<div style={{fontSize:"13px",color:"rgba(255,255,255,0.6)",fontFamily:"monospace",fontWeight:700,background:"rgba(255,255,255,0.07)",borderRadius:"6px",padding:"3px 10px"}}>{e.ticket}</div>}
              </div>
              <div style={{fontSize:"13px",fontWeight:600,color:"rgba(255,255,255,0.8)",marginBottom:"4px"}}>{e.metodo}</div>
              <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)"}}>{new Date(e.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})} · {e.servicio} S{e.sesion}</div>
            </div>
          );})}
        </div>);
      })()}
    </div>
  );
}

// Agrupa citas del mismo cliente a la misma hora en un solo bloque visual
function groupCitasConcurrentes(citas){
  const seen={};const result=[];
  for(const c of citas){
    const key=`${c.clienta_id||c.clienta_nombre}||${c.hora_inicio.slice(0,5)}`;
    if(!seen[key]){seen[key]={...c,_extras:[]};result.push(seen[key]);}
    else{seen[key]._extras.push(c);}
  }
  return result;
}
// Calcula posiciones de columna para citas solapadas en el mismo día
function layoutCitas(citas){
  const getMin=c=>{const[h,m]=c.hora_inicio.split(":").map(Number);return h*60+m;};
  const getEnd=c=>{if(c.hora_fin){const[h,m]=c.hora_fin.split(":").map(Number);return h*60+m;}return getMin(c)+(c.duracion_min||60);};
  const sorted=[...citas].sort((a,b)=>a.hora_inicio.localeCompare(b.hora_inicio));
  const cols=[];
  const asgn=sorted.map(c=>{const s=getMin(c);let ci=0;while(ci<cols.length&&cols[ci]>s)ci++;if(ci===cols.length)cols.push(0);cols[ci]=getEnd(c);return{id:c.id,col:ci};});
  const res={};
  sorted.forEach((c,i)=>{const sA=getMin(c),eA=getEnd(c);let mx=asgn[i].col;sorted.forEach((d,j)=>{if(i===j)return;if(sA<getEnd(d)&&getMin(d)<eA)mx=Math.max(mx,asgn[j].col);});res[c.id]={col:asgn[i].col,total:mx+1};});
  return res;
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENDA CALENDAR — sin "Nueva cita", con siguiente sesión al completar
// ══════════════════════════════════════════════════════════════════════════════
function AgendaCalendar({session,onVerFicha,isAdmin}){
  const[semana,setSemana]=useState(semanaD(hoy()));const[citas,setCitas]=useState([]);const[detalle,setDetalle]=useState(null);const[saving,setSaving]=useState(false);
  const[modalSig,setModalSig]=useState(false);const[citaComp,setCitaComp]=useState(null);const[horaSig,setHoraSig]=useState("");const[fechaSig,setFechaSig]=useState("");
  const[showCobro,setShowCobro]=useState(false);const[citaCobro,setCitaCobro]=useState(null);const[pagosAg,setPagosAg]=useState([{metodo:"",monto:0}]);const[msiSelAg,setMsiSelAg]=useState(0);const[descuentoAg,setDescuentoAg]=useState(0);const[savingCobro,setSavingCobro]=useState(false);
  const[terminalesAg,setTerminalesAg]=useState([]);const[termSelAg,setTermSelAg]=useState({});const[ticketZettle,setTicketZettle]=useState("");const[fechaTicketAg,setFechaTicketAg]=useState(hoy());
  const[parametrosEdit,setParametrosEdit]=useState([]);const[savingParams,setSavingParams]=useState(false);const[zonaNew,setZonaNew]=useState("");const[valNew,setValNew]=useState("");const[historialParams,setHistorialParams]=useState([]);const[modalReagendar,setModalReagendar]=useState(false);const[citaReagendar,setCitaReagendar]=useState(null);const[fechaRe,setFechaRe]=useState("");const[horaRe,setHoraRe]=useState("");const[modalSinDatos,setModalSinDatos]=useState(false);const[citaSinDatos,setCitaSinDatos]=useState(null);const[datosPendientesMode,setDatosPendientesMode]=useState(false);const[confirmDelCita,setConfirmDelCita]=useState(false);
  const[hoverCita,setHoverCita]=useState(null);const[hoverPos,setHoverPos]=useState({x:0,y:0});const hoverTimer=useRef(null);
  const[modalPerdida,setModalPerdida]=useState(false);const[citaPerdida,setCitaPerdida]=useState(null);const[razonPerdida,setRazonPerdida]=useState("");
  const[editSesionNum,setEditSesionNum]=useState(null);const[savingSesion,setSavingSesion]=useState(false);
  const mRef=useRef(true);useEffect(()=>{mRef.current=true;return()=>{mRef.current=false;};},[]);
  const cargar=async()=>{const{data}=await supabase.from("citas").select("*").eq("sucursal_id",session.id).gte("fecha",semana[0]).lte("fecha",semana[5]).order("hora_inicio");if(data)setCitas(data);};
  useEffect(()=>{cargar();},[semana,session]);
  useEffect(()=>{(async()=>{try{const{data,error}=await supabase.from("terminales").select("*").eq("sucursal_id",session.id).eq("activa",true).order("nombre");if(!error&&data?.length>0)setTerminalesAg(data);else setTerminalesAg(TERMINALES_DEFAULT);}catch(e){setTerminalesAg(TERMINALES_DEFAULT);}})();},[session.id]);
  useEffect(()=>{if(detalle){setParametrosEdit(detalle.parametros_equipo||[]);setZonaNew("");setValNew("");}else{setParametrosEdit([]);setHistorialParams([]);setConfirmDelCita(false);}setEditSesionNum(null);},[detalle?.id]);
  useEffect(()=>{if(!detalle?.clienta_id||!detalle?.paquete_id)return;(async()=>{const{data}=await supabase.from("citas").select("sesion_numero,fecha,parametros_equipo").eq("clienta_id",detalle.clienta_id).eq("paquete_id",detalle.paquete_id).not("parametros_equipo","is",null).neq("id",detalle.id).order("sesion_numero",{ascending:false}).limit(5);setHistorialParams((data||[]).filter(c=>c.parametros_equipo?.length>0));})();},[detalle?.id]);
  const completar=async(cita,datosPendientes=false)=>{
    const isDatPend=datosPendientes||datosPendientesMode;
    const upd={estado:"completada",datos_pendientes:isDatPend};
    if(parametrosEdit.length>0)upd.parametros_equipo=parametrosEdit;
    await supabase.from("citas").update(upd).eq("id",cita.id);
    // Completar también citas agrupadas (mismo cliente, misma hora)
    if(cita._extras?.length){
      for(const extra of cita._extras){
        await supabase.from("citas").update({estado:"completada",datos_pendientes:isDatPend}).eq("id",extra.id);
        if(extra.paquete_id){
          const{data:paqE}=await supabase.from("paquetes").select("*").eq("id",extra.paquete_id).single();
          if(paqE){const nsE=paqE.sesiones_usadas+1;await supabase.from("paquetes").update({sesiones_usadas:nsE,activo:nsE<paqE.total_sesiones}).eq("id",paqE.id);}
        }
      }
    }
    setDatosPendientesMode(false);setDetalle(null);
    if(cita.paquete_id&&mRef.current){
      const{data:paq}=await supabase.from("paquetes").select("*").eq("id",cita.paquete_id).single();
      if(paq&&mRef.current){const ns=paq.sesiones_usadas+1;await supabase.from("paquetes").update({sesiones_usadas:ns,activo:ns<paq.total_sesiones}).eq("id",paq.id);
        if(ns<paq.total_sesiones){const b=new Date(cita.fecha+"T12:00:00");b.setMonth(b.getMonth()+1);setFechaSig(b.toISOString().slice(0,10));setHoraSig(cita.hora_inicio);setCitaComp({...cita,paquete:{...paq,sesiones_usadas:ns}});setModalSig(true);}
      }
    }
    if(mRef.current)cargar();
  };
  const agSig=async()=>{if(!fechaSig||!horaSig||!citaComp)return;setSaving(true);try{
    const tipoCC=TIPOS_SVC.find(t=>t.id===citaComp.tipo_servicio);const dur=getDuracionServicio(citaComp.servicio,citaComp.tipo_servicio)??tipoCC?.duracion??60;const sN=citaComp.paquete.sesiones_usadas+1;
    await supabase.from("citas").insert([{clienta_id:citaComp.clienta_id,clienta_nombre:citaComp.clienta_nombre,paquete_id:citaComp.paquete_id,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:citaComp.servicio,tipo_servicio:citaComp.tipo_servicio,duracion_min:dur,fecha:fechaSig,hora_inicio:horaSig,hora_fin:horaFin(horaSig,dur),sesion_numero:sN,es_cobro:false,estado:"agendada",notas:"Agendada tras completar sesión"}]);
    setModalSig(false);setCitaComp(null);cargar();
  }catch(e){console.error(e);}setSaving(false);};
  const cancelar=async(id,pId,sU)=>{await supabase.from("citas").update({estado:"cancelada"}).eq("id",id);if(pId)await supabase.from("paquetes").update({sesiones_usadas:Math.max(0,sU-1),activo:true}).eq("id",pId);setDetalle(null);cargar();};
  const marcarPerdida=async()=>{if(!citaPerdida||!razonPerdida.trim())return;await supabase.from("citas").update({estado:"perdida",razon_perdida:razonPerdida.trim()}).eq("id",citaPerdida.id);setModalPerdida(false);setCitaPerdida(null);setRazonPerdida("");setDetalle(null);cargar();};
  const marcarAbierta=async()=>{if(!citaPerdida)return;const upd={estado:"abierta"};if(razonPerdida.trim())upd.razon_perdida=razonPerdida.trim();await supabase.from("citas").update(upd).eq("id",citaPerdida.id);setModalPerdida(false);setCitaPerdida(null);setRazonPerdida("");setDetalle(null);cargar();};
  const guardarSesionNum=async(cita,nSes)=>{
    if(!nSes||nSes<1||nSes===cita.sesion_numero)return;
    setSavingSesion(true);
    try{
      await supabase.from("citas").update({sesion_numero:nSes}).eq("id",cita.id);
      if(cita.paquete_id&&cita.clienta_id){
        const{data:prev}=await supabase.from("citas").select("id").eq("clienta_id",cita.clienta_id).eq("paquete_id",cita.paquete_id).neq("id",cita.id).lt("sesion_numero",nSes);
        if(prev?.length)for(const p of prev)await supabase.from("citas").update({estado:"completada"}).eq("id",p.id);
        await supabase.from("paquetes").update({sesiones_usadas:nSes-1}).eq("id",cita.paquete_id);
      }
      setEditSesionNum(null);setDetalle(null);cargar();
    }catch(e){console.error(e);}
    setSavingSesion(false);
  };
  const eliminarCita=async()=>{if(!detalle)return;await supabase.from("citas").delete().eq("id",detalle.id);if(detalle.paquete_id&&detalle.estado==="completada"){const{data:paq}=await supabase.from("paquetes").select("*").eq("id",detalle.paquete_id).single();if(paq){const ns=Math.max(0,paq.sesiones_usadas-1);await supabase.from("paquetes").update({sesiones_usadas:ns,activo:true}).eq("id",paq.id);}}setDetalle(null);setConfirmDelCita(false);cargar();};
  const reagendar=async()=>{if(!fechaRe||!horaRe||!citaReagendar)return;setSaving(true);try{
    const tipoCR=TIPOS_SVC.find(t=>t.id===citaReagendar.tipo_servicio);const dur=getDuracionServicio(citaReagendar.servicio,citaReagendar.tipo_servicio)??tipoCR?.duracion??60;
    await supabase.from("citas").update({estado:"cancelada"}).eq("id",citaReagendar.id);
    await supabase.from("citas").insert([{clienta_id:citaReagendar.clienta_id,clienta_nombre:citaReagendar.clienta_nombre,paquete_id:citaReagendar.paquete_id,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:citaReagendar.servicio,tipo_servicio:citaReagendar.tipo_servicio,duracion_min:dur,fecha:fechaRe,hora_inicio:horaRe,hora_fin:horaFin(horaRe,dur),sesion_numero:citaReagendar.sesion_numero,es_cobro:citaReagendar.es_cobro,estado:"agendada",notas:`Reagendada · Antes: ${citaReagendar.fecha} ${citaReagendar.hora_inicio}`+(citaReagendar.notas?` · ${citaReagendar.notas}`:"")}]);
    setModalReagendar(false);setCitaReagendar(null);setDetalle(null);cargar();
  }catch(e){console.error(e);}setSaving(false);};
  const guardarParametros=async()=>{if(!detalle)return;setSavingParams(true);try{const upd={parametros_equipo:parametrosEdit};if(detalle.datos_pendientes)upd.datos_pendientes=false;await supabase.from("citas").update(upd).eq("id",detalle.id);setDetalle({...detalle,parametros_equipo:parametrosEdit,datos_pendientes:false});cargar();}catch(e){console.error(e);}setSavingParams(false);};
  const intentarCompletar=async(cita)=>{
    if(parametrosEdit.length===0){setCitaSinDatos(cita);setModalSinDatos(true);return;}
    await supabase.from("citas").update({parametros_equipo:parametrosEdit}).eq("id",cita.id);
    abrirCobro(cita);
  };

  // Intercepta "Completada" — si hay anticipo pendiente o cita sin anticipo, abre modal de cobro primero
  const abrirCobro=async(cita)=>{
    const mAnticipo=cita.notas?.match(/Anticipo \$(\d+)/);
    const sinAnt=cita.notas?.includes("Sin anticipo");
    if((mAnticipo||sinAnt)&&!cita.es_cobro&&cita.paquete_id){
      const anticoMonto=mAnticipo?Number(mAnticipo[1]):0;
      const{data:paq}=await supabase.from("paquetes").select("*").eq("id",cita.paquete_id).single();
      const paqPrecio=paq?.precio||0;
      const restante=paqPrecio-anticoMonto;
      setCitaCobro({cita,paqPrecio,anticoMonto,restante,paq});
      setPagosAg([{metodo:"",monto:restante}]);setMsiSelAg(0);setDescuentoAg(0);setTicketZettle("");setFechaTicketAg(hoy());
      setShowCobro(true);
    }else{completar(cita);}
  };

  const cobrarYCompletar=async()=>{
    if(!citaCobro)return;setSavingCobro(true);
    try{
      const{cita,paqPrecio,anticoMonto,restante}=citaCobro;
      const mpago=pagosAg.length===1?(pagosAg[0].metodo+(msiSelAg>0?` ${msiSelAg}MSI`:"")+( ["Débito","Crédito"].includes(pagosAg[0].metodo)&&termSelAg[0]?` · ${termSelAg[0]}`:"")):pagosAg.filter(p=>p.metodo&&p.monto>0).map((p,i)=>`${p.metodo}${["Débito","Crédito"].includes(p.metodo)&&termSelAg[i]?` · ${termSelAg[i]}`:""} ${fmt(p.monto)}`).join(" + ");
      const totalFinal=pagosAg.length===1?Math.round(paqPrecio*(1-descuentoAg/100)-anticoMonto):pagosAg.reduce((s,p)=>s+p.monto,0);
      const tNum=await nextTicketNum();
      await supabase.from("tickets").insert([{ticket_num:tNum,sucursal_id:session.id,sucursal_nombre:session.nombre,servicios:[cita.servicio],total:totalFinal,metodo_pago:`Liquidación ${mpago}`,descuento:pagosAg.length===1?descuentoAg:0,tipo_clienta:"Recompra",fecha:fechaTicketAg,clienta_id:cita.clienta_id||null,clienta_nombre:cita.clienta_nombre||null}]);
      const tzVal=ticketZettle.trim()?(ticketZettle.trim().startsWith("#")?ticketZettle.trim():"#"+ticketZettle.trim()):null;
      await supabase.from("citas").update({es_cobro:true,metodo_pago:mpago,total_pagado:totalFinal,...(tzVal?{ticket_zettle:tzVal}:{})}).eq("id",cita.id);
      setShowCobro(false);setCitaCobro(null);
      await completar(cita);
    }catch(e){console.error(e);}setSavingCobro(false);
  };
  const semAnt=()=>{const d=new Date(semana[0]+"T12:00:00");d.setDate(d.getDate()-7);setSemana(semanaD(d.toISOString().slice(0,10)));};
  const semSig=()=>{const d=new Date(semana[0]+"T12:00:00");d.setDate(d.getDate()+7);setSemana(semanaD(d.toISOString().slice(0,10)));};
  const cdDia=(f)=>citas.filter(c=>c.fecha===f&&c.estado!=="cancelada"&&c.estado!=="abierta");
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 64px)",background:"#fff",color:"#111"}}>
      <div style={{padding:"12px 20px",borderBottom:"1px solid #e0e0e0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button className="btn-ghost" style={{padding:"6px 14px",color:"#333",borderColor:"#ccc"}} onClick={()=>setSemana(semanaD(hoy()))}>Hoy</button>
          <button onClick={semAnt} style={{background:"none",border:"1px solid #ccc",borderRadius:"8px",color:"#333",cursor:"pointer",padding:"6px 10px",fontSize:"14px"}}>‹</button>
          <button onClick={semSig} style={{background:"none",border:"1px solid #ccc",borderRadius:"8px",color:"#333",cursor:"pointer",padding:"6px 10px",fontSize:"14px"}}>›</button>
          <div style={{fontSize:"16px",fontWeight:600,textTransform:"capitalize",color:"#111"}}>{new Date(semana[0]+"T12:00:00").toLocaleDateString("es-MX",{month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>{[{color:"#039BE5",label:"Láser"},{color:"#3F51B5",label:"HIFU 4D"},{color:"#E67C73",label:"Facial"},{color:"#8E24AA",label:"Moldeo"},{color:"#33B679",label:"Cera"},{color:"#10b981",label:"Post Op"},{color:"#D50000",label:"1ª sesión"}].map(t=><div key={t.label} style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"10px",color:"#555"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:t.color}}/>{t.label}</div>)}</div>
      </div>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"52px repeat(6,1fr)",borderBottom:"1px solid #e0e0e0",position:"sticky",top:0,background:"#fff",zIndex:10}}>
          <div/>
          {semana.map(f=>{const d=new Date(f+"T12:00:00").getDay(),e=f===hoy(),a=HORARIOS[d]!==null;return(
            <div key={f} style={{padding:"10px 8px",textAlign:"center",opacity:a?1:0.4}}>
              <div style={{fontSize:"10px",color:"#777",letterSpacing:"1px",marginBottom:"4px"}}>{DIAS_L[d].toUpperCase()}</div>
              <div style={{width:"32px",height:"32px",borderRadius:"50%",background:e?"#2721E8":"transparent",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"16px",fontWeight:e?700:400,color:e?"#fff":"#111"}}>{f.slice(8)}</span></div>
            </div>);})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"52px repeat(6,1fr)",position:"relative"}}>
          <div>{HORAS.map(h=><div key={h} style={{height:"64px",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",paddingRight:"8px",paddingTop:"2px"}}><span style={{fontSize:"10px",color:"#999"}}>{h>12?`${h-12}pm`:h===12?"12pm":`${h}am`}</span></div>)}</div>
          {semana.map(f=>{const d=new Date(f+"T12:00:00").getDay(),a=HORARIOS[d]!==null,cd=cdDia(f),cdG=groupCitasConcurrentes(cd),ly=layoutCitas(cdG);return(
            <div key={f} style={{borderLeft:"1px solid #e8e8e8",position:"relative",opacity:a?1:0.3}}>
              {HORAS.map(h=><div key={h} style={{height:"64px",borderBottom:"1px solid #f0f0f0"}}/>)}
              {cdG.map(c=>{const[ch,cm]=c.hora_inicio.split(":").map(Number),top=(ch-9)*64+cm*PX_POR_MIN,_durMin=c.hora_fin?(()=>{const[fh,fm]=c.hora_fin.split(":").map(Number);return(fh*60+fm)-(ch*60+cm);})():(c.duracion_min||60),height=Math.max(_durMin*PX_POR_MIN-2,20),col=colorCita(c),sinAnt=c.notas?.includes("Sin anticipo"),aparto=!c.es_cobro&&!!c.notas?.match(/Anticipo \$/),liquido=c.es_cobro,reag=c.notas?.startsWith("Reagendada"),datPend=c.datos_pendientes&&c.estado==="completada",done=c.estado==="completada",lyt=ly[c.id]||{col:0,total:1},lLeft=`calc(${lyt.col/lyt.total*100}% + 1px)`,lRight=`calc(${(lyt.total-lyt.col-1)/lyt.total*100}% + 1px)`,bg=c.estado==="perdida"?"#eab308CC":datPend?"#f59e0bEE":(done?`${col}88`:`${col}EE`);
              const todosServs=[c.servicio,...(c._extras||[]).map(e=>e.servicio)];
              return(
                <div key={c.id} onClick={e=>{e.stopPropagation();clearTimeout(hoverTimer.current);setHoverCita(null);setDetalle(c);}} style={{position:"absolute",left:lLeft,right:lRight,top:`${top}px`,height:`${height}px`,background:bg,borderRadius:"5px",padding:"3px 5px",cursor:"pointer",overflow:"hidden",zIndex:5,boxShadow:"0 1px 2px rgba(0,0,0,0.18)"}} onMouseEnter={e=>{e.currentTarget.style.filter="brightness(0.88)";const rect=e.currentTarget.getBoundingClientRect();clearTimeout(hoverTimer.current);hoverTimer.current=setTimeout(()=>{setHoverCita(c);setHoverPos({x:rect.right+8,y:rect.top});},900);}} onMouseLeave={e=>{e.currentTarget.style.filter="";clearTimeout(hoverTimer.current);setHoverCita(null);}}>
                  <div style={{fontSize:"10px",fontWeight:700,color:"#fff",lineHeight:1.1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:"0 1px 1px rgba(0,0,0,0.25)"}}>{c.estado==="perdida"?"✗":datPend?"📋":sinAnt?"⚠":aparto?"💰":liquido?"✅":reag?"↻":""}{(c.estado==="perdida"||datPend||sinAnt||aparto||liquido||reag)?" ":""}{c.hora_inicio} {c.clienta_nombre}</div>
                  {height>28&&<div style={{fontSize:"9px",color:"rgba(255,255,255,0.9)",marginTop:"1px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.estado==="perdida"?"No se presentó":datPend?"Datos pendientes":todosServs.join(" + ")}</div>}
                </div>);})}
              {f===hoy()&&(()=>{const n=new Date(),m=(n.getHours()-9)*60+n.getMinutes();if(m<0||m>720)return null;return<div style={{position:"absolute",left:0,right:0,top:`${m*PX_POR_MIN}px`,height:"2px",background:"#ff4444",zIndex:6,pointerEvents:"none"}}><div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#ff4444",position:"absolute",left:"-4px",top:"-3px"}}/></div>;})()}
            </div>);})}
        </div>
      </div>
      {hoverCita&&!detalle&&(()=>{const c=hoverCita,col=colorCita(c),sinAnt=c.notas?.includes("Sin anticipo"),aparto=!c.es_cobro&&!!c.notas?.match(/Anticipo \$/),liquido=c.es_cobro,reag=c.notas?.startsWith("Reagendada"),datPend=c.datos_pendientes&&c.estado==="completada";const vp=window.innerHeight;const cardH=200;const y=hoverPos.y+cardH>vp?hoverPos.y-cardH:hoverPos.y;const x=hoverPos.x+260>window.innerWidth?hoverPos.x-280:hoverPos.x;return(<div style={{position:"fixed",left:`${x}px`,top:`${y}px`,zIndex:9999,pointerEvents:"none",animation:"fadeIn 0.15s ease"}}>
        <div style={{width:240,background:"rgba(12,12,20,0.97)",border:`1px solid ${col}55`,borderRadius:"12px",padding:"14px 16px",boxShadow:`0 8px 32px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.04)`,backdropFilter:"blur(16px)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
            <div style={{width:"8px",height:"8px",borderRadius:"50%",background:col,flexShrink:0}}/>
            <div style={{fontSize:"13px",fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.clienta_nombre}</div>
          </div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.5)",marginBottom:c.servicios_sesion?.length>0?"4px":"8px",fontWeight:500}}>{c.servicio}</div>
          {c.servicios_sesion?.length>0&&<div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",marginBottom:"8px"}}>+ {c.servicios_sesion.map(s=>s.servicio).join(" · ")}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Horario</span><span style={{color:"#fff",fontWeight:600}}>{c.hora_inicio} – {c.hora_fin}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Sesión</span><span style={{color:"#fff",fontWeight:600}}>#{c.sesion_numero}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Estado</span><span style={{fontWeight:600,color:c.estado==="completada"?"#10b981":c.estado==="agendada"?col:c.estado==="perdida"?"#eab308":"rgba(255,255,255,0.3)"}}>{c.estado==="completada"?"✓ Completada":c.estado==="agendada"?"Agendada":c.estado==="perdida"?"✗ No se presentó":"Cancelada"}</span></div>
            {c.estado==="perdida"&&c.razon_perdida&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Motivo</span><span style={{fontWeight:500,color:"rgba(234,179,8,0.8)",maxWidth:"140px",textAlign:"right"}}>{c.razon_perdida}</span></div>}
            {c.agendado_por&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Agendó</span><span style={{color:"rgba(255,255,255,0.7)",fontWeight:500}}>{c.agendado_por}</span></div>}
            {c.metodo_pago&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Pago</span><span style={{color:"#10b981",fontWeight:600}}>{c.metodo_pago}</span></div>}
            {c.ticket_zettle&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Ticket</span><span style={{color:"rgba(255,255,255,0.7)",fontWeight:600,fontFamily:"monospace"}}>{c.ticket_zettle}</span></div>}
            {(sinAnt||aparto||liquido||reag||datPend)&&<div style={{marginTop:"4px",padding:"5px 8px",borderRadius:"6px",background:"rgba(255,255,255,0.04)",fontSize:"10px",color:"rgba(255,255,255,0.55)",display:"flex",alignItems:"center",gap:"5px"}}>{datPend?"📋 Datos pendientes":sinAnt?"⚠ Sin anticipo · cobrar al llegar":aparto?"💰 Anticipo — pendiente liquidar":liquido?"✅ Liquidada":reag?"↻ Reagendada":""}</div>}
          </div>
          <div style={{marginTop:"8px",paddingTop:"6px",borderTop:"1px solid rgba(255,255,255,0.05)",fontSize:"9px",color:"rgba(255,255,255,0.2)",textAlign:"center",letterSpacing:"0.5px"}}>Haz clic para abrir ficha completa</div>
        </div>
      </div>);})()}
      {detalle&&<div className="overlay" onClick={()=>setDetalle(null)}><div className="glass" style={{width:400,padding:"26px",borderColor:`${colorCita(detalle)}44`,color:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"16px"}}><div><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"3px"}}>CITA</div><div style={{fontSize:"18px",fontWeight:700}}>{detalle.clienta_nombre}</div>{detalle.notas?.startsWith("Reagendada")&&<div style={{fontSize:"10px",padding:"3px 8px",borderRadius:"10px",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.3)",color:"#f59e0b",marginTop:"4px",display:"inline-block"}}>↻ Reagendada</div>}</div><button onClick={()=>setDetalle(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:"22px"}}>×</button></div>
        <div style={{display:"flex",flexDirection:"column",gap:"9px",background:"rgba(0,0,0,0.3)",borderRadius:"10px",padding:"14px",marginBottom:"12px"}}>
          {[["Servicio",detalle.servicio],["Fecha",new Date(detalle.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})],["Horario",`${detalle.hora_inicio} – ${detalle.hora_fin}`],...(detalle.agendado_por?[["Agendó",detalle.agendado_por]]:[] )].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:"13px"}}><span style={{color:"rgba(255,255,255,0.4)"}}>{l}</span><span style={{fontWeight:500,color:"#fff"}}>{v}</span></div>)}
          {(detalle._extras?.length>0||detalle.servicios_sesion?.length>0)&&[
            ...(detalle._extras||[]).map(e=>({servicio:e.servicio,sesNum:e.sesion_numero})),
            ...(detalle.servicios_sesion||[])
          ].map((s,i)=>(
            <div key={`ss-${i}`} style={{display:"flex",justifyContent:"space-between",fontSize:"13px"}}>
              <span style={{color:"rgba(255,255,255,0.4)"}}>+ Servicio</span>
              <span style={{fontWeight:500,color:"#fff"}}>{s.servicio} · S{s.sesNum}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",alignItems:"center"}}>
            <span style={{color:"rgba(255,255,255,0.4)"}}>Sesión</span>
            {isAdmin&&detalle.estado==="agendada"?(
              <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                <input type="number" min="1" max="20" className="inp" value={editSesionNum!=null?editSesionNum:detalle.sesion_numero} onChange={e=>setEditSesionNum(parseInt(e.target.value)||1)} style={{width:"58px",textAlign:"center",fontSize:"13px",fontWeight:700,padding:"3px 6px"}}/>
                {editSesionNum!=null&&editSesionNum!==detalle.sesion_numero&&<button onClick={()=>guardarSesionNum(detalle,editSesionNum)} disabled={savingSesion} style={{background:"rgba(16,185,129,0.2)",border:"1px solid rgba(16,185,129,0.5)",borderRadius:"6px",color:"#10b981",cursor:"pointer",padding:"3px 10px",fontSize:"11px",fontWeight:700,fontFamily:"inherit"}}>{savingSesion?"...":"✓ Guardar"}</button>}
              </div>
            ):(
              <span style={{fontWeight:500,color:"#fff"}}>{detalle.sesion_numero}</span>
            )}
          </div>
          {isAdmin&&editSesionNum!=null&&editSesionNum>1&&editSesionNum!==detalle.sesion_numero&&<div style={{fontSize:"10px",color:"rgba(73,184,211,0.65)",textAlign:"right",marginTop:"-4px"}}>Las sesiones anteriores (1–{editSesionNum-1}) quedarán como completadas</div>}
        </div>
        <div style={{marginBottom:"12px",background:"rgba(0,0,0,0.25)",borderRadius:"10px",padding:"12px",border:"1px solid rgba(255,255,255,0.06)"}}>
          {detalle.datos_pendientes&&<div style={{padding:"8px 12px",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"8px",marginBottom:"8px",display:"flex",alignItems:"center",gap:"8px",fontSize:"11px",color:"#f59e0b",fontWeight:600}}>📋 Datos de equipo pendientes — ingresa los parámetros y guarda</div>}
          <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>PARÁMETROS DE EQUIPO</span>
            {parametrosEdit.length>0&&<button className="btn-ghost" onClick={guardarParametros} disabled={savingParams} style={{padding:"3px 10px",fontSize:"10px",borderColor:detalle.datos_pendientes?"rgba(245,158,11,0.5)":"rgba(39,33,232,0.4)",color:savingParams?"rgba(255,255,255,0.3)":detalle.datos_pendientes?"#f59e0b":"#49B8D3"}}>{savingParams?"Guardando...":detalle.datos_pendientes?"✓ Guardar y completar":"Guardar"}</button>}
          </div>
          {parametrosEdit.map((p,i)=>{
            const st=p.status;
            const stColor=st==="completado"?"#10b981":st==="pendiente"?"#f59e0b":st==="perdida"?"#ef4444":null;
            const stBorder=stColor?`1px solid ${stColor}44`:"1px solid rgba(255,255,255,0.05)";
            return(
            <div key={i} style={{marginBottom:"6px",background:"rgba(255,255,255,0.03)",borderRadius:"8px",padding:"7px 8px",border:stBorder}}>
              <div style={{display:"flex",gap:"5px",alignItems:"center",marginBottom:"6px"}}>
                <div style={{flex:1,fontSize:"11px",color:"rgba(255,255,255,0.75)",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.zona}</div>
                <input className="inp" value={p.valores} onChange={e=>{const n=[...parametrosEdit];n[i]={...n[i],valores:e.target.value};setParametrosEdit(n);}} style={{width:"82px",fontSize:"11px",padding:"5px 8px",textAlign:"center"}} placeholder="000/000"/>
                <button onClick={()=>setParametrosEdit(parametrosEdit.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"rgba(255,100,100,0.4)",cursor:"pointer",fontSize:"15px",padding:"0 3px",lineHeight:1,flexShrink:0}}>×</button>
              </div>
              <div style={{display:"flex",gap:"4px"}}>
                {[{s:"completado",label:"✓ Completado",color:"#10b981",bg:"rgba(16,185,129,"},{s:"pendiente",label:"⏸ Pendiente",color:"#f59e0b",bg:"rgba(245,158,11,"},{s:"perdida",label:"✕ Perdida",color:"#ef4444",bg:"rgba(239,68,68,"}].map(({s,label,color,bg})=>(
                  <button key={s} onClick={()=>{const n=[...parametrosEdit];n[i]={...n[i],status:st===s?null:s,razon:st===s?p.razon:""};setParametrosEdit(n);}} style={{flex:1,background:st===s?`${bg}0.2))`:"rgba(255,255,255,0.04)",border:`1px solid ${st===s?color:"rgba(255,255,255,0.1)"}`,borderRadius:"6px",color:st===s?color:"rgba(255,255,255,0.28)",cursor:"pointer",fontSize:"9px",padding:"4px 3px",fontWeight:st===s?700:400,letterSpacing:"0.2px",transition:"all 0.15s"}}>{label}</button>
                ))}
              </div>
              {st&&st!=="completado"&&(
                <input className="inp" value={p.razon||""} onChange={e=>{const n=[...parametrosEdit];n[i]={...n[i],razon:e.target.value};setParametrosEdit(n);}} style={{marginTop:"5px",fontSize:"10px",padding:"5px 8px"}} placeholder={st==="perdida"?"¿Por qué no se realizó esta zona?":"¿Por qué está pendiente esta zona?"}/>
              )}
            </div>);})}
          <div style={{display:"flex",gap:"5px",alignItems:"center",marginTop:parametrosEdit.length>0?"6px":"0"}}>
            <select className="inp" value={zonaNew} onChange={e=>setZonaNew(e.target.value)} style={{flex:1,fontSize:"11px",padding:"5px 8px"}}>
              <option value="">Zona...</option>
              {ZONAS_EQUIPO.filter(z=>!parametrosEdit.find(p=>p.zona===z)).map(z=><option key={z} value={z}>{z}</option>)}
            </select>
            <input className="inp" value={valNew} onChange={e=>setValNew(e.target.value)} style={{width:"82px",fontSize:"11px",padding:"5px 8px",textAlign:"center"}} placeholder="000/000"/>
            <button onClick={()=>{if(!zonaNew||!valNew.trim())return;setParametrosEdit([...parametrosEdit,{zona:zonaNew,valores:valNew.trim()}]);setZonaNew("");setValNew("");}} style={{background:"rgba(39,33,232,0.3)",border:"1px solid rgba(39,33,232,0.5)",borderRadius:"6px",color:"#fff",cursor:"pointer",fontSize:"18px",padding:"1px 8px",lineHeight:1,flexShrink:0}}>+</button>
          </div>
          {historialParams.length>0&&<div style={{marginTop:"10px",borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:"8px"}}>
            <div style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(255,255,255,0.2)",marginBottom:"5px"}}>SESIONES ANTERIORES</div>
            {historialParams.map(h=>(
              <div key={h.sesion_numero} style={{marginBottom:"5px"}}>
                <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"2px"}}>Ses. {h.sesion_numero} · {new Date(h.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</div>
                {h.parametros_equipo.map((p,pi)=>(
                  <div key={pi} style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:"rgba(255,255,255,0.45)",padding:"1px 0"}}>
                    <span>{p.zona}</span><span style={{color:"rgba(255,255,255,0.65)",fontWeight:600}}>{p.valores}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>}
        </div>
        {detalle.notas?.match(/Anticipo \$(\d+)/)&&!detalle.es_cobro&&<div style={{padding:"9px 12px",background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.25)",borderRadius:"8px",fontSize:"11px",color:"#f97316",marginBottom:"12px",display:"flex",alignItems:"center",gap:"6px"}}>💰 {detalle.notas.match(/Anticipo \$\d+ \w+/)?.[0]} pagado · <span style={{fontWeight:700}}>pendiente de liquidar</span></div>}
        {detalle.notas?.includes("Sin anticipo")&&<div style={{padding:"9px 12px",background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.3)",borderRadius:"8px",fontSize:"11px",color:"#f97316",marginBottom:"12px",display:"flex",alignItems:"center",gap:"6px"}}>⚠ Sin anticipo · <span style={{fontWeight:700}}>cobrar al llegar</span></div>}
        <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
          {detalle.estado==="agendada"&&<div style={{display:"flex",flexDirection:"column",gap:"8px",width:"100%"}}><div style={{display:"flex",gap:"8px"}}><button className="btn-ghost" style={{flex:1,color:"#ff6b6b",borderColor:"rgba(255,80,80,0.3)"}} onClick={()=>cancelar(detalle.id,detalle.paquete_id,detalle.sesion_numero)}>Cancelar</button><button className="btn-ghost" style={{flex:1,color:"#eab308",borderColor:"rgba(234,179,8,0.3)"}} onClick={()=>{setCitaPerdida(detalle);setRazonPerdida("");setModalPerdida(true);}}>✗ No vino</button>{!detalle.notas?.startsWith("Reagendada")&&<button className="btn-ghost" style={{flex:1,color:"#f59e0b",borderColor:"rgba(245,158,11,0.3)"}} onClick={()=>{setCitaReagendar(detalle);setFechaRe("");setHoraRe("");setModalReagendar(true);}}>↻ Reagendar</button>}</div><button className="btn-blue" style={{width:"100%",padding:"12px"}} onClick={()=>intentarCompletar(detalle)}>✓ Completada</button></div>}
          {detalle.estado==="completada"&&!detalle.datos_pendientes&&<div style={{width:"100%"}}><div style={{textAlign:"center",fontSize:"13px",color:"#10b981",fontWeight:600,marginBottom:detalle.metodo_pago?"8px":"0"}}>✓ Completada</div>{detalle.metodo_pago&&<div style={{display:"flex",flexDirection:"column",gap:"5px",padding:"10px 12px",background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"8px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Pago</span><span style={{color:"#10b981",fontWeight:600}}>{detalle.metodo_pago}</span></div>{detalle.ticket_zettle&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{color:"rgba(255,255,255,0.35)"}}>Ticket</span><span style={{color:"rgba(255,255,255,0.7)",fontWeight:600,fontFamily:"monospace"}}>{detalle.ticket_zettle}</span></div>}</div>}</div>}
          {detalle.estado==="completada"&&detalle.datos_pendientes&&<div style={{textAlign:"center",width:"100%",fontSize:"12px",color:"#f59e0b",fontWeight:600,padding:"8px",background:"rgba(245,158,11,0.08)",borderRadius:"8px",border:"1px solid rgba(245,158,11,0.25)"}}>📋 Completada · Datos de equipo pendientes</div>}
          {detalle.estado==="perdida"&&<div style={{width:"100%"}}><div style={{textAlign:"center",fontSize:"13px",color:"#eab308",fontWeight:700,marginBottom:"8px"}}>✗ No se presentó</div>{detalle.razon_perdida&&<div style={{padding:"8px 12px",background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.2)",borderRadius:"8px",fontSize:"12px",color:"rgba(255,255,255,0.6)",marginBottom:"8px"}}>{detalle.razon_perdida}</div>}<button className="btn-ghost" style={{width:"100%",color:"#f59e0b",borderColor:"rgba(245,158,11,0.3)"}} onClick={()=>{setCitaReagendar(detalle);setFechaRe("");setHoraRe("");setModalReagendar(true);}}>↻ Reagendar</button></div>}
          {detalle.estado==="cancelada"&&<div style={{textAlign:"center",width:"100%",fontSize:"13px",color:"rgba(255,255,255,0.3)"}}>Cancelada</div>}
        </div>
        {detalle.clienta_id&&<button className="btn-ghost" style={{width:"100%",fontSize:"11px"}} onClick={()=>{setDetalle(null);onVerFicha&&onVerFicha(detalle.clienta_id);}}>Ver ficha de {detalle.clienta_nombre}</button>}
        <div style={{marginTop:"8px",paddingTop:"8px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          {!confirmDelCita
            ?<button onClick={()=>setConfirmDelCita(true)} style={{width:"100%",background:"none",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"8px",color:"rgba(239,68,68,0.4)",cursor:"pointer",padding:"7px",fontSize:"11px",fontFamily:"inherit",letterSpacing:"0.5px"}}>Eliminar cita</button>
            :<div style={{display:"flex",gap:"6px"}}><button className="btn-ghost" onClick={()=>setConfirmDelCita(false)} style={{flex:1,fontSize:"11px"}}>Cancelar</button><button onClick={eliminarCita} style={{flex:1,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.5)",borderRadius:"8px",color:"#ef4444",cursor:"pointer",padding:"7px",fontSize:"11px",fontFamily:"inherit",fontWeight:700}}>¿Eliminar?</button></div>
          }
        </div>
      </div></div>}
      {modalSinDatos&&citaSinDatos&&<div className="overlay"><div className="glass" style={{width:400,padding:"28px",borderColor:"rgba(245,158,11,0.35)",color:"#fff"}}>
        <div style={{fontSize:"22px",textAlign:"center",marginBottom:"10px"}}>📋</div>
        <div style={{fontSize:"16px",fontWeight:700,textAlign:"center",marginBottom:"6px"}}>Sin parámetros de equipo</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.5)",textAlign:"center",marginBottom:"22px",lineHeight:1.5}}>No se registraron potencias para esta sesión.<br/>¿Qué deseas hacer?</div>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <button className="btn-blue" onClick={()=>{setModalSinDatos(false);abrirCobro(citaSinDatos);}} style={{width:"100%",padding:"12px"}}>✓ Completar sin datos</button>
          <button onClick={()=>{setDatosPendientesMode(true);setModalSinDatos(false);abrirCobro(citaSinDatos);}} style={{width:"100%",padding:"12px",background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"10px",color:"#f59e0b",fontFamily:"inherit",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>📋 Pendiente de datos — cobrar y llenar después</button>
          <button className="btn-ghost" onClick={()=>{setModalSinDatos(false);setCitaSinDatos(null);}} style={{width:"100%"}}>← Volver y registrar ahora</button>
        </div>
      </div></div>}
      {showCobro&&citaCobro&&(()=>{
        const{cita,paqPrecio,anticoMonto,restante}=citaCobro;
        const msiOpts=CATALOGO.flatMap(c=>c.items).find(i=>i.nombre===cita.servicio)?.msi||[];
        const totalFinalAg=pagosAg.length===1?Math.round(paqPrecio*(1-descuentoAg/100)-anticoMonto):pagosAg.reduce((s,p)=>s+p.monto,0);
        const pagoOkAg=pagosAg.every(p=>p.metodo)&&(pagosAg.length===1||pagosAg.reduce((s,p)=>s+p.monto,0)===restante);
        return(<div className="overlay"><div className="glass" style={{width:460,padding:"28px",borderColor:"rgba(249,115,22,0.3)"}}>
          <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>LIQUIDACIÓN DE PAQUETE</div>
          <div style={{padding:"12px",background:"rgba(0,0,0,0.3)",borderRadius:"10px",marginBottom:"14px"}}>
            <div style={{fontSize:"12px",fontWeight:600,marginBottom:"8px"}}>{cita.clienta_nombre} · Ses. {cita.sesion_numero}</div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)",marginBottom:"6px"}}>{cita.servicio}</div>
            <div style={{height:"1px",background:"rgba(255,255,255,0.06)",margin:"8px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",marginBottom:"4px"}}><span style={{color:"rgba(255,255,255,0.4)"}}>Precio paquete</span><span>{fmt(paqPrecio)}</span></div>
            {anticoMonto>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:"#f97316",marginBottom:"4px"}}><span>Anticipo pagado</span><span>− {fmt(anticoMonto)}</span></div>}
            <div style={{height:"1px",background:"rgba(255,255,255,0.06)",margin:"6px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"16px",fontWeight:700}}><span>A cobrar hoy</span><span style={{color:"#49B8D3"}}>{fmt(descuentoAg>0&&pagosAg.length===1?totalFinalAg:restante)}</span></div>
            {descuentoAg>0&&pagosAg.length===1&&<div style={{fontSize:"11px",color:"#10b981",textAlign:"right",marginTop:"2px"}}>Desc. 5% efectivo aplicado</div>}
          </div>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"8px",letterSpacing:"1px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>FORMA DE PAGO</span>
            {pagosAg.length>1&&(()=>{const rest=restante-pagosAg.reduce((s,p)=>s+p.monto,0);return<span style={{color:rest===0?"#10b981":"#f97316",fontSize:"10px",fontWeight:600}}>{rest===0?"✓ Completo":`Restante: ${fmt(rest)}`}</span>;})()}
          </div>
          {pagosAg.map((p,i)=>(
            <div key={i} style={{marginBottom:"8px",padding:"10px",background:"rgba(0,0,0,0.2)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
              {pagosAg.length>1&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}><span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>Pago {i+1}</span><button onClick={()=>setPagosAg(pagosAg.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"rgba(255,100,100,0.55)",cursor:"pointer",fontSize:"14px",lineHeight:1,padding:"0 2px"}}>✕</button></div>}
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:pagosAg.length>1?"8px":"0"}}>
                {["Efectivo","Débito","Crédito","Transferencia","Depósito","Link de pago"].map(m=>(
                  <button key={m} onClick={()=>{const n=[...pagosAg];n[i]={...n[i],metodo:m};if(m!=="Crédito")setMsiSelAg(0);setPagosAg(n);}} style={{padding:"7px 10px",borderRadius:"7px",border:"1px solid",fontSize:"10px",fontWeight:500,cursor:"pointer",background:p.metodo===m?"#2721E8":"transparent",borderColor:p.metodo===m?"#2721E8":"rgba(255,255,255,0.1)",color:p.metodo===m?"#fff":"rgba(255,255,255,0.4)"}}>{m}</button>
                ))}
              </div>
              {pagosAg.length>1&&<input type="number" className="inp" value={p.monto||""} onChange={e=>{const n=[...pagosAg];n[i]={...n[i],monto:Number(e.target.value)||0};setPagosAg(n);}} style={{fontSize:"12px",padding:"6px 10px",marginTop:"6px"}} placeholder="Monto $"/>}
              {p.metodo==="Crédito"&&msiOpts.length>0&&pagosAg.length===1&&<div style={{marginTop:"8px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>MSI</div><div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}><button className="btn-ghost" style={{borderColor:msiSelAg===0?"#2721E8":"rgba(255,255,255,0.1)",color:msiSelAg===0?"#fff":"rgba(255,255,255,0.4)",padding:"7px 12px",fontSize:"11px"}} onClick={()=>setMsiSelAg(0)}>Sin MSI</button>{msiOpts.map(m=><button key={m} className="btn-ghost" style={{borderColor:msiSelAg===m?"#2721E8":"rgba(255,255,255,0.1)",color:msiSelAg===m?"#fff":"rgba(255,255,255,0.4)",padding:"7px 12px",fontSize:"11px"}} onClick={()=>setMsiSelAg(m)}>{m} MSI</button>)}</div></div>}
              {["Débito","Crédito"].includes(p.metodo)&&terminalesAg.length>0&&<div style={{marginTop:"8px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>TERMINAL</div><div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"6px"}}>{terminalesAg.map(t=><button key={t.nombre} onClick={()=>setTermSelAg({...termSelAg,[i]:t.nombre})} style={{padding:"6px 10px",borderRadius:"7px",border:"1px solid",fontSize:"10px",cursor:"pointer",background:termSelAg[i]===t.nombre?"rgba(73,184,211,0.15)":"transparent",borderColor:termSelAg[i]===t.nombre?"#49B8D3":"rgba(255,255,255,0.1)",color:termSelAg[i]===t.nombre?"#49B8D3":"rgba(255,255,255,0.4)"}}>{t.nombre}<br/><span style={{fontSize:"9px"}}>{t.comision}%+IVA</span></button>)}</div>{termSelAg[i]&&(()=>{const t=terminalesAg.find(x=>x.nombre===termSelAg[i]);const base=pagosAg.length===1?totalFinalAg:p.monto||restante;if(!t||!base)return null;const neto=netoTarjeta(base,t.comision);return<div style={{padding:"6px 10px",background:"rgba(73,184,211,0.06)",border:"1px solid rgba(73,184,211,0.15)",borderRadius:"6px",fontSize:"10px",display:"flex",justifyContent:"space-between"}}><span style={{color:"rgba(255,255,255,0.4)"}}>Comisión {t.nombre}: −{fmt(base-neto)}</span><span style={{color:"#49B8D3",fontWeight:600}}>Neto: {fmt(neto)}</span></div>;})()}</div>}
              {p.metodo==="Efectivo"&&pagosAg.length===1&&<div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",marginTop:"8px",background:"rgba(16,185,129,0.06)",borderRadius:"8px",border:"1px solid rgba(16,185,129,0.2)"}}><span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Desc. 5%</span><button className="btn-ghost" style={{borderColor:descuentoAg===5?"#10b981":"rgba(255,255,255,0.1)",color:descuentoAg===5?"#10b981":"rgba(255,255,255,0.4)",padding:"5px 12px",fontSize:"11px"}} onClick={()=>setDescuentoAg(descuentoAg===5?0:5)}>{descuentoAg===5?"✓ Aplicado":"Aplicar"}</button></div>}
            </div>
          ))}
          {pagosAg[pagosAg.length-1]?.metodo&&<button className="btn-ghost" onClick={()=>{const suma=pagosAg.length===1?0:pagosAg.reduce((s,p)=>s+p.monto,0);setPagosAg(pagosAg.length===1?[{...pagosAg[0],monto:Math.round(restante/2)},{metodo:"",monto:restante-Math.round(restante/2)}]:[...pagosAg,{metodo:"",monto:Math.max(0,restante-suma)}]);}} style={{width:"100%",fontSize:"11px",padding:"8px",marginTop:"2px",marginBottom:"12px"}}>+ Agregar otro método de pago</button>}
          <div style={{marginTop:"12px",padding:"10px 12px",background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.25)",borderRadius:"8px",marginBottom:"8px"}}>
            <div style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(168,85,247,0.8)",marginBottom:"6px",fontWeight:600}}>📅 FECHA DEL TICKET</div>
            <input type="date" className="inp" value={fechaTicketAg} max={hoy()} onChange={e=>setFechaTicketAg(e.target.value||hoy())} style={{fontSize:"12px",padding:"7px 10px",colorScheme:"dark"}}/>
            {fechaTicketAg!==hoy()&&<div style={{fontSize:"9px",color:"#f59e0b",marginTop:"6px"}}>⚠ Ticket retroactivo: {new Date(fechaTicketAg+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>}
          </div>
          <div style={{marginBottom:"8px"}}>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>TICKET ZETTLE (opcional)</div>
            <input className="inp" value={ticketZettle} onChange={e=>setTicketZettle(e.target.value)} placeholder="#123" style={{fontSize:"13px",padding:"8px 12px",letterSpacing:"0.5px"}}/>
            <div style={{fontSize:"9px",color:"rgba(255,255,255,0.2)",marginTop:"3px"}}>Número de ticket generado manualmente en Zettle</div>
          </div>
          <div style={{display:"flex",gap:"10px",marginTop:"8px"}}><button className="btn-ghost" onClick={()=>{setShowCobro(false);setCitaCobro(null);}} style={{flex:1,padding:"13px"}}>Cancelar</button><button className="btn-blue" onClick={cobrarYCompletar} disabled={savingCobro||!pagoOkAg} style={{flex:2,padding:"13px",fontSize:"15px"}}>{savingCobro?"Guardando...":"✓ Cobrar y completar"}</button></div>
        </div></div>);
      })()}

      {modalPerdida&&citaPerdida&&<div className="overlay"><div className="glass" style={{width:440,padding:"28px",borderColor:"rgba(234,179,8,0.35)",color:"#fff"}}>
        <div style={{fontSize:"16px",fontWeight:700,textAlign:"center",marginBottom:"3px"}}>¿Qué pasó con la cita?</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",textAlign:"center",marginBottom:"20px"}}>{citaPerdida.clienta_nombre} · Ses. {citaPerdida.sesion_numero} · {citaPerdida.hora_inicio}</div>

        {/* OPCIÓN 1: DEJÓ ABIERTA */}
        <div style={{padding:"16px",background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:"12px",marginBottom:"14px"}}>
          <div style={{fontSize:"13px",fontWeight:700,color:"#f59e0b",marginBottom:"4px"}}>📅 Avisó que no viene</div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.45)",marginBottom:"10px",lineHeight:1.5}}>La sesión <strong style={{color:"#fff"}}>no se pierde</strong>. Desaparece del calendario y queda en su ficha para reagendar cuando vuelva a escribir.</div>
          <textarea className="inp" value={razonPerdida} onChange={e=>setRazonPerdida(e.target.value)} style={{fontSize:"11px",padding:"7px 10px",resize:"vertical",height:"52px",marginBottom:"10px",width:"100%",boxSizing:"border-box"}} placeholder="Comentario (opcional): ej. Avisó por WA que tiene junta, quiere la próxima semana..."/>
          <button onClick={marcarAbierta} style={{width:"100%",padding:"11px",background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.5)",borderRadius:"9px",color:"#f59e0b",fontFamily:"inherit",fontSize:"13px",fontWeight:700,cursor:"pointer"}}>📅 Dejar abierta (sin perder sesión)</button>
        </div>

        {/* SEPARADOR */}
        <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px"}}><div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.08)"}}/><span style={{fontSize:"10px",color:"rgba(255,255,255,0.2)",letterSpacing:"1px"}}>O</span><div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.08)"}}/></div>

        {/* OPCIÓN 2: SESIÓN PERDIDA */}
        <div style={{padding:"16px",background:"rgba(234,179,8,0.05)",border:"1px solid rgba(234,179,8,0.2)",borderRadius:"12px"}}>
          <div style={{fontSize:"13px",fontWeight:700,color:"#eab308",marginBottom:"4px"}}>✗ No se presentó sin avisar</div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"10px"}}>Queda marcada en amarillo en el calendario. Registra el motivo:</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
            {["No avisó","Avisó muy tarde","Canceló el día","Emergencia"].map(r=><button key={r} onClick={()=>setRazonPerdida(r)} style={{padding:"5px 9px",borderRadius:"7px",border:"1px solid",fontSize:"10px",cursor:"pointer",background:razonPerdida===r?"rgba(234,179,8,0.2)":"transparent",borderColor:razonPerdida===r?"#eab308":"rgba(255,255,255,0.1)",color:razonPerdida===r?"#eab308":"rgba(255,255,255,0.35)",transition:"all 0.15s"}}>{r}</button>)}
          </div>
          <textarea className="inp" value={razonPerdida} onChange={e=>setRazonPerdida(e.target.value)} style={{fontSize:"11px",padding:"7px 10px",resize:"vertical",height:"52px",marginBottom:"10px",width:"100%",boxSizing:"border-box"}} placeholder="Comentario adicional (opcional si ya seleccionaste motivo)..."/>
          <button disabled={!razonPerdida.trim()} onClick={marcarPerdida} style={{width:"100%",padding:"11px",background:razonPerdida.trim()?"rgba(234,179,8,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${razonPerdida.trim()?"rgba(234,179,8,0.5)":"rgba(255,255,255,0.07)"}`,borderRadius:"9px",color:razonPerdida.trim()?"#eab308":"rgba(255,255,255,0.15)",fontFamily:"inherit",fontSize:"13px",fontWeight:700,cursor:razonPerdida.trim()?"pointer":"default",transition:"all 0.2s"}}>✗ Marcar como perdida</button>
        </div>

        <button className="btn-ghost" style={{width:"100%",marginTop:"12px",fontSize:"12px"}} onClick={()=>{setModalPerdida(false);setCitaPerdida(null);setRazonPerdida("");}}>Cancelar</button>
      </div></div>}

      {modalSig&&citaComp&&<div className="overlay"><div className="glass" style={{width:500,maxHeight:"90vh",overflow:"auto",padding:"28px",borderColor:"rgba(16,185,129,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:"20px"}}><div style={{fontSize:"28px",marginBottom:"8px"}}>📅</div><div style={{fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>¡Sesión completada!</div><div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>¿Agendar siguiente sesión de {citaComp.clienta_nombre}?</div><div style={{fontSize:"12px",color:"#10b981",marginTop:"6px"}}>Sesión {citaComp.paquete.sesiones_usadas+1} de {citaComp.paquete.total_sesiones}</div></div>
        <div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>FECHA</div><input type="date" className="inp" value={fechaSig} onChange={e=>{setFechaSig(e.target.value);setHoraSig("");}} style={{colorScheme:"dark"}}/></div>
        {fechaSig&&new Date(fechaSig+"T12:00:00").getDay()!==0&&<div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>SELECCIONA HORA (toca un espacio libre)</div><MiniAgendaDia session={session} fecha={fechaSig} onSelectHora={h=>setHoraSig(h)} horaSeleccionada={horaSig} duracion={getDuracionServicio(citaComp.servicio,citaComp.tipo_servicio)??TIPOS_SVC.find(t=>t.id===citaComp.tipo_servicio)?.duracion??60}/></div>}
        {fechaSig&&new Date(fechaSig+"T12:00:00").getDay()===0&&<div style={{fontSize:"11px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ Domingo — cerrado</div>}
        <div style={{display:"flex",gap:"8px"}}><button className="btn-ghost" style={{flex:1}} onClick={()=>{setModalSig(false);setCitaComp(null);}}>No por ahora</button><button className="btn-blue" style={{flex:2,padding:"12px"}} disabled={!fechaSig||!horaSig||saving||new Date(fechaSig+"T12:00:00").getDay()===0} onClick={agSig}>{saving?"Agendando...":"✓ Agendar siguiente"}</button></div>
      </div></div>}

      {modalReagendar&&citaReagendar&&<div className="overlay"><div className="glass" style={{width:500,maxHeight:"90vh",overflow:"auto",padding:"28px",borderColor:"rgba(245,158,11,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:"20px"}}><div style={{fontSize:"28px",marginBottom:"8px"}}>↻</div><div style={{fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>Reagendar cita</div><div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>Sesión {citaReagendar.sesion_numero} de {citaReagendar.clienta_nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.25)",marginTop:"4px"}}>Fecha actual: {new Date(citaReagendar.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})} · {citaReagendar.hora_inicio}</div></div>
        <div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>NUEVA FECHA</div><input type="date" className="inp" value={fechaRe} onChange={e=>{setFechaRe(e.target.value);setHoraRe("");}} style={{colorScheme:"dark"}}/></div>
        {fechaRe&&new Date(fechaRe+"T12:00:00").getDay()!==0&&<div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>NUEVA HORA</div><MiniAgendaDia session={session} fecha={fechaRe} onSelectHora={h=>setHoraRe(h)} horaSeleccionada={horaRe} duracion={getDuracionServicio(citaReagendar.servicio,citaReagendar.tipo_servicio)??TIPOS_SVC.find(t=>t.id===citaReagendar.tipo_servicio)?.duracion??60}/></div>}
        {fechaRe&&new Date(fechaRe+"T12:00:00").getDay()===0&&<div style={{fontSize:"11px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ Domingo — cerrado</div>}
        <div style={{display:"flex",gap:"8px"}}><button className="btn-ghost" style={{flex:1}} onClick={()=>{setModalReagendar(false);setCitaReagendar(null);}}>Cancelar</button><button className="btn-ghost" style={{flex:2,padding:"12px",color:"#f59e0b",borderColor:"rgba(245,158,11,0.4)",fontWeight:600,fontSize:"13px"}} disabled={!fechaRe||!horaRe||saving||new Date(fechaRe+"T12:00:00").getDay()===0} onClick={reagendar}>{saving?"Reagendando...":"↻ Confirmar reagendamiento"}</button></div>
      </div></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// AJUSTES TERMINALES POS — comisión + IVA por sucursal
// ══════════════════════════════════════════════════════════════════════════════
function AjustesTerminales({session}){
  const[terminales,setTerminales]=useState([]);
  const[saving,setSaving]=useState(false);
  const[msg,setMsg]=useState("");
  const cargar=async()=>{
    try{
      const{data,error}=await supabase.from("terminales").select("*").eq("sucursal_id",session.id).order("nombre");
      if(!error&&data?.length>0)setTerminales(data);
      else setTerminales(TERMINALES_DEFAULT.map(t=>({...t,sucursal_id:session.id,id:null})));
    }catch(e){setTerminales(TERMINALES_DEFAULT.map(t=>({...t,sucursal_id:session.id,id:null})));}
  };
  useEffect(()=>{cargar();},[session.id]);
  const act=(idx,campo,valor)=>{const n=[...terminales];n[idx]={...n[idx],[campo]:valor};setTerminales(n);};
  const guardar=async()=>{
    setSaving(true);setMsg("");
    try{
      for(const t of terminales){
        if(t.id){await supabase.from("terminales").update({nombre:t.nombre,comision:Number(t.comision),activa:t.activa}).eq("id",t.id);}
        else{await supabase.from("terminales").insert([{sucursal_id:session.id,nombre:t.nombre,comision:Number(t.comision),activa:t.activa}]);}
      }
      setMsg("✓ Guardado");cargar();
    }catch(e){setMsg("Error al guardar");}
    setSaving(false);setTimeout(()=>setMsg(""),2500);
  };
  return(
    <div style={{flex:1,overflowY:"auto",padding:"24px"}}>
      <div style={{maxWidth:"640px"}}>
        <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"20px"}}>TERMINALES POS — {session.nombre}</div>
        <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"20px"}}>
          {terminales.map((t,i)=>(
            <div key={i} className="glass-dark" style={{padding:"16px",display:"grid",gridTemplateColumns:"1fr 130px 90px 44px",gap:"10px",alignItems:"center"}}>
              <input className="inp" value={t.nombre} onChange={e=>act(i,"nombre",e.target.value)} placeholder="Nombre terminal" style={{fontSize:"13px"}}/>
              <div style={{position:"relative"}}>
                <input type="number" className="inp" value={t.comision} onChange={e=>act(i,"comision",e.target.value)} step="0.01" min="0" max="20" style={{fontSize:"13px",paddingRight:"28px"}}/>
                <span style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>%</span>
              </div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",textAlign:"center",lineHeight:"1.4"}}>
                <div>c/IVA:</div>
                <div style={{color:"#f97316",fontWeight:600}}>{(Number(t.comision)*1.16).toFixed(2)}%</div>
              </div>
              <button onClick={()=>act(i,"activa",!t.activa)} style={{width:"36px",height:"36px",borderRadius:"8px",border:"1px solid",cursor:"pointer",background:t.activa?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.05)",borderColor:t.activa?"rgba(16,185,129,0.4)":"rgba(255,255,255,0.1)",fontSize:"14px",color:t.activa?"#10b981":"rgba(255,255,255,0.3)"}}>{t.activa?"✓":"✕"}</button>
            </div>
          ))}
        </div>
        <div className="glass-dark" style={{padding:"14px",marginBottom:"20px"}}>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"10px",letterSpacing:"1px"}}>NETO EN CUENTA por cada $1,000 cobrados con tarjeta</div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
            {terminales.filter(t=>t.activa&&t.nombre).map(t=>{const neto=netoTarjeta(1000,Number(t.comision));const comis=1000-neto;return(
              <div key={t.nombre} style={{padding:"10px 14px",background:"rgba(0,0,0,0.3)",borderRadius:"8px",textAlign:"center",minWidth:"110px"}}>
                <div style={{fontSize:"12px",fontWeight:600,marginBottom:"4px"}}>{t.nombre}</div>
                <div style={{fontSize:"15px",color:"#49B8D3",fontWeight:700}}>{fmt(neto)}</div>
                <div style={{fontSize:"10px",color:"rgba(255,100,100,0.7)",marginTop:"2px"}}>−{fmt(comis)} comisión</div>
              </div>
            );})}
          </div>
        </div>
        <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
          <button className="btn-ghost" onClick={()=>setTerminales([...terminales,{sucursal_id:session.id,nombre:"",comision:0,activa:true,id:null}])} style={{fontSize:"12px"}}>+ Agregar terminal</button>
          <button className="btn-blue" onClick={guardar} disabled={saving} style={{fontSize:"13px",padding:"10px 24px"}}>{saving?"Guardando...":"Guardar cambios"}</button>
          {msg&&<span style={{fontSize:"12px",color:msg.startsWith("✓")?"#10b981":"#ff6b6b"}}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIRMACIONES MAÑANA — resumen de citas con liga WhatsApp
// ══════════════════════════════════════════════════════════════════════════════
function ConfirmacionesManana({session}){
  const[citas,setCitas]=useState([]);const[loading,setLoading]=useState(true);
  const manana=()=>{const h=cdmx();const d=new Date(h+"T12:00:00");d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);};
  const cargar=async()=>{
    setLoading(true);
    const fecha=manana();
    const{data:citasData}=await supabase.from("citas").select("*").eq("sucursal_id",session.id).eq("fecha",fecha).neq("estado","cancelada").order("hora_inicio");
    const ids=[...new Set((citasData||[]).map(c=>c.clienta_id).filter(Boolean))];
    let cliMap={};
    if(ids.length>0){const{data:cliData}=await supabase.from("clientas").select("id,telefono").in("id",ids);cliMap=Object.fromEntries((cliData||[]).map(c=>[c.id,c]));}
    setCitas((citasData||[]).map(c=>({...c,telefono:cliMap[c.clienta_id]?.telefono||null})));
    setLoading(false);
  };
  useEffect(()=>{cargar();},[session.id]);
  const formatWA=(tel)=>{if(!tel)return null;const clean=tel.replace(/\D/g,"");if(clean.length===10)return"521"+clean;if(clean.startsWith("521")&&clean.length===13)return clean;if(clean.startsWith("52")&&clean.length===12)return"521"+clean.slice(2);return clean;};
  const msgWA=(c)=>{return encodeURIComponent(`Hola! 👋🏻 Buenas tardes ❣️\n\nTe contacto de 𝗖𝗜𝗥𝗘 𝗗𝗘𝗣𝗜𝗟𝗔𝗖𝗜𝗢́𝗡\n\n📆 Confirmando tu cita de ${c.servicio} el día de mañana a las ${c.hora_inicio}\n\nRecuerda: 🗒️\n\n- Debes venir con la zona(s) completamente 𝗿𝗮𝘀𝘂𝗿𝗮𝗱𝗮 𝘆 𝗹𝗶𝗺𝗽𝗶𝗮.\n- Si estás tomando algún 𝗺𝗲𝗱𝗶𝗰𝗮𝗺𝗲𝗻𝘁𝗼, deberás informar a nuestra cosmetóloga o por este medio.\n- 🩸 Sí puedes asistir en tu 𝗽𝗲𝗿𝗶𝗼𝗱𝗼 𝗺𝗲𝗻𝘀𝘁𝗿𝘂𝗮𝗹 aunque la zona a depilar es bikini 👙 o si es cualquier otra 𝘇𝗼𝗻𝗮 𝗮 𝗱𝗲𝗽𝗶𝗹𝗮𝗿, solo te comentamos que podrías estar más sensible, en caso de bikini, venir aseada y con tampón.\n- Si no asistes a tu sesión, se tomará como 𝗮𝘀𝗶𝘀𝘁𝗶𝗱𝗮 𝘆 𝗽𝗲𝗿𝗱𝗲𝗿𝗮́𝘀 𝗹𝗮 𝗺𝗶𝘀𝗺𝗮.\n- Contamos con todas las medidas sanitarias y de seguridad para tu tranquilidad.\n\nAgradezco tu 𝗖𝗢𝗡𝗙𝗜𝗥𝗠𝗔𝗖𝗜𝗢́𝗡 o si no puedes asistir, indícanos el día y la hora en la que te gustaría reagendar con al menos 12 hrs de anticipación (antes de las 8pm de un día antes).\n\nTe recordamos que las 𝗰𝗮𝗻𝗰𝗲𝗹𝗮𝗰𝗶𝗼𝗻𝗲𝘀 son con 𝟭𝟮 𝗵𝗼𝗿𝗮𝘀 𝗱𝗲 𝗮𝗻𝘁𝗶𝗰𝗶𝗽𝗮𝗰𝗶𝗼́𝗻 (horario para cancelar Máximo 8 pm del día anterior)\n\nTienes 𝟭𝟱 𝗺𝗶𝗻𝘂𝘁𝗼𝘀 de tolerancia en caso de Cuerpos completos, combos, y/o zonas amplias.\nY 𝟱 𝗺𝗶𝗻𝘂𝘁𝗼𝘀 de tolerancia en caso de zonas chicas como: rostro, axilas, bigote, etc.\nTienes 𝟱 𝗺𝗶𝗻𝘂𝘁𝗼𝘀 de tolerancia si tu cita es a las 7:00 o 7:30 pm.\n\nToma tus precauciones (tráfico, parquímetro, etc)\n\nCita 𝗰𝗼𝗻𝗳𝗶𝗿𝗺𝗮𝗱𝗮 y 𝗻𝗼 𝗮𝘀𝗶𝘀𝘁𝗶𝗱𝗮 se toma como servicio efectuado\n\nSolo se puede 𝗿𝗲𝗮𝗴𝗲𝗻𝗱𝗮𝗿 𝗨𝗡𝗔 𝗩𝗘𝗭 (si no estás segura de tu cita, puedes dejar abierta tu cita)\n\n𝗦𝗮́𝗯𝗮𝗱𝗼𝘀 el tiempo de tolerancia es de 𝟱 𝗺𝗶𝗻𝘂𝘁𝗼𝘀 y tiempo límite para reagendar o cancelar es 𝟰𝟴𝗵𝗿𝘀 𝗮𝗻𝘁𝗲𝘀 de tu cita.`);};
  const fechaManana=manana();
  const diaLabel=new Date(fechaManana+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
  return(
    <div style={{flex:1,overflowY:"auto",padding:"24px"}}>
      <div style={{maxWidth:"700px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
          <div><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>CONFIRMACIONES</div><div style={{fontSize:"15px",fontWeight:600,textTransform:"capitalize"}}>{diaLabel}</div></div>
          <button className="btn-ghost" onClick={cargar} style={{fontSize:"11px"}}>↻ Actualizar</button>
        </div>
        {loading&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>Cargando...</div>}
        {!loading&&citas.length===0&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.15)",fontSize:"13px"}}>Sin citas para mañana</div>}
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          {citas.map(c=>{
            const waPhone=formatWA(c.telefono);
            const waLink=waPhone?`https://wa.me/${waPhone}?text=${msgWA(c)}`:null;
            const esReagendada=c.notas?.startsWith("Reagendada");
            return(
              <div key={c.id} className="glass" style={{padding:"16px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px",flexWrap:"wrap"}}>
                      <div style={{fontSize:"15px",fontWeight:700}}>{c.clienta_nombre}</div>
                      {esReagendada&&<div style={{fontSize:"9px",padding:"2px 7px",borderRadius:"10px",background:"rgba(245,158,11,0.12)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.3)",flexShrink:0}}>↻ Reagendada</div>}
                    </div>
                    <div style={{fontSize:"12px",color:"rgba(255,255,255,0.5)",marginBottom:"3px"}}>{c.hora_inicio} · {c.servicio}</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Sesión {c.sesion_numero} · {c.telefono||<span style={{color:"rgba(255,100,100,0.5)"}}>Sin teléfono</span>}</div>
                  </div>
                  {waLink?(
                    <a href={waLink} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:"6px",padding:"10px 16px",borderRadius:"10px",background:"rgba(37,211,102,0.1)",border:"1px solid rgba(37,211,102,0.3)",color:"#25d366",fontSize:"12px",fontWeight:600,textDecoration:"none",flexShrink:0,whiteSpace:"nowrap"}}>WhatsApp →</a>
                  ):(
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)",flexShrink:0}}>Sin teléfono</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!loading&&citas.length>0&&<div style={{marginTop:"16px",padding:"12px 16px",background:"rgba(39,33,232,0.06)",border:"1px solid rgba(39,33,232,0.15)",borderRadius:"10px",fontSize:"12px",color:"rgba(255,255,255,0.35)",textAlign:"center"}}>{citas.length} cita{citas.length!==1?"s":""} mañana · {citas.filter(c=>c.telefono).length} con WhatsApp disponible</div>}
      </div>
    </div>
  );
}

// POS — Paquete → Datos → Agendar (con vista de agenda) → Cobrar
// ══════════════════════════════════════════════════════════════════════════════
function POS({session,onSwitchSucursal,isAdmin}){
  useCSSInjection();
  const[view,setView]=useState("pos");const[carrito,setCarrito]=useState([]);const[filtro,setFiltro]=useState("Todos");const[busq,setBusq]=useState("");
  const[tipoTicket,setTipoTicket]=useState("nueva"); // "nueva" | "recompra"
  const[clientaSel,setClientaSel]=useState(null);const[busqCli,setBusqCli]=useState("");const[cliResults,setCliResults]=useState([]);
  const[nombreCli,setNombreCli]=useState("");const[telCli,setTelCli]=useState("");const[nacDia,setNacDia]=useState("");const[nacMes,setNacMes]=useState("");const[nacAnio,setNacAnio]=useState("");const[comoNos,setComoNos]=useState("");const[depiAntes,setDepiAntes]=useState(null);
  const[fechaCita,setFechaCita]=useState("");const[horaCita,setHoraCita]=useState("");const[showAgenda,setShowAgenda]=useState(false);
  const[metodo,setMetodo]=useState("");const[msiSel,setMsiSel]=useState(0);const[descuento,setDescuento]=useState(0);const[showConfirm,setShowConfirm]=useState(false);const[saving,setSaving]=useState(false);const[showExito,setShowExito]=useState(false);const[errGuardar,setErrGuardar]=useState("");
  const[anticoOpt,setAnticoOpt]=useState("no"); // "no" | "transferencia" | "efectivo"
  const[ticketZettleAnticipo,setTicketZettleAnticipo]=useState("");
  const[pagos,setPagos]=useState([{metodo:"",monto:0}]); // multi-pago en modal cobro
  const[termSel,setTermSel]=useState({}); // {pagoIdx: terminalNombre}
  const[terminalesPOS,setTerminalesPOS]=useState([]);
  const[fechaTicket,setFechaTicket]=useState(hoy()); // fecha del ticket (admin puede cambiar para retroactivos)
  const[tickets,setTickets]=useState([]);const[loadingT,setLoadingT]=useState(false);const[fichaId,setFichaId]=useState(null);const[clientas,setClientas]=useState([]);const[cliBusq,setCliBusq]=useState("");const[loadingCli,setLoadingCli]=useState(false);const[notifDatos,setNotifDatos]=useState([]);const[showNotif,setShowNotif]=useState(false);const[confirmDelCli,setConfirmDelCli]=useState(null);const[confirmDelTicket,setConfirmDelTicket]=useState(null);const[historialFecha,setHistorialFecha]=useState(hoy());const[ticketDetalle,setTicketDetalle]=useState(null);

  const[showMantForm,setShowMantForm]=useState(false);const[mantZona,setMantZona]=useState("");const[mantSesiones,setMantSesiones]=useState("");const[mantPrecio,setMantPrecio]=useState("");
  const[showZonasForm,setShowZonasForm]=useState(false);const[zonasSeleccionadas,setZonasSeleccionadas]=useState([]);const[zonasSesiones,setZonasSesiones]=useState("");const[zonasDuracion,setZonasDuracion]=useState("");const[zonasPrecio,setZonasPrecio]=useState("");
  const[showCeraForm,setShowCeraForm]=useState(false);const[ceraZonas,setCeraZonas]=useState([]);const[ceraPrecio,setCeraPrecio]=useState("");
  const todosItems=CATALOGO.flatMap(c=>c.items.map(i=>({...i,categoria:c.categoria})));
  const itemsFilt=todosItems.filter(i=>ITEM_FILTRO(i,filtro)&&(!busq||i.nombre.toLowerCase().includes(busq.toLowerCase())));
  const sel=(item)=>{carrito.find(x=>x.nombre===item.nombre)?setCarrito([]):setCarrito([{...item,qty:1}]);};
  const total=carrito.length>0?carrito[0].precio:0;const totalCD=Math.round(total*(1-descuento/100));const msiD=carrito.length>0?(carrito[0].msi||[]):[];
  const tipoSvc=carrito.length>0?detectTipo(carrito[0].nombre):TIPOS_SVC[0];
  const duracionCita=carrito.length>0?(carrito[0].duracion??getDuracionServicio(carrito[0].nombre,tipoSvc.id)??tipoSvc.duracion):tipoSvc.duracion;
  const dOk=tipoTicket==="recompra"?!!clientaSel:nombreCli.trim().length>0;
  const pOk=carrito.length>0,aOk=!!fechaCita&&!!horaCita,todo=pOk&&dOk&&aOk;
  const dow=fechaCita?new Date(fechaCita+"T12:00:00").getDay():-1,esDom=dow===0;
  const fechaNacISO=nacAnio&&nacMes&&nacDia?`${nacAnio}-${nacMes}-${nacDia}`:null;
  const nombreFinal=tipoTicket==="recompra"&&clientaSel?clientaSel.nombre:nombreCli;
  const buscarCliPOS=async(q)=>{if(q.length<2){setCliResults([]);return;}const{data}=await supabase.from("clientas").select("*").ilike("nombre",`%${q}%`).eq("sucursal_id",session.id).limit(6);setCliResults(data||[]);};
  const selCliPOS=(c)=>{setClientaSel(c);setBusqCli(c.nombre);setCliResults([]);};
  const limpiar=()=>{setCarrito([]);setTipoTicket("nueva");setClientaSel(null);setBusqCli("");setCliResults([]);setNombreCli("");setTelCli("");setNacDia("");setNacMes("");setNacAnio("");setComoNos("");setDepiAntes(null);setFechaCita("");setHoraCita("");setShowAgenda(false);setMetodo("");setMsiSel(0);setDescuento(0);setShowConfirm(false);setAnticoOpt("no");setTicketZettleAnticipo("");setPagos([{metodo:"",monto:0}]);setTermSel({});setFechaTicket(hoy());setShowMantForm(false);setMantZona("");setMantSesiones("");setMantPrecio("");setShowZonasForm(false);setZonasSeleccionadas([]);setZonasSesiones("");setZonasDuracion("");setZonasPrecio("");setShowCeraForm(false);setCeraZonas([]);setCeraPrecio("");};

  const agregarMantenimiento=()=>{if(!mantZona.trim()||!mantSesiones||!mantPrecio)return;const nombre=`Mant. ${mantZona.trim()} (${mantSesiones} ses)`;sel({nombre,precio:Number(mantPrecio),msi:[],categoria:"Mantenimiento"});setShowMantForm(false);};
  const toggleZona=(z)=>setZonasSeleccionadas(prev=>prev.includes(z)?prev.filter(x=>x!==z):[...prev,z]);
  const agregarZonas=()=>{if(!zonasSeleccionadas.length||!zonasSesiones||!zonasPrecio)return;const lista=zonasSeleccionadas.slice(0,3).join(", ")+(zonasSeleccionadas.length>3?` +${zonasSeleccionadas.length-3}`:"");const nombre=`Pack Zonas: ${lista} (${zonasSesiones} ses)`;const dur=zonasDuracion?Number(zonasDuracion):null;sel({nombre,precio:Number(zonasPrecio),msi:[3],categoria:"Personalizado",...(dur?{duracion:dur}:{})});setShowZonasForm(false);setZonasSeleccionadas([]);setZonasSesiones("");setZonasDuracion("");setZonasPrecio("");};
  const toggleCeraZona=(z)=>setCeraZonas(prev=>prev.includes(z)?prev.filter(x=>x!==z):[...prev,z]);
  const agregarCera=()=>{if(!ceraZonas.length||!ceraPrecio)return;const lista=ceraZonas.slice(0,3).join(", ")+(ceraZonas.length>3?` +${ceraZonas.length-3}`:"");const nombre=`Cera: ${lista}`;sel({nombre,precio:Number(ceraPrecio),msi:[],categoria:"Cera"});setShowCeraForm(false);};

  const cerrar=async()=>{setSaving(true);setErrGuardar("");try{
    const item=carrito[0];
    let cliId=null;
    if(tipoTicket==="recompra"&&clientaSel){cliId=clientaSel.id;}
    else{const{data:cD,error:eC}=await supabase.from("clientas").insert([{nombre:nombreCli,telefono:telCli,fecha_nacimiento:fechaNacISO,como_nos_conocio:comoNos,sucursal_id:session.id,sucursal_nombre:session.nombre}]).select();if(eC)throw new Error("Clienta: "+eC.message);cliId=cD?.[0]?.id||null;}
    const mpago=pagos.length===1?(pagos[0].metodo+(msiSel>0?` ${msiSel}MSI`:"")+( ["Débito","Crédito"].includes(pagos[0].metodo)&&termSel[0]?` · ${termSel[0]}`:"")):pagos.filter(p=>p.metodo&&p.monto>0).map((p,i)=>`${p.metodo}${["Débito","Crédito"].includes(p.metodo)&&termSel[i]?` · ${termSel[i]}`:""} ${fmt(p.monto)}`).join(" + ");
    const tNum=await nextTicketNum();
    const{data:tD,error:eT}=await supabase.from("tickets").insert([{ticket_num:tNum,sucursal_id:session.id,sucursal_nombre:session.nombre,servicios:[item.nombre],total:totalCD,metodo_pago:mpago,descuento,tipo_clienta:tipoTicket==="recompra"?"Recompra":"Nueva",fecha:fechaTicket}]).select();
    if(eT)throw new Error("Ticket: "+eT.message);
    const tId=tD?.[0]?.id;
    let pId=null;
    if(item.nombre.includes("ses")||/\(\d+s\)/i.test(item.nombre)){const ms=item.nombre.match(/(\d+)[ªa°]?\s*ses/i)||item.nombre.match(/\((\d+)s\)/i);const tot=ms?parseInt(ms[1]):1;
      const{data:pD,error:eP}=await supabase.from("paquetes").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,total_sesiones:tot,sesiones_usadas:0,precio:item.precio,ticket_id:tId,fecha_compra:hoy(),activo:true}]).select();if(eP)throw new Error("Paquete: "+eP.message);pId=pD?.[0]?.id||null;}
    const{error:eCi}=await supabase.from("citas").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,paquete_id:pId,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,tipo_servicio:tipoSvc.id,duracion_min:duracionCita,fecha:fechaCita,hora_inicio:horaCita,hora_fin:horaFin(horaCita,duracionCita),sesion_numero:1,es_cobro:true,estado:"agendada",notas:`Ticket #${tId||""}`}]);
    if(eCi)throw new Error("Cita: "+eCi.message);
    logActividad(session,"venta_completada",item.nombre);
    const fTk=fechaTicket;setShowConfirm(false);setShowExito(true);cargarT(session.id,fTk);setHistorialFecha(fTk);setTimeout(()=>{setShowExito(false);limpiar();},2200);
  }catch(e){console.error(e);setErrGuardar(e.message||"Error al guardar");}setSaving(false);};

  const cerrarAnticipo=async()=>{setSaving(true);setErrGuardar("");try{
    const item=carrito[0];
    let cliId=null;
    if(tipoTicket==="recompra"&&clientaSel){cliId=clientaSel.id;}
    else{const{data:cD,error:eC}=await supabase.from("clientas").insert([{nombre:nombreCli,telefono:telCli,fecha_nacimiento:fechaNacISO,como_nos_conocio:comoNos,sucursal_id:session.id,sucursal_nombre:session.nombre}]).select();if(eC)throw new Error("Clienta: "+eC.message);cliId=cD?.[0]?.id||null;}
    const mpAnticipo=anticoOpt==="transferencia"?"Transferencia":"Efectivo";
    const tNum=await nextTicketNum();
    const{data:tD,error:eT}=await supabase.from("tickets").insert([{ticket_num:tNum,sucursal_id:session.id,sucursal_nombre:session.nombre,servicios:[item.nombre],total:250,metodo_pago:`Anticipo ${mpAnticipo}`,descuento:0,tipo_clienta:tipoTicket==="recompra"?"Recompra":"Nueva",fecha:fechaTicket}]).select();
    if(eT)throw new Error("Ticket: "+eT.message);
    const tId=tD?.[0]?.id;
    let pId=null;
    if(item.nombre.includes("ses")||/\(\d+s\)/i.test(item.nombre)){const ms=item.nombre.match(/(\d+)[ªa°]?\s*ses/i)||item.nombre.match(/\((\d+)s\)/i);const tot=ms?parseInt(ms[1]):1;
      const{data:pD,error:eP}=await supabase.from("paquetes").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,total_sesiones:tot,sesiones_usadas:0,precio:item.precio,ticket_id:tId,fecha_compra:hoy(),activo:true}]).select();if(eP)throw new Error("Paquete: "+eP.message);pId=pD?.[0]?.id||null;}
    const tzAnt=ticketZettleAnticipo.trim()?(ticketZettleAnticipo.trim().startsWith("#")?ticketZettleAnticipo.trim():"#"+ticketZettleAnticipo.trim()):null;
    const{error:eCi}=await supabase.from("citas").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,paquete_id:pId,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,tipo_servicio:tipoSvc.id,duracion_min:duracionCita,fecha:fechaCita,hora_inicio:horaCita,hora_fin:horaFin(horaCita,duracionCita),sesion_numero:1,es_cobro:false,estado:"agendada",notas:`Anticipo $250 ${mpAnticipo} · Ticket #${tId||""}`,anticipo_metodo:`Anticipo ${mpAnticipo}`,anticipo_monto:250,...(tzAnt?{anticipo_ticket:tzAnt}:{})}]);
    if(eCi)throw new Error("Cita: "+eCi.message);
    logActividad(session,"venta_anticipo",item.nombre);
    const fTk=fechaTicket;setShowExito(true);cargarT(session.id,fTk);setHistorialFecha(fTk);setTimeout(()=>{setShowExito(false);limpiar();},2200);
  }catch(e){console.error(e);setErrGuardar(e.message||"Error al guardar");}setSaving(false);};

  const agendarSinAnticipo=async()=>{setSaving(true);setErrGuardar("");try{
    const item=carrito[0];
    let cliId=null;
    if(tipoTicket==="recompra"&&clientaSel){cliId=clientaSel.id;}
    else{const{data:cD,error:eC}=await supabase.from("clientas").insert([{nombre:nombreCli,telefono:telCli,fecha_nacimiento:fechaNacISO,como_nos_conocio:comoNos,sucursal_id:session.id,sucursal_nombre:session.nombre}]).select();if(eC)throw new Error("Clienta: "+eC.message);cliId=cD?.[0]?.id||null;}
    let pId=null;
    if(item.nombre.includes("ses")||/\(\d+s\)/i.test(item.nombre)){const ms=item.nombre.match(/(\d+)[ªa°]?\s*ses/i)||item.nombre.match(/\((\d+)s\)/i);const tot=ms?parseInt(ms[1]):1;
      const{data:pD,error:eP}=await supabase.from("paquetes").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,total_sesiones:tot,sesiones_usadas:0,precio:item.precio,ticket_id:null,fecha_compra:hoy(),activo:true}]).select();if(eP)throw new Error("Paquete: "+eP.message);pId=pD?.[0]?.id||null;}
    const{error:eCi}=await supabase.from("citas").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,paquete_id:pId,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,tipo_servicio:tipoSvc.id,duracion_min:duracionCita,fecha:fechaCita,hora_inicio:horaCita,hora_fin:horaFin(horaCita,duracionCita),sesion_numero:1,es_cobro:false,estado:"agendada",notas:"Sin anticipo"}]);
    if(eCi)throw new Error("Cita: "+eCi.message);
    setShowExito(true);cargarT(session.id);setTimeout(()=>{setShowExito(false);limpiar();},2200);
  }catch(e){console.error(e);setErrGuardar(e.message||"Error al guardar");}setSaving(false);};

  const cargarT=async(sid,fecha)=>{setLoadingT(true);const f=fecha||hoy();const{data}=await supabase.from("tickets").select("*").eq("sucursal_id",sid).eq("fecha",f).order("created_at",{ascending:false});if(data)setTickets(data);setLoadingT(false);};
  const eliminarTicket=async(id)=>{await supabase.from("tickets").delete().eq("id",id);setConfirmDelTicket(null);cargarT(session.id,historialFecha);};
  const cambiarDiaHistorial=(delta)=>{const d=new Date(historialFecha+"T12:00:00");d.setDate(d.getDate()+delta);const nueva=d.toISOString().slice(0,10);setHistorialFecha(nueva);setConfirmDelTicket(null);cargarT(session.id,nueva);};
  const cargarCli=async(q)=>{setLoadingCli(true);let qr=supabase.from("clientas").select("*").eq("sucursal_id",session.id).order("created_at",{ascending:false}).limit(50);if(q)qr=qr.ilike("nombre",`%${q}%`);const{data}=await qr;setClientas(data||[]);setLoadingCli(false);};
  const eliminarClienta=async(id)=>{
    try{
      await supabase.from("citas").delete().eq("clienta_id",id);
      await supabase.from("paquetes").delete().eq("clienta_id",id);
      const{error}=await supabase.from("clientas").delete().eq("id",id);
      if(error)throw error;
    }catch(e){alert("Error al eliminar: "+e.message);}
    setConfirmDelCli(null);cargarCli(cliBusq);
  };
  useEffect(()=>{(async()=>{try{const{data,error}=await supabase.from("terminales").select("*").eq("sucursal_id",session.id).eq("activa",true).order("nombre");if(!error&&data?.length>0)setTerminalesPOS(data);else setTerminalesPOS(TERMINALES_DEFAULT);}catch(e){setTerminalesPOS(TERMINALES_DEFAULT);}})();},[session.id]);
  useEffect(()=>{(async()=>{try{const{data}=await supabase.from("citas").select("id,clienta_nombre,servicio,sesion_numero,fecha,hora_inicio,clienta_id").eq("sucursal_id",session.id).eq("datos_pendientes",true).eq("estado","completada").order("fecha",{ascending:false}).limit(30);setNotifDatos(data||[]);}catch(e){}})();},[session.id,view]);
  const totalHoy=tickets.reduce((s,t)=>s+Number(t.total),0);
  const anios=Array.from({length:73},(_,i)=>String(2012-i));const dias=Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0"));

  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#22264A",color:"#fff"}}>
      <div style={{height:"64px",padding:"0 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(20px)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
          <div style={{fontSize:"18px",fontWeight:700,letterSpacing:"4px"}}>CIRE</div><div style={{width:"1px",height:"18px",background:"rgba(255,255,255,0.1)"}}/>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{width:"8px",height:"8px",borderRadius:"50%",background:session.color}}/><div style={{fontSize:"13px",color:"rgba(255,255,255,0.35)",fontWeight:300}}>{session.nombre}</div></div>
          <div style={{display:"flex"}}>
            {["pos","agenda","confirmar","clientas","historial","ajustes"].map(v=><div key={v} className="nav-tab" style={{borderBottomColor:view===v?"#2721E8":"transparent",color:view===v?"#fff":"rgba(255,255,255,0.35)",position:"relative"}}
              onClick={()=>{logActividad(session,`pos:vista`,v);setView(v);setFichaId(null);if(v==="historial"){const hoyStr=hoy();setHistorialFecha(hoyStr);cargarT(session.id,hoyStr);}if(v==="clientas")cargarCli("");}}>
              {v==="agenda"&&notifDatos.length>0&&<span style={{position:"absolute",top:"6px",right:"6px",background:"#f59e0b",color:"#000",fontSize:"9px",fontWeight:800,borderRadius:"50%",width:"16px",height:"16px",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>{notifDatos.length}</span>}
              {v==="pos"?"Punto de Venta":v==="agenda"?"📅 Agenda":v==="confirmar"?"📲 Confirmar":v==="clientas"?"👤 Clientas":v==="ajustes"?"⚙ Ajustes":"Historial"}</div>)}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          {view==="historial"&&tickets.length>0&&<div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>HOY <span style={{color:"#49B8D3",fontWeight:700}}>{fmt(totalHoy)}</span></div>}
          {isAdmin&&<button className="btn-ghost" onClick={onSwitchSucursal} style={{fontSize:"11px"}}>← Dashboard</button>}
        </div>
      </div>

      {notifDatos.length>0&&view==="pos"&&<div style={{margin:"0 0 0 0",background:"rgba(245,158,11,0.08)",borderBottom:"1px solid rgba(245,158,11,0.2)"}}>
        <div style={{padding:"10px 24px",display:"flex",alignItems:"center",gap:"10px",cursor:"pointer"}} onClick={()=>setShowNotif(v=>!v)}>
          <span style={{fontSize:"13px",color:"#f59e0b",fontWeight:700}}>📋 {notifDatos.length} {notifDatos.length===1?"cita":"citas"} con datos de equipo pendientes</span>
          <span style={{fontSize:"11px",color:"rgba(245,158,11,0.6)",marginLeft:"auto"}}>{showNotif?"▲ Ocultar":"▼ Ver"}</span>
        </div>
        {showNotif&&<div style={{padding:"0 24px 12px",display:"flex",flexDirection:"column",gap:"6px"}}>
          {notifDatos.map(c=><div key={c.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:"8px"}}>
            <div style={{flex:1}}>
              <span style={{fontSize:"12px",fontWeight:600,color:"rgba(255,255,255,0.85)"}}>{c.clienta_nombre}</span>
              <span style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginLeft:"8px"}}>{c.servicio} · S{c.sesion_numero}</span>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.25)",marginTop:"1px"}}>{new Date(c.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · {c.hora_inicio}</div>
            </div>
            {c.clienta_id&&<button onClick={()=>{setFichaId(c.clienta_id);setView("clientas");}} style={{fontSize:"10px",padding:"4px 10px",background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"6px",color:"#f59e0b",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Ver ficha →</button>}
          </div>)}
        </div>}
      </div>}
      {view==="agenda"&&<AgendaCalendar key="ag" session={session} isAdmin={isAdmin} onVerFicha={id=>{setFichaId(id);setView("clientas");}}/>}

      {view==="clientas"&&(fichaId?<FichaClienta clientaId={fichaId} session={session} onClose={()=>setFichaId(null)} isAdmin={isAdmin}/>:
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
          <div style={{display:"flex",gap:"12px",marginBottom:"16px",alignItems:"center"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>CLIENTAS · {session.nombre}</div><div style={{flex:1}}/><input className="inp" placeholder="Buscar por nombre..." value={cliBusq} onChange={e=>{setCliBusq(e.target.value);cargarCli(e.target.value);}} style={{maxWidth:"280px",padding:"8px 14px",fontSize:"12px"}}/></div>
          {loadingCli&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>Cargando...</div>}
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {clientas.map(c=><div key={c.id} className="glass" style={{padding:"14px 18px",cursor:"pointer"}} onClick={()=>setFichaId(c.id)} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(39,33,232,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}>
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <div style={{width:"36px",height:"36px",borderRadius:"50%",background:"rgba(39,33,232,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:700,color:"#2721E8",flexShrink:0}}>{c.nombre?.charAt(0)?.toUpperCase()}</div>
                <div style={{flex:1}}><div style={{fontSize:"14px",fontWeight:600}}>{c.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{c.telefono||"—"} · {c.como_nos_conocio||""}</div></div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)"}}>{new Date(c.created_at).toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</div>
                {confirmDelCli===c.id
                  ?<div style={{display:"flex",gap:"4px"}} onClick={e=>e.stopPropagation()}><button onClick={()=>setConfirmDelCli(null)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"6px",color:"rgba(255,255,255,0.4)",cursor:"pointer",padding:"4px 10px",fontSize:"11px",fontFamily:"inherit"}}>No</button><button onClick={()=>eliminarClienta(c.id)} style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.5)",borderRadius:"6px",color:"#ef4444",cursor:"pointer",padding:"4px 10px",fontSize:"11px",fontFamily:"inherit",fontWeight:700}}>¿Sí?</button></div>
                  :<button onClick={e=>{e.stopPropagation();setConfirmDelCli(c.id);}} style={{background:"none",border:"none",color:"rgba(239,68,68,0.3)",cursor:"pointer",padding:"4px 6px",fontSize:"14px",lineHeight:1}} title="Eliminar clienta">🗑</button>
                }
              </div></div>)}
            {!loadingCli&&clientas.length===0&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.15)",fontSize:"13px"}}>Sin clientas</div>}
          </div>
        </div>)}

      {view==="ajustes"&&<AjustesTerminales session={session}/>}
      {view==="confirmar"&&<ConfirmacionesManana session={session}/>}

      {view==="historial"&&<div style={{padding:"20px 24px",overflowY:"auto",flex:1}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>HISTORIAL · {session.nombre}</div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <button onClick={()=>cambiarDiaHistorial(-1)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:"rgba(255,255,255,0.6)",cursor:"pointer",padding:"6px 12px",fontSize:"16px",lineHeight:1,fontFamily:"inherit"}}>‹</button>
            <div style={{fontSize:"13px",fontWeight:500,minWidth:"130px",textAlign:"center"}}>
              {historialFecha===hoy()?"Hoy":new Date(historialFecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})}
            </div>
            <button onClick={()=>cambiarDiaHistorial(1)} disabled={historialFecha>=hoy()} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:historialFecha>=hoy()?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.6)",cursor:historialFecha>=hoy()?"default":"pointer",padding:"6px 12px",fontSize:"16px",lineHeight:1,fontFamily:"inherit"}}>›</button>
          </div>
        </div>
        {loadingT&&<div style={{color:"rgba(255,255,255,0.3)",textAlign:"center",padding:"40px"}}>Cargando...</div>}
        {!loadingT&&tickets.length===0&&<div style={{color:"rgba(255,255,255,0.2)",textAlign:"center",padding:"40px",fontSize:"13px"}}>Sin tickets ese día</div>}
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>{tickets.map(t=><div key={t.id} className="glass" style={{padding:"16px 20px",cursor:"pointer"}} onClick={e=>{if(e.target.closest("[data-nodrop]"))return;setTicketDetalle(t);}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{new Date(t.created_at).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</div>{t.clienta_nombre&&<div style={{fontSize:"11px",fontWeight:600,color:"#a78bfa",background:"rgba(139,92,246,0.12)",border:"1px solid rgba(139,92,246,0.25)",borderRadius:"20px",padding:"1px 8px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"160px"}}>👤 {t.clienta_nombre}</div>}</div><div style={{fontSize:"13px",fontWeight:500}}>{(t.servicios||[]).join(", ")}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{t.metodo_pago}{t.descuento>0?` · ${t.descuento}% desc`:""}</div></div><div style={{display:"flex",alignItems:"center",gap:"12px"}}><div style={{fontSize:"20px",fontWeight:700,color:"#49B8D3"}}>{fmt(t.total)}</div><div data-nodrop="1" onClick={e=>e.stopPropagation()}>{confirmDelTicket===t.id?<div style={{display:"flex",gap:"4px"}}><button onClick={()=>setConfirmDelTicket(null)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"6px",color:"rgba(255,255,255,0.4)",cursor:"pointer",padding:"4px 10px",fontSize:"11px",fontFamily:"inherit"}}>No</button><button onClick={()=>eliminarTicket(t.id)} style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.5)",borderRadius:"6px",color:"#ef4444",cursor:"pointer",padding:"4px 10px",fontSize:"11px",fontFamily:"inherit",fontWeight:700}}>¿Sí?</button></div>:<button onClick={()=>setConfirmDelTicket(t.id)} style={{background:"none",border:"none",color:"rgba(239,68,68,0.3)",cursor:"pointer",padding:"4px 6px",fontSize:"14px",lineHeight:1}} title="Eliminar ticket">🗑</button>}</div></div></div></div>)}</div>
        {tickets.length>0&&<div style={{marginTop:"16px",padding:"16px 20px",background:"rgba(39,33,232,0.08)",border:"1px solid rgba(39,33,232,0.2)",borderRadius:"12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"13px",color:"rgba(255,255,255,0.5)"}}>{tickets.length} tickets</div><div style={{fontSize:"20px",fontWeight:700}}>{fmt(totalHoy)}</div></div>}
      </div>}

      {ticketDetalle&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setTicketDetalle(null)}>
        <div style={{width:"100%",maxWidth:"480px",background:"#111",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"20px 20px 0 0",padding:"24px",display:"flex",flexDirection:"column",gap:"16px"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>DETALLE DE PAGO</div>
            <button onClick={()=>setTicketDetalle(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:"20px",lineHeight:1}}>×</button>
          </div>
          {ticketDetalle.clienta_nombre?<div style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.3)",borderRadius:"12px",padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",letterSpacing:"1px",marginBottom:"4px"}}>CLIENTA</div><div style={{fontSize:"16px",fontWeight:700,color:"#c4b5fd"}}>👤 {ticketDetalle.clienta_nombre}</div></div>
            {ticketDetalle.clienta_id&&<button onClick={()=>{setTicketDetalle(null);setView("clientas");setFichaId(ticketDetalle.clienta_id);}} style={{background:"rgba(139,92,246,0.2)",border:"1px solid rgba(139,92,246,0.5)",borderRadius:"10px",color:"#a78bfa",cursor:"pointer",padding:"8px 16px",fontSize:"12px",fontWeight:600,fontFamily:"inherit"}}>Ver ficha →</button>}
          </div>:<div style={{background:"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"14px 16px"}}><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>Sin clienta asignada</div></div>}
          <div style={{background:"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"14px 16px",display:"flex",flexDirection:"column",gap:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Hora</div><div style={{fontSize:"13px"}}>{new Date(ticketDetalle.created_at).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</div></div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px"}}><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",flexShrink:0}}>Servicios</div><div style={{fontSize:"13px",textAlign:"right"}}>{(ticketDetalle.servicios||[]).join(", ")}</div></div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Método de pago</div><div style={{fontSize:"13px"}}>{ticketDetalle.metodo_pago}</div></div>
            {ticketDetalle.descuento>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Descuento</div><div style={{fontSize:"13px",color:"#10b981"}}>{ticketDetalle.descuento}%</div></div>}
            <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:"8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)"}}>Total</div><div style={{fontSize:"24px",fontWeight:700,color:"#49B8D3"}}>{fmt(ticketDetalle.total)}</div></div>
          </div>
        </div>
      </div>}

      {view==="pos"&&<div style={{flex:1,display:"grid",gridTemplateColumns:showAgenda&&fechaCita&&!esDom?"380px 1fr 380px":"1fr 380px",overflow:"hidden"}}>
        {showAgenda&&fechaCita&&!esDom&&<div style={{borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",background:"rgba(0,0,0,0.15)",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"11px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)"}}>AGENDA DEL DÍA</div><button onClick={()=>setShowAgenda(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:"16px"}}>×</button></div>
          <div style={{flex:1,overflow:"auto"}}><MiniAgendaDia session={session} fecha={fechaCita} onSelectHora={h=>setHoraCita(h)} horaSeleccionada={horaCita} duracion={duracionCita}/></div>
        </div>}

        <div style={{display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
            <div style={{display:"flex",gap:"6px",marginBottom:"10px",flexWrap:"wrap"}}>{FILTROS.map(f=><button key={f} onClick={()=>{setFiltro(f);if(f==="Mantenimiento"){setShowMantForm(true);setShowZonasForm(false);setShowCeraForm(false);}else if(f==="Personalizado"){setShowZonasForm(true);setShowMantForm(false);setShowCeraForm(false);}else if(f==="Cera"){setShowCeraForm(true);setShowMantForm(false);setShowZonasForm(false);}else{setShowMantForm(false);setShowZonasForm(false);setShowCeraForm(false);}}} style={{padding:"6px 14px",borderRadius:"20px",border:"1px solid",fontSize:"12px",fontWeight:500,cursor:"pointer",transition:"all 0.15s",background:filtro===f?(f==="Mantenimiento"?"#f97316":f==="Personalizado"?"#7c3aed":f==="Cera"?"#0891b2":"#2721E8"):"transparent",borderColor:filtro===f?(f==="Mantenimiento"?"#f97316":f==="Personalizado"?"#7c3aed":f==="Cera"?"#0891b2":"#2721E8"):"rgba(255,255,255,0.12)",color:filtro===f?"#fff":"rgba(255,255,255,0.45)"}}>{f}</button>)}</div>
            {filtro!=="Mantenimiento"&&filtro!=="Personalizado"&&filtro!=="Cera"&&<input className="inp" placeholder="Buscar servicio..." value={busq} onChange={e=>setBusq(e.target.value)} style={{padding:"8px 14px",fontSize:"12px"}}/>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
            {filtro==="Mantenimiento"?(
              <div style={{padding:"14px 16px",background:"rgba(249,115,22,0.06)",border:"1px solid rgba(249,115,22,0.4)",borderRadius:"12px"}}>
                <div style={{fontSize:"10px",fontWeight:700,color:"#f97316",letterSpacing:"1.5px",marginBottom:"10px"}}>🔧 SESIONES DE MANTENIMIENTO</div>
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>ZONA / DESCRIPCIÓN</div><input className="inp" placeholder="Ej. Piernas Completas, Bikini Brazilian..." value={mantZona} onChange={e=>setMantZona(e.target.value)} style={{fontSize:"12px",padding:"8px 12px"}}/></div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <div style={{flex:"0 0 90px"}}><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>SESIONES</div><input type="number" className="inp" placeholder="Nº" value={mantSesiones} onChange={e=>setMantSesiones(e.target.value)} min="1" style={{fontSize:"12px",padding:"8px 10px"}}/></div>
                    <div style={{flex:1}}><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>PRECIO $</div><input type="number" className="inp" placeholder="0" value={mantPrecio} onChange={e=>setMantPrecio(e.target.value)} min="0" style={{fontSize:"12px",padding:"8px 12px"}}/></div>
                  </div>
                  {mantZona&&mantSesiones&&mantPrecio&&<div style={{padding:"7px 10px",background:"rgba(249,115,22,0.08)",borderRadius:"8px",fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>«Mant. {mantZona.trim()} ({mantSesiones} ses)» — {fmt(Number(mantPrecio))}</div>}
                  <button onClick={agregarMantenimiento} disabled={!mantZona.trim()||!mantSesiones||!mantPrecio} className="btn-blue" style={{background:!mantZona.trim()||!mantSesiones||!mantPrecio?"rgba(249,115,22,0.2)":"#f97316",border:"none",width:"100%",padding:"9px",fontSize:"12px",fontWeight:700,cursor:!mantZona.trim()||!mantSesiones||!mantPrecio?"default":"pointer"}}>✓ Agregar mantenimiento al ticket</button>
                </div>
              </div>
            ):filtro==="Personalizado"?(
              <div style={{padding:"14px 16px",background:"rgba(139,92,246,0.06)",border:"1px solid rgba(139,92,246,0.4)",borderRadius:"12px"}}>
                <div style={{fontSize:"10px",fontWeight:700,color:"#a78bfa",letterSpacing:"1.5px",marginBottom:"10px"}}>✨ PAQUETE PERSONALIZADO POR ZONAS</div>
                <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                  <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>ZONAS ({zonasSeleccionadas.length} seleccionadas)</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>{ZONAS_PACK.map(z=>{const sel=zonasSeleccionadas.includes(z);return(<button key={z} onClick={()=>toggleZona(z)} style={{padding:"4px 10px",borderRadius:"20px",border:`1px solid ${sel?"rgba(139,92,246,0.7)":"rgba(255,255,255,0.1)"}`,fontSize:"10px",fontWeight:sel?600:400,cursor:"pointer",background:sel?"rgba(139,92,246,0.2)":"transparent",color:sel?"#c4b5fd":"rgba(255,255,255,0.4)",transition:"all 0.1s"}}>{z}</button>);})}</div>
                  </div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <div style={{flex:"0 0 90px"}}><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>SESIONES</div><input type="number" className="inp" placeholder="Nº" value={zonasSesiones} onChange={e=>setZonasSesiones(e.target.value)} min="1" style={{fontSize:"12px",padding:"8px 10px"}}/></div>
                    <div style={{flex:"0 0 90px"}}><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>DURACIÓN (min)</div><input type="number" className="inp" placeholder="60" value={zonasDuracion} onChange={e=>setZonasDuracion(e.target.value)} min="15" step="15" style={{fontSize:"12px",padding:"8px 10px"}}/></div>
                    <div style={{flex:1}}><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>PRECIO $</div><input type="number" className="inp" placeholder="0" value={zonasPrecio} onChange={e=>setZonasPrecio(e.target.value)} min="0" style={{fontSize:"12px",padding:"8px 12px"}}/></div>
                  </div>
                  {zonasSeleccionadas.length>0&&zonasSesiones&&zonasPrecio&&<div style={{padding:"7px 10px",background:"rgba(139,92,246,0.08)",borderRadius:"8px",fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>«Pack: {zonasSeleccionadas.join(", ")} ({zonasSesiones} ses{zonasDuracion?` · ${zonasDuracion} min`:""})» — {fmt(Number(zonasPrecio))}</div>}
                  <button onClick={agregarZonas} disabled={!zonasSeleccionadas.length||!zonasSesiones||!zonasPrecio} className="btn-blue" style={{background:!zonasSeleccionadas.length||!zonasSesiones||!zonasPrecio?"rgba(139,92,246,0.2)":"#7c3aed",border:"none",width:"100%",padding:"9px",fontSize:"12px",fontWeight:700,cursor:!zonasSeleccionadas.length||!zonasSesiones||!zonasPrecio?"default":"pointer"}}>✓ Agregar paquete al ticket</button>
                </div>
              </div>
            ):filtro==="Cera"?(
              <div style={{padding:"14px 16px",background:"rgba(8,145,178,0.06)",border:"1px solid rgba(8,145,178,0.4)",borderRadius:"12px"}}>
                <div style={{fontSize:"10px",fontWeight:700,color:"#22d3ee",letterSpacing:"1.5px",marginBottom:"10px"}}>🪒 CERA — SESIÓN ÚNICA</div>
                <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                  <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>ZONAS ({ceraZonas.length} seleccionadas)</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>{ZONAS_CERA.map(z=>{const s=ceraZonas.includes(z);return(<button key={z} onClick={()=>toggleCeraZona(z)} style={{padding:"4px 10px",borderRadius:"20px",border:`1px solid ${s?"rgba(8,145,178,0.7)":"rgba(255,255,255,0.1)"}`,fontSize:"10px",fontWeight:s?600:400,cursor:"pointer",background:s?"rgba(8,145,178,0.2)":"transparent",color:s?"#67e8f9":"rgba(255,255,255,0.4)",transition:"all 0.1s"}}>{z}</button>);})}</div>
                  </div>
                  <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>PRECIO $</div><input type="number" className="inp" placeholder="0" value={ceraPrecio} onChange={e=>setCeraPrecio(e.target.value)} min="0" style={{fontSize:"12px",padding:"8px 12px"}}/></div>
                  {ceraZonas.length>0&&ceraPrecio&&<div style={{padding:"7px 10px",background:"rgba(8,145,178,0.08)",borderRadius:"8px",fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>«Cera: {ceraZonas.join(", ")}» — {fmt(Number(ceraPrecio))}</div>}
                  <button onClick={agregarCera} disabled={!ceraZonas.length||!ceraPrecio} className="btn-blue" style={{background:!ceraZonas.length||!ceraPrecio?"rgba(8,145,178,0.2)":"#0891b2",border:"none",width:"100%",padding:"9px",fontSize:"12px",fontWeight:700,cursor:!ceraZonas.length||!ceraPrecio?"default":"pointer"}}>✓ Agregar cera al ticket</button>
                </div>
              </div>
            ):(
              <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
              {itemsFilt.map(item=>{const ec=carrito.find(x=>x.nombre===item.nombre);const cat=item.categoria.replace(" Láser","").replace("Zonas Individuales","Individual").replace("Corporal","Corp.");return(
                <div key={item.nombre} onClick={()=>sel(item)} style={{background:ec?"rgba(39,33,232,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${ec?"rgba(39,33,232,0.5)":"rgba(255,255,255,0.08)"}`,borderRadius:"12px",padding:"14px 14px 12px",cursor:"pointer",transition:"all 0.15s",position:"relative"}} onMouseEnter={e=>{if(!ec)e.currentTarget.style.background="rgba(255,255,255,0.06)";}} onMouseLeave={e=>{e.currentTarget.style.background=ec?"rgba(39,33,232,0.15)":"rgba(255,255,255,0.03)";}}>
                  <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",letterSpacing:"1px",marginBottom:"5px",textTransform:"uppercase"}}>{cat}</div>
                  <div style={{fontSize:"13px",fontWeight:600,lineHeight:1.3,marginBottom:"8px",minHeight:"36px"}}>{item.nombre}</div>
                  <div style={{fontSize:"16px",fontWeight:700,color:"#49B8D3"}}>{fmt(item.precio)}</div>
                  {item.msi?.length>0&&<div style={{fontSize:"9px",color:"rgba(255,255,255,0.25)",marginTop:"3px"}}>hasta {Math.max(...item.msi)} MSI</div>}
                  {ec&&<div style={{position:"absolute",top:"8px",right:"8px",width:"22px",height:"22px",borderRadius:"50%",background:"#2721E8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700}}>✓</div>}
                </div>);})}
              </div>
              </>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",background:"rgba(0,0,0,0.2)",overflowY:"auto"}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>NUEVO TICKET</div></div>
          <div style={{flex:1,overflowY:"auto",padding:"12px 18px",display:"flex",flexDirection:"column",gap:"14px"}}>
            {/* 1 Paquete */}
            <div><div style={{fontSize:"9px",letterSpacing:"1px",color:pOk?"#10b981":"rgba(255,255,255,0.25)",marginBottom:"6px",display:"flex",alignItems:"center",gap:"5px"}}><div style={{width:"16px",height:"16px",borderRadius:"50%",background:pOk?"#10b981":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontWeight:700,color:pOk?"#fff":"rgba(255,255,255,0.25)",flexShrink:0}}>1</div>PAQUETE</div>
              {!pOk?<div style={{color:"rgba(255,255,255,0.1)",fontSize:"11px",padding:"10px",textAlign:"center",border:"1px dashed rgba(255,255,255,0.06)",borderRadius:"8px"}}>← Selecciona del menú</div>:
              <div style={{padding:"10px 12px",background:"rgba(39,33,232,0.1)",border:"1px solid rgba(39,33,232,0.3)",borderRadius:"10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:"12px",fontWeight:600}}>{carrito[0].nombre}</div><div style={{fontSize:"14px",fontWeight:700,color:"#49B8D3",marginTop:"2px"}}>{fmt(carrito[0].precio)}</div></div><button onClick={()=>setCarrito([])} style={{background:"rgba(255,80,80,0.15)",border:"1px solid rgba(255,80,80,0.3)",borderRadius:"6px",color:"#ff6b6b",cursor:"pointer",padding:"3px 8px",fontSize:"10px"}}>✕</button></div>}
            </div>
            {/* 2 Datos */}
            {pOk&&<div><div style={{fontSize:"9px",letterSpacing:"1px",color:dOk?"#10b981":"rgba(255,255,255,0.25)",marginBottom:"6px",display:"flex",alignItems:"center",gap:"5px"}}><div style={{width:"16px",height:"16px",borderRadius:"50%",background:dOk?"#10b981":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontWeight:700,color:dOk?"#fff":"rgba(255,255,255,0.25)",flexShrink:0}}>2</div>CLIENTA</div>
              {/* Toggle nueva/recompra */}
              <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>{[{v:"nueva",l:"🆕 Nueva"},{v:"recompra",l:"🔄 Recompra"}].map(o=><button key={o.v} onClick={()=>{setTipoTicket(o.v);setClientaSel(null);setBusqCli("");setCliResults([]);}} style={{flex:1,padding:"7px",borderRadius:"8px",border:"1px solid",fontSize:"11px",fontWeight:600,cursor:"pointer",background:tipoTicket===o.v?o.v==="recompra"?"rgba(73,184,211,0.15)":"#2721E8":"transparent",borderColor:tipoTicket===o.v?o.v==="recompra"?"#49B8D3":"#2721E8":"rgba(255,255,255,0.1)",color:tipoTicket===o.v?"#fff":"rgba(255,255,255,0.35)"}}>{o.l}</button>)}</div>
              {tipoTicket==="recompra"?<div>
                <div style={{position:"relative",marginBottom:"6px"}}><input className="inp" placeholder="Buscar clienta existente..." value={busqCli} onChange={e=>{setBusqCli(e.target.value);buscarCliPOS(e.target.value);setClientaSel(null);}} style={{fontSize:"12px",padding:"8px 12px"}}/>
                  {cliResults.length>0&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#22264A",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",zIndex:20,overflow:"hidden",marginTop:"4px"}}>{cliResults.map(c=><div key={c.id} className="clienta-sugg" onClick={()=>selCliPOS(c)}><div style={{fontSize:"13px",fontWeight:500}}>{c.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{c.telefono||"—"}</div></div>)}</div>}
                </div>
                {clientaSel&&<div style={{padding:"10px 12px",background:"rgba(73,184,211,0.1)",border:"1px solid rgba(73,184,211,0.3)",borderRadius:"10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><div style={{width:"24px",height:"24px",borderRadius:"50%",background:"rgba(73,184,211,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:700,color:"#49B8D3"}}>{clientaSel.nombre?.charAt(0)?.toUpperCase()}</div><div style={{fontSize:"12px",fontWeight:600}}>✓ {clientaSel.nombre}</div><button onClick={()=>{setClientaSel(null);setBusqCli("");}} style={{marginLeft:"auto",background:"none",border:"none",color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:"14px"}}>×</button></div>
                  {clientaSel.telefono&&<div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>📱 {clientaSel.telefono}</div>}
                  <div style={{fontSize:"10px",color:"#49B8D3",fontWeight:600,marginTop:"4px"}}>🔄 Nuevo paquete se asocia a su ficha</div>
                </div>}
              </div>:
              <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
                <input className="inp" placeholder="Nombre completo *" value={nombreCli} onChange={e=>setNombreCli(e.target.value)} style={{fontSize:"12px",padding:"8px 12px"}}/>
                <input className="inp" placeholder="Teléfono / WhatsApp" value={telCli} onChange={e=>setTelCli(e.target.value)} style={{fontSize:"12px",padding:"8px 12px"}}/>
                <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.2)",marginBottom:"4px"}}>FECHA DE NACIMIENTO</div>
                  <div style={{display:"flex",gap:"6px"}}><select className="inp" value={nacDia} onChange={e=>setNacDia(e.target.value)} style={{fontSize:"11px",padding:"7px 8px",flex:"0 0 58px"}}><option value="">Día</option>{dias.map(d=><option key={d} value={d}>{d}</option>)}</select><select className="inp" value={nacMes} onChange={e=>setNacMes(e.target.value)} style={{fontSize:"11px",padding:"7px 8px",flex:1}}><option value="">Mes</option>{MESES_ES.map((m,i)=><option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>)}</select><select className="inp" value={nacAnio} onChange={e=>setNacAnio(e.target.value)} style={{fontSize:"11px",padding:"7px 8px",flex:"0 0 68px"}}><option value="">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select></div></div>
                <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.2)",marginBottom:"4px"}}>¿CÓMO NOS CONOCIÓ?</div><div style={{display:"flex",gap:"6px"}}>{["Redes sociales","Recomendación"].map(c=><button key={c} onClick={()=>setComoNos(comoNos===c?"":c)} style={{flex:1,padding:"7px",borderRadius:"8px",border:"1px solid",fontSize:"11px",fontWeight:500,cursor:"pointer",background:comoNos===c?"#2721E8":"transparent",borderColor:comoNos===c?"#2721E8":"rgba(255,255,255,0.1)",color:comoNos===c?"#fff":"rgba(255,255,255,0.35)"}}>{c==="Redes sociales"?"📱 Redes":"🗣 Recomendación"}</button>)}</div></div>
                <div><div style={{fontSize:"9px",color:"rgba(255,255,255,0.2)",marginBottom:"4px"}}>¿DEPILACIÓN LÁSER PREVIA?</div><div style={{display:"flex",gap:"6px"}}>{[{v:true,l:"Sí"},{v:false,l:"Primera vez"}].map(o=><button key={String(o.v)} onClick={()=>setDepiAntes(depiAntes===o.v?null:o.v)} style={{flex:1,padding:"7px",borderRadius:"8px",border:"1px solid",fontSize:"11px",fontWeight:500,cursor:"pointer",background:depiAntes===o.v?"#2721E8":"transparent",borderColor:depiAntes===o.v?"#2721E8":"rgba(255,255,255,0.1)",color:depiAntes===o.v?"#fff":"rgba(255,255,255,0.35)"}}>{o.l}</button>)}</div></div>
              </div>}
            </div>}
            {/* 3 Agendar */}
            {pOk&&dOk&&<div><div style={{fontSize:"9px",letterSpacing:"1px",color:aOk?"#10b981":"rgba(255,255,255,0.25)",marginBottom:"6px",display:"flex",alignItems:"center",gap:"5px"}}><div style={{width:"16px",height:"16px",borderRadius:"50%",background:aOk?"#10b981":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontWeight:700,color:aOk?"#fff":"rgba(255,255,255,0.25)",flexShrink:0}}>3</div>AGENDAR 1ª SESIÓN</div>
              <input type="date" className="inp" value={fechaCita} onChange={e=>{setFechaCita(e.target.value);setHoraCita("");if(e.target.value)setShowAgenda(true);}} style={{fontSize:"12px",padding:"8px 12px",colorScheme:"dark",marginBottom:"6px"}}/>
              {fechaCita&&!esDom&&<div>
                <button className="btn-ghost" style={{width:"100%",fontSize:"11px",marginBottom:"6px",borderColor:showAgenda?"#2721E8":"rgba(255,255,255,0.1)",color:showAgenda?"#fff":"rgba(255,255,255,0.4)"}} onClick={()=>setShowAgenda(!showAgenda)}>{showAgenda?"📅 Viendo agenda":"📅 Ver agenda del día"}</button>
                {!showAgenda&&<input type="time" className="inp" value={horaCita} onChange={e=>setHoraCita(e.target.value)} style={{fontSize:"12px",padding:"8px 12px",colorScheme:"dark"}}/>}
                {aOk&&<div style={{padding:"8px 10px",background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"8px",marginTop:"6px",fontSize:"11px",color:"#10b981"}}>✓ {new Date(fechaCita+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · {horaCita} – {horaFin(horaCita,duracionCita)} · {tipoSvc.label}</div>}
              </div>}
              {esDom&&<div style={{fontSize:"11px",color:"#ff6b6b",padding:"6px 0"}}>⚠ Domingo — cerrado</div>}
            </div>}
            {/* 4 Anticipo */}
            {aOk&&!esDom&&<div><div style={{fontSize:"9px",letterSpacing:"1px",color:anticoOpt!=="no"?"#10b981":"rgba(255,255,255,0.25)",marginBottom:"6px",display:"flex",alignItems:"center",gap:"5px"}}><div style={{width:"16px",height:"16px",borderRadius:"50%",background:anticoOpt!=="no"?"#10b981":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontWeight:700,color:anticoOpt!=="no"?"#fff":"rgba(255,255,255,0.25)",flexShrink:0}}>4</div>ANTICIPO</div>
              <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                {[{v:"no",l:"Sin anticipo",sub:"Paga el día de su cita"},{v:"transferencia",l:"$250 · Transferencia / Tarjeta"},{v:"efectivo",l:"$250 · Efectivo"}].map(o=>(
                  <button key={o.v} onClick={()=>{setAnticoOpt(o.v);if(o.v==="no")setTicketZettleAnticipo("");}} style={{padding:"9px 12px",borderRadius:"8px",border:"1px solid",fontSize:"11px",fontWeight:500,cursor:"pointer",textAlign:"left",background:anticoOpt===o.v?o.v==="no"?"rgba(255,255,255,0.05)":"rgba(16,185,129,0.12)":"transparent",borderColor:anticoOpt===o.v?o.v==="no"?"rgba(255,255,255,0.18)":"#10b981":"rgba(255,255,255,0.08)",color:anticoOpt===o.v?"#fff":"rgba(255,255,255,0.35)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>{o.l}</span>{anticoOpt===o.v&&<span style={{fontSize:"12px",color:o.v==="no"?"rgba(255,255,255,0.4)":"#10b981"}}>✓</span>}
                  </button>))}
                {anticoOpt!=="no"&&<div style={{marginTop:"4px"}}>
                  <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>TICKET ZETTLE (opcional)</div>
                  <input className="inp" value={ticketZettleAnticipo} onChange={e=>setTicketZettleAnticipo(e.target.value)} placeholder="#123" style={{fontSize:"12px",padding:"7px 10px",letterSpacing:"0.5px"}}/>
                </div>}
              </div>
            </div>}
          </div>
          {todo&&!esDom&&<div style={{padding:"12px 18px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
            {errGuardar&&<div style={{padding:"10px 14px",background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.3)",borderRadius:"8px",color:"#ff6b6b",fontSize:"12px",marginBottom:"10px",lineHeight:"1.4"}}>⚠ {errGuardar}</div>}
            {anticoOpt!=="no"
              ?<div style={{display:"flex",flexDirection:"column",gap:"8px"}}><div style={{padding:"8px 10px",background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.25)",borderRadius:"8px"}}><div style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(168,85,247,0.8)",marginBottom:"4px",fontWeight:600}}>📅 FECHA TICKET</div><input type="date" className="inp" value={fechaTicket} max={hoy()} onChange={e=>setFechaTicket(e.target.value||hoy())} style={{fontSize:"11px",padding:"6px 10px",colorScheme:"dark"}}/>{fechaTicket!==hoy()&&<div style={{fontSize:"9px",color:"#f59e0b",marginTop:"4px"}}>⚠ Retroactivo: {new Date(fechaTicket+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})}</div>}</div><button className="btn-blue" style={{width:"100%",padding:"13px",fontSize:"14px",background:"#10b981"}} onClick={cerrarAnticipo} disabled={saving}>{saving?"Guardando...":"✓ Registrar anticipo $250 + cita"}</button></div>
              :<div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                <button className="btn-blue" style={{width:"100%",padding:"13px",fontSize:"14px"}} onClick={agendarSinAnticipo} disabled={saving}>{saving?"Guardando...":"📅 Agendar sin anticipo"}</button>
                <button className="btn-ghost" style={{width:"100%",padding:"10px",fontSize:"12px",color:"rgba(255,255,255,0.45)"}} onClick={()=>{setErrGuardar("");setPagos([{metodo:"",monto:totalCD}]);setShowConfirm(true);}} disabled={saving}>Cobrar {fmt(total)} ahora</button>
              </div>}
          </div>}
        </div>
      </div>}

      {showConfirm&&<div className="overlay"><div className="glass" style={{width:460,padding:"28px"}}>
        <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>CONFIRMAR COBRO</div>
        <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"18px"}}>
          <div style={{padding:"12px",background:"rgba(0,0,0,0.3)",borderRadius:"10px"}}><div style={{fontSize:"12px",fontWeight:600,marginBottom:"4px"}}>{carrito[0]?.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Clienta: {nombreFinal}{tipoTicket==="recompra"?" (Recompra)":""}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>📅 {new Date(fechaCita+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · {horaCita} – {horaFin(horaCita,duracionCita)}</div></div>
          <div style={{padding:"10px 12px",background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.25)",borderRadius:"8px"}}><div style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(168,85,247,0.8)",marginBottom:"6px",fontWeight:600}}>📅 FECHA DEL TICKET</div><input type="date" className="inp" value={fechaTicket} max={hoy()} onChange={e=>setFechaTicket(e.target.value||hoy())} style={{fontSize:"12px",padding:"7px 10px",colorScheme:"dark"}}/>{fechaTicket!==hoy()&&<div style={{fontSize:"10px",color:"#f59e0b",marginTop:"6px"}}>⚠ Ticket retroactivo: {new Date(fechaTicket+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>}</div>
          {/* Multi-pago */}
          <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"8px",letterSpacing:"1px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>FORMA DE PAGO</span>{pagos.length>1&&(()=>{const rest=totalCD-pagos.reduce((s,p)=>s+p.monto,0);return<span style={{color:rest===0?"#10b981":"#f97316",fontSize:"10px",fontWeight:600}}>{rest===0?"✓ Completo":`Restante: ${fmt(rest)}`}</span>;})()}</div>
            {pagos.map((p,i)=>(
              <div key={i} style={{marginBottom:"8px",padding:"10px",background:"rgba(0,0,0,0.2)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
                {pagos.length>1&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}><span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>Pago {i+1}</span><button onClick={()=>setPagos(pagos.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"rgba(255,100,100,0.55)",cursor:"pointer",fontSize:"14px",lineHeight:1,padding:"0 2px"}}>✕</button></div>}
                <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:pagos.length>1?"8px":"0"}}>
                  {["Efectivo","Débito","Crédito","Transferencia","Depósito","Link de pago"].map(m=>(
                    <button key={m} onClick={()=>{const n=[...pagos];n[i]={...n[i],metodo:m};if(m!=="Crédito")setMsiSel(0);setPagos(n);}} style={{padding:"7px 10px",borderRadius:"7px",border:"1px solid",fontSize:"10px",fontWeight:500,cursor:"pointer",background:p.metodo===m?"#2721E8":"transparent",borderColor:p.metodo===m?"#2721E8":"rgba(255,255,255,0.1)",color:p.metodo===m?"#fff":"rgba(255,255,255,0.4)"}}>{m}</button>
                  ))}
                </div>
                {pagos.length>1&&<input type="number" className="inp" value={p.monto||""} onChange={e=>{const n=[...pagos];n[i]={...n[i],monto:Number(e.target.value)||0};setPagos(n);}} style={{fontSize:"12px",padding:"6px 10px"}} placeholder="Monto $"/>}
                {p.metodo==="Crédito"&&msiD.length>0&&pagos.length===1&&<div style={{marginTop:"8px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>MSI</div><div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}><button className="btn-ghost" style={{borderColor:msiSel===0?"#2721E8":"rgba(255,255,255,0.1)",color:msiSel===0?"#fff":"rgba(255,255,255,0.4)",padding:"7px 12px",fontSize:"11px"}} onClick={()=>setMsiSel(0)}>Sin MSI</button>{msiD.map(m=><button key={m} className="btn-ghost" style={{borderColor:msiSel===m?"#2721E8":"rgba(255,255,255,0.1)",color:msiSel===m?"#fff":"rgba(255,255,255,0.4)",padding:"7px 12px",fontSize:"11px"}} onClick={()=>setMsiSel(m)}>{m} MSI</button>)}</div></div>}
                {["Débito","Crédito"].includes(p.metodo)&&terminalesPOS.length>0&&<div style={{marginTop:"8px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"4px",letterSpacing:"1px"}}>TERMINAL</div><div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"6px"}}>{terminalesPOS.map(t=><button key={t.nombre} onClick={()=>setTermSel({...termSel,[i]:t.nombre})} style={{padding:"6px 10px",borderRadius:"7px",border:"1px solid",fontSize:"10px",cursor:"pointer",background:termSel[i]===t.nombre?"rgba(73,184,211,0.15)":"transparent",borderColor:termSel[i]===t.nombre?"#49B8D3":"rgba(255,255,255,0.1)",color:termSel[i]===t.nombre?"#49B8D3":"rgba(255,255,255,0.4)"}}>{t.nombre}<br/><span style={{fontSize:"9px"}}>{t.comision}%+IVA</span></button>)}</div>{termSel[i]&&(()=>{const t=terminalesPOS.find(x=>x.nombre===termSel[i]);const base=pagos.length===1?totalCD:p.monto||totalCD;if(!t||!base)return null;const neto=netoTarjeta(base,t.comision);return<div style={{padding:"6px 10px",background:"rgba(73,184,211,0.06)",border:"1px solid rgba(73,184,211,0.15)",borderRadius:"6px",fontSize:"10px",display:"flex",justifyContent:"space-between"}}><span style={{color:"rgba(255,255,255,0.4)"}}>Comisión {t.nombre}: −{fmt(base-neto)}</span><span style={{color:"#49B8D3",fontWeight:600}}>Neto: {fmt(neto)}</span></div>;})()}</div>}
                {p.metodo==="Efectivo"&&pagos.length===1&&<div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",marginTop:"8px",background:"rgba(16,185,129,0.06)",borderRadius:"8px",border:"1px solid rgba(16,185,129,0.2)"}}><span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Desc. 5%</span><button className="btn-ghost" style={{borderColor:descuento===5?"#10b981":"rgba(255,255,255,0.1)",color:descuento===5?"#10b981":"rgba(255,255,255,0.4)",padding:"5px 12px",fontSize:"11px"}} onClick={()=>setDescuento(descuento===5?0:5)}>{descuento===5?"✓ Aplicado":"Aplicar"}</button></div>}
              </div>
            ))}
            {pagos[pagos.length-1]?.metodo&&<button className="btn-ghost" onClick={()=>{const suma=pagos.length===1?0:pagos.reduce((s,p)=>s+p.monto,0);const resto=totalCD-suma;setPagos(pagos.length===1?[{...pagos[0],monto:Math.round(totalCD/2)},{metodo:"",monto:totalCD-Math.round(totalCD/2)}]:[...pagos,{metodo:"",monto:Math.max(0,resto)}]);}} style={{width:"100%",fontSize:"11px",padding:"8px",marginTop:"2px"}}>+ Agregar otro método de pago</button>}
          </div>
          <div style={{padding:"14px",background:"rgba(0,0,0,0.3)",borderRadius:"10px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"6px"}}><span style={{color:"rgba(255,255,255,0.5)"}}>{carrito[0]?.nombre}</span><span>{fmt(total)}</span></div><div style={{height:"1px",background:"rgba(255,255,255,0.08)",marginBottom:"6px"}}/>{descuento>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",color:"#ff8a65",marginBottom:"6px"}}><span>Desc. {descuento}%</span><span>-{fmt(total*descuento/100)}</span></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:"20px",fontWeight:700}}><span>Total</span><span style={{color:"#49B8D3"}}>{fmt(totalCD)}</span></div>{msiSel>0&&<div style={{fontSize:"12px",color:"#49B8D3",textAlign:"right",marginTop:"4px"}}>{fmt(totalCD/msiSel)}/mes × {msiSel}</div>}</div>
        </div>
        {errGuardar&&<div style={{padding:"10px 14px",background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.3)",borderRadius:"8px",color:"#ff6b6b",fontSize:"12px",marginBottom:"12px",lineHeight:"1.4"}}>⚠ {errGuardar}</div>}
        <div style={{display:"flex",gap:"10px"}}><button className="btn-ghost" onClick={()=>setShowConfirm(false)} style={{flex:1,padding:"13px"}}>Cancelar</button><button className="btn-blue" onClick={cerrar} disabled={saving||!pagos.every(p=>p.metodo)||(pagos.length>1&&pagos.reduce((s,p)=>s+p.monto,0)!==totalCD)} style={{flex:2,padding:"13px",fontSize:"15px"}}>{saving?"Guardando...":"✓ Confirmar cobro"}</button></div>
      </div></div>}

      {showExito&&<div className="overlay" style={{zIndex:300}}><div className="glass" style={{width:400,padding:"40px",textAlign:"center",borderColor:"rgba(16,185,129,0.3)"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>✅</div><div style={{fontSize:"18px",fontWeight:700,marginBottom:"6px"}}>¡Ticket creado!</div><div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>{tipoTicket==="recompra"?"Recompra":"Ficha"} de {nombreFinal} + cita agendada</div></div></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// IMPORTAR CALENDARIO — Archivo .ics exportado de Google Calendar
// ══════════════════════════════════════════════════════════════════════════════
// Helpers para parseo robusto de ICS
const ICS_SKIP_RE=/bloquear|bloqueado|descanso|capacitaci|permiso|cambiar agua|ir a sucursal|reunion|reunión|junta|no asiste|no asistio|recordatorio|birthday|aniversario/i;
const ICS_EMOJI_RE=/[\p{Emoji_Presentation}\p{Extended_Pictographic}✅🔁🤖🧾\u200d\ufe0f]/gu;
// Mapas de iniciales → nombre completo por sucursal
const PERSONAL_MAPS={
  Metepec:{"MB":"Mariana B.","LR":"Liliana R."},
  Valle:{"EA":"Evelin Amezcua","CN":"Carla Navarro","JV":"Jazmin Vázquez"},
  Polanco:{"CN":"Carla Navarro","JV":"Jazmin Vázquez"},
};
const ICS_SES_MAP=[[/\b1[ae]?ra?\b|primera\b|1er\b/,1],[/\b2d[ao]?\b|segunda\b/,2],[/\b3[ae]?ra?\b|tercera?\b/,3],[/\b4t[ao]?\b|cuarta?\b/,4],[/\b5t[ao]?\b|quinta?\b/,5],[/\b6t[ao]?\b|sexta?\b/,6],[/\b7m[ao]?\b|s[eé]ptima?\b/,7],[/\b8v[ao]?\b|octava?\b/,8],[/\b9n[ao]?\b|novena?\b/,9],[/\b10[ao]?\b|d[eé]cima?\b/,10]];
function icsSesDesc(d){if(!d)return 1;const l=d.toLowerCase();for(const[re,n]of ICS_SES_MAP)if(re.test(l))return n;const m=d.match(/sesi[oó]n\s*#?\s*(\d+)/i);if(m)return parseInt(m[1]);const m2=d.match(/\b(\d{1,2})\s*[°º]/);if(m2)return parseInt(m2[1]);const m3=l.match(/\b(\d{1,2})a(?:\b|[a-záéíóú])/);return m3?parseInt(m3[1]):1;}
function icsSesSum(s){if(!s)return null;const m=s.match(/\b(\d{1,2})\s*[°º]/);if(m)return parseInt(m[1]);const m2=s.match(/\b(\d{1,2})\s*(?:era?|ra?|da?|ta?|va?|ma?|a)(?:\b|[a-záéíóú])/i);return m2?parseInt(m2[1]):null;}
function icsServicio(desc,summary){const src=(desc||summary||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");if(/bikini\s+y\s+axilas?|axilas?\s+y\s+bikini/.test(src))return"Bikini y Axilas";if(/combo\s*sexy|sexy\s*bikini/.test(src))return"Combo Sexy";if(/combo\s*playa|playa/.test(src))return"Combo Playa";if(/combo\s*bikini/.test(src))return"Combo Bikini";if(/bk\s*french|french\s*bk|french\s*bikini|\bfb\b|french/.test(src))return"French Bikini";if(/bk\s*brazil|brazilia|bikini\s*brazil|\bbb\b/.test(src))return"Brazilian";if(/cuerpo\s*completo|\bcc\b/.test(src))return"Cuerpo Completo";if(/interglut/.test(src))return"Interglútea";if(/menton/.test(src))return"Mentón";if(/brazos\s*y\s*piernas|brazos/.test(src))return"Brazos y Piernas";if(/piernas\s*y\s*pompas?|\bpp\b/.test(src))return"Piernas y Pompas";if(/piernas/.test(src))return"Piernas";if(/\bpies\b|apies/.test(src))return"Pies";if(/axilas/.test(src))return"Axilas";if(/medio\s*rostro/.test(src))return"Medio Rostro";if(/rostro\s*completo|\brc\b/.test(src))return"Rostro Completo";if(/rostro/.test(src))return"Rostro Completo";if(/hidrafacial/.test(src))return"Hidrafacial";if(/baby\s*clean|baby/.test(src))return"Baby Clean";if(/facial/.test(src))return"Facial";if(/hifu/.test(src))return"HIFU Facial";if(/lifting|radio/.test(src))return"Lifting/Radio";if(/moldeo|corporal|anticel/.test(src))return"Corporal";if(/post\s*op/.test(src))return"Post Op";if(/cera/.test(src))return"Cera";if(/\bbigote\b/.test(src))return"Bigote";if(/\bespalda\b/.test(src))return"Espalda";return"Servicio";}
// Extrae de la descripción: servicio principal, sesión, servicios extra y ticket(s) Zettle
// Descripción con formato "N° SERVICIO ... N° SERVICIO2 ..." → un solo resultado con extras
// Ej: "6° AXILAS Y BIKINI 1° MENTON #6431 1° RC 6° INTERGLUTEA" →
//   { sesNum:6, servicio:"Axilas y Bikini",
//     extras:[{sesNum:1,servicio:"Mentón"},{sesNum:1,servicio:"Rostro Completo"},{sesNum:6,servicio:"Interglútea"}],
//     tickets:"#6431" }
const DESC_NOISE_RE=/\b(PAGADO|PENDIENTE|ANTICIPO|SIN\s+ANTICIPO|REAGEND\w*|FECHA|\d+MSI|\d+PAGO|BANORTE|BANAMEX|BBVA|BANCOMER|SANTANDER|HSBC|OXXO|TRANSFERENCIA|EFECTIVO|TARJETA|CREDITO|DEBITO|CN|JV|LS|AM|MJ|SR|RO|HB|COBRADO|HECTOR|RODOLFO|NOMBRE\s+\w+)\b/gi;
function parseDescripcionPares(desc){
  if(!desc)return null;
  const d=desc.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  // Extraer ticket(s) Zettle: #NNNN
  const ticketMatches=[...d.matchAll(/#(\d{3,6})/g)];
  const tickets=ticketMatches.length?ticketMatches.map(m=>`#${m[1]}`).join(", "):"";
  // Buscar patrones "N° " o "Ner/Nda/etc "
  const reOrd=/(\d{1,2})\s*[°º]|(\d{1,2})\s*(?:er|ra?|da?|ta?|va?|ma?|a)\b/gi;
  const matches=[...d.matchAll(reOrd)];
  if(!matches.length)return null;
  const pairs=[];
  for(let i=0;i<matches.length;i++){
    const sesNum=parseInt(matches[i][1]||matches[i][2]);
    const segStart=matches[i].index+matches[i][0].length;
    const segEnd=i+1<matches.length?matches[i+1].index:d.length;
    const frag=d.slice(segStart,segEnd).replace(DESC_NOISE_RE,"").replace(/\s+/g," ").trim();
    if(!frag)continue;
    const servicio=icsServicio(frag,"");
    if(servicio!=="Servicio")pairs.push({sesNum,servicio});
  }
  if(!pairs.length)return null;
  const[primero,...extras]=pairs;
  return{sesNum:primero.sesNum,servicio:primero.servicio,extras:extras.length?extras:null,tickets:tickets||null};
}
/// Extrae lista de servicios desde texto tipo "BRAZILIAN BIGOTE Y MENTON"
function parseServiciosList(text){
  const src=(text||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const found=[];
  if(/bikini\s*y\s*axilas|axilas\s*y\s*bikini/.test(src))found.push("Bikini y Axilas");
  else if(/\baxilas\b/.test(src))found.push("Axilas");
  if(/piernas\s*y\s*pompas|\bpp\b/.test(src))found.push("Piernas y Pompas");
  else if(/\bpiernas\b/.test(src))found.push("Piernas");
  if(/brazos\s*y\s*piernas/.test(src))found.push("Brazos y Piernas");
  else if(/\bbrazos\b/.test(src))found.push("Brazos");
  if(/bk\s*brazil|brazilia|bikini\s*braz|\bbb\b|\bbrazilian\b|\bbrzilian\b/.test(src))found.push("Brazilian");
  if(/bk\s*french|french\s*bk|french\s*bikini|\bfb\b|\bfrench\b/.test(src))found.push("French Bikini");
  if(/cuerpo\s*completo|\bcc\b/.test(src))found.push("Cuerpo Completo");
  if(/interglut/.test(src))found.push("Interglútea");
  if(/rostro\s*completo|\brc\b/.test(src))found.push("Rostro Completo");
  else if(/medio\s*rostro/.test(src))found.push("Medio Rostro");
  else if(/\brostro\b/.test(src))found.push("Rostro Completo");
  if(/\bmenton\b/.test(src))found.push("Mentón");
  if(/\bbigote\b/.test(src))found.push("Bigote");
  if(/\bpies\b/.test(src))found.push("Pies");
  if(/\bespalda\b/.test(src))found.push("Espalda");
  return found;
}
// Parsea formato Metepec — dos variantes:
//  Caso A (cada zona con su propio DIODO...SESION): "DIODO PIERNAS MANTENIMIENTO SESION 4  DIODO AXILAS SESION 4"
//  Caso B (todas las zonas antes de un SESION):     "BRAZILIAN BIGOTE Y MENTON DIODO SESION 6 LR"
function parseMetepecDesc(desc){
  if(!desc||!/SESION\s+\d/i.test(desc))return null;
  const d=desc.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const sesMatches=[...d.matchAll(/SESION\s+(\d+)/gi)];
  const esManten=/MANTENIMIENTO/i.test(d);
  if(sesMatches.length>1){
    // Caso A: múltiples bloques DIODO...SESION N
    const segments=d.split(/\bDIODO\b/i).filter(s=>s.trim());
    const pairs=[];
    for(const seg of segments){
      const mSes=seg.match(/SESION\s+(\d+)/i);if(!mSes)continue;
      const sesNum=parseInt(mSes[1]);
      const segManten=/MANTENIMIENTO/i.test(seg);
      const beforeSesion=seg.slice(0,mSes.index).replace(/MANTENIMIENTO/gi,"").trim();
      const servNombre=icsServicio(beforeSesion,"");
      if(servNombre==="Servicio")continue;
      pairs.push({sesNum,servicio:segManten?servNombre+" Mantenimiento":servNombre});
    }
    if(!pairs.length)return null;
    const[primero,...extras]=pairs;
    return{sesNum:primero.sesNum,servicio:primero.servicio,extras:extras.length?extras:null,tickets:null};
  }else{
    // Caso B: zonas listadas antes O después de DIODO, con un solo SESION N
    const sesNum=parseInt(sesMatches[0][1]);
    const sesIdx=sesMatches[0].index;
    const mDiodo=d.match(/\bDIODO\b/i);
    let servicesText;
    if(!mDiodo||mDiodo.index>=sesIdx){
      // Sin DIODO o SESION viene primero → servicios están ANTES de SESION
      servicesText=d.slice(0,sesIdx).trim();
    }else if(d.slice(0,mDiodo.index).trim().length===0){
      // DIODO al inicio → servicios están ENTRE DIODO y SESION
      servicesText=d.slice(mDiodo.index+mDiodo[0].length,sesIdx).trim();
    }else{
      // DIODO en medio → servicios están ANTES de DIODO
      servicesText=d.slice(0,mDiodo.index).trim();
    }
    if(!servicesText)return null;
    const servsList=parseServiciosList(servicesText);
    if(!servsList.length)return null;
    const pairs=servsList.map(s=>({sesNum,servicio:esManten?s+" Mantenimiento":s}));
    const[primero,...extras]=pairs;
    return{sesNum:primero.sesNum,servicio:primero.servicio,extras:extras.length?extras:null,tickets:null};
  }
}
function icsParseDT(dt,useDST){if(!dt)return{date:null,time:null};if(/^\d{8}$/.test(dt))return{date:`${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}`,time:null};const m=dt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}(Z?)$/);if(!m)return{date:null,time:null};const[,Y,Mo,D,H,Mi,isZ]=m;if(isZ==="Z"){const utc=new Date(Date.UTC(+Y,+Mo-1,+D,+H,+Mi));// México abolió DST en 2023 — desde 2023 siempre UTC-6. Antes: CDT(UTC-5) abr-oct.
const off=(useDST&&+Y<2023&&+Mo>=4&&+Mo<=10)?5:6;const local=new Date(utc.getTime()-off*3600000);return{date:`${local.getUTCFullYear()}-${String(local.getUTCMonth()+1).padStart(2,"0")}-${String(local.getUTCDate()).padStart(2,"0")}`,time:`${String(local.getUTCHours()).padStart(2,"0")}:${String(local.getUTCMinutes()).padStart(2,"0")}`};}return{date:`${Y}-${Mo}-${D}`,time:`${H}:${Mi}`};}

function parseICS(text,opts={}){
  // 1. Unfold continuation lines (RFC 5545 §3.1) — causa principal de datos incompletos
  const unfolded=text.replace(/\r\n[ \t]/g,"").replace(/\n[ \t]/g,"");
  const lines=unfolded.split(/\r?\n/);
  const rawEvs=[];let cur=null;
  for(const line of lines){
    if(line==="BEGIN:VEVENT"){cur={};continue;}
    if(line==="END:VEVENT"&&cur){rawEvs.push(cur);cur=null;continue;}
    if(!cur)continue;
    const ci=line.indexOf(":");if(ci<0)continue;
    const key=line.slice(0,ci).toUpperCase().replace(/;.*/,""); // strip params tipo ;TZID=...
    const val=line.slice(ci+1);
    if(!cur[key])cur[key]=val;
  }
  const minDate=opts.minDate||"2025-01-01";
  const useDST=opts.useDST!==false; // true = CDMX con horario de verano (Polanco, etc.)
  const personalMap=opts.personalMap||{};
  const appointments=[],skipped=[];
  for(const ev of rawEvs){
    const rawS=ev["SUMMARY"]||"";
    const sl=rawS.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if(ICS_SKIP_RE.test(sl)){skipped.push({summary:rawS,razon:"Entrada administrativa"});continue;}
    // Limpiar summary: quitar emojis, bytes corruptos UTF-8→Latin-1, ordinal de sesión
    let clean=rawS.replace(ICS_EMOJI_RE,"").replace(/[\u00c0-\u00ff]+/g,"");
    clean=clean.replace(/^\d{1,2}\s*[°º]\s*/,"").replace(/^\d{1,2}\s*(?:era?|ra?|da?|ta?|va?|ma?|a)\s*/i,"").replace(/^\d{1,2}a([a-z])/i,"$1").replace(/\s+/g," ").trim();
    if(!clean||clean.length<3){skipped.push({summary:rawS,razon:"Nombre vacío o muy corto"});continue;}
    // Extraer teléfono del final si existe
    const phoneM=clean.match(/(\d[\d\s\-]{6,}\d)\s*$/);
    let nombre=clean;let telefono=null;
    if(phoneM){const nm=clean.slice(0,clean.lastIndexOf(phoneM[0])).trim();if(nm){nombre=nm;telefono=phoneM[1].replace(/[\s\-]/g,"");}}
    // Fechas con zona horaria correcta
    const dtS=ev["DTSTART"]||"";const dtE=ev["DTEND"]||"";
    const{date,time:horaIni}=icsParseDT(dtS,useDST);
    const{time:horaFinRaw}=icsParseDT(dtE,useDST);
    if(!date){skipped.push({summary:rawS,razon:"Fecha inválida"});continue;}
    if(date<minDate){skipped.push({summary:rawS,razon:`Anterior a ${minDate}`});continue;}
    // Servicio y número de sesión
    const rawDesc=(ev["DESCRIPTION"]||"").replace(/\\n/g,"\n").replace(/\\\\/g,"\\").replace(/\\,/g,",").replace(/\\;/g,";");
    const hasCheck=rawS.includes("✅");
    const estado=date<hoy()?(hasCheck?"completada":"cancelada"):"agendada";
    const reagendada=/reagend/i.test(rawDesc)||rawS.toLowerCase().includes("reagend");
    // Intentar extraer servicio+sesión+extras+ticket desde descripción (formato "N° SERVICIO")
    const pares=parseDescripcionPares(rawDesc)||parseMetepecDesc(rawDesc);
    let servicio,sesNum,serviciosSesion=null,ticketZettle=null;
    if(pares){
      servicio=pares.servicio;sesNum=pares.sesNum;
      serviciosSesion=pares.extras||null;
      ticketZettle=pares.tickets||null;
    }else{
      servicio=icsServicio(rawDesc,rawS);
      sesNum=icsSesSum(rawS)||icsSesDesc(rawDesc);
      // Extraer ticket incluso sin pares de servicios
      const tm=[...rawDesc.matchAll(/#(\d{3,6})/g)];
      if(tm.length)ticketZettle=tm.map(m=>`#${m[1]}`).join(", ");
    }
    const tipo=detectTipo(servicio);
    // Extraer iniciales al final del rawDesc (ej: "ESPALDA DIODO SESION 4  LR" → "LR")
    const inicialesM=rawDesc.trim().match(/\s+([A-Z]{2,3})\s*$/);
    const agendadoPor=inicialesM&&personalMap[inicialesM[1]]?personalMap[inicialesM[1]]:null;
    const horaFiCalc=horaFinRaw||horaFin(horaIni||"10:00",tipo.duracion);
    const baseAppt={nombre,telefono,fecha:date,horaIni:horaIni||"10:00",horaFi:horaFiCalc,estado,incluir:estado!=="cancelada",reagendada,ticketZettle,agendadoPor,serviciosSesion:null};
    appointments.push({id:`ics-${appointments.length}`,...baseAppt,servicio,tipo:tipo.id,duracion:tipo.duracion,sesNum});
    // Cada servicio extra del mismo evento se convierte en una cita separada (propio paquete)
    if(serviciosSesion){
      for(const extra of serviciosSesion){
        const eTipo=detectTipo(extra.servicio);
        appointments.push({id:`ics-${appointments.length}`,...baseAppt,servicio:extra.servicio,tipo:eTipo.id,duracion:eTipo.duracion,sesNum:extra.sesNum});
      }
    }
  }
  // Deduplicar: si el ICS tiene el mismo evento dos veces (reagendado, recurrente, o servicio repetido en extras)
  const seen=new Set();
  const deduped=appointments.filter(a=>{const k=`${a.nombre}||${a.fecha}||${a.horaIni}||${a.servicio}`;if(seen.has(k))return false;seen.add(k);return true;});
  deduped.sort((a,b)=>a.fecha.localeCompare(b.fecha));
  return{appointments:deduped,skipped};
}

function GCalImport({session,useDST=true}){
  const[parsed,setParsed]=useState([]);
  const[skipped,setSkipped]=useState([]);
  const[showSkipped,setShowSkipped]=useState(false);
  const[loading,setLoading]=useState(false);
  const[importing,setImporting]=useState(false);
  const[result,setResult]=useState(null);
  const[step,setStep]=useState(1); // 1=subir, 2=preview, 3=resultado
  const[fileName,setFileName]=useState("");
  const[dragOver,setDragOver]=useState(false);
  const[progress,setProgress]=useState({fase:"",done:0,total:0});
  const[deleting,setDeleting]=useState(false);
  const[minDate,setMinDate]=useState("2020-01-01");
  const fileRef=useRef(null);

  const borrarCalendario=async()=>{
    if(!window.confirm(`¿Borrar TODAS las citas, paquetes y clientas de ${session.nombre}? Esta acción no se puede deshacer.`))return;
    setDeleting(true);
    try{
      await supabase.from("citas").delete().eq("sucursal_id",session.id);
      await supabase.from("paquetes").delete().eq("sucursal_id",session.id);
      await supabase.from("clientas").delete().eq("sucursal_id",session.id);
      alert("Datos borrados. Ahora puedes volver a importar el calendario.");
    }catch(e){console.error(e);alert("Error al borrar: "+e.message);}
    setDeleting(false);
  };

  const procesarArchivo=(file)=>{
    if(!file)return;
    setFileName(file.name);setLoading(true);
    const reader=new FileReader();
    reader.onload=(e)=>{
      const text=e.target.result;
      const{appointments,skipped:sk}=parseICS(text,{useDST,minDate,personalMap:PERSONAL_MAPS[session.nombre]||{}});
      setParsed(appointments);setSkipped(sk);setStep(2);setLoading(false);
    };
    reader.readAsText(file);
  };

  const onDrop=(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f&&f.name.endsWith(".ics"))procesarArchivo(f);};
  const onFileChange=(e)=>{const f=e.target.files[0];if(f)procesarArchivo(f);};

  const importar=async()=>{
    const toImport=parsed.filter(p=>p.incluir);
    if(toImport.length===0)return;
    setImporting(true);setResult(null);
    let clientasCreadas=0,citasCreadas=0,paquetesCreados=0,errores=0;

    // Agrupar por nombre
    const porNombre={};
    toImport.forEach(p=>{if(!porNombre[p.nombre])porNombre[p.nombre]=[];porNombre[p.nombre].push(p);});
    const nombres=Object.keys(porNombre);

    try{
      // ── FASE 1: traer todas las clientas existentes en 1 sola query ──────────
      setProgress({fase:"Buscando clientas existentes...",done:0,total:nombres.length});
      const{data:existentes=[]}=await supabase.from("clientas").select("id,nombre,telefono").eq("sucursal_id",session.id);
      const clientaMap=Object.fromEntries((existentes||[]).map(c=>[c.nombre,c]));

      // ── FASE 2: crear clientas nuevas en un solo batch ────────────────────────
      setProgress({fase:"Creando clientas nuevas...",done:0,total:nombres.length});
      const nuevas=nombres.filter(n=>!clientaMap[n]).map(n=>({
        nombre:n,
        telefono:porNombre[n].find(c=>c.telefono)?.telefono||null,
        sucursal_id:session.id,sucursal_nombre:session.nombre
      }));
      if(nuevas.length>0){
        const{data:creadas}=await supabase.from("clientas").insert(nuevas).select();
        (creadas||[]).forEach(c=>{clientaMap[c.nombre]=c;clientasCreadas++;});
      }
      // Actualizar teléfono de existentes que no tenían
      const teleUpdates=nombres.filter(n=>{const e=clientaMap[n];const t=porNombre[n].find(c=>c.telefono)?.telefono;return e&&!e.telefono&&t;});
      await Promise.all(teleUpdates.map(n=>supabase.from("clientas").update({telefono:porNombre[n].find(c=>c.telefono).telefono}).eq("id",clientaMap[n].id)));

      // ── FASE 3: limpiar paquetes y citas existentes de estas clientas (import idempotente) ────
      setProgress({fase:"Limpiando datos anteriores...",done:0,total:nombres.length});
      const clientaIds=Object.values(clientaMap).map(c=>c?.id).filter(Boolean);
      if(clientaIds.length>0){
        // Borrar en lotes de 100 para no sobrepasar el límite de Supabase
        for(let i=0;i<clientaIds.length;i+=100){
          const chunk=clientaIds.slice(i,i+100);
          await supabase.from("citas").delete().in("clienta_id",chunk);
          await supabase.from("paquetes").delete().in("clienta_id",chunk);
        }
      }
      // ── FASE 3b: crear todos los paquetes en un solo batch ────────────────────
      setProgress({fase:"Creando paquetes...",done:0,total:nombres.length});
      const paqRows=[];
      for(const nombre of nombres){
        const clientaId=clientaMap[nombre]?.id;if(!clientaId)continue;
        const porServicio={};
        porNombre[nombre].forEach(c=>{if(!porServicio[c.servicio])porServicio[c.servicio]=[];porServicio[c.servicio].push(c);});
        for(const[servicio,sesiones] of Object.entries(porServicio)){
          const sesUsadasByCount=sesiones.filter(s=>s.estado==="completada").length;
          const agsSes=sesiones.filter(s=>s.estado==="agendada");
          // Si la próxima sesión agendada es la 6a, significa que 5 ya se hicieron
          const sesUsadasByNum=agsSes.length>0?Math.min(...agsSes.map(s=>s.sesNum))-1:0;
          const sesUsadas=Math.max(sesUsadasByCount,sesUsadasByNum,0);
          const esManten=/mantenimiento/i.test(servicio);
          const totalSes=esManten?Math.max(...sesiones.map(s=>s.sesNum)):Math.max(...sesiones.map(s=>s.sesNum),8);
          paqRows.push({clienta_id:clientaId,clienta_nombre:nombre,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio,total_sesiones:totalSes,sesiones_usadas:sesUsadas,precio:0,fecha_compra:sesiones[0].fecha,activo:sesUsadas<totalSes,_key:`${nombre}||${servicio}`});
        }
      }
      // Deduplicar: solo un paquete por (clienta_id + servicio)
      const seenPaqKeys=new Set();
      const paqRowsDedup=paqRows.filter(r=>{if(seenPaqKeys.has(r._key))return false;seenPaqKeys.add(r._key);return true;});
      const{data:paqCreados=[]}=await supabase.from("paquetes").insert(paqRowsDedup.map(({_key,...r})=>r)).select();
      paquetesCreados=paqCreados?.length||0;
      // Mapear paquete_id por nombre+servicio
      const paqMap={};
      (paqCreados||[]).forEach((p,i)=>{if(paqRowsDedup[i])paqMap[paqRowsDedup[i]._key]=p.id;});

      // ── FASE 4: insertar citas en chunks de 100 ──────────────────────────────
      const citaRows=[];
      for(const nombre of nombres){
        const clientaId=clientaMap[nombre]?.id;if(!clientaId)continue;
        const porServicio={};
        porNombre[nombre].forEach(c=>{if(!porServicio[c.servicio])porServicio[c.servicio]=[];porServicio[c.servicio].push(c);});
        for(const[servicio,sesiones] of Object.entries(porServicio)){
          const paqId=paqMap[`${nombre}||${servicio}`];
          sesiones.forEach(c=>citaRows.push({clienta_id:clientaId,clienta_nombre:nombre,paquete_id:paqId,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:c.servicio,tipo_servicio:c.tipo,duracion_min:c.duracion,fecha:c.fecha,hora_inicio:c.horaIni,hora_fin:c.horaFi,sesion_numero:c.sesNum,es_cobro:c.sesNum===1,estado:c.estado==="cancelada"?"completada":c.estado,notas:c.reagendada?"Reagendada - Importado de Google Calendar (.ics)":"Importado de Google Calendar (.ics)",...(c.agendadoPor?{agendado_por:c.agendadoPor}:{}),...(c.ticketZettle?{ticket_zettle:c.ticketZettle}:{}),...(c.serviciosSesion?{servicios_sesion:c.serviciosSesion}:{})}));
        }
      }
      const CHUNK=100;
      for(let i=0;i<citaRows.length;i+=CHUNK){
        setProgress({fase:"Guardando citas...",done:i,total:citaRows.length});
        const{error}=await supabase.from("citas").insert(citaRows.slice(i,i+CHUNK));
        if(error)errores++;else citasCreadas+=Math.min(CHUNK,citaRows.length-i);
      }
    }catch(e){console.error(e);errores++;}

    setResult({clientas:clientasCreadas,citas:citasCreadas,paquetes:paquetesCreados,errores});
    setStep(3);setImporting(false);setProgress({fase:"",done:0,total:0});
  };

  const toggleEvento=(id)=>setParsed(prev=>prev.map(p=>p.id===id?{...p,incluir:!p.incluir}:p));
  const toggleAll=(v)=>setParsed(prev=>prev.map(p=>({...p,incluir:v,...(v&&p.estado==="cancelada"?{estado:"completada"}:{})})));
  const editEvento=(id,field,val)=>setParsed(prev=>prev.map(p=>p.id===id?{...p,[field]:val}:p));
  const completadas=parsed.filter(p=>p.incluir&&p.estado==="completada").length;
  const canceladas=parsed.filter(p=>p.estado==="cancelada").length;
  const agendadas=parsed.filter(p=>p.incluir&&p.estado==="agendada").length;

  return(
    <div style={{padding:"20px 24px",overflowY:"auto",flex:1,color:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"20px"}}>
        <div style={{fontSize:"22px"}}>📥</div>
        <div style={{flex:1}}><div style={{fontSize:"16px",fontWeight:700}}>Importar desde Google Calendar</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>Sube el archivo .ics exportado de tu calendario · Sucursal: <span style={{color:"#49B8D3"}}>{session.nombre}</span></div></div>
        <button className="btn-ghost" style={{fontSize:"11px",padding:"6px 12px",borderColor:"rgba(239,68,68,0.3)",color:"rgba(239,68,68,0.7)"}} onClick={borrarCalendario} disabled={deleting}>{deleting?"Borrando...":"🗑 Borrar datos"}</button>
      </div>

      {/* Pasos */}
      <div style={{display:"flex",gap:"8px",marginBottom:"24px"}}>
        {[{n:1,l:"Subir archivo"},{n:2,l:"Revisar datos"},{n:3,l:"Listo"}].map((p,i)=>(
          <div key={p.n} style={{display:"flex",alignItems:"center",gap:"8px",flex:i<2?1:"auto"}}>
            <div style={{width:"28px",height:"28px",borderRadius:"50%",background:step>=p.n?"#2721E8":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,color:step>=p.n?"#fff":"rgba(255,255,255,0.2)",flexShrink:0}}>{step>p.n?"✓":p.n}</div>
            <div style={{fontSize:"12px",color:step===p.n?"#fff":"rgba(255,255,255,0.3)",fontWeight:step===p.n?600:400}}>{p.l}</div>
            {i<2&&<div style={{flex:1,height:"1px",background:step>p.n?"#2721E8":"rgba(255,255,255,0.06)"}}/>}
          </div>
        ))}
      </div>

      {/* PASO 1 — Subir archivo */}
      {step===1&&<div>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} onClick={()=>fileRef.current?.click()}
          style={{border:`2px dashed ${dragOver?"#2721E8":"rgba(255,255,255,0.1)"}`,borderRadius:"16px",padding:"60px 40px",textAlign:"center",cursor:"pointer",background:dragOver?"rgba(39,33,232,0.08)":"rgba(255,255,255,0.02)",transition:"all 0.2s"}}>
          <div style={{fontSize:"48px",marginBottom:"16px"}}>{loading?"⏳":"📄"}</div>
          <div style={{fontSize:"15px",fontWeight:600,marginBottom:"8px"}}>{loading?"Procesando archivo...":"Arrastra tu archivo .ics aquí"}</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>o haz click para seleccionar</div>
          <div className="btn-blue" style={{display:"inline-block",padding:"10px 24px",fontSize:"13px"}}>Seleccionar archivo .ics</div>
        </div>
        <input ref={fileRef} type="file" accept=".ics" onChange={onFileChange} style={{display:"none"}}/>
        <div className="glass" style={{padding:"12px 16px",marginTop:"12px",display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.5)",whiteSpace:"nowrap"}}>Importar desde:</div>
          <input type="date" value={minDate} onChange={e=>setMinDate(e.target.value)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"6px",color:"#fff",fontSize:"12px",padding:"4px 8px",cursor:"pointer"}}/>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Solo se importarán citas a partir de esta fecha</div>
        </div>
        <div className="glass" style={{padding:"16px 20px",marginTop:"16px"}}>
          <div style={{fontSize:"11px",fontWeight:600,marginBottom:"8px"}}>¿Cómo exportar desde Google Calendar?</div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",lineHeight:1.6}}>
            1. Abre <span style={{color:"#49B8D3"}}>calendar.google.com</span> → ⚙️ Configuración<br/>
            2. En la barra izquierda, click en el calendario de la sucursal<br/>
            3. Baja hasta "Exportar calendario" → descarga el .ics<br/>
            4. Sube ese archivo aquí
          </div>
        </div>
      </div>}

      {/* PASO 2 — Preview */}
      {step===2&&<div>
        {/* Stats bar */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"14px"}}>
          {[{l:"Total en archivo",v:parsed.length+skipped.length,c:"rgba(255,255,255,0.5)"},{l:"Válidos",v:parsed.length,c:"#49B8D3"},{l:"Omitidos",v:skipped.length,c:"#f97316"},{l:"Canceladas (sin ✅)",v:canceladas,c:"rgba(255,255,255,0.25)"}].map(k=><div key={k.l} style={{padding:"10px 14px",background:"rgba(255,255,255,0.04)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:"20px",fontWeight:700,color:k.c}}>{k.v}</div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{k.l}</div></div>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
          <div><div style={{fontSize:"13px",fontWeight:600}}>{fileName}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{parsed.filter(p=>p.incluir).length} seleccionados · ✅ {completadas} completadas · 📅 {agendadas} agendadas</div></div>
          <div style={{display:"flex",gap:"6px"}}>
            {skipped.length>0&&<button className="btn-ghost" style={{fontSize:"10px",padding:"5px 10px",borderColor:showSkipped?"#f97316":"rgba(255,255,255,0.1)",color:showSkipped?"#f97316":"rgba(255,255,255,0.4)"}} onClick={()=>setShowSkipped(v=>!v)}>⚠ {skipped.length} omitidos</button>}
            {canceladas>0&&<button className="btn-ghost" style={{fontSize:"10px",padding:"5px 10px",borderColor:"rgba(16,185,129,0.4)",color:"#10b981"}} onClick={()=>setParsed(prev=>prev.map(p=>p.estado==="cancelada"?{...p,estado:"completada",incluir:true}:p))}>✓ Historial completo</button>}
            <button className="btn-ghost" style={{fontSize:"10px",padding:"5px 10px"}} onClick={()=>toggleAll(true)}>✓ Todos</button>
            <button className="btn-ghost" style={{fontSize:"10px",padding:"5px 10px"}} onClick={()=>toggleAll(false)}>✕ Ninguno</button>
          </div>
        </div>

        {/* Omitidos */}
        {showSkipped&&skipped.length>0&&<div style={{marginBottom:"10px",border:"1px solid rgba(249,115,22,0.2)",borderRadius:"10px",overflow:"hidden"}}>
          <div style={{padding:"8px 12px",background:"rgba(249,115,22,0.06)",borderBottom:"1px solid rgba(249,115,22,0.15)",fontSize:"10px",letterSpacing:"1px",color:"#f97316",fontWeight:600}}>EVENTOS OMITIDOS — no se importarán</div>
          <div style={{maxHeight:"180px",overflowY:"auto"}}>
            {skipped.map((s,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto",padding:"5px 12px",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center",gap:"8px"}}>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.5)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.summary||"(sin título)"}</div>
              <div style={{fontSize:"10px",color:"#f97316",whiteSpace:"nowrap"}}>{s.razon}</div>
            </div>)}
          </div>
        </div>}

        <div style={{fontSize:"10px",color:"rgba(255,255,255,0.15)",marginBottom:"8px"}}>Puedes editar nombre, servicio y número de sesión antes de importar. Las canceladas están desmarcadas por defecto.</div>
        <div style={{maxHeight:"380px",overflowY:"auto",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"10px"}}>
          <div style={{display:"grid",gridTemplateColumns:"36px 1fr 1fr 78px 46px 46px 90px",padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:0,background:"#22264A",zIndex:2}}>
            {["","Nombre","Servicio","Fecha","Ses","Tot","Estado"].map(h=><div key={h} style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}
          </div>
          {parsed.map(p=><div key={p.id} style={{display:"grid",gridTemplateColumns:"36px 1fr 1fr 78px 46px 46px 90px",padding:"5px 12px",borderBottom:"1px solid rgba(255,255,255,0.03)",opacity:p.incluir?1:0.3,alignItems:"center"}}>
            <input type="checkbox" checked={p.incluir} onChange={()=>toggleEvento(p.id)} style={{width:"14px",height:"14px",cursor:"pointer",accentColor:"#2721E8"}}/>
            <input value={p.nombre} onChange={e=>editEvento(p.id,"nombre",e.target.value)} style={{background:"transparent",border:"none",color:"#fff",fontSize:"12px",fontWeight:500,outline:"none",padding:"4px 4px 4px 0",width:"100%"}}/>
            <input value={p.servicio} onChange={e=>editEvento(p.id,"servicio",e.target.value)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.5)",fontSize:"11px",outline:"none",padding:"4px 4px 4px 0",width:"100%"}}/>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{new Date(p.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"2-digit"})}</div>
            <input type="number" value={p.sesNum} onChange={e=>editEvento(p.id,"sesNum",parseInt(e.target.value)||1)} min="1" style={{background:"transparent",border:"none",color:"#49B8D3",fontSize:"12px",fontWeight:600,outline:"none",width:"28px",textAlign:"center"}}/>
            <input type="number" value={p.totalSes} onChange={e=>editEvento(p.id,"totalSes",parseInt(e.target.value)||8)} min="1" style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.3)",fontSize:"11px",outline:"none",width:"28px",textAlign:"center"}}/>
            <div style={{fontSize:"10px",fontWeight:600,color:p.estado==="completada"?"#10b981":p.estado==="cancelada"?"rgba(255,255,255,0.2)":"#49B8D3"}}>{p.estado==="completada"?"✅ Hecha":p.estado==="cancelada"?"✗ Cancelada":"📅 Agendada"}</div>
          </div>)}
        </div>
        {importing&&<div style={{marginTop:"16px",padding:"12px 16px",background:"rgba(39,33,232,0.08)",borderRadius:"10px",border:"1px solid rgba(39,33,232,0.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",fontWeight:500}}>{progress.fase||"Importando..."}</div>
            {progress.total>0&&<div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)"}}>{progress.done}/{progress.total}</div>}
          </div>
          {progress.total>0&&<div style={{height:"4px",background:"rgba(255,255,255,0.08)",borderRadius:"2px",overflow:"hidden"}}>
            <div style={{height:"100%",background:"#2721E8",borderRadius:"2px",width:`${Math.round(progress.done/progress.total*100)}%`,transition:"width 0.3s"}}/>
          </div>}
        </div>}
        <div style={{display:"flex",gap:"10px",marginTop:"12px"}}>
          <button className="btn-ghost" style={{flex:1}} onClick={()=>{setStep(1);setParsed([]);setSkipped([]);setShowSkipped(false);setFileName("");}}>← Otro archivo</button>
          <button className="btn-blue" style={{flex:2,padding:"13px",fontSize:"14px"}} onClick={importar} disabled={importing||parsed.filter(p=>p.incluir).length===0}>{importing?`Importando ${progress.done}/${progress.total}...`:"✓ Importar "+parsed.filter(p=>p.incluir).length+" eventos → "+session.nombre}</button>
        </div>
      </div>}

      {/* PASO 3 — Resultado */}
      {step===3&&result&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:"48px",marginBottom:"16px"}}>🎉</div>
        <div style={{fontSize:"18px",fontWeight:700,marginBottom:"8px"}}>¡Importación completada!</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginBottom:"24px"}}>{fileName} → {session.nombre}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"14px",maxWidth:"500px",margin:"0 auto 24px"}}>
          {[{l:"Clientas creadas",v:result.clientas,c:"#10b981"},{l:"Paquetes creados",v:result.paquetes,c:"#49B8D3"},{l:"Citas importadas",v:result.citas,c:"#2721E8"}].map(k=><div key={k.l} className="glass" style={{padding:"16px",textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:700,color:k.c}}>{k.v}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{k.l}</div></div>)}
        </div>
        {result.errores>0&&<div style={{fontSize:"12px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ {result.errores} errores</div>}
        <div style={{display:"flex",gap:"10px",justifyContent:"center"}}>
          <button className="btn-ghost" onClick={()=>{setStep(1);setParsed([]);setSkipped([]);setShowSkipped(false);setFileName("");setResult(null);}}>Importar otro archivo</button>
        </div>
      </div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// IMPORTAR CSV DE VENTAS — parsea el formato de Excel de ventas por sucursal
// ══════════════════════════════════════════════════════════════════════════════
const MESES_MAP={"enero":"01","febrero":"02","marzo":"03","abril":"04","mayo":"05","junio":"06","julio":"07","agosto":"08","septiembre":"09","octubre":"10","noviembre":"11","diciembre":"12"};
function parseCSVLine(line){const r=[];let c="",q=false;for(let i=0;i<line.length;i++){if(line[i]==='"')q=!q;else if(line[i]===","&&!q){r.push(c.trim());c="";}else c+=line[i];}r.push(c.trim());return r;}
function parseFechaVenta(f){
  // "2026-03-02" → as-is (ISO)
  const m0=f.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m0)return f.trim();
  // "2 de marzo" → "2026-03-02"
  const m1=f.trim().match(/(\d+)\s+de\s+(\w+)/i);
  if(m1){const dia=String(parseInt(m1[1])).padStart(2,"0");const mes=MESES_MAP[m1[2].toLowerCase()];if(mes)return`2026-${mes}-${dia}`;}
  // "5/1/2026" → "2026-01-05" (d/m/yyyy)
  const m2=f.trim().match(/(\d+)\/(\d+)\/(\d{4})/);
  if(m2){return`${m2[3]}-${String(parseInt(m2[2])).padStart(2,"0")}-${String(parseInt(m2[1])).padStart(2,"0")}`;}
  // "5/1" → assume 2026
  const m3=f.trim().match(/(\d+)\/(\d+)/);
  if(m3){return`2026-${String(parseInt(m3[2])).padStart(2,"0")}-${String(parseInt(m3[1])).padStart(2,"0")}`;}
  return null;
}
function parseMontoVenta(m){return Number((m||"").replace(/[$,]/g,""))||0;}
function parseMetodoPago(p){
  const l=(p||"").toLowerCase();
  if(l.includes("efectivo"))return"Efectivo";
  if(l.includes("transferencia"))return"Transferencia";
  if(l.includes("msi"))return"Crédito"+(l.match(/(\d+)msi/i)?` ${l.match(/(\d+)msi/i)[1]}MSI`:"");
  if(l.includes("banorte")||l.includes("bbva")||l.includes("banamex")||l.includes("zettle"))return"Débito";
  if(l.includes("deposito")||l.includes("depósito"))return"Depósito";
  return p||"Otro";
}
function parseTipoClienteCSV(campana){
  const l=(campana||"").toLowerCase();
  if(l.includes("recurrente")||l.includes("mantenimiento"))return"Recompra";
  return"Nueva";
}

function CSVImport({session}){
  const[parsed,setParsed]=useState([]);
  const[loading,setLoading]=useState(false);
  const[importing,setImporting]=useState(false);
  const[result,setResult]=useState(null);
  const[step,setStep]=useState(1);
  const[fileName,setFileName]=useState("");
  const[dragOver,setDragOver]=useState(false);
  const[parseErrors,setParseErrors]=useState([]);
  const fileRef=useRef(null);

  const procesarArchivo=(file)=>{
    if(!file)return;setFileName(file.name);setLoading(true);
    const reader=new FileReader();
    reader.onload=(e)=>{
      const text=e.target.result;
      const lines=text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith(",,,"));
      // Find header row
      const hdrIdx=lines.findIndex(l=>l.toUpperCase().includes("SERVICIO")&&l.toUpperCase().includes("FECHA"));
      if(hdrIdx===-1){setParseErrors(["No se encontró la fila de encabezados (SERVICIO, FECHA, MONTO...)"]);setLoading(false);return;}
      const hdrLine=parseCSVLine(lines[hdrIdx]);
      const dataLines=lines.slice(hdrIdx+1);
      const errs=[];
      const rows=dataLines.map((l,i)=>{
        const p=parseCSVLine(l);
        // Detect format: new consolidated (FECHA,SERVICIO,CONCEPTO,MONTO,FORMA_DE_PAGO,CLIENTE,TIPO_CLIENTA,...) 
        // or old format (SERVICIO,FECHA,MONTO,CONCEPTO,FORMA_DE_PAGO,CLIENTE,CAMPAÑA,...)
        const hdrFirst=(hdrLine[0]||"").toUpperCase();
        let servicio,fechaRaw,monto,concepto,metodo,cliente,tipoClienta,campana;
        if(hdrFirst.includes("FECHA")){
          // New consolidated format: FECHA,SERVICIO,CONCEPTO,MONTO,FORMA_DE_PAGO,CLIENTE,TIPO_CLIENTA
          fechaRaw=(p[0]||"").trim();servicio=(p[1]||"").trim();concepto=(p[2]||"").trim();
          monto=parseMontoVenta(p[3]);metodo=(p[4]||"").trim();cliente=(p[5]||"").trim();
          tipoClienta=(p[6]||"").trim();campana=(p[7]||"").trim();
          if(!["Nueva","Recompra","Recomendada"].includes(tipoClienta))tipoClienta=parseTipoClienteCSV(campana);
        }else{
          // Old format: SERVICIO,FECHA,MONTO,CONCEPTO,FORMA_DE_PAGO,CLIENTE,CAMPAÑA
          servicio=(p[0]||"").trim();fechaRaw=(p[1]||"").trim();monto=parseMontoVenta(p[2]);
          concepto=(p[3]||"").trim();metodo=parseMetodoPago(p[4]);cliente=(p[5]||"").trim();
          campana=(p[6]||"").trim();tipoClienta=parseTipoClienteCSV(campana);
        }
        const fecha=parseFechaVenta(fechaRaw);
        if(!fecha){errs.push(`Fila ${i+1}: fecha no reconocida "${fechaRaw}"`);return null;}
        if(!monto)return null; // Skip rows without amount silently
        const hora=(hdrFirst.includes("FECHA")?p[8]:p[7]||"").trim();
        const recibo=(hdrFirst.includes("FECHA")?p[9]:p[8]||"").trim();
        return{id:`csv-${i}`,servicio,fecha,monto,concepto,metodo,cliente,campana,tipoClienta,hora,recibo,incluir:true};
      }).filter(Boolean);
      setParseErrors(errs);setParsed(rows);setStep(2);setLoading(false);
    };
    reader.readAsText(file);
  };

  const onDrop=(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)procesarArchivo(f);};
  const onFileChange=(e)=>{const f=e.target.files[0];if(f)procesarArchivo(f);};
  const toggleEvento=(id)=>setParsed(prev=>prev.map(p=>p.id===id?{...p,incluir:!p.incluir}:p));
  const toggleAll=(v)=>setParsed(prev=>prev.map(p=>({...p,incluir:v,...(v&&p.estado==="cancelada"?{estado:"completada"}:{})})));
  const editEvento=(id,field,val)=>setParsed(prev=>prev.map(p=>p.id===id?{...p,[field]:val}:p));

  const importar=async()=>{
    const toImport=parsed.filter(p=>p.incluir);
    if(toImport.length===0)return;setImporting(true);
    let ticketsCreados=0,clientasCreadas=0,errores=0;
    try{
      // 1. Get unique client names and batch-check which exist
      const uniqueNames=[...new Set(toImport.map(r=>r.cliente).filter(Boolean))];
      const{data:existingCli}=await supabase.from("clientas").select("id,nombre").eq("sucursal_id",session.id).in("nombre",uniqueNames);
      const cliMap={};(existingCli||[]).forEach(c=>{cliMap[c.nombre]=c.id;});
      // 2. Batch insert new clientas
      const newClis=uniqueNames.filter(n=>!cliMap[n]).map(n=>{
        const row=toImport.find(r=>r.cliente===n);
        return{nombre:n,como_nos_conocio:row?.campana||"",sucursal_id:session.id,sucursal_nombre:session.nombre};
      });
      if(newClis.length>0){
        const{data:inserted}=await supabase.from("clientas").insert(newClis).select("id,nombre");
        (inserted||[]).forEach(c=>{cliMap[c.nombre]=c.id;});
        clientasCreadas=newClis.length;
      }
      // 3. Batch insert all tickets
      const ticketRows=toImport.map(row=>({
        sucursal_id:session.id,sucursal_nombre:session.nombre,
        servicios:[row.concepto||row.servicio],total:row.monto,
        metodo_pago:row.metodo,descuento:0,
        tipo_clienta:row.tipoClienta,fecha:row.fecha
      }));
      // Insert in chunks of 50 to avoid payload limits
      for(let i=0;i<ticketRows.length;i+=50){
        const chunk=ticketRows.slice(i,i+50);
        const{error}=await supabase.from("tickets").insert(chunk);
        if(error)errores++;else ticketsCreados+=chunk.length;
      }
    }catch(e){console.error(e);errores++;}
    setResult({tickets:ticketsCreados,clientas:clientasCreadas,errores});setStep(3);setImporting(false);
  };

  const totalMonto=parsed.filter(p=>p.incluir).reduce((s,p)=>s+p.monto,0);
  const nuevas=parsed.filter(p=>p.incluir&&p.tipoClienta==="Nueva").length;
  const recompras=parsed.filter(p=>p.incluir&&p.tipoClienta==="Recompra").length;
  const recomendadas=parsed.filter(p=>p.incluir&&p.tipoClienta==="Recomendada").length;

  return(
    <div style={{padding:"20px 24px",overflowY:"auto",flex:1,color:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"20px"}}>
        <div style={{fontSize:"22px"}}>📊</div>
        <div><div style={{fontSize:"16px",fontWeight:700}}>Importar ventas desde CSV</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>Sube el archivo de ventas de Excel · Sucursal: <span style={{color:"#49B8D3"}}>{session.nombre}</span></div></div>
      </div>
      <div style={{display:"flex",gap:"8px",marginBottom:"24px"}}>
        {[{n:1,l:"Subir archivo"},{n:2,l:"Revisar datos"},{n:3,l:"Listo"}].map((p,i)=>(
          <div key={p.n} style={{display:"flex",alignItems:"center",gap:"8px",flex:i<2?1:"auto"}}>
            <div style={{width:"28px",height:"28px",borderRadius:"50%",background:step>=p.n?"#2721E8":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,color:step>=p.n?"#fff":"rgba(255,255,255,0.2)",flexShrink:0}}>{step>p.n?"✓":p.n}</div>
            <div style={{fontSize:"12px",color:step===p.n?"#fff":"rgba(255,255,255,0.3)",fontWeight:step===p.n?600:400}}>{p.l}</div>
            {i<2&&<div style={{flex:1,height:"1px",background:step>p.n?"#2721E8":"rgba(255,255,255,0.06)"}}/>}
          </div>))}
      </div>

      {step===1&&<div>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} onClick={()=>fileRef.current?.click()}
          style={{border:`2px dashed ${dragOver?"#2721E8":"rgba(255,255,255,0.1)"}`,borderRadius:"16px",padding:"60px 40px",textAlign:"center",cursor:"pointer",background:dragOver?"rgba(39,33,232,0.08)":"rgba(255,255,255,0.02)"}}>
          <div style={{fontSize:"48px",marginBottom:"16px"}}>{loading?"⏳":"📊"}</div>
          <div style={{fontSize:"15px",fontWeight:600,marginBottom:"8px"}}>{loading?"Procesando...":"Arrastra tu archivo CSV aquí"}</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>Formato esperado: SERVICIO, FECHA, MONTO, CONCEPTO, FORMA DE PAGO, CLIENTE, CAMPAÑA</div>
          <div className="btn-blue" style={{display:"inline-block",padding:"10px 24px",fontSize:"13px"}}>Seleccionar archivo</div>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFileChange} style={{display:"none"}}/>
      </div>}

      {step===2&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
          <div><div style={{fontSize:"14px",fontWeight:600}}>{parsed.length} ventas en {fileName}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{parsed.filter(p=>p.incluir).length} seleccionadas · 🆕 {nuevas} nuevas · 🔄 {recompras} recompras · 🗣 {recomendadas} recomendadas · Total: <span style={{color:"#49B8D3",fontWeight:600}}>{fmt(totalMonto)}</span></div></div>
          <div style={{display:"flex",gap:"6px"}}><button className="btn-ghost" style={{fontSize:"10px",padding:"5px 10px"}} onClick={()=>toggleAll(true)}>✓ Todos</button><button className="btn-ghost" style={{fontSize:"10px",padding:"5px 10px"}} onClick={()=>toggleAll(false)}>✕ Ninguno</button></div>
        </div>
        {parseErrors.length>0&&<div style={{padding:"8px 12px",background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.2)",borderRadius:"8px",marginBottom:"8px",fontSize:"11px",color:"#ff6b6b"}}>{parseErrors.length} errores al parsear: {parseErrors.slice(0,3).join("; ")}{parseErrors.length>3?"...":""}</div>}
        <div style={{maxHeight:"420px",overflowY:"auto",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"10px"}}>
          <div style={{display:"grid",gridTemplateColumns:"32px 76px 72px 1fr 1fr 100px 76px",padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:0,background:"#22264A",zIndex:2}}>
            {["","Fecha","Monto","Concepto","Cliente","Método","Tipo"].map(h=><div key={h} style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}
          </div>
          {parsed.map(p=><div key={p.id} style={{display:"grid",gridTemplateColumns:"32px 76px 72px 1fr 1fr 100px 76px",padding:"5px 10px",borderBottom:"1px solid rgba(255,255,255,0.03)",opacity:p.incluir?1:0.25,alignItems:"center"}}>
            <input type="checkbox" checked={p.incluir} onChange={()=>toggleEvento(p.id)} style={{width:"14px",height:"14px",cursor:"pointer",accentColor:"#2721E8"}}/>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{new Date(p.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</div>
            <div style={{fontSize:"12px",fontWeight:600,color:"#49B8D3"}}>{fmt(p.monto)}</div>
            <input value={p.concepto} onChange={e=>editEvento(p.id,"concepto",e.target.value)} style={{background:"transparent",border:"none",color:"#fff",fontSize:"11px",outline:"none",padding:"4px 4px 4px 0",width:"100%"}}/>
            <input value={p.cliente} onChange={e=>editEvento(p.id,"cliente",e.target.value)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.5)",fontSize:"11px",outline:"none",padding:"4px 4px 4px 0",width:"100%"}}/>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>{p.metodo}</div>
            <div style={{fontSize:"10px",fontWeight:600,color:p.tipoClienta==="Nueva"?"#10b981":p.tipoClienta==="Recomendada"?"#a855f7":"#49B8D3"}}>{p.tipoClienta==="Nueva"?"🆕 Nueva":p.tipoClienta==="Recomendada"?"🗣 Recom.":"🔄 Recomp."}</div>
          </div>)}
        </div>
        <div style={{display:"flex",gap:"10px",marginTop:"16px"}}>
          <button className="btn-ghost" style={{flex:1}} onClick={()=>{setStep(1);setParsed([]);setFileName("");setParseErrors([]);}}>← Otro archivo</button>
          <button className="btn-blue" style={{flex:2,padding:"13px",fontSize:"14px"}} onClick={importar} disabled={importing||parsed.filter(p=>p.incluir).length===0}>{importing?"Importando...":"✓ Importar "+parsed.filter(p=>p.incluir).length+" ventas → "+session.nombre}</button>
        </div>
      </div>}

      {step===3&&result&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:"48px",marginBottom:"16px"}}>🎉</div>
        <div style={{fontSize:"18px",fontWeight:700,marginBottom:"8px"}}>¡Ventas importadas!</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginBottom:"24px"}}>{fileName} → {session.nombre}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"14px",maxWidth:"400px",margin:"0 auto 24px"}}>
          {[{l:"Tickets creados",v:result.tickets,c:"#2721E8"},{l:"Clientas nuevas",v:result.clientas,c:"#10b981"}].map(k=><div key={k.l} className="glass" style={{padding:"16px",textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:700,color:k.c}}>{k.v}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{k.l}</div></div>)}
        </div>
        {result.errores>0&&<div style={{fontSize:"12px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ {result.errores} errores</div>}
        <button className="btn-ghost" onClick={()=>{setStep(1);setParsed([]);setFileName("");setResult(null);}}>Importar otro archivo</button>
      </div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMBINED IMPORT — ICS + CSV ventas: preview completo + matching + importación
// ══════════════════════════════════════════════════════════════════════════════
function CombinedImport({session,useDST=true}){
  const[step,setStep]=useState(1);
  const[minDate,setMinDate]=useState("2025-01-01");
  // ICS
  const[citasAll,setCitasAll]=useState([]);
  const[skipped,setSkipped]=useState([]);
  const[icsFile,setIcsFile]=useState("");
  const[icsLoading,setIcsLoading]=useState(false);
  const[icsDrag,setIcsDrag]=useState(false);
  const[filterTab,setFilterTab]=useState("validos");
  // CSV ventas
  const[ventas,setVentas]=useState([]);
  const[ventasFile,setVentasFile]=useState("");
  const[csvLoading,setCsvLoading]=useState(false);
  const[csvDrag,setCsvDrag]=useState(false);
  // Import
  const[importing,setImporting]=useState(false);
  const[result,setResult]=useState(null);
  const icsRef=useRef(null);const csvRef=useRef(null);

  // ── Parse ICS ─────────────────────────────────────────────────────────────
  const onICS=(file)=>{
    if(!file)return;
    setIcsFile(file.name);setIcsLoading(true);
    const r=new FileReader();
    r.onload=(e)=>{
      const{appointments,skipped:sk}=parseICS(e.target.result,{useDST,minDate:"2000-01-01",personalMap:PERSONAL_MAPS[session.nombre]||{}});
      const withMeta=appointments.map(a=>({
        ...a,
        incluir:a.estado!=="cancelada"&&a.fecha>=minDate,
        beforeMin:a.fecha<minDate
      }));
      setCitasAll(withMeta);setSkipped(sk);setIcsLoading(false);setStep(2);
    };
    r.readAsText(file);
  };
  const reapplyMin=(md)=>{
    setMinDate(md);
    setCitasAll(prev=>prev.map(a=>({...a,incluir:a.estado!=="cancelada"&&a.fecha>=md,beforeMin:a.fecha<md})));
  };

  // ── Parse ventas (PDF + CSV) ────────────────────────────────────────────────
  const MESES_ES={enero:"01",febrero:"02",marzo:"03",abril:"04",mayo:"05",junio:"06",julio:"07",agosto:"08",septiembre:"09",octubre:"10",noviembre:"11",diciembre:"12"};
  // Parser de una línea CSV respetando comillas
  const parseCSVRow=(line)=>{const fields=[];let cur="",inQ=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&!inQ){inQ=true;continue;}if(c==='"'&&inQ){inQ=false;continue;}if(c===','&&!inQ){fields.push(cur);cur="";continue;}cur+=c;}fields.push(cur);return fields;};
  // Normalizar nombre de servicio (por si el CSV viene con Ã como artefacto de encoding)
  const normServicio=(s)=>{const u=(s||"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");if(u.includes("LASER")||u.includes("LAER"))return"LÁSER";if(u.includes("HIFU"))return"HIFU";if(u.includes("CERA"))return"CERA";return u.split(/\s/)[0];};
  // Métodos de pago ordenados de más específico a más general (para usar como ancla)
  const PDF_PAGOS=["EFECTIVO Y TERMINAL BANORTE","TRANSFERENCIA Y TERMINAL BANORTE 6MSI","TRANSFERENCIA Y TERMINAL BANORTE","TRANSFERENCIA Y 3MSI ZETTLE","TRANSFERENCIA Y EFECTIVO","6MSI TERMINAL BANORTE","3MSI TERMINAL BANORTE","TERMINAL BANORTE","3MSI ZETTLE","6MSI ZETTLE","EFECTIVO Y TERMINAL","DEPOSITO","DEPÓSITO","TRANSFERENCIA","EFECTIVO"];
  const parsePDFLine=(line,docYear)=>{
    // Quitar acento tipográfico inicial común en Metepec: "´02 marzo"
    const clean=line.replace(/^[´'`]+/,"").trim();
    // Detectar inicio: SERVICIO FECHA $MONTO
    const mHead=clean.match(/^(L[AÁ]SER|LASER|HIFU|CERA)\s+(\d{1,2}\s+\w+)\s+(\$[\d,]+(?:\.\d+)?(?:\s+anticipo)?)\s+(.*)/i);
    if(!mHead)return null;
    const svcRaw=mHead[1].toUpperCase();
    const servicio=(svcRaw==="LASER"||svcRaw==="LÁSER")?"LÁSER":svcRaw.split(/\s/)[0];
    const fechaRaw=mHead[2].trim();
    const fm=fechaRaw.match(/^(\d{1,2})\s+(\w+)$/i);
    if(!fm)return null;
    const mes=MESES_ES[fm[2].toLowerCase()];
    if(!mes)return null;
    const fecha=`${docYear}-${mes}-${fm[1].padStart(2,"0")}`;
    // Monto: quitar "anticipo", "liquidó", etc.
    const monto=parseMontoVenta(mHead[3]);
    if(!monto)return null;
    const rest=mHead[4]; // "CC TERMINAL BANORTE Jaqueline Zamudio POST CC 18:46 ..."
    const restUP=rest.toUpperCase();
    // Buscar método de pago como ancla
    let pagoIdx=-1,pagoLen=0;
    for(const p of PDF_PAGOS){
      const i=restUP.indexOf(p);
      if(i>=0){pagoIdx=i;pagoLen=p.length;break;}
    }
    if(pagoIdx<0)return null;
    const concepto=rest.slice(0,pagoIdx).replace(/\s+$/,"").trim();
    const metodoRaw=rest.slice(pagoIdx,pagoIdx+pagoLen);
    const metodo=parseMetodoPago(metodoRaw);
    const afterPago=rest.slice(pagoIdx+pagoLen).trim();
    // Cliente: secuencia de palabras Capitalizadas al inicio (máx 6 palabras)
    // Cortar cuando hay todo-mayúsculas (campaña) o dígito (hora/recibo)
    const words=afterPago.split(/\s+/);
    const clienteWords=[];
    for(const w of words){
      if(!w)continue;
      if(/^\d/.test(w))break; // hora o recibo
      // Palabra todo mayúsculas larga = start of campaña
      if(w.length>3&&w===w.toUpperCase()&&/[A-Z]/.test(w))break;
      clienteWords.push(w);
      if(clienteWords.length>=6)break;
    }
    const cliente=clienteWords.join(" ").trim();
    if(!cliente||cliente.length<3)return null;
    const afterCliente=afterPago.slice(cliente.length).trim();
    // Campaña: texto hasta la hora (HH:MM) o número de recibo
    const campanaM=afterCliente.match(/^(.*?)(?:\s+\d{1,2}:\d{2}|\s+\d{4,}|$)/);
    const campana=(campanaM?campanaM[1]:"").trim();
    const cl=(campana+" "+concepto).toLowerCase();
    const tipo=(cl.includes("es clienta")||cl.includes("clienta")||cl.includes("recurrente")||cl.includes("mantenimiento"))?"Recompra":"Nueva";
    return{servicio,fecha,monto,concepto,metodo,cliente,campana,tipo};
  };
  // ── Parse un archivo CSV de mightymerge.io → devuelve array de rows ─────────
  const parseOneCSV=async(file,docYear,rowOffset)=>{
    const text=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsText(file,"UTF-8");});
    const allLines=text.split(/\r?\n/);
    const hdrIdx=allLines.findIndex(l=>l.toUpperCase().includes("SERVICIO")&&(l.toUpperCase().includes("FECHA")||l.toUpperCase().includes("MONTO")));
    const dataLines=hdrIdx>=0?allLines.slice(hdrIdx+1):allLines.slice(1);
    const rows=[];
    for(let i=0;i<dataLines.length;i++){
      const line=dataLines[i].trim();
      if(!line||line.startsWith(",,,"))continue;
      const f=parseCSVLine(line);
      if(f.length<6)continue;
      const[servicioRaw,fechaRaw,montoRaw,concepto,metodoPagoRaw,clienteRaw,campana=""]=f;
      if(!servicioRaw||!clienteRaw)continue;
      const servicio=normServicio(servicioRaw);
      const cleanFecha=fechaRaw.replace(/^[^0-9]*/,"").trim();
      const fm=cleanFecha.match(/^(\d{1,2})(?:\s+de)?\s+(\w+)/i);
      if(!fm)continue;
      const mesKey=fm[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
      const mes=MESES_ES[mesKey];
      if(!mes)continue;
      const fecha=`${docYear}-${mes}-${fm[1].padStart(2,"0")}`;
      const montoClean=(montoRaw||"").replace(/[$,]/g,"").replace(/\s.*$/,"").trim();
      const monto=Number(montoClean)||0;
      if(!monto)continue;
      const metodo=parseMetodoPago(metodoPagoRaw.trim());
      const cliente=clienteRaw.trim();
      if(cliente.length<3)continue;
      const cl=(campana+"").toLowerCase();
      const tipo=(cl.includes("es clienta")||cl.includes("clienta")||cl.includes("recurrente")||cl.includes("mantenimiento"))?"Recompra":"Nueva";
      rows.push({id:`v${rowOffset+rows.length}`,servicio,fecha,monto,concepto:(concepto||"").trim(),metodo,cliente,campana:campana.trim(),tipo,incluir:true});
    }
    return rows;
  };
  // ── Procesar uno o varios archivos CSV/PDF ────────────────────────────────
  const handleVentasFile=async(fileList)=>{
    const files=Array.from(fileList instanceof FileList?fileList:[fileList]);
    if(!files.length)return;
    setCsvLoading(true);
    setVentasFile(files.length===1?files[0].name:`${files.length} archivos`);
    try{
      const docYear=minDate.slice(0,4)||String(new Date().getFullYear());
      let allRows=[];
      for(const file of files){
        if(file.name.toLowerCase().endsWith(".csv")){
          const rows=await parseOneCSV(file,docYear,allRows.length);
          allRows=[...allRows,...rows];
        }else{
          // PDF fallback: ejecuta parsePDFVentas pero retorna rows en vez de setVentas
          // (reuse parsePDFVentas logic inline para PDF)
          const ab=await file.arrayBuffer();
          const pdf=await pdfjsLib.getDocument({data:ab}).promise;
          for(let pg=1;pg<=pdf.numPages;pg++){
            const page=await pdf.getPage(pg);
            const content=await page.getTextContent();
            const byY={};
            content.items.forEach(it=>{const y=Math.round(it.transform[5]/4)*4;if(!byY[y])byY[y]=[];byY[y].push({x:it.transform[4],s:it.str});});
            Object.keys(byY).sort((a,b)=>Number(b)-Number(a)).forEach(y=>{
              const line=byY[y].sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ").replace(/\s+/g," ").trim();
              if(!line)return;
              const splitRE=/(L[AÁ]SER|LASER|HIFU|CERA)\s+\d{1,2}\s+\w+\s+\$/ig;
              const positions=[];let sm;const re2=new RegExp(splitRE.source,"ig");
              while((sm=re2.exec(line))!==null)positions.push(sm.index);
              if(!positions.length)return;
              positions.map((pos,i)=>line.slice(pos,i<positions.length-1?positions[i+1]:undefined))
                .forEach(seg=>{const p=parsePDFLine(seg,docYear);if(p)allRows.push({id:`v${allRows.length}`,...p,incluir:true});});
            });
          }
        }
      }
      // Re-asignar IDs correlativos
      allRows=allRows.map((r,i)=>({...r,id:`v${i}`}));
      console.log(`Ventas cargadas: ${files.length} archivos → ${allRows.length} registros`);
      setVentas(allRows);
      setStep(4);
    }catch(e){
      console.error("Ventas parse error:",e);
      alert("Error al leer archivo: "+e.message);
    }finally{
      setCsvLoading(false);
    }
  };
  const parsePDFVentas=async(file)=>{
    setVentasFile(file.name);setCsvLoading(true);
    try{
      const ab=await file.arrayBuffer();
      const pdf=await pdfjsLib.getDocument({data:ab}).promise;
      const docYear=minDate.slice(0,4)||String(new Date().getFullYear());
      const rows=[];
      for(let pg=1;pg<=pdf.numPages;pg++){
        const page=await pdf.getPage(pg);
        const content=await page.getTextContent();
        // Agrupar items por Y → reconstruir líneas completas (no columnas)
        const byY={};
        content.items.forEach(it=>{
          const y=Math.round(it.transform[5]/4)*4;
          if(!byY[y])byY[y]=[];
          byY[y].push({x:it.transform[4],s:it.str});
        });
        Object.keys(byY).sort((a,b)=>Number(b)-Number(a)).forEach(y=>{
          // Reconstruir línea completa uniendo todos los items ordenados por X
          const line=byY[y].sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ").replace(/\s+/g," ").trim();
          if(!line)return;
          // Detectar múltiples registros fusionados en una sola línea (pdfjs agrupa filas cercanas)
          const splitRE=/(L[AÁ]SER|LASER|HIFU|CERA)\s+\d{1,2}\s+\w+\s+\$/ig;
          const positions=[];
          let sm;
          const re2=new RegExp(splitRE.source,"ig");
          while((sm=re2.exec(line))!==null)positions.push(sm.index);
          if(!positions.length)return;
          const segments=positions.map((pos,i)=>line.slice(pos,i<positions.length-1?positions[i+1]:undefined));
          segments.forEach(seg=>{const p=parsePDFLine(seg,docYear);if(p)rows.push({id:`v${rows.length}`,...p,incluir:true});});
        });
      }
      setVentas(rows);
      setStep(4);
    }catch(e){
      console.error("PDF parse error:",e);
      alert("Error al leer el PDF: "+e.message);
    }finally{
      setCsvLoading(false);
    }
  };

  // ── Matching citas ↔ ventas (useEffect en vez de useMemo) ─────────────────
  const[citasMatched,setCitasMatched]=useState([]);
  const[unmatchedVentas,setUnmatchedVentas]=useState([]);
  // Links manuales: Map<citaId, ventaId>
  const[manualLinks,setManualLinks]=useState(new Map());
  const[linkingVenta,setLinkingVenta]=useState(null); // ventaId que se está vinculando
  const[linkSearch,setLinkSearch]=useState("");
  useEffect(()=>{
    if(!citasAll.length){setCitasMatched([]);setUnmatchedVentas([]);return;}
    if(!ventas.length){setCitasMatched(citasAll.map(c=>({...c,venta:null})));setUnmatchedVentas([]);return;}
    const pool=new Map();
    ventas.forEach(v=>{const k=normName(v.cliente);if(!pool.has(k))pool.set(k,[]);pool.get(k).push(v);});
    const wordIdx=new Map();
    for(const k of pool.keys()){k.split(" ").filter(w=>w.length>2).forEach(w=>{if(!wordIdx.has(w))wordIdx.set(w,[]);wordIdx.get(w).push(k);});}
    const used=new Set();
    // Aplicar links manuales primero
    manualLinks.forEach((ventaId)=>used.add(ventaId));
    const findMatch=(cNorm)=>{
      const exact=(pool.get(cNorm)||[]).find(v=>!used.has(v.id));
      if(exact)return exact;
      const words=cNorm.split(" ").filter(w=>w.length>2);
      const counts=new Map();
      words.forEach(w=>(wordIdx.get(w)||[]).forEach(k=>counts.set(k,(counts.get(k)||0)+1)));
      let bestKey=null,bestC=1;
      for(const[k,c]of counts)if(c>bestC){bestC=c;bestKey=k;}
      return bestKey?(pool.get(bestKey)||[]).find(v=>!used.has(v.id))||null:null;
    };
    const cm=citasAll.map(c=>{
      // Link manual tiene prioridad
      const manualVentaId=manualLinks.get(c.id);
      if(manualVentaId){const v=ventas.find(v=>v.id===manualVentaId);return{...c,venta:v||null,manualMatch:true};}
      const avail=findMatch(normName(c.nombre));
      if(avail)used.add(avail.id);
      return{...c,venta:avail||null};
    });
    setCitasMatched(cm);
    setUnmatchedVentas(ventas.filter(v=>!used.has(v.id)));
  },[citasAll,ventas,manualLinks]);

  const toggleCita=(id)=>setCitasAll(p=>p.map(c=>c.id===id?{...c,incluir:!c.incluir}:c));
  const toggleAll=(v)=>setCitasAll(p=>p.map(c=>({...c,incluir:v&&!c.beforeMin&&c.estado!=="cancelada"})));
  const toggleVenta=(id)=>setVentas(p=>p.map(v=>v.id===id?{...v,incluir:!v.incluir}:v));
  const addManualLink=(citaId,ventaId)=>{setManualLinks(prev=>{const m=new Map(prev);m.set(citaId,ventaId);return m;});setLinkingVenta(null);setLinkSearch("");};
  const removeManualLink=(citaId)=>setManualLinks(prev=>{const m=new Map(prev);m.delete(citaId);return m;});

  // ── Estadísticas ───────────────────────────────────────────────────────────
  const citasPost=citasAll.filter(c=>!c.beforeMin);
  const citasPre=citasAll.filter(c=>c.beforeMin);
  const citasSel=citasAll.filter(c=>c.incluir);
  const citasCan=citasPost.filter(c=>c.estado==="cancelada");
  const withVenta=citasMatched.filter(c=>c.incluir&&c.venta).length;
  const sinVenta=citasMatched.filter(c=>c.incluir&&!c.venta).length;

  // ── Progreso de importación ────────────────────────────────────────────────
  const[progress,setProgress]=useState({fase:"",done:0,total:0});

  // ── Importación combinada ──────────────────────────────────────────────────
  const importar=async()=>{
    const toImport=citasMatched.filter(c=>c.incluir);
    if(!toImport.length)return;
    setImporting(true);
    setProgress({fase:"Iniciando...",done:0,total:0});
    let clientasCreadas=0,citasCreadas=0,paqCreados=0,ticketsCreados=0,errores=0;
    try{
      // 1. Build client map
      setProgress({fase:"Preparando clientas...",done:0,total:1});
      const cliMap=new Map();
      toImport.forEach(c=>{const k=normName(c.nombre);if(!cliMap.has(k))cliMap.set(k,{name:c.nombre,campana:c.venta?.campana||"",tipo:c.venta?.tipo||"Nueva"});});
      unmatchedVentas.filter(v=>v.incluir).forEach(v=>{const k=normName(v.cliente);if(!cliMap.has(k))cliMap.set(k,{name:v.cliente,campana:v.campana||"",tipo:v.tipo||"Nueva"});});
      // 2. Check existing clientas
      const allNames=[...cliMap.values()].map(c=>c.name);
      const{data:ex}=await supabase.from("clientas").select("id,nombre").eq("sucursal_id",session.id).in("nombre",allNames);
      const idMap={};(ex||[]).forEach(c=>{idMap[c.nombre]=c.id;});
      // 3. Insert new clientas in batch
      const newClis=[...cliMap.values()].filter(c=>!idMap[c.name]).map(c=>({nombre:c.name,sucursal_id:session.id,sucursal_nombre:session.nombre,como_nos_conocio:c.campana}));
      if(newClis.length){
        setProgress({fase:`Creando ${newClis.length} clientas nuevas...`,done:0,total:newClis.length});
        for(let i=0;i<newClis.length;i+=50){
          const{data:ins}=await supabase.from("clientas").insert(newClis.slice(i,i+50)).select("id,nombre");
          (ins||[]).forEach(c=>{idMap[c.nombre]=c.id;clientasCreadas++;});
          setProgress({fase:`Creando clientas...`,done:Math.min(i+50,newClis.length),total:newClis.length});
        }
      }
      // 4. Obtener ticket_num base usando la función global probada
      let nextTNum=await nextTicketNum();
      // 5. Group citas by normName+servicio → paquetes + citas + tickets
      const groups=new Map();
      toImport.forEach(c=>{const k=`${normName(c.nombre)}|${c.servicio}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);});
      const groupArr=[...groups.values()];
      let gDone=0;
      setProgress({fase:"Creando paquetes y citas...",done:0,total:groupArr.length});
      for(const ses of groupArr){
        const first=ses[0];const clientaId=idMap[first.nombre];
        if(!clientaId){errores++;gDone++;continue;}
        const maxSes=Math.max(...ses.map(s=>s.totalSes||1));
        const sesUsadas=ses.filter(s=>s.estado==="completada").length;
        const precio=ses.find(s=>s.venta?.monto)?.venta?.monto||0;
        const{data:paq,error:ePaq}=await supabase.from("paquetes").insert([{clienta_id:clientaId,clienta_nombre:first.nombre,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:first.servicio,total_sesiones:maxSes,sesiones_usadas:sesUsadas,precio,fecha_compra:ses[0].fecha,activo:sesUsadas<maxSes}]).select();
        if(ePaq){console.error("Paquete error:",ePaq.message);errores++;gDone++;continue;}
        const paqId=paq?.[0]?.id;paqCreados++;
        // Batch insert citas del grupo
        const citaRows=ses.map(c=>({clienta_id:clientaId,clienta_nombre:c.nombre,paquete_id:paqId,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:c.servicio,tipo_servicio:c.tipo,duracion_min:c.duracion,fecha:c.fecha,hora_inicio:c.horaIni,hora_fin:c.horaFi,sesion_numero:c.sesNum,es_cobro:c.sesNum===1,estado:c.estado,notas:"Importado ICS+CSV",...(c.agendadoPor?{agendado_por:c.agendadoPor}:{})}));
        const{error:eCitas}=await supabase.from("citas").insert(citaRows);
        if(eCitas){console.error("Citas error:",eCitas.message);errores++;}else citasCreadas+=citaRows.length;
        // Ticket de venta (solo sesión 1 con venta vinculada)
        const primeraSesConVenta=ses.find(c=>c.sesNum===1&&c.venta?.monto);
        if(primeraSesConVenta){
          const v=primeraSesConVenta.venta;
          const tNum=nextTNum++;
          const{error:eT}=await supabase.from("tickets").insert([{ticket_num:tNum,sucursal_id:session.id,sucursal_nombre:session.nombre,servicios:[v.concepto||primeraSesConVenta.servicio],total:v.monto,metodo_pago:v.metodo||"Otro",descuento:0,tipo_clienta:v.tipo||"Nueva",fecha:primeraSesConVenta.fecha}]);
          if(eT){console.error("Ticket error:",eT.message,{tNum});}else ticketsCreados++;
        }
        gDone++;
        setProgress({fase:`Paquetes y citas... (${gDone}/${groupArr.length})`,done:gDone,total:groupArr.length});
      }
      // 6. Ventas sin cita → solo tickets
      const ventasSinCita=unmatchedVentas.filter(v=>v.incluir);
      if(ventasSinCita.length){
        setProgress({fase:`Importando ${ventasSinCita.length} tickets sin cita...`,done:0,total:ventasSinCita.length});
        for(let i=0;i<ventasSinCita.length;i++){
          const v=ventasSinCita[i];
          const clientaId=idMap[v.cliente];
          const tNum=nextTNum++;
          const{error:eT}=await supabase.from("tickets").insert([{ticket_num:tNum,sucursal_id:session.id,sucursal_nombre:session.nombre,servicios:[v.concepto||v.servicio],total:v.monto,metodo_pago:v.metodo||"Otro",descuento:0,tipo_clienta:v.tipo||"Nueva",fecha:v.fecha}]);
          if(eT){console.error("Ticket sin cita error:",eT.message,{tNum});}else ticketsCreados++;
          setProgress({fase:`Tickets sin cita... (${i+1}/${ventasSinCita.length})`,done:i+1,total:ventasSinCita.length});
        }
      }
    }catch(e){console.error("Importar error:",e);errores++;}
    setResult({clientas:clientasCreadas,citas:citasCreadas,paquetes:paqCreados,tickets:ticketsCreados,errores});
    setStep(5);setImporting(false);
  };

  const PASOS=[{n:1,l:"Subir ICS"},{n:2,l:"Revisar calendario"},{n:3,l:"Subir ventas"},{n:4,l:"Matching"},{n:5,l:"Listo"}];

  const ROW_STYLE={display:"grid",gridTemplateColumns:"32px 1fr 120px 80px 36px 36px 90px",padding:"5px 12px",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center",gap:"6px"};
  const HDR_STYLE={...ROW_STYLE,padding:"7px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:0,background:"#22264A",zIndex:2};

  return(
    <div style={{padding:"20px 24px",overflowY:"auto",flex:1,color:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"20px"}}>
        <div style={{fontSize:"22px"}}>🔗</div>
        <div><div style={{fontSize:"16px",fontWeight:700}}>Importar ICS + Ventas (combinado)</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>Previsualiza todo antes de importar · Sucursal: <span style={{color:"#49B8D3"}}>{session.nombre}</span></div></div>
      </div>

      {/* Stepper */}
      <div style={{display:"flex",gap:"6px",marginBottom:"24px",flexWrap:"wrap"}}>
        {PASOS.map((p,i)=>(
          <div key={p.n} style={{display:"flex",alignItems:"center",gap:"6px",flex:i<4?1:"auto"}}>
            <div style={{width:"26px",height:"26px",borderRadius:"50%",background:step>=p.n?"#2721E8":"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:700,color:step>=p.n?"#fff":"rgba(255,255,255,0.2)",flexShrink:0}}>{step>p.n?"✓":p.n}</div>
            <div style={{fontSize:"11px",color:step===p.n?"#fff":"rgba(255,255,255,0.25)",fontWeight:step===p.n?600:400,whiteSpace:"nowrap"}}>{p.l}</div>
            {i<4&&<div style={{flex:1,height:"1px",background:step>p.n?"#2721E8":"rgba(255,255,255,0.06)",minWidth:"8px"}}/>}
          </div>
        ))}
      </div>

      {/* ─── PASO 1: Subir ICS ─────────────────────────────────────────────── */}
      {step===1&&<div>
        <div onDragOver={e=>{e.preventDefault();setIcsDrag(true);}} onDragLeave={()=>setIcsDrag(false)}
          onDrop={e=>{e.preventDefault();setIcsDrag(false);const f=e.dataTransfer.files[0];if(f&&f.name.endsWith(".ics"))onICS(f);}}
          onClick={()=>icsRef.current?.click()}
          style={{border:`2px dashed ${icsDrag?"#2721E8":"rgba(255,255,255,0.1)"}`,borderRadius:"16px",padding:"60px 40px",textAlign:"center",cursor:"pointer",background:icsDrag?"rgba(39,33,232,0.08)":"rgba(255,255,255,0.02)",transition:"all 0.2s"}}>
          <div style={{fontSize:"48px",marginBottom:"16px"}}>{icsLoading?"⏳":"📅"}</div>
          <div style={{fontSize:"15px",fontWeight:600,marginBottom:"8px"}}>{icsLoading?"Procesando...":"Arrastra tu archivo .ics aquí"}</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>Exporta desde Google Calendar → Configuración → tu calendario → Exportar</div>
          <div className="btn-blue" style={{display:"inline-block",padding:"10px 24px",fontSize:"13px"}}>Seleccionar .ics</div>
        </div>
        <input ref={icsRef} type="file" accept=".ics" onChange={e=>{if(e.target.files[0])onICS(e.target.files[0]);}} style={{display:"none"}}/>
        <div style={{marginTop:"12px",display:"flex",alignItems:"center",gap:"10px",fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>
          <span>Filtrar desde:</span>
          <input type="date" value={minDate} onChange={e=>setMinDate(e.target.value)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"6px",color:"#fff",padding:"4px 8px",fontSize:"11px",colorScheme:"dark"}}/>
          <span style={{opacity:0.5}}>(eventos antes de esta fecha se marcarán como "histórico")</span>
        </div>
      </div>}

      {/* ─── PASO 2: Preview completo del ICS ──────────────────────────────── */}
      {step===2&&<div>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px",marginBottom:"14px"}}>
          {[
            {l:"Total en archivo",v:citasAll.length+skipped.length,c:"rgba(255,255,255,0.5)"},
            {l:"A importar",v:citasSel.length,c:"#10b981"},
            {l:"Canceladas",v:citasCan.length,c:"rgba(255,255,255,0.25)"},
            {l:"Históricas (antes "+minDate.slice(0,7)+")",v:citasPre.length,c:"rgba(255,255,255,0.2)"},
            {l:"Omitidas (sin datos)",v:skipped.length,c:"#f97316"},
          ].map(k=><div key={k.l} style={{padding:"10px 12px",background:"rgba(255,255,255,0.04)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"20px",fontWeight:700,color:k.c}}>{k.v}</div>
            <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginTop:"2px",lineHeight:1.3}}>{k.l}</div>
          </div>)}
        </div>

        {/* Fecha mínima */}
        <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"12px",flexWrap:"wrap"}}>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)"}}>Importar desde:</div>
          <input type="date" value={minDate} onChange={e=>reapplyMin(e.target.value)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"6px",color:"#fff",padding:"4px 8px",fontSize:"11px",colorScheme:"dark"}}/>
          <button className="btn-ghost" style={{fontSize:"10px",padding:"4px 10px"}} onClick={()=>toggleAll(true)}>✓ Marcar válidas</button>
          <button className="btn-ghost" style={{fontSize:"10px",padding:"4px 10px"}} onClick={()=>toggleAll(false)}>✕ Desmarcar todo</button>
        </div>

        {/* Tabs de filtro */}
        <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
          {[{v:"validos",l:`Válidas (${citasPost.length})`},{v:"historicas",l:`Históricas (${citasPre.length})`},{v:"omitidas",l:`Omitidas (${skipped.length})`}].map(t=>(
            <button key={t.v} onClick={()=>setFilterTab(t.v)} style={{padding:"6px 14px",borderRadius:"8px",border:"1px solid",fontSize:"11px",fontWeight:600,cursor:"pointer",background:filterTab===t.v?"rgba(39,33,232,0.15)":"transparent",borderColor:filterTab===t.v?"#2721E8":"rgba(255,255,255,0.1)",color:filterTab===t.v?"#fff":"rgba(255,255,255,0.4)"}}>{t.l}</button>
          ))}
        </div>

        {/* Tabla válidas */}
        {filterTab==="validos"&&<div style={{maxHeight:"380px",overflowY:"auto",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"10px"}}>
          <div style={HDR_STYLE}>{["","Nombre","Servicio","Fecha","Ses","Tot","Estado"].map(h=><div key={h} style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}</div>
          {citasPost.length===0&&<div style={{padding:"30px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:"12px"}}>No hay citas en este rango de fechas</div>}
          {citasPost.map(c=><div key={c.id} style={{...ROW_STYLE,opacity:c.incluir?1:0.3,background:c.estado==="cancelada"?"rgba(255,100,100,0.04)":"transparent"}}>
            <input type="checkbox" checked={c.incluir} onChange={()=>toggleCita(c.id)} style={{width:"13px",height:"13px",cursor:"pointer",accentColor:"#2721E8"}}/>
            <div style={{fontSize:"12px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nombre}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.45)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.servicio}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{new Date(c.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"2-digit"})}</div>
            <div style={{fontSize:"11px",color:"#49B8D3",fontWeight:600,textAlign:"center"}}>{c.sesNum}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",textAlign:"center"}}>{c.totalSes}</div>
            <div style={{fontSize:"10px",fontWeight:600,color:c.estado==="completada"?"#10b981":c.estado==="cancelada"?"rgba(255,100,100,0.5)":"#49B8D3"}}>{c.estado==="completada"?"✅ Hecha":c.estado==="cancelada"?"✗ Cancelada":"📅 Agendada"}</div>
          </div>)}
        </div>}

        {/* Tabla históricas */}
        {filterTab==="historicas"&&<div style={{maxHeight:"380px",overflowY:"auto",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"10px"}}>
          <div style={{padding:"10px 14px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>
            Citas anteriores a {minDate} — no se importarán (puedes cambiar la fecha de filtro arriba para incluirlas)
          </div>
          {citasPre.length===0&&<div style={{padding:"30px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:"12px"}}>Ninguna</div>}
          {citasPre.map(c=><div key={c.id} style={{...ROW_STYLE,opacity:0.35}}>
            <div/><div style={{fontSize:"11px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nombre}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>{c.servicio}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>{c.fecha}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",textAlign:"center"}}>{c.sesNum}</div>
            <div/><div/>
          </div>)}
        </div>}

        {/* Tabla omitidas */}
        {filterTab==="omitidas"&&<div style={{maxHeight:"380px",overflowY:"auto",border:"1px solid rgba(249,115,22,0.2)",borderRadius:"10px"}}>
          <div style={{padding:"8px 12px",background:"rgba(249,115,22,0.06)",borderBottom:"1px solid rgba(249,115,22,0.15)",fontSize:"10px",letterSpacing:"1px",color:"#f97316",fontWeight:600}}>EVENTOS OMITIDOS — no se importarán</div>
          {skipped.length===0&&<div style={{padding:"30px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:"12px"}}>Ninguno</div>}
          {skipped.map((s,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto",padding:"5px 12px",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center",gap:"8px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.summary||"(sin título)"}</div>
            <div style={{fontSize:"10px",color:"#f97316",whiteSpace:"nowrap",flexShrink:0}}>{s.razon}</div>
          </div>)}
        </div>}

        <div style={{display:"flex",gap:"10px",marginTop:"16px"}}>
          <button className="btn-ghost" style={{flex:1}} onClick={()=>{setStep(1);setCitasAll([]);setSkipped([]);setIcsFile("");}}>← Otro archivo</button>
          <button className="btn-ghost" style={{flex:1}} onClick={()=>importar()} disabled={importing||citasSel.length===0}>
            {importing?"Importando...":"↑ Importar solo calendario ("+citasSel.length+")"}
          </button>
          <button className="btn-blue" style={{flex:2,padding:"13px",fontSize:"13px"}} onClick={()=>setStep(3)} disabled={citasSel.length===0}>
            Continuar → subir ventas ({citasSel.length} citas)
          </button>
        </div>
        <div style={{fontSize:"10px",color:"rgba(255,255,255,0.15)",marginTop:"8px",textAlign:"center"}}>
          {icsFile} · {citasAll.length+skipped.length} eventos brutos en el archivo
        </div>
      </div>}

      {/* ─── PASO 3: Subir CSV o PDF de ventas ─────────────────────────────── */}
      {step===3&&<div>
        <div style={{marginBottom:"12px",padding:"12px 16px",background:"rgba(39,33,232,0.08)",borderRadius:"10px",border:"1px solid rgba(39,33,232,0.2)",fontSize:"12px",color:"rgba(255,255,255,0.6)"}}>
          Sube el <b>CSV de mightymerge.io</b> (recomendado) o el PDF del reporte mensual — se extraen: Servicio, Fecha, Monto, Cliente, Forma de Pago, Campaña
        </div>
        <div onDragOver={e=>{e.preventDefault();setCsvDrag(true);}} onDragLeave={()=>setCsvDrag(false)}
          onDrop={e=>{e.preventDefault();setCsvDrag(false);if(e.dataTransfer.files.length)handleVentasFile(e.dataTransfer.files);}}
          onClick={()=>csvRef.current?.click()}
          style={{border:`2px dashed ${csvDrag?"#2721E8":"rgba(255,255,255,0.1)"}`,borderRadius:"16px",padding:"40px 40px",textAlign:"center",cursor:"pointer",background:csvDrag?"rgba(39,33,232,0.08)":"rgba(255,255,255,0.02)",transition:"all 0.2s",marginBottom:"14px"}}>
          <div style={{fontSize:"40px",marginBottom:"12px"}}>{csvLoading?"⏳":"📊"}</div>
          <div style={{fontSize:"14px",fontWeight:600,marginBottom:"6px"}}>{csvLoading?"Leyendo archivos de ventas...":"Arrastra los CSV de ventas aquí"}</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginBottom:"12px"}}>Puedes seleccionar varios CSVs a la vez (uno por mes) · También acepta PDF</div>
          {!csvLoading&&<div className="btn-blue" style={{display:"inline-block",padding:"8px 20px",fontSize:"12px"}}>Seleccionar archivos</div>}
        </div>
        <input ref={csvRef} type="file" accept=".pdf,.csv" multiple onChange={e=>{if(e.target.files.length)handleVentasFile(e.target.files);}} style={{display:"none"}}/>
        <div style={{display:"flex",gap:"10px"}}>
          <button className="btn-ghost" style={{flex:1}} onClick={()=>setStep(2)}>← Regresar</button>
          <button className="btn-ghost" style={{flex:2,padding:"13px"}} onClick={()=>setStep(4)}>Omitir ventas → solo importar citas</button>
        </div>
      </div>}

      {/* ─── PASO 4: Preview matching ───────────────────────────────────────── */}
      {step===4&&<div>
        {/* Stats matching */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"14px"}}>
          {[
            {l:"Citas a importar",v:citasSel.length,c:"#fff"},
            {l:"Con venta vinculada",v:withVenta,c:"#10b981"},
            {l:"Sin venta",v:sinVenta,c:"#f97316"},
            {l:"Ventas sin cita",v:unmatchedVentas.filter(v=>v.incluir).length,c:"#49B8D3"},
          ].map(k=><div key={k.l} style={{padding:"10px 12px",background:"rgba(255,255,255,0.04)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:"22px",fontWeight:700,color:k.c}}>{k.v}</div>
            <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{k.l}</div>
          </div>)}
        </div>

        {/* Tabla citas + matching */}
        <div style={{fontSize:"10px",color:"rgba(255,255,255,0.25)",marginBottom:"6px",letterSpacing:"1px"}}>CITAS — matching con ventas por nombre de cliente</div>
        <div style={{maxHeight:"320px",overflowY:"auto",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"10px",marginBottom:"14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"32px 1fr 100px 70px 90px 90px 80px",padding:"7px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:0,background:"#22264A",zIndex:2}}>
            {["","Nombre","Servicio","Fecha","Estado","Venta","Método"].map(h=><div key={h} style={{fontSize:"9px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}
          </div>
          {citasMatched.filter(c=>c.incluir).map(c=>(
            <div key={c.id} style={{display:"grid",gridTemplateColumns:"32px 1fr 100px 70px 90px 90px 80px",padding:"5px 12px",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center",gap:"4px",background:c.venta?"rgba(16,185,129,0.03)":"transparent"}}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:c.venta?"#10b981":"#f97316",flexShrink:0}}/>
              <div style={{fontSize:"11px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nombre}</div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.servicio}</div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{c.fecha?.slice(5)}</div>
              <div style={{fontSize:"10px",color:c.estado==="completada"?"#10b981":c.estado==="cancelada"?"rgba(255,100,100,0.5)":"#49B8D3"}}>{c.estado==="completada"?"✅ Hecha":c.estado==="cancelada"?"✗ Cancelada":"📅 Agenda"}</div>
              <div style={{fontSize:"11px",color:c.venta?"#10b981":"rgba(255,255,255,0.2)",fontWeight:c.venta?600:400}}>{c.venta?fmt(c.venta.monto):"sin match"}</div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.venta?.metodo||""}</div>
            </div>
          ))}
        </div>

        {/* Ventas sin cita */}
        {unmatchedVentas.length>0&&<div style={{marginBottom:"14px"}}>
          <div style={{fontSize:"10px",color:"rgba(73,184,211,0.8)",marginBottom:"6px",letterSpacing:"1px"}}>
            VENTAS SIN CITA — {unmatchedVentas.length} sin vincular · haz clic en "Vincular" para asignar manualmente
          </div>
          <div style={{border:"1px solid rgba(73,184,211,0.15)",borderRadius:"10px",overflow:"hidden"}}>
            {unmatchedVentas.map(v=>(
              <div key={v.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                {/* Fila principal */}
                <div style={{display:"grid",gridTemplateColumns:"32px 1fr 90px 60px 80px 70px 90px",padding:"6px 12px",alignItems:"center",gap:"4px",background:linkingVenta===v.id?"rgba(39,33,232,0.08)":"transparent"}}>
                  <input type="checkbox" checked={v.incluir} onChange={()=>toggleVenta(v.id)} style={{width:"13px",height:"13px",cursor:"pointer",accentColor:"#49B8D3"}}/>
                  <div style={{fontSize:"11px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.cliente}</div>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.concepto||v.servicio}</div>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{v.fecha?.slice(5)}</div>
                  <div style={{fontSize:"11px",color:"#49B8D3",fontWeight:600}}>{fmt(v.monto)}</div>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.metodo}</div>
                  <button
                    onClick={()=>{if(linkingVenta===v.id){setLinkingVenta(null);setLinkSearch("");}else{setLinkingVenta(v.id);setLinkSearch("");}}}
                    style={{fontSize:"10px",padding:"3px 8px",borderRadius:"5px",border:"1px solid rgba(39,33,232,0.4)",background:linkingVenta===v.id?"#2721E8":"rgba(39,33,232,0.15)",color:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>
                    {linkingVenta===v.id?"✕ Cancelar":"🔗 Vincular"}
                  </button>
                </div>
                {/* Panel de búsqueda inline */}
                {linkingVenta===v.id&&<div style={{padding:"8px 12px",background:"rgba(39,33,232,0.06)",borderTop:"1px solid rgba(39,33,232,0.15)"}}>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",marginBottom:"6px"}}>
                    Buscar cita de <b style={{color:"#49B8D3"}}>{v.cliente}</b> — escribe parte del nombre:
                  </div>
                  <input
                    autoFocus
                    value={linkSearch}
                    onChange={e=>setLinkSearch(e.target.value)}
                    placeholder="Nombre de la clienta en el calendario..."
                    style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"6px",color:"#fff",padding:"6px 10px",fontSize:"12px",boxSizing:"border-box",marginBottom:"6px"}}
                  />
                  {linkSearch.length>1&&(()=>{
                    const q=normName(linkSearch);
                    const results=citasMatched.filter(c=>!c.venta&&normName(c.nombre).includes(q)&&c.incluir).slice(0,8);
                    return results.length===0
                      ?<div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",padding:"4px 0"}}>Sin resultados para "{linkSearch}"</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                        {results.map(c=>(
                          <div key={c.id}
                            onClick={()=>addManualLink(c.id,v.id)}
                            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 10px",borderRadius:"6px",background:"rgba(255,255,255,0.04)",cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)"}}
                            onMouseEnter={e=>e.currentTarget.style.background="rgba(39,33,232,0.2)"}
                            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
                            <div style={{fontSize:"11px",fontWeight:500}}>{c.nombre}</div>
                            <div style={{display:"flex",gap:"8px",fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>
                              <span>{c.servicio}</span>
                              <span>{c.fecha?.slice(5)}</span>
                              <span style={{color:"#2721E8",fontWeight:600}}>← Vincular</span>
                            </div>
                          </div>
                        ))}
                      </div>;
                  })()}
                </div>}
              </div>
            ))}
          </div>
        </div>}
        {/* Citas vinculadas manualmente */}
        {manualLinks.size>0&&<div style={{marginBottom:"10px",padding:"8px 12px",background:"rgba(16,185,129,0.06)",borderRadius:"8px",border:"1px solid rgba(16,185,129,0.15)",fontSize:"11px"}}>
          <div style={{color:"rgba(16,185,129,0.8)",marginBottom:"6px",fontSize:"10px",letterSpacing:"1px"}}>LINKS MANUALES ({manualLinks.size})</div>
          {[...manualLinks.entries()].map(([citaId,ventaId])=>{
            const cita=citasAll.find(c=>c.id===citaId);
            const venta=ventas.find(v=>v.id===ventaId);
            return cita&&venta?<div key={citaId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
              <span style={{color:"rgba(255,255,255,0.7)"}}>{cita.nombre} <span style={{color:"rgba(255,255,255,0.3)"}}>↔</span> {venta.cliente} · {fmt(venta.monto)}</span>
              <button onClick={()=>removeManualLink(citaId)} style={{fontSize:"10px",padding:"1px 6px",borderRadius:"4px",border:"1px solid rgba(255,100,100,0.3)",background:"transparent",color:"rgba(255,100,100,0.7)",cursor:"pointer"}}>✕</button>
            </div>:null;
          })}
        </div>}

        {importing&&<div style={{marginBottom:"12px",padding:"12px 16px",background:"rgba(39,33,232,0.08)",borderRadius:"10px",border:"1px solid rgba(39,33,232,0.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",fontWeight:500}}>{progress.fase}</div>
            {progress.total>0&&<div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)"}}>{progress.done}/{progress.total}</div>}
          </div>
          {progress.total>0&&<div style={{height:"4px",background:"rgba(255,255,255,0.08)",borderRadius:"2px",overflow:"hidden"}}>
            <div style={{height:"100%",background:"#2721E8",borderRadius:"2px",width:`${Math.round(progress.done/progress.total*100)}%`,transition:"width 0.3s"}}/>
          </div>}
        </div>}
        <div style={{display:"flex",gap:"10px"}}>
          <button className="btn-ghost" style={{flex:1}} onClick={()=>setStep(ventas.length?3:2)} disabled={importing}>← Regresar</button>
          <button className="btn-blue" style={{flex:3,padding:"13px",fontSize:"14px"}} onClick={importar} disabled={importing||citasSel.length===0}>
            {importing?"Trabajando...":"✓ Importar todo → "+citasSel.length+" citas · "+unmatchedVentas.filter(v=>v.incluir).length+" tickets extra → "+session.nombre}
          </button>
        </div>
      </div>}

      {/* ─── PASO 5: Resultado ──────────────────────────────────────────────── */}
      {step===5&&result&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:"48px",marginBottom:"16px"}}>🎉</div>
        <div style={{fontSize:"18px",fontWeight:700,marginBottom:"8px"}}>¡Importación completada!</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginBottom:"24px"}}>{icsFile} · {ventasFile||"sin CSV"} → {session.nombre}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px",maxWidth:"600px",margin:"0 auto 24px"}}>
          {[{l:"Clientas creadas",v:result.clientas,c:"#10b981"},{l:"Citas importadas",v:result.citas,c:"#2721E8"},{l:"Paquetes creados",v:result.paquetes,c:"#49B8D3"},{l:"Tickets creados",v:result.tickets,c:"#f59e0b"}].map(k=><div key={k.l} className="glass" style={{padding:"16px",textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:700,color:k.c}}>{k.v}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{k.l}</div></div>)}
        </div>
        {result.errores>0&&<div style={{fontSize:"12px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ {result.errores} errores — revisa la consola</div>}
        <button className="btn-ghost" onClick={()=>{setStep(1);setCitasAll([]);setSkipped([]);setVentas([]);setIcsFile("");setVentasFile("");setResult(null);}}>Importar otra sucursal</button>
      </div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO FINANCIERO — P&L mensual por sucursal con análisis IA
// ══════════════════════════════════════════════════════════════════════════════
function EstadoFinanciero({sucursalesFiltro=null,sucursalesPropias=null,esAdmin=false}){
  const sucVisible=sucursalesFiltro||SUCURSALES_NAMES;
  const esSocia=!!sucursalesFiltro&&!sucursalesPropias;
  const puedeMV=!esSocia;

  const antYM=(ym)=>{const[y,m]=ym.split("-").map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,"0")}`;};
  const rango=(ym)=>{const[y,m]=ym.split("-").map(Number);return{desde:`${ym}-01`,hasta:new Date(y,m,0).toISOString().slice(0,10)};};
  const etiq=(ym)=>new Date(`${ym}-15`).toLocaleDateString("es-MX",{month:"long",year:"numeric"});
  const hoyYM=()=>cdmx().slice(0,7);
  const listaMeses=Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-i);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});

  const[periodo,setPeriodo]=useState(hoyYM());
  const[vista,setVista]=useState("individual");
  const[sucSel,setSucSel]=useState(sucVisible[0]);
  const[sucMulti,setSucMulti]=useState(sucursalesPropias||sucVisible.slice(0,2));
  const[ventas,setVentas]=useState({});
  const[ventasAnt,setVentasAnt]=useState({});
  const[metaGs,setMetaGs]=useState({});
  const[gastos,setGastos]=useState([]);
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[aiTxt,setAiTxt]=useState("");
  const[aiLoad,setAiLoad]=useState(false);
  const[fSuc,setFSuc]=useState(sucVisible[0]);
  const[fCat,setFCat]=useState("renta");
  const[fConc,setFConc]=useState("");
  const[fMonto,setFMonto]=useState("");
  const[nomRows,setNomRows]=useState([{nombre:"",monto:""}]);
  const[fRecurrente,setFRecurrente]=useState(false);
  const[fPeriodo,setFPeriodo]=useState(hoyYM);

  const cargar=async()=>{
    setLoading(true);
    const{desde,hasta}=rango(periodo);
    const{desde:dA,hasta:hA}=rango(antYM(periodo));
    const[{data:tks},{data:tksA},{data:g}]=await Promise.all([
      supabase.from("tickets").select("sucursal_nombre,total").gte("fecha",desde).lte("fecha",hasta),
      supabase.from("tickets").select("sucursal_nombre,total").gte("fecha",dA).lte("fecha",hA),
      supabase.from("gastos_operativos").select("*").eq("periodo",periodo),
    ]);
    const toMap=(arr)=>{const m={};SUCURSALES_NAMES.forEach(s=>{m[s]=0;});(arr||[]).forEach(t=>{if(m[t.sucursal_nombre]!==undefined)m[t.sucursal_nombre]+=Number(t.total);});return m;};
    setVentas(toMap(tks));setVentasAnt(toMap(tksA));setGastos(g||[]);
    if(META_TOKEN&&META_ACCOUNT){
      try{
        const url=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=adset_name,spend&time_range={"since":"${desde}","until":"${hasta}"}&level=adset&limit=200&access_token=${META_TOKEN}`;
        const json=await(await fetch(url)).json();
        const ms={};SUCURSALES_NAMES.forEach(s=>{ms[s]=0;});
        (json.data||[]).forEach(r=>{const nm=(r.adset_name||"").toLowerCase();SUCURSALES_NAMES.forEach(s=>{if(nm.includes(s.toLowerCase()))ms[s]+=Number(r.spend||0);});});
        setMetaGs(ms);
      }catch{}
    }
    setLoading(false);
  };

  useEffect(()=>{cargar();setAiTxt("");},[periodo]);
  useEffect(()=>{if(vista==="individual"){setFSuc(sucSel);setFPeriodo(periodo);}},[vista,sucSel,periodo]);

  const CATS_FIJAS=new Set(["contenido_digital","plataforma_cire","nomina","renta","servicios","otro"]);
  const pl=(suc)=>{
    const ing=ventas[suc]||0;
    const g=gastos.filter(x=>x.sucursal_id===suc);
    const cont=g.filter(x=>x.categoria==="contenido_digital").reduce((s,x)=>s+Number(x.monto),0);
    const plt=g.filter(x=>x.categoria==="plataforma_cire").reduce((s,x)=>s+Number(x.monto),0);
    const meta=metaGs[suc]||0;
    const nom=g.filter(x=>x.categoria==="nomina").reduce((s,x)=>s+Number(x.monto),0);
    const ren=g.filter(x=>x.categoria==="renta").reduce((s,x)=>s+Number(x.monto),0);
    const svc=g.filter(x=>x.categoria==="servicios").reduce((s,x)=>s+Number(x.monto),0);
    const otr=g.filter(x=>x.categoria==="otro").reduce((s,x)=>s+Number(x.monto),0);
    const customCats=[...new Set(g.filter(x=>!CATS_FIJAS.has(x.categoria)).map(x=>x.categoria))];
    const customItems=customCats.map(cat=>{const items=g.filter(x=>x.categoria===cat);return{cat,label:cat,monto:items.reduce((s,x)=>s+Number(x.monto),0),items};});
    const customTotal=customItems.reduce((s,c)=>s+c.monto,0);
    const egr=cont+plt+meta+nom+ren+svc+otr+customTotal;
    const util=ing-egr;
    return{ing,cont,plt,meta,nom,ren,svc,otr,customItems,egr,util,mg:ing>0?(util/ing*100):null,nomItems:g.filter(x=>x.categoria==="nomina")};
  };

  const plC=(sucs)=>{
    const ps=sucs.map(s=>pl(s));const sm=k=>ps.reduce((a,p)=>a+p[k],0);
    const customMap={};ps.forEach(p=>p.customItems.forEach(c=>{customMap[c.cat]=(customMap[c.cat]||0)+c.monto;}));
    const customItems=Object.entries(customMap).map(([cat,monto])=>({cat,label:cat,monto,items:[]}));
    const ing=sm("ing"),egr=sm("egr"),util=ing-egr;
    return{ing,egr,util,mg:ing>0?(util/ing*100):null,cont:sm("cont"),plt:sm("plt"),meta:sm("meta"),nom:sm("nom"),ren:sm("ren"),svc:sm("svc"),otr:sm("otr"),customItems};
  };

  const nextPeriodos=(from,count)=>{
    const[y,m]=from.split("-").map(Number);
    return Array.from({length:count},(_,i)=>{const d=new Date(y,m-1+i+1,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});
  };

  const guardar=async()=>{
    setSaving(true);
    const periodos=fRecurrente?[fPeriodo,...nextPeriodos(fPeriodo,11)]:[fPeriodo];
    try{
      if(fCat==="nomina"){
        const validas=nomRows.filter(n=>n.nombre.trim()&&Number(n.monto)>0);
        for(const p of periodos){
          const{error:de}=await supabase.from("gastos_operativos").delete().eq("sucursal_id",fSuc).eq("periodo",p).eq("categoria","nomina");
          if(de)throw de;
          if(validas.length){const{error:ie}=await supabase.from("gastos_operativos").insert(validas.map(n=>({sucursal_id:fSuc,periodo:p,categoria:"nomina",concepto:n.nombre.trim(),monto:Number(n.monto)})));if(ie)throw ie;}
        }
      }else if(fCat==="personalizado"){
        if(!fConc.trim()||!fMonto||isNaN(Number(fMonto))||Number(fMonto)<=0){setSaving(false);return;}
        const catPersonal=fConc.trim();
        for(const p of periodos){
          const{error:de}=await supabase.from("gastos_operativos").delete().eq("sucursal_id",fSuc).eq("periodo",p).eq("categoria",catPersonal);
          if(de)throw de;
          const{error:ie}=await supabase.from("gastos_operativos").insert([{sucursal_id:fSuc,periodo:p,categoria:catPersonal,concepto:catPersonal,monto:Number(fMonto)}]);
          if(ie)throw ie;
        }
      }else{
        if(!fMonto||isNaN(Number(fMonto))||Number(fMonto)<=0){setSaving(false);return;}
        for(const p of periodos){
          if(fCat==="renta"||fCat==="servicios"||fCat==="contenido_digital"||fCat==="plataforma_cire"){const{error:de}=await supabase.from("gastos_operativos").delete().eq("sucursal_id",fSuc).eq("periodo",p).eq("categoria",fCat);if(de)throw de;}
          const{error:ie}=await supabase.from("gastos_operativos").insert([{sucursal_id:fSuc,periodo:p,categoria:fCat,concepto:fConc.trim()||fCat,monto:Number(fMonto)}]);
          if(ie)throw ie;
        }
      }
      setFMonto("");setFConc("");
      if(fPeriodo===periodo)await cargar();
      else{setPeriodo(fPeriodo);}
    }catch(err){
      alert(`Error al guardar: ${err.message||JSON.stringify(err)}`);
    }finally{
      setSaving(false);
    }
  };

  const borrarGasto=async(id)=>{await supabase.from("gastos_operativos").delete().eq("id",id);await cargar();};
  const borrarCategoria=async(suc,cat)=>{await supabase.from("gastos_operativos").delete().eq("sucursal_id",suc).eq("periodo",periodo).eq("categoria",cat);await cargar();};

  const analizarIA=async()=>{
    if(!CLAUDE_KEY){alert("Agrega VITE_CLAUDE_KEY en .env.local para usar la IA");return;}
    setAiLoad(true);setAiTxt("");
    const sucs=vista==="individual"?[sucSel]:vista==="consolidado"?sucMulti.filter(s=>sucVisible.includes(s)):sucVisible;
    const data=sucs.map(s=>{
      const p=pl(s);const vA=ventasAnt[s]||0;const delta=vA>0?((p.ing-vA)/vA*100):null;
      return{sucursal:s,ventas:p.ing,contenido_digital:p.cont,meta_ads:p.meta,nominas:p.nom,renta:p.ren,servicios:p.svc,otros:p.otr,total_gastos:p.egr,utilidad:p.util,margen_pct:p.mg?.toFixed(1),cambio_vs_mes_anterior:delta?.toFixed(1)};
    });
    const prompt=`Eres asesor financiero de CIRE, salones de depilación láser en México. Analiza el período ${etiq(periodo)} e interpreta los resultados para las dueñas y gerentes del negocio de forma clara, directa y sin tecnicismos.\n\nDatos:\n${JSON.stringify(data,null,2)}\n\nResponde en español con:\n**Resumen del mes** (2-3 oraciones simples sobre cómo le fue al negocio)\n\n**Puntos clave** (3 bullets: qué salió bien, qué hay que atender, qué es urgente si aplica)\n\n**Recomendación concreta** (1 acción específica para el próximo mes)\n\nSé honesta y usa los nombres de las sucursales. Los montos son en pesos mexicanos.`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
        headers:{"x-api-key":CLAUDE_KEY,"anthropic-version":"2023-06-01","content-type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:900,messages:[{role:"user",content:prompt}]})});
      const json=await res.json();
      setAiTxt(json.content?.[0]?.text||"Sin respuesta de la IA.");
    }catch{setAiTxt("Error al conectar con la IA. Verifica tu VITE_CLAUDE_KEY en .env.local");}
    setAiLoad(false);
  };

  const FilaGL=({l,v,c,neg=false,bold=false,indent=false,onDelete=null})=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
      <span style={{fontSize:"13px",color:bold?"#fff":indent?"rgba(255,255,255,0.45)":"rgba(255,255,255,0.65)",fontWeight:bold?700:400,paddingLeft:indent?"14px":"0"}}>{l}</span>
      <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
        <span style={{fontSize:"13px",fontWeight:bold?700:500,color:c||(neg?"#f97316":"rgba(255,255,255,0.7)")}}>{fmt(v)}</span>
        {onDelete&&<button onClick={onDelete} style={{background:"none",border:"none",color:"rgba(255,80,80,0.5)",cursor:"pointer",fontSize:"14px",padding:"0",lineHeight:1}}>×</button>}
      </div>
    </div>
  );

  const TarjetaPL=({suc,compact=false,showDelta=false})=>{
    const p=pl(suc);const color=COLORES[suc]||"#2721E8";
    const vA=ventasAnt[suc]||0;const delta=vA>0?((p.ing-vA)/vA*100):null;const pos=p.util>=0;
    return(
      <div className="glass" style={{padding:compact?"16px":"24px",borderLeft:`3px solid ${color}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
          <span style={{fontSize:compact?14:16,fontWeight:700}}>{suc}</span>
          {showDelta&&delta!==null&&<span style={{fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"20px",background:delta>=0?"rgba(16,185,129,0.15)":"rgba(255,80,80,0.15)",color:delta>=0?"#10b981":"#ff6b6b"}}>{delta>=0?"↑":"↓"}{Math.abs(delta).toFixed(1)}% vs mes ant.</span>}
          {!showDelta&&<span style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{etiq(periodo)}</span>}
        </div>
        <FilaGL l={`Ventas`} v={p.ing} c="#10b981" bold/>
        <div style={{height:"8px"}}/>
        {p.cont>0&&<FilaGL l="Contenido digital" v={p.cont} neg indent onDelete={!compact?()=>borrarCategoria(suc,"contenido_digital"):null}/>}
        {p.plt>0&&<FilaGL l="Plataforma CIRE" v={p.plt} neg indent onDelete={!compact?()=>borrarCategoria(suc,"plataforma_cire"):null}/>}
        <FilaGL l="Meta Ads" v={p.meta} neg indent/>
        {p.nom>0&&<FilaGL l="Nóminas" v={p.nom} neg indent/>}
        {p.ren>0&&<FilaGL l="Renta" v={p.ren} neg indent onDelete={!compact?()=>borrarCategoria(suc,"renta"):null}/>}
        {p.svc>0&&<FilaGL l="Servicios" v={p.svc} neg indent onDelete={!compact?()=>borrarCategoria(suc,"servicios"):null}/>}
        {p.otr>0&&<FilaGL l="Otros gastos" v={p.otr} neg indent onDelete={!compact?()=>borrarCategoria(suc,"otro"):null}/>}
        {p.customItems.map(c=><div key={c.cat} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          <span style={{fontSize:"13px",color:"rgba(255,255,255,0.45)",paddingLeft:"14px"}}>{c.label}</span>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <span style={{fontSize:"13px",fontWeight:500,color:"#f97316"}}>{fmt(c.monto)}</span>
            {!compact&&c.items.map(it=><button key={it.id} onClick={()=>borrarGasto(it.id)} style={{background:"none",border:"none",color:"rgba(255,80,80,0.5)",cursor:"pointer",fontSize:"14px",padding:"0",lineHeight:1}}>×</button>)}
          </div>
        </div>)}
        <FilaGL l="Total gastos" v={p.egr} neg bold/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"10px",borderTop:"2px solid rgba(255,255,255,0.1)",marginTop:"4px"}}>
          <span style={{fontSize:compact?14:16,fontWeight:700}}>{pos?"Utilidad":"Pérdida neta"}</span>
          <span style={{fontSize:compact?20:26,fontWeight:800,color:pos?"#10b981":"#ff6b6b"}}>{fmt(Math.abs(p.util))}</span>
        </div>
        {p.mg!==null&&<div style={{textAlign:"right",fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>Margen {p.mg.toFixed(1)}%</div>}
        {!compact&&p.nomItems.length>0&&<div style={{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.25)",marginBottom:"6px"}}>NÓMINA REGISTRADA</div>
          {p.nomItems.map(n=><div key={n.id} style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:"rgba(255,255,255,0.45)",padding:"4px 0"}}>
            <span>{n.concepto}</span>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}><span>{fmt(n.monto)}</span><button onClick={()=>borrarGasto(n.id)} style={{background:"none",border:"none",color:"rgba(255,80,80,0.5)",cursor:"pointer",fontSize:"14px",padding:"0",lineHeight:1}}>×</button></div>
          </div>)}
        </div>}
      </div>
    );
  };

  const actSucMulti=sucMulti.filter(s=>sucVisible.includes(s));
  const pc=actSucMulti.length>0?plC(actSucMulti):null;

  return(<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
    {/* Controles */}
    <div style={{display:"flex",alignItems:"flex-end",gap:"16px",flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>PERÍODO</div>
        <select className="inp" style={{width:"160px"}} value={periodo} onChange={e=>setPeriodo(e.target.value)}>
          {listaMeses.map(m=><option key={m} value={m}>{etiq(m)}</option>)}
        </select>
      </div>
      {puedeMV&&<div>
        <div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>VISTA</div>
        <div style={{display:"flex",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",overflow:"hidden"}}>
          {[["individual","Individual"],["consolidado","Consolidado"],["comparativa","Comparativa"]].map(([v,l])=><button key={v} onClick={()=>{setVista(v);setAiTxt("");}} style={{padding:"7px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"none",background:vista===v?"#2721E8":"transparent",color:vista===v?"#fff":"rgba(255,255,255,0.35)",fontFamily:"'Albert Sans',sans-serif"}}>{l}</button>)}
        </div>
      </div>}
      {(vista==="individual"||esSocia)&&<div>
        <div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>SUCURSAL</div>
        <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
          {sucVisible.map(s=><button key={s} onClick={()=>{setSucSel(s);setAiTxt("");}} style={{padding:"6px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:`1px solid ${sucSel===s?COLORES[s]:"rgba(255,255,255,0.1)"}`,borderRadius:"8px",background:sucSel===s?`${COLORES[s]}22`:"transparent",color:sucSel===s?"#fff":"rgba(255,255,255,0.4)",fontFamily:"'Albert Sans',sans-serif",transition:"all 0.15s"}}>{s}</button>)}
        </div>
      </div>}
      {vista==="consolidado"&&<div>
        <div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>SELECCIONAR SUCURSALES</div>
        <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
          {sucVisible.map(s=>{const on=sucMulti.includes(s);return<button key={s} onClick={()=>setSucMulti(on?sucMulti.filter(x=>x!==s):[...sucMulti,s])} style={{padding:"6px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:`1px solid ${on?COLORES[s]:"rgba(255,255,255,0.1)"}`,borderRadius:"8px",background:on?`${COLORES[s]}22`:"transparent",color:on?"#fff":"rgba(255,255,255,0.4)",fontFamily:"'Albert Sans',sans-serif",transition:"all 0.15s"}}>{s}</button>;})}
        </div>
      </div>}
      <button className="btn-ghost" onClick={cargar} style={{marginLeft:"auto"}} disabled={loading}>↻</button>
      {loading&&<span style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Cargando...</span>}
    </div>

    {/* Vista individual */}
    {(vista==="individual"||esSocia)&&<TarjetaPL suc={sucSel}/>}

    {/* Vista consolidada */}
    {vista==="consolidado"&&pc&&<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px"}}>
        {[{l:"INGRESOS",v:fmt(pc.ing),c:"#10b981"},{l:"GASTOS",v:fmt(pc.egr),c:"#f97316"},{l:pc.util>=0?"UTILIDAD":"PÉRDIDA",v:fmt(Math.abs(pc.util)),c:pc.util>=0?"#10b981":"#ff6b6b"},{l:"MARGEN",v:pc.mg!==null?`${pc.mg.toFixed(1)}%`:"—",c:pc.mg>=20?"#10b981":pc.mg>=0?"#f0c040":"#ff6b6b"}].map(k=><div key={k.l} className="kpi"><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"8px"}}>{k.l}</div><div style={{fontSize:"26px",fontWeight:700,color:k.c}}>{k.v}</div></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${actSucMulti.length},1fr)`,gap:"14px"}}>
        {actSucMulti.map(s=><TarjetaPL key={s} suc={s} compact/>)}
      </div>
    </>}

    {/* Vista comparativa */}
    {vista==="comparativa"&&<>
      <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>{etiq(periodo).toUpperCase()} VS {etiq(antYM(periodo)).toUpperCase()}</div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(sucVisible.length,5)},1fr)`,gap:"14px"}}>
        {sucVisible.map(s=><TarjetaPL key={s} suc={s} compact showDelta/>)}
      </div>
    </>}

    {/* Formulario gastos */}
    <div className="glass" style={{padding:"22px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",flexWrap:"wrap",gap:"8px"}}>
        <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>REGISTRAR GASTO · <span style={{color:"rgba(255,255,255,0.5)"}}>{etiq(fPeriodo).toUpperCase()}</span></div>
        <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none"}}>
          <div onClick={()=>setFRecurrente(v=>!v)} style={{width:"36px",height:"20px",borderRadius:"10px",background:fRecurrente?"#2721E8":"rgba(255,255,255,0.12)",transition:"background 0.2s",position:"relative",flexShrink:0}}>
            <div style={{position:"absolute",top:"3px",left:fRecurrente?"19px":"3px",width:"14px",height:"14px",borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
          </div>
          <span style={{fontSize:"12px",color:fRecurrente?"#a5b4fc":"rgba(255,255,255,0.4)"}}>
            {fRecurrente?"Gasto fijo mensual (se guardará en los próximos 12 meses)":"Solo este mes"}
          </span>
        </label>
      </div>
      <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"flex-end"}}>
        <div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"4px"}}>Sucursal</div>
          <select className="inp" style={{width:"140px"}} value={fSuc} onChange={e=>setFSuc(e.target.value)}>
            {sucVisible.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"4px"}}>Mes</div>
          <select className="inp" style={{width:"150px"}} value={fPeriodo} onChange={e=>setFPeriodo(e.target.value)}>
            {listaMeses.map(m=><option key={m} value={m}>{etiq(m)}</option>)}
          </select>
        </div>
        <div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"4px"}}>Categoría</div>
          <select className="inp" style={{width:"190px"}} value={fCat} onChange={e=>setFCat(e.target.value)}>
            <option value="contenido_digital">Contenido digital</option>
            <option value="plataforma_cire">Plataforma CIRE</option>
            <option value="renta">Renta</option>
            <option value="servicios">Servicios (agua/luz/internet)</option>
            <option value="nomina">Nómina</option>
            <option value="otro">Otro gasto</option>
            <option value="personalizado">＋ Concepto personalizado</option>
          </select>
        </div>
        {fCat!=="nomina"&&<><div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"4px"}}>{fCat==="personalizado"?"Nombre del concepto *":"Concepto"}</div>
          <input className="inp" style={{width:"180px",borderColor:fCat==="personalizado"?"rgba(39,33,232,0.6)":"undefined"}} placeholder={fCat==="personalizado"?"Ej: Software CRM":"Descripción (opcional)"} value={fConc} onChange={e=>setFConc(e.target.value)}/></div>
          <div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"4px"}}>Monto</div>
          <input className="inp" style={{width:"130px"}} type="number" placeholder="$0" value={fMonto} onChange={e=>setFMonto(e.target.value)} onKeyDown={e=>e.key==="Enter"&&guardar()}/></div>
          <button className="btn-blue" onClick={guardar} disabled={saving}>{saving?(fRecurrente?"Guardando 12 meses...":"Guardando..."):"Guardar"}</button>
        </>}
      </div>
      {fCat==="nomina"&&<div style={{marginTop:"14px"}}>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginBottom:"8px"}}>Colaboradoras de {fSuc} · {etiq(fPeriodo)} <span style={{color:"rgba(255,255,255,0.2)"}}>(reemplaza lo anterior{fRecurrente?" en los próximos 12 meses":""})</span></div>
        {nomRows.map((n,i)=><div key={i} style={{display:"flex",gap:"8px",marginBottom:"6px",alignItems:"center"}}>
          <input className="inp" style={{flex:2}} placeholder="Nombre" value={n.nombre} onChange={e=>setNomRows(r=>{const c=[...r];c[i]={...c[i],nombre:e.target.value};return c;})}/>
          <input className="inp" style={{width:"130px"}} type="number" placeholder="$ Monto" value={n.monto} onChange={e=>setNomRows(r=>{const c=[...r];c[i]={...c[i],monto:e.target.value};return c;})}/>
          {nomRows.length>1&&<button className="btn-ghost" style={{padding:"8px 12px"}} onClick={()=>setNomRows(r=>r.filter((_,j)=>j!==i))}>×</button>}
        </div>)}
        <div style={{display:"flex",gap:"8px",marginTop:"6px"}}>
          <button className="btn-ghost" style={{fontSize:"11px"}} onClick={()=>setNomRows(r=>[...r,{nombre:"",monto:""}])}>+ Agregar</button>
          <button className="btn-blue" style={{fontSize:"12px"}} onClick={guardar} disabled={saving}>{saving?"Guardando...":"Guardar nóminas"}</button>
        </div>
      </div>}
    </div>

    {/* Bloque IA */}
    <div className="glass" style={{padding:"22px",borderColor:aiTxt?"rgba(39,33,232,0.4)":"rgba(255,255,255,0.08)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:aiTxt||aiLoad?"16px":"0"}}>
        <div>
          <div style={{fontSize:"14px",fontWeight:700,marginBottom:"2px"}}>Análisis con IA</div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Claude interpreta tus resultados en lenguaje claro, sin tecnicismos</div>
        </div>
        <button className="btn-blue" onClick={analizarIA} disabled={aiLoad} style={{padding:"10px 22px",fontSize:"12px"}}>{aiLoad?"Analizando...":"✦ Analizar"}</button>
      </div>
      {aiLoad&&<div style={{color:"rgba(255,255,255,0.35)",fontSize:"13px",fontStyle:"italic"}}>Analizando resultados de {etiq(periodo)}...</div>}
      {aiTxt&&<div style={{fontSize:"14px",color:"rgba(255,255,255,0.82)",lineHeight:"1.75",whiteSpace:"pre-wrap"}}>{aiTxt}</div>}
    </div>
  </div>);}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — Vista ejecutiva para dueño de negocio
// ══════════════════════════════════════════════════════════════════════════════
// ANALÍTICA — solo admin (panel de usabilidad en tiempo real)
// ══════════════════════════════════════════════════════════════════════════════
// Mapeo: qué gerentes/socias administran cada sucursal
const GERENTES_SUC=(()=>{
  const m={};
  USUARIOS.filter(u=>u.rol==="socia").forEach(u=>(u.sucursales||[]).forEach(s=>{(m[s]=m[s]||[]).push(u.usuario);}));
  USUARIOS.filter(u=>u.rol==="duena_general").forEach(u=>{const ss=u.sucursalesPropias||SUCURSALES_NAMES;ss.forEach(s=>{(m[s]=m[s]||[]).push(u.usuario);});});
  return m;
})();
const ROL_BADGE={admin:{label:"Admin",c:"#a855f7"},duena_general:{label:"Dueña",c:"#f0c040"},socia:{label:"Gerente",c:"#f97316"},sucursal:{label:"POS",c:"#49B8D3"}};

function Analitica(){
  const[logs,setLogs]=useState([]);
  const[loading,setLoading]=useState(true);
  const[sucTab,setSucTab]=useState("General");
  const[rango,setRango]=useState("7d");

  const cargarLogs=async()=>{
    setLoading(true);
    const ahora=new Date();
    const desde=rango==="24h"?new Date(ahora-24*3600*1e3).toISOString()
      :rango==="7d"?new Date(ahora-7*24*3600*1e3).toISOString()
      :new Date(ahora-30*24*3600*1e3).toISOString();
    const{data}=await supabase.from("activity_logs").select("*").gte("created_at",desde).order("created_at",{ascending:false}).limit(3000);
    setLogs(data||[]);setLoading(false);
  };
  useEffect(()=>{cargarLogs();},[rango]);
  useEffect(()=>{
    const ch=supabase.channel("analitica_rt")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"activity_logs"},p=>{setLogs(prev=>[p.new,...prev].slice(0,3000));})
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[]);

  // ── Filtrado inteligente por sucursal ────────────────────────────────────────
  // Branch tabs incluyen: usuario POS de esa sucursal + gerentes que la administran
  const logsTab=sucTab==="General"?logs
    :sucTab==="Gerentes"?logs.filter(l=>l.rol==="socia"||l.rol==="duena_general")
    :logs.filter(l=>
        (l.rol==="sucursal"&&l.sucursal_nombre===sucTab)||
        (GERENTES_SUC[sucTab]||[]).includes(l.usuario)
      );

  const ahora=new Date();
  const hace1h=new Date(ahora-3600*1e3).toISOString();
  const hace24h=new Date(ahora-86400*1e3).toISOString();
  const activosAhora=[...new Set(logs.filter(l=>l.created_at>hace1h).map(l=>l.usuario))];
  const eventosHoy=logs.filter(l=>l.created_at>hace24h).length;

  // ── Tiempo por sección (tab dashboard) ──────────────────────────────────────
  const tabSecciones=["resumen","sucursales","servicios","meta","pos","finanzas","importar"];
  const heatLabels={resumen:"Resumen",sucursales:"Sucursales",servicios:"Servicios",meta:"Meta Ads",pos:"POS",finanzas:"Finanzas",importar:"Importar"};
  const tiempoPorTab={};
  logsTab.filter(l=>l.evento&&l.evento.startsWith("tab:")&&l.duracion_segundos>0).forEach(l=>{
    const t=l.evento.replace("tab:","");tiempoPorTab[t]=(tiempoPorTab[t]||0)+(l.duracion_segundos||0);
  });
  const maxTiempo=Math.max(...tabSecciones.map(s=>tiempoPorTab[s]||0),1);
  const eventCounts={};logsTab.forEach(l=>{const k=l.evento||"otro";eventCounts[k]=(eventCounts[k]||0)+1;});
  const topSeccion=Object.entries(tiempoPorTab).sort((a,b)=>b[1]-a[1])[0];

  // ── Acciones POS (vistas en el POS) ─────────────────────────────────────────
  const posVistas={};
  logsTab.filter(l=>l.evento==="pos:vista"&&l.detalle).forEach(l=>{posVistas[l.detalle]=(posVistas[l.detalle]||0)+1;});

  // ── Stats agrupados por usuario + rol ───────────────────────────────────────
  const usuStats={};
  logs.forEach(l=>{
    if(!usuStats[l.usuario])usuStats[l.usuario]={usuario:l.usuario,nombre:l.sucursal_nombre,rol:l.rol,count:0,ultimo:null,ventas:0};
    usuStats[l.usuario].count++;
    if(!usuStats[l.usuario].ultimo||l.created_at>usuStats[l.usuario].ultimo)usuStats[l.usuario].ultimo=l.created_at;
    if(l.evento==="venta_completada"||l.evento==="venta_anticipo")usuStats[l.usuario].ventas++;
  });
  const todosUsuarios=Object.values(usuStats).sort((a,b)=>b.count-a.count);
  const usuariosGerentes=todosUsuarios.filter(u=>u.rol==="socia"||u.rol==="duena_general");
  const usuariosPOS=todosUsuarios.filter(u=>u.rol==="sucursal");

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmtEvento=(e,det)=>{
    if(!e)return"—";
    if(e==="session_start")return"🟢 Inicio de sesión";
    if(e==="session_end")return"🔴 Cierre de sesión";
    if(e==="venta_completada")return"💰 Venta completada";
    if(e==="venta_anticipo")return"📋 Anticipo registrado";
    if(e==="pos:vista")return`🖥 POS → ${det||""}`;
    if(e.startsWith("tab:"))return`📂 Dashboard → ${e.replace("tab:","")}`;
    return e;
  };
  const fmtT=(s)=>{if(!s||s<=0)return"—";if(s<60)return`${s}s`;if(s<3600)return`${Math.floor(s/60)}m`;return`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;};
  const relTime=(iso)=>{if(!iso)return"—";const s=Math.round((Date.now()-new Date(iso))/1000);if(s<60)return`hace ${s}s`;if(s<3600)return`hace ${Math.floor(s/60)}m`;if(s<86400)return`hace ${Math.floor(s/3600)}h`;return`hace ${Math.floor(s/86400)}d`;};
  const heatColor=(s)=>{const r=(tiempoPorTab[s]||0)/maxTiempo;if(r>0.75)return"#2721E8";if(r>0.5)return"#4f46e5";if(r>0.25)return"#7c6ffa";if(r>0)return"rgba(79,70,229,0.45)";return"rgba(255,255,255,0.06)";};
  const UserRow=({u})=>{
    const activo=activosAhora.includes(u.usuario);
    const badge=ROL_BADGE[u.rol]||{label:u.rol,c:"#fff"};
    const col=COLORES[u.nombre]||badge.c;
    return(
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`${col}22`,border:`1px solid ${col}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:col,flexShrink:0}}>
            {(u.nombre||u.usuario||"?")[0]}
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13,fontWeight:600}}>{u.nombre||u.usuario}</span>
              <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:`${badge.c}22`,color:badge.c,border:`1px solid ${badge.c}44`}}>{badge.label}</span>
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:1}}>
              {u.count} eventos · {u.ventas>0?`${u.ventas} ventas · `:""}último {relTime(u.ultimo)}
            </div>
          </div>
        </div>
        <div style={{fontSize:11,color:activo?"#10b981":"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",gap:4}}>
          {activo&&<div style={{width:6,height:6,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 5px #10b981"}}/>}
          {activo?"Activo ahora":""}
        </div>
      </div>
    );
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* Header */}
      <div className="glass" style={{padding:"18px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:16,fontWeight:700}}>🔬 Analítica de Uso</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:3}}>Usabilidad en tiempo real · solo visible para admin</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {[{v:"24h",l:"24 h"},{v:"7d",l:"7 días"},{v:"30d",l:"30 días"}].map(r=>(
            <button key={r.v} onClick={()=>setRango(r.v)} style={{padding:"5px 14px",fontSize:11,fontWeight:600,border:"1px solid",borderRadius:8,cursor:"pointer",fontFamily:"'Albert Sans',sans-serif",background:rango===r.v?"#2721E8":"transparent",borderColor:rango===r.v?"#2721E8":"rgba(255,255,255,0.1)",color:rango===r.v?"#fff":"rgba(255,255,255,0.4)"}}>
              {r.l}
            </button>
          ))}
          <button onClick={cargarLogs} style={{padding:"5px 12px",fontSize:11,border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,cursor:"pointer",fontFamily:"'Albert Sans',sans-serif",background:"transparent",color:"rgba(255,255,255,0.4)"}}>↻</button>
        </div>
      </div>

      {/* Tabs: General + cada sucursal (POS + sus gerentes) + Gerentes globales */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {[{k:"General",l:"🌐 General",c:"#2721E8"},...SUCURSALES_NAMES.map(s=>({k:s,l:s,c:COLORES[s]})),{k:"Gerentes",l:"👔 Gerentes",c:"#f97316"}].map(({k,l,c})=>(
          <button key={k} onClick={()=>setSucTab(k)} style={{padding:"7px 18px",fontSize:12,fontWeight:600,border:"1px solid",borderRadius:20,cursor:"pointer",fontFamily:"'Albert Sans',sans-serif",background:sucTab===k?`${c}22`:"transparent",borderColor:sucTab===k?c:"rgba(255,255,255,0.1)",color:sucTab===k?c:"rgba(255,255,255,0.4)"}}>
            {l}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        {[
          {l:"ACTIVOS ÚLTIMA HORA",v:activosAhora.length,s:activosAhora.map(u=>USUARIOS.find(x=>x.usuario===u)?.nombre||u).join(", ")||"Nadie",cl:"#10b981",cls:"green"},
          {l:"EVENTOS ÚLTIMAS 24H",v:eventosHoy,s:"En todo el sistema",cl:"#fff",cls:"hi"},
          {l:"SECCIÓN MÁS USADA",v:(topSeccion?.[0]||"—").toUpperCase(),s:fmtT(topSeccion?.[1]||0)+" acumulado",cl:"#a855f7",cls:""},
          {l:"EVENTOS EN VISTA",v:logsTab.length,s:`${[...new Set(logsTab.map(l=>l.usuario))].length} usuarios`,cl:"#49B8D3",cls:""},
        ].map((k,i)=>(
          <div key={i} className={`kpi ${k.cls}`}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"rgba(255,255,255,0.35)",marginBottom:8}}>{k.l}</div>
            <div style={{fontSize:24,fontWeight:700,color:k.cl,marginBottom:4}}>{k.v}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* Layout: 3 columnas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>

        {/* Col 1: Gerentes de sucursal */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="glass" style={{padding:"20px 24px"}}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"#f97316",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
              👔 GERENTES Y DUEÑAS
              <span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"rgba(249,115,22,0.1)",border:"1px solid rgba(249,115,22,0.3)",color:"#f97316"}}>socia · duena_general</span>
            </div>
            {usuariosGerentes.length===0&&!loading&&<div style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>Sin actividad en este período</div>}
            {usuariosGerentes.map(u=><UserRow key={u.usuario} u={u}/>)}
          </div>

          {/* POS staff */}
          <div className="glass" style={{padding:"20px 24px"}}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"#49B8D3",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
              🖥 STAFF POS
              <span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"rgba(73,184,211,0.1)",border:"1px solid rgba(73,184,211,0.3)",color:"#49B8D3"}}>sucursal</span>
            </div>
            {usuariosPOS.length===0&&!loading&&<div style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>Sin actividad en este período</div>}
            {usuariosPOS.map(u=><UserRow key={u.usuario} u={u}/>)}
          </div>

          {/* Acciones POS */}
          {Object.keys(posVistas).length>0&&<div className="glass" style={{padding:"20px 24px"}}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"rgba(255,255,255,0.3)",marginBottom:14}}>NAVEGACIÓN POS</div>
            {Object.entries(posVistas).sort((a,b)=>b[1]-a[1]).map(([v,c])=>(
              <div key={v} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.6)",textTransform:"capitalize"}}>{v}</span>
                <span style={{fontSize:12,fontWeight:700,color:"#49B8D3"}}>{c}x</span>
              </div>
            ))}
          </div>}
        </div>

        {/* Col 2: Heatmap + barras de tiempo */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="glass" style={{padding:"20px 24px"}}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"rgba(255,255,255,0.3)",marginBottom:14}}>MAPA DE CALOR — DASHBOARD</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
              {tabSecciones.map(s=>{
                const c=heatColor(s);
                return(
                  <div key={s} style={{borderRadius:10,padding:"14px 8px",textAlign:"center",border:`1px solid ${c}`,background:`${c}22`}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#fff",marginBottom:3}}>{heatLabels[s]}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c==="rgba(255,255,255,0.06)"?"rgba(255,255,255,0.2)":"#fff"}}>{fmtT(tiempoPorTab[s]||0)}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:2}}>{eventCounts[`tab:${s}`]||0} visitas</div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.15)",textAlign:"right"}}>Azul oscuro = más tiempo</div>
          </div>
          <div className="glass" style={{padding:"20px 24px"}}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"rgba(255,255,255,0.3)",marginBottom:16}}>TIEMPO ACUMULADO</div>
            {tabSecciones.map(s=>{
              const t=tiempoPorTab[s]||0;
              const pct=maxTiempo>0?(t/maxTiempo*100):0;
              return(
                <div key={s} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:11,color:"rgba(255,255,255,0.65)"}}>{heatLabels[s]}</span>
                    <span style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{fmtT(t)}</span>
                  </div>
                  <div style={{height:5,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#2721E8,#a855f7)",borderRadius:3}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 3: Feed en vivo */}
        <div className="glass" style={{padding:"20px 24px",display:"flex",flexDirection:"column",maxHeight:900}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexShrink:0}}>
            <div style={{fontSize:10,letterSpacing:"1.5px",color:"rgba(255,255,255,0.3)"}}>FEED EN VIVO</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 6px #10b981"}}/>
              <span style={{fontSize:10,color:"#10b981"}}>Tiempo real</span>
            </div>
          </div>
          {loading&&<div style={{textAlign:"center",padding:60,color:"rgba(255,255,255,0.25)",fontSize:13}}>Cargando...</div>}
          {!loading&&logsTab.length===0&&<div style={{textAlign:"center",padding:60,color:"rgba(255,255,255,0.2)",fontSize:12}}>Sin eventos en este período</div>}
          <div style={{overflowY:"auto",flex:1}}>
            {logsTab.slice(0,300).map((l,i)=>{
              const badge=ROL_BADGE[l.rol]||{label:l.rol,c:"#fff"};
              const col=COLORES[l.sucursal_nombre]||badge.c;
              return(
                <div key={l.id||i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 4px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:`${col}22`,border:`1px solid ${col}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:col,flexShrink:0}}>
                    {(l.sucursal_nombre||l.usuario||"?")[0]}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:600,color:"#fff"}}>{fmtEvento(l.evento,l.detalle)}</span>
                      <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:`${badge.c}1a`,color:badge.c,border:`1px solid ${badge.c}33`,flexShrink:0}}>{badge.label}</span>
                    </div>
                    {l.detalle&&l.evento!=="pos:vista"&&<div style={{fontSize:10,color:"rgba(255,255,255,0.3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.detalle}</div>}
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.18)",marginTop:1,display:"flex",gap:5}}>
                      <span>{l.sucursal_nombre||l.usuario}</span>
                      <span>·</span>
                      <span>{relTime(l.created_at)}</span>
                      {l.duracion_segundos>0&&<><span>·</span><span>{fmtT(l.duracion_segundos)}</span></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
const inicioSemana=()=>{const h=cdmx();const d=new Date(h+"T12:00:00"),dow=d.getDay();d.setDate(d.getDate()-(dow===0?6:dow-1));return d.toISOString().slice(0,10);};
const semanaLabel=()=>{const ini=new Date(inicioSemana()+"T12:00:00"),fin=new Date(ini);fin.setDate(ini.getDate()+6);return`${ini.toLocaleDateString("es-MX",{day:"numeric",month:"short"})} – ${fin.toLocaleDateString("es-MX",{day:"numeric",month:"short"})}`;};

function Dashboard({session=null,onLogout,sucursalesFiltro=null,sucursalesPropias=null}){
  useCSSInjection();
  const[tab,setTab]=useState("resumen");
  const tabInicioRef=useRef(Date.now());
  const tabPrevRef=useRef("resumen");
  useEffect(()=>{
    const prev=tabPrevRef.current;
    const dur=Math.round((Date.now()-tabInicioRef.current)/1000);
    if(prev!==tab&&session)logActividad(session,`tab:${tab}`,prev,dur>3?dur:null);
    tabPrevRef.current=tab;tabInicioRef.current=Date.now();
  },[tab]);
  const[periodo,setPeriodo]=useState("mes"); // "semana" | "mes"
  const[tickets,setTickets]=useState([]);
  const[citas,setCitas]=useState([]);
  const[loadingDB,setLoadingDB]=useState(false);
  const[ultimaActualizacion,setUltimaActualizacion]=useState(null);
  const[metaData,setMetaData]=useState(null);
  const[metaDiario,setMetaDiario]=useState([]); // [{fecha,sucursal,mensajes,spend}]
  const[msgSucFiltro,setMsgSucFiltro]=useState("Todas");
  const[loadingMeta,setLoadingMeta]=useState(false);
  const[metaError,setMetaError]=useState("");
  const[metaDataMes,setMetaDataMes]=useState(null);
  const[metaDiarioMes,setMetaDiarioMes]=useState([]);
  const[loadingMetaMes,setLoadingMetaMes]=useState(false);
  const[metaErrorMes,setMetaErrorMes]=useState("");
  const[metaHistorial,setMetaHistorial]=useState([]);
  const[loadingHist,setLoadingHist]=useState(false);
  const[metaHistSucFiltro,setMetaHistSucFiltro]=useState("Todas");
  const[metaChartMetrica,setMetaChartMetrica]=useState("inversion");
  const[expandedSucSem,setExpandedSucSem]=useState(null);
  const[posSuc,setPosSuc]=useState(null);
  const[importType,setImportType]=useState("combinado"); // "combinado" | "ics" | "csv"
  const[importSuc,setImportSuc]=useState(USUARIOS.find(u=>u.rol==="sucursal")||null);
  const[importDST,setImportDST]=useState(true); // true = con horario de verano (CDT UTC-5)
  const[soloMias,setSoloMias]=useState(false);
  const[mesSel,setMesSel]=useState(()=>defaultMes());
  const[customDesde,setCustomDesde]=useState(()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;});
  const[customHasta,setCustomHasta]=useState(()=>ayer());

  const[mesY,mesM]=mesSel.split("-").map(Number);
  const curYM=(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;})();
  const mesDesde=`${mesSel}-01`;
  const mesHasta=mesSel<curYM?`${mesSel}-${new Date(mesY,mesM,0).getDate()}`:hoy();
  const desde=periodo==="personalizado"?customDesde:mesDesde;
  const hasta=periodo==="personalizado"?customHasta:mesHasta;
  const mesSelLabel=new Date(mesY,mesM-1,1).toLocaleDateString("es-MX",{month:"long",year:"numeric"});
  const customLabel=`${new Date(customDesde+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})} – ${new Date(customHasta+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})}`;
  const periodoLabel=periodo==="personalizado"?customLabel:mesSelLabel;
  const mesesOpciones=Array.from({length:13},(_,i)=>{const d=new Date(new Date().getFullYear(),new Date().getMonth()-i,1);const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;const l=d.toLocaleDateString("es-MX",{month:"long",year:"numeric"});return{v,l};});

  const cargarDatos=async()=>{
    setLoadingDB(true);
    const[{data:tData},{data:cData}]=await Promise.all([
      supabase.from("tickets").select("*").gte("fecha",desde).lte("fecha",hasta).order("created_at",{ascending:false}),
      supabase.from("citas").select("*").gte("fecha",desde).lte("fecha",hasta)
    ]);
    if(tData)setTickets(tData);
    if(cData)setCitas(cData);
    setUltimaActualizacion(new Date());
    setLoadingDB(false);
  };
  const cargarMeta=async()=>{
    setLoadingMeta(true);setMetaError("");
    try{
      const since=desde,until=(hasta===hoy()?ayer():hasta),fields="adset_name,spend,actions,impressions,clicks,reach";
      const ahora=new Date();
      const curYM=`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}`;
      const curMonthStart=`${curYM}-01`;
      // Si el período es completamente histórico (hasta antes del mes actual), leer de caché
      const isAllHistorical=until<curMonthStart;
      if(isAllHistorical){
        const{data:diarioCached}=await supabase.from("meta_diario").select("*").gte("fecha",since).lte("fecha",until);
        if(diarioCached&&diarioCached.length>0){
          let tS=0,tM=0;const pS={};SUCURSALES_NAMES.forEach(s=>{pS[s]={spend:0,mensajes:0};});
          diarioCached.forEach(r=>{tS+=Number(r.spend||0);tM+=Number(r.mensajes||0);if(pS[r.sucursal]){pS[r.sucursal].spend+=Number(r.spend||0);pS[r.sucursal].mensajes+=Number(r.mensajes||0);}});
          setMetaData({spend:tS,mensajes:tM,impresiones:0,clics:0,alcance:0,porSucursal:pS});
          setMetaDiario(diarioCached.map(r=>({fecha:r.fecha,sucursal:r.sucursal,mensajes:Number(r.mensajes),spend:Number(r.spend)})));
          setLoadingMeta(false);return;
        }
      }
      // Fetch desde Meta API
      const url=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=adset&limit=200&access_token=${META_TOKEN}`;
      const urlDiario=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=adset&time_increment=1&limit=500&access_token=${META_TOKEN}`;
      const[res,resDiario]=await Promise.all([fetch(url),fetch(urlDiario)]);
      const json=await res.json();let jsonDiario=await resDiario.json();
      if(json.error){setMetaError(json.error.message);setLoadingMeta(false);return;}
      const rows=json.data||[];
      const getM=(a)=>{const f=(t)=>{const x=(a||[]).find(z=>z.action_type===t);return x?Number(x.value):0;};return f("onsite_conversion.messaging_conversation_started_7d")||f("onsite_conversion.total_messaging_connection")||f("onsite_conversion.messaging_first_reply")||f("contact");};
      let tS=0,tM=0,tI=0,tC=0,tA=0;
      const pS={};SUCURSALES_NAMES.forEach(s=>{pS[s]={spend:0,mensajes:0};});
      rows.forEach(r=>{const sp=Number(r.spend||0),ms=getM(r.actions),im=Number(r.impressions||0),cl=Number(r.clicks||0),al=Number(r.reach||0),nm=(r.adset_name||"").toLowerCase();tS+=sp;tM+=ms;tI+=im;tC+=cl;tA+=al;SUCURSALES_NAMES.forEach(s=>{if(nm.includes(s.toLowerCase())){pS[s].spend+=sp;pS[s].mensajes+=ms;}});});
      setMetaData({spend:tS,mensajes:tM,impresiones:tI,clics:tC,alcance:tA,porSucursal:pS});
      let allDiarioData=[...(jsonDiario.data||[])];
      let nextUrl=jsonDiario.paging?.next;
      while(nextUrl){try{const nr=await fetch(nextUrl);const nj=await nr.json();allDiarioData=[...allDiarioData,...(nj.data||[])];nextUrl=nj.paging?.next;}catch{break;}}
      const diario=[];
      allDiarioData.forEach(r=>{
        const fecha=r.date_start;const ms=getM(r.actions);const sp=Number(r.spend||0);const nm=(r.adset_name||"").toLowerCase();
        SUCURSALES_NAMES.forEach(suc=>{if(nm.includes(suc.toLowerCase())&&ms>0){diario.push({fecha,sucursal:suc,mensajes:ms,spend:sp});}});
      });
      setMetaDiario(diario);
      // Guardar datos diarios históricos en caché para futuras consultas
      if(isAllHistorical&&diario.length>0){
        const now=new Date().toISOString();
        supabase.from("meta_diario").upsert(
          diario.map(d=>({fecha:d.fecha,sucursal:d.sucursal,mes:d.fecha.substring(0,7),mensajes:d.mensajes,spend:d.spend,updated_at:now})),
          {onConflict:"fecha,sucursal"}
        );
      }
    }catch(e){setMetaError("Error Meta.");}
    setLoadingMeta(false);
  };
  const getMetaM=(a)=>{const f=(t)=>{const x=(a||[]).find(z=>z.action_type===t);return x?Number(x.value):0;};return f("onsite_conversion.messaging_conversation_started_7d")||f("onsite_conversion.total_messaging_connection")||f("onsite_conversion.messaging_first_reply")||f("contact");};
  const cargarMetaMes=async(ym,force=false)=>{
    setLoadingMetaMes(true);setMetaErrorMes("");
    try{
      const ahora=new Date();
      const curYM=`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}`;
      const isPast=ym<curYM;
      // Para meses anteriores: intentar caché de Supabase primero
      if(!force&&isPast){
        const{data:cached}=await supabase.from("meta_mensual").select("*").eq("mes",ym);
        if(cached&&cached.some(r=>r.sucursal==="Todas")){
          const todas=cached.find(r=>r.sucursal==="Todas");
          const pS={};SUCURSALES_NAMES.forEach(s=>{const r=cached.find(c=>c.sucursal===s);pS[s]={spend:Number(r?.spend||0),mensajes:Number(r?.mensajes||0)};});
          setMetaDataMes({spend:Number(todas.spend),mensajes:Number(todas.mensajes),impresiones:Number(todas.impresiones),clics:Number(todas.clics),alcance:Number(todas.alcance),porSucursal:pS});
          const{data:diarioCached}=await supabase.from("meta_diario").select("*").eq("mes",ym);
          setMetaDiarioMes((diarioCached||[]).map(r=>({fecha:r.fecha,sucursal:r.sucursal,mensajes:Number(r.mensajes),spend:Number(r.spend)})));
          setLoadingMetaMes(false);return;
        }
      }
      // Fetch desde Meta API
      const[y,m]=ym.split("-").map(Number);
      const since=`${ym}-01`;
      const until=isPast?`${ym}-${new Date(y,m,0).getDate()}`:ayer();
      const fields="adset_name,spend,actions,impressions,clicks,reach";
      const url=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=adset&limit=200&access_token=${META_TOKEN}`;
      const urlD=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=adset&time_increment=1&limit=500&access_token=${META_TOKEN}`;
      const[res,resD]=await Promise.all([fetch(url),fetch(urlD)]);
      const json=await res.json();const jsonD=await resD.json();
      if(json.error){setMetaErrorMes(json.error.message);setLoadingMetaMes(false);return;}
      const rows=json.data||[];let tS=0,tM=0,tI=0,tC=0,tA=0;
      const pS={};SUCURSALES_NAMES.forEach(s=>{pS[s]={spend:0,mensajes:0};});
      rows.forEach(r=>{const sp=Number(r.spend||0),ms=getMetaM(r.actions),nm=(r.adset_name||"").toLowerCase();tS+=sp;tM+=ms;tI+=Number(r.impressions||0);tC+=Number(r.clicks||0);tA+=Number(r.reach||0);SUCURSALES_NAMES.forEach(s=>{if(nm.includes(s.toLowerCase())){pS[s].spend+=sp;pS[s].mensajes+=ms;}});});
      setMetaDataMes({spend:tS,mensajes:tM,impresiones:tI,clics:tC,alcance:tA,porSucursal:pS});
      // Guardar en caché
      const now=new Date().toISOString();
      supabase.from("meta_mensual").upsert([
        {mes:ym,sucursal:"Todas",spend:tS,mensajes:tM,impresiones:tI,clics:tC,alcance:tA,updated_at:now},
        ...SUCURSALES_NAMES.map(s=>({mes:ym,sucursal:s,spend:pS[s].spend,mensajes:pS[s].mensajes,impresiones:0,clics:0,alcance:0,updated_at:now}))
      ],{onConflict:"mes,sucursal"});
      // Datos diarios
      let allD=[...(jsonD.data||[])];let nx=jsonD.paging?.next;
      while(nx){try{const nr=await fetch(nx);const nj=await nr.json();allD=[...allD,...(nj.data||[])];nx=nj.paging?.next;}catch{break;}}
      const diario=[];
      allD.forEach(r=>{const fecha=r.date_start;const ms=getMetaM(r.actions);const sp=Number(r.spend||0);const nm=(r.adset_name||"").toLowerCase();SUCURSALES_NAMES.forEach(suc=>{if(nm.includes(suc.toLowerCase())&&ms>0){diario.push({fecha,sucursal:suc,mensajes:ms,spend:sp});}});});
      setMetaDiarioMes(diario);
      // Guardar datos diarios en caché para meses pasados
      if(isPast&&diario.length>0){
        const now=new Date().toISOString();
        supabase.from("meta_diario").upsert(
          diario.map(d=>({fecha:d.fecha,sucursal:d.sucursal,mes:ym,mensajes:d.mensajes,spend:d.spend,updated_at:now})),
          {onConflict:"fecha,sucursal"}
        );
      }
    }catch(e){setMetaErrorMes("Error Meta.");}
    setLoadingMetaMes(false);
  };
  const cargarMetaHistorial=async()=>{
    setLoadingHist(true);
    try{
      const ahora=new Date();
      const curYM=`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}`;
      const meses=Array.from({length:6},(_,i)=>{const d=new Date(ahora.getFullYear(),ahora.getMonth()-i,1);const y=d.getFullYear(),m=d.getMonth()+1;const ym=`${y}-${String(m).padStart(2,"0")}`;return{ym,since:`${ym}-01`,until:ym<curYM?`${ym}-${new Date(y,m,0).getDate()}`:hoy(),label:d.toLocaleDateString("es-MX",{month:"short",year:"2-digit"})};}).reverse();
      // Cargar todo de Supabase en una sola query
      const{data:allCached}=await supabase.from("meta_mensual").select("*").in("mes",meses.map(x=>x.ym));
      const results=await Promise.all(meses.map(async({ym,since,until,label})=>{
        const isPast=ym<curYM;
        const mesRows=(allCached||[]).filter(r=>r.mes===ym);
        // Usar caché si es mes pasado y tenemos el row "Todas"
        if(isPast&&mesRows.some(r=>r.sucursal==="Todas")){
          const todas=mesRows.find(r=>r.sucursal==="Todas");
          const pS={};SUCURSALES_NAMES.forEach(s=>{const r=mesRows.find(c=>c.sucursal===s);pS[s]={spend:Number(r?.spend||0),mensajes:Number(r?.mensajes||0)};});
          return{ym,label,spend:Number(todas.spend),mensajes:Number(todas.mensajes),porSucursal:pS};
        }
        // Fetch desde Meta API (mes actual o caché faltante)
        try{
          const url=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=adset_name,spend,actions&time_range={"since":"${since}","until":"${until}"}&level=adset&limit=200&access_token=${META_TOKEN}`;
          const res=await fetch(url);const json=await res.json();
          if(json.error)return{ym,label,spend:0,mensajes:0,porSucursal:{}};
          const pS={};SUCURSALES_NAMES.forEach(s=>{pS[s]={spend:0,mensajes:0};});
          let tS=0,tM=0;
          (json.data||[]).forEach(r=>{const sp=Number(r.spend||0),ms=getMetaM(r.actions),nm=(r.adset_name||"").toLowerCase();tS+=sp;tM+=ms;SUCURSALES_NAMES.forEach(s=>{if(nm.includes(s.toLowerCase())){pS[s].spend+=sp;pS[s].mensajes+=ms;}});});
          // Guardar en caché
          const now=new Date().toISOString();
          supabase.from("meta_mensual").upsert([
            {mes:ym,sucursal:"Todas",spend:tS,mensajes:tM,impresiones:0,clics:0,alcance:0,updated_at:now},
            ...SUCURSALES_NAMES.map(s=>({mes:ym,sucursal:s,spend:pS[s].spend,mensajes:pS[s].mensajes,impresiones:0,clics:0,alcance:0,updated_at:now}))
          ],{onConflict:"mes,sucursal"});
          return{ym,label,spend:tS,mensajes:tM,porSucursal:pS};
        }catch{return{ym,label,spend:0,mensajes:0,porSucursal:{}};}
      }));
      setMetaHistorial(results);
    }catch(e){}
    setLoadingHist(false);
  };
  const exportarReporteMeta=()=>{
    const dataExp=isCustomPeriod?metaData:metaDataMes;
    if(!dataExp)return;
    const[mY,mM]=mesSel.split("-").map(Number);
    const mesLbl=isCustomPeriod?customLabel:new Date(mY,mM-1,1).toLocaleDateString("es-MX",{month:"long",year:"numeric"});
    const fechaCorte=isCustomPeriod?customHasta:ayer();
    const fechaGen=new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"});
    const fmtPeso=(n)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:2}).format(n||0);
    const fmtNum=(n)=>new Intl.NumberFormat("es-MX").format(n||0);
    const colorMap={Coapa:"#2721E8",Valle:"#49B8D3",Oriente:"#a855f7",Polanco:"#f97316",Metepec:"#10b981"};
    const porSucAll=SUCURSALES_NAMES.map(n=>{const sp=dataExp.porSucursal?.[n]?.spend||0;const ms=dataExp.porSucursal?.[n]?.mensajes||0;return{nombre:n,spend:sp,mensajes:ms,cpm:ms>0?sp/ms:0};});
    const sorted=[...porSucAll].filter(s=>s.spend>0||s.mensajes>0).sort((a,b)=>b.spend-a.spend);
    const totalSpend=dataExp.spend;const totalMsgs=dataExp.mensajes;const totalCPM=totalMsgs>0?totalSpend/totalMsgs:0;
    const maxSpend=Math.max(...sorted.map(s=>s.spend),1);
    const masEficiente=sorted.filter(s=>s.mensajes>0).sort((a,b)=>a.cpm-b.cpm)[0];
    const menosEficiente=sorted.filter(s=>s.mensajes>0).sort((a,b)=>b.cpm-a.cpm)[0];
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte Meta Ads CIRE · ${mesLbl}</title><style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Inter',sans-serif;background:#fff;color:#1a1a2e;font-size:11px;line-height:1.4;}
    @page{size:letter;margin:16mm 15mm;}
    .page{max-width:700px;margin:0 auto;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #2721E8;margin-bottom:18px;}
    .logo-title{font-size:24px;font-weight:800;color:#2721E8;letter-spacing:-0.5px;}
    .logo-sub{font-size:10px;color:#888;margin-top:1px;letter-spacing:1px;text-transform:uppercase;}
    .badge{display:inline-block;background:#2721E8;color:#fff;font-size:8px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:1.5px;text-transform:uppercase;margin-top:5px;}
    .report-meta{text-align:right;}
    .report-title{font-size:14px;font-weight:700;}
    .report-sub{font-size:9px;color:#888;margin-top:2px;}
    .section-title{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:9px;padding-bottom:5px;border-bottom:1px solid #eee;}
    .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;}
    .kpi{background:#f7f8ff;border:1px solid #e4e6ff;border-radius:8px;padding:11px 13px;}
    .kpi-label{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;margin-bottom:5px;}
    .kpi-value{font-size:21px;font-weight:800;}
    .kpi-sub{font-size:8px;color:#bbb;margin-top:2px;}
    .table{width:100%;border-collapse:collapse;margin-bottom:18px;}
    .table th{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;padding:7px 9px;background:#f7f8ff;border-bottom:2px solid #e4e6ff;text-align:left;}
    .table th.r,.table td.r{text-align:right;}
    .table td{padding:9px 9px;border-bottom:1px solid #f2f2f2;vertical-align:middle;}
    .table tr:last-child td{border-bottom:none;}
    .table tfoot td{background:#f7f8ff;font-weight:700;border-top:2px solid #e4e6ff;font-size:11px;}
    .suc-name{display:flex;align-items:center;gap:7px;font-weight:600;}
    .suc-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0;}
    .bar-wrap{width:100%;height:5px;background:#f0f0f0;border-radius:3px;margin-top:4px;}
    .bar-fill{height:100%;border-radius:3px;}
    .pct-badge{display:inline-block;font-size:8px;font-weight:700;padding:2px 5px;border-radius:10px;}
    .eff{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
    .eff-card{padding:11px 13px;border-radius:8px;border:1px solid;}
    .eff-label{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;}
    .eff-name{font-size:15px;font-weight:800;margin-bottom:2px;}
    .eff-val{font-size:11px;font-weight:600;}
    .eff-msgs{font-size:8px;margin-top:2px;}
    .nota{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:9px 11px;margin-bottom:16px;font-size:9px;color:#92400e;line-height:1.6;}
    .footer{border-top:1px solid #eee;padding-top:9px;margin-top:14px;display:flex;justify-content:space-between;align-items:center;}
    .footer-text{font-size:8px;color:#ccc;}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body><div class="page">
    <div class="header">
      <div><div class="logo-title">CIRE</div><div class="logo-sub">Sistema de Gestión</div><div class="badge">Confidencial</div></div>
      <div class="report-meta">
        <div class="report-title">Reporte de Inversión Meta Ads</div>
        <div class="report-sub">Período: ${mesLbl.charAt(0).toUpperCase()+mesLbl.slice(1)}</div>
        <div class="report-sub">Corte de datos: ${new Date(fechaCorte+"T12:00:00").toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"})}</div>
        <div class="report-sub">Generado: ${fechaGen}</div>
      </div>
    </div>
    <div class="nota">Este reporte refleja la inversión publicitaria en Meta Ads cargada a la cuenta corporativa durante el período indicado. Los importes por sucursal corresponden al costo de los mensajes y prospectos generados para cada unidad, y sirven como base para la distribución interna del gasto.</div>
    <div class="section-title">Resumen Ejecutivo</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Total Invertido</div><div class="kpi-value" style="color:#2721E8">${fmtPeso(totalSpend)}</div><div class="kpi-sub">Gasto total Meta Ads</div></div>
      <div class="kpi"><div class="kpi-label">Mensajes Generados</div><div class="kpi-value" style="color:#a855f7">${fmtNum(totalMsgs)}</div><div class="kpi-sub">Conversaciones iniciadas</div></div>
      <div class="kpi"><div class="kpi-label">Costo por Mensaje</div><div class="kpi-value" style="color:#f97316">${fmtPeso(totalCPM)}</div><div class="kpi-sub">Promedio general</div></div>
    </div>
    <div class="section-title">Distribución por Sucursal — Base de Cobro</div>
    <table class="table"><thead><tr>
      <th>Sucursal</th><th class="r">Inversión</th><th class="r">% del Total</th><th class="r">Mensajes</th><th class="r">Costo / Mensaje</th>
    </tr></thead><tbody>
    ${sorted.map(s=>{const pct=totalSpend>0?(s.spend/totalSpend*100):0;const color=colorMap[s.nombre]||"#2721E8";const barW=maxSpend>0?(s.spend/maxSpend*100):0;const cpmColor=s.cpm<totalCPM?"#10b981":s.cpm>totalCPM*1.5?"#ef4444":"#f97316";
    return`<tr><td><div class="suc-name"><div class="suc-dot" style="background:${color}"></div>${s.nombre}</div><div class="bar-wrap"><div class="bar-fill" style="width:${barW}%;background:${color}80"></div></div></td><td class="r"><strong>${fmtPeso(s.spend)}</strong></td><td class="r"><span class="pct-badge" style="background:${color}18;color:${color}">${pct.toFixed(1)}%</span></td><td class="r">${fmtNum(s.mensajes)}</td><td class="r" style="font-weight:700;color:${cpmColor}">${s.mensajes>0?fmtPeso(s.cpm):"—"}</td></tr>`;
    }).join("")}
    </tbody><tfoot><tr>
      <td>TOTAL</td><td class="r">${fmtPeso(totalSpend)}</td><td class="r">100%</td><td class="r">${fmtNum(totalMsgs)}</td><td class="r">${fmtPeso(totalCPM)}</td>
    </tr></tfoot></table>
    ${masEficiente&&menosEficiente&&masEficiente.nombre!==menosEficiente.nombre?`
    <div class="section-title">Análisis de Eficiencia · Costo por Mensaje</div>
    <div class="eff">
      <div class="eff-card" style="background:#f0fdf4;border-color:#86efac">
        <div class="eff-label" style="color:#166534">Mejor rendimiento</div>
        <div class="eff-name" style="color:${colorMap[masEficiente.nombre]}">${masEficiente.nombre}</div>
        <div class="eff-val" style="color:#166534">${fmtPeso(masEficiente.cpm)} por mensaje</div>
        <div class="eff-msgs" style="color:#4ade80">${fmtNum(masEficiente.mensajes)} mensajes · ${fmtPeso(masEficiente.spend)} invertido</div>
      </div>
      <div class="eff-card" style="background:#fff7ed;border-color:#fdba74">
        <div class="eff-label" style="color:#9a3412">Mayor costo por mensaje</div>
        <div class="eff-name" style="color:${colorMap[menosEficiente.nombre]}">${menosEficiente.nombre}</div>
        <div class="eff-val" style="color:#9a3412">${fmtPeso(menosEficiente.cpm)} por mensaje</div>
        <div class="eff-msgs" style="color:#fb923c">${fmtNum(menosEficiente.mensajes)} mensajes · ${fmtPeso(menosEficiente.spend)} invertido</div>
      </div>
    </div>`:""}
    <div class="footer">
      <div class="footer-text">CIRE Sistema de Gestión — Documento de uso interno y confidencial</div>
      <div class="footer-text">Fuente: Meta Business Suite · ${fechaGen}</div>
    </div>
    </div><script>window.onload=()=>{window.print();}<\/script></body></html>`;
    const w=window.open("","_blank");
    if(w){w.document.write(html);w.document.close();}
  };
  useEffect(()=>{cargarDatos();cargarMeta();},[periodo,mesSel,customDesde,customHasta]);
  useEffect(()=>{cargarMetaMes(mesSel);},[mesSel]);
  useEffect(()=>{cargarMetaHistorial();},[]);

  // ─── Filtrado por rol ──────────────────────────────────────────────────────
  const filtro=sucursalesFiltro||(soloMias?sucursalesPropias:null);
  const sucNames=filtro?SUCURSALES_NAMES.filter(s=>filtro.includes(s)):SUCURSALES_NAMES;
  const tksF=filtro?tickets.filter(t=>filtro.includes(t.sucursal_nombre)):tickets;
  const ctsF=filtro?citas.filter(c=>filtro.includes(c.sucursal_nombre)):citas;
  const metaDiarioF=filtro?metaDiario.filter(d=>filtro.includes(d.sucursal)):metaDiario;
  const metaDiarioMesF=filtro?metaDiarioMes.filter(d=>filtro.includes(d.sucursal)):metaDiarioMes;
  // Aliases para el tab Meta: cuando el periodo es personalizado se usan los datos de cargarMeta
  const isCustomPeriod=periodo==="personalizado";
  const metaDisplay=isCustomPeriod?metaData:metaDataMes;
  const metaDiarioDisplay=isCustomPeriod?metaDiarioF:metaDiarioMesF;
  const loadingMetaDisplay=isCustomPeriod?loadingMeta:loadingMetaMes;
  const metaErrorDisplay=isCustomPeriod?metaError:metaErrorMes;
  const esSocia=!!sucursalesFiltro&&!sucursalesPropias;
  const esAdmin=!sucursalesFiltro&&!sucursalesPropias;
  const TABS_DASH=esSocia?["resumen","sucursales","servicios","meta","finanzas"]:esAdmin?["resumen","sucursales","servicios","meta","pos","finanzas","importar","analitica"]:["resumen","sucursales","servicios","meta","pos","finanzas"];
  const USUARIOS_DASH=filtro?USUARIOS.filter(u=>u.rol==="sucursal"&&filtro.includes(u.nombre)):USUARIOS.filter(u=>u.rol==="sucursal");

  // ─── Métricas globales ─────────────────────────────────────────────────────
  const ventasTotal=tksF.reduce((s,t)=>s+Number(t.total),0);
  const nuevas=tksF.filter(t=>t.tipo_clienta==="Nueva").length;
  const recompras=tksF.filter(t=>t.tipo_clienta==="Recompra").length;
  const sesionesComp=ctsF.filter(c=>c.estado==="completada").length;
  const sesionesAg=ctsF.filter(c=>c.estado==="agendada").length;
  const ticketProm=tksF.length?ventasTotal/tksF.length:0;
  const inv=(filtro&&metaData)?filtro.reduce((s,n)=>s+(metaData.porSucursal?.[n]?.spend||0),0):(metaData?.spend||0);
  const msgs=(filtro&&metaData)?filtro.reduce((s,n)=>s+(metaData.porSucursal?.[n]?.mensajes||0),0):(metaData?.mensajes||0);
  const totalVentas=nuevas+recompras;
  const cpa=nuevas>0&&inv>0?inv/nuevas:0;
  const roas=inv>0?ventasTotal/inv:0;
  const convMsgVenta=msgs>0?((totalVentas/msgs)*100).toFixed(1):"—";
  const convMsgNueva=msgs>0?((nuevas/msgs)*100).toFixed(1):"—";
  const recompRatio=totalVentas>0?((recompras/totalVentas)*100).toFixed(0):"0";

  // ─── Por sucursal ──────────────────────────────────────────────────────────
  const porSuc=sucNames.map(n=>{
    const tks=tksF.filter(t=>t.sucursal_nombre===n);
    const cts=ctsF.filter(c=>c.sucursal_nombre===n);
    const v=tks.reduce((s,t)=>s+Number(t.total),0);
    const nv=tks.filter(t=>t.tipo_clienta==="Nueva").length;
    const rc=tks.filter(t=>t.tipo_clienta==="Recompra").length;
    const sc=cts.filter(c=>c.estado==="completada").length;
    const sa=cts.filter(c=>c.estado==="agendada").length;
    const ms=metaData?.porSucursal?.[n]?.mensajes||0;
    const sp=metaData?.porSucursal?.[n]?.spend||0;
    const cpaN=nv>0&&sp>0?sp/nv:0;
    const roasN=sp>0?v/sp:0;
    const convN=ms>0?((nv/ms)*100).toFixed(1):"—";
    return{nombre:n,ventas:v,nuevas:nv,recompras:rc,sesComp:sc,sesAg:sa,tickets:tks.length,mensajes:ms,spend:sp,cpa:cpaN,roas:roasN,conv:convN};
  });
  const maxV=Math.max(...porSuc.map(s=>s.ventas),1);
  const maxMs=Math.max(...porSuc.map(s=>s.mensajes),1);

  // ─── Servicios y métodos ───────────────────────────────────────────────────
  const sc={};tksF.forEach(t=>{(t.servicios||[]).forEach(s=>{sc[s]=(sc[s]||0)+1;});});const topS=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,8);const maxSvc=topS[0]?.[1]||1;
  const met={};tksF.forEach(t=>{const m=(t.metodo_pago||"").split(" ")[0];met[m]=(met[m]||0)+Number(t.total);});const topM=Object.entries(met).sort((a,b)=>b[1]-a[1]);
  const vD={};tksF.forEach(t=>{vD[t.fecha]=(vD[t.fecha]||0)+Number(t.total);});const dM=Object.entries(vD).sort((a,b)=>a[0].localeCompare(b[0]));const maxD=Math.max(...dM.map(d=>d[1]),1);

  // ─── Esta semana (siempre semana actual, independiente del periodo) ─────────
  const semInicio=inicioSemana();
  const ticketsSem=tksF.filter(t=>t.fecha>=semInicio);
  const diasSem=(()=>{const arr=[];let d=new Date(semInicio+"T12:00:00");const h=hoy();while(d.toISOString().slice(0,10)<=h){const f=d.toISOString().slice(0,10);const tks=ticketsSem.filter(t=>t.fecha===f);arr.push({fecha:f,total:tks.reduce((s,t)=>s+Number(t.total),0),count:tks.length});d.setDate(d.getDate()+1);}return arr;})();
  const semMaxD=Math.max(...diasSem.map(d=>d.total),1);
  const totalSemana=diasSem.reduce((s,d)=>s+d.total,0);
  const porSucSemana=sucNames.map(n=>{const tks=ticketsSem.filter(t=>t.sucursal_nombre===n);const total=tks.reduce((s,t)=>s+Number(t.total),0);const dias=diasSem.map(d=>{const dt=tks.filter(t=>t.fecha===d.fecha);return{fecha:d.fecha,total:dt.reduce((s,t)=>s+Number(t.total),0),count:dt.length};});return{nombre:n,total,dias};});
  const maxVSem=Math.max(...porSucSemana.map(s=>s.total),1);

  // ─── Métodos de pago con parseo de multi-pago ──────────────────────────────
  const metCobro={};tksF.forEach(t=>{const mp=(t.metodo_pago||"").replace(/^Liquidación /i,"").replace(/^Anticipo /i,"");if(mp.includes(" + ")){mp.split(" + ").forEach(parte=>{const mm=parte.match(/^([\w][\w\s]*?)\s+\$([\d,]+)$/);if(mm){const k=mm[1].trim();const v=Number(mm[2].replace(/,/g,""));metCobro[k]=(metCobro[k]||0)+v;}else{const k=parte.split(" ")[0]||"—";metCobro[k]=(metCobro[k]||0)+Number(t.total);}});}else{const k=mp.split(" ")[0]||"—";metCobro[k]=(metCobro[k]||0)+Number(t.total);}});
  const topMet=Object.entries(metCobro).filter(([k])=>k&&k!=="—").sort((a,b)=>b[1]-a[1]);
  const maxMet=topMet[0]?.[1]||1;

  if(posSuc)return<POS session={posSuc} onSwitchSucursal={()=>{setPosSuc(null);cargarDatos();}} isAdmin={true}/>;
  return(
    <div style={{minHeight:"100vh",background:"#22264A",color:"#fff"}}>
      {/* Topbar */}
      <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(20,23,60,0.96)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {/* Fila 1: logo + controles */}
        <div style={{padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"52px",gap:"12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"14px",flexShrink:0}}>
            <div style={{fontSize:"19px",fontWeight:700,letterSpacing:"4px"}}>CIRE</div>
            <div style={{width:"1px",height:"16px",background:"rgba(255,255,255,0.1)"}}/>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",letterSpacing:"2px"}}>DASHBOARD</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"nowrap"}}>
            {/* Toggle Mes / Personalizado */}
            <div style={{display:"flex",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",overflow:"hidden",flexShrink:0}}>
              {[{v:"mes",l:"Mes"},{v:"personalizado",l:"Personalizado"}].map(p=><button key={p.v} onClick={()=>setPeriodo(p.v)} style={{padding:"5px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"none",background:periodo===p.v?"#2721E8":"transparent",color:periodo===p.v?"#fff":"rgba(255,255,255,0.35)",fontFamily:"'Albert Sans',sans-serif",whiteSpace:"nowrap"}}>{p.l}</button>)}
            </div>
            {/* Selector de mes (solo modo Mes) */}
            {!isCustomPeriod&&<select value={mesSel} onChange={e=>setMesSel(e.target.value)} style={{padding:"5px 10px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",background:"rgba(255,255,255,0.06)",color:"#fff",fontFamily:"'Albert Sans',sans-serif",outline:"none",colorScheme:"dark",textTransform:"capitalize",flexShrink:0}}>
              {mesesOpciones.map(o=><option key={o.v} value={o.v} style={{background:"#22264A",textTransform:"capitalize"}}>{o.l}</option>)}
            </select>}
            {/* Date pickers (modo Personalizado) */}
            {isCustomPeriod&&<div style={{display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
              <input type="date" value={customDesde} max={customHasta} onChange={e=>setCustomDesde(e.target.value)} style={{padding:"4px 7px",fontSize:"11px",fontWeight:600,border:"1px solid rgba(255,255,255,0.15)",borderRadius:"7px",background:"rgba(255,255,255,0.06)",color:"#fff",fontFamily:"'Albert Sans',sans-serif",outline:"none",colorScheme:"dark",cursor:"pointer",width:"130px"}}/>
              <span style={{fontSize:"10px",color:"rgba(255,255,255,0.25)"}}>→</span>
              <input type="date" value={customHasta} min={customDesde} max={hoy()} onChange={e=>setCustomHasta(e.target.value)} style={{padding:"4px 7px",fontSize:"11px",fontWeight:600,border:"1px solid rgba(255,255,255,0.15)",borderRadius:"7px",background:"rgba(255,255,255,0.06)",color:"#fff",fontFamily:"'Albert Sans',sans-serif",outline:"none",colorScheme:"dark",cursor:"pointer",width:"130px"}}/>
            </div>}
            {/* Indicador Meta */}
            {loadingMeta
              ?<div style={{fontSize:"10px",padding:"3px 8px",borderRadius:"20px",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.35)",flexShrink:0}}>⟳</div>
              :metaError
              ?<div style={{fontSize:"10px",padding:"3px 8px",borderRadius:"20px",background:"rgba(255,80,80,0.1)",color:"#ff6b6b",border:"1px solid rgba(255,80,80,0.3)",flexShrink:0}}>⚠ Meta</div>
              :metaData?<div style={{fontSize:"10px",padding:"3px 8px",borderRadius:"20px",background:"rgba(16,185,129,0.1)",color:"#10b981",border:"1px solid rgba(16,185,129,0.25)",flexShrink:0}}>● Meta</div>:null}
            <button className="btn-ghost" style={{padding:"5px 12px",fontSize:"12px",flexShrink:0,display:"flex",alignItems:"center",gap:"6px",borderColor:loadingDB?"rgba(255,255,255,0.08)":"rgba(79,70,229,0.4)",color:loadingDB?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.7)"}} onClick={()=>{if(!loadingDB){cargarDatos();cargarMeta();}}} disabled={loadingDB}><span style={{display:"inline-block",animation:loadingDB?"meta-spin 0.8s linear infinite":"none"}}>↻</span>{ultimaActualizacion?<span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>Actualizado {ultimaActualizacion.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>:<span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>Actualizar</span>}</button>
            {sucursalesPropias&&<button className={soloMias?"btn-blue":"btn-ghost"} style={{fontSize:"11px",flexShrink:0,whiteSpace:"nowrap"}} onClick={()=>setSoloMias(v=>!v)}>{soloMias?`◉ ${sucursalesPropias.join(" & ")}`:`Mis sucursales`}</button>}
            <button className="btn-ghost" style={{fontSize:"11px",flexShrink:0}} onClick={onLogout}>Salir</button>
          </div>
        </div>
        {/* Fila 2: tabs */}
        <div style={{padding:"0 24px",display:"flex",borderTop:"1px solid rgba(255,255,255,0.04)",overflowX:"auto",scrollbarWidth:"none",msOverflowStyle:"none"}}>
          {TABS_DASH.map(t=>{const labels={resumen:["📊","Resumen"],sucursales:["🏪","Sucursales"],servicios:["🪒","Servicios"],meta:["📣","Meta Ads"],pos:["🖥","POS"],finanzas:["💰","Finanzas"],importar:["📥","Importar"],analitica:["🔬","Analítica"]};const[ico,lbl]=labels[t]||["",t];return<div key={t} className={`tab-dash${tab===t?" active":""}`} style={{borderBottomColor:tab===t?"#2721E8":"transparent",fontSize:"12px",padding:"10px 16px"}} onClick={()=>setTab(t)}><span style={{fontSize:"13px"}}>{ico}</span><span>{lbl}</span></div>;})}
        </div>
      </div>

      <div style={{padding:"24px 28px",maxWidth:"1400px",margin:"0 auto"}}>

        {/* ═══ RESUMEN ═══ */}
        {tab==="resumen"&&<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
          {/* KPIs fila 1 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"14px"}}>
            {[
              {l:"VENTAS TOTALES",v:fmt(ventasTotal),s:`${fmtN(tickets.length)} tickets`,cls:"hi",cl:"#fff"},
              {l:"CLIENTAS NUEVAS",v:nuevas,s:`${nuevas>0?Math.round(nuevas/tickets.length*100):0}% del total`,cls:"green",cl:"#10b981"},
              {l:"RECOMPRAS",v:recompras,s:`${recompRatio}% recompra`,cls:"",cl:"#49B8D3"},
              {l:"SESIONES",v:sesionesComp,s:`${sesionesAg} por atender`,cls:"",cl:"#fff"},
              {l:"TICKET PROMEDIO",v:fmt(ticketProm),s:"por venta",cls:"",cl:"#fff"},
            ].map(k=><div key={k.l} className={`kpi ${k.cls}`}><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>{k.l}</div><div style={{fontSize:"28px",fontWeight:700,color:k.cl}}>{k.v}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{k.s}</div></div>)}
          </div>
          {/* KPIs fila 2 — Meta Ads */}
          {metaData&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px"}}>
            {[
              {l:"INVERSIÓN ADS",v:fmt(inv),s:`${periodoLabel}`,cl:"#f97316",cls:"orange"},
              {l:"MENSAJES",v:fmtN(msgs),s:`${msgs>0&&totalVentas>0?`1 venta cada ${Math.round(msgs/totalVentas)} msgs`:"—"}`,cl:"#a855f7",cls:""},
              {l:"CPA (nuevas)",v:cpa>0?fmt(cpa):"—",s:cpa>0&&cpa<40?"Excelente":cpa<60?"Aceptable":cpa>0?"Revisar":"Sin datos",cl:cpa>0&&cpa<40?"#10b981":cpa<60?"#f0c040":"#ff6b6b",cls:""},
              {l:"ROAS",v:roas>0?`${roas.toFixed(1)}x`:"—",s:roas>=3?"Excelente":roas>=1?"Aceptable":"Revisar",cl:"#10b981",cls:"green"},
            ].map(k=><div key={k.l} className={`kpi ${k.cls}`}><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>{k.l}</div><div style={{fontSize:"28px",fontWeight:700,color:k.cl}}>{k.v}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{k.s}</div></div>)}
          </div>}
          {/* Conversión msg→venta */}
          {metaData&&msgs>0&&<div className="glass" style={{padding:"20px 24px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>CONVERSIÓN MENSAJE → VENTA</div><div style={{display:"flex",alignItems:"baseline",gap:"16px"}}><div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Total (nueva+recompra)</div><div style={{fontSize:"24px",fontWeight:700,color:parseFloat(convMsgVenta)>=10?"#10b981":"#f0c040"}}>{convMsgVenta}%</div></div><div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Solo nuevas</div><div style={{fontSize:"24px",fontWeight:700,color:parseFloat(convMsgNueva)>=8?"#10b981":"#f0c040"}}>{convMsgNueva}%</div></div></div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)"}}>De {fmtN(msgs)} mensajes</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)"}}>{fmtN(totalVentas)} ventas cerradas</div></div>
            </div>
          </div>}
          {/* ── Esta semana + Por sucursal ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>
            {/* Esta semana por sucursal (con desglose por día al hacer clic) */}
            <div className="glass" style={{padding:"22px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"14px"}}>
                <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>VENTAS ESTA SEMANA</div>
                <div style={{fontSize:"15px",fontWeight:700,color:"#49B8D3"}}>{fmt(totalSemana)}</div>
              </div>
              {porSucSemana.slice().sort((a,b)=>b.total-a.total).map(s=>{const pct=maxVSem>0?s.total/maxVSem:0;const isOpen=expandedSucSem===s.nombre;const maxDiaSuc=Math.max(...s.dias.map(d=>d.total),1);return(
                <div key={s.nombre} style={{marginBottom:"10px"}}>
                  <div onClick={()=>setExpandedSucSem(isOpen?null:s.nombre)} style={{display:"grid",gridTemplateColumns:"auto 1fr 90px",gap:"8px",alignItems:"center",marginBottom:"5px",padding:"7px 10px",borderRadius:"8px",background:isOpen?"rgba(39,33,232,0.12)":"transparent",border:`1px solid ${isOpen?"rgba(39,33,232,0.3)":"transparent"}`,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"7px",height:"7px",borderRadius:"2px",background:COLORES[s.nombre],flexShrink:0}}/><span style={{fontSize:"13px",fontWeight:600,color:isOpen?"#fff":"rgba(255,255,255,0.8)"}}>{s.nombre}</span><span style={{fontSize:"9px",color:"rgba(255,255,255,0.2)"}}>{isOpen?"▲":"▼"}</span></div>
                    <div style={{height:"4px",background:"rgba(255,255,255,0.06)",borderRadius:"2px"}}><div style={{width:`${pct*100}%`,height:"100%",background:COLORES[s.nombre],borderRadius:"2px",transition:"width 0.3s"}}/></div>
                    <div style={{fontSize:"13px",fontWeight:700,color:COLORES[s.nombre],textAlign:"right"}}>{s.total>0?fmt(s.total):"—"}</div>
                  </div>
                  {isOpen&&s.dias.map(d=>{const esHoy=d.fecha===hoy();const pctD=maxDiaSuc>0?d.total/maxDiaSuc:0;const dow=new Date(d.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short"});const dayNum=d.fecha.slice(8);return(
                    <div key={d.fecha} style={{display:"grid",gridTemplateColumns:"52px 1fr 80px 22px",gap:"6px",alignItems:"center",marginBottom:"4px",padding:"6px 10px 6px 22px",borderRadius:"6px",background:esHoy?"rgba(39,33,232,0.08)":"rgba(255,255,255,0.02)"}}>
                      <div style={{fontSize:"11px",fontWeight:esHoy?700:400,color:esHoy?"#fff":"rgba(255,255,255,0.4)",textTransform:"capitalize"}}>{dow} {dayNum}</div>
                      <div style={{height:"3px",background:"rgba(255,255,255,0.05)",borderRadius:"2px"}}><div style={{width:`${pctD*100}%`,height:"100%",background:esHoy?COLORES[s.nombre]:`${COLORES[s.nombre]}66`,borderRadius:"2px",transition:"width 0.3s"}}/></div>
                      <div style={{fontSize:"12px",fontWeight:esHoy?700:400,color:esHoy?COLORES[s.nombre]:"rgba(255,255,255,0.45)",textAlign:"right"}}>{d.total>0?fmt(d.total):"—"}</div>
                      <div style={{fontSize:"10px",color:"rgba(255,255,255,0.2)",textAlign:"right"}}>{d.count>0?d.count:""}</div>
                    </div>);})}
                </div>);})}
            </div>
            {/* Por sucursal */}
            <div className="glass" style={{padding:"22px"}}>
              <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"14px"}}>POR SUCURSAL · {periodoLabel.toUpperCase()}</div>
              {porSuc.slice().sort((a,b)=>b.ventas-a.ventas).map(s=>(
                <div key={s.nombre} style={{marginBottom:"12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s.nombre],flexShrink:0}}/><span style={{fontSize:"13px",fontWeight:600}}>{s.nombre}</span></div>
                    <div style={{display:"flex",gap:"12px",alignItems:"baseline"}}>
                      <span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}><span style={{color:"#10b981"}}>{s.nuevas}</span> nv · <span style={{color:"#49B8D3"}}>{s.recompras}</span> rc</span>
                      <span style={{fontSize:"14px",fontWeight:700,color:COLORES[s.nombre]}}>{fmt(s.ventas)}</span>
                    </div>
                  </div>
                  <div style={{height:"4px",background:"rgba(255,255,255,0.06)",borderRadius:"2px"}}><div style={{width:`${maxV>0?(s.ventas/maxV)*100:0}%`,height:"100%",background:COLORES[s.nombre],borderRadius:"2px"}}/></div>
                </div>))}
              <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:"10px",display:"flex",justifyContent:"space-between",fontSize:"12px"}}>
                <span style={{color:"rgba(255,255,255,0.35)"}}>Total {periodoLabel}</span>
                <span style={{fontWeight:700,color:"#49B8D3"}}>{fmt(ventasTotal)}</span>
              </div>
            </div>
          </div>

          {/* ── Métodos de pago + Top servicios ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>
            {/* Métodos de pago */}
            <div className="glass" style={{padding:"22px"}}>
              <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"14px"}}>MÉTODOS DE PAGO · {periodoLabel.toUpperCase()}</div>
              {topMet.length===0&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.2)",textAlign:"center",padding:"16px"}}>Sin datos</div>}
              {topMet.map(([m,v])=>(
                <div key={m} style={{marginBottom:"10px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"4px"}}>
                    <span style={{fontSize:"13px",fontWeight:500}}>{m}</span>
                    <div style={{display:"flex",gap:"10px",alignItems:"baseline"}}>
                      <span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>{ventasTotal>0?Math.round(v/ventasTotal*100):0}%</span>
                      <span style={{fontSize:"14px",fontWeight:700,color:"#49B8D3"}}>{fmt(v)}</span>
                    </div>
                  </div>
                  <div style={{height:"4px",background:"rgba(255,255,255,0.06)",borderRadius:"2px"}}><div style={{width:`${(v/maxMet)*100}%`,height:"100%",background:"linear-gradient(90deg,#2721E8,#49B8D3)",borderRadius:"2px"}}/></div>
                </div>))}
            </div>
            {/* Top servicios */}
            <div className="glass" style={{padding:"22px"}}>
              <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"14px"}}>TOP SERVICIOS · {periodoLabel.toUpperCase()}</div>
              {topS.length===0&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.2)",textAlign:"center",padding:"16px"}}>Sin datos</div>}
              {topS.map(([svc,cnt],i)=>(
                <div key={svc} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.2)",width:"16px",flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"12px",fontWeight:500,marginBottom:"3px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{svc}</div>
                    <div style={{height:"3px",background:"rgba(255,255,255,0.06)",borderRadius:"2px"}}><div style={{width:`${(cnt/maxSvc)*100}%`,height:"100%",background:"#2721E8",borderRadius:"2px"}}/></div>
                  </div>
                  <div style={{fontSize:"14px",fontWeight:700,color:"rgba(255,255,255,0.7)",flexShrink:0}}>{cnt}</div>
                </div>))}
            </div>
          </div>

          {/* Gráfica mensajes recibidos por día */}
          {metaDiarioF.length>0&&(()=>{
            const filtrado=msgSucFiltro==="Todas"?metaDiarioF:metaDiarioF.filter(d=>d.sucursal===msgSucFiltro);
            const porFecha={};filtrado.forEach(d=>{porFecha[d.fecha]=(porFecha[d.fecha]||0)+d.mensajes;});
            const dias=Object.entries(porFecha).sort((a,b)=>a[0].localeCompare(b[0]));
            const maxMsg=Math.max(...dias.map(d=>d[1]),1);
            const totalMsgFilt=dias.reduce((s,d)=>s+d[1],0);
            return<div className="glass" style={{padding:"24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
                <div>
                  <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>MENSAJES RECIBIDOS POR DÍA</div>
                  <div style={{fontSize:"20px",fontWeight:700,color:"#a855f7",marginTop:"4px"}}>{fmtN(totalMsgFilt)} <span style={{fontSize:"12px",fontWeight:400,color:"rgba(255,255,255,0.3)"}}>mensajes · {msgSucFiltro==="Todas"?"todas las sucursales":msgSucFiltro}</span></div>
                </div>
                <select value={msgSucFiltro} onChange={e=>setMsgSucFiltro(e.target.value)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",padding:"8px 32px 8px 12px",color:"#fff",fontSize:"12px",fontFamily:"'Albert Sans',sans-serif",outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"}}>
                  <option value="Todas" style={{background:"#22264A"}}>Todas las sucursales</option>
                  {sucNames.map(s=><option key={s} value={s} style={{background:"#22264A"}}>{s}</option>)}
                </select>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"160px"}}>
                {dias.map(([f,m])=>{const p=m/maxMsg;return<div key={f} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{fontSize:"9px",fontWeight:600,color:"#a855f7",marginBottom:"4px"}}>{m}</div>
                  <div style={{width:"100%",maxWidth:"32px",height:`${Math.max(p*100,4)}%`,background:"linear-gradient(180deg,#a855f7,#7c3aed)",borderRadius:"4px 4px 0 0",transition:"height 0.3s"}}/>
                  <div style={{fontSize:"8px",color:"rgba(255,255,255,0.2)",marginTop:"4px"}}>{new Date(f+"T12:00:00").toLocaleDateString("es-MX",{weekday:"narrow",day:"numeric"})}</div>
                </div>;})}
              </div>
              {msgSucFiltro==="Todas"&&<div style={{display:"flex",gap:"12px",marginTop:"12px",justifyContent:"center",flexWrap:"wrap"}}>
                {sucNames.map(s=>{const t=metaDiarioF.filter(d=>d.sucursal===s).reduce((a,d)=>a+d.mensajes,0);return t>0?<div key={s} style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"10px",color:"rgba(255,255,255,0.4)",cursor:"pointer"}} onClick={()=>setMsgSucFiltro(s)}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s]}}/>{s}: {t}</div>:null;})}
              </div>}
            </div>;
          })()}
        </div>}

        {/* ═══ SUCURSALES — tabla expandida ═══ */}
        {tab==="sucursales"&&<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
          <div className="glass" style={{overflow:"hidden"}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>RENDIMIENTO POR SUCURSAL · {periodoLabel}</div></div>
            <div style={{overflowX:"auto"}}>
              <div style={{display:"grid",gridTemplateColumns:"32px 100px 1fr 80px 80px 80px 80px 80px 80px 90px 80px",padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",minWidth:"950px"}}>
                {["#","Sucursal","Ventas","Nuevas","Recomp.","Sesiones","Msgs","Inversión","CPA","ROAS","Conv%"].map(h=><div key={h} style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}
              </div>
              {porSuc.sort((a,b)=>b.ventas-a.ventas).map((s,i)=><div key={s.nombre} style={{display:"grid",gridTemplateColumns:"32px 100px 1fr 80px 80px 80px 80px 80px 80px 90px 80px",padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",alignItems:"center",minWidth:"950px"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontSize:"14px",fontWeight:700,color:COLORES[s.nombre]}}>{i+1}</div>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s.nombre]}}/><span style={{fontSize:"13px",fontWeight:600}}>{s.nombre}</span></div>
                <div style={{paddingRight:"12px"}}><div style={{height:"6px",background:"rgba(255,255,255,0.04)",borderRadius:"3px"}}><div style={{width:`${(s.ventas/maxV)*100}%`,height:"100%",background:COLORES[s.nombre],borderRadius:"3px"}}/></div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"3px"}}>{fmt(s.ventas)}</div></div>
                <div style={{fontSize:"13px",fontWeight:600,color:"#10b981"}}>{s.nuevas}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:"#49B8D3"}}>{s.recompras}</div>
                <div style={{fontSize:"13px"}}><span style={{fontWeight:600}}>{s.sesComp}</span><span style={{color:"rgba(255,255,255,0.3)",fontSize:"10px"}}> +{s.sesAg}</span></div>
                <div style={{fontSize:"13px",fontWeight:600,color:"#a855f7"}}>{s.mensajes>0?fmtN(s.mensajes):"—"}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:"#f97316"}}>{s.spend>0?fmt(s.spend):"—"}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:s.cpa>0&&s.cpa<40?"#10b981":s.cpa<60?"#f0c040":"#ff6b6b"}}>{s.cpa>0?fmt(s.cpa):"—"}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:s.roas>=3?"#10b981":s.roas>=1?"#f0c040":"rgba(255,255,255,0.3)"}}>{s.roas>0?`${s.roas.toFixed(1)}x`:"—"}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:parseFloat(s.conv)>=10?"#10b981":parseFloat(s.conv)>0?"#f0c040":"rgba(255,255,255,0.3)"}}>{s.conv==="—"?"—":`${s.conv}%`}</div>
              </div>)}
            </div>
            <div style={{padding:"12px 20px",fontSize:"11px",color:"rgba(255,255,255,0.15)",borderTop:"1px solid rgba(255,255,255,0.04)"}}>CPA = inversión ÷ nuevas · ROAS = ventas ÷ inversión · Conv = nuevas ÷ mensajes</div>
          </div>
          {/* Cards resumen por sucursal */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"14px"}}>
            {porSuc.sort((a,b)=>b.ventas-a.ventas).map(s=><div key={s.nombre} className="glass" style={{padding:"18px",borderColor:`${COLORES[s.nombre]}33`}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s.nombre]}}/><span style={{fontSize:"14px",fontWeight:700}}>{s.nombre}</span></div>
              <div style={{fontSize:"22px",fontWeight:700,color:COLORES[s.nombre],marginBottom:"8px"}}>{fmt(s.ventas)}</div>
              <div style={{display:"flex",flexDirection:"column",gap:"4px",fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}><span>Nuevas</span><span style={{color:"#10b981",fontWeight:600}}>{s.nuevas}</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span>Recompras</span><span style={{color:"#49B8D3",fontWeight:600}}>{s.recompras}</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span>Sesiones</span><span style={{fontWeight:600}}>{s.sesComp}</span></div>
                {s.mensajes>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>Mensajes</span><span style={{color:"#a855f7",fontWeight:600}}>{s.mensajes}</span></div>}
                {s.cpa>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>CPA</span><span style={{color:s.cpa<40?"#10b981":"#f0c040",fontWeight:600}}>{fmt(s.cpa)}</span></div>}
              </div>
            </div>)}
          </div>
        </div>}

        {/* ═══ SERVICIOS ═══ */}
        {tab==="servicios"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>
          <div className="glass" style={{padding:"24px"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>TOP SERVICIOS</div>{topS.map(([svc,cnt],i)=><div key={svc} style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}><div style={{fontSize:"12px",fontWeight:700,color:"rgba(255,255,255,0.3)",width:"20px"}}>{i+1}</div><div style={{flex:1}}><div style={{fontSize:"12px",fontWeight:500,marginBottom:"4px"}}>{svc}</div><div style={{height:"4px",background:"rgba(255,255,255,0.04)",borderRadius:"2px"}}><div style={{width:`${(cnt/maxSvc)*100}%`,height:"100%",background:"#2721E8",borderRadius:"2px"}}/></div></div><div style={{fontSize:"13px",fontWeight:700}}>{cnt}</div></div>)}</div>
          <div className="glass" style={{padding:"24px"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>MÉTODOS DE PAGO</div>{topM.map(([m,v])=><div key={m} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}><div style={{fontSize:"13px",fontWeight:500}}>{m||"—"}</div><div style={{fontSize:"13px",fontWeight:700,color:"#49B8D3"}}>{fmt(v)}</div></div>)}</div>
        </div>}

        {/* ═══ META ADS ═══ */}
        {tab==="meta"&&<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
          {/* Barra de acciones */}
          <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
            {loadingMetaDisplay
              ?<div style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px",color:"rgba(255,255,255,0.4)",padding:"6px 12px",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",background:"rgba(255,255,255,0.03)"}}><div className="meta-spinner" style={{width:"14px",height:"14px",borderWidth:"2px"}}/> Sincronizando...</div>
              :<button className="btn-ghost" style={{fontSize:"11px",padding:"6px 12px"}} onClick={()=>isCustomPeriod?cargarMeta():cargarMetaMes(mesSel,true)} title="Sincronizar desde Meta API">↻ Sincronizar</button>}
            {metaDisplay&&!loadingMetaDisplay&&<button onClick={exportarReporteMeta} style={{fontSize:"11px",padding:"6px 14px",borderRadius:"8px",border:"1px solid rgba(168,85,247,0.4)",background:"rgba(168,85,247,0.1)",color:"#a855f7",cursor:"pointer",fontFamily:"'Albert Sans',sans-serif",fontWeight:600,display:"flex",alignItems:"center",gap:"6px"}} title="Exportar reporte PDF para cobro a sucursales">⬇ Exportar reporte</button>}
          </div>
          {/* Contenedor con overlay de carga */}
          <div style={{position:"relative"}}>
            {loadingMetaDisplay&&<div className="meta-loading-overlay">
              <div className="meta-spinner"/>
              <div style={{fontSize:"15px",fontWeight:600,color:"rgba(255,255,255,0.85)"}}>Cargando Meta Ads...</div>
              <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>Conectando con la API de Meta</div>
            </div>}
          {/* Datos del período seleccionado */}
          {metaDisplay&&!metaErrorDisplay&&(()=>{
            const[mY,mM]=mesSel.split("-").map(Number);
            const periodoDisp=isCustomPeriod?customLabel:new Date(mY,mM-1,1).toLocaleDateString("es-MX",{month:"long",year:"numeric"});
            const porSucMes=sucNames.map(n=>{const ms=metaDisplay.porSucursal?.[n]?.mensajes||0;const sp=metaDisplay.porSucursal?.[n]?.spend||0;return{nombre:n,mensajes:ms,spend:sp};});
            const maxMsMes=Math.max(...porSucMes.map(s=>s.mensajes),1);
            const invMes=filtro?filtro.reduce((s,n)=>s+(metaDisplay.porSucursal?.[n]?.spend||0),0):metaDisplay.spend;
            const msgsMes=filtro?filtro.reduce((s,n)=>s+(metaDisplay.porSucursal?.[n]?.mensajes||0),0):metaDisplay.mensajes;
            return<>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px"}}>
                {[{l:"INVERSIÓN",v:fmt(invMes),c:"#f97316"},{l:"MENSAJES",v:fmtN(msgsMes),c:"#a855f7"},{l:"IMPRESIONES",v:fmtN(metaDisplay.impresiones),c:"#49B8D3"},{l:"ALCANCE",v:fmtN(metaDisplay.alcance),c:"#49B8D3"}].map(k=><div key={k.l} className="kpi"><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>{k.l}</div><div style={{fontSize:"28px",fontWeight:700,color:k.c}}>{k.v}</div></div>)}
              </div>
              <div className="glass" style={{overflow:"hidden"}}>
                <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>MENSAJES E INVERSIÓN POR SUCURSAL · {periodoDisp.toUpperCase()}</div></div>
                <div style={{display:"grid",gridTemplateColumns:"32px 110px 1fr 100px",padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                  {["#","Sucursal","Mensajes","Inversión"].map(h=><div key={h} style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}
                </div>
                {porSucMes.sort((a,b)=>b.mensajes-a.mensajes).map((s,i)=><div key={s.nombre} style={{display:"grid",gridTemplateColumns:"32px 110px 1fr 100px",padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",alignItems:"center"}}>
                  <div style={{fontSize:"14px",fontWeight:700,color:COLORES[s.nombre]}}>{i+1}</div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s.nombre]}}/><span style={{fontSize:"13px",fontWeight:600}}>{s.nombre}</span></div>
                  <div style={{paddingRight:"12px"}}><div style={{height:"6px",background:"rgba(255,255,255,0.04)",borderRadius:"3px"}}><div style={{width:`${s.mensajes>0?(s.mensajes/maxMsMes)*100:0}%`,height:"100%",background:COLORES[s.nombre],borderRadius:"3px"}}/></div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"3px"}}>{fmtN(s.mensajes)} msgs</div></div>
                  <div style={{fontSize:"13px",fontWeight:600,color:"#f97316"}}>{s.spend>0?fmt(s.spend):"—"}</div>
                </div>)}
              </div>
              {/* Gráfica diaria */}
              {metaDiarioDisplay.length>0&&(()=>{
                const selSt2={background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",padding:"8px 32px 8px 12px",color:"#fff",fontSize:"12px",fontFamily:"'Albert Sans',sans-serif",outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"};
                const filtrado=msgSucFiltro==="Todas"?metaDiarioDisplay:metaDiarioDisplay.filter(d=>d.sucursal===msgSucFiltro);
                const porFecha={};filtrado.forEach(d=>{porFecha[d.fecha]=(porFecha[d.fecha]||0)+d.mensajes;});
                const dias=Object.entries(porFecha).sort((a,b)=>a[0].localeCompare(b[0]));
                const maxMsg=Math.max(...dias.map(d=>d[1]),1);
                const totalMsgFilt=dias.reduce((s,d)=>s+d[1],0);
                return<div className="glass" style={{padding:"24px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
                    <div><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>MENSAJES POR DÍA · {periodoDisp.toUpperCase()}</div><div style={{fontSize:"20px",fontWeight:700,color:"#a855f7",marginTop:"4px"}}>{fmtN(totalMsgFilt)} <span style={{fontSize:"12px",fontWeight:400,color:"rgba(255,255,255,0.3)"}}>msgs · {msgSucFiltro==="Todas"?"todas las sucursales":msgSucFiltro}</span></div></div>
                    <select value={msgSucFiltro} onChange={e=>setMsgSucFiltro(e.target.value)} style={selSt2}>
                      <option value="Todas" style={{background:"#22264A"}}>Todas las sucursales</option>
                      {sucNames.map(s=><option key={s} value={s} style={{background:"#22264A"}}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"120px"}}>
                    {dias.map(([f,m])=>{const p=m/maxMsg;return<div key={f} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                      <div style={{fontSize:"9px",fontWeight:600,color:"#a855f7",marginBottom:"4px"}}>{m}</div>
                      <div style={{width:"100%",maxWidth:"32px",height:`${Math.max(p*100,4)}%`,background:"linear-gradient(180deg,#a855f7,#7c3aed)",borderRadius:"4px 4px 0 0"}}/>
                      <div style={{fontSize:"8px",color:"rgba(255,255,255,0.2)",marginTop:"4px"}}>{new Date(f+"T12:00:00").getDate()}</div>
                    </div>;})}
                  </div>
                  {msgSucFiltro==="Todas"&&<div style={{display:"flex",gap:"12px",marginTop:"12px",justifyContent:"center",flexWrap:"wrap"}}>
                    {sucNames.map(s=>{const t=metaDiarioDisplay.filter(d=>d.sucursal===s).reduce((a,d)=>a+d.mensajes,0);return t>0?<div key={s} style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"10px",color:"rgba(255,255,255,0.4)",cursor:"pointer"}} onClick={()=>setMsgSucFiltro(s)}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s]}}/>{s}: {t}</div>:null;})}
                  </div>}
                </div>;
              })()}
              {/* Embudo */}
              {metaDisplay.mensajes>0&&<div className="glass" style={{padding:"24px"}}>
                <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"20px"}}>EMBUDO · {periodoDisp.toUpperCase()}</div>
                <div style={{display:"flex",alignItems:"stretch"}}>
                  {[{label:"Alcance",value:fmtN(metaDisplay.alcance),color:"#49B8D3"},{label:"Clics",value:fmtN(metaDisplay.clics),color:"#49B8D3",pct:metaDisplay.alcance>0?((metaDisplay.clics/metaDisplay.alcance)*100).toFixed(1):0},{label:"Mensajes",value:fmtN(metaDisplay.mensajes),color:"#a855f7",pct:metaDisplay.clics>0?((metaDisplay.mensajes/metaDisplay.clics)*100).toFixed(1):0}].map((e,i)=>
                    <div key={e.label} style={{flex:1,padding:"20px 16px",background:`${e.color}12`,border:`1px solid ${e.color}33`,borderLeft:i>0?"none":"",borderRadius:i===0?"12px 0 0 12px":"0 12px 12px 0",textAlign:"center"}}><div style={{fontSize:"24px",fontWeight:700,color:e.color}}>{e.value}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",margin:"4px 0"}}>{e.label}</div>{i>0&&<div style={{fontSize:"11px",color:e.color,fontWeight:600}}>{e.pct}% del anterior</div>}</div>)}
                </div>
              </div>}
            </>;
          })()}
          {/* Gráfica tendencia mensual */}
          <div className="glass" style={{padding:"24px"}}>
            {/* Header: título + toggle + dropdown */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"20px",gap:"12px",flexWrap:"wrap"}}>
              <div><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>TENDENCIA MENSUAL</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"4px"}}>Últimos 6 meses · clic en barra para ver detalle</div></div>
              <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                {/* Toggle */}
                <div style={{display:"flex",background:"rgba(255,255,255,0.05)",borderRadius:"8px",padding:"3px",border:"1px solid rgba(255,255,255,0.08)"}}>
                  {[{k:"inversion",l:"Inversión",c:"#f97316"},{k:"mensajes",l:"Mensajes",c:"#a855f7"}].map(o=><button key={o.k} onClick={()=>setMetaChartMetrica(o.k)} style={{padding:"6px 14px",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:600,fontFamily:"'Albert Sans',sans-serif",transition:"all 0.2s",background:metaChartMetrica===o.k?o.c:"transparent",color:metaChartMetrica===o.k?"#fff":"rgba(255,255,255,0.4)"}}>{o.l}</button>)}
                </div>
                {/* Dropdown sucursal */}
                <select value={metaHistSucFiltro} onChange={e=>setMetaHistSucFiltro(e.target.value)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",padding:"8px 32px 8px 12px",color:"#fff",fontSize:"12px",fontFamily:"'Albert Sans',sans-serif",outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"}}>
                  <option value="Todas" style={{background:"#22264A"}}>Todas las sucursales</option>
                  {sucNames.map(s=><option key={s} value={s} style={{background:"#22264A"}}>{s}</option>)}
                </select>
              </div>
            </div>
            {loadingHist?<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>Cargando historial...</div>:metaHistorial.length>0?(()=>{
              const isInv=metaChartMetrica==="inversion";
              const color=isInv?"#f97316":"#a855f7";
              const colorAlpha=isInv?"rgba(249,115,22,0.35)":"rgba(168,85,247,0.35)";
              const datos=metaHistorial.map(m=>{const v=metaHistSucFiltro==="Todas"?(isInv?m.spend:m.mensajes):(isInv?(m.porSucursal?.[metaHistSucFiltro]?.spend||0):(m.porSucursal?.[metaHistSucFiltro]?.mensajes||0));return{...m,val:v};});
              const rawMax=Math.max(...datos.map(d=>d.val),1);
              // Calcular "nice" max para el eje Y
              const exp=Math.floor(Math.log10(rawMax));const base=Math.pow(10,exp);const norm=rawMax/base;
              const niceMult=norm<=1?1:norm<=2?2:norm<=5?5:10;const niceMaxV=niceMult*base;
              const ticks=[0,niceMaxV*0.25,niceMaxV*0.5,niceMaxV*0.75,niceMaxV];
              const CHART_H=160;
              const fmtTick=v=>isInv?(v>=1000?`$${Math.round(v/1000)}k`:`$${Math.round(v)}`):`${fmtN(Math.round(v))}`;
              return<div style={{display:"flex",gap:"0"}}>
                {/* Eje Y */}
                <div style={{width:"52px",position:"relative",height:`${CHART_H+24}px`,flexShrink:0}}>
                  {ticks.map((t,i)=><div key={i} style={{position:"absolute",bottom:`${24+(t/niceMaxV)*CHART_H}px`,right:"8px",fontSize:"9px",color:"rgba(255,255,255,0.3)",whiteSpace:"nowrap",transform:"translateY(50%)",textAlign:"right"}}>{fmtTick(t)}</div>)}
                </div>
                {/* Área de barras */}
                <div style={{flex:1,position:"relative"}}>
                  {/* Grid lines */}
                  {ticks.map((t,i)=><div key={i} style={{position:"absolute",bottom:`${24+(t/niceMaxV)*CHART_H}px`,left:0,right:0,height:"1px",background:t===0?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.04)"}}/>)}
                  {/* Barras */}
                  <div style={{position:"absolute",bottom:"24px",left:0,right:0,height:`${CHART_H}px`,display:"flex",alignItems:"flex-end",gap:"8px"}}>
                    {datos.map(d=>{
                      const barH=Math.max((d.val/niceMaxV)*CHART_H,d.val>0?3:0);
                      const isSel=d.ym===mesSel;
                      return<div key={d.ym} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",cursor:"pointer"}} onClick={()=>setMesSel(d.ym)}>
                        {d.val>0&&<div style={{fontSize:"9px",color:isSel?color:"rgba(255,255,255,0.3)",marginBottom:"4px",fontWeight:isSel?700:400,transition:"all 0.2s"}}>{isInv?`$${Math.round(d.val/1000)}k`:fmtN(d.val)}</div>}
                        <div style={{width:"80%",height:`${barH}px`,background:isSel?color:colorAlpha,borderRadius:"4px 4px 0 0",transition:"all 0.25s",boxShadow:isSel?`0 0 12px ${color}66`:""}}/>
                      </div>;
                    })}
                  </div>
                  {/* Eje X */}
                  <div style={{position:"absolute",bottom:0,left:0,right:0,height:"20px",display:"flex",gap:"8px"}}>
                    {datos.map(d=><div key={d.ym} style={{flex:1,textAlign:"center",fontSize:"10px",color:d.ym===mesSel?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.3)",fontWeight:d.ym===mesSel?700:400,transition:"all 0.2s"}}>{d.label}</div>)}
                  </div>
                </div>
              </div>;
            })():null}
          </div>{/* /glass tendencia */}
          {!loadingMetaDisplay&&!metaDisplay&&!metaErrorDisplay&&<div style={{textAlign:"center",padding:"60px 32px",color:"rgba(255,255,255,0.25)",fontSize:"13px"}}>Sin datos para este período</div>}
          {!loadingMetaDisplay&&metaErrorDisplay&&<div style={{textAlign:"center",padding:"32px",color:"#ff6b6b",background:"rgba(255,80,80,0.05)",borderRadius:"12px",border:"1px solid rgba(255,80,80,0.2)"}}><div style={{fontSize:"16px",marginBottom:"8px"}}>⚠️ {metaErrorDisplay}</div></div>}
          </div>{/* /loading wrapper */}
        </div>}

        {/* ═══ VER POS ═══ */}
        {tab==="pos"&&<div style={{display:"flex",flexDirection:"column",gap:"16px"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>SELECCIONA SUCURSAL</div><div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"14px"}}>{USUARIOS_DASH.map(s=><div key={s.id} className="glass" style={{padding:"24px 20px",cursor:"pointer",borderColor:`${s.color}44`,textAlign:"center"}} onClick={()=>setPosSuc(s)} onMouseEnter={e=>e.currentTarget.style.borderColor=s.color} onMouseLeave={e=>e.currentTarget.style.borderColor=`${s.color}44`}><div style={{width:"40px",height:"40px",borderRadius:"12px",background:`${s.color}22`,border:`1px solid ${s.color}44`,margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>🖥</div><div style={{fontSize:"15px",fontWeight:700,marginBottom:"4px"}}>{s.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Ver POS →</div></div>)}</div></div>}

        {/* ═══ FINANZAS ═══ */}
        {tab==="finanzas"&&<EstadoFinanciero sucursalesFiltro={sucursalesFiltro} sucursalesPropias={sucursalesPropias} esAdmin={!sucursalesFiltro&&!sucursalesPropias}/>}

        {/* ═══ IMPORTAR ═══ */}
        {tab==="importar"&&<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
          {/* Header + controles */}
          <div className="glass" style={{padding:"20px 24px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"20px"}}>
              <div style={{fontSize:"22px"}}>📥</div>
              <div><div style={{fontSize:"16px",fontWeight:700}}>Importar datos a sucursal</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)"}}>Previsualiza y revisa los datos antes de importarlos</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"16px",alignItems:"end"}}>
              {/* Sucursal */}
              <div>
                <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>SUCURSAL</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                  {USUARIOS.filter(u=>u.rol==="sucursal").map(s=><button key={s.id} onClick={()=>setImportSuc(s)} style={{padding:"7px 14px",borderRadius:"8px",border:"1px solid",fontSize:"12px",fontWeight:600,cursor:"pointer",background:importSuc?.id===s.id?`${s.color}22`:"transparent",borderColor:importSuc?.id===s.id?s.color:"rgba(255,255,255,0.1)",color:importSuc?.id===s.id?s.color:"rgba(255,255,255,0.4)"}}>{s.nombre}</button>)}
                </div>
              </div>
              {/* Tipo */}
              <div>
                <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>TIPO DE ARCHIVO</div>
                <div style={{display:"flex",gap:"6px"}}>
                  {[{v:"combinado",l:"🔗 ICS + Ventas"},{v:"ics",l:"📅 Solo Calendario"},{v:"csv",l:"📊 Solo Ventas CSV"}].map(t=><button key={t.v} onClick={()=>setImportType(t.v)} style={{padding:"8px 16px",borderRadius:"8px",border:"1px solid",fontSize:"12px",fontWeight:600,cursor:"pointer",background:importType===t.v?"rgba(39,33,232,0.15)":"transparent",borderColor:importType===t.v?"#2721E8":"rgba(255,255,255,0.1)",color:importType===t.v?"#fff":"rgba(255,255,255,0.4)"}}>{t.l}</button>)}
                </div>
              </div>
              {/* Zona horaria (solo para ICS o combinado) */}
              {(importType==="ics"||importType==="combinado")&&<div>
                <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"6px"}}>ZONA HORARIA</div>
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                  <button onClick={()=>setImportDST(true)} style={{padding:"8px 12px",borderRadius:"8px",border:"1px solid",fontSize:"11px",cursor:"pointer",background:importDST?"rgba(73,184,211,0.1)":"transparent",borderColor:importDST?"#49B8D3":"rgba(255,255,255,0.1)",color:importDST?"#49B8D3":"rgba(255,255,255,0.4)"}}>CDT/CST (Polanco, Coapa)</button>
                  <button onClick={()=>setImportDST(false)} style={{padding:"8px 12px",borderRadius:"8px",border:"1px solid",fontSize:"11px",cursor:"pointer",background:!importDST?"rgba(73,184,211,0.1)":"transparent",borderColor:!importDST?"#49B8D3":"rgba(255,255,255,0.1)",color:!importDST?"#49B8D3":"rgba(255,255,255,0.4)"}}>CST fijo (Metepec, Oriente, Valle)</button>
                </div>
              </div>}
            </div>
          </div>
          {/* Componente de importación */}
          {importSuc&&<div className="glass" style={{padding:"0",overflow:"hidden"}}>
            {importType==="combinado"
              ?<CombinedImport key={`${importSuc.id}-combined`} session={importSuc} useDST={importDST}/>
              :importType==="ics"
              ?<GCalImport key={`${importSuc.id}-ics`} session={importSuc} useDST={importDST}/>
              :<CSVImport key={`${importSuc.id}-csv`} session={importSuc}/>}
          </div>}
          {!importSuc&&<div style={{textAlign:"center",padding:"60px",color:"rgba(255,255,255,0.25)",fontSize:"13px"}}>Selecciona una sucursal para comenzar</div>}
        </div>}

        {/* ═══ ANALÍTICA ═══ */}
        {tab==="analitica"&&<Analitica/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const hashPassword=async(pass)=>{
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("CIRE_2026:"+pass));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
};
const randomCode=()=>{
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
};

// ══════════════════════════════════════════════════════════════════════════════
// PRIMER LOGIN — cambiar contraseña + correo de recuperación
// ══════════════════════════════════════════════════════════════════════════════
function FirstLoginScreen({session,onComplete}){
  useCSSInjection();
  const[np,setNp]=useState("");const[nc,setNc]=useState("");const[email,setEmail]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  async function save(){
    if(np.length<8){setErr("Mínimo 8 caracteres");return;}
    if(np!==nc){setErr("Las contraseñas no coinciden");return;}
    if(!email.includes("@")){setErr("Ingresa un correo válido");return;}
    setLoading(true);setErr("");
    const hash=await hashPassword(np);
    const{error}=await supabase.from("system_users").update({password_hash:hash,email:email.trim().toLowerCase(),must_change_password:false}).eq("username",session.usuario);
    if(error){setErr("Error al guardar. Intenta de nuevo.");setLoading(false);return;}
    setLoading(false);onComplete();
  }
  return(
    <div style={{minHeight:"100vh",background:"#22264A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Albert Sans',sans-serif",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",width:500,height:500,borderRadius:"50%",background:"#2721E8",opacity:0.08,filter:"blur(100px)",top:"-150px",left:"-150px",pointerEvents:"none"}}/>
      <div className="glass" style={{width:440,padding:"48px 44px",position:"relative"}}>
        <div style={{textAlign:"center",marginBottom:"28px"}}>
          <div style={{fontSize:"10px",letterSpacing:"5px",color:"#49B8D3",marginBottom:"8px",fontWeight:500}}>BIENVENIDA</div>
          <div style={{fontSize:"22px",fontWeight:700,color:"#fff",marginBottom:"6px"}}>Configura tu acceso</div>
          <div style={{fontSize:"13px",color:"rgba(255,255,255,0.35)"}}>Establece tu contraseña y correo de recuperación</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"20px"}}>
          <div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>NUEVA CONTRASEÑA</div>
            <input className="inp" type="password" placeholder="Mínimo 8 caracteres" value={np} onChange={e=>setNp(e.target.value)} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
          </div>
          <div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>CONFIRMAR CONTRASEÑA</div>
            <input className="inp" type="password" placeholder="Repite la contraseña" value={nc} onChange={e=>setNc(e.target.value)} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
          </div>
          <div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>CORREO DE RECUPERACIÓN</div>
            <input className="inp" type="email" placeholder="tu@correo.com" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)",marginTop:"5px"}}>Lo usarás si olvidas tu contraseña</div>
          </div>
          {err&&<div style={{color:"#ff6b6b",fontSize:"13px",textAlign:"center"}}>{err}</div>}
        </div>
        <button className="btn-blue" style={{width:"100%",padding:"14px",fontSize:"15px",borderRadius:"12px"}} onClick={save} disabled={loading}>{loading?"Guardando...":"Guardar y entrar →"}</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OLVIDÉ CONTRASEÑA
// ══════════════════════════════════════════════════════════════════════════════
function ForgotPasswordScreen({onBack}){
  useCSSInjection();
  const[step,setStep]=useState(1);
  const[username,setUsername]=useState("");const[email,setEmail]=useState("");
  const[code,setCode]=useState("");const[np,setNp]=useState("");const[nc,setNc]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const[generatedCode,setGeneratedCode]=useState("");const[done,setDone]=useState(false);

  async function requestReset(){
    if(!username.trim()||!email.trim()){setErr("Completa todos los campos");return;}
    setLoading(true);setErr("");
    const{data}=await supabase.from("system_users").select("id").eq("username",username.trim()).eq("email",email.trim().toLowerCase()).maybeSingle();
    if(!data){setErr("No encontramos una cuenta con esos datos");setLoading(false);return;}
    const rc=randomCode();
    const expires=new Date(Date.now()+30*60*1000).toISOString();
    await supabase.from("system_users").update({reset_code:rc,reset_expires:expires}).eq("username",username.trim());
    setGeneratedCode(rc);setStep(2);setLoading(false);
  }
  async function confirmReset(){
    if(!code.trim()||!np||!nc){setErr("Completa todos los campos");return;}
    if(np!==nc){setErr("Las contraseñas no coinciden");return;}
    if(np.length<8){setErr("Mínimo 8 caracteres");return;}
    setLoading(true);setErr("");
    const{data}=await supabase.from("system_users").select("reset_expires").eq("username",username.trim()).eq("reset_code",code.trim().toUpperCase()).maybeSingle();
    if(!data||new Date(data.reset_expires)<new Date()){setErr("Código inválido o expirado");setLoading(false);return;}
    const hash=await hashPassword(np);
    await supabase.from("system_users").update({password_hash:hash,reset_code:null,reset_expires:null}).eq("username",username.trim());
    setDone(true);setLoading(false);
  }
  if(done)return(
    <div style={{minHeight:"100vh",background:"#22264A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Albert Sans',sans-serif"}}>
      <div className="glass" style={{width:420,padding:"48px 44px",textAlign:"center"}}>
        <div style={{fontSize:"48px",marginBottom:"16px"}}>✓</div>
        <div style={{fontSize:"20px",fontWeight:700,marginBottom:"8px"}}>¡Contraseña actualizada!</div>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginBottom:"28px"}}>Ya puedes iniciar sesión con tu nueva contraseña</div>
        <button className="btn-blue" style={{padding:"12px 32px",borderRadius:"12px"}} onClick={onBack}>Ir al inicio →</button>
      </div>
    </div>
  );
  return(
    <div style={{minHeight:"100vh",background:"#22264A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Albert Sans',sans-serif",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",width:500,height:500,borderRadius:"50%",background:"#2721E8",opacity:0.08,filter:"blur(100px)",top:"-150px",left:"-150px",pointerEvents:"none"}}/>
      <div className="glass" style={{width:440,padding:"48px 44px",position:"relative"}}>
        <button className="btn-ghost" style={{fontSize:"11px",marginBottom:"24px"}} onClick={onBack}>← Volver al inicio</button>
        <div style={{marginBottom:"28px"}}>
          <div style={{fontSize:"10px",letterSpacing:"5px",color:"#49B8D3",marginBottom:"8px",fontWeight:500}}>RECUPERAR ACCESO</div>
          <div style={{fontSize:"20px",fontWeight:700,color:"#fff",marginBottom:"4px"}}>{step===1?"Verificar identidad":"Código de recuperación"}</div>
          <div style={{fontSize:"13px",color:"rgba(255,255,255,0.35)"}}>{step===1?"Ingresa tu usuario y correo registrado":"Ingresa el código que aparece abajo y tu nueva contraseña"}</div>
        </div>
        {step===1&&<div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"20px"}}>
          <input className="inp" placeholder="Usuario" value={username} onChange={e=>setUsername(e.target.value)} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
          <input className="inp" type="email" placeholder="Correo registrado" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&requestReset()} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
          {err&&<div style={{color:"#ff6b6b",fontSize:"13px",textAlign:"center"}}>{err}</div>}
          <button className="btn-blue" style={{width:"100%",padding:"14px",fontSize:"15px",borderRadius:"12px"}} onClick={requestReset} disabled={loading}>{loading?"Verificando...":"Continuar →"}</button>
        </div>}
        {step===2&&<div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"20px"}}>
          <div style={{background:"rgba(39,33,232,0.12)",border:"1px solid rgba(39,33,232,0.4)",borderRadius:"12px",padding:"20px",textAlign:"center",marginBottom:"4px"}}>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)",letterSpacing:"2px",marginBottom:"8px"}}>TU CÓDIGO DE RECUPERACIÓN</div>
            <div style={{fontSize:"32px",fontWeight:700,letterSpacing:"6px",color:"#49B8D3",fontFamily:"monospace"}}>{generatedCode}</div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"8px"}}>Válido por 30 minutos · cópialo antes de continuar</div>
          </div>
          <input className="inp" placeholder="Pega el código aquí" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px",letterSpacing:"3px",textAlign:"center"}}/>
          <input className="inp" type="password" placeholder="Nueva contraseña (mín. 8 caracteres)" value={np} onChange={e=>setNp(e.target.value)} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
          <input className="inp" type="password" placeholder="Confirmar contraseña" value={nc} onChange={e=>setNc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&confirmReset()} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
          {err&&<div style={{color:"#ff6b6b",fontSize:"13px",textAlign:"center"}}>{err}</div>}
          <button className="btn-blue" style={{width:"100%",padding:"14px",fontSize:"15px",borderRadius:"12px"}} onClick={confirmReset} disabled={loading}>{loading?"Actualizando...":"Cambiar contraseña →"}</button>
        </div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ASISTENTE VIRTUAL — MAYA
// ══════════════════════════════════════════════════════════════════════════════
// SETUP EMAIL (una sola vez):
//   1. Crea cuenta gratis en emailjs.com
//   2. Conecta tu correo (Gmail/Outlook)
//   3. Crea una plantilla con variables: {{tipo}}, {{sucursal}}, {{fecha}}, {{descripcion}}, {{conversacion}}
//   4. Agrega en .env.local:
//      VITE_EMAILJS_SERVICE=service_xxxxx
//      VITE_EMAILJS_TEMPLATE=template_xxxxx
//      VITE_EMAILJS_PUBLIC_KEY=tu_public_key
//      VITE_SOPORTE_EMAIL=tu_correo@ejemplo.com
//
// TABLA SUPABASE (ejecutar en SQL Editor):
//   CREATE TABLE tickets_soporte (
//     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     tipo TEXT NOT NULL,
//     descripcion TEXT,
//     conversacion JSONB,
//     usuario_nombre TEXT,
//     usuario_rol TEXT,
//     estado TEXT DEFAULT 'abierto',
//     creado_en TIMESTAMPTZ DEFAULT NOW()
//   );

const PROMPT_SOPORTE = `Eres Maya, asistente de soporte de CIRE Sistema, una plataforma de gestión para centros de depilación láser en México.

Ayudas a las dueñas y empleadas de sucursales. Son personas con poca experiencia con tecnología, así que:
- Explica todo de forma muy clara, amable y sencilla
- Usa pasos numerados (1, 2, 3...) cuando expliques algo
- Nunca uses términos técnicos sin explicarlos
- Usa emojis ocasionalmente para ser más amigable
- Si hay una imagen/captura adjunta, analízala para entender mejor

Responde siempre en español. Al final de cada respuesta pregunta si quedó claro o si necesitan más ayuda.`;

const PROMPT_SUGERENCIA = `Eres Maya, asistente de CIRE Sistema. Tu misión es recopilar sugerencias de mejora de la plataforma durante el período de pruebas con usuarios reales.

- Agradece calurosamente cada sugerencia
- Haz 1-2 preguntas para entender mejor qué necesitan y por qué
- Sé muy entusiasta: cada sugerencia es valiosa y será revisada por el equipo
- Confirma los detalles al final para asegurarte de haberlo entendido bien
- Responde siempre en español`;

function AsistenteVirtual({ session }) {
  const [open, setOpen]           = useState(false);
  const [modo, setModo]           = useState(null); // 'soporte' | 'sugerencia'
  const [mensajes, setMensajes]   = useState([]);
  const [input, setInput]         = useState("");
  const [cargando, setCargando]   = useState(false);
  const [imagen, setImagen]       = useState(null); // { base64, mimeType, url, name }
  const [enviando, setEnviando]   = useState(false);
  const [exito, setExito]         = useState(false);
  const chatRef  = useRef(null);
  const fileRef  = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes, cargando]);

  function resetear() {
    setModo(null); setMensajes([]); setInput(""); setImagen(null);
    setEnviando(false); setExito(false);
  }

  function iniciarModo(m) {
    const saludo = m === "soporte"
      ? `¡Hola, ${session.nombre}! 😊 Cuéntame, ¿qué está pasando? Describe lo que ves o lo que no te funciona. También puedes adjuntar una captura de pantalla con el clip 📎`
      : `¡Qué bueno que me escribes, ${session.nombre}! 🌟 Me encantaría escuchar tu idea. ¿Qué te gustaría que cambiáramos o mejoráramos en la plataforma?`;
    setModo(m);
    setMensajes([{ role: "assistant", content: saludo }]);
  }

  function procesarImagen(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const full = e.target.result;
      const base64 = full.split(",")[1];
      setImagen({ base64, mimeType: file.type, url: full, name: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto && !imagen) return;
    if (cargando) return;

    const imgActual = imagen;
    const nuevos = [...mensajes, { role: "user", content: texto, imagen: imgActual }];
    setMensajes(nuevos);
    setInput(""); setImagen(null);
    setCargando(true);

    try {
      const apiMessages = nuevos.map(m => {
        if (m.imagen) {
          return {
            role: m.role,
            content: [
              { type: "image", source: { type: "base64", media_type: m.imagen.mimeType, data: m.imagen.base64 } },
              { type: "text", text: m.content || "¿Puedes ver lo que está pasando en esta imagen?" }
            ]
          };
        }
        return { role: m.role, content: m.content };
      });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          system: modo === "soporte" ? PROMPT_SOPORTE : PROMPT_SUGERENCIA,
          messages: apiMessages
        })
      });
      const data = await res.json();
      const resp = data.content?.[0]?.text || "No pude obtener respuesta. Por favor intenta de nuevo. 😅";
      setMensajes([...nuevos, { role: "assistant", content: resp }]);
    } catch {
      setMensajes([...nuevos, { role: "assistant", content: "Ups, hubo un problema de conexión 😅 Intenta de nuevo en un momento." }]);
    }
    setCargando(false);
  }

  async function crearTicket() {
    setEnviando(true);
    const primerMensaje = mensajes.find(m => m.role === "user")?.content || "";
    const conversacionTexto = mensajes
      .map(m => `${m.role === "user" ? session.nombre : "Maya"}: ${m.content || (m.imagen ? "[imagen adjunta]" : "")}`)
      .join("\n\n");
    // Guardar en Supabase (sin base64 para no saturar la DB)
    const msgsLimpios = mensajes.map(m => ({ ...m, imagen: m.imagen ? { name: m.imagen.name } : null }));
    try {
      await supabase.from("tickets_soporte").insert([{
        tipo: modo,
        descripcion: primerMensaje,
        conversacion: msgsLimpios,
        usuario_nombre: session.nombre,
        usuario_rol: session.rol,
        estado: "abierto"
      }]);
    } catch { /* silencioso */ }

    // Enviar correo vía Edge Function (Gmail)
    try {
      await supabase.functions.invoke("enviar-ticket", {
        body: {
          tipo: modo,
          sucursal: session.nombre,
          fecha: new Date().toLocaleDateString("es-MX", { dateStyle: "full" }),
          descripcion: primerMensaje,
          conversacion: conversacionTexto
        }
      });
    } catch { /* silencioso */ }

    setEnviando(false);
    setExito(true);
  }

  const hayMensajesUsuario = mensajes.some(m => m.role === "user");
  const btnPanelStyle = {
    position: "fixed", bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: "50%",
    background: "linear-gradient(135deg, #2721E8, #49B8D3)",
    border: "none", cursor: "pointer", zIndex: 400,
    boxShadow: "0 8px 32px rgba(39,33,232,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, transition: "transform 0.2s, box-shadow 0.2s",
    color: "#fff", fontFamily: "'Albert Sans',sans-serif"
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(o => !o)}
        style={btnPanelStyle}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(39,33,232,0.7)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(39,33,232,0.5)"; }}
        title={open ? "Cerrar asistente" : "¿Necesitas ayuda?"}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Panel de chat */}
      {open && (
        <div style={{
          position: "fixed", bottom: 90, right: 24,
          width: 370, height: 580,
          background: "#1a1d40",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          boxShadow: "0 28px 80px rgba(0,0,0,0.65)",
          display: "flex", flexDirection: "column",
          zIndex: 399, overflow: "hidden",
          animation: "fadeIn 0.2s ease",
          fontFamily: "'Albert Sans',sans-serif"
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #2721E8 0%, #49B8D3 100%)",
            padding: "14px 18px",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0
          }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🤖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Maya — Asistente CIRE</div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>
                {modo === "soporte" ? "Soporte técnico 🔧" : modo === "sugerencia" ? "Sugerencias 💡" : "Siempre aquí para ayudarte ✨"}
              </div>
            </div>
            {modo && !exito && (
              <button onClick={resetear} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontFamily: "'Albert Sans',sans-serif" }}>← Menú</button>
            )}
          </div>

          {/* Selección de modo */}
          {!modo && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", gap: 14 }}>
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>¡Hola, {session.nombre}! 👋</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 4 }}>¿En qué te puedo ayudar hoy?</div>
              </div>
              {[
                { m: "soporte",    ico: "🔧", titulo: "Tengo un problema",    sub: "Algo no funciona como espero",          bg: "rgba(39,33,232,0.18)", brd: "rgba(39,33,232,0.4)" },
                { m: "sugerencia", ico: "💡", titulo: "Tengo una sugerencia", sub: "Quiero proponer una mejora al sistema",   bg: "rgba(73,184,211,0.12)", brd: "rgba(73,184,211,0.35)" }
              ].map(op => (
                <button key={op.m} onClick={() => iniciarModo(op.m)} style={{
                  width: "100%", padding: "15px 16px",
                  background: op.bg, border: `1px solid ${op.brd}`,
                  borderRadius: 14, color: "#fff", cursor: "pointer",
                  textAlign: "left", display: "flex", alignItems: "center", gap: 14,
                  fontFamily: "'Albert Sans',sans-serif", transition: "opacity 0.15s"
                }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{op.ico}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{op.titulo}</div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>{op.sub}</div>
                  </div>
                </button>
              ))}
              <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, marginTop: 8, textAlign: "center" }}>Plataforma en período de pruebas — Tu opinión importa 💙</div>
            </div>
          )}

          {/* Éxito */}
          {exito && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center", gap: 14 }}>
              <div style={{ fontSize: 52 }}>✅</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
                {modo === "soporte" ? "¡Ticket de soporte enviado!" : "¡Sugerencia registrada!"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.65 }}>
                {modo === "soporte"
                  ? "El equipo de soporte recibió tu caso y te contactará pronto. ¡Gracias por avisarnos! 💪"
                  : "¡Mil gracias! Tu sugerencia es muy valiosa y el equipo la revisará. ¡Tú eres parte de cómo crece CIRE! 🌟"}
              </div>
              <button className="btn-blue" style={{ marginTop: 6 }} onClick={resetear}>Listo ✓</button>
            </div>
          )}

          {/* Chat */}
          {modo && !exito && (
            <>
              {/* Mensajes */}
              <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px", display: "flex", flexDirection: "column", gap: 10 }}>
                {mensajes.map((m, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                    {m.imagen && (
                      <img src={m.imagen.url} alt="captura" style={{ maxWidth: 200, borderRadius: 10, marginBottom: 4, border: "1px solid rgba(255,255,255,0.12)" }} />
                    )}
                    {(m.content || m.role === "assistant") && (
                      <div style={{
                        maxWidth: "88%", padding: "9px 13px",
                        borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: m.role === "user" ? "linear-gradient(135deg,#2721E8,#4f46e5)" : "rgba(255,255,255,0.08)",
                        color: "#fff", fontSize: 13, lineHeight: 1.58, whiteSpace: "pre-wrap"
                      }}>
                        {m.content}
                      </div>
                    )}
                  </div>
                ))}
                {cargando && (
                  <div style={{ display: "flex", alignItems: "flex-start" }}>
                    <div style={{ padding: "9px 14px", background: "rgba(255,255,255,0.08)", borderRadius: "14px 14px 14px 4px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Maya está escribiendo…</div>
                  </div>
                )}
              </div>

              {/* Banner de acción (escalar o enviar sugerencia) */}
              {hayMensajesUsuario && (
                <div style={{
                  margin: "10px 14px 0",
                  padding: "10px 12px",
                  background: modo === "soporte" ? "rgba(249,115,22,0.1)" : "rgba(73,184,211,0.1)",
                  border: `1px solid ${modo === "soporte" ? "rgba(249,115,22,0.3)" : "rgba(73,184,211,0.3)"}`,
                  borderRadius: 12, display: "flex", alignItems: "center", gap: 10, flexShrink: 0
                }}>
                  <span style={{ fontSize: 16 }}>{modo === "soporte" ? "🎫" : "💌"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>
                      {modo === "soporte" ? "¿No pudiste resolverlo?" : "¿Lista para enviar tu sugerencia?"}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 }}>
                      {modo === "soporte" ? "Escalamos con el equipo de soporte" : "Llegará directo al equipo de CIRE"}
                    </div>
                  </div>
                  <button
                    onClick={crearTicket}
                    disabled={enviando}
                    style={{
                      background: modo === "soporte" ? "#f97316" : "#49B8D3",
                      border: "none", borderRadius: 9, color: "#fff",
                      padding: "7px 13px", fontSize: 12, fontWeight: 600,
                      cursor: enviando ? "default" : "pointer", whiteSpace: "nowrap",
                      opacity: enviando ? 0.7 : 1, fontFamily: "'Albert Sans',sans-serif"
                    }}
                  >
                    {enviando ? "Enviando…" : modo === "soporte" ? "Escalar 🚀" : "Enviar 💙"}
                  </button>
                </div>
              )}

              {/* Input */}
              <div style={{ padding: "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
                {imagen && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 8, marginBottom: 8 }}>
                    <img src={imagen.url} alt="" style={{ width: 30, height: 30, borderRadius: 4, objectFit: "cover" }} />
                    <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imagen.name}</span>
                    <button onClick={() => setImagen(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <input
                    className="inp"
                    placeholder={modo === "soporte" ? "Describe tu problema…" : "Escribe tu sugerencia…"}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    style={{ flex: 1, borderRadius: 10, padding: "9px 12px", fontSize: 13 }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    title="Adjuntar captura de pantalla"
                    style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}
                  >📎</button>
                  <button
                    onClick={enviar}
                    disabled={cargando || (!input.trim() && !imagen)}
                    className="btn-blue"
                    style={{ width: 36, height: 36, padding: 0, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >➤</button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { procesarImagen(e.target.files[0]); e.target.value = ""; }} />
                <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, textAlign: "center", marginTop: 7 }}>Powered by Claude AI · CIRE Sistema UAT</div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  useCSSInjection();
  const[session,setSession]=useState(null);
  const[supaUser,setSupaUser]=useState(null);
  const[user,setUser]=useState("");const[pass,setPass]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const[showForgot,setShowForgot]=useState(false);
  const[mustChange,setMustChange]=useState(false);

  async function login(){
    if(!user.trim()||!pass){setErr("Completa usuario y contraseña");return;}
    setLoading(true);setErr("");
    try{
      const hardcoded=USUARIOS.find(u=>u.usuario===user.trim());
      if(!hardcoded){setErr("Usuario o contraseña incorrectos");setLoading(false);return;}
      const{data:supaRec}=await supabase.from("system_users").select("*").eq("username",user.trim()).maybeSingle();
      if(supaRec){
        const hash=await hashPassword(pass);
        if(hash!==supaRec.password_hash){setErr("Usuario o contraseña incorrectos");setLoading(false);return;}
        setSession(hardcoded);setSupaUser(supaRec);
        logActividad(hardcoded,"session_start",hardcoded.rol);
        if(supaRec.must_change_password)setMustChange(true);
      }else{
        if(hardcoded.password!==pass){setErr("Usuario o contraseña incorrectos");setLoading(false);return;}
        const hash=await hashPassword(pass);
        const{data:newRec}=await supabase.from("system_users").insert([{id:hardcoded.id,username:hardcoded.usuario,password_hash:hash,must_change_password:true}]).select().maybeSingle();
        setSession(hardcoded);setSupaUser(newRec||{must_change_password:true});
        logActividad(hardcoded,"session_start",hardcoded.rol);
        setMustChange(true);
      }
    }catch(e){setErr("Error de conexión. Intenta de nuevo.");}
    setLoading(false);
  }

  function logout(){if(session)logActividad(session,"session_end");setSession(null);setSupaUser(null);setMustChange(false);}

  if(!session){
    if(showForgot)return<ForgotPasswordScreen onBack={()=>setShowForgot(false)}/>;
    return(
      <div style={{minHeight:"100vh",background:"#22264A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Albert Sans',sans-serif",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",width:500,height:500,borderRadius:"50%",background:"#2721E8",opacity:0.08,filter:"blur(100px)",top:"-150px",left:"-150px",pointerEvents:"none"}}/>
        <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"#49B8D3",opacity:0.06,filter:"blur(80px)",bottom:"0px",right:"0px",pointerEvents:"none"}}/>
        <div className="glass" style={{width:420,padding:"52px 44px",position:"relative"}}>
          <div style={{textAlign:"center",marginBottom:"36px"}}>
            <div style={{fontSize:"10px",letterSpacing:"5px",color:"#49B8D3",marginBottom:"10px",fontWeight:500}}>SISTEMA INTERNO</div>
            <div style={{fontSize:"42px",fontWeight:700,color:"#fff",letterSpacing:"8px",lineHeight:1}}>CIRE</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.25)",marginTop:"8px",letterSpacing:"1px"}}>Depilación Láser</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"20px"}}>
            <input className="inp" placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
            <input className="inp" type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>
            {err&&<div style={{color:"#ff6b6b",fontSize:"13px",textAlign:"center"}}>{err}</div>}
          </div>
          <button className="btn-blue" style={{width:"100%",padding:"14px",fontSize:"15px",borderRadius:"12px"}} onClick={login} disabled={loading}>{loading?"Verificando...":"Entrar →"}</button>
          <div style={{marginTop:"16px",textAlign:"center"}}>
            <button onClick={()=>setShowForgot(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:"12px",cursor:"pointer",fontFamily:"'Albert Sans',sans-serif",textDecoration:"underline"}}>Olvidé mi contraseña</button>
          </div>
          <div style={{marginTop:"12px",fontSize:"10px",color:"rgba(255,255,255,0.1)",textAlign:"center",letterSpacing:"2px"}}>ACCESO RESTRINGIDO</div>
        </div>
      </div>
    );
  }

  if(mustChange)return<FirstLoginScreen session={session} onComplete={()=>setMustChange(false)}/>;

  if(session.rol==="admin")return<><Dashboard session={session} onLogout={logout}/><AsistenteVirtual session={session}/></>;
  if(session.rol==="duena_general")return<><Dashboard session={session} onLogout={logout} sucursalesPropias={session.sucursalesPropias}/><AsistenteVirtual session={session}/></>;
  if(session.rol==="socia")return<><Dashboard session={session} onLogout={logout} sucursalesFiltro={session.sucursales}/><AsistenteVirtual session={session}/></>;
  return<><POS session={session} onSwitchSucursal={logout} isAdmin={false}/><AsistenteVirtual session={session}/></>;
}
