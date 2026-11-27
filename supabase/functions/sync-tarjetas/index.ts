// Supabase Edge Function: sync-tarjetas
// Lee el Google Calendar de cada sucursal (SOLO LECTURA), calcula la tarjeta de cada clienta con el motor validado
// (_shared/tarjetas-motor.ts) y la guarda en las tablas tarj_* (aisladas: no toca `paquetes`, `clientas` ni Google).
//
// Llamada: POST .../functions/v1/sync-tarjetas con el header  x-sync-key: <SYNC_KEY>
//   ?suc=Metepec   solo una sucursal (por defecto, todas las que tienen calendario)
//   ?dry=1         calcula y devuelve cifras SIN escribir nada
// Secretos: GOOGLE_SERVICE_ACCOUNT_JSON (el mismo de agenda-publica), SYNC_KEY. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen.
// NO manda mensajes a nadie.

import { armarTarjetas } from "../_shared/tarjetas-motor.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const enc = encodeURIComponent;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const SK = () => env("SUPABASE_SERVICE_ROLE_KEY");
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { apikey: SK(), Authorization: `Bearer ${SK()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
// deno-lint-ignore no-explicit-any
async function todas(path: string): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (let off = 0; off < 200000; off += 1000) {
    const r = await sb(path, { headers: { Range: `${off}-${off + 999}` } }); const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`REST ${path.split("?")[0]}: ${JSON.stringify(j).slice(0, 200)}`);
    out.push(...j); if (j.length < 1000) break;
  }
  return out;
}

// ---------- Google Calendar (cuenta de servicio, solo lectura) ----------
const b64u = (b: ArrayBuffer | string) => { const u = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b); let t = ""; u.forEach((c) => (t += String.fromCharCode(c))); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
let tok: { v: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (tok && tok.exp > Date.now() + 60_000) return tok.v;
  const sa = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_JSON")); const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google auth: " + JSON.stringify(j).slice(0, 200));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }; return tok.v;
}
async function eventos(calId: string, desde: Date, hasta: Date) {
  const tk = await token();
  // deno-lint-ignore no-explicit-any
  const out: any[] = []; let page = "";
  do {
    const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${enc(calId)}/events`);
    u.searchParams.set("timeMin", desde.toISOString()); u.searchParams.set("timeMax", hasta.toISOString());
    u.searchParams.set("singleEvents", "true"); u.searchParams.set("maxResults", "2500"); if (page) u.searchParams.set("pageToken", page);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${tk}` } }); const j = await r.json(); if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    for (const e of j.items ?? []) {
      if (e.status === "cancelled") continue;
      out.push({ id: e.id, ini: e.start?.dateTime ?? e.start?.date, fin: e.end?.dateTime ?? e.end?.date, diaCompleto: !e.start?.dateTime, t: e.summary ?? "",
        d: String(e.description ?? "").replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/🪪 TARJETA CIRE[\s\S]*$/, "").slice(0, 900) });
    }
    page = j.nextPageToken ?? "";
  } while (page);
  return out;
}

const trozos = <T>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

Deno.serve(async (req) => {
  if (!env("SYNC_KEY") || req.headers.get("x-sync-key") !== env("SYNC_KEY")) return new Response("no", { status: 401 });
  const q = new URL(req.url).searchParams; const dry = q.get("dry") === "1"; const solo = q.get("suc");
  try {
    const todasSuc = await todas("agenda_sucursales?select=nombre,calendar_id&calendar_id=not.is.null");
    // El servidor limita ~2 s de CPU por llamada: se procesa UNA sucursal por llamada (el cron llama una vez por sucursal).
    if (!solo) return json({ error: "Indica ?suc=<Sucursal>. Sucursales con calendario: " + todasSuc.map((x) => x.nombre).join(", ") }, 400);
    const sucs = todasSuc.filter((s) => s.nombre === solo);
    if (!sucs.length) return json({ error: "Esa sucursal no tiene calendario" }, 400);
    const ahora = Date.now(); const desde = new Date(ahora - 420 * 864e5), hasta = new Date(ahora + 150 * 864e5);
    const desdeTk = new Date(ahora - 430 * 864e5).toISOString().slice(0, 10);
    // datos del sistema SOLO de esta sucursal (solo lectura). Los tickets pueden referirse a clientas de otra sucursal: se piden por id.
    const tickets = await todas(`tickets?select=ticket_zettle,servicios,fecha,clienta_nombre,clienta_id,sucursal_nombre&sucursal_nombre=eq.${enc(solo)}&fecha=gte.${desdeTk}`);
    const idsTk = [...new Set(tickets.map((t) => t.clienta_id).filter(Boolean))];
    const delSuc = await todas(`clientas?select=id,nombre,telefono,sucursal_nombre&sucursal_nombre=eq.${enc(solo)}`);
    const conocidos = new Set(delSuc.map((c) => c.id)); const faltan = idsTk.filter((i) => !conocidos.has(i)); let otras: typeof delSuc = [];
    for (const lote of trozos(faltan, 150)) otras = otras.concat(await todas(`clientas?select=id,nombre,telefono,sucursal_nombre&id=in.(${lote.join(",")})`));
    const clientasSis = delSuc.concat(otras);
    const paquetesSis = await todas(`paquetes?select=clienta_id,servicio,sucursal_nombre&sucursal_nombre=eq.${enc(solo)}`);
    const resumen = [];
    for (const s of sucs) {
      const t0 = Date.now(); let error: string | null = null; let st = { eventos: 0, clientas: 0, paquetes: 0, estrictas: 0, alta: 0 };
      try {
        const evs = await eventos(s.calendar_id, desde, hasta);
        const out = armarTarjetas({ sucursal: s.nombre, eventos: evs, tickets, clientasSis, paquetesSis, ahoraMs: ahora });
        st = { eventos: evs.length, clientas: out.clientas.length, paquetes: out.clientas.reduce((a, c) => a + c.paquetes.length, 0),
          estrictas: out.clientas.filter((c) => c.estricta).length, alta: out.clientas.filter((c) => c.nivel === "alta").length };
        if (!dry) {
          const now = new Date().toISOString(); const idPorClave = new Map<string, string>();
          for (const lote of trozos(out.clientas, 200)) {
            const filas = lote.map((c) => ({ sucursal: s.nombre, clave: c.tel || "N:" + c.nombre, tel: c.tel || null, nombre: c.nombre, titulo_calendario: c.titulo, nivel: c.nivel, estricta: c.estricta, sin_asignar: c.sinAsignar, actualizado_en: now }));
            const r = await sb("tarj_clientas?on_conflict=sucursal,clave&select=id,clave", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(filas) });
            const j = await r.json(); if (!r.ok) throw new Error("tarj_clientas: " + JSON.stringify(j).slice(0, 300)); j.forEach((x: { id: string; clave: string }) => idPorClave.set(x.clave, x.id));
          }
          for (const lote of trozos(out.clientas, 100)) {
            const ids = lote.map((c) => idPorClave.get(c.tel || "N:" + c.nombre)).filter(Boolean);
            const del = await sb(`tarj_paquetes?clienta_id=in.(${ids.join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); if (!del.ok) throw new Error("borrar paquetes: " + (await del.text()).slice(0, 200));
            const filas = lote.flatMap((c) => c.paquetes.map((p, i) => ({ clienta_id: idPorClave.get(c.tel || "N:" + c.nombre), orden: i, nombre: p.nombre, tipo: p.tipo, combo: p.combo, mant: !!p.mant, regalo: !!p.regalo, total: p.total ?? null,
              total_supuesto: !!p.totalSupuesto, sellos: p.sellos, por_confirmar: p.porConfirmar, estado: p.estado, proxima: p.proxima, ultima: p.ultima, confianza: p.confianza, ticket: p.ticket, leyendas: p.leyendas, notas: p.notas, variantes: p.variantes, sesiones: p.sesiones, actualizado_en: now })));
            for (const f of trozos(filas, 400)) { const ins = await sb("tarj_paquetes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(f) }); if (!ins.ok) throw new Error("insertar paquetes: " + (await ins.text()).slice(0, 300)); }
          }
        }
      } catch (e) { error = String(e instanceof Error ? e.message : e).slice(0, 500); console.error(s.nombre, error); }
      const dur = Date.now() - t0;
      await sb("tarj_sync_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sucursal: s.nombre, ...st, modo: dry ? "dry" : "escribir", duracion_ms: dur, error }) }).catch(() => {});
      resumen.push({ sucursal: s.nombre, ...st, duracion_ms: dur, error });
    }
    return json({ modo: dry ? "dry (no se escribió nada)" : "escribir", resumen });
  } catch (e) { console.error(e); return json({ error: String(e instanceof Error ? e.message : e).slice(0, 500) }, 500); }
});
