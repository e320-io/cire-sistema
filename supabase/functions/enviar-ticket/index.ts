// Supabase Edge Function: enviar-ticket
// Envía notificación por Gmail cuando se crea un ticket de soporte o sugerencia
// Deploy: supabase functions deploy enviar-ticket
// Secrets: supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=... SOPORTE_EMAIL=...

import nodemailer from "npm:nodemailer@6"

const GMAIL_USER       = Deno.env.get("GMAIL_USER")!
const GMAIL_APP_PASS   = Deno.env.get("GMAIL_APP_PASSWORD")!
const SOPORTE_EMAIL    = Deno.env.get("SOPORTE_EMAIL")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { tipo, sucursal, fecha, descripcion, conversacion } = await req.json()

    const essoporte = tipo === "soporte"
    const emoji     = essoporte ? "🔧" : "💡"
    const tipoLabel = essoporte ? "Soporte técnico" : "Sugerencia"

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f8; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 12px; padding: 28px 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .badge { display: inline-block; padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; background: ${essoporte ? "#fff3e0" : "#e3f2fd"}; color: ${essoporte ? "#e65100" : "#1565c0"}; }
  h2 { color: #22264A; margin: 0 0 6px; font-size: 20px; }
  .meta { color: #888; font-size: 13px; margin-bottom: 20px; }
  .section-title { font-size: 12px; font-weight: 700; color: #aaa; letter-spacing: 1px; text-transform: uppercase; margin: 20px 0 8px; }
  .desc-box { background: #f8f9ff; border-left: 3px solid ${essoporte ? "#f97316" : "#49B8D3"}; padding: 12px 16px; border-radius: 0 8px 8px 0; color: #333; font-size: 14px; line-height: 1.6; }
  .conv { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #444; line-height: 1.7; white-space: pre-wrap; max-height: 400px; overflow: hidden; }
  .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #bbb; text-align: center; }
</style></head>
<body>
  <div class="card">
    <div class="badge">${emoji} ${tipoLabel}</div>
    <h2>${sucursal}</h2>
    <div class="meta">${fecha}</div>

    <div class="section-title">Descripción</div>
    <div class="desc-box">${descripcion || "—"}</div>

    <div class="section-title">Conversación completa</div>
    <div class="conv">${conversacion || "—"}</div>

    <div class="footer">CIRE Sistema · Período de pruebas UAT</div>
  </div>
</body>
</html>`

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
    })

    await transporter.sendMail({
      from: `"CIRE Sistema" <${GMAIL_USER}>`,
      to: SOPORTE_EMAIL,
      subject: `${emoji} [${tipoLabel.toUpperCase()}] ${sucursal} — ${new Date().toLocaleDateString("es-MX")}`,
      html,
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (err) {
    console.error("Error enviando correo:", err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
