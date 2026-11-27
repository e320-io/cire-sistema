import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { C, S, FONT, estiloTema, fechaLarga, cap } from "../agenda/ui.jsx";
import LogoCire from "../agenda/LogoCire.jsx";
import TarjetaAnterior from "./TarjetaAnterior.jsx";
import { tokenDe, urlPreview } from "../../lib/lealtad.js";
import { apiTarjetas } from "../../lib/tarjetas.js";
import { rutaLimpia } from "../../lib/dominios.js";

// Tarjeta de lealtad de la clienta (/tarjeta/<token>, solo si está publicada) y vista previa para recepción (/r/<token>, siempre).
// Los números salen del cálculo diario desde el Google Calendar (tablas tarj_*). Si el código no existe en el cálculo nuevo,
// se cae a la tarjeta anterior (solo pruebas de la primera fase).

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (f) => { const [y, m, d] = f.split("-"); return `${+d} ${MES[+m - 1]}${y !== String(new Date().getFullYear()) ? " " + y : ""}`; };

const Sello = ({ tipo, n }) => (
  <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700,
    background: tipo === "on" ? C.verde : "transparent", color: tipo === "on" ? "#fff" : C.suave, fontSize: tipo === "on" ? 17 : 12,
    border: `2px ${tipo === "dud" ? "dashed" : tipo === "q" ? "dotted" : "solid"} ${tipo === "on" ? C.verde : C.gris}` }}>{tipo === "on" ? "✓" : tipo === "q" ? "?" : tipo === "dud" ? "?" : n}</div>
);

