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
//   disponibilidad_nueva { slug, servicioId }                     -> { duracionMin, dias, especiales, horarios }  (especiales = terminan hasta 15 min después del cierre; requieren aprobación)
//   agendar       { slug, nombre, telefono, servicioId, fecha, hora } -> { ok, fecha, hora, horaFin, servicio, reservaId, anticipo, reagendarHoras }
//   espera        { slug, nombre, telefono, servicioId, dias: ['sab'], franja, comentario } -> { ok }  (lista de espera: la clienta que no encontró horario)
//   espera_listar / espera_conteo / espera_actualizar  { usuario, hash, ... }  -> equipo (recepción) con usuario + hash de system_users
//   equipo_servicios / equipo_disponibilidad / equipo_agendar  { usuario, hash, ... }  -> variante interna /agendar-equipo (busca en todas las sucursales, suma zonas, nota)
//   reserva       { slug, reservaId, telefono }                   -> { servicio, fecha, hora, horaFin, comprobante, anticipo, reagendarHoras }  (retomar "Asegura tu lugar")
//   comprobante   { slug, reservaId, telefono, imagen }           -> { ok }   imagen = dataURL jpeg/png; se guarda en Storage (bucket privado "comprobantes") y el enlace va a la descripción del evento
//
// Convención de títulos de CIRE: 🧊 = aún sin anticipo, 💰 = ya mandó anticipo, 🔁 = reagendada.
//
// Secretos: GOOGLE_SERVICE_ACCOUNT_JSON (JSON completo de la cuenta de servicio). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen.
// Cada calendario de sucursal debe estar compartido con el client_email de la cuenta de servicio ("Hacer cambios en eventos").
// Formato esperado del evento: el celular va en el título (ej. "Ximena Bustillo Díaz 5611115676").

import { TIPOS, detectTipo, duracionServicio, precioVigente } from "./duraciones.ts";
import { PLANTILLAS, type Plantilla } from "./plantillas.ts";

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
  horario_especial_min: number; intervalo_min: number; capacidad: number; anticipacion_horas: number; anticipacion_nueva_horas: number; dias_adelante: number;
  direccion: string | null; maps_url: string | null; estacionamiento: boolean; modo_pruebas: boolean;
  avisos_tel: string[] | null; confirmar_clienta: boolean | null; tema: string; anticipo_concepto: string | null; maps_nombre: string | null; lat: number | null; lng: number | null; maps_embed: string | null;
  anticipo_monto: number; banco: string | null; beneficiario: string | null; cuenta: string | null; clabe: string | null;
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
type Disp = { dias: Record<string, string[]>; especiales: Record<string, string[]>; horarios: Record<string, [string, string]> };
/** Horarios libres por día. `dias` = dentro del horario de la sucursal. `especiales` = empiezan antes del cierre pero TERMINAN hasta holguraMin
 *  minutos DESPUÉS del cierre (solo si holguraMin > 0; requieren aprobación del equipo). No hay horarios especiales antes de abrir.
 *  `horarios` = [abre, cierra] de esos días. */
