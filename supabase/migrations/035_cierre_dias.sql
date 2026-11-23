-- Caché diaria de mensajes y gasto de Meta por sucursal y servicio (ya con lo compartido repartido).
-- La función cierre-diario guarda aquí los últimos días y así cada mañana solo le pide a Meta 3 días, no 15.
create table if not exists cierre_dias (
  dia        date not null,
  sucursal   text not null,
  servicio   text not null,
  gasto      numeric not null default 0,
  mensajes   numeric not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (dia, sucursal, servicio)
);
alter table cierre_dias enable row level security;  -- sin políticas: solo la función (service role)
