"""
Migración de Google Calendar → Sistema CIRE (Sucursal Coapa)

Modos de uso:
  python3 importar_coapa.py --dry-run          # Analiza el .ics y genera reporte sin tocar BD
  python3 importar_coapa.py --clean            # Borra TODA la data de Coapa en Supabase
  python3 importar_coapa.py --import           # Importa clientas + citas a Supabase
  python3 importar_coapa.py --clean --import   # Limpia y re-importa en un solo paso

Requiere:
  SUPABASE_URL  y  SUPABASE_SERVICE_KEY  como variables de entorno
  (el service key se obtiene en Supabase → Project Settings → API → service_role)

  pip3 install icalendar pytz requests
"""

import os, re, sys, json, unicodedata
from datetime import datetime, date, timedelta
import pytz
import requests
from icalendar import Calendar

# ── Configuración ──────────────────────────────────────────────────────────────
ICS_FILE       = "coapa-calendar.ics"
SUCURSAL_ID    = 1
SUCURSAL_NOMBRE = "Coapa"
TZ_MEXICO      = pytz.timezone("America/Mexico_City")
HOY            = date.today()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://jsiobnixoibpanhnbxvj.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")   # ← service_role key obligatorio

# Palabras clave que indican que el evento NO es una cita de clienta
NO_CITA_TITULOS = [
    "REUNION", "REUNIÓN", "SIMULACRO", "FESTIVO", "CAPACITACION", "CAPACITACIÓN",
    "LIMPIEZA", "INVENTARIO", "NOMINA", "NÓMINA", "JUNTA", "PAGO NOMINA",
    "DIA FESTIVO", "DÍA FESTIVO", "SEMANA SANTA", "NAVIDAD", "AÑO NUEVO",
    "MANTENIMIENTO", "CONTEO", "CIERRE", "APERTURA", "RECORDATORIO", "NOTE",
]

# ── Helpers de normalización ────────────────────────────────────────────────────

def quitar_acentos(texto):
    return ''.join(
        c for c in unicodedata.normalize('NFD', texto)
        if unicodedata.category(c) != 'Mn'
    )

def normalizar_nombre(nombre):
    """Uppercase, sin acentos, espacios limpios."""
    n = quitar_acentos(nombre.strip()).upper()
    n = re.sub(r'\s+', ' ', n)
    return n

def extraer_telefono(texto):
    """Extrae 10 dígitos de un string. Ignora el prefijo +52."""
    digitos = re.sub(r'[^\d]', '', texto)
    # Quitar prefijo 52 si el número tiene 12 dígitos y empieza con 52
    if len(digitos) == 12 and digitos.startswith('52'):
        digitos = digitos[2:]
    # Quitar prefijo 1 si queda 11 dígitos y empieza con 1
    if len(digitos) == 11 and digitos.startswith('1'):
        digitos = digitos[1:]
    if len(digitos) == 10:
        return digitos
    return None

def parsear_titulo(titulo):
    """
    Separa nombre y teléfono del título del evento.
    Formatos comunes:
      'NOMBRE APELLIDO-7221450305'
      'Nombre Apellido - 722 145 0305'
      'Nombre Apellido +52 1 722 145 0305'
      'Nombre Apellido'   (sin teléfono)
    """
    titulo = titulo.strip()
    # Buscar número de teléfono (10+ dígitos, con posibles espacios/guiones/+52)
    patron_tel = re.compile(
        r'[-\s]*'                   # separador opcional
        r'(\+?52[\s-]?)?'           # prefijo +52 opcional
        r'(1[\s-]?)?'               # prefijo 1 opcional
        r'(\d[\d\s\-\.]{8,12}\d)'  # 10 dígitos con separadores
        r'\s*$'                     # al final del string
    )
    m = patron_tel.search(titulo)
    if m:
        telefono_raw = m.group(0)
        nombre_raw   = titulo[:m.start()].strip().strip('-').strip()
        telefono     = extraer_telefono(telefono_raw)
    else:
        nombre_raw = titulo
        telefono   = None

    nombre = normalizar_nombre(nombre_raw) if nombre_raw else ""
    return nombre, telefono

