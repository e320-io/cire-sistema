import React, { useEffect, useRef, useState } from "react";
import { C, S, cap, fechaLarga } from "./ui.jsx";
import CierreCita from "./CierreCita.jsx";

// Paso "Asegura tu lugar": datos para el anticipo (copiar CLABE), y subir la captura del comprobante.
// La clienta sale a su app del banco y regresa: la reserva se guarda en este dispositivo (localStorage) para poder retomarla.

const KEY = "cire_apartado_pendiente";
export const guardarPendiente = (d) => { try { localStorage.setItem(KEY, JSON.stringify({ ...d, t: Date.now() })); } catch { /* sin storage: no pasa nada */ } };
export const borrarPendiente = () => { try { localStorage.removeItem(KEY); } catch { /* idem */ } };
export const leerPendiente = (slug) => {
  try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && d.slug === slug && Date.now() - d.t < 7 * 864e5) return d; } catch { /* idem */ }
  return null;
};

const copiarTexto = async (txt) => {
  try { await navigator.clipboard.writeText(txt); return true; } catch { /* iOS viejo / http: cae al método clásico */ }
  const t = document.createElement("textarea");
  t.value = txt; t.style.cssText = "position:fixed;opacity:0;top:0;left:0"; document.body.appendChild(t); t.select(); t.setSelectionRange(0, txt.length);
  let ok = false; try { ok = document.execCommand("copy"); } catch { /* idem */ }
  t.remove(); return ok;
};

function Copiar({ texto, etiqueta = "Copiar", grande }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={async () => { if (await copiarTexto(texto)) { setOk(true); setTimeout(() => setOk(false), 2200); } }}
      style={{ fontFamily: "inherit", fontWeight: 700, fontSize: grande ? 15 : 12, border: "none", borderRadius: grande ? 16 : 10, padding: grande ? "13px 16px" : "6px 12px", cursor: "pointer",
        width: grande ? "100%" : "auto", background: ok ? C.rosa : C.verde, color: "#fff", flex: "0 0 auto" }}>
      {ok ? "¡Copiado! ✓" : etiqueta}
    </button>
  );
}

// Reduce la captura (suelen pesar varios MB) a un JPG ligero antes de subirla.
const comprimir = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No pudimos leer esa imagen. Intenta con una captura en JPG o PNG.")); };
  img.src = url;
});

