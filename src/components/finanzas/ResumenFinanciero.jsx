import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { fetchZettleRaw, fetchHistorialMensualCacheado } from "../../lib/zettle.js";
import { useT } from "../../lib/theme.jsx";
import { COLORES, SUCURSALES_NAMES, fmt, cdmx } from "../../lib/constantes.js";
import { indiceEstacionalPooled, backtestWalkForward, proyectar, siguienteMes } from "./forecast.js";
import { ADS_ESTIMADO, gastoPorSucCategoria, gastoUnicoPorSucPeriodo, gastoBaseDe } from "./utilidad.js";
import { distribucionSemanalPooled, distribucionSemanalMes, diasEnMes, mesAnioAnterior, ventasPorSemanaSuc, bucketSemana, rangoSemana } from "./semanal.js";

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
  const [hoverArrastre, setHoverArrastre] = useState(null); // semana con el desglose de arrastre abierto al hover
  const [hoverMetaLinea, setHoverMetaLinea] = useState(null); // "piso" | "techo" | null — línea de meta con tooltip abierto en la gráfica año-con-año
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

  const gastoPorSucCat = useMemo(() => gastoPorSucCategoria(gastos), [gastos]);
  const gastoUnicoPorSucPer = useMemo(() => gastoUnicoPorSucPeriodo(gastos), [gastos]);

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

      const { total: gastoBase, esReferencia } = gastoBaseDe(gastoPorSucCat, gastoUnicoPorSucPer, suc, ultimoMesCerrado, false);
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
  }, [modelo, ultimoMesCerrado, mesAnterior, historialCerrado, gastoPorSucCat, gastoUnicoPorSucPer, mesObjetivo]);

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

  // ═══ Venta real histórica para el mismo mes/vista del pacing: mes anterior inmediato
  // y este mismo mes calendario en cada uno de los últimos 3 años — para dar contexto
  // de "¿cómo veníamos?" además de la meta proyectada.
  const ventaMesPara = (mes, suc) => {
    const row = historial.find((r) => r.mes === mes);
    if (!row) return null;
    return suc ? row[suc] || 0 : sucNames.reduce((a, s) => a + (row[s] || 0), 0);
  };
  const mesEjecucionPrevio = useMemo(() => {
    if (!mesEjecucion) return null;
    const [y, m] = mesEjecucion.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [mesEjecucion]);
  // Últimos 2 años cerrados del mismo mes calendario — el 3er lugar de la gráfica
  // lo ocupa este año (mesEjecucion), no un año más viejo: ver semanasMostrar más abajo.
  const mesesHistoricos = useMemo(() => {
    if (!mesEjecucion) return [];
    const [y, m] = mesEjecucion.split("-");
    return [2, 1].map((n) => `${Number(y) - n}-${m}`);
  }, [mesEjecucion]);
  const nombreMesEjecucion = mesEjecucion ? MESES_FULL[parseInt(mesEjecucion.split("-")[1], 10) - 1] : "";

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

  const semanasBase = filaSel
    ? filaSel.metasSemanales.filter((w) => w.metaRealista > MIN_META)
    : semanasAgregadas;

  // Lo no alcanzado en una semana YA CERRADA se arrastra como saldo pendiente a la
  // meta de la siguiente semana (solo cuando hay déficit — un excedente no "presta" a
  // la semana siguiente). Semana en curso y futuras no arrastran hacia adelante porque
  // su resultado aún no está definido; solo heredan el arrastre ya generado antes de ellas.
  const closedUpTo = esMesActualReal && semanaActual != null ? semanaActual - 1 : Infinity;
  const semanasMostrar = useMemo(() => {
    let arrastreR = 0, arrastreO = 0;
    return semanasBase.map((w) => {
      const metaPropiaRealista = w.metaRealista;
      const metaPropiaOptimista = w.metaOptimista;
      const metaRealista = metaPropiaRealista + arrastreR;
      const metaOptimista = metaPropiaOptimista + arrastreO;
      const pctAlcance = metaRealista > 0 ? (w.real / metaRealista) * 100 : null;
      const fila = { ...w, metaPropiaRealista, metaPropiaOptimista, arrastreRealista: arrastreR, arrastreOptimista: arrastreO, metaRealista, metaOptimista, pctAlcance };
      if (w.semana <= closedUpTo) {
        arrastreR = Math.max(0, metaRealista - w.real);
        arrastreO = Math.max(0, metaOptimista - w.real);
      }
      return fila;
    });
  }, [semanasBase, closedUpTo]);
  const metaGlobalOptimista = filaSel ? filaSel.puntoProyOptimista : filasEjecucionVisibles.reduce((a, f) => a + f.puntoProyOptimista, 0);
  const metaGlobalRealista = filaSel ? filaSel.puntoProyRealista : filasEjecucionVisibles.reduce((a, f) => a + f.puntoProyRealista, 0);
  const avanceActual = semanasMostrar.reduce((a, w) => a + w.real, 0);
  const pctGlobal = metaGlobalRealista > 0 ? (avanceActual / metaGlobalRealista) * 100 : null;
  const alcanzadoGlobal = pctGlobal != null && pctGlobal >= 100;
  const colorGlobal = pctGlobal == null ? T.faint : alcanzadoGlobal ? "#10b981" : pctGlobal >= 50 ? "#f0c040" : "#ff6b6b";

  // Mismo mes calendario en los últimos 2 años cerrados + este año (mesEjecucion) al
  // final — si sigue en curso, no es una barra sólida más: se marca el piso/techo de
  // la meta (realista–optimista) y se va pintando lo vendido hasta ahora dentro de ese rango.
  const historicoAnios = useMemo(() => {
    const previos = mesesHistoricos.map((m) => ({ mes: m, anio: Number(m.slice(0, 4)), val: ventaMesPara(m, filaSel?.sucursal), esActual: false }));
    const actual = mesEjecucion ? { mes: mesEjecucion, anio: Number(mesEjecucion.slice(0, 4)), val: avanceActual, esActual: true } : null;
    const anios = actual ? [...previos, actual] : previos;
    return anios.map((a, i) => {
      const prev = i > 0 ? anios[i - 1] : null;
      // Si el año actual sigue en curso, su venta es parcial — no se compara contra
      // un mes ya cerrado, sería comparar peras con manzanas.
      const pctVar = a.esActual && esMesActualReal ? null : (prev && prev.val > 0 && a.val != null ? ((a.val - prev.val) / prev.val) * 100 : null);
      return { ...a, pctVar };
    });
  }, [mesesHistoricos, historial, filaSel?.sucursal, mesEjecucion, avanceActual, esMesActualReal]);

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
            <div style={{ display: "grid", gridTemplateColumns: "28px 82px 1fr 190px 90px 70px", gap: "8px", marginBottom: "6px" }}>
              <span /><span />
              <span />
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>META (REALISTA–OPTIMISTA)</span>
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>REAL</span>
              <span style={{ fontSize: "9px", color: T.faint, textAlign: "right" }}>%</span>
            </div>
            {semanasMostrar.map((w) => {
              const esFutura = esMesActualReal && semanaActual != null && w.semana > semanaActual;
              const esActual = esMesActualReal && w.semana === semanaActual;
              const alcanzado = w.pctAlcance >= 100;
              const colorBarra = esFutura ? T.chipBdr : alcanzado ? "#10b981" : w.pctAlcance >= 50 ? "#f0c040" : "#ff6b6b";
              const rango = mesEjecucion ? rangoSemana(mesEjecucion, w.semana) : null;
              // Semanas futuras del mes en curso no muestran el arrastre todavía: depende de
              // cómo cierre la semana actual, que aún no se sabe. Solo se ve en la semana
              // actual/pasadas, o en cualquier semana de un mes ya cerrado (ahí no hay incertidumbre).
              const conArrastreVisible = w.arrastreRealista > MIN_META && (!esFutura);
              return (
                <div key={w.semana} style={{ display: "grid", gridTemplateColumns: "28px 82px 1fr 190px 90px 70px", gap: "8px", alignItems: "center", marginBottom: "7px", padding: esActual ? "5px 6px" : "0", borderRadius: "8px", background: esActual ? "rgba(39,33,232,0.08)" : "transparent", border: esActual ? "1px solid rgba(39,33,232,0.3)" : "none", opacity: esFutura ? 0.5 : 1 }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: esActual ? "#2721E8" : T.muted }}>S{w.semana}</span>
                  <span style={{ fontSize: "10.5px", color: T.faint }}>{rango ? `${rango.desde}–${rango.hasta} ${MESES_LABEL[parseInt(mesEjecucion.split("-")[1], 10) - 1]}` : "—"}</span>
                  <div style={{ height: "6px", background: T.div, borderRadius: "3px" }}>
                    <div style={{ width: `${Math.min(w.pctAlcance, 100)}%`, height: "100%", background: colorBarra, borderRadius: "3px" }} />
                  </div>
                  <div style={{ textAlign: "right", position: "relative" }}
                    onMouseEnter={() => conArrastreVisible && setHoverArrastre(w.semana)}
                    onMouseLeave={() => setHoverArrastre(null)}
                  >
                    {conArrastreVisible ? (
                      <div style={{ fontSize: "11px", fontWeight: 700, color: T.muted, cursor: "help" }}>
                        {fmt(w.metaRealista)} – {fmt(w.metaOptimista)} <span style={{ fontSize: "9px", fontWeight: 400, color: light ? "#b45309" : "#f0c040" }}>ⓘ</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: T.faint }}>{fmt(w.metaPropiaRealista)} – {fmt(w.metaPropiaOptimista)}</div>
                    )}
                    {conArrastreVisible && hoverArrastre === w.semana && (
                      <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 8px)", zIndex: 20, minWidth: "230px", background: light ? "#fff" : "#22264A", border: `1px solid ${T.chipBdr}`, boxShadow: "0 10px 28px rgba(0,0,0,0.22)", borderRadius: "10px", padding: "10px 12px", fontSize: "11.5px", lineHeight: 1.7, textAlign: "left", whiteSpace: "nowrap", color: light ? "#1a1a2e" : "#fff" }}>
                        <div>Le tocaba esta semana: <b>{fmt(w.metaPropiaRealista)} – {fmt(w.metaPropiaOptimista)}</b></div>
                        <div>+ Traíamos de antes: <b style={{ color: light ? "#b45309" : "#f0c040" }}>{fmt(w.arrastreRealista)} – {fmt(w.arrastreOptimista)}</b></div>
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: T.muted, textAlign: "right" }}>{fmt(w.real)}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: esFutura ? T.faint : colorBarra, textAlign: "right" }}>{esFutura ? "próxima" : `${w.pctAlcance.toFixed(0)}%`}</span>
                </div>
              );
            })}
          </>
        )}
        {semanasMostrar.some((w) => w.arrastreRealista > MIN_META) && (
          <div style={{ fontSize: "10.5px", color: light ? "#b45309" : "#f0c040", fontWeight: 600, marginTop: "10px" }}>
            ⓘ Lo no alcanzado en una semana se suma a la meta de la siguiente.
          </div>
        )}
        {filaSel && (
          <div style={{ fontSize: "10.5px", color: T.faint, marginTop: "10px" }}>
            Metas según {filaSel.usandoPooled ? "promedio de todas las sucursales" : monthLabel(filaSel.mesEjecucionAnioAnt)}.
          </div>
        )}

        {/* ═══ Venta real: mes anterior inmediato + este mismo mes en los últimos 3 años ═══ */}
        <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: `1px solid ${T.div}` }}>
          <div style={{ fontSize: "10px", letterSpacing: "1.5px", color: T.faint, marginBottom: "10px" }}>VENTA REAL · COMPARATIVO HISTÓRICO {filaSel ? `· ${filaSel.sucursal}` : ""}</div>
          <div style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "9px", color: T.faint }}>MES ANTERIOR{mesEjecucionPrevio ? ` · ${monthLabel(mesEjecucionPrevio).toUpperCase()}` : ""}</div>
            <div style={{ fontSize: "17px", fontWeight: 700, marginTop: "3px" }}>{mesEjecucionPrevio ? fmt(ventaMesPara(mesEjecucionPrevio, filaSel?.sucursal)) : "—"}</div>
          </div>

          <div style={{ fontSize: "9px", color: T.faint, marginBottom: "10px" }}>{nombreMesEjecucion.toUpperCase()} · AÑO CON AÑO <span style={{ fontWeight: 400 }}>(% variación vs. año anterior · el de {mesEjecucion ? mesEjecucion.slice(0, 4) : "este año"} muestra la meta realista–optimista y lo vendido hasta ahora)</span></div>
          {(() => {
            const colorBar = filaSel ? COLORES[filaSel.sucursal] : "#2721E8";
            const maxVal = Math.max(...historicoAnios.map((a) => a.val || 0), metaGlobalOptimista || 0, 1);
            const CHART_H = 90;
            // Venta del año pasado (mismo mes calendario) para comparar cada meta contra ella.
            const anioPasadoVal = historicoAnios.length >= 2 ? historicoAnios[historicoAnios.length - 2].val : null;
            const pctVarDe = (meta) => (anioPasadoVal > 0 && meta != null ? ((meta - anioPasadoVal) / anioPasadoVal) * 100 : null);
            return (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: `${CHART_H + 56}px` }}>
                {historicoAnios.map((a, i) => {
                  const pctColor = a.pctVar == null ? T.faint : a.pctVar >= 0 ? "#10b981" : "#ff6b6b";
                  const esActualEnCurso = a.esActual && esMesActualReal;
                  if (esActualEnCurso) {
                    const pisoH = Math.min((metaGlobalRealista / maxVal) * CHART_H, CHART_H);
                    const techoH = Math.min((metaGlobalOptimista / maxVal) * CHART_H, CHART_H);
                    const ventaH = Math.min((a.val / maxVal) * CHART_H, CHART_H);
                    return (
                      <div key={a.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                        <div style={{ fontSize: "9px", color: T.faint, marginBottom: "4px", height: "14px" }}>{fmt(metaGlobalRealista)}–{fmt(metaGlobalOptimista)}</div>
                        <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: colorGlobal }}>{fmt(a.val)}</div>
                        <div style={{ position: "relative", width: "60%", maxWidth: "56px", height: `${CHART_H}px`, cursor: "help" }}
                          onMouseEnter={() => setHoverMetaLinea("bar")}
                          onMouseLeave={() => setHoverMetaLinea(null)}
                        >
                          <div style={{ position: "absolute", inset: 0, background: T.div, borderRadius: "4px 4px 0 0", overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, right: 0, bottom: `${ventaH}px`, height: `${Math.max(techoH - ventaH, 0)}px`, background: `${colorGlobal}1a` }} />
                            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${ventaH}px`, background: colorGlobal, borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                          </div>
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${pisoH}px`, borderTop: `2px dashed ${T.muted}` }} />
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${techoH}px`, borderTop: `2px dashed ${T.faint}` }} />
                          {hoverMetaLinea === "bar" && (() => {
                            const pctVarR = pctVarDe(metaGlobalRealista);
                            const pctVarO = pctVarDe(metaGlobalOptimista);
                            const colorDe = (p) => (p == null ? T.faint : p >= 0 ? "#10b981" : "#ff6b6b");
                            const textoDe = (p) => (p == null ? "sin dato del año pasado" : `${p >= 0 ? "↑" : "↓"} ${Math.abs(p).toFixed(0)}% vs. año pasado`);
                            return (
                              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: `${Math.max(pisoH, techoH) + 14}px`, zIndex: 20, whiteSpace: "nowrap", background: light ? "#fff" : "#22264A", border: `1px solid ${T.chipBdr}`, boxShadow: "0 10px 28px rgba(0,0,0,0.22)", borderRadius: "8px", padding: "9px 12px", fontSize: "11.5px", fontWeight: 600, color: light ? "#1a1a2e" : "#fff", textAlign: "left" }}>
                                <div>Meta optimista: {fmt(metaGlobalOptimista)}</div>
                                <div style={{ color: colorDe(pctVarO), fontWeight: 400, marginBottom: "6px" }}>{textoDe(pctVarO)}</div>
                                <div>Meta realista: {fmt(metaGlobalRealista)}</div>
                                <div style={{ color: colorDe(pctVarR), fontWeight: 400 }}>{textoDe(pctVarR)}</div>
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ fontSize: "10px", color: T.faint, marginTop: "6px" }}>{a.anio} (en curso)</div>
                      </div>
                    );
                  }
                  const barH = a.val ? Math.max((a.val / maxVal) * CHART_H, 3) : 0;
                  return (
                    <div key={a.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: 700, color: pctColor, marginBottom: "4px", height: "14px" }}>
                        {i > 0 && a.pctVar != null ? `${a.pctVar >= 0 ? "↑" : "↓"} ${Math.abs(a.pctVar).toFixed(0)}%` : ""}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>{a.val == null ? "—" : fmt(a.val)}</div>
                      <div style={{ width: "60%", maxWidth: "56px", height: `${barH}px`, background: colorBar, opacity: 0.5 + (0.5 * (i + 1)) / historicoAnios.length, borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                      <div style={{ fontSize: "10px", color: T.faint, marginTop: "6px" }}>{a.anio}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
