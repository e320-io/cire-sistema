-- Horario especial: una cita nueva puede TERMINAR hasta `horario_especial_min` minutos DESPUÉS del cierre
-- (ej. cierra 8:00 pm, cita 7:30 de 45 min termina 8:15). No hay horarios especiales antes de abrir.
-- Queda marcada "pendiente de aprobación" en el calendario y se avisa al equipo para validarla con la clienta.
alter table agenda_sucursales add column if not exists horario_especial_min int not null default 15;
-- 0 = no se ofrecen horarios especiales.
alter table agenda_reservas add column if not exists especial boolean not null default false;
