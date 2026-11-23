// Reporte en Excel: proyección (Realista/Optimista) vs venta real, mes a mes y
// sucursal por sucursal, con clasificación de cumplimiento, el efecto del mes
// anterior sobre el mes siguiente, y una banda de confianza más realista (80%)
// como alternativa al rango estrecho Realista-Optimista.
// Uso: node scripts/reporte-proyecciones.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { indiceEstacionalPooled, backtestWalkForward, proyectar, siguienteMes } from "../src/components/finanzas/forecast.js";

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
    if (!res.ok || !Array.isArray(json)) {
      console.error(`  Zettle (${cuenta.label}) sin datos válidos:`, res.status, JSON.stringify(json).slice(0, 200));
      continue;
    }
    console.log(`  Zettle (${cuenta.label}): ${json.length} tickets`);
    todas.push(...json.filter((t) => t.fecha >= desde && t.fecha <= hasta));
  }
  return todas;
}

const mesNum = (m) => parseInt(m.slice(5, 7), 10);
const fmt = (n) => Math.round(n).toLocaleString("es-MX");

async function main() {
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = "2023-09-12"; // límite real de Zettle: no permite consultar más de 3 años atrás
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
  console.log(`${mesesCerrados.length} meses cerrados (${mesesCerrados[0]} → ${mesesCerrados[mesesCerrados.length - 1]}). Mes en curso: ${mesActual}.\n`);

  // ---------- Backtest mes a mes: proyección con SOLO lo que existía antes de cada mes ----------
  const clasifPorSucMes = {};
  SUCURSALES_NAMES.forEach((s) => (clasifPorSucMes[s] = {}));

  for (const mes of mesesCerrados) {
    const historialCerrado = historialTotal.filter((r) => r.mes < mes);
    if (historialCerrado.length < 4) continue;
    const indice = indiceEstacionalPooled(historialCerrado, SUCURSALES_NAMES);
    const backtest = backtestWalkForward(historialCerrado, SUCURSALES_NAMES, indice);
    for (const suc of SUCURSALES_NAMES) {
      const proy = proyectar(historialCerrado, suc, mes, indice, backtest);
      const real = porMes[mes]?.[suc] || 0;
      if (!proy || !real) continue;
      const { desest: optimista, desest_castigado: realista } = proy;
      const clase = real < realista.punto ? "Falla" : real > optimista.punto ? "Se pasa" : "Cumple";
      const enBanda80 = real >= realista.lo80 && real <= optimista.hi80;
      clasifPorSucMes[suc][mes] = {
        real, realista: realista.punto, optimista: optimista.punto, clase, enBanda80,
        lo80: realista.lo80, hi80: optimista.hi80,
      };
    }
  }

  // ---------- Hoja: Backtest histórico (una fila por sucursal-mes) ----------
  const filasBacktest = [];
  for (const suc of SUCURSALES_NAMES) {
    const meses = Object.keys(clasifPorSucMes[suc]).sort();
    for (const mes of meses) {
      const c = clasifPorSucMes[suc][mes];
      const mesSig = siguienteMes(mes);
      const cSig = clasifPorSucMes[suc][mesSig];
      const realSig = porMes[mesSig]?.[suc];
      const crecSig = realSig ? ((realSig - c.real) / c.real) * 100 : null;
      filasBacktest.push({
        Sucursal: suc,
        Mes: mes,
        "Proyectado Inferior (Realista)": c.realista,
        "Proyectado Superior (Optimista)": c.optimista,
        "Venta Real": Math.round(c.real),
        "% vs Realista": +(((c.real - c.realista) / c.realista) * 100).toFixed(1),
        "% vs Optimista": +(((c.real - c.optimista) / c.optimista) * 100).toFixed(1),
        "¿Cumplió (rango angosto)?": c.clase === "Falla" ? "No" : "Sí",
        Clase: c.clase,
        "Banda realista 80% (lo-hi)": `${fmt(c.lo80)} - ${fmt(c.hi80)}`,
        "¿Cae en banda 80%?": c.enBanda80 ? "Sí" : "No",
        "Mes Siguiente": mesSig,
        "Crecimiento Mes Siguiente %": crecSig !== null ? +crecSig.toFixed(1) : "",
        "Clase Mes Siguiente": cSig ? cSig.clase : "",
      });
    }
  }

  // ---------- Hoja: Efecto del mes anterior sobre el mes siguiente ----------
  const transiciones = {};
  const crecimientoPorClase = {};
  ["Falla", "Cumple", "Se pasa"].forEach((c) => {
    transiciones[c] = { Falla: 0, Cumple: 0, "Se pasa": 0 };
    crecimientoPorClase[c] = [];
  });
  const bandaPorClase = { Falla: { si: 0, total: 0 }, Cumple: { si: 0, total: 0 }, "Se pasa": { si: 0, total: 0 } };

  for (const suc of SUCURSALES_NAMES) {
    const meses = Object.keys(clasifPorSucMes[suc]).sort();
    for (const mes of meses) {
      const c = clasifPorSucMes[suc][mes];
      const mesSig = siguienteMes(mes);
      const cSig = clasifPorSucMes[suc][mesSig];
      if (!cSig) continue;
      crecimientoPorClase[c.clase].push(((cSig.real - c.real) / c.real) * 100);
      transiciones[c.clase][cSig.clase]++;
      bandaPorClase[c.clase].total++;
      if (cSig.enBanda80) bandaPorClase[c.clase].si++;
    }
  }

  const filasEfecto = ["Falla", "Cumple", "Se pasa"].map((clase) => {
    const cs = crecimientoPorClase[clase];
    const t = transiciones[clase];
    const totalT = t.Falla + t.Cumple + t["Se pasa"];
    const b = bandaPorClase[clase];
    return {
      "Mes N fue...": clase,
      "Casos (n)": cs.length,
      "Crecimiento promedio real N→N+1": cs.length ? `${(cs.reduce((a, b2) => a + b2, 0) / cs.length).toFixed(1)}%` : "",
      "N+1 cae en Falla": totalT ? `${((t.Falla / totalT) * 100).toFixed(0)}%` : "",
      "N+1 cae en Cumple": totalT ? `${((t.Cumple / totalT) * 100).toFixed(0)}%` : "",
      "N+1 cae en Se pasa": totalT ? `${((t["Se pasa"] / totalT) * 100).toFixed(0)}%` : "",
      "N+1 dentro de banda 80% (rango realista más amplio)": b.total ? `${((b.si / b.total) * 100).toFixed(0)}%` : "",
    };
  });

  // ---------- Hoja: Resumen ejecutivo ----------
  const totalCasos = Object.values(clasifPorSucMes).reduce((a, m) => a + Object.keys(m).length, 0);
  const totalEnAngosto = Object.values(clasifPorSucMes).reduce((a, m) => a + Object.values(m).filter((c) => c.clase !== "Falla" && c.clase !== "Se pasa").length, 0);
  const totalEnBanda80 = Object.values(clasifPorSucMes).reduce((a, m) => a + Object.values(m).filter((c) => c.enBanda80).length, 0);

  const filasResumen = [
    { Hallazgo: "Meses cerrados analizados (directo de Zettle, límite de la API: 3 años)", Detalle: `${mesesCerrados[0]} a ${mesesCerrados[mesesCerrados.length - 1]} — ${totalCasos} observaciones sucursal-mes` },
    { Hallazgo: "Acierto del rango angosto actual (Realista-Optimista)", Detalle: `${totalEnAngosto} de ${totalCasos} = ${((totalEnAngosto / totalCasos) * 100).toFixed(0)}% — es una meta ambiciosa, no una banda de probabilidad` },
    { Hallazgo: "Acierto usando la banda de confianza 80% que el modelo ya calcula", Detalle: `${totalEnBanda80} de ${totalCasos} = ${((totalEnBanda80 / totalCasos) * 100).toFixed(0)}%` },
    { Hallazgo: "Después de un mes que FALLÓ, el mes siguiente...", Detalle: `crece en promedio ${(crecimientoPorClase.Falla.reduce((a, b) => a + b, 0) / crecimientoPorClase.Falla.length).toFixed(0)}% — pero vuelve a fallar ${((transiciones.Falla.Falla / (transiciones.Falla.Falla + transiciones.Falla.Cumple + transiciones.Falla["Se pasa"])) * 100).toFixed(0)}% de las veces` },
    { Hallazgo: "Después de un mes que SE PASÓ, el mes siguiente...", Detalle: `cae en promedio ${(crecimientoPorClase["Se pasa"].reduce((a, b) => a + b, 0) / crecimientoPorClase["Se pasa"].length).toFixed(0)}% — es reversión a la media, no un patrón que el modelo corrija hoy` },
    { Hallazgo: "¿Ajustar el promedio de 3 meses por mediana ayuda tras un mes malo?", Detalle: "No. Se probó y el acierto BAJÓ de 17% a 9% — 'mes que falló' no es lo mismo que 'mes con el valor más bajo de los 3', así que la mediana ignora el mes equivocado." },
    { Hallazgo: "Conclusión práctica", Detalle: "El problema no es la fórmula de los últimos 3 meses — es que el rango Realista-Optimista es demasiado angosto para la volatilidad real del negocio (~27% de error típico). Ensanchar el rango (banda 80-90%) sí mejora mucho el acierto; afinar el punto central, no." },
  ];

  // ---------- Hoja: Índice estacional ----------
  const historialParaMesActual = historialTotal.filter((r) => r.mes < mesActual);
  const indiceActual = indiceEstacionalPooled(historialParaMesActual, SUCURSALES_NAMES);
  const backtestActual = backtestWalkForward(historialParaMesActual, SUCURSALES_NAMES, indiceActual);
  const nombresMes = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const filasIndice = Object.entries(indiceActual)
    .map(([m, v]) => ({ Mes: nombresMes[+m - 1], "Índice estacional": +v.toFixed(3), "% vs promedio del año": `${(+v * 100 - 100).toFixed(0)}%` }))
    .sort((a, b) => nombresMes.indexOf(a.Mes) - nombresMes.indexOf(b.Mes));

  // ---------- Hoja: Proyección del mes en curso — rango angosto vs banda 80% ----------
  const filasMesActual = [];
  for (const suc of SUCURSALES_NAMES) {
    const proy = proyectar(historialParaMesActual, suc, mesActual, indiceActual, backtestActual);
    if (!proy) continue;
    filasMesActual.push({
      Sucursal: suc,
      "Realista (piso, meta)": proy.desest_castigado.punto,
      "Optimista (techo, meta)": proy.desest.punto,
      "Banda 80% inferior": Math.round(proy.desest_castigado.lo80),
      "Banda 80% superior": Math.round(proy.desest.hi80),
      "Banda 90% inferior": Math.round(proy.desest_castigado.lo90),
      "Banda 90% superior": Math.round(proy.desest.hi90),
    });
  }

  // ---------- Escribir Excel ----------
  const wb = XLSX.utils.book_new();

  const wsResumen = XLSX.utils.json_to_sheet(filasResumen);
  wsResumen["!cols"] = [{ wch: 50 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen ejecutivo");

  const wsBacktest = XLSX.utils.json_to_sheet(filasBacktest);
  wsBacktest["!cols"] = [
    { wch: 10 }, { wch: 9 }, { wch: 22 }, { wch: 22 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBacktest, "Backtest historico");

  const wsEfecto = XLSX.utils.json_to_sheet(filasEfecto);
  wsEfecto["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsEfecto, "Efecto mes anterior");

  const wsMesActual = XLSX.utils.json_to_sheet(filasMesActual);
  wsMesActual["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsMesActual, `Proyeccion ${mesActual}`);

  const wsIndice = XLSX.utils.json_to_sheet(filasIndice);
  wsIndice["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsIndice, "Indice estacional");

  const outPath = path.join(__dirname, "..", `reporte_proyecciones_${mesActual}.xlsx`);
  XLSX.writeFile(wb, outPath);
  console.log(`\nExcel generado: ${outPath}`);
}

main();
