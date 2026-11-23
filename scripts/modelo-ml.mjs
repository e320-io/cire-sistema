// Prueba un modelo de Machine Learning (Random Forest) contra el modelo estadístico
// actual (forecast.js), usando walk-forward real (solo datos anteriores a cada mes)
// y datos directos de Zettle. Objetivo: ver si un modelo con más features (lags,
// mes, sucursal, tendencia) da una proyección con margen de error más angosto que
// las bandas de confianza del modelo actual, que salieron muy amplias.
// Uso: node scripts/modelo-ml.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RandomForestRegression as RFRegression } from "ml-random-forest";
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
    if (!res.ok || !Array.isArray(json)) continue;
    todas.push(...json.filter((t) => t.fecha >= desde && t.fecha <= hasta));
  }
  return todas;
}

const mesNum = (m) => parseInt(m.slice(5, 7), 10);
const fmt = (n) => Math.round(n).toLocaleString("es-MX");
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const std = (arr) => { const m = mean(arr); return Math.sqrt(mean(arr.map((v) => (v - m) ** 2))); };

// Construye el vector de features para (suc, mes) usando SOLO datos anteriores a `mes`.
// Pocas dimensiones a propósito: con ~150 filas totales, features one-hot (12 meses +
// 5 sucursales) sobreajustan el Random Forest. Aquí: estacionalidad como seno/coseno,
// la sucursal como su propio nivel histórico (no categoría), y lags/tendencia.
function construirFeatures(historialCerrado, suc, mes) {
  const serie = historialCerrado
    .filter((r) => (r[suc] || 0) > 0)
    .map((r) => ({ mes: r.mes, venta: r[suc] }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
  if (serie.length < 3) return null;
  const ultimos3 = serie.slice(-3).map((r) => r.venta);
  const logLags = ultimos3.map((v) => Math.log1p(v));
  const nivelHistorico = Math.log1p(mean(serie.map((r) => r.venta)));

  const angulo = (2 * Math.PI * mesNum(mes)) / 12;

  return [
    Math.sin(angulo), Math.cos(angulo),
    nivelHistorico,
    logLags[2], logLags[1], logLags[0], // lag1, lag2, lag3 (más reciente primero)
    mean(logLags),
    std(logLags),
    serie.length, // meses de historia disponibles (proxy de madurez/tendencia)
  ];
}

async function main() {
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = "2023-09-12";
  console.log(`Trayendo histórico directo de Zettle (${desde} → ${hoy})...`);
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
  console.log(`${mesesCerrados.length} meses cerrados (${mesesCerrados[0]} → ${mesesCerrados[mesesCerrados.length - 1]}).\n`);

  // ---------- Walk-forward: entrena RF solo con lo anterior a cada mes, predice, compara ----------
  const errModelo = [];   // modelo estadístico actual (forecast.js) — % error (pred-real)/real
  const errML = [];       // random forest — % error
  const filasComparacion = [];

  // Umbral mínimo de filas de entrenamiento para que el RF tenga sentido.
  const MIN_TRAIN = 40;

  for (const mes of mesesCerrados) {
    const historialCerrado = historialTotal.filter((r) => r.mes < mes);
    if (historialCerrado.length < 4) continue;

    // --- Dataset de entrenamiento para el RF: todas las filas (suc, mes') con mes' < mes ---
    const X = [];
    const y = [];
    for (const mesTrain of historialCerrado.map((r) => r.mes)) {
      const historialHastaEse = historialTotal.filter((r) => r.mes < mesTrain);
      if (historialHastaEse.length < 4) continue;
      for (const suc of SUCURSALES_NAMES) {
        const real = porMes[mesTrain]?.[suc];
        if (!real) continue;
        const feat = construirFeatures(historialHastaEse, suc, mesTrain);
        if (!feat) continue;
        X.push(feat);
        y.push(Math.log1p(real));
      }
    }
    if (X.length < MIN_TRAIN) continue;

    const rf = new RFRegression({ seed: 42, maxFeatures: 0.8, replacement: true, nEstimators: 100, maxDepth: 4, minNumSamples: 5 });
    rf.train(X, y);

    // --- Modelo estadístico actual, para el mismo corte ---
    const indice = indiceEstacionalPooled(historialCerrado, SUCURSALES_NAMES);
    const backtest = backtestWalkForward(historialCerrado, SUCURSALES_NAMES, indice);

    for (const suc of SUCURSALES_NAMES) {
      const real = porMes[mes]?.[suc];
      if (!real) continue;

      const proy = proyectar(historialCerrado, suc, mes, indice, backtest);
      const feat = construirFeatures(historialCerrado, suc, mes);
      if (!proy || !feat) continue;

      const predML = Math.expm1(rf.predict([feat])[0]);
      const predModelo = proy.desest_castigado.punto; // comparar contra el "realista" (piso corregido por sesgo)

      const errM = (predModelo - real) / real;
      const errRF = (predML - real) / real;
      errModelo.push(errM);
      errML.push(errRF);

      filasComparacion.push({ suc, mes, real, predModelo, predML, errM: errM * 100, errRF: errRF * 100 });
    }
  }

  function resumenError(errores) {
    const abs = errores.map(Math.abs);
    const mape = mean(abs) * 100;
    const sesgo = mean(errores) * 100;
    const ordenados = [...errores].sort((a, b) => a - b);
    const p = (q) => {
      const idx = (ordenados.length - 1) * q;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo);
    };
    return { mape: mape.toFixed(1), sesgo: sesgo.toFixed(1), p10: (p(0.1) * 100).toFixed(1), p90: (p(0.9) * 100).toFixed(1), anchoBanda80: ((p(0.9) - p(0.1)) * 100).toFixed(1), n: errores.length };
  }

  const resModelo = resumenError(errModelo);
  const resML = resumenError(errML);

  console.log("=== Comparación modelo estadístico actual vs Random Forest (walk-forward real) ===\n");
  console.log(`Modelo actual   -> n=${resModelo.n}  MAPE=${resModelo.mape}%  sesgo=${resModelo.sesgo}%  banda80 ancho=${resModelo.anchoBanda80}pts (p10=${resModelo.p10}% p90=${resModelo.p90}%)`);
  console.log(`Random Forest   -> n=${resML.n}  MAPE=${resML.mape}%  sesgo=${resML.sesgo}%  banda80 ancho=${resML.anchoBanda80}pts (p10=${resML.p10}% p90=${resML.p90}%)`);

  console.log("\nDetalle (primeras 15 filas):");
  console.log("Sucursal".padEnd(9), "Mes".padEnd(8), "Real".padStart(10), "Pred.Modelo".padStart(12), "Pred.RF".padStart(12), "Err.Modelo%".padStart(12), "Err.RF%".padStart(10));
  filasComparacion.slice(0, 15).forEach((f) => {
    console.log(
      f.suc.padEnd(9), f.mes.padEnd(8), fmt(f.real).padStart(10), fmt(f.predModelo).padStart(12), fmt(f.predML).padStart(12),
      `${f.errM.toFixed(1)}%`.padStart(12), `${f.errRF.toFixed(1)}%`.padStart(10)
    );
  });

  fs.writeFileSync(
    path.join(__dirname, "..", "comparacion_modelo_ml.json"),
    JSON.stringify({ resModelo, resML, filasComparacion }, null, 1)
  );
  console.log("\nDetalle completo guardado en comparacion_modelo_ml.json");
}

main();
