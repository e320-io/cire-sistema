// Espera a que Meta apruebe la plantilla cierre_mensajes_diario y manda UN mensaje de prueba al teléfono dado.
// Uso: node scripts/enviar-resumen-prueba.mjs 5215512345678 [yyyy-mm-dd]   (lee .env.local; por defecto el cierre de ayer)
import { readFileSync } from "node:fs";
import { leerDiario, armarResumen, parseCuentas, enviarPlantilla } from "../supabase/functions/_shared/resumen-mensajes.js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const WABA = "936044182153654", PLANTILLA = "cierre_mensajes_diario";
const para = process.argv[2];
if (!para) { console.error("Falta el teléfono (ej. 5215512345678)"); process.exit(1); }
const cdmx = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const dia = process.argv[3] || cdmx(new Date(Date.now() - 864e5));

const estado = async () => {
  const j = await (await fetch(`https://graph.facebook.com/v21.0/${WABA}/message_templates?name=${PLANTILLA}&fields=status,rejected_reason&access_token=${env.VITE_WA_TOKEN}`)).json();
  return j.data?.[0] || {};
};
for (let i = 0; i < 90; i++) { // hasta ~45 min
  const e = await estado();
  console.log(new Date().toLocaleTimeString("es-MX"), "plantilla:", e.status, e.rejected_reason && e.rejected_reason !== "NONE" ? e.rejected_reason : "");
  if (e.status === "APPROVED") break;
  if (e.status === "REJECTED" || e.status === "DISABLED") { console.log("Meta no la aprobó:", e.rejected_reason); process.exit(2); }
  await new Promise((r) => setTimeout(r, 30000));
}
if ((await estado()).status !== "APPROVED") { console.log("Sigue sin aprobarse; vuelve a correr el script más tarde."); process.exit(3); }

const hace14 = new Date(new Date(dia + "T12:00:00Z").getTime() - 14 * 864e5).toISOString().slice(0, 10);
const since = hace14 < `${dia.slice(0, 7)}-01` ? hace14 : `${dia.slice(0, 7)}-01`;
const resumen = armarResumen(await leerDiario(parseCuentas(env.VITE_META_ACCOUNTS), env.VITE_META_TOKEN, since, dia), dia);
try {
  const r = await enviarPlantilla({ token: env.VITE_WA_TOKEN, phoneId: env.VITE_WA_PHONE_ID, plantilla: PLANTILLA, para, params: resumen.params });
  console.log("ENVIADO a", para, JSON.stringify(r.messages));
} catch (e) { console.log("ERROR al enviar:", e.message); process.exit(4); }
