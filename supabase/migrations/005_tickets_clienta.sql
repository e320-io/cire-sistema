-- Agregar clienta_id y clienta_nombre a tickets para vincular con ficha de clienta
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS clienta_id uuid REFERENCES clientas(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS clienta_nombre text;
