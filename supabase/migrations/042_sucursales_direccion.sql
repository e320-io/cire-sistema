-- Dirección y mapa de cada sucursal para el resumen final de /agendar.
alter table agenda_sucursales
  add column if not exists direccion text,
  add column if not exists maps_url text,
  add column if not exists estacionamiento boolean not null default false;

update agenda_sucursales s set direccion = v.direccion, maps_url = v.maps_url, estacionamiento = v.estacionamiento
from (values
  ('valle',   'Cda. Dr. José Ignacio Bartolache 1038 Interior 1, Col. Del Valle Centro, Benito Juárez, CDMX', 'https://maps.app.goo.gl/4nVg5HxL7WGdcJVW7', false),
  ('coapa',   'Calz. del Hueso 453 Local 19 Primer Piso, Coapa, Los Girasoles, Coyoacán, CDMX',               'https://maps.app.goo.gl/Fbq576nMjcvyeUWbA', true),
  ('polanco', 'Gutenberg 194, Anzures, Miguel Hidalgo, CDMX',                                                 'https://maps.app.goo.gl/Zdh12Yqx5gYSv4tf6', false),
  ('oriente', 'Sur 8 #277, Patio Santino, tercer piso, Col. Agrícola Oriental',                               'https://maps.app.goo.gl/wk3jortakj2RnWgN8', true),
  ('metepec', 'C. Adolfo López Mateos 1100 Local 10-A, La Asunción, Metepec, Estado de México',               'https://maps.app.goo.gl/z2bFo6gcnTovjtKE7', true)
) as v(slug, direccion, maps_url, estacionamiento)
where s.slug = v.slug;
