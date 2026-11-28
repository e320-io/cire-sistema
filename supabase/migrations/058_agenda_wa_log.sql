-- Bitácora de los envíos de WhatsApp de la agenda (avisos al equipo y confirmación a la clienta): qué plantilla, a qué número
-- (solo los últimos 4 dígitos), si Meta lo aceptó y el error si lo rechazó. Sirve para diagnosticar "no le llegó".
create table if not exists agenda_wa_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  plantilla text not null,
  destino text not null,
  ok boolean not null,
  detalle text
);
alter table agenda_wa_log enable row level security; -- sin policies: solo la edge function (service role)
