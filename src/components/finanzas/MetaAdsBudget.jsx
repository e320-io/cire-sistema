import { useState, useMemo, useEffect } from "react";
import { useT } from "../../lib/theme.jsx";
import { COLORES, fmt, cdmx } from "../../lib/constantes.js";
import { supabase } from "../../lib/supabase.js";
import { indiceEstacionalPooled, backtestWalkForward, proyectar, BASES_CALCULO, siguienteMes } from "./forecast.js";

const BANDA_SANA_ADS = { min: 10, max: 15 };
const MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const monthLabel = (m) => { const [y, mm] = m.split("-"); return `${MESES_LABEL[parseInt(mm, 10) - 1]} ${y.slice(2)}`; };

export default function MetaAdsBudget({ historial, sucVisible, periodo }) {
  const { T } = useT();
  const [vistaRango, setVistaRango] = useState("80");
  const [baseCalculo, setBaseCalculo] = useState("desest");
  const [pctAds, setPctAds] = useState(() => { const o = {}; sucVisible.forEach((s) => { o[s] = 12.5; }); return o; });
  const [guardado, setGuardado] = useState(null); // {mes, porSucursal:{suc:{porcentaje,presupuesto,base_calculo,rango}}}
  const [guardandoSuc, setGuardandoSuc] = useState(null);
  const [msgGuardarSuc, setMsgGuardarSuc] = useState({});

  const mesObjetivo = useMemo(() => siguienteMes(periodo), [periodo]);

  useEffect(() => {
    let activo = true;
    (async () => {
      const { data, error } = await supabase.from("meta_ads_presupuesto").select("*").eq("mes", mesObjetivo);
      if (!activo) return;
      if (!error && data?.length > 0) {
        const porSucursal = {};
        data.forEach((r) => { porSucursal[r.sucursal] = r; });
        setGuardado({ mes: mesObjetivo, porSucursal });
      } else {
        setGuardado(null);
      }
    })();
    return () => { activo = false; };
  }, [mesObjetivo]);

  const guardarSucursal = async (f) => {
    setGuardandoSuc(f.sucursal);
    setMsgGuardarSuc((m) => ({ ...m, [f.sucursal]: "" }));
    try {
      const row = { mes: mesObjetivo, sucursal: f.sucursal, porcentaje: f.pctAds, presupuesto: f.presupuesto, venta_estimada: f.activo.punto, base_calculo: baseCalculo, rango: vistaRango, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("meta_ads_presupuesto").upsert([row], { onConflict: "mes,sucursal" });
      if (error) throw error;
      setGuardado((g) => ({ mes: mesObjetivo, porSucursal: { ...(g?.mes === mesObjetivo ? g.porSucursal : {}), [f.sucursal]: row } }));
      setMsgGuardarSuc((m) => ({ ...m, [f.sucursal]: "✓ Guardado" }));
    } catch (e) {
      setMsgGuardarSuc((m) => ({ ...m, [f.sucursal]: "Error" }));
    }
    setGuardandoSuc(null);
    setTimeout(() => setMsgGuardarSuc((m) => ({ ...m, [f.sucursal]: "" })), 2500);
  };

  // El mes en curso está incompleto y dispara errores absurdos en el modelo
  // (ver Proyeccion.jsx) — solo se usan meses ya cerrados.
  const mesActualReal = useMemo(() => cdmx().slice(0, 7), []);
  const historialCompletos = useMemo(() => historial.filter((r) => r.mes <= periodo && r.mes < mesActualReal), [historial, periodo, mesActualReal]);

  const modelo = useMemo(() => {
    if (!historialCompletos.length) return null;
    const indice = indiceEstacionalPooled(historialCompletos, sucVisible);
    const backtest = backtestWalkForward(historialCompletos, sucVisible, indice);
    const porSucursal = {};
    sucVisible.forEach((suc) => { porSucursal[suc] = proyectar(historialCompletos, suc, mesObjetivo, indice, backtest); });
    return { indice, backtest, porSucursal };
  }, [historialCompletos, sucVisible, mesObjetivo]);

  const filas = useMemo(() => {
    if (!modelo) return [];
    return sucVisible.map((suc) => {
      const p = modelo.porSucursal[suc];
      if (!p) return null;
      const activo = p[baseCalculo];
      const lo = vistaRango === "80" ? activo.lo80 : activo.lo90;
      const hi = vistaRango === "80" ? activo.hi80 : activo.hi90;
      return { sucursal: suc, activo, lo, hi, pctAds: pctAds[suc] ?? 12.5, presupuesto: activo.punto * ((pctAds[suc] ?? 12.5) / 100) };
    }).filter(Boolean).sort((a, b) => b.activo.punto - a.activo.punto);
  }, [modelo, sucVisible, baseCalculo, vistaRango, pctAds]);

  const totalPresupuesto = filas.reduce((a, b) => a + b.presupuesto, 0);
  const totalVenta = filas.reduce((a, b) => a + b.activo.punto, 0);

  if (!modelo) return null;

  return (
    <div className="glass" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>¿Qué % de tu venta invertir en Meta Ads? — {monthLabel(mesObjetivo)}</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {BASES_CALCULO.map((o) => <button key={o.k} onClick={() => setBaseCalculo(o.k)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "11.5px", fontWeight: 600, border: "none", cursor: "pointer", background: baseCalculo === o.k ? "#2721E8" : "transparent", color: baseCalculo === o.k ? "#fff" : T.muted }}>{o.l}</button>)}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginBottom: "14px" }}>
        {[{ k: "80", l: "Rango 80% (P10–P90)" }, { k: "90", l: "Rango 90% (P5–P95)" }].map((o) => <button key={o.k} onClick={() => setVistaRango(o.k)} style={{ padding: "5px 11px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, border: "none", cursor: "pointer", background: vistaRango === o.k ? "#2721E8" : "transparent", color: vistaRango === o.k ? "#fff" : T.faint }}>{o.l}</button>)}
      </div>
      {filas.map((f) => {
        const fuera = f.pctAds < BANDA_SANA_ADS.min || f.pctAds > BANDA_SANA_ADS.max;
        return (
          <div key={f.sucursal} style={{ borderBottom: `1px solid ${T.div}`, paddingBottom: "14px", marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "99px", background: COLORES[f.sucursal] }} />
                <span style={{ fontWeight: 700, fontSize: "13px" }}>{f.sucursal}</span>
                <span style={{ fontSize: "11px", color: T.faint }}>{BASES_CALCULO.find((b) => b.k === baseCalculo).l}: <b style={{ color: T.muted }}>{fmt(f.activo.punto)}</b></span>
              </div>
              <span style={{ fontSize: "11px", color: T.faint }}>recomendado: <b style={{ color: "#2721E8" }}>{BANDA_SANA_ADS.min}%–{BANDA_SANA_ADS.max}%</b></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input type="range" min={0} max={35} step={0.5} value={f.pctAds} onChange={(e) => setPctAds((p) => ({ ...p, [f.sucursal]: Number(e.target.value) }))} style={{ flex: 1, accentColor: fuera ? "#f0c040" : COLORES[f.sucursal] }} />
              <div style={{ width: "55px", textAlign: "right", fontWeight: 700, fontSize: "14px", color: fuera ? "#f0c040" : COLORES[f.sucursal] }}>{f.pctAds.toFixed(1)}%</div>
              <div style={{ width: "1px", height: "26px", background: T.div }} />
              <div style={{ width: "150px", textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: "15px", color: "#2721E8" }}>{fmt(f.presupuesto)}</div>
              </div>
              <div style={{ width: "1px", height: "26px", background: T.div }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                <button onClick={() => guardarSucursal(f)} disabled={guardandoSuc === f.sucursal} style={{ padding: "5px 11px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, border: "none", cursor: guardandoSuc === f.sucursal ? "default" : "pointer", background: "#2721E8", color: "#fff", opacity: guardandoSuc === f.sucursal ? 0.6 : 1, whiteSpace: "nowrap" }}>{guardandoSuc === f.sucursal ? "Guardando…" : "Guardar"}</button>
                {msgGuardarSuc[f.sucursal] && <span style={{ fontSize: "10px", color: msgGuardarSuc[f.sucursal].startsWith("✓") ? "#10b981" : "#ef4444" }}>{msgGuardarSuc[f.sucursal]}</span>}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "10px", borderTop: `2px solid ${T.div}` }}>
        <span style={{ fontWeight: 700, fontSize: "13px" }}>Total presupuesto Meta Ads</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: "17px", color: "#2721E8" }}>{fmt(totalPresupuesto)}</div>
          <div style={{ fontSize: "11px", color: T.faint }}>{totalVenta > 0 ? ((totalPresupuesto / totalVenta) * 100).toFixed(1) : 0}% de {fmt(totalVenta)}</div>
        </div>
      </div>
      {guardado && (
        <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: `1px solid ${T.div}` }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", color: T.faint, marginBottom: "10px", textTransform: "uppercase" }}>
            Presupuesto guardado — {monthLabel(guardado.mes)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {sucVisible.map((suc) => {
              const g = guardado.porSucursal[suc];
              if (!g) return null;
              const escenario = BASES_CALCULO.find((b) => b.k === g.base_calculo)?.l ?? g.base_calculo;
              const rangoLabel = g.rango === "80" ? "P10–P90" : "P5–P95";
              return (
                <div key={suc} style={{ flex: "1 1 180px", minWidth: "160px", padding: "10px 12px", borderRadius: "10px", background: T.hoverBg }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "99px", background: COLORES[suc] }} />
                    <span style={{ fontWeight: 700, fontSize: "12px" }}>{suc}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "#2721E8" }}>{fmt(g.presupuesto)}</div>
                  <div style={{ fontSize: "11px", color: T.faint }}>{Number(g.porcentaje).toFixed(1)}% · {rangoLabel}</div>
                  <div style={{ fontSize: "10.5px", color: T.faint, marginTop: "2px" }}>{escenario}</div>
                  <div style={{ fontSize: "10.5px", color: T.faint, marginTop: "4px", paddingTop: "4px", borderTop: `1px solid ${T.div}` }}>Venta estimada: <b style={{ color: T.muted }}>{fmt(g.venta_estimada)}</b></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
