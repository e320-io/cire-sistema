// Supabase Edge Function: lealtad
// Backend de la tarjeta de lealtad (sellos por sesión de paquete; luego Apple/Google Wallet).
//
// Público (solo con el token del QR/enlace de la clienta):
//   tarjeta     { token }                                   -> { nombre, paquetes: [...], proxima }
// Recepción (usuario + hash del sistema, verificados contra system_users):
//   emitir      { usuario, hash, clientaId }                -> { token }
//   escaneo     { usuario, hash, token }                    -> { clienta, paquetes: [{..., yaSellado, bloqueo}], proxima }
//   sellar      { usuario, hash, token, paqueteIds, sucursal } -> { ok, resultados: [...] }
//   anular      { usuario, hash, selloId }                  -> { ok }
//   disponibilidad { usuario, hash, token, paqueteId, sucursal } -> { duracionMin, dias }
//   agendar_siguiente { usuario, hash, token, paqueteId, sucursal, fecha, hora } -> { ok, fecha, hora }
//
// ¿Por qué usuario + hash? El login del sistema se valida en el navegador y no hay JWT. Para que una clienta no pueda
// sellarse sola con su propio QR, las acciones de recepción exigen el usuario y el hash de contraseña (el mismo que guarda
// system_users.password_hash) y la función lo compara en el servidor.
//
// Secretos: GOOGLE_SERVICE_ACCOUNT_JSON (el mismo de agenda-publica). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen.

import { detectTipo, duracionServicio, TIPOS } from "../agenda-publica/duraciones.ts";

const TZ = "America/Mexico_City";
const OFFSET = "-06:00";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (k: string) => Deno.env.get(k) ?? "";
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
class Falla extends Error {}
const falla = (m: string): never => { throw new Falla(m); };

