// Prueba local del cierre diario de mensajes (sin enviar nada). Uso: node scripts/probar-resumen-mensajes.mjs [yyyy-mm-dd]
// Lee VITE_META_TOKEN y VITE_META_ACCOUNTS de .env.local. Por defecto, el día de ayer (hora CDMX).
import { readFileSync } from "node:fs";
import { leerDiario, armarResumen, parseCuentas } from "../supabase/functions/_shared/resumen-mensajes.js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const cdmx = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const dia = process.argv[2] || cdmx(new Date(Date.now() - 864e5));
// Desde 14 días antes (o el inicio del mes, lo que sea antes): los anuncios se comparan contra la semana previa
const hace14 = new Date(new Date(dia + "T12:00:00Z").getTime() - 14 * 864e5).toISOString().slice(0, 10);
const since = hace14 < `${dia.slice(0, 7)}-01` ? hace14 : `${dia.slice(0, 7)}-01`;
const datos = await leerDiario(parseCuentas(env.VITE_META_ACCOUNTS), env.VITE_META_TOKEN, since, dia);
console.log(armarResumen(datos, dia).texto);
