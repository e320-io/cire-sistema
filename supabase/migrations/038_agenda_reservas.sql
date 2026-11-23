-- Agendado en línea de citas nuevas (/agendar/<sucursal>): bitácora de reservas y anticipación mínima para citas nuevas.
-- Solo la edge function agenda-publica (service role) toca estas tablas.

alter table agenda_sucursales add column if not exists anticipacion_nueva_horas int not null default 24;
-- mínimo de horas entre "ahora" y una cita NUEVA reservada en línea (anticipacion_horas sigue aplicando al reagendado)

create table if not exists agenda_reservas (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  slug text not null references agenda_sucursales(slug),
  telefono text not null,
  nombre text not null,
  servicio text not null,
  inicio timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists agenda_reservas_tel_idx on agenda_reservas(telefono, created_at desc);
create index if not exists agenda_reservas_slug_idx on agenda_reservas(slug, created_at desc);

alter table agenda_reservas enable row level security;