def detectar_tipo_servicio(descripcion, titulo=""):
    """Replica la lógica detectTipo() del frontend."""
    texto = (descripcion + " " + titulo).lower()
    if any(k in texto for k in ["skin renew", "baby clean"]):
        return "facial_baby"
    if any(k in texto for k in ["skin repair", "skin reset", "fullface", "facial completo"]):
        return "facial_full"
    if any(k in texto for k in ["cire lift", "hifu"]):
        return "hifu"
    if any(k in texto for k in ["post op", "post-op", "postop"]):
        return "post_op"
    if any(k in texto for k in ["moldeo", "cire body", "cire sculpt", "corporal", "anticel", "aparatol"]):
        return "corporal"
    if "cera" in texto:
        return "cera"
    if "valor" in texto:
        return "valoracion"
    return "laser"

DURACION_POR_TIPO = {
    "laser": 60, "facial_baby": 60, "facial_full": 90,
    "corporal": 60, "hifu": 90, "post_op": 60,
    "cera": 45, "valoracion": 30,
}

def extraer_sesion(descripcion):
    """Extrae número de sesión de la descripción."""
    # Acepta variantes: SESION 4, SESIÓN 4, SEISON 4, SESÍN 4, SES. 4
    patron = re.compile(
        r'SE[SI][IÍ]?[OÓ]?N?\s*(?:NUM|#|N[°oO]?)?\s*(\d+)',
        re.IGNORECASE
    )
    m = patron.search(descripcion)
    if m:
        return int(m.group(1))
    # También acepta "2A " al inicio (ej: "2A AXILAS")
    m2 = re.match(r'^(\d+)[ªa°]\s', descripcion.strip())
    if m2:
        return int(m2.group(1))
    return None

def limpiar_descripcion(descripcion):
    """Limpia HTML y caracteres raros de la descripción."""
    texto = re.sub(r'<[^>]+>', ' ', descripcion)  # quitar tags HTML
    texto = re.sub(r'\xa0', ' ', texto)            # non-breaking space
    texto = re.sub(r'\s+', ' ', texto).strip()
    # Quitar notas de recibo (información de pago) que no son del servicio
    texto = re.sub(r'#\s*DE\s+RECIBO.*', '', texto, flags=re.IGNORECASE).strip()
    return texto

def es_no_cita(titulo, descripcion):
    """True si el evento es una reunión/bloqueo, no una cita de clienta."""
    t_upper = titulo.upper()
    # Título vacío
    if not titulo.strip():
        return True
    # Título es solo número (ej: bloques de tiempo)
    if re.match(r'^\d+$', titulo.strip()):
        return True
    # Palabras clave conocidas de no-citas en el TÍTULO
    if any(k in t_upper for k in NO_CITA_TITULOS):
        return True
    # Tiene descripción pero ningún patrón de servicio
    desc_limpia = limpiar_descripcion(descripcion)
    if not desc_limpia and not extraer_telefono(titulo):
        return True
    return False

# ── Parsear ICS ─────────────────────────────────────────────────────────────────

