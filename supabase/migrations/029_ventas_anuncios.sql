-- Ventas atribuibles a anuncios de Meta (alimenta ROI en Meta Ads > Rendimiento).
-- Ejecutar en Supabase Dashboard > SQL Editor
create table if not exists ventas_anuncios (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  sucursal   text not null check (sucursal in ('Valle','Coapa','Polanco','Oriente','Metepec')),
  servicio   text not null check (servicio in ('Láser CC','Bikini','Facial','HIFU 4D','Moldeo (drenaje)')),
  paquete    text not null default '',
  origen     text not null default 'No sé',
  monto      numeric(12,2) not null check (monto > 0),
  creado_por text,
  creado_en  timestamptz not null default now()
);
create index if not exists ventas_anuncios_fecha_idx on ventas_anuncios (fecha);

-- Misma política abierta que el resto de las tablas de la plataforma (acceso con la anon key).
alter table ventas_anuncios enable row level security;
drop policy if exists "ventas_anuncios_todo" on ventas_anuncios;
create policy "ventas_anuncios_todo" on ventas_anuncios for all using (true) with check (true);
