import { useState, useEffect } from "react";
import { supabase, SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase.js";
import { useT } from "../../lib/theme.jsx";
import { USUARIOS, fmt } from "../../lib/constantes.js";
import { ZETTLE_CUENTAS_FIN } from "../../lib/zettle.js";

// Sub-tab 4 de Finanzas: métodos de pago + auditoría Zettle vs POS.
// Antes vivía como pestaña principal independiente ("Zettle") y como tarjeta
// suelta dentro de Finanzas — se unificaron aquí para compartir el filtro de mes.
export default
function PasarelasZettle({mesDesde,mesHasta,mesSelLabel,periodoLabel,filtro,tickets,setTickets,topMet,ventasTotal,maxMet}){
  const{light,T}=useT();
  const USUARIOS_DASH=filtro?USUARIOS.filter(u=>u.rol==="sucursal"&&filtro.includes(u.nombre)):USUARIOS.filter(u=>u.rol==="sucursal");
  const[zettleLoading,setZettleLoading]=useState(false);
  const[zettleLogs,setZettleLogs]=useState([]);// [{key,label,status,count,error}]
  const[zettleData,setZettleData]=useState([]);// ventas crudas de Zettle, estado aislado
  const[zettleCitas,setZettleCitas]=useState([]);// cobros de recepción con ticket_zettle
  const[zettleSucFiltro,setZettleSucFiltro]=useState(null);
  const[editZettle,setEditZettle]=useState(null);// {id, value} — ticket POS en edición
  const[savingZettle,setSavingZettle]=useState(false);
  const[confirmDeleteTicket,setConfirmDeleteTicket]=useState(null);// ticket POS pendiente de borrar

  // Limpia el estado de la carga anterior al cambiar de mes — evita que queden
  // cifras de otro período visibles mientras no se vuelve a pulsar "Cargar Zettle".
  useEffect(()=>{setZettleData([]);setZettleLogs([]);setZettleCitas([]);},[mesDesde,mesHasta]);

  const ZETTLE_LABEL_MAP={"Coapa":"coapa","Metepec":"metepec","Oriente":"oriente","Valle":"valle_polanco","Polanco":"valle_polanco"};
  const ZETTLE_CUENTAS=filtro?ZETTLE_CUENTAS_FIN.filter(c=>filtro.some(s=>ZETTLE_LABEL_MAP[s]===c.key)):ZETTLE_CUENTAS_FIN;

  const cargarZettle=async()=>{
    setZettleLoading(true);
    setZettleData([]);
    setZettleLogs(ZETTLE_CUENTAS.map(c=>({...c,status:"pending"})));
    const todas=[];
    for(const cuenta of ZETTLE_CUENTAS){
      setZettleLogs(prev=>prev.map(l=>l.key===cuenta.key?{...l,status:"loading"}:l));
      try{
        const url=`${SUPABASE_URL}/functions/v1/sync-zettle?sucursal=${cuenta.key}&startDate=${mesDesde}&raw=true`;
        const res=await fetch(url,{headers:{Authorization:`Bearer ${SUPABASE_KEY}`}});
        const json=await res.json();
        if(!res.ok||!Array.isArray(json)){
          setZettleLogs(prev=>prev.map(l=>l.key===cuenta.key?{...l,status:"error",error:json.error||`HTTP ${res.status}`}:l));
        }else{
          todas.push(...json);
          setZettleLogs(prev=>prev.map(l=>l.key===cuenta.key?{...l,status:"ok",count:json.length}:l));
        }
      }catch(e){
        setZettleLogs(prev=>prev.map(l=>l.key===cuenta.key?{...l,status:"error",error:e.message}:l));
      }
    }
    setZettleData(todas);
    // Cargar cobros de recepción con ticket_zettle registrado en el mismo período
    const{data:citasZ}=await supabase
      .from("citas")
      .select("id,fecha,sucursal_nombre,servicio,total_pagado,ticket_zettle,clienta_nombre")
      .gte("fecha",mesDesde).lte("fecha",mesHasta)
      .eq("es_cobro",true)
      .not("ticket_zettle","is",null);
    setZettleCitas(citasZ||[]);
    setZettleLoading(false);
  };

  return<div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
    {/* ═══ MÉTODOS DE PAGO ═══ */}
    <div className="glass" style={{padding:"22px"}}>
      <div style={{fontSize:"11px",letterSpacing:"2px",color:T.sub,marginBottom:"14px"}}>MÉTODOS DE PAGO · {periodoLabel.toUpperCase()}</div>
      {topMet.length===0&&<div style={{fontSize:"12px",color:T.faint,textAlign:"center",padding:"16px"}}>Sin datos</div>}
      {topMet.map(([m,v])=>(
        <div key={m} style={{marginBottom:"10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"4px"}}>
            <span style={{fontSize:"13px",fontWeight:500}}>{m}</span>
            <div style={{display:"flex",gap:"10px",alignItems:"baseline"}}>
              <span style={{fontSize:"10px",color:T.sub}}>{ventasTotal>0?Math.round(v/ventasTotal*100):0}%</span>
              <span style={{fontSize:"14px",fontWeight:700,color:"#49B8D3"}}>{fmt(v)}</span>
            </div>
          </div>
          <div style={{height:"4px",background:T.div,borderRadius:"2px"}}><div style={{width:`${(v/maxMet)*100}%`,height:"100%",background:"linear-gradient(90deg,#2721E8,#49B8D3)",borderRadius:"2px"}}/></div>
        </div>))}
    </div>

    {/* ═══ VENTAS ZETTLE ═══ */}
    {(()=>{
      const tksZ=(zettleSucFiltro
        ?zettleData.filter(t=>t.sucursal===zettleSucFiltro)
        :zettleData
      ).filter(t=>t.fecha>=mesDesde&&t.fecha<=mesHasta)
       .sort((a,b)=>b.fecha.localeCompare(a.fecha));
      return<div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
        {/* Header + descripción */}
        <div className="glass" style={{padding:"20px 24px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
            <div style={{display:"flex",gap:"14px",alignItems:"flex-start"}}>
              <div style={{fontSize:"22px",marginTop:"2px"}}>💳</div>
              <div>
                <div style={{fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>Seguimiento de ventas — Zettle vs POS</div>
                <div style={{fontSize:"12px",color:T.muted,lineHeight:1.6,maxWidth:"580px"}}>
                  Compara las ventas cobradas en Zettle (la terminal física) contra lo que cada recepcionista registró en el sistema. El objetivo es detectar ventas faltantes de captura, montos incorrectos o bugs en el flujo. Usa el filtro por sucursal para darle seguimiento individual a cada equipo.
                </div>
                <div style={{marginTop:"8px",fontSize:"11px",color:T.sub}}>{mesSelLabel}</div>
              </div>
            </div>
            <button className="btn-primary" style={{fontSize:"12px",opacity:zettleLoading?0.6:1,cursor:zettleLoading?"not-allowed":"pointer",flexShrink:0}} onClick={cargarZettle} disabled={zettleLoading}>
              {zettleLoading?"Cargando...":"🔄 Cargar Zettle"}
            </button>
          </div>
          {/* Logs */}
          {zettleLogs.length>0&&<div style={{marginTop:"16px",display:"flex",gap:"8px",flexWrap:"wrap"}}>
            {zettleLogs.map(l=><div key={l.key} style={{padding:"6px 12px",borderRadius:"8px",fontSize:"11px",fontWeight:600,display:"flex",alignItems:"center",gap:"6px",
              background:l.status==="ok"?"rgba(16,185,129,0.1)":l.status==="error"?"rgba(239,68,68,0.1)":l.status==="loading"?"rgba(73,184,211,0.1)":"rgba(255,255,255,0.05)",
              border:`1px solid ${l.status==="ok"?"rgba(16,185,129,0.3)":l.status==="error"?"rgba(239,68,68,0.3)":l.status==="loading"?"rgba(73,184,211,0.3)":"rgba(255,255,255,0.1)"}`,
              color:l.status==="ok"?"#10b981":l.status==="error"?"#ef4444":l.status==="loading"?"#49B8D3":T.faint}}>
              <span>{l.status==="ok"?"✓":l.status==="error"?"✗":l.status==="loading"?"⋯":"·"}</span>
              <span>{l.label}</span>
              {l.status==="ok"&&<span style={{opacity:0.7}}>({l.count} registros)</span>}
              {l.status==="error"&&<span style={{opacity:0.7,fontSize:"10px"}}>{l.error}</span>}
            </div>)}
          </div>}
        </div>
        {/* Filtro por sucursal */}
        {(()=>{const sucs=[...new Set(zettleData.map(t=>t.sucursal).filter(Boolean))].sort();return sucs.length>1&&<div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <button onClick={()=>setZettleSucFiltro(null)} style={{padding:"6px 14px",borderRadius:"8px",border:"1px solid",fontSize:"12px",fontWeight:600,cursor:"pointer",background:!zettleSucFiltro?"rgba(39,33,232,0.15)":"transparent",borderColor:!zettleSucFiltro?"#2721E8":T.dim,color:!zettleSucFiltro?"#fff":T.muted}}>Todas</button>
          {sucs.map(n=>{const u=USUARIOS_DASH.find(u=>u.nombre===n);return<button key={n} onClick={()=>setZettleSucFiltro(n===zettleSucFiltro?null:n)} style={{padding:"6px 14px",borderRadius:"8px",border:"1px solid",fontSize:"12px",fontWeight:600,cursor:"pointer",background:zettleSucFiltro===n?`${u?.color||"#49B8D3"}22`:"transparent",borderColor:zettleSucFiltro===n?(u?.color||"#49B8D3"):T.dim,color:zettleSucFiltro===n?(u?.color||"#49B8D3"):T.muted}}>{n}</button>;})}
        </div>;})()}
        {/* Estado vacío */}
        {zettleData.length===0&&zettleLogs.length===0&&<div className="glass" style={{padding:"48px",textAlign:"center",color:T.faint,fontSize:"13px"}}>
          Presiona "Cargar Zettle" para obtener las ventas de {mesSelLabel}
        </div>}
        {zettleData.length===0&&zettleLogs.length>0&&!zettleLoading&&<div style={{textAlign:"center",padding:"40px",color:T.faint,fontSize:"13px"}}>Sin ventas Zettle en {mesSelLabel}</div>}

        {/* ── COMPARATIVO ── */}
        {zettleData.length>0&&(()=>{
          // Zettle: filtrado por sucursal y período seleccionado
          const filasZ=(zettleSucFiltro
            ?zettleData.filter(t=>t.sucursal===zettleSucFiltro)
            :zettleData
          ).filter(t=>t.fecha>=mesDesde&&t.fecha<=mesHasta)
           .sort((a,b)=>b.fecha.localeCompare(a.fecha));
          const totalZ=filasZ.reduce((s,t)=>s+Number(t.total),0);
          // POS: tickets manuales del estado global del dashboard, mismo período y sucursal
          const filasPOS=(zettleSucFiltro
            ?tickets.filter(t=>t.sucursal_nombre===zettleSucFiltro)
            :tickets
          ).filter(t=>!t.zettle_uuid&&t.fuente!=="zettle"&&t.fecha>=mesDesde&&t.fecha<=mesHasta)
           .sort((a,b)=>b.fecha.localeCompare(a.fecha));
          const totalPOS=filasPOS.reduce((s,t)=>s+Number(t.total),0);
          // Métricas de brecha
          const pctTickets=filasZ.length>0?Math.round(filasPOS.length/filasZ.length*100):0;
          const pctMonto=totalZ>0?Math.round(totalPOS/totalZ*100):0;
          const color=p=>p>=90?"#10b981":p>=70?"#f59e0b":"#ef4444";
          // Tabla helper
          const TablaComp=({filas,cols,footer,rowStyle})=><div className="glass" style={{padding:0,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                <thead><tr style={{borderBottom:`1px solid ${light?"rgba(0,0,0,0.07)":"rgba(255,255,255,0.06)"}`}}>
                  {cols.map(h=><th key={h.k} style={{padding:"10px 14px",textAlign:h.r?"right":"left",fontWeight:600,fontSize:"10px",letterSpacing:"1px",color:T.sub}}>{h.k.toUpperCase()}</th>)}
                </tr></thead>
                <tbody>{filas.map((row,i)=>{const extraStyle=rowStyle?rowStyle(row,i):{};return<tr key={i} style={{borderBottom:`1px solid ${light?"rgba(0,0,0,0.03)":"rgba(255,255,255,0.04)"}`,background:i%2===0?"transparent":(light?"rgba(0,0,0,0.015)":"rgba(255,255,255,0.015)"),...extraStyle}}>
                  {cols.map(h=><td key={h.k} style={{padding:"8px 14px",textAlign:h.r?"right":"left",...(h.style||{})}}>{h.render(row)}</td>)}
                </tr>;})}</tbody>
                {footer&&<tfoot><tr style={{borderTop:`2px solid ${light?"rgba(0,0,0,0.1)":"rgba(255,255,255,0.1)"}`}}>{footer}</tr></tfoot>}
              </table>
            </div>
          </div>;
          return<>
            {/* ── Panel comparativo ── */}
            <div className="glass" style={{padding:"20px 24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 180px 1fr",gap:"32px",alignItems:"center"}}>
                {/* Zettle */}
                <div>
                  <div style={{fontSize:"10px",letterSpacing:"2px",color:"#49B8D3",fontWeight:700,marginBottom:"14px"}}>💳 ZETTLE — REFERENCIA (100%)</div>
                  <div style={{display:"flex",gap:"32px"}}>
                    <div><div style={{fontSize:"32px",fontWeight:800,color:"#49B8D3",lineHeight:1}}>{filasZ.length}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>transacciones</div></div>
                    <div><div style={{fontSize:"32px",fontWeight:800,color:"#49B8D3",lineHeight:1}}>{fmt(totalZ)}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>total</div></div>
                  </div>
                </div>
                {/* Barras centrales */}
                <div style={{display:"flex",flexDirection:"column",gap:"12px",alignItems:"center"}}>
                  {[{label:"tickets",pct:pctTickets},{label:"monto",pct:pctMonto}].map(({label,pct})=><div key={label} style={{width:"100%",textAlign:"center"}}>
                    <div style={{fontSize:"22px",fontWeight:800,color:color(pct),lineHeight:1}}>{pct}%</div>
                    <div style={{margin:"6px 0",height:"6px",borderRadius:"3px",background:light?"rgba(0,0,0,0.08)":"rgba(255,255,255,0.08)",overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(pct,100)}%`,borderRadius:"3px",background:color(pct),transition:"width 0.4s"}}/>
                    </div>
                    <div style={{fontSize:"10px",color:T.faint}}>{label}</div>
                  </div>)}
                </div>
                {/* POS */}
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"10px",letterSpacing:"2px",color:"#10b981",fontWeight:700,marginBottom:"14px"}}>🖥 POS — LO QUE SUBIERON</div>
                  <div style={{display:"flex",gap:"32px",justifyContent:"flex-end"}}>
                    <div style={{textAlign:"right"}}><div style={{fontSize:"32px",fontWeight:800,color:color(pctTickets),lineHeight:1}}>{filasPOS.length}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>transacciones</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:"32px",fontWeight:800,color:color(pctMonto),lineHeight:1}}>{fmt(totalPOS)}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>total</div></div>
                  </div>
                  {(filasZ.length-filasPOS.length>0||totalZ-totalPOS>0)&&<div style={{marginTop:"10px",fontSize:"12px",color:"#ef4444",fontWeight:600}}>
                    faltan {filasZ.length-filasPOS.length} tickets · {fmt(totalZ-totalPOS)}
                  </div>}
                </div>
              </div>
            </div>
            {/* ── Dos tablas lado a lado ── */}
            {(()=>{
              // Mapa ticket_zettle → clienta_nombre desde el POS para enriquecer la tabla Zettle
              const posClientaMap={};
              filasPOS.forEach(t=>{if(t.ticket_zettle&&t.clienta_nombre)posClientaMap[t.ticket_zettle]=t.clienta_nombre;});
              // También incluir citas con ticket_zettle (cobros vía agenda) para sucursal/período activos
              const citasFiltradas=(zettleSucFiltro?zettleCitas.filter(c=>c.sucursal_nombre===zettleSucFiltro):zettleCitas).filter(c=>c.fecha>=mesDesde&&c.fecha<=mesHasta);
              citasFiltradas.forEach(c=>{if(c.ticket_zettle&&c.clienta_nombre)posClientaMap[c.ticket_zettle]=c.clienta_nombre;});
              // Set de tickets Zettle que ya están capturados en POS o citas
              const posTicketSet=new Set([...filasPOS.map(t=>t.ticket_zettle),...citasFiltradas.map(c=>c.ticket_zettle)].filter(Boolean));
              return<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",alignItems:"start"}}>
              {/* Tabla Zettle */}
              <div>
                <div style={{fontSize:"10px",letterSpacing:"2px",color:"#49B8D3",fontWeight:700,marginBottom:"8px",paddingLeft:"4px"}}>ZETTLE</div>
                <TablaComp filas={filasZ}
                  rowStyle={row=>{const key=row.ticket_num?`#${row.ticket_num}`:null;return key&&posTicketSet.has(key)?{background:light?"rgba(16,185,129,0.08)":"rgba(16,185,129,0.1)",borderLeft:"3px solid #10b981"}:{};}}
                  cols={[
                    {k:"# Ticket",render:t=>{const key=t.ticket_num?`#${t.ticket_num}`:null;const captured=key&&posTicketSet.has(key);return<span style={{fontFamily:"monospace",color:captured?"#10b981":T.muted,fontSize:"11px",fontWeight:captured?700:400}}>{t.ticket_num??<span style={{color:T.faint}}>—</span>}</span>;}},
                    {k:"Fecha",render:t=><span style={{fontFamily:"monospace",color:T.muted,fontSize:"11px"}}>{t.fecha}</span>},
                    {k:"Clienta",render:t=>{const n=t.ticket_num?posClientaMap[`#${t.ticket_num}`]||posClientaMap[String(t.ticket_num)]:null;return<span style={{fontSize:"11px",color:n?T.muted:T.faint,fontStyle:n?"normal":"italic"}}>{n||"—"}</span>;}},
                    {k:"Concepto",render:t=><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"140px",fontSize:"11px",color:T.muted}}>{(t.servicios||[]).join(", ")||"—"}</div>},
                    {k:"Total",r:true,render:t=><span style={{fontWeight:700,fontFamily:"monospace"}}>{fmt(t.total)}</span>},
                  ]}
                  footer={<><td colSpan={4} style={{padding:"10px 14px",fontSize:"11px",fontWeight:600,color:T.sub}}>{filasZ.length} transacciones</td><td style={{padding:"10px 14px",textAlign:"right",fontWeight:700,color:"#49B8D3"}}>{fmt(totalZ)}</td></>}
                />
              </div>
              {/* Tabla POS */}
              <div>
                <div style={{fontSize:"10px",letterSpacing:"2px",color:"#10b981",fontWeight:700,marginBottom:"8px",paddingLeft:"4px"}}>POS — RECEPCIÓN</div>
                {filasPOS.length===0
                  ?<div className="glass" style={{padding:"40px",textAlign:"center",color:T.faint,fontSize:"13px"}}>Sin tickets en el sistema{zettleSucFiltro?` para ${zettleSucFiltro}`:""}</div>
                  :<TablaComp filas={filasPOS}
                    cols={[
                      {k:"# Zettle",render:t=>{
                        const isEditing=editZettle?.id===t.id;
                        const guardarZettle=async()=>{
                          if(savingZettle)return;
                          const raw=(editZettle.value||"").trim();
                          const val=raw?(raw.startsWith("#")?raw:"#"+raw):null;
                          setSavingZettle(true);
                          await supabase.from("tickets").update({ticket_zettle:val}).eq("id",t.id);
                          // Actualizar también la cita vinculada (mismo clienta_id + fecha)
                          if(val&&t.clienta_id){
                            await supabase.from("citas").update({ticket_zettle:val})
                              .eq("clienta_id",t.clienta_id).eq("fecha",t.fecha).eq("es_cobro",true);
                          }
                          // Reflejar en estado local sin recargar todo
                          setTickets(prev=>prev.map(tk=>tk.id===t.id?{...tk,ticket_zettle:val}:tk));
                          setSavingZettle(false);setEditZettle(null);
                        };
                        if(isEditing)return<div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                          <input autoFocus value={editZettle.value} onChange={e=>setEditZettle({...editZettle,value:e.target.value})}
                            onKeyDown={e=>{if(e.key==="Enter")guardarZettle();if(e.key==="Escape")setEditZettle(null);}}
                            placeholder="#123" style={{width:"72px",fontSize:"11px",padding:"3px 6px",borderRadius:"6px",border:"1px solid #49B8D3",background:light?"rgba(0,0,0,0.04)":"transparent",color:light?"#1a1a2e":"#fff",fontFamily:"monospace",outline:"none"}}/>
                          <button onClick={guardarZettle} disabled={savingZettle} style={{fontSize:"11px",padding:"3px 8px",borderRadius:"6px",background:"#49B8D3",border:"none",color:"#fff",cursor:"pointer",fontWeight:600}}>{savingZettle?"...":"✓"}</button>
                          <button onClick={()=>setEditZettle(null)} style={{fontSize:"11px",padding:"3px 6px",borderRadius:"6px",background:"transparent",border:"1px solid rgba(255,255,255,0.15)",color:T.faint,cursor:"pointer"}}>✕</button>
                        </div>;
                        return<div style={{display:"flex",alignItems:"center",gap:"6px",cursor:"pointer"}} onClick={()=>setEditZettle({id:t.id,value:t.ticket_zettle||""})}>
                          <span style={{fontFamily:"monospace",color:t.ticket_zettle?"#49B8D3":T.faint,fontSize:"11px",fontWeight:600}}>{t.ticket_zettle||"—"}</span>
                          <span style={{fontSize:"10px",color:T.faint,opacity:0.5}}>✏</span>
                        </div>;
                      }},
                      {k:"Fecha",render:t=><span style={{fontFamily:"monospace",color:T.muted,fontSize:"11px"}}>{t.fecha}</span>},
                      {k:"Clienta",render:t=><span style={{fontSize:"11px",color:t.clienta_nombre?T.muted:T.faint,fontStyle:t.clienta_nombre?"normal":"italic"}}>{t.clienta_nombre||"—"}</span>},
                      {k:"Concepto",render:t=><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"140px",fontSize:"11px",color:T.muted}}>{(t.servicios||[]).join(", ")||"—"}</div>},
                      {k:"Método",render:t=><span style={{fontSize:"11px",color:T.faint}}>{(t.metodo_pago||"").split(" ")[0]}</span>},
                      {k:"Total",r:true,render:t=><span style={{fontWeight:700,fontFamily:"monospace"}}>{fmt(t.total)}</span>},
                      {k:"",render:t=>{
                        const isPending=confirmDeleteTicket?.id===t.id;
                        if(isPending)return<div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                          <button onClick={async()=>{
                            await supabase.from("tickets").delete().eq("id",t.id);
                            setTickets(prev=>prev.filter(tk=>tk.id!==t.id));
                            setConfirmDeleteTicket(null);
                          }} style={{fontSize:"10px",padding:"3px 8px",borderRadius:"6px",background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.4)",color:"#ef4444",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>Sí, borrar</button>
                          <button onClick={()=>setConfirmDeleteTicket(null)} style={{fontSize:"10px",padding:"3px 6px",borderRadius:"6px",background:"transparent",border:"1px solid rgba(255,255,255,0.15)",color:T.faint,cursor:"pointer"}}>✕</button>
                        </div>;
                        return<button onClick={()=>setConfirmDeleteTicket(t)} title="Eliminar ticket" style={{background:"transparent",border:"none",cursor:"pointer",color:T.faint,fontSize:"13px",padding:"2px 4px",opacity:0.5,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>🗑</button>;
                      }},
                    ]}
                    footer={<><td colSpan={4} style={{padding:"10px 14px",fontSize:"11px",fontWeight:600,color:T.sub}}>{filasPOS.length} transacciones</td><td style={{padding:"10px 14px",textAlign:"right",fontWeight:700,color:color(pctMonto)}}>{fmt(totalPOS)}</td><td/></>}
                  />
                }
              </div>
            </div>;})()}
          </>;
        })()}
      </div>;
    })()}
  </div>;
}
