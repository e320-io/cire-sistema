-- Anticipo + liquidación en ventas por anuncio.
-- Una clienta nueva deja un anticipo ($200-$250) y liquida el día de su sesión:
--   monto        = lo cobrado a la fecha (anticipo; al liquidar pasa a ser el precio completo)  -> ROI real
--   precio_total = precio completo del paquete                                                   -> ROI esperado
-- Ejecutar en Supabase Dashboard > SQL Editor
alter table ventas_anuncios add column if not exists precio_total numeric(12,2);
alter table ventas_anuncios add column if not exists liquidado boolean not null default false;
alter table ventas_anuncios add column if not exists fecha_liquidacion date;

-- Lo capturado antes de esta migración se tomó como cobrado completo.
update ventas_anuncios set precio_total = monto, liquidado = true where precio_total is null;
