import { useState, useEffect, useMemo, useCallback } from "react";
import { LineChart, Line, ReferenceDot, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useT } from "../../lib/theme.jsx";
import { fetchZettleRaw } from "../../lib/zettle.js";
import { supabase } from "../../lib/supabase.js";

const REFRESCO_MS = 5 * 60 * 1000; // se re-sincroniza solo con Zettle cada 5 min
const COLORES_ANIO = ["#cfc9be", "#a8a398", "#6f86b3", "#0f766e"]; // del más viejo al año en curso: grises → azul (año pasado) → verde fuerte (actual)
const GROSOR = [1.3, 1.5, 2.2, 3.6];
const DASH = ["4 3", undefined, undefined, undefined];
const k$ = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const $ = (n) => `$${Math.round(n).toLocaleString("es-MX")}`;

// mesY/mesM: mes del selector de periodo del Resumen. hoy: "YYYY-MM-DD" (CDMX).
export default function VentasDiaMes({ mesY, mesM, hoy }) {
  const { T, light } = useT();
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizado, setActualizado] = useState(null);
  const [acum, setAcum] = useState(false);
  const [tickMode, setTickMode] = useState(false);
  const [suc, setSuc] = useState("Todas");
  const [foco, setFoco] = useState(null); // año resaltado al pasar el cursor por la leyenda

  const mm = String(mesM).padStart(2, "0");
  const nombreMes = new Date(mesY, mesM - 1, 1).toLocaleDateString("es-MX", { month: "long" });
  const anios = [mesY - 3, mesY - 2, mesY - 1, mesY];
  const diasMes = new Date(mesY, mesM, 0).getDate();

  const cargar = useCallback(async () => {
    try {
      const fin = String(diasMes).padStart(2, "0");
      // Años anteriores: de la tabla `tickets` (ya guardada, no depende del límite de 3 años de Zettle).
      const historicos = [];
      for (const a of [mesY - 3, mesY - 2, mesY - 1]) {
        for (let desde = 0; ; desde += 1000) {
          const { data: filas, error } = await supabase.from("tickets")
            .select("fecha,sucursal_nombre,total")
            .eq("fuente", "zettle") // sin las copias manuales: igual que el Comparativo de sucursales
            .gte("fecha", `${a}-${mm}-01`).lte("fecha", `${a}-${mm}-${fin}`)
            .order("fecha").range(desde, desde + 999);
          if (error || !filas?.length) break;
          historicos.push(...filas.map((t) => ({ fecha: t.fecha, sucursal: t.sucursal_nombre, total: t.total })));
          if (filas.length < 1000) break;
        }
      }
      // Año en curso: en vivo desde Zettle (el cron de sync está desactivado, `tickets` puede ir atrasada).
      let actual = [];
      try { actual = await fetchZettleRaw(`${mesY}-${mm}-01`, `${mesY}-${mm}-${fin}`); } catch {}
      if (!actual.length) {
        const { data: filas } = await supabase.from("tickets").select("fecha,sucursal_nombre,total")
          .eq("fuente", "zettle")
          .gte("fecha", `${mesY}-${mm}-01`).lte("fecha", `${mesY}-${mm}-${fin}`).limit(1000);
        actual = (filas || []).map((t) => ({ fecha: t.fecha, sucursal: t.sucursal_nombre, total: t.total }));
      }
      setTickets([...historicos, ...actual].filter((t) => t.fecha && t.fecha.slice(5, 7) === mm));
      setActualizado(new Date());
    } finally {
      setCargando(false);
    }
  }, [mesY, mm, diasMes]);

  useEffect(() => {
    setCargando(true);
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    const onVis = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [cargar]);

  const sucursales = useMemo(() => [...new Set(tickets.map((t) => t.sucursal))].filter(Boolean).sort(), [tickets]);

  // Series por año: arreglo [{dia, [año]: valor}]
  const { data, series, resumen } = useMemo(() => {
    const porAnio = {};
    anios.forEach((a) => { porAnio[a] = { vals: Array(diasMes + 1).fill(0), tiene: false, ultimo: 0 }; });
    tickets.forEach((t) => {
      if (suc !== "Todas" && t.sucursal !== suc) return;
      const a = Number(t.fecha.slice(0, 4));
      if (!porAnio[a]) return;
      const d = Number(t.fecha.slice(8, 10));
      porAnio[a].vals[d] += tickMode ? 1 : Number(t.total) || 0;
      porAnio[a].tiene = true;
      porAnio[a].ultimo = Math.max(porAnio[a].ultimo, d);
    });
    const hoyMes = hoy.slice(0, 7) === `${mesY}-${mm}`;
    const limiteActual = hoyMes ? Number(hoy.slice(8, 10)) : diasMes;
    const series = anios.filter((a) => porAnio[a].tiene);
    const data = [];
    for (let d = 1; d <= diasMes; d++) {
      const row = { dia: d };
      series.forEach((a) => {
        if (a === mesY && d > limiteActual) return; // el año en curso corta en el último día con datos
        let v = porAnio[a].vals[d];
        if (acum) v = porAnio[a].vals.slice(1, d + 1).reduce((s, x) => s + x, 0);
        row[a] = v;
      });
      data.push(row);
    }
    // Resumen (siempre sobre el acumulado): día de corte, comparación contra cada año y cierre estimado
    const cum = {};
    anios.forEach((a) => { let r = 0; cum[a] = porAnio[a].vals.map((v, d) => (d === 0 ? 0 : (r += v))); });
    const diaCorte = Math.min(limiteActual, porAnio[mesY].ultimo || 0);
    const comps = [mesY - 1, mesY - 2, mesY - 3].filter((a) => porAnio[a].tiene && cum[a][diaCorte] > 0)
      .map((a) => ({ a, v: cum[a][diaCorte], pct: ((cum[mesY][diaCorte] - cum[a][diaCorte]) / cum[a][diaCorte]) * 100, cierre: cum[a][diasMes] }));
    let proy = null;
    if (hoyMes && diaCorte >= 5 && comps.length) {
      const ratios = comps.map((c) => c.cierre / c.v);
      proy = cum[mesY][diaCorte] * (ratios.reduce((x, y) => x + y, 0) / ratios.length);
    }
    return { data, series, resumen: { diaCorte, actual: cum[mesY][diaCorte], comps, proy, hoyMes }, cum };
  }, [tickets, suc, acum, tickMode, mesY, mm, diasMes, hoy]);

  const fmtVal = (v) => (tickMode ? `${Math.round(v)}` : $(v));
  const fmtCorto = (v) => (tickMode ? `${Math.round(v)}` : k$(v));
  const mesCorto = nombreMes.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
  const signo = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(0)}%`;
  const colorPct = (n) => (n >= 0 ? "#10b981" : "#ef4444");

  const TooltipComp = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const porA = {}; payload.forEach((p) => { porA[p.dataKey] = p.value; });
    const orden = [...series].reverse().filter((a) => porA[a] != null);
    const ref = porA[mesY - 1];
    return (
      <div style={{ background: "#fff", border: `1px solid ${T.div}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, boxShadow: "0 4px 14px rgba(0,0,0,.12)", color: "#1a1a2e" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Día {label}{acum ? " · acumulado" : ""}</div>
        {orden.map((a) => (
          <div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 18, fontWeight: a === mesY ? 700 : 400, padding: "1px 0" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORES_ANIO[anios.indexOf(a)] }} />{mesCorto} {a}
            </span>
            <span>
              {fmtVal(porA[a])}
              {a === mesY && ref > 0 && <span style={{ color: colorPct(porA[a] - ref), marginLeft: 8 }}>{signo(((porA[a] - ref) / ref) * 100)} vs {mesY - 1}</span>}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Etiqueta directa al final de la línea: a la derecha del último punto, con contorno para no confundirse con otras líneas
  const etiqueta = (a, texto) => ({ viewBox }) => {
    if (!viewBox) return null;
    const actual = a === mesY;
    return (
      <text x={viewBox.x + 10} y={viewBox.y} dy={4} fontSize={actual ? 12.5 : 11} fontWeight={actual ? 700 : 500}
        fill={COLORES_ANIO[anios.indexOf(a)]} stroke={light ? "#faf9f6" : "#12121a"} strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
        {texto}
      </text>
    );
  };

  return (
    <div className="glass" style={{ padding: "22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>Ventas día a día de cada {nombreMes}</div>
        <div style={{ fontSize: "11px", color: T.faint }}>
          {cargando && !actualizado ? "Sincronizando con Zettle…" : actualizado ? `Zettle · actualizado ${actualizado.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · se actualiza solo` : ""}
        </div>
      </div>
      <div style={{ fontSize: "12.5px", color: T.sub, margin: "6px 0 14px" }}>
        Ventas por día del mes: años anteriores desde el historial guardado y el año en curso en vivo desde Zettle. El año en curso llega hasta el último día con datos. Elige una sucursal o todas, y cambia entre el día suelto y el acumulado, y entre pesos y tickets.
      </div>
      {resumen.actual > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 18px", padding: "12px 14px", marginBottom: "14px", borderRadius: "10px", background: "rgba(15,118,110,0.07)", border: "1px solid rgba(15,118,110,0.18)" }}>
          <span style={{ fontSize: "13px", color: T.sub }}>
            {resumen.hoyMes ? `Al día ${resumen.diaCorte} llevas` : `${mesCorto} ${mesY} cerró en`}{" "}
            <b style={{ fontSize: "22px", color: "#0f766e" }}>{fmtVal(resumen.actual)}</b>
          </span>
          {resumen.comps.map((c) => (
            <span key={c.a} style={{ fontSize: "13px", color: T.sub }}>
              <b style={{ color: colorPct(c.pct) }}>{signo(c.pct)}</b> vs {c.a} <span style={{ color: T.faint }}>({fmtVal(c.v)})</span>
            </span>
          ))}
          {resumen.proy != null && (
            <span style={{ fontSize: "13px", color: T.sub }}>· ritmo de cierre ≈ <b style={{ color: T.text }}>{fmtVal(resumen.proy)}</b></span>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div style={grupo}>
          <button style={btn(!acum)} onClick={() => setAcum(false)}>Por día</button>
          <button style={btn(acum)} onClick={() => setAcum(true)}>Acumulado</button>
        </div>
        <div style={grupo}>
          <button style={btn(!tickMode)} onClick={() => setTickMode(false)}>Ventas ($)</button>
          <button style={btn(tickMode)} onClick={() => setTickMode(true)}>Tickets</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
        <span style={{ fontSize: "12px", color: T.sub }}>Sucursal:</span>
        {["Todas", ...sucursales].map((s) => (
          <button key={s} onClick={() => setSuc(s)} style={{
            padding: "6px 16px", borderRadius: "99px", fontSize: "13px", cursor: "pointer",
            border: `1px solid ${T.div}`, background: suc === s ? "#111" : "transparent", color: suc === s ? "#fff" : T.text,
          }}>{s}</button>
        ))}
      </div>
      <div style={{ height: 340 }}>
        {series.length === 0 ? (
          <div style={{ color: T.faint, fontSize: "13px", padding: "40px 0", textAlign: "center" }}>{cargando ? "Cargando…" : "Sin datos de Zettle para este mes."}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 96, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={T.div} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: T.faint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.faint }} axisLine={false} tickLine={false} width={48} tickFormatter={tickMode ? undefined : k$} />
              <Tooltip content={<TooltipComp />} cursor={{ stroke: T.faint, strokeDasharray: "3 3" }} />
              {series.map((a) => {
                const apagada = foco != null && foco !== a;
                return (
                  <Line key={a} type="linear" dataKey={a} name={String(a)} stroke={COLORES_ANIO[anios.indexOf(a)]}
                    strokeWidth={GROSOR[anios.indexOf(a)]} strokeDasharray={DASH[anios.indexOf(a)]} strokeOpacity={apagada ? 0.2 : 1}
                    dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4 }} />
                );
              })}
              {acum && [mesY, mesY - 1].filter((a) => series.includes(a)).map((a) => {
                const dia = a === mesY ? Math.max(1, resumen.diaCorte) : diasMes;
                const v = data[dia - 1]?.[a];
                if (v == null) return null;
                return (
                  <ReferenceDot key={`et${a}`} x={dia} y={v} r={4} fill={COLORES_ANIO[anios.indexOf(a)]} stroke="none"
                    ifOverflow="visible" label={etiqueta(a, `${a} · ${fmtCorto(v)}`)} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginTop: "10px", fontSize: "12.5px", color: T.sub }}>
        {series.map((a) => (
          <span key={a} onMouseEnter={() => setFoco(a)} onMouseLeave={() => setFoco(null)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "default", fontWeight: a === mesY ? 700 : 400, opacity: foco != null && foco !== a ? 0.4 : 1 }}>
            <span style={{ width: 14, height: 4, borderRadius: 2, background: COLORES_ANIO[anios.indexOf(a)] }} />
            {mesCorto} {a}
          </span>
        ))}
        <span style={{ color: T.faint }}>· pasa el cursor sobre un año para resaltarlo</span>
      </div>
    </div>
  );
}
