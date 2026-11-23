// Supabase Edge Function: agenda-publica
// Backend del link self-service /agendar/<sucursal>: la clienta busca su cita (celular + nombre) y la reagenda a otro
// horario libre de la misma duración. Lee y mueve eventos en el Google Calendar de la sucursal con una cuenta de servicio.
//
// POST { accion, slug, ... }
//   info          { slug }                                        -> { nombre }
//   buscar        { slug, nombre, telefono }                      -> { citas: [...] }
//   disponibilidad{ slug, nombre, telefono, eventId }             -> { duracionMin, dias: { "YYYY-MM-DD": ["10:00", ...] } }
//   reagendar     { slug, nombre, telefono, eventId, fecha, hora }-> { ok, fecha, hora }
//
// Secretos: GOOGLE_SERVICE_ACCOUNT_JSON (JSON completo de la cuenta de servicio). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen.
// Cada calendario de sucursal debe estar compartido con el client_email de la cuenta de servicio ("Hacer cambios en eventos").
// Formato esperado del evento: el celular va en el título (ej. "Ximena Bustillo Díaz 5611115676").

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
  intervalo_min: number; capacidad: number; anticipacion_horas: number; dias_adelante: number;
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
  const j = await r.json();
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
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
async function horariosLibres(cfg: Cfg, durMin: number, ignorarId: string): Promise<Record<string, string[]>> {
  const ahora = Date.now();
  const evs = await listEvents(cfg.calendar_id, ahora, ahora + (cfg.dias_adelante + 2) * 864e5);
  const ocupados = evs
    .filter((e) => e.status !== "cancelled" && e.id !== ignorarId && e.transparency !== "transparent")
    .map(rango);
  const minInicio = ahora + cfg.anticipacion_horas * 3600e3;
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

// ---------- Acciones ----------
async function accion(b: Record<string, string>) {
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
