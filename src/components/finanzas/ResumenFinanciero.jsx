import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { fetchZettleRaw, fetchHistorialMensualCacheado } from "../../lib/zettle.js";
import { useT } from "../../lib/theme.jsx";
import { COLORES, SUCURSALES_NAMES, fmt, cdmx } from "../../lib/constantes.js";
import { indiceEstacionalPooled, backtestWalkForward, proyectar, siguienteMes } from "./forecast.js";
import { ADS_ESTIMADO, gastoPorPeriodoSuc as gastoPorPeriodoSucDe, periodosReales, refPeriodo as refPeriodoDe, gastoDe as gastoDeDe } from "./utilidad.js";
import { distribucionSemanalPooled, distribucionSemanalMes, diasEnMes, mesAnioAnterior, ventasPorSemanaSuc, bucketSemana } from "./semanal.js";

const MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const monthLabel = (m) => { const [y, mm] = m.split("-"); return `${MESES_LABEL[parseInt(mm, 10) - 1]} ${y.slice(2)}`; };
const monthLabelFull = (m) => { const [y, mm] = m.split("-"); return `${MESES_FULL[parseInt(mm, 10) - 1]} ${y}`; };

// NOTA: se intentó leer de la tabla `tickets` (Supabase) en vez de Zettle en vivo para
// que este bloque cargara más rápido. Se revirtió: esa tabla duplica casi 2x las ventas
// de Valle y Polanco (comparten una sola cuenta de Zettle) — el cron de sync-zettle tiene
// un bug de deduplicación para esa cuenta compartida. Hasta que se arregle esa sincronización,
// esta vista debe seguir leyendo directo de la Edge Function de Zettle para no mostrar
// cifras infladas.

// Este componente se monta tanto en Resumen como en Finanzas > Proyección y Metas —
// cachea por rango de fechas para no duplicar el fetch de 14 meses de Zettle al navegar entre ambos.
const zettleRawCache = new Map();
export const fetchZettleRawCached = (desde, hasta) => {
  const key = `${desde}|${hasta}`;
  if (!zettleRawCache.has(key)) zettleRawCache.set(key, fetchZettleRaw(desde, hasta));
  return zettleRawCache.get(key);
};

