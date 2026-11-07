-- Promo Buen Fin 2026: actualiza precio_promo en el catálogo del POS.
-- Solo toca los servicios listados; el resto conserva su promo actual.
-- Ejecutar en Supabase Dashboard > SQL Editor
update public.catalogo as c set precio_promo = v.promo
from (values
  ('Cuerpo Completo Mujer (8 ses)', 8500),
  ('Combo Sexy Básico Mujer (8 ses)', 7500),
  ('Combo Sexy Sexy Mujer (8 ses)', 7500),
  ('Combo Sexy French Mujer (8 ses)', 7500),
  ('Combo Sexy Brazilian Mujer (8 ses)', 7500),
  ('Combo Playa Básico Mujer (8 ses)', 6500),
  ('Combo Playa Sexy Mujer (8 ses)', 6500),
  ('Combo Playa French Mujer (8 ses)', 6500),
  ('Combo Playa Brazilian Mujer (8 ses)', 6500),
  ('Combo Piernas Mujer (8 ses)', 6500),
  ('Combo Axilas Mujer (8 ses)', 4500),
  ('Combo Bikini Mujer (8 ses)', 4500),
  ('Rostro Completo Mujer (8 ses)', 2000),
  ('Medio Rostro Mujer (8 ses)', 1600),
  ('Bigote Mujer (8 ses)', 1000),
  ('Mentón Mujer (8 ses)', 1000),
  ('Patillas Mujer (8 ses)', 1000),
  ('Bigote Hombre (8 ses)', 1000),
  ('Mentón Hombre (8 ses)', 1000),
  ('Patillas Hombre (8 ses)', 1000),
  ('Axilas Mujer (8 ses)', 1200),
  ('Brazos Completos Mujer (8 ses)', 3000),
  ('Medios Brazos Mujer (8 ses)', 2000),
  ('Abdomen Mujer (8 ses)', 1600),
  ('Línea de Abdomen Mujer (8 ses)', 1000),
  ('Espalda Completa Mujer (8 ses)', 3600),
  ('Media Espalda Mujer (8 ses)', 2500),
  ('Glúteos Mujer (8 ses)', 1600),
  ('Crack Mujer (8 ses)', 1300),
  ('Bikini Brazilian Mujer (8 ses)', 3200),
  ('French Bikini Mujer (8 ses)', 2800),
  ('Sexy Bikini Mujer (8 ses)', 2000),
  ('Bikini Básico Mujer (8 ses)', 1800),
  ('Piernas Completas Mujer (8 ses)', 3500),
  ('Medias Piernas Mujer (8 ses)', 2400)
) as v(nombre, promo)
where lower(btrim(c.nombre)) = lower(btrim(v.nombre));