async function disponibilidad(cfg: Cfg, durMin: number, ignorarId: string, anticipacionH = cfg.anticipacion_horas, holguraMin = 0): Promise<Disp> {
  const ahora = Date.now();
  const evs = await listEvents(cfg.calendar_id, ahora, ahora + (cfg.dias_adelante + 2) * 864e5);
  const ocupados = evs
    .filter((e) => e.status !== "cancelled" && e.id !== ignorarId && e.transparency !== "transparent")
    .map(rango);
  const minInicio = ahora + anticipacionH * 3600e3;
  const hoy = ymd(ahora);
  const out: Disp = { dias: {}, especiales: {}, horarios: {} };
  for (let i = 0; i < cfg.dias_adelante; i++) {
    const dia = addDays(hoy, i);
    const h = cfg.horario?.[String(dow(dia))];
    if (!h) continue;
    const abre = toMin(h[0]), cierre = toMin(h[1]);
    const libres: string[] = [], esp: string[] = [];
    const libre = (t: number) => { const s = inst(dia, t), e = s + durMin * 60_000; return s >= minInicio && ocupados.filter(([a, b]) => a < e && b > s).length < cfg.capacidad; };
    for (let t = abre; t < cierre; t += cfg.intervalo_min) {
      const fin = t + durMin, normal = fin <= cierre;
      if (!normal && fin > cierre + holguraMin) break; // se pasa demasiado del cierre (y las siguientes aún más)
      if (!libre(t)) continue;
      (normal ? libres : esp).push(hm(inst(dia, t)));
    }
    if (libres.length) out.dias[dia] = libres;
    if (esp.length) { out.especiales[dia] = esp; out.horarios[dia] = [h[0], h[1]]; }
  }
  return out;
}
async function horariosLibres(cfg: Cfg, durMin: number, ignorarId: string, anticipacionH = cfg.anticipacion_horas): Promise<Record<string, string[]>> {
  return (await disponibilidad(cfg, durMin, ignorarId, anticipacionH, 0)).dias; // reagendar: sin horarios especiales
}
const h12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`; };

// ---------- Avisos por WhatsApp al equipo ----------
// Plantillas aprobadas por Meta (ver plantillas.ts). Nunca rompen la reserva: si falla el envío solo se registra el error.
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const cuandoTxt = (ini: number, fin: number) =>
  `${cap1(new Date(ini).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }))} · ${hm(ini)} – ${hm(fin)}`;
const paraWA = (t: unknown) => String(t ?? "").replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1000) || "-"; // WhatsApp admite hasta 1024 por variable; el enlace firmado de la captura mide ~335 y recortarlo lo invalida
async function mandarPlantilla(tel: string, p: Plantilla, vars: string[], imagen?: string): Promise<boolean> {
  const components: unknown[] = [];
  if (imagen) components.push({ type: "header", parameters: [{ type: "image", image: { link: imagen } }] });
  if (vars.length) components.push({ type: "body", parameters: vars.map((t) => ({ type: "text", text: paraWA(t) })) });
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("WA_TOKEN")}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: tel.replace(/\D/g, ""), type: "template",
      template: { name: p.name, language: { code: "es_MX" }, components },
    }),
  });
  const cuerpo = (await r.text()).slice(0, 400);
  if (!r.ok) console.error(`aviso WhatsApp (${p.name}) falló para …${tel.slice(-4)}:`, cuerpo.slice(0, 300));
  await sb("agenda_wa_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ plantilla: p.name, destino: tel.replace(/\D/g, "").slice(-4), ok: r.ok, detalle: r.ok ? null : cuerpo }) }).catch(() => {}); // bitácora (migración 058)
  return r.ok;
}
const enSegundoPlano = (trabajo: Promise<unknown>) =>
  (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(trabajo); // sigue después de responder
function avisar(cfg: Cfg, p: Plantilla, vars: string[]) {
  const tels = cfg.avisos_tel ?? [];
  if (!tels.length || !env("WA_TOKEN") || !env("WA_PHONE_ID")) return; // sin destinatarios = no se manda nada
  const trabajo = Promise.allSettled(tels.map((t) => mandarPlantilla(t, p, vars)));
  enSegundoPlano(trabajo);
}

// ---------- Confirmación a la CLIENTA por WhatsApp ----------
// Mensaje de cita agendada + 2 infografías (indicaciones previas e instrucciones del día de la sesión). Cada una es una plantilla
// con imagen en el encabezado (fuera de las 24 h de una conversación WhatsApp solo admite plantillas). Se manda en orden y se
// detiene si el primero falla (p. ej. número sin WhatsApp). INACTIVO hasta activar agenda_sucursales.confirmar_clienta y definir
// los secretos INFOGRAFIA_INDICACIONES_URL e INFOGRAFIA_DIA_SESION_URL (enlaces públicos a las imágenes).
// Capturas de los desplegables "Indicaciones a considerar" y "Cómo debes asistir a tu sesión" de /agendar (public/infografias/ en el repo).
// Si cambias esos textos en CierreCita.jsx, vuelve a tomar las capturas. Los secretos INFOGRAFIA_*_URL (opcionales) las reemplazan.
const INFOGRAFIAS = "https://agenda.ciredepilacion.com/infografias";
function confirmarClienta(cfg: Cfg, tel: string, vars: { nombre: string; servicio: string; cuando: string; estatus: string }, conImagenes = true) {
  const img1 = env("INFOGRAFIA_INDICACIONES_URL") || `${INFOGRAFIAS}/indicaciones-a-considerar.png`, img2 = env("INFOGRAFIA_DIA_SESION_URL") || `${INFOGRAFIAS}/como-asistir-sesion.png`;
  if (!cfg.confirmar_clienta || !env("WA_TOKEN") || !env("WA_PHONE_ID")) {
    enSegundoPlano(sb("agenda_wa_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ plantilla: "agenda_confirmacion_clienta", destino: tel10(tel).slice(-4), ok: false, detalle: `no se intentó: confirmar_clienta=${cfg.confirmar_clienta} WA_TOKEN=${!!env("WA_TOKEN")} WA_PHONE_ID=${!!env("WA_PHONE_ID")}` }) }).catch(() => {}));
    return false;
  }
  const a = "52" + tel10(tel);
  const donde = [cfg.direccion || `CIRE ${cfg.nombre}`, cfg.maps_url].filter(Boolean).join(" · ");
  enSegundoPlano((async () => {
    const primer = vars.nombre.split(" ")[0] || vars.nombre;
    const datos = [primer, cfg.nombre, vars.servicio, vars.cuando, donde, vars.estatus];
    if (!conImagenes) { await mandarPlantilla(a, PLANTILLAS.confirmacionSimple, datos); return; } // reagendados y valoraciones: solo el texto
    if (!(await mandarPlantilla(a, PLANTILLAS.confirmacion, datos))) return;
    if (await mandarPlantilla(a, PLANTILLAS.indicaciones, [], img1)) await mandarPlantilla(a, PLANTILLAS.diaSesion, [], img2);
  })());
  return true;
}

// ---------- Agendar cita nueva ----------
type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number; tipo: string; incluye: string | null };
const fila = (r: Record<string, unknown>): Servicio => {
  const nombre = String(r.nombre), tipo = detectTipo(nombre);
  return {
    id: String(r.id), nombre, categoria: String(r.categoria), tipo, incluye: r.incluye ? String(r.incluye) : null,
    precio: precioVigente(Number(r.precio) || 0, r.precio_promo == null ? null : Number(r.precio_promo), (r.promo_hasta as string) ?? null),
    duracionMin: duracionServicio(nombre, tipo, r.duracion_min == null ? null : Number(r.duracion_min)),
  };
};
const VALORACION: Servicio = { id: "valoracion", nombre: "Valoración", categoria: "Empieza aquí", precio: 0, duracionMin: TIPOS.valoracion.duracion, tipo: "valoracion", incluye: null };
const aplica = (r: Record<string, unknown>, cfg: Cfg) => !Array.isArray(r.sucursales) || r.sucursales.some((x) => sinAcentos(String(x)) === sinAcentos(cfg.nombre));
const COLS = "id,nombre,categoria,precio,precio_promo,promo_hasta,duracion_min,sucursales,orden,incluye";

async function listarServicios(cfg: Cfg): Promise<Servicio[]> {
  const r = await sb(`catalogo?select=${COLS}&activo=eq.true&tipo=eq.servicio&agenda_en_linea=eq.true&order=orden`);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("catalogo: " + JSON.stringify(rows).slice(0, 150));
  const lista = rows.filter((x) => aplica(x, cfg)).map(fila);
  lista.sort((a, b) => Number(/^combo/i.test(b.categoria)) - Number(/^combo/i.test(a.categoria))); // sort estable: combos (promos) primero
  return [VALORACION, ...lista];
}
async function servicioPorId(cfg: Cfg, id: string): Promise<Servicio> {
  if (id === "valoracion") return VALORACION;
  if (!/^\d+$/.test(String(id))) falla("Elige un servicio.");
  const r = await sb(`catalogo?select=${COLS}&id=eq.${id}&activo=eq.true&tipo=eq.servicio&agenda_en_linea=eq.true`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0] || !aplica(rows[0], cfg)) falla("Ese servicio ya no está disponible. Elige otro.");
  return fila(rows[0]);
}
const nombreLimpio = (n: string) =>
  String(n ?? "").replace(/[\p{Extended_Pictographic}\u200d\ufe0f\d]/gu, "").replace(/[^\p{L}\s'.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// ---------- Anticipo y comprobante ----------
const SK = () => env("SUPABASE_SERVICE_ROLE_KEY");
const concepto = (servicio: string) => "SERVICIO DE " + servicio.replace(/\([^)]*\)/g, "").replace(/\bMujer\b/i, "").replace(/\s+/g, " ").trim().toUpperCase();
function infoAnticipo(cfg: Cfg, servicio: string) {
  if (servicio === VALORACION.nombre) return null; // la valoración no lleva anticipo
  if (!cfg.clabe) return { monto: cfg.anticipo_monto, sinDatos: true };
  return { monto: cfg.anticipo_monto, banco: cfg.banco, beneficiario: cfg.beneficiario, cuenta: cfg.cuenta, clabe: cfg.clabe, concepto: cfg.anticipo_concepto || concepto(servicio) };
}
type Reserva = { id: string; event_id: string; servicio: string; telefono: string; nombre: string; inicio: string; comprobante_at: string | null; especial: boolean };
async function reservaValida(cfg: Cfg, b: Record<string, string>): Promise<Reserva> {
  const id = String(b.reservaId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) falla("No encontramos esa reserva.");
  const rows = await (await sb(`agenda_reservas?select=id,event_id,servicio,telefono,nombre,inicio,comprobante_at,especial&id=eq.${id}&slug=eq.${cfg.slug}`)).json();
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r || r.telefono !== tel10(b.telefono)) falla("No encontramos esa reserva.");
  return r as Reserva;
}
const eventoDe = async (cfg: Cfg, r: Reserva): Promise<Ev> => {
  let e: Ev;
  try { e = await gcal(cfg.calendar_id, `/${encodeURIComponent(r.event_id)}`); } catch { return falla("Esta reserva ya no está activa. Si necesitas ayuda escríbenos por WhatsApp."); }
  if (e.status === "cancelled") falla("Esta reserva ya no está activa. Si necesitas ayuda escríbenos por WhatsApp.");
  return e;
};

// ---------- Lista de espera: acciones del EQUIPO (recepción) ----------
// Se validan igual que en las funciones `lealtad` y `opiniones`: usuario + hash de system_users.
async function staff(b: Record<string, unknown>): Promise<string> {
  const u = String(b.usuario ?? ""), h = String(b.hash ?? "");
  if (!u || !/^[0-9a-f]{64}$/.test(h)) falla("Sesión no válida. Vuelve a entrar al sistema.");
  const r = await (await sb(`system_users?select=username&username=eq.${encodeURIComponent(u)}&password_hash=eq.${h}`)).json();
  if (!Array.isArray(r) || !r.length) falla("Sesión no válida. Vuelve a entrar al sistema.");
  return u;
}
const SLUG_OK = (v: unknown) => { const x = String(v ?? ""); if (!/^[a-z0-9-]{2,30}$/.test(x)) falla("Sucursal no válida."); return x; };
const ESTADOS_ESPERA = ["pendiente", "contactada", "agendada", "descartada"];
async function esperaEquipo(b: Record<string, unknown>) {
  const usuario = await staff(b);
  switch (b.accion) {
    case "espera_listar": {
      const slug = SLUG_OK(b.slug);
      const r = await (await sb(`agenda_lista_espera?select=id,nombre,telefono,servicio,dias,franja,comentario,estado,nota_equipo,atendida_por,atendida_en,created_at&slug=eq.${slug}&order=created_at.desc&limit=300`)).json();
      return { espera: Array.isArray(r) ? r : [] };
    }
    case "espera_conteo": {
      const slug = SLUG_OK(b.slug);
      const r = await (await sb(`agenda_lista_espera?select=id&slug=eq.${slug}&estado=eq.pendiente&limit=500`)).json();
      return { pendientes: Array.isArray(r) ? r.length : 0 };
    }
    case "espera_actualizar": {
      const id = String(b.id ?? ""), estado = String(b.estado ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) falla("Registro no válido.");
      if (!ESTADOS_ESPERA.includes(estado)) falla("Estado no válido.");
      const nota = b.nota == null ? undefined : String(b.nota).replace(/\s+/g, " ").trim().slice(0, 500);
      const ahora = new Date().toISOString();
      const cambios: Record<string, unknown> = { estado, actualizado_en: ahora, atendida_por: estado === "pendiente" ? null : usuario, atendida_en: estado === "pendiente" ? null : ahora };
      if (nota !== undefined) cambios.nota_equipo = nota || null;
      const r = await sb(`agenda_lista_espera?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(cambios) });
      if (!r.ok) throw new Error("no pude actualizar la lista de espera: " + (await r.text()).slice(0, 200));
      return { ok: true };
    }
    default:
      return falla("Acción desconocida.");
  }
}

