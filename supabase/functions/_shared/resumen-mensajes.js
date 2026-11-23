// Cierre diario de mensajes de Meta por sucursal y servicio. Lógica pura (sin Deno ni navegador): la usa la
// función resumen-mensajes-dia y el script de prueba local. Las reglas de reparto replican las de
// src/components/meta/rendimiento.js: si cambian allá, cambian aquí.

const API = "https://graph.facebook.com/v21.0";
export const SUCURSALES = ["Valle", "Coapa", "Polanco", "Oriente", "Metepec"];
const CDMX3 = ["Valle", "Coapa", "Polanco"];
const sin = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mensajesDe = (acts) => {
  const f = (t) => Number((acts || []).find((a) => a.action_type === t)?.value || 0);
  return f("onsite_conversion.messaging_conversation_started_7d") || f("onsite_conversion.total_messaging_connection");
};

/** cuentas: [{ id, nombre, sucursal|null }]. VITE_META_ACCOUNTS = "id:Nombre,id:Nombre"; Oriente y Metepec cobran 100% en su cuenta. */
export function parseCuentas(raw) {
  return String(raw || "").split(",").filter(Boolean).map((p) => {
    const [id, ...n] = p.trim().split(":");
    const nombre = n.join(":").trim() || id;
    return { id: id.replace(/^act_/, ""), nombre, sucursal: ["Oriente", "Metepec"].find((s) => sin(s) === sin(nombre)) || null };
  });
}

export function clasificar(nombre, conjunto = "", campana = "") {
  const p = String(nombre).split("|").map((s) => s.trim());
  const n = sin(nombre), ctx = sin(`${conjunto} ${campana}`);
  const sucDe = (t) => SUCURSALES.find((s) => sin(t).includes(sin(s)));
  let servicio = "Otro";
  if (n.includes("bikini") || /(^|[\s_|-])bf[\s_-]?\d/.test(n)) servicio = "Bikini";
  else if (n.includes("hifu")) servicio = "HIFU";
  else if (n.includes("facial")) servicio = "Facial";
  else if (n.includes("moldeo") || n.includes("drenaje")) servicio = "Moldeo";
  else if (/(^|[\s_|-])(sop|cc|laser|depil)/.test(n) || /_cc_/.test(n)) servicio = "Láser";
  let sucursal = sucDe(p[0]) || sucDe(p[1] || "");
  if (servicio === "Bikini" && (!sucursal || !["Oriente", "Metepec"].includes(sucursal))) sucursal = "COMPARTIDO";
  if (!sucursal) sucursal = ctx.includes("axila gratis") || ctx.includes("5 sucursales") ? "COMPARTIDO" : sucDe(ctx) || "COMPARTIDO";
  return { sucursal, servicio };
}

/** Lo compartido de la cuenta Valle · Polanco · Coapa se reparte en tercios; "Bikini*" en el texto = aproximado. */
function repartir(filas) {
  return filas.flatMap((r) => r.sucursal === "COMPARTIDO"
    ? CDMX3.map((s) => ({ ...r, sucursal: s, gasto: r.gasto / 3, mensajes: r.mensajes / 3 }))
    : [r]);
}

async function paginar(url) {
  const filas = [];
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(j.error.message);
    filas.push(...(j.data || []));
    url = j.paging?.next;
  }
  return filas;
}

/**
 * Lee el detalle diario por anuncio de todas las cuentas entre since y until (yyyy-mm-dd).
 * Devuelve { filas, crudas }: filas = por sucursal y servicio, con lo compartido ya repartido en tercios;
 * crudas = una por anuncio y día, sin repartir (para evaluar cada anuncio por separado).
 */
