import { useState, useEffect, useRef, useMemo } from "react";
import { supabase, META_TOKEN, META_ACCOUNT, CLAUDE_KEY } from "../../lib/supabase.js";
import { useT } from "../../lib/theme.jsx";
import { USUARIOS, SUCURSALES_NAMES, COLORES, fmt, cdmx } from "../../lib/constantes.js";
import { renderMarkdown } from "../../lib/markdown.jsx";
import { fetchZettleRaw, fetchHistorialMensualCacheado } from "../../lib/zettle.js";
import { indiceEstacionalPooled, backtestWalkForward, proyectar, siguienteMes } from "./forecast.js";
import { mesAnioAnterior } from "./semanal.js";
import MesAMes from "./MesAMes.jsx";
import Proyeccion from "./Proyeccion.jsx";
import ResumenFinanciero from "./ResumenFinanciero.jsx";
import PasarelasZettle from "./PasarelasZettle.jsx";

export default
function EstadoFinanciero({sucursalesFiltro=null,sucursalesPropias=null,esAdmin=false,mesSel,onCambiarMes,mesDesde,mesHasta,mesSelLabel,periodoLabel,filtro,tickets,setTickets,topMet,ventasTotal,maxMet}){
  const{light,T}=useT();
  const sucVisible=sucursalesFiltro||SUCURSALES_NAMES;
  const esSocia=!!sucursalesFiltro&&!sucursalesPropias;
  const puedeMV=!esSocia;

  const antYM=(ym)=>{const[y,m]=ym.split("-").map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,"0")}`;};
  const rango=(ym)=>{const[y,m]=ym.split("-").map(Number);return{desde:`${ym}-01`,hasta:new Date(y,m,0).toISOString().slice(0,10)};};
  const etiq=(ym)=>new Date(`${ym}-15`).toLocaleDateString("es-MX",{month:"long",year:"numeric"});
  const hoyYM=()=>cdmx().slice(0,7);
  const listaMeses=(()=>{const hoy=new Date();const start=new Date(2024,0,1);const total=(hoy.getFullYear()-start.getFullYear())*12+(hoy.getMonth()-start.getMonth())+1;return Array.from({length:total},(_,i)=>{const d=new Date(hoy.getFullYear(),hoy.getMonth()-i,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});})();

  // El mes lo controla el filtro superior del Dashboard (mesSel) — una sola fuente
  // de verdad para los 4 sub-tabs, en vez del selector PERÍODO que Finanzas tenía antes.
  const periodo=mesSel||hoyYM();
  const[subtab,setSubtab]=useState("mesames");// "mesames" | "proyeccion" | "comisiones" | "pasarelas"
  const[vista,setVista]=useState("individual");// vista de P&L dentro del sub-tab "Mes a mes": individual | consolidado | comparativa
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
  const[fMetodo,setFMetodo]=useState("Efectivo");
  const[nomRows,setNomRows]=useState([{nombre:"",monto:""}]);
  const[consRows,setConsRows]=useState([{nombre:"",monto:""}]);
  const[fRecurrente,setFRecurrente]=useState(false);
  const[gastoAbierto,setGastoAbierto]=useState(false);
  const[fTipoGasto,setFTipoGasto]=useState("recurrente");
  const[fPeriodo,setFPeriodo]=useState(hoyYM);
  const[historialVentas,setHistorialVentas]=useState([]);
  const[historialCompleto,setHistorialCompleto]=useState([]);
  const[loadingHistorial,setLoadingHistorial]=useState(false);
  const[loadingHist,setLoadingHist]=useState(false);
  const[tooltipBar,setTooltipBar]=useState(null);
  const[rangoGrafico,setRangoGrafico]=useState("12m");
  const[ventasSemanales,setVentasSemanales]=useState(null);
  const[loadingSemanales,setLoadingSemanales]=useState(false);
  const[comData,setComData]=useState([]);
  const[loadingCom,setLoadingCom]=useState(false);
  const[comSubTab,setComSubTab]=useState("tabla");
  const[comZettleTotal,setComZettleTotal]=useState(null);
  const[loadingComZettle,setLoadingComZettle]=useState(false);
  const[moverFila,setMoverFila]=useState(null);
  const[buscarCom,setBuscarCom]=useState("");
  const[editMontoCom,setEditMontoCom]=useState(null);
  const[editMontoVal,setEditMontoVal]=useState("");
  const[editTerminalCom,setEditTerminalCom]=useState(null);
  const[editMsiCom,setEditMsiCom]=useState(null);
  const[confirmDelCom,setConfirmDelCom]=useState(null);

  // Trae tickets directamente de Supabase (más rápido que pasar por la Edge Function)
  const fetchTicketsDB=async(desde,hasta)=>{
    const{data}=await supabase.from("tickets").select("sucursal_nombre,total,fecha").gte("fecha",desde).lte("fecha",hasta);
    return data||[];
  };


  const fetchVentasDB=async(desde,hasta)=>{
    const todas=await fetchZettleRaw(desde,hasta);
    const m={};SUCURSALES_NAMES.forEach(s=>{m[s]=0;});
    todas.forEach(t=>{if(m[t.sucursal]!==undefined)m[t.sucursal]+=Number(t.total);});
    return m;
  };

  // Fetch del mes corriente desde Zettle (para el gráfico histórico)
  const fetchMesActualTickets=async()=>{
    const ma=hoyYM();
    const hoy=new Date().toISOString().slice(0,10);
    const todas=await fetchZettleRaw(`${ma}-01`,hoy);
    const row={mes:ma};SUCURSALES_NAMES.forEach(s=>{row[s]=0;});
    todas.forEach(t=>{if(row[t.sucursal]!==undefined)row[t.sucursal]+=Number(t.total);});
    return row;
  };

  const cargarHistorial=async()=>{
    setLoadingHistorial(true);
    const hoy=new Date();
    const meses=Array.from({length:24},(_,i)=>{const d=new Date(hoy.getFullYear(),hoy.getMonth()-i-1,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}).reverse();
    const desde=`${meses[0]}-01`;
    const[hy,hm]=meses[23].split("-").map(Number);
    const hasta=new Date(hy,hm,0).toISOString().slice(0,10);
    const[todas,mesActual]=await Promise.all([fetchZettleRaw(desde,hasta),fetchMesActualTickets()]);
    const byMes={};
    meses.forEach(m=>{byMes[m]={};SUCURSALES_NAMES.forEach(s=>{byMes[m][s]=0;});});
    todas.forEach(t=>{const m=t.fecha.slice(0,7);if(byMes[m]&&byMes[m][t.sucursal]!==undefined)byMes[m][t.sucursal]+=Number(t.total);});
    setHistorialVentas([...meses.map(m=>({mes:m,...byMes[m]})),mesActual]);
    setLoadingHistorial(false);
  };

  const cargarHistorialCompleto=async()=>{
    setLoadingHist(true);
    setHistorialCompleto(await fetchHistorialMensualCacheado(SUCURSALES_NAMES));
    setLoadingHist(false);
  };

  const cargarVentasSemanales=async(ym)=>{
    setLoadingSemanales(true);
    const[y,m]=ym.split("-").map(Number);
    const desde=`${ym}-01`;
    const diasEnMes=new Date(y,m,0).getDate();
    const hasta=`${ym}-${String(diasEnMes).padStart(2,"0")}`;
    const tickets=await fetchZettleRaw(desde,hasta);
    const semanas=[];
    for(let ini=1;ini<=diasEnMes;ini+=7){
      const fin=Math.min(ini+6,diasEnMes);
      const row={semana:semanas.length+1,desde:`${ym}-${String(ini).padStart(2,"0")}`,hasta:`${ym}-${String(fin).padStart(2,"0")}`};
      SUCURSALES_NAMES.forEach(s=>{row[s]=0;});
      semanas.push(row);
    }
    tickets.forEach(t=>{
      const dia=parseInt(t.fecha.slice(8,10));
      const semIdx=Math.min(Math.floor((dia-1)/7),semanas.length-1);
      if(semanas[semIdx]&&semanas[semIdx][t.sucursal]!==undefined)semanas[semIdx][t.sucursal]+=Number(t.total);
    });
    const totalMes={};SUCURSALES_NAMES.forEach(s=>{totalMes[s]=semanas.reduce((a,r)=>a+r[s],0);});
    setVentasSemanales({semanas,totalMes});
    setLoadingSemanales(false);
  };


  const cargar=async()=>{
    setLoading(true);
    const{desde,hasta}=rango(periodo);
    const{desde:dA,hasta:hA}=rango(antYM(periodo));
    const[{data:g}]=await Promise.all([
      supabase.from("gastos_operativos").select("*").eq("periodo",periodo),
    ]);
    const[ventasMap,ventasAntMap]=await Promise.all([
      fetchVentasDB(desde,hasta),
      fetchVentasDB(dA,hA),
    ]);
    setVentas(ventasMap);setVentasAnt(ventasAntMap);setGastos(g||[]);
    if(META_TOKEN&&META_ACCOUNT){
      try{
        const url=`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights?fields=campaign_name,adset_name,spend&time_range={"since":"${desde}","until":"${hasta}"}&level=adset&limit=200&access_token=${META_TOKEN}`;
        const json=await(await fetch(url)).json();
        const ms={};SUCURSALES_NAMES.forEach(s=>{ms[s]=0;});
        (json.data||[]).forEach(r=>{const nm=(r.adset_name||"").toLowerCase();const cn=(r.campaign_name||"").toLowerCase();const comb=nm+" "+cn;const sp=Number(r.spend||0);const n=SUCURSALES_NAMES.length;if(comb.includes("coapa")){ms["Coapa"]+=sp;}else if(nm.includes("valle")){ms["Valle"]+=sp/2;ms["Polanco"]+=sp/2;}else if(nm.includes("5 sucursales")){SUCURSALES_NAMES.forEach(s=>{ms[s]+=sp/n;});}else{SUCURSALES_NAMES.forEach(s=>{if(nm.includes(s.toLowerCase()))ms[s]+=sp;});}});
        setMetaGs(ms);
      }catch{}
    }
    setLoading(false);
  };

  useEffect(()=>{cargar();setAiTxt("");cargarVentasSemanales(periodo);},[periodo]);
  useEffect(()=>{if(vista==="individual"){setFSuc(sucSel);setFPeriodo(periodo);}},[vista,sucSel,periodo]);

  const PRODUCTOS_FISICOS=["Inhibidor de vello Beautive","Exfoliante corporal Beautive","Moisten Ácido Hialurónico","Moisten PDRN","Depilsense Inhibidor de Vello Aspid Pro","Talco Líquido Despigmentante Aspid Pro","Moisten Crema"];
  const TIERS_RECEP=[{desde:350000,pct:3.00},{desde:300000,pct:2.50},{desde:250000,pct:2.25},{desde:210000,pct:2.00},{desde:190000,pct:1.75},{desde:160000,pct:1.50},{desde:130000,pct:1.25},{desde:90000,pct:1.00},{desde:0,pct:0}];
  const getTierRecep=(base)=>TIERS_RECEP.find(t=>base>=t.desde)||{desde:0,pct:0};
  const TASAS_BASE_COM={Zettle:3.5,BBVA:0.85,Banorte:0.55,"Mercado Pago":2.99};
  const TASAS_MSI_COM={
    "Mercado Pago":{3:3.48,6:5.99,9:8.99,12:11.98},
    Banorte:{3:3.5,6:5.50,9:8.5,12:11.5},
    BBVA:{3:3,6:6,9:8,12:10},
    Zettle:{3:4,6:7,9:9,12:12},
  };
  const calcCom=(t)=>{
    const mp=t.metodo_pago||"";
    const terminal=t.comision_terminal_override||(mp.includes(" · ")?mp.replace(/^.* · /,"").trim():null);
    const msiM=(mp.match(/(\d+)MSI/)||[])[1];
    const msiMeses=t.comision_msi_override!==undefined&&t.comision_msi_override!==null?t.comision_msi_override:(msiM?parseInt(msiM):null);
    const tBase=TASAS_BASE_COM[terminal]||0;
    const tMsi=(TASAS_MSI_COM[terminal]&&msiMeses&&TASAS_MSI_COM[terminal][msiMeses])||0;
    const monto=Number(t.comision_monto??t.total)||0;
    const cBase=Math.round(monto*(tBase*1.16/100)*100)/100;
    const cMsi=Math.round(monto*(tMsi*1.16/100)*100)/100;
    const cTotal=Math.round((cBase+cMsi)*100)/100;
    const mRec=Math.round((monto-cTotal)*100)/100;
    const serviciosArr=t.servicios||[];
    const esSoloProductos=serviciosArr.length>0&&serviciosArr.every(s=>PRODUCTOS_FISICOS.includes(s));
    const esCera=serviciosArr.some(s=>s.toLowerCase().includes("cera"));
    const cCos=esSoloProductos?null:Math.round(mRec*(esCera?0.10:0.05)*100)/100;
    const hora=t.created_at?new Date(t.created_at).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"—";
    const capturista=USUARIOS.find(u=>u.usuario===t.usuario)?.nombre||t.usuario||"Importado";
    return{id:t.id,fecha:t.fecha,comision_periodo:t.comision_periodo||null,comision_monto:t.comision_monto??null,comision_terminal_override:t.comision_terminal_override||null,comision_msi_override:t.comision_msi_override??null,recibo:t.ticket_zettle||"—",zona:t.sucursal_nombre,nombre:t.clienta_nombre||t.clienta||"—",servicios:(t.servicios||[]).join(", "),metodo_pago:mp,terminal:terminal||"Efectivo / Otro",msi_meses:msiMeses,monto,com_base:cBase,com_msi:cMsi,com_terminal:cTotal,monto_recibido:mRec,com_cosmetara:cCos,usuario:capturista,hora};
  };
  const cargarComisiones=async()=>{
    setLoadingCom(true);
    try{
      const{desde,hasta}=rango(periodo);
      const[y,m]=desde.split("-").map(Number);
      const desdeExt=new Date(y,m-1,0).toISOString().slice(0,10);
      const colsExtra="comision_periodo,comision_monto,comision_terminal_override,comision_msi_override,";
      const colsBase="id,fecha,ticket_zettle,sucursal_nombre,clienta_nombre,clienta,servicios,metodo_pago,total,usuario,created_at";
      const applyFiltroSuc=(q)=>{
        if(esSocia||subtab==="comisiones")return q.ilike("sucursal_nombre",`%${sucSel}%`);
        if(sucursalesFiltro)return q.in("sucursal_nombre",sucursalesFiltro);
        return q;
      };
      // Intentar con columnas extra; si falla, usar solo columnas base
      let r1,r2;
      const q1Full=applyFiltroSuc(supabase.from("tickets").select(colsExtra+colsBase).gte("fecha",desdeExt).lte("fecha",hasta).is("comision_periodo",null).neq("fuente","zettle")).order("fecha").order("created_at");
      const q2Full=applyFiltroSuc(supabase.from("tickets").select(colsExtra+colsBase).eq("comision_periodo",periodo).neq("fuente","zettle")).order("fecha").order("created_at");
      [r1,r2]=await Promise.all([q1Full,q2Full]);
      if(r1.error||r2.error){
        // Fallback sin columnas extra (migraciones pendientes)
        const q1=applyFiltroSuc(supabase.from("tickets").select(colsBase).gte("fecha",desdeExt).lte("fecha",hasta).neq("fuente","zettle")).order("fecha").order("created_at");
        [r1]= await Promise.all([q1]);
        r2={data:[]};
      }
      const ids=new Set();
      const data=[...(r1.data||[]),...(r2.data||[])].filter(t=>{if(ids.has(t.id))return false;ids.add(t.id);return true;});
      data.sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:0);
      setComData(data.map(calcCom));
    }catch(e){console.error("cargarComisiones:",e);}
    setLoadingCom(false);
  };
  const cargarComparativoZettle=async()=>{
    setLoadingComZettle(true);
    try{
      const{desde,hasta}=rango(periodo);
      let q=supabase.from("tickets").select("total,sucursal_nombre,fecha").eq("fuente","zettle").gte("fecha",desde).lte("fecha",hasta);
      if(esSocia||subtab==="comisiones")q=q.ilike("sucursal_nombre",`%${sucSel}%`);
      else if(sucursalesFiltro)q=q.in("sucursal_nombre",sucursalesFiltro);
      const{data,error}=await q;
      if(error)throw error;
      setComZettleTotal({total:(data||[]).reduce((s,t)=>s+Number(t.total||0),0),count:(data||[]).length});
    }catch(e){console.error("cargarComparativoZettle:",e);setComZettleTotal(null);}
    setLoadingComZettle(false);
  };
  useEffect(()=>{if(subtab==="comisiones")cargarComisiones();},[subtab,periodo,sucSel]);
  useEffect(()=>{if(subtab==="comisiones"&&comSubTab==="comparativo")cargarComparativoZettle();},[subtab,comSubTab,periodo,sucSel]);
  const exportarComPDF=()=>{
    const tot=comData.reduce((a,r)=>({monto:a.monto+r.monto,com_base:a.com_base+r.com_base,com_msi:a.com_msi+r.com_msi,com_terminal:a.com_terminal+r.com_terminal,monto_recibido:a.monto_recibido+r.monto_recibido,com_cosmetara:a.com_cosmetara+(r.com_cosmetara||0)}),{monto:0,com_base:0,com_msi:0,com_terminal:0,monto_recibido:0,com_cosmetara:0});
    const r2=v=>Math.round(v*100)/100;
    const fmtP=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(v);
    const baseRecepPDF=r2(tot.monto_recibido-tot.com_cosmetara);
    const tierPDF=getTierRecep(baseRecepPDF);
    const comRecepPDF=r2(baseRecepPDF*tierPDF.pct/100);
    const nextTierPDF=TIERS_RECEP.filter(t=>t.desde>baseRecepPDF).at(-1);
    const rows=comData.map((r,i)=>`<tr style="background:${i%2===0?"#fff":"#f9fafb"}">
      <td>${r.fecha}</td><td style="font-size:10px;color:#555">${r.hora}</td><td style="font-family:monospace;font-size:10px">${r.recibo}</td>
      <td style="font-weight:600">${r.nombre}</td><td style="font-size:10px;color:#555">${r.usuario}</td><td style="color:#555">${r.servicios}</td>
      <td><span style="padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;background:${r.terminal==="Efectivo / Otro"?"#f3f4f6":r.terminal==="Mercado Pago"?"#e0f7ff":r.terminal==="Zettle"?"#e0f4ff":"#ede9fe"};color:${r.terminal==="Efectivo / Otro"?"#6b7280":r.terminal==="Mercado Pago"?"#0072a3":r.terminal==="Zettle"?"#0e6a8a":"#5b21b6"}">${r.terminal}</span></td>
      <td style="text-align:center">${r.msi_meses||"—"}</td>
      <td style="text-align:right;font-weight:600">${fmtP(r.monto)}</td>
      <td style="text-align:right;color:#ea580c">${r.com_base>0?fmtP(r.com_base):"—"}</td>
      <td style="text-align:right;color:#ea580c">${r.com_msi>0?fmtP(r.com_msi):"—"}</td>
      <td style="text-align:right;font-weight:700;color:#ea580c">${r.com_terminal>0?fmtP(r.com_terminal):"—"}</td>
      <td style="text-align:right;font-weight:600;color:#16a34a">${fmtP(r.monto_recibido)}</td>
      <td style="text-align:right;font-weight:700;color:${r.com_cosmetara===null?"#d97706":"#0e6a8a"}">${r.com_cosmetara===null?"Pendiente":(r.com_cosmetara>0?fmtP(r.com_cosmetara):"—")}</td>
    </tr>`).join("");
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Comisiones ${sucSel} ${etiq(periodo)}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;padding:28px 32px}
      h1{font-size:18px;font-weight:700;margin-bottom:2px}
      .sub{font-size:12px;color:#555;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:#1e1e3a;color:#fff;padding:8px 9px;text-align:left;font-size:9px;letter-spacing:1px;white-space:nowrap}
      th.r{text-align:right}
      td{padding:7px 9px;border-bottom:1px solid #e5e7eb;vertical-align:middle;font-size:10.5px}
      tfoot td{border-top:2px solid #1e1e3a;background:#f0f0f8;font-weight:700;font-size:11px;padding:9px}
      tfoot td.r{text-align:right}
      @media print{@page{margin:14mm 12mm;size:A4 landscape}body{padding:0}}
    </style></head><body>
    <h1>Comisiones Cosmetaras — ${sucSel}</h1>
    <div class="sub">${etiq(periodo).toUpperCase()} · ${comData.length} registros</div>
    <table>
      <thead><tr>
        <th>Fecha</th><th>Hora</th><th>Recibo</th><th>Nombre</th><th>Usuario</th><th>Servicios</th><th>Terminal</th>
        <th style="text-align:center">MSI</th>
        <th class="r">Monto</th><th class="r">Com. Base</th><th class="r">Com. MSI</th>
        <th class="r">Com. Terminal</th><th class="r">Monto Recibido</th><th class="r">Com. Cosmetara</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="8">TOTAL</td>
        <td class="r">${fmtP(r2(tot.monto))}</td>
        <td class="r" style="color:#ea580c">${tot.com_base>0?fmtP(r2(tot.com_base)):"—"}</td>
        <td class="r" style="color:#ea580c">${tot.com_msi>0?fmtP(r2(tot.com_msi)):"—"}</td>
        <td class="r" style="color:#ea580c">${tot.com_terminal>0?fmtP(r2(tot.com_terminal)):"—"}</td>
        <td class="r" style="color:#16a34a">${fmtP(r2(tot.monto_recibido))}</td>
        <td class="r" style="color:#0e6a8a">${fmtP(r2(tot.com_cosmetara))}</td>
      </tr></tfoot>
    </table>
    <div style="margin-top:28px;page-break-inside:avoid">
      <div style="background:#1e1e3a;color:#fff;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:2px;border-radius:8px 8px 0 0">COMISIÓN RECEPCIÓN</div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:16px">
        <table style="width:100%;border-collapse:collapse;margin:0">
          <tr style="background:#f9fafb">
            <td style="padding:8px 12px;font-size:11px;color:#555">Ventas brutas</td>
            <td style="padding:8px 12px;text-align:right;font-weight:600">${fmtP(r2(tot.monto))}</td>
            <td style="padding:8px 12px;font-size:11px;color:#555">− Comisión terminal</td>
            <td style="padding:8px 12px;text-align:right;color:#ea580c;font-weight:600">-${fmtP(r2(tot.com_terminal))}</td>
            <td style="padding:8px 12px;font-size:11px;color:#555">− Comisión cosmetaras</td>
            <td style="padding:8px 12px;text-align:right;color:#0e6a8a;font-weight:600">-${fmtP(r2(tot.com_cosmetara))}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:11px;color:#555">Base recepcionista</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;color:#16a34a">${fmtP(baseRecepPDF)}</td>
            <td style="padding:8px 12px;font-size:11px;color:#555">Nivel alcanzado</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;color:#1e1e3a">${tierPDF.pct.toFixed(2)}%</td>
            ${nextTierPDF?`<td style="padding:8px 12px;font-size:10px;color:#888">Siguiente nivel: ${nextTierPDF.pct.toFixed(2)}% desde ${fmtP(nextTierPDF.desde)}</td><td></td>`:`<td colspan="2"></td>`}
          </tr>
        </table>
        <div style="margin-top:12px;padding:12px 16px;background:#f0f0f8;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;color:#444">${fmtP(baseRecepPDF)} × ${tierPDF.pct.toFixed(2)}%</div>
          <div style="font-size:22px;font-weight:800;color:${comRecepPDF>0?"#1e1e3a":"#999"}">${fmtP(comRecepPDF)}</div>
        </div>
      </div>
    </div>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;
    const w=window.open("","_blank");w.document.write(html);w.document.close();
  };
  const exportarReporteDirectivo=(sucsOverride)=>{
    const fmtP=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(v);
    const fmtPct=v=>v==null?"—":`${v>=0?"+":""}${v.toFixed(1)}%`;
    const fmtK=v=>v>=1000000?`$${(v/1000000).toFixed(1)}M`:v>=1000?`$${Math.round(v/1000)}k`:"$0";
    const sucsReporte=sucsOverride||((vista==="individual"||esSocia)?[sucSel]:vista==="consolidado"?sucMulti.filter(s=>sucVisible.includes(s)):sucVisible);
    const tituloSuc=sucsReporte.length===1?sucsReporte[0]:"Consolidado";
    const fechaEmision=new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"});
    const ventaDe=(row)=>sucsReporte.reduce((s,suc)=>s+(row?.[suc]||0),0);

    // Histórico cerrado hasta el período filtrado — mismo criterio que MesAMes/Proyeccion.
    const cerrado=historialCompleto.filter(r=>r.mes<=periodo&&r.mes<hoyYM());
    const ultimos12=cerrado.slice(-12);

    // Tabla Mes | Ventas | % MoM | % YoY
    const filasTabla=ultimos12.map(row=>{
      const venta=ventaDe(row);
      const rowAnt=historialCompleto.find(r=>r.mes===antYM(row.mes));
      const ventaAnt=rowAnt?ventaDe(rowAnt):0;
      const mom=ventaAnt>0?((venta-ventaAnt)/ventaAnt*100):null;
      const rowYoY=historialCompleto.find(r=>r.mes===mesAnioAnterior(row.mes));
      const ventaYoY=rowYoY?ventaDe(rowYoY):0;
      const yoy=ventaYoY>0?((venta-ventaYoY)/ventaYoY*100):null;
      return{mes:row.mes,venta,mom,yoy};
    });
    const filasTablaHTML=filasTabla.map((f,i)=>`<tr style="background:${i%2===0?"#fff":"#f9fafb"}">
      <td>${etiq(f.mes)}</td>
      <td style="text-align:right;font-weight:600">${fmtP(f.venta)}</td>
      <td style="text-align:right;color:${f.mom==null?"#999":f.mom>=0?"#16a34a":"#dc2626"}">${fmtPct(f.mom)}</td>
      <td style="text-align:right;color:${f.yoy==null?"#999":f.yoy>=0?"#16a34a":"#dc2626"}">${fmtPct(f.yoy)}</td>
    </tr>`).join("");

    // Gráfica de ventas mes a mes — mismo patrón visual que GraficoVentas, como SVG estático.
    const W=760,H=200,PL=60,PR=10,PT=10,PB=34;
    const cW=W-PL-PR,cH=H-PT-PB;
    const maxV=Math.max(...ultimos12.map(ventaDe),1);
    const gW=cW/(ultimos12.length||1);
    const bW=Math.max(6,gW*0.55);
    const gridSVG=[0,0.25,0.5,0.75,1].map(p=>{const y=PT+cH*(1-p);return`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#eee" stroke-width="1"/><text x="${PL-6}" y="${y+4}" text-anchor="end" font-size="8" fill="#999">${fmtK(maxV*p)}</text>`;}).join("");
    const barrasSVG=ultimos12.map((row,i)=>{
      const val=ventaDe(row);
      const bH=Math.max(val>0?2:0,(val/maxV)*cH);
      const x=PL+i*gW+(gW-bW)/2;
      const y=PT+cH-bH;
      const mesLbl=new Date(`${row.mes}-15`).toLocaleDateString("es-MX",{month:"short"}).replace(".","").toUpperCase().slice(0,3);
      return`<rect x="${x}" y="${y}" width="${bW}" height="${bH}" fill="${sucsReporte.length===1?(COLORES[sucsReporte[0]]||"#2721E8"):"#2721E8"}" opacity="0.85" rx="2"/>
        <text x="${x+bW/2}" y="${H-PB+14}" text-anchor="middle" font-size="9" fill="#666">${mesLbl}</text>
        <text x="${x+bW/2}" y="${Math.max(y-4,10)}" text-anchor="middle" font-size="8" fill="#444">${fmtK(val)}</text>`;
    }).join("");

    // Heatmap de estacionalidad — mismos umbrales que Proyeccion.jsx (≥1.15 Alto / ≤0.85 Bajo).
    const MESES_LABEL_RD=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const indice=indiceEstacionalPooled(cerrado,SUCURSALES_NAMES);

    // Proyección del mes siguiente — mismo modelo que Proyeccion.jsx: índice estacional +
    // backtest walk-forward sobre el histórico cerrado, con 2 escenarios (realista/optimista).
    const mesObjetivo=siguienteMes(periodo);
    const backtestProy=backtestWalkForward(cerrado,SUCURSALES_NAMES,indice);
    const proyPorSuc=sucsReporte.map(suc=>proyectar(cerrado,suc,mesObjetivo,indice,backtestProy)).filter(Boolean);
    const totalOptimista=proyPorSuc.reduce((a,p)=>a+p.desest.punto,0);
    const totalRealista=proyPorSuc.reduce((a,p)=>a+p.desest_castigado.punto,0);
    const presupuestoAds=totalRealista*0.15;
    const heatCells=MESES_LABEL_RD.map((l,i)=>{
      const v=indice[i+1]||1;
      const bg=v>=1.15?"#10b981":v<=0.85?"#ff6b6b":"#d8dedc";
      const txt=v>=1.15||v<=0.85?"#fff":"#555";
      return`<div style="flex:1;text-align:center;padding:10px 4px;background:${bg};color:${txt};border-radius:6px">
        <div style="font-size:9px;font-weight:700;letter-spacing:1px">${l.toUpperCase()}</div>
        <div style="font-size:13px;font-weight:800;margin-top:2px">${v.toFixed(2)}×</div>
      </div>`;
    }).join("");

    const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Reporte Directivo — ${tituloSuc} — ${etiq(periodo)}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;padding:32px 36px}
      h1{font-size:22px;font-weight:800;letter-spacing:-0.5px}
      .sub{font-size:12px;color:#666;margin-top:2px;margin-bottom:24px}
      h2{font-size:13px;font-weight:700;letter-spacing:1px;color:#333;margin:26px 0 10px;text-transform:uppercase}
      table{width:100%;border-collapse:collapse;font-size:11.5px}
      th{background:#1e1e3a;color:#fff;padding:8px 10px;text-align:left;font-size:9.5px;letter-spacing:1px}
      th.r,td.r{text-align:right}
      td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
      @media print{@page{margin:14mm 12mm;size:A4 portrait}body{padding:0}}
    </style></head><body>
    <h1>CIRE</h1>
    <div class="sub">Reporte Directivo · ${tituloSuc} · Emitido el ${fechaEmision}</div>

    <h2>Ventas mes a mes</h2>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%">${gridSVG}${barrasSVG}</svg>

    <h2>Detalle mensual</h2>
    <table>
      <thead><tr><th>Mes</th><th class="r">Ventas</th><th class="r">% MoM</th><th class="r">% YoY</th></tr></thead>
      <tbody>${filasTablaHTML}</tbody>
    </table>
    <div style="display:flex;gap:20px;font-size:9.5px;color:#777;margin-top:8px">
      <span><b>% MoM</b> (mes contra mes): variación vs. el mes inmediato anterior.</span>
      <span><b>% YoY</b> (año contra año): variación vs. el mismo mes del año pasado.</span>
    </div>

    <h2>Estacionalidad (índice combinado, 1.00 = mes promedio)</h2>
    <div style="display:flex;gap:4px;margin-bottom:8px">${heatCells}</div>
    <div style="display:flex;gap:16px;font-size:10px;color:#666">
      <span><span style="display:inline-block;width:9px;height:9px;background:#10b981;border-radius:2px;margin-right:4px"></span>Alto (≥1.15×)</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:#d8dedc;border-radius:2px;margin-right:4px"></span>Medio</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:#ff6b6b;border-radius:2px;margin-right:4px"></span>Bajo (≤0.85×)</span>
    </div>

    <h2>Proyección — ${etiq(mesObjetivo)}</h2>
    <div style="display:flex;gap:16px;margin-bottom:14px">
      <div style="flex:1;padding:14px 16px;background:#f0f0f8;border-radius:8px">
        <div style="font-size:10px;letter-spacing:1px;color:#444;font-weight:700">REALISTA</div>
        <div style="font-size:22px;font-weight:800;color:#1e1e3a;margin-top:4px">${fmtP(totalRealista)}</div>
      </div>
      <div style="flex:1;padding:14px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
        <div style="font-size:10px;letter-spacing:1px;color:#444;font-weight:700">OPTIMISTA (TECHO ESTADÍSTICO)</div>
        <div style="font-size:22px;font-weight:800;color:#555;margin-top:4px">${fmtP(totalOptimista)}</div>
      </div>
    </div>
    <div style="padding:12px 16px;background:#1e1e3a;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:#fff">Presupuesto Meta Ads recomendado · 15% del escenario realista</div>
      <div style="font-size:20px;font-weight:800;color:#fff">${fmtP(presupuestoAds)}</div>
    </div>

    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;
    const w=window.open("","_blank");w.document.write(html);w.document.close();
  };
  const moverComision=async(id,nuevoPeriodo)=>{
    await supabase.from("tickets").update({comision_periodo:nuevoPeriodo||null}).eq("id",id);
    setMoverFila(null);
    await cargarComisiones();
  };
  const eliminarFilaCom=async(id)=>{
    await supabase.from("tickets").delete().eq("id",id);
    setConfirmDelCom(null);
    await cargarComisiones();
  };
  const guardarMsiCom=async(id,val)=>{
    await supabase.from("tickets").update({comision_msi_override:val?Number(val):null}).eq("id",id);
    setEditMsiCom(null);
    await cargarComisiones();
  };
  const guardarTerminalCom=async(id,val)=>{
    await supabase.from("tickets").update({comision_terminal_override:val||null}).eq("id",id);
    setEditTerminalCom(null);
    await cargarComisiones();
  };
  const guardarMontoCom=async(id,val)=>{
    const n=Number(val);
    if(isNaN(n)||n<0)return;
    await supabase.from("tickets").update({comision_monto:n||null}).eq("id",id);
    setEditMontoCom(null);
    await cargarComisiones();
  };
  const mesesOpciones=(()=>{const res=[];let[y,m]=periodo.split("-").map(Number);for(let i=6;i>=1;i--){let mm=m-i,yy=y;if(mm<1){mm+=12;yy--;}res.push(`${yy}-${String(mm).padStart(2,"0")}`);}for(let i=1;i<=6;i++){let mm=m+i,yy=y;if(mm>12){mm-=12;yy++;}res.push(`${yy}-${String(mm).padStart(2,"0")}`);}return res;})();
  useEffect(()=>{cargarHistorial();},[]);
  useEffect(()=>{if((subtab==="mesames"||subtab==="proyeccion")&&historialCompleto.length===0)cargarHistorialCompleto();},[subtab]);

  const CATS_FIJAS=new Set(["contenido_digital","plataforma_cire","nomina","renta","servicios","otro","consumibles"]);
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
    const cons=g.filter(x=>x.categoria==="consumibles").reduce((s,x)=>s+Number(x.monto),0);
    const customCats=[...new Set(g.filter(x=>!CATS_FIJAS.has(x.categoria)).map(x=>x.categoria))];
    const customItems=customCats.map(cat=>{const items=g.filter(x=>x.categoria===cat);return{cat,label:cat,monto:items.reduce((s,x)=>s+Number(x.monto),0),items};});
    const customTotal=customItems.reduce((s,c)=>s+c.monto,0);
    const egr=cont+plt+meta+nom+ren+svc+otr+cons+customTotal;
    const util=ing-egr;
    return{ing,cont,plt,meta,nom,ren,svc,otr,cons,customItems,egr,util,mg:ing>0?(util/ing*100):null,nomItems:g.filter(x=>x.categoria==="nomina"),consItems:g.filter(x=>x.categoria==="consumibles")};
  };

  const plC=(sucs)=>{
    const ps=sucs.map(s=>pl(s));const sm=k=>ps.reduce((a,p)=>a+p[k],0);
    const customMap={};ps.forEach(p=>p.customItems.forEach(c=>{customMap[c.cat]=(customMap[c.cat]||0)+c.monto;}));
    const customItems=Object.entries(customMap).map(([cat,monto])=>({cat,label:cat,monto,items:[]}));
    const ing=sm("ing"),egr=sm("egr"),util=ing-egr;
    return{ing,egr,util,mg:ing>0?(util/ing*100):null,cont:sm("cont"),plt:sm("plt"),meta:sm("meta"),nom:sm("nom"),ren:sm("ren"),svc:sm("svc"),otr:sm("otr"),cons:sm("cons"),customItems};
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
          if(validas.length){const{error:ie}=await supabase.from("gastos_operativos").insert(validas.map(n=>({sucursal_id:fSuc,periodo:p,categoria:"nomina",concepto:n.nombre.trim(),monto:Number(n.monto),forma_pago:fMetodo})));if(ie)throw ie;}
        }
      }else if(fCat==="consumibles"){
        const validas=consRows.filter(n=>n.nombre.trim()&&Number(n.monto)>0);
        if(!validas.length){setSaving(false);return;}
        for(const p of periodos){
          const{error:ie}=await supabase.from("gastos_operativos").insert(validas.map(n=>({sucursal_id:fSuc,periodo:p,categoria:"consumibles",concepto:n.nombre.trim(),monto:Number(n.monto),forma_pago:fMetodo})));
          if(ie)throw ie;
        }
        setConsRows([{nombre:"",monto:""}]);
      }else if(fCat==="personalizado"){
        if(!fConc.trim()||!fMonto||isNaN(Number(fMonto))||Number(fMonto)<=0){setSaving(false);return;}
        const catPersonal=fConc.trim();
        for(const p of periodos){
          const{error:de}=await supabase.from("gastos_operativos").delete().eq("sucursal_id",fSuc).eq("periodo",p).eq("categoria",catPersonal);
          if(de)throw de;
          const{error:ie}=await supabase.from("gastos_operativos").insert([{sucursal_id:fSuc,periodo:p,categoria:catPersonal,concepto:catPersonal,monto:Number(fMonto),forma_pago:fMetodo,tipo:fTipoGasto}]);
          if(ie)throw ie;
        }
      }else{
        if(!fMonto||isNaN(Number(fMonto))||Number(fMonto)<=0){setSaving(false);return;}
        for(const p of periodos){
          if(fCat==="renta"||fCat==="servicios"||fCat==="contenido_digital"||fCat==="plataforma_cire"){const{error:de}=await supabase.from("gastos_operativos").delete().eq("sucursal_id",fSuc).eq("periodo",p).eq("categoria",fCat);if(de)throw de;}
          const{error:ie}=await supabase.from("gastos_operativos").insert([{sucursal_id:fSuc,periodo:p,categoria:fCat,concepto:fConc.trim()||fCat,monto:Number(fMonto),forma_pago:fMetodo,tipo:fTipoGasto}]);
          if(ie)throw ie;
        }
      }
      setFMonto("");setFConc("");setFTipoGasto("recurrente");
      if(fPeriodo===periodo)await cargar();
      else{onCambiarMes?.(fPeriodo);}
    }catch(err){
      alert(`Error al guardar: ${err.message||JSON.stringify(err)}`);
    }finally{
      setSaving(false);
    }
  };

  const borrarGasto=async(id)=>{await supabase.from("gastos_operativos").delete().eq("id",id);await cargar();};
  const borrarCategoria=async(suc,cat)=>{await supabase.from("gastos_operativos").delete().eq("sucursal_id",suc).eq("periodo",periodo).eq("categoria",cat);await cargar();};
  const[editMetodoId,setEditMetodoId]=useState(null);
  const actualizarFormaPago=async(id,val)=>{await supabase.from("gastos_operativos").update({forma_pago:val}).eq("id",id);setEditMetodoId(null);await cargar();};

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
      if(!res.ok){setAiTxt(`Error de la IA (${res.status}): ${json.error?.message||JSON.stringify(json)}`);return;}
      setAiTxt(json.content?.[0]?.text||"Sin respuesta de la IA.");
    }catch(e){setAiTxt(`Error al conectar con la IA: ${e.message}. Verifica tu VITE_CLAUDE_KEY en .env.local`);}
    setAiLoad(false);
  };

  const FilaGL=({l,v,c,neg=false,bold=false,indent=false,onDelete=null})=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.div}`}}>
      <span style={{fontSize:"13px",color:bold?(light?"#1a1a2e":"#fff"):indent?T.faint:T.muted,fontWeight:bold?700:400,paddingLeft:indent?"14px":"0"}}>{l}</span>
      <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
        <span style={{fontSize:"13px",fontWeight:bold?700:500,color:c||(neg?"#f97316":T.muted)}}>{fmt(v)}</span>
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
          {!showDelta&&<span style={{fontSize:"11px",color:T.sub}}>{etiq(periodo)}</span>}
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
        {p.cons>0&&<FilaGL l="Consumibles" v={p.cons} neg indent/>}
        {p.customItems.map(c=><div key={c.cat} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          <span style={{fontSize:"13px",color:T.muted,paddingLeft:"14px"}}>{c.label}</span>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <span style={{fontSize:"13px",fontWeight:500,color:"#f97316"}}>{fmt(c.monto)}</span>
            {!compact&&c.items.map(it=><span key={it.id} style={{display:"flex",gap:"6px",alignItems:"center"}}>
              {editMetodoId===it.id
                ?<select autoFocus style={{fontSize:"11px",padding:"3px 6px",borderRadius:"6px",border:"1px solid rgba(99,102,241,0.6)",background:"#1e1e3a",color:"#fff",outline:"none",cursor:"pointer"}} defaultValue={it.forma_pago||"Efectivo"} onChange={e=>actualizarFormaPago(it.id,e.target.value)} onBlur={()=>setEditMetodoId(null)}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta crédito">Tarjeta crédito</option>
                  <option value="Tarjeta débito">Tarjeta débito</option>
                </select>
                :<button onClick={()=>setEditMetodoId(it.id)} style={{background:it.forma_pago?"rgba(255,255,255,0.07)":"rgba(251,146,60,0.12)",border:`1px ${it.forma_pago?"solid rgba(255,255,255,0.15)":"dashed rgba(251,146,60,0.6)"}`,borderRadius:"5px",color:it.forma_pago?"rgba(255,255,255,0.55)":"#fb923c",cursor:"pointer",fontSize:"10px",padding:"2px 7px",lineHeight:"16px",whiteSpace:"nowrap"}}>{it.forma_pago||"Sin método +"}</button>}
              <button onClick={()=>borrarGasto(it.id)} style={{background:"none",border:"none",color:"rgba(255,80,80,0.5)",cursor:"pointer",fontSize:"14px",padding:"0",lineHeight:1}}>×</button>
            </span>)}
          </div>
        </div>)}
        <FilaGL l="Total gastos" v={p.egr} neg bold/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"10px",borderTop:"2px solid rgba(255,255,255,0.1)",marginTop:"4px"}}>
          <span style={{fontSize:compact?14:16,fontWeight:700}}>{pos?"Utilidad":"Pérdida neta"}</span>
          <span style={{fontSize:compact?20:26,fontWeight:800,color:pos?"#10b981":"#ff6b6b"}}>{fmt(Math.abs(p.util))}</span>
        </div>
        {p.mg!==null&&<div style={{textAlign:"right",fontSize:"12px",color:T.muted,marginTop:"2px"}}>Margen {p.mg.toFixed(1)}%</div>}
        {!compact&&p.nomItems.length>0&&<div style={{marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.div}`}}>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:T.faint,marginBottom:"6px"}}>NÓMINA REGISTRADA</div>
          {p.nomItems.map(n=><div key={n.id} style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:T.muted,padding:"4px 0"}}>
            <span>{n.concepto}</span>
            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
              <span>{fmt(n.monto)}</span>
              {editMetodoId===n.id
                ?<select autoFocus style={{fontSize:"11px",padding:"3px 6px",borderRadius:"6px",border:"1px solid rgba(99,102,241,0.6)",background:"#1e1e3a",color:"#fff",outline:"none",cursor:"pointer"}} defaultValue={n.forma_pago||"Efectivo"} onChange={e=>actualizarFormaPago(n.id,e.target.value)} onBlur={()=>setEditMetodoId(null)}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta crédito">Tarjeta crédito</option>
                  <option value="Tarjeta débito">Tarjeta débito</option>
                </select>
                :<button onClick={()=>setEditMetodoId(n.id)} style={{background:n.forma_pago?"rgba(255,255,255,0.07)":"rgba(251,146,60,0.12)",border:`1px ${n.forma_pago?"solid rgba(255,255,255,0.15)":"dashed rgba(251,146,60,0.6)"}`,borderRadius:"5px",color:n.forma_pago?"rgba(255,255,255,0.55)":"#fb923c",cursor:"pointer",fontSize:"10px",padding:"2px 7px",lineHeight:"16px",whiteSpace:"nowrap"}}>{n.forma_pago||"Sin método +"}</button>}
              <button onClick={()=>borrarGasto(n.id)} style={{background:"none",border:"none",color:"rgba(255,80,80,0.5)",cursor:"pointer",fontSize:"14px",padding:"0",lineHeight:1}}>×</button>
            </div>
          </div>)}
        </div>}
        {!compact&&p.consItems&&p.consItems.length>0&&<div style={{marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.div}`}}>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:T.faint,marginBottom:"6px"}}>CONSUMIBLES</div>
          {p.consItems.map(n=><div key={n.id} style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:T.muted,padding:"4px 0"}}>
            <span>{n.concepto}</span>
            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
              <span>{fmt(n.monto)}</span>
              {editMetodoId===n.id
                ?<select autoFocus style={{fontSize:"11px",padding:"3px 6px",borderRadius:"6px",border:"1px solid rgba(99,102,241,0.6)",background:"#1e1e3a",color:"#fff",outline:"none",cursor:"pointer"}} defaultValue={n.forma_pago||"Efectivo"} onChange={e=>actualizarFormaPago(n.id,e.target.value)} onBlur={()=>setEditMetodoId(null)}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta crédito">Tarjeta crédito</option>
                  <option value="Tarjeta débito">Tarjeta débito</option>
                </select>
                :<button onClick={()=>setEditMetodoId(n.id)} style={{background:n.forma_pago?"rgba(255,255,255,0.07)":"rgba(251,146,60,0.12)",border:`1px ${n.forma_pago?"solid rgba(255,255,255,0.15)":"dashed rgba(251,146,60,0.6)"}`,borderRadius:"5px",color:n.forma_pago?"rgba(255,255,255,0.55)":"#fb923c",cursor:"pointer",fontSize:"10px",padding:"2px 7px",lineHeight:"16px",whiteSpace:"nowrap"}}>{n.forma_pago||"Sin método +"}</button>}
              <button onClick={()=>borrarGasto(n.id)} style={{background:"none",border:"none",color:"rgba(255,80,80,0.5)",cursor:"pointer",fontSize:"14px",padding:"0",lineHeight:1}}>×</button>
            </div>
          </div>)}
        </div>}
      </div>
    );
  };

  const GraficoVentas=()=>{
    // Sucursales según la vista activa
    const sucs=(vista==="individual"||esSocia)?[sucSel]:vista==="consolidado"?sucMulti.filter(s=>sucVisible.includes(s)):sucVisible;
    // Filtro de rango temporal
    const nMeses=rangoGrafico==="3m"?3:rangoGrafico==="12m"?12:24;
    const datos=rangoGrafico==="hist"?historialCompleto:historialVentas.slice(-nMeses);
    const fmtK=v=>v>=1000000?`$${(v/1000000).toFixed(1)}M`:v>=1000?`$${Math.round(v/1000)}k`:"$0";
    const W=860,H=220,PL=68,PR=12,PT=14,PB=44;
    const cW=W-PL-PR,cH=H-PT-PB;
    const maxV=Math.max(...datos.flatMap(row=>sucs.map(s=>row[s]||0)),1);
    const nM=datos.length||nMeses;
    const gW=cW/nM;
    const bW=Math.max(2,Math.min(20,(gW-6)/sucs.length));
    const gOff=(gW-bW*sucs.length)/2;
    const yTicks=[0,0.25,0.5,0.75,1];
    // Promedio histórico por sucursal (sobre todos los 24 meses disponibles)
    const promedioHist=sucs.reduce((acc,s)=>{
      const vals=historialVentas.filter(r=>r[s]>0).map(r=>r[s]||0);
      acc[s]=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
      return acc;
    },{});
    const RANGOS=[["3m","Trim."],["12m","12 M"],["24m","24 M"],["hist","Histórico"]];
    return(
      <div className="glass" style={{padding:"22px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",flexWrap:"wrap",gap:"10px"}}>
          <div style={{fontSize:"11px",letterSpacing:"2px",color:T.sub}}>VENTAS MES A MES{sucs.length===1?` · ${sucs[0].toUpperCase()}`:""}</div>
          <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",border:`1px solid ${light?"rgba(0,0,0,0.12)":"rgba(255,255,255,0.1)"}`,borderRadius:"6px",overflow:"hidden"}}>
              {RANGOS.map(([v,l])=><button key={v} onClick={()=>{setRangoGrafico(v);if(v==="hist"&&historialCompleto.length===0)cargarHistorialCompleto();}} style={{padding:"4px 12px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"none",background:rangoGrafico===v?"#2721E8":"transparent",color:rangoGrafico===v?"#fff":T.sub,fontFamily:"'Albert Sans',sans-serif"}}>{l}</button>)}
            </div>
            <button className="btn-ghost" style={{fontSize:"11px",padding:"4px 10px"}} onClick={rangoGrafico==="hist"?cargarHistorialCompleto:cargarHistorial} disabled={loadingHistorial||loadingHist}>↻</button>
          </div>
        </div>
        {(loadingHistorial||(rangoGrafico==="hist"&&loadingHist))?(
          <div style={{textAlign:"center",padding:"60px 0",color:T.faint,fontSize:"13px"}}>{loadingHist?"Cargando historial completo...":"Cargando datos..."}</div>
        ):(
          <>
            <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",overflow:"visible"}}>
              {yTicks.map(p=>{const y=PT+cH*(1-p);return(<g key={p}>
                <line x1={PL} y1={y} x2={W-PR} y2={y} stroke={light?"rgba(0,0,0,0.06)":"rgba(255,255,255,0.05)"} strokeWidth={1}/>
                <text x={PL-6} y={y+4} textAnchor="end" fontSize={9} fill={T.faint}>{fmtK(maxV*p)}</text>
              </g>);})}
              {/* Líneas de promedio histórico por sucursal */}
              {rangoGrafico!=="24m"&&sucs.map(suc=>{
                const py=PT+cH-(promedioHist[suc]/maxV)*cH;
                if(promedioHist[suc]<=0)return null;
                return(<line key={`avg-${suc}`} x1={PL} y1={py} x2={W-PR} y2={py}
                  stroke={COLORES[suc]} strokeWidth={1} strokeDasharray="4 3" opacity={0.45}/>);
              })}
              {datos.map((row,gi)=>{
                const gx=PL+gi*gW;
                const mesLabel=new Date(`${row.mes}-15`).toLocaleDateString("es-MX",{month:"short"}).replace(".","").toUpperCase().slice(0,3);
                const esAnio=gi===0||row.mes.slice(5,7)==="01";
                return(<g key={row.mes}>
                  {sucs.map((suc,si)=>{
                    const val=row[suc]||0;
                    const bH=Math.max(val>0?2:0,(val/maxV)*cH);
                    const x=gx+gOff+si*bW;
                    const y=PT+cH-bH;
                    return(<rect key={suc} x={x} y={y} width={Math.max(1,bW-1)} height={bH}
                      fill={COLORES[suc]} opacity={0.85} rx={2}
                      onMouseEnter={()=>setTooltipBar({suc,val,mes:row.mes,x:x+bW/2,y:Math.max(y,PT+10),prom:promedioHist[suc]})}
                      onMouseLeave={()=>setTooltipBar(null)} style={{cursor:"default"}}/>);
                  })}
                  <text x={gx+gW/2} y={H-PB+14} textAnchor="middle" fontSize={9} fill={T.faint}>{mesLabel}</text>
                  {esAnio&&<text x={gx+gW/2} y={H-PB+26} textAnchor="middle" fontSize={8} fill={T.faint} opacity={0.6}>{row.mes.slice(0,4)}</text>}
                </g>);
              })}
              {tooltipBar&&(<g style={{pointerEvents:"none"}}>
                <rect x={Math.min(tooltipBar.x-60,W-PR-120)} y={Math.max(tooltipBar.y-52,PT)} width={120} height={tooltipBar.prom>0?44:24} rx={4} fill="rgba(0,0,0,0.88)"/>
                <text x={Math.min(tooltipBar.x,W-PR-60)} y={Math.max(tooltipBar.y-35,PT+16)} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700">{tooltipBar.suc}: {fmt(tooltipBar.val)}</text>
                {tooltipBar.prom>0&&<text x={Math.min(tooltipBar.x,W-PR-60)} y={Math.max(tooltipBar.y-35,PT+16)+14} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)">Prom: {fmt(tooltipBar.prom)}</text>}
              </g>)}
            </svg>
            <div style={{display:"flex",gap:"16px",justifyContent:"center",flexWrap:"wrap",marginTop:"10px",alignItems:"center"}}>
              {sucs.map(s=><div key={s} style={{display:"flex",alignItems:"center",gap:"5px"}}>
                <div style={{width:"10px",height:"10px",borderRadius:"2px",background:COLORES[s]}}/>
                <span style={{fontSize:"11px",color:T.muted}}>{s}</span>
              </div>)}
              {rangoGrafico!=="24m"&&sucs.length>0&&<div style={{display:"flex",alignItems:"center",gap:"5px",marginLeft:"8px",paddingLeft:"8px",borderLeft:`1px solid ${T.div}`}}>
                <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={T.faint} strokeWidth="1" strokeDasharray="4 2"/></svg>
                <span style={{fontSize:"11px",color:T.faint}}>Promedio histórico</span>
              </div>}
            </div>
          </>
        )}
      </div>
    );
  };

  const AnalisisSemanal=()=>{
    const sucs=(vista==="individual"||esSocia)?[sucSel]:vista==="consolidado"?sucMulti.filter(s=>sucVisible.includes(s)):sucVisible;
    const[y,m]=periodo.split("-").map(Number);
    const trimestre=Math.ceil(m/3);
    const sigMes=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,"0")}`;

    // ── Bloque semanal ────────────────────────────────────────────
    const bloquesSemanal=()=>{
      if(loadingSemanales)return(<div style={{textAlign:"center",padding:"40px 0",color:T.faint,fontSize:"13px"}}>Cargando semanas...</div>);
      if(!ventasSemanales)return null;
      const{semanas,totalMes}=ventasSemanales;
      const totalGeneral=sucs.reduce((a,s)=>a+(totalMes[s]||0),0);
      if(totalGeneral===0)return(<div style={{textAlign:"center",padding:"40px 0",color:T.faint,fontSize:"13px"}}>Sin datos para {etiq(periodo)}</div>);
      const maxSemTotal=Math.max(...semanas.map(r=>sucs.reduce((a,s)=>a+r[s],0)),1);
      return(
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          {semanas.map(row=>{
            const rowTotal=sucs.reduce((a,s)=>a+row[s],0);
            const pct=totalGeneral>0?(rowTotal/totalGeneral*100):0;
            const barW=rowTotal/maxSemTotal*100;
            return(
              <div key={row.semana} style={{background:light?"rgba(0,0,0,0.03)":"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"16px 20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:"10px"}}>
                    <span style={{fontSize:"18px",fontWeight:800,color:T.txt}}>S{row.semana}</span>
                    <span style={{fontSize:"12px",color:T.faint}}>{row.desde.slice(8)} – {row.hasta.slice(8)} {new Date(`${row.desde}T12:00:00`).toLocaleDateString("es-MX",{month:"short"}).replace(".","")}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
                    <span style={{fontSize:"26px",fontWeight:800,color:T.txt,letterSpacing:"-0.5px"}}>{pct.toFixed(1)}%</span>
                    <span style={{fontSize:"13px",color:T.faint,fontWeight:500}}>{fmt(rowTotal)}</span>
                  </div>
                </div>
                {/* Barra principal */}
                <div style={{height:"10px",background:light?"rgba(0,0,0,0.08)":"rgba(255,255,255,0.08)",borderRadius:"6px",overflow:"hidden",marginBottom:"10px"}}>
                  <div style={{height:"100%",width:`${barW}%`,background:"linear-gradient(90deg,#2721E8,#49B8D3)",borderRadius:"6px",transition:"width 0.6s ease"}}/>
                </div>
                {/* Desglose por sucursal */}
                {sucs.length>1&&<div style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>
                  {sucs.map(s=>{
                    const pctS=totalMes[s]>0?(row[s]/totalMes[s]*100):0;
                    return(<div key={s} style={{display:"flex",alignItems:"center",gap:"5px",minWidth:"100px"}}>
                      <div style={{width:"8px",height:"8px",borderRadius:"2px",background:COLORES[s],flexShrink:0}}/>
                      <span style={{fontSize:"11px",color:T.muted}}>{s}</span>
                      <span style={{fontSize:"12px",fontWeight:700,color:COLORES[s],marginLeft:"auto"}}>{pctS.toFixed(1)}%</span>
                    </div>);
                  })}
                </div>}
              </div>
            );
          })}
          {/* Total del mes */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderTop:`1px solid ${T.div}`,marginTop:"4px"}}>
            <span style={{fontSize:"11px",letterSpacing:"2px",color:T.sub,fontWeight:700}}>TOTAL {etiq(periodo).toUpperCase()}</span>
            <div style={{display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"flex-end"}}>
              {sucs.length>1&&sucs.map(s=><span key={s} style={{fontSize:"13px",fontWeight:700,color:COLORES[s]}}>{s}: {fmt(totalMes[s]||0)}</span>)}
              <span style={{fontSize:"16px",fontWeight:800,color:T.txt}}>{fmt(totalGeneral)}</span>
            </div>
          </div>
        </div>
      );
    };


    return(
      <div className="glass" style={{padding:"22px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px",flexWrap:"wrap",gap:"8px"}}>
          <div>
            <div style={{fontSize:"11px",letterSpacing:"2px",color:T.sub}}>VENTAS SEMANALES · {etiq(periodo).toUpperCase()}</div>
            <div style={{fontSize:"11px",color:T.faint,marginTop:"2px"}}>Q{trimestre} {y} · % del total mensual por semana</div>
          </div>
        </div>
        {bloquesSemanal()}
      </div>
    );
  };

  const actSucMulti=sucMulti.filter(s=>sucVisible.includes(s));
  const pc=actSucMulti.length>0?plC(actSucMulti):null;

  const SUBTABS=[["mesames","1. Mes a Mes"],["proyeccion","2. Proyección y Metas"],["comisiones","3. Comisiones"],["pasarelas","4. Pasarelas de Pago & Zettle"]];

  return(<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
    {/* Sub-tabs de Finanzas */}
    <div style={{display:"flex",gap:"6px",flexWrap:"wrap",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",padding:"4px",width:"fit-content"}}>
      {SUBTABS.map(([v,l])=><button key={v} onClick={()=>{setSubtab(v);setAiTxt("");}} style={{padding:"8px 16px",fontSize:"12px",fontWeight:600,cursor:"pointer",border:"none",borderRadius:"7px",background:subtab===v?"#2721E8":"transparent",color:subtab===v?"#fff":T.sub,fontFamily:"'Albert Sans',sans-serif",whiteSpace:"nowrap"}}>{l}</button>)}
    </div>

    {/* ═══ SUB-TAB 1 · MES A MES ═══ */}
    {subtab==="mesames"&&<>
      {/* Controles */}
      <div style={{display:"flex",alignItems:"flex-end",gap:"16px",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:T.sub,marginBottom:"4px"}}>VISTA</div>
          <div style={{display:"flex",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",overflow:"hidden"}}>
            {([["individual","Individual"],["consolidado","Consolidado"],["comparativa","Comparativa"]]).map(([v,l])=><button key={v} onClick={()=>{setVista(v);setAiTxt("");}} style={{padding:"7px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"none",background:vista===v?"#2721E8":"transparent",color:vista===v?"#fff":T.sub,fontFamily:"'Albert Sans',sans-serif"}}>{l}</button>)}
          </div>
        </div>
        {(vista==="individual"||esSocia)&&<div>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:T.sub,marginBottom:"4px"}}>SUCURSAL</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {sucVisible.map(s=><button key={s} onClick={()=>{setSucSel(s);setAiTxt("");}} style={{padding:"6px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:`1px solid ${sucSel===s?COLORES[s]:"rgba(255,255,255,0.1)"}`,borderRadius:"8px",background:sucSel===s?`${COLORES[s]}22`:"transparent",color:sucSel===s?(light?COLORES[s]:"#fff"):T.faint,fontFamily:"'Albert Sans',sans-serif",transition:"all 0.15s"}}>{s}</button>)}
          </div>
        </div>}
        {vista==="consolidado"&&<div>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:T.sub,marginBottom:"4px"}}>SELECCIONAR SUCURSALES</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {sucVisible.map(s=>{const on=sucMulti.includes(s);return<button key={s} onClick={()=>setSucMulti(on?sucMulti.filter(x=>x!==s):[...sucMulti,s])} style={{padding:"6px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:`1px solid ${on?COLORES[s]:"rgba(255,255,255,0.1)"}`,borderRadius:"8px",background:on?`${COLORES[s]}22`:"transparent",color:on?(light?COLORES[s]:"#fff"):T.faint,fontFamily:"'Albert Sans',sans-serif",transition:"all 0.15s"}}>{s}</button>;})}
          </div>
        </div>}
        <button className="btn-blue" onClick={()=>exportarReporteDirectivo()} style={{marginLeft:"auto",fontSize:"12px"}}>📥 Exportar Reporte Directivo</button>
        <button className="btn-ghost" onClick={cargar} disabled={loading}>↻</button>
        {loading&&<span style={{fontSize:"11px",color:T.sub}}>Cargando...</span>}
      </div>

      <GraficoVentas/>
      <MesAMes historial={historialCompleto} sucVisible={sucVisible} periodo={periodo}/>
      <AnalisisSemanal/>

      {/* Vistas P&L — overlay mientras carga para no ver cambios bruscos */}
      <div style={{position:"relative",opacity:loading?0.45:1,transition:"opacity 0.2s",pointerEvents:loading?"none":"auto"}}>
        {loading&&<div style={{position:"absolute",inset:0,zIndex:10,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"40px"}}>
          <div style={{background:light?"rgba(255,255,255,0.9)":"rgba(20,20,40,0.85)",borderRadius:"20px",padding:"8px 20px",fontSize:"12px",fontWeight:600,color:T.muted,backdropFilter:"blur(4px)",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>Cargando datos...</div>
        </div>}

        {/* Vista individual */}
        {vista==="individual"&&<TarjetaPL suc={sucSel}/>}

        {/* Vista consolidada */}
        {vista==="consolidado"&&pc&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px"}}>
            {[{l:"INGRESOS",v:fmt(pc.ing),c:"#10b981"},{l:"GASTOS",v:fmt(pc.egr),c:"#f97316"},{l:pc.util>=0?"UTILIDAD":"PÉRDIDA",v:fmt(Math.abs(pc.util)),c:pc.util>=0?"#10b981":"#ff6b6b"},{l:"MARGEN",v:pc.mg!==null?`${pc.mg.toFixed(1)}%`:"—",c:pc.mg>=20?"#10b981":pc.mg>=0?"#f0c040":"#ff6b6b"}].map(k=><div key={k.l} className="kpi"><div style={{fontSize:"10px",letterSpacing:"2px",color:T.sub,marginBottom:"8px"}}>{k.l}</div><div style={{fontSize:"26px",fontWeight:700,color:k.c}}>{k.v}</div></div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${actSucMulti.length},1fr)`,gap:"14px"}}>
            {actSucMulti.map(s=><TarjetaPL key={s} suc={s} compact/>)}
          </div>
        </>}

        {/* Vista comparativa */}
        {vista==="comparativa"&&<>
          <div style={{fontSize:"11px",letterSpacing:"2px",color:T.sub}}>{etiq(periodo).toUpperCase()} VS {etiq(antYM(periodo)).toUpperCase()}</div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(sucVisible.length,5)},1fr)`,gap:"14px"}}>
            {sucVisible.map(s=><TarjetaPL key={s} suc={s} compact showDelta/>)}
          </div>
        </>}
      </div>

      {/* Registrar gasto — tarjeta secundaria colapsable */}
      <div className="glass" style={{padding:"22px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"8px",cursor:"pointer"}} onClick={()=>setGastoAbierto(v=>!v)}>
          <div style={{fontSize:"11px",letterSpacing:"2px",color:T.sub}}>REGISTRAR GASTO · <span style={{color:T.muted}}>{etiq(fPeriodo).toUpperCase()}</span></div>
          <button className="btn-ghost" style={{fontSize:"12px"}} onClick={e=>{e.stopPropagation();setGastoAbierto(v=>!v);}}>{gastoAbierto?"− Ocultar":"＋ Registrar gasto"}</button>
        </div>
        {gastoAbierto&&<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",marginTop:"12px",marginBottom:"4px"}}>
          <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none"}}>
            <div onClick={()=>setFRecurrente(v=>!v)} style={{width:"36px",height:"20px",borderRadius:"10px",background:fRecurrente?"#2721E8":"rgba(255,255,255,0.12)",transition:"background 0.2s",position:"relative",flexShrink:0}}>
              <div style={{position:"absolute",top:"3px",left:fRecurrente?"19px":"3px",width:"14px",height:"14px",borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
            </div>
            <span style={{fontSize:"12px",color:fRecurrente?"#a5b4fc":T.faint}}>
              {fRecurrente?"Gasto fijo mensual (se guardará en los próximos 12 meses)":"Solo este mes"}
            </span>
          </label>
        </div>
        <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"flex-end"}}>
          <div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>Sucursal</div>
            <select className="inp" style={{width:"140px"}} value={fSuc} onChange={e=>setFSuc(e.target.value)}>
              {sucVisible.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>Mes</div>
            <select className="inp" style={{width:"150px"}} value={fPeriodo} onChange={e=>setFPeriodo(e.target.value)}>
              {listaMeses.map(m=><option key={m} value={m}>{etiq(m)}</option>)}
            </select>
          </div>
          <div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>Categoría</div>
            <select className="inp" style={{width:"190px"}} value={fCat} onChange={e=>setFCat(e.target.value)}>
              <option value="contenido_digital">Contenido digital</option>
              <option value="plataforma_cire">Plataforma CIRE</option>
              <option value="renta">Renta</option>
              <option value="servicios">Servicios (agua/luz/internet)</option>
              <option value="nomina">Nómina</option>
              <option value="consumibles">Consumibles</option>
              <option value="otro">Otro gasto</option>
              <option value="personalizado">＋ Concepto personalizado</option>
            </select>
          </div>
          {fCat!=="nomina"&&fCat!=="consumibles"&&<><div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>{fCat==="personalizado"?"Nombre del concepto *":"Concepto"}</div>
            <input className="inp" style={{width:"180px",borderColor:fCat==="personalizado"?"rgba(39,33,232,0.6)":"undefined"}} placeholder={fCat==="personalizado"?"Ej: Software CRM":"Descripción (opcional)"} value={fConc} onChange={e=>setFConc(e.target.value)}/></div>
            <div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>Monto</div>
            <input className="inp" style={{width:"130px"}} type="number" placeholder="$0" value={fMonto} onChange={e=>setFMonto(e.target.value)} onKeyDown={e=>e.key==="Enter"&&guardar()}/></div>
            <div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>Forma de pago</div>
            <select className="inp" style={{width:"160px"}} value={fMetodo} onChange={e=>setFMetodo(e.target.value)}>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta crédito">Tarjeta crédito</option>
              <option value="Tarjeta débito">Tarjeta débito</option>
            </select></div>
            <div><div style={{fontSize:"11px",color:T.muted,marginBottom:"4px"}}>Tipo</div>
            <select className="inp" style={{width:"150px"}} value={fTipoGasto} onChange={e=>setFTipoGasto(e.target.value)} title="Único = gasto extraordinario (equipo, curso, campaña puntual). No cuenta como gasto fijo en Mes a mes.">
              <option value="recurrente">Recurrente</option>
              <option value="unico">Único (extraordinario)</option>
            </select></div>
            <button className="btn-blue" onClick={guardar} disabled={saving}>{saving?(fRecurrente?"Guardando 12 meses...":"Guardando..."):"Guardar"}</button>
          </>}
        </div>
        {fCat==="nomina"&&<div style={{marginTop:"14px"}}>
          <div style={{fontSize:"11px",color:T.muted,marginBottom:"8px"}}>Colaboradoras de {fSuc} · {etiq(fPeriodo)} <span style={{color:T.faint}}>(reemplaza lo anterior{fRecurrente?" en los próximos 12 meses":""})</span></div>
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
        {fCat==="consumibles"&&<div style={{marginTop:"14px"}}>
          <div style={{fontSize:"11px",color:T.muted,marginBottom:"8px"}}>Consumibles de {fSuc} · {etiq(fPeriodo)} <span style={{color:T.faint}}>(se agregan al mes, no reemplazan)</span></div>
          {consRows.map((n,i)=><div key={i} style={{display:"flex",gap:"8px",marginBottom:"6px",alignItems:"center"}}>
            <input className="inp" style={{flex:2}} placeholder="Ej: Mascarilla facial, Cartucho HIFU…" value={n.nombre} onChange={e=>setConsRows(r=>{const c=[...r];c[i]={...c[i],nombre:e.target.value};return c;})}/>
            <input className="inp" style={{width:"130px"}} type="number" placeholder="$ Monto" value={n.monto} onChange={e=>setConsRows(r=>{const c=[...r];c[i]={...c[i],monto:e.target.value};return c;})}/>
            {consRows.length>1&&<button className="btn-ghost" style={{padding:"8px 12px"}} onClick={()=>setConsRows(r=>r.filter((_,j)=>j!==i))}>×</button>}
          </div>)}
          <div style={{display:"flex",gap:"8px",marginTop:"6px",alignItems:"center"}}>
            <button className="btn-ghost" style={{fontSize:"11px"}} onClick={()=>setConsRows(r=>[...r,{nombre:"",monto:""}])}>+ Agregar ítem</button>
            <select className="inp" style={{width:"160px",fontSize:"12px"}} value={fMetodo} onChange={e=>setFMetodo(e.target.value)}>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta crédito">Tarjeta crédito</option>
              <option value="Tarjeta débito">Tarjeta débito</option>
            </select>
            <button className="btn-blue" style={{fontSize:"12px"}} onClick={guardar} disabled={saving}>{saving?"Guardando...":"Guardar consumibles"}</button>
          </div>
        </div>}
        </>}
      </div>

      {/* Bloque IA */}
      <div className="glass" style={{padding:"22px",borderColor:aiTxt?"rgba(39,33,232,0.4)":"rgba(255,255,255,0.08)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:aiTxt||aiLoad?"16px":"0"}}>
          <div>
            <div style={{fontSize:"14px",fontWeight:700,marginBottom:"2px"}}>Análisis con IA</div>
            <div style={{fontSize:"11px",color:T.sub}}>Claude interpreta tus resultados en lenguaje claro, sin tecnicismos</div>
          </div>
          <button className="btn-blue" onClick={analizarIA} disabled={aiLoad} style={{padding:"10px 22px",fontSize:"12px"}}>{aiLoad?"Analizando...":"✦ Analizar"}</button>
        </div>
        {aiLoad&&<div style={{color:T.muted,fontSize:"13px",fontStyle:"italic"}}>Analizando resultados de {etiq(periodo)}...</div>}
        {aiTxt&&<div style={{paddingTop:"4px"}}>{renderMarkdown(aiTxt,T,light)}</div>}
      </div>
    </>}

    {/* ═══ SUB-TAB 2 · PROYECCIÓN Y METAS ═══ */}
    {subtab==="proyeccion"&&<>
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button className="btn-blue" onClick={()=>exportarReporteDirectivo(esSocia?[sucSel]:sucVisible)} style={{fontSize:"12px"}}>📥 Exportar Reporte Directivo</button>
      </div>
      <Proyeccion historial={historialCompleto} sucVisible={sucVisible} periodo={periodo}/>
      <ResumenFinanciero sucNames={sucVisible} mesFiltro={periodo} anclarAFiltro/>
    </>}

    {/* ═══ SUB-TAB 3 · COMISIONES ═══ */}
    {subtab==="comisiones"&&<>
      <div style={{display:"flex",alignItems:"flex-end",gap:"16px",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:"10px",letterSpacing:"2px",color:T.sub,marginBottom:"4px"}}>SUCURSAL</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {sucVisible.map(s=><button key={s} onClick={()=>{setSucSel(s);setAiTxt("");}} style={{padding:"6px 14px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:`1px solid ${sucSel===s?COLORES[s]:"rgba(255,255,255,0.1)"}`,borderRadius:"8px",background:sucSel===s?`${COLORES[s]}22`:"transparent",color:sucSel===s?(light?COLORES[s]:"#fff"):T.faint,fontFamily:"'Albert Sans',sans-serif",transition:"all 0.15s"}}>{s}</button>)}
          </div>
        </div>
      </div>
      <div className="glass" style={{padding:"22px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px",flexWrap:"wrap",gap:"8px"}}>
          <div>
            <div style={{fontSize:"14px",fontWeight:700}}>Comisiones cosmetaras</div>
            <div style={{fontSize:"11px",color:T.sub}}>{sucSel} · {etiq(periodo)}</div>
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            {comSubTab==="tabla"&&<input className="inp" placeholder="Buscar por nombre…" value={buscarCom} onChange={e=>setBuscarCom(e.target.value)} style={{width:"200px",fontSize:"12px"}}/>}
            {comSubTab==="tabla"&&<button className="btn-ghost" onClick={cargarComisiones} disabled={loadingCom} style={{fontSize:"12px"}}>↻ {loadingCom?"Cargando...":"Actualizar"}</button>}
            {comSubTab==="tabla"&&<button className="btn-blue" onClick={exportarComPDF} disabled={!comData.length} style={{fontSize:"12px"}}>⬇ Exportar PDF</button>}
            {comSubTab==="comparativo"&&<button className="btn-ghost" onClick={cargarComparativoZettle} disabled={loadingComZettle} style={{fontSize:"12px"}}>↻ {loadingComZettle?"Cargando...":"Actualizar"}</button>}
          </div>
        </div>
        <div style={{display:"flex",gap:"6px",marginBottom:"16px"}}>
          {[["tabla","Plataforma"],["comparativo","Comparativo Zettle"]].map(([v,l])=><button key={v} onClick={()=>setComSubTab(v)} style={{padding:"6px 14px",borderRadius:"8px",border:"1px solid",fontSize:"11px",fontWeight:600,cursor:"pointer",background:comSubTab===v?"rgba(39,33,232,0.15)":"transparent",borderColor:comSubTab===v?"#2721E8":T.dim,color:comSubTab===v?"#2721E8":T.muted}}>{l}</button>)}
        </div>
        {comSubTab==="comparativo"&&(()=>{
          const totalPlataforma=comData.reduce((s,r)=>s+r.monto,0);
          const totalZettle=comZettleTotal?.total??0;
          const diff=totalZettle-totalPlataforma;
          const pct=totalZettle>0?Math.round(totalPlataforma/totalZettle*100):0;
          const color=p=>p>=90?"#10b981":p>=70?"#f59e0b":"#ef4444";
          return<div>
            <div style={{fontSize:"11px",color:T.sub,marginBottom:"14px"}}>Total mensual capturado en Zettle vs. total registrado en plataforma · {sucSel} · {etiq(periodo)}</div>
            {loadingComZettle&&<div style={{textAlign:"center",padding:"30px",color:T.muted,fontSize:"13px"}}>Cargando datos de Zettle...</div>}
            {!loadingComZettle&&<div style={{display:"grid",gridTemplateColumns:"1fr 140px 1fr",gap:"24px",alignItems:"center",padding:"18px 20px",background:light?"#f8f9ff":"rgba(39,33,232,0.06)",borderRadius:"12px",border:`1px solid ${T.div}`}}>
              <div>
                <div style={{fontSize:"10px",letterSpacing:"2px",color:"#49B8D3",fontWeight:700,marginBottom:"10px"}}>💳 ZETTLE (MES)</div>
                <div style={{fontSize:"28px",fontWeight:800,color:"#49B8D3"}}>{fmt(totalZettle)}</div>
                <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>{comZettleTotal?.count??0} ventas</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"22px",fontWeight:800,color:color(pct)}}>{pct}%</div>
                <div style={{fontSize:"10px",color:T.faint,marginTop:"4px"}}>capturado</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"10px",letterSpacing:"2px",color:"#10b981",fontWeight:700,marginBottom:"10px"}}>🖥 PLATAFORMA (MES)</div>
                <div style={{fontSize:"28px",fontWeight:800,color:"#10b981"}}>{fmt(totalPlataforma)}</div>
                <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>{comData.length} registros</div>
              </div>
            </div>}
            {!loadingComZettle&&diff>0&&<div style={{marginTop:"12px",fontSize:"12px",color:"#ef4444",fontWeight:600}}>Faltan {fmt(diff)} por capturar en plataforma este mes.</div>}
          </div>;
        })()}
        {comSubTab==="tabla"&&<>
        {loadingCom&&<div style={{textAlign:"center",padding:"30px",color:T.muted,fontSize:"13px"}}>Cargando datos...</div>}
        {!loadingCom&&comData.length===0&&<div style={{textAlign:"center",padding:"30px",color:T.faint,fontSize:"13px"}}>Sin registros para este período</div>}
        {!loadingCom&&comData.length>0&&(()=>{const comFiltrado=buscarCom.trim()?comData.filter(r=>r.nombre.toLowerCase().includes(buscarCom.toLowerCase())):comData;return(<div style={{overflowX:"auto"}}>
          {buscarCom.trim()&&<div style={{fontSize:"11px",color:T.sub,marginBottom:"8px"}}>{comFiltrado.length} resultado{comFiltrado.length!==1?"s":""} para "{buscarCom}"</div>}
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
            <thead>
              <tr style={{borderBottom:`2px solid ${T.div}`}}>
                {["Fecha","Hora","Recibo","Nombre","Usuario","Servicios","Terminal","MSI","Monto","Com. Base","Com. MSI","Com. Terminal","Monto Recibido","Com. Cosmetara",""].map(h=><th key={h} style={{padding:"8px 10px",textAlign:["Monto","Com. Base","Com. MSI","Com. Terminal","Monto Recibido","Com. Cosmetara"].includes(h)?"right":"left",fontSize:"10px",letterSpacing:"1px",color:T.faint,fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {comFiltrado.map((r,i)=><tr key={i} style={{borderBottom:`1px solid ${T.div}`,background:i%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:T.muted}}>{r.fecha}</td>
                <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:T.faint,fontSize:"11px"}}>{r.hora}</td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",fontSize:"11px",color:T.faint,whiteSpace:"nowrap"}}>{r.recibo}</td>
                <td style={{padding:"7px 10px",fontWeight:500,whiteSpace:"nowrap"}}>{r.nombre}</td>
                <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:T.muted,fontSize:"11px"}}>{r.usuario}</td>
                <td style={{padding:"7px 10px",color:T.muted,maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.servicios}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>
                  {editTerminalCom===r.id
                    ?<select autoFocus value={r.terminal} onChange={e=>guardarTerminalCom(r.id,e.target.value==="Efectivo / Otro"?null:e.target.value)} onBlur={()=>setEditTerminalCom(null)} style={{fontSize:"11px",padding:"4px 6px",borderRadius:"6px",border:"1px solid rgba(39,33,232,0.6)",background:light?"#fff":"#1e1e3a",color:light?"#111":"#fff",outline:"none",cursor:"pointer",fontFamily:"inherit"}}>
                      {["Efectivo / Otro","Mercado Pago","Zettle","BBVA","Banorte"].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    :<div style={{display:"flex",alignItems:"center",gap:"5px",cursor:"pointer"}} onClick={()=>setEditTerminalCom(r.id)}>
                      <span style={{padding:"2px 8px",borderRadius:"20px",fontSize:"10px",fontWeight:600,background:r.terminal==="Efectivo / Otro"?"rgba(255,255,255,0.06)":r.terminal==="Mercado Pago"?"rgba(0,174,239,0.12)":r.terminal==="Zettle"?"rgba(73,184,211,0.12)":"rgba(99,102,241,0.12)",color:r.terminal==="Efectivo / Otro"?T.faint:r.terminal==="Mercado Pago"?"#00aeef":r.terminal==="Zettle"?"#49B8D3":"#a5b4fc"}}>{r.terminal}</span>
                      {r.comision_terminal_override&&<span style={{fontSize:"9px",background:"rgba(39,33,232,0.15)",color:"#818cf8",borderRadius:"4px",padding:"1px 5px"}}>adj</span>}
                      <span style={{fontSize:"10px",color:T.faint,opacity:0.5}}>✎</span>
                    </div>}
                </td>
                <td style={{padding:"4px 10px",textAlign:"center"}}>
                  {editMsiCom===r.id
                    ?<select autoFocus value={r.msi_meses||""} onChange={e=>guardarMsiCom(r.id,e.target.value||null)} onBlur={()=>setEditMsiCom(null)} style={{fontSize:"11px",padding:"4px 6px",borderRadius:"6px",border:"1px solid rgba(39,33,232,0.6)",background:light?"#fff":"#1e1e3a",color:light?"#111":"#fff",outline:"none",cursor:"pointer",fontFamily:"inherit",width:"70px"}}>
                      <option value="">—</option>
                      {[3,6,9,12].map(m=><option key={m} value={m}>{m} MSI</option>)}
                    </select>
                    :<div style={{display:"inline-flex",alignItems:"center",gap:"4px",cursor:"pointer"}} onClick={()=>setEditMsiCom(r.id)}>
                      <span style={{color:T.faint}}>{r.msi_meses?`${r.msi_meses}`:""}</span>
                      {r.comision_msi_override!==null&&<span style={{fontSize:"9px",background:"rgba(39,33,232,0.15)",color:"#818cf8",borderRadius:"4px",padding:"1px 5px"}}>adj</span>}
                      <span style={{fontSize:"10px",color:T.faint,opacity:0.4}}>✎</span>
                    </div>}
                </td>
                <td style={{padding:"4px 10px",textAlign:"right"}}>
                  {editMontoCom===r.id
                    ?<div style={{display:"flex",alignItems:"center",gap:"4px",justifyContent:"flex-end"}}>
                      <input autoFocus type="number" value={editMontoVal} onChange={e=>setEditMontoVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")guardarMontoCom(r.id,editMontoVal);if(e.key==="Escape")setEditMontoCom(null);}} style={{width:"90px",padding:"4px 6px",fontSize:"12px",textAlign:"right",borderRadius:"6px",border:"1px solid rgba(39,33,232,0.6)",background:light?"#fff":"#1e1e3a",color:light?"#111":"#fff",outline:"none",fontFamily:"inherit"}}/>
                      <button onClick={()=>guardarMontoCom(r.id,editMontoVal)} style={{background:"#2721E8",border:"none",borderRadius:"5px",color:"#fff",cursor:"pointer",fontSize:"11px",padding:"4px 7px"}}>✓</button>
                      <button onClick={()=>setEditMontoCom(null)} style={{background:"none",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"5px",color:"#888",cursor:"pointer",fontSize:"11px",padding:"4px 7px"}}>✕</button>
                    </div>
                    :<div style={{display:"flex",alignItems:"center",gap:"6px",justifyContent:"flex-end",cursor:"pointer"}} onClick={()=>{setEditMontoCom(r.id);setEditMontoVal(r.monto);}}>
                      <span style={{fontWeight:600}}>{fmt(r.monto)}</span>
                      {r.comision_monto!=null&&<span style={{fontSize:"9px",background:"rgba(39,33,232,0.15)",color:"#818cf8",borderRadius:"4px",padding:"1px 5px"}}>adj</span>}
                      <span style={{fontSize:"10px",color:T.faint,opacity:0.5}}>✎</span>
                    </div>}
                </td>
                <td style={{padding:"7px 10px",textAlign:"right",color:"#f97316"}}>{r.com_base>0?`-${fmt(r.com_base)}`:"—"}</td>
                <td style={{padding:"7px 10px",textAlign:"right",color:"#f97316"}}>{r.com_msi>0?`-${fmt(r.com_msi)}`:"—"}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:"#f97316"}}>{r.com_terminal>0?`-${fmt(r.com_terminal)}`:"—"}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,color:"#10b981"}}>{fmt(r.monto_recibido)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:r.com_cosmetara===null?"#f0c040":"#49B8D3"}}>{r.com_cosmetara===null?"Pendiente":(r.com_cosmetara>0?fmt(r.com_cosmetara):"—")}</td>
                <td style={{padding:"7px 10px",position:"relative"}}>
                  {r.comision_periodo&&<span style={{fontSize:"9px",background:"rgba(251,146,60,0.15)",color:"#f97316",border:"1px solid rgba(251,146,60,0.4)",borderRadius:"10px",padding:"1px 6px",marginRight:"4px",whiteSpace:"nowrap"}}>{etiq(r.comision_periodo).split(" ")[0]}</span>}
                  <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                    {confirmDelCom!==r.id&&<button onClick={()=>setMoverFila(moverFila===r.id?null:r.id)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"6px",color:T.muted,cursor:"pointer",fontSize:"11px",padding:"3px 8px",fontFamily:"inherit",whiteSpace:"nowrap"}}>→ Mover</button>}
                    {confirmDelCom===r.id
                      ?<div style={{display:"flex",gap:"4px",whiteSpace:"nowrap"}}>
                          <button onClick={()=>setConfirmDelCom(null)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"6px",color:T.muted,cursor:"pointer",padding:"3px 8px",fontSize:"11px",fontFamily:"inherit"}}>No</button>
                          <button onClick={()=>eliminarFilaCom(r.id)} style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.5)",borderRadius:"6px",color:"#ef4444",cursor:"pointer",padding:"3px 8px",fontSize:"11px",fontFamily:"inherit",fontWeight:700}}>¿Sí?</button>
                        </div>
                      :<button onClick={()=>setConfirmDelCom(r.id)} style={{background:"none",border:"none",color:"rgba(239,68,68,0.35)",cursor:"pointer",fontSize:"15px",padding:"2px 4px",lineHeight:1}} title="Eliminar">🗑</button>}
                  </div>
                  {moverFila===r.id&&<div style={{position:"absolute",right:0,top:"100%",zIndex:50,background:light?"#fff":"#1e1e3a",border:`1px solid ${T.div}`,borderRadius:"10px",padding:"8px",boxShadow:"0 8px 24px rgba(0,0,0,0.3)",minWidth:"150px"}}>
                    <div style={{fontSize:"10px",letterSpacing:"1px",color:T.faint,marginBottom:"6px",padding:"0 4px"}}>MOVER A</div>
                    {mesesOpciones.map((mes,i)=><button key={mes} onClick={()=>moverComision(r.id,mes)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",background:"none",border:i===5?"1px solid rgba(255,255,255,0.08)":"none",borderLeft:"none",borderRight:"none",borderTop:i===6?"1px solid rgba(255,255,255,0.08)":"none",borderBottom:"none",borderRadius:"0",color:i<6?T.faint:T.text,cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}} onMouseEnter={e=>e.target.style.background="rgba(39,33,232,0.1)"} onMouseLeave={e=>e.target.style.background="none"}>{i===5?"── ":i===6?"→ ":i<6?"← ":""}{etiq(mes)}</button>)}
                    {r.comision_periodo&&<><div style={{height:"1px",background:T.div,margin:"4px 0"}}/>
                    <button onClick={()=>moverComision(r.id,null)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",background:"none",border:"none",borderRadius:"6px",color:"#f97316",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>↩ Restaurar fecha original</button></>}
                  </div>}
                </td>
              </tr>)}
            </tbody>
            <tfoot>{(()=>{const tot=comFiltrado.reduce((a,r)=>({monto:a.monto+r.monto,com_base:a.com_base+r.com_base,com_msi:a.com_msi+r.com_msi,com_terminal:a.com_terminal+r.com_terminal,monto_recibido:a.monto_recibido+r.monto_recibido,com_cosmetara:a.com_cosmetara+(r.com_cosmetara||0)}),{monto:0,com_base:0,com_msi:0,com_terminal:0,monto_recibido:0,com_cosmetara:0});const r2=v=>Math.round(v*100)/100;return(<tr style={{borderTop:`2px solid ${T.div}`,background:"rgba(255,255,255,0.04)"}}>
              <td colSpan={8} style={{padding:"10px",fontSize:"11px",fontWeight:700,letterSpacing:"1px",color:T.sub}}>TOTAL · {comFiltrado.length} registros{buscarCom.trim()?` (filtrado de ${comData.length})`:""}</td>
              <td style={{padding:"10px",textAlign:"right",fontWeight:800,fontSize:"14px"}}>{fmt(r2(tot.monto))}</td>
              <td style={{padding:"10px",textAlign:"right",fontWeight:700,color:"#f97316"}}>{tot.com_base>0?`-${fmt(r2(tot.com_base))}`:"—"}</td>
              <td style={{padding:"10px",textAlign:"right",fontWeight:700,color:"#f97316"}}>{tot.com_msi>0?`-${fmt(r2(tot.com_msi))}`:"—"}</td>
              <td style={{padding:"10px",textAlign:"right",fontWeight:700,color:"#f97316"}}>{tot.com_terminal>0?`-${fmt(r2(tot.com_terminal))}`:"—"}</td>
              <td style={{padding:"10px",textAlign:"right",fontWeight:800,fontSize:"14px",color:"#10b981"}}>{fmt(r2(tot.monto_recibido))}</td>
              <td style={{padding:"10px",textAlign:"right",fontWeight:800,fontSize:"14px",color:"#49B8D3"}}>{fmt(r2(tot.com_cosmetara))}</td>
            </tr>);})()}</tfoot>
          </table>
        </div>);})()}

        {/* Resumen comisión recepcionista */}
        {!loadingCom&&comData.length>0&&(()=>{
          const tot=comData.reduce((a,r)=>({monto:a.monto+r.monto,com_terminal:a.com_terminal+r.com_terminal,monto_recibido:a.monto_recibido+r.monto_recibido,com_cosmetara:a.com_cosmetara+(r.com_cosmetara||0)}),{monto:0,com_terminal:0,monto_recibido:0,com_cosmetara:0});
          const r2=v=>Math.round(v*100)/100;
          const baseRecep=r2(tot.monto_recibido-tot.com_cosmetara);
          const tier=getTierRecep(baseRecep);
          const comRecep=r2(baseRecep*tier.pct/100);
          return(
            <div style={{marginTop:"16px",padding:"18px 20px",background:light?"#f8f9ff":"rgba(39,33,232,0.06)",border:`1px solid ${light?"rgba(39,33,232,0.15)":"rgba(39,33,232,0.25)"}`,borderRadius:"12px"}}>
              <div style={{fontSize:"11px",letterSpacing:"2px",color:"#2721E8",fontWeight:700,marginBottom:"14px"}}>COMISIÓN RECEPCIONISTA</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"12px",marginBottom:"14px"}}>
                {[["Ventas brutas",fmt(r2(tot.monto)),T.text],["− Com. terminal",`-${fmt(r2(tot.com_terminal))}`,"#f97316"],["− Com. cosmetaras",`-${fmt(r2(tot.com_cosmetara))}`,"#49B8D3"],["Base recepcionista",fmt(baseRecep),"#10b981"],["Nivel alcanzado",`${tier.pct.toFixed(2)}%`,tier.pct>0?"#2721E8":T.faint]].map(([l,v,c])=>(
                  <div key={l} style={{padding:"12px 14px",background:light?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.04)",borderRadius:"8px",border:`1px solid ${T.div}`}}>
                    <div style={{fontSize:"10px",color:T.faint,marginBottom:"4px"}}>{l}</div>
                    <div style={{fontSize:"16px",fontWeight:700,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:tier.pct>0?(light?"rgba(39,33,232,0.07)":"rgba(39,33,232,0.15)"):"rgba(255,255,255,0.03)",borderRadius:"10px",border:`1px solid ${tier.pct>0?"rgba(39,33,232,0.3)":T.div}`}}>
                <div>
                  <div style={{fontSize:"12px",color:T.sub,marginBottom:"2px"}}>Comisión recepcionista · {fmt(baseRecep)} × {tier.pct.toFixed(2)}%</div>
                  {tier.pct===0&&<div style={{fontSize:"11px",color:T.faint}}>Se requieren al menos $100,000 para generar comisión</div>}
                  {tier.pct>0&&(()=>{const nextTier=TIERS_RECEP.filter(t=>t.desde>baseRecep).at(-1);return nextTier?<div style={{fontSize:"11px",color:T.faint}}>Siguiente nivel: {nextTier.pct.toFixed(2)}% al llegar a {fmt(nextTier.desde)}</div>:null;})()}
                </div>
                <div style={{fontSize:"28px",fontWeight:800,color:tier.pct>0?"#2721E8":T.faint}}>{fmt(comRecep)}</div>
              </div>
            </div>
          );
        })()}
        </>}
      </div>
    </>}

    {/* ═══ SUB-TAB 4 · PASARELAS DE PAGO & ZETTLE ═══ */}
    {subtab==="pasarelas"&&<PasarelasZettle
      mesDesde={mesDesde} mesHasta={mesHasta} mesSelLabel={mesSelLabel} periodoLabel={periodoLabel}
      filtro={filtro} tickets={tickets} setTickets={setTickets}
      topMet={topMet} ventasTotal={ventasTotal} maxMet={maxMet}
    />}
  </div>);}
