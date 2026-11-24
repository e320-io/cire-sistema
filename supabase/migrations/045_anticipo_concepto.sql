-- Concepto fijo del anticipo por sucursal. null = "SERVICIO DE <servicio>" calculado automáticamente.
alter table agenda_sucursales add column if not exists anticipo_concepto text;
