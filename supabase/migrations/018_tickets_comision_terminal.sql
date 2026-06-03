-- Terminal override exclusivo para la vista de comisiones
-- No afecta metodo_pago ni ninguna otra vista
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS comision_terminal_override text;
