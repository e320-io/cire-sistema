-- Cierre de sesión desde recepción (piloto Metepec): respaldo del título y registro de zonas que faltaron.
alter table tarj_calendario_log add column if not exists titulo_antes text;
alter table tarj_calendario_log add column if not exists titulo_despues text;
alter table tarj_calendario_log drop constraint if exists tarj_calendario_log_accion_check;
alter table tarj_calendario_log add constraint tarj_calendario_log_accion_check check (accion in ('escribir', 'revertir', 'cierre'));

create table if not exists tarj_cierres (
  id          uuid primary key default gen_random_uuid(),
  clienta_id  uuid not null references tarj_clientas(id) on delete cascade,
  sucursal    text not null,
  evento_id   text not null,
  fecha       date not null,
  paquete     text,
  faltaron    jsonb not null default '[]',   -- zonas que no se hicieron y quedan por reagendar como sesión individual
  nota        text,
  usuario     text,
  creado_en   timestamptz not null default now(),
  unique (sucursal, evento_id)
);
alter table tarj_cierres enable row level security;
