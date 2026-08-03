-- ================================================================
-- Deduplicación de clientas duplicadas en sucursal Coapa (id=1)
-- Ejecutar una sola vez en Supabase SQL Editor
-- ================================================================

DO $$
DECLARE
  v_count integer;
BEGIN

  -- ---------------------------------------------------------------
  -- PASO 1: Tabla temporal con mapeo dup_id → winner_id
  -- Criterio principal:  mismo teléfono (no nulo)
  -- Criterio secundario: mismo nombre (case-insensitive) sin teléfono
  -- Winner: más antiguo (created_at ASC, id ASC como desempate)
  -- ---------------------------------------------------------------
  CREATE TEMP TABLE _dup_map AS
  WITH phone_ranked AS (
    SELECT
      id,
      telefono,
      ROW_NUMBER() OVER (
        PARTITION BY trim(telefono)
        ORDER BY created_at ASC, id ASC
      ) AS rn,
      FIRST_VALUE(id) OVER (
        PARTITION BY trim(telefono)
        ORDER BY created_at ASC, id ASC
      ) AS winner_id
    FROM clientas
    WHERE sucursal_id = 1
      AND telefono IS NOT NULL
      AND trim(telefono) != ''
  ),
  phone_dups AS (
    SELECT id AS dup_id, winner_id
    FROM phone_ranked
    WHERE rn > 1
  ),
  name_ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(nombre))
        ORDER BY created_at ASC, id ASC
      ) AS rn,
      FIRST_VALUE(id) OVER (
        PARTITION BY lower(trim(nombre))
        ORDER BY created_at ASC, id ASC
      ) AS winner_id
    FROM clientas
    WHERE sucursal_id = 1
      AND (telefono IS NULL OR trim(telefono) = '')
      AND id NOT IN (SELECT dup_id FROM phone_dups)
      AND id NOT IN (SELECT winner_id FROM phone_dups)
  ),
  name_dups AS (
    SELECT id AS dup_id, winner_id
    FROM name_ranked
    WHERE rn > 1
  )
  SELECT dup_id, winner_id FROM phone_dups
  UNION ALL
  SELECT dup_id, winner_id FROM name_dups;

  SELECT COUNT(*) INTO v_count FROM _dup_map;
  RAISE NOTICE 'Clientas duplicadas encontradas: %', v_count;

  -- ---------------------------------------------------------------
  -- PASO 2: Reasignar paquetes, citas y tickets al winner
  -- ---------------------------------------------------------------
  UPDATE paquetes
  SET clienta_id     = dm.winner_id,
      clienta_nombre = (SELECT nombre FROM clientas WHERE id = dm.winner_id)
  FROM _dup_map dm
  WHERE paquetes.clienta_id = dm.dup_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Paquetes reasignados: %', v_count;

  UPDATE citas
  SET clienta_id     = dm.winner_id,
      clienta_nombre = (SELECT nombre FROM clientas WHERE id = dm.winner_id)
  FROM _dup_map dm
  WHERE citas.clienta_id = dm.dup_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Citas reasignadas: %', v_count;

  UPDATE tickets
  SET clienta_id     = dm.winner_id,
      clienta_nombre = (SELECT nombre FROM clientas WHERE id = dm.winner_id)
  FROM _dup_map dm
  WHERE tickets.clienta_id = dm.dup_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Tickets reasignados: %', v_count;

  -- ---------------------------------------------------------------
  -- PASO 3: Eliminar clientas duplicadas (no winners)
  -- ---------------------------------------------------------------
  DELETE FROM clientas
  WHERE id IN (SELECT dup_id FROM _dup_map);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Clientas duplicadas eliminadas: %', v_count;

  DROP TABLE _dup_map;

  -- ---------------------------------------------------------------
  -- PASO 4: Deduplicar paquetes del mismo cliente
  -- Criterio: mismo clienta_id + servicio + total_sesiones + fecha_compra
  -- Keeper: más sesiones_usadas; desempate → más antiguo
  -- ---------------------------------------------------------------
  CREATE TEMP TABLE _dup_paquetes AS
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY clienta_id, lower(trim(servicio)), total_sesiones, fecha_compra
      ORDER BY sesiones_usadas DESC NULLS LAST, created_at ASC, id ASC
    ) AS keeper_id,
    COUNT(*) OVER (
      PARTITION BY clienta_id, lower(trim(servicio)), total_sesiones, fecha_compra
    ) AS cnt
  FROM paquetes
  WHERE sucursal_id = 1;

  -- Reasignar citas al paquete keeper antes de borrar duplicados
  UPDATE citas
  SET paquete_id = dp.keeper_id
  FROM _dup_paquetes dp
  WHERE citas.paquete_id = dp.id
    AND dp.id != dp.keeper_id
    AND dp.cnt > 1;

  DELETE FROM paquetes
  WHERE id IN (
    SELECT id FROM _dup_paquetes WHERE id != keeper_id AND cnt > 1
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Paquetes duplicados eliminados: %', v_count;

  DROP TABLE _dup_paquetes;

  -- ---------------------------------------------------------------
  -- PASO 5: Deduplicar citas repetidas del mismo cliente
  -- Criterio: mismo clienta_id + fecha + hora_inicio + servicio
  -- Keeper: estado más avanzado; desempate → más antiguo
  -- ---------------------------------------------------------------
  CREATE TEMP TABLE _dup_citas AS
  WITH estado_rank AS (
    SELECT id,
      CASE estado
        WHEN 'completada' THEN 1
        WHEN 'agendada'   THEN 2
        WHEN 'abierta'    THEN 3
        WHEN 'cancelada'  THEN 4
        WHEN 'perdida'    THEN 5
        ELSE 6
      END AS ord
    FROM citas WHERE sucursal_id = 1
  )
  SELECT
    c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.clienta_id, c.fecha, c.hora_inicio, lower(trim(c.servicio))
      ORDER BY er.ord ASC, c.created_at ASC, c.id ASC
    ) AS keeper_id,
    COUNT(*) OVER (
      PARTITION BY c.clienta_id, c.fecha, c.hora_inicio, lower(trim(c.servicio))
    ) AS cnt
  FROM citas c
  JOIN estado_rank er ON er.id = c.id
  WHERE c.sucursal_id = 1;

  DELETE FROM citas
  WHERE id IN (
    SELECT id FROM _dup_citas WHERE id != keeper_id AND cnt > 1
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Citas duplicadas eliminadas: %', v_count;

  DROP TABLE _dup_citas;

  RAISE NOTICE '✅ Deduplicación Coapa completada.';

END $$;
