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

## Lista de espera
- **Clienta (`/agendar`, paso de horarios):** bajo el calendario aparece "¿No está disponible el horario que buscas? Entra a la lista de espera, ¡puede abrirse un lugar para ti!". Elige los días que le acomodan (lun–sáb), la franja (mañana / tarde / cualquiera) y un comentario opcional; usa el nombre y celular que ya escribió. Si no hay ningún espacio para ese servicio, en lugar de un error se muestra la lista de espera ya abierta.
- **Recepción (sistema → pestaña "⏳ Espera"):** cada sucursal ve sus pendientes con globo rojo en la pestaña. Por clienta: botón WhatsApp (mensaje prellenado), Llamar, nota del equipo, y estados *Pendiente → Contactada → Agendada* o *Descartada*. Quien atiende varias sucursales cambia de sucursal con el selector de la pestaña. **También está en el panel principal** (dueñas, socias y admin): pestaña "⏳ Espera" junto a Opiniones, con un selector de sucursal con globo de pendientes (cada quien ve solo sus sucursales).
- **Datos:** tabla `agenda_lista_espera` (migración 051), cerrada al público (RLS sin policies). Solo la función `agenda-publica` la toca: acción pública `espera` y acciones del equipo `espera_listar`, `espera_conteo`, `espera_actualizar` (usuario + hash de `system_users`, igual que `lealtad` y `opiniones`).
- **Antiabuso:** campo trampa para bots; si la misma clienta (mismo celular y sucursal) ya está pendiente se actualiza su solicitud en vez de duplicarla; máx. 3 anotaciones nuevas por celular al día (se omite con `modo_pruebas`).
- **Aviso por WhatsApp al equipo:** cuando una clienta se anota por primera vez llega la plantilla `agenda_lista_espera_nueva` (Utility, es_MX) a los números de `agenda_sucursales.avisos_tel` de esa sucursal, con clienta, celular, servicio, días, horario y comentario. Si la misma clienta solo actualiza su solicitud, no se manda otro aviso. Texto y ejemplos en `supabase/functions/agenda-publica/plantillas.ts`; la plantilla debe estar aprobada en Meta.
- **No incluido (posible siguiente paso):** la lista de espera en el reagendado.

## Horario especial (hasta 15 min después del cierre)
- **Qué es:** al agendar una cita nueva también se ofrecen horarios que **empiezan antes del cierre pero terminan hasta `horario_especial_min` minutos después** (15 por defecto): cierra 7:00 pm y una cita de 45 min a las 6:30 termina 7:15. Más allá de eso no se ofrece. **No hay horarios especiales antes de abrir.** `horario_especial_min = 0` los desactiva. Solo aplica a citas **nuevas**; reagendar no los ofrece.
- **Clienta:** en las horas del día aparece el recuadro "⚠️ Horario especial" con el texto *"Nuestra sucursal cierra a las …, pero podemos habilitar el horario especial por ti"* y los horarios marcados con ⚠️. Si reserva uno, ve "Horario especial pendiente de aprobación: te confirmaremos por WhatsApp" en el anticipo, el resumen y la confirmación. Un día que solo tiene horarios especiales también se puede elegir en el calendario.
- **Equipo:** el evento del calendario lleva **⚠️ al inicio del título** (ej. `⚠️🧊María López 5512345678`) y una línea en la descripción con el motivo. Confirmarlo con la clienta y **quitar el ⚠️** del título. El aviso de WhatsApp de cita nueva (plantilla `agenda_cita_nueva`) trae en "Estatus" el motivo: *"⚠️ HORARIO ESPECIAL por aprobar: la sucursal cierra a las 7:00 pm y esta cita termina a las 7:15 pm"*. No requiere plantilla nueva.
- **Datos:** `agenda_sucursales.horario_especial_min` y `agenda_reservas.especial` (migración 052).

