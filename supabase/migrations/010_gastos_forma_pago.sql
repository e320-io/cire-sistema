-- Migración: agregar forma de pago a gastos operativos
-- Ejecutar en Supabase Dashboard > SQL Editor

ALTER TABLE gastos_operativos
  ADD COLUMN IF NOT EXISTS forma_pago TEXT DEFAULT 'Efectivo';
