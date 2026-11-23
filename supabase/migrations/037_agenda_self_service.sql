-- Self-service de reagendado: link público por sucursal que lee/mueve eventos en el Google Calendar de esa sucursal.
-- Las tablas solo las toca la edge function agenda-publica (service role); sin policies = cerradas al cliente anon.

create table if not exists agenda_sucursales (
  slug text primary key,                       -- /agendar/<slug>
  nombre text not null,
  calendar_id text,                            -- ID del Google Calendar (Configuración del calendario > Integrar calendario). Null = link desactivado.
  horario jsonb not null default '{"1":["10:00","19:00"],"2":["10:00","19:00"],"3":["10:00","19:00"],"4":["10:00","19:00"],"5":["10:00","19:00"],"6":["09:00","15:00"]}'::jsonb,
                                               -- por día de semana (0=domingo): [apertura, cierre]. Día ausente = cerrado.
  intervalo_min int not null default 30,       -- cada cuántos minutos arranca un horario ofrecido
  capacidad int not null default 1,            -- citas simultáneas permitidas
  anticipacion_horas int not null default 24,  -- mínimo de anticipación para reagendar (y para el nuevo horario)
  dias_adelante int not null default 21,       -- cuántos días hacia adelante se ofrecen horarios
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Una fila por evento reagendado: el unique(event_id) es lo que garantiza "solo 1 reagendado" aun con dos clics simultáneos.
create table if not exists agenda_reagendas (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  slug text not null references agenda_sucursales(slug),
  telefono text not null,
  antes timestamptz not null,
  despues timestamptz not null,
  created_at timestamptz not null default now()
);

alter table agenda_sucursales enable row level security;
alter table agenda_reagendas enable row level security;

insert into agenda_sucursales (slug, nombre) values
  ('coapa', 'Coapa'), ('valle', 'Valle'), ('oriente', 'Oriente'), ('polanco', 'Polanco'), ('metepec', 'Metepec')
on conflict (slug) do nothing;
