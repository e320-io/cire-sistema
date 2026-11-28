-- Confirmación por WhatsApp a la CLIENTA al agendarse una cita nueva (en línea o por el equipo en /agendar-equipo):
-- mensaje de cita agendada + 2 infografías (indicaciones previas e instrucciones del día de la sesión).
-- Apagado por defecto: se activa por sucursal cuando las 3 plantillas estén aprobadas en Meta, el número de WhatsApp sea el
-- definitivo (no el de prueba) y los secretos INFOGRAFIA_INDICACIONES_URL / INFOGRAFIA_DIA_SESION_URL estén puestos.
alter table agenda_sucursales add column if not exists confirmar_clienta boolean not null default false;
