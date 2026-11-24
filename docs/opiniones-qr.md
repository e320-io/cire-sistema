# Opiniones por QR

`/opinion/<slug>` (QR por sucursal). 5★ → botón a Google; 1–4★ → privado (tabla `opiniones`, tab Opiniones del sistema). Backend: edge function `opiniones`.

## Aviso por WhatsApp (1 y 2 estrellas)
Cuando la clienta envía el detalle de una opinión de 1 o 2★, `opiniones` manda la plantilla `opinion_baja` (UTILITY, es_MX) a `agenda_sucursales.avisos_opiniones_tel` de esa sucursal (lista propia, independiente de los avisos de la agenda; mismos secretos `WA_TOKEN`/`WA_PHONE_ID`). Si solo calificó y no envió el detalle, no hay aviso (pero queda en el panel).

Texto (variables: sucursal, estrellas, clienta, celular, qué falló, comentario):
```
⚠️ Opinión baja en CIRE {{1}}: {{2}} de 5 estrellas.

Clienta: {{3}}
Celular: {{4}}
Qué falló: {{5}}
Comentario: {{6}}

Revísala y atiéndela en el sistema, pestaña Opiniones.
```
La plantilla debe estar **aprobada** en Meta; si no, el envío falla y solo queda el error en los logs.
