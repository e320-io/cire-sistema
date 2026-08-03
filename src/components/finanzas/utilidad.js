// Gasto real vs. gasto de referencia por (sucursal, mes) — compartido entre
// MesAMes y ResumenFinanciero para que nunca muestren utilidades distintas
// del mismo mes.

export const ADS_ESTIMADO = { min: 12000, max: 15000, punto: 13500 };

// Un (periodo, sucursal) cuenta como captura real si tiene renta Y nómina
// capturadas — fuera de esos meses solo quedan restos de gastos recurrentes
// sueltos, insuficientes para calcular una utilidad confiable.
export function gastoPorPeriodoSuc(gastos) {
  const m = {};
  gastos.forEach((g) => {
    const key = `${g.sucursal_id}|${g.periodo}`;
    if (!m[key]) m[key] = { recurrente: 0, unico: 0, tieneRenta: false, tieneNomina: false };
    const monto = Number(g.monto) || 0;
    if (g.tipo === "unico") m[key].unico += monto; else m[key].recurrente += monto;
    if (g.categoria === "renta" && monto > 0) m[key].tieneRenta = true;
    if (g.categoria === "nomina" && monto > 0) m[key].tieneNomina = true;
  });
  return m;
}

export function periodosReales(mapaGasto, sucursales) {
  const m = {};
  sucursales.forEach((suc) => { m[suc] = []; });
  Object.entries(mapaGasto).forEach(([key, v]) => {
    const [suc, per] = key.split("|");
    if (v.tieneRenta && v.tieneNomina && m[suc]) m[suc].push(per);
  });
  Object.values(m).forEach((arr) => arr.sort());
  return m;
}

// Para un mes sin captura completa, usa como referencia el mes real más
// cercano (el anterior más reciente; si no hay ninguno anterior, el
// siguiente más próximo).
export function refPeriodo(mapaPeriodosReales, suc, per) {
  const reales = mapaPeriodosReales[suc] || [];
  if (!reales.length) return null;
  if (reales.includes(per)) return per;
  const anteriores = reales.filter((r) => r <= per);
  if (anteriores.length) return anteriores[anteriores.length - 1];
  return reales[0];
}

export function gastoDe(mapaGasto, suc, perRef, incluirUnicos) {
  if (!perRef) return 0;
  const g = mapaGasto[`${suc}|${perRef}`];
  if (!g) return 0;
  return g.recurrente + (incluirUnicos ? g.unico : 0);
}

export function marginBand(pct) {
  if (pct == null) return { label: "—", key: "sin_datos" };
  if (pct >= 20) return { label: "Sano", key: "sano" };
  if (pct >= 5) return { label: "Ajustado", key: "ajustado" };
  return { label: "En riesgo", key: "riesgo" };
}
