// Trae el histórico completo directo de Zettle (sin pasar por ventas_mensuales_cache)
// y mide, mes a mes y sucursal por sucursal, si quedarse corto / pegarle / pasarse
// del rango Realista-Optimista tiene efecto medible en el desempeño del mes siguiente.
// Uso: node scripts/efecto-mes-siguiente.mjs
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

const SUCURSALES_NAMES = ["Coapa", "Valle", "Oriente", "Polanco", "Metepec"];
// Mismas cuentas Zettle que src/lib/zettle.js (Valle y Polanco comparten cuenta,
// pero cada ticket trae su propia sucursal individual).
const ZETTLE_CUENTAS_FIN = [
  { key: "metepec", label: "Metepec" },
  { key: "coapa", label: "Coapa" },
  { key: "valle_polanco", label: "Valle + Polanco" },
  { key: "oriente", label: "Oriente" },
];

async function fetchZettleRaw(desde, hasta) {
  const todas = [];
  for (const cuenta of ZETTLE_CUENTAS_FIN) {
    const url = `${SUPABASE_URL}/functions/v1/sync-zettle?sucursal=${cuenta.key}&startDate=${desde}&raw=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } });
    const json = await res.json();
    if (!res.ok || !Array.isArray(json)) {
      console.error(`  Zettle (${cuenta.label}) respondió sin datos válidos:`, res.status, JSON.stringify(json).slice(0, 200));
      continue;
    }
    console.log(`  Zettle (${cuenta.label}): ${json.length} tickets`);
    todas.push(...json.filter((t) => t.fecha >= desde && t.fecha <= hasta));
  }
  return todas;
}

async function main() {
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = "2023-09-12"; // Zettle no permite consultar historial de más de 3 años atrás
  console.log(`Trayendo histórico completo directo de Zettle (${desde} → ${hoy})...`);
  const tickets = await fetchZettleRaw(desde, hoy);

  const porMes = {};
  for (const t of tickets) {
    const mes = t.fecha.slice(0, 7);
    porMes[mes] = porMes[mes] || { mes };
    porMes[mes][t.sucursal] = (porMes[mes][t.sucursal] || 0) + Number(t.total);
  }
  const historialTotal = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes));
  const mesActual = hoy.slice(0, 7);
  const mesesCerrados = historialTotal.filter((r) => r.mes < mesActual).map((r) => r.mes);

  console.log(`\n${mesesCerrados.length} meses cerrados con datos reales (${mesesCerrados[0]} → ${mesesCerrados[mesesCerrados.length - 1]}).\n`);

  // Para cada mes cerrado (con suficiente historial previo) y sucursal, simula la
  // proyección que el modelo habría hecho usando SOLO los meses anteriores a ese mes.
  const clasifPorSucMes = {}; // clasifPorSucMes[suc][mes] = { real, realista, optimista, clase }
  SUCURSALES_NAMES.forEach((s) => (clasifPorSucMes[s] = {}));

  for (let i = 0; i < mesesCerrados.length; i++) {
    const mes = mesesCerrados[i];
    const historialCerrado = historialTotal.filter((r) => r.mes < mes);
    if (historialCerrado.length < 4) continue; // necesita al menos 3 meses previos + margen
    const indice = indiceEstacionalPooled(historialCerrado, SUCURSALES_NAMES);
    const backtest = backtestWalkForward(historialCerrado, SUCURSALES_NAMES, indice);
    for (const suc of SUCURSALES_NAMES) {
      const proy = proyectar(historialCerrado, suc, mes, indice, backtest);
      const real = porMes[mes]?.[suc] || 0;
      if (!proy || !real) continue;
      const { desest: optimista, desest_castigado: realista } = proy;
      let clase;
      if (real < realista.punto) clase = "falla";
      else if (real > optimista.punto) clase = "se_pasa";
      else clase = "cumple";
      clasifPorSucMes[suc][mes] = { real, realista: realista.punto, optimista: optimista.punto, clase };
    }
  }

  // Ahora mide qué pasó el mes SIGUIENTE después de cada clase, por sucursal.
  const transiciones = {}; // transiciones[claseOrigen][claseDestino] = count
  const crecimientoPorClase = {}; // crecimientoPorClase[claseOrigen] = [pct,...]
  ["falla", "cumple", "se_pasa"].forEach((c) => {
    transiciones[c] = { falla: 0, cumple: 0, se_pasa: 0, sin_dato: 0 };
    crecimientoPorClase[c] = [];
  });

  const detalle = [];
  for (const suc of SUCURSALES_NAMES) {
    const meses = Object.keys(clasifPorSucMes[suc]).sort();
    for (let i = 0; i < meses.length; i++) {
      const mes = meses[i];
      const actual = clasifPorSucMes[suc][mes];
      const mesSig = mesesCerrados[mesesCerrados.indexOf(mes) + 1];
      if (!mesSig) continue;
      const siguiente = clasifPorSucMes[suc][mesSig];
      const realSig = porMes[mesSig]?.[suc];
      if (!realSig) continue;
      const crecimiento = ((realSig - actual.real) / actual.real) * 100;
      crecimientoPorClase[actual.clase].push(crecimiento);
      if (siguiente) transiciones[actual.clase][siguiente.clase]++;
      else transiciones[actual.clase].sin_dato++;
      detalle.push({ suc, mes, clase: actual.clase, real: actual.real, mesSig, realSig, crecimiento, claseSig: siguiente?.clase || "?" });
    }
  }

  console.log("=== Detalle mes → mes siguiente (todas las sucursales) ===");
  console.log(
    "Sucursal".padEnd(9), "Mes".padEnd(8), "Clase".padEnd(9),
    "Real".padStart(10), "Mes sig.".padEnd(9), "Real sig.".padStart(10),
    "Δ%".padStart(8), "Clase sig.".padEnd(10)
  );
  for (const d of detalle) {
    console.log(
      d.suc.padEnd(9), d.mes.padEnd(8), d.clase.padEnd(9),
      Math.round(d.real).toLocaleString("es-MX").padStart(10),
      d.mesSig.padEnd(9),
      Math.round(d.realSig).toLocaleString("es-MX").padStart(10),
      `${d.crecimiento >= 0 ? "+" : ""}${d.crecimiento.toFixed(1)}%`.padStart(8),
      d.claseSig.padEnd(10)
    );
  }

  console.log("\n=== Resumen: ¿cómo afecta la clase del mes N al mes N+1? ===\n");
  for (const clase of ["falla", "cumple", "se_pasa"]) {
    const cs = crecimientoPorClase[clase];
    if (!cs.length) continue;
    const promedio = cs.reduce((a, b) => a + b, 0) / cs.length;
    const t = transiciones[clase];
    const totalT = t.falla + t.cumple + t.se_pasa;
    console.log(`Después de "${clase}" (n=${cs.length}):`);
    console.log(`  Crecimiento promedio real mes→mes siguiente: ${promedio >= 0 ? "+" : ""}${promedio.toFixed(1)}%`);
    if (totalT) {
      console.log(`  Mes siguiente cae en: falla ${((t.falla / totalT) * 100).toFixed(0)}% | cumple ${((t.cumple / totalT) * 100).toFixed(0)}% | se_pasa ${((t.se_pasa / totalT) * 100).toFixed(0)}%`);
    }
    console.log("");
  }
}

main();
