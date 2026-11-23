// Duraciones de servicios y precio vigente para la agenda en línea.
// Port de TIPOS_SVC / TIEMPOS_ZONA / detectTipo / getDuracionServicio / getPrecioActual de src/App.jsx
// (la edge function no puede importar el frontend). Si cambias esas tablas en App.jsx, cámbialas aquí también.
// Ver docs/tiempos-servicios.md.

export const TIPOS: Record<string, { label: string; duracion: number; colorId: string }> = {
  laser: { label: "Láser", duracion: 60, colorId: "11" },            // 1ª sesión = rojo, igual que colorCita() en App.jsx
  facial_baby: { label: "Skin Renew", duracion: 60, colorId: "4" },
  facial_full: { label: "Skin Repair/Reset", duracion: 90, colorId: "4" },
  corporal: { label: "Corporal/Moldeo", duracion: 60, colorId: "3" },
  hifu: { label: "Cire Lift", duracion: 90, colorId: "9" },
  post_op: { label: "Post operatorio", duracion: 60, colorId: "10" },
  cera: { label: "Cera", duracion: 45, colorId: "2" },
  valoracion: { label: "Valoración", duracion: 30, colorId: "5" },
};

const normName = (n: string) => (n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

const TIEMPOS_ZONA: Record<string, Record<string, number>> = {
  laser:{
    "bikini basico":15,"sexy bikini":15,"french bikini":30,"bikini brazilian":30,
    "crack":15,"coxis":15,"gluteos":20,"medias piernas":20,"piernas completas":40,
    "pies":15,"combo abdomen pecho":30,"abdomen":15,"brazos completos":30,"brazos":30,
    "medios brazos":20,"axilas":15,"espalda completa":30,"media espalda":20,
    "hombros":15,"linea de abdomen":15,"linea abdomen":15,"manos":15,"pecho":20,"pezones":15,
    "rostro completo":30,"medio rostro":15,"barba":15,"bigote":15,"entreceja":15,
    "frente":15,"mejillas":15,"menton":15,"patillas":15,"cuello":15,"nariz":15,"nuca":15,"orejas":15,
    "combo axilas":30,"combo bikini":30,"combo piernas":45,"combo playa":45,
    "combo sexy":45,"combo rostro":45,"cuerpo completo":60,
  },
  cera:{
    "bikini basico":15,"sexy bikini":15,"french bikini":30,"bikini brazilian":30,
    "crack":15,"coxis":15,"gluteos":30,"medias piernas":30,"piernas completas":30,
    "pies":15,"combo abdomen pecho":30,"abdomen":15,"brazos completos":30,"brazos":30,
    "medios brazos":15,"axilas":15,"espalda completa":15,"media espalda":15,
    "hombros":15,"linea de abdomen":15,"linea abdomen":15,"manos":15,"pecho":15,"pezones":15,
    "barba":15,"bigote":15,"diseno de cejas":30,"entreceja":15,"frente":15,
    "mantenimiento de cejas":30,"medio rostro":30,"mejillas":15,"menton":15,"patillas":15,
    "rostro completo":30,"nariz":15,"nuca":15,"orejas":15,
    "combo sexy":60,"combo playa":60,"combo piernas":60,"cuerpo completo":180,
  }
};

export function detectTipo(nombre: string): string {
  const l = (nombre || "").toLowerCase();
  if (l.includes("skin renew") || l.includes("baby")) return "facial_baby";
  if (l.includes("skin repair") || l.includes("skin reset") || l.includes("fullface") || l.includes("facial")) return "facial_full";
  if (l.includes("cire lift") || l.includes("hifu")) return "hifu";
  if (l.includes("post")) return "post_op";
  if (["moldeo", "cire body", "cire sculpt", "corporal", "anticel", "aparatol"].some((k) => l.includes(k))) return "corporal";
  if (l.includes("cera")) return "cera";
  if (l.includes("valor")) return "valoracion";
  return "laser";
}

/** Duración de una cita: la del catálogo si la tiene; si no, por zona; si no, la del tipo. */
export function duracionServicio(nombre: string, tipo: string, duracionCatalogo: number | null): number {
  if (duracionCatalogo && duracionCatalogo > 0) return duracionCatalogo;
  const mapa = TIEMPOS_ZONA[tipo];
  if (mapa) {
    const n = normName(nombre.replace(/\([^)]*\)/gi, ""));
    for (const [key, min] of Object.entries(mapa).sort((a, b) => b[0].length - a[0].length)) if (n.includes(key)) return min;
  }
  return TIPOS[tipo]?.duracion ?? 60;
}

const PROMO_EXPIRY = new Date("2026-12-31T23:59:59-06:00"); // mismo valor que PROMO_EXPIRY en App.jsx
export function precioVigente(precio: number, precioPromo: number | null, promoHasta: string | null): number {
  const limite = promoHasta ? new Date(promoHasta + "T23:59:59-06:00") : PROMO_EXPIRY;
  return precioPromo != null && new Date() <= limite ? precioPromo : precio;
}
