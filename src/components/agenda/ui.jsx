import React from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase";

// Piezas compartidas de la página pública de agenda: llamadas a la API, paleta y componentes con la identidad de CIRE.

/** Devuelve una función api(accion, datos) ligada a una sucursal (slug). */
export const crearApi = (slug) => async (accion, datos = {}) => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/agenda-publica`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ accion, slug, ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos completar la solicitud. Intenta de nuevo.");
  return j;
};
export const fechaLarga = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** "19:00" -> "7:00 pm" */
export const h12 = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`; };
export const partes = (f) => {
  const d = new Date(f + "T12:00:00");
  return { dia: d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "").toUpperCase(), num: d.getDate(), mes: d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "").toUpperCase() };
};

// Paleta de las piezas de campaña
// Paletas por sucursal (inspiradas en las piezas de campaña). Los componentes leen C.* que apunta a variables CSS (--c-*);
// la página raíz las fija con estiloTema(tema) y todo cambia de color sin re-renderizar nada más.
// fondo=color de fondo · verde=color principal oscuro (textos/botones) · menta=tinte claro · rosa=acento · sobre=texto sobre el fondo
export const TEMAS = {
  turquesa: { turquesa: "#14D0CF", turquesaClaro: "#7FE6E4", verde: "#0B5F5E", verdeMedio: "#0F7F7D", menta: "#E4FAF9", rosa: "#F0357A", ciruela: "#6D2B5B", texto: "#0B3F3E", suave: "#4C8483", gris: "#B7D8D7", enlace: "#0B5F5E", sobre: "#FFFFFF", sombra: "11,95,94" },
  cielo:    { turquesa: "#1EC6F2", turquesaClaro: "#8FE3F9", verde: "#09677A", verdeMedio: "#0E7F96", menta: "#E3F7FD", rosa: "#F0357A", ciruela: "#6D2B5B", texto: "#0A3F4E", suave: "#4A8190", gris: "#B5D6E0", enlace: "#09677A", sobre: "#FFFFFF", sombra: "9,103,122" },
  fucsia:   { turquesa: "#F2438F", turquesaClaro: "#F98BBB", verde: "#7B1F4F", verdeMedio: "#9B3A6A", menta: "#FDE8F1", rosa: "#E11D48", ciruela: "#5E1F55", texto: "#451230", suave: "#8A4A68", gris: "#E3C3D2", enlace: "#7B1F4F", sobre: "#FFFFFF", sombra: "123,31,79" },
  lila:     { turquesa: "#F4A6E3", turquesaClaro: "#FAC9F0", verde: "#6B2A63", verdeMedio: "#8B3F82", menta: "#FBEAF8", rosa: "#E8265A", ciruela: "#4F2A6E", texto: "#3E1A3A", suave: "#855283", gris: "#E2C6DE", enlace: "#6B2A63", sobre: "#4A1D45", sombra: "107,42,99" },
  rosa:     { turquesa: "#F7A7C3", turquesaClaro: "#FBCADA", verde: "#7A2B49", verdeMedio: "#A04566", menta: "#FDEBF2", rosa: "#D81B60", ciruela: "#6D2B5B", texto: "#45182B", suave: "#8D5568", gris: "#E6CAD6", enlace: "#7A2B49", sobre: "#5E1F38", sombra: "122,43,73" },
  morado:   { turquesa: "#4B2380", turquesaClaro: "#7A47B8", verde: "#2E1150", verdeMedio: "#6B3FA8", menta: "#F1E9FB", rosa: "#F0357A", ciruela: "#7A1E6B", texto: "#2A1048", suave: "#7C5C9E", gris: "#D5C6E6", enlace: "#FFFFFF", sobre: "#FFFFFF", sombra: "46,16,80" },
};
export const C = { ...Object.fromEntries(Object.keys(TEMAS.turquesa).map((k) => [k, `var(--c-${k})`])), blanco: "#fff" };
export const estiloTema = (n) => Object.fromEntries(Object.entries(TEMAS[n] || TEMAS.turquesa).map(([k, v]) => [`--c-${k}`, v]));
export const FONT = "'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif";
// Contorno blanco alrededor del texto, como los títulos "COMBO SEXY"
export const contorno = (px = 3) => [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, y]) => `${x * px}px ${y * px}px 0 #fff`).join(",");

