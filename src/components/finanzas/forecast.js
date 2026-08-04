// Proyección de ventas por sucursal — método estadístico, sin IA.
//
// Idea central: por sucursal sola la estacionalidad es puro ruido (con ~3 años de
// historia y mucha variación propia, un criterio de selección de modelo como AICc
// rechaza un ajuste estacional individual). Pero al agrupar las sucursales aparece
// un patrón de temporada consistente y fuerte (mayo dispara por Día de las Madres,
// septiembre es el valle del año). Ese patrón compartido + el nivel reciente de
// cada sucursal es la base de la proyección. El error se mide con backtesting real
// (walk-forward), no con una fórmula teórica.
//
// `historial` es un arreglo de filas {mes:"YYYY-MM", [sucursal]: venta, ...}, el
// mismo formato que ya usa EstadoFinanciero (historialCompleto/historialVentas).

const mesNum = (mes) => parseInt(mes.slice(5, 7), 10);

function serieSucursal(historial, suc) {
  return historial
    .filter((r) => (r[suc] || 0) > 0)
    .map((r) => ({ mes: r.mes, venta: r[suc] }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

// Excluye el primer mes con datos de cada sucursal: suele ser un mes de
// arranque/onboarding en Zettle con un salto anómalo al segundo mes, no
// temporada baja real.
function serieSinOnboarding(historial, suc) {
  const serie = serieSucursal(historial, suc);
  return serie.length > 1 ? serie.slice(1) : serie;
}

export function indiceEstacionalPooled(historial, sucursales) {
  const ratiosPorMes = Array.from({ length: 12 }, () => []);
  sucursales.forEach((suc) => {
    const serie = serieSinOnboarding(historial, suc);
    if (serie.length < 3) return;
    const media = serie.reduce((a, b) => a + b.venta, 0) / serie.length;
    if (media <= 0) return;
    serie.forEach((r) => {
      ratiosPorMes[mesNum(r.mes) - 1].push(r.venta / media);
    });
  });
  const bruto = ratiosPorMes.map((rs) => (rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1));
  // Normalizar para que el promedio de los 12 índices sea 1.
  const media12 = bruto.reduce((a, b) => a + b, 0) / 12;
  const indice = {};
  bruto.forEach((v, i) => { indice[i + 1] = media12 > 0 ? v / media12 : 1; });
  return indice;
}

function percentil(valoresOrdenados, p) {
  if (!valoresOrdenados.length) return 0;
  const idx = (valoresOrdenados.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return valoresOrdenados[lo];
  return valoresOrdenados[lo] + (valoresOrdenados[hi] - valoresOrdenados[lo]) * (idx - lo);
}

// Walk-forward: para cada sucursal-mes (a partir de tener 3 meses previos),
// predice con el nivel de esos 3 meses × el índice estacional ya calculado
// sobre todo el historial, y compara contra lo real. De ahí salen MAPE, sesgo
// y los cuantiles empíricos de error que alimentan las bandas de confianza.
export function backtestWalkForward(historial, sucursales, indice) {
  const errores = [];
  sucursales.forEach((suc) => {
    const serie = serieSinOnboarding(historial, suc);
    for (let i = 3; i < serie.length; i++) {
      const train = serie.slice(i - 3, i);
      const nivel = train.reduce((a, r) => a + r.venta / (indice[mesNum(r.mes)] || 1), 0) / train.length;
      const obj = serie[i];
      const pred = nivel * (indice[mesNum(obj.mes)] || 1);
      if (obj.venta > 0) errores.push((pred - obj.venta) / obj.venta);
    }
  });
  if (!errores.length) return { mape: null, sesgo: 0, n: 0, p05: 0, p10: 0, p90: 0, p95: 0 };
  const abs = errores.map(Math.abs).sort((a, b) => a - b);
  const ordenados = [...errores].sort((a, b) => a - b);
  const sesgo = errores.reduce((a, b) => a + b, 0) / errores.length;
  const mape = (abs.reduce((a, b) => a + b, 0) / abs.length) * 100;
  return {
    mape: +mape.toFixed(1),
    sesgo: +sesgo.toFixed(3),
    n: errores.length,
    p05: percentil(ordenados, 0.05),
    p10: percentil(ordenados, 0.10),
    p90: percentil(ordenados, 0.90),
    p95: percentil(ordenados, 0.95),
  };
}

// Proyecta una sucursal al mes objetivo con las 3 bases del análisis original:
// - prom3m: promedio crudo de los últimos 3 meses (dato ya ocurrido, sin ajuste)
// - desest: nivel desestacionalizado de esos 3 meses, reestacionalizado al mes objetivo
// - desest_castigado: lo mismo, corrigiendo el sesgo de sobreestimación medido en el backtest
export function proyectar(historial, suc, mesObjetivo, indice, backtest) {
  const serie = serieSucursal(historial, suc);
  const ultimos3 = serie.slice(-3);
  if (!ultimos3.length) return null;
  const mnObj = mesNum(mesObjetivo);
  const idxObj = indice[mnObj] || 1;

  const prom3m = {
    punto: Math.round(ultimos3.reduce((a, r) => a + r.venta, 0) / ultimos3.length),
    min: Math.min(...ultimos3.map((r) => r.venta)),
    max: Math.max(...ultimos3.map((r) => r.venta)),
    meses: ultimos3.map((r) => r.mes),
  };

  const nivel = ultimos3.reduce((a, r) => a + r.venta / (indice[mesNum(r.mes)] || 1), 0) / ultimos3.length;
  const desestPunto = Math.round(nivel * idxObj);
  const factorCorr = 1 / (1 + (backtest.sesgo || 0));
  const castigadoPunto = Math.round(desestPunto * factorCorr);

  const banda = (punto) => ({
    lo80: Math.round(punto * (1 + backtest.p10)),
    hi80: Math.round(punto * (1 + backtest.p90)),
    lo90: Math.round(punto * (1 + backtest.p05)),
    hi90: Math.round(punto * (1 + backtest.p95)),
  });

  return {
    sucursal: suc,
    prom3m,
    desest: { punto: desestPunto, ...banda(desestPunto) },
    desest_castigado: { punto: castigadoPunto, ...banda(castigadoPunto) },
    mesesUsados: ultimos3.map((r) => r.mes),
  };
}

export const BASES_CALCULO = [
  { k: "prom3m", l: "Promedio 3 meses (crudo)" },
  { k: "desest", l: "Optimista" },
  { k: "desest_castigado", l: "Realista" },
];

export function siguienteMes(periodo) {
  const [y, m] = periodo.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
