import React, { useEffect, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase";

// Página pública /agendar/<sucursal>: la clienta busca su cita (nombre + celular) y la reagenda a otro horario libre.
// Toda la lógica vive en la edge function agenda-publica; aquí solo hay UI. Look & feel = piezas de campaña de CIRE.

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
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const partes = (f) => {
  const d = new Date(f + "T12:00:00");
  return { dia: d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "").toUpperCase(), num: d.getDate(), mes: d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "").toUpperCase() };
};

// Paleta de las piezas de campaña
const C = {
  turquesa: "#14D0CF", turquesaClaro: "#7FE6E4", verde: "#0B5F5E", verdeMedio: "#0F7F7D", menta: "#E4FAF9",
  rosa: "#F0357A", ciruela: "#6D2B5B", blanco: "#fff", texto: "#0B3F3E", suave: "#4C8483", gris: "#B7D8D7",
};
const FONT = "'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif";
// Contorno blanco alrededor del texto, como los títulos "COMBO SEXY"
const contorno = (px = 3) => [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, y]) => `${x * px}px ${y * px}px 0 #fff`).join(",");

const S = {
  pagina: { minHeight: "100vh", fontFamily: FONT, color: C.texto, padding: "28px 16px 40px", boxSizing: "border-box", position: "relative", overflow: "hidden",
    background: `radial-gradient(circle at 85% 8%, ${C.turquesaClaro} 0, transparent 45%), ${C.turquesa}` },
  caja: { maxWidth: 440, margin: "0 auto", position: "relative", zIndex: 1 },
  tarjeta: { background: C.blanco, borderRadius: 24, padding: 20, marginBottom: 14, boxShadow: "0 8px 24px rgba(11,95,94,.18)" },
  pildora: { background: C.verdeMedio, color: "#fff", borderRadius: 18, padding: "12px 16px", marginBottom: 14, fontSize: 14, lineHeight: 1.4 },
  etiqueta: { display: "block", fontSize: 13, fontWeight: 600, color: C.verde, margin: "0 0 6px 4px" },
  input: { width: "100%", boxSizing: "border-box", padding: "14px 16px", fontSize: 16, fontFamily: FONT, border: `2px solid ${C.menta}`, borderRadius: 16, marginBottom: 14, background: C.menta, color: C.texto, outline: "none" },
  boton: (activo = true) => ({ width: "100%", padding: "15px 18px", fontSize: 16, fontWeight: 700, fontFamily: FONT, color: "#fff", background: C.verde, border: "none", borderRadius: 18, cursor: activo ? "pointer" : "default", opacity: activo ? 1 : 0.55, boxShadow: activo ? "0 6px 16px rgba(11,95,94,.35)" : "none" }),
  link: { background: "transparent", border: "none", color: C.verde, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "10px 4px" },
  hora: (on) => ({ minHeight: 46, fontSize: 15, fontWeight: 600, fontFamily: FONT, borderRadius: 14, cursor: "pointer", border: `2px solid ${on ? C.verde : C.menta}`, background: on ? C.verde : C.menta, color: on ? "#fff" : C.verde }),
};

function Loto({ size = 54 }) {
  const petalo = (rot, w = 1) => <path key={rot} d="M50 12 C63 28 63 46 50 60 C37 46 37 28 50 12Z" transform={`rotate(${rot} 50 60) scale(1)`} opacity={w} />;
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 100 80" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {[-62, -32, 32, 62].map((r) => petalo(r))}{petalo(0)}
      <path d="M12 68 H88" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
function Pin() {
  return (
    <svg width="34" height="40" viewBox="0 0 34 40" aria-hidden="true"><path d="M17 1C8.7 1 2 7.6 2 15.8 2 26 17 39 17 39s15-13 15-23.2C32 7.6 25.3 1 17 1Z" fill={C.verde} /><circle cx="17" cy="15.5" r="5.5" fill="#fff" /></svg>
  );
}
function Titulo({ children, size = 38 }) {
  return <h1 style={{ fontSize: size, fontWeight: 800, lineHeight: 0.98, letterSpacing: "-0.02em", margin: "0 0 14px", color: C.verde, textShadow: contorno(2.5), textTransform: "uppercase" }}>{children}</h1>;
}
function Pasos({ n }) {
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 14px" }}>
      {["Busca", "Elige", "Confirma"].map((t, i) => (
        <div key={t} style={{ flex: 1 }}>
          <div style={{ height: 6, borderRadius: 3, background: i < n ? C.verde : "rgba(255,255,255,.55)" }} />
          <div style={{ fontSize: 11, fontWeight: i + 1 === n ? 700 : 500, color: C.verde, marginTop: 4, opacity: i < n ? 1 : 0.7 }}>{t}</div>
        </div>
      ))}
    </div>
  );
}

