-- Migración: agregar columnas para integración Zettle
-- Ejecutar en Supabase Dashboard > SQL Editor

-- 1. Columna fuente: distingue tickets manuales de sincronizados por Zettle
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'manual';

-- 2. Columna zettle_uuid: ID único de cada compra en Zettle (previene duplicados)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS zettle_uuid TEXT;

-- 3. Índice único para que el upsert funcione correctamente
CREATE UNIQUE INDEX IF NOT EXISTS tickets_zettle_uuid_idx
  ON tickets (zettle_uuid)
  WHERE zettle_uuid IS NOT NULL;

-- 4. ticket_num: hacer nullable para tickets importados de Zettle
--    (los tickets manuales siguen usando número secuencial)
ALTER TABLE tickets
  ALTER COLUMN ticket_num DROP NOT NULL;

-- ─── CRON JOB: sync diario a las 3 AM hora México (9 AM UTC) ─────────────────
-- Requiere extensiones pg_cron y pg_net habilitadas en Supabase
-- Activarlas en: Dashboard > Database > Extensions

-- Reemplaza TU_PROJECT_REF por el ID de tu proyecto Supabase (ej: abcdefghijklmnop)
-- Reemplaza TU_ANON_KEY por tu anon key de Supabase

SELECT cron.schedule(
  'sync-zettle-metepec-diario',           -- nombre del job
  '0 9 * * *',                            -- 9 AM UTC = 3 AM México (CST)
  $$
  SELECT net.http_post(
    url     := 'https://TU_PROJECT_REF.supabase.co/functions/v1/sync-zettle?sucursal=metepec',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
