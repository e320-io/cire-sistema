import { useState, useMemo } from "react";
import { useT } from "../../lib/theme.jsx";
import { COLORES, fmt, hoy } from "../../lib/constantes.js";
import { supabase } from "../../lib/supabase.js";
import { SUCURSALES, ESTADOS_VENTA, esperadoVenta } from "./rendimiento.js";
import { SERV, ORIGEN } from "./VentasAnuncios.jsx";

const COLOR_ESTADO = { pendiente: "#c99a00", liquidada: "#10b981", no_vino: "#ff6b6b" };
const diaLargo = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

// Tabla de ventas por anuncio del mes, día por día. Cada renglón se edita en línea y se guarda por separado.
// sucursales: a cuáles se puede mover una venta (recepción solo ve la suya).
export default function VentasTabla({ ventas, mes, onCambio, onCerrar, sucursales = SUCURSALES }) {
  const { T: T0, light } = useT();
  const T = { ...T0, text: light ? "#1a1f3c" : "#fff", bg: T0.dropBg }; // el tema base no define text ni bg
  const [drafts, setDrafts] = useState({}); // id -> campos modificados
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(null);

  const val = (v, k) => drafts[v.id]?.[k] ?? v[k];
  const cambiar = (v, k, x) => setDrafts((d) => {
    const n = { ...(d[v.id] || {}), [k]: x };
    const precio = k === "precio_total" ? x : val(v, "precio_total") ?? v.monto;
    const anticipo = k === "anticipo" ? x : val(v, "anticipo");
    // Liquidada = pagó todo. No vino / pendiente = solo lo que dejó de anticipo.
    if (k === "estado") n.monto = String(x === "liquidada" ? precio : anticipo || val(v, "monto"));
    if (k === "precio_total" && val(v, "estado") === "liquidada") n.monto = x;
    if (k === "anticipo" && val(v, "estado") !== "liquidada") n.monto = x;
    return { ...d, [v.id]: n };
  });
  const sucio = (v) => !!drafts[v.id] && Object.keys(drafts[v.id]).length > 0;
  const descartar = (v) => setDrafts((d) => { const n = { ...d }; delete n[v.id]; return n; });

  const guardar = async (v) => {
    const precio = Number(val(v, "precio_total")), monto = Number(val(v, "monto"));
    const estado = val(v, "estado");
    if (!(precio > 0) || !(monto > 0)) { setMsg("Precio y cobrado deben ser mayores a 0."); return; }
    if (monto > precio) { setMsg("Lo cobrado no puede ser mayor al precio."); return; }
    setGuardando(v.id); setMsg("");
    const { error } = await supabase.from("ventas_anuncios").update({
      fecha: val(v, "fecha"), nombre_clienta: (val(v, "nombre_clienta") || "").trim(), sucursal: val(v, "sucursal"), servicio: val(v, "servicio"), paquete: val(v, "paquete"), origen: val(v, "origen"),
      precio_total: precio, monto, anticipo: val(v, "anticipo") === "" || val(v, "anticipo") == null ? null : Number(val(v, "anticipo")), estado, notas: val(v, "notas") || "",
      liquidado: estado === "liquidada", fecha_liquidacion: estado === "liquidada" ? (v.fecha_liquidacion || hoy()) : null,
    }).eq("id", v.id);
    setGuardando(null);
    if (error) { setMsg(`No se guardó: ${error.message}`); return; }
    descartar(v); setMsg("✓ Cambios guardados"); onCambio();
  };
  const borrar = async (v) => {
    if (!window.confirm(`¿Borrar la venta de ${v.sucursal} · ${v.servicio} · ${fmt(Number(v.monto))}?`)) return;
    const { error } = await supabase.from("ventas_anuncios").delete().eq("id", v.id);
    if (error) setMsg(`No se borró: ${error.message}`); else { descartar(v); onCambio(); }
  };

  const dias = useMemo(() => {
    const m = new Map();
    ventas.forEach((v) => { const k = v.fecha; (m.get(k) || m.set(k, []).get(k)).push(v); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [ventas]);

  const tot = useMemo(() => ({
    n: ventas.length,
    cobrado: ventas.reduce((a, v) => a + Number(v.monto), 0),
    esperado: ventas.reduce((a, v) => a + esperadoVenta(v), 0),
    pendientes: ventas.filter((v) => v.estado === "pendiente").length,
    noVino: ventas.filter((v) => v.estado === "no_vino").length,
  }), [ventas]);

  const exportar = () => {
    const c = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const filas = [["Fecha", "Clienta", "Sucursal", "Servicio", "Paquete", "Origen", "Precio", "Anticipo", "Cobrado", "Estado", "Notas"], ...ventas.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((v) => [v.fecha, v.nombre_clienta, v.sucursal, v.servicio, v.paquete, v.origen, v.precio_total ?? v.monto, v.anticipo, v.monto, ESTADOS_VENTA[v.estado] || v.estado, v.notas])];
    const blob = new Blob(["﻿" + filas.map((r) => r.map(c).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ventas-anuncios-${mes}.csv`; a.click();
  };

  const inp = { boxSizing: "border-box", width: "100%", padding: "5px 6px", borderRadius: "6px", border: `1px solid ${T.div}`, background: "transparent", color: T.text, fontFamily: "inherit", fontSize: "12px" };
  const th = { padding: "8px 6px", fontSize: "10px", letterSpacing: "1px", color: T.faint, fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" };
  const tdc = { padding: "6px 4px", verticalAlign: "middle" };
  const kpi = (l, v, c) => <div style={{ padding: "8px 14px", borderRadius: "10px", border: `1px solid ${T.div}` }}><div style={{ fontSize: "10px", letterSpacing: "1.5px", color: T.sub }}>{l}</div><div style={{ fontSize: "17px", fontWeight: 700, color: c }}>{v}</div></div>;
  const mesTxt = new Date(mes + "-01T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "100%", maxWidth: "1280px", maxHeight: "92vh", display: "flex", flexDirection: "column", padding: "20px 22px", background: T.bg || "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, textTransform: "capitalize" }}>Ventas por anuncio · {mesTxt}</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: msg.startsWith("✓") ? "#10b981" : "#ff6b6b" }}>{msg}</span>
            <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: "12px" }} onClick={exportar} disabled={!ventas.length}>Descargar CSV</button>
            <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: "12px" }} onClick={onCerrar}>✕ Cerrar</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "14px 0" }}>
          {kpi("VENTAS", tot.n, T.text)}{kpi("COBRADO", fmt(tot.cobrado), "#10b981")}{kpi("ESPERADO", fmt(tot.esperado), "#49B8D3")}
          {kpi("POR COBRAR", fmt(tot.esperado - tot.cobrado), "#c99a00")}{kpi("PENDIENTES", tot.pendientes, "#c99a00")}{kpi("NO VINIERON", tot.noVino, "#ff6b6b")}
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {ventas.length === 0 && <div style={{ padding: "40px", textAlign: "center", fontSize: "13px", color: T.faint }}>Aún no hay ventas este mes. Usa “+ Registrar venta”.</div>}
          {ventas.length > 0 && (
            <table style={{ width: "100%", minWidth: "1340px", borderCollapse: "collapse" }}>
              <thead><tr style={{ position: "sticky", top: 0, background: T.bg || "#fff", zIndex: 1 }}>
                {["FECHA", "CLIENTA", "SUCURSAL", "SERVICIO", "PAQUETE", "ORIGEN", "PRECIO", "ANTICIPO", "COBRADO", "ESTADO", "NOTAS", ""].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {dias.map(([dia, lista]) => {
                  const cob = lista.reduce((a, v) => a + Number(v.monto), 0), esp = lista.reduce((a, v) => a + esperadoVenta(v), 0);
                  return [
                    <tr key={"d" + dia}><td colSpan={12} style={{ padding: "12px 6px 6px", fontSize: "11.5px", fontWeight: 700, color: T.sub, textTransform: "capitalize", borderTop: `1px solid ${T.div}` }}>
                      {diaLargo(dia)} · {lista.length} {lista.length === 1 ? "venta" : "ventas"} · cobrado {fmt(cob)} · esperado {fmt(esp)}
                    </td></tr>,
                    ...lista.map((v) => {
                      const est = val(v, "estado");
                      return (
                        <tr key={v.id} style={{ background: sucio(v) ? "rgba(39,33,232,0.06)" : "transparent" }}>
                          <td style={{ ...tdc, width: "128px" }}><input style={inp} type="date" value={val(v, "fecha")} onChange={(e) => cambiar(v, "fecha", e.target.value)} /></td>
                          <td style={{ ...tdc, minWidth: "140px" }}><input style={inp} value={val(v, "nombre_clienta") || ""} onChange={(e) => cambiar(v, "nombre_clienta", e.target.value)} placeholder="Nombre" /></td>
                          <td style={{ ...tdc, width: "104px" }}><select style={{ ...inp, color: COLORES[val(v, "sucursal")], fontWeight: 700 }} value={val(v, "sucursal")} onChange={(e) => cambiar(v, "sucursal", e.target.value)}>{sucursales.map((s) => <option key={s}>{s}</option>)}</select></td>
                          <td style={{ ...tdc, width: "130px" }}><select style={inp} value={val(v, "servicio")} onChange={(e) => cambiar(v, "servicio", e.target.value)}>{Object.keys(SERV).map((s) => <option key={s}>{s}</option>)}</select></td>
                          <td style={{ ...tdc, minWidth: "150px" }}><input style={inp} value={val(v, "paquete")} onChange={(e) => cambiar(v, "paquete", e.target.value)} list="paquetes-ventas" /></td>
                          <td style={{ ...tdc, width: "150px" }}><select style={inp} value={val(v, "origen")} onChange={(e) => cambiar(v, "origen", e.target.value)}>{ORIGEN.map((o) => <option key={o}>{o}</option>)}</select></td>
                          <td style={{ ...tdc, width: "92px" }}><input style={inp} type="number" min="0" value={val(v, "precio_total") ?? v.monto} onChange={(e) => cambiar(v, "precio_total", e.target.value)} /></td>
                          <td style={{ ...tdc, width: "88px" }}><input style={inp} type="number" min="0" value={val(v, "anticipo") ?? ""} onChange={(e) => cambiar(v, "anticipo", e.target.value)} placeholder="—" /></td>
                          <td style={{ ...tdc, width: "92px" }}><input style={inp} type="number" min="0" value={val(v, "monto")} onChange={(e) => cambiar(v, "monto", e.target.value)} disabled={est === "liquidada"} title={est === "liquidada" ? "Liquidada: cobrado = precio" : ""} /></td>
                          <td style={{ ...tdc, width: "112px" }}><select style={{ ...inp, color: COLOR_ESTADO[est], fontWeight: 700 }} value={est} onChange={(e) => cambiar(v, "estado", e.target.value)}>{Object.entries(ESTADOS_VENTA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                          <td style={{ ...tdc, minWidth: "140px" }}><input style={inp} value={val(v, "notas") || ""} onChange={(e) => cambiar(v, "notas", e.target.value)} placeholder="Nota…" /></td>
                          <td style={{ ...tdc, whiteSpace: "nowrap", textAlign: "right" }}>
                            {sucio(v) && <>
                              <button style={{ padding: "4px 10px", fontSize: "11px", fontWeight: 700, color: "#fff", background: "#2721E8", border: "none", borderRadius: "7px", cursor: "pointer", fontFamily: "inherit", marginRight: "4px" }} onClick={() => guardar(v)} disabled={guardando === v.id}>{guardando === v.id ? "…" : "Guardar"}</button>
                              <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: "11px", marginRight: "4px" }} onClick={() => descartar(v)}>Deshacer</button>
                            </>}
                            <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: "11px", color: "#ff6b6b" }} onClick={() => borrar(v)} title="Borrar venta">🗑</button>
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          )}
          <datalist id="paquetes-ventas">{[...new Set(Object.values(SERV).flat().map(([p]) => p))].map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div style={{ fontSize: "11px", color: T.faint, marginTop: "10px", lineHeight: 1.5 }}>
          Toda venta se toma como liquidada al capturarla (cobrado = precio); aquí solo se corrigen excepciones. No vino: se queda con el anticipo y ya no se espera más (cobrado = anticipo). Pendiente: solo cuenta el anticipo hasta que la cambies a Liquidada. Cambiar la sucursal mueve la venta a la otra.
        </div>
      </div>
    </div>
  );
}