// ---------- Supabase (REST con service role) ----------
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
// deno-lint-ignore no-explicit-any
const rows = async (path: string): Promise<any[]> => {
  const r = await sb(path);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`REST ${path.split("?")[0]}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const enc = encodeURIComponent;

// ---------- Tiempo (hora de CDMX) ----------
const ymd = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const hm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const toMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const inst = (dia: string, min: number) => new Date(`${dia}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00${OFFSET}`).getTime();
const iso = (ms: number) => `${ymd(ms)}T${hm(ms)}:00${OFFSET}`;
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tel10 = (t: string) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };

// ---------- Google Calendar (misma cuenta de servicio que agenda-publica) ----------
let tok: { v: string; exp: number } | null = null;
const b64u = (b: ArrayBuffer | string) => {
  const u = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let t = ""; u.forEach((c) => (t += String.fromCharCode(c)));
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function token(): Promise<string> {
  if (tok && tok.exp > Date.now() + 60_000) return tok.v;
  const sa = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_JSON"));
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google auth: " + JSON.stringify(j).slice(0, 200));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tok.v;
}
const gcal = async (calId: string, path: string, init: RequestInit = {}, qs: Record<string, string> = {}) => {
  const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${enc(calId)}/events${path}`);
  Object.entries(qs).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { ...init, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" } });
  const t = await r.text();
  const j = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${t.slice(0, 200)}`);
  return j;
};
type Ev = {
  id: string; status?: string; summary?: string; created?: string; transparency?: string;
  start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string };
};
const rango = (e: Ev): [number, number] =>
  e.start.dateTime
    ? [Date.parse(e.start.dateTime), Date.parse(e.end.dateTime!)]
    : [Date.parse(`${e.start.date}T00:00:00${OFFSET}`), Date.parse(`${e.end.date}T00:00:00${OFFSET}`)];
async function listEvents(calId: string, desde: number, hasta: number): Promise<Ev[]> {
  const out: Ev[] = []; let page = "";
  do {
    const j = await gcal(calId, "", {}, {
      timeMin: new Date(desde).toISOString(), timeMax: new Date(hasta).toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "2500", ...(page ? { pageToken: page } : {}),
    });
    out.push(...(j.items ?? [])); page = j.nextPageToken ?? "";
  } while (page);
  return out;
}

// ---------- Sucursales ----------
type Cfg = {
  slug: string; nombre: string; calendar_id: string | null; horario: Record<string, [string, string]>;
  intervalo_min: number; capacidad: number; dias_adelante: number;
};
async function cfgPorNombre(nombre: string): Promise<Cfg> {
  const todas = await rows("agenda_sucursales?select=slug,nombre,calendar_id,horario,intervalo_min,capacidad,dias_adelante&activa=eq.true");
  const c = todas.find((x) => sinAcentos(x.nombre) === sinAcentos(String(nombre ?? "")));
  if (!c) falla("No encontramos esa sucursal en la agenda.");
  if (!c.calendar_id) falla(`${c.nombre} todavía no tiene su Google Calendar conectado; agenda la sesión directo en el calendario.`);
  return c as Cfg;
}
// Horarios libres para recepción: sin anticipación mínima (puede agendar para hoy mismo, más tarde).
async function horariosLibres(cfg: Cfg, durMin: number): Promise<Record<string, string[]>> {
  const ahora = Date.now();
  const evs = await listEvents(cfg.calendar_id!, ahora, ahora + (cfg.dias_adelante + 2) * 864e5);
  const ocupados = evs.filter((e) => e.status !== "cancelled" && e.transparency !== "transparent").map(rango);
  const hoy = ymd(ahora);
  const dias: Record<string, string[]> = {};
  for (let i = 0; i < cfg.dias_adelante; i++) {
    const dia = addDays(hoy, i);
    const h = cfg.horario?.[String(dow(dia))];
    if (!h) continue;
    const libres: string[] = [];
    for (let t = toMin(h[0]); t + durMin <= toMin(h[1]); t += cfg.intervalo_min) {
      const s = inst(dia, t), e = s + durMin * 60_000;
      if (s < ahora + 30 * 60_000) continue; // al menos 30 min adelante
      if (ocupados.filter(([a, b]) => a < e && b > s).length >= cfg.capacidad) continue;
      libres.push(hm(s));
    }
    if (libres.length) dias[dia] = libres;
  }
  return dias;
}

// ---------- Autenticación de recepción ----------
async function staff(b: Record<string, string>): Promise<string> {
  const u = String(b.usuario ?? ""), h = String(b.hash ?? "");
  if (!u || !/^[0-9a-f]{64}$/.test(h)) falla("Sesión no válida. Vuelve a entrar al sistema.");
  const r = await rows(`system_users?select=username&username=eq.${enc(u)}&password_hash=eq.${h}`);
  if (!r.length) falla("Sesión no válida. Vuelve a entrar al sistema.");
  return u;
}

// ---------- Tarjeta ----------
type Paq = {
  id: string; servicio: string; total_sesiones: number; sesiones_usadas: number; activo: boolean; fecha_compra: string | null;
  es_preventa?: boolean; preventa_liquidado?: boolean; ticket_id?: string | null;
};
async function clientaPorToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token ?? ""))) falla("Tarjeta no válida.");
  const t = (await rows(`tarjetas_lealtad?select=clienta_id&token=eq.${token}`))[0];
  if (!t) falla("Tarjeta no válida.");
  const c = (await rows(`clientas?select=id,nombre,telefono&id=eq.${enc(t.clienta_id)}`))[0];
  if (!c) falla("No encontramos a la clienta de esta tarjeta.");
  return c as { id: string; nombre: string; telefono: string | null };
}
async function paquetesDe(clientaId: string): Promise<Paq[]> {
  const todos = await rows(`paquetes?select=*&clienta_id=eq.${enc(clientaId)}&order=fecha_compra.desc`);
  // La tarjeta es para paquetes de varias sesiones.
  return todos.filter((p) => Number(p.total_sesiones) >= 2) as Paq[];
}
// Próxima sesión = la más cercana futura entre lo agendado desde recepción (Google Calendar, lectura en vivo)
// y las citas "agendada" del sistema.
async function proxima(clientaId: string, paqIds: string[]) {
  const ahora = Date.now();
  const cand: { ini: number; fin: number; paqueteId: string; origen: string }[] = [];
  const lc = await rows(`lealtad_citas?select=paquete_id,slug,event_id&clienta_id=eq.${enc(clientaId)}&order=created_at.desc&limit=10`);
  const sucs = lc.length ? await rows("agenda_sucursales?select=slug,calendar_id,nombre") : [];
  for (const x of lc) {
    const s = sucs.find((y) => y.slug === x.slug);
    if (!s?.calendar_id) continue;
    try {
      const e: Ev = await gcal(s.calendar_id, `/${enc(x.event_id)}`);
      if (e.status === "cancelled" || !e.start?.dateTime) continue;
      const [ini, fin] = rango(e);
      if (ini > ahora) cand.push({ ini, fin, paqueteId: x.paquete_id, origen: s.nombre });
    } catch { /* el evento ya no existe */ }
  }
  const hoy = ymd(ahora);
  const ci = await rows(`citas?select=paquete_id,fecha,hora_inicio,hora_fin,sucursal_nombre&clienta_id=eq.${enc(clientaId)}&estado=eq.agendada&fecha=gte.${hoy}&order=fecha.asc,hora_inicio.asc&limit=10`);
  for (const c of ci) {
    const ini = inst(c.fecha, toMin(String(c.hora_inicio).slice(0, 5)));
    const fin = c.hora_fin ? inst(c.fecha, toMin(String(c.hora_fin).slice(0, 5))) : ini + 3600_000;
    if (ini > ahora && (!c.paquete_id || paqIds.includes(String(c.paquete_id)))) cand.push({ ini, fin, paqueteId: String(c.paquete_id ?? ""), origen: c.sucursal_nombre });
  }
  cand.sort((a, b) => a.ini - b.ini);
  const p = cand[0];
  return p ? { fecha: ymd(p.ini), hora: hm(p.ini), horaFin: hm(p.fin), paqueteId: p.paqueteId, sucursal: p.origen } : null;
}
const primerNombre = (n: string) => String(n ?? "").trim().split(/\s+/)[0] || "";

// ---------- Reglas de sello ----------
async function estadoDelDia(p: Paq, hoy: string) {
  const sel = await rows(`sellos?select=id&paquete_id=eq.${enc(p.id)}&fecha=eq.${hoy}&anulado=eq.false`);
  if (sel.length) return { yaSellado: true, bloqueo: "Ya tiene sello de hoy." };
  const comp = await rows(`citas?select=id&paquete_id=eq.${enc(p.id)}&fecha=eq.${hoy}&estado=eq.completada`);
  if (comp.length) return { yaSellado: true, bloqueo: "Esta sesión ya se registró hoy desde la agenda." };
  if (!p.activo || p.sesiones_usadas >= p.total_sesiones) return { yaSellado: false, bloqueo: "Este paquete ya está completo." };
  // Si la sesión de hoy tiene cobro pendiente (anticipo / preventa), el cobro se hace desde la agenda del sistema.
  const hoyCitas = await rows(`citas?select=id,notas,es_cobro&paquete_id=eq.${enc(p.id)}&fecha=eq.${hoy}&estado=eq.agendada`);
  const cobro = hoyCitas.some((c) => !c.es_cobro && /Anticipo \$\d+|Sin anticipo/.test(String(c.notas ?? ""))) || (p.es_preventa && !p.preventa_liquidado);
  if (cobro) return { yaSellado: false, bloqueo: "Tiene cobro pendiente: completa la cita desde la Agenda del sistema y el sello se pondrá solo." };
  return { yaSellado: false, bloqueo: null };
}

// ---------- Acciones ----------
// deno-lint-ignore no-explicit-any
async function accion(b: Record<string, any>) {
  switch (b.accion) {
    case "tarjeta": {
      const c = await clientaPorToken(b.token);
      const paqs = await paquetesDe(c.id);
      const orden = [...paqs].sort((x, y) => Number(y.activo) - Number(x.activo));
      return {
        nombre: primerNombre(c.nombre),
        paquetes: orden.slice(0, 8).map((p) => ({ id: p.id, servicio: p.servicio, total: p.total_sesiones, usadas: p.sesiones_usadas, activo: p.activo })),
        proxima: await proxima(c.id, paqs.map((p) => String(p.id))),
      };
    }

    case "emitir": {
      await staff(b);
      const id = String(b.clientaId ?? "");
      if (!id) falla("Falta la clienta.");
      const c = (await rows(`clientas?select=id&id=eq.${enc(id)}`))[0];
      if (!c) falla("No encontramos a la clienta.");
      let t = (await rows(`tarjetas_lealtad?select=token&clienta_id=eq.${enc(id)}`))[0];
      if (!t) {
        await sb("tarjetas_lealtad", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ clienta_id: id }) });
        t = (await rows(`tarjetas_lealtad?select=token&clienta_id=eq.${enc(id)}`))[0];
      }
      return { token: t.token };
    }

    case "escaneo": {
      await staff(b);
      const c = await clientaPorToken(b.token);
      const hoy = ymd(Date.now());
      const paqs = await paquetesDe(c.id);
      const activos = paqs.filter((p) => p.activo && p.sesiones_usadas < p.total_sesiones);
      const salida = [];
      for (const p of activos) {
        const e = await estadoDelDia(p, hoy);
        salida.push({ id: p.id, servicio: p.servicio, total: p.total_sesiones, usadas: p.sesiones_usadas, ...e });
      }
      const sellosHoy = await rows(`sellos?select=id,paquete_id,sesion_numero&clienta_id=eq.${enc(c.id)}&fecha=eq.${hoy}&anulado=eq.false`);
      return {
        clienta: { id: c.id, nombre: c.nombre, telefono: c.telefono },
        paquetes: salida,
        completos: paqs.filter((p) => !activos.includes(p)).length,
        sellosHoy,
        proxima: await proxima(c.id, paqs.map((p) => String(p.id))),
      };
    }

    case "sellar": {
      const usuario = await staff(b);
      const c = await clientaPorToken(b.token);
      const ids: string[] = Array.isArray(b.paqueteIds) ? b.paqueteIds.map(String) : [];
      if (!ids.length) falla("Elige al menos un paquete.");
      const hoy = ymd(Date.now());
      const resultados = [];
      for (const id of ids) {
        const p = (await rows(`paquetes?select=*&id=eq.${enc(id)}&clienta_id=eq.${enc(c.id)}`))[0] as Paq | undefined;
        if (!p) { resultados.push({ paqueteId: id, ok: false, motivo: "Paquete no encontrado." }); continue; }
        const est = await estadoDelDia(p, hoy);
        if (est.bloqueo) { resultados.push({ paqueteId: id, servicio: p.servicio, ok: false, motivo: est.bloqueo }); continue; }
        const n = p.sesiones_usadas + 1;
        // El índice único (paquete, día) es el candado contra el doble escaneo simultáneo.
        const ins = await sb("sellos", { method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ clienta_id: c.id, paquete_id: p.id, sesion_numero: n, fecha: hoy, sucursal: String(b.sucursal ?? "").slice(0, 40), usuario }) });
        const sello = await ins.json();
        if (!ins.ok || !Array.isArray(sello) || !sello[0]) { resultados.push({ paqueteId: id, servicio: p.servicio, ok: false, motivo: "Ya tiene sello de hoy." }); continue; }
        // Contador con condición (sesiones_usadas debe seguir igual) para no pisar un cambio simultáneo.
        const up = await sb(`paquetes?id=eq.${enc(p.id)}&sesiones_usadas=eq.${p.sesiones_usadas}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ sesiones_usadas: n, activo: n < p.total_sesiones }) });
        const upj = await up.json();
        if (!up.ok || !Array.isArray(upj) || !upj.length) {
          await sb(`sellos?id=eq.${sello[0].id}`, { method: "DELETE" });
          resultados.push({ paqueteId: id, servicio: p.servicio, ok: false, motivo: "El paquete cambió mientras sellabas. Vuelve a escanear." });
          continue;
        }
        // Si había una cita agendada hoy para este paquete en el sistema, queda completada (sin cobro: ya validamos que no lo tiene).
        await sb(`citas?paquete_id=eq.${enc(p.id)}&fecha=eq.${hoy}&estado=eq.agendada`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "completada" }) });
        resultados.push({ paqueteId: id, servicio: p.servicio, ok: true, selloId: sello[0].id, sesion: n, total: p.total_sesiones, completo: n >= p.total_sesiones });
      }
      return { ok: resultados.some((r) => r.ok), resultados };
    }

    case "anular": {
      await staff(b);
      const s = (await rows(`sellos?select=*&id=eq.${enc(String(b.selloId ?? ""))}`))[0];
      if (!s || s.anulado) falla("Ese sello ya no existe.");
      if (s.fecha !== ymd(Date.now())) falla("Solo se puede deshacer un sello del mismo día. Pídele a administración que lo corrija.");
      const p = (await rows(`paquetes?select=sesiones_usadas&id=eq.${enc(s.paquete_id)}`))[0];
      await sb(`sellos?id=eq.${s.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ anulado: true }) });
      if (p) await sb(`paquetes?id=eq.${enc(s.paquete_id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sesiones_usadas: Math.max(0, p.sesiones_usadas - 1), activo: true }) });
      return { ok: true };
    }

    case "disponibilidad": {
      await staff(b);
      const c = await clientaPorToken(b.token);
      const p = (await rows(`paquetes?select=servicio&id=eq.${enc(String(b.paqueteId ?? ""))}&clienta_id=eq.${enc(c.id)}`))[0];
      if (!p) falla("Paquete no encontrado.");
      const cfg = await cfgPorNombre(b.sucursal);
      const dur = await duracionDe(p.servicio);
      return { duracionMin: dur, dias: await horariosLibres(cfg, dur) };
    }

    case "agendar_siguiente": {
      const usuario = await staff(b);
      const c = await clientaPorToken(b.token);
      const p = (await rows(`paquetes?select=*&id=eq.${enc(String(b.paqueteId ?? ""))}&clienta_id=eq.${enc(c.id)}`))[0] as Paq | undefined;
      if (!p) falla("Paquete no encontrado.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !/^\d{2}:\d{2}$/.test(b.hora)) falla("Horario inválido.");
      const tel = tel10(c.telefono ?? "");
      if (!tel) falla("La clienta no tiene celular registrado. Captúralo en su ficha para poder agendar (el celular va en el título del evento).");
      const cfg = await cfgPorNombre(b.sucursal);
      const dur = await duracionDe(p!.servicio);
      const libres = await horariosLibres(cfg, dur);
      if (!libres[b.fecha]?.includes(b.hora)) falla("Ese horario ya no está disponible. Elige otro.");
      const ini = inst(b.fecha, toMin(b.hora)), fin = ini + dur * 60_000;
      const sig = Math.min(p!.sesiones_usadas + 1, p!.total_sesiones);
      // Convención CIRE: sin emoji (el paquete ya está pagado). El celular va en el título para que /agendar la encuentre.
      const ev = await gcal(cfg.calendar_id!, "", {
        method: "POST",
        body: JSON.stringify({
          summary: `${c.nombre} ${tel}`,
          description: `${cfg.nombre} ${p!.servicio} · Sesión ${sig} de ${p!.total_sesiones}\n🪪 Agendada desde recepción (tarjeta de lealtad) por ${usuario}.`,
          start: { dateTime: iso(ini), timeZone: TZ }, end: { dateTime: iso(fin), timeZone: TZ },
          colorId: TIPOS[detectTipo(p!.servicio)]?.colorId ?? "11",
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
          extendedProperties: { private: { origen: "lealtad", clienta_id: String(c.id), paquete_id: String(p!.id) } },
        }),
      }, { sendUpdates: "none" });
      // Google no tiene candados: si dos citas cayeron en el mismo hueco, gana la que se creó primero.
      const traslapan = (await listEvents(cfg.calendar_id!, ini, fin))
        .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start.dateTime && rango(e)[0] < fin && rango(e)[1] > ini)
        .sort((x, y) => String(x.created).localeCompare(String(y.created)) || x.id.localeCompare(y.id));
      if (traslapan.findIndex((e) => e.id === ev.id) >= cfg.capacidad) {
        await gcal(cfg.calendar_id!, `/${enc(ev.id)}`, { method: "DELETE" }).catch(() => {});
        falla("Alguien más acaba de tomar ese horario. Elige otro.");
      }
      await sb("lealtad_citas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ clienta_id: c.id, paquete_id: p!.id, slug: cfg.slug, event_id: ev.id, usuario }) });
      return { ok: true, fecha: b.fecha, hora: b.hora, horaFin: hm(fin), sesion: sig, total: p!.total_sesiones };
    }

    default:
      return falla("Acción desconocida.");
  }
}

async function duracionDe(servicio: string): Promise<number> {
  const cat = (await rows(`catalogo?select=duracion_min&nombre=eq.${enc(servicio)}&limit=1`))[0];
  return duracionServicio(servicio, detectTipo(servicio), cat?.duracion_min ?? null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    return json(await accion(await req.json()));
  } catch (e) {
    if (e instanceof Falla) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "No pudimos completar la solicitud. Intenta de nuevo." }, 500);
  }
});
