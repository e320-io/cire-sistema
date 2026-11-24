// Supabase Edge Function: cierre-diario
// Cada mañana arma el cierre de mensajes de Meta del día anterior (imagen 1080x1440 + ventas de Zettle) y lo manda por WhatsApp
// con la plantilla de cada destinatario. Lo dispara pg_cron (7:45 am México); también se puede llamar a mano.
//
// Llamada: GET/POST .../functions/v1/cierre-diario con el header  x-cierre-key: <CIERRE_KEY>
//   ?modo=png    devuelve la imagen del día sin mandar nada
//   ?modo=json   devuelve los datos y las variables de cada plantilla sin mandar nada
//   ?modo=enviar (por defecto) manda a los destinatarios de RESUMEN_DESTINOS
//   ?modo=cache&desde=&hasta=  llena la caché de días anteriores (tabla cierre_dias)
//   ?solo=5255...   manda únicamente a ese teléfono de RESUMEN_DESTINOS (pruebas)
//   ?tel=5255...&version=todas   prueba a CUALQUIER teléfono (aunque no esté en RESUMEN_DESTINOS); no se registra en cierre_envios
//   ?dia=2026-11-04 cierre de otro día (por defecto, ayer en hora de México)
//
// Secretos: META_TOKEN, META_ACCOUNTS ("id:Nombre,id:Nombre"), WA_TOKEN, WA_PHONE_ID, CIERRE_KEY,
//           RESUMEN_DESTINOS ([{ nombre, tel, version: "vpom" | "coapa" | "oriente" }])

import satori, { init as initSatori } from "https://esm.sh/satori@0.10.14/wasm";
import initYoga from "https://esm.sh/yoga-wasm-web@0.3.3";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { armarCierre, llenarCache, ayerCdmx, cdmx } from "../_shared/cierre.js";
import { tarjetaCierre, ANCHO, ALTO } from "../_shared/tarjeta-cierre.js";

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

// ── Dibujo de la tarjeta (satori + resvg en wasm; los wasm y la tipografía se bajan una vez por arranque) ──
let fuentes: { name: string; data: ArrayBuffer; weight: number; style: "normal" }[] = [];
let listo: Promise<void> | null = null;
function preparar() {
  listo ??= (async () => {
    const yoga = await initYoga(await (await fetch("https://unpkg.com/yoga-wasm-web@0.3.3/dist/yoga.wasm")).arrayBuffer());
    initSatori(yoga);
    await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
    const base = "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/";
    fuentes = await Promise.all([[500, "Medium"], [600, "SemiBold"], [700, "Bold"], [800, "ExtraBold"]].map(async ([w, n]) => {
      const r = await fetch(`${base}Poppins-${n}.ttf`);
      if (!r.ok) throw new Error(`No se pudo bajar la tipografía ${n}`);
      return { name: "Poppins", data: await r.arrayBuffer(), weight: w as number, style: "normal" as const };
    }));
  })();
  return listo;
}
async function dibujar(D: unknown): Promise<Uint8Array> {
  await preparar();
  const svg = await satori(tarjetaCierre(D), { width: ANCHO, height: ALTO, fonts: fuentes });
  return new Resvg(svg, { fitTo: { mode: "width", value: ANCHO } }).render().asPng();
}

