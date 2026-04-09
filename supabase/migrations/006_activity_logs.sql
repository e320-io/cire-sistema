-- Tabla de logs de actividad para analítica de uso del sistema
CREATE TABLE IF NOT EXISTS activity_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario     text NOT NULL,
  sucursal_id integer,
  sucursal_nombre text,
  rol         text,
  evento      text NOT NULL,
  detalle     text,
  duracion_segundos integer,
  created_at  timestamptz DEFAULT now()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS activity_logs_sucursal_idx   ON activity_logs(sucursal_id);
CREATE INDEX IF NOT EXISTS activity_logs_usuario_idx    ON activity_logs(usuario);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_evento_idx     ON activity_logs(evento);

-- RLS: la app usa la anon key, permitir insert y select libremente
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_insert" ON activity_logs
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "allow_select" ON activity_logs
  FOR SELECT TO anon USING (true);
