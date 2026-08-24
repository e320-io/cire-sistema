// Gasto real vs. gasto de referencia por (sucursal, mes) — compartido entre
// MesAMes y ResumenFinanciero para que nunca muestren utilidades distintas
// del mismo mes.

export const ADS_ESTIMADO = { min: 12000, max: 15000, punto: 13500 };

// Por (sucursal, categoría) guarda el monto recurrente capturado en cada
// periodo en que esa categoría se registró. Los gastos "único" (extraordinarios)
// se guardan aparte — no forman parte de la base recurrente del margen.
export function gastoPorSucCategoria(gastos) {
  const m = {};
  gastos.forEach((g) => {
    if (g.tipo === "unico") return;
    const key = `${g.sucursal_id}|${g.categoria}`;
    if (!m[key]) m[key] = {};
    m[key][g.periodo] = (m[key][g.periodo] || 0) + (Number(g.monto) || 0);
  });
  return m;
}

export function gastoUnicoPorSucPeriodo(gastos) {
  const m = {};
  gastos.forEach((g) => {
    if (g.tipo !== "unico") return;
    const key = `${g.sucursal_id}|${g.periodo}`;
    m[key] = (m[key] || 0) + (Number(g.monto) || 0);
  });
  return m;
}

// El periodo capturado más cercano a `per`: el mismo si existe, si no el
// anterior más reciente, y si tampoco hay uno anterior, el más antiguo
// disponible (para no dejar en $0 una categoría que solo se capturó después).
function periodoMasCercano(periodosOrdenados, per) {
  if (!periodosOrdenados.length) return null;
  if (periodosOrdenados.includes(per)) return per;
  const anteriores = periodosOrdenados.filter((p) => p <= per);
  return anteriores.length ? anteriores[anteriores.length - 1] : periodosOrdenados[0];
}

// Gasto recurrente base de una sucursal para un mes dado: cada categoría toma,
// de forma independiente, el monto capturado en el periodo más reciente que
// tenga hasta ese mes. Antes esto exigía que TODO un mes tuviera renta y nómina
// capturadas a la vez para contar como "real" — si faltaba una sola categoría
// ese mes, se descartaba el mes completo y hasta categorías que sí se seguían
// actualizando (servicios, luz, internet…) quedaban congeladas en un mes viejo.
// Ahora cada categoría avanza con su propio historial de captura.
// `esReferencia` se marca cuando alguna categoría tuvo que tomar un mes anterior
// al pedido por no tener captura propia ese mismo mes.
export function gastoBaseDe(mapaSucCategoria, mapaUnicoSucPeriodo, suc, mes, incluirUnicos) {
  let total = 0;
  let esReferencia = false;
  Object.keys(mapaSucCategoria).forEach((key) => {
    const [s] = key.split("|");
    if (s !== suc) return;
    const periodos = Object.keys(mapaSucCategoria[key]).sort();
    const per = periodoMasCercano(periodos, mes);
    if (per == null) return;
    total += mapaSucCategoria[key][per];
    if (per !== mes) esReferencia = true;
  });
  if (incluirUnicos) total += mapaUnicoSucPeriodo[`${suc}|${mes}`] || 0;
  return { total, esReferencia };
}

export function marginBand(pct) {
  if (pct == null) return { label: "—", key: "sin_datos" };
  if (pct >= 20) return { label: "Sano", key: "sano" };
  if (pct >= 5) return { label: "Ajustado", key: "ajustado" };
  return { label: "En riesgo", key: "riesgo" };
}
