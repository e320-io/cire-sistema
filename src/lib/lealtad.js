import { SUPABASE_URL, SUPABASE_KEY } from "./supabase";

// Llamadas a la edge function `lealtad`. Las acciones de recepción llevan usuario + hash de contraseña
// (los mismos que guarda system_users) para que el servidor verifique que quien sella es personal, no la clienta.
let cred = null;
export const setCredencialesLealtad = (usuario, hash) => { cred = usuario && hash ? { usuario, hash } : null; };

export const apiLealtad = async (accion, datos = {}, { recepcion = false } = {}) => {
  if (recepcion && !cred) throw new Error("Vuelve a entrar al sistema para continuar.");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/lealtad`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ accion, ...(recepcion ? cred : {}), ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos completar la solicitud. Intenta de nuevo.");
  return j;
};

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Saca el token de lo que lea el escáner: la URL del QR (/sello/<token>) o el token suelto. */
export const tokenDe = (texto) => (String(texto || "").match(UUID_RE) || [])[0]?.toLowerCase() || null;
export const urlSello = (token) => `${location.origin}/sello/${token}`;
export const urlTarjeta = (token) => `${location.origin}/tarjeta/${token}`;