def parsear_ics(ruta_archivo):
    """Lee el .ics y devuelve lista de eventos procesados."""
    with open(ruta_archivo, 'rb') as f:
        cal = Calendar.from_ical(f.read())

    eventos = []
    omitidos = []

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        titulo      = str(component.get('SUMMARY', '')).strip()
        descripcion = str(component.get('DESCRIPTION', '')).strip()
        dtstart     = component.get('DTSTART')
        dtend       = component.get('DTEND')

        if not dtstart:
            omitidos.append({"titulo": titulo, "razon": "sin fecha"})
            continue

        # Convertir a hora Mexico
        dt_inicio = dtstart.dt
        dt_fin    = dtend.dt if dtend else None

        if isinstance(dt_inicio, datetime):
            if dt_inicio.tzinfo:
                dt_inicio = dt_inicio.astimezone(TZ_MEXICO)
            else:
                dt_inicio = TZ_MEXICO.localize(dt_inicio)
        else:
            # Es solo date (evento de día completo) → ignorar como bloqueo
            omitidos.append({"titulo": titulo, "razon": "evento día completo"})
            continue

        if dt_fin and isinstance(dt_fin, datetime):
            if dt_fin.tzinfo:
                dt_fin = dt_fin.astimezone(TZ_MEXICO)
            else:
                dt_fin = TZ_MEXICO.localize(dt_fin)

        fecha_local     = dt_inicio.date().isoformat()
        hora_inicio     = dt_inicio.strftime("%H:%M")
        hora_fin        = dt_fin.strftime("%H:%M") if dt_fin else None
        duracion_minutos = int((dt_fin - dt_inicio).total_seconds() / 60) if dt_fin else 60

        # Filtrar no-citas
        if es_no_cita(titulo, descripcion):
            omitidos.append({"titulo": titulo, "razon": "no es cita"})
            continue

        nombre, telefono = parsear_titulo(titulo)
        if not nombre:
            omitidos.append({"titulo": titulo, "razon": "sin nombre"})
            continue

        desc_limpia  = limpiar_descripcion(descripcion)
        tipo_svc     = detectar_tipo_servicio(desc_limpia, titulo)
        sesion_num   = extraer_sesion(desc_limpia)
        duracion_def = DURACION_POR_TIPO.get(tipo_svc, 60)

        eventos.append({
            "titulo_original": titulo,
            "nombre":          nombre,
            "telefono":        telefono,
            "fecha":           fecha_local,
            "hora_inicio":     hora_inicio,
            "hora_fin":        hora_fin,
            "duracion_min":    duracion_minutos if duracion_minutos > 0 else duracion_def,
            "servicio":        desc_limpia[:300] if desc_limpia else titulo[:300],
            "tipo_servicio":   tipo_svc,
            "sesion_numero":   sesion_num,
            "es_pasado":       fecha_local < HOY.isoformat(),
        })

    return eventos, omitidos

# ── Deduplicar clientas ─────────────────────────────────────────────────────────

def construir_clientas(eventos):
    """
    Agrupa eventos por clienta deduplicando por teléfono (primario)
    o nombre normalizado (secundario).
    Devuelve dict: clave → datos clienta
    """
    por_telefono = {}   # tel → clave
    por_nombre   = {}   # nombre_norm → clave
    clientas     = {}   # clave → {nombre, telefono, citas: []}
    siguiente_id = 1

    for ev in eventos:
        tel    = ev["telefono"]
        nombre = ev["nombre"]
        clave  = None

        # 1. Buscar por teléfono
        if tel and tel in por_telefono:
            clave = por_telefono[tel]
        # 2. Buscar por nombre normalizado
        elif nombre in por_nombre:
            clave = por_nombre[nombre]
            # Si ahora tenemos teléfono, enriquecer
            if tel and not clientas[clave]["telefono"]:
                clientas[clave]["telefono"] = tel
                por_telefono[tel] = clave
        else:
            # Nueva clienta
            clave = f"cli_{siguiente_id}"
            siguiente_id += 1
            clientas[clave] = {
                "nombre":   nombre,
                "telefono": tel,
                "citas":    [],
            }
            if tel:
                por_telefono[tel] = clave
            por_nombre[nombre] = clave

        clientas[clave]["citas"].append(ev)

    return clientas

# ── API Supabase ────────────────────────────────────────────────────────────────

def supa_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }

def supa_delete(tabla, filtros):
    """Borra filas en tabla con los filtros dados (dict campo=valor)."""
    params = {f"{k}": f"eq.{v}" for k, v in filtros.items()}
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{tabla}", headers=supa_headers(), params=params)
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Error borrando {tabla}: {r.status_code} {r.text[:200]}")
    return r

def supa_insert_batch(tabla, filas, batch_size=50):
    """Inserta filas en lotes. Devuelve lista de registros insertados."""
    insertados = []
    for i in range(0, len(filas), batch_size):
        lote = filas[i:i + batch_size]
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{tabla}",
            headers=supa_headers(),
            json=lote,
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Error insertando en {tabla} (lote {i}): {r.status_code} {r.text[:400]}")
        insertados.extend(r.json())
    return insertados

