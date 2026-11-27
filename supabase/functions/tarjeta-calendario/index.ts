// Supabase Edge Function: tarjeta-calendario
// Agrega (o actualiza) al FINAL de la descripción de las citas FUTURAS de Google Calendar un bloque "🪪 TARJETA CIRE" con el
// resumen de la tarjeta de la clienta. NO toca título, hora, invitados ni ningún otro campo (PATCH solo de `description`),
// no avisa a nadie (sendUpdates=none) y guarda la descripción anterior en tarj_calendario_log.
//
// Llamada: POST .../functions/v1/tarjeta-calendario  header  x-sync-key: <SYNC_KEY>
//   ?suc=Metepec        (obligatorio, una sucursal por llamada)
//   (sin más)           SIMULACRO: no escribe nada, devuelve lo que pondría
//   ?escribir=1         escribe de verdad (máx. ?max=5 citas por llamada, hasta 60)
//   ?evento=<id>        solo esa cita (para pruebas)
//   ?revertir=1         quita el bloque de las citas (con ?evento=<id> solo una)
//   ?dias=45            ventana hacia adelante (por defecto 45)

import { telDe } from "../_shared/calendario-clasificador.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const enc = encodeURIComponent;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
// deno-lint-ignore no-explicit-any
const rows = async (path: string): Promise<any[]> => { const r = await sb(path); const j = await r.json(); if (!Array.isArray(j)) throw new Error(`REST ${path.split("?")[0]}: ${JSON.stringify(j).slice(0, 200)}`); return j; };
const URL_BASE = "https://ciredepilacion.com/sistema/r/";
const INI = "🪪 TARJETA CIRE", FIN = "🪪 FIN";
const DIA = 864e5;

const b64u = (b: ArrayBuffer | string) => { const u = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b); let t = ""; u.forEach((c) => (t += String.fromCharCode(c))); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
async function token(): Promise<string> {
  const sa = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_JSON")); const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.events", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google auth: " + JSON.stringify(j).slice(0, 200)); return j.access_token as string;
}

const fechaMx = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const bonita = (f: string) => { const [, m, d] = f.split("-"); return `${Number(d)} ${MESES[Number(m) - 1]}`; };

