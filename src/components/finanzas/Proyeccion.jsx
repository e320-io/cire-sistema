import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, BarChart, Cell, LabelList,
} from "recharts";
import { CLAUDE_KEY } from "../../lib/supabase.js";
import { useT } from "../../lib/theme.jsx";
import { COLORES, SUCURSALES_NAMES, fmt, cdmx } from "../../lib/constantes.js";
import { indiceEstacionalPooled, backtestWalkForward, proyectar, BASES_CALCULO, siguienteMes } from "./forecast.js";
import { distribucionSemanalPooled, distribucionSemanalMes, diasEnMes, mesAnioAnterior } from "./semanal.js";
import { fetchZettleRawCached } from "./ResumenFinanciero.jsx";
import MetaAdsBudget from "./MetaAdsBudget.jsx";

const MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const monthLabel = (m) => { const [y, mm] = m.split("-"); return `${MESES_LABEL[parseInt(mm, 10) - 1]} ${y.slice(2)}`; };
const fmtK = (v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

export default function Proyeccion({ historial, sucVisible, periodo }) {
  const { light, T } = useT();
  const [vistaRango, setVistaRango] = useState("80");
  const [baseCalculo, setBaseCalculo] = useState("desest");
  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [tickets, setTickets] = useState(null);

  const mesObjetivo = useMemo(() => siguienteMes(periodo), [periodo]);

  // Tickets diarios (14 meses) para repartir la proyección del mes siguiente en
  // pacing S1-S5 — mismo dato y caché que usa ResumenFinanciero, para no duplicar el fetch.
  useEffect(() => {
    (async () => {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 14, 1).toISOString().slice(0, 10);
      const hasta = cdmx();
      setTickets(await fetchZettleRawCached(desde, hasta));
    })();
  }, []);

  // El mes en curso está incompleto — dejarlo en el histórico dispara el error del
  // modelo a cifras absurdas (una sucursal con apenas $250 vendidos el día 1 del mes
  // se lee como una caída de -99%). Solo se usan meses ya cerrados: hasta el mes
  // filtrado inclusive, pero nunca el mes real en curso aunque el filtro lo seleccione.
  const mesActualReal = useMemo(() => cdmx().slice(0, 7), []);
  const historialCompletos = useMemo(() => historial.filter((r) => r.mes <= periodo && r.mes < mesActualReal), [historial, periodo, mesActualReal]);
  const ultimoMesUsado = historialCompletos.length ? historialCompletos[historialCompletos.length - 1].mes : null;

  const modelo = useMemo(() => {
    if (!historialCompletos.length) return null;
    const indice = indiceEstacionalPooled(historialCompletos, SUCURSALES_NAMES);
    const backtest = backtestWalkForward(historialCompletos, SUCURSALES_NAMES, indice);
    const porSucursal = {};
    sucVisible.forEach((suc) => { porSucursal[suc] = proyectar(historialCompletos, suc, mesObjetivo, indice, backtest); });
    return { indice, backtest, porSucursal };
  }, [historialCompletos, sucVisible, mesObjetivo]);

  const seasonalData = useMemo(() => {
    if (!modelo) return [];
    return MESES_LABEL.map((l, i) => ({ mes: l, val: Number((modelo.indice[i + 1] || 1).toFixed(2)) }));
  }, [modelo]);

  const filas = useMemo(() => {
    if (!modelo) return [];
    return sucVisible.map((suc) => {
      const p = modelo.porSucursal[suc];
      if (!p) return null;
      const activo = p[baseCalculo];
      const lo = vistaRango === "80" ? activo.lo80 : activo.lo90;
      const hi = vistaRango === "80" ? activo.hi80 : activo.hi90;
      const historialSuc = historialCompletos.map((r) => ({ mes: r.mes, mesLabel: monthLabel(r.mes), venta: r[suc] || null }));
      historialSuc.push({ mes: mesObjetivo, mesLabel: monthLabel(mesObjetivo), venta: null, proy: activo.punto, proyLo: lo, proyHi: hi });
      return { sucursal: suc, ...p, activo, lo, hi, historialSuc };
    }).filter(Boolean).sort((a, b) => b.activo.punto - a.activo.punto);
  }, [modelo, sucVisible, baseCalculo, vistaRango, historialCompletos, mesObjetivo]);

  // Pacing S1-S5 del mes proyectado, para los 2 escenarios (realista/optimista).
  // Reparte cada meta mensual con el mismo % semanal que usa ResumenFinanciero para
  // el mes en curso: primero intenta el patrón real del mismo mes hace un año
  // (distribucionSemanalMes); si esa sucursal no tenía datos ese mes, cae al patrón
  // agrupado de todas las sucursales de los últimos meses cerrados (distribucionSemanalPooled).
  const mesesRefSemanal = useMemo(() => historialCompletos.map((r) => r.mes).slice(-3), [historialCompletos]);
  const mesObjetivoAnioAnt = useMemo(() => mesAnioAnterior(mesObjetivo), [mesObjetivo]);
  const diasObjetivo = useMemo(() => diasEnMes(mesObjetivo), [mesObjetivo]);
  const distribSemanalPooled = useMemo(() => {
    if (!tickets || !mesesRefSemanal.length) return [];
    return distribucionSemanalPooled(tickets, SUCURSALES_NAMES, mesesRefSemanal);
  }, [tickets, mesesRefSemanal]);

  const pacing = useMemo(() => {
    if (!modelo || !tickets) return null;
    const porSuc = sucVisible.map((suc) => {
      const p = modelo.porSucursal[suc];
      if (!p) return null;
      const metaOptimista = p.desest.punto;
      const metaRealista = p.desest_castigado.punto;
      const distribAnioAnt = distribucionSemanalMes(tickets, suc, mesObjetivoAnioAnt);
      const semanasBase = (distribAnioAnt || distribSemanalPooled).filter((w) => w.semana <= (diasObjetivo > 28 ? 5 : 4) && w.pct >= 1);
      const semanas = semanasBase.map((w) => ({ semana: w.semana, montoOptimista: metaOptimista * (w.pct / 100), montoRealista: metaRealista * (w.pct / 100) }));
      return { sucursal: suc, metaOptimista, metaRealista, semanas };
    }).filter(Boolean);
    const porSemana = {};
    porSuc.forEach((f) => f.semanas.forEach((w) => {
      if (!porSemana[w.semana]) porSemana[w.semana] = { semana: w.semana, montoOptimista: 0, montoRealista: 0 };
      porSemana[w.semana].montoOptimista += w.montoOptimista;
      porSemana[w.semana].montoRealista += w.montoRealista;
    }));
    const semanasAgregadas = Object.values(porSemana).sort((a, b) => a.semana - b.semana);
    return {
      totalOptimista: porSuc.reduce((a, f) => a + f.metaOptimista, 0),
      totalRealista: porSuc.reduce((a, f) => a + f.metaRealista, 0),
      semanasAgregadas,
    };
  }, [modelo, tickets, sucVisible, mesObjetivoAnioAnt, diasObjetivo, distribSemanalPooled]);

  const generarInsight = async () => {
    if (!CLAUDE_KEY) { alert("Agrega VITE_CLAUDE_KEY en .env.local para usar la IA"); return; }
    setLoadingInsight(true); setInsight("");
    const resumen = filas.map((f) => ({ sucursal: f.sucursal, proyeccion: f.activo.punto, rango: [f.lo, f.hi], mesesUsados: f.mesesUsados }));
    const prompt = `Eres el analista de datos de CIRE (salones de depilación láser en México). Ya tienes el modelo estadístico calibrado (índice estacional agrupado por temporada + nivel reciente por sucursal, con backtest walk-forward: MAPE ${modelo.backtest.mape}%, sesgo ${(modelo.backtest.sesgo * 100).toFixed(1)}%, ${modelo.backtest.n} pronósticos de prueba). Tu tarea es dar un insight breve y OKRs semanales para ${monthLabel(mesObjetivo)}.\n\nPROYECCIÓN POR SUCURSAL (base: ${BASES_CALCULO.find((b) => b.k === baseCalculo).l}):\n${JSON.stringify(resumen, null, 2)}\n\nResponde SOLO con JSON válido:\n{"insight":"2-3 oraciones: qué dice el modelo, dónde hay más incertidumbre, y una recomendación concreta","semanas_okr":[{"sem":1,"pct":numero,"razon":"texto"},{"sem":2,"pct":numero,"razon":"texto"},{"sem":3,"pct":numero,"razon":"texto"},{"sem":4,"pct":numero,"razon":"texto"}]}`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, messages: [{ role: "user", content: prompt }] }) });
      const json = await res.json();
      const txt = json.content?.[0]?.text || "{}";
      const match = txt.match(/\{[\s\S]*\}/);
      setInsight(match ? JSON.parse(match[0]) : { insight: "Sin respuesta de la IA." });
    } catch (e) { setInsight({ insight: `Error al conectar con la IA: ${e.message}` }); }
    setLoadingInsight(false);
  };

  if (!modelo) return <div className="glass" style={{ padding: "40px", textAlign: "center", color: T.faint, fontSize: "13px" }}>Sin histórico suficiente para proyectar {monthLabel(mesObjetivo)}.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div className="glass" style={{ padding: "20px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "2px", color: T.sub }}>PROYECCIÓN · {monthLabel(mesObjetivo).toUpperCase()}</div>
        <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>¿Cuánto va a vender cada sucursal el próximo mes?</div>
        {ultimoMesUsado && <div style={{ fontSize: "11.5px", color: T.faint, marginTop: "4px" }}>Base: histórico hasta {monthLabel(ultimoMesUsado)} · Proyecta: {monthLabel(mesObjetivo)}</div>}
        <div style={{ fontSize: "13px", color: T.muted, marginTop: "6px", maxWidth: "680px" }}>
          Un rango, no un número: por sucursal sola la estacionalidad es puro ruido, así que se combina el patrón de las {SUCURSALES_NAMES.length} sucursales (que sí es consistente) con el nivel reciente de cada una. El rango de error se mide con backtesting real sobre el historial disponible, no con una fórmula teórica.
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#f0c040", background: "rgba(240,192,64,0.12)", padding: "4px 10px", borderRadius: "99px" }}>Error histórico del método (MAPE): {modelo.backtest.mape ?? "—"}%</span>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#2721E8", background: "rgba(39,33,232,0.1)", padding: "4px 10px", borderRadius: "99px" }}>{modelo.backtest.n} pronósticos de prueba (backtest walk-forward)</span>
          {modelo.backtest.sesgo !== 0 && <span style={{ fontSize: "11.5px", color: T.faint }}>Sesgo detectado: {modelo.backtest.sesgo > 0 ? "+" : ""}{(modelo.backtest.sesgo * 100).toFixed(1)}% de {modelo.backtest.sesgo > 0 ? "sobre" : "sub"}estimación. Solo se descuenta en la base «Ajustado + castigo».</span>}
        </div>
      </div>

      <div className="glass" style={{ padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "2px" }}>Patrón de temporada (sucursales combinadas)</div>
        <div style={{ fontSize: "11px", color: T.faint, marginBottom: "10px" }}>1.00 = mes promedio del año</div>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={seasonalData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.div} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: T.faint }} />
            <YAxis tick={{ fontSize: 11, fill: T.faint }} />
            <ReferenceLine y={1} stroke={T.faint} strokeDasharray="3 3" />
            <Tooltip formatter={(v) => [`${v}×`, "Índice"]} />
            <Bar dataKey="val" radius={[4, 4, 0, 0]} barSize={26}>
              {seasonalData.map((d, i) => <Cell key={i} fill={MESES_LABEL[parseInt(mesObjetivo.split("-")[1], 10) - 1] === d.mes ? "#2721E8" : d.val >= 1.15 ? "#10b981" : d.val <= 0.85 ? "#ff6b6b" : (light ? "#d8dedc" : "#444")} />)}
              <LabelList dataKey="val" position="top" formatter={(v) => `${v}×`} style={{ fontSize: 10.5, fill: T.faint, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {pacing && (
        <div className="glass" style={{ padding: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "2px" }}>Proyección + pacing — {monthLabel(mesObjetivo)}</div>
          <div style={{ fontSize: "11px", color: T.faint, marginBottom: "14px" }}>Dos escenarios: realista (ajustado por temporada + castigo por sesgo) y optimista (techo estadístico, sin castigo) — repartidos por semana con el patrón de {mesObjetivoAnioAnt ? monthLabel(mesObjetivoAnioAnt) : "el año anterior"} o, si falta, el promedio agrupado de sucursales.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "18px" }}>
            <div className="kpi">
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: T.sub }}>META REALISTA</div>
              <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt(pacing.totalRealista)}</div>
            </div>
            <div className="kpi">
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: T.sub }}>TECHO ESTADÍSTICO (OPTIMISTA)</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: T.muted }}>{fmt(pacing.totalOptimista)}</div>
            </div>
          </div>
          {pacing.semanasAgregadas.length > 0 && <>
            <div style={{ fontSize: "11px", fontWeight: 700, color: T.sub, marginBottom: "8px" }}>PACING SEMANAL (S1–S5)</div>
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 150px 150px", gap: "8px", marginBottom: "6px" }}>
              <span /><span />
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>REALISTA</span>
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>OPTIMISTA</span>
            </div>
            {pacing.semanasAgregadas.map((w) => {
              const pctRealista = pacing.totalRealista > 0 ? (w.montoRealista / pacing.totalRealista) * 100 : 0;
              const pctOptimista = pacing.totalOptimista > 0 ? (w.montoOptimista / pacing.totalOptimista) * 100 : 0;
              return (
                <div key={w.semana} style={{ display: "grid", gridTemplateColumns: "28px 1fr 150px 150px", gap: "8px", alignItems: "center", marginBottom: "7px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: T.muted }}>S{w.semana}</span>
                  <div style={{ height: "6px", background: T.div, borderRadius: "3px" }}>
                    <div style={{ width: `${Math.min(pctRealista, 100)}%`, height: "100%", background: "#2721E8", borderRadius: "3px" }} />
                  </div>
                  <span style={{ fontSize: "11px", color: T.muted, textAlign: "right" }}>{fmt(w.montoRealista)} · {pctRealista.toFixed(0)}%</span>
                  <span style={{ fontSize: "11px", color: T.faint, textAlign: "right" }}>{fmt(w.montoOptimista)} · {pctOptimista.toFixed(0)}%</span>
                </div>
              );
            })}
          </>}
        </div>
      )}

      <MetaAdsBudget historial={historialCompletos} sucVisible={sucVisible} periodo={periodo} />

      <div style={{ fontSize: "13px", fontWeight: 700 }}>Histórico y proyección — cada sucursal</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
        {filas.map((f) => (
          <div key={f.sucursal} className="glass" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "99px", background: COLORES[f.sucursal] }} />
                <span style={{ fontWeight: 700, fontSize: "13px" }}>{f.sucursal}</span>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#2721E8" }}>{monthLabel(mesObjetivo)}: {fmt(f.activo.punto)}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={f.historialSuc.slice(-13)} margin={{ left: 0, right: 5, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.div} vertical={false} />
                <XAxis dataKey="mesLabel" tick={{ fontSize: 9, fill: T.faint }} />
                <YAxis tick={{ fontSize: 9, fill: T.faint }} tickFormatter={fmtK} width={34} />
                <Tooltip formatter={(v, n) => (v == null ? [null, null] : n === "venta" ? [fmt(v), "Venta real"] : n === "proy" ? [fmt(v), "Proyección"] : [fmt(v), n])} />
                <Area dataKey="proyHi" stroke="none" fill={COLORES[f.sucursal]} fillOpacity={0.12} />
                <Area dataKey="proyLo" stroke="none" fill="transparent" fillOpacity={1} />
                <Bar dataKey="venta" fill={COLORES[f.sucursal]} fillOpacity={0.75} radius={[2, 2, 0, 0]} barSize={7} />
                <Line dataKey="proy" stroke="#2721E8" strokeWidth={0} dot={{ r: 4, fill: "#2721E8", stroke: "#fff", strokeWidth: 1.5 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontSize: "10.5px", color: T.faint, marginTop: "2px" }}>Rango {vistaRango}%: {fmt(f.lo)} – {fmt(f.hi)}</div>
          </div>
        ))}
      </div>

      <div className="glass" style={{ padding: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700 }}>Insight + OKRs semanales (IA)</div>
          <button className="btn-blue" style={{ fontSize: "12px" }} onClick={generarInsight} disabled={loadingInsight}>{loadingInsight ? "Generando..." : "Generar insight"}</button>
        </div>
        {insight && typeof insight === "object" && <div style={{ fontSize: "13px", lineHeight: 1.6, color: T.muted }}>
          <p style={{ marginBottom: "10px" }}>{insight.insight}</p>
          {insight.semanas_okr && <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {insight.semanas_okr.map((s) => <div key={s.sem} className="kpi" style={{ flex: 1, minWidth: "140px" }}>
              <div style={{ fontSize: "10px", color: T.faint }}>SEMANA {s.sem}</div>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{s.pct}%</div>
              <div style={{ fontSize: "10.5px", color: T.faint }}>{s.razon}</div>
            </div>)}
          </div>}
        </div>}
      </div>
    </div>
  );
}
