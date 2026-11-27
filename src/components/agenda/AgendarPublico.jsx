import React, { useEffect, useMemo, useState } from "react";
import { C, S, FONT, Pin, Titulo, crearApi, estiloTema } from "./ui.jsx";
import LogoCire from "./LogoCire.jsx";
import Reagendar from "./Reagendar.jsx";
import AgendarNueva from "./AgendarNueva.jsx";
import AgendarSiguienteClienta from "./AgendarSiguienteClienta.jsx";
import { RetomarApartado, leerPendiente } from "./AseguraLugar.jsx";

// Página pública:
//   /agendar            -> elige sucursal
//   /agendar/<sucursal> -> "Agendar mi cita" (nueva) o "Reagendar mi cita"
// Toda la lógica vive en la edge function agenda-publica; aquí solo hay UI. Look & feel = piezas de campaña de CIRE.

const tokenUrl = () => ((location.search.match(/[?&]t=([0-9a-fA-F-]{36})/) || [])[1] || "").toLowerCase();
const slugUrl = () => (location.pathname.match(/^\/agendar\/([^/]+)/) || [])[1] || "";

export default function AgendarPublico() {
  const [slug, setSlug] = useState(slugUrl());
  const [info, setInfo] = useState(null); // { nombre, direccion, mapsUrl, estacionamiento }
  const sucursal = info?.nombre || "";
  const [lista, setLista] = useState(null);
  const [modo, setModo] = useState("inicio"); // inicio | nueva | reagendar | asegurar | siguiente
  const [titulo2, setTitulo2] = useState("");
  const pendiente = slug ? leerPendiente(slug) : null; // anticipo sin comprobante (se guardó en este dispositivo)
  const [err, setErr] = useState("");
  const api = useMemo(() => crearApi(slug), [slug]);

  useEffect(() => {
    document.title = "Agenda tu cita · CIRE";
    document.body.style.margin = "0";
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
  useEffect(() => {
    setErr("");
    if (slug) api("info").then((j) => setInfo(j)).catch((e) => setErr(e.message));
    else api("sucursales").then((j) => setLista(j.sucursales)).catch((e) => setErr(e.message));
  }, [slug]); // eslint-disable-line

  const elegirSucursal = (s) => { history.pushState(null, "", `/agendar/${s.slug}`); setInfo({ nombre: s.nombre }); setSlug(s.slug); setModo("inicio"); };
  const volver = () => { setModo("inicio"); setErr(""); };
  const sinSlug = !slug;

  const titulo = (titulo2 === "asegura" || modo === "asegurar") ? <>Asegura<br />tu lugar</> : modo === "nueva" ? <>Agenda<br />tu cita</> : modo === "siguiente" ? <>Tu siguiente<br />sesión</> : modo === "reagendar" ? <>Reagenda<br />tu cita</> : <>Agenda tu<br />cita en CIRE</>;

  const opcion = (emoji, titulo, texto, onClick, resaltada) => (
    <button onClick={onClick} style={{ ...S.tarjeta, display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: FONT, padding: "18px 20px", background: resaltada ? C.verde : "#fff" }}>
      <span style={{ fontSize: 30 }}>{emoji}</span>
      <span>
        <span style={{ display: "block", fontWeight: 800, fontSize: 18, color: resaltada ? "#fff" : C.verde }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 13, color: resaltada ? "rgba(255,255,255,.85)" : C.suave, marginTop: 2 }}>{texto}</span>
      </span>
    </button>
  );

  return (
    <div style={{ ...S.pagina, ...estiloTema(info?.tema) }}>
      {/* Marca de agua tipográfica, como el fondo de las promos */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", fontWeight: 800, fontSize: 150, lineHeight: 0.9, color: "rgba(255,255,255,.09)", transform: "rotate(-8deg) scale(1.3)", userSelect: "none", fontFamily: FONT }}>
        {Array.from({ length: 8 }, (_, k) => <div key={k} style={{ whiteSpace: "nowrap", marginLeft: k % 2 ? -120 : 0 }}>CIRE CITA CIRE CITA</div>)}
      </div>

      <div style={S.caja}>
        <div style={{ textAlign: "center", color: C.sobre, marginBottom: 12, filter: "drop-shadow(0 2px 8px rgba(var(--c-sombra),.25))" }}>
          <LogoCire size={170} />
        </div>

        <Titulo>{sinSlug ? <>Elige tu<br />sucursal</> : titulo}</Titulo>

        {!sinSlug && sucursal && (
          <div style={{ ...S.tarjeta, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: 22 }}>
            <Pin />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.verde, lineHeight: 1.1 }}>Sucursal {sucursal}</div>
              <div style={{ fontSize: 13, color: C.suave }}>Agenda en línea</div>
            </div>
            <button style={{ ...S.link, color: C.verde, padding: 4, fontSize: 12 }} onClick={() => { history.pushState(null, "", "/agendar"); setSlug(""); setInfo(null); setModo("inicio"); setErr(""); }}>Cambiar</button>
          </div>
        )}

        {err && (
          <div role="alert" style={{ background: C.rosa, color: "#fff", border: "3px solid #fff", borderRadius: 18, padding: "12px 16px", marginBottom: 14, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{err}</div>
        )}

        {sinSlug && (
          <>
            {!lista && !err && <div style={{ color: C.sobre, fontWeight: 600 }}>Cargando…</div>}
            {lista?.map((s) => (
              <button key={s.slug} onClick={() => elegirSucursal(s)} style={{ ...S.tarjeta, display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: FONT, padding: "14px 20px" }}>
                <Pin />
                <span style={{ fontWeight: 800, fontSize: 20, color: C.verde }}>CIRE {s.nombre}</span>
              </button>
            ))}
          </>
        )}

        {!sinSlug && sucursal && modo === "inicio" && (
          <>
            {pendiente && (
              <button onClick={() => { setErr(""); setModo("asegurar"); }} style={{ ...S.tarjeta, display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", border: "3px solid #fff", cursor: "pointer", fontFamily: FONT, padding: "18px 20px", background: C.rosa }}>
                <span style={{ fontSize: 30 }}>📎</span>
                <span>
                  <span style={{ display: "block", fontWeight: 800, fontSize: 18, color: "#fff" }}>Subir mi comprobante</span>
                  <span style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,.9)", marginTop: 2 }}>Tienes un anticipo pendiente de confirmar</span>
                </span>
              </button>
            )}
            {opcion("✨", "Agendar mi primera cita", "Es mi primera vez: elige tu servicio, día y hora", () => { setErr(""); setModo("nueva"); }, true)}
            {opcion("🔁", "Reagendar mi cita", "Ya tengo cita y quiero cambiarla", () => { setErr(""); setModo("reagendar"); })}
            {opcion("🪪", "Tengo un paquete y no he agendado mi siguiente sesión", "Agenda aquí tu siguiente sesión", () => { setErr(""); setModo("siguiente"); })}
          </>
        )}

        {!sinSlug && sucursal && modo === "nueva" && <AgendarNueva key={slug} api={api} slug={slug} sucursal={sucursal} info={info} onVolver={() => { volver(); setTitulo2(""); }} setErr={setErr} setTitulo={setTitulo2} />}
        {!sinSlug && sucursal && modo === "asegurar" && pendiente && <RetomarApartado api={api} sucursal={sucursal} info={info} pendiente={pendiente} setErr={setErr} onSalir={volver} />}
        {!sinSlug && sucursal && modo === "siguiente" && <AgendarSiguienteClienta key={slug} token={tokenUrl() || undefined} slug={slug} onVolver={volver} setErr={setErr} />}
        {!sinSlug && sucursal && modo === "reagendar" && <Reagendar key={slug} api={api} sucursal={sucursal} info={info} onVolver={volver} setErr={setErr} />}

        {/* Pie en todas las pantallas */}
        <div style={{ textAlign: "center", marginTop: 32, fontSize: 12, fontWeight: 500, color: C.sobre, opacity: 0.9, textShadow: "0 1px 6px rgba(var(--c-sombra),.25)" }}>
          <a href="https://e320-landing.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>Creado por e320.tech</a>
        </div>
      </div>
    </div>
  );
}
