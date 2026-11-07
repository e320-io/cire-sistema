-- Estado y notas por venta de anuncio (editables desde Meta Ads > Rendimiento > Ventas).
--   pendiente: dejó anticipo, falta que liquide el día de su sesión
--   liquidada: ya pagó el precio completo
--   no_vino:   dejó anticipo y no asistió (el anticipo se queda; no se espera más)
-- Ejecutar en Supabase Dashboard > SQL Editor
alter table ventas_anuncios add column if not exists estado text not null default 'pendiente';
alter table ventas_anuncios add column if not exists notas text not null default '';
alter table ventas_anuncios drop constraint if exists ventas_anuncios_estado_chk;
alter table ventas_anuncios add constraint ventas_anuncios_estado_chk check (estado in ('pendiente','liquidada','no_vino'));
update ventas_anuncios set estado = 'liquidada' where liquidado = true and estado = 'pendiente';
