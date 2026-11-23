// Arma todo lo que lleva el cierre diario del día `dia`: datos de la tarjeta (mensajes de Meta) y variables de cada plantilla (ventas de Zettle).
// Sin dependencias de Deno ni de Node: solo fetch e Intl. Lo usan la función cierre-diario y el script de prueba local.
import { leerDiario, armarResumen, parseCuentas } from "./resumen-mensajes.js";

const SUCURSALES_VENTAS = ["Valle", "Polanco", "Oriente", "Metepec", "Coapa"];
const CUENTAS_ZETTLE = ["coapa", "metepec", "valle_polanco", "oriente"];
const VP = ["Valle", "Polanco", "Oriente", "Metepec"]; // lo que ve la versión de Jaz ("vpom")
const fmt = (n) => Math.round(n).toLocaleString("es-MX");
const cpm = (g, m) => (m > 0 ? (g / m < 10 ? `$${(g / m).toFixed(1)}` : `$${Math.round(g / m)}`) : "—");

export const cdmx = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
export const ayerCdmx = () => cdmx(new Date(Date.now() - 864e5));

const sumarDias = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

// Agrupa las filas por anuncio en filas por día, sucursal y servicio
function porDia(filas) {
  const m = new Map();
  for (const f of filas) {
    const k = `${f.fecha}|${f.sucursal}|${f.servicio}`;
    const a = m.get(k) || { dia: f.fecha, sucursal: f.sucursal, servicio: f.servicio, gasto: 0, mensajes: 0 };
    a.gasto += f.gasto; a.mensajes += f.mensajes; m.set(k, a);
  }
  return [...m.values()];
}
const restFn = ({ supabaseUrl, supabaseKey }) => (path, init = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
  ...init, headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
});
async function guardarCache(cfg, filas) {
  const rows = porDia(filas);
  for (let i = 0; i < rows.length; i += 500) {
    const r = await restFn(cfg)("cierre_dias?on_conflict=dia,sucursal,servicio", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows.slice(i, i + 500).map((x) => ({ ...x, actualizado_en: new Date().toISOString() }))) });
    if (!r.ok) throw new Error(`No se pudo guardar la caché: ${(await r.text()).slice(0, 160)}`);
  }
  return rows.length;
}
/** Llena la caché con un rango de días (para arrancar o reparar). */
export async function llenarCache(cfg, desde, hasta) {
  const d = await leerDiario(parseCuentas(cfg.cuentasRaw), cfg.metaToken, desde, hasta);
  return { desde, hasta, filas: await guardarCache(cfg, d.filas) };
}

/**
 * cfg: { metaToken, cuentasRaw, supabaseUrl, supabaseKey }.
 * Devuelve { dia, D, vars, ventas } donde D es la entrada de tarjetaCierre y vars[version] las variables del cuerpo de la plantilla.
 */
