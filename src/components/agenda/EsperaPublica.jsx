import React, { useState } from "react";
import { C, S } from "./ui.jsx";

// "Lista de espera" para la clienta que no encuentra el horario que busca. Se manda a la edge function (acción `espera`)
// y recepción la ve en la pestaña "Espera" del sistema para contactarla directo.
const DIAS = [["lun", "Lun"], ["mar", "Mar"], ["mie", "Mié"], ["jue", "Jue"], ["vie", "Vie"], ["sab", "Sáb"]];
const FRANJAS = [["manana", "Mañana"], ["tarde", "Tarde"], ["cualquiera", "Cualquier hora"]];

const chip = (on) => ({ padding: "10px 14px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", borderRadius: 999, cursor: "pointer", border: `2px solid ${on ? C.verde : C.menta}`, background: on ? C.verde : C.menta, color: on ? "#fff" : C.verde });

export default function EsperaPublica({ api, nombre, tel, servicio }) {
  const [abierta, setAbierta] = useState(false); // siempre cerrado de entrada
  const [dias, setDias] = useState([]);
  const [franja, setFranja] = useState("cualquiera");
  const [comentario, setComentario] = useState("");
  const [web, setWeb] = useState(""); // honeypot
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const [hecho, setHecho] = useState(null);

  const alternar = (d) => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const enviar = async () => {
    setErr(""); setEnviando(true);
    try { setHecho(await api("espera", { nombre, telefono: tel, servicioId: servicio.id, dias, franja, comentario, web })); }
    catch (e) { setErr(e.message); }
    setEnviando(false);
  };

  if (hecho) return (
    <div style={{ ...S.tarjeta, border: `3px solid ${C.verde}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <div style={{ background: C.verde, color: "#fff", borderRadius: "50%", width: 40, height: 40, display: "grid", placeItems: "center", fontSize: 22, flex: "0 0 auto" }}>✓</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: C.verde }}>¡Listo, estás en la lista de espera!</div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: C.texto }}>Si se abre un lugar, recepción te contactará directo por WhatsApp o llamada. {hecho.actualizada ? "Actualizamos tu solicitud anterior. " : ""}Mientras tanto, si hay otro horario que te sirva, puedes reservarlo aquí mismo.</div>
    </div>
  );

  return (
    <div style={{ ...S.tarjeta, padding: 0, overflow: "hidden", border: `3px dashed ${C.rosa}` }}>
      <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "14px 16px", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontSize: 22, flex: "0 0 auto" }}>⏳</span>
        <span style={{ flex: 1, fontWeight: 800, fontSize: 16, color: C.verde, lineHeight: 1.25 }}>¿No está disponible el horario que buscas?</span>
        <span style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: "50%", background: abierta ? C.verde : C.rosa, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{abierta ? "–" : "+"}</span>
      </button>

      {abierta && (
        <div style={{ padding: "0 16px 18px" }}>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: C.texto, marginBottom: 14 }}>Entra a la lista de espera, <b>¡puede abrirse un lugar para ti!</b></div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.verde, marginBottom: 8 }}>¿Qué días te acomodan?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {DIAS.map(([k, t]) => <button key={k} type="button" style={chip(dias.includes(k))} onClick={() => alternar(k)}>{t}</button>)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.verde, marginBottom: 8 }}>¿En qué horario?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {FRANJAS.map(([k, t]) => <button key={k} type="button" style={chip(franja === k)} onClick={() => setFranja(k)}>{t}</button>)}
          </div>
          <label style={S.etiqueta}>¿Algo más que debamos saber? (opcional)</label>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={300} rows={2} placeholder="Ej. después de las 4 pm, o solo el primer sábado del mes"
            style={{ ...S.input, resize: "vertical", marginBottom: 10 }} />
          <input value={web} onChange={(e) => setWeb(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
          <div style={{ fontSize: 12, color: C.suave, marginBottom: 12 }}>Te contactaremos al celular que escribiste al inicio: <b>{tel}</b>.</div>
          {err && <div role="alert" style={{ background: C.rosa, color: "#fff", borderRadius: 14, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <button style={S.boton(!!dias.length && !enviando)} disabled={!dias.length || enviando} onClick={enviar}>
            {enviando ? "Anotándote…" : dias.length ? "Unirme a la lista de espera" : "Elige al menos un día"}
          </button>
        </div>
      )}
    </div>
  );
}
