import { useState, useMemo } from "react";
import { useT } from "../../lib/theme.jsx";
import { COLORES } from "../../lib/constantes.js";

const fechaDe = (f) => new Date(f + "T12:00:00");
const DIA_CORTO = (f) => fechaDe(f).toLocaleDateString("es-MX", { day: "numeric" });
const DIA_LARGO = (f) => fechaDe(f).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
const esFinDeSemana = (f) => [0, 6].includes(fechaDe(f).getDay());
const INICIAL_DIA = ["D", "L", "M", "M", "J", "V", "S"];

// datos: [{fecha, sucursal, mensajes}] (el mismo `metaDiario` de cargarMeta).
export default function MensajesDiarios({ datos, sucNames, cargando = false, error = "", periodoLabel = "", mesPasado = null, proyectar = false, hoy = "" }) {
  const { T } = useT();
  const [ocultas, setOcultas] = useState(() => new Set());
  const [hover, setHover] = useState(null); // índice del día
  const [verTabla, setVerTabla] = useState(false);

  const { dias, porDia, totalesSuc, gastoDia, gastoSuc } = useMemo(() => {
    const porDia = {};
    const gastoDia = {};
    const totalesSuc = {};
    const gastoSuc = {};
    (datos || []).forEach((d) => {
      porDia[d.fecha] = porDia[d.fecha] || {};
      gastoDia[d.fecha] = gastoDia[d.fecha] || {};
      porDia[d.fecha][d.sucursal] = (porDia[d.fecha][d.sucursal] || 0) + d.mensajes;
      gastoDia[d.fecha][d.sucursal] = (gastoDia[d.fecha][d.sucursal] || 0) + (d.spend || 0);
      totalesSuc[d.sucursal] = (totalesSuc[d.sucursal] || 0) + d.mensajes;
      gastoSuc[d.sucursal] = (gastoSuc[d.sucursal] || 0) + (d.spend || 0);
    });
    return { dias: Object.keys(porDia).sort(), porDia, totalesSuc, gastoDia, gastoSuc };
  }, [datos]);

  const $ = (n) => `$${Math.round(n).toLocaleString("es-MX")}`;
  // Proyección de cierre = lo ya recibido en días completos + ritmo de los últimos 7 días completos × días restantes (incluye hoy, que está a medias)
  const completos = proyectar ? dias.filter((f) => f < hoy) : [];
  const diasMes = proyectar && hoy ? new Date(+hoy.slice(0, 4), +hoy.slice(5, 7), 0).getDate() : 0;
  const proyeccionDe = (s, fuente = porDia) => {
    if (completos.length < 3) return null;
    const recientes = completos.slice(-7);
    const ritmo = recientes.reduce((a, f) => a + (fuente[f]?.[s] || 0), 0) / recientes.length;
    return Math.round(completos.reduce((a, f) => a + (fuente[f]?.[s] || 0), 0) + ritmo * (diasMes - completos.length));
  };
  const nombreMesPasado = mesPasado ? new Date(mesPasado.ym + "-01T12:00:00").toLocaleDateString("es-MX", { month: "long" }) : "";
  const titulo = <div style={{ fontSize: "11px", letterSpacing: "2px", color: T.sub }}>MENSAJES POR DÍA · POR SUCURSAL</div>;

  if (dias.length === 0) {
    return (
      <div className="glass" style={{ padding: "24px" }}>
        {titulo}
        <div style={{ marginTop: "10px", fontSize: "13px", color: error ? "#ff6b6b" : T.muted }}>
          {cargando ? "Cargando mensajes desde Meta Ads…" : error ? `No se pudo cargar Meta Ads: ${error}` : `Sin mensajes de Meta Ads${periodoLabel ? " en " + periodoLabel : " en este periodo"}.`}
        </div>
      </div>
    );
  }

  const conDatos = sucNames.filter((s) => (totalesSuc[s] || 0) > 0);
  const visibles = conDatos.filter((s) => !ocultas.has(s));
  const val = (f, s) => porDia[f]?.[s] || 0;
  const totalDia = (f, lista = visibles) => lista.reduce((a, s) => a + val(f, s), 0);
  const totalGral = visibles.reduce((a, s) => a + (totalesSuc[s] || 0), 0);
  const toggle = (s) => setOcultas((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  // ── Barras apiladas ──
  const maxDia = Math.max(1, ...dias.map((f) => totalDia(f)));
  const techo = Math.ceil(maxDia / 20) * 20;
  const W = 760, H = 230, pl = 32, pr = 6, pt = 10, pb = 34;
  const iw = W - pl - pr, ih = H - pt - pb;
  const slot = iw / dias.length;
  const bw = Math.min(slot * 0.72, 30);
  const y = (v) => pt + ih - (v / techo) * ih;
  const pasoEtiqueta = dias.length > 16 ? Math.ceil(dias.length / 14) : 1;
  const promedio = totalGral / dias.length;

  return (
    <div className="glass" style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
        <div>
          {titulo}
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "26px", fontWeight: 700, color: "#a855f7" }}>{totalGral.toLocaleString("es-MX")}</span>
            <span style={{ fontSize: "12px", color: T.sub }}>mensajes en {dias.length} días · promedio <b style={{ color: T.muted }}>{Math.round(promedio)}</b>/día</span>
          </div>
        </div>
        <button className="btn-ghost" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={() => setVerTabla((v) => !v)}>{verTabla ? "Ocultar tabla" : "Ver tabla"}</button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        {conDatos.map((s) => {
          const off = ocultas.has(s);
          return (
            <button key={s} onClick={() => toggle(s)} title={off ? "Mostrar" : "Ocultar"} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "5px 12px", borderRadius: "99px", cursor: "pointer", fontFamily: "inherit", color: off ? T.faint : T.muted, background: off ? "transparent" : `${COLORES[s]}1a`, border: `1px solid ${off ? T.div : COLORES[s] + "55"}`, textDecoration: off ? "line-through" : "none" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: off ? T.faint : COLORES[s] }} />{s}
            </button>
          );
        })}
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((p) => (
            <g key={p}>
              <line x1={pl} x2={W - pr} y1={y(techo * p)} y2={y(techo * p)} stroke={T.div} strokeWidth="1" strokeDasharray={p === 0 ? "0" : "3 4"} />
              <text x={pl - 8} y={y(techo * p) + 3} textAnchor="end" fontSize="10" fill={T.faint}>{Math.round(techo * p)}</text>
            </g>
          ))}
          {promedio > 0 && (
            <g>
              <line x1={pl} x2={W - pr} y1={y(promedio)} y2={y(promedio)} stroke="#a855f7" strokeWidth="1" strokeDasharray="5 4" opacity="0.7" />
              <text x={W - pr} y={y(promedio) - 4} textAnchor="end" fontSize="9" fill="#a855f7">prom. {Math.round(promedio)}</text>
            </g>
          )}
          {dias.map((f, i) => {
            const cx = pl + slot * i + slot / 2;
            let acum = 0;
            const activo = hover === i;
            const mostrarEtiqueta = i % pasoEtiqueta === 0 && !(pasoEtiqueta > 1 && i > dias.length - pasoEtiqueta);
            return (
              <g key={f} opacity={hover == null || activo ? 1 : 0.45} style={{ transition: "opacity .12s" }}>
                {activo && <rect x={cx - slot / 2} y={pt} width={slot} height={ih} fill={T.div} opacity="0.5" rx="4" />}
                {visibles.map((s) => {
                  const v = val(f, s);
                  if (!v) return null;
                  const y1 = y(acum + v), y0 = y(acum);
                  acum += v;
                  return <rect key={s} x={cx - bw / 2} y={y1} width={bw} height={Math.max(y0 - y1 - 1, 1)} fill={COLORES[s]} rx="2" />;
                })}
                {mostrarEtiqueta && (
                  <>
                    <text x={cx} y={H - 16} textAnchor="middle" fontSize="10" fontWeight={esFinDeSemana(f) ? 700 : 400} fill={esFinDeSemana(f) ? T.muted : T.faint}>{DIA_CORTO(f)}</text>
                    <text x={cx} y={H - 4} textAnchor="middle" fontSize="8" fill={T.faint}>{INICIAL_DIA[fechaDe(f).getDay()]}</text>
                  </>
                )}
                <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {hover != null && (() => {
          const f = dias[hover];
          const derecha = hover > dias.length / 2;
          const pos = (pl + slot * hover + slot / 2) / W;
          return (
            <div style={{ position: "absolute", top: 0, [derecha ? "right" : "left"]: `${(derecha ? 1 - pos : pos) * 100 + 3}%`, background: "#1c1f3a", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#fff", pointerEvents: "none", minWidth: "160px", zIndex: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
              <div style={{ fontWeight: 700, marginBottom: "6px", textTransform: "capitalize" }}>{DIA_LARGO(f)}</div>
              {visibles.map((s) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "1.5px 0" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: COLORES[s] }} />
                  <span style={{ flex: 1, color: "rgba(255,255,255,0.8)" }}>{s}</span>
                  <b>{val(f, s)}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: "6px", paddingTop: "6px" }}><span>Total</span><b>{totalDia(f)}</b></div>
            </div>
          );
        })()}
      </div>

      {/* ── Una tarjeta por sucursal, misma escala para poder compararlas ── */}
      {(() => {
        const maxSuc = Math.max(1, ...conDatos.flatMap((s) => dias.map((f) => val(f, s))));
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "12px", marginTop: "18px" }}>
            {conDatos.map((s) => {
              const tot = totalesSuc[s] || 0;
              const prom = tot / dias.length;
              const off = ocultas.has(s);
              const proy = proyeccionDe(s);
              const proyGasto = proyeccionDe(s, gastoDia);
              return (
                <div key={s} style={{ padding: "12px 14px", borderRadius: "12px", border: `1px solid ${COLORES[s]}33`, background: `${COLORES[s]}0d`, opacity: off ? 0.45 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: COLORES[s] }}>{s}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "2px 0 8px" }}>
                    <span style={{ fontSize: "22px", fontWeight: 700 }}>{tot.toLocaleString("es-MX")}</span>
                    <span style={{ fontSize: "11px", color: T.sub }}>{prom.toFixed(1)}/día</span>
                  </div>
                  <svg viewBox={`0 0 ${dias.length * 6} 34`} preserveAspectRatio="none" style={{ width: "100%", height: "34px", display: "block" }}>
                    {dias.map((f, i) => {
                      const v = val(f, s);
                      const h = Math.max((v / maxSuc) * 32, v > 0 ? 1.5 : 0);
                      return <rect key={f} x={i * 6 + 0.8} y={34 - h} width="4.4" height={h} rx="1" fill={COLORES[s]} opacity={hover === i ? 1 : 0.8}><title>{`${DIA_LARGO(f)}: ${v}`}</title></rect>;
                    })}
                  </svg>
                  {(() => {
                    const hayCierre = proy != null;
                    const hayPasado = !!mesPasado;
                    const cols = ["1fr", "auto", ...(hayCierre ? ["auto"] : []), ...(hayPasado ? ["auto"] : [])].join(" ");
                    const th = { fontSize: "9px", letterSpacing: "0.6px", textTransform: "uppercase", color: T.faint, textAlign: "right", fontWeight: 600 };
                    const td = { fontSize: "12px", textAlign: "right", color: T.muted, fontWeight: 600 };
                    const gPas = mesPasado?.gastoPorSucursal?.[s];
                    return (
                      <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: `1px solid ${COLORES[s]}2a`, display: "grid", gridTemplateColumns: cols, columnGap: "10px", rowGap: "5px", alignItems: "baseline" }}>
                        <span />
                        <span style={th}>{proyectar ? "Lleva" : "Total"}</span>
                        {hayCierre && <span style={th} title="Proyección a fin de mes: días completos + ritmo de los últimos 7 días completos × días restantes">Cierre*</span>}
                        {hayPasado && <span style={{ ...th, textTransform: "capitalize" }}>{nombreMesPasado.slice(0, 3)}</span>}

                        <span style={{ fontSize: "11px", color: T.sub }}>Mensajes</span>
                        <span style={td}>{tot.toLocaleString("es-MX")}</span>
                        {hayCierre && <span style={{ ...td, color: COLORES[s] }}>~{proy.toLocaleString("es-MX")}</span>}
                        {hayPasado && <span style={td}>{(mesPasado.porSucursal?.[s] ?? 0).toLocaleString("es-MX")}</span>}

                        <span style={{ fontSize: "11px", color: T.sub }}>Gasto</span>
                        <span style={td}>{$(gastoSuc[s] || 0)}</span>
                        {hayCierre && <span style={{ ...td, color: COLORES[s] }}>{proyGasto != null ? `~${$(proyGasto)}` : "—"}</span>}
                        {hayPasado && <span style={td}>{gPas != null ? $(gPas) : "—"}</span>}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        );
      })()}

      {proyectar && completos.length >= 3 && <div style={{ fontSize: "10px", color: T.faint, marginTop: "10px" }}>* Cierre = proyección a fin de mes: lo ya recibido en días completos + el ritmo de los últimos 7 días completos × los días que faltan.</div>}

      {verTabla && (
        <div style={{ overflowX: "auto", marginTop: "16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ color: T.sub, textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Día</th>
                {conDatos.map((s) => <th key={s} style={{ padding: "6px 8px", fontWeight: 600, color: COLORES[s] }}>{s}</th>)}
                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((f) => (
                <tr key={f} style={{ borderTop: `1px solid ${T.div}`, textAlign: "right", background: esFinDeSemana(f) ? T.div : "transparent" }}>
                  <td style={{ textAlign: "left", padding: "6px 8px", color: T.muted, textTransform: "capitalize" }}>{fechaDe(f).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}</td>
                  {conDatos.map((s) => <td key={s} style={{ padding: "6px 8px" }}>{val(f, s)}</td>)}
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>{totalDia(f, conDatos)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${T.div}`, textAlign: "right", fontWeight: 700 }}>
                <td style={{ textAlign: "left", padding: "6px 8px" }}>Total</td>
                {conDatos.map((s) => <td key={s} style={{ padding: "6px 8px", color: COLORES[s] }}>{totalesSuc[s] || 0}</td>)}
                <td style={{ padding: "6px 8px" }}>{conDatos.reduce((a, s) => a + (totalesSuc[s] || 0), 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
