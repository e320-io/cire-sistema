// Exporta clientas (sucursal, nombre, telefono, servicio, correo) a CSV para campañas de Meta Ads.
// Uso: node scripts/export-clientas-meta-ads.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga variables de .env.local manualmente (sin depender de vite)
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
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Misma lógica de clasificación que src/App.jsx detectTipo(), reducida a las 4 categorías pedidas.
function categoria(nombreServicio) {
  const l = (nombreServicio || "").toLowerCase();
  if (l.includes("cire lift") || l.includes("hifu")) return "Hifu";
  if (
    l.includes("skin renew") ||
    l.includes("baby") ||
    l.includes("skin repair") ||
    l.includes("skin reset") ||
    l.includes("fullface") ||
    l.includes("facial")
  )
    return "Facial";
  if (
    l.includes("moldeo") ||
    l.includes("cire body") ||
    l.includes("cire sculpt") ||
    l.includes("corporal") ||
    l.includes("anticel") ||
    l.includes("aparatol")
  )
    return "Moldeo";
  if (l.includes("cera") || l.includes("valor") || l.includes("post")) return null; // fuera del alcance pedido
  return "Solo láser";
}

async function fetchAll(table, columns) {
  const pageSize = 1000;
  let from = 0;
  let rows = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  console.log("Descargando clientas...");
  const clientas = await fetchAll("clientas", "id,nombre,telefono,sucursal_nombre");

  console.log("Descargando citas...");
  const citas = await fetchAll("citas", "clienta_id,servicio,estado");

  console.log("Descargando tickets...");
  const tickets = await fetchAll("tickets", "clienta_id,servicios");

  // clienta_id -> Set de categorías
  const serviciosPorClienta = new Map();
  const addCat = (clienteId, cat) => {
    if (!cat || !clienteId) return;
    if (!serviciosPorClienta.has(clienteId)) serviciosPorClienta.set(clienteId, new Set());
    serviciosPorClienta.get(clienteId).add(cat);
  };

  for (const c of citas) {
    if (c.estado === "cancelada") continue;
    addCat(c.clienta_id, categoria(c.servicio));
  }
  for (const t of tickets) {
    const arr = Array.isArray(t.servicios) ? t.servicios : [];
    for (const s of arr) {
      const nombre = typeof s === "string" ? s : s?.nombre;
      addCat(t.clienta_id, categoria(nombre));
    }
  }

  // Normaliza teléfono a los últimos 10 dígitos (México), para agrupar duplicados
  // (misma clienta con varios registros: anticipo + liquidación, captura repetida del bot, etc.)
  const normTel = (t) => {
    const digits = (t || "").replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };

  // Puntúa qué tan "completo" es un nombre para elegir el mejor entre duplicados
  const scoreNombre = (n) => {
    const s = (n || "").trim();
    if (!s) return -1;
    const palabras = s.split(/\s+/).filter(Boolean).length;
    const tieneMinuscula = /[a-záéíóúñ]/.test(s) ? 5 : 0;
    return palabras * 10 + tieneMinuscula + s.length;
  };

  // Agrupa clientas por teléfono normalizado; sin teléfono, cada una queda sola (no se puede deduplicar)
  const grupos = new Map(); // key -> { ids:[], nombre, telefono, sucursales: Map(nombre->count) }
  let sinTelefono = 0;
  for (const c of clientas) {
    const tel = normTel(c.telefono);
    const key = tel || `__sin_tel__${c.id}`;
    if (!tel) sinTelefono++;
    if (!grupos.has(key)) grupos.set(key, { ids: [], telefono: c.telefono || "", nombre: "", sucursales: new Map() });
    const g = grupos.get(key);
    g.ids.push(c.id);
    if (scoreNombre(c.nombre) > scoreNombre(g.nombre)) g.nombre = c.nombre || "";
    const s = c.sucursal_nombre || "";
    g.sucursales.set(s, (g.sucursales.get(s) || 0) + 1);
  }

  const rows = [["sucursal", "nombre_completo", "telefono", "servicio", "correo"]];
  let sinServicio = 0;
  for (const g of grupos.values()) {
    const cats = new Set();
    for (const id of g.ids) {
      for (const cat of serviciosPorClienta.get(id) || []) cats.add(cat);
    }
    if (cats.size === 0) sinServicio++;

    // sucursal más frecuente del grupo
    let sucursal = "";
    let max = -1;
    for (const [nombre, count] of g.sucursales) {
      if (nombre && count > max) {
        sucursal = nombre;
        max = count;
      }
    }

    rows.push([
      sucursal,
      g.nombre,
      g.telefono,
      cats.size ? Array.from(cats).join(" / ") : "Sin servicio registrado",
      "",
    ]);
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const outPath = path.join(__dirname, "..", "clientas_meta_ads.csv");
  fs.writeFileSync(outPath, csv, "utf8");

  console.log(`\nListo: ${rows.length - 1} clientas únicas exportadas a ${outPath}`);
  console.log(`Registros originales en BD: ${clientas.length} -> deduplicados por teléfono a ${grupos.size}`);
  console.log(`Sin teléfono (no se pudieron deduplicar): ${sinTelefono}`);
  console.log(`Sin servicio clasificado (incluidas igual): ${sinServicio}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
