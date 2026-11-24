-- Avisos por WhatsApp al equipo cuando se agenda, se sube un comprobante o se reagenda una cita en línea.
-- avisos_tel = números del equipo de CADA sucursal, con el mismo formato que usa RESUMEN_DESTINOS (ej. 521XXXXXXXXXX).
-- Vacío = no se manda nada. Los números se capturan en Supabase (Table Editor > agenda_sucursales), no en el repo.
-- Mientras se use el número de PRUEBA de Meta, cada número debe estar verificado como destinatario (máx. 5 en total).
alter table agenda_sucursales add column if not exists avisos_tel text[] not null default '{}';
