-- Tarjeta de lealtad (luego Apple/Google Wallet): una tarjeta por clienta con un sello por cada sesión de sus paquetes.
-- Las tres tablas son SOLO para la edge function `lealtad` (service role): RLS activo y sin políticas, así que el
-- navegador (clave anon) no puede leerlas ni escribirlas.

-- Una tarjeta por clienta. El token (uuid aleatorio) va en el QR/enlace; no es adivinable.
create table if not exists tarjetas_lealtad (
  clienta_id  text primary key,
  token       uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

-- Bitácora de sellos. paquetes.sesiones_usadas sigue siendo el contador; aquí queda quién/cuándo/dónde.
create table if not exists sellos (
  id             uuid primary key default gen_random_uuid(),
  clienta_id     text not null,
  paquete_id     text not null,
  sesion_numero  integer not null,
  fecha          date not null,
  sucursal       text,
  usuario        text,
  anulado        boolean not null default false,
  created_at     timestamptz not null default now()
);
-- Un solo sello por paquete y día (evita el doble escaneo).
create unique index if not exists sellos_un_dia on sellos (paquete_id, fecha) where not anulado;
create index if not exists sellos_clienta on sellos (clienta_id);

-- Próximas sesiones agendadas desde recepción: guardamos el id del evento de Google Calendar y la tarjeta lee su fecha
-- real (si recepción lo mueve o lo borra en Calendar, la tarjeta lo refleja).
create table if not exists lealtad_citas (
  id          uuid primary key default gen_random_uuid(),
  clienta_id  text not null,
  paquete_id  text not null,
  slug        text not null,
  event_id    text not null,
  usuario     text,
  created_at  timestamptz not null default now()
);
create index if not exists lealtad_citas_clienta on lealtad_citas (clienta_id, created_at desc);

alter table tarjetas_lealtad enable row level security;
alter table sellos           enable row level security;
alter table lealtad_citas    enable row level security;
