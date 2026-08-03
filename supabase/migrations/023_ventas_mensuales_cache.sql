-- Migración: caché de ventas mensuales por sucursal.
-- cargarHistorialCompleto (Proyección Meta Ads) recalculaba TODO el histórico
-- desde 2021 golpeando la API de Zettle en vivo cada vez que se abría la pestaña
-- — lento y ahora también se quiere mostrar en el Resumen del Dashboard.
-- Los meses ya cerrados no cambian, así que se cachean aquí una sola vez;
-- solo el mes en curso se sigue leyendo en vivo.

create table if not exists ventas_mensuales_cache (
  mes text not null,
  sucursal text not null,
  total numeric not null default 0,
  actualizado_at timestamptz not null default now(),
  primary key (mes, sucursal)
);
