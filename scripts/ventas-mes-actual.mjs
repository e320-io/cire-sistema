// Ventas diarias de noviembre por sucursal (Zettle, vía sync-zettle raw) → CSV.
// Uso: node scripts/ventas-noviembre-diario.mjs [salida.csv]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_KEY;
const CUENTAS = ["metepec", "coapa", "valle_polanco", "oriente"];
const hoy = new Date().toISOString().slice(0, 10);
const año = Number(hoy.slice(0, 4));
const años = [año];
const desde = hoy.slice(0, 8) + "01";
const hasta = process.env.HASTA || hoy;

const tickets = [];
for (const c of CUENTAS) {
  const r = await fetch(`${URL_}/functions/v1/sync-zettle?sucursal=${c}&startDate=${desde}&raw=true`, { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await r.json();
  if (!r.ok || !Array.isArray(j)) { console.error(c, r.status, JSON.stringify(j).slice(0, 200)); continue; }
  console.log(`${c}: ${j.length} tickets`);
  tickets.push(...j);
}
const agg = {};
for (const t of tickets) {
  if (!t.fecha || t.fecha.slice(0, 7) !== hoy.slice(0, 7) || t.fecha > hasta || !años.includes(Number(t.fecha.slice(0, 4)))) continue;
  const k = `${t.fecha}|${t.sucursal}`;
  agg[k] = agg[k] || { fecha: t.fecha, sucursal: t.sucursal, total: 0, tickets: 0 };
  agg[k].total += Number(t.total) || 0;
  agg[k].tickets += 1;
}
const filas = Object.values(agg).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.sucursal.localeCompare(b.sucursal));
const out = process.argv[2] || path.join(__dirname, "..", "ventas_mes_actual.csv");
fs.writeFileSync(out, "fecha,anio,dia,sucursal,tickets,total\n" + filas.map(f => `${f.fecha},${f.fecha.slice(0,4)},${Number(f.fecha.slice(8))},${f.sucursal},${f.tickets},${f.total.toFixed(2)}`).join("\n") + "\n");
console.log(`${filas.length} filas → ${out}`);
const res = {};
for (const f of filas) { const k = `${f.fecha.slice(0,4)} ${f.sucursal}`; res[k] = (res[k] || 0) + f.total; }
console.table(res);
