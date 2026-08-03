from icalendar import Calendar
import json

# 👇 Cambia esto por el nombre de tu archivo .ics
archivo_entrada = "metepec-calendar.ics"
archivo_salida = "calendario.json"

with open(archivo_entrada, 'rb') as f:
    cal = Calendar.from_ical(f.read())

eventos = []
for component in cal.walk():
    if component.name == "VEVENT":
        eventos.append({
            "titulo": str(component.get('SUMMARY', '')),
            "inicio": str(component.get('DTSTART').dt),
            "fin": str(component.get('DTEND').dt) if component.get('DTEND') else "",
            "descripcion": str(component.get('DESCRIPTION', '')),
            "ubicacion": str(component.get('LOCATION', '')),
        })

with open(archivo_salida, 'w', encoding='utf-8') as f:
    json.dump(eventos, f, ensure_ascii=False, indent=2)

print(f"✅ Listo! Se extrajeron {len(eventos)} eventos → {archivo_salida}")