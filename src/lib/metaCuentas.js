import { META_TOKEN, META_ACCOUNT } from "./supabase.js";

// Desde noviembre 2026 cada sucursal tiene su propia cuenta publicitaria (Oriente, Metepec) o comparte la
// de Valle · Polanco · Coapa. Antes de esa fecha todo vive en META_ACCOUNT y se reparte por nombre de adset.
export const MULTI_DESDE = "2026-11-01";
const API = "https://graph.facebook.com/v19.0";
const FIELDS = "campaign_name,adset_name,adset_id,spend,actions,impressions,clicks,reach";
const SUC_CDMX = ["Valle", "Coapa", "Polanco"];
const sin = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// VITE_META_ACCOUNTS="id:Nombre,id:Nombre". Si el nombre es una sucursal (Oriente/Metepec), todo su gasto es de ella.
export const CUENTAS_META = (() => {
  const raw = import.meta.env.VITE_META_ACCOUNTS || "";
  const l = raw.split(",").filter(Boolean).map((p) => {
    const [id, ...n] = p.trim().split(":");
    const nombre = n.join(":").trim() || id;
    const suc = ["Oriente", "Metepec"].find((s) => sin(nombre) === sin(s)) || null;
    return { id: id.replace(/^act_/, ""), nombre, sucursal: suc };
  });
  return l.length ? l : META_ACCOUNT ? [{ id: META_ACCOUNT, nombre: "Valle · Polanco · Coapa", sucursal: null }] : [];
})();

const suma = (a, b) => {
  const m = new Map();
  [...(a || []), ...(b || [])].forEach((x) => m.set(x.action_type, (m.get(x.action_type) || 0) + Number(x.value || 0)));
  return [...m].map(([action_type, value]) => ({ action_type, value: String(value) }));
};

const tercios = () => Object.fromEntries(SUC_CDMX.map((s) => [s, 1 / 3]));

/**
 * Reparto de un anuncio de la cuenta compartida. El Bikini de Valle/Polanco/Coapa corre en un solo conjunto: ÷3.
 * Si el nombre del anuncio dice la sucursal, es de ella; si no, se usa el reparto por adset (fracAdset) restringido
 * a esas tres sucursales (Oriente y Metepec ya cobran en su cuenta); sin pistas, ÷3.
 */
function fraccionCompartida(r, fracAdset) {
  const p = String(r.ad_name || "").split("|").map((s) => sin(s));
  if (p[0] === "bikini") return tercios();
  const dir = SUC_CDMX.find((s) => sin(s) === p[0]);
  if (dir) return { [dir]: 1 };
  const base = fracAdset(r) || {};
  const f = {};
  let t = 0;
  SUC_CDMX.forEach((s) => { if (base[s]) { f[s] = base[s]; t += base[s]; } });
  if (t === 0) return tercios();
  Object.keys(f).forEach((s) => { f[s] /= t; });
  return f;
}

async function paginar(url) {
  const filas = [];
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) return { filas, error: j.error };
    filas.push(...(j.data || []));
    url = j.paging?.next;
  }
  return { filas, error: null };
}

const cuentaUrl = (id, since, until, level, diario, extra = "") =>
  `${API}/act_${id}/insights?fields=${extra}${FIELDS}&time_range={"since":"${since}","until":"${until}"}&level=${level}${diario ? "&time_increment=1" : ""}&limit=${diario ? 100 : 200}&access_token=${META_TOKEN}`;

/**
 * Lee insights a nivel adset (cada fila con `_fraccion` ya calculada para el periodo nuevo).
 * Devuelve { data, error } como la API de Meta. Un error en cualquier cuenta se reporta, sin tapar lo que sí llegó.
 * fracAdset: reparto por nombre de adset (fraccionSucursales de App) para anuncios de la cuenta compartida.
 */
export async function leerMeta({ since, until, diario = false, fracAdset }) {
  const tareas = [];
  const ultimoViejo = until < MULTI_DESDE ? until : "2026-10-31";
  if (since < MULTI_DESDE && META_ACCOUNT) {
    tareas.push(paginar(cuentaUrl(META_ACCOUNT, since, ultimoViejo, "adset", diario)).then((r) => ({ ...r, etiqueta: "Meta" })));
  }
  if (until >= MULTI_DESDE) {
    const desde = since > MULTI_DESDE ? since : MULTI_DESDE;
    for (const c of CUENTAS_META) {
      if (c.sucursal) {
        tareas.push(paginar(cuentaUrl(c.id, desde, until, "adset", diario)).then((r) => ({
          ...r, etiqueta: c.nombre, filas: r.filas.map((x) => ({ ...x, _fraccion: { [c.sucursal]: 1 } })),
        })));
      } else {
        tareas.push(paginar(cuentaUrl(c.id, desde, until, "ad", diario, "ad_name,")).then((r) => {
          // Se agrupa a nivel adset, separando el Bikini compartido para poder partirlo en tres
          const g = new Map();
          r.filas.forEach((x) => {
            const fr = fraccionCompartida(x, fracAdset);
            const k = `${x.date_start || ""}|${x.adset_id}|${JSON.stringify(fr)}`;
            const a = g.get(k) || { ...x, ad_name: undefined, spend: 0, actions: [], impressions: 0, clicks: 0, reach: 0, _fraccion: fr };
            a.spend = Number(a.spend) + Number(x.spend || 0);
            a.actions = suma(a.actions, x.actions);
            a.impressions = Number(a.impressions) + Number(x.impressions || 0);
            a.clicks = Number(a.clicks) + Number(x.clicks || 0);
            a.reach = Number(a.reach) + Number(x.reach || 0); // alcance sumado por anuncio: aproximado
            g.set(k, a);
          });
          return { ...r, etiqueta: c.nombre, filas: [...g.values()] };
        }));
      }
    }
  }
  const res = await Promise.all(tareas.map((t) => t.catch(() => ({ filas: [], error: { message: "Sin conexión con Meta" } }))));
  const err = res.find((r) => r.error);
  return {
    data: res.flatMap((r) => r.filas),
    error: err ? { message: `${err.etiqueta ? err.etiqueta + ": " : ""}${err.error.message}` } : null,
  };
}
