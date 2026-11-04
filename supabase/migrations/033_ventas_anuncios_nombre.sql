-- Nombre de la clienta en cada venta por anuncio.
alter table ventas_anuncios add column if not exists nombre_clienta text not null default '';
