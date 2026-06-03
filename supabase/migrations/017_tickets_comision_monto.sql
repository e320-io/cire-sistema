-- Monto ajustado exclusivamente para cálculo de comisiones
-- No afecta el total original del ticket en ninguna otra vista
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS comision_monto numeric;
