-- Registro de los cierres diarios enviados por WhatsApp (función cierre-diario).
-- Evita mandar dos veces el mismo cierre al mismo destinatario si el cron se reintenta.
create table if not exists cierre_envios (
  dia        date not null,          -- día de los datos (ayer)
  tel        text not null,
  version    text not null,          -- vpom | coapa | oriente
  wamid      text,
  enviado_en timestamptz not null default now(),
  primary key (dia, tel, version)
);
alter table cierre_envios enable row level security;  -- sin políticas: solo la función (service role) lo usa
