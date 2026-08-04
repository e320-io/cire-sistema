-- Migración: agrega constraint unique sobre catalogo.nombre
-- El upsert de "Sembrar catálogo inicial" usa onConflict:"nombre", que en
-- Postgres/PostgREST requiere una unique constraint (o índice) sobre esa
-- columna literal — el índice de 025 sobre lower(btrim(nombre)) no sirve
-- para eso, solo evita duplicados insensibles a mayúsculas.
-- Ejecutar en Supabase Dashboard > SQL Editor

alter table public.catalogo
  add constraint catalogo_nombre_key unique (nombre);
