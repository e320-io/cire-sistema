-- Agregar número de ticket Zettle a la tabla tickets
-- Permite cruzar ventas del POS contra los registros de Zettle
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_zettle TEXT;
