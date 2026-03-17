import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const META_TOKEN   = import.meta.env.VITE_META_TOKEN;
const META_ACCOUNT = import.meta.env.VITE_META_ACCOUNT;
const supabase     = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0C0D1A;font-family:'Albert Sans',sans-serif;}
  ::-webkit-scrollbar{width:4px;height:4px;background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px;}
  .glass{background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;}
  .glass-dark{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:12px;}
  .kpi{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px 22px;}
  .kpi.hi{border-color:rgba(39,33,232,0.5);background:rgba(39,33,232,0.08);}
  .kpi.green{border-color:rgba(16,185,129,0.4);background:rgba(16,185,129,0.06);}
  .kpi.orange{border-color:rgba(249,115,22,0.4);background:rgba(249,115,22,0.06);}
  .inp{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;color:#fff;font-family:'Albert Sans',sans-serif;font-size:13px;width:100%;outline:none;transition:border 0.2s;}
  .inp:focus{border-color:#2721E8;}
  .inp::placeholder{color:rgba(255,255,255,0.2);}
  select.inp{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;}
  select.inp option{background:#1a1b2e;color:#fff;}
  .btn-blue{background:#2721E8;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-family:'Albert Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;}
  .btn-blue:hover{background:#3d38f0;}
  .btn-blue:disabled{background:rgba(39,33,232,0.3);cursor:default;}
  .btn-ghost{background:transparent;color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 16px;font-family:'Albert Sans',sans-serif;font-size:12px;cursor:pointer;transition:all 0.2s;}
  .btn-ghost:hover{border-color:#2721E8;color:#fff;}
  .nav-tab{padding:10px 20px;font-size:13px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;color:rgba(255,255,255,0.35);transition:all 0.18s;}
  .nav-tab:hover{color:rgba(255,255,255,0.7);}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;}
  .tab-dash{padding:10px 20px;font-size:13px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;color:rgba(255,255,255,0.35);transition:all 0.18s;}
  .tab-dash:hover{color:rgba(255,255,255,0.7);}
  .rank-row{display:grid;grid-template-columns:32px 110px 1fr 110px 110px 100px;gap:0;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.04);align-items:center;}
  .rank-row:hover{background:rgba(255,255,255,0.02);}
  .clienta-sugg{padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.15s;}
  .clienta-sugg:hover{background:rgba(39,33,232,0.2);}
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
];
const SUCURSALES_NAMES=["Coapa","Valle","Oriente","Polanco","Metepec"];
const COLORES={Coapa:"#2721E8",Valle:"#49B8D3",Oriente:"#a855f7",Polanco:"#f97316",Metepec:"#10b981"};
const fmt=(n)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:0}).format(n||0);
const fmtN=(n)=>new Intl.NumberFormat("es-MX").format(n||0);
const hoy=()=>new Date().toISOString().slice(0,10);
const inicioMes=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;};
const mesLabel=()=>new Date().toLocaleDateString("es-MX",{month:"long",year:"numeric"});