// ── WhatsApp Cloud API ──
async function subirImagen(png: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([png], { type: "image/png" }), "cierre.png");
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/media`, { method: "POST", headers: { Authorization: `Bearer ${env("WA_TOKEN")}` }, body: form });
  const j = await r.json();
  if (!j.id) throw new Error(`No se pudo subir la imagen: ${JSON.stringify(j).slice(0, 200)}`);
  return j.id;
}
async function mandar(tel: string, plantilla: string, mediaId: string, variables: string[]) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("WA_TOKEN")}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: tel, type: "template",
      template: { name: plantilla, language: { code: "es_MX" }, components: [
        { type: "header", parameters: [{ type: "image", image: { id: mediaId } }] },
        { type: "body", parameters: variables.map((text) => ({ type: "text", text })) },
      ] },
    }),
  });
  const j = await r.json();
  return r.ok ? { ok: true, id: j.messages?.[0]?.id } : { ok: false, error: j.error?.message ?? JSON.stringify(j).slice(0, 200) };
}

// ── Registro de envíos (evita duplicados si el cron se reintenta) ──
const rest = (path: string, init: RequestInit = {}) => fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
  ...init, headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
});
async function yaEnviado(dia: string, tel: string, version: string): Promise<boolean> {
  const r = await rest(`cierre_envios?select=dia&dia=eq.${dia}&tel=eq.${tel}&version=eq.${version}`);
  const j = await r.json();
  return Array.isArray(j) && j.length > 0;
}
async function registrarEnvio(dia: string, tel: string, version: string, wamid?: string) {
  await rest("cierre_envios", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ dia, tel, version, wamid }) });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const clave = env("CIERRE_KEY");
  if (!clave || req.headers.get("x-cierre-key") !== clave) return json({ error: "No autorizado" }, 401);

  const modo = url.searchParams.get("modo") ?? "enviar";
  const solo = url.searchParams.get("solo");
  const dia = url.searchParams.get("dia") ?? ayerCdmx();
  const t0 = performance.now();
  const tiempos: Record<string, number> = {};
  const marca = (paso: string) => { tiempos[paso] = Math.round(performance.now() - t0); };

  try {
    const cfg = { metaToken: env("META_TOKEN"), cuentasRaw: env("META_ACCOUNTS"), supabaseUrl: env("SUPABASE_URL"), supabaseKey: env("SUPABASE_SERVICE_ROLE_KEY") };
    // Llena la caché de días anteriores: ?modo=cache&desde=2026-10-01&hasta=2026-10-10 (rangos cortos, de ~10 días)
    if (modo === "cache") {
      const desde = url.searchParams.get("desde");
      if (!desde) return json({ error: "Falta ?desde=YYYY-MM-DD" }, 400);
      return json(await llenarCache(cfg, desde, url.searchParams.get("hasta") ?? dia));
    }
    const cierre = await armarCierre({
      metaToken: env("META_TOKEN"), cuentasRaw: env("META_ACCOUNTS"),
      supabaseUrl: env("SUPABASE_URL"), supabaseKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    }, dia, cdmx());

    marca("datos_ms");
    if (modo === "json") return json({ ...cierre, tiempos });
    const png = await dibujar(cierre.D);
    marca("imagen_ms");
    if (modo === "png") return new Response(png, { headers: { "Content-Type": "image/png", "X-Tiempos": JSON.stringify(tiempos) } });

    let destinos: { nombre: string; tel: string; version: string }[] = JSON.parse(env("RESUMEN_DESTINOS") || "[]");
    const telPrueba = (url.searchParams.get("tel") ?? "").replace(/\D/g, "");
    if (telPrueba) destinos = [{ nombre: "Prueba", tel: telPrueba, version: url.searchParams.get("version") ?? "todas" }];
    else if (solo) destinos = destinos.filter((d) => d.tel === solo);
    if (!destinos.length) return json({ error: "Sin destinatarios", solo }, 400);

    const forzar = url.searchParams.get("forzar") === "1";
    const resultados = [];
    let mediaId = ""; // la imagen se sube solo si hay a quién mandarla
    for (const d of destinos) {
      const vars = (cierre.vars as Record<string, string[]>)[d.version];
      if (!vars) { resultados.push({ nombre: d.nombre, ok: false, error: `Versión desconocida: ${d.version}` }); continue; }
      if (!telPrueba && !forzar && await yaEnviado(dia, d.tel, d.version)) { resultados.push({ nombre: d.nombre, version: d.version, ok: true, omitido: "ya se había enviado este cierre" }); continue; }
      mediaId ||= await subirImagen(png);
      const r = await mandar(d.tel, `cierre_diario_${d.version}`, mediaId, vars);
      if (r.ok && !telPrueba) await registrarEnvio(dia, d.tel, d.version, r.id); // las pruebas no cuentan como envío del día
      resultados.push({ nombre: d.nombre, version: d.version, ...r });
      await new Promise((x) => setTimeout(x, 1000));
    }
    marca("envio_ms");
    return json({ dia, errores: cierre.errores, resultados, tiempos });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
