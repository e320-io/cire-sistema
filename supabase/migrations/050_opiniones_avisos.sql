-- Destinatarios del aviso de WhatsApp por opinión baja (1-2★), independientes de agenda_sucursales.avisos_tel.
-- Vacío = no se manda nada. Los números se cargan directamente en Supabase, no en el repo.
alter table agenda_sucursales add column if not exists avisos_opiniones_tel text[] not null default '{}';
