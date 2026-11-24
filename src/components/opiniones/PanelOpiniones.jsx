import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useT } from "../../lib/theme.jsx";
import { apiOpiniones, slugDeNombre, urlOpinion } from "../../lib/opiniones.js";

// Tab "Opiniones" del sistema: QR por sucursal (descargable/imprimible), resumen de calificaciones y las
// opiniones privadas (1 a 4 estrellas) para atenderlas. Datos vía edge function `opiniones` (usuario + hash).

const ETIQ = { servicio: "Servicio", atencion: "Atención", limpieza: "Limpieza", puntualidad: "Puntualidad", precio: "Precio", otro: "Otro" };
const CARAS = ["😡", "🙁", "😐", "🙂", "😍"];
const fechaCorta = (iso) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
const colorCal = (n) => (n >= 5 ? "#10b981" : n >= 4 ? "#84cc16" : n === 3 ? "#f59e0b" : "#ef4444");

const descargar = (href, nombre) => { const a = document.createElement("a"); a.href = href; a.download = nombre; a.click(); };

// Cartel con QR listo para imprimir: nombre de sucursal + QR grande + leyenda.
async function cartelPng(s) {
  const qr = await QRCode.toDataURL(urlOpinion(s.slug), { width: 900, margin: 1, errorCorrectionLevel: "M" });
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = qr; });
  const c = document.createElement("canvas"); c.width = 1200; c.height = 1700;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#0B5F5E"; g.textAlign = "center";
  g.font = "600 110px Poppins, system-ui, sans-serif"; g.fillText("CIRE", 600, 170);
  g.font = "500 34px Poppins, system-ui, sans-serif"; g.fillText("ARTE EN DEPILACIÓN", 600, 225);
  g.font = "800 88px Poppins, system-ui, sans-serif"; g.fillText("¿Cómo fue", 600, 410); g.fillText("tu experiencia?", 600, 510);
  g.drawImage(img, 150, 580, 900, 900);
  g.font = "600 46px Poppins, system-ui, sans-serif"; g.fillText("Escanea y cuéntanos en 10 segundos", 600, 1560);
  g.font = "500 40px Poppins, system-ui, sans-serif"; g.fillText(`Sucursal ${s.nombre}`, 600, 1630);
  return c.toDataURL("image/png");
}

