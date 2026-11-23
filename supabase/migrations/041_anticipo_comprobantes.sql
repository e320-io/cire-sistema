-- Anticipo y comprobante en la agenda en línea ("Asegura tu lugar").
-- Datos bancarios POR SUCURSAL (cada una puede tener beneficiario/cuenta distintos). Sin clabe = la página pide escribir por WhatsApp.

alter table agenda_sucursales
  add column if not exists anticipo_monto int not null default 250,
  add column if not exists banco text,
  add column if not exists beneficiario text,
  add column if not exists cuenta text,
  add column if not exists clabe text;

-- Los datos bancarios (banco, beneficiario, cuenta, clabe) NO se guardan en el repo: se capturan directo en
-- Supabase > Table Editor > agenda_sucursales, fila de cada sucursal.

alter table agenda_reservas
  add column if not exists comprobante_path text,
  add column if not exists comprobante_at timestamptz;

-- Bucket privado para las capturas de comprobante (solo la edge function con service role lo lee/escribe).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
