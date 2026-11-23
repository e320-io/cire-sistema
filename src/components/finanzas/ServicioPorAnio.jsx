import { useState, useEffect, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { useT } from "../../lib/theme.jsx";
import { CUENTAS } from "../meta/rendimiento.js";
import { META_TOKEN } from "../../lib/supabase.js";

// Mismo criterio de "mensajes" que usa el resto del Resumen (con respaldo para campañas viejas).
const accion = (acts, t) => Number((acts || []).find((z) => z.action_type === t)?.value || 0);
const mensajesDe = (acts) =>
  accion(acts, "onsite_conversion.messaging_conversation_started_7d") ||
  accion(acts, "onsite_conversion.total_messaging_connection") ||
  accion(acts, "onsite_conversion.messaging_first_reply") ||
  accion(acts, "contact");

// Anuncios con gasto de una cuenta en el periodo: [{anuncio, conjunto, campana, gasto, mensajes}]
async function anunciosCuenta(cuenta, since, until) {
  const params = new URLSearchParams({
    level: "ad", fields: "ad_name,adset_name,campaign_name,spend,actions",
    time_range: JSON.stringify({ since, until }),
    filtering: JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]),
    limit: "500", access_token: META_TOKEN,
  });
  let url = `https://graph.facebook.com/v19.0/act_${cuenta.id}/insights?${params}`;
  const filas = [];
  try {
    while (url) {
      const json = await (await fetch(url)).json();
      if (json.error) return { filas, error: json.error.message };
      (json.data || []).forEach((r) => filas.push({ anuncio: r.ad_name, conjunto: r.adset_name, campana: r.campaign_name, gasto: Number(r.spend || 0), mensajes: mensajesDe(r.actions) }));
      url = json.paging?.next;
    }
  } catch { return { filas, error: "Sin conexión con Meta." }; }
  return { filas, error: "" };
}

// Servicios en el orden en que se apilan (abajo → arriba) y su color.
const SERVICIOS = [
  { k: "Láser", c: "#4a8be5" },
  { k: "Bikini", c: "#d96d35" },
  { k: "Facial", c: "#4aa58f" },
  { k: "Moldeo (drenaje)", c: "#d19a2e" },
  { k: "HIFU", c: "#d1568b" },
  { k: "Facial y corporales", c: "#4aa83e" },
  { k: "Sin servicio en el nombre", c: "#a3a399" },
  { k: "Otro", c: "#dc6b66" },
];

const sin = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Servicio según lo que dice el nombre del anuncio / conjunto / campaña.
export function servicioDe(anuncio, conjunto = "", campana = "") {
  const n = sin(`${anuncio} ${conjunto} ${campana}`);
  if (n.includes("bikini") || /(^|[\s_|-])bf[\s_-]?\d/.test(n)) return "Bikini";
  if (n.includes("hifu")) return "HIFU";
  if (n.includes("corporal")) return "Facial y corporales";
  if (n.includes("facial")) return "Facial";
  if (n.includes("moldeo") || n.includes("drenaje")) return "Moldeo (drenaje)";
  if (/(laser|depil|axila|(^|[\s_|-])(sop|cc)([\s_|-]|$)|_cc_|piernas|bozo|zona)/.test(n)) return "Láser";
  if (/(promo|buen fin|gratis|regalo|combo|paquete|oferta|descuento|black|cyber|hot ?sale)/.test(n)) return "Otro";
  return "Sin servicio en el nombre";
}

const vacio = () => Object.fromEntries(SERVICIOS.map((s) => [s.k, { gasto: 0, mensajes: 0 }]));
const k$ = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const kN = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace(".0k", "k") : `${Math.round(n)}`);
const $ = (n) => `$${Math.round(n).toLocaleString("es-MX")}`;
const N = (n) => Math.round(n).toLocaleString("es-MX");

const llaveCache = (ym) => `cire_serv_anio_v2_${CUENTAS.map((c) => c.id).join("-")}_${ym}`;