export async function leerDiario(cuentas, token, since, until) {
  const tramos = [];
  for (let d = new Date(since + "T12:00:00Z"), fin = new Date(until + "T12:00:00Z"); d <= fin;) {
    const e = new Date(d); e.setUTCDate(e.getUTCDate() + 6);
    const f = e > fin ? fin : e;
    tramos.push([d.toISOString().slice(0, 10), f.toISOString().slice(0, 10)]);
    d = new Date(f); d.setUTCDate(d.getUTCDate() + 1);
  }
  const lotes = await Promise.all(cuentas.flatMap((c) => tramos.map(async ([a, b]) => {
    // Sin filtro de gasto: hay mensajes en días con gasto 0 (atribución a 7 días) y la plataforma también los cuenta
    const q = new URLSearchParams({
      level: "ad", time_increment: "1", limit: "300", access_token: token,
      fields: "ad_id,ad_name,adset_name,campaign_name,spend,actions",
      time_range: JSON.stringify({ since: a, until: b }),
    });
    const filas = await paginar(`${API}/act_${c.id}/insights?${q}`);
    return filas.map((r) => {
      const k = clasificar(r.ad_name, r.adset_name, r.campaign_name);
      return { fecha: r.date_start, adId: String(r.ad_id), anuncio: r.ad_name, sucursal: c.sucursal || k.sucursal, servicio: k.servicio, gasto: Number(r.spend || 0), mensajes: mensajesDe(r.actions) };
    });
  })));
  const crudas = lotes.flat();
  return { filas: repartir(crudas), crudas };
}

const money = (n) => `$${Math.round(n).toLocaleString("es-MX")}`;
const num = (n) => Math.round(n).toLocaleString("es-MX");
const cpm = (g, m) => (m > 0 ? (g / m < 10 ? `$${(g / m).toFixed(1)}` : `$${Math.round(g / m)}`) : "—");
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const signo = (p) => (p == null ? "" : p >= 0 ? `+${p}%` : `−${Math.abs(p)}%`);
const sumar = (l, k) => l.reduce((a, x) => a + x[k], 0);

// Meta de mensajes del mes entre las 5 sucursales (cada una pone META/5) y la nota que se explica en el mensaje.
// Sin entrada para el mes, se usa META_DEFAULT sin explicación.
export const META_DEFAULT = 2000;
export const METAS = {
  "2026-11": {
    meta: 3250,
    nota: "Meta basada en noviembre 2025 (2,338 mensajes) más el +39% de crecimiento que llevamos en 2026. Piso: 2,340 (repetir 2025). Reto: 4,500 (récord de noviembre 2024: 4,570).",
  },
};
const COLOR = { Coapa: "🟦", Valle: "🟨", Oriente: "🟪", Polanco: "🟧", Metepec: "🟩" };

/** Barra de `celdas` cuadros, `llenos` pintados con `color`. */
const barra = (llenos, celdas, color) => color.repeat(Math.min(celdas, Math.max(0, llenos))) + "⬜".repeat(celdas - Math.min(celdas, Math.max(0, llenos)));

/** Barra total de 20 cuadros pintada por sucursal según cuánto aportó cada una (método del mayor residuo). */
function barraTotal(sucs, meta) {
  const N = 20;
  const exacto = sucs.map((s) => ({ s: s.sucursal, v: Math.min(s.mes / meta * N, N) }));
  const objetivo = Math.min(N, Math.round(sumar(sucs, "mes") / meta * N));
  const celdas = exacto.map((e) => ({ ...e, n: Math.floor(e.v) }));
  let faltan = objetivo - sumar(celdas, "n");
  [...celdas].sort((a, b) => (b.v - b.n) - (a.v - a.n)).forEach((c) => { if (faltan > 0 && c.v > 0) { c.n++; faltan--; } });
  const pintados = celdas.sort((a, b) => b.n - a.n).flatMap((c) => Array(c.n).fill(COLOR[c.s]));
  return pintados.slice(0, N).join("") + "⬜".repeat(N - Math.min(N, pintados.length));
}

/**
 * Anuncios que mejoran o se encarecen: costo por mensaje de los últimos N días con anuncios corriendo contra los N anteriores
 * (N = 7 si hay historial, menos si hay poco; mínimo 3). Solo anuncios con gasto y mensajes suficientes en ambos tramos.
 */