export default function ResumenFinanciero({ sucNames, mesFiltro, onVerDetalle, onFilas, anclarAFiltro=false }) {
  const { light, T } = useT();
  const [tickets, setTickets] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vistaSuc, setVistaSuc] = useState("todas");
  const [modoPacing, setModoPacing] = useState(anclarAFiltro ? "seleccionado" : "actual"); // "actual" | "seleccionado"
  useEffect(() => { if (vistaSuc !== "todas" && !sucNames.includes(vistaSuc)) setVistaSuc("todas"); }, [sucNames]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const hoy = new Date();
      const desdeD = new Date(hoy.getFullYear(), hoy.getMonth() - 14, 1);
      const desde = desdeD.toISOString().slice(0, 10);
      const hasta = cdmx();
      // El histórico mensual para el modelo (índice estacional, backtest, proyectar) usa
      // TODO el histórico cacheado desde 2021 — el mismo que MetaAdsBudget/Proyeccion.jsx —
      // para que "meta optimista/realista" del pacing coincida con esas cifras. `tickets`
      // (solo últimos 14 meses, en vivo) se conserva aparte para la distribución semanal,
      // que sí necesita granularidad diaria.
      const [tks, hist, { data: g }] = await Promise.all([
        fetchZettleRawCached(desde, hasta),
        fetchHistorialMensualCacheado(SUCURSALES_NAMES),
        supabase.from("gastos_operativos").select("sucursal_id,periodo,categoria,monto,tipo"),
      ]);
      setTickets(tks);
      setHistorial(hist);
      setGastos(g || []);
      setLoading(false);
    })();
  }, []);

  const periodoActual = useMemo(() => cdmx().slice(0, 7), []);

  // El mes en curso está incompleto — se excluye de todo el cálculo (crecimiento,
  // estacionalidad, backtest) para no leer un día de ventas como una caída del 90%.
  const historialCerrado = useMemo(() => historial.filter((r) => r.mes < periodoActual), [historial, periodoActual]);
  const mesesConVenta = useMemo(() => historialCerrado.map((r) => r.mes), [historialCerrado]);
  const ultimoMesCerrado = mesesConVenta[mesesConVenta.length - 1];
  const mesAnterior = mesesConVenta[mesesConVenta.length - 2];
  const mesObjetivo = useMemo(() => (ultimoMesCerrado ? siguienteMes(ultimoMesCerrado) : null), [ultimoMesCerrado]);

  const gastoPorPeriodoSuc = useMemo(() => gastoPorPeriodoSucDe(gastos), [gastos]);
  const periodosRealesPorSuc = useMemo(() => periodosReales(gastoPorPeriodoSuc, SUCURSALES_NAMES), [gastoPorPeriodoSuc]);

  const modelo = useMemo(() => {
    if (!historialCerrado.length) return null;
    const indice = indiceEstacionalPooled(historialCerrado, SUCURSALES_NAMES);
    const backtest = backtestWalkForward(historialCerrado, SUCURSALES_NAMES, indice);
    return { indice, backtest };
  }, [historialCerrado]);

  const filas = useMemo(() => {
    if (!modelo || !ultimoMesCerrado) return [];
    const filaUltimo = historialCerrado.find((r) => r.mes === ultimoMesCerrado);
    const filaAnterior = mesAnterior ? historialCerrado.find((r) => r.mes === mesAnterior) : null;
    return SUCURSALES_NAMES.map((suc) => {
      const ventaUltimo = filaUltimo?.[suc] || 0;
      const ventaAnterior = filaAnterior?.[suc] || 0;
      const crecimientoPct = ventaAnterior > 0 ? ((ventaUltimo - ventaAnterior) / ventaAnterior) * 100 : null;

      const perRef = refPeriodoDe(periodosRealesPorSuc, suc, ultimoMesCerrado);
      const esReferencia = perRef !== ultimoMesCerrado;
      const gastoBase = gastoDeDe(gastoPorPeriodoSuc, suc, perRef, false);
      const gasto = gastoBase + ADS_ESTIMADO.punto;
      const utilidad = ventaUltimo > 0 ? ventaUltimo - gasto : null;
      const margenPct = ventaUltimo > 0 ? (utilidad / ventaUltimo) * 100 : null;

      // Dos escenarios de proyección: "optimista" (ajustado por temporada, sin castigo)
      // y "realista" (ajustado + castigo por el sesgo de sobreestimación medido en el
      // backtest). No son la misma cifra a propósito — se muestran ambas para que la
      // meta del mes se lea como un rango, no como un número falsamente preciso.
      const proy = proyectar(historialCerrado, suc, mesObjetivo, modelo.indice, modelo.backtest);
      const puntoProyOptimista = proy?.desest?.punto || 0;
      const puntoProyRealista = proy?.desest_castigado?.punto || 0;

      // Qué había proyectado el modelo para el mes que acaba de cerrar, usando solo
      // datos disponibles antes de ese mes — para comparar pronóstico vs. lo que pasó.
      const historialPrevio = historialCerrado.filter((r) => r.mes < ultimoMesCerrado);
      const proyAnterior = proyectar(historialPrevio, suc, ultimoMesCerrado, modelo.indice, modelo.backtest);
      const puntoProyAnterior = proyAnterior?.desest?.punto || null;

      const ventanaProm = historialCerrado.slice(-6).map((r) => r[suc] || 0).filter((v) => v > 0);
      const promedio = ventanaProm.length ? ventanaProm.reduce((a, b) => a + b, 0) / ventanaProm.length : null;

      return { sucursal: suc, ventaUltimo, ventaAnterior, crecimientoPct, utilidad, margenPct, esReferencia, puntoProyOptimista, puntoProyRealista, puntoProyAnterior, promedio };
    });
  }, [modelo, ultimoMesCerrado, mesAnterior, historialCerrado, periodosRealesPorSuc, gastoPorPeriodoSuc, mesObjetivo]);

  useEffect(() => { onFilas?.(filas); }, [filas, onFilas]);

  // ═══ Control de metas y ritmo — pacing. Por defecto ancla al mes REAL en curso
  // (periodoActual), sin importar qué mes tenga seleccionado el filtro global de arriba
  // — el pacing es intrínsecamente "¿cómo voy ahora?", no un dato histórico. El toggle
  // deja verlo para el mes que el filtro global tenga seleccionado, si se quiere.
  // Con anclarAFiltro (Finanzas > Proyección y Metas) el mes del filtro manda siempre
  // que exista — nunca cae al "mes siguiente" (mesObjetivo), que es el reloj de Proyeccion.jsx.
  const mesEjecucion = modoPacing === "actual" ? periodoActual : (anclarAFiltro ? (mesFiltro || periodoActual) : (mesFiltro || mesObjetivo));
  const esMesActualReal = mesEjecucion === periodoActual;
  const semanaActual = esMesActualReal ? bucketSemana(parseInt(cdmx().slice(8, 10), 10)) : null;
  const historialParaEjecucion = useMemo(() => historial.filter((r) => r.mes < mesEjecucion), [historial, mesEjecucion]);
  const modeloEjecucion = useMemo(() => {
    if (!historialParaEjecucion.length || !mesEjecucion) return null;
    const indice = indiceEstacionalPooled(historialParaEjecucion, SUCURSALES_NAMES);
    const backtest = backtestWalkForward(historialParaEjecucion, SUCURSALES_NAMES, indice);
    return { indice, backtest };
  }, [historialParaEjecucion, mesEjecucion]);
  const mesesRefSemanalEj = useMemo(() => historialParaEjecucion.map((r) => r.mes).slice(-3), [historialParaEjecucion]);
  const distribSemanalEj = useMemo(() => {
    if (!tickets || !mesesRefSemanalEj.length) return [];
    return distribucionSemanalPooled(tickets, SUCURSALES_NAMES, mesesRefSemanalEj);
  }, [tickets, mesesRefSemanalEj]);

  const filasEjecucion = useMemo(() => {
    if (!modeloEjecucion || !mesEjecucion) return [];
    const diasObjetivo = diasEnMes(mesEjecucion);
    const mesEjecucionAnioAnt = mesAnioAnterior(mesEjecucion);
    return SUCURSALES_NAMES.map((suc) => {
      const proy = proyectar(historialParaEjecucion, suc, mesEjecucion, modeloEjecucion.indice, modeloEjecucion.backtest);
      // Dos escenarios: optimista (ajustado por temporada, sin castigo) y realista
      // (ajustado + castigo por el sesgo de sobreestimación del backtest). El % de
      // cumplimiento se mide contra el realista — es el piso, no el techo.
      const puntoProyOptimista = proy?.desest?.punto || 0;
      const puntoProyRealista = proy?.desest_castigado?.punto || 0;
      const semanasPooled = distribSemanalEj.filter((w) => w.semana <= (diasObjetivo > 28 ? 5 : 4) && w.pct >= 1);
      const distribAnioAnt = distribucionSemanalMes(tickets || [], suc, mesEjecucionAnioAnt);
      const semanasBase = distribAnioAnt
        ? distribAnioAnt.filter((w) => w.semana <= (diasObjetivo > 28 ? 5 : 4))
        : semanasPooled;
      const realPorSemana = ventasPorSemanaSuc(tickets || [], suc, mesEjecucion);
      const metasSemanales = semanasBase.map((w) => {
        const metaOptimista = puntoProyOptimista * (w.pct / 100);
        const metaRealista = puntoProyRealista * (w.pct / 100);
        const real = realPorSemana[w.semana] || 0;
        return { ...w, metaOptimista, metaRealista, real, pctAlcance: metaRealista > 0 ? (real / metaRealista) * 100 : null };
      });
      return { sucursal: suc, puntoProyOptimista, puntoProyRealista, metasSemanales, usandoPooled: !distribAnioAnt, mesEjecucionAnioAnt };
    });
  }, [modeloEjecucion, historialParaEjecucion, distribSemanalEj, mesEjecucion, tickets]);

  const filasEjecucionVisibles = useMemo(() => filasEjecucion.filter((f) => sucNames.includes(f.sucursal)), [filasEjecucion, sucNames]);

  // Vista seleccionada en el widget de ejecución: una sucursal, o "todas" (agregado).
  const filaSel = vistaSuc === "todas" ? null : filasEjecucionVisibles.find((f) => f.sucursal === vistaSuc);
  const MIN_META = 1; // por debajo de esto, la meta de esa semana es ruido de redondeo, no una meta real.

  const semanasAgregadas = useMemo(() => {
    const porSemana = {};
    filasEjecucionVisibles.forEach((f) => f.metasSemanales.forEach((w) => {
      if (!porSemana[w.semana]) porSemana[w.semana] = { semana: w.semana, metaOptimista: 0, metaRealista: 0, real: 0 };
      porSemana[w.semana].metaOptimista += w.metaOptimista;
      porSemana[w.semana].metaRealista += w.metaRealista;
      porSemana[w.semana].real += w.real;
    }));
    return Object.values(porSemana)
      .sort((a, b) => a.semana - b.semana)
      .filter((w) => w.metaRealista > MIN_META)
      .map((w) => ({ ...w, pctAlcance: (w.real / w.metaRealista) * 100 }));
  }, [filasEjecucionVisibles]);

  const semanasMostrar = filaSel
    ? filaSel.metasSemanales.filter((w) => w.metaRealista > MIN_META)
    : semanasAgregadas;
  const metaGlobalOptimista = filaSel ? filaSel.puntoProyOptimista : filasEjecucionVisibles.reduce((a, f) => a + f.puntoProyOptimista, 0);
  const metaGlobalRealista = filaSel ? filaSel.puntoProyRealista : filasEjecucionVisibles.reduce((a, f) => a + f.puntoProyRealista, 0);
  const avanceActual = semanasMostrar.reduce((a, w) => a + w.real, 0);
  const pctGlobal = metaGlobalRealista > 0 ? (avanceActual / metaGlobalRealista) * 100 : null;
  const alcanzadoGlobal = pctGlobal != null && pctGlobal >= 100;
  const colorGlobal = pctGlobal == null ? T.faint : alcanzadoGlobal ? "#10b981" : pctGlobal >= 50 ? "#f0c040" : "#ff6b6b";

  if (loading) return <div className="glass" style={{ padding: "40px", textAlign: "center", color: T.faint, fontSize: "13px" }}>Cargando resumen financiero...</div>;
  if (!filas.length || !ultimoMesCerrado) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ═══ Control de metas y ritmo — pacing en tiempo real ═══ */}
      <div className="glass" style={{ padding: "22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "2px", color: T.sub }}>CONTROL DE METAS Y RITMO · {mesEjecucion ? monthLabelFull(mesEjecucion).toUpperCase() : "—"}</div>
          </div>
          {onVerDetalle && <button className="btn-ghost" style={{ fontSize: "12px" }} onClick={onVerDetalle}>Ver detalle en Finanzas →</button>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {[{ k: "actual", l: "Ver pacing mes actual" }, { k: "seleccionado", l: "Ver pacing mes seleccionado" }].map((o) => (
              <button key={o.k} onClick={() => setModoPacing(o.k)}
                style={{ padding: "5px 11px", fontSize: "11px", fontWeight: 600, borderRadius: "8px", cursor: "pointer", border: `1px solid ${modoPacing === o.k ? "#2721E8" : T.chipBdr}`, background: modoPacing === o.k ? "#2721E822" : "transparent", color: modoPacing === o.k ? (light ? "#2721E8" : "#fff") : T.faint }}>{o.l}</button>
            ))}
          </div>
          {sucNames.length > 1 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["todas", ...sucNames].map((s) => {
                const on = vistaSuc === s;
                const color = s === "todas" ? "#2721E8" : COLORES[s];
                return <button key={s} onClick={() => setVistaSuc(s)}
                  style={{ padding: "4px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "8px", cursor: "pointer", border: `1px solid ${on ? color : T.chipBdr}`, background: on ? `${color}22` : "transparent", color: on ? (light ? color : "#fff") : T.faint }}>{s === "todas" ? "Todas" : s}</button>;
              })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px", marginBottom: "18px" }}>
          <div>
            <div style={{ fontSize: "10px", color: T.faint }}>META REALISTA <span title="Ajustada por temporada + castigo por el sesgo de sobreestimación medido en el backtest" style={{ cursor: "help" }}>ⓘ</span></div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>{fmt(metaGlobalRealista)}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: T.faint }}>META OPTIMISTA <span title="Ajustada por temporada, sin castigo — el techo del rango" style={{ cursor: "help" }}>ⓘ</span></div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: T.muted }}>{fmt(metaGlobalOptimista)}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: T.faint }}>AVANCE ACTUAL</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: colorGlobal }}>{fmt(avanceActual)}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: T.faint }}>% VS. REALISTA</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: colorGlobal }}>{pctGlobal == null ? "—" : `${pctGlobal.toFixed(0)}%`}</div>
          </div>
        </div>
        <div style={{ height: "8px", background: T.div, borderRadius: "4px", marginBottom: "20px" }}>
          <div style={{ width: `${Math.min(pctGlobal || 0, 100)}%`, height: "100%", background: colorGlobal, borderRadius: "4px" }} />
        </div>

        {semanasMostrar.length === 0 ? (
          <div style={{ fontSize: "12px", color: T.faint, textAlign: "center", padding: "12px 0" }}>Sin metas semanales para mostrar.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 150px 90px 70px", gap: "8px", marginBottom: "6px" }}>
              <span /><span />
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>META (REALISTA–OPTIMISTA)</span>
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>REAL</span>
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>%</span>
            </div>
            {semanasMostrar.map((w) => {
              const esFutura = esMesActualReal && semanaActual != null && w.semana > semanaActual;
              const esActual = esMesActualReal && w.semana === semanaActual;
              const alcanzado = w.pctAlcance >= 100;
              const colorBarra = esFutura ? T.chipBdr : alcanzado ? "#10b981" : w.pctAlcance >= 50 ? "#f0c040" : "#ff6b6b";
              return (
                <div key={w.semana} style={{ display: "grid", gridTemplateColumns: "28px 1fr 150px 90px 70px", gap: "8px", alignItems: "center", marginBottom: "7px", padding: esActual ? "5px 6px" : "0", borderRadius: "8px", background: esActual ? "rgba(39,33,232,0.08)" : "transparent", border: esActual ? "1px solid rgba(39,33,232,0.3)" : "none", opacity: esFutura ? 0.5 : 1 }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: esActual ? "#2721E8" : T.muted }}>S{w.semana}</span>
                  <div style={{ height: "6px", background: T.div, borderRadius: "3px" }}>
                    <div style={{ width: `${Math.min(w.pctAlcance, 100)}%`, height: "100%", background: colorBarra, borderRadius: "3px" }} />
                  </div>
                  <span style={{ fontSize: "11px", color: T.faint, textAlign: "right" }}>{fmt(w.metaRealista)} – {fmt(w.metaOptimista)}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: T.muted, textAlign: "right" }}>{fmt(w.real)}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: esFutura ? T.faint : colorBarra, textAlign: "right" }}>{esFutura ? "próxima" : `${w.pctAlcance.toFixed(0)}%`}</span>
                </div>
              );
            })}
          </>
        )}
        {filaSel && (
          <div style={{ fontSize: "10.5px", color: T.faint, marginTop: "10px" }}>
            Metas según {filaSel.usandoPooled ? "promedio de todas las sucursales" : monthLabel(filaSel.mesEjecucionAnioAnt)}.
          </div>
        )}
      </div>
    </div>
  );
}