## Dominio propio (ciredepilacion.com)
- **Direcciones:** clientas → `https://agenda.ciredepilacion.com` (`/agendar/<sucursal>`, `/opinion/<sucursal>`, `/tarjeta/<token>`); equipo → `https://sistema.ciredepilacion.com` (sistema de recepción y paneles). La raíz de `agenda.` redirige a `/agendar`.
- **Cómo está montado:** el sitio sigue en el hosting (cPanel); el **DNS del dominio lo administra Wix** (ns12/ns13.wixdns.net). En Wix → Dominios → Administrar registros DNS hay dos CNAME: `agenda` y `sistema` → `b925820a87a0f333.vercel-dns-017.com` (valor recomendado por Vercel para este proyecto). Ambos dominios están agregados al proyecto `cire-sistema` de Vercel; el certificado HTTPS lo emite y renueva Vercel solo.
- **En el código:** `src/lib/dominios.js` (`DOMINIO_PUBLICO`, `DOMINIO_EQUIPO`). Los QR de opiniones y el enlace de la tarjeta de lealtad usan `agenda.`; el QR del sello (lo escanea recepción) usa `sistema.`. Siempre producción, nunca la vista previa de Vercel.
- Las direcciones anteriores (`cire-sistema-ochre.vercel.app`) siguen funcionando, así que lo ya compartido o impreso no se rompe.

## Liga corta bajo el sitio principal: ciredepilacion.com/agendar
- **Liga oficial para compartir:** `https://ciredepilacion.com/agendar` (selector de sucursal) y `https://ciredepilacion.com/agendar/<sucursal>` (coapa, valle, oriente, polanco, metepec). `agenda.ciredepilacion.com/agendar/...` sigue funcionando igual.
- **Cómo funciona:** el sitio principal es otro proyecto de Vercel (`cire-site`, repo `ferayalaio/cire-site`). Su `vercel.json` tiene tres *rewrites* externos (`/agendar`, `/agendar/:path*`, `/agenda-assets/:path*`) hacia `agenda.ciredepilacion.com`: la dirección que ve la clienta no cambia. Si algún día el sitio agrega un rewrite comodín, estas reglas deben ir **antes**.
- **Por qué `/agenda-assets/`:** ambos proyectos usaban `/assets/` para sus archivos y chocaban; `vite.config.js` de esta app define `build.assetsDir = 'agenda-assets'`. No lo cambies sin ajustar el rewrite del sitio.
- **También `/opinion/…` y `/tarjeta/…`:** mismos rewrites (4 más en `cire-site`). Los QR de opiniones y el enlace de la tarjeta usan `DOMINIO_PUBLICO` = `https://ciredepilacion.com`. Los QR/enlaces ya emitidos con `agenda.` siguen sirviendo.

## El sistema del equipo bajo el sitio principal: ciredepilacion.com/sistema
- **Liga para el equipo:** `https://ciredepilacion.com/sistema` (también sigue `sistema.ciredepilacion.com`). `DOMINIO_EQUIPO` en `src/lib/dominios.js` apunta a la primera.
- **Cómo funciona:** igual que `/agendar`: `cire-site` tiene rewrites externos `/sistema` y `/sistema/:path*` → `sistema.ciredepilacion.com`, más un header `noindex` para `/sistema(.*)`. La app detecta el prefijo con `PREFIJO_SISTEMA` y `rutaLimpia()` (`src/lib/dominios.js`; usados en `main.jsx` y `App.jsx` para `/sello/<token>`), así que las rutas internas funcionan con o sin `/sistema`.
- **Sesiones:** el login se guarda por origen, así que cada persona entra de nuevo la primera vez en `ciredepilacion.com/sistema`.
- **QR del sello** (`urlSello`): ahora genera `ciredepilacion.com/sistema/sello/<token>`; los QR ya impresos con `sistema.` siguen sirviendo.
- Tras desplegar, el CDN puede dar 404 unos minutos en la ruta recién creada.
