// Supabase Edge Function: opiniones
// Backend del QR de opiniones por sucursal (/opinion/<slug>).
//
// Público (la clienta, sin login):
//   sucursales  {}                                   -> { sucursales: [{ slug, nombre }] }
//   info        { slug }                             -> { nombre, tema }
//   calificar   { slug, calificacion }               -> { id, googleUrl? }   (googleUrl solo con 5 estrellas)
//   detalle     { id, categorias, comentario, nombre, telefono } -> { ok }  (1 a 4 estrellas; una sola vez, dentro de 24 h)
//   google      { id }                               -> { ok }               (marca que tocó el botón hacia Google)
// Equipo (usuario + hash de system_users, igual que la función `lealtad`):
//   listar      { usuario, hash, dias? }             -> { opiniones: [...], sucursales: [{ slug, nombre, googleUrl, mapsUrl }] }
//   resolver    { usuario, hash, id, estado, nota }  -> { ok }
//   config      { usuario, hash, slug, googleUrl }   -> { ok }
//
// Secretos: solo SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ya existen).

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
const enc = encodeURIComponent;

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
const rows = async (path: string) => {
  const r = await sb(path);
  const j = await r.json();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${JSON.stringify(j)}`);
  return j as Record<string, any>[];
};

const CATEGORIAS = ["servicio", "atencion", "limpieza", "puntualidad", "precio", "otro"];
const UUID = /^[0-9a-f-]{36}$/;
const limpiar = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function sucursal(slug: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) falla("Esta sucursal no existe.");
  const r = (await rows(`agenda_sucursales?slug=eq.${enc(slug)}&select=slug,nombre,tema,maps_url,google_resena_url,avisos_opiniones_tel`))[0];
  if (!r) falla("Esta sucursal no existe.");
  return r;
}
// ---------- Aviso por WhatsApp al equipo (opinión baja) ----------
// Plantilla UTILITY es_MX `opinion_baja` (texto en docs/opiniones-qr.md). Destinatarios: agenda_sucursales.avisos_opiniones_tel (lista propia, independiente de la agenda).
// Nunca rompe el guardado: si falla, solo queda el error en los logs.
const AVISO = { name: "opinion_baja" };
const paraWA = (t: unknown) => String(t ?? "").replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900) || "-";
async function mandarAviso(tel: string, vars: string[]) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("WA_TOKEN")}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: tel.replace(/\D/g, ""), type: "template",
      template: { name: AVISO.name, language: { code: "es_MX" }, components: [{ type: "body", parameters: vars.map((t) => ({ type: "text", text: paraWA(t) })) }] },
    }),
  });
  if (!r.ok) console.error(`aviso opinión falló para …${tel.slice(-4)}:`, (await r.text()).slice(0, 300));
}
function avisarEquipo(s: Record<string, any>, vars: string[]) {
  const tels: string[] = s.avisos_opiniones_tel ?? [];
  if (!tels.length || !env("WA_TOKEN") || !env("WA_PHONE_ID")) return;
  const trabajo = Promise.allSettled(tels.map((t) => mandarAviso(t, vars)));
  (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(trabajo);
}
const urlGoogle = (s: Record<string, any>) => s.google_resena_url || s.maps_url || null;

async function staff(b: Record<string, string>): Promise<string> {
  const u = String(b.usuario ?? ""), h = String(b.hash ?? "");
  if (!u || !/^[0-9a-f]{64}$/.test(h)) falla("Sesión no válida. Vuelve a entrar al sistema.");
  const r = await rows(`system_users?select=username&username=eq.${enc(u)}&password_hash=eq.${h}`);
  if (!r.length) falla("Sesión no válida. Vuelve a entrar al sistema.");
  return u;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json();
    const accion = String(b.accion ?? "");

    if (accion === "sucursales") {
      const r = await rows("agenda_sucursales?select=slug,nombre&order=nombre");
      return json({ sucursales: r });
    }

    if (accion === "info") {
      const s = await sucursal(String(b.slug ?? ""));
      return json({ nombre: s.nombre, tema: s.tema });
    }

    if (accion === "calificar") {
      const s = await sucursal(String(b.slug ?? ""));
      const n = Number(b.calificacion);
      if (!Number.isInteger(n) || n < 1 || n > 5) falla("Calificación no válida.");
      const r = await sb("opiniones", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ slug: s.slug, calificacion: n }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${JSON.stringify(j)}`);
      return json({ id: j[0].id, ...(n === 5 ? { googleUrl: urlGoogle(s) } : {}) });
    }

    if (accion === "detalle") {
      const id = String(b.id ?? "");
      if (!UUID.test(id)) falla("Opinión no válida.");
      const o = (await rows(`opiniones?id=eq.${id}&select=calificacion,detalle_enviado,created_at,slug`))[0];
      if (!o) falla("Opinión no válida.");
      if (o.calificacion === 5) falla("Opinión no válida.");
      if (o.detalle_enviado) falla("Ya recibimos tu opinión. ¡Gracias!");
      if (Date.now() - new Date(o.created_at).getTime() > 24 * 3600_000) falla("Esta opinión ya no se puede editar.");
      const categorias = (Array.isArray(b.categorias) ? b.categorias : []).map(String).filter((c) => CATEGORIAS.includes(c));
      const telefono = String(b.telefono ?? "").replace(/\D/g, "").slice(-10);
      if (telefono && telefono.length !== 10) falla("El celular debe tener 10 dígitos.");
      const r = await sb(`opiniones?id=eq.${id}&detalle_enviado=eq.false`, {
        method: "PATCH",
        body: JSON.stringify({
          categorias: [...new Set(categorias)], comentario: limpiar(b.comentario, 1000) || null,
          nombre: limpiar(b.nombre, 80) || null, telefono: telefono || null, detalle_enviado: true,
        }),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      // 1 o 2 estrellas: avisa al equipo de la sucursal con el detalle que acaba de escribir la clienta.
      if (o.calificacion <= 2) {
        const s = await sucursal(o.slug);
        avisarEquipo(s, [
          s.nombre, String(o.calificacion), limpiar(b.nombre, 80) || "No dejó nombre", telefono || "No dejó celular",
          categorias.map((c) => c).join(", ") || "No indicó", limpiar(b.comentario, 600) || "Sin comentario",
        ]);
      }
      return json({ ok: true });
    }

    if (accion === "google") {
      const id = String(b.id ?? "");
      if (!UUID.test(id)) falla("Opinión no válida.");
      await sb(`opiniones?id=eq.${id}&calificacion=eq.5`, { method: "PATCH", body: JSON.stringify({ fue_a_google: true }) });
      return json({ ok: true });
    }

    // ---------- Equipo ----------
    if (accion === "listar") {
      await staff(b);
      const dias = Math.min(Math.max(Number(b.dias) || 90, 1), 730);
      const desde = new Date(Date.now() - dias * 86400_000).toISOString();
      const [ops, sucs] = await Promise.all([
        rows(`opiniones?created_at=gte.${enc(desde)}&select=*&order=created_at.desc&limit=2000`),
        rows("agenda_sucursales?select=slug,nombre,maps_url,google_resena_url&order=nombre"),
      ]);
      return json({
        opiniones: ops,
        sucursales: sucs.map((s) => ({ slug: s.slug, nombre: s.nombre, googleUrl: s.google_resena_url, mapsUrl: s.maps_url })),
      });
    }

    if (accion === "resolver") {
      await staff(b);
      const id = String(b.id ?? "");
      if (!UUID.test(id)) falla("Opinión no válida.");
      const estado = b.estado === "atendida" ? "atendida" : "nueva";
      const r = await sb(`opiniones?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ estado, nota_interna: limpiar(b.nota, 1000) || null }) });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      return json({ ok: true });
    }

    if (accion === "config") {
      await staff(b);
      const s = await sucursal(String(b.slug ?? ""));
      const url = limpiar(b.googleUrl, 500);
      if (url && !/^https:\/\/(search\.google\.com|www\.google\.com|g\.page|g\.co|maps\.app\.goo\.gl|www\.google\.[a-z.]+\/maps)\//.test(url)) {
        falla("El enlace debe ser de Google (search.google.com/local/writereview?placeid=…, g.page o maps).");
      }
      const r = await sb(`agenda_sucursales?slug=eq.${enc(s.slug)}`, { method: "PATCH", body: JSON.stringify({ google_resena_url: url || null }) });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      return json({ ok: true });
    }

    falla("Acción no válida.");
  } catch (e) {
    if (e instanceof Falla) return json({ error: e.message }, 400);
    console.error("opiniones", e);
    return json({ error: "No pudimos completar la solicitud. Intenta de nuevo." }, 500);
  }
});
