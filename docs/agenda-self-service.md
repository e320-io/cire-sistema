# Reagendado self-service por sucursal

Link por sucursal: `https://<dominio>/agendar/<slug>` con slug `coapa`, `valle`, `oriente`, `polanco`, `metepec`.
La clienta escribe nombre + celular, ve su cita, elige otro horario libre (misma duración) y queda movida en el Google Calendar de la sucursal.

## Reglas
- Búsqueda: el celular (10 dígitos) debe estar en el **título** del evento y al menos una palabra del nombre debe coincidir.
- Duración = fin − inicio del evento original.
- Solo 1 reagendado por cita (`agenda_reagendas.event_id` es unique + marca `reagendada=1` en el evento).
- Solo si faltan ≥ 24 h para la cita, y el nuevo horario también debe estar a ≥ 24 h.
- Un horario está libre si no hay eventos que se le traslapen (eventos de día completo bloquean el día; los marcados "Disponible" no bloquean). `capacidad` permite N citas simultáneas por sucursal.
- Al reagendar se antepone "🔁 REAGENDADA POR LA CLIENTA… (antes: fecha hora)" a la descripción del evento para que recepción lo vea.

## Puesta en marcha (una vez)
1. **Cuenta de servicio de Google**: Google Cloud Console → proyecto → habilitar *Google Calendar API* → IAM > Cuentas de servicio > crear → Claves > JSON.
2. **Compartir cada calendario** con el `client_email` de esa cuenta (Configuración del calendario > Compartir con personas) con permiso *Hacer cambios en eventos*.
3. **Secreto** en Supabase: `supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat clave.json)"`
4. **Migración**: ejecutar `supabase/migrations/037_agenda_self_service.sql`.
5. **Calendar ID y horarios**: por cada sucursal, en `agenda_sucursales` poner `calendar_id` (Configuración del calendario > Integrar calendario > ID) y ajustar `horario` (clave = día de la semana, 0=domingo; valor = `["apertura","cierre"]`; día ausente = cerrado). Horario actual de todas: L–V 10–19, sáb 9–15, domingo cerrado.
6. **Desplegar la función**: `supabase functions deploy agenda-publica`
7. **Frontend**: desplegar en Vercel (el `vercel.json` ya reescribe `/agendar/:slug`).

## Ajustes
`agenda_sucursales`: `intervalo_min` (paso de horarios), `capacidad`, `anticipacion_horas`, `dias_adelante`, `activa`.

## Límites conocidos
- Si dos clientas eligen el mismo hueco en el mismo segundo, la verificación de disponibilidad no es transaccional; la ventana es de milisegundos.
- No hay límite de intentos de búsqueda por IP; si hay abuso, agregar rate limiting (Vercel Firewall o tabla de intentos).
- No sincroniza con la tabla `citas` del sistema (fuente de verdad = Google Calendar).
