import { SUPABASE_URL, SUPABASE_KEY } from "./supabase";
import { getCredLealtad } from "./lealtad.js";

// Llamadas a la edge function `tarjetas` (tarjeta de la clienta, vista previa, feedback y lista de Hoy).
export const apiTarjetas = async (accion, datos = {}, { recepcion = false } = {}) => {
  const cred = recepcion ? getCredLealtad() : null;
  if (recepcion && !cred) throw new Error("Vuelve a entrar al sistema para continuar.");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/tarjetas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ accion, ...(cred ?? {}), ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos completar la solicitud. Intenta de nuevo.");
  return j;
};
