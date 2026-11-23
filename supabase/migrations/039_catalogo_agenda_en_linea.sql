-- Qué servicios del catálogo se pueden reservar desde /agendar (agenda en línea).
-- Se maneja por servicio: prender/apagar `agenda_en_linea` en Table Editor > catalogo, sin tocar código.
-- Los servicios nuevos del catálogo nacen apagados (false) hasta que se prendan.

alter table catalogo add column if not exists agenda_en_linea boolean not null default false;

update catalogo set agenda_en_linea = true
where activo and tipo = 'servicio' and categoria in (
  'Láser Mujer - Zona Íntima',
  'Láser Mujer - Cuerpo Inferior',
  'Láser Mujer - Cuerpo Superior',
  'Láser Mujer - Rostro',
  'Combos Láser Mujer'
);
