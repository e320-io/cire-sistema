-- Pago diferido en 3 exhibiciones (efectivo) para paquetes de sesiones vendidos en el POS.
-- La primera cuota se cobra en el momento de la venta; las 2 restantes se registran
-- después desde la ficha de la clienta, cada una generando su propio ticket en efectivo
-- el día que se cobra (para que caja y comisiones cuadren con lo realmente recibido).
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS pago_diferido boolean DEFAULT false;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS pago_diferido_cuotas_total integer;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS pago_diferido_cuotas_pagadas integer DEFAULT 0;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS pago_diferido_monto_cuota numeric;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS pago_diferido_pendiente numeric DEFAULT 0;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS pago_diferido_completado boolean DEFAULT false;
