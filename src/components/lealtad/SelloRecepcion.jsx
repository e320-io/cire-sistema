import React, { useEffect, useState } from "react";
import { apiLealtad } from "../../lib/lealtad.js";
import { SUCURSALES_NAMES } from "../../lib/constantes.js";

// Pantalla de recepción al escanear la tarjeta: elegir paquete(s) → confirmar sesión de hoy → agendar la siguiente
// (crea el evento en el Google Calendar de la sucursal). Se muestra encima del sistema (no pierde lo que había abierto).

const fechaCorta = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
const Caja = ({ children, style }) => <div className="glass" style={{ padding: 16, marginBottom: 12, ...style }}>{children}</div>;
const Barra = ({ usadas, total }) => (
  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
    {Array.from({ length: total }, (_, i) => <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < usadas ? "#10b981" : "rgba(128,128,128,.25)" }} />)}
  </div>
);

export default function SelloRecepcion({ session, token, onClose }) {
  const inicial = session.rol === "sucursal" ? session.nombre : (session.sucursales?.[0] || session.sucursalesPropias?.[0] || SUCURSALES_NAMES[0]);
  const [sucursal, setSucursal] = useState(inicial);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);            // resultados de sellar
  const [agendando, setAgendando] = useState(null); // { paqueteId, servicio, sesion, total, dias, dia, hora }
  const [hecho, setHecho] = useState({});           // paqueteId -> "Jue 5 dic · 17:00"

  const cargar = async () => {
    setErr("");
    try {
      const j = await apiLealtad("escaneo", { token }, { recepcion: true });
      setD(j);
      const libres = j.paquetes.filter((p) => !p.bloqueo);
      setSel(libres.length === 1 ? [libres[0].id] : []);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { cargar(); }, [token]); // eslint-disable-line

  const sellar = async () => {
    setBusy(true); setErr("");
    try { setRes((await apiLealtad("sellar", { token, paqueteIds: sel, sucursal }, { recepcion: true })).resultados); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const deshacer = async (selloId) => {
    if (!confirm("¿Deshacer este sello?")) return;
    try { await apiLealtad("anular", { selloId }, { recepcion: true }); setRes(null); setHecho({}); await cargar(); }
    catch (e) { setErr(e.message); }
  };
  const abrirAgenda = async (r) => {
    setBusy(true); setErr("");
    try {
      const j = await apiLealtad("disponibilidad", { token, paqueteId: r.paqueteId, sucursal }, { recepcion: true });
      const dia = Object.keys(j.dias)[0] || "";
      setAgendando({ paqueteId: r.paqueteId, servicio: r.servicio, sesion: r.sesion + 1, total: r.total, dias: j.dias, dia, hora: "", dur: j.duracionMin });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const agendar = async () => {
    setBusy(true); setErr("");
    try {
      const j = await apiLealtad("agendar_siguiente", { token, paqueteId: agendando.paqueteId, sucursal, fecha: agendando.dia, hora: agendando.hora }, { recepcion: true });
      setHecho((h) => ({ ...h, [agendando.paqueteId]: `${fechaCorta(j.fecha)} · ${j.hora}` }));
      setAgendando(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const nombre = d?.clienta?.nombre;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.65)", overflowY: "auto", padding: 16 }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <Caja>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 2, opacity: .6 }}>TARJETA CIRE</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{nombre || "Cargando…"}</div>
              {d?.clienta?.telefono && <div style={{ fontSize: 12, opacity: .7 }}>📱 {d.clienta.telefono}</div>}
            </div>
            <button className="btn-ghost" onClick={onClose}>Cerrar ✕</button>
          </div>
          {session.rol !== "sucursal" && (
            <div style={{ marginTop: 10, fontSize: 12 }}>Sucursal:{" "}
              <select className="inp" value={sucursal} onChange={(e) => setSucursal(e.target.value)} style={{ display: "inline-block", width: "auto", padding: "4px 8px" }}>
                {SUCURSALES_NAMES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
        </Caja>

        {err && <Caja style={{ borderColor: "rgba(255,107,107,.5)", color: "#ff6b6b", fontSize: 14 }}>{err}</Caja>}

        {/* 1) elegir paquete y sellar */}
        {d && !res && (
          <>
            {d.paquetes.length === 0 && <Caja>Esta clienta no tiene paquetes activos de varias sesiones.{d.completos ? ` (${d.completos} ya completado${d.completos > 1 ? "s" : ""})` : ""}</Caja>}
            {d.paquetes.map((p) => {
              const on = sel.includes(p.id);
              return (
                <Caja key={p.id} style={{ opacity: p.bloqueo ? .7 : 1, borderColor: on ? "#10b981" : undefined, cursor: p.bloqueo ? "default" : "pointer" }}
                  onClick={() => { if (!p.bloqueo) setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id])); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{p.bloqueo ? "" : on ? "☑ " : "☐ "}{p.servicio}</div>
                    <div style={{ fontSize: 13, opacity: .8, whiteSpace: "nowrap" }}>lleva {p.usadas} de {p.total}</div>
                  </div>
                  <Barra usadas={p.usadas} total={p.total} />
                  {!p.bloqueo && <div style={{ fontSize: 12, color: "#10b981", marginTop: 6 }}>Hoy sería la sesión {p.usadas + 1}</div>}
                  {p.bloqueo && <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 6 }}>{p.bloqueo}</div>}
                </Caja>
              );
            })}
            {d.sellosHoy?.length > 0 && !res && <div style={{ fontSize: 12, opacity: .7, marginBottom: 10 }}>Hoy ya se registró {d.sellosHoy.length} sello{d.sellosHoy.length > 1 ? "s" : ""} de esta clienta.</div>}
            {d.proxima && <div style={{ fontSize: 13, opacity: .8, marginBottom: 12 }}>📅 Próxima sesión ya agendada: {fechaCorta(d.proxima.fecha)} · {d.proxima.hora}</div>}
            {d.paquetes.some((p) => !p.bloqueo) && (
              <button className="btn-blue" disabled={busy || !sel.length} style={{ width: "100%", padding: 14, fontSize: 15 }} onClick={sellar}>
                {busy ? "Guardando…" : sel.length > 1 ? `Confirmar sesión de hoy (${sel.length} paquetes)` : "Confirmar sesión de hoy"}
              </button>
            )}
          </>
        )}

        {/* 2) resultado + agendar siguiente */}
        {res && !agendando && (
          <>
            {res.map((r) => (
              <Caja key={r.paqueteId} style={{ borderColor: r.ok ? "#10b981" : "rgba(245,158,11,.6)" }}>
                <div style={{ fontWeight: 600 }}>{r.servicio}</div>
                {r.ok
                  ? <div style={{ color: "#10b981", marginTop: 4 }}>✓ Sello puesto · sesión {r.sesion} de {r.total}{r.completo ? " · 🎉 ¡paquete completo!" : ""}</div>
                  : <div style={{ color: "#f59e0b", marginTop: 4 }}>{r.motivo}</div>}
                {r.ok && !r.completo && !hecho[r.paqueteId] && (
                  <button className="btn-blue" disabled={busy} style={{ width: "100%", padding: 12, marginTop: 10 }} onClick={() => abrirAgenda(r)}>
                    {busy ? "Buscando horarios…" : `📅 Agendar sesión ${r.sesion + 1} de ${r.total}`}
                  </button>
                )}
                {hecho[r.paqueteId] && <div style={{ marginTop: 8, fontSize: 14 }}>📅 Siguiente sesión agendada: <b>{hecho[r.paqueteId]}</b></div>}
                {r.ok && <button className="btn-ghost" style={{ marginTop: 8, fontSize: 12 }} onClick={() => deshacer(r.selloId)}>↩ Deshacer sello</button>}
              </Caja>
            ))}
            <button className="btn-blue" style={{ width: "100%", padding: 14 }} onClick={onClose}>Listo</button>
          </>
        )}

        {/* 3) elegir fecha y hora de la siguiente */}
        {agendando && (
          <Caja>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Sesión {agendando.sesion} de {agendando.total}</div>
            <div style={{ fontSize: 13, opacity: .75, marginBottom: 12 }}>{agendando.servicio} · {agendando.dur} min · {sucursal}</div>
            {Object.keys(agendando.dias).length === 0 && <div style={{ color: "#f59e0b" }}>No hay horarios libres en los próximos días.</div>}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
              {Object.keys(agendando.dias).map((dia) => (
                <button key={dia} className={agendando.dia === dia ? "btn-blue" : "btn-ghost"} style={{ flex: "0 0 auto", fontSize: 12, padding: "8px 10px" }}
                  onClick={() => setAgendando({ ...agendando, dia, hora: "" })}>{fechaCorta(dia)}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
              {(agendando.dias[agendando.dia] || []).map((h) => (
                <button key={h} className={agendando.hora === h ? "btn-blue" : "btn-ghost"} style={{ padding: "9px 0", fontSize: 13 }}
                  onClick={() => setAgendando({ ...agendando, hora: h })}>{h}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setAgendando(null)}>Ahora no</button>
              <button className="btn-blue" style={{ flex: 2 }} disabled={busy || !agendando.hora} onClick={agendar}>{busy ? "Agendando…" : "Agendar en el calendario"}</button>
            </div>
          </Caja>
        )}
      </div>
    </div>
  );
}
