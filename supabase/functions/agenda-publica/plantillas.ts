// Plantillas de WhatsApp (categoría UTILITY, es_MX) para avisar al equipo de la sucursal.
// El orden de las variables {{n}} es el que usa agenda-publica al enviar. Si cambias un texto, hay que crear una plantilla nueva en Meta.

export type Plantilla = { name: string; body: string; ejemplo: string[] };

export const PLANTILLAS: Record<"nueva" | "comprobante" | "reagendada", Plantilla> = {
  nueva: {
    name: "agenda_cita_nueva",
    body: "📅 Nueva cita agendada en línea en CIRE {{1}}.\n\nClienta: {{2}}\nCelular: {{3}}\nServicio: {{4}}\nCuándo: {{5}}\nEstatus: {{6}}\n\nYa quedó en el calendario de la sucursal.",
    ejemplo: ["Coapa", "María López", "5512345678", "Combo Sexy Básico Mujer (8 ses)", "Jueves 26 de noviembre · 13:00 – 13:45", "🧊 Pendiente de anticipo"],
  },
  comprobante: {
    name: "agenda_comprobante_anticipo",
    body: "🧾 Una clienta envió su comprobante de anticipo en CIRE {{1}}.\n\nClienta: {{2}}\nCelular: {{3}}\nServicio: {{4}}\nCita: {{5}}\nCaptura: {{6}}\n\nRevísala y, si el anticipo está correcto, cambia 🧊 por 💰 en el calendario.",
    ejemplo: ["Coapa", "María López", "5512345678", "Combo Sexy Básico Mujer (8 ses)", "Jueves 26 de noviembre · 13:00 – 13:45", "https://ejemplo.com/captura"],
  },
  reagendada: {
    name: "agenda_cita_reagendada",
    body: "🔁 Una clienta reagendó su cita en CIRE {{1}}.\n\nClienta: {{2}}\nCelular: {{3}}\nAntes: {{4}}\nAhora: {{5}}\n\nEl calendario ya está actualizado.",
    ejemplo: ["Coapa", "María López", "5512345678", "Jueves 26 de noviembre · 13:00 – 13:45", "Viernes 27 de noviembre · 16:00 – 16:45"],
  },
};