function Paquete({ p, abierto }) {
  const n = p.sellos, tot = p.total, fin = tot && n >= tot;
  const sellos = [];
  if (tot) { const dud = p.porConfirmar && n < tot; for (let i = 1; i <= Math.min(tot, 16); i++) sellos.push(<Sello key={i} n={i} tipo={i <= n ? "on" : i === n + 1 && dud ? "dud" : "off"} />); }
  else { for (let i = 0; i < Math.max(n, 1); i++) sellos.push(<Sello key={i} n={i + 1} tipo={n > 0 ? "on" : "off"} />); sellos.push(<Sello key="q" tipo="q" />); }
  return (
    <div style={{ ...S.tarjeta, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: C.verde, fontSize: 15, lineHeight: 1.25 }}>
          {p.nombre}
          {p.mant && <span style={pildora}>Mantenimiento</span>}{p.regalo && <span style={pildora}>Regalo</span>}
        </div>
        <div style={{ fontSize: 13, color: C.suave, whiteSpace: "nowrap", fontWeight: 600 }}>{tot ? `${n} de ${tot}` : `${n} ${n === 1 ? "sesión" : "sesiones"}`}</div>
      </div>
      {p.combo && <div style={{ fontSize: 12, color: C.suave, marginBottom: 8 }}>Incluye: {p.combo.incluye.join(" · ")}</div>}
      {(p.leyendas || []).length > 0 && <div style={{ fontSize: 12, color: C.suave, marginBottom: 8 }}>📝 {p.leyendas.map((l) => l.texto).join(" · ")}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{sellos}</div>
      {fin && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: C.verdeMedio }}>🎉 ¡Paquete completo!</div>}
      {!fin && p.proxima && <div style={barra(C.menta, C.verde)}>📅 Próxima: {p.proxima.n != null ? `sesión ${p.proxima.n} · ` : ""}{cap(fechaLarga(p.proxima.fecha))}</div>}
      {!fin && !p.proxima && p.citaAbierta && <div style={barra("#FFF3C4", "#6b5200")}>📅 Cita abierta · pendiente de agendar</div>}
      <details style={{ marginTop: 10 }} open={abierto}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.verde }}>Ver detalle por fecha</summary>
        <div style={{ fontSize: 13, color: C.texto, marginTop: 8 }}>
          {p.sesiones.map((s, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: `1px solid ${C.menta}` }}>
              {s.suelta ? <>↳ <b>{corta(s.fecha)}</b> zona suelta: {s.zonas.join(", ")}</> : <><b>{s.n != null ? "S" + s.n : "Sesión"}</b> · {corta(s.fecha)} · {s.ok ? "✅ vino" : s.fut ? "📅 agendada" : s.no ? "❌" : "realizada"}{p.combo ? " · " + s.zonas.join(", ") : ""}</>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
const pildora = { display: "inline-block", background: C.menta, color: C.verde, borderRadius: 20, padding: "1px 8px", fontSize: 11, marginLeft: 6, fontWeight: 600 };
const barra = (bg, col) => ({ marginTop: 10, background: bg, color: col, borderRadius: 12, padding: "8px 12px", fontSize: 13, fontWeight: 600 });

function Feedback({ token, d, origen }) {
  const [v, setV] = useState(""); const [n, setN] = useState(""); const [nota, setNota] = useState(""); const [env, setEnv] = useState(false); const [err, setErr] = useState(""); const [cargando, setCargando] = useState(false);
  const enviar = async (veredicto) => {
    setCargando(true); setErr("");
    try { await apiTarjetas("feedback", { token, veredicto, origen, sellosReales: n === "" ? undefined : Number(n), nota }); setEnv(true); } catch (e) { setErr(e.message); }
    setCargando(false);
  };
  if (env) return <div style={{ ...S.tarjeta, textAlign: "center", fontWeight: 700, color: C.verde }}>¡Gracias! {v === "no" ? "Revisaremos tu tarjeta." : "Qué bueno que cuadra."} 💛</div>;
  return (
    <div style={S.tarjeta}>
      <div style={{ fontWeight: 700, color: C.verde, marginBottom: 10 }}>{origen === "recepcion" ? "¿Los sellos coinciden con lo que dice la clienta?" : "¿Tus sellos son correctos?"}</div>
      {v !== "no" && <div style={{ display: "flex", gap: 10 }}>
        <button style={{ ...S.boton(!cargando), flex: 1 }} disabled={cargando} onClick={() => { setV("si"); enviar("si"); }}>✅ Sí</button>
        <button style={{ ...S.boton(true), flex: 1, background: "#fff", color: C.verde, border: `2px solid ${C.verde}` }} onClick={() => setV("no")}>❌ No me cuadra</button>
      </div>}
      {v === "no" && <>
        <label style={S.etiqueta}>{origen === "recepcion" ? "¿Cuántas sesiones lleva en realidad?" : "¿Cuántas sesiones llevas en realidad?"} (si lo sabes)</label>
        <input style={S.input} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ej. 5" />
        <label style={S.etiqueta}>¿Qué no cuadra? (opcional)</label>
        <input style={S.input} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. me faltan las axilas" maxLength={300} />
        <button style={S.boton(!cargando)} disabled={cargando} onClick={() => enviar("no")}>Enviar</button>
        <button style={S.link} onClick={() => setV("")}>← Volver</button>
      </>}
      {err && <div style={{ color: C.rosa, fontSize: 13, marginTop: 8, fontWeight: 600 }}>{err}</div>}
    </div>
  );
}

export default function TarjetaPublica() {
  const preview = /^\/r\//.test(rutaLimpia());
  const token = tokenDe(rutaLimpia());
  const [d, setD] = useState(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  const [anterior, setAnterior] = useState(false);

  useEffect(() => {
    document.title = preview ? "Vista previa · CIRE" : "Tu tarjeta · CIRE";
    document.body.style.margin = "0";
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    if (preview) { const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.appendChild(m); }
  }, []);
  useEffect(() => {
    if (!token) { setErr("Esta tarjeta no es válida."); return; }
    if (!preview) QRCode.toDataURL(urlPreview(token), { margin: 1, width: 360, errorCorrectionLevel: "M" }).then(setQr).catch(() => {});
    const cargar = () => apiTarjetas(preview ? "preview" : "ver", { token }).then(setD).catch((e) => { if (!preview && /no encontrada/i.test(e.message)) setAnterior(true); else setErr(e.message); });
    cargar();
    const vis = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [token]);

  if (anterior) return <TarjetaAnterior />;
  const activos = d?.paquetes.filter((p) => p.estado === "activo") ?? [], completos = d?.paquetes.filter((p) => p.estado === "completo") ?? [];
  return (
    <div style={{ ...S.pagina, ...estiloTema("turquesa") }}>
      <div style={S.caja}>
        {preview && <div style={{ background: "#fff3c4", color: "#6b5200", border: "3px solid #fff", borderRadius: 16, padding: "10px 14px", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
          👀 VISTA PREVIA PARA RECEPCIÓN{d && !d.interno.publicada ? " · esta tarjeta todavía NO está publicada: la clienta no puede verla" : ""}</div>}
        <div style={{ textAlign: "center", marginBottom: 14, color: "#fff" }}><LogoCire size={150} /><div style={{ opacity: .95, fontSize: 14, fontWeight: 600, marginTop: 4 }}>Tu tarjeta de sesiones</div></div>
        {err && <div style={S.pildora}>{err}</div>}
        {!d && !err && <div style={{ ...S.pildora, textAlign: "center" }}>Cargando tu tarjeta…</div>}
        {d && <>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: "0 4px 12px" }}>Hola, {d.nombre} 👋</div>
          {activos.length === 0 && <div style={S.pildora}>No tienes paquetes en curso. Cuando tengas uno, aquí verás tus sellos.</div>}
          {activos.map((p, i) => <Paquete key={i} p={p} />)}
          {completos.length > 0 && <details style={{ marginBottom: 12 }}><summary style={{ cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 14, padding: "8px 4px" }}>Paquetes completos ({completos.length})</summary>
            <div style={{ marginTop: 8 }}>{completos.map((p, i) => <Paquete key={i} p={p} />)}</div></details>}

          {preview && d.interno && <div style={{ ...S.tarjeta, fontSize: 13, color: C.texto }}>
            <div style={{ fontWeight: 700, color: C.verde, marginBottom: 6 }}>Datos internos (solo recepción)</div>
            <div>Clienta: <b>{d.interno.nombreCompleto}</b> · {d.sucursal} · cel. …{d.interno.tel4}</div>
            <div>Título en el Calendar: <code>{d.interno.tituloCalendario}</code></div>
            <div>Confianza: <b>{d.interno.estricta ? "🟢 grupo estricto" : d.interno.nivel === "alta" ? "🟡 alta (no estricta)" : "⚪ por revisar"}</b></div>
            {d.interno.motivos.filter((m) => !m.alta).map((m, i) => <div key={i} style={{ color: C.rosa }}>• {m.paquete}: {m.motivos.join(", ")}</div>)}
            {d.interno.sinAsignar?.length > 0 && <div style={{ color: C.rosa }}>• Hay {d.interno.sinAsignar.length} cita(s) que no se pudieron asignar a un paquete.</div>}
          </div>}

          {preview && <Feedback token={token} d={d} origen="recepcion" />}

          {!preview && qr && <div style={{ ...S.tarjeta, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.verde, marginBottom: 10 }}>Muéstralo en recepción</div>
            <img src={qr} alt="Código de tu tarjeta" width={170} height={170} style={{ display: "block", margin: "0 auto" }} />
          </div>}
        </>}
      </div>
    </div>
  );
}
