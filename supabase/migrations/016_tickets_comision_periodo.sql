-- Permite asignar un ticket a un periodo de comisión distinto a su fecha de pago
-- Útil cuando el servicio se realiza en un mes diferente al cobro
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS comision_periodo text;
