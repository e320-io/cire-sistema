import React, { useState } from "react";
import { C, S, cap, fechaLarga } from "./ui.jsx";

// Bloques colapsables al final del flujo: resumen de la cita, cómo llegar (mapa), indicaciones previas y cómo asistir a la sesión.
// info = { nombre, direccion, mapsUrl, estacionamiento }; estadoAnticipo (opcional) = estado del anticipo.

function Colapsable({ icono, titulo, abierto = false, children }) {
  const [on, setOn] = useState(abierto);
  return (
    <div style={{ ...S.tarjeta, padding: 0, overflow: "hidden" }}>
      <button type="button" onClick={() => setOn(!on)} aria-expanded={on}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "16px 20px", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontSize: 22, flex: "0 0 auto" }}>{icono}</span>
        <span style={{ flex: 1, fontWeight: 800, fontSize: 17, color: C.verde, lineHeight: 1.25 }}>{titulo}</span>
        <span style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: "50%", background: on ? C.verde : C.menta, color: on ? "#fff" : C.verde, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{on ? "–" : "+"}</span>
      </button>
      {on && <div style={{ padding: "0 20px 18px" }}>{children}</div>}
    </div>
  );
}

const Fila = ({ icono, titulo, texto }) => (
  <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.menta}` }}>
    <span style={{ fontSize: 20, width: 26, textAlign: "center", flex: "0 0 auto" }}>{icono}</span>
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.suave, letterSpacing: ".04em", textTransform: "uppercase" }}>{titulo}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.verde, lineHeight: 1.35 }}>{texto}</div>
    </div>
  </div>
);

// Una indicación: emoji + texto (con <b> para lo importante)
const Item = ({ e, children }) => (
  <div style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.menta}`, fontSize: 14, lineHeight: 1.5, color: C.texto }}>
    <span style={{ fontSize: 18, flex: "0 0 auto", width: 24, textAlign: "center" }}>{e}</span>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);
const Lista = ({ items }) => <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>{items.map((t) => <li key={t}>{t}</li>)}</ul>;

function IndicacionesAConsiderar() {
  return (
    <>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: C.suave, marginBottom: 6 }}>Indicaciones que debes considerar para poder iniciar tu depilación con <b style={{ color: C.verde }}>LÁSER EXPERT 8</b> en CIRE DEPILACIÓN:</div>
      <Item e="❌"><b>DEJAR DE USAR</b> otros métodos de depilación de <b>arranque</b> como lo son: <b>pinzas</b>, <b>cera</b>, etc., por lo menos 30 días antes de tu primera sesión.</Item>
      <Item e="⚠️"><b>INFORMARNOS</b> si estás en algún <b>tratamiento médico</b>, ya que algunos medicamentos pueden generar fotosensibilidad.</Item>
      <Item e="🚫"><b>EVITAR</b> realizarte <b>peelings</b>, <b>exfoliaciones profundas</b>, <b>usar productos con ácido glicólico o retinoico</b> y autobronceadores por lo menos 15 días antes de tu sesión.</Item>
      <Item e="🔅"><b>EVITAR acudir bronceada</b>. Si éste es el caso, deberás esperar hasta igualar el color natural de tu piel.</Item>
      <Item e="🚫">
        <b>EVITAR USAR LOS SIGUIENTES PRODUCTOS INGERIDOS:</b>
        <Lista items={["Ácido glicólico", "Ácido salicílico", "Tretinoína (Retin-A)"]} />
        <div style={{ marginTop: 6, color: C.suave }}>(En el caso de utilizarlos de manera <b>tópica</b>, suspéndelo 5 días).</div>
      </Item>
    </>
  );
}

