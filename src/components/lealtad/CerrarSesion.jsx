import React, { useEffect, useState } from "react";
import { apiTarjetas } from "../../lib/tarjetas.js";
import { urlPreview } from "../../lib/lealtad.js";
import { SUCURSALES_NAMES } from "../../lib/constantes.js";
import SelloRecepcion from "./SelloRecepcion.jsx";

// Recepción escanea el QR de la clienta al terminar su sesión: ve la cita de HOY del Google Calendar, marca si se hicieron
// todas las zonas (o cuáles faltaron) y la sesión queda con ✅ en Calendar. Piloto: solo Metepec. Si el QR es de la tarjeta
// anterior (sin cálculo nuevo), cae a la pantalla de sellos de antes.
const Caja = ({ children, style }) => <div className="glass" style={{ padding: 16, marginBottom: 12, ...style }}>{children}</div>;
const Barra = ({ sellos, total }) => total ? (
  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>{Array.from({ length: total }, (_, i) => <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < sellos ? "#10b981" : "rgba(128,128,128,.25)" }} />)}</div>
) : null;

export default function CerrarSesion({ session, token, onClose }) {
  const sucursal = session.rol === "sucursal" ? session.nombre : (session.sucursales?.[0] || session.sucursalesPropias?.[0] || SUCURSALES_NAMES[0]);
  const [d, setD] = useState(null); const [err, setErr] = useState(""); const [anterior, setAnterior] = useState(false);
  const [sel, setSel] = useState({}); const [confirmar, setConfirmar] = useState(null); const [busy, setBusy] = useState(false); const [listo, setListo] = useState(null);

  const cargar = async () => {
    setErr("");
    try { setD(await apiTarjetas("sesion_hoy", { token }, { recepcion: true })); }
    catch (e) { if (/no encontrada/i.test(e.message)) setAnterior(true); else setErr(e.message); }
  };
  useEffect(() => { cargar(); }, [token]); // eslint-disable-line

  if (anterior) return <SelloRecepcion session={session} token={token} onClose={onClose} />;

  const zonasDe = (c) => [...new Set(c.sesionesHoy.flatMap((s) => s.zonas))];
  const noHechas = (c) => zonasDe(c).filter((z) => sel[c.id + z] === false);
  const cerrar = async (c) => {
    setBusy(true); setErr("");
    try {
      const r = await apiTarjetas("cerrar_sesion", { token, sucursal, eventoId: c.id, faltaron: noHechas(c), paquete: c.sesionesHoy[0]?.paquete }, { recepcion: true });
      setListo(r); setConfirmar(null); cargar();
    } catch (e) { setErr(e.message); setConfirmar(null); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.65)", overflowY: "auto", padding: 16 }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Caja style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div><div style={{ fontSize: 11, letterSpacing: 2, opacity: .6 }}>CERRAR SESIÓN DE HOY</div><div style={{ fontSize: 20, fontWeight: 700 }}>{d ? d.clienta.nombre : "…"}</div></div>
          <button className="btn-ghost" onClick={onClose}>Cerrar ✕</button>
        </Caja>
        {err && <Caja style={{ color: "#ff6b6b" }}>{err}</Caja>}
        {d && d.paquetes.length > 0 && <Caja>
          {d.paquetes.map((p, i) => <div key={i} style={{ marginBottom: i < d.paquetes.length - 1 ? 10 : 0 }}><b>{p.nombre}</b> · {p.sellos}{p.total ? ` de ${p.total}` : " sesiones"}<Barra sellos={p.sellos} total={p.total} /></div>)}
          <a href={urlPreview(d.clienta.token)} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: "inline-block", marginTop: 10 }}>Ver tarjeta completa</a>
        </Caja>}
        {d && !d.piloto && <Caja>Marcar sesiones desde aquí aún no está activo en {d.clienta.sucursal}. Puedes ver su tarjeta con el enlace de arriba.</Caja>}
        {d && d.piloto && d.citas.length === 0 && <Caja>No hay una cita de hoy en el calendario con el celular de esta clienta.</Caja>}
        {listo && <Caja style={{ background: "rgba(16,185,129,.18)" }}>✅ Sesión marcada en el calendario.{listo.recalculada === false ? " La tarjeta se actualizará en la corrida de la mañana." : " La tarjeta ya se actualizó."}</Caja>}
        {d && d.piloto && d.citas.map((c) => {
          const zonas = zonasDe(c); const falt = noHechas(c); const ya = c.vino;
          return (
            <Caja key={c.id}>
              <div style={{ fontWeight: 700 }}>{c.hora} · {c.titulo}</div>
              {c.descripcion && <div style={{ fontSize: 12, opacity: .7, margin: "4px 0 8px", whiteSpace: "pre-line" }}>{c.descripcion}</div>}
              {c.sesionesHoy.map((s, i) => <div key={i} style={{ fontSize: 13, marginTop: 4 }}>{s.paquete}{s.n ? ` · sesión ${s.n}` : ""}</div>)}
              {ya ? <div style={{ marginTop: 10, fontWeight: 600 }}>✅ Ya está marcada.{c.cierre?.length ? ` Faltó: ${c.cierre.join(", ")}.` : ""}</div> : <>
                {zonas.length > 0 && <div style={{ margin: "10px 0 4px", fontSize: 13, opacity: .8 }}>Zonas de hoy: desmarca las que NO se hicieron</div>}
                {zonas.map((z) => (
                  <label key={z} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", fontSize: 15 }}>
                    <input type="checkbox" checked={sel[c.id + z] !== false} onChange={(e) => setSel({ ...sel, [c.id + z]: e.target.checked })} /> {z}
                  </label>
                ))}
                {confirmar === c.id ? <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>Se pondrá ✅ en esta cita del calendario{falt.length ? ` y se anotará: faltó ${falt.join(", ")}` : ""}.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmar(null)} disabled={busy}>Cancelar</button>
                    <button className="btn-blue" style={{ flex: 1 }} onClick={() => cerrar(c)} disabled={busy}>{busy ? "Guardando…" : "Confirmar"}</button>
                  </div>
                </div> : <button className="btn-blue" style={{ width: "100%", padding: 12, marginTop: 10 }} onClick={() => setConfirmar(c.id)}>
                  {falt.length ? `✅ Marcar sesión (faltó ${falt.join(", ")})` : "✅ Sesión completa"}
                </button>}
              </>}
            </Caja>
          );
        })}
      </div>
    </div>
  );
}
