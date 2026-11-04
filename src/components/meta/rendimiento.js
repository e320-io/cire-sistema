import { META_TOKEN, META_ACCOUNT } from "../../lib/supabase.js";

const API = "https://graph.facebook.com/v19.0";
const ACCIONES_MENSAJE = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];

export const SUCURSALES = ["Valle", "Coapa", "Polanco", "Oriente", "Metepec"];
export const BIKINI_MULTI = "Valle + Polanco + Coapa";
const TRES = "Valle + Polanco + Coapa (todas)"; // campañas sin sucursal en la cuenta compartida: tercios, conservando el servicio
const SUC_BIKINI_MULTI = ["Valle", "Coapa", "Polanco"];
export const REGLAS = { minGasto: 100, bajo: 0.8, alto: 1.5 };

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Cuentas publicitarias. VITE_META_ACCOUNTS="id:Nombre,id:Nombre" las sobreescribe; por defecto, la cuenta de siempre.
export const CUENTAS = (() => {
  const raw = import.meta.env.VITE_META_ACCOUNTS;
  if (raw) {
    return raw.split(",").map((p) => {
      const [id, ...n] = p.trim().split(":");
      const nombre = n.join(":").trim() || id;
      return { id: id.replace(/^act_/, ""), nombre, sucursal: ["Oriente", "Metepec"].find((s) => sinAcentos(nombre) === sinAcentos(s)) || null };
    });
  }
  return META_ACCOUNT ? [{ id: META_ACCOUNT, nombre: "Valle · Polanco · Coapa", sucursal: null }] : [];
})();


/** Sucursal y servicio a partir del nombre del anuncio ("Sucursal | Servicio o CC-n | Título"), con respaldo en conjunto y campaña. */
export function clasificar(nombre, conjunto = "", campana = "") {
  const p = String(nombre).split("|").map((s) => s.trim());
  const n = sinAcentos(nombre);
  const contexto = sinAcentos(`${conjunto} ${campana}`);
  const sucDe = (t) => SUCURSALES.find((s) => sinAcentos(t).includes(sinAcentos(s)));

  let servicio = "Otro";
  if (n.includes("bikini") || /(^|[\s_|-])bf[\s_-]?\d/.test(n)) servicio = "Bikini";
  else if (n.includes("hifu")) servicio = "HIFU 4D";
  else if (n.includes("facial")) servicio = "Facial";
  else if (n.includes("moldeo") || n.includes("drenaje")) servicio = "Moldeo (drenaje)";
  else if (/(^|[\s_|-])(sop|cc|laser|depil)/.test(n) || /_cc_/.test(n)) servicio = "Láser CC";

  let sucursal = sucDe(p[0]);
  if (!sucursal) sucursal = sucDe(p[1] || "");
  if (servicio === "Bikini" && !sucursal) sucursal = BIKINI_MULTI;
  if (servicio === "Bikini" && sucursal && !["Oriente", "Metepec"].includes(sucursal)) sucursal = BIKINI_MULTI;
  if (!sucursal) {
    if (contexto.includes("axila gratis") || contexto.includes("5 sucursales")) sucursal = "Todas";
    else sucursal = sucDe(contexto) || "Sin asignar";
  }
  return { sucursal, servicio };
}

/** Anuncios con gasto del periodo, de una cuenta. Devuelve { filas, error }. */
export async function anunciosDeCuenta(cuenta, since, until) {
  const params = new URLSearchParams({
    level: "ad",
    fields: "ad_id,ad_name,adset_name,campaign_name,spend,impressions,actions",
    time_range: JSON.stringify({ since, until }),
    filtering: JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]),
    limit: "200",
    access_token: META_TOKEN,
  });
  let url = `${API}/act_${cuenta.id}/insights?${params}`;
  const filas = [];
  try {
    while (url) {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) return { filas, error: json.error.message };
      for (const r of json.data || []) {
        const acc = (r.actions || []).find((a) => ACCIONES_MENSAJE.includes(a.action_type));
        let { sucursal, servicio } = clasificar(r.ad_name, r.adset_name, r.campaign_name);
        // Cada sucursal con cuenta propia cobra todo ahí; en la compartida, lo que no dice sucursal va en tercios
        if (cuenta.sucursal) sucursal = cuenta.sucursal;
        else if (sucursal === "Todas" || sucursal === "Sin asignar") sucursal = TRES;
        filas.push({
          cuenta: cuenta.nombre, adId: String(r.ad_id), anuncio: r.ad_name, conjunto: r.adset_name, campana: r.campaign_name,
          gasto: Number(r.spend || 0), impresiones: Number(r.impressions || 0), mensajes: Number(acc?.value || 0),
          sucursal, servicio,
        });
      }
      url = json.paging?.next;
    }
  } catch (e) {
    return { filas, error: "Sin conexión con Meta." };
  }
  return { filas, error: "" };
}

