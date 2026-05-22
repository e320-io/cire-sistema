-- Permite guardar citas sin fecha/hora (sesión pagada pero pendiente de agendar)
ALTER TABLE citas ALTER COLUMN fecha DROP NOT NULL;
ALTER TABLE citas ALTER COLUMN hora_inicio DROP NOT NULL;
ALTER TABLE citas ALTER COLUMN hora_fin DROP NOT NULL;
