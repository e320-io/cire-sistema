-- Modo pruebas de la agenda en línea: mientras esté en true se desactivan los candados antiabuso
-- (máx. 3 reservas por celular al día y "ya tienes una cita agendada"). APAGAR (false) antes de compartir el link con clientas.
alter table agenda_sucursales add column if not exists modo_pruebas boolean not null default false;
update agenda_sucursales set modo_pruebas = true;