# ── Modo DRY-RUN ────────────────────────────────────────────────────────────────

def modo_dry_run():
    if not os.path.exists(ICS_FILE):
        print(f"❌  No se encontró '{ICS_FILE}' en el directorio actual.")
        print(f"    Pon el archivo en: {os.path.abspath(ICS_FILE)}")
        sys.exit(1)

    print(f"\n🔍  Analizando {ICS_FILE} ...\n")
    eventos, omitidos = parsear_ics(ICS_FILE)
    clientas = construir_clientas(eventos)

    total_ev  = len(eventos) + len(omitidos)
    pasadas   = sum(1 for e in eventos if e["es_pasado"])
    futuras   = len(eventos) - pasadas
    sin_tel   = sum(1 for c in clientas.values() if not c["telefono"])
    dup_dets  = {k: v for k, v in clientas.items() if len(v["citas"]) > 3}

    tipos_cnt = {}
    for e in eventos:
        tipos_cnt[e["tipo_servicio"]] = tipos_cnt.get(e["tipo_servicio"], 0) + 1

    omit_razones = {}
    for o in omitidos:
        omit_razones[o["razon"]] = omit_razones.get(o["razon"], 0) + 1

    print("=" * 60)
    print(f"  TOTAL EVENTOS EN .ICS:        {total_ev}")
    print(f"  ✅ Citas a importar:           {len(eventos)}")
    print(f"      - Pasadas (completadas):   {pasadas}")
    print(f"      - Futuras (agendadas):     {futuras}")
    print(f"  ⏭️  Omitidos:                  {len(omitidos)}")
    for razon, cnt in sorted(omit_razones.items(), key=lambda x: -x[1]):
        print(f"      - {razon}: {cnt}")
    print()
    print(f"  👤 CLIENTAS ÚNICAS:            {len(clientas)}")
    print(f"      - Sin teléfono:            {sin_tel}")
    print()
    print("  DISTRIBUCIÓN POR TIPO DE SERVICIO:")
    for tipo, cnt in sorted(tipos_cnt.items(), key=lambda x: -x[1]):
        print(f"      {tipo:20s}: {cnt}")
    print("=" * 60)

    print("\n  MUESTRA — primeras 10 clientas:")
    for i, (clave, cli) in enumerate(list(clientas.items())[:10]):
        n_citas = len(cli["citas"])
        tel_str = cli["telefono"] or "SIN TEL"
        print(f"  {i+1:3d}. {cli['nombre'][:40]:40s} | {tel_str} | {n_citas} cita(s)")
        for c in cli["citas"][:2]:
            print(f"       → {c['fecha']} {c['hora_inicio']} | {c['tipo_servicio']:12s} | ses.{c['sesion_numero'] or '?'} | {c['servicio'][:50]}")

    # Guardar reporte JSON para revisión
    reporte = {
        "resumen": {
            "total_ics": total_ev,
            "a_importar": len(eventos),
            "omitidos": len(omitidos),
            "clientas_unicas": len(clientas),
        },
        "clientas": [
            {
                "nombre": v["nombre"],
                "telefono": v["telefono"],
                "num_citas": len(v["citas"]),
                "fechas": [c["fecha"] for c in v["citas"][:5]],
            }
            for v in list(clientas.values())[:200]
        ],
        "omitidos": omitidos[:100],
    }
    with open("coapa_dry_run.json", "w", encoding="utf-8") as f:
        json.dump(reporte, f, ensure_ascii=False, indent=2)
    print(f"\n  📄 Reporte guardado en coapa_dry_run.json")
    print("\n  ✅ Dry-run completado. Revisa el reporte y ejecuta --import cuando estés listo.\n")

# ── Modo CLEAN ──────────────────────────────────────────────────────────────────

