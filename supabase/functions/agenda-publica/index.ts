// Supabase Edge Function: agenda-publica
// Backend del link self-service /agendar/<sucursal>: la clienta busca su cita (celular + nombre) y la reagenda a otro
// horario libre de la misma duración. Lee y mueve eventos en el Google Calendar de la sucursal con una cuenta de servicio.
//
// POST { accion, slug, ... }
//   info          { slug }                                        -> { nombre }
//   buscar        { slug, nombre, telefono }                      -> { citas: [...] }
//   disponibilidad{ slug, nombre, telefono, eventId }             -> { duracionMin, dias: { "YYYY-MM-DD": ["10:00", ...] } }
//   reagendar     { slug, nombre, telefono, eventId, fecha, hora }-> { ok, fecha, hora }
//   sucursales    {}                                              -> { sucursales: [{ slug, nombre }] }
//   servicios     { slug }                                        -> { grupos: [{ categoria, items: [{ id, nombre, precio, duracionMin }] }] }
//   disponibilidad_nueva { slug, servicioId }                     -> { duracionMin, dias }
//   agendar       { slug, nombre, telefono, servicioId, fecha, hora } -> { ok, fecha, hora, horaFin, servicio }
//
// Convención de títulos de CIRE: 🧊 = aún sin anticipo, 💰 = ya mandó anticipo, 🔁 = reagendada.
//
// Secretos: GOOGLE_SERVICE_ACCOUNT_JSON (JSON completo de la cuenta de servicio). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen.
// Cada calendario de sucursal debe estar compartido con el client_email de la cuenta de servicio ("Hacer cambios en eventos").
// Formato esperado del evento: el celular va en el título (ej. "Ximena Bustillo Díaz 5611115676").

import { TIPOS, detectTipo, duracionServicio, precioVigente } from "./duraciones.ts";

const TZ = "America/Mexico_City";
const OFFSET = "-06:00"; // México no tiene horario de verano desde 2022
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (k: string) => Deno.env.get(k) ?? "";
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
class Falla extends Error {} // error que sí se le muestra a la clienta
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

type Cfg = {
  slug: string; nombre: string; calendar_id: string; horario: Record<string, [string, string]>;
  intervalo_min: number; capacidad: number; anticipacion_horas: number; anticipacion_nueva_horas: number; dias_adelante: number;
};
async function getCfg(slug: string): Promise<Cfg> {
  const r = await sb(`agenda_sucursales?slug=eq.${encodeURIComponent(slug)}&activa=eq.true&select=*`);
  const rows = await r.json();
  const cfg = Array.isArray(rows) ? rows[0] : null;
  if (!cfg || !cfg.calendar_id) falla("Esta sucursal aún no tiene agenda en línea.");
  return cfg as Cfg;
}

// ---------- Google Calendar (cuenta de servicio) ----------
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
  const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events${path}`);
  Object.entries(qs).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { ...init, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" } });
  const t = await r.text(); // DELETE responde 204 sin cuerpo
  const j = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${t.slice(0, 200)}`);
  return j;
};

type Ev = {
  id: string; status?: string; summary?: string; description?: string;
  start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string };
  transparency?: string; extendedProperties?: { private?: Record<string, string> };
};
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

// ---------- Tiempo (todo en hora de CDMX) ----------
const ymd = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const hm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const toMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const inst = (dia: string, min: number) => new Date(`${dia}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00${OFFSET}`).getTime();
const iso = (ms: number) => `${ymd(ms)}T${hm(ms)}:00${OFFSET}`;
const rango = (e: Ev): [number, number] =>
  e.start.dateTime
    ? [Date.parse(e.start.dateTime), Date.parse(e.end.dateTime!)]
    : [Date.parse(`${e.start.date}T00:00:00${OFFSET}`), Date.parse(`${e.end.date}T00:00:00${OFFSET}`)]; // día completo bloquea todo el día

// ---------- Identificar a la clienta ----------
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tel10 = (t: string) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
function coincide(e: Ev, nombre: string, tel: string): boolean {
  const titulo = e.summary ?? "";
  if (!tel || !titulo.replace(/\D/g, "").includes(tel)) return false;
  const toks = sinAcentos(nombre).split(/\s+/).filter((t) => t.length >= 3);
  const nt = sinAcentos(titulo);
  return toks.length > 0 && toks.some((t) => nt.includes(t));
}
const NO_ENCONTRADA = "No encontramos una cita con esos datos. Revisa tu nombre y el celular con el que agendaste.";

