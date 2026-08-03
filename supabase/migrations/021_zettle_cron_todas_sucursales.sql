-- Migración: cron jobs de sincronización Zettle para las 4 sucursales que faltaban
-- (Coapa, Valle, Oriente, Polanco). Solo Metepec tenía cron automático (001_zettle_columns.sql);
-- las demás dependían de disparo manual desde el dashboard y no se habían corrido desde abril 2026.
--
-- Requiere pg_net habilitada (Dashboard > Database > Extensions > pg_net).
-- Si el cron de Metepec falla con "schema net does not exist", habilita esa extensión primero:
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- Horarios escalonados (hora México, UTC-6) para no golpear la función al mismo tiempo:
--   Metepec  3:00 AM  (ya existía, no se toca)
--   Coapa    3:05 AM
--   Valle    3:10 AM
--   Oriente  3:15 AM
--   Polanco  3:20 AM

SELECT cron.schedule(
  'sync-zettle-coapa-diario',
  '5 9 * * *',                            -- 9:05 AM UTC = 3:05 AM México
  $$
  SELECT net.http_post(
    url     := 'https://jsiobnixoibpanhnbxvj.supabase.co/functions/v1/sync-zettle?sucursal=coapa',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzaW9ibml4b2licGFuaG5ieHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODQ4ODQsImV4cCI6MjA4ODc2MDg4NH0.BC4H563Odhnb6ZJB89sRBaTSF4LE7SX7Oh6gkNjvT7w"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'sync-zettle-valle-diario',
  '10 9 * * *',                           -- 9:10 AM UTC = 3:10 AM México
  $$
  SELECT net.http_post(
    url     := 'https://jsiobnixoibpanhnbxvj.supabase.co/functions/v1/sync-zettle?sucursal=valle_polanco',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzaW9ibml4b2licGFuaG5ieHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODQ4ODQsImV4cCI6MjA4ODc2MDg4NH0.BC4H563Odhnb6ZJB89sRBaTSF4LE7SX7Oh6gkNjvT7w"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'sync-zettle-oriente-diario',
  '15 9 * * *',                           -- 9:15 AM UTC = 3:15 AM México
  $$
  SELECT net.http_post(
    url     := 'https://jsiobnixoibpanhnbxvj.supabase.co/functions/v1/sync-zettle?sucursal=oriente',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzaW9ibml4b2licGFuaG5ieHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODQ4ODQsImV4cCI6MjA4ODc2MDg4NH0.BC4H563Odhnb6ZJB89sRBaTSF4LE7SX7Oh6gkNjvT7w"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Nota Polanco: usa la cuenta compartida "valle_polanco" (ver sync-zettle/index.ts,
-- asignarSucursalCompartida). Ese job ya se dispara arriba junto con Valle
-- (una sola llamada a valle_polanco reparte las ventas entre Valle y Polanco
-- según el userDisplayName de cada compra). No se agrega un cron separado para
-- Polanco para no duplicar la sincronización de esa cuenta compartida.
