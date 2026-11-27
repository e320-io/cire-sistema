import React, { useEffect, useState } from "react";
import { C, S, fechaLarga, cap } from "./ui.jsx";
import { apiTarjetas } from "../../lib/tarjetas.js";

// "Tengo un paquete y no he agendado mi siguiente sesión": la clienta llega con el enlace privado de su tarjeta (?t=<código>).
// Las reglas viven en el servidor (edge function tarjetas): mínimo 1 mes desde su última sesión (Valle 2), una sola cita por paquete,
// sin sábados si su tarjeta no es de las verificadas, y nada se agenda sin horario libre en el Calendar de la sucursal.
export default function AgendarSiguienteClienta({ token, onVolver, setErr }) {
  const [d, setD] = useState(null); const [paquete, setPaquete] = useState(""); const [dia, setDia] = useState(""); const [hora, setHora] = useState("");
  const [busy, setBusy] = useState(false); const [ok, setOk] = useState(null); const [fallo, setFallo] = useState("");
  const cargar = (p) => { setD(null); setDia(""); setHora(""); apiTarjetas("clienta_horarios", { token, paquete: p || undefined }).then(setD).catch((e) => setFallo(e.message)); };
  useEffect(() => { cargar(""); }, [token]); // eslint-disable-line
  const volver = <button style={S.link} onClick={onVolver}>← Volver</button>;

  if (ok) return (
    <div style={S.tarjeta}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.verde }}>¡Listo! 🎉</div>
      <div style={{ margin: "10px 0", fontSize: 16 }}>Tu siguiente sesión quedó agendada:</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.verde }}>{cap(fechaLarga(ok.fecha))}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.verde }}>{ok.hora} – {ok.horaFin} · CIRE {ok.sucursal}</div>
      {!ok.sesion && <div style={{ fontSize: 13, marginTop: 10, opacity: .8 }}>Recepción confirmará contigo el número de sesión al llegar.</div>}
      <div style={{ fontSize: 13, marginTop: 10, opacity: .8 }}>Si necesitas cambiarla, usa «Reagendar mi cita».</div>
    </div>
  );
  if (fallo) return <div style={S.tarjeta}><div style={{ fontWeight: 700, color: C.verde, marginBottom: 6 }}>No pudimos continuar</div>{fallo}<div style={{ marginTop: 10 }}>{volver}</div></div>;
  if (!d) return <div style={S.pildora}>Buscando tus horarios…</div>;
  if (d.mensaje && !d.paquetes?.length) return <div style={S.tarjeta}>{d.mensaje}<div style={{ marginTop: 10 }}>{volver}</div></div>;
  if (!d.paquete) return (
    <div style={S.tarjeta}>
      <div style={{ fontWeight: 800, color: C.verde, marginBottom: 10 }}>Hola, {d.nombre} 👋 ¿Cuál paquete quieres continuar?</div>
      {d.paquetes.map((p) => <button key={p} style={{ ...S.boton(true), marginBottom: 8 }} onClick={() => { setPaquete(p); cargar(p); }}>{p}</button>)}
      {volver}
    </div>
  );
  if (d.yaTiene) return <div style={S.tarjeta}><div style={{ fontWeight: 800, color: C.verde, marginBottom: 6 }}>Ya tienes una cita 💛</div>{d.mensaje}<div style={{ marginTop: 10 }}>{volver}</div></div>;
  const dias = Object.keys(d.dias);
  const agendar = async () => {
    setBusy(true); setErr?.("");
    try { setOk(await apiTarjetas("clienta_agendar", { token, paquete: d.paquete, fecha: dia, hora })); }
    catch (e) { setErr?.(e.message); cargar(d.paquete); }
    setBusy(false);
  };
  return (
    <div style={S.tarjeta}>
      <div style={{ fontWeight: 800, color: C.verde, fontSize: 18 }}>Hola, {d.nombre} 👋</div>
      <div style={{ margin: "6px 0 12px", fontSize: 15 }}>Agenda tu siguiente sesión de <b>{d.paquete}</b>{d.total ? ` (sesión ${d.siguiente} de ${d.total})` : ""}.</div>
      {dias.length === 0 ? <div style={S.pildora}>Por ahora no hay horarios libres a partir de {cap(fechaLarga(d.minimo))}. Escríbenos por WhatsApp y te ayudamos.</div> : <>
        <div style={{ fontSize: 12, opacity: .75, marginBottom: 8 }}>Disponible desde {fechaLarga(d.minimo)} (un mes después de tu última sesión).</div>
        <label style={S.etiqueta}>Elige el día</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {dias.slice(0, 40).map((f) => <button key={f} style={{ ...S.hora(dia === f), minHeight: 40, padding: "0 12px" }} onClick={() => { setDia(f); setHora(""); }}>{cap(fechaLarga(f))}</button>)}
        </div>
        {dia && <><label style={S.etiqueta}>Elige la hora</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
            {d.dias[dia].map((h) => <button key={h} style={S.hora(hora === h)} onClick={() => setHora(h)}>{h}</button>)}
          </div></>}
        {dia && hora && <button style={S.boton(!busy)} disabled={busy} onClick={agendar}>{busy ? "Agendando…" : `Confirmar ${cap(fechaLarga(dia))} · ${hora}`}</button>}
      </>}
      <div style={{ marginTop: 6 }}>{volver}</div>
    </div>
  );
}