const CATALOGO=[
  {categoria:"Combos Láser",items:[{nombre:"Full Body (8 ses)",precio:10000,msi:[3,6,9]},{nombre:"Combo Rostro (8 ses)",precio:9000,msi:[3,6,9]},{nombre:"Combo Sexy (8 ses)",precio:8000,msi:[3,6,9]},{nombre:"Combo Playa (8 ses)",precio:6500,msi:[3,6]},{nombre:"Combo Piernas (8 ses)",precio:6500,msi:[3,6]},{nombre:"Combo Bikini (8 ses)",precio:5500,msi:[3,6]},{nombre:"Combo Axilas (8 ses)",precio:5500,msi:[3,6]}]},
  {categoria:"Zonas Individuales",items:[{nombre:"Piernas Completas (8 ses)",precio:3500,msi:[3]},{nombre:"Medias Piernas (8 ses)",precio:2500,msi:[3]},{nombre:"Brazos (8 ses)",precio:3500,msi:[3]},{nombre:"Medios Brazos (8 ses)",precio:2500,msi:[3]},{nombre:"Axilas (8 ses)",precio:1500,msi:[3]},{nombre:"Espalda Completa (8 ses)",precio:4000,msi:[3]},{nombre:"Media Espalda (8 ses)",precio:2500,msi:[3]},{nombre:"Glúteos (8 ses)",precio:2500,msi:[3]},{nombre:"Zona Interglútea (8 ses)",precio:1500,msi:[3]},{nombre:"Abdomen (8 ses)",precio:2500,msi:[3]},{nombre:"Línea Abdomen (8 ses)",precio:1500,msi:[3]},{nombre:"Pecho (8 ses)",precio:2500,msi:[3]}]},
  {categoria:"Facial Láser",items:[{nombre:"Rostro Completo (8 ses)",precio:2500,msi:[3]},{nombre:"Medio Rostro (8 ses)",precio:2000,msi:[3]},{nombre:"Bigote/Mentón/Patillas (8s)",precio:1000,msi:[3]},{nombre:"Bikini Brazilian (8 ses)",precio:3500,msi:[3]},{nombre:"French Bikini (8 ses)",precio:3000,msi:[3]},{nombre:"Sexy Bikini (8 ses)",precio:2500,msi:[3]},{nombre:"Bikini Básico (8 ses)",precio:2000,msi:[3]}]},
  {categoria:"Faciales",items:[{nombre:"Baby Clean (1 ses)",precio:549,msi:[]},{nombre:"FullFace (1 ses)",precio:849,msi:[]},{nombre:"5 ses FullFace",precio:3500,msi:[3]},{nombre:"10 ses FullFace",precio:6000,msi:[3]}]},
  {categoria:"HIFU 4D",items:[{nombre:"HIFU 1 persona",precio:3000,msi:[3]},{nombre:"HIFU 2 personas",precio:5000,msi:[3]}]},
  {categoria:"Corporal",items:[{nombre:"Moldeo 1ª sesión",precio:699,msi:[]},{nombre:"Moldeo Subsecuente",precio:999,msi:[]},{nombre:"6 ses Moldeo",precio:3999,msi:[3]},{nombre:"12 ses Moldeo + Facial",precio:6999,msi:[3]},{nombre:"Anticelulítico 1ª ses",precio:699,msi:[]},{nombre:"6 ses Anticelulítico",precio:3999,msi:[3]},{nombre:"Moldeo Brasileño 1ª ses",precio:699,msi:[]},{nombre:"6 ses Moldeo Brasileño",precio:3999,msi:[3]},{nombre:"Aparatología 1 zona",precio:649,msi:[]}]},
  {categoria:"Post Operatorio",items:[{nombre:"Post Op 1ª ses",precio:999,msi:[]},{nombre:"10 ses Post Op",precio:9999,msi:[3]},{nombre:"15 ses Post Op",precio:13999,msi:[3]},{nombre:"20 ses Post Op + Facial",precio:17999,msi:[3]}]},
];
const TIPOS_SVC=[{id:"laser",label:"Láser",duracion:60,color:"#2721E8"},{id:"facial_baby",label:"Baby Clean",duracion:60,color:"#49B8D3"},{id:"facial_full",label:"FullFace",duracion:90,color:"#49B8D3"},{id:"corporal",label:"Corporal/Moldeo",duracion:60,color:"#a855f7"},{id:"hifu",label:"HIFU 4D",duracion:90,color:"#f97316"},{id:"post_op",label:"Post operatorio",duracion:60,color:"#10b981"}];
const HORARIOS={1:{a:"10:00",c:"20:00"},2:{a:"10:00",c:"20:00"},3:{a:"10:00",c:"20:00"},4:{a:"10:00",c:"20:00"},5:{a:"10:00",c:"20:00"},6:{a:"09:00",c:"16:00"},0:null};
const DIAS_L=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const HORAS=Array.from({length:12},(_,i)=>i+9);
const PX_POR_MIN=64/60;
const colorT=(t)=>TIPOS_SVC.find(x=>x.id===t)?.color||"#2721E8";
const detectTipo=(n)=>{const l=(n||"").toLowerCase();if(l.includes("baby"))return TIPOS_SVC[1];if(l.includes("fullface")||l.includes("facial"))return TIPOS_SVC[2];if(l.includes("hifu"))return TIPOS_SVC[4];if(l.includes("post"))return TIPOS_SVC[5];if(l.includes("moldeo")||l.includes("corporal")||l.includes("anticel"))return TIPOS_SVC[3];return TIPOS_SVC[0];};
const horaFin=(h,dur)=>{if(!h)return"";const[hh,mm]=h.split(":").map(Number);const f=hh*60+mm+dur;return`${String(Math.floor(f/60)).padStart(2,"0")}:${String(f%60).padStart(2,"0")}`;};
function semanaD(f){const b=new Date(f+"T12:00:00"),d=b.getDay(),l=new Date(b);l.setDate(b.getDate()-(d===0?6:d-1));return Array.from({length:6},(_,i)=>{const x=new Date(l);x.setDate(l.getDate()+i);return x.toISOString().slice(0,10);});}
const FILTROS=["Todos","Combos","Rostro","Superior","Inferior","Bikini","Faciales","Corporales"];
const ITEM_FILTRO=(item,f)=>{if(f==="Todos")return true;const n=item.nombre.toLowerCase();if(f==="Combos")return n.includes("combo")||n.includes("full body");if(f==="Rostro")return n.includes("rostro")||n.includes("bigote")||n.includes("patillas");if(f==="Superior")return["axilas","brazos","pecho","abdomen","espalda","línea abdomen","glúteos","zona interg"].some(k=>n.includes(k));if(f==="Inferior")return["piernas","medias piernas"].some(k=>n.includes(k));if(f==="Bikini")return["bikini","french","sexy bikini"].some(k=>n.includes(k));if(f==="Faciales")return n.includes("baby clean")||n.includes("fullface")||n.includes("hifu");if(f==="Corporales")return["moldeo","anticel","post op","aparatolog"].some(k=>n.includes(k));return true;};
const MESES_ES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

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
    <div style={{border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",overflow:"hidden",background:"rgba(0,0,0,0.2)"}}>
      <div style={{padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:"10px",color:"rgba(255,255,255,0.4)",letterSpacing:"1px",display:"flex",justifyContent:"space-between"}}>
        <span>{new Date(fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"short"}).toUpperCase()}</span>
        <span>{citas.length} cita{citas.length!==1?"s":""}</span>
      </div>
      <div style={{maxHeight:"260px",overflowY:"auto"}}>
        {hrs.map(hr=>{const s0=`${String(hr).padStart(2,"0")}:00`,s30=`${String(hr).padStart(2,"0")}:30`;
          const citasHr=citas.filter(c=>{const[ch]=c.hora_inicio.split(":").map(Number);return ch===hr;});
          return(<div key={hr} style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
            <div style={{width:"42px",padding:"4px 6px",fontSize:"9px",color:"rgba(255,255,255,0.2)",textAlign:"right",flexShrink:0,paddingTop:"6px"}}>{hr>12?`${hr-12}pm`:hr===12?"12pm":`${hr}am`}</div>
            <div style={{flex:1,minHeight:"44px",position:"relative"}}>
              {[s0,s30].map((slot,si)=>{const sel=horaSeleccionada===slot;return(
                <div key={slot} onClick={()=>onSelectHora(slot)} style={{height:"22px",cursor:"pointer",background:sel?"rgba(39,33,232,0.25)":"transparent",borderLeft:sel?"2px solid #2721E8":"2px solid transparent",transition:"all 0.1s",display:"flex",alignItems:"center",paddingLeft:"4px"}}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(255,255,255,0.03)";}} onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=sel?"rgba(39,33,232,0.25)":"transparent";}}>
                  {sel&&<span style={{fontSize:"9px",color:"#49B8D3",fontWeight:600}}>{slot}</span>}
                </div>);
              })}
              {citasHr.map(c=>{const[,cm]=c.hora_inicio.split(":").map(Number);const top=cm<30?1:23;const hPx=Math.max(c.duracion_min*(44/60)-2,14);const col=colorT(c.tipo_servicio);
                return(<div key={c.id} style={{position:"absolute",left:"28px",right:"2px",top:`${top}px`,height:`${hPx}px`,background:`${col}22`,border:`1px solid ${col}55`,borderRadius:"4px",padding:"1px 4px",pointerEvents:"none",overflow:"hidden",zIndex:2}}>
                  <div style={{fontSize:"8px",fontWeight:600,color:col,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.hora_inicio} {c.clienta_nombre}</div>
                </div>);
              })}
            </div>
          </div>);
        })}
      </div>
      {horaSeleccionada&&<div style={{padding:"6px 10px",borderTop:"1px solid rgba(39,33,232,0.3)",background:"rgba(39,33,232,0.08)",fontSize:"11px",color:"#49B8D3",fontWeight:600}}>✓ {horaSeleccionada} – {horaFin(horaSeleccionada,duracion)} ({duracion}min)</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FICHA CLIENTA
// ══════════════════════════════════════════════════════════════════════════════
function FichaClienta({clientaId,session,onClose}){
  const[clienta,setClienta]=useState(null);const[paquetes,setPaquetes]=useState([]);const[citasH,setCitasH]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{setLoading(true);const{data:c}=await supabase.from("clientas").select("*").eq("id",clientaId).single();const{data:p}=await supabase.from("paquetes").select("*").eq("clienta_id",clientaId).order("fecha_compra",{ascending:false});const{data:ci}=await supabase.from("citas").select("*").eq("clienta_id",clientaId).order("fecha",{ascending:false});setClienta(c);setPaquetes(p||[]);setCitasH(ci||[]);setLoading(false);})();},[clientaId]);
  if(loading)return<div style={{padding:"40px",textAlign:"center",color:"rgba(255,255,255,0.3)"}}>Cargando ficha...</div>;
  if(!clienta)return<div style={{padding:"40px",textAlign:"center",color:"rgba(255,255,255,0.3)"}}>No encontrada</div>;
  const prox=citasH.find(c=>c.estado==="agendada");
  return(
    <div style={{padding:"20px 24px",overflowY:"auto",flex:1,color:"#fff"}}>
      {onClose&&<button className="btn-ghost" onClick={onClose} style={{marginBottom:"16px",fontSize:"11px"}}>← Volver</button>}
      <div style={{display:"flex",gap:"20px",marginBottom:"24px",alignItems:"flex-start"}}>
        <div style={{width:"56px",height:"56px",borderRadius:"50%",background:"rgba(39,33,232,0.2)",border:"1px solid rgba(39,33,232,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",fontWeight:700,color:"#2721E8",flexShrink:0}}>{clienta.nombre?.charAt(0)?.toUpperCase()||"?"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:"20px",fontWeight:700,marginBottom:"4px"}}>{clienta.nombre}</div>
          <div style={{display:"flex",gap:"16px",fontSize:"12px",color:"rgba(255,255,255,0.4)",flexWrap:"wrap"}}>
            {clienta.telefono&&<span>📱 {clienta.telefono}</span>}
            {clienta.fecha_nacimiento&&<span>🎂 {new Date(clienta.fecha_nacimiento+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})}</span>}
            {clienta.como_nos_conocio&&<span>📣 {clienta.como_nos_conocio}</span>}
          </div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)",marginTop:"4px"}}>Desde {new Date(clienta.created_at).toLocaleDateString("es-MX",{month:"short",year:"numeric"})} · {clienta.sucursal_nombre}</div>
        </div>
      </div>
      {prox&&<div className="glass" style={{padding:"16px",marginBottom:"16px",borderColor:"rgba(39,33,232,0.3)"}}>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"8px"}}>PRÓXIMA CITA</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:"14px",fontWeight:600}}>{prox.servicio}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginTop:"2px"}}>{new Date(prox.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})} · {prox.hora_inicio}</div></div>
          <div style={{fontSize:"12px",fontWeight:600,color:"#49B8D3"}}>Sesión {prox.sesion_numero}</div>
        </div>
      </div>}
      <div style={{marginBottom:"20px"}}>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>PAQUETES ({paquetes.length})</div>
        {paquetes.map(p=><div key={p.id} className="glass" style={{padding:"14px",marginBottom:"8px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}><div style={{fontSize:"13px",fontWeight:600}}>{p.servicio}</div><div style={{fontSize:"11px",color:p.activo?"#10b981":"rgba(255,255,255,0.3)",fontWeight:600}}>{p.activo?"Activo":"Completado"}</div></div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)",marginBottom:"6px"}}>Sesión {p.sesiones_usadas} de {p.total_sesiones}</div>
          <div style={{height:"4px",background:"rgba(255,255,255,0.06)",borderRadius:"2px"}}><div style={{width:`${(p.sesiones_usadas/p.total_sesiones)*100}%`,height:"100%",background:p.activo?"#49B8D3":"#10b981",borderRadius:"2px"}}/></div>
        </div>)}
        {paquetes.length===0&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.15)"}}>Sin paquetes</div>}
      </div>
      <div>
        <div style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>HISTORIAL ({citasH.filter(c=>c.estado==="completada").length} completadas)</div>
        {citasH.map(c=><div key={c.id} style={{display:"flex",gap:"10px",alignItems:"flex-start",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          <div style={{width:"6px",height:"6px",borderRadius:"50%",background:c.estado==="completada"?"#10b981":c.estado==="agendada"?colorT(c.tipo_servicio):"rgba(255,255,255,0.15)",marginTop:"6px",flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:"12px",fontWeight:500}}>{c.servicio} <span style={{color:"rgba(255,255,255,0.3)"}}>· S{c.sesion_numero}</span></div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{new Date(c.fecha+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"})} · {c.hora_inicio}</div></div>
          <div style={{fontSize:"10px",fontWeight:600,color:c.estado==="completada"?"#10b981":c.estado==="agendada"?"#49B8D3":"rgba(255,255,255,0.2)"}}>{c.estado==="completada"?"✓":c.estado==="agendada"?"Próx.":"✕"}</div>
        </div>)}
        {citasH.length===0&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.15)"}}>Sin sesiones</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENDA CALENDAR — sin "Nueva cita", con siguiente sesión al completar
// ══════════════════════════════════════════════════════════════════════════════
function AgendaCalendar({session,onVerFicha}){
  const[semana,setSemana]=useState(semanaD(hoy()));const[citas,setCitas]=useState([]);const[detalle,setDetalle]=useState(null);const[saving,setSaving]=useState(false);
  const[modalSig,setModalSig]=useState(false);const[citaComp,setCitaComp]=useState(null);const[horaSig,setHoraSig]=useState("");const[fechaSig,setFechaSig]=useState("");
  const mRef=useRef(true);useEffect(()=>{mRef.current=true;return()=>{mRef.current=false;};},[]);
  const cargar=async()=>{const{data}=await supabase.from("citas").select("*").eq("sucursal_id",session.id).gte("fecha",semana[0]).lte("fecha",semana[5]).order("hora_inicio");if(data)setCitas(data);};
  useEffect(()=>{cargar();},[semana,session]);
  const completar=async(cita)=>{
    await supabase.from("citas").update({estado:"completada"}).eq("id",cita.id);setDetalle(null);
    if(cita.paquete_id&&mRef.current){
      const{data:paq}=await supabase.from("paquetes").select("*").eq("id",cita.paquete_id).single();
      if(paq&&mRef.current){const ns=paq.sesiones_usadas+1;await supabase.from("paquetes").update({sesiones_usadas:ns,activo:ns<paq.total_sesiones}).eq("id",paq.id);
        if(ns<paq.total_sesiones){const b=new Date(cita.fecha+"T12:00:00");b.setMonth(b.getMonth()+1);setFechaSig(b.toISOString().slice(0,10));setHoraSig(cita.hora_inicio);setCitaComp({...cita,paquete:{...paq,sesiones_usadas:ns}});setModalSig(true);}
      }
    }
    if(mRef.current)cargar();
  };
  const agSig=async()=>{if(!fechaSig||!horaSig||!citaComp)return;setSaving(true);try{
    const dur=TIPOS_SVC.find(t=>t.id===citaComp.tipo_servicio)?.duracion||60;const sN=citaComp.paquete.sesiones_usadas+1;
    await supabase.from("citas").insert([{clienta_id:citaComp.clienta_id,clienta_nombre:citaComp.clienta_nombre,paquete_id:citaComp.paquete_id,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:citaComp.servicio,tipo_servicio:citaComp.tipo_servicio,duracion_min:dur,fecha:fechaSig,hora_inicio:horaSig,hora_fin:horaFin(horaSig,dur),sesion_numero:sN,es_cobro:false,estado:"agendada",notas:"Agendada tras completar sesión"}]);
    setModalSig(false);setCitaComp(null);cargar();
  }catch(e){console.error(e);}setSaving(false);};
  const cancelar=async(id,pId,sU)=>{await supabase.from("citas").update({estado:"cancelada"}).eq("id",id);if(pId)await supabase.from("paquetes").update({sesiones_usadas:Math.max(0,sU-1),activo:true}).eq("id",pId);setDetalle(null);cargar();};
  const semAnt=()=>{const d=new Date(semana[0]+"T12:00:00");d.setDate(d.getDate()-7);setSemana(semanaD(d.toISOString().slice(0,10)));};
  const semSig=()=>{const d=new Date(semana[0]+"T12:00:00");d.setDate(d.getDate()+7);setSemana(semanaD(d.toISOString().slice(0,10)));};
  const cdDia=(f)=>citas.filter(c=>c.fecha===f&&c.estado!=="cancelada");
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 64px)",background:"#0C0D1A",color:"#fff"}}>
      <div style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button className="btn-ghost" style={{padding:"6px 14px"}} onClick={()=>setSemana(semanaD(hoy()))}>Hoy</button>
          <button onClick={semAnt} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:"rgba(255,255,255,0.6)",cursor:"pointer",padding:"6px 10px",fontSize:"14px"}}>‹</button>
          <button onClick={semSig} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:"rgba(255,255,255,0.6)",cursor:"pointer",padding:"6px 10px",fontSize:"14px"}}>›</button>
          <div style={{fontSize:"16px",fontWeight:600,textTransform:"capitalize"}}>{new Date(semana[0]+"T12:00:00").toLocaleDateString("es-MX",{month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>{TIPOS_SVC.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"10px",color:"rgba(255,255,255,0.35)"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:t.color}}/>{t.label}</div>)}</div>
      </div>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"52px repeat(6,1fr)",borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:0,background:"#0C0D1A",zIndex:10}}>
          <div/>
          {semana.map(f=>{const d=new Date(f+"T12:00:00").getDay(),e=f===hoy(),a=HORARIOS[d]!==null;return(
            <div key={f} style={{padding:"10px 8px",textAlign:"center",opacity:a?1:0.4}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.4)",letterSpacing:"1px",marginBottom:"4px"}}>{DIAS_L[d].toUpperCase()}</div>
              <div style={{width:"32px",height:"32px",borderRadius:"50%",background:e?"#2721E8":"transparent",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"16px",fontWeight:e?700:400,color:e?"#fff":"rgba(255,255,255,0.8)"}}>{f.slice(8)}</span></div>
            </div>);})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"52px repeat(6,1fr)",position:"relative"}}>
          <div>{HORAS.map(h=><div key={h} style={{height:"64px",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",paddingRight:"8px",paddingTop:"2px"}}><span style={{fontSize:"10px",color:"rgba(255,255,255,0.25)"}}>{h>12?`${h-12}pm`:h===12?"12pm":`${h}am`}</span></div>)}</div>
          {semana.map(f=>{const d=new Date(f+"T12:00:00").getDay(),a=HORARIOS[d]!==null,cd=cdDia(f);return(
            <div key={f} style={{borderLeft:"1px solid rgba(255,255,255,0.05)",position:"relative",opacity:a?1:0.3}}>
              {HORAS.map(h=><div key={h} style={{height:"64px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}/>)}
              {cd.map(c=>{const[ch,cm]=c.hora_inicio.split(":").map(Number),top=(ch-9)*64+cm*PX_POR_MIN,height=Math.max(c.duracion_min*PX_POR_MIN-2,20),col=colorT(c.tipo_servicio);return(
                <div key={c.id} onClick={e=>{e.stopPropagation();setDetalle(c);}} style={{position:"absolute",left:"2px",right:"2px",top:`${top}px`,height:`${height}px`,background:`${col}22`,border:`1px solid ${col}66`,borderLeft:`3px solid ${c.es_cobro?"#f0c040":col}`,borderRadius:"6px",padding:"3px 6px",cursor:"pointer",overflow:"hidden",zIndex:5}} onMouseEnter={e=>e.currentTarget.style.opacity="0.85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  <div style={{fontSize:"10px",fontWeight:700,color:col,lineHeight:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.hora_inicio} {c.clienta_nombre}</div>
                  {height>30&&<div style={{fontSize:"9px",color:"rgba(255,255,255,0.5)",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.servicio}</div>}
                </div>);})}
              {f===hoy()&&(()=>{const n=new Date(),m=(n.getHours()-9)*60+n.getMinutes();if(m<0||m>720)return null;return<div style={{position:"absolute",left:0,right:0,top:`${m*PX_POR_MIN}px`,height:"2px",background:"#ff4444",zIndex:6,pointerEvents:"none"}}><div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#ff4444",position:"absolute",left:"-4px",top:"-3px"}}/></div>;})()}
            </div>);})}
        </div>
      </div>
      {detalle&&<div className="overlay" onClick={()=>setDetalle(null)}><div className="glass" style={{width:400,padding:"26px",borderColor:`${colorT(detalle.tipo_servicio)}44`}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"16px"}}><div><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"3px"}}>CITA</div><div style={{fontSize:"18px",fontWeight:700}}>{detalle.clienta_nombre}</div></div><button onClick={()=>setDetalle(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:"22px"}}>×</button></div>
        <div style={{display:"flex",flexDirection:"column",gap:"9px",background:"rgba(0,0,0,0.3)",borderRadius:"10px",padding:"14px",marginBottom:"16px"}}>
          {[["Servicio",detalle.servicio],["Fecha",new Date(detalle.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})],["Horario",`${detalle.hora_inicio} – ${detalle.hora_fin}`],["Sesión",`${detalle.sesion_numero}`]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:"13px"}}><span style={{color:"rgba(255,255,255,0.4)"}}>{l}</span><span style={{fontWeight:500}}>{v}</span></div>)}
        </div>
        <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
          {detalle.estado==="agendada"&&<><button className="btn-ghost" style={{flex:1,color:"#ff6b6b",borderColor:"rgba(255,80,80,0.3)"}} onClick={()=>cancelar(detalle.id,detalle.paquete_id,detalle.sesion_numero)}>Cancelar</button><button className="btn-blue" style={{flex:2}} onClick={()=>completar(detalle)}>✓ Completada</button></>}
          {detalle.estado==="completada"&&<div style={{textAlign:"center",width:"100%",fontSize:"13px",color:"#10b981",fontWeight:600}}>✓ Completada</div>}
          {detalle.estado==="cancelada"&&<div style={{textAlign:"center",width:"100%",fontSize:"13px",color:"rgba(255,255,255,0.3)"}}>Cancelada</div>}
        </div>
        {detalle.clienta_id&&<button className="btn-ghost" style={{width:"100%",fontSize:"11px"}} onClick={()=>{setDetalle(null);onVerFicha&&onVerFicha(detalle.clienta_id);}}>Ver ficha de {detalle.clienta_nombre}</button>}
      </div></div>}
      {modalSig&&citaComp&&<div className="overlay"><div className="glass" style={{width:500,maxHeight:"90vh",overflow:"auto",padding:"28px",borderColor:"rgba(16,185,129,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:"20px"}}><div style={{fontSize:"28px",marginBottom:"8px"}}>📅</div><div style={{fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>¡Sesión completada!</div><div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>¿Agendar siguiente sesión de {citaComp.clienta_nombre}?</div><div style={{fontSize:"12px",color:"#10b981",marginTop:"6px"}}>Sesión {citaComp.paquete.sesiones_usadas+1} de {citaComp.paquete.total_sesiones}</div></div>
        <div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>FECHA</div><input type="date" className="inp" value={fechaSig} min={hoy()} onChange={e=>{setFechaSig(e.target.value);setHoraSig("");}} style={{colorScheme:"dark"}}/></div>
        {fechaSig&&new Date(fechaSig+"T12:00:00").getDay()!==0&&<div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>SELECCIONA HORA (toca un espacio libre)</div><MiniAgendaDia session={session} fecha={fechaSig} onSelectHora={h=>setHoraSig(h)} horaSeleccionada={horaSig} duracion={TIPOS_SVC.find(t=>t.id===citaComp.tipo_servicio)?.duracion||60}/></div>}
        {fechaSig&&new Date(fechaSig+"T12:00:00").getDay()===0&&<div style={{fontSize:"11px",color:"#ff6b6b",marginBottom:"12px"}}>⚠ Domingo — cerrado</div>}
        <div style={{display:"flex",gap:"8px"}}><button className="btn-ghost" style={{flex:1}} onClick={()=>{setModalSig(false);setCitaComp(null);}}>No por ahora</button><button className="btn-blue" style={{flex:2,padding:"12px"}} disabled={!fechaSig||!horaSig||saving||new Date(fechaSig+"T12:00:00").getDay()===0} onClick={agSig}>{saving?"Agendando...":"✓ Agendar siguiente"}</button></div>
      </div></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// POS — Paquete → Datos → Agendar (con vista de agenda) → Cobrar
// ══════════════════════════════════════════════════════════════════════════════
function POS({session,onSwitchSucursal,isAdmin}){
  useCSSInjection();
  const[view,setView]=useState("pos");const[carrito,setCarrito]=useState([]);const[filtro,setFiltro]=useState("Todos");const[busq,setBusq]=useState("");
  const[tipoTicket,setTipoTicket]=useState("nueva"); // "nueva" | "recompra"
  const[clientaSel,setClientaSel]=useState(null);const[busqCli,setBusqCli]=useState("");const[cliResults,setCliResults]=useState([]);
  const[nombreCli,setNombreCli]=useState("");const[telCli,setTelCli]=useState("");const[nacDia,setNacDia]=useState("");const[nacMes,setNacMes]=useState("");const[nacAnio,setNacAnio]=useState("");const[comoNos,setComoNos]=useState("");const[depiAntes,setDepiAntes]=useState(null);
  const[fechaCita,setFechaCita]=useState("");const[horaCita,setHoraCita]=useState("");const[showAgenda,setShowAgenda]=useState(false);
  const[metodo,setMetodo]=useState("");const[msiSel,setMsiSel]=useState(0);const[descuento,setDescuento]=useState(0);const[showConfirm,setShowConfirm]=useState(false);const[saving,setSaving]=useState(false);const[showExito,setShowExito]=useState(false);
  const[tickets,setTickets]=useState([]);const[loadingT,setLoadingT]=useState(false);const[fichaId,setFichaId]=useState(null);const[clientas,setClientas]=useState([]);const[cliBusq,setCliBusq]=useState("");const[loadingCli,setLoadingCli]=useState(false);

  const todosItems=CATALOGO.flatMap(c=>c.items.map(i=>({...i,categoria:c.categoria})));
  const itemsFilt=todosItems.filter(i=>ITEM_FILTRO(i,filtro)&&(!busq||i.nombre.toLowerCase().includes(busq.toLowerCase())));
  const sel=(item)=>{carrito.find(x=>x.nombre===item.nombre)?setCarrito([]):setCarrito([{...item,qty:1}]);};
  const total=carrito.length>0?carrito[0].precio:0;const totalCD=Math.round(total*(1-descuento/100));const msiD=carrito.length>0?(carrito[0].msi||[]):[];
  const tipoSvc=carrito.length>0?detectTipo(carrito[0].nombre):TIPOS_SVC[0];
  const dOk=tipoTicket==="recompra"?!!clientaSel:nombreCli.trim().length>0;
  const pOk=carrito.length>0,aOk=!!fechaCita&&!!horaCita,todo=pOk&&dOk&&aOk;
  const dow=fechaCita?new Date(fechaCita+"T12:00:00").getDay():-1,esDom=dow===0;
  const fechaNacISO=nacAnio&&nacMes&&nacDia?`${nacAnio}-${nacMes}-${nacDia}`:null;
  const nombreFinal=tipoTicket==="recompra"&&clientaSel?clientaSel.nombre:nombreCli;
  const buscarCliPOS=async(q)=>{if(q.length<2){setCliResults([]);return;}const{data}=await supabase.from("clientas").select("*").ilike("nombre",`%${q}%`).eq("sucursal_id",session.id).limit(6);setCliResults(data||[]);};
  const selCliPOS=(c)=>{setClientaSel(c);setBusqCli(c.nombre);setCliResults([]);};
  const limpiar=()=>{setCarrito([]);setTipoTicket("nueva");setClientaSel(null);setBusqCli("");setCliResults([]);setNombreCli("");setTelCli("");setNacDia("");setNacMes("");setNacAnio("");setComoNos("");setDepiAntes(null);setFechaCita("");setHoraCita("");setShowAgenda(false);setMetodo("");setMsiSel(0);setDescuento(0);setShowConfirm(false);};

  const cerrar=async()=>{setSaving(true);try{
    const item=carrito[0];
    let cliId=null;
    if(tipoTicket==="recompra"&&clientaSel){cliId=clientaSel.id;}
    else{const{data:cD}=await supabase.from("clientas").insert([{nombre:nombreCli,telefono:telCli,fecha_nacimiento:fechaNacISO,como_nos_conocio:comoNos,sucursal_id:session.id,sucursal_nombre:session.nombre}]).select();cliId=cD?.[0]?.id||null;}
    const{data:tD}=await supabase.from("tickets").insert([{sucursal_id:session.id,sucursal_nombre:session.nombre,servicios:[item.nombre],total:totalCD,metodo_pago:metodo+(msiSel>0?` ${msiSel}MSI`:""),descuento,tipo_clienta:tipoTicket==="recompra"?"Recompra":"Nueva",fecha:hoy()}]).select();
    const tId=tD?.[0]?.id;
    let pId=null;
    if(item.nombre.includes("ses")){const ms=item.nombre.match(/(\d+)\s*ses/);const tot=ms?parseInt(ms[1]):8;
      const{data:pD}=await supabase.from("paquetes").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,total_sesiones:tot,sesiones_usadas:0,precio:item.precio,ticket_id:tId,fecha_compra:hoy(),activo:true}]).select();pId=pD?.[0]?.id||null;}
    await supabase.from("citas").insert([{clienta_id:cliId,clienta_nombre:nombreFinal,paquete_id:pId,sucursal_id:session.id,sucursal_nombre:session.nombre,servicio:item.nombre,tipo_servicio:tipoSvc.id,duracion_min:tipoSvc.duracion,fecha:fechaCita,hora_inicio:horaCita,hora_fin:horaFin(horaCita,tipoSvc.duracion),sesion_numero:1,es_cobro:true,estado:"agendada",notas:`Ticket #${tId||""}`}]);
    setShowConfirm(false);setShowExito(true);setTimeout(()=>{setShowExito(false);limpiar();},2200);
  }catch(e){console.error(e);}setSaving(false);};

  const cargarT=async(sid)=>{setLoadingT(true);const{data}=await supabase.from("tickets").select("*").eq("sucursal_id",sid).eq("fecha",hoy()).order("created_at",{ascending:false});if(data)setTickets(data);setLoadingT(false);};
  const cargarCli=async(q)=>{setLoadingCli(true);let qr=supabase.from("clientas").select("*").eq("sucursal_id",session.id).order("created_at",{ascending:false}).limit(50);if(q)qr=qr.ilike("nombre",`%${q}%`);const{data}=await qr;setClientas(data||[]);setLoadingCli(false);};
  const totalHoy=tickets.reduce((s,t)=>s+Number(t.total),0);
  const anios=Array.from({length:73},(_,i)=>String(2012-i));const dias=Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0"));

  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#0C0D1A",color:"#fff"}}>
      <div style={{height:"64px",padding:"0 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(20px)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
          <div style={{fontSize:"18px",fontWeight:700,letterSpacing:"4px"}}>CIRE</div><div style={{width:"1px",height:"18px",background:"rgba(255,255,255,0.1)"}}/>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{width:"8px",height:"8px",borderRadius:"50%",background:session.color}}/><div style={{fontSize:"13px",color:"rgba(255,255,255,0.35)",fontWeight:300}}>{session.nombre}</div></div>
          <div style={{display:"flex"}}>
            {["pos","agenda","clientas","historial"].map(v=><div key={v} className="nav-tab" style={{borderBottomColor:view===v?"#2721E8":"transparent",color:view===v?"#fff":"rgba(255,255,255,0.35)"}}
              onClick={()=>{setView(v);setFichaId(null);if(v==="historial")cargarT(session.id);if(v==="clientas")cargarCli("");}}>
              {v==="pos"?"Punto de Venta":v==="agenda"?"📅 Agenda":v==="clientas"?"👤 Clientas":"Historial"}</div>)}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          {view==="historial"&&tickets.length>0&&<div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>HOY <span style={{color:"#49B8D3",fontWeight:700}}>{fmt(totalHoy)}</span></div>}
          {isAdmin&&<button className="btn-ghost" onClick={onSwitchSucursal} style={{fontSize:"11px"}}>← Dashboard</button>}
        </div>
      </div>

      {view==="agenda"&&<AgendaCalendar key="ag" session={session} onVerFicha={id=>{setFichaId(id);setView("clientas");}}/>}

      {view==="clientas"&&(fichaId?<FichaClienta clientaId={fichaId} session={session} onClose={()=>setFichaId(null)}/>:
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
          <div style={{display:"flex",gap:"12px",marginBottom:"16px",alignItems:"center"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>CLIENTAS · {session.nombre}</div><div style={{flex:1}}/><input className="inp" placeholder="Buscar por nombre..." value={cliBusq} onChange={e=>{setCliBusq(e.target.value);cargarCli(e.target.value);}} style={{maxWidth:"280px",padding:"8px 14px",fontSize:"12px"}}/></div>
          {loadingCli&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>Cargando...</div>}
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {clientas.map(c=><div key={c.id} className="glass" style={{padding:"14px 18px",cursor:"pointer"}} onClick={()=>setFichaId(c.id)} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(39,33,232,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}>
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <div style={{width:"36px",height:"36px",borderRadius:"50%",background:"rgba(39,33,232,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:700,color:"#2721E8",flexShrink:0}}>{c.nombre?.charAt(0)?.toUpperCase()}</div>
                <div style={{flex:1}}><div style={{fontSize:"14px",fontWeight:600}}>{c.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{c.telefono||"—"} · {c.como_nos_conocio||""}</div></div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.2)"}}>{new Date(c.created_at).toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</div>
              </div></div>)}
            {!loadingCli&&clientas.length===0&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.15)",fontSize:"13px"}}>Sin clientas</div>}
          </div>
        </div>)}

      {view==="historial"&&<div style={{padding:"20px 24px",overflowY:"auto",flex:1}}>
        <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>HISTORIAL · {session.nombre}</div>
        {loadingT&&<div style={{color:"rgba(255,255,255,0.3)",textAlign:"center",padding:"40px"}}>Cargando...</div>}
        {!loadingT&&tickets.length===0&&<div style={{color:"rgba(255,255,255,0.2)",textAlign:"center",padding:"40px",fontSize:"13px"}}>Sin tickets hoy</div>}
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>{tickets.map(t=><div key={t.id} className="glass" style={{padding:"16px 20px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginBottom:"4px"}}>{new Date(t.created_at).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</div><div style={{fontSize:"13px",fontWeight:500}}>{(t.servicios||[]).join(", ")}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"4px"}}>{t.metodo_pago}{t.descuento>0?` · ${t.descuento}% desc`:""}</div></div><div style={{fontSize:"20px",fontWeight:700,color:"#49B8D3"}}>{fmt(t.total)}</div></div></div>)}</div>
        {tickets.length>0&&<div style={{marginTop:"16px",padding:"16px 20px",background:"rgba(39,33,232,0.08)",border:"1px solid rgba(39,33,232,0.2)",borderRadius:"12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"13px",color:"rgba(255,255,255,0.5)"}}>{tickets.length} tickets</div><div style={{fontSize:"20px",fontWeight:700}}>{fmt(totalHoy)}</div></div>}
      </div>}

      {view==="pos"&&<div style={{flex:1,display:"grid",gridTemplateColumns:showAgenda&&fechaCita&&!esDom?"380px 1fr 380px":"1fr 380px",overflow:"hidden"}}>
        {showAgenda&&fechaCita&&!esDom&&<div style={{borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",background:"rgba(0,0,0,0.15)",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:"11px",letterSpacing:"1px",color:"rgba(255,255,255,0.3)"}}>AGENDA DEL DÍA</div><button onClick={()=>setShowAgenda(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:"16px"}}>×</button></div>
          <div style={{flex:1,overflow:"auto"}}><MiniAgendaDia session={session} fecha={fechaCita} onSelectHora={h=>setHoraCita(h)} horaSeleccionada={horaCita} duracion={tipoSvc.duracion}/></div>
        </div>}

        <div style={{display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
            <div style={{display:"flex",gap:"6px",marginBottom:"10px",flexWrap:"wrap"}}>{FILTROS.map(f=><button key={f} onClick={()=>setFiltro(f)} style={{padding:"6px 14px",borderRadius:"20px",border:"1px solid",fontSize:"12px",fontWeight:500,cursor:"pointer",transition:"all 0.15s",background:filtro===f?"#2721E8":"transparent",borderColor:filtro===f?"#2721E8":"rgba(255,255,255,0.12)",color:filtro===f?"#fff":"rgba(255,255,255,0.45)"}}>{f}</button>)}</div>
            <input className="inp" placeholder="Buscar servicio..." value={busq} onChange={e=>setBusq(e.target.value)} style={{padding:"8px 14px",fontSize:"12px"}}/>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
            {itemsFilt.map(item=>{const ec=carrito.find(x=>x.nombre===item.nombre);const cat=item.categoria.replace(" Láser","").replace("Zonas Individuales","Individual").replace("Corporal","Corp.");return(
              <div key={item.nombre} onClick={()=>sel(item)} style={{background:ec?"rgba(39,33,232,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${ec?"rgba(39,33,232,0.5)":"rgba(255,255,255,0.08)"}`,borderRadius:"12px",padding:"14px 14px 12px",cursor:"pointer",transition:"all 0.15s",position:"relative"}} onMouseEnter={e=>{if(!ec)e.currentTarget.style.background="rgba(255,255,255,0.06)";}} onMouseLeave={e=>{e.currentTarget.style.background=ec?"rgba(39,33,232,0.15)":"rgba(255,255,255,0.03)";}}>
                <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",letterSpacing:"1px",marginBottom:"5px",textTransform:"uppercase"}}>{cat}</div>
                <div style={{fontSize:"13px",fontWeight:600,lineHeight:1.3,marginBottom:"8px",minHeight:"36px"}}>{item.nombre}</div>
                <div style={{fontSize:"16px",fontWeight:700,color:"#49B8D3"}}>{fmt(item.precio)}</div>
                {item.msi?.length>0&&<div style={{fontSize:"9px",color:"rgba(255,255,255,0.25)",marginTop:"3px"}}>hasta {Math.max(...item.msi)} MSI</div>}
                {ec&&<div style={{position:"absolute",top:"8px",right:"8px",width:"22px",height:"22px",borderRadius:"50%",background:"#2721E8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700}}>✓</div>}
              </div>);})}
          </div></div>
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
                  {cliResults.length>0&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1a1b2e",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",zIndex:20,overflow:"hidden",marginTop:"4px"}}>{cliResults.map(c=><div key={c.id} className="clienta-sugg" onClick={()=>selCliPOS(c)}><div style={{fontSize:"13px",fontWeight:500}}>{c.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>{c.telefono||"—"}</div></div>)}</div>}
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
              <input type="date" className="inp" value={fechaCita} min={hoy()} onChange={e=>{setFechaCita(e.target.value);setHoraCita("");if(e.target.value)setShowAgenda(true);}} style={{fontSize:"12px",padding:"8px 12px",colorScheme:"dark",marginBottom:"6px"}}/>
              {fechaCita&&!esDom&&<div>
                <button className="btn-ghost" style={{width:"100%",fontSize:"11px",marginBottom:"6px",borderColor:showAgenda?"#2721E8":"rgba(255,255,255,0.1)",color:showAgenda?"#fff":"rgba(255,255,255,0.4)"}} onClick={()=>setShowAgenda(!showAgenda)}>{showAgenda?"📅 Viendo agenda":"📅 Ver agenda del día"}</button>
                {!showAgenda&&<input type="time" className="inp" value={horaCita} onChange={e=>setHoraCita(e.target.value)} style={{fontSize:"12px",padding:"8px 12px",colorScheme:"dark"}}/>}
                {aOk&&<div style={{padding:"8px 10px",background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"8px",marginTop:"6px",fontSize:"11px",color:"#10b981"}}>✓ {new Date(fechaCita+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · {horaCita} – {horaFin(horaCita,tipoSvc.duracion)} · {tipoSvc.label}</div>}
              </div>}
              {esDom&&<div style={{fontSize:"11px",color:"#ff6b6b",padding:"6px 0"}}>⚠ Domingo — cerrado</div>}
            </div>}
          </div>
          {todo&&!esDom&&<div style={{padding:"12px 18px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}><button className="btn-blue" style={{width:"100%",padding:"13px",fontSize:"14px"}} onClick={()=>setShowConfirm(true)}>Cobrar {fmt(total)}</button></div>}
        </div>
      </div>}

      {showConfirm&&<div className="overlay"><div className="glass" style={{width:420,padding:"28px"}}>
        <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>CONFIRMAR COBRO</div>
        <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"18px"}}>
          <div style={{padding:"12px",background:"rgba(0,0,0,0.3)",borderRadius:"10px"}}><div style={{fontSize:"12px",fontWeight:600,marginBottom:"4px"}}>{carrito[0]?.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Clienta: {nombreFinal}{tipoTicket==="recompra"?" (Recompra)":""}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>📅 {new Date(fechaCita+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})} · {horaCita} – {horaFin(horaCita,tipoSvc.duracion)}</div></div>
          <div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>MÉTODO DE PAGO</div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px"}}>{["Efectivo","Débito","Crédito","Transferencia","Depósito"].map(m=><button key={m} className="btn-ghost" style={{borderColor:metodo===m?"#2721E8":"rgba(255,255,255,0.1)",color:metodo===m?"#fff":"rgba(255,255,255,0.4)",padding:"8px",fontSize:"11px"}} onClick={()=>{setMetodo(m);if(m!=="Crédito")setMsiSel(0);}}>{m}</button>)}</div></div>
          {metodo==="Crédito"&&msiD.length>0&&<div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"6px",letterSpacing:"1px"}}>MSI</div><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}><button className="btn-ghost" style={{borderColor:msiSel===0?"#2721E8":"rgba(255,255,255,0.1)",color:msiSel===0?"#fff":"rgba(255,255,255,0.4)",padding:"7px 12px",fontSize:"11px"}} onClick={()=>setMsiSel(0)}>Sin MSI</button>{msiD.map(m=><button key={m} className="btn-ghost" style={{borderColor:msiSel===m?"#2721E8":"rgba(255,255,255,0.1)",color:msiSel===m?"#fff":"rgba(255,255,255,0.4)",padding:"7px 12px",fontSize:"11px"}} onClick={()=>setMsiSel(m)}>{m} MSI</button>)}</div></div>}
          {metodo==="Efectivo"&&<div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px",background:"rgba(16,185,129,0.06)",borderRadius:"8px",border:"1px solid rgba(16,185,129,0.2)"}}><span style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>Desc. 5%</span><button className="btn-ghost" style={{borderColor:descuento===5?"#10b981":"rgba(255,255,255,0.1)",color:descuento===5?"#10b981":"rgba(255,255,255,0.4)",padding:"5px 12px",fontSize:"11px"}} onClick={()=>setDescuento(descuento===5?0:5)}>{descuento===5?"✓ Aplicado":"Aplicar"}</button></div>}
          <div style={{padding:"14px",background:"rgba(0,0,0,0.3)",borderRadius:"10px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"6px"}}><span style={{color:"rgba(255,255,255,0.5)"}}>{carrito[0]?.nombre}</span><span>{fmt(total)}</span></div><div style={{height:"1px",background:"rgba(255,255,255,0.08)",marginBottom:"6px"}}/>{descuento>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",color:"#ff8a65",marginBottom:"6px"}}><span>Desc. {descuento}%</span><span>-{fmt(total*descuento/100)}</span></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:"20px",fontWeight:700}}><span>Total</span><span style={{color:"#49B8D3"}}>{fmt(totalCD)}</span></div>{msiSel>0&&<div style={{fontSize:"12px",color:"#49B8D3",textAlign:"right",marginTop:"4px"}}>{fmt(totalCD/msiSel)}/mes × {msiSel}</div>}</div>
        </div>
        <div style={{display:"flex",gap:"10px"}}><button className="btn-ghost" onClick={()=>setShowConfirm(false)} style={{flex:1,padding:"13px"}}>Cancelar</button><button className="btn-blue" onClick={cerrar} disabled={saving||!metodo} style={{flex:2,padding:"13px",fontSize:"15px"}}>{saving?"Guardando...":"✓ Confirmar cobro"}</button></div>
      </div></div>}

      {showExito&&<div className="overlay" style={{zIndex:300}}><div className="glass" style={{width:400,padding:"40px",textAlign:"center",borderColor:"rgba(16,185,129,0.3)"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>✅</div><div style={{fontSize:"18px",fontWeight:700,marginBottom:"6px"}}>¡Ticket creado!</div><div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)"}}>{tipoTicket==="recompra"?"Recompra":"Ficha"} de {nombreFinal} + cita agendada</div></div></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — Vista ejecutiva para dueño de negocio
// ══════════════════════════════════════════════════════════════════════════════
const inicioSemana=()=>{const d=new Date(),dow=d.getDay();d.setDate(d.getDate()-(dow===0?6:dow-1));return d.toISOString().slice(0,10);};
const semanaLabel=()=>{const ini=new Date(inicioSemana()+"T12:00:00"),fin=new Date(ini);fin.setDate(ini.getDate()+6);return`${ini.toLocaleDateString("es-MX",{day:"numeric",month:"short"})} – ${fin.toLocaleDateString("es-MX",{day:"numeric",month:"short"})}`;};

function Dashboard({onLogout}){
  useCSSInjection();
  const[tab,setTab]=useState("resumen");
  const[periodo,setPeriodo]=useState("semana"); // "semana" | "mes"
  const[tickets,setTickets]=useState([]);
  const[citas,setCitas]=useState([]);
  const[loadingDB,setLoadingDB]=useState(false);
  const[metaData,setMetaData]=useState(null);
  const[loadingMeta,setLoadingMeta]=useState(false);
  const[metaError,setMetaError]=useState("");
  const[posSuc,setPosSuc]=useState(null);

  const desde=periodo==="semana"?inicioSemana():inicioMes();
  const periodoLabel=periodo==="semana"?semanaLabel():mesLabel();

  const cargarDatos=async()=>{
    setLoadingDB(true);
    const[{data:tData},{data:cData}]=await Promise.all([
      supabase.from("tickets").select("*").gte("fecha",desde).lte("fecha",hoy()).order("created_at",{ascending:false}),
      supabase.from("citas").select("*").gte("fecha",desde).lte("fecha",hoy())
    ]);
    if(tData)setTickets(tData);
    if(cData)setCitas(cData);
    setLoadingDB(false);
  };
  const cargarMeta=async()=>{
    setLoadingMeta(true);setMetaError("");
    try{
      const since=desde,until=hoy(),fields="adset_name,spend,actions,impressions,clicks,reach";
      const url=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=adset&limit=200&access_token=${META_TOKEN}`;
      const res=await fetch(url);const json=await res.json();
      if(json.error){setMetaError(json.error.message);setLoadingMeta(false);return;}
      const rows=json.data||[];
      const getM=(a)=>{const f=(t)=>{const x=(a||[]).find(z=>z.action_type===t);return x?Number(x.value):0;};return f("onsite_conversion.messaging_conversation_started_7d")||f("onsite_conversion.total_messaging_connection")||f("onsite_conversion.messaging_first_reply")||f("contact");};
      let tS=0,tM=0,tI=0,tC=0,tA=0;
      const pS={};SUCURSALES_NAMES.forEach(s=>{pS[s]={spend:0,mensajes:0};});
      rows.forEach(r=>{const sp=Number(r.spend||0),ms=getM(r.actions),im=Number(r.impressions||0),cl=Number(r.clicks||0),al=Number(r.reach||0),nm=(r.adset_name||"").toLowerCase();tS+=sp;tM+=ms;tI+=im;tC+=cl;tA+=al;SUCURSALES_NAMES.forEach(s=>{if(nm.includes(s.toLowerCase())){pS[s].spend+=sp;pS[s].mensajes+=ms;}});});
      setMetaData({spend:tS,mensajes:tM,impresiones:tI,clics:tC,alcance:tA,porSucursal:pS});
    }catch(e){setMetaError("Error Meta.");}
    setLoadingMeta(false);
  };
  useEffect(()=>{cargarDatos();cargarMeta();},[periodo]);

  // ─── Métricas globales ─────────────────────────────────────────────────────
  const ventasTotal=tickets.reduce((s,t)=>s+Number(t.total),0);
  const nuevas=tickets.filter(t=>t.tipo_clienta==="Nueva").length;
  const recompras=tickets.filter(t=>t.tipo_clienta==="Recompra").length;
  const sesionesComp=citas.filter(c=>c.estado==="completada").length;
  const sesionesAg=citas.filter(c=>c.estado==="agendada").length;
  const ticketProm=tickets.length?ventasTotal/tickets.length:0;
  const inv=metaData?.spend||0;
  const msgs=metaData?.mensajes||0;
  const totalVentas=nuevas+recompras;
  const cpa=nuevas>0&&inv>0?inv/nuevas:0;
  const roas=inv>0?ventasTotal/inv:0;
  const convMsgVenta=msgs>0?((totalVentas/msgs)*100).toFixed(1):"—";
  const convMsgNueva=msgs>0?((nuevas/msgs)*100).toFixed(1):"—";
  const recompRatio=totalVentas>0?((recompras/totalVentas)*100).toFixed(0):"0";

  // ─── Por sucursal ──────────────────────────────────────────────────────────
  const porSuc=SUCURSALES_NAMES.map(n=>{
    const tks=tickets.filter(t=>t.sucursal_nombre===n);
    const cts=citas.filter(c=>c.sucursal_nombre===n);
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
  const sc={};tickets.forEach(t=>{(t.servicios||[]).forEach(s=>{sc[s]=(sc[s]||0)+1;});});const topS=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,8);const maxSvc=topS[0]?.[1]||1;
  const met={};tickets.forEach(t=>{const m=(t.metodo_pago||"").split(" ")[0];met[m]=(met[m]||0)+Number(t.total);});const topM=Object.entries(met).sort((a,b)=>b[1]-a[1]);
  const vD={};tickets.forEach(t=>{vD[t.fecha]=(vD[t.fecha]||0)+Number(t.total);});const dM=Object.entries(vD).sort((a,b)=>a[0].localeCompare(b[0]));const maxD=Math.max(...dM.map(d=>d[1]),1);

  if(posSuc)return<POS session={posSuc} onSwitchSucursal={()=>setPosSuc(null)} isAdmin={true}/>;
  return(
    <div style={{minHeight:"100vh",background:"#0C0D1A",color:"#fff"}}>
      {/* Topbar */}
      <div style={{padding:"0 28px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",height:"64px",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(20px)",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
          <div style={{fontSize:"20px",fontWeight:700,letterSpacing:"4px"}}>CIRE</div>
          <div style={{width:"1px",height:"20px",background:"rgba(255,255,255,0.1)"}}/>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",letterSpacing:"1px"}}>DASHBOARD</div>
          <div style={{display:"flex"}}>
            {["resumen","sucursales","servicios","meta","pos"].map(t=><div key={t} className="tab-dash" style={{borderBottomColor:tab===t?"#2721E8":"transparent",color:tab===t?"#fff":"rgba(255,255,255,0.35)"}} onClick={()=>setTab(t)}>
              {{resumen:"Resumen",sucursales:"Sucursales",servicios:"Servicios",meta:"Meta Ads",pos:"🖥 POS"}[t]}</div>)}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          {/* Periodo toggle */}
          <div style={{display:"flex",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",overflow:"hidden"}}>
            {[{v:"semana",l:"Semana"},{v:"mes",l:"Mes"}].map(p=><button key={p.v} onClick={()=>setPeriodo(p.v)} style={{padding:"5px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"none",background:periodo===p.v?"#2721E8":"transparent",color:periodo===p.v?"#fff":"rgba(255,255,255,0.35)",fontFamily:"'Albert Sans',sans-serif"}}>{p.l}</button>)}
          </div>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",textTransform:"capitalize"}}>{periodoLabel}</div>
          {loadingMeta?<div style={{fontSize:"11px",padding:"4px 10px",borderRadius:"20px",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.4)"}}>⟳</div>
            :metaError?<div style={{fontSize:"11px",padding:"4px 10px",borderRadius:"20px",background:"rgba(255,80,80,0.1)",color:"#ff6b6b",border:"1px solid rgba(255,80,80,0.3)"}}>⚠</div>
            :metaData?<div style={{fontSize:"11px",padding:"4px 10px",borderRadius:"20px",background:"rgba(16,185,129,0.1)",color:"#10b981",border:"1px solid rgba(16,185,129,0.3)"}}>● Meta</div>:null}
          <button className="btn-ghost" onClick={()=>{cargarDatos();cargarMeta();}}>↻</button>
          <button className="btn-ghost" onClick={onLogout}>Salir</button>
        </div>
      </div>

      <div style={{padding:"24px 28px",maxWidth:"1400px",margin:"0 auto"}}>

        {/* ═══ RESUMEN ═══ */}
        {tab==="resumen"&&<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
          {/* KPIs fila 1 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"14px"}}>
            {[
              {l:"VENTAS TOTALES",v:fmt(ventasTotal),s:`${fmtN(tickets.length)} tickets`,cls:"hi",cl:"#2721E8"},
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
          {/* Gráfica ventas por día */}
          <div className="glass" style={{padding:"24px"}}>
            <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"16px"}}>VENTAS POR DÍA</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:"4px",height:"140px"}}>
              {dM.map(([f,m])=>{const p=m/maxD;return<div key={f} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}><div style={{fontSize:"9px",fontWeight:600,color:"#49B8D3",marginBottom:"4px"}}>{m>=1000?`${(m/1000).toFixed(0)}k`:m}</div><div style={{width:"100%",maxWidth:"28px",height:`${Math.max(p*100,4)}%`,background:"linear-gradient(180deg,#2721E8,#49B8D3)",borderRadius:"4px 4px 0 0"}}/><div style={{fontSize:"8px",color:"rgba(255,255,255,0.2)",marginTop:"4px"}}>{new Date(f+"T12:00:00").toLocaleDateString("es-MX",{weekday:"narrow",day:"numeric"})}</div></div>;})}
            </div>
          </div>
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
          {metaData&&!metaError&&<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px"}}>
              {[{l:"INVERSIÓN",v:fmt(metaData.spend),c:"#f97316"},{l:"MENSAJES",v:fmtN(metaData.mensajes),c:"#a855f7"},{l:"CPA",v:cpa>0?fmt(cpa):"—",c:cpa>0&&cpa<40?"#10b981":"#f0c040"},{l:"ROAS",v:roas>0?`${roas.toFixed(1)}x`:"—",c:"#10b981"}].map(k=><div key={k.l} className="kpi"><div style={{fontSize:"10px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"10px"}}>{k.l}</div><div style={{fontSize:"28px",fontWeight:700,color:k.c}}>{k.v}</div></div>)}
            </div>
            {/* Tabla mensajes por sucursal */}
            <div className="glass" style={{overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>MENSAJES vs VENTAS POR SUCURSAL</div></div>
              <div style={{display:"grid",gridTemplateColumns:"32px 110px 1fr 90px 90px 90px 80px",padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                {["#","Sucursal","Mensajes","Inversión","Nuevas","CPA","Conv%"].map(h=><div key={h} style={{fontSize:"10px",letterSpacing:"1px",color:"rgba(255,255,255,0.25)"}}>{h}</div>)}
              </div>
              {porSuc.sort((a,b)=>b.mensajes-a.mensajes).map((s,i)=><div key={s.nombre} style={{display:"grid",gridTemplateColumns:"32px 110px 1fr 90px 90px 90px 80px",padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",alignItems:"center"}}>
                <div style={{fontSize:"14px",fontWeight:700,color:COLORES[s.nombre]}}>{i+1}</div>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s.nombre]}}/><span style={{fontSize:"13px",fontWeight:600}}>{s.nombre}</span></div>
                <div style={{paddingRight:"12px"}}><div style={{height:"6px",background:"rgba(255,255,255,0.04)",borderRadius:"3px"}}><div style={{width:`${s.mensajes>0?(s.mensajes/maxMs)*100:0}%`,height:"100%",background:COLORES[s.nombre],borderRadius:"3px"}}/></div><div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginTop:"3px"}}>{fmtN(s.mensajes)} msgs</div></div>
                <div style={{fontSize:"13px",fontWeight:600,color:"#f97316"}}>{s.spend>0?fmt(s.spend):"—"}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:"#10b981"}}>{s.nuevas}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:s.cpa>0&&s.cpa<40?"#10b981":s.cpa<60?"#f0c040":"#ff6b6b"}}>{s.cpa>0?fmt(s.cpa):"—"}</div>
                <div style={{fontSize:"13px",fontWeight:600,color:parseFloat(s.conv)>=10?"#10b981":"rgba(255,255,255,0.3)"}}>{s.conv==="—"?"—":`${s.conv}%`}</div>
              </div>)}
            </div>
            {/* Embudo */}
            {metaData.mensajes>0&&<div className="glass" style={{padding:"24px"}}>
              <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",marginBottom:"20px"}}>EMBUDO GLOBAL · {periodoLabel}</div>
              <div style={{display:"flex",alignItems:"stretch"}}>
                {[{label:"Alcance",value:fmtN(metaData.alcance),color:"#2721E8"},{label:"Clics",value:fmtN(metaData.clics),color:"#49B8D3",pct:metaData.alcance>0?((metaData.clics/metaData.alcance)*100).toFixed(1):0},{label:"Mensajes",value:fmtN(metaData.mensajes),color:"#a855f7",pct:metaData.clics>0?((metaData.mensajes/metaData.clics)*100).toFixed(1):0},{label:"Ventas",value:fmtN(totalVentas),color:"#10b981",pct:metaData.mensajes>0?((totalVentas/metaData.mensajes)*100).toFixed(1):0}].map((e,i)=>
                  <div key={e.label} style={{flex:1,padding:"20px 16px",background:`${e.color}12`,border:`1px solid ${e.color}33`,borderLeft:i>0?"none":"",borderRadius:i===0?"12px 0 0 12px":i===3?"0 12px 12px 0":"0",textAlign:"center"}}><div style={{fontSize:"24px",fontWeight:700,color:e.color}}>{e.value}</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",margin:"4px 0"}}>{e.label}</div>{i>0&&<div style={{fontSize:"11px",color:e.color,fontWeight:600}}>{e.pct}% del anterior</div>}</div>)}
              </div>
            </div>}
          </>}
          {loadingMeta&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>Conectando con Meta...</div>}
          {!loadingMeta&&metaError&&<div style={{textAlign:"center",padding:"32px",color:"#ff6b6b",background:"rgba(255,80,80,0.05)",borderRadius:"12px",border:"1px solid rgba(255,80,80,0.2)"}}><div style={{fontSize:"16px",marginBottom:"8px"}}>⚠️ {metaError}</div></div>}
        </div>}

        {/* ═══ VER POS ═══ */}
        {tab==="pos"&&<div style={{display:"flex",flexDirection:"column",gap:"16px"}}><div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)"}}>SELECCIONA SUCURSAL</div><div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"14px"}}>{USUARIOS.filter(u=>u.rol==="sucursal").map(s=><div key={s.id} className="glass" style={{padding:"24px 20px",cursor:"pointer",borderColor:`${s.color}44`,textAlign:"center"}} onClick={()=>setPosSuc(s)} onMouseEnter={e=>e.currentTarget.style.borderColor=s.color} onMouseLeave={e=>e.currentTarget.style.borderColor=`${s.color}44`}><div style={{width:"40px",height:"40px",borderRadius:"12px",background:`${s.color}22`,border:`1px solid ${s.color}44`,margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>🖥</div><div style={{fontSize:"15px",fontWeight:700,marginBottom:"4px"}}>{s.nombre}</div><div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>Ver POS →</div></div>)}</div></div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  useCSSInjection();
  const[session,setSession]=useState(null);const[user,setUser]=useState("");const[pass,setPass]=useState("");const[err,setErr]=useState("");
  function login(){const f=USUARIOS.find(u=>u.usuario===user.trim()&&u.password===pass);if(f){setSession(f);setErr("");}else setErr("Usuario o contraseña incorrectos");}
  if(!session)return(
    <div style={{minHeight:"100vh",background:"#0C0D1A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Albert Sans',sans-serif",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",width:500,height:500,borderRadius:"50%",background:"#2721E8",opacity:0.08,filter:"blur(100px)",top:"-150px",left:"-150px",pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"#49B8D3",opacity:0.06,filter:"blur(80px)",bottom:"0px",right:"0px",pointerEvents:"none"}}/>
      <div className="glass" style={{width:420,padding:"52px 44px",position:"relative"}}>
        <div style={{textAlign:"center",marginBottom:"36px"}}><div style={{fontSize:"10px",letterSpacing:"5px",color:"#49B8D3",marginBottom:"10px",fontWeight:500}}>SISTEMA INTERNO</div><div style={{fontSize:"42px",fontWeight:700,color:"#fff",letterSpacing:"8px",lineHeight:1}}>CIRE</div><div style={{fontSize:"12px",color:"rgba(255,255,255,0.25)",marginTop:"8px",letterSpacing:"1px"}}>Depilación Láser</div></div>
        <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"20px"}}><input className="inp" placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/><input className="inp" type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={{padding:"13px 16px",fontSize:"14px",borderRadius:"12px"}}/>{err&&<div style={{color:"#ff6b6b",fontSize:"13px",textAlign:"center"}}>{err}</div>}</div>
        <button className="btn-blue" style={{width:"100%",padding:"14px",fontSize:"15px",borderRadius:"12px"}} onClick={login}>Entrar →</button>
        <div style={{marginTop:"20px",fontSize:"10px",color:"rgba(255,255,255,0.1)",textAlign:"center",letterSpacing:"2px"}}>ACCESO RESTRINGIDO</div>
      </div>
    </div>
  );
  if(session.rol==="admin")return<Dashboard onLogout={()=>setSession(null)}/>;
  return<POS session={session} onSwitchSucursal={()=>setSession(null)} isAdmin={false}/>;
}