export async function armarCierre({ metaToken, cuentasRaw, supabaseUrl, supabaseKey }, dia = ayerCdmx(), hoy = cdmx()) {
  const mesIni = `${dia.slice(0, 7)}-01`;
  const hace14 = new Date(new Date(dia + "T12:00:00Z").getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const since = hace14 < mesIni ? hace14 : mesIni;
  const cfg = { metaToken, cuentasRaw, supabaseUrl, supabaseKey };
  const t0 = Date.now(); const tiemposDatos = {}; const errores = [];
  // A Meta solo se le piden los últimos 3 días (siguen sumando mensajes por la atribución a 7 días); lo anterior sale de la caché
  const desdeReciente = sumarDias(dia, -2);
  const reciente = await leerDiario(parseCuentas(cuentasRaw), metaToken, desdeReciente, dia);
  await guardarCache(cfg, reciente.filas);
  const hr = await restFn(cfg)(`cierre_dias?select=dia,sucursal,servicio,gasto,mensajes&dia=gte.${since}&dia=lt.${desdeReciente}&limit=10000`);
  const hj = await hr.json();
  const hist = Array.isArray(hj) ? hj.map((x) => ({ fecha: x.dia, sucursal: x.sucursal, servicio: x.servicio, gasto: Number(x.gasto), mensajes: Number(x.mensajes) })) : [];
  if (!hist.length && desdeReciente > mesIni) errores.push("La caché de días anteriores está vacía: los promedios del mes salen incompletos (usar modo=cache para llenarla)");
  const r = armarResumen({ filas: [...hist, ...reciente.filas], crudas: [] }, dia);
  tiemposDatos.meta_ms = Date.now() - t0;

  // Ventas de Zettle por sucursal (ayer y acumulado del mes)
  const ventas = Object.fromEntries(SUCURSALES_VENTAS.map((s) => [s, { ayer: 0, mes: 0, anAyer: 0, anMes: 0 }]));
  await Promise.all(CUENTAS_ZETTLE.map(async (cuenta) => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-zettle?sucursal=${cuenta}&startDate=${mesIni}&raw=true`, { headers: { Authorization: `Bearer ${supabaseKey}` } });
      const j = await res.json();
      if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 120));
      for (const t of j) {
        if (t.fecha < mesIni || t.fecha > dia || !ventas[t.sucursal]) continue;
        const m = Number(t.total || 0); ventas[t.sucursal].mes += m; if (t.fecha === dia) ventas[t.sucursal].ayer += m;
      }
    } catch (e) { errores.push(`Zettle ${cuenta}: ${e.message}`); }
  }));
  tiemposDatos.zettle_ms = Date.now() - t0 - tiemposDatos.meta_ms;
  // Ventas capturadas con el botón de anuncios ("de los cuales ... fue de anuncios")
  try {
    const ra = await fetch(`${supabaseUrl}/rest/v1/ventas_anuncios?select=sucursal,fecha,monto&fecha=gte.${mesIni}&fecha=lte.${dia}`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    const va = await ra.json();
    if (Array.isArray(va)) for (const v of va) { const x = ventas[v.sucursal]; if (!x) continue; x.anMes += Number(v.monto); if (v.fecha === dia) x.anAyer += Number(v.monto); }
  } catch (e) { errores.push(`ventas_anuncios: ${e.message}`); }

  const tot = r.total;
  const f = (opts) => new Date(dia + "T12:00:00").toLocaleDateString("es-MX", opts);
  const hoyDow = new Date(hoy + "T12:00:00").getDay();
  const D = {
    fecha: f({ weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""),
    total: Math.round(tot.mensajes), vsProm: r.vsPromTot, meta: r.meta, mes: Math.round(tot.mes), ideal: Math.round(r.esperado), cierre: tot.cierre,
    mesNombre: f({ month: "long" }), tema: (hoyDow + 6) % 7, // el fondo lo decide el día de envío (lunes = 0)
    sucs: r.sucursales.map((s) => ({ n: s.sucursal, m: Math.round(s.mensajes), d: s.vsProm ?? 0, v: Object.fromEntries(s.servicios.filter((x) => x.mensajes > 0).map((x) => [x.servicio, [Math.round(x.mensajes), x.gasto / x.mensajes]])) })),
  };

  // Una variable por renglón: WhatsApp no deja saltos de línea dentro de una variable
  const linea = (s) => {
    const v = ventas[s];
    const nota = v.anAyer || v.anMes ? ` · *De los cuales ${v.anAyer ? "$" + fmt(v.anAyer) + " ayer" : ""}${v.anAyer && v.anMes ? " y " : ""}${v.anMes ? "$" + fmt(v.anMes) + " en el mes" : ""} fue de anuncios` : "";
    return `${s}: ${v.ayer ? "$" + fmt(v.ayer) : "—"} · $${fmt(v.mes)}${nota}`;
  };
  const fechaLarga = f({ weekday: "long", day: "numeric", month: "long" });
  const resumenLinea = `${fmt(tot.mensajes)} mensajes · $${fmt(tot.gasto)} invertidos · ${cpm(tot.gasto, tot.mensajes)} por mensaje`;
  const totVp = { ay: VP.reduce((a, s) => a + ventas[s].ayer, 0), mes: VP.reduce((a, s) => a + ventas[s].mes, 0) };
  const TODAS = [...VP, "Coapa"]; // versión de Jaz: las 5 sucursales
  const totTodas = { ay: TODAS.reduce((a, s) => a + ventas[s].ayer, 0), mes: TODAS.reduce((a, s) => a + ventas[s].mes, 0) };
  const vars = {
    todas: [fechaLarga, resumenLinea, ...TODAS.map(linea), `Total: ${totTodas.ay ? "$" + fmt(totTodas.ay) : "—"} · $${fmt(totTodas.mes)}`],
    vpom: [fechaLarga, resumenLinea, ...VP.map(linea), `Total: ${totVp.ay ? "$" + fmt(totVp.ay) : "—"} · $${fmt(totVp.mes)}`],
    coapa: [fechaLarga, resumenLinea, linea("Coapa")],
    oriente: [fechaLarga, resumenLinea, linea("Oriente")],
  };
  return { dia, D, vars, ventas, errores, tiemposDatos };
}
