-- Respaldo de cada descripción de Google Calendar que se toca al agregar el bloque "🪪 TARJETA CIRE".
-- Aislada: RLS activo y sin políticas (solo service role).
create table if not exists tarj_calendario_log (
  id          uuid primary key default gen_random_uuid(),
  sucursal    text not null,
  evento_id   text not null,
  accion      text not null check (accion in ('escribir', 'revertir')),
  antes       text,
  despues     text,
  creado_en   timestamptz not null default now()
);
create index if not exists tarj_calendario_log_evento on tarj_calendario_log (sucursal, evento_id, creado_en desc);
alter table tarj_calendario_log enable row level security;
