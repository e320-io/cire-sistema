-- Migración: guarda el presupuesto/% de Meta Ads y el escenario elegido por el usuario
-- por sucursal y mes, para que MetaAdsBudget.jsx no pierda la selección al recargar.
-- Ejecutar en Supabase Dashboard > SQL Editor

create table if not exists meta_ads_presupuesto (
  mes text not null,
  sucursal text not null,
  porcentaje numeric not null,
  presupuesto numeric not null,
  venta_estimada numeric not null default 0,
  base_calculo text not null,
  rango text not null,
  updated_at timestamptz not null default now(),
  primary key (mes, sucursal)
);

alter table meta_ads_presupuesto add column if not exists venta_estimada numeric not null default 0;
