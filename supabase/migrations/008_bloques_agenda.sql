CREATE TABLE IF NOT EXISTS bloques_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id INTEGER NOT NULL,
  fecha DATE,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro',
  comentario TEXT,
  recurrente BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
