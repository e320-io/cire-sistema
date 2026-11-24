import { SUPABASE_URL, SUPABASE_KEY } from "./supabase.js";

// Llamadas del EQUIPO a la lista de espera de la agenda en línea (edge function `agenda-publica`, acciones espera_*).
// Llevan usuario + hash de system_users, igual que `lealtad` y `opiniones`.
let cred = null;
export const setCredencialesEspera = (usuario, hash) => { cred = usuario && hash ? { usuario, hash } : null; };

/** "Coapa" -> "coapa" (el slug de la sucursal en agenda_sucursales). */
export const slugSucursal = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const apiEspera = async (accion, datos = {}) => {
  if (!cred) throw new Error("Vuelve a entrar al sistema para continuar.");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/agenda-publica`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ accion: `espera_${accion}`, ...cred, ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos completar la solicitud. Intenta de nuevo.");
  return j;
};