export const S = {
  pagina: { minHeight: "100vh", fontFamily: FONT, color: C.texto, padding: "28px 16px 40px", boxSizing: "border-box", position: "relative", overflow: "hidden",
    background: `radial-gradient(circle at 85% 8%, ${C.turquesaClaro} 0, transparent 45%), ${C.turquesa}`, transition: "background .4s" },
  caja: { maxWidth: 440, margin: "0 auto", position: "relative", zIndex: 1 },
  tarjeta: { background: C.blanco, borderRadius: 24, padding: 20, marginBottom: 14, boxShadow: "0 8px 24px rgba(var(--c-sombra),.2)" },
  pildora: { background: C.verdeMedio, color: "#fff", borderRadius: 18, padding: "12px 16px", marginBottom: 14, fontSize: 14, lineHeight: 1.4 },
  etiqueta: { display: "block", fontSize: 13, fontWeight: 600, color: C.verde, margin: "0 0 6px 4px" },
  input: { width: "100%", boxSizing: "border-box", padding: "14px 16px", fontSize: 16, fontFamily: FONT, border: `2px solid ${C.menta}`, borderRadius: 16, marginBottom: 14, background: C.menta, color: C.texto, outline: "none" },
  boton: (activo = true) => ({ width: "100%", padding: "15px 18px", fontSize: 16, fontWeight: 700, fontFamily: FONT, color: "#fff", background: C.verde, border: "none", borderRadius: 18, cursor: activo ? "pointer" : "default", opacity: activo ? 1 : 0.55, boxShadow: activo ? "0 6px 16px rgba(var(--c-sombra),.35)" : "none" }),
  link: { background: "transparent", border: "none", color: C.enlace, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "10px 4px" },
  hora: (on) => ({ minHeight: 46, fontSize: 15, fontWeight: 600, fontFamily: FONT, borderRadius: 14, cursor: "pointer", border: `2px solid ${on ? C.verde : C.menta}`, background: on ? C.verde : C.menta, color: on ? "#fff" : C.verde }),
};

export function Loto({ size = 54 }) {
  const petalo = (rot, w = 1) => <path key={rot} d="M50 12 C63 28 63 46 50 60 C37 46 37 28 50 12Z" transform={`rotate(${rot} 50 60) scale(1)`} opacity={w} />;
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 100 80" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {[-62, -32, 32, 62].map((r) => petalo(r))}{petalo(0)}
      <path d="M12 68 H88" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
export function Pin() {
  return (
    <svg width="34" height="40" viewBox="0 0 34 40" aria-hidden="true"><path d="M17 1C8.7 1 2 7.6 2 15.8 2 26 17 39 17 39s15-13 15-23.2C32 7.6 25.3 1 17 1Z" fill={C.verde} /><circle cx="17" cy="15.5" r="5.5" fill="#fff" /></svg>
  );
}
export function Titulo({ children, size = 38 }) {
  return <h1 style={{ fontSize: size, fontWeight: 800, lineHeight: 0.98, letterSpacing: "-0.02em", margin: "0 0 14px", color: C.verde, textShadow: contorno(2.5), textTransform: "uppercase" }}>{children}</h1>;
}
export function Pasos({ n, etapas = ["Busca", "Elige", "Confirma"] }) {
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 14px" }}>
      {etapas.map((t, i) => (
        <div key={t} style={{ flex: 1 }}>
          <div style={{ height: 6, borderRadius: 3, background: i < n ? C.enlace : "rgba(255,255,255,.55)" }} />
          <div style={{ fontSize: 11, fontWeight: i + 1 === n ? 700 : 500, color: C.enlace, marginTop: 4, opacity: i < n ? 1 : 0.7 }}>{t}</div>
        </div>
      ))}
    </div>
  );
}

// Calendario mensual: solo se pueden tocar los días que tienen horarios libres.
export function Calendario({ dias, dia, mes, setMes, onPick }) {
  const meses = [...new Set(Object.keys(dias).map((f) => f.slice(0, 7)))].sort();
  const i = meses.indexOf(mes);
  const [y, m] = mes.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // semana empieza en lunes
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const resto = 6 - ((new Date(Date.UTC(y, m - 1, total)).getUTCDay() + 6) % 7);
  // Semanas completas: se rellenan con los últimos días del mes anterior y los primeros del siguiente (también se pueden elegir).
  const celdas = Array.from({ length: offset + total + resto }, (_, k) => new Date(Date.UTC(y, m - 1, 1 - offset + k)).toISOString().slice(0, 10));
  const nombreMes = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
  const mesCorto = (f) => new Date(f + "T12:00:00Z").toLocaleDateString("es-MX", { month: "short", timeZone: "UTC" }).replace(".", "");
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
        {celdas.map((f) => {
          const libre = !!dias[f], sel = f === dia, fuera = !f.startsWith(mes), n = Number(f.slice(8));
          return (
            <button key={f} disabled={!libre} onClick={() => { onPick(f); if (fuera) setMes(f.slice(0, 7)); }} aria-label={libre ? `Elegir ${fechaLarga(f)}` : undefined}
              style={{ aspectRatio: "1", fontSize: 15, fontFamily: FONT, borderRadius: "50%", border: sel ? `3px solid ${C.rosa}` : "3px solid transparent",
                background: sel ? C.verde : libre ? C.menta : "transparent", color: sel ? "#fff" : libre ? C.verde : C.gris,
                fontWeight: libre ? 700 : 500, cursor: libre ? "pointer" : "default", padding: 0, opacity: fuera && !sel ? 0.75 : 1,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
              {n}
              {(n === 1 || (fuera && f === celdas.find((x) => x.startsWith(f.slice(0, 7))))) && <span style={{ fontSize: 9, fontWeight: 600, marginTop: 1, textTransform: "uppercase" }}>{mesCorto(f)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