function TarjetaSucursal({ s, ops, T, onGuardado }) {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState(s.googleUrl || "");
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { QRCode.toDataURL(urlOpinion(s.slug), { width: 320, margin: 1 }).then(setQr).catch(() => {}); }, [s.slug]);
  useEffect(() => setUrl(s.googleUrl || ""), [s.googleUrl]);

  const total = ops.length;
  const prom = total ? ops.reduce((a, o) => a + o.calificacion, 0) / total : 0;
  const cinco = ops.filter((o) => o.calificacion === 5);
  const aGoogle = cinco.filter((o) => o.fue_a_google).length;
  const pend = ops.filter((o) => o.calificacion < 5 && o.estado === "nueva").length;

  const guardar = async () => {
    setGuardando(true); setMsg("");
    try { await apiOpiniones("config", { slug: s.slug, googleUrl: url.trim() }, { equipo: true }); setMsg("Guardado ✓"); onGuardado(); }
    catch (e) { setMsg(e.message); }
    setGuardando(false);
  };
  const cartel = async () => descargar(await cartelPng(s), `cartel-opiniones-${s.slug}.png`);
  const caja = { background: T.cardBg, border: `1px solid ${T.cardBdr}`, borderRadius: 14, padding: 16 };

  return (
    <div style={{ ...caja, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {qr && <img src={qr} alt={`QR de ${s.nombre}`} width={110} height={110} style={{ borderRadius: 8, background: "#fff", flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.nombre}</div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{total} opiniones · {total ? `${prom.toFixed(2)} ★ promedio` : "sin datos aún"}</div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{cinco.length} de 5★ · {aGoogle} tocaron “Google”{pend ? <> · <b style={{ color: "#ef4444" }}>{pend} por atender</b></> : ""}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn-ghost" style={{ fontSize: 11, padding: "6px 10px" }} onClick={async () => descargar(await QRCode.toDataURL(urlOpinion(s.slug), { width: 1000, margin: 2 }), `qr-${s.slug}.png`)}>⬇ QR</button>
            <button className="btn-ghost" style={{ fontSize: 11, padding: "6px 10px" }} onClick={cartel}>🖨 Cartel</button>
            <a className="btn-ghost" style={{ fontSize: 11, padding: "6px 10px", textDecoration: "none" }} href={urlOpinion(s.slug)} target="_blank" rel="noopener noreferrer">Ver página ↗</a>
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 1, color: T.sub, marginBottom: 4 }}>ENLACE DE RESEÑA EN GOOGLE (5 ESTRELLAS)</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={s.mapsUrl ? "Vacío: abre el mapa de la sucursal" : "https://search.google.com/local/writereview?placeid=…"} style={{ flex: 1, fontSize: 12, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.cardBdr}`, background: "transparent", color: "inherit", fontFamily: "inherit" }} />
          <button className="btn-ghost" style={{ fontSize: 11, padding: "6px 12px" }} disabled={guardando || url.trim() === (s.googleUrl || "")} onClick={guardar}>Guardar</button>
        </div>
        {msg && <div style={{ fontSize: 11, color: msg.includes("✓") ? "#10b981" : "#ef4444", marginTop: 4 }}>{msg}</div>}
      </div>
    </div>
  );
}

export default function PanelOpiniones({ sucursalesFiltro = null }) {
  const { T } = useT();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [dias, setDias] = useState(90);
  const [fSuc, setFSuc] = useState("todas");
  const [soloPend, setSoloPend] = useState(true);
  const [nota, setNota] = useState({});

  const cargar = () => apiOpiniones("listar", { dias }, { equipo: true }).then((j) => { setD(j); setErr(""); }).catch((e) => setErr(e.message));
  useEffect(() => { cargar(); }, [dias]); // eslint-disable-line

  const permitidas = useMemo(() => {
    if (!d) return [];
    const ok = sucursalesFiltro ? new Set(sucursalesFiltro.map(slugDeNombre)) : null;
    return d.sucursales.filter((s) => !ok || ok.has(s.slug));
  }, [d, sucursalesFiltro]);
  const porSuc = (slug) => (d?.opiniones || []).filter((o) => o.slug === slug);
  const nombreDe = (slug) => d?.sucursales.find((s) => s.slug === slug)?.nombre || slug;

  const privadas = useMemo(() => {
    const slugs = new Set(permitidas.map((s) => s.slug));
    return (d?.opiniones || []).filter((o) => o.calificacion < 5 && slugs.has(o.slug) && (fSuc === "todas" || o.slug === fSuc) && (!soloPend || o.estado === "nueva"));
  }, [d, permitidas, fSuc, soloPend]);

  const resolver = async (o, estado) => {
    try { await apiOpiniones("resolver", { id: o.id, estado, nota: nota[o.id] ?? o.nota_interna ?? "" }, { equipo: true }); await cargar(); }
    catch (e) { setErr(e.message); }
  };

  const caja = { background: T.cardBg, border: `1px solid ${T.cardBdr}`, borderRadius: 14, padding: 16 };
  const todas = permitidas.flatMap((s) => porSuc(s.slug));
  const promGlobal = todas.length ? todas.reduce((a, o) => a + o.calificacion, 0) / todas.length : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>⭐ Opiniones por QR</div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>5★ → se invita a reseñar en Google · 1–4★ → llega aquí en privado para atenderla.</div>
        </div>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "transparent", color: "inherit", border: `1px solid ${T.cardBdr}`, fontFamily: "inherit" }}>
          <option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option><option value={365}>Último año</option>
        </select>
      </div>

      {err && <div style={{ ...caja, color: "#ef4444", fontSize: 13 }}>{err}</div>}
      {!d && !err && <div style={{ color: T.sub, fontSize: 13 }}>Cargando…</div>}

      {d && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {[["Opiniones", todas.length], ["Promedio", todas.length ? `${promGlobal.toFixed(2)} ★` : "—"], ["5 estrellas", todas.filter((o) => o.calificacion === 5).length], ["Por atender", todas.filter((o) => o.calificacion < 5 && o.estado === "nueva").length]].map(([k, v]) => (
              <div key={k} style={caja}><div style={{ fontSize: 10, letterSpacing: 1, color: T.sub }}>{k.toUpperCase()}</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{v}</div></div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
            {permitidas.map((s) => <TarjetaSucursal key={s.slug} s={s} ops={porSuc(s.slug)} T={T} onGuardado={cargar} />)}
          </div>

          <div style={{ ...caja, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Opiniones privadas (1 a 4 ★)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={fSuc} onChange={(e) => setFSuc(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 8, background: "transparent", color: "inherit", border: `1px solid ${T.cardBdr}`, fontFamily: "inherit" }}>
                  <option value="todas">Todas las sucursales</option>
                  {permitidas.map((s) => <option key={s.slug} value={s.slug}>{s.nombre}</option>)}
                </select>
                <label style={{ fontSize: 12, color: T.sub, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} />Solo por atender</label>
              </div>
            </div>
            {!privadas.length && <div style={{ fontSize: 13, color: T.sub }}>{soloPend ? "No hay opiniones pendientes. 🎉" : "Sin opiniones en este periodo."}</div>}
            {privadas.map((o) => (
              <div key={o.id} style={{ borderTop: `1px solid ${T.div}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22 }}>{CARAS[o.calificacion - 1]}</span>
                  <b style={{ color: colorCal(o.calificacion) }}>{o.calificacion} ★</b>
                  <span style={{ fontSize: 12, color: T.sub }}>{nombreDe(o.slug)} · {fechaCorta(o.created_at)}</span>
                  {o.estado === "atendida" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(16,185,129,.15)", color: "#10b981" }}>Atendida</span>}
                  {!o.detalle_enviado && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: T.cardBg, color: T.sub }}>Solo calificó</span>}
                </div>
                {o.categorias?.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{o.categorias.map((c) => <span key={c} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, border: `1px solid ${T.chipBdr}` }}>{ETIQ[c] || c}</span>)}</div>}
                {o.comentario && <div style={{ fontSize: 13, lineHeight: 1.45 }}>“{o.comentario}”</div>}
                {(o.nombre || o.telefono) && (
                  <div style={{ fontSize: 12, color: T.sub }}>
                    {o.nombre} {o.telefono && <a href={`https://wa.me/52${o.telefono}`} target="_blank" rel="noopener noreferrer" style={{ color: "#10b981" }}>💬 {o.telefono}</a>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={nota[o.id] ?? o.nota_interna ?? ""} onChange={(e) => setNota((n) => ({ ...n, [o.id]: e.target.value }))} placeholder="Nota interna (qué se hizo)" style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.cardBdr}`, background: "transparent", color: "inherit", fontFamily: "inherit" }} />
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "6px 12px", whiteSpace: "nowrap" }} onClick={() => resolver(o, o.estado === "atendida" ? "nueva" : "atendida")}>{o.estado === "atendida" ? "Reabrir" : "✓ Marcar atendida"}</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
