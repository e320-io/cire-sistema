import React, { useEffect, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase";

// Página pública /agendar/<sucursal>: la clienta busca su cita (nombre + celular) y la reagenda a otro horario libre.
// Toda la lógica vive en la edge function agenda-publica; aquí solo hay UI.

const slug = (location.pathname.match(/^\/agendar\/([^/]+)/) || [])[1] || "";
const api = async (accion, datos = {}) => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/agenda-publica`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ accion, slug, ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos completar la solicitud. Intenta de nuevo.");
  return j;
};
const fechaLarga = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
const fechaCorta = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const C = { fondo: "#f6f4fb", tarjeta: "#fff", texto: "#1f1b2e", suave: "#6b6680", acento: "#2721E8", borde: "#e3dff0", error: "#b42318" };
const S = {
  pagina: { minHeight: "100vh", background: C.fondo, color: C.texto, fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif", padding: "24px 16px", boxSizing: "border-box" },
  caja: { maxWidth: 440, margin: "0 auto" },
  tarjeta: { background: C.tarjeta, border: `1px solid ${C.borde}`, borderRadius: 16, padding: 20, marginBottom: 14 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, border: `1px solid ${C.borde}`, borderRadius: 10, marginBottom: 12, background: "#fff", color: C.texto },
  boton: { width: "100%", padding: "13px 16px", fontSize: 16, fontWeight: 600, color: "#fff", background: C.acento, border: "none", borderRadius: 10, cursor: "pointer" },
  secundario: { background: "transparent", border: "none", color: C.suave, fontSize: 14, cursor: "pointer", padding: 8, textDecoration: "underline" },
  chip: (on) => ({ flex: "0 0 auto", padding: "8px 12px", fontSize: 14, borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? C.acento : C.borde}`, background: on ? C.acento : "#fff", color: on ? "#fff" : C.texto }),
  hora: (on) => ({ padding: "10px 0", fontSize: 15, borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? C.acento : C.borde}`, background: on ? C.acento : "#fff", color: on ? "#fff" : C.texto }),
};

// Calendario mensual: solo se pueden tocar los días que tienen horarios libres.
function Calendario({ dias, dia, mes, setMes, onPick }) {
  const meses = [...new Set(Object.keys(dias).map((f) => f.slice(0, 7)))].sort();
  const i = meses.indexOf(mes);
  const [y, m] = mes.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // semana empieza en lunes
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, k) => `${mes}-${String(k + 1).padStart(2, "0")}`)];
  const nombreMes = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
  const flecha = (on) => ({ width: 40, height: 40, fontSize: 20, border: `1px solid ${C.borde}`, borderRadius: 10, background: "#fff", color: on ? C.texto : C.borde, cursor: on ? "pointer" : "default" });
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button style={flecha(i > 0)} disabled={i <= 0} onClick={() => setMes(meses[i - 1])} aria-label="Mes anterior">‹</button>
        <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{nombreMes}</div>
        <button style={flecha(i < meses.length - 1)} disabled={i >= meses.length - 1} onClick={() => setMes(meses[i + 1])} aria-label="Mes siguiente">›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, textAlign: "center" }}>
        {["L", "M", "M", "J", "V", "S", "D"].map((l, k) => <div key={k} style={{ fontSize: 12, color: C.suave, padding: "4px 0" }}>{l}</div>)}
        {celdas.map((f, k) => {
          if (!f) return <div key={k} />;
          const libre = !!dias[f], sel = f === dia;
          return (
            <button key={f} disabled={!libre} onClick={() => onPick(f)} aria-label={libre ? `Elegir ${fechaLarga(f)}` : undefined}
              style={{ aspectRatio: "1", fontSize: 15, borderRadius: 10, border: sel ? `1px solid ${C.acento}` : "1px solid transparent",
                background: sel ? C.acento : libre ? "#efedff" : "transparent", color: sel ? "#fff" : libre ? C.texto : "#c4c0d4",
                fontWeight: libre ? 600 : 400, cursor: libre ? "pointer" : "default" }}>
              {Number(f.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AgendarPublico() {
  const [sucursal, setSucursal] = useState("");
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
  const [err, setErr] = useState("");
  const [nuevo, setNuevo] = useState(null);

  useEffect(() => {
    document.title = "Reagenda tu cita · CIRE";
    if (!slug) return setErr("Link inválido.");
    api("info").then((j) => setSucursal(j.nombre)).catch((e) => setErr(e.message));
  }, []);

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
    <div style={S.pagina}>
      <div style={S.caja}>
        <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>Reagenda tu cita</h1>
        <p style={{ color: C.suave, margin: "0 0 18px" }}>{sucursal ? `CIRE ${sucursal}` : " "}</p>

        {err && <div style={{ ...S.tarjeta, borderColor: C.error, color: C.error }}>{err}</div>}

        {paso === "buscar" && sucursal && (
          <form style={S.tarjeta} onSubmit={buscar}>
            <label style={{ fontSize: 14, color: C.suave }}>Tu nombre</label>
            <input style={S.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" required />
            <label style={{ fontSize: 14, color: C.suave }}>Tu celular (10 dígitos)</label>
            <input style={S.input} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="5512345678" inputMode="tel" autoComplete="tel" required />
            <button style={{ ...S.boton, opacity: cargando ? 0.6 : 1 }} disabled={cargando}>{cargando ? "Buscando…" : "Buscar mi cita"}</button>
          </form>
        )}

        {paso === "citas" && (
          <>
            {citas.map((c) => (
              <div key={c.id} style={S.tarjeta}>
                <div style={{ fontWeight: 600 }}>{cap(fechaLarga(c.fecha))}</div>
                <div style={{ color: C.suave, margin: "2px 0 12px" }}>{c.hora} – {c.horaFin} · {c.duracionMin} min</div>
                {c.motivoNo
                  ? <div style={{ fontSize: 14, color: C.suave }}>{c.motivoNo}</div>
                  : <button style={{ ...S.boton, opacity: cargando ? 0.6 : 1 }} disabled={cargando} onClick={() => elegirCita(c)}>{cargando ? "Buscando horarios…" : "Reagendar"}</button>}
              </div>
            ))}
            <button style={S.secundario} onClick={() => { setPaso("buscar"); setErr(""); }}>← Buscar con otros datos</button>
          </>
        )}

        {paso === "horarios" && cita && (
          <>
            <div style={S.tarjeta}>
              <div style={{ fontSize: 14, color: C.suave }}>Tu cita actual</div>
              <div style={{ fontWeight: 600 }}>{cap(fechaLarga(cita.fecha))} · {cita.hora}</div>
              <div style={{ fontSize: 14, color: C.suave }}>Duración: {cita.duracionMin} min</div>
            </div>
            <div style={S.tarjeta}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Elige el nuevo día</div>
              <Calendario dias={dias} dia={dia} mes={mes} setMes={setMes} onPick={(d) => { setDia(d); setHora(""); }} />
              <div style={{ fontWeight: 600, margin: "18px 0 10px" }}>Horarios para el {fechaLarga(dia)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {(dias[dia] || []).map((h) => <button key={h} style={S.hora(h === hora)} onClick={() => setHora(h)}>{h}</button>)}
              </div>
            </div>
            <div style={{ ...S.tarjeta, fontSize: 13, color: C.suave }}>Solo puedes reagendar una vez. Después de confirmar, cualquier otro cambio será por WhatsApp.</div>
            <button style={{ ...S.boton, opacity: hora && !cargando ? 1 : 0.5 }} disabled={!hora || cargando} onClick={confirmar}>
              {cargando ? "Confirmando…" : hora ? `Confirmar ${cap(fechaCorta(dia))} a las ${hora}` : "Elige una hora"}
            </button>
            <button style={S.secundario} onClick={() => { setPaso("citas"); setErr(""); }}>← Volver</button>
          </>
        )}

        {paso === "listo" && nuevo && (
          <div style={S.tarjeta}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✅ ¡Listo!</div>
            <div style={{ fontWeight: 600 }}>{cap(fechaLarga(nuevo.fecha))}</div>
            <div style={{ color: C.suave, marginTop: 2 }}>{nuevo.hora} – {nuevo.horaFin} · CIRE {sucursal}</div>
            <p style={{ fontSize: 14, color: C.suave, marginBottom: 0 }}>Tu cita quedó reagendada. ¡Te esperamos!</p>
          </div>
        )}
      </div>
    </div>
  );
}