// Calendario mensual: solo se pueden tocar los días que tienen horarios libres.
function Calendario({ dias, dia, mes, setMes, onPick }) {
  const meses = [...new Set(Object.keys(dias).map((f) => f.slice(0, 7)))].sort();
  const i = meses.indexOf(mes);
  const [y, m] = mes.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // semana empieza en lunes
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, k) => `${mes}-${String(k + 1).padStart(2, "0")}`)];
  const nombreMes = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
  const flecha = (on) => ({ width: 42, height: 42, fontSize: 22, fontFamily: FONT, border: "none", borderRadius: "50%", background: on ? C.verde : C.menta, color: on ? "#fff" : C.gris, cursor: on ? "pointer" : "default" });
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button style={flecha(i > 0)} disabled={i <= 0} onClick={() => setMes(meses[i - 1])} aria-label="Mes anterior">‹</button>
        <div style={{ fontWeight: 700, fontSize: 17, color: C.verde }}>{cap(nombreMes)}</div>
        <button style={flecha(i < meses.length - 1)} disabled={i >= meses.length - 1} onClick={() => setMes(meses[i + 1])} aria-label="Mes siguiente">›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, textAlign: "center" }}>
        {["L", "M", "M", "J", "V", "S", "D"].map((l, k) => <div key={k} style={{ fontSize: 12, fontWeight: 700, color: C.suave, padding: "4px 0" }}>{l}</div>)}
        {celdas.map((f, k) => {
          if (!f) return <div key={k} />;
          const libre = !!dias[f], sel = f === dia;
          return (
            <button key={f} disabled={!libre} onClick={() => onPick(f)} aria-label={libre ? `Elegir ${fechaLarga(f)}` : undefined}
              style={{ aspectRatio: "1", fontSize: 15, fontFamily: FONT, borderRadius: "50%", border: sel ? `3px solid ${C.rosa}` : "3px solid transparent",
                background: sel ? C.verde : libre ? C.menta : "transparent", color: sel ? "#fff" : libre ? C.verde : C.gris,
                fontWeight: libre ? 700 : 500, cursor: libre ? "pointer" : "default", padding: 0 }}>
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
    document.body.style.margin = "0";
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
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

  const nPaso = paso === "buscar" ? 1 : paso === "citas" ? 2 : 3;

  return (
    <div style={S.pagina}>
      {/* Marca de agua tipográfica, como el fondo de las promos */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", fontWeight: 800, fontSize: 150, lineHeight: 0.9, color: "rgba(255,255,255,.09)", transform: "rotate(-8deg) scale(1.3)", userSelect: "none", fontFamily: FONT }}>
        {Array.from({ length: 8 }, (_, k) => <div key={k} style={{ whiteSpace: "nowrap", marginLeft: k % 2 ? -120 : 0 }}>CIRE CITA CIRE CITA</div>)}
      </div>

      <div style={S.caja}>
        <div style={{ textAlign: "center", color: "#fff", marginBottom: 22 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.32em", fontWeight: 500, marginBottom: 2 }}>ARTE EN DEPILACIÓN</div>
          <Loto />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "0.04em", lineHeight: 1, marginTop: 2 }}>CIRE</div>
        </div>

        <Titulo>{paso === "listo" ? "¡Cita reagendada!" : <>Reagenda<br />tu cita</>}</Titulo>

        {sucursal && (
          <div style={{ ...S.tarjeta, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: 22 }}>
            <Pin />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.verde, lineHeight: 1.1 }}>Sucursal {sucursal}</div>
              <div style={{ fontSize: 13, color: C.suave }}>Reagendado en línea</div>
            </div>
          </div>
        )}

        {paso !== "listo" && sucursal && <Pasos n={nPaso} />}

        {err && (
          <div role="alert" style={{ background: C.rosa, color: "#fff", borderRadius: 18, padding: "12px 16px", marginBottom: 14, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{err}</div>
        )}

        {paso === "buscar" && sucursal && (
          <form style={S.tarjeta} onSubmit={buscar}>
            <label style={S.etiqueta}>Tu nombre</label>
            <input style={S.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" required />
            <label style={S.etiqueta}>Tu celular (10 dígitos)</label>
            <input style={S.input} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="5512345678" inputMode="tel" autoComplete="tel" required />
            <button style={S.boton(!cargando)} disabled={cargando}>{cargando ? "Buscando…" : "Buscar mi cita"}</button>
          </form>
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
        )}
      </div>
    </div>
  );
}
