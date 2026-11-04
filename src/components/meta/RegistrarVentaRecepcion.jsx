import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { hoy } from "../../lib/constantes.js";
import VentasAnuncios from "./VentasAnuncios.jsx";
import VentasTabla from "./VentasTabla.jsx";

// Botón para recepción: abre el formulario de venta por anuncio, limitado a la(s) sucursal(es) de quien lo usa.
// session: sesión del POS; sucursales: las que puede elegir; inicial: la sucursal que se ve en ese momento.
export default function RegistrarVentaRecepcion({ session, sucursales, inicial, light }) {
  const [abierto, setAbierto] = useState(false);
  const [verTabla, setVerTabla] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [tablaLista, setTablaLista] = useState(true);

  const cargar = useCallback(async () => {
    const mes = hoy().slice(0, 7);
    const [y, m] = mes.split("-").map(Number);
    const fin = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; // último día real del mes
    const { data, error } = await supabase.from("ventas_anuncios").select("*").gte("fecha", `${mes}-01`).lte("fecha", fin).in("sucursal", sucursales).order("fecha", { ascending: false }).order("creado_en", { ascending: false });
    if (error) { setTablaLista(false); setVentas([]); return; }
    setTablaLista(true); setVentas(data || []);
  }, [sucursales.join("|")]);
  useEffect(() => { if (abierto || verTabla) cargar(); }, [abierto, verTabla, cargar]);

  return <>
    <button onClick={() => setAbierto(true)} title="Registrar una venta que llegó por un anuncio de Meta"
      style={{ fontSize: "12px", padding: "7px 14px", borderRadius: "8px", border: "1px solid rgba(168,85,247,0.5)", background: "rgba(168,85,247,0.12)", color: light ? "#7e22ce" : "#c084fc", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, whiteSpace: "nowrap" }}>
      + Venta por anuncio
    </button>
    <button onClick={() => setVerTabla(true)} title="Ver, corregir o borrar las ventas por anuncio del mes"
      style={{ fontSize: "12px", padding: "7px 12px", borderRadius: "8px", border: `1px solid ${light ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.2)"}`, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}>
      📋 Resumen
    </button>
    {verTabla && <VentasTabla ventas={ventas} mes={hoy().slice(0, 7)} sucursales={sucursales} onCerrar={() => setVerTabla(false)} onCambio={cargar} />}
    {abierto && <VentasAnuncios ventas={ventas.filter((v) => v.fecha === hoy())} mes={hoy().slice(0, 7)} usuario={session.usuario} tablaLista={tablaLista} sucursales={sucursales} sucursalInicial={inicial} soloHoy onCerrar={() => setAbierto(false)} onCambio={cargar} />}
  </>;
}