// ---------- Agenda del EQUIPO (variante interna de /agendar: /agendar-equipo) ----------
// Ventas no tiene acceso a todos los calendarios: aquí busca hueco en TODAS las sucursales a la vez, arma el paquete (cualquier servicio
// del catálogo + zonas individuales extra), deja una nota y agenda. Sin candados antiabuso ni anticipación mínima; el equipo responde por la cita.
const EXTRAS_MAX = 6;
async function servicioEquipo(id: string): Promise<{ sv: Servicio; sucursales: unknown }> {
  if (id === "valoracion") return { sv: VALORACION, sucursales: null };
  if (!/^\d+$/.test(String(id))) falla("Elige un servicio.");
  const rows = await (await sb(`catalogo?select=${COLS}&id=eq.${id}&activo=eq.true&tipo=eq.servicio`)).json();
  if (!Array.isArray(rows) || !rows[0]) falla("Ese servicio ya no está en el catálogo.");
  return { sv: fila(rows[0]), sucursales: rows[0].sucursales };
}
const aplicaA = (sucursales: unknown, cfg: { nombre: string }) => !Array.isArray(sucursales) || sucursales.some((x) => sinAcentos(String(x)) === sinAcentos(cfg.nombre));
/** Paquete armado por el equipo: servicio base + zonas extra. La duración y el precio se pueden ajustar a mano. */
async function armarPaquete(b: Record<string, unknown>) {
  const base = await servicioEquipo(String(b.servicioId ?? ""));
  const ids = (Array.isArray(b.extras) ? b.extras : []).map(String).slice(0, EXTRAS_MAX);
  const extras = [];
  for (const id of ids) extras.push(await servicioEquipo(id)); // se permite repetir (ej. 2 veces axilas)
  const durCalc = base.sv.duracionMin + extras.reduce((a, e) => a + e.sv.duracionMin, 0);
  const durManual = Math.round(Number(b.duracionMin));
  const duracionMin = durManual >= 15 && durManual <= 480 ? durManual : durCalc;
  const precioCalc = base.sv.precio + extras.reduce((a, e) => a + e.sv.precio, 0);
  const precioManual = b.precio === "" || b.precio == null ? NaN : Number(b.precio);
  const precio = Number.isFinite(precioManual) && precioManual >= 0 && precioManual <= 200000 ? Math.round(precioManual) : precioCalc;
  return { sv: base.sv, extras, aplica: [base, ...extras].map((x) => x.sucursales), duracionMin, precio, durCalc, precioCalc };
}
async function equipoAgenda(b: Record<string, unknown>) {
  const usuario = await staff(b);
  switch (b.accion) {
    case "equipo_servicios": {
      // Catálogo completo (no solo lo que se vende en línea), con las sucursales donde aplica cada servicio.
      const rows = await (await sb(`catalogo?select=${COLS}&activo=eq.true&tipo=eq.servicio&order=orden`)).json();
      if (!Array.isArray(rows)) throw new Error("catalogo: " + JSON.stringify(rows).slice(0, 150));
      const lista = rows.map((r) => ({ ...fila(r), sucursales: Array.isArray(r.sucursales) ? r.sucursales.map(String) : null }));
      lista.sort((a, b) => Number(/^combo/i.test(b.categoria)) - Number(/^combo/i.test(a.categoria)));
      const grupos: { categoria: string; items: Record<string, unknown>[] }[] = [];
      for (const sv of [{ ...VALORACION, sucursales: null }, ...lista]) {
        let g = grupos.find((x) => x.categoria === sv.categoria);
        if (!g) grupos.push((g = { categoria: sv.categoria, items: [] }));
        g.items.push({ id: sv.id, nombre: sv.nombre, precio: sv.precio, duracionMin: sv.duracionMin, incluye: sv.incluye, sucursales: sv.sucursales });
      }
      const suc = await (await sb("agenda_sucursales?select=slug,nombre&activa=eq.true&calendar_id=not.is.null&order=nombre")).json();
      return { grupos, sucursales: Array.isArray(suc) ? suc : [], usuario };
    }

    case "equipo_disponibilidad": {
      // Horarios libres en cada sucursal para el paquete armado (misma duración en todas). Una sucursal con error no tumba a las demás.
      const paq = await armarPaquete(b);
      const slugs = Array.isArray(b.slugs) ? b.slugs.map(String) : [];
      const rows = await (await sb("agenda_sucursales?select=*&activa=eq.true&calendar_id=not.is.null&order=nombre")).json();
      const cfgs = (Array.isArray(rows) ? rows as Cfg[] : []).filter((c) => (!slugs.length || slugs.includes(c.slug)) && paq.aplica.every((a) => aplicaA(a, c)));
      const sucursales = await Promise.all(cfgs.map(async (c) => {
        try {
          const d = await disponibilidad(c, paq.duracionMin, "", 0, c.horario_especial_min ?? 0);
          return { slug: c.slug, nombre: c.nombre, dias: d.dias, especiales: d.especiales, horarios: d.horarios };
        } catch (e) { console.error(`equipo_disponibilidad ${c.slug}:`, e); return { slug: c.slug, nombre: c.nombre, dias: {}, especiales: {}, horarios: {}, error: "No pude leer su calendario." }; }
      }));
      return { duracionMin: paq.duracionMin, duracionCalculada: paq.durCalc, precio: paq.precio, precioCalculado: paq.precioCalc, sucursales };
    }

    case "equipo_agendar": {
      const cfg = await getCfg(SLUG_OK(b.slug));
      const nombre = nombreLimpio(String(b.nombre ?? "")), tel = tel10(String(b.telefono ?? ""));
      if (nombre.length < 3) falla("Escribe el nombre de la clienta.");
      if (!tel) falla("Escribe el celular de la clienta a 10 dígitos.");
      const fecha = String(b.fecha ?? ""), hora = String(b.hora ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) falla("Horario inválido.");
      const paq = await armarPaquete(b);
      if (!paq.aplica.every((a) => aplicaA(a, cfg))) falla(`Ese paquete no se ofrece en ${cfg.nombre}.`);
      const nota = String(b.nota ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
      const anticipado = b.anticipo === true || b.anticipo === "true";
      const valoracion = paq.sv.id === "valoracion" && !paq.extras.length;

      const disp = await disponibilidad(cfg, paq.duracionMin, "", 0, cfg.horario_especial_min ?? 0);
      const normalOk = !!disp.dias[fecha]?.includes(hora);
      const especial = !normalOk && !!disp.especiales[fecha]?.includes(hora);
      if (!normalOk && !especial) falla("Ese horario ya no está disponible. Busca otro.");
      const ini = inst(fecha, toMin(hora)), fin = ini + paq.duracionMin * 60_000;
      const motivoEsp = !especial ? "" : `la sucursal cierra a las ${h12(disp.horarios[fecha][1])} y esta cita termina a las ${h12(hm(fin))}`;

      const paqueteTxt = [paq.sv.nombre, ...paq.extras.map((e) => `+ ${e.sv.nombre}`)].join(" ");
      const ev = await gcal(cfg.calendar_id, "", {
        method: "POST",
        body: JSON.stringify({
          summary: `${valoracion ? "" : anticipado ? "💰" : "🧊"}${nombre} ${tel}`, // 🧊 sin anticipo · 💰 ya mandó anticipo
          description: [
            `${cfg.nombre} ${paqueteTxt}${paq.precio > 0 ? " " + pesos(paq.precio) : ""}${valoracion ? "" : anticipado ? " Anticipo recibido" : " Pendiente Anticipo"}`,
            especial ? `Horario especial autorizado por el equipo: ${motivoEsp}.` : "",
            nota ? `📝 NOTA: ${nota}` : "",
            `🧑‍💼 AGENDADA POR EL EQUIPO (${usuario}).`,
          ].filter(Boolean).join("\n"),
          start: { dateTime: iso(ini), timeZone: TZ }, end: { dateTime: iso(fin), timeZone: TZ },
          colorId: TIPOS[paq.sv.tipo]?.colorId ?? "11",
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
          extendedProperties: { private: { origen: "equipo", servicio_id: paq.sv.id, agendada_por: usuario } },
        }),
      }, { sendUpdates: "none" });

      // Google no tiene candados: si dos personas tomaron el mismo hueco a la vez, gana la que se creó primero.
      const traslapan = (await listEvents(cfg.calendar_id, ini, fin))
        .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start.dateTime && rango(e)[0] < fin && rango(e)[1] > ini)
        .sort((x, y) => String((x as Ev & { created?: string }).created).localeCompare(String((y as Ev & { created?: string }).created)) || x.id.localeCompare(y.id));
      if (traslapan.findIndex((e) => e.id === ev.id) >= cfg.capacidad) {
        await gcal(cfg.calendar_id, `/${encodeURIComponent(ev.id)}`, { method: "DELETE" }).catch(() => {});
        falla("Alguien acaba de tomar ese horario. Busca otro.");
      }

      const cuando = cuandoTxt(ini, fin);
      const estatusEq = [`Agendada por el equipo (${usuario})`, valoracion ? "Valoración (sin anticipo)" : anticipado ? "💰 Anticipo recibido" : "🧊 Pendiente de anticipo", especial ? `horario especial: ${motivoEsp}` : "", nota ? `Nota: ${nota}` : ""].filter(Boolean).join(" · ");
      avisar(cfg, PLANTILLAS.nueva, [cfg.nombre, nombre, tel, paqueteTxt, cuando, estatusEq]);
      const clienta = b.confirmarClienta === false || b.confirmarClienta === "false" ? false
        : confirmarClienta(cfg, tel, { nombre, servicio: paqueteTxt, cuando, estatus: valoracion ? "Esta valoración no tiene costo." : anticipado ? "Tu anticipo ya está registrado ✅" : "Tu anticipo está pendiente: envíanos tu comprobante para asegurar tu lugar." }, !valoracion);
      return { ok: true, sucursal: cfg.nombre, fecha, hora, horaFin: hm(fin), servicio: paqueteTxt, duracionMin: paq.duracionMin, precio: paq.precio, especial, confirmacionClienta: clienta };
    }
    default:
      return falla("Acción desconocida.");
  }
}

