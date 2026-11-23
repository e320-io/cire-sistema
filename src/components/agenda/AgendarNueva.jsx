import React, { useEffect, useState } from "react";
import { C, S, cap, fechaLarga, Pasos, Calendario } from "./ui.jsx";
import AseguraLugar, { guardarPendiente } from "./AseguraLugar.jsx";
import CierreCita from "./CierreCita.jsx";

// Flujo "Agendar mi cita": datos -> servicio (catálogo del sistema) -> día/hora (duración del servicio) -> reservar.
const ETAPAS = ["Tus datos", "Servicio", "Horario", "Asegura tu lugar"];
const pesos = (n) => (n > 0 ? "$" + Math.round(n).toLocaleString("en-US") : "");
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const esCombo = (g) => /^combo/i.test(g.categoria);
const esZona = (g) => /^l[aá]ser/i.test(g.categoria);
const nombreZona = (c) => c.replace(/^l[aá]ser\s+\w+\s*-\s*/i, ""); // "Láser Mujer - Rostro" -> "Rostro"

export default function AgendarNueva({ api, slug, sucursal, info, onVolver, setErr, setTitulo }) {
  const [paso, setPaso] = useState("datos"); // datos | servicio | horarios | asegura | listo
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [web, setWeb] = useState(""); // honeypot: las personas no lo ven ni lo llenan
  const [grupos, setGrupos] = useState(null);
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState("");
  const [sv, setSv] = useState(null);
  const [dias, setDias] = useState({});
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [hora, setHora] = useState("");
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(null);

  const correr = async (fn) => { setErr(""); setCargando(true); try { await fn(); } catch (e) { setErr(e.message); } setCargando(false); };

  useEffect(() => { setTitulo?.(paso === "asegura" ? "asegura" : ""); }, [paso]); // eslint-disable-line

  useEffect(() => {
    if (paso !== "servicio" || grupos) return;
    correr(async () => { const j = await api("servicios"); setGrupos(j.grupos); setAbierta(j.grupos.find((g) => esCombo(g))?.categoria || "zonas"); });
  }, [paso]); // eslint-disable-line

  const continuar = (ev) => {
    ev.preventDefault();
    if (nombre.trim().split(/\s+/).length < 2) return setErr("Escribe tu nombre y apellido.");
    if (tel.replace(/\D/g, "").length < 10) return setErr("Escribe tu celular a 10 dígitos.");
    setErr(""); setPaso("servicio");
  };
  const elegir = (s) => correr(async () => {
    const j = await api("disponibilidad_nueva", { servicioId: s.id });
    const fechas = Object.keys(j.dias);
    if (!fechas.length) throw new Error("No hay horarios disponibles para ese servicio en los próximos días. Escríbenos por WhatsApp.");
    setSv({ ...s, duracionMin: j.duracionMin }); setDias(j.dias); setDia(fechas[0]); setMes(fechas[0].slice(0, 7)); setHora(""); setPaso("horarios");
  });
  const reservar = () => correr(async () => {
    const j = await api("agendar", { nombre, telefono: tel, servicioId: sv.id, fecha: dia, hora, web });
    setListo(j);
    if (j.anticipo && j.reservaId) { guardarPendiente({ slug, reservaId: j.reservaId, telefono: tel }); setPaso("asegura"); } // la valoración no lleva anticipo
    else setPaso("listo");
  });

  const valoracion = grupos?.flatMap((g) => g.items).find((i) => i.id === "valoracion");
  const catalogo = (grupos || []).filter((g) => g.categoria !== "Empieza aquí");
  const busca = norm(q).trim();
  const resultados = busca ? catalogo.map((g) => ({ ...g, items: g.items.filter((i) => norm(i.nombre).includes(busca) || norm(g.categoria).includes(busca)) })).filter((g) => g.items.length) : catalogo;

  const fila = (i) => (
    <button key={i.id} disabled={cargando} onClick={() => elegir(i)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: C.menta, border: "none", borderRadius: 14, padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", color: C.verde }}>
      <span>
        <span style={{ display: "block", fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{i.nombre}</span>
        {i.incluye && <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.suave, marginTop: 3, lineHeight: 1.35 }}>Incluye: {i.incluye}</span>}
      </span>
      <span style={{ fontSize: 12, color: C.suave, textAlign: "right", flex: "0 0 auto" }}>
        {pesos(i.precio) && <b style={{ display: "block", color: C.verde, fontSize: 14 }}>{pesos(i.precio)}</b>}{i.duracionMin} min
      </span>
    </button>
  );

  const desplegable = (clave, titulo, contenido) => {
    const abiertaG = !!busca || abierta === clave;
    return (
      <div key={clave} style={{ marginBottom: 8 }}>
        <button onClick={() => setAbierta(abiertaG && !busca ? "" : clave)}
          style={{ display: "flex", justifyContent: "space-between", width: "100%", background: abiertaG ? C.verde : C.verdeMedio, color: "#fff", border: "none", borderRadius: 14, padding: "12px 14px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: abiertaG ? 8 : 0, textAlign: "left" }}>
          <span>{titulo}</span><span>{abiertaG ? "–" : "+"}</span>
        </button>
        {abiertaG && contenido}
      </div>
    );
  };

  return (
    <>
      {paso !== "listo" && <Pasos n={paso === "datos" ? 1 : paso === "servicio" ? 2 : paso === "horarios" ? 3 : 4} etapas={sv?.id === "valoracion" ? ETAPAS.slice(0, 3) : ETAPAS} />}

      {paso === "datos" && (
        <>
          <form style={S.tarjeta} onSubmit={continuar}>
            <label style={S.etiqueta}>Tu nombre completo</label>
            <input style={S.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" required />
            <label style={S.etiqueta}>Tu celular (10 dígitos)</label>
            <input style={S.input} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="5512345678" inputMode="tel" autoComplete="tel" required />
            <input value={web} onChange={(e) => setWeb(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            <div style={{ fontSize: 12, color: C.suave, margin: "-4px 4px 14px" }}>Usaremos tu celular para confirmar tu cita por WhatsApp.</div>
            <button style={S.boton(true)}>Continuar</button>
          </form>
          <button style={S.link} onClick={onVolver}>← Volver</button>
        </>
      )}

      {paso === "servicio" && (
        <>
          <div style={S.tarjeta}>
            <div style={{ fontWeight: 800, fontSize: 20, color: C.verde, marginBottom: 4 }}>Elige tu servicio</div>
            <div style={{ fontSize: 13, color: C.suave, marginBottom: 12 }}>Agendas tu 1ª sesión. La duración es la de cada sesión.</div>
            <input style={S.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: axilas, bikini, piernas…" />
            {!grupos && <div style={{ color: C.suave, fontSize: 14 }}>Cargando servicios…</div>}
            {grupos && !resultados.length && <div style={{ color: C.suave, fontSize: 14 }}>No encontramos ese servicio. Prueba con otra palabra.</div>}
            {resultados.filter(esCombo).map((g) => desplegable(g.categoria, g.categoria, g.items.map(fila)))}
            {resultados.some(esZona) && desplegable("zonas", "O si prefieres zonas individuales…", resultados.filter(esZona).map((g) => (
              <div key={g.categoria}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.suave, margin: "8px 4px" }}>{nombreZona(g.categoria)}</div>
                {g.items.map(fila)}
              </div>
            )))}
            {resultados.filter((g) => !esCombo(g) && !esZona(g)).map((g) => desplegable(g.categoria, g.categoria, g.items.map(fila)))}
          </div>
          {valoracion && (
            <button disabled={cargando} onClick={() => elegir(valoracion)}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "rgba(255,255,255,.35)", border: "2px dashed #fff", borderRadius: 20, padding: "14px 16px", marginBottom: 6, cursor: "pointer", fontFamily: "inherit", color: C.verde }}>
              <span style={{ fontSize: 26 }}>💬</span>
              <span>
                <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>¿No sabes qué necesitas?</span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>Agenda una valoración y te asesoramos · {valoracion.duracionMin} min</span>
              </span>
            </button>
          )}
          <button style={S.link} onClick={() => { setPaso("datos"); setErr(""); }}>← Volver</button>
        </>
      )}

      {paso === "horarios" && sv && (
        <>
          <div style={S.pildora}>
            <span style={{ opacity: 0.85 }}>Tu servicio:</span> <b>{sv.nombre}</b> · {sv.duracionMin} min{pesos(sv.precio) ? ` · ${pesos(sv.precio)}` : ""}
          </div>
          <div style={S.tarjeta}>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 12 }}>Elige el día</div>
            <Calendario dias={dias} dia={dia} mes={mes} setMes={setMes} onPick={(d) => { setDia(d); setHora(""); }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, margin: "22px 0 4px" }}>Elige la hora</div>
            <div style={{ fontSize: 13, color: C.suave, marginBottom: 12 }}>{cap(fechaLarga(dia))}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {(dias[dia] || []).map((h) => <button key={h} style={S.hora(h === hora)} onClick={() => setHora(h)}>{h}</button>)}
            </div>
          </div>
          <button style={S.boton(!!hora && !cargando)} disabled={!hora || cargando} onClick={reservar}>
            {cargando ? "Reservando…" : hora ? `Reservar ${cap(fechaLarga(dia))} · ${hora}` : "Elige una hora"}
          </button>
          <button style={S.link} onClick={() => { setPaso("servicio"); setErr(""); }}>← Cambiar servicio</button>
        </>
      )}

      {paso === "asegura" && listo && (
        <AseguraLugar api={api} sucursal={sucursal} info={info} d={{ ...listo, telefono: tel }} setErr={setErr} onSalir={onVolver} />
      )}

      {paso === "listo" && listo && (
        <>
        <div style={S.tarjeta}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
            <div style={{ background: C.verde, color: "#fff", borderRadius: "50%", width: 52, height: 52, display: "grid", placeItems: "center", fontSize: 28, flex: "0 0 auto" }}>✓</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20, color: C.verde }}>{listo.hora} – {listo.horaFin}</div>
              <div style={{ fontSize: 14, color: C.suave }}>{cap(fechaLarga(listo.fecha))}</div>
              <div style={{ fontSize: 13, color: C.suave }}>{listo.servicio}</div>
            </div>
          </div>
          <div style={{ ...S.pildora, marginBottom: 10 }}>Tu cita en CIRE {sucursal} quedó reservada.</div>
          <div style={{ fontSize: 13, color: C.suave, lineHeight: 1.5 }}>
            Te escribiremos por WhatsApp para confirmar tu cita{listo.servicio === "Valoración" ? "" : " y coordinar tu anticipo"}. Si necesitas cambiarla, entra de nuevo a este link y elige <b>Reagendar mi cita</b> (hasta {listo.reagendarHoras ?? 12} h antes).
          </div>
        </div>
        <CierreCita info={info || { nombre: sucursal }} fecha={listo.fecha} hora={listo.hora} horaFin={listo.horaFin} servicio={listo.servicio} />
        </>
      )}
    </>
  );
}