function analizarAnuncios(crudas, dia) {
  const activas = [...new Set(crudas.filter((r) => r.gasto > 0).map((r) => r.fecha))].filter((d) => d <= dia).sort();
  const N = Math.min(7, Math.floor(activas.length / 2));
  if (N < 3) return { N, mejoran: [], empeoran: [] };
  const R = new Set(activas.slice(-N)), P = new Set(activas.slice(-2 * N, -N));
  const por = new Map();
  crudas.forEach((r) => {
    const a = por.get(r.adId) || { adId: r.adId, anuncio: r.anuncio, sucursal: r.sucursal, gR: 0, mR: 0, gP: 0, mP: 0 };
    if (R.has(r.fecha)) { a.gR += r.gasto; a.mR += r.mensajes; }
    if (P.has(r.fecha)) { a.gP += r.gasto; a.mP += r.mensajes; }
    por.set(r.adId, a);
  });
  const mejoran = [], empeoran = [];
  for (const a of por.values()) {
    if (a.gP < 60 || a.mP < 5 || a.gR < 60) continue; // sin base suficiente para comparar
    const cP = a.gP / a.mP, cR = a.mR > 0 ? a.gR / a.mR : Infinity;
    const x = { ...a, cP, cR, cambio: cR / cP };
    if (cR <= cP * 0.75 && a.mR >= 5) mejoran.push(x);
    else if (cR >= cP * 1.3) empeoran.push(x);
  }
  mejoran.sort((a, b) => b.gR - a.gR); // los que más gastan primero: son los que más mueven la aguja
  empeoran.sort((a, b) => b.gR - a.gR);
  return { N, mejoran, empeoran };
}

const etiquetaAnuncio = (a) => {
  const suc = a.sucursal === "COMPARTIDO" ? "Valle·Polanco·Coapa" : a.sucursal;
  return suc.split("·").some((x) => a.anuncio.toLowerCase().includes(x.toLowerCase())) ? a.anuncio : `${a.anuncio} (${suc})`;
};

