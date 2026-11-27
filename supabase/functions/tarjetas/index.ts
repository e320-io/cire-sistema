// Supabase Edge Function: tarjetas
// Lo que ve la clienta (tarjeta publicada), la vista previa para recepción y el "está bien / no me cuadra".
// Lee de tarj_* (las llena sync-tarjetas). NO manda mensajes ni escribe en Google Calendar.
//
// Público (con el código privado de la tarjeta):
//   ver      { token }                                   -> tarjeta de la clienta (solo si está publicada)
//   preview  { token }                                   -> la misma tarjeta + datos internos (para recepción; funciona aunque no esté publicada)
//   feedback { token, veredicto: si|no, paquete?, sellosReales?, nota?, origen: clienta|recepcion }
// Recepción (usuario + hash de system_users, igual que la función lealtad):
//   hoy      { usuario, hash, sucursal }                 -> citas de HOY del calendario de la sucursal, ligadas a su tarjeta

import { telDe, nombreDe } from "../_shared/calendario-clasificador.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const env = (k: string) => Deno.env.get(k) ?? "";
const enc = encodeURIComponent;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
class Falla extends Error {}
const falla = (m: string): never => { throw new Falla(m); };
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
// deno-lint-ignore no-explicit-any
const rows = async (path: string): Promise<any[]> => { const r = await sb(path); const j = await r.json(); if (!Array.isArray(j)) throw new Error(`REST ${path.split("?")[0]}: ${JSON.stringify(j).slice(0, 200)}`); return j; };
const hoyMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const DIA = 864e5;

// deno-lint-ignore no-explicit-any
function visible(p: any) { // qué paquetes aparecen en la tarjeta: activos y los completos recientes (los inactivos no)
  if (p.estado === "inactivo") return false;
  if (p.estado === "completo" && p.ultima && Date.now() - Date.parse(p.ultima) > 150 * DIA) return false;
  return true;
}
// deno-lint-ignore no-explicit-any
function paquetePublico(p: any) {
  return {
    nombre: p.nombre, sellos: p.sellos, total: p.total, mant: p.mant, regalo: p.regalo, totalSupuesto: p.total_supuesto, combo: p.combo, estado: p.estado,
    porConfirmar: p.por_confirmar, proxima: p.proxima, ultima: p.ultima, leyendas: p.leyendas ?? [],
    citaAbierta: p.estado === "activo" && !!p.total && !p.proxima && p.sellos < p.total,
    // deno-lint-ignore no-explicit-any
    sesiones: (p.sesiones ?? []).map((s: any) => ({ fecha: s.fecha, n: s.n, inf: s.inf, ok: s.ok, no: s.no, fut: s.fut, suelta: s.suelta, zonas: s.zonas })),
  };
}
async function tarjeta(token: string, interno: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token ?? ""))) falla("Tarjeta no encontrada.");
  const c = (await rows(`tarj_clientas?select=*&token=eq.${token}`))[0];
  if (!c) falla("Tarjeta no encontrada.");
  if (!interno && !c.publicada) falla("Tu tarjeta aún no está disponible.");
  const ps = (await rows(`tarj_paquetes?select=*&clienta_id=eq.${c.id}&order=orden`)).filter(visible);
  ps.sort((a, b) => Number(b.estado === "activo") - Number(a.estado === "activo"));
  const slug = (await rows(`agenda_sucursales?select=slug&nombre=eq.${enc(c.sucursal)}`))[0]?.slug ?? null;
  const base = { nombre: String(c.nombre).split(/\s+/)[0], sucursal: c.sucursal, slug, paquetes: ps.map(paquetePublico) };
  if (!interno) return base;
  return { ...base, interno: { nombreCompleto: c.nombre, nivel: c.nivel, estricta: c.estricta, publicada: c.publicada, tituloCalendario: c.titulo_calendario, tel4: String(c.tel ?? "").slice(-4),
    // deno-lint-ignore no-explicit-any
    motivos: ps.map((p: any) => ({ paquete: p.nombre, alta: p.confianza?.alta, motivos: p.confianza?.motivos ?? [] })), sinAsignar: c.sin_asignar ?? [] } };
}

