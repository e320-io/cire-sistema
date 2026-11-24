import React, { useEffect, useState } from "react";
import { C, S, FONT, Loto, Pin, Titulo, estiloTema } from "../agenda/ui.jsx";
import { apiOpiniones } from "../../lib/opiniones.js";

// Página pública que abre el QR de cada sucursal:
//   /opinion/<sucursal>  -> "¿Cómo fue tu experiencia?" con 5 caritas.
//     5 estrellas -> gracias + botón a la reseña de Google.
//     1 a 4       -> se queda en privado: qué falló + comentario (+ contacto opcional). Llega al panel del sistema.
//   /opinion            -> elige sucursal (por si alguien llega sin QR).

const slugUrl = () => (location.pathname.match(/^\/opinion\/([^/]+)/) || [])[1] || "";
const CARAS = [["😡", "Muy mal"], ["🙁", "Mal"], ["😐", "Regular"], ["🙂", "Bien"], ["😍", "¡Excelente!"]];
const CATEGORIAS = [["servicio", "El servicio"], ["atencion", "La atención"], ["limpieza", "Limpieza"], ["puntualidad", "Puntualidad"], ["precio", "Precio"], ["otro", "Otro"]];

export default function OpinionPublica() {
  const [slug, setSlug] = useState(slugUrl());
  const [info, setInfo] = useState(null);
  const [lista, setLista] = useState(null);
  const [err, setErr] = useState("");
  const [paso, setPaso] = useState("calificar"); // calificar | detalle | gracias5 | gracias
  const [op, setOp] = useState(null); // { id, calificacion, googleUrl }
  const [cats, setCats] = useState([]);
  const [coment, setComent] = useState("");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    document.title = "Tu opinión · CIRE";
    document.body.style.margin = "0";
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
  useEffect(() => {
    setErr("");
    if (slug) apiOpiniones("info", { slug }).then(setInfo).catch((e) => setErr(e.message));
    else apiOpiniones("sucursales").then((j) => setLista(j.sucursales)).catch((e) => setErr(e.message));
  }, [slug]);

  const calificar = async (n) => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    try {
      const j = await apiOpiniones("calificar", { slug, calificacion: n });
      setOp({ id: j.id, calificacion: n, googleUrl: j.googleUrl });
      setPaso(n === 5 ? "gracias5" : "detalle");
    } catch (e) { setErr(e.message); }
    setOcupado(false);
  };
  const enviar = async () => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    try {
      await apiOpiniones("detalle", { id: op.id, categorias: cats, comentario: coment, nombre, telefono: tel });
      setPaso("gracias");
    } catch (e) { setErr(e.message); }
    setOcupado(false);
  };
  const irGoogle = () => { apiOpiniones("google", { id: op.id }).catch(() => {}); };
  const alternar = (c) => setCats((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));

  const sinSlug = !slug;
  const sucursal = info?.nombre;

  return (
    <div style={{ ...S.pagina, ...estiloTema(info?.tema) }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", fontWeight: 800, fontSize: 150, lineHeight: 0.9, color: "rgba(255,255,255,.09)", transform: "rotate(-8deg) scale(1.3)", userSelect: "none", fontFamily: FONT }}>
        {Array.from({ length: 8 }, (_, k) => <div key={k} style={{ whiteSpace: "nowrap", marginLeft: k % 2 ? -120 : 0 }}>CIRE GRACIAS CIRE GRACIAS</div>)}
      </div>

      <div style={S.caja}>
        <div style={{ textAlign: "center", color: C.sobre, marginBottom: 22, textShadow: "0 1px 8px rgba(var(--c-sombra),.3)" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.32em", fontWeight: 500, marginBottom: 2 }}>ARTE EN DEPILACIÓN</div>
          <Loto />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "0.04em", lineHeight: 1, marginTop: 2 }}>CIRE</div>
        </div>

        {err && <div role="alert" style={{ background: C.rosa, color: "#fff", border: "3px solid #fff", borderRadius: 18, padding: "12px 16px", marginBottom: 14, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{err}</div>}

        {sinSlug && (
          <>
            <Titulo>Elige tu<br />sucursal</Titulo>
            {!lista && !err && <div style={{ color: C.sobre, fontWeight: 600 }}>Cargando…</div>}
            {lista?.map((s) => (
              <a key={s.slug} href={`/opinion/${s.slug}`} onClick={(e) => { e.preventDefault(); history.pushState(null, "", `/opinion/${s.slug}`); setSlug(s.slug); }}
                style={{ ...S.tarjeta, display: "flex", alignItems: "center", gap: 14, textDecoration: "none", padding: "14px 20px" }}>
                <Pin /><span style={{ fontWeight: 800, fontSize: 20, color: C.verde }}>CIRE {s.nombre}</span>
              </a>
            ))}
          </>
        )}

        {!sinSlug && sucursal && paso === "calificar" && (
          <>
            <Titulo>¿Cómo fue<br />tu experiencia?</Titulo>
            <div style={{ ...S.tarjeta, padding: "20px 14px" }}>
              <div style={{ textAlign: "center", fontSize: 14, color: C.suave, marginBottom: 14 }}>Sucursal <b style={{ color: C.verde }}>{sucursal}</b> · toca una carita</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                {CARAS.map(([e, t], i) => (
                  <button key={i} onClick={() => calificar(i + 1)} disabled={ocupado} aria-label={`${i + 1} de 5: ${t}`}
                    style={{ flex: 1, background: C.menta, border: `2px solid ${C.menta}`, borderRadius: 18, padding: "12px 0 8px", cursor: "pointer", fontFamily: FONT, opacity: ocupado ? 0.6 : 1 }}>
                    <span style={{ display: "block", fontSize: 34, lineHeight: 1.1 }}>{e}</span>
                    <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: C.verde, marginTop: 4 }}>{t}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {paso === "gracias5" && op && (
          <>
            <Titulo>¡Gracias!<br />Qué bueno 💛</Titulo>
            <div style={S.tarjeta}>
              <div style={{ fontSize: 16, color: C.texto, lineHeight: 1.45, marginBottom: 16 }}>
                Nos alegra que hayas tenido una gran experiencia. <b>¿Nos regalas 20 segundos para contarlo en Google?</b> Ayuda muchísimo a que otras personas nos encuentren.
              </div>
              {op.googleUrl ? (
                <a href={op.googleUrl} target="_blank" rel="noopener noreferrer" onClick={irGoogle}
                  style={{ ...S.boton(), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>⭐ Dejar mi reseña en Google</a>
              ) : (
                <div style={{ fontSize: 14, color: C.suave }}>¡Gracias por tu calificación!</div>
              )}
            </div>
          </>
        )}

        {paso === "detalle" && op && (
          <>
            <Titulo>Cuéntanos<br />qué pasó</Titulo>
            <div style={S.tarjeta}>
              <div style={{ fontSize: 15, color: C.texto, lineHeight: 1.45, marginBottom: 14 }}>
                Lamentamos que no haya sido perfecta. Tu opinión llega directo a nuestro equipo para que lo corrijamos.
              </div>
              <span style={S.etiqueta}>¿Qué podemos mejorar? (puedes elegir varias)</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {CATEGORIAS.map(([k, t]) => {
                  const on = cats.includes(k);
                  return <button key={k} onClick={() => alternar(k)} aria-pressed={on} style={{ padding: "9px 14px", fontSize: 14, fontWeight: 600, fontFamily: FONT, borderRadius: 999, cursor: "pointer", border: `2px solid ${on ? C.verde : C.menta}`, background: on ? C.verde : C.menta, color: on ? "#fff" : C.verde }}>{t}</button>;
                })}
              </div>
              <label style={S.etiqueta} htmlFor="op-coment">Cuéntanos más</label>
              <textarea id="op-coment" value={coment} onChange={(e) => setComent(e.target.value)} maxLength={1000} rows={4} placeholder="¿Qué sucedió?" style={{ ...S.input, resize: "vertical" }} />
              <div style={{ fontSize: 13, color: C.suave, margin: "2px 4px 10px" }}>Si quieres que te contactemos para resolverlo, déjanos tus datos (opcional):</div>
              <label style={S.etiqueta} htmlFor="op-nombre">Tu nombre</label>
              <input id="op-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="name" style={S.input} />
              <label style={S.etiqueta} htmlFor="op-tel">Tu celular (10 dígitos)</label>
              <input id="op-tel" value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} style={S.input} />
              <button onClick={enviar} disabled={ocupado} style={S.boton(!ocupado)}>{ocupado ? "Enviando…" : "Enviar mi opinión"}</button>
            </div>
          </>
        )}

        {paso === "gracias" && (
          <>
            <Titulo>¡Gracias<br />por decirnos!</Titulo>
            <div style={S.tarjeta}>
              <div style={{ fontSize: 16, color: C.texto, lineHeight: 1.45 }}>
                Recibimos tu opinión y la vamos a revisar con el equipo de la sucursal. {tel ? "Si lo necesitamos, te contactaremos." : "Nos ayuda a mejorar."}
              </div>
            </div>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 12, fontWeight: 500, color: C.sobre, opacity: 0.9, textShadow: "0 1px 6px rgba(var(--c-sombra),.25)" }}>
          <a href="https://e320-landing.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>Creado por e320.tech</a>
        </div>
      </div>
    </div>
  );
}
