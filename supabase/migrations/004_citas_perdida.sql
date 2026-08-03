-- Migración: agregar estado "perdida" y razón para citas no completadas
-- Ejecutar en Supabase Dashboard > SQL Editor

-- razon_perdida: motivo por el que la clienta no se presentó o canceló
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS razon_perdida TEXT;
