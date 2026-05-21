create table if not exists solicitudes_reagendado (
  id uuid primary key default gen_random_uuid(),
  cita_id bigint not null,
  clienta_nombre text not null,
  sucursal text not null,
  razon text not null,
  solicitante text not null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now()
);

create index if not exists solicitudes_reagendado_estado_idx on solicitudes_reagendado(estado);
create index if not exists solicitudes_reagendado_sucursal_idx on solicitudes_reagendado(sucursal);
create index if not exists solicitudes_reagendado_cita_idx on solicitudes_reagendado(cita_id);
