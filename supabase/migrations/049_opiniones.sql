-- Opiniones por QR: cada sucursal tiene un QR (/opinion/<slug>) que pregunta "¿cómo fue tu experiencia?".
--   5 estrellas  -> se invita a dejar la reseña pública en Google Maps.
--   1 a 4        -> se queda en privado: la clienta dice qué falló y el equipo lo atiende desde el panel.
-- Solo la edge function `opiniones` (service role) toca la tabla; sin policies = cerrada al cliente anon.

alter table agenda_sucursales add column if not exists google_resena_url text;
-- Enlace directo a "escribir reseña" de Google: https://search.google.com/local/writereview?placeid=<PLACE_ID>
-- Mientras esté vacío, el botón de las 5 estrellas abre el mapa de la sucursal (maps_url).

create table if not exists opiniones (
  id uuid primary key default gen_random_uuid(),
  slug text not null references agenda_sucursales(slug),
  calificacion int not null check (calificacion between 1 and 5),
  categorias text[] not null default '{}',       -- qué falló: servicio, atencion, limpieza, puntualidad, precio, otro
  comentario text,
  nombre text,
  telefono text,
  detalle_enviado boolean not null default false, -- la clienta llenó el segundo paso (1 a 4 estrellas)
  fue_a_google boolean not null default false,    -- tocó el botón hacia Google (5 estrellas)
  estado text not null default 'nueva' check (estado in ('nueva', 'atendida')),
  nota_interna text,
  created_at timestamptz not null default now()
);
create index if not exists opiniones_slug_fecha on opiniones (slug, created_at desc);
alter table opiniones enable row level security;
