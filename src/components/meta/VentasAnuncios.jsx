import { createPortal } from "react-dom";
import { useState } from "react";
import { useT } from "../../lib/theme.jsx";
import { COLORES, fmt, hoy } from "../../lib/constantes.js";
import { supabase } from "../../lib/supabase.js";
import { SUCURSALES, esperadoVenta } from "./rendimiento.js";

// Precios de lista de las promos del Buen Fin nov 2026; actualizar cuando cambien.
export const SERV = {
  "Láser CC": [["Cuerpo completo (8 sesiones)", 8500], ["Otra zona o paquete", null]],
  "Bikini": [["Básico", 1800], ["Sexy", 2000], ["French", 2800], ["Brazilian", 3200]],
  "Facial": [["Facial en promoción", null], ["Otro facial", null]],
  "HIFU 4D": [["HIFU 4D", null]],
  "Moldeo (drenaje)": [["Drenaje linfático", 700], ["Otro moldeo", null]],
};
const ANTICIPOS = [200, 250]; // anticipo habitual de clienta nueva; el resto se liquida el día de la sesión
export const ORIGEN = ["No sé", "Anuncio de video", "Anuncio de imagen", "Recomendación u otro"];

// Modal para capturar y revisar las ventas del mes que llegaron por anuncios.
// sucursales: las que se pueden elegir (recepción solo ve la suya); soloHoy: lista solo lo de hoy y sin borrar (recepción).
export default function VentasAnuncios({ ventas, mes, usuario, onCerrar, onCambio, tablaLista, sucursales = SUCURSALES, sucursalInicial = "", soloHoy = false }) {
  const { T: T0, light } = useT();
  const T = { ...T0, text: light ? "#1a1f3c" : "#fff", bg: T0.dropBg }; // el tema base no define text ni bg
  const [f, setF] = useState({ nombre: "", sucursal: sucursales.includes(sucursalInicial) ? sucursalInicial : sucursales.length === 1 ? sucursales[0] : "", servicio: "", paquete: "", precio: "", anticipo: "250", fecha: hoy(), origen: "No sé" });
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const elegirServicio = (s) => setF((x) => ({ ...x, servicio: s, paquete: "", precio: "" }));
  const elegirPaquete = (p) => {
    const precio = (SERV[f.servicio] || []).find((x) => x[0] === p)?.[1];
    setF((x) => ({ ...x, paquete: p, precio: precio != null ? String(precio) : x.precio }));
  };

  const guardar = async () => {
    const anticipo = Number(f.anticipo), precio = Number(f.precio);
    if (!f.nombre.trim() || !f.sucursal || !f.servicio || !f.paquete || !(anticipo > 0) || !(precio > 0)) { setMsg("Completa nombre, sucursal, servicio, paquete, precio y anticipo."); return; }
    if (anticipo > precio) { setMsg("El anticipo no puede ser mayor al precio."); return; }
    // Se toma como liquidada desde la captura; si no viene, se cambia a "No vino" en el resumen (queda el anticipo).
    setGuardando(true); setMsg("");
    const { error } = await supabase.from("ventas_anuncios").insert([{ nombre_clienta: f.nombre.trim(), fecha: f.fecha, sucursal: f.sucursal, servicio: f.servicio, paquete: f.paquete, origen: f.origen, monto: precio, anticipo, precio_total: precio, liquidado: true, estado: "liquidada", fecha_liquidacion: f.fecha, creado_por: usuario || null }]);
    setGuardando(false);
    if (error) { setMsg(`No se guardó: ${error.message}`); return; }
    setMsg("✓ Venta guardada");
    setF((x) => ({ ...x, paquete: "", precio: "" }));
    onCambio();
  };
  const borrar = async (id) => {
    if (!window.confirm("¿Borrar esta venta?")) return;
    const { error } = await supabase.from("ventas_anuncios").delete().eq("id", id);
    if (error) setMsg(`No se borró: ${error.message}`); else onCambio();
  };

  const campo = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${T.div}`, background: "transparent", color: T.text, fontFamily: "inherit", fontSize: "13px" };
  const etiqueta = (t) => <div style={{ fontSize: "10px", letterSpacing: "1.5px", color: T.sub, margin: "12px 0 6px" }}>{t}</div>;
  const chip = (activo, c) => ({ padding: "7px 14px", borderRadius: "99px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, color: activo ? "#fff" : T.muted, background: activo ? c : "transparent", border: `1px solid ${activo ? c : T.div}` });
  const cobrado = ventas.reduce((a, v) => a + Number(v.monto), 0);
  const esperado = ventas.reduce((a, v) => a + esperadoVenta(v), 0);

  return createPortal(
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "100%", maxWidth: "560px", maxHeight: "92vh", overflowY: "auto", padding: "22px 24px", background: T.bg || "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "15px", fontWeight: 700 }}>Registrar venta por anuncio</div>
          <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={onCerrar}>✕</button>
        </div>

        {!tablaLista && <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "8px", background: "rgba(240,192,64,0.12)", color: "#c99a00", fontSize: "12px", lineHeight: 1.5 }}>Falta crear la tabla en Supabase: ejecuta <b>029_ventas_anuncios.sql</b> y <b>030_ventas_anuncios_anticipo.sql</b> (en supabase/migrations) en el SQL Editor.</div>}

        {etiqueta("NOMBRE DE LA CLIENTA")}
        <input style={campo} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre y apellido" autoComplete="off" />
        {etiqueta("SUCURSAL")}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{sucursales.map((s) => <button key={s} style={chip(f.sucursal === s, COLORES[s])} onClick={() => set("sucursal", s)}>{s}</button>)}</div>
        {etiqueta("SERVICIO")}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{Object.keys(SERV).map((s) => <button key={s} style={chip(f.servicio === s, "#2721E8")} onClick={() => elegirServicio(s)}>{s}</button>)}</div>
        {f.servicio && <>
          {etiqueta("PAQUETE O TRATAMIENTO")}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{SERV[f.servicio].map(([p, pr]) => <button key={p} style={chip(f.paquete === p, "#2721E8")} onClick={() => elegirPaquete(p)}>{p}{pr ? ` · ${fmt(pr)}` : ""}</button>)}</div>
        </>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>{etiqueta("PRECIO DEL PAQUETE (MXN)")}<input style={campo} type="number" inputMode="decimal" min="0" value={f.precio} onChange={(e) => set("precio", e.target.value)} placeholder="Lo que pagará en total" /></div>
          <div>{etiqueta("FECHA")}<input style={campo} type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
        </div>
        {etiqueta("ANTICIPO QUE DEJÓ (MXN)")}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {ANTICIPOS.map((n) => <button key={n} style={chip(Number(f.anticipo) === n, "#10b981")} onClick={() => set("anticipo", String(n))}>{fmt(n)}</button>)}
          <input style={{ ...campo, width: "120px" }} type="number" inputMode="decimal" min="0" value={f.anticipo} onChange={(e) => set("anticipo", e.target.value)} placeholder="Otro monto" />
          <span style={{ fontSize: "11.5px", color: T.sub }}>Se cuenta como venta liquidada; si no viene, lo cambias en 📋 Ventas.</span>
        </div>
        {etiqueta("¿CÓMO LLEGÓ LA CLIENTA?")}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{ORIGEN.map((o) => <button key={o} style={chip(f.origen === o, "#a855f7")} onClick={() => set("origen", o)}>{o}</button>)}</div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "18px" }}>
          <button style={{ padding: "10px 22px", fontSize: "13px", fontWeight: 700, color: "#fff", background: "#2721E8", border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "inherit", opacity: guardando || !tablaLista ? 0.5 : 1 }} onClick={guardar} disabled={guardando || !tablaLista}>{guardando ? "Guardando…" : "Guardar venta"}</button>
          <span style={{ fontSize: "12px", color: msg.startsWith("✓") ? "#10b981" : "#ff6b6b" }}>{msg}</span>
        </div>

        <div style={{ marginTop: "22px", borderTop: `1px solid ${T.div}`, paddingTop: "14px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", color: T.sub, marginBottom: "8px" }}>{soloHoy ? "VENTAS DE HOY" : `VENTAS DE ${mes}`} · {ventas.length} · cobrado {fmt(cobrado)} de {fmt(esperado)}</div>
          {ventas.length === 0 && <div style={{ fontSize: "12px", color: T.faint }}>Aún no hay ventas registradas este mes.</div>}
          {ventas.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderTop: `1px solid ${T.div}`, fontSize: "12px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: COLORES[v.sucursal], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div><b>{v.nombre_clienta || "Sin nombre"}</b> · {v.sucursal} · {v.servicio} · {v.paquete}</div>
                <div style={{ color: T.faint, fontSize: "11px" }}>{v.fecha} · {v.origen}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <b>{fmt(Number(v.monto))}</b>
                <div style={{ fontSize: "10.5px", color: v.estado === "liquidada" ? "#10b981" : v.estado === "no_vino" ? "#ff6b6b" : "#c99a00" }}>{v.estado === "liquidada" ? "liquidada" : v.estado === "no_vino" ? "no vino" : `de ${fmt(Number(v.precio_total ?? v.monto))}`}</div>
              </div>
              {!soloHoy && <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={() => borrar(v.id)}>Borrar</button>}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
