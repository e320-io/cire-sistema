-- Migración: campos adicionales en citas para importación de calendario
-- Ejecutar en Supabase Dashboard > SQL Editor

-- ticket_zettle: número(s) de ticket Zettle asociados a la cita (ej: "#6431")
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS ticket_zettle TEXT;

-- servicios_sesion: servicios adicionales de la misma visita cuando hay múltiples paquetes
-- Formato: [{"servicio": "Mentón", "sesNum": 1}, {"servicio": "Interglútea", "sesNum": 6}]
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS servicios_sesion JSONB;
