import React from "react";
import { C, S, cap, fechaLarga } from "./ui.jsx";

// Resumen final de la cita + mapa de Google Maps de la sucursal.
// info = { nombre, direccion, mapsUrl, estacionamiento }; estadoAnticipo (opcional) = texto del estado del anticipo.
const Fila = ({ icono, titulo, texto }) => (
  <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.menta}` }}>
    <span style={{ fontSize: 20, width: 26, textAlign: "center", flex: "0 0 auto" }}>{icono}</span>
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.suave, letterSpacing: ".04em", textTransform: "uppercase" }}>{titulo}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.verde, lineHeight: 1.35 }}>{texto}</div>
    </div>
  </div>
);

export default function ResumenCita({ info, fecha, hora, horaFin, servicio, estadoAnticipo }) {
  const dir = info?.direccion;
  return (
    <div style={{ ...S.tarjeta, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 20px 6px" }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 6 }}>Resumen de tu cita</div>
        <Fila icono="📅" titulo="Día" texto={cap(fechaLarga(fecha))} />
        <Fila icono="🕒" titulo="Hora" texto={`${hora}${horaFin ? ` – ${horaFin}` : ""}`} />
        {servicio && <Fila icono="✨" titulo="Servicio" texto={servicio} />}
        {estadoAnticipo && <Fila icono="💳" titulo="Anticipo" texto={estadoAnticipo} />}
        <Fila icono="📍" titulo="Sucursal" texto={<>CIRE {info?.nombre}{dir && <><br /><span style={{ fontWeight: 500 }}>{dir}</span></>}{info?.estacionamiento && <><br /><span style={{ fontWeight: 600, color: C.verdeMedio }}>🚗 Con estacionamiento</span></>}</>} />
      </div>
      {dir && (
        <>
          <div style={{ marginTop: 8, height: 240, background: C.menta, display: "grid", placeItems: "center", color: C.suave, fontSize: 13, position: "relative" }}>
            Cargando mapa…
            <iframe title={`Mapa de CIRE ${info.nombre}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
              src={`https://maps.google.com/maps?q=${encodeURIComponent(dir)}&z=16&output=embed`}
              style={{ position: "absolute", inset: 0, border: 0, width: "100%", height: "100%" }} />
          </div>
          {info.mapsUrl && (
            <div style={{ padding: 16 }}>
              <a href={info.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.boton(true), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>📍 Cómo llegar · Abrir en Google Maps</a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