async function yaReagendada(e: Ev): Promise<boolean> {
  if (e.extendedProperties?.private?.reagendada === "1") return true;
  const r = await sb(`agenda_reagendas?event_id=eq.${encodeURIComponent(e.id)}&select=id`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
async function motivoNo(e: Ev, cfg: Cfg): Promise<string | null> {
  const [ini] = rango(e);
  if (ini - Date.now() < cfg.anticipacion_horas * 3600e3) return `Solo se puede reagendar con al menos ${cfg.anticipacion_horas} horas de anticipación. Escríbenos por WhatsApp.`;
  if (await yaReagendada(e)) return "Esta cita ya fue reagendada una vez. Escríbenos por WhatsApp si necesitas otro cambio.";
  return null;
}
async function buscarMias(cfg: Cfg, nombre: string, telRaw: string): Promise<Ev[]> {
  const tel = tel10(telRaw);
  if (!tel || !nombre?.trim()) falla("Escribe tu nombre y tu celular a 10 dígitos.");
  const ahora = Date.now();
  const evs = await listEvents(cfg.calendar_id, ahora, ahora + 120 * 864e5);
  return evs.filter((e) => e.status !== "cancelled" && e.start.dateTime && coincide(e, nombre, tel));
}
async function miEvento(cfg: Cfg, nombre: string, telRaw: string, eventId: string): Promise<Ev> {
  let e: Ev;
  try { e = await gcal(cfg.calendar_id, `/${encodeURIComponent(eventId)}`); } catch { return falla(NO_ENCONTRADA); }
  if (e.status === "cancelled" || !e.start.dateTime || !coincide(e, nombre, tel10(telRaw))) falla(NO_ENCONTRADA);
  return e;
}

// ---------- Horarios libres ----------
async function horariosLibres(cfg: Cfg, durMin: number, ignorarId: string, anticipacionH = cfg.anticipacion_horas): Promise<Record<string, string[]>> {
  const ahora = Date.now();
  const evs = await listEvents(cfg.calendar_id, ahora, ahora + (cfg.dias_adelante + 2) * 864e5);
  const ocupados = evs
    .filter((e) => e.status !== "cancelled" && e.id !== ignorarId && e.transparency !== "transparent")
    .map(rango);
  const minInicio = ahora + anticipacionH * 3600e3;
  const hoy = ymd(ahora);
  const dias: Record<string, string[]> = {};
  for (let i = 0; i < cfg.dias_adelante; i++) {
    const dia = addDays(hoy, i);
    const h = cfg.horario?.[String(dow(dia))];
    if (!h) continue;
    const libres: string[] = [];
    for (let t = toMin(h[0]); t + durMin <= toMin(h[1]); t += cfg.intervalo_min) {
      const s = inst(dia, t), e = s + durMin * 60_000;
      if (s < minInicio) continue;
      if (ocupados.filter(([a, b]) => a < e && b > s).length >= cfg.capacidad) continue;
      libres.push(hm(s));
    }
    if (libres.length) dias[dia] = libres;
  }
  return dias;
}

// ---------- Agendar cita nueva ----------
type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number; tipo: string };
const fila = (r: Record<string, unknown>): Servicio => {
  const nombre = String(r.nombre), tipo = detectTipo(nombre);
  return {
    id: String(r.id), nombre, categoria: String(r.categoria), tipo,
    precio: precioVigente(Number(r.precio) || 0, r.precio_promo == null ? null : Number(r.precio_promo), (r.promo_hasta as string) ?? null),
    duracionMin: duracionServicio(nombre, tipo, r.duracion_min == null ? null : Number(r.duracion_min)),
  };
};
const VALORACION: Servicio = { id: "valoracion", nombre: "Valoración", categoria: "Empieza aquí", precio: 0, duracionMin: TIPOS.valoracion.duracion, tipo: "valoracion" };
const aplica = (r: Record<string, unknown>, cfg: Cfg) => !Array.isArray(r.sucursales) || r.sucursales.some((x) => sinAcentos(String(x)) === sinAcentos(cfg.nombre));
const COLS = "id,nombre,categoria,precio,precio_promo,promo_hasta,duracion_min,sucursales,orden";

async function listarServicios(cfg: Cfg): Promise<Servicio[]> {
  const r = await sb(`catalogo?select=${COLS}&activo=eq.true&tipo=eq.servicio&order=orden`);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("catalogo: " + JSON.stringify(rows).slice(0, 150));
  return [VALORACION, ...rows.filter((x) => aplica(x, cfg)).map(fila)];
}
async function servicioPorId(cfg: Cfg, id: string): Promise<Servicio> {
  if (id === "valoracion") return VALORACION;
  if (!/^\d+$/.test(String(id))) falla("Elige un servicio.");
  const r = await sb(`catalogo?select=${COLS}&id=eq.${id}&activo=eq.true&tipo=eq.servicio`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0] || !aplica(rows[0], cfg)) falla("Ese servicio ya no está disponible. Elige otro.");
  return fila(rows[0]);
}
const nombreLimpio = (n: string) =>
  String(n ?? "").replace(/[\p{Extended_Pictographic}\u200d\ufe0f\d]/gu, "").replace(/[^\p{L}\s'.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// ---------- Acciones ----------
async function accion(b: Record<string, string>) {
  if (b.accion === "sucursales") {
    const r = await sb("agenda_sucursales?select=slug,nombre&activa=eq.true&calendar_id=not.is.null&order=nombre");
    const rows = await r.json();
    return { sucursales: Array.isArray(rows) ? rows : [] };
  }
  const cfg = await getCfg(String(b.slug ?? ""));
  switch (b.accion) {
    case "info":
      return { nombre: cfg.nombre };

    case "buscar": {
      const mias = await buscarMias(cfg, b.nombre, b.telefono);
      if (!mias.length) falla(NO_ENCONTRADA);
      const citas = [];
      for (const e of mias) {
        const [ini, fin] = rango(e);
        citas.push({ id: e.id, fecha: ymd(ini), hora: hm(ini), horaFin: hm(fin), duracionMin: Math.round((fin - ini) / 60_000), motivoNo: await motivoNo(e, cfg) });
      }
      return { sucursal: cfg.nombre, citas };
    }

    case "disponibilidad": {
      const e = await miEvento(cfg, b.nombre, b.telefono, b.eventId);
      const m = await motivoNo(e, cfg); if (m) falla(m);
      const [ini, fin] = rango(e);
      const durMin = Math.round((fin - ini) / 60_000);
      return { duracionMin: durMin, dias: await horariosLibres(cfg, durMin, e.id) };
    }

    case "reagendar": {
      const e = await miEvento(cfg, b.nombre, b.telefono, b.eventId);
      const m = await motivoNo(e, cfg); if (m) falla(m);
      const [ini, fin] = rango(e);
      const durMin = Math.round((fin - ini) / 60_000);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !/^\d{2}:\d{2}$/.test(b.hora)) falla("Horario inválido.");
      const libres = await horariosLibres(cfg, durMin, e.id);
      if (!libres[b.fecha]?.includes(b.hora)) falla("Ese horario ya no está disponible. Elige otro.");

      const nuevoIni = inst(b.fecha, toMin(b.hora)), nuevoFin = nuevoIni + durMin * 60_000;
      // El unique(event_id) hace atómico el "solo 1 reagendado": si dos clics llegan juntos, uno falla aquí.
      const ins = await sb("agenda_reagendas", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ event_id: e.id, slug: cfg.slug, telefono: tel10(b.telefono), antes: new Date(ini).toISOString(), despues: new Date(nuevoIni).toISOString() }),
      });
      if (!ins.ok) falla("Esta cita ya fue reagendada una vez. Escríbenos por WhatsApp si necesitas otro cambio.");

      try {
        const antes = `${ymd(ini)} ${hm(ini)}`;
        await gcal(cfg.calendar_id, `/${encodeURIComponent(e.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            start: { dateTime: iso(nuevoIni), timeZone: TZ }, end: { dateTime: iso(nuevoFin), timeZone: TZ },
            summary: (e.summary ?? "").startsWith("🔁") ? e.summary : `🔁${e.summary ?? ""}`, // 🔁 = reagendada
            description: `🔁 REAGENDADA POR LA CLIENTA desde el link (antes: ${antes}).\n${e.description ?? ""}`,
            extendedProperties: { private: { ...(e.extendedProperties?.private ?? {}), reagendada: "1" } },
          }),
        }, { sendUpdates: "none" });
      } catch (err) {
        await sb(`agenda_reagendas?event_id=eq.${encodeURIComponent(e.id)}`, { method: "DELETE" }); // no consumir su único reagendado
        throw err;
      }
      return { ok: true, fecha: b.fecha, hora: b.hora, horaFin: hm(nuevoFin) };
    }
    case "servicios": {
      const grupos: { categoria: string; items: Omit<Servicio, "categoria" | "tipo">[] }[] = [];
      for (const sv of await listarServicios(cfg)) {
        let g = grupos.find((x) => x.categoria === sv.categoria);
        if (!g) grupos.push((g = { categoria: sv.categoria, items: [] }));
        g.items.push({ id: sv.id, nombre: sv.nombre, precio: sv.precio, duracionMin: sv.duracionMin });
      }
      return { grupos };
    }

    case "disponibilidad_nueva": {
      const sv = await servicioPorId(cfg, b.servicioId);
      return { duracionMin: sv.duracionMin, dias: await horariosLibres(cfg, sv.duracionMin, "", cfg.anticipacion_nueva_horas) };
    }

    case "agendar": {
      if (b.web) return { ok: true }; // honeypot: los bots llenan este campo oculto
      const nombre = nombreLimpio(b.nombre), tel = tel10(b.telefono);
      if (nombre.length < 3 || !nombre.includes(" ")) falla("Escribe tu nombre y apellido.");
      if (!tel) falla("Escribe tu celular a 10 dígitos.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !/^\d{2}:\d{2}$/.test(b.hora)) falla("Horario inválido.");
      const sv = await servicioPorId(cfg, b.servicioId);

      // Antiabuso: máx. 3 reservas por celular al día, y no duplicar si esa misma persona ya tiene cita próxima.
      const desde = new Date(Date.now() - 864e5).toISOString();
      const rr = await (await sb(`agenda_reservas?select=id&telefono=eq.${tel}&created_at=gte.${desde}`)).json();
      if (Array.isArray(rr) && rr.length >= 3) falla("Ya hiciste varias reservas hoy. Escríbenos por WhatsApp para ayudarte.");
      const ya = (await listEvents(cfg.calendar_id, Date.now(), Date.now() + 120 * 864e5)).find((e) => e.status !== "cancelled" && e.start.dateTime && coincide(e, nombre, tel));
      if (ya) { const [i] = rango(ya); falla(`Ya tienes una cita agendada el ${ymd(i)} a las ${hm(i)}. Si quieres cambiarla usa «Reagendar mi cita».`); }

      const libres = await horariosLibres(cfg, sv.duracionMin, "", cfg.anticipacion_nueva_horas);
      if (!libres[b.fecha]?.includes(b.hora)) falla("Ese horario ya no está disponible. Elige otro.");
      const ini = inst(b.fecha, toMin(b.hora)), fin = ini + sv.duracionMin * 60_000;

      const valoracion = sv.id === "valoracion";
      const ev = await gcal(cfg.calendar_id, "", {
        method: "POST",
        body: JSON.stringify({
          // Convención CIRE: 🧊 = todavía sin anticipo (la valoración no lleva anticipo)
          summary: `${valoracion ? "" : "🧊"}${nombre} ${tel}`,
          description: `${cfg.nombre} ${sv.nombre}${sv.precio > 0 ? " " + pesos(sv.precio) : ""}${valoracion ? "" : " Pendiente Anticipo"}\n📲 AGENDADA EN LÍNEA por la clienta.`,
          start: { dateTime: iso(ini), timeZone: TZ }, end: { dateTime: iso(fin), timeZone: TZ },
          colorId: TIPOS[sv.tipo]?.colorId ?? "11",
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
          extendedProperties: { private: { origen: "online", servicio_id: sv.id } },
        }),
      }, { sendUpdates: "none" });

      // Google no tiene candados: si dos clientas reservaron el mismo hueco a la vez, gana la que se creó primero.
      const traslapan = (await listEvents(cfg.calendar_id, ini, fin))
        .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start.dateTime && rango(e)[0] < fin && rango(e)[1] > ini)
        .sort((x, y) => String((x as Ev & { created?: string }).created).localeCompare(String((y as Ev & { created?: string }).created)) || x.id.localeCompare(y.id));
      if (traslapan.findIndex((e) => e.id === ev.id) >= cfg.capacidad) {
        await gcal(cfg.calendar_id, `/${encodeURIComponent(ev.id)}`, { method: "DELETE" }).catch(() => {});
        falla("Alguien más acaba de tomar ese horario. Elige otro.");
      }
      await sb("agenda_reservas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ event_id: ev.id, slug: cfg.slug, telefono: tel, nombre, servicio: sv.nombre, inicio: new Date(ini).toISOString() }) });
      return { ok: true, fecha: b.fecha, hora: b.hora, horaFin: hm(fin), servicio: sv.nombre };
    }

    default:
      return falla("Acción desconocida.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    return json(await accion(await req.json()));
  } catch (e) {
    if (e instanceof Falla) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "No pudimos completar la solicitud. Intenta de nuevo o escríbenos por WhatsApp." }, 500);
  }
});
