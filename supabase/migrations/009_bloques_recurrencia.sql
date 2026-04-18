ALTER TABLE bloques_agenda
  ADD COLUMN IF NOT EXISTS tipo_recurrencia TEXT DEFAULT 'unico',
  ADD COLUMN IF NOT EXISTS dia_semana INTEGER;

UPDATE bloques_agenda
SET tipo_recurrencia = CASE WHEN recurrente THEN 'diario' ELSE 'unico' END
WHERE tipo_recurrencia IS NULL OR tipo_recurrencia = 'unico';
