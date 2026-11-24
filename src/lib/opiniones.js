import { SUPABASE_URL, SUPABASE_KEY } from "./supabase.js";

// Llamadas a la edge function `opiniones`. Las de equipo (listar/resolver/config) llevan usuario + hash del sistema.
let cred = null;
export const setCredencialesOpiniones = (usuario, hash) => { cred = usuario && hash ? { usuario, hash } : null; };

export const apiOpiniones = async (accion, datos = {}, { equipo = false } = {}) => {
  if (equipo && !cred) throw new Error("Vuelve a entrar al sistema para continuar.");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/opiniones`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ accion, ...(equipo ? cred : {}), ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos completar la solicitud. Intenta de nuevo.");
  return j;
};

export const slugDeNombre = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Los QR siempre apuntan al dominio de producción (no al de una vista previa, que muestra la barra de Vercel y puede pedir login).
export { DOMINIO_PUBLICO } from "./dominios.js";
import { DOMINIO_PUBLICO as _PUB } from "./dominios.js";
export const urlOpinion = (slug) => `${_PUB}/opinion/${slug}`;