// deno-lint-ignore no-explicit-any
function visible(p: any) {
  if (p.estado === "inactivo") return false;
  if (p.estado === "completo" && p.ultima && Date.now() - Date.parse(p.ultima) > 150 * DIA) return false;
  return true;
}
// Texto del bloque (líneas simples). `fechaCita` = día de ESTA cita, para decir qué sesión es.
// deno-lint-ignore no-explicit-any
function lineas(c: any, ps: any[], fechaCita: string): string[] {
  const L: string[] = [INI + " (se actualiza sola; no editar)"];
  if (!ps.length) L.push("Sin paquete activo registrado.");
  for (const p of ps.slice(0, 3)) {
    const tot = p.total && !p.total_supuesto ? p.total : null;
    const barra = tot ? "✓".repeat(Math.min(p.sellos, tot)) + "○".repeat(Math.max(0, Math.min(tot, 12) - p.sellos)) : "";
    const lleva = tot ? `${p.sellos} de ${tot}` : (p.sellos === 1 ? "1 sesión" : `${p.sellos} sesiones`);
    L.push(`• ${p.nombre}: ${lleva}${barra ? " " + barra : ""}${p.estado === "completo" ? " (completo)" : ""}`);
    // deno-lint-ignore no-explicit-any
    const esta = (p.sesiones ?? []).find((s: any) => s.fecha === fechaCita);
    if (esta?.n) L.push(`   Esta cita: sesión ${esta.n}${esta.inf ? " (calculada)" : ""}`);
    else if (esta && esta.suelta) L.push("   Esta cita: sesión suelta");
    if (p.estado === "activo" && p.total && !p.total_supuesto && !p.proxima && p.sellos < p.total) L.push("   ⚠️ Cita abierta: aún sin siguiente sesión agendada");
  }
  if (!c.estricta) L.push("⚠️ Por validar con la clienta (puede faltar o sobrar alguna sesión)");
  L.push(`Detalle: ${URL_BASE}${c.token}`);
  L.push(`Calculada el ${bonita(new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }))} · ${FIN}`);
  return L;
}
const esHtml = (d: string) => /<\/?(br|p|div|span|b|i|a|ul|li)\b/i.test(d);
const QUITAR = new RegExp(`(?:\\s|<br\\s*/?>|&nbsp;)*${INI}[\\s\\S]*?${FIN}[^\\n<]*`, "i");
const quitar = (d: string) => d.replace(QUITAR, "");
function conBloque(d: string, L: string[]): string {
  const base = quitar(d).replace(/(?:\s|<br\s*\/?>|&nbsp;)+$/i, "");
  if (esHtml(base)) return (base ? base + "<br><br>" : "") + L.map((x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
  return (base ? base + "\n\n" : "") + L.join("\n");
}

Deno.serve(async (req) => {
  if (!env("SYNC_KEY") || req.headers.get("x-sync-key") !== env("SYNC_KEY")) return new Response("no", { status: 401 });
  const q = new URL(req.url).searchParams; const solo = q.get("suc"); const escribir = q.get("escribir") === "1"; const revertir = q.get("revertir") === "1";
  const unico = q.get("evento"); const max = Math.min(60, Math.max(1, Number(q.get("max") ?? 5))); const dias = Math.min(90, Math.max(1, Number(q.get("dias") ?? 45)));
  try {
    if (!solo) return json({ error: "Indica ?suc=<Sucursal>" }, 400);
    const suc = (await rows(`agenda_sucursales?select=nombre,calendar_id&nombre=eq.${enc(solo)}&calendar_id=not.is.null`))[0];
    if (!suc) return json({ error: "Esa sucursal no tiene calendario" }, 400);
    const tk = await token(); const H = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
    const cal = `https://www.googleapis.com/calendar/v3/calendars/${enc(suc.calendar_id)}/events`;
    const ahora = new Date(); // solo de MAÑANA en adelante (las de hoy cambian al atenderse)
    const hoy0 = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })}T00:00:00-06:00`);
    const manana = new Date(new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })}T00:00:00-06:00`).getTime() + DIA);
    // deno-lint-ignore no-explicit-any
    let evs: any[] = [];
    if (unico) { const r = await fetch(`${cal}/${enc(unico)}`, { headers: H }); const j = await r.json(); if (!r.ok) throw new Error(`Google ${r.status}: ${JSON.stringify(j).slice(0, 200)}`); evs = [j]; }
    else {
      let page = "";
      do {
        const u = new URL(cal); u.searchParams.set("timeMin", (q.get("desde") === "hoy" ? hoy0 : manana).toISOString()); u.searchParams.set("timeMax", new Date(ahora.getTime() + dias * DIA).toISOString());
        u.searchParams.set("singleEvents", "true"); u.searchParams.set("orderBy", "startTime"); u.searchParams.set("maxResults", "2500"); if (page) u.searchParams.set("pageToken", page);
        const r = await fetch(u, { headers: H }); const j = await r.json(); if (!r.ok) throw new Error(`Google ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
        evs = evs.concat(j.items ?? []); page = j.nextPageToken ?? "";
      } while (page);
    }
    const cl = await rows(`tarj_clientas?select=id,clave,nombre,token,estricta&sucursal=eq.${enc(suc.nombre)}`);
    const porClave = new Map(cl.map((x) => [x.clave, x]));
    const ids = cl.map((x) => x.id);
    // deno-lint-ignore no-explicit-any
    const paq: any[] = []; for (let i = 0; i < ids.length; i += 100) paq.push(...await rows(`tarj_paquetes?select=clienta_id,orden,nombre,estado,sellos,total,total_supuesto,proxima,ultima,sesiones&clienta_id=in.(${ids.slice(i, i + 100).join(",")})&order=orden`));
    const buscado = q.get("buscar") ? evs.filter((e) => String(e.summary ?? "").toLowerCase().includes(String(q.get("buscar")).toLowerCase())).map((e) => ({ id: e.id, titulo: e.summary, inicio: e.start?.dateTime, desc: String(e.description ?? "").slice(0, 120) })) : undefined;
    const resultado = []; let escritas = 0, iguales = 0, sinClienta = 0, omitidas = 0;
    for (const e of evs) {
      if (e.status === "cancelled" || !e.start?.dateTime) { omitidas++; continue; }
      const desc = String(e.description ?? "");
      if (revertir) {
        if (!QUITAR.test(desc)) continue;
        if (!escribir) { resultado.push({ id: e.id, titulo: e.summary, accion: "revertiría" }); continue; }
        if (escritas >= max) break;
        const nuevo = quitar(desc).replace(/(?:\s|<br\s*\/?>|&nbsp;)+$/i, "");
        const r = await fetch(`${cal}/${enc(e.id)}?sendUpdates=none`, { method: "PATCH", headers: { ...H, "If-Match": e.etag }, body: JSON.stringify({ description: nuevo }) });
        if (!r.ok) { resultado.push({ id: e.id, error: `Google ${r.status}` }); continue; }
        await sb("tarj_calendario_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sucursal: suc.nombre, evento_id: e.id, accion: "revertir", antes: desc, despues: nuevo }) });
        escritas++; resultado.push({ id: e.id, titulo: e.summary, accion: "revertida" }); continue;
      }
      const tel = unico && q.get("tel") ? String(q.get("tel")) : telDe(e.summary ?? ""); if (!unico && q.get("tel") && tel !== q.get("tel")) continue; const c = tel ? porClave.get(tel) : null;
      if (!c) { sinClienta++; continue; }
      const ps = paq.filter((p) => p.clienta_id === c.id && visible(p)).sort((a, b) => Number(b.estado === "activo") - Number(a.estado === "activo"));
      const L = lineas(c, ps, fechaMx(e.start.dateTime));
      // el "Calculada el …" cambia cada día; si lo demás es igual no hace falta reescribir
      const nuevo = conBloque(desc, L);
      const sinFecha = (s: string) => s.replace(/Calculada el [^\n<]*/, "");
      if (sinFecha(nuevo) === sinFecha(desc)) { iguales++; continue; }
      if (!escribir) { resultado.push({ id: e.id, titulo: e.summary, inicio: e.start.dateTime, accion: "pondría", bloque: L }); continue; }
      if (escritas >= max) break;
      const r = await fetch(`${cal}/${enc(e.id)}?sendUpdates=none`, { method: "PATCH", headers: { ...H, "If-Match": e.etag }, body: JSON.stringify({ description: nuevo }) });
      if (!r.ok) { resultado.push({ id: e.id, titulo: e.summary, error: `Google ${r.status}` }); continue; }
      await sb("tarj_calendario_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sucursal: suc.nombre, evento_id: e.id, accion: "escribir", antes: desc, despues: nuevo }) });
      escritas++; resultado.push({ id: e.id, titulo: e.summary, accion: "escrita" });
    }
    return json({ buscado, modo: revertir ? (escribir ? "revertir" : "simulacro de revertir") : escribir ? "escribir" : "SIMULACRO (no se escribió nada)", sucursal: suc.nombre, eventos_leidos: evs.length, escritas, ya_al_dia: iguales, sin_tarjeta: sinClienta, omitidas, resultado: resultado.slice(0, 80) });
  } catch (e) { console.error(e); return json({ error: String(e instanceof Error ? e.message : e).slice(0, 500) }, 500); }
});
