-- Migración: guardar método de pago directamente en la cita al cobrar
-- Ejecutar en Supabase Dashboard > SQL Editor

-- metodo_pago: forma de pago registrada al cobrar (ej: "Efectivo", "Débito · Terminal1")
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT;

-- total_pagado: monto total cobrado al liquidar la sesión
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS total_pagado NUMERIC;

-- anticipo_metodo / anticipo_monto / anticipo_ticket: datos del anticipo al agendar
-- Se guardan por separado para que no se pierdan al liquidar
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS anticipo_metodo TEXT;

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS anticipo_monto NUMERIC;

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS anticipo_ticket TEXT;