async function cargarMes(ym, curYM) {
  const pasado = ym < curYM;
  if (pasado) {
    try { const c = JSON.parse(localStorage.getItem(llaveCache(ym)) || "null"); if (c) return c; } catch {}
  }
  const [y, m] = ym.split("-").map(Number);
  const since = `${ym}-01`;
  const until = pasado ? `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` : new Date().toISOString().slice(0, 10);
  const acum = vacio();
  let error = "";
  const resp = await Promise.all(CUENTAS.map((c) => anunciosCuenta(c, since, until)));
  resp.forEach(({ filas, error: e }) => {
    if (e) error = e;
    filas.forEach((f) => {
      const s = servicioDe(f.anuncio, f.conjunto, f.campana);
      acum[s].gasto += f.gasto;
      acum[s].mensajes += f.mensajes;
    });
  });
  if (pasado && !error) { try { localStorage.setItem(llaveCache(ym), JSON.stringify(acum)); } catch {} }
  return error ? { ...acum, __error: error } : acum;
}

// mesY/mesM: mes del selector del Resumen. Se compara ese mes en los últimos 4 años.
export default function ServicioPorAnio({ mesY, mesM }) {
  const { T } = useT();
  const [abierto, setAbierto] = useState(() => { try { return localStorage.getItem("cire_serv_anio_abierto") === "1"; } catch { return false; } });
  const [datos, setDatos] = useState({}); // { año: {servicio:{gasto,mensajes}} }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [modo, setModo] = useState("mensajes");
  const [ocultos, setOcultos] = useState(() => new Set());

  const mm = String(mesM).padStart(2, "0");
  const nombreMes = new Date(mesY, mesM - 1, 1).toLocaleDateString("es-MX", { month: "long" });
  const mesCorto = nombreMes.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
  const anios = [mesY - 3, mesY - 2, mesY - 1, mesY];

  const alternar = () => {
    setAbierto((v) => { const nv = !v; try { localStorage.setItem("cire_serv_anio_abierto", nv ? "1" : "0"); } catch {} return nv; });
  };

  const cargar = useCallback(async () => {
    if (!CUENTAS.length) { setError("No hay cuenta de Meta configurada."); return; }
    setCargando(true); setError("");
    const curYM = new Date().toISOString().slice(0, 7);
    const res = await Promise.all(anios.map((a) => cargarMes(`${a}-${mm}`, curYM).catch(() => ({ __error: "Sin conexión con Meta." }))));
    const out = {}; let err = "";
    anios.forEach((a, i) => { if (res[i].__error) err = res[i].__error; const { __error, ...r } = res[i]; out[a] = r; });
    setDatos(out); setError(err); setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesY, mm]);

  useEffect(() => { if (abierto) cargar(); }, [abierto, cargar]);

  const visibles = SERVICIOS.filter((s) => !ocultos.has(s.k));
  const data = useMemo(() => anios.map((a) => {
    const row = { anio: `${mesCorto} ${a}`, total: 0, __label: 1 };
    SERVICIOS.forEach((s) => {
      const v = ocultos.has(s.k) ? 0 : (datos[a]?.[s.k]?.[modo === "gasto" ? "gasto" : "mensajes"] || 0);
      row[s.k] = v; row.total += v;
    });
    return row;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [datos, modo, ocultos, mesCorto, mesY]);

  const fmt = modo === "gasto" ? $ : N;
  const fmtEje = modo === "gasto" ? k$ : kN;
  const hayDatos = data.some((d) => d.total > 0);

  const chip = (s) => {
    const off = ocultos.has(s.k);
    return (
      <button key={s.k} onClick={() => setOcultos((p) => { const n = new Set(p); n.has(s.k) ? n.delete(s.k) : n.add(s.k); return n; })}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 99, fontSize: 13, cursor: "pointer",
          border: `1px solid ${T.div}`, background: "transparent", color: T.text, opacity: off ? 0.4 : 1, textDecoration: off ? "line-through" : "none" }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: s.c }} />{s.k}
      </button>
    );
  };

  const TooltipBarras = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const fila = payload[0].payload;
    return (
      <div style={{ background: "#fff", border: `1px solid ${T.div}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, boxShadow: "0 4px 14px rgba(0,0,0,.18)", color: "#1a1a2e", minWidth: 190 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
        {[...visibles].reverse().filter((s) => fila[s.k] > 0).map((s) => (
          <div key={s.k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "1px 0" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: s.c }} />{s.k}</span>
            <b>{fmt(fila[s.k])}</b>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e5e5e5", marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
          <span>Total</span><span>{fmt(fila.total)}</span>
        </div>
      </div>
    );
  };

  const btn = (activo) => ({ padding: "9px 18px", fontSize: 13, cursor: "pointer", border: "none", background: activo ? "#111" : "transparent", color: activo ? "#fff" : T.text, fontWeight: activo ? 600 : 400 });
  const grupo = { display: "inline-flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${T.div}` };

  return (
    <div className="glass" style={{ padding: 0 }}>
      <button onClick={alternar} aria-expanded={abierto}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 22px", background: "transparent", border: "none", cursor: "pointer", color: T.text, textAlign: "left" }}>
        <span>
          <span style={{ display: "block", fontSize: 18, fontWeight: 700 }}>Cada {nombreMes}, por servicio</span>
          <span style={{ display: "block", fontSize: 12.5, color: T.sub, marginTop: 3 }}>Mensajes y gasto de Meta Ads por servicio, {mesCorto.toLowerCase()} de {mesY - 3} a {mesY}</span>
        </span>
        <span style={{ fontSize: 18, color: T.sub, transition: "transform .2s", transform: abierto ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {abierto && (
        <div style={{ padding: "0 22px 22px" }}>
          <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 14 }}>
            Cada barra es un {nombreMes}, dividida por servicio. Con los botones puedes ocultar o mostrar cada servicio, y se oculta en todos los años a la vez. Pasa el cursor sobre una sección para ver su cifra. El servicio se detecta por el nombre del anuncio.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={grupo}>
              <button style={btn(modo === "mensajes")} onClick={() => setModo("mensajes")}>Mensajes</button>
              <button style={btn(modo === "gasto")} onClick={() => setModo("gasto")}>Gasto</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: T.sub }}>Mostrar u ocultar:</span>
            {SERVICIOS.map(chip)}
          </div>
          {error && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>Meta respondió con un error: {error}. Los datos pueden estar incompletos.</div>}
          <div style={{ height: 360 }}>
            {cargando && !hayDatos ? (
              <div style={{ color: T.faint, fontSize: 13, padding: "60px 0", textAlign: "center" }}>Cargando desde Meta…</div>
            ) : !hayDatos ? (
              <div style={{ color: T.faint, fontSize: 13, padding: "60px 0", textAlign: "center" }}>Sin datos para este mes.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 0 }} barCategoryGap="22%">
                  <CartesianGrid stroke={T.div} vertical={false} />
                  <XAxis dataKey="anio" tick={{ fontSize: 12, fill: T.sub }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: T.faint }} axisLine={false} tickLine={false} width={48} tickFormatter={fmtEje} />
                  <Tooltip content={<TooltipBarras />} cursor={{ fill: "rgba(128,128,128,0.08)" }} />
                  {SERVICIOS.map((s) => (
                    <Bar key={s.k} dataKey={s.k} stackId="a" fill={s.c} isAnimationActive={false} />
                  ))}
                  <Bar dataKey="__label" stackId="a" fill="transparent" isAnimationActive={false} legendType="none">
                    <LabelList dataKey="total" content={({ x, y, width, value }) => (value > 0 ? (
                      <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={T.text}>{fmt(value)}</text>
                    ) : null)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: T.sub }}>
            {visibles.map((s) => (
              <span key={s.k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.c }} />{s.k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
