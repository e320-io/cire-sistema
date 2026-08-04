-- Migración: catálogo editable de productos/servicios del POS
-- Reemplaza el array hardcodeado CATALOGO en App.jsx — ahora Jaz/admin pueden
-- crear, editar y desactivar productos y servicios desde la app.
-- Ejecutar en Supabase Dashboard > SQL Editor

create table if not exists public.catalogo (
  id                bigserial primary key,
  nombre            text not null,
  categoria         text not null,
  tipo              text not null default 'servicio'
                      check (tipo in ('servicio','producto')),
  precio            integer not null default 0,
  precio_promo      integer,
  promo_hasta       date,                  -- null = usa PROMO_EXPIRY global de la app
  precios_opciones  jsonb,                 -- [{"label":"1 zona","precio":649}, ...] null = precio fijo
  sesiones          integer,               -- null/1 = sesión única
  duracion_min      integer,               -- null = se infiere de TIEMPOS_ZONA por nombre
  msi               integer[] not null default '{}',
  sucursales        text[],                -- null = todas las sucursales
  activo            boolean not null default true,
  orden             integer not null default 1000,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- unicidad insensible a mayúsculas/espacios: evita series duplicadas en reportes
create unique index if not exists catalogo_nombre_uniq
  on public.catalogo (lower(btrim(nombre)));
create index if not exists catalogo_activo_orden_idx
  on public.catalogo (activo, orden);

create or replace function public.catalogo_touch() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

drop trigger if exists catalogo_touch_trg on public.catalogo;
create trigger catalogo_touch_trg before update on public.catalogo
  for each row execute function public.catalogo_touch();

-- misma postura que tickets/paquetes/citas/terminales: sin RLS, la app usa la anon key
grant all on table public.catalogo to anon, authenticated;
grant usage, select on sequence public.catalogo_id_seq to anon, authenticated;

-- Renombrar un item reescribe atómicamente el histórico (tickets/paquetes/citas
-- guardan el nombre como texto). Usar solo desde CatalogoAdmin, con confirmación.
create or replace function public.catalogo_renombrar(p_old text, p_new text)
returns void language plpgsql as $$
begin
  update public.catalogo set nombre = p_new where nombre = p_old;
  update public.paquetes set servicio = p_new where servicio = p_old;
  update public.citas    set servicio = p_new where servicio = p_old;
  update public.tickets  set servicios = array_replace(servicios, p_old, p_new)
    where servicios @> array[p_old];
end $$;
grant execute on function public.catalogo_renombrar(text,text) to anon, authenticated;
