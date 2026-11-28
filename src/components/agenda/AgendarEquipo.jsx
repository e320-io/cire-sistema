import React, { useEffect, useMemo, useState } from "react";
import { C, S, FONT, Loto, Titulo, Calendario, crearApi, estiloTema, cap, fechaLarga, h12 } from "./ui.jsx";

// /agendar-equipo — variante INTERNA de /agendar para ventas y recepción (no es pública: pide usuario y contraseña del sistema).
// Busca hueco en TODAS las sucursales a la vez (ventas no tiene acceso a todos los calendarios), arma el paquete (cualquier servicio del
// catálogo + zonas individuales extra, con duración y precio ajustables), deja una nota y agenda directo en el Calendar de la sucursal.
// Toda la lógica vive en la edge function agenda-publica (acciones equipo_*), que valida usuario + hash de system_users.

const CLAVE = "cire_equipo_agenda";
const pesos = (n) => (n > 0 ? "$" + Math.round(n).toLocaleString("en-US") : "Sin costo");
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esCombo = (g) => /^combo/i.test(g.categoria);
const hashPassword = async (pass) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("CIRE_2026:" + pass));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const leerSesion = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE) || "null"); } catch { return null; } };

const api = crearApi("");

export default function AgendarEquipo() {
  const [cred, setCred] = useState(leerSesion);
  const [err, setErr] = useState("");
  const [cargando, setCargando] = useState(false);
  const [paso, setPaso] = useState("paquete"); // paquete | horarios | datos | listo
  const [user, setUser] = useState(""); const [pass, setPass] = useState("");

  const [cat, setCat] = useState(null); // { grupos, sucursales }
  const [q, setQ] = useState(""); const [abierta, setAbierta] = useState("");
  const [sv, setSv] = useState(null); const [extras, setExtras] = useState([]);
  const [zonaAbierta, setZonaAbierta] = useState(false); const [qz, setQz] = useState("");
  const [durMan, setDurMan] = useState(""); const [precioMan, setPrecioMan] = useState("");
  const [slugs, setSlugs] = useState([]); // filtro de sucursales ([] = todas)

  const [res, setRes] = useState(null);
  const [dia, setDia] = useState(""); const [mes, setMes] = useState("");
  const [sel, setSel] = useState(null); // { slug, nombre, hora, especial }

  const [nombre, setNombre] = useState(""); const [tel, setTel] = useState(""); const [nota, setNota] = useState("");
  const [anticipo, setAnticipo] = useState(false); const [avisarClienta, setAvisarClienta] = useState(true);
  const [listo, setListo] = useState(null);

  useEffect(() => {
    document.title = "Agenda del equipo · CIRE"; document.body.style.margin = "0";
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"; document.head.appendChild(l);
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.appendChild(m);
  }, []);

  const correr = async (fn) => {
    setErr(""); setCargando(true);
    try { await fn(); } catch (e) {
      if (/Sesión no válida/.test(e.message)) { sessionStorage.removeItem(CLAVE); setCred(null); }
      setErr(e.message);
    }
    setCargando(false);
  };
  const llamar = (accion, datos = {}) => api(accion, { ...cred, ...datos });

  const entrar = (ev) => {
    ev.preventDefault();
    correr(async () => {
      if (!user.trim() || !pass) throw new Error("Escribe tu usuario y contraseña del sistema.");
      const c = { usuario: user.trim(), hash: await hashPassword(pass) };
      const j = await api("equipo_servicios", c); // valida la sesión y trae el catálogo
      sessionStorage.setItem(CLAVE, JSON.stringify(c));
      setCat(j); setCred(c); setPass("");
    });
  };
  const salir = () => { sessionStorage.removeItem(CLAVE); setCred(null); setCat(null); reiniciar(); };

  useEffect(() => {
    if (!cred || cat) return;
    correr(async () => { const j = await llamar("equipo_servicios"); setCat(j); });
  }, [cred]); // eslint-disable-line
  useEffect(() => { if (cat && !abierta) setAbierta(cat.grupos.find(esCombo)?.categoria || ""); }, [cat]); // eslint-disable-line

  const reiniciar = () => {
    setPaso("paquete"); setSv(null); setExtras([]); setDurMan(""); setPrecioMan(""); setRes(null); setDia(""); setSel(null);
    setNombre(""); setTel(""); setNota(""); setAnticipo(false); setAvisarClienta(true); setListo(null); setQ(""); setErr("");
  };

  const durCalc = sv ? sv.duracionMin + extras.reduce((a, e) => a + e.duracionMin, 0) : 0;
  const precioCalc = sv ? sv.precio + extras.reduce((a, e) => a + e.precio, 0) : 0;
  const durFinal = Number(durMan) >= 15 ? Number(durMan) : durCalc;
  const precioFinal = precioMan !== "" && Number(precioMan) >= 0 ? Number(precioMan) : precioCalc;
  const cambiaPaquete = () => { setDurMan(""); setPrecioMan(""); };

  const buscar = () => correr(async () => {
    const j = await llamar("equipo_disponibilidad", { servicioId: sv.id, extras: extras.map((e) => e.id), duracionMin: durFinal, precio: precioFinal, slugs });
    const todas = fechasDe(j);
    setRes(j); setDia(todas[0] || ""); setMes(todas[0] ? todas[0].slice(0, 7) : ""); setSel(null); setPaso("horarios");
  });
  const fechasDe = (j) => [...new Set((j?.sucursales || []).flatMap((s) => [...Object.keys(s.dias), ...Object.keys(s.especiales || {})]))].sort();
  const diasCal = useMemo(() => Object.fromEntries(fechasDe(res).map((f) => [f, [1]])), [res]); // eslint-disable-line

  const agendar = () => correr(async () => {
    const j = await llamar("equipo_agendar", {
      slug: sel.slug, servicioId: sv.id, extras: extras.map((e) => e.id), duracionMin: res.duracionMin, precio: res.precio,
      nombre, telefono: tel, fecha: dia, hora: sel.hora, nota, anticipo, confirmarClienta: avisarClienta,
    });
    setListo(j); setPaso("listo");
  });

  const todosItems = (cat?.grupos || []).flatMap((g) => g.items.map((i) => ({ ...i, categoria: g.categoria })));
  const busca = norm(q).trim(), buscaZ = norm(qz).trim();
  const catalogo = (cat?.grupos || []).filter((g) => g.categoria !== "Empieza aquí");
  const resultados = busca ? catalogo.map((g) => ({ ...g, items: g.items.filter((i) => norm(i.nombre).includes(busca) || norm(g.categoria).includes(busca)) })).filter((g) => g.items.length) : catalogo;
  const zonas = todosItems.filter((i) => !/^combo/i.test(i.categoria) && i.id !== "valoracion" && (!buscaZ || norm(i.nombre).includes(buscaZ) || norm(i.categoria).includes(buscaZ))).slice(0, 40);

  const fila = (i, onClick, accion) => (
    <button key={i.id} onClick={() => onClick(i)} disabled={cargando}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: C.menta, border: "none", borderRadius: 14, padding: "11px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", color: C.verde }}>
      <span>
        <span style={{ display: "block", fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{i.nombre}</span>
        {i.sucursales && <span style={{ display: "block", fontSize: 11, color: C.suave, marginTop: 2 }}>Solo en: {i.sucursales.join(", ")}</span>}
        {i.incluye && <span style={{ display: "block", fontSize: 12, color: C.suave, marginTop: 3, lineHeight: 1.35 }}>Incluye: {i.incluye}</span>}
      </span>
      <span style={{ fontSize: 12, color: C.suave, textAlign: "right", flex: "0 0 auto" }}>
        <b style={{ display: "block", color: C.verde, fontSize: 14 }}>{pesos(i.precio)}</b>{i.duracionMin} min{accion ? <b style={{ display: "block", color: C.rosa }}>{accion}</b> : null}
      </span>
    </button>
  );
  const desplegable = (clave, titulo, contenido) => {
    const on = !!busca || abierta === clave;
    return (
      <div key={clave} style={{ marginBottom: 8 }}>
        <button onClick={() => setAbierta(on && !busca ? "" : clave)} style={{ display: "flex", justifyContent: "space-between", width: "100%", background: on ? C.verde : C.verdeMedio, color: "#fff", border: "none", borderRadius: 14, padding: "12px 14px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: on ? 8 : 0, textAlign: "left" }}>
          <span>{titulo}</span><span>{on ? "▲" : "▼"}</span>
        </button>
        {on && contenido}
      </div>
    );
  };
  const chip = (activo) => ({ padding: "8px 14px", borderRadius: 999, border: `2px solid ${activo ? C.verde : C.menta}`, background: activo ? C.verde : C.menta, color: activo ? "#fff" : C.verde, fontWeight: 700, fontSize: 13, fontFamily: FONT, cursor: "pointer" });
  const pildora = sv && (
    <div style={S.pildora}>
      <b>{sv.nombre}</b>{extras.map((e, k) => <span key={k}> + {e.nombre}</span>)}
      <div style={{ opacity: 0.9, marginTop: 2 }}>{(res?.duracionMin ?? durFinal)} min · {pesos(res?.precio ?? precioFinal)}</div>
    </div>
  );
  const sucursalesTxt = (cat?.sucursales || []).map((s) => s.nombre).join(", ");

  return (
    <div style={{ ...S.pagina, ...estiloTema("cielo") }}>
      <div style={S.caja}>
        <div style={{ textAlign: "center", color: C.sobre, marginBottom: 18, textShadow: "0 1px 8px rgba(var(--c-sombra),.3)" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.32em", fontWeight: 500, marginBottom: 2 }}>ARTE EN DEPILACIÓN</div>
          <Loto />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "0.04em", lineHeight: 1, marginTop: 2 }}>CIRE</div>
        </div>
        <Titulo size={32}>Agenda<br />del equipo</Titulo>
        <div style={{ ...S.pildora, background: C.verde, fontSize: 12, padding: "8px 14px" }}>🔒 Uso interno: busca espacio en todas las sucursales y agenda directo en su calendario.</div>

        {err && <div role="alert" style={{ background: C.rosa, color: "#fff", border: "3px solid #fff", borderRadius: 18, padding: "12px 16px", marginBottom: 14, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{err}</div>}

        {!cred && (
          <form onSubmit={entrar} style={S.tarjeta}>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 4 }}>Entra con tu usuario del sistema</div>
            <div style={{ fontSize: 13, color: C.suave, marginBottom: 14 }}>Es el mismo usuario y contraseña con el que entras al sistema de CIRE.</div>
            <label style={S.etiqueta}>Usuario</label>
            <input style={S.input} value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoComplete="username" />
            <label style={S.etiqueta}>Contraseña</label>
            <input style={S.input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
            <button style={S.boton(!cargando)} disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
          </form>
        )}

        {cred && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: C.enlace, fontSize: 12, fontWeight: 600, margin: "-4px 4px 10px" }}>
            <span>👤 {cred.usuario}</span><button style={{ ...S.link, fontSize: 12, padding: 0 }} onClick={salir}>Salir</button>
          </div>
        )}

        {cred && !cat && !err && <div style={S.pildora}>Cargando el catálogo…</div>}

        {/* 1. PAQUETE */}
        {cred && cat && paso === "paquete" && (
          <>
            {!sv ? (
              <>
                <div style={S.tarjeta}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 4 }}>1. Elige el paquete o servicio</div>
                  <div style={{ fontSize: 13, color: C.suave, marginBottom: 10 }}>Después puedes sumar zonas y ajustar tiempo y precio.</div>
                  <input style={{ ...S.input, marginBottom: 10 }} placeholder="Buscar: bikini, combo, rostro…" value={q} onChange={(e) => setQ(e.target.value)} />
                  {resultados.length === 0 && <div style={{ fontSize: 14, color: C.suave }}>Sin resultados para esa búsqueda.</div>}
                  {resultados.filter(esCombo).map((g) => desplegable(g.categoria, g.categoria, g.items.map((i) => fila(i, (x) => { setSv(x); cambiaPaquete(); })))) }
                  {resultados.filter((g) => !esCombo(g)).map((g) => desplegable(g.categoria, g.categoria, g.items.map((i) => fila(i, (x) => { setSv(x); cambiaPaquete(); }))))}
                </div>
                {cat.grupos[0]?.items.find((i) => i.id === "valoracion") && (
                  <button style={{ ...S.link, display: "block", margin: "0 auto 10px" }} onClick={() => { setSv(cat.grupos[0].items.find((i) => i.id === "valoracion")); cambiaPaquete(); }}>💬 Agendar una valoración</button>
                )}
              </>
            ) : (
              <>
                {pildora}
                <div style={S.tarjeta}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: C.verde }}>2. Arma el paquete</div>
                    <button style={{ ...S.link, padding: 0, fontSize: 13 }} onClick={() => { setSv(null); setExtras([]); cambiaPaquete(); }}>Cambiar paquete</button>
                  </div>
                  <div style={{ fontSize: 14, color: C.texto, marginBottom: 10 }}><b>{sv.nombre}</b> · {sv.duracionMin} min · {pesos(sv.precio)}{sv.incluye ? <div style={{ fontSize: 12, color: C.suave, marginTop: 3 }}>Incluye: {sv.incluye}</div> : null}</div>

                  {extras.map((e, k) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, background: C.menta, borderRadius: 14, padding: "9px 12px", marginBottom: 8 }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.verde }}>＋ {e.nombre}<span style={{ fontWeight: 500, color: C.suave }}> · {e.duracionMin} min · {pesos(e.precio)}</span></span>
                      <button aria-label="Quitar zona" style={{ ...S.link, padding: "4px 8px", color: C.rosa }} onClick={() => { setExtras(extras.filter((_, j) => j !== k)); cambiaPaquete(); }}>✕</button>
                    </div>
                  ))}
                  {extras.length < 6 && !zonaAbierta && (
                    <button style={{ ...chip(false), width: "100%", marginBottom: 6 }} onClick={() => { setZonaAbierta(true); setQz(""); }}>＋ Añadir zona individual</button>
                  )}
                  {zonaAbierta && (
                    <div style={{ border: `2px dashed ${C.gris}`, borderRadius: 16, padding: 10, marginBottom: 8 }}>
                      <input style={{ ...S.input, marginBottom: 8 }} autoFocus placeholder="Buscar zona: axilas, bikini, piernas…" value={qz} onChange={(e) => setQz(e.target.value)} />
                      <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {zonas.map((z) => fila(z, (x) => { setExtras([...extras, x]); setZonaAbierta(false); cambiaPaquete(); }, "Añadir"))}
                        {zonas.length === 0 && <div style={{ fontSize: 13, color: C.suave, padding: 6 }}>No hay zonas con ese nombre.</div>}
                      </div>
                      <button style={S.link} onClick={() => setZonaAbierta(false)}>Cancelar</button>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={S.etiqueta}>Duración (min)</label>
                      <input style={{ ...S.input, marginBottom: 4 }} inputMode="numeric" placeholder={String(durCalc)} value={durMan} onChange={(e) => setDurMan(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                    </div>
                    <div>
                      <label style={S.etiqueta}>Precio total ($)</label>
                      <input style={{ ...S.input, marginBottom: 4 }} inputMode="numeric" placeholder={String(Math.round(precioCalc))} value={precioMan} onChange={(e) => setPrecioMan(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.suave, marginBottom: 12 }}>Calculado: {durCalc} min · {pesos(precioCalc)}. Déjalos vacíos para usar lo calculado.</div>

                  <label style={S.etiqueta}>Sucursales donde buscar</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                    <button style={chip(slugs.length === 0)} onClick={() => setSlugs([])}>Todas</button>
                    {(cat.sucursales || []).map((s) => <button key={s.slug} style={chip(slugs.includes(s.slug))} onClick={() => setSlugs(slugs.includes(s.slug) ? slugs.filter((x) => x !== s.slug) : [...slugs, s.slug])}>{s.nombre}</button>)}
                  </div>
                </div>
                <button style={S.boton(!cargando)} disabled={cargando} onClick={buscar}>{cargando ? "Buscando espacios…" : "🔎 Buscar espacio"}</button>
              </>
            )}
          </>
        )}

        {/* 2. HORARIOS EN TODAS LAS SUCURSALES */}
        {cred && paso === "horarios" && res && (
          <>
            {pildora}
            {fechasDe(res).length === 0 ? (
              <div style={S.tarjeta}>
                <div style={{ fontWeight: 800, color: C.verde, marginBottom: 6 }}>No hay espacios</div>
                <div style={{ fontSize: 14 }}>Ninguna sucursal tiene un hueco de {res.duracionMin} min en los próximos días. Prueba con menos zonas, otro tiempo o más sucursales.</div>
              </div>
            ) : (
              <div style={S.tarjeta}>
                <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 12 }}>Elige el día</div>
                <Calendario dias={diasCal} dia={dia} mes={mes} setMes={setMes} onPick={(d) => { setDia(d); setSel(null); }} />
                <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, margin: "22px 0 2px" }}>Espacios · {cap(fechaLarga(dia))}</div>
                <div style={{ fontSize: 12, color: C.suave, marginBottom: 10 }}>Cada sucursal usa su propio calendario.</div>
                {res.sucursales.map((s) => {
                  const normales = s.dias[dia] || [], esp = (s.especiales || {})[dia] || [];
                  return (
                    <div key={s.slug} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, color: C.verde, fontSize: 15, marginBottom: 6 }}>CIRE {s.nombre}{s.error ? <span style={{ color: C.rosa, fontWeight: 600, fontSize: 12 }}> · {s.error}</span> : null}</div>
                      {!normales.length && !esp.length && !s.error && <div style={{ fontSize: 13, color: C.suave }}>Sin espacio este día.</div>}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                        {normales.map((h) => <button key={h} style={S.hora(sel?.slug === s.slug && sel.hora === h)} onClick={() => setSel({ slug: s.slug, nombre: s.nombre, hora: h, especial: false })}>{h}</button>)}
                        {esp.map((h) => <button key={"e" + h} title="Termina después del cierre" style={{ ...S.hora(sel?.slug === s.slug && sel.hora === h), borderStyle: "dashed" }} onClick={() => setSel({ slug: s.slug, nombre: s.nombre, hora: h, especial: true })}>⚠️ {h}</button>)}
                      </div>
                      {esp.length > 0 && <div style={{ fontSize: 11, color: C.suave, marginTop: 4 }}>⚠️ = termina después del cierre de {h12((s.horarios || {})[dia]?.[1] || "")}; queda anotado en el evento.</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {sel && <button style={S.boton(true)} onClick={() => { setPaso("datos"); setErr(""); }}>Continuar · CIRE {sel.nombre} · {sel.hora}</button>}
            <button style={S.link} onClick={() => { setPaso("paquete"); setErr(""); }}>← Cambiar paquete o tiempo</button>
          </>
        )}

        {/* 3. DATOS DE LA CLIENTA */}
        {cred && paso === "datos" && res && sel && (
          <>
            <div style={S.pildora}>
              <b>CIRE {sel.nombre}</b> · {cap(fechaLarga(dia))} · {sel.hora}{sel.especial ? " ⚠️ (fuera de horario)" : ""}
              <div style={{ marginTop: 2 }}>{sv.nombre}{extras.map((e) => ` + ${e.nombre}`).join("")} · {res.duracionMin} min · {pesos(res.precio)}</div>
            </div>
            <div style={S.tarjeta}>
              <div style={{ fontWeight: 800, fontSize: 18, color: C.verde, marginBottom: 12 }}>Datos de la clienta</div>
              <label style={S.etiqueta}>Nombre (y apellido)</label>
              <input style={S.input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
              <label style={S.etiqueta}>Celular (10 dígitos)</label>
              <input style={S.input} inputMode="numeric" value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, "").slice(0, 10))} autoComplete="off" />
              <label style={S.etiqueta}>Nota para la cita (opcional)</label>
              <textarea style={{ ...S.input, minHeight: 80, resize: "vertical" }} maxLength={500} placeholder="Ej.: viene por recomendación de Ana, prefiere cabina con ventana, alergia al látex…" value={nota} onChange={(e) => setNota(e.target.value)} />
              <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: C.texto, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={anticipo} onChange={(e) => setAnticipo(e.target.checked)} style={{ width: 20, height: 20 }} /> Ya mandó su anticipo (💰 en lugar de 🧊)
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: C.texto, cursor: "pointer" }}>
                <input type="checkbox" checked={avisarClienta} onChange={(e) => setAvisarClienta(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
                <span>Enviarle por WhatsApp la confirmación de su cita y las indicaciones<span style={{ display: "block", fontSize: 12, color: C.suave }}>Solo sale si está activado para esa sucursal.</span></span>
              </label>
            </div>
            {(() => { const ok = nombre.trim().length >= 3 && tel.length === 10 && !cargando; return <button style={S.boton(ok)} disabled={!ok} onClick={agendar}>{cargando ? "Agendando…" : "✓ Agendar cita"}</button>; })()}
            <button style={S.link} onClick={() => { setPaso("horarios"); setErr(""); }}>← Cambiar horario</button>
          </>
        )}

        {/* 4. LISTO */}
        {cred && paso === "listo" && listo && (
          <>
            <div style={S.tarjeta}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
                <div style={{ background: C.verde, color: "#fff", borderRadius: "50%", width: 52, height: 52, display: "grid", placeItems: "center", fontSize: 28, flex: "0 0 auto" }}>✓</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: C.verde }}>{listo.hora} – {listo.horaFin}</div>
                  <div style={{ fontSize: 14, color: C.suave }}>{cap(fechaLarga(listo.fecha))} · CIRE {listo.sucursal}</div>
                  <div style={{ fontSize: 13, color: C.suave }}>{listo.servicio} · {pesos(listo.precio)}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                Ya quedó en el calendario de la sucursal y se avisó al equipo por WhatsApp.<br />
                {listo.confirmacionClienta ? "📲 Se le está enviando a la clienta su confirmación con las indicaciones." : "La confirmación por WhatsApp a la clienta no salió (no está activada para esa sucursal o la apagaste): avísale tú."}
              </div>
            </div>
            <button style={S.boton(true)} onClick={reiniciar}>＋ Agendar otra cita</button>
          </>
        )}
        <div style={{ textAlign: "center", fontSize: 11, color: C.enlace, opacity: 0.8, marginTop: 18 }}>{sucursalesTxt && `Sucursales con agenda: ${sucursalesTxt}`}</div>
      </div>
    </div>
  );
}
