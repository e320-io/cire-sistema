-- Migración: distinguir gastos recurrentes de gastos únicos/extraordinarios
-- Ejecutar en Supabase Dashboard > SQL Editor

ALTER TABLE gastos_operativos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'recurrente';

ALTER TABLE gastos_operativos
  ADD CONSTRAINT gastos_operativos_tipo_check CHECK (tipo IN ('recurrente','unico'));

-- Marcar como únicos los gastos extraordinarios ya capturados (compra de equipo,
-- cursos, campañas puntuales) para que no se confundan con gasto fijo recurrente
-- al calcular la utilidad de referencia de un mes.
UPDATE gastos_operativos
  SET tipo = 'unico'
  WHERE categoria IN ('Compra de equipo HIFU 5D','Curso dermapen','Campaña Publicitaria Coapa');
