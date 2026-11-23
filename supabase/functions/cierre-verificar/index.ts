// Supabase Edge Function: cierre-verificar
// Corre después de los intentos del cierre diario (8:10 am México). Si a alguien de RESUMEN_DESTINOS no le consta el envío de ayer
// en la tabla cierre_envios, manda un aviso por WhatsApp al administrador (CIERRE_ADMIN_TEL) con los nombres.
// Es deliberadamente ligera (sin dibujo ni Meta Ads) para que falle lo menos posible.
//
// Llamada: GET/POST .../functions/v1/cierre-verificar con el header x-cierre-key.  ?dia=2026-11-04 revisa otro día.
//   ?modo=revisar  solo dice quién falta, sin mandar el aviso.

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const ayerCdmx = () => new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!env("CIERRE_KEY") || req.headers.get("x-cierre-key") !== env("CIERRE_KEY")) return json({ error: "No autorizado" }, 401);
  const dia = url.searchParams.get("dia") ?? ayerCdmx();
  try {
    const destinos: { nombre: string; tel: string; version: string }[] = JSON.parse(env("RESUMEN_DESTINOS") || "[]");
    const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/cierre_envios?select=tel,version&dia=eq.${dia}`, {
      headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
    });
    const enviados = await r.json();
    if (!Array.isArray(enviados)) throw new Error(`No pude leer cierre_envios: ${JSON.stringify(enviados).slice(0, 120)}`);
    const faltan = destinos.filter((d) => !enviados.some((e: { tel: string; version: string }) => e.tel === d.tel && e.version === d.version));
    if (!faltan.length) return json({ dia, ok: true, mensaje: "A todos les llegó su cierre" });
    if (url.searchParams.get("modo") === "revisar") return json({ dia, ok: false, faltan: faltan.map((d) => d.nombre) });

    const fechaLarga = new Date(dia + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const nombres = [...new Set(faltan.map((d) => d.nombre))].join(", ");
    const a = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("WA_TOKEN")}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: env("CIERRE_ADMIN_TEL"), type: "template",
        template: { name: "cierre_diario_alerta", language: { code: "es_MX" }, components: [{ type: "body", parameters: [{ type: "text", text: fechaLarga }, { type: "text", text: nombres }] }] },
      }),
    });
    const j = await a.json();
    return json({ dia, ok: false, faltan: faltan.map((d) => d.nombre), aviso: a.ok ? { enviado: true, id: j.messages?.[0]?.id } : { enviado: false, error: j.error?.message ?? JSON.stringify(j).slice(0, 200) } });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
