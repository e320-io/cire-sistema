import { useState, useEffect, useMemo, useCallback } from "react";
import { useT } from "../../lib/theme.jsx";
import { COLORES, fmt, fmtN, hoy } from "../../lib/constantes.js";
import { META_TOKEN, supabase } from "../../lib/supabase.js";
import VentasAnuncios from "./VentasAnuncios.jsx";
import VentasTabla from "./VentasTabla.jsx";
import { CUENTAS, SUCURSALES, anunciosDeCuenta, conVeredicto, porCuenta, porServicio, porSucursal, porSucursalServicio, totales, esperadoVenta, mensajesPorHora } from "./rendimiento.js";

const $2 = (n) => (n == null ? "—" : `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const COLOR_SERV = { "Láser CC": "#49B8D3", "Bikini": "#f472b6", "Bikini*": "#f472b6", "HIFU 4D": "#a855f7", "Facial": "#f59e0b", "Moldeo (drenaje)": "#10b981", "Otro": "#94a3b8" };

// Dona SVG: partes = [{ nombre, valor }]. Al pasar el cursor por un tramo (o su renglón de la leyenda) se resalta
// y se muestra su detalle en un globo junto al cursor y en el centro.
function Dona({ titulo, partes, total, formato, T }) {
  const R = 42, C = 2 * Math.PI * R;
  const [hover, setHover] = useState(null); // nombre del tramo
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const lista = partes.filter((p) => p.valor > 0);
  const pct = (v) => Math.round((v / total) * 100);
  const activo = lista.find((p) => p.nombre === hover);
  const color = (n) => COLOR_SERV[n] || "#94a3b8";
  const mover = (e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); };
  let acum = 0;
  return (
    <div style={{ flex: "1 1 150px", minWidth: "150px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "1.5px", color: T.sub, textAlign: "center", marginBottom: "6px" }}>{titulo}</div>
      <div style={{ position: "relative", maxWidth: "150px", margin: "0 auto" }} onMouseMove={mover} onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 120 120" style={{ width: "100%", display: "block" }}>
          <g transform="rotate(-90 60 60)">
            {lista.map((p) => {
              const largo = (p.valor / total) * C;
              const el = (
                <circle key={p.nombre} cx="60" cy="60" r={R} fill="none" stroke={color(p.nombre)} strokeWidth={hover === p.nombre ? 23 : 18}
                  strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acum} opacity={hover && hover !== p.nombre ? 0.35 : 1}
                  style={{ transition: "opacity .12s, stroke-width .12s", cursor: "pointer" }} onMouseEnter={() => setHover(p.nombre)} />
              );
              acum += largo;
              return el;
            })}
          </g>
          {activo ? (
            <>
              <text x="60" y="56" textAnchor="middle" fontSize="15" fontWeight="700" fill={color(activo.nombre)}>{pct(activo.valor)}%</text>
              <text x="60" y="71" textAnchor="middle" fontSize="9" fill={T.text}>{formato(activo.valor)}</text>
            </>
          ) : (
            <text x="60" y="64" textAnchor="middle" fontSize="13" fontWeight="700" fill={T.text}>{formato(total)}</text>
          )}
        </svg>
        {activo && (
          <div style={{ position: "absolute", left: pos.x + 12, top: pos.y + 12, pointerEvents: "none", zIndex: 5, whiteSpace: "nowrap", background: "#1c1f3a", color: "#fff", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "8px", padding: "7px 10px", fontSize: "11.5px", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: color(activo.nombre) }} />{activo.nombre}</div>
            <div style={{ marginTop: "3px" }}>{pct(activo.valor)}% · <b>{formato(activo.valor)}</b></div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "10.5px" }}>de {formato(total)}</div>
          </div>
        )}
      </div>
      <div style={{ marginTop: "8px" }}>
        {lista.map((p) => (
          <div key={p.nombre} onMouseEnter={() => setHover(p.nombre)} onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", padding: "2px 4px", borderRadius: "5px", cursor: "default", background: hover === p.nombre ? T.div : "transparent", opacity: hover && hover !== p.nombre ? 0.5 : 1 }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: color(p.nombre), flexShrink: 0 }} />
            <span style={{ flex: 1, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
            <b>{pct(p.valor)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mensajes de hoy hora por hora, apilados por sucursal. filas: [{ hora, sucursal, gasto, mensajes }]
function PorHora({ filas, cargando, T }) {
  const [hover, setHover] = useState(null);
  const horaActual = parseInt(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hour12: false }), 10) % 24;
  const horas = Array.from({ length: horaActual + 1 }, (_, h) => h);
  const val = (h, s) => filas.filter((f) => f.hora === h && f.sucursal === s).reduce((a, f) => a + f.mensajes, 0);
  const sucs = SUCURSALES.filter((s) => filas.some((f) => f.sucursal === s && f.mensajes > 0));
  const tot = (h) => sucs.reduce((a, s) => a + val(h, s), 0);
  const gastoH = (h) => filas.filter((f) => f.hora === h).reduce((a, f) => a + f.gasto, 0);
  const total = horas.reduce((a, h) => a + tot(h), 0);
  const pico = horas.reduce((m, h) => (tot(h) > tot(m) ? h : m), 0);
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;
  const W = 760, H = 210, pl = 30, pr = 6, pt = 10, pb = 26;
  const iw = W - pl - pr, ih = H - pt - pb;
  const slot = iw / 24, bw = Math.min(slot * 0.72, 22);
  const maxH = Math.max(1, ...horas.map(tot));
  const techo = Math.max(4, Math.ceil(maxH / 4) * 4);
  const y = (v) => pt + ih - (v / techo) * ih;
  const resumen = (s) => horas.reduce((a, h) => a + val(h, s), 0);
  return (
    <div className="glass" style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "2px", color: T.sub }}>MENSAJES DE HOY · HORA POR HORA</div>
      {cargando && filas.length === 0 ? <div style={{ marginTop: "10px", fontSize: "13px", color: T.muted }}>Cargando desde Meta…</div> : <>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", margin: "6px 0 10px" }}>
          <span style={{ fontSize: "26px", fontWeight: 700, color: "#a855f7" }}>{Math.round(total).toLocaleString("es-MX")}</span>
          <span style={{ fontSize: "12px", color: T.sub }}>mensajes hasta las {hh(horaActual)} · {horaActual + 1 > 0 ? (total / (horaActual + 1)).toFixed(1) : 0}/hora{total > 0 && <> · hora pico <b style={{ color: T.muted }}>{hh(pico)}</b> ({Math.round(tot(pico))})</>}</span>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "8px" }}>
          {sucs.map((s) => <span key={s} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11.5px", color: T.muted }}><span style={{ width: "9px", height: "9px", borderRadius: "3px", background: COLORES[s] }} />{s} <b>{Math.round(resumen(s))}</b></span>)}
        </div>
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((p) => (
              <g key={p}>
                <line x1={pl} x2={W - pr} y1={y(techo * p)} y2={y(techo * p)} stroke={T.div} strokeWidth="1" strokeDasharray={p === 0 ? "0" : "3 4"} />
                <text x={pl - 6} y={y(techo * p) + 3} textAnchor="end" fontSize="10" fill={T.faint}>{Math.round(techo * p)}</text>
              </g>
            ))}
            {Array.from({ length: 24 }, (_, h) => {
              const cx = pl + slot * h + slot / 2;
              const futura = h > horaActual;
              let acum = 0;
              return (
                <g key={h} opacity={hover == null || hover === h ? 1 : 0.45} style={{ transition: "opacity .12s" }}>
                  {hover === h && <rect x={cx - slot / 2} y={pt} width={slot} height={ih} fill={T.div} opacity="0.5" rx="4" />}
                  {!futura && sucs.map((s) => {
                    const v = val(h, s);
                    if (!v) return null;
                    const y1 = y(acum + v), y0 = y(acum);
                    acum += v;
                    return <rect key={s} x={cx - bw / 2} y={y1} width={bw} height={Math.max(y0 - y1 - 1, 1)} fill={COLORES[s]} rx="2" />;
                  })}
                  {h % 2 === 0 && <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill={h === horaActual ? T.text : T.faint} fontWeight={h === horaActual ? 700 : 400}>{h}</text>}
                  <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => !futura && setHover(h)} />
                </g>
              );
            })}
          </svg>
          {hover != null && (() => {
            const derecha = hover > 12;
            const pos = (pl + slot * hover + slot / 2) / W;
            return (
              <div style={{ position: "absolute", top: 0, [derecha ? "right" : "left"]: `${(derecha ? 1 - pos : pos) * 100 + 3}%`, background: "#1c1f3a", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#fff", pointerEvents: "none", minWidth: "150px", zIndex: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>{hh(hover)} – {hh((hover + 1) % 24)}</div>
                {sucs.filter((s) => val(hover, s) > 0).map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "1.5px 0" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: COLORES[s] }} /><span style={{ flex: 1, color: "rgba(255,255,255,0.8)" }}>{s}</span><b>{Math.round(val(hover, s))}</b>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: "6px", paddingTop: "6px" }}><span>Total</span><b>{Math.round(tot(hover))}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)", fontSize: "11px" }}><span>Gasto</span><span>${Math.round(gastoH(hover))}</span></div>
              </div>
            );
          })()}
        </div>
        {total === 0 && <div style={{ fontSize: "12px", color: T.faint, marginTop: "6px" }}>Todavía no hay mensajes hoy. Meta tarda un poco en reportar las horas más recientes.</div>}
      </>}
    </div>
  );
}

const VCOLOR = { Escalar: "#10b981", Replantear: "#ff6b6b", Mantener: null, "Pocos datos": null };

// mes: "yyyy-mm". Lee de Meta (nivel anuncio) las cuentas configuradas en rendimiento.js.
export default function RendimientoMeta({ mes, usuario }) {
  const { T: T0, light } = useT();
  const T = { ...T0, text: light ? "#1a1f3c" : "#fff", bg: T0.dropBg }; // el tema base no define text ni bg
  const [ads, setAds] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errores, setErrores] = useState([]); // [{cuenta, mensaje}]
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState({ k: "gasto", dir: -1 });
  const [ventas, setVentas] = useState([]);
  const [tablaLista, setTablaLista] = useState(true);
  const [modal, setModal] = useState(false);
  const [tabla, setTabla] = useState(false);
  const [modo, setModo] = useState("mes"); // "mes" | "hoy"
  const [horas, setHoras] = useState([]); // mensajes de hoy por hora y sucursal
  const [graficos, setGraficos] = useState(() => new Set()); // sucursales con la vista de gráfico abierta
  const alternar = (s) => setGraficos((g) => { const n = new Set(g); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const cargarVentas = useCallback(async () => {
    const [y, m] = mes.split("-").map(Number);
    const fin = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const { data, error } = await supabase.from("ventas_anuncios").select("*").gte("fecha", `${mes}-01`).lte("fecha", fin).order("fecha", { ascending: false }).order("creado_en", { ascending: false });
    if (error) { setTablaLista(false); setVentas([]); return; }
    setTablaLista(true); setVentas(data || []);
  }, [mes]);
  useEffect(() => { cargarVentas(); }, [cargarVentas]);

  const cargar = useCallback(async () => {
    if (!META_TOKEN || CUENTAS.length === 0) { setErrores([{ cuenta: "Configuración", mensaje: "Falta VITE_META_TOKEN o VITE_META_ACCOUNT." }]); return; }
    setCargando(true);
    const [y, m] = mes.split("-").map(Number);
    const esHoy = modo === "hoy";
    const since = esHoy ? hoy() : `${mes}-01`;
    const fin = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const until = esHoy ? hoy() : fin > hoy() ? hoy() : fin;
    const [res, hrs] = await Promise.all([
      Promise.all(CUENTAS.map(async (c) => ({ c, r: await anunciosDeCuenta(c, since, until) }))),
      esHoy ? Promise.all(CUENTAS.map(async (c) => ({ c, r: await mensajesPorHora(c, hoy()) }))) : Promise.resolve([]),
    ]);
    setAds(res.flatMap(({ r }) => r.filas));
    setHoras(hrs.flatMap(({ r }) => r.filas));
    const errs = [...res, ...hrs].filter(({ r }) => r.error).map(({ c, r }) => ({ cuenta: c.nombre, mensaje: r.error }));
    setErrores(errs.filter((e, i) => errs.findIndex((x) => x.cuenta === e.cuenta) === i));
    setCargando(false);
  }, [mes, modo]);

  useEffect(() => { cargar(); }, [cargar]);

  const d = useMemo(() => {
    const clas = conVeredicto(ads);
    return { clas, tot: totales(clas), cuentas: porCuenta(clas), servicios: porServicio(clas), sucs: porSucursal(clas), matriz: porSucursalServicio(clas) };
  }, [ads]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = d.clas.filter((a) => !t || `${a.anuncio} ${a.sucursal} ${a.servicio}`.toLowerCase().includes(t));
    return l.sort((a, b) => {
      const x = a[orden.k], y = b[orden.k];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * orden.dir;
    });
  }, [d.clas, q, orden]);

  const th = { padding: "8px 10px", fontSize: "10px", letterSpacing: "1px", color: T.faint, fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" };
  const td = { padding: "8px 10px", fontSize: "12px", textAlign: "right", whiteSpace: "nowrap", borderTop: `1px solid ${T.div}` };
  const tl = { textAlign: "left" };
  const titulo = (t, sub) => (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "2px", color: T.sub }}>{t}</div>
      {sub && <div style={{ fontSize: "11.5px", color: T.faint, marginTop: "4px", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
  const Barra = ({ v, max, c = "#a855f7" }) => <div style={{ height: "4px", borderRadius: "2px", background: T.div, marginTop: "4px" }}><div style={{ height: "100%", width: `${max > 0 ? Math.min(100, (v / max) * 100) : 0}%`, background: c, borderRadius: "2px" }} /></div>;

  const t = d.tot;
  // Real = lo cobrado a la fecha (anticipo, o el total si ya liquidó). Esperado = precio completo de todo lo capturado.
  const resumenVentas = (l) => ({ n: l.length, real: l.reduce((a, v) => a + Number(v.monto), 0), esp: l.reduce((a, v) => a + esperadoVenta(v), 0) });
  const roi = (ing, gasto) => (gasto > 0 && ing > 0 ? ing / gasto : null);
  const ventasV = modo === "hoy" ? ventas.filter((v) => v.fecha === hoy()) : ventas; // ventas del periodo visible
  const tv = resumenVentas(ventasV);
  const claveServ = (v) => (v.servicio === "Bikini" && ["Valle", "Coapa", "Polanco"].includes(v.sucursal) ? "Bikini*" : v.servicio);
  const vSuc = (s) => resumenVentas(ventasV.filter((v) => v.sucursal === s));
  const vSucServ = (s, sv) => resumenVentas(ventasV.filter((v) => v.sucursal === s && claveServ(v) === sv));
  const vServ = (sv) => resumenVentas(ventasV.filter((v) => v.servicio === sv));
  const x2 = (n) => (n == null ? "—" : `${n.toFixed(2)}×`);
  const mesTxt = new Date(mes + "-01T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const ordenar = (k) => setOrden((o) => ({ k, dir: o.k === k ? -o.dir : -1 }));
  const flecha = (k) => (orden.k === k ? (orden.dir > 0 ? " ▲" : " ▼") : "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: `1px solid ${T.div}`, borderRadius: "8px", overflow: "hidden" }}>
          {[["mes", "Este mes"], ["hoy", "Hoy"]].map(([k, l]) => <button key={k} onClick={() => setModo(k)} style={{ fontSize: "11px", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, border: "none", color: modo === k ? "#fff" : T.muted, background: modo === k ? "#a855f7" : "transparent" }}>{l}</button>)}
        </div>
        <button className="btn-ghost" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={cargar} disabled={cargando}>↻ Sincronizar</button>
        <button onClick={() => setModal(true)} style={{ fontSize: "11px", padding: "6px 14px", borderRadius: "8px", border: "1px solid rgba(39,33,232,0.5)", background: "rgba(39,33,232,0.1)", color: "#2721E8", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>+ Registrar venta</button>
        <button onClick={() => setTabla(true)} className="btn-ghost" style={{ fontSize: "11px", padding: "6px 14px" }} title="Ver y editar las ventas día por día">📋 Ventas ({ventas.length})</button>
        <span style={{ fontSize: "12px", color: T.sub, textTransform: "capitalize" }}>{cargando ? "Leyendo anuncios desde Meta…" : `${modo === "hoy" ? "Hoy, " + new Date(hoy() + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long" }) : mesTxt} · ${t.anuncios} anuncios con gasto`}</span>
      </div>

      {tabla && <VentasTabla ventas={ventas} mes={mes} onCerrar={() => setTabla(false)} onCambio={cargarVentas} />}
      {modal && <VentasAnuncios ventas={ventas} mes={mes} usuario={usuario} tablaLista={tablaLista} onCerrar={() => setModal(false)} onCambio={cargarVentas} />}

      {errores.map((e) => (
        <div key={e.cuenta} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255,107,107,0.35)", background: "rgba(255,80,80,0.06)", color: "#ff6b6b", fontSize: "12px" }}>
          No se pudo leer <b>{e.cuenta}</b>: {e.mensaje}
        </div>
      ))}

      {modo === "hoy" && <PorHora filas={horas} cargando={cargando} T={T} />}

      {!cargando && ads.length === 0 && errores.length === 0 && <div style={{ textAlign: "center", padding: "50px", color: T.faint, fontSize: "13px" }}>Sin anuncios con gasto en este periodo.</div>}

      {ads.length > 0 && <>
        {/* Frase + KPIs */}
        <div className="glass" style={{ padding: "20px 24px", fontSize: "14px", lineHeight: 1.6, color: T.muted }}>
          Se gastaron <b style={{ color: T.text }}>{fmt(t.gasto)}</b> y llegaron <b style={{ color: T.text }}>{fmtN(Math.round(t.mensajes))}</b> mensajes de WhatsApp: <b style={{ color: T.text }}>{$2(t.costoMensaje)}</b> por mensaje.
          {t.mejor && <> El servicio con mensajes más baratos es <b style={{ color: "#10b981" }}>{t.mejor.servicio}</b> ({$2(t.mejor.costoMensaje)})</>}
          {t.peor && <> y el más caro es <b style={{ color: "#ff6b6b" }}>{t.peor.servicio}</b> ({$2(t.peor.costoMensaje)})</>}{t.mejor && "."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "14px" }}>
          {[["GASTO", fmt(t.gasto), "#f97316"], ["MENSAJES", fmtN(Math.round(t.mensajes)), "#a855f7"], ["COSTO POR MENSAJE", $2(t.costoMensaje), "#49B8D3"], ["VENTAS REGISTRADAS", fmtN(tv.n), "#10b981"], ["COBRADO (REAL)", fmt(tv.real), "#10b981"], ["ESPERADO", fmt(tv.esp), "#49B8D3"], ["ROI REAL", x2(roi(tv.real, t.gasto)), "#10b981"], ["ROI ESPERADO", x2(roi(tv.esp, t.gasto)), "#49B8D3"]].map(([l, v, c]) => (
            <div key={l} className="kpi"><div style={{ fontSize: "10px", letterSpacing: "2px", color: T.sub, marginBottom: "10px" }}>{l}</div><div style={{ fontSize: "26px", fontWeight: 700, color: c }}>{v}</div></div>
          ))}
        </div>

        {/* Una tarjeta por sucursal */}
        <div>
          {titulo("POR SUCURSAL · MENSAJES Y GASTO DE CADA SERVICIO", "ROI real = lo cobrado a la fecha (anticipos, o el total si ya liquidó) ÷ gasto. ROI esperado = precio completo de lo capturado ÷ gasto, si todas liquidan. Las barras comparan los servicios de cada sucursal. * Aproximado: el Bikini de Valle, Polanco y Coapa corre en un solo conjunto y se reparte en tres partes iguales; las campañas de las 5 sucursales, en cinco.")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(470px,1fr))", gap: "14px" }}>
            {SUCURSALES.map((s) => {
              const filas = d.matriz.filter((f) => f.sucursal === s);
              const tot = d.sucs.find((f) => f.sucursal === s);
              if (!tot) return null;
              const maxG = Math.max(...filas.map((f) => f.gasto), 1);
              return (
                <div key={s} className="glass" style={{ padding: "16px 18px", borderTop: `3px solid ${COLORES[s]}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: COLORES[s] }}>{s}</span>
                    <button className="btn-ghost" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => alternar(s)}>{graficos.has(s) ? "Ver tabla" : "Ver gráfico"}</button>
                  </div>
                  <div style={{ fontSize: "12px", color: T.sub, margin: "2px 0 10px" }}><b style={{ color: T.text }}>{fmtN(Math.round(tot.mensajes))}</b> mensajes · <b style={{ color: T.text }}>{fmt(Math.round(tot.gasto))}</b> gastados</div>
                  {(() => { const v = vSuc(s); return <div style={{ fontSize: "12px", color: T.sub, margin: "-6px 0 10px", lineHeight: 1.6 }}>
                    <b style={{ color: T.text }}>{v.n}</b> ventas · cobrado <b style={{ color: T.text }}>{fmt(v.real)}</b> · esperado <b style={{ color: T.text }}>{fmt(v.esp)}</b><br />
                    ROI real <b style={{ color: v.real > 0 ? "#10b981" : T.text }}>{x2(roi(v.real, tot.gasto))}</b> · ROI esperado <b style={{ color: v.esp > 0 ? "#49B8D3" : T.text }}>{x2(roi(v.esp, tot.gasto))}</b></div>; })()}
                  {graficos.has(s) ? (
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      <Dona T={T} titulo="% DEL GASTO" partes={filas.map((f) => ({ nombre: f.servicio, valor: f.gasto }))} total={tot.gasto} formato={(v) => fmt(Math.round(v))} />
                      <Dona T={T} titulo="% DE MENSAJES" partes={filas.map((f) => ({ nombre: f.servicio, valor: f.mensajes }))} total={tot.mensajes} formato={(v) => fmtN(Math.round(v))} />
                    </div>
                  ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <colgroup><col /><col style={{ width: "46px" }} /><col style={{ width: "58px" }} /><col style={{ width: "52px" }} /><col style={{ width: "62px" }} /><col style={{ width: "62px" }} /></colgroup>
                    <thead><tr><th style={{ ...th, ...tl, padding: "8px 4px" }}>SERVICIO</th><th style={{ ...th, padding: "8px 4px" }}>MSJ</th><th style={{ ...th, padding: "8px 4px" }}>GASTO</th><th style={{ ...th, padding: "8px 4px" }} title="Costo por mensaje">C/MSJ</th><th style={{ ...th, padding: "8px 4px" }} title="Cobrado a la fecha ÷ gasto">ROI REAL</th><th style={{ ...th, padding: "8px 4px" }} title="Precio completo de lo capturado ÷ gasto">ROI ESP.</th></tr></thead>
                    <tbody>{filas.map((f) => (
                      <tr key={f.servicio}>
                        <td style={{ ...td, ...tl, padding: "8px 4px", overflow: "hidden", textOverflow: "ellipsis" }} title={f.servicio}>{f.servicio}<Barra v={f.gasto} max={maxG} c={COLORES[s]} />
</td>
                        <td style={{ ...td, padding: "8px 4px" }}>{fmtN(Math.round(f.mensajes))}</td><td style={{ ...td, padding: "8px 4px" }}>{fmt(Math.round(f.gasto))}</td><td style={{ ...td, padding: "8px 4px" }}>{f.costoMensaje == null ? "—" : `$${Math.round(f.costoMensaje)}`}</td>
                        {(() => { const v = vSucServ(s, f.servicio); const tip = v.n === 0 ? "Sin ventas registradas" : `${v.n} ${v.n === 1 ? "venta" : "ventas"} · cobrado ${fmt(v.real)} · esperado ${fmt(v.esp)}`; return <><td style={{ ...td, padding: "8px 4px", fontWeight: v.real > 0 ? 700 : 400, color: v.real > 0 ? "#10b981" : T.faint }} title={tip}>{x2(roi(v.real, f.gasto))}</td><td style={{ ...td, padding: "8px 4px", fontWeight: v.esp > 0 ? 700 : 400, color: v.esp > 0 ? "#49B8D3" : T.faint }} title={tip}>{x2(roi(v.esp, f.gasto))}</td></>; })()}
                      </tr>
                    ))}</tbody>
                  </table>
                  )}
                </div>
              );
            })}
          </div>
          {d.sucs.some((f) => f.sucursal === "Sin asignar") && <div style={{ fontSize: "11px", color: "#f0c040", marginTop: "8px" }}>Hay anuncios que no se pudieron asignar a una sucursal por su nombre (ver tabla de anuncios).</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: "14px" }}>
          <div className="glass" style={{ padding: "20px", overflowX: "auto" }}>
            {titulo("POR CUENTA PUBLICITARIA")}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ ...th, ...tl }}>CUENTA</th><th style={th}>GASTO</th><th style={th}>MENSAJES</th><th style={th}>C/MENSAJE</th><th style={th}>ANUNCIOS</th></tr></thead>
              <tbody>{d.cuentas.map((f) => <tr key={f.cuenta}><td style={{ ...td, ...tl }}>{f.cuenta}</td><td style={td}>{fmt(f.gasto)}</td><td style={td}>{fmtN(Math.round(f.mensajes))}</td><td style={td}>{$2(f.costoMensaje)}</td><td style={td}>{f.anuncios}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="glass" style={{ padding: "20px", overflowX: "auto" }}>
            {titulo("POR SERVICIO", "Suma de todas las sucursales. Láser CC incluye SOP.")}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ ...th, ...tl }}>SERVICIO</th><th style={th}>GASTO</th><th style={th}>MENSAJES</th><th style={th}>C/MENSAJE</th><th style={th}>% GASTO</th><th style={th}>% MSJ</th><th style={th}>VENTAS</th><th style={th}>COBRADO</th><th style={th}>ESPERADO</th><th style={th}>ROI REAL</th><th style={th}>ROI ESP.</th></tr></thead>
              <tbody>{d.servicios.map((f) => (
                <tr key={f.servicio}>
                  <td style={{ ...td, ...tl }}>{f.servicio}</td><td style={td}>{fmt(f.gasto)}</td><td style={td}>{fmtN(Math.round(f.mensajes))}</td><td style={td}>{$2(f.costoMensaje)}</td>
                  <td style={td}>{t.gasto > 0 ? Math.round((f.gasto / t.gasto) * 100) : 0}%</td><td style={td}>{t.mensajes > 0 ? Math.round((f.mensajes / t.mensajes) * 100) : 0}%</td>
                  {(() => { const v = vServ(f.servicio); return <><td style={td}>{v.n}</td><td style={td}>{fmt(v.real)}</td><td style={td}>{fmt(v.esp)}</td><td style={td}>{x2(roi(v.real, f.gasto))}</td><td style={td}>{x2(roi(v.esp, f.gasto))}</td></>; })()}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        {/* Anuncios */}
        <div className="glass" style={{ padding: "20px" }}>
          {titulo("ANUNCIOS · CUÁLES ESCALAR Y CUÁLES REPLANTEAR", "Escalar: con $100+ de gasto, cada mensaje cuesta 0.8× el promedio o menos. Replantear: sin mensajes o 1.5× el promedio o más. Pocos datos: menos de $100.")}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por anuncio, sucursal o servicio" style={{ width: "100%", maxWidth: "340px", boxSizing: "border-box", padding: "7px 12px", borderRadius: "8px", border: `1px solid ${T.div}`, background: "transparent", color: T.text, fontFamily: "inherit", fontSize: "12px", marginBottom: "10px" }} />
          <div style={{ overflow: "auto", maxHeight: "460px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ cursor: "pointer", userSelect: "none" }}>
                {[["sucursal", "SUCURSAL", true], ["servicio", "SERVICIO", true], ["anuncio", "ANUNCIO", true], ["gasto", "GASTO"], ["mensajes", "MENSAJES"], ["costoMensaje", "C/MENSAJE"], ["veredicto", "VEREDICTO"]].map(([k, l, left]) => (
                  <th key={k} onClick={() => ordenar(k)} style={{ ...th, ...(left ? tl : {}), position: "sticky", top: 0, background: T.bg || "#0f1020" }}>{l}{flecha(k)}</th>
                ))}
              </tr></thead>
              <tbody>{filtrados.map((a) => (
                <tr key={a.adId}>
                  <td style={{ ...td, ...tl }}>{a.sucursal}</td><td style={{ ...td, ...tl }}>{a.servicio}</td><td style={{ ...td, ...tl, maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis" }} title={a.anuncio}>{a.anuncio}</td>
                  <td style={td}>{fmt(a.gasto)}</td><td style={td}>{fmtN(a.mensajes)}</td><td style={td}>{$2(a.costoMensaje)}</td>
                  <td style={{ ...td, fontWeight: VCOLOR[a.veredicto] ? 700 : 400, color: VCOLOR[a.veredicto] || T.sub }}>{a.veredicto}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </>}
    </div>
  );
}
