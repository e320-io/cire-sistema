-- Recepción deja "cita abierta" (la clienta se va sin siguiente sesión agendada). Solo registro; el Calendar no se toca.
create table if not exists tarj_abiertas (
  id          uuid primary key default gen_random_uuid(),
  clienta_id  uuid not null references tarj_clientas(id) on delete cascade,
  sucursal    text not null,
  paquete     text not null,
  fecha       date not null,
  usuario     text,
  creado_en   timestamptz not null default now(),
  unique (clienta_id, paquete, fecha)
);
alter table tarj_abiertas enable row level security;
