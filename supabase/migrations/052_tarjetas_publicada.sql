-- Una tarjeta solo es visible para la clienta (/tarjeta/<token>) cuando se marca como publicada (envío por oleadas).
-- La vista previa para recepción (/r/<token>) funciona siempre, con el código privado de la tarjeta.
alter table tarj_clientas add column if not exists publicada boolean not null default false;
alter table tarj_clientas add column if not exists publicada_en timestamptz;
