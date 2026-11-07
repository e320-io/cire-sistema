-- Guarda el anticipo de cada venta. Toda venta se toma como liquidada al capturarla;
-- si después no viene (estado "no_vino"), lo cobrado pasa a ser este anticipo.
alter table ventas_anuncios add column if not exists anticipo numeric(12,2);
update ventas_anuncios set anticipo = monto where anticipo is null and estado <> 'liquidada';
