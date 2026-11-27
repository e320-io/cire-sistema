import React, { useEffect, useState } from "react";
import { apiTarjetas } from "../../lib/tarjetas.js";
import { urlPreview } from "../../lib/lealtad.js";
import { SUCURSALES_NAMES } from "../../lib/constantes.js";

// "Hoy": las citas de hoy del Google Calendar de la sucursal (solo lectura), cada una ligada a su tarjeta para verla en vista previa.
const NIVEL = { estricto: "🟢", alta: "🟡", revisar: "⚪" };
export default function HoyRecepcion({ session, onClose }) {
  const inicial = session.rol === "sucursal" ? session.nombre : (session.sucursales?.[0] || session.sucursalesPropias?.[0] || SUCURSALES_NAMES[0]);
  const [suc, setSuc] = useState(inicial); const [d, setD] = useState(null); const [err, setErr] = useState(""); const [cargando, setCargando] = useState(false);
  const cargar = async () => { setCargando(true); setErr(""); try { setD(await apiTarjetas("hoy", { sucursal: suc }, { recepcion: true })); } catch (e) { setErr(e.message); setD(null); } setCargando(false); };
  useEffect(() => { cargar(); }, [suc]); // eslint-disable-line
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.65)", overflowY: "auto", padding: 16 }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div className="glass" style={{ padding: 16, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 11, letterSpacing: 2, opacity: .6 }}>HOY · {d?.dia || ""}</div><div style={{ fontSize: 20, fontWeight: 700 }}>Citas de {suc}</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {session.rol !== "sucursal" && <select className="inp" value={suc} onChange={(e) => setSuc(e.target.value)} style={{ width: "auto", padding: "6px 8px" }}>{SUCURSALES_NAMES.map((s) => <option key={s}>{s}</option>)}</select>}
            <button className="btn-ghost" onClick={cargar} disabled={cargando}>{cargando ? "…" : "↻"}</button>
            <button className="btn-ghost" onClick={onClose}>Cerrar ✕</button>
          </div>
        </div>
        {err && <div className="glass" style={{ padding: 14, marginBottom: 12, color: "#ff6b6b" }}>{err}</div>}
        {d && d.citas.length === 0 && <div className="glass" style={{ padding: 14 }}>No hay citas con celular en el calendario de hoy.</div>}
        {d?.citas.map((c, i) => (
          <div key={i} className="glass" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div><b>{c.hora}</b> · {c.titulo} {c.vino ? "✅" : ""}</div>
              {c.clienta ? <a className="btn-blue" style={{ textDecoration: "none", padding: "6px 12px", whiteSpace: "nowrap" }} href={urlPreview(c.clienta.token)} target="_blank" rel="noreferrer">Ver tarjeta</a> : <span style={{ opacity: .6, fontSize: 12 }}>sin tarjeta</span>}
            </div>
            {c.clienta && <div style={{ fontSize: 13, opacity: .8, marginTop: 4 }}>{NIVEL[c.clienta.estricta ? "estricto" : c.clienta.nivel]} {c.clienta.resumen || "sin paquete activo"}</div>}
          </div>
        ))}
        <div style={{ fontSize: 11, opacity: .6, textAlign: "center", marginTop: 8 }}>🟢 grupo estricto (medido) · 🟡 alta, no estricta · ⚪ por revisar. Solo lectura: no cambia nada en el calendario.</div>
      </div>
    </div>
  );
}
