-- Lista de espera de la agenda en línea: la clienta que no encuentra el horario que busca se anota desde /agendar
-- y recepción la ve en la pestaña "Espera" del sistema para contactarla directo.
-- Solo la edge function agenda-publica (service role) toca la tabla; sin policies = cerrada al cliente anon.

create table if not exists agenda_lista_espera (
  id uuid primary key default gen_random_uuid(),
  slug text not null references agenda_sucursales(slug),
  nombre text not null,
  telefono text not null,                       -- 10 dígitos
  servicio_id text,
  servicio text not null,
  dias text[] not null default '{}',            -- días que le acomodan: lun, mar, mie, jue, vie, sab
  franja text not null default 'cualquiera' check (franja in ('manana', 'tarde', 'cualquiera')),
  comentario text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'contactada', 'agendada', 'descartada')),
  nota_equipo text,
  atendida_por text,
  atendida_en timestamptz,
  created_at timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists agenda_lista_espera_slug_idx on agenda_lista_espera(slug, estado, created_at desc);
create index if not exists agenda_lista_espera_tel_idx on agenda_lista_espera(telefono, created_at desc);

alter table agenda_lista_espera enable row level security;
