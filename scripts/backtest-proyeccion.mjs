// Backtest del modelo de proyección de ventas (src/components/finanzas/forecast.js).
// Simula qué habría proyectado el modelo para un mes ya cerrado, usando solo el
// historial disponible ANTES de ese mes, y lo compara contra la venta real.
// Uso: node scripts/backtest-proyeccion.mjs 2026-08
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { indiceEstacionalPooled, backtestWalkForward, proyectar } from "../src/components/finanzas/forecast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const p = path.join(__dirname, "..", file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv(".env.local");
loadEnv(".env");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_KEY en .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SUCURSALES_NAMES = ["Coapa", "Valle", "Oriente", "Polanco", "Metepec"];

const mesObjetivo = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(mesObjetivo || "")) {
  console.error("Uso: node scripts/backtest-proyeccion.mjs YYYY-MM");
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase.from("ventas_mensuales_cache").select("mes,sucursal,total");
  if (error) {
    console.error("Error consultando ventas_mensuales_cache:", error.message);
    process.exit(1);
  }

  const porMes = {};
  for (const row of data) {
    porMes[row.mes] = porMes[row.mes] || { mes: row.mes };
    porMes[row.mes][row.sucursal] = row.total;
  }
  const historialTotal = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes));

  // Solo lo que el modelo habría visto ANTES del mes objetivo (simula el corte real).
  const historialCerrado = historialTotal.filter((r) => r.mes < mesObjetivo);

  const filaReal = porMes[mesObjetivo];
  if (!filaReal) {
    console.error(`No hay datos reales cacheados para ${mesObjetivo} en ventas_mensuales_cache todavía.`);
    process.exit(1);
  }

  const indice = indiceEstacionalPooled(historialCerrado, SUCURSALES_NAMES);
  const backtest = backtestWalkForward(historialCerrado, SUCURSALES_NAMES, indice);

  console.log(`\nModelo entrenado con historial < ${mesObjetivo} (${historialCerrado.length} meses cacheados).`);
  console.log(`Backtest global: MAPE=${backtest.mape}%  sesgo=${backtest.sesgo}  n=${backtest.n}\n`);

  const resultados = [];
  for (const suc of SUCURSALES_NAMES) {
    const proy = proyectar(historialCerrado, suc, mesObjetivo, indice, backtest);
    const real = filaReal[suc] || 0;
    if (!proy || !real) continue;
    const { desest: optimista, desest_castigado: realista } = proy;
    const enRango = real >= realista.punto && real <= optimista.punto;
    const alcanzoPiso = real >= realista.punto; // criterio de cumplimiento usado en la app (realista = piso)
    const errRealPct = ((real - realista.punto) / realista.punto) * 100;
    resultados.push({ suc, real, optimista: optimista.punto, realista: realista.punto, enRango, alcanzoPiso, errRealPct });
  }

  console.log(
    "Sucursal".padEnd(10),
    "Realista".padStart(12),
    "Optimista".padStart(12),
    "Real".padStart(12),
    "¿En rango?".padStart(12),
    "¿Cumplió piso?".padStart(16),
    "Err vs Real%".padStart(14)
  );
  for (const r of resultados) {
    console.log(
      r.suc.padEnd(10),
      Math.round(r.realista).toLocaleString("es-MX").padStart(12),
      Math.round(r.optimista).toLocaleString("es-MX").padStart(12),
      Math.round(r.real).toLocaleString("es-MX").padStart(12),
      (r.enRango ? "SÍ" : "NO").padStart(12),
      (r.alcanzoPiso ? "SÍ" : "NO").padStart(16),
      `${r.errRealPct.toFixed(1)}%`.padStart(14)
    );
  }

  const dentro = resultados.filter((r) => r.enRango).length;
  const cumplieron = resultados.filter((r) => r.alcanzoPiso).length;
  console.log(`\n${dentro} de ${resultados.length} sucursales cayeron ESTRICTAMENTE entre Realista y Optimista para ${mesObjetivo}.`);
  console.log(`${cumplieron} de ${resultados.length} sucursales ALCANZARON O SUPERARON la meta Realista (criterio de cumplimiento de la app) para ${mesObjetivo}.`);
}

main();