// ---------- Acciones ----------
async function accion(b: Record<string, string>) {
  if (b.accion === "sucursales") {
    const r = await sb("agenda_sucursales?select=slug,nombre&activa=eq.true&calendar_id=not.is.null&order=nombre");
    const rows = await r.json();
    return { sucursales: Array.isArray(rows) ? rows : [] };
  }
  if (String(b.accion ?? "").startsWith("equipo_")) return await equipoAgenda(b as unknown as Record<string, unknown>);
  if (String(b.accion ?? "").startsWith("espera_")) return await esperaEquipo(b as unknown as Record<string, unknown>);
  const cfg = await getCfg(String(b.slug ?? ""));
  switch (b.accion) {
    case "info":
      return { nombre: cfg.nombre, direccion: cfg.direccion, mapsUrl: cfg.maps_url, estacionamiento: !!cfg.estacionamiento, tema: cfg.tema, mapaNombre: cfg.maps_nombre, lat: cfg.lat, lng: cfg.lng, mapsEmbed: cfg.maps_embed };

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
      avisar(cfg, PLANTILLAS.reagendada, [cfg.nombre, nombreLimpio(e.summary ?? "") || "Clienta", tel10(b.telefono), cuandoTxt(ini, fin), cuandoTxt(nuevoIni, nuevoFin)]);
      // Confirmación a la clienta del nuevo horario (solo texto, sin imágenes). El servicio sale de la reserva en línea si existe.
      const rsvR = await (await sb(`agenda_reservas?select=servicio&event_id=eq.${encodeURIComponent(e.id)}&limit=1`)).json().catch(() => []);
      confirmarClienta(cfg, tel10(b.telefono), { nombre: nombreLimpio(e.summary ?? "") || "Clienta", servicio: (Array.isArray(rsvR) && rsvR[0]?.servicio) || "Tu sesión en CIRE", cuando: cuandoTxt(nuevoIni, nuevoFin), estatus: "Tu cita fue reagendada ✅" }, false);
      return { ok: true, fecha: b.fecha, hora: b.hora, horaFin: hm(nuevoFin) };
    }
    case "servicios": {
      const grupos: { categoria: string; items: Omit<Servicio, "categoria" | "tipo">[] }[] = [];
      for (const sv of await listarServicios(cfg)) {
        let g = grupos.find((x) => x.categoria === sv.categoria);
        if (!g) grupos.push((g = { categoria: sv.categoria, items: [] }));
        g.items.push({ id: sv.id, nombre: sv.nombre, precio: sv.precio, duracionMin: sv.duracionMin, incluye: sv.incluye });
      }
      return { grupos };
    }

    case "disponibilidad_nueva": {
      const sv = await servicioPorId(cfg, b.servicioId);
      const d = await disponibilidad(cfg, sv.duracionMin, "", cfg.anticipacion_nueva_horas, cfg.horario_especial_min ?? 0);
      return { duracionMin: sv.duracionMin, dias: d.dias, especiales: d.especiales, horarios: d.horarios };
    }

    case "agendar": {
      if (b.web) return { ok: true }; // honeypot: los bots llenan este campo oculto
      const nombre = nombreLimpio(b.nombre), tel = tel10(b.telefono);
      if (nombre.length < 3 || !nombre.includes(" ")) falla("Escribe tu nombre y apellido.");
      if (!tel) falla("Escribe tu celular a 10 dígitos.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !/^\d{2}:\d{2}$/.test(b.hora)) falla("Horario inválido.");
      const sv = await servicioPorId(cfg, b.servicioId);

      // Antiabuso: máx. 3 reservas por celular al día, y no duplicar si esa misma persona ya tiene cita próxima.
      // (se omiten en agenda_sucursales.modo_pruebas = true, mientras se prueba el sistema)
      if (!cfg.modo_pruebas) {
        const desde = new Date(Date.now() - 864e5).toISOString();
        const rr = await (await sb(`agenda_reservas?select=id&telefono=eq.${tel}&created_at=gte.${desde}`)).json();
        if (Array.isArray(rr) && rr.length >= 3) falla("Ya hiciste varias reservas hoy. Escríbenos por WhatsApp para ayudarte.");
        const ya = (await listEvents(cfg.calendar_id, Date.now(), Date.now() + 120 * 864e5)).find((e) => e.status !== "cancelled" && e.start.dateTime && coincide(e, nombre, tel));
        if (ya) { const [i] = rango(ya); falla(`Ya tienes una cita agendada el ${ymd(i)} a las ${hm(i)}. Si quieres cambiarla usa «Reagendar mi cita».`); }
      }

      const disp = await disponibilidad(cfg, sv.duracionMin, "", cfg.anticipacion_nueva_horas, cfg.horario_especial_min ?? 0);
      const normalOk = !!disp.dias[b.fecha]?.includes(b.hora);
      const especial = !normalOk && !!disp.especiales[b.fecha]?.includes(b.hora); // empieza antes del cierre pero termina después: requiere aprobación
      if (!normalOk && !especial) falla("Ese horario ya no está disponible. Elige otro.");
      const ini = inst(b.fecha, toMin(b.hora)), fin = ini + sv.duracionMin * 60_000;
      // Horario especial = la cita termina después del cierre (hasta horario_especial_min minutos)
      const motivoEsp = !especial ? "" : `la sucursal cierra a las ${h12(disp.horarios[b.fecha][1])} y esta cita termina a las ${h12(hm(fin))}`;

      const valoracion = sv.id === "valoracion";
      const ev = await gcal(cfg.calendar_id, "", {
        method: "POST",
        body: JSON.stringify({
          // Convención CIRE: 🧊 = todavía sin anticipo (la valoración no lleva anticipo)
          // ⚠️ = horario especial por aprobar (quitarlo al confirmar con la clienta)
          summary: `${especial ? "⚠️" : ""}${valoracion ? "" : "🧊"}${nombre} ${tel}`,
          description: `${cfg.nombre} ${sv.nombre}${sv.precio > 0 ? " " + pesos(sv.precio) : ""}${valoracion ? "" : " Pendiente Anticipo"}${especial ? `\n⚠️ HORARIO ESPECIAL PENDIENTE DE APROBACIÓN: ${motivoEsp}. Confirmarlo con la clienta y quitar el ⚠️ del título.` : ""}\n📲 AGENDADA EN LÍNEA por la clienta.`,
          start: { dateTime: iso(ini), timeZone: TZ }, end: { dateTime: iso(fin), timeZone: TZ },
          colorId: TIPOS[sv.tipo]?.colorId ?? "11",
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
          extendedProperties: { private: { origen: "online", servicio_id: sv.id, ...(especial ? { horario_especial: "pendiente" } : {}) } },
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
      const rsv = await (await sb("agenda_reservas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ event_id: ev.id, slug: cfg.slug, telefono: tel, nombre, servicio: sv.nombre, inicio: new Date(ini).toISOString(), especial }) })).json();
      avisar(cfg, PLANTILLAS.nueva, [cfg.nombre, nombre, tel, sv.nombre, cuandoTxt(ini, fin),
        (especial ? `⚠️ HORARIO ESPECIAL por aprobar: ${motivoEsp}${valoracion ? "" : " · 🧊 Pendiente de anticipo"}` : valoracion ? "Valoración (sin anticipo)" : "🧊 Pendiente de anticipo")]);
      confirmarClienta(cfg, tel, { nombre, servicio: sv.nombre, cuando: cuandoTxt(ini, fin),
        estatus: valoracion ? "Esta valoración no tiene costo." : especial ? "Tu horario es especial: te confirmaremos por este medio si podemos habilitarlo." : "Tu anticipo está pendiente: envíanos tu comprobante para asegurar tu lugar." }, !valoracion); // la valoración no lleva indicaciones en imagen
      return { ok: true, especial, motivoEspecial: motivoEsp || null, fecha: b.fecha, hora: b.hora, horaFin: hm(fin), servicio: sv.nombre, reservaId: Array.isArray(rsv) ? rsv[0]?.id ?? null : null, anticipo: infoAnticipo(cfg, sv.nombre), reagendarHoras: cfg.anticipacion_horas };
    }

    case "espera": {
      if (b.web) return { ok: true }; // honeypot
      const nombre = nombreLimpio(b.nombre), tel = tel10(b.telefono);
      if (nombre.length < 3 || !nombre.includes(" ")) falla("Escribe tu nombre y apellido.");
      if (!tel) falla("Escribe tu celular a 10 dígitos.");
      const sv = await servicioPorId(cfg, b.servicioId);
      const crudo = (b as unknown as { dias?: unknown }).dias;
      const dias = (Array.isArray(crudo) ? crudo : []).map(String).filter((d, i, a) => ["lun", "mar", "mie", "jue", "vie", "sab"].includes(d) && a.indexOf(d) === i);
      if (!dias.length) falla("Elige al menos un día que te acomode.");
      const franja = ["manana", "tarde", "cualquiera"].includes(b.franja) ? b.franja : "cualquiera";
      const comentario = String(b.comentario ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null;
      // Misma anotación vigente (mismo celular y sucursal): se actualiza, no se duplica.
      const previa = await (await sb(`agenda_lista_espera?select=id&slug=eq.${cfg.slug}&telefono=eq.${tel}&estado=eq.pendiente&limit=1`)).json();
      if (Array.isArray(previa) && previa[0]) {
        await sb(`agenda_lista_espera?id=eq.${previa[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ nombre, servicio_id: sv.id, servicio: sv.nombre, dias, franja, comentario, actualizado_en: new Date().toISOString() }) });
        return { ok: true, actualizada: true };
      }
      if (!cfg.modo_pruebas) { // antiabuso: máx. 3 anotaciones nuevas por celular al día
        const desde = new Date(Date.now() - 864e5).toISOString();
        const rr = await (await sb(`agenda_lista_espera?select=id&telefono=eq.${tel}&created_at=gte.${desde}`)).json();
        if (Array.isArray(rr) && rr.length >= 3) falla("Ya te anotaste en varias listas hoy. Escríbenos por WhatsApp para ayudarte.");
      }
      const ins = await sb("agenda_lista_espera", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ slug: cfg.slug, nombre, telefono: tel, servicio_id: sv.id, servicio: sv.nombre, dias, franja, comentario }) });
      if (!ins.ok) throw new Error("no pude guardar la lista de espera: " + (await ins.text()).slice(0, 200));
      const ORDEN = ["lun", "mar", "mie", "jue", "vie", "sab"], ETQ: Record<string, string> = { lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb" };
      const FRANJA_TXT: Record<string, string> = { manana: "Por la mañana", tarde: "Por la tarde", cualquiera: "Cualquier hora" };
      avisar(cfg, PLANTILLAS.espera, [cfg.nombre, nombre, tel, sv.nombre, ORDEN.filter((d) => dias.includes(d)).map((d) => ETQ[d]).join(", "), FRANJA_TXT[franja], comentario ?? "Sin comentarios"]);
      return { ok: true };
    }

    case "reserva": {
      const r = await reservaValida(cfg, b);
      const e = await eventoDe(cfg, r);
      const [ini, fin] = rango(e);
      return { servicio: r.servicio, especial: !!r.especial, fecha: ymd(ini), hora: hm(ini), horaFin: hm(fin), comprobante: !!r.comprobante_at, anticipo: infoAnticipo(cfg, r.servicio), reagendarHoras: cfg.anticipacion_horas };
    }

    case "comprobante": {
      const r = await reservaValida(cfg, b);
      const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(b.imagen ?? ""));
      if (!m) falla("Sube una imagen JPG o PNG.");
      const bytes = Uint8Array.from(atob(m![2]), (c) => c.charCodeAt(0));
      const esJpg = bytes[0] === 0xff && bytes[1] === 0xd8, esPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      if (!esJpg && !esPng) falla("Sube una imagen JPG o PNG.");
      if (bytes.length > 4 * 1024 * 1024) falla("La imagen es muy pesada. Intenta con otra captura.");
      const e = await eventoDe(cfg, r);
      const path = `${r.id}.${esJpg ? "jpg" : "png"}`;
      const base = `${env("SUPABASE_URL")}/storage/v1`;
      const auth = { apikey: SK(), Authorization: `Bearer ${SK()}` };
      const up = await fetch(`${base}/object/comprobantes/${path}`, { method: "POST", headers: { ...auth, "Content-Type": esJpg ? "image/jpeg" : "image/png", "x-upsert": "true" }, body: bytes });
      if (!up.ok) throw new Error("storage: " + (await up.text()).slice(0, 200));
      const sg = await (await fetch(`${base}/object/sign/comprobantes/${path}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 15_552_000 }) })).json(); // 180 días
      if (!sg.signedURL) throw new Error("storage sign: " + JSON.stringify(sg).slice(0, 200));
      await sb(`agenda_reservas?id=eq.${r.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ comprobante_path: path, comprobante_at: new Date().toISOString() }) });
      // Recepción lo ve en el evento: revisa el comprobante y cambia 🧊 por 💰 al validar el anticipo.
      const resto = (e.description ?? "").replace(/^📎 COMPROBANTE[^\n]*\n?/, "");
      await gcal(cfg.calendar_id, `/${encodeURIComponent(e.id)}`, { method: "PATCH", body: JSON.stringify({ description: `📎 COMPROBANTE RECIBIDO (revisar y cambiar 🧊 por 💰): ${base}${sg.signedURL}\n${resto}` }) }, { sendUpdates: "none" })
        .catch((err) => console.error("no pude anotar el comprobante en el evento", err));
      const [ci, cf] = rango(e);
      avisar(cfg, PLANTILLAS.comprobante, [cfg.nombre, r.nombre, r.telefono, r.servicio, cuandoTxt(ci, cf), `${base}${sg.signedURL}`]);
      return { ok: true };
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