function ComoAsistir() {
  return (
    <>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: C.suave, marginBottom: 6 }}>💎 <b style={{ color: C.verde }}>Preparación para tu sesión LÁSER EXPERT 8</b></div>
      <Item e="🪒"><b>Rasurado previo:</b> rasura la(s) zona(s) con anticipación según tu crecimiento. El vello debe estar al ras de la piel (sin sobresalir) para poder realizar la sesión correctamente.</Item>
      <Item e="🧼">
        <b>Piel limpia:</b> asiste con la(s) zona(s) completamente limpias, sin:
        <Lista items={["Crema o loción", "Desodorante", "Maquillaje", "Autobronceador"]} />
      </Item>
      <Item e="⚠️"><b>Medicamentos:</b> si estás tomando algún medicamento, es importante informarlo previamente por WhatsApp o directamente a la cosmetóloga.</Item>
      <Item e="🩸"><b>Periodo menstrual:</b> sí puedes asistir en tu <b>periodo menstrual</b>. Si la zona a depilar es bikini 👙, solo podrías estar más sensible; en ese caso, ven aseada y con tampón. Si es cualquier otra <b>zona a depilar</b>, podrás asistir a tu sesión; solo toma en cuenta que podrías estar más sensible.</Item>
      <Item e="🍸"><b>Alcohol:</b> evita consumir bebidas alcohólicas al menos 12 horas antes de tu sesión.</Item>
      <Item e="🔅"><b>Exposición al sol:</b> no se puede realizar la sesión en <b>piel bronceada</b>.</Item>
      <div style={{ marginTop: 10, background: C.menta, color: C.verde, borderRadius: 14, padding: "12px 14px", fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>✨ Seguir estas indicaciones nos ayuda a brindarte un tratamiento más seguro y efectivo 💖</div>
    </>
  );
}

export default function CierreCita({ info, fecha, hora, horaFin, servicio, estadoAnticipo, especial }) {
  const dir = info?.direccion;
  // Mapa de la FICHA del negocio (no de la dirección): URL oficial si existe; si no, búsqueda por nombre + coordenadas.
  const mapaSrc = info?.mapsEmbed
    || (info?.mapaNombre ? `https://maps.google.com/maps?q=${encodeURIComponent(info.mapaNombre)}${info.lat != null && info.lng != null ? `&ll=${info.lat},${info.lng}` : ""}&z=17&output=embed`
      : dir ? `https://maps.google.com/maps?q=${encodeURIComponent(dir)}&z=16&output=embed` : "");
  const conIndicaciones = servicio !== "Valoración"; // las indicaciones son para la sesión de láser
  return (
    <>
      <Colapsable icono="🗓️" titulo="Resumen de tu cita" abierto>
        <Fila icono="📅" titulo="Día" texto={cap(fechaLarga(fecha))} />
        <Fila icono="🕒" titulo="Hora" texto={`${hora}${horaFin ? ` – ${horaFin}` : ""}`} />
        {especial && <Fila icono="⚠️" titulo="Horario especial" texto="Pendiente de aprobación: te confirmaremos por WhatsApp" />}
        {servicio && <Fila icono="✨" titulo="Servicio" texto={servicio} />}
        {estadoAnticipo && <Fila icono="💳" titulo="Anticipo" texto={estadoAnticipo} />}
        <Fila icono="📍" titulo="Sucursal" texto={`CIRE ${info?.nombre ?? ""}`} />
      </Colapsable>

      <Colapsable icono="📍" titulo="¿Cómo llegar?">
        {dir && <div style={{ fontSize: 14, lineHeight: 1.45, color: C.texto, marginBottom: 10 }}><b>CIRE {info.nombre}</b><br />{dir}{info.estacionamiento && <><br /><span style={{ fontWeight: 600, color: C.verdeMedio }}>🚗 Con estacionamiento</span></>}</div>}
        {mapaSrc && (
          <div style={{ height: 240, background: C.menta, display: "grid", placeItems: "center", color: C.suave, fontSize: 13, position: "relative", borderRadius: 16, overflow: "hidden" }}>
            Cargando mapa…
            <iframe title={`Mapa de CIRE ${info.nombre}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
              src={mapaSrc}
              style={{ position: "absolute", inset: 0, border: 0, width: "100%", height: "100%" }} />
          </div>
        )}
        {info?.mapsUrl && (
          <a href={info.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.boton(true), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box", marginTop: 12 }}>📍 Abrir en Google Maps</a>
        )}
      </Colapsable>

      {conIndicaciones && (
        <>
          <Colapsable icono="📋" titulo="Indicaciones a considerar"><IndicacionesAConsiderar /></Colapsable>
          <Colapsable icono="✨" titulo="Cómo debes asistir a tu sesión"><ComoAsistir /></Colapsable>
        </>
      )}
    </>
  );
}
export { Colapsable, IndicacionesAConsiderar, ComoAsistir };
