# Agenda en línea por sucursal (agendar y reagendar)

Link por sucursal: `https://<dominio>/agendar/<slug>` con slug `coapa`, `valle`, `oriente`, `polanco`, `metepec`.
La clienta escribe nombre + celular, ve su cita, elige otro horario libre (misma duración) y queda movida en el Google Calendar de la sucursal.

## Reglas
- Búsqueda: el celular (10 dígitos) debe estar en el **título** del evento y al menos una palabra del nombre debe coincidir.
- Duración = fin − inicio del evento original.
- Solo 1 reagendado por cita (`agenda_reagendas.event_id` es unique + marca `reagendada=1` en el evento).
- Solo si faltan ≥ 12 h para la cita (`anticipacion_horas`), y el nuevo horario también debe estar a ≥ 12 h.
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
- Reagendar: si dos clientas eligen el mismo hueco en el mismo segundo, la verificación no es transaccional (ventana de milisegundos). Agendar nuevo sí revisa y resuelve el choque después de crear el evento.
- No hay límite de intentos de búsqueda por IP; si hay abuso, agregar rate limiting (Vercel Firewall o tabla de intentos).
- No sincroniza con la tabla `citas` del sistema (fuente de verdad = Google Calendar).

## Agendar cita nueva (`/agendar` y `/agendar/<slug>`)
- `/agendar` deja elegir sucursal (solo las que tienen `calendar_id`); `/agendar/<slug>` ofrece "Agendar mi cita" y "Reagendar mi cita".
- Servicios: salen de la tabla `catalogo` (activos, tipo servicio, filtrados por `sucursales`) + una "Valoración" de 30 min. La cita es la 1ª sesión.
- Duración: `catalogo.duracion_min` si existe; si no, por zona/tipo (copia de `TIEMPOS_ZONA` en `supabase/functions/agenda-publica/duraciones.ts`; si cambias las tablas en `App.jsx`, cámbialas allá también). Precio = promo vigente (misma regla que `getPrecioActual`).
- Evento creado: título `🧊Nombre 5512345678` (🧊 = sin anticipo; la valoración va sin emoji), descripción `Sucursal Servicio $Precio Pendiente Anticipo` + `📲 AGENDADA EN LÍNEA`, color por tipo (1ª sesión láser = rojo), recordatorio 30 min antes. Recepción cambia 🧊 por 💰 al recibir el anticipo.
- Reagendar ahora antepone 🔁 al título.
- Anticipación mínima para citas nuevas: `agenda_sucursales.anticipacion_nueva_horas` (24 por defecto; `anticipacion_horas` = 12 para reagendar).
- Antiabuso: máx. 3 reservas por celular al día, no duplica si la misma persona (nombre + celular) ya tiene cita próxima, campo trampa (honeypot) para bots, y si dos clientas toman el mismo hueco a la vez gana la que se creó primero (la otra se borra y se le avisa).
- Bitácora de reservas en la tabla `agenda_reservas` (migración 038).

## Modo pruebas
`agenda_sucursales.modo_pruebas = true` desactiva los candados antiabuso (máx. 3 reservas por celular al día y "ya tienes una cita agendada") para poder probar con el mismo nombre y celular. **Ponerlo en false antes de compartir los links con clientas** (Table Editor > agenda_sucursales).

## Avisos por WhatsApp al equipo
Al agendar, subir comprobante o reagendar, `agenda-publica` manda una plantilla de WhatsApp (Cloud API, mismos secretos `WA_TOKEN` / `WA_PHONE_ID` que el cierre diario) a los números de `agenda_sucursales.avisos_tel` de esa sucursal. **Con `avisos_tel` vacío no se manda nada.**

| Evento | Plantilla (categoría Utility, es_MX) | Variables |
|---|---|---|
| Cita nueva | `agenda_cita_nueva` | sucursal, clienta, celular, servicio, cuándo, estatus |
| Comprobante recibido | `agenda_comprobante_anticipo` | sucursal, clienta, celular, servicio, cita, enlace a la captura |
| Cita reagendada | `agenda_cita_reagendada` | sucursal, clienta, celular, antes, ahora |

Los textos exactos y los ejemplos están en `supabase/functions/agenda-publica/plantillas.ts`. Las plantillas deben existir y estar **aprobadas** en Meta (WhatsApp Manager > Plantillas) con ese nombre; si no, el envío falla y solo queda el error en los logs de la función (la reserva no se afecta).
Los números van con el mismo formato que `RESUMEN_DESTINOS`. Con el número de **prueba** de Meta, cada destinatario debe estar verificado (máx. 5 en total).
La validación del anticipo sigue siendo manual en Google Calendar (cambiar 🧊 por 💰).
