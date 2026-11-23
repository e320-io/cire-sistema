import React, { useState } from "react";
import { C, S, cap, fechaLarga, partes, Pasos, Calendario } from "./ui.jsx";
import ResumenCita from "./ResumenCita.jsx";

// Flujo "Reagendar mi cita": nombre + celular -> su cita -> nuevo día/hora (misma duración) -> confirmar.
export default function Reagendar({ api, sucursal, info, onVolver, setErr }) {
  const [paso, setPaso] = useState("buscar"); // buscar | citas | horarios | listo
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [citas, setCitas] = useState([]);
  const [cita, setCita] = useState(null);
  const [dias, setDias] = useState({});
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [hora, setHora] = useState("");
  const [cargando, setCargando] = useState(false);
  const [nuevo, setNuevo] = useState(null);

  const correr = async (fn) => { setErr(""); setCargando(true); try { await fn(); } catch (e) { setErr(e.message); } setCargando(false); };
  const credenciales = { nombre, telefono: tel };

  const buscar = (ev) => { ev.preventDefault(); correr(async () => { const j = await api("buscar", credenciales); setCitas(j.citas); setPaso("citas"); }); };
  const elegirCita = (c) => correr(async () => {
    const j = await api("disponibilidad", { ...credenciales, eventId: c.id });
    const fechas = Object.keys(j.dias);
    if (!fechas.length) throw new Error("No hay horarios disponibles en los próximos días. Escríbenos por WhatsApp.");
    setCita(c); setDias(j.dias); setDia(fechas[0]); setMes(fechas[0].slice(0, 7)); setHora(""); setPaso("horarios");
  });
  const confirmar = () => correr(async () => {
    const j = await api("reagendar", { ...credenciales, eventId: cita.id, fecha: dia, hora });
    setNuevo(j); setPaso("listo");
  });

  return (
    <>
      {paso !== "listo" && <Pasos n={paso === "buscar" ? 1 : paso === "citas" ? 2 : 3} />}

      {paso === "buscar" && (
        <>
          <form style={S.tarjeta} onSubmit={buscar}>
            <label style={S.etiqueta}>Tu nombre</label>
            <input style={S.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" required />
            <label style={S.etiqueta}>Tu celular (10 dígitos)</label>
            <input style={S.input} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="5512345678" inputMode="tel" autoComplete="tel" required />
            <button style={S.boton(!cargando)} disabled={cargando}>{cargando ? "Buscando…" : "Buscar mi cita"}</button>
          </form>
          <button style={S.link} onClick={onVolver}>← Volver</button>
        </>
      )}

      {paso === "citas" && (
        <>
          {citas.map((c) => {
            const p = partes(c.fecha);
            return (
              <div key={c.id} style={S.tarjeta}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                  <div style={{ background: C.ciruela, color: "#fff", borderRadius: 18, width: 66, padding: "8px 0", textAlign: "center", flex: "0 0 auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em" }}>{p.dia}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{p.num}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em" }}>{p.mes}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: C.verde }}>{c.hora} – {c.horaFin}</div>
                    <div style={{ fontSize: 14, color: C.suave }}>{cap(fechaLarga(c.fecha))}</div>
                    <div style={{ fontSize: 13, color: C.suave }}>Duración: {c.duracionMin} min</div>
                  </div>
                </div>
                {c.motivoNo
                  ? <div style={{ ...S.pildora, background: C.ciruela, marginBottom: 0 }}>{c.motivoNo}</div>
                  : <button style={S.boton(!cargando)} disabled={cargando} onClick={() => elegirCita(c)}>{cargando ? "Buscando horarios…" : "Reagendar"}</button>}
              </div>
            );
          })}
          <button style={S.link} onClick={() => { setPaso("buscar"); setErr(""); }}>← Buscar con otros datos</button>
        </>
      )}

      {paso === "horarios" && cita && (
        <>
          <div style={S.pildora}>
            <span style={{ opacity: 0.85 }}>Tu cita actual:</span> <b>{cap(fechaLarga(cita.fecha))} · {cita.hora}</b> ({cita.duracionMin} min)
          </div>
          <div style={S.tarjeta}>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 12 }}>Elige el nuevo día</div>
            <Calendario dias={dias} dia={dia} mes={mes} setMes={setMes} onPick={(d) => { setDia(d); setHora(""); }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, margin: "22px 0 4px" }}>Elige la hora</div>
            <div style={{ fontSize: 13, color: C.suave, marginBottom: 12 }}>{cap(fechaLarga(dia))}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {(dias[dia] || []).map((h) => <button key={h} style={S.hora(h === hora)} onClick={() => setHora(h)}>{h}</button>)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", fontWeight: 600, fontSize: 13, lineHeight: 1.35, margin: "0 4px 16px" }}>
            <span style={{ background: C.rosa, borderRadius: 12, padding: "6px 10px", fontWeight: 800, fontSize: 12, flex: "0 0 auto" }}>OJO</span>
            Solo puedes reagendar una vez. Después de confirmar, cualquier otro cambio será por WhatsApp.
          </div>
          <button style={S.boton(!!hora && !cargando)} disabled={!hora || cargando} onClick={confirmar}>
            {cargando ? "Confirmando…" : hora ? `Confirmar ${cap(fechaLarga(dia))} · ${hora}` : "Elige una hora"}
          </button>
          <button style={S.link} onClick={() => { setPaso("citas"); setErr(""); }}>← Volver</button>
        </>
      )}

      {paso === "listo" && nuevo && (
        <>
        <div style={S.tarjeta}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
            <div style={{ background: C.verde, color: "#fff", borderRadius: "50%", width: 52, height: 52, display: "grid", placeItems: "center", fontSize: 28, flex: "0 0 auto" }}>✓</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20, color: C.verde }}>{nuevo.hora} – {nuevo.horaFin}</div>
              <div style={{ fontSize: 14, color: C.suave }}>{cap(fechaLarga(nuevo.fecha))}</div>
            </div>
          </div>
          <div style={{ ...S.pildora, marginBottom: 0 }}>Tu cita en CIRE {sucursal} quedó reagendada. ¡Te esperamos!</div>
        </div>
        <ResumenCita info={info || { nombre: sucursal }} fecha={nuevo.fecha} hora={nuevo.hora} horaFin={nuevo.horaFin} />
        </>
      )}
    </>
  );
}
