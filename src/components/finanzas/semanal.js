// Reparto de la venta del mes por semana calendario (días 1-7, 8-14, 15-21,
// 22-28, 29+), agrupando sucursales — mismo criterio que el índice estacional
// de forecast.js: una sucursal sola es ruido, agrupadas el patrón es estable.
// Sirve para bajar una proyección mensual a metas semanales.

export function bucketSemana(dia) {
  if (dia <= 7) return 1;
  if (dia <= 14) return 2;
  if (dia <= 21) return 3;
  if (dia <= 28) return 4;
  return 5;
}

// tickets: [{fecha:"YYYY-MM-DD", sucursal, total}], mesesRef: ["YYYY-MM", ...] meses cerrados a promediar.
// Devuelve [{semana, pct}] (1..5), pct sobre 100, normalizado.
export function distribucionSemanalPooled(tickets, sucursales, mesesRef) {
  const porMesSuc = {};
  tickets.forEach((t) => {
    const mes = (t.fecha || "").slice(0, 7);
    if (!mesesRef.includes(mes) || !sucursales.includes(t.sucursal)) return;
    const key = `${mes}|${t.sucursal}`;
    if (!porMesSuc[key]) porMesSuc[key] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 };
    const dia = parseInt(t.fecha.slice(8, 10), 10);
    const monto = Number(t.total) || 0;
    porMesSuc[key][bucketSemana(dia)] += monto;
    porMesSuc[key].total += monto;
  });

  const pctsPorSemana = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  Object.values(porMesSuc).forEach((row) => {
    if (row.total <= 0) return;
    [1, 2, 3, 4, 5].forEach((s) => pctsPorSemana[s].push(row[s] / row.total));
  });

  const promedio = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const bruto = [1, 2, 3, 4, 5].map((s) => ({ semana: s, pct: promedio(pctsPorSemana[s]) }));
  const sumaBruta = bruto.reduce((a, b) => a + b.pct, 0);
  return bruto.map((b) => ({ semana: b.semana, pct: sumaBruta > 0 ? (b.pct / sumaBruta) * 100 : 0 }));
}

export function diasEnMes(mesYYYYMM) {
  const [y, m] = mesYYYYMM.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function mesAnioAnterior(mesYYYYMM) {
  const [y, m] = mesYYYYMM.split("-");
  return `${Number(y) - 1}-${m}`;
}

// Venta real de una sucursal en un mes específico, repartida por semana calendario.
export function ventasPorSemanaSuc(tickets, suc, mes) {
  const porSemana = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  tickets.forEach((t) => {
    if ((t.fecha || "").slice(0, 7) !== mes || t.sucursal !== suc) return;
    const dia = parseInt(t.fecha.slice(8, 10), 10);
    porSemana[bucketSemana(dia)] += Number(t.total) || 0;
  });
  return porSemana;
}

// Del 100% de venta de un mes específico (de una sucursal), qué % cayó en cada
// semana calendario. Devuelve [{semana, pct}] o null si ese mes no tiene ventas.
export function distribucionSemanalMes(tickets, suc, mes) {
  const porSemana = ventasPorSemanaSuc(tickets, suc, mes);
  const total = Object.values(porSemana).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return [1, 2, 3, 4, 5].map((s) => ({ semana: s, pct: (porSemana[s] / total) * 100 }));
}