async function staff(b: Record<string, string>) {
  const u = String(b.usuario ?? ""), h = String(b.hash ?? "");
  if (!u || !/^[0-9a-f]{64}$/.test(h)) falla("Sesión no válida. Vuelve a entrar al sistema.");
  if (!(await rows(`system_users?select=username&username=eq.${enc(u)}&password_hash=eq.${h}`)).length) falla("Sesión no válida. Vuelve a entrar al sistema.");
}

// ---------- Google Calendar (solo lectura) para la lista de Hoy ----------
const b64u = (b: ArrayBuffer | string) => { const u = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b); let t = ""; u.forEach((c) => (t += String.fromCharCode(c))); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
async function token(): Promise<string> {
  const sa = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_JSON")); const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.events", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google auth"); return j.access_token as string;
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });

// deno-lint-ignore no-explicit-any
const PILOTO = ["Metepec"]; // sucursales donde recepción puede cerrar sesiones (escribe ✅ en Calendar)
const INI = "🪪 TARJETA CIRE", FIN = "🪪 FIN";
const QUITAR = new RegExp(`(?:\\s|<br\\s*/?>|&nbsp;)*${INI}[\\s\\S]*?${FIN}[^\\n<]*`, "i");
const limpio = (d: string) => d.replace(QUITAR, "").replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
const esHtml = (d: string) => /<\/?(br|p|div|span|b|i|a|ul|li)\b/i.test(d);
async function llamar(fn: string, qs: string) {
  const r = await fetch(`${env("SUPABASE_URL")}/functions/v1/${fn}?${qs}`, { method: "POST", headers: { "x-sync-key": env("SYNC_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` } });
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
}
// deno-lint-ignore no-explicit-any
async function clientaPorToken(t: any) {
  if (!/^[0-9a-f-]{36}$/i.test(String(t ?? ""))) falla("Tarjeta no encontrada.");
  const c = (await rows(`tarj_clientas?select=*&token=eq.${t}`))[0]; if (!c) falla("Tarjeta no encontrada.");
  const suc = (await rows(`agenda_sucursales?select=nombre,calendar_id&nombre=eq.${enc(c.sucursal)}&calendar_id=not.is.null`))[0];
  if (!suc) falla("Esa sucursal no tiene calendario conectado.");
  return { c, suc };
}

// ---------- Agendar la siguiente sesión (recepción, piloto) ----------
const TZ = "America/Mexico_City", OFFSET = "-06:00";
const ymd = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const hm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addMeses = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const toMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const inst = (dia: string, min: number) => new Date(`${dia}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00${OFFSET}`).getTime();
// deno-lint-ignore no-explicit-any
const rango = (e: any): [number, number] => e.start.dateTime ? [Date.parse(e.start.dateTime), Date.parse(e.end.dateTime)] : [Date.parse(`${e.start.date}T00:00:00${OFFSET}`), Date.parse(`${e.end.date}T00:00:00${OFFSET}`)];
const VENTANA = 100; // días hacia adelante
// deno-lint-ignore no-explicit-any
async function eventosFuturos(calId: string, desde: number, hasta: number): Promise<any[]> {
  const tk = await token(); const out = []; let page = "";
  do {
    const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${enc(calId)}/events`);
    u.searchParams.set("timeMin", new Date(desde).toISOString()); u.searchParams.set("timeMax", new Date(hasta).toISOString()); u.searchParams.set("singleEvents", "true"); u.searchParams.set("maxResults", "2500"); if (page) u.searchParams.set("pageToken", page);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${tk}` } }); const j = await r.json(); if (!r.ok) throw new Error("Google Calendar " + r.status);
    out.push(...(j.items ?? [])); page = j.nextPageToken ?? "";
  } while (page);
  return out;
}
// deno-lint-ignore no-explicit-any
function huecos(cfg: any, evs: any[], durMin: number): Record<string, string[]> {
  const ahora = Date.now(); const ocupados = evs.filter((e) => e.status !== "cancelled" && e.transparency !== "transparent").map(rango);
  const hoy = ymd(ahora); const dias: Record<string, string[]> = {};
  for (let i = 0; i < VENTANA; i++) {
    const dia = addDays(hoy, i); const h = cfg.horario?.[String(dow(dia))]; if (!h) continue;
    const libres: string[] = [];
    for (let t = toMin(h[0]); t + durMin <= toMin(h[1]); t += cfg.intervalo_min) {
      const s = inst(dia, t), e = s + durMin * 60_000; if (s < ahora + 3600e3) continue;
      if (ocupados.filter(([a, b]) => a < e && b > s).length >= (cfg.capacidad ?? 1)) continue;
      libres.push(hm(s));
    }
    if (libres.length) dias[dia] = libres;
  }
  return dias;
}
// Contexto común: cita de hoy de la clienta (para duración y datos), paquete elegido y número de la siguiente sesión.
// deno-lint-ignore no-explicit-any
async function contextoSiguiente(b: Record<string, any>) {
  await staff(b);
  const { c, suc } = await clientaPorToken(b.token);
  if (!PILOTO.includes(c.sucursal)) falla("Esta función aún no está activa en esta sucursal.");
  if (b.sucursal !== c.sucursal) falla(`Esta clienta es de ${c.sucursal}. Inicia sesión con esa sucursal.`);
  const cfg = (await rows(`agenda_sucursales?select=nombre,calendar_id,horario,intervalo_min,capacidad&nombre=eq.${enc(c.sucursal)}`))[0]; if (!cfg) falla("Sucursal sin agenda.");
  const H = { Authorization: `Bearer ${await token()}` };
  const g = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${enc(suc.calendar_id)}/events/${enc(String(b.eventoId ?? ""))}`, { headers: H }); const ev = await g.json();
  if (!g.ok || ev.status === "cancelled" || !ev.start?.dateTime) falla("No encontramos la cita de hoy en el calendario.");
  if (!c.tel || telDe(ev.summary ?? "") !== c.tel) falla("Esa cita no corresponde a esta clienta.");
  const durMin = Math.max(15, Math.round((Date.parse(ev.end.dateTime) - Date.parse(ev.start.dateTime)) / 60000));
  const dia = ymd(Date.parse(ev.start.dateTime));
  const ps = (await rows(`tarj_paquetes?select=nombre,estado,sellos,total,total_supuesto,sesiones&clienta_id=eq.${c.id}&order=orden`)).filter(visible);
  // deno-lint-ignore no-explicit-any
  const p = ps.find((x: any) => x.nombre === b.paquete) ?? ps.find((x: any) => (x.sesiones ?? []).some((s: any) => s.fecha === dia)) ?? ps.find((x: any) => x.estado === "activo");
  if (!p) falla("No encontramos el paquete de esta clienta.");
  // deno-lint-ignore no-explicit-any
  const hoyS = (p.sesiones ?? []).find((s: any) => s.fecha === dia);
  const base = hoyS?.n ?? p.sellos + (/✅/.test(ev.summary ?? "") ? 0 : 1);
  const siguiente = base + 1;
  if (p.total && !p.total_supuesto && siguiente > p.total) falla(`${p.nombre} ya está completo (${p.total} de ${p.total}). No hay siguiente sesión.`);
  return { c, suc, cfg, ev, durMin, dia, p, siguiente, H };
}

// deno-lint-ignore no-explicit-any
async function accion(b: Record<string, any>) {
  switch (b.accion) {
    case "ver": return await tarjeta(b.token, false);
    case "preview": return await tarjeta(b.token, true);

    case "feedback": {
      const c = (await rows(`tarj_clientas?select=id,publicada&token=eq.${enc(String(b.token ?? ""))}`))[0];
      if (!c) falla("Tarjeta no encontrada.");
      const origen = b.origen === "recepcion" ? "recepcion" : "clienta";
      if (origen === "clienta" && !c.publicada) falla("Tu tarjeta aún no está disponible.");
      if (!["si", "no"].includes(b.veredicto)) falla("Respuesta no válida.");
      const hace = new Date(Date.now() - DIA).toISOString();
      if ((await rows(`tarj_feedback?select=id&clienta_id=eq.${c.id}&created_at=gte.${hace}`)).length >= 20) falla("Ya recibimos varias respuestas hoy. Gracias.");
      const sr = Number.isInteger(b.sellosReales) && b.sellosReales >= 0 && b.sellosReales <= 30 ? b.sellosReales : null;
      const r = await sb("tarj_feedback", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ clienta_id: c.id, paquete: String(b.paquete ?? "").slice(0, 80) || null, veredicto: b.veredicto, sellos_reales: sr, nota: String(b.nota ?? "").slice(0, 500) || null, origen }) });
      if (!r.ok) throw new Error("feedback: " + (await r.text()).slice(0, 200));
      return { ok: true };
    }

    case "hoy": {
      await staff(b);
      const suc = (await rows(`agenda_sucursales?select=nombre,calendar_id&nombre=eq.${enc(String(b.sucursal ?? ""))}&calendar_id=not.is.null`))[0];
      if (!suc) falla("Esa sucursal no tiene calendario conectado.");
      const dia = hoyMx(); const ini = new Date(`${dia}T00:00:00-06:00`), fin = new Date(ini.getTime() + DIA);
      const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${enc(suc.calendar_id)}/events`);
      u.searchParams.set("timeMin", ini.toISOString()); u.searchParams.set("timeMax", fin.toISOString()); u.searchParams.set("singleEvents", "true"); u.searchParams.set("orderBy", "startTime"); u.searchParams.set("maxResults", "250");
      const r = await fetch(u, { headers: { Authorization: `Bearer ${await token()}` } }); const j = await r.json(); if (!r.ok) throw new Error("Google Calendar " + r.status);
      const cl = await rows(`tarj_clientas?select=id,clave,nombre,token,nivel,estricta,publicada&sucursal=eq.${enc(suc.nombre)}`);
      const porClave = new Map(cl.map((x) => [x.clave, x]));
      const ids = cl.map((x) => x.id); void ids;
      // deno-lint-ignore no-explicit-any
      const citas = (j.items ?? []).filter((e: any) => e.status !== "cancelled" && e.start?.dateTime).map((e: any) => ({ e, tel: telDe(e.summary ?? ""), nombre: nombreDe(e.summary ?? "") })).filter((x: { tel: string }) => x.tel);
      const claves = [...new Set(citas.map((x: { tel: string }) => x.tel))];
      // deno-lint-ignore no-explicit-any
      const paq: any[] = claves.length ? await rows(`tarj_paquetes?select=clienta_id,nombre,sellos,total,estado,proxima&clienta_id=in.(${claves.map((t) => porClave.get(t as string)?.id).filter(Boolean).join(",") || "00000000-0000-0000-0000-000000000000"})`) : [];
      // deno-lint-ignore no-explicit-any
      const lista = citas.map((x: any) => {
        const c = porClave.get(x.tel); const ps = c ? paq.filter((p) => p.clienta_id === c.id && p.estado === "activo") : [];
        return { hora: hhmm(x.e.start.dateTime), titulo: String(x.e.summary ?? "").slice(0, 90), vino: /✅/.test(x.e.summary ?? ""),
          clienta: c ? { nombre: c.nombre, token: c.token, nivel: c.nivel, estricta: c.estricta, publicada: c.publicada, resumen: ps.map((p) => `${p.nombre} ${p.sellos}${p.total ? "/" + p.total : ""}`).join(" · ") } : null };
      });
      return { sucursal: suc.nombre, dia, citas: lista };
    }
    case "sesion_hoy": {
      await staff(b);
      const { c, suc } = await clientaPorToken(b.token);
      const dia = hoyMx(); const ini = new Date(`${dia}T00:00:00-06:00`), fin = new Date(ini.getTime() + DIA);
      const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${enc(suc.calendar_id)}/events`);
      u.searchParams.set("timeMin", ini.toISOString()); u.searchParams.set("timeMax", fin.toISOString()); u.searchParams.set("singleEvents", "true"); u.searchParams.set("orderBy", "startTime"); u.searchParams.set("maxResults", "250");
      const r = await fetch(u, { headers: { Authorization: `Bearer ${await token()}` } }); const j = await r.json(); if (!r.ok) throw new Error("Google Calendar " + r.status);
      const ps = (await rows(`tarj_paquetes?select=nombre,estado,sellos,total,total_supuesto,sesiones&clienta_id=eq.${c.id}&order=orden`)).filter(visible);
      const cierres = await rows(`tarj_cierres?select=evento_id,faltaron&clienta_id=eq.${c.id}&fecha=eq.${dia}`);
      // deno-lint-ignore no-explicit-any
      const citas = (j.items ?? []).filter((e: any) => e.status !== "cancelled" && e.start?.dateTime && c.tel && telDe(e.summary ?? "") === c.tel).map((e: any) => {
        // deno-lint-ignore no-explicit-any
        const hoySes = ps.flatMap((p: any) => (p.sesiones ?? []).filter((s: any) => s.fecha === dia).map((s: any) => ({ paquete: p.nombre, n: s.n ?? null, zonas: s.zonas ?? [] })));
        return { id: e.id, hora: hhmm(e.start.dateTime), titulo: String(e.summary ?? ""), vino: /✅/.test(e.summary ?? ""), descripcion: limpio(String(e.description ?? "")).slice(0, 300), sesionesHoy: hoySes,
          // deno-lint-ignore no-explicit-any
          cierre: cierres.find((x: any) => x.evento_id === e.id)?.faltaron ?? null };
      });
      // deno-lint-ignore no-explicit-any
      const resumen = ps.filter((p: any) => p.estado === "activo").map((p: any) => ({ nombre: p.nombre, sellos: p.sellos, total: p.total_supuesto ? null : p.total }));
      return { clienta: { nombre: c.nombre, sucursal: c.sucursal, token: c.token, estricta: c.estricta }, piloto: PILOTO.includes(c.sucursal), dia, citas, paquetes: resumen };
    }

    case "cerrar_sesion": {
      await staff(b);
      const { c, suc } = await clientaPorToken(b.token);
      if (!PILOTO.includes(c.sucursal)) falla("Esta función aún no está activa en esta sucursal.");
      if (b.sucursal !== c.sucursal) falla(`Esta clienta es de ${c.sucursal}. Inicia sesión con esa sucursal para marcar su sesión.`);
      const dia = hoyMx(); const evId = String(b.eventoId ?? "");
      if (!/^[A-Za-z0-9_]{5,200}$/.test(evId)) falla("Cita no válida.");
      const H = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" };
      const cal = `https://www.googleapis.com/calendar/v3/calendars/${enc(suc.calendar_id)}/events/${enc(evId)}`;
      const g = await fetch(cal, { headers: H }); const e = await g.json(); if (!g.ok) falla("No encontramos esa cita en el calendario.");
      if (e.status === "cancelled" || !e.start?.dateTime || new Date(e.start.dateTime).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) !== dia) falla("Solo se puede marcar una cita de HOY.");
      if (!c.tel || telDe(e.summary ?? "") !== c.tel) falla("Esa cita no corresponde a esta clienta.");
      const faltaron: string[] = (Array.isArray(b.faltaron) ? b.faltaron : []).map((x: unknown) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
      const tit = String(e.summary ?? ""); const desc = String(e.description ?? "");
      const nuevoTit = /✅/.test(tit) ? tit : "✅" + tit;
      let nuevoDesc = desc;
      if (faltaron.length && !/FALT[ÓO]:/i.test(desc)) {
        const linea = `FALTÓ: ${faltaron.join(", ")} (reagendar como sesión individual)`;
        const html = esHtml(desc); const sep = html ? "<br>" : "\n"; const i = desc.indexOf(INI);
        const cabeza = (i >= 0 ? desc.slice(0, i) : desc).replace(/(?:\s|<br\s*\/?>|&nbsp;)+$/i, ""); const cola = i >= 0 ? desc.slice(i) : "";
        nuevoDesc = (cabeza ? cabeza + sep + sep : "") + linea + (cola ? sep + sep + cola : "");
      }
      if (nuevoTit === tit && nuevoDesc === desc) return { ok: true, sinCambios: true };
      const p = await fetch(`${cal}?sendUpdates=none`, { method: "PATCH", headers: { ...H, "If-Match": e.etag }, body: JSON.stringify({ summary: nuevoTit, description: nuevoDesc }) });
      if (!p.ok) falla(p.status === 412 ? "La cita cambió mientras la marcabas. Vuelve a abrirla." : "No pudimos escribir en el calendario. Intenta de nuevo.");
      await sb("tarj_calendario_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sucursal: c.sucursal, evento_id: evId, accion: "cierre", antes: desc, despues: nuevoDesc, titulo_antes: tit, titulo_despues: nuevoTit }) });
      await sb("tarj_cierres?on_conflict=sucursal,evento_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ clienta_id: c.id, sucursal: c.sucursal, evento_id: evId, fecha: dia, paquete: String(b.paquete ?? "").slice(0, 80) || null, faltaron, nota: String(b.nota ?? "").slice(0, 300) || null, usuario: String(b.usuario ?? "").slice(0, 60) }) });
      // la tarjeta se recalcula al momento (sin esperar las 5 am) y el bloque de la cita se actualiza
      let recalculada = true; try { await llamar("sync-tarjetas", `suc=${enc(c.sucursal)}`); await llamar("tarjeta-calendario", `suc=${enc(c.sucursal)}&escribir=1&evento=${enc(evId)}`); } catch (er) { recalculada = false; console.error(er); }
      return { ok: true, recalculada, tarjeta: await tarjeta(c.token, true) };
    }
    case "siguiente_horarios": {
      const x = await contextoSiguiente(b);
      const evs = await eventosFuturos(x.suc.calendar_id, Date.now() - 864e5, Date.now() + (VENTANA + 2) * DIA);
      // deno-lint-ignore no-explicit-any
      const yaTiene = evs.filter((e: any) => e.status !== "cancelled" && e.start?.dateTime && Date.parse(e.start.dateTime) > Date.now() + 2 * 3600e3 && ymd(Date.parse(e.start.dateTime)) !== x.dia && telDe(e.summary ?? "") === x.c.tel)
        // deno-lint-ignore no-explicit-any
        .map((e: any) => ({ fecha: ymd(Date.parse(e.start.dateTime)), hora: hm(Date.parse(e.start.dateTime)), titulo: String(e.summary ?? "").slice(0, 80) }));
      return { paquete: x.p.nombre, siguiente: x.siguiente, total: x.p.total_supuesto ? null : x.p.total, duracionMin: x.durMin, minimo: addMeses(x.dia, 1), dias: huecos(x.cfg, evs, x.durMin), yaTiene };
    }

    case "siguiente_agendar": {
      const x = await contextoSiguiente(b);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha)) || !/^\d{2}:\d{2}$/.test(String(b.hora))) falla("Horario inválido.");
      const evs = await eventosFuturos(x.suc.calendar_id, Date.now() - 864e5, Date.now() + (VENTANA + 2) * DIA);
      // deno-lint-ignore no-explicit-any
      const ya = evs.find((e: any) => e.status !== "cancelled" && e.start?.dateTime && Date.parse(e.start.dateTime) > Date.now() + 2 * 3600e3 && ymd(Date.parse(e.start.dateTime)) !== x.dia && telDe(e.summary ?? "") === x.c.tel);
      if (ya && !b.forzar) falla(`Ya tiene una cita el ${ymd(Date.parse(ya.start.dateTime))} a las ${hm(Date.parse(ya.start.dateTime))}. Para cambiarla usa Reagendar.`);
      if (b.fecha < addMeses(x.dia, 1) && !b.forzar) falla("Es antes del mes mínimo entre sesiones. Confirma que quieres saltarlo.");
      if (!huecos(x.cfg, evs, x.durMin)[b.fecha]?.includes(b.hora)) falla("Ese horario ya no está disponible. Elige otro.");
      const ini = inst(b.fecha, toMin(b.hora)), fin = ini + x.durMin * 60_000;
      const nombreTel = String(x.ev.summary ?? "").replace(/\p{Extended_Pictographic}[\u{FE0F}\u{200D}]*/gu, "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
      const cuerpo = { summary: nombreTel, description: `${String(x.p.nombre).toUpperCase()} SESION ${x.siguiente}`,
        start: { dateTime: `${b.fecha}T${b.hora}:00${OFFSET}`, timeZone: TZ }, end: { dateTime: `${ymd(fin)}T${hm(fin)}:00${OFFSET}`, timeZone: TZ },
        ...(x.ev.colorId ? { colorId: x.ev.colorId } : {}), reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
        extendedProperties: { private: { origen: "recepcion", paquete: String(x.p.nombre).slice(0, 80), sesion: String(x.siguiente) } } };
      const cr = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${enc(x.suc.calendar_id)}/events?sendUpdates=none`, { method: "POST", headers: { ...x.H, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const nuevo = await cr.json(); if (!cr.ok) { console.error(JSON.stringify(nuevo).slice(0, 300)); falla("No pudimos crear la cita en el calendario. Intenta de nuevo."); }
      // si dos personas tomaron el mismo hueco a la vez, se queda la creada primero
      const tras = (await eventosFuturos(x.suc.calendar_id, ini, fin)).filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start?.dateTime && rango(e)[0] < fin && rango(e)[1] > ini)
        .sort((p, q) => String(p.created).localeCompare(String(q.created)) || p.id.localeCompare(q.id));
      if (tras.findIndex((e) => e.id === nuevo.id) >= (x.cfg.capacidad ?? 1)) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${enc(x.suc.calendar_id)}/events/${enc(nuevo.id)}?sendUpdates=none`, { method: "DELETE", headers: x.H }).catch(() => {});
        falla("Alguien más acaba de tomar ese horario. Elige otro.");
      }
      await sb("tarj_calendario_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sucursal: x.c.sucursal, evento_id: nuevo.id, accion: "crear", antes: null, despues: `${cuerpo.summary} | ${cuerpo.description} | ${b.fecha} ${b.hora}` }) });
      let recalculada = true; try { await llamar("sync-tarjetas", `suc=${enc(x.c.sucursal)}`); await llamar("tarjeta-calendario", `suc=${enc(x.c.sucursal)}&escribir=1&evento=${enc(nuevo.id)}`); } catch (er) { recalculada = false; console.error(er); }
      return { ok: true, fecha: b.fecha, hora: b.hora, sesion: x.siguiente, recalculada };
    }
    default: return falla("Acción desconocida.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try { return json(await accion(await req.json())); }
  catch (e) { if (e instanceof Falla) return json({ error: e.message }, 400); console.error(e); return json({ error: "No pudimos completar la solicitud. Intenta de nuevo." }, 500); }
});
