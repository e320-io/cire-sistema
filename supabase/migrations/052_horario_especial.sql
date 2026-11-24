-- Horario especial: una cita nueva puede salirse del horario de la sucursal hasta `horario_especial_min` minutos:
--   · EMPEZAR hasta esos minutos ANTES de abrir (ej. abre 10:00, cita a las 9:45), o
--   · TERMINAR hasta esos minutos DESPUÉS del cierre (ej. cierra 8:00 pm, cita 7:30 de 45 min termina 8:15).
-- Queda marcada "pendiente de aprobación" en el calendario y se avisa al equipo para validarla con la clienta.
alter table agenda_sucursales add column if not exists horario_especial_min int not null default 15;
-- 0 = no se ofrecen horarios especiales.
alter table agenda_reservas add column if not exists especial boolean not null default false;
