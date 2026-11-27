-- Tarjetas de lealtad calculadas desde Google Calendar (motor en supabase/functions/_shared/tarjetas-motor.ts).
-- Tablas NUEVAS y AISLADAS: no tocan `paquetes`, `clientas` ni Google Calendar. Solo las usa la función `sync-tarjetas`
-- (service role): RLS activo y sin políticas, así que el navegador (clave anon) no puede leerlas ni escribirlas.

-- Una fila por clienta y sucursal. `clave` = celular de 10 dígitos, o "N:NOMBRE" si el calendario no trae celular.
create table if not exists tarj_clientas (
  id                uuid primary key default gen_random_uuid(),
  sucursal          text not null,
  clave             text not null,
  tel               text,
  nombre            text not null,
  titulo_calendario text,
  token             uuid not null unique default gen_random_uuid(),   -- código privado para su tarjeta / enlaces (no es adivinable)
  nivel             text not null check (nivel in ('estricto', 'alta', 'revisar')),
  estricta          boolean not null default false,                   -- grupo estricto: 43 de 44 aciertos medidos con Fer (nov-2026)
  sin_asignar       jsonb not null default '[]',
  actualizado_en    timestamptz not null default now(),
  unique (sucursal, clave)
);
create index if not exists tarj_clientas_tel on tarj_clientas (tel);
create index if not exists tarj_clientas_nivel on tarj_clientas (sucursal, nivel);

-- Los paquetes se REEMPLAZAN en cada corrida (se calculan de nuevo desde el calendario).
create table if not exists tarj_paquetes (
  id             uuid primary key default gen_random_uuid(),
  clienta_id     uuid not null references tarj_clientas(id) on delete cascade,
  orden          int not null,
  nombre         text not null,
  tipo           text,
  combo          jsonb,
  mant           boolean not null default false,
  regalo         boolean not null default false,
  total          int,
  total_supuesto boolean not null default false,
  sellos         int not null,
  por_confirmar  jsonb,
  estado         text not null check (estado in ('activo', 'completo', 'inactivo')),
  proxima        jsonb,                       -- { fecha, n } de la siguiente sesión agendada; null = CITA ABIERTA
  ultima         date,
  confianza      jsonb,                       -- { alta, motivos[] }
  ticket         jsonb,
  leyendas       jsonb,
  notas          jsonb,
  variantes      jsonb,
  sesiones       jsonb,
  actualizado_en timestamptz not null default now()
);
create index if not exists tarj_paquetes_clienta on tarj_paquetes (clienta_id);

-- Respuestas "está bien / no me cuadra" (de la clienta, de recepción o de revisión interna).
create table if not exists tarj_feedback (
  id             uuid primary key default gen_random_uuid(),
  clienta_id     uuid references tarj_clientas(id) on delete set null,
  paquete        text,
  veredicto      text not null check (veredicto in ('si', 'no')),
  sellos_reales  int,
  nota           text,
  origen         text not null default 'clienta' check (origen in ('clienta', 'recepcion', 'revision')),
  created_at     timestamptz not null default now()
);

create table if not exists tarj_sync_log (
  id           uuid primary key default gen_random_uuid(),
  sucursal     text not null,
  corrida      timestamptz not null default now(),
  eventos      int, clientas int, paquetes int, estrictas int, alta int,
  modo         text,                           -- 'escribir' | 'dry'
  duracion_ms  int,
  error        text
);

alter table tarj_clientas  enable row level security;
alter table tarj_paquetes  enable row level security;
alter table tarj_feedback  enable row level security;
alter table tarj_sync_log  enable row level security;
