import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, BarChart, Cell, LabelList,
} from "recharts";
import { supabase } from "../../lib/supabase.js";
import { useT } from "../../lib/theme.jsx";
import { COLORES, fmt, cdmx } from "../../lib/constantes.js";
import { ADS_ESTIMADO, gastoPorPeriodoSuc as gastoPorPeriodoSucDe, periodosReales, refPeriodo as refPeriodoDe, gastoDe as gastoDeDe } from "./utilidad.js";

const MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const monthLabel = (m) => { const [y, mm] = m.split("-"); return `${MESES_LABEL[parseInt(mm, 10) - 1]} ${y.slice(2)}`; };
const fmtPct = (n) => `${n >= 0 ? "+" : ""}${(n || 0).toFixed(1)}%`;
const fmtK = (v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

function marginBand(pct, T) {
  if (pct == null) return { label: "—", color: T.faint };
  if (pct >= 20) return { label: "Sano", color: "#10b981" };
  if (pct >= 5) return { label: "Ajustado", color: "#f0c040" };
  return { label: "En riesgo", color: "#ff6b6b" };
}

const UtilDot = ({ cx, cy, payload }) => {
  if (payload.utilidad == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const color = payload.utilidad >= 0 ? "#10b981" : "#ff6b6b";
  return payload.esReferencia
    ? <circle cx={cx} cy={cy} r={3} fill="none" stroke={color} strokeWidth={1.5} />
    : <circle cx={cx} cy={cy} r={3.2} fill={color} stroke="#fff" strokeWidth={1} />;
};

export default function MesAMes({ historial, sucVisible, periodo }) {
  const { light, T } = useT();
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [incluirUnicos, setIncluirUnicos] = useState(false);
  const [incluirAds, setIncluirAds] = useState(true);
  const [abiertas, setAbiertas] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("gastos_operativos").select("sucursal_id,periodo,categoria,monto,tipo");
      setGastos(data || []);
      setLoading(false);
    })();
  }, []);

  const gastoPorPeriodoSuc = useMemo(() => gastoPorPeriodoSucDe(gastos), [gastos]);
  const periodosRealesPorSuc = useMemo(() => periodosReales(gastoPorPeriodoSuc, sucVisible), [gastoPorPeriodoSuc, sucVisible]);
  const refPeriodo = (suc, per) => refPeriodoDe(periodosRealesPorSuc, suc, per);
  const gastoDe = (suc, perRef) => gastoDeDe(gastoPorPeriodoSuc, suc, perRef, incluirUnicos);

  // El mes en curso está incompleto — se excluye de las opciones para no mostrar
  // "-15,700% de margen" solo porque el mes lleva un día de ventas capturadas. El corte
  // incluye el mes filtrado (a diferencia del mes real en curso, que siempre se excluye).
  const mesActualReal = useMemo(() => cdmx().slice(0, 7), []);
  const historialCerrado = useMemo(() => historial.filter((r) => r.mes <= periodo && r.mes < mesActualReal), [historial, periodo, mesActualReal]);
  const mesesConVenta = useMemo(() => Array.from(new Set(historialCerrado.map((r) => r.mes))).sort(), [historialCerrado]);
  const [mes, setMes] = useState(() => (mesesConVenta.includes(periodo) ? periodo : (mesesConVenta.length ? mesesConVenta[mesesConVenta.length - 1] : periodo)));
  // Sigue al filtro global: si el mes filtrado tiene datos, se muestra ese; si no
  // (ej. el mes más antiguo del histórico), cae al último mes disponible.
  useEffect(() => {
    if (!mesesConVenta.length) return;
    if (mesesConVenta.includes(periodo)) { if (mes !== periodo) setMes(periodo); return; }
    if (!mesesConVenta.includes(mes)) setMes(mesesConVenta[mesesConVenta.length - 1]);
  }, [mesesConVenta, periodo, mes]);
  const idxMes = mesesConVenta.indexOf(mes);

  const filas = useMemo(() => {
    return sucVisible.map((suc) => {
      const row = historialCerrado.find((r) => r.mes === mes);
      const venta = row ? (row[suc] || 0) : 0;
      const noData = venta <= 0;
      const perRef = refPeriodo(suc, mes);
      const esReferencia = perRef !== mes;
      const gastoBase = gastoDe(suc, perRef);
      const ads = incluirAds ? ADS_ESTIMADO.punto : 0;
      const gasto = gastoBase + ads;
      const utilidad = noData ? null : venta - gasto;
      const margenPct = !noData && venta > 0 ? (utilidad / venta) * 100 : null;

      const utilPeor = !noData && incluirAds ? venta - (gastoBase + ADS_ESTIMADO.max) : utilidad;
      const utilMejor = !noData && incluirAds ? venta - (gastoBase + ADS_ESTIMADO.min) : utilidad;

      const primerMes = historialCerrado.filter((r) => (r[suc] || 0) > 0).map((r) => r.mes).sort()[0] || mes;
      const historialSuc = historialCerrado.filter((r) => r.mes >= primerMes && r.mes <= mes).map((r) => {
        const v = r[suc] || 0;
        if (v <= 0) return { mes: r.mes, mesLabel: monthLabel(r.mes), venta: null, utilidad: null };
        const pr = refPeriodo(suc, r.mes);
        const g = gastoDe(suc, pr) + ads;
        return { mes: r.mes, mesLabel: monthLabel(r.mes), venta: v, utilidad: v - g, esReferencia: pr !== r.mes };
      });
      const mesesEnRojo = historialSuc.filter((h) => h.venta > 0 && h.utilidad < 0).length;
      const mesesConDatos = historialSuc.filter((h) => h.utilidad != null).length;

      return { sucursal: suc, noData, venta, gasto, utilidad, margenPct, esReferencia, perRef, utilPeor, utilMejor, historialSuc, mesesEnRojo, mesesConDatos };
    }).sort((a, b) => (b.margenPct ?? -999) - (a.margenPct ?? -999));
  }, [mes, sucVisible, historialCerrado, gastoPorPeriodoSuc, incluirUnicos, incluirAds]);

  const filasConDatos = filas.filter((f) => !f.noData);
  const totales = useMemo(() => {
    const venta = filasConDatos.reduce((a, b) => a + b.venta, 0);
    const gasto = filasConDatos.reduce((a, b) => a + b.gasto, 0);
    const utilidad = venta - gasto;
    return { venta, gasto, utilidad, margenPct: venta > 0 ? (utilidad / venta) * 100 : 0 };
  }, [filasConDatos]);

  const toggleAbierta = (s) => setAbiertas((p) => ({ ...p, [s]: !p[s] }));
  const chartRanking = filasConDatos.map((f) => ({ sucursal: f.sucursal, margenPct: f.margenPct != null ? Number(f.margenPct.toFixed(1)) : 0 }));

  if (loading) return <div className="glass" style={{ padding: "40px", textAlign: "center", color: T.faint, fontSize: "13px" }}>Cargando gastos operativos...</div>;
  if (!mesesConVenta.length) return <div className="glass" style={{ padding: "40px", textAlign: "center", color: T.faint, fontSize: "13px" }}>Sin historial de ventas cerrado hasta {monthLabel(periodo)}.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div className="glass" style={{ padding: "18px 22px", display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: "260px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", color: T.faint, letterSpacing: "1px" }}>MES</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#2721E8" }}>{monthLabel(mes)}</span>
          </div>
          <input type="range" min={0} max={mesesConVenta.length - 1} step={1} value={idxMes < 0 ? mesesConVenta.length - 1 : idxMes}
            onChange={(e) => setMes(mesesConVenta[Number(e.target.value)])} style={{ width: "100%" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={incluirUnicos} onChange={(e) => setIncluirUnicos(e.target.checked)} />
          Incluir gastos únicos (equipo/cursos/campañas)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={incluirAds} onChange={(e) => setIncluirAds(e.target.checked)} />
          Incluir estimado Meta Ads ({fmt(ADS_ESTIMADO.min)}–{fmt(ADS_ESTIMADO.max)})
        </label>
        <div className="kpi" style={{ minWidth: "200px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: T.sub }}>UTILIDAD COMBINADA</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: totales.utilidad >= 0 ? "#10b981" : "#ff6b6b" }}>{fmt(totales.utilidad)}</div>
          <div style={{ fontSize: "11px", color: T.faint }}>margen {fmtPct(totales.margenPct)} sobre {fmt(totales.venta)}</div>
        </div>
      </div>

      <div className="glass" style={{ padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "2px" }}>Margen de utilidad por sucursal — {monthLabel(mes)}</div>
        <div style={{ fontSize: "11px", color: T.faint, marginBottom: "10px" }}>% de utilidad sobre ventas del mes seleccionado</div>
        <ResponsiveContainer width="100%" height={Math.max(140, chartRanking.length * 42)}>
          <BarChart data={chartRanking} layout="vertical" margin={{ left: 10, right: 40, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.div} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: T.faint }} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="sucursal" tick={{ fontSize: 13, fill: T.muted, fontWeight: 600 }} width={80} />
            <Tooltip formatter={(v) => [`${v}%`, "Margen"]} />
            <Bar dataKey="margenPct" radius={[0, 6, 6, 0]} barSize={22}>
              {chartRanking.map((d, i) => <Cell key={i} fill={d.margenPct >= 0 ? "#10b981" : "#ff6b6b"} />)}
              <LabelList dataKey="margenPct" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 12, fontWeight: 600, fill: T.muted }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: "13px", fontWeight: 700 }}>Estado de resultados por sucursal — {monthLabel(mes)}</div>
      {filas.map((f, idx) => {
        if (f.noData) {
          return <div key={f.sucursal} className="glass" style={{ padding: "16px", display: "flex", justifyContent: "space-between", opacity: 0.5 }}>
            <span style={{ fontWeight: 700 }}>{f.sucursal}</span>
            <span style={{ fontSize: "12px", color: T.faint, fontStyle: "italic" }}>sin ventas capturadas en {monthLabel(mes)}</span>
          </div>;
        }
        const band = marginBand(f.margenPct, T);
        const open = !!abiertas[f.sucursal];
        return (
          <div key={f.sucursal} className="glass" style={{ overflow: "hidden" }}>
            <button onClick={() => toggleAbierta(f.sucursal)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "8px", background: COLORES[f.sucursal] || "#2721E8", color: "#fff", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: light ? "#1a1a2e" : "#fff" }}>{f.sucursal}{f.esReferencia && <span style={{ marginLeft: "8px", fontSize: "10px", fontWeight: 700, color: "#f0c040", background: "rgba(240,192,64,0.15)", padding: "2px 7px", borderRadius: "99px" }}>gasto de referencia</span>}{!f.esReferencia && <span style={{ marginLeft: "8px", fontSize: "10px", fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.12)", padding: "2px 7px", borderRadius: "99px" }}>★ mes real</span>}</div>
                  <div style={{ fontSize: "11px", color: T.faint }}>{fmt(f.venta)} venta · {f.mesesEnRojo}/{f.mesesConDatos} meses en rojo (histórico)</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: band.color, background: `${band.color}22`, padding: "3px 9px", borderRadius: "99px" }}>{band.label} · {fmtPct(f.margenPct)}</span>
                <span style={{ fontSize: "15px", fontWeight: 700, color: f.utilidad >= 0 ? "#10b981" : "#ff6b6b", minWidth: "110px", textAlign: "right" }}>{fmt(f.utilidad)}</span>
              </div>
            </button>
            {open && <div style={{ borderTop: `1px solid ${T.div}`, padding: "18px" }}>
              {incluirAds && f.utilPeor !== f.utilMejor && <div style={{ background: "rgba(240,192,64,0.1)", borderRadius: "10px", padding: "12px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#f0c040", fontWeight: 700, marginBottom: "4px" }}>RANGO POR EL GASTO ESTIMADO EN ADS</div>
                <div style={{ fontSize: "12px", color: T.muted }}>{fmt(f.utilPeor)} — {fmt(f.utilMejor)}</div>
                {f.utilPeor < 0 && f.utilMejor >= 0 && <div style={{ fontSize: "11.5px", color: "#ff6b6b", marginTop: "4px", fontWeight: 600 }}>El signo cambia dentro de la banda: no se puede afirmar si {monthLabel(mes)} salió en negro o en rojo sin el gasto real de Meta Ads.</div>}
              </div>}
              <div style={{ fontSize: "11px", fontWeight: 700, color: T.sub, marginBottom: "8px" }}>VENTA VS. UTILIDAD — HISTÓRICO</div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={f.historialSuc} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.div} vertical={false} />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 10, fill: T.faint }} interval={Math.max(1, Math.ceil(f.historialSuc.length / 14))} />
                  <YAxis tick={{ fontSize: 10, fill: T.faint }} tickFormatter={fmtK} width={40} />
                  <ReferenceLine y={0} stroke={T.div} />
                  <Tooltip formatter={(v, n) => [fmt(v), n === "venta" ? "Venta" : "Utilidad"]} />
                  <Bar dataKey="venta" fill={COLORES[f.sucursal] || "#2721E8"} fillOpacity={0.25} radius={[3, 3, 0, 0]} barSize={f.historialSuc.length > 40 ? 4 : 10} />
                  <Line dataKey="utilidad" stroke={light ? "#1a1a2e" : "#fff"} strokeWidth={1.6} dot={<UtilDot />} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: "14px", marginTop: "6px", fontSize: "10.5px", color: T.faint, flexWrap: "wrap" }}>
                <span>● utilidad de mes con gasto real</span>
                <span>○ utilidad con gasto de referencia (mes sin captura completa)</span>
              </div>
            </div>}
          </div>
        );
      })}
    </div>
  );
}
