# Tiempos por servicio (minutos)

Fuente: `TIPOS_SVC` y `TIEMPOS_ZONA` en `src/App.jsx`.

## Duración por tipo de servicio (por defecto)

| Tipo | Duración (min) |
|---|---|
| Láser | 60 |
| Skin Renew (facial baby) | 60 |
| Skin Repair/Reset (facial full) | 90 |
| Corporal/Moldeo | 60 |
| Cire Lift (HIFU) | 90 |
| Post operatorio | 60 |
| Cera | 45 |
| Valoración | 30 |

## Tiempos por zona

Si la zona está en la tabla, su tiempo reemplaza el valor por defecto del tipo.

| Zona | Láser | Cera |
|---|---|---|
| Bikini básico | 15 | 15 |
| Sexy bikini | 15 | 15 |
| French bikini | 30 | 30 |
| Bikini brazilian | 30 | 30 |
| Crack | 15 | 15 |
| Coxis | 15 | 15 |
| Glúteos | 20 | 30 |
| Medias piernas | 20 | 30 |
| Piernas completas | 40 | 30 |
| Pies | 15 | 15 |
| Combo abdomen pecho | 30 | 30 |
| Abdomen | 15 | 15 |
| Línea de abdomen | 15 | 15 |
| Brazos completos | 30 | 30 |
| Brazos | 30 | 30 |
| Medios brazos | 20 | 15 |
| Axilas | 15 | 15 |
| Espalda completa | 30 | 15 |
| Media espalda | 20 | 15 |
| Hombros | 15 | 15 |
| Manos | 15 | 15 |
| Pecho | 20 | 15 |
| Pezones | 15 | 15 |
| Rostro completo | 30 | 30 |
| Medio rostro | 15 | 30 |
| Barba | 15 | 15 |
| Bigote | 15 | 15 |
| Entrecejo | 15 | 15 |
| Frente | 15 | 15 |
| Mejillas | 15 | 15 |
| Mentón | 15 | 15 |
| Patillas | 15 | 15 |
| Cuello | 15 | — |
| Nariz | 15 | 15 |
| Nuca | 15 | 15 |
| Orejas | 15 | 15 |
| Diseño de cejas | — | 30 |
| Mantenimiento de cejas | — | 30 |
| Combo axilas | 30 | — |
| Combo bikini | 30 | — |
| Combo piernas | 45 | 60 |
| Combo playa | 45 | 60 |
| Combo sexy | 45 | 60 |
| Combo rostro | 45 | — |
| Cuerpo completo | 60 | 180 |

"—" = no hay tiempo definido para esa zona (usa el valor por defecto del tipo).

Los demás tipos (faciales, HIFU, corporal, post operatorio, valoración) no tienen tabla por zona: usan la duración por defecto de la primera tabla. El catálogo (`catalogo.duracion_min`) también puede traer una duración propia por servicio.
