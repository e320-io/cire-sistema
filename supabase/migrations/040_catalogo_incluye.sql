-- Leyenda "Incluye" que ve la clienta en la agenda en línea (/agendar). Texto libre por servicio; null = no muestra leyenda.
-- Editable en Table Editor > catalogo > incluye.

alter table catalogo add column if not exists incluye text;

-- Contenido tomado de las promos del Buen Fin (las variantes de bikini se llaman por su tipo).
update catalogo set incluye = case nombre
  when 'Combo Sexy Básico Mujer (8 ses)'     then 'Piernas completas, axilas y bikini básico'
  when 'Combo Sexy Sexy Mujer (8 ses)'       then 'Piernas completas, axilas y sexy bikini'
  when 'Combo Sexy French Mujer (8 ses)'     then 'Piernas completas, axilas y french bikini'
  when 'Combo Sexy Brazilian Mujer (8 ses)'  then 'Piernas completas, axilas y bikini brazilian'
  when 'Combo Playa Básico Mujer (8 ses)'    then 'Medias piernas, axilas y bikini básico'
  when 'Combo Playa Sexy Mujer (8 ses)'      then 'Medias piernas, axilas y sexy bikini'
  when 'Combo Playa French Mujer (8 ses)'    then 'Medias piernas, axilas y french bikini'
  when 'Combo Playa Brazilian Mujer (8 ses)' then 'Medias piernas, axilas y bikini brazilian'
  when 'Combo Bikini Mujer (8 ses)'          then 'Axilas y bikini a elegir'
  when 'Combo Piernas Mujer (8 ses)'         then 'Piernas completas y bikini a elegir'
  when 'Combo Axilas Mujer (8 ses)'          then 'Axilas y piernas completas'
  else incluye end
where categoria = 'Combos Láser Mujer';
