-- Migración: desactivar todos los cron jobs de sincronización automática de Zettle
-- Motivo: los tickets sincronizados aparecían solos en el Historial (ej. Polanco)
-- sin que el equipo los hubiera capturado en el POS, generando confusión y riesgo
-- de duplicados. Se desactiva el auto-sync para las 4 sucursales; el endpoint
-- sync-zettle sigue disponible para disparo manual (ej. desde el dashboard de
-- Finanzas > Pasarelas, modo raw/preview) cuando se quiera auditar o traer
-- histórico, pero ya no corre solo cada noche.

SELECT cron.unschedule('sync-zettle-metepec-diario');
SELECT cron.unschedule('sync-zettle-coapa-diario');
SELECT cron.unschedule('sync-zettle-valle-diario');
SELECT cron.unschedule('sync-zettle-oriente-diario');