/** Veredicto por anuncio contra el costo por mensaje promedio. */
export function conVeredicto(ads, reglas = REGLAS) {
  const gasto = ads.reduce((s, a) => s + a.gasto, 0);
  const mensajes = ads.reduce((s, a) => s + a.mensajes, 0);
  const promedio = mensajes > 0 ? gasto / mensajes : null;
  return ads.map((a) => {
    const costo = a.mensajes > 0 ? a.gasto / a.mensajes : null;
    let veredicto = "Pocos datos";
    if (promedio != null && a.gasto >= reglas.minGasto) {
      if (a.mensajes === 0 || costo >= promedio * reglas.alto) veredicto = "Replantear";
      else if (costo <= promedio * reglas.bajo) veredicto = "Escalar";
      else veredicto = "Mantener";
    }
    return { ...a, costoMensaje: costo, veredicto };
  });
}

/** Bikini compartido (Valle+Polanco+Coapa) y campañas "Todas": se reparten en partes iguales. Servicio "Bikini*" = aproximado. */
export function repartir(ads) {
  return ads.flatMap((a) => {
    if (a.sucursal === BIKINI_MULTI) return SUC_BIKINI_MULTI.map((s) => ({ ...a, sucursal: s, servicio: "Bikini*", gasto: a.gasto / 3, mensajes: a.mensajes / 3 }));
    if (a.sucursal === TRES) return SUC_BIKINI_MULTI.map((s) => ({ ...a, sucursal: s, gasto: a.gasto / 3, mensajes: a.mensajes / 3 }));
    if (a.sucursal === "Todas") return SUCURSALES.map((s) => ({ ...a, sucursal: s, gasto: a.gasto / 5, mensajes: a.mensajes / 5 }));
    return [a];
  });
}

function agrupar(filas, clave, etiqueta) {
  const m = new Map();
  for (const a of filas) {
    const k = clave(a);
    const f = m.get(k) || { ...etiqueta(a), gasto: 0, mensajes: 0, anuncios: 0 };
    f.gasto += a.gasto; f.mensajes += a.mensajes; f.anuncios += 1;
    m.set(k, f);
  }
  return [...m.values()]
    .map((f) => ({ ...f, costoMensaje: f.mensajes > 0 ? f.gasto / f.mensajes : null }))
    .sort((a, b) => b.gasto - a.gasto);
}

export const porCuenta = (ads) => agrupar(ads, (a) => a.cuenta, (a) => ({ cuenta: a.cuenta }));
export const porServicio = (ads) => agrupar(ads, (a) => a.servicio, (a) => ({ servicio: a.servicio }));
export const porSucursal = (ads) => agrupar(repartir(ads), (a) => a.sucursal, (a) => ({ sucursal: a.sucursal }));
export const porSucursalServicio = (ads) => agrupar(repartir(ads), (a) => `${a.sucursal}·${a.servicio}`, (a) => ({ sucursal: a.sucursal, servicio: a.servicio }));

export function totales(ads) {
  const gasto = ads.reduce((s, a) => s + a.gasto, 0);
  const mensajes = ads.reduce((s, a) => s + a.mensajes, 0);
  const cand = porServicio(ads).filter((f) => f.gasto >= 100 && f.mensajes > 0).sort((a, b) => a.costoMensaje - b.costoMensaje);
  return {
    gasto, mensajes, costoMensaje: mensajes > 0 ? gasto / mensajes : null, anuncios: ads.length,
    impresiones: ads.reduce((s, a) => s + a.impresiones, 0),
    mejor: cand[0] || null, peor: cand.length > 1 ? cand[cand.length - 1] : null,
  };
}

export const ESTADOS_VENTA = { pendiente: "Pendiente", liquidada: "Liquidada", no_vino: "No vino" };
/** Lo que se espera cobrar de una venta: el precio completo, salvo que no haya venido (se queda el anticipo). */
export const esperadoVenta = (v) => (v.estado === "no_vino" ? Number(v.monto) : Number(v.precio_total ?? v.monto));

/** Mensajes y gasto por hora de un día, de una cuenta (hora del anunciante). Devuelve { filas: [{hora, sucursal, gasto, mensajes}], error }. */
export async function mensajesPorHora(cuenta, dia) {
  const params = new URLSearchParams({
    level: "ad",
    fields: "ad_name,adset_name,campaign_name,spend,actions",
    breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
    time_range: JSON.stringify({ since: dia, until: dia }),
    limit: "500",
    access_token: META_TOKEN,
  });
  let url = `${API}/act_${cuenta.id}/insights?${params}`;
  const crudas = [];
  try {
    while (url) {
      const json = await (await fetch(url)).json();
      if (json.error) return { filas: [], error: json.error.message };
      for (const r of json.data || []) {
        const acc = (r.actions || []).find((a) => ACCIONES_MENSAJE.includes(a.action_type));
        let { sucursal, servicio } = clasificar(r.ad_name, r.adset_name, r.campaign_name);
        if (cuenta.sucursal) sucursal = cuenta.sucursal;
        else if (sucursal === "Todas" || sucursal === "Sin asignar") sucursal = TRES;
        crudas.push({ hora: parseInt(r.hourly_stats_aggregated_by_advertiser_time_zone, 10), sucursal, servicio, gasto: Number(r.spend || 0), mensajes: Number(acc?.value || 0), impresiones: 0, anuncio: r.ad_name });
      }
      url = json.paging?.next;
    }
  } catch (e) {
    return { filas: [], error: "Sin conexión con Meta." };
  }
  return { filas: repartir(crudas), error: "" };
}
