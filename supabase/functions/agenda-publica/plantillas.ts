// Plantillas de WhatsApp (categoría UTILITY, es_MX) para avisar al equipo de la sucursal.
// El orden de las variables {{n}} es el que usa agenda-publica al enviar. Si cambias un texto, hay que crear una plantilla nueva en Meta.

export type Plantilla = { name: string; body: string; ejemplo: string[]; imagen?: boolean }; // imagen = lleva una imagen en el encabezado

export const PLANTILLAS: Record<"nueva" | "comprobante" | "reagendada" | "espera", Plantilla> = {
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
  espera: {
    name: "agenda_lista_espera_nueva",
    body: "⏳ Nueva clienta en la lista de espera de CIRE {{1}}.\n\nClienta: {{2}}\nCelular: {{3}}\nServicio: {{4}}\nDías que le acomodan: {{5}}\nHorario: {{6}}\nComentario: {{7}}\n\nContáctala cuando se abra un lugar. La lista está en la pestaña Espera del sistema.",
    ejemplo: ["Coapa", "María López", "5512345678", "Combo Sexy Básico Mujer (8 ses)", "Sáb", "Por la mañana", "Solo puedo los sábados temprano"],
  },
  // ---- Mensajes a la CLIENTA (ver confirmarClienta en index.ts). Las dos últimas llevan una infografía en el encabezado. ----
  confirmacion: {
    name: "agenda_confirmacion_clienta",
    body: "¡Hola {{1}}! 🌸 Soy el asistente virtual de Cire Depilación y te confirmo tu cita en CIRE {{2}}.\n\n💆 Servicio: {{3}}\n📅 Cuándo: {{4}}\n📍 Dónde: {{5}}\n\n{{6}}\n\nEn los siguientes mensajes te compartimos las indicaciones para tu sesión. ¡Te esperamos! 🩷\n\nPor favor no respondas a este mensaje.",
    ejemplo: ["María", "Coapa", "Combo Sexy Básico Mujer (8 ses)", "Jueves 26 de noviembre · 13:00 – 13:45", "Calzada del Hueso 123, Coapa · https://maps.app.goo.gl/ejemplo", "Tu anticipo está pendiente: envíanos tu comprobante para asegurar tu lugar."],
  },
  indicaciones: {
    name: "agenda_indicaciones_previas",
    body: "📋 Indicaciones a considerar antes de tu sesión en CIRE. Revísalas con calma en la imagen 👆 para que tu tratamiento salga perfecto.",
    ejemplo: [], imagen: true,
  },
  diaSesion: {
    name: "agenda_instrucciones_dia_sesion",
    body: "✨ Instrucciones para el día de tu sesión en CIRE. Guarda esta imagen 👆 y revísala antes de venir. ¡Nos vemos pronto! 🩷\n\nPor favor no respondas a este mensaje.",
    ejemplo: [], imagen: true,
  },
};