/** Arma el resumen del día `dia`. filas/crudas vienen de leerDiario (idealmente desde 14 días antes). */
export function armarResumen({ filas, crudas }, dia, opciones = {}) {
  const cfg = METAS[dia.slice(0, 7)];
  const meta = opciones.meta ?? cfg?.meta ?? META_DEFAULT;
  const notaMeta = opciones.notaMeta ?? cfg?.nota;
  const [y, m] = dia.split("-").map(Number);
  const diasMes = new Date(y, m, 0).getDate();
  const nDia = Number(dia.slice(8));
  const mesIni = `${dia.slice(0, 7)}-01`;
  const activas = [...new Set(filas.map((f) => f.fecha))].filter((d) => d <= dia && sumar(filas.filter((f) => f.fecha === d), "gasto") > 0).sort();
  const previos = activas.filter((f) => f < dia && f >= mesIni);
  const ult7 = activas.slice(-7);
  const delMes = filas.filter((f) => f.fecha >= mesIni && f.fecha <= dia);

  const sucs = SUCURSALES.map((s) => {
    const mias = filas.filter((f) => f.sucursal === s);
    const hoy = mias.filter((f) => f.fecha === dia);
    const mensajes = sumar(hoy, "mensajes"), gasto = sumar(hoy, "gasto");
    const prom = previos.length ? mias.filter((f) => previos.includes(f.fecha)).reduce((a, f) => a + f.mensajes, 0) / previos.length : null;
    const mes = delMes.filter((f) => f.sucursal === s).reduce((a, f) => a + f.mensajes, 0);
    const ritmo = ult7.length ? mias.filter((f) => ult7.includes(f.fecha)).reduce((a, f) => a + f.mensajes, 0) / ult7.length : 0;
    const servicios = [...new Set(hoy.map((f) => f.servicio))].map((sv) => {
      const l = hoy.filter((f) => f.servicio === sv);
      return { servicio: sv, mensajes: sumar(l, "mensajes"), gasto: sumar(l, "gasto") };
    }).sort((a, b) => b.mensajes - a.mensajes || b.gasto - a.gasto);
    return { sucursal: s, mensajes, gasto, prom, vsProm: prom ? pct(mensajes, prom) : null, mes, cierre: Math.round(mes + ritmo * (diasMes - nDia)), servicios };
  }).filter((s) => s.gasto > 0 || s.mensajes > 0 || s.mes > 0).sort((a, b) => b.mensajes - a.mensajes);

  const tot = { mensajes: sumar(sucs, "mensajes"), gasto: sumar(sucs, "gasto"), mes: sumar(sucs, "mes"), cierre: sumar(sucs, "cierre") };
  const promTot = previos.length ? delMes.filter((f) => previos.includes(f.fecha)).reduce((a, f) => a + f.mensajes, 0) / previos.length : null;
  const ayer = previos.slice(-1)[0];
  const ayerMsgs = ayer ? sumar(filas.filter((f) => f.fecha === ayer), "mensajes") : null;

  const esperado = meta * nDia / diasMes; // dónde deberíamos ir hoy si la meta se reparte parejo en el mes
  const cumplida = tot.mes >= meta;
  const analisis = analizarAnuncios(crudas, dia);

  const fechaTxt = new Date(dia + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const L = [];
  L.push(`📊 *Cierre de mensajes · ${fechaTxt}*`);
  L.push(`*${num(tot.mensajes)} mensajes* · ${money(tot.gasto)} · ${cpm(tot.gasto, tot.mensajes)} por mensaje`);
  if (promTot != null) L.push(`Promedio del mes: ${num(promTot)}/día (${signo(pct(tot.mensajes, promTot))})${ayerMsgs != null ? ` · ayer ${num(ayerMsgs)}` : ""}`);
  L.push("");
  sucs.filter((s) => s.mensajes > 0 || s.gasto >= 20).forEach((s) => {
    L.push(`*${s.sucursal}* recibió *${num(s.mensajes)}* mensajes${s.vsProm != null ? ` (${signo(s.vsProm)} vs prom. ${num(s.prom)})` : ""}`);
    s.servicios.filter((v) => v.mensajes > 0 || v.gasto >= 20).forEach((v) => L.push(`  • ${v.servicio} ${num(v.mensajes)} · ${cpm(v.gasto, v.mensajes)} x msj`));
    L.push("");
  });

  // ── Meta del mes ──
  L.push(`🎯 *Meta del mes: ${num(meta)} mensajes entre las 5 sucursales*`);
  L.push(`${barraTotal(sucs, meta)} ${Math.round(tot.mes / meta * 100)}%`);
  L.push(cumplida
    ? `✅ *¡Meta cumplida!* Llevamos ${num(tot.mes)} (${Math.round(tot.mes / meta * 100)}%).`
    : `Llevamos *${num(tot.mes)}* de ${num(meta)} · a esta fecha deberíamos ir en ${num(esperado)} ${tot.mes >= esperado ? "🟢 vamos adelante" : "🟠 vamos atrás"}`);
  L.push(`Al ritmo de los últimos ${ult7.length} días cerramos en ~${num(tot.cierre)} (${Math.round(tot.cierre / meta * 100)}% de la meta)${tot.cierre >= meta ? " 🚀" : ""}`);
  if (notaMeta) L.push(`_${notaMeta}_`);
  L.push("");
  const porSuc = meta / 5;
  L.push(`*Avance por sucursal* (${num(porSuc)} c/u)`);
  [...sucs].sort((a, b) => b.mes - a.mes).forEach((s) => {
    const p = s.mes / porSuc;
    L.push(`${barra(Math.round(p * 10), 10, COLOR[s.sucursal])} ${s.sucursal} ${num(s.mes)}/${num(porSuc)}${p >= 1 ? " ✅" : ` (${Math.round(p * 100)}%)`}`);
  });

  // ── Anuncios ──
  L.push("");
  const periodo = `últimos ${analisis.N} días vs los ${analisis.N} anteriores`;
  if (analisis.N < 3) L.push("💡 Aún no hay historial suficiente para comparar anuncios (se necesitan al menos 6 días con campañas corriendo).");
  else if (!analisis.mejoran.length && !analisis.empeoran.length) L.push(`💡 Ningún anuncio cambió de forma importante su costo por mensaje (${periodo}).`);
  const lineasAnuncios = [
    ...analisis.mejoran.slice(0, 2).map((a) => `🚀 *${etiquetaAnuncio(a)}* está mejorando su performance: el costo por mensaje bajó de ${cpm(a.gP, a.mP)} a ${cpm(a.gR, a.mR)} (${periodo}). Pensemos escalarlo.`),
    ...analisis.empeoran.slice(0, 2).map((a) => `⚠️ *${etiquetaAnuncio(a)}* se está encareciendo: ${a.mR === 0 ? `gastó ${money(a.gR)} y no trajo mensajes` : `el costo por mensaje subió de ${cpm(a.gP, a.mP)} a ${cpm(a.gR, a.mR)}`} (${periodo}). Ponle atención.`),
  ];
  lineasAnuncios.forEach((l) => L.push(l));
  L.push("");
  L.push("_Bikini de Valle, Polanco y Coapa corre en un solo conjunto: se reparte en 3._");

  // ── Variables de la plantilla de WhatsApp (cierre_mensajes_diario): una línea cada una, sin saltos de línea ──
  const unaLinea = (t) => String(t).replace(/\*/g, "").replace(/[\n\t]+/g, " · ").replace(/ {2,}/g, " ").trim().slice(0, 1000);
  const filasSuc = sucs.filter((s) => s.mensajes > 0 || s.gasto >= 20).slice(0, 5).map((s) =>
    unaLinea(`${s.sucursal} ${num(s.mensajes)} mensajes${s.vsProm != null ? ` (${signo(s.vsProm)} vs prom.)` : ""} · ` +
      (s.servicios.filter((v) => v.mensajes > 0 || v.gasto >= 20).map((v) => `${v.servicio} ${num(v.mensajes)} · ${cpm(v.gasto, v.mensajes)} x msj`).join(" · ") || "sin mensajes")));
  while (filasSuc.length < 5) filasSuc.push("—");
  const params = [
    fechaTxt,
    unaLinea(`${num(tot.mensajes)} mensajes · ${money(tot.gasto)} · ${cpm(tot.gasto, tot.mensajes)} por mensaje` +
      (promTot != null ? ` · promedio del mes ${num(promTot)}/día (${signo(pct(tot.mensajes, promTot))})` : "") + (ayerMsgs != null ? ` · ayer ${num(ayerMsgs)}` : "")),
    ...filasSuc,
    unaLinea(`${barraTotal(sucs, meta)} ${Math.round(tot.mes / meta * 100)}% · ${num(tot.mes)} de ${num(meta)}` +
      (cumplida ? " · ✅ meta cumplida" : ` · deberíamos ir en ${num(esperado)} ${tot.mes >= esperado ? "🟢" : "🟠"}`) + ` · al ritmo actual cerramos en ~${num(tot.cierre)} (${Math.round(tot.cierre / meta * 100)}% de la meta)`),
    unaLinea([...sucs].sort((a, b) => b.mes - a.mes).map((s) => `${barra(Math.round(s.mes / porSuc * 5), 5, COLOR[s.sucursal])} ${s.sucursal} ${Math.round(s.mes / porSuc * 100)}%`).join(" · ")),
    unaLinea(lineasAnuncios.length ? lineasAnuncios.join(" · ") : analisis.N < 3 ? "Aún no hay historial suficiente para comparar anuncios." : "Ningún anuncio cambió de forma importante su costo por mensaje."),
  ];
  return {
    dia, sucursales: sucs, total: tot, anuncios: analisis, params, texto: L.join("\n"),
    // para la tarjeta de imagen
    meta, notaMeta, esperado, promTot, vsPromTot: promTot != null ? pct(tot.mensajes, promTot) : null, ayerMsgs, diasMes,
  };
}

/** Manda la plantilla del cierre por WhatsApp Cloud API a un teléfono (formato internacional sin "+", ej. 5215512345678). */
export async function enviarPlantilla({ token, phoneId, plantilla = "cierre_mensajes_diario", idioma = "es_MX", para, params }) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: para, type: "template",
      template: { name: plantilla, language: { code: idioma }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `WhatsApp respondió ${r.status}`);
  return j;
}
