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
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google auth"); return j.access_token as string;
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });

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
    default: return falla("Acción desconocida.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try { return json(await accion(await req.json())); }
  catch (e) { if (e instanceof Falla) return json({ error: e.message }, 400); console.error(e); return json({ error: "No pudimos completar la solicitud. Intenta de nuevo." }, 500); }
});
