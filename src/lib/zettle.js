import { SUPABASE_URL, SUPABASE_KEY, supabase } from "./supabase.js";
import { SUCURSALES_NAMES } from "./constantes.js";

export const ZETTLE_CUENTAS_FIN = [
  { key: "metepec", label: "Metepec" },
  { key: "coapa", label: "Coapa" },
  { key: "valle_polanco", label: "Valle + Polanco" },
  { key: "oriente", label: "Oriente" },
];

// Llama Zettle raw (sin escribir a Supabase) — usado por las vistas de Finanzas
// que necesitan histórico de ventas real, no lo que ya está sincronizado en `tickets`.
export const fetchZettleRaw = async (desde, hasta) => {
  const todas = [];
  for (const cuenta of ZETTLE_CUENTAS_FIN) {
    try {
      const url = `${SUPABASE_URL}/functions/v1/sync-zettle?sucursal=${cuenta.key}&startDate=${desde}&raw=true`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } });
      const json = await res.json();
      if (res.ok && Array.isArray(json)) todas.push(...json.filter((t) => t.fecha >= desde && t.fecha <= hasta));
    } catch {}
  }
  return todas;
};

// Histórico mensual por sucursal desde 2021, cacheado en `ventas_mensuales_cache`.
// Los meses cerrados no cambian, así que se leen de Supabase (rápido); solo el
// mes en curso se calcula en vivo contra Zettle. Los meses cerrados que falten
// en caché (primera vez, o meses nuevos que acaban de cerrar) se traen en vivo
// una sola vez y se guardan para las próximas llamadas.
export const fetchHistorialMensualCacheado = async (sucursales = SUCURSALES_NAMES) => {
  const mesActual = new Date().toISOString().slice(0, 7);
  const finAñoActual = new Date().getFullYear();

  const mesesEsperados = [];
  for (let año = 2021; año <= finAñoActual; año++) {
    for (let m = 1; m <= 12; m++) {
      const mes = `${año}-${String(m).padStart(2, "0")}`;
      if (mes < mesActual) mesesEsperados.push(mes);
    }
  }

  const { data: cache } = await supabase.from("ventas_mensuales_cache").select("mes,sucursal,total");
  const byMes = {};
  (cache || []).forEach((r) => { (byMes[r.mes] ??= {})[r.sucursal] = Number(r.total); });

  const faltantes = mesesEsperados.filter((m) => !sucursales.every((s) => byMes[m]?.[s] !== undefined));
  if (faltantes.length) {
    const desde = `${faltantes[0]}-01`;
    const [añoHasta, mesHasta] = faltantes[faltantes.length - 1].split("-").map(Number);
    const hasta = new Date(añoHasta, mesHasta, 0).toISOString().slice(0, 10);
    const fetchedPorAño = [];
    for (let año = Number(desde.slice(0, 4)); año <= Number(hasta.slice(0, 4)); año++) {
      const d = año === Number(desde.slice(0, 4)) ? desde : `${año}-01-01`;
      const h = año === Number(hasta.slice(0, 4)) ? hasta : `${año}-12-31`;
      fetchedPorAño.push(...await fetchZettleRaw(d, h));
    }
    const nuevosPorMes = {};
    faltantes.forEach((m) => { nuevosPorMes[m] = {}; sucursales.forEach((s) => { nuevosPorMes[m][s] = 0; }); });
    fetchedPorAño.forEach((t) => { const m = t.fecha.slice(0, 7); if (nuevosPorMes[m] && nuevosPorMes[m][t.sucursal] !== undefined) nuevosPorMes[m][t.sucursal] += Number(t.total); });

    const filasCache = [];
    faltantes.forEach((m) => { sucursales.forEach((s) => { byMes[m] = byMes[m] || {}; byMes[m][s] = nuevosPorMes[m][s]; filasCache.push({ mes: m, sucursal: s, total: nuevosPorMes[m][s] }); }); });
    if (filasCache.length) await supabase.from("ventas_mensuales_cache").upsert(filasCache, { onConflict: "mes,sucursal" });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const actual = await fetchZettleRaw(`${mesActual}-01`, hoy);
  const rowActual = { mes: mesActual };
  sucursales.forEach((s) => { rowActual[s] = 0; });
  actual.forEach((t) => { if (rowActual[t.sucursal] !== undefined) rowActual[t.sucursal] += Number(t.total); });

  return [...mesesEsperados.map((m) => ({ mes: m, ...byMes[m] })), rowActual];
};
