-- El mapa incrustado de /agendar debe abrir la ficha del negocio ("Cire Coapa"), no solo un punto de dirección.
-- maps_nombre + lat/lng = búsqueda del negocio. maps_embed (opcional) = URL oficial de Google para incrustar
-- (Google Maps > la ficha de la sucursal > Compartir > Insertar un mapa > copiar SOLO el src="..." del iframe); si existe, tiene prioridad.
alter table agenda_sucursales
  add column if not exists maps_nombre text,
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists maps_embed text;

update agenda_sucursales s set maps_nombre = v.n, lat = v.lat, lng = v.lng
from (values
  ('coapa',   'Cire Coapa',     19.3054028, -99.1270765),
  ('polanco', 'Cire Polanco',   19.4315989, -99.1788088),
  ('valle',   'CIRE DEL VALLE', 19.3862705, -99.1694226),
  ('metepec', 'Cire Metepec',   19.2679641, -99.5746308),
  ('oriente', 'Cire Oriente, Av. Sur 8 277, Agrícola Oriental, Iztacalco, 08500 Ciudad de México, CDMX', null::numeric, null::numeric)
) as v(slug, n, lat, lng)
where s.slug = v.slug;
