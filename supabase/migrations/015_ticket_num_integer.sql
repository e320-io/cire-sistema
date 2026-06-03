-- Convierte ticket_num de text a integer para ordenamiento correcto
-- El tipo text causaba que "9" > "1655" (orden lexicográfico), rompiendo la secuencia

ALTER TABLE tickets
  ALTER COLUMN ticket_num TYPE integer
  USING CASE
    WHEN ticket_num ~ '^\d+$' THEN ticket_num::integer
    ELSE NULL
  END;