def modo_clean():
    if not SUPABASE_KEY:
        print("❌  Falta SUPABASE_SERVICE_KEY en variables de entorno.")
        sys.exit(1)

    print(f"\n🗑️  Borrando todos los datos de {SUCURSAL_NOMBRE} (sucursal_id={SUCURSAL_ID}) ...\n")

    # Orden: primero citas (FK → paquetes), luego paquetes, luego clientas
    for tabla in ["citas", "paquetes", "clientas"]:
        print(f"  Borrando tabla {tabla} ...", end=" ")
        supa_delete(tabla, {"sucursal_id": SUCURSAL_ID})
        print("✓")

    print(f"\n  ✅ Datos de {SUCURSAL_NOMBRE} borrados correctamente.\n")

# ── Modo IMPORT ─────────────────────────────────────────────────────────────────

def modo_import():
    if not SUPABASE_KEY:
        print("❌  Falta SUPABASE_SERVICE_KEY en variables de entorno.")
        sys.exit(1)

    if not os.path.exists(ICS_FILE):
        print(f"❌  No se encontró '{ICS_FILE}'")
        sys.exit(1)

    print(f"\n📥  Importando {ICS_FILE} → Supabase ({SUCURSAL_NOMBRE}) ...\n")
    eventos, omitidos = parsear_ics(ICS_FILE)
    clientas_map = construir_clientas(eventos)

    print(f"  {len(clientas_map)} clientas a crear ...")
    filas_clientas = [
        {
            "nombre":         v["nombre"],
            "telefono":       v["telefono"] or "",
            "sucursal_id":    SUCURSAL_ID,
            "sucursal_nombre": SUCURSAL_NOMBRE,
            "como_nos_conocio": "Importado Google Calendar",
        }
        for v in clientas_map.values()
    ]

    insertadas = supa_insert_batch("clientas", filas_clientas)
    print(f"  ✅ {len(insertadas)} clientas insertadas.")

    # Mapear clave interna → id real de Supabase
    id_por_nombre_tel = {}
    for row in insertadas:
        key = (row["nombre"], row.get("telefono") or "")
        id_por_nombre_tel[key] = row["id"]

    # Construir citas
    filas_citas = []
    for clave, cli in clientas_map.items():
        cli_key = (cli["nombre"], cli["telefono"] or "")
        clienta_id = id_por_nombre_tel.get(cli_key)
        if not clienta_id:
            print(f"  ⚠️  No se encontró id para {cli['nombre']} — saltando sus citas")
            continue

        for ev in cli["citas"]:
            estado = "completada" if ev["es_pasado"] else "agendada"
            filas_citas.append({
                "clienta_id":      clienta_id,
                "clienta_nombre":  cli["nombre"],
                "sucursal_id":     SUCURSAL_ID,
                "sucursal_nombre": SUCURSAL_NOMBRE,
                "servicio":        ev["servicio"],
                "tipo_servicio":   ev["tipo_servicio"],
                "duracion_min":    ev["duracion_min"],
                "fecha":           ev["fecha"],
                "hora_inicio":     ev["hora_inicio"],
                "hora_fin":        ev["hora_fin"],
                "sesion_numero":   ev["sesion_numero"],
                "es_cobro":        False,
                "estado":          estado,
                "notas":           "Importado de Google Calendar",
            })

    print(f"  {len(filas_citas)} citas a insertar ...")
    citas_ins = supa_insert_batch("citas", filas_citas, batch_size=100)
    print(f"  ✅ {len(citas_ins)} citas insertadas.")
    print(f"\n  🎉 Migración completada: {len(insertadas)} clientas + {len(citas_ins)} citas.\n")

# ── Main ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = set(sys.argv[1:])

    if not args or args == {"--help"}:
        print(__doc__)
        sys.exit(0)

    if "--dry-run" in args:
        modo_dry_run()

    if "--clean" in args:
        confirmacion = input(f"⚠️  ¿Confirmas BORRAR TODA la data de '{SUCURSAL_NOMBRE}' en Supabase? (escribe 'SI'): ")
        if confirmacion.strip().upper() != "SI":
            print("  Cancelado.")
            sys.exit(0)
        modo_clean()

    if "--import" in args:
        modo_import()

    if not any(a in args for a in ["--dry-run", "--clean", "--import"]):
        print(f"Argumento no reconocido: {args}")
        print("Usa --dry-run, --clean o --import")
        sys.exit(1)