const Num = ({ n, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
    <span style={{ background: C.rosa, color: "#fff", borderRadius: "50%", width: 28, height: 28, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flex: "0 0 auto" }}>{n}</span>
    <span style={{ fontWeight: 800, fontSize: 17, color: C.verde }}>{children}</span>
  </div>
);
const Dato = ({ k, v, copiar }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.menta}` }}>
    <div><div style={{ fontSize: 11, fontWeight: 600, color: C.suave, letterSpacing: ".04em", textTransform: "uppercase" }}>{k}</div><div style={{ fontWeight: 700, fontSize: 14, color: C.verde, wordBreak: "break-word" }}>{v}</div></div>
    {copiar && <Copiar texto={copiar} />}
  </div>
);

/** d = { reservaId, telefono, servicio, fecha, hora, horaFin, anticipo, reagendarHoras, comprobante } */
export default function AseguraLugar({ api, sucursal, info, d, setErr, onSalir }) {
  const [vista, setVista] = useState(null); // dataURL comprimido listo para enviar
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(!!d.comprobante);
  const [luego, setLuego] = useState(false);
  const input = useRef(null);
  const a = d.anticipo;
  const pesos = (n) => "$" + Math.round(n).toLocaleString("en-US");

  const elegir = async (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    setErr("");
    try { setVista(await comprimir(f)); } catch (e) { setVista(null); setErr(e.message); }
  };
  const enviar = async () => {
    setErr(""); setEnviando(true);
    try { await api("comprobante", { reservaId: d.reservaId, telefono: d.telefono, imagen: vista }); borrarPendiente(); setListo(true); }
    catch (e) { setErr(e.message); }
    setEnviando(false);
  };

  if (listo) return (
    <>
    <div style={S.tarjeta}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <div style={{ background: C.verde, color: "#fff", borderRadius: "50%", width: 52, height: 52, display: "grid", placeItems: "center", fontSize: 28, flex: "0 0 auto" }}>✓</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 19, color: C.verde }}>¡Comprobante enviado!</div>
          <div style={{ fontSize: 13, color: C.suave }}>Gracias por tu anticipo</div>
        </div>
      </div>
      <div style={{ ...S.pildora, marginBottom: 10 }}>Hemos enviado tu comprobante a validación y te confirmamos tu cita por WhatsApp.</div>
      <div style={{ fontSize: 13, color: C.suave, lineHeight: 1.5 }}>Si necesitas cambiarla, entra de nuevo a este link y elige <b>Reagendar mi cita</b> (una sola vez, con al menos {d.reagendarHoras} h de anticipación).</div>
    </div>
    <CierreCita info={info || { nombre: sucursal }} fecha={d.fecha} hora={d.hora} horaFin={d.horaFin} servicio={d.servicio} estadoAnticipo="Comprobante en validación" />
    </>
  );

  return (
    <>
      <div style={S.pildora}>
        <b>✓ Tu horario está reservado:</b><br />{cap(fechaLarga(d.fecha))} · {d.hora} – {d.horaFin}<br /><span style={{ opacity: 0.85 }}>{d.servicio} · CIRE {sucursal}</span>
      </div>

      <div style={{ background: C.rosa, color: "#fff", border: "3px solid #fff", borderRadius: 20, padding: "16px 18px", marginBottom: 14, fontSize: 14, lineHeight: 1.5 }}>
        <b style={{ fontSize: 16 }}>Información para agendar 🌟🩷</b><br />
        <span style={{ display: "block", marginTop: 6 }}>Te comentamos que afortunadamente tenemos la agenda saturada. Para garantizar tu cita deberás realizar un anticipo de <b>{pesos(a.monto)} por depósito o transferencia</b> a la siguiente cuenta:</span>
        <span style={{ display: "block", marginTop: 6, opacity: 0.92 }}>(Mismos que se toman a cuenta de tu pago final)</span>
      </div>

      {a.sinDatos ? (
        <div style={S.tarjeta}><div style={{ fontSize: 14, color: C.verde, fontWeight: 600 }}>Escríbenos por WhatsApp y te compartimos los datos para tu anticipo de {pesos(a.monto)}. Después sube aquí tu comprobante.</div></div>
      ) : (
        <div style={S.tarjeta}>
          <Num n="1">Copia los datos y transfiere</Num>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.suave, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 4 }}>CLABE interbancaria</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: C.verde, letterSpacing: ".02em", marginBottom: 10, wordBreak: "break-all" }}>{a.clabe.replace(/^(\d{3})(\d{3})(\d{11})(\d)$/, "$1 $2 $3 $4")}</div>
          <Copiar texto={a.clabe} etiqueta="Copiar CLABE" grande />
          <div style={{ marginTop: 12 }}>
            <Dato k="Banco" v={a.banco} />
            <Dato k="Beneficiario" v={a.beneficiario} />
            {a.cuenta && <Dato k="Cuenta (solo del mismo banco)" v={a.cuenta} copiar={a.cuenta} />}
            <Dato k="Concepto (ponlo igual)" v={a.concepto} copiar={a.concepto} />
          </div>
        </div>
      )}

      <div style={S.tarjeta}>
        <Num n="2">Haz tu transferencia</Num>
        <div style={{ fontSize: 14, color: C.suave, lineHeight: 1.5 }}>Abre la app de tu banco, pega la CLABE y transfiere. <b style={{ color: C.verde }}>Cuando termines, regresa a esta página</b> para subir tu comprobante. Tu reserva queda guardada en este dispositivo.</div>
      </div>

      <div style={S.tarjeta}>
        <Num n="3">Sube tu comprobante</Num>
        <input ref={input} type="file" accept="image/*" onChange={elegir} style={{ display: "none" }} />
        {vista && <img src={vista} alt="Vista previa de tu comprobante" style={{ display: "block", maxWidth: "100%", maxHeight: 260, margin: "0 auto 12px", borderRadius: 14, border: `2px solid ${C.menta}` }} />}
        <button type="button" onClick={() => input.current?.click()} style={{ ...S.boton(true), background: vista ? C.menta : C.verde, color: vista ? C.verde : "#fff", boxShadow: "none", marginBottom: vista ? 10 : 0 }}>
          {vista ? "Cambiar captura" : "📎 Elegir captura de pantalla"}
        </button>
        {vista && <button type="button" style={S.boton(!enviando)} disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar comprobante"}</button>}
      </div>

      <div style={{ color: C.sobre, fontWeight: 600, fontSize: 13, lineHeight: 1.4, margin: "0 4px 10px" }}>
        Puedes reagendar <b>una sola vez</b> desde este link, con al menos <b>{d.reagendarHoras} horas</b> de anticipación; de lo contrario el anticipo se pierde.
      </div>

      {luego
        ? <div style={{ ...S.pildora, background: C.ciruela }}>Guardamos tu reserva en este dispositivo. Cuando hagas tu transferencia, entra de nuevo a este link y sube tu comprobante.</div>
        : <button style={S.link} onClick={() => setLuego(true)}>Lo haré más tarde</button>}
      {onSalir && luego && <button style={S.link} onClick={onSalir}>← Ir al inicio</button>}
    </>
  );
}

/** Retoma un anticipo pendiente (la clienta volvió del banco o recargó la página). */
export function RetomarApartado({ api, sucursal, info, pendiente, setErr, onSalir }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setErr("");
    api("reserva", { reservaId: pendiente.reservaId, telefono: pendiente.telefono })
      .then((j) => { if (!j.anticipo) { borrarPendiente(); onSalir(); } else setD({ ...j, reservaId: pendiente.reservaId, telefono: pendiente.telefono }); })
      .catch((e) => { borrarPendiente(); setErr(e.message); onSalir(); });
  }, []); // eslint-disable-line
  if (!d) return <div style={{ color: C.sobre, fontWeight: 600 }}>Cargando tu reserva…</div>;
  return <AseguraLugar api={api} sucursal={sucursal} info={info} d={d} setErr={setErr} onSalir={onSalir} />;
}
