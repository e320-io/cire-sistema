// Clasificador de eventos de Google Calendar de CIRE. Funciones PURAS (sin Deno/Node/DOM) para poder usarse
// en edge functions y probarse en local contra volcados reales. Objetivo: que NINGÚN evento quede sin categoría.

export type Categoria =
  | "sesion" | "valoracion" | "otro_servicio" | "cera"
  | "cita_sin_detalle" | "cita_sin_celular" | "pago" | "seguimiento"
  | "comida" | "junta" | "bloqueo" | "tarea" | "venta_producto" | "cumple" | "dia_completo"
  | "sin_titulo" | "sin_clasificar";

export type Sesion = { zona: string; nota?: string; partes?: string[]; n: number | null; total: number | null; ultima: boolean; mant: boolean; laser: boolean; implicita?: boolean; regalo?: boolean; noRealizada?: boolean };
export type EventoIn = { id?: string; ini: string; fin?: string; diaCompleto?: boolean; t: string; d: string };
export type Clasif = {
  categoria: Categoria; sub: string; tel: string; telDeDescripcion: boolean; nombre: string;
  ok: boolean; noLlego: boolean; reagendada: boolean; conTicket: boolean; anticipo: "pendiente" | "pagado" | null;
  confirmada: boolean; sesionPerdida: boolean; sesiones: Sesion[]; agendo: string | null; ticket: string | null;
};

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const UP = (s: string) => sinAcentos(s).toUpperCase();
const MARCAS = /[‎‏‪-‮⁦-⁩]/g;

export function telDe(t: string): string {
  const m = t.replace(MARCAS, "").match(/\+?\d[\d\s().-]{8,}\d/);
  const d = (m?.[0] ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}
export function nombreDe(t: string): string {
  return t.replace(MARCAS, "").replace(/\+?\d[\d\s().-]{8,}\d/g, "").replace(/\p{Extended_Pictographic}[\u{FE0F}\u{200D}]*/gu, "").replace(/️/g, "").replace(/\s+/g, " ").trim();
}

// ---- Iniciales de quien agenda (confirmadas por Fer, 26-nov-2026) ----
export const AGENDADORAS: Record<string, string> = {
  CN: "Carla", JV: "Jazmín Vázquez", IO: "Ivone Olvera", IZ: "Ita", MB: "Mariana Bustamante", LR: "Liliana", EA: "Evelyn", DM: "(DM sin identificar)", MR: "(MR sin identificar)", PP: "(PP sin identificar, Oriente)", DV: "Equipo de ventas CIRE",
};
const INIC = new Set(Object.keys(AGENDADORAS));

// ---- Zonas ----
const CODIGOS: Record<string, string> = { CC: "CUERPO COMPLETO", BR: "BRAZILIAN", BB: "BRAZILIAN", SB: "SEXY BIKINI", BF: "FRENCH BIKINI", PC: "PIERNAS COMPLETAS", RC: "ROSTRO COMPLETO", BK: "BIKINI", BZ: "BRAZILIAN" };
const RUIDO = new Set(["REGALO", "UNA", "UNO", "DIODO", "LASER", "MANTENIMIENTO", "MANDO", "DE", "LA", "EL", "EN", "DEL", "SESION", "SESIONES", "REAGENDO", "CITA", "PAQUETE", "NUEVO", "NUEVA", "EXTRA", "A", "LOS", "LAS", "CON", "SIN"]);
const CORTE = /\b(ANTICIPO|PAGO|PAGADO|PAGO|TRANSFERENCIA|RECIBO|EFECTIVO|TERMINAL|PROMO|AUN|COMPRO|NO VINO|NO LLEGO|REAGENDO|LA DEJA|MANDO)\b|\$|#/;
const FRASES = ["CUERPO COMPLETO", "MEDIO ROSTRO", "ROSTRO COMPLETO", "SEXY BIKINI", "FRENCH BIKINI", "BIKINI BASICO", "PIERNAS COMPLETAS", "MEDIAS PIERNAS", "MEDIA ESPALDA", "BRAZILIAN", "AXILAS", "ROSTRO", "BIKINI", "PIERNAS", "BIGOTE", "ESPALDA", "GLUTEOS", "BRAZOS", "ABDOMEN", "PIES", "CUELLO", "MENTON", "BARBA", "MOLDEO", "HIFU", "FACIAL", "DESPIGMENTANTE", "INGLES"];
// Si la zona trae ruido ("ADICIONAL BRAZILIAN") y contiene UNA sola frase de zona conocida, usa esa.
// Si trae varias ("BIKINI Y AXILAS", "RC Y PC"), se respeta completa: es un paquete con varias zonas.
const canonica = (z: string) => {
  if (/\bCOMBO\b/.test(z) || z.split(" ").length <= 1) return z;
  let resto = z; const hallas: string[] = [];
  for (const f of FRASES) if (resto.includes(f)) { hallas.push(f); resto = resto.replace(f, " "); }
  return hallas.length === 1 ? hallas[0] : z;
};
const VOCAB_ZONA = ["AXILAS", "PIERNAS", "BIKINI", "BRAZILIAN", "GLUTEOS", "ESPALDA", "ROSTRO", "BIGOTE", "ABDOMEN", "BRAZOS", "COMPLETO", "COMPLETAS", "BASICO", "FRENCH", "MENTON", "CUELLO", "MEDIAS", "MEDIA", "MEDIO", "PIES", "BARBA", "COMBO", "MOLDEO", "FACIAL", "DESPIGMENTANTE", "SEXY", "CUERPO", "PATILLAS", "MEJILLAS", "NUCA"];
const lev1 = (a: string, b: string) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length === b.length) { i++; j++; } else if (a.length > b.length) i++; else j++; } return d + (a.length - i) + (b.length - j) <= 1; };
const corrige = (w: string) => (w.length < 5 || VOCAB_ZONA.includes(w) ? w : (VOCAB_ZONA.find((v) => v[0] === w[0] && lev1(w, v)) ?? w)); // PRIERNAS -> PIERNAS
const NARRATIVA = /\b(SE QUEDA(RA)?|SE QUEDARON|QUEDA PENDIENTE|PENDIENTES?|PORQUE|POR QUE|SALDRA|SALDRAN|VACACION(ES)?|DEBE|DEBEN|FALTA(N)?|QUEDO|VALORAR|INICIA|INICIAR|OJO|NOTA|AVISAR|PREGUNTAR|SOLICITO|DEJO|DEJA)\b/;
export function zonaClave(raw: string): { zona: string; mant: boolean; nota?: string } {
  let u0 = UP(raw); let nota: string | undefined;
  const mN = u0.match(NARRATIVA); if (mN && mN.index! > 3) { const resto = u0.slice(mN.index!).split(CORTE)[0].replace(/[^A-Z0-9/ ,.]/g, " ").replace(/\s+/g, " ").trim(); if (resto.length >= 4) { nota = resto.charAt(0) + resto.slice(1).toLowerCase(); u0 = u0.slice(0, mN.index!); } } // "COMBO SEXY SE QUEDARA PENDIENTE ZONA PIERNAS…" -> zona "COMBO SEXY" + nota
  const mant = /MANTENIMIENTO/.test(u0);
  const u = u0.split(CORTE)[0].replace(/[^A-Z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();
  const ws = u.split(" ").filter((w) => w && !RUIDO.has(w) && !INIC.has(w) && !/^\d+$/.test(w) && !/^\d+\/\d+$/.test(w)).map(corrige);
  // "C SEXY" / "C PLAYA"... = combo
  for (let i = 0; i < ws.length - 1; i++) if (ws[i] === "C" && /^(SEXY|PLAYA|BIKINI|AXILAS|PIERNAS|ROSTRO)$/.test(ws[i + 1])) ws[i] = "COMBO";
  if (ws.length === 1 && ws[0] === "C") ws[0] = "CC"; // "C DIODO SESION 4" = cuerpo completo
  let z = ws.map((w) => CODIGOS[w] ?? w).join(" ")
    .replace(/\bDESPIGMENTACION\b|\bDESPIGMENANTE\b/g, "DESPIGMENTANTE").replace(/\bBIKNI\b|\bBIKIN\b/g, "BIKINI").replace(/\bSEXI\b/g, "SEXY").replace(/\bBRASILIAN\b|\bBRAZIL\b|\bBRASIL\b|\bBRAZILIANO\b/g, "BRAZILIAN")
    .replace(/\bAXILA\b/g, "AXILAS").replace(/\b1\/2 ROSTRO\b/g, "MEDIO ROSTRO").replace(/\b1\/2 PIERNAS?\b/g, "MEDIAS PIERNAS").replace(/\bMOLDEO CORPORAL\b/g, "MOLDEO")
    .replace(/\bCOMPLENTAS\b/g, "COMPLETAS").replace(/^B BRAZILIAN$/, "BRAZILIAN").replace(/^BIKINI BRAZILIAN$/, "BRAZILIAN").replace(/\bBIKINI FRENCH\b/, "FRENCH BIKINI")
    .replace(/^(FRENCH)$/, "FRENCH BIKINI").replace(/^(BASICO)$/, "BIKINI BASICO").replace(/^(SEXY)$/, "SEXY BIKINI")
    .replace(/\s+/g, " ").trim();
  return { zona: canonica(z), mant, nota };
}
const LASER_ZONA = /^(CUERPO COMPLETO|AXILAS|BRAZILIAN|ROSTRO|MEDIO ROSTRO|SEXY BIKINI|FRENCH BIKINI|BIKINI|PIERNAS|MEDIAS PIERNAS|BIGOTE|ESPALDA|MEDIA ESPALDA|ABDOMEN|GLUTEOS|BRAZOS|PIES|CUELLO|MENTON|PATILLAS|COMBO|LINEA|PECHO|HOMBROS|MANOS|COXIS|CRACK|BARBA|MEJILLAS|FRENTE|ENTRECEJA|NUCA|NARIZ|ORE)/;
const NO_LASER = /MOLDEO|FACIAL|HIFU|SKIN|DESPIGMENT|PDRN|RADIOFRECUENCIA|COSMETO|CIRE BODY|CIRE LIFT|SCULPT|ANTICEL|POST ?OP|APARATOL|FULL FACE|LIMPIEZA/;

// ---- Marcadores de sesión ----
const SES_TOKEN = /^S?[EI]{1,2}[SC]{1,2}[IO]{1,2}N$|^SESIN$|^SESON$|^SES$/; // SESION, SESIN, SESON, SEISON, SESSION, SECION
const ORD_SUF = "(?:TIMA|ERA|ERO|IMA|SDA|STA|NDA|RA|TA|DA|VA|MA|ER|A|O|°|º|ª)";
const RE_ORD = new RegExp(`(?<![\\d/:.,$#])(\\d{1,2})\\s?${ORD_SUF}(?![A-Z0-9])`, "g");
const PALABRA_ORD: Record<string, number | "U"> = { PRIMERA: 1, PRIMER: 1, SEGUNDA: 2, SEGUNDO: 2, TERCERA: 3, TERCER: 3, CUARTA: 4, CUARTO: 4, QUINTA: 5, QUINTO: 5, SEXTA: 6, SEXTO: 6, SEPTIMA: 7, SEPTIMO: 7, OCTAVA: 8, OCTAVO: 8, ULTIMA: "U", ULTIMO: "U" };
const RE_PALABRA = new RegExp(`\\b(${Object.keys(PALABRA_ORD).join("|")})\\b`, "g");
const RE_FRAC = /(?<![\d/])(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})(?![\d/])/g;
const SERVICIO_PISTA = /SESION|DESPIGMENT|HIFU|MOLDEO|SKIN|FACIAL|PAQUETE|DIODO|COMBO|CUERPO|AXILAS|BIKINI|ROSTRO|BRAZILIAN|PIERNAS|FRENCH|BASICO|MENTON|SEXY|BIGOTE|\bCC\b|\bBR\b|\bBK\b|\bBB\b|\bSB\b|\bBF\b|\bPC\b|\bRC\b|ESPALDA|GLUTEOS|ABDOMEN/;
const ZONA_PALABRA = "(?:AXILAS?|BIKINI|CC|BR|BB|SB|BF|PC|RC|BK|ROSTRO|PIERNAS|COMBO|CUERPO|BRAZILIAN|BIGOTE|ESPALDA|MEDIO|MEDIA|FRENCH|SEXY|GLUTEOS|BRAZOS|PIES|ABDOMEN|CUELLO|MENTON|BASICO|BARBA|MOLDEO|HIFU|C)";
type Marca = { ini: number; fin: number; n: number | null; total: number | null; ultima: boolean; tipo: "ses" | "ord" };

function marcasDeLinea(L: string): Marca[] {
  const out: Marca[] = [];
  // 1) palabra SESION (con typos) con número pegado antes o después
  const toks = [...L.matchAll(/[A-Z0-9°º]+/g)];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i][0];
    if (!(SES_TOKEN.test(w) || w === "SESIONES")) continue;
    const prev = toks[i - 1], next = toks[i + 1];
    const num = (x?: RegExpMatchArray) => (x && /^\d{1,2}$/.test(x[0]) ? Number(x[0]) : null);
    let n = num(next), a = toks[i].index!, b = a + w.length;
    if (n !== null) b = next!.index! + next![0].length;
    else if (prev && L[prev.index! - 1] !== "/" && (n = num(prev)) !== null) a = prev!.index!; // "2/5 sesión": el 5 es el total de la fracción, no "5 sesión"
    if (n !== null) {
      let total: number | null = null;
      const mt = L.slice(b).match(/^\s*DE\s+(\d{1,2})\b/); // "SESION 2 DE 4"
      if (mt && Number(mt[1]) >= n && Number(mt[1]) <= 24) { total = Number(mt[1]); b += mt[0].length; }
      out.push({ ini: a, fin: b, n, total, ultima: false, tipo: "ses" });
    }
  }
  // 2) ordinales: 4TA, 2DA, 3RA, 8VA, 7MA, 1ER, 8A, 8°
  for (const m of L.matchAll(RE_ORD)) {
    const ini = m.index!, fin = ini + m[0].length;
    if (out.some((o) => ini < o.fin && fin > o.ini)) continue;
    out.push({ ini, fin, n: Number(m[1]), total: null, ultima: false, tipo: "ord" });
  }
  // 3) palabras: PRIMERA ... ULTIMA
  for (const m of L.matchAll(RE_PALABRA)) {
    const v = PALABRA_ORD[m[1]]; const ini = m.index!, fin = ini + m[0].length;
    if (out.some((o) => ini < o.fin && fin > o.ini)) continue;
    out.push({ ini, fin, n: v === "U" ? null : (v as number), total: null, ultima: v === "U", tipo: "ord" });
  }
  // 4) fracciones n/m o "n DE m" (solo si hay pista de servicio y n <= m, para no confundir con fechas)
  if (SERVICIO_PISTA.test(L) || /^\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/.test(L)) for (const m of L.matchAll(RE_FRAC)) {
    const n = Number(m[1]), t = Number(m[2]); if (!(n >= 1 && t >= 2 && t <= 24 && n <= t)) continue;
    if (n === 1 && t === 2 && /^\s*(ROSTRO|PIERNAS?|ESPALDA|BRAZOS?|ABDOMEN|CUERPO|CARA|GLUTEOS?)\b/.test(L.slice(m.index! + m[0].length))) continue; // "1/2 rostro" = medio rostro
    const ini = m.index!, fin = ini + m[0].length;
    const ya = out.find((o) => ini < o.fin + 3 && fin > o.ini - 3 && o.n === n);
    if (ya) { ya.total = t; continue; }
    if (out.some((o) => ini < o.fin && fin > o.ini)) continue;
    out.push({ ini, fin, n, total: t, ultima: false, tipo: "ses" });
  }
  // 5) número suelto antes de una zona ("8 AXILAS", "7 BK 5 GLUTEOS") o al final después de ella ("CC 2")
  const RE_NZ = new RegExp(`(?<![\\d/:.,$#])(\\d{1,2})\\s+(?=${ZONA_PALABRA}\\b)`, "g");
  for (const m of L.matchAll(RE_NZ)) {
    const n = Number(m[1]); if (n < 1 || n > 12) continue;
    const ini = m.index!, fin = ini + m[0].length;
    if (out.some((o) => ini < o.fin && fin > o.ini)) continue;
    out.push({ ini, fin, n, total: null, ultima: false, tipo: "ord" });
  }
  if (!out.length) {
    const m = L.match(new RegExp(`\\b${ZONA_PALABRA}\\s+(\\d{1,2})\\s*$`));
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) out.push({ ini: m.index! + m[0].length - m[1].length - 0, fin: m.index! + m[0].length, n: Number(m[1]), total: null, ultima: false, tipo: "ses" });
  }
  return out.sort((a, b) => a.ini - b.ini);
}

const NO_REALIZADA = /NO SE PUDO (REALIZAR|HACER)|NO SE REALIZ|NO SE HIZO|FOTOSENSIBLE|CONTRAINDIC|NO PUDO (RECIBIR|REALIZARSE)|NO ES CANDIDAT/;
const REGALO = /REGALO|POR COMENTARIO|COMENTARIO EN GOOGLE|OBSEQUIO|CORTESIA/;
const RE_LINEA_PAGO = /^\s*(SEGUNDO |PRIMER |TERCER |ULTIMO |1ER |2DO )?(PAGO|ANTICIPO|ABONO|LIQUID|RECIBO|DEPOSITO|TRANSFERENCIA|EFECTIVO)\b/;
const RE_SEGUIMIENTO = /DISCULPA|NO PODRE|REAGENDAR|PODRIA|ESTOY EN|\bHOLA\b|BUENAS|GRACIAS|ESCRIBIR|PENDIENT|SUS ZONAS|SESION ZONAS|RETOQUE|AVISAR|LLAMAR|CONFIRMAR|COTIZ|NO CONTEST|MANDAR MENSAJE|DAR SEGUIMIENTO|RECORDAR/;
function zonasDeLinea(L: string): Sesion[] {
  if (RE_LINEA_PAGO.test(L) || RE_SEGUIMIENTO.test(L)) return [];
  const piezas = L.split(CORTE)[0].split(/,|\+|\bY\b/);
  const out: Sesion[] = [];
  for (const p of piezas) {
    const c = zonaClave(p); if (!c.zona) continue;
    const esZona = LASER_ZONA.test(c.zona) || NO_LASER.test(c.zona);
    if (!esZona) continue;
    out.push({ zona: c.zona, n: null, total: null, ultima: false, mant: c.mant, laser: LASER_ZONA.test(c.zona) && !NO_LASER.test(c.zona), implicita: true });
  }
  return out;
}
const numeroDeTitulo = (t: string): number | null => {
  const m = t.replace(MARCAS, "").replace(/\p{Extended_Pictographic}[\u{FE0F}\u{200D}]*/gu, "").replace(/\uFE0F/g, "").match(/^\s*(\d{1,2})\s?(?:TA|RA|DA|VA|MA|ER|A|O|°|º|ª|)(?=\s*\p{L})/iu);
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? Number(m[1]) : null;
};

export function parseSesiones(desc: string, titulo = ""): Sesion[] {
  const res: Sesion[] = [];
  const lineas = desc.split("\n").map((l) => UP(l).replace(/(\d)([A-Z])/g, "$1 $2").replace(/\s+/g, " "));
  for (let L of lineas) {
    if (!/\d|PRIMER|SEGUND|TERCER|CUART|QUINT|SEXT|SEPTIM|OCTAV|ULTIM/.test(L)) continue;
    const tieneSes = /\bS?[EI]{1,2}[SC]{1,2}[IO]{1,2}N\b|\bSESIN\b|\bSESON\b|\bSES\b/.test(L);
    if (/^\s*VALORACION\b/.test(L) && !tieneSes) continue;                 // "valoración piernas y axilas": no es una sesión
    const noRealizada = NO_REALIZADA.test(L);
    if (/^\s*COMPRO\b/.test(L)) { if (!tieneSes) continue; L = L.replace(/^\s*COMPRO\b/, " "); } // "COMPRO PIERNAS DIODO SESION 1" = sesión nueva
    else { const k = L.search(/\bCOMPRO\b/); if (k > 0 && tieneSes) L = L.slice(0, k); } // "... SESION 3 MB COMPRO 1/2 ESPALDA" = nota de compra
    if (RE_LINEA_PAGO.test(L) && !/SESION|SESON|SESIN/.test(L)) continue;
    const ms = marcasDeLinea(L);
    ms.forEach((m, i) => {
      const prevFin = i ? ms[i - 1].fin : 0, nextIni = i + 1 < ms.length ? ms[i + 1].ini : L.length;
      const antes = L.slice(prevFin, m.ini), despues = L.slice(m.fin, nextIni);
      const orden = m.tipo === "ses" ? [antes, despues] : [despues, antes];
      let z: { zona: string; mant: boolean; nota?: string } = { zona: "", mant: false };
      for (const t of orden) { const c = zonaClave(t); if (c.zona) { z = c; break; } z.mant = z.mant || c.mant; }
      if (/DESPIGMEN/.test(L) && z.zona && !/DESPIGMEN/.test(z.zona)) z = { ...z, zona: "DESPIGMENTANTE " + z.zona }; // "AXILAS E INGLES SESION 3 DESPIGMENTACION"
      const laser = /DIODO/.test(L) || (LASER_ZONA.test(z.zona) && !NO_LASER.test(L));
      if (z.zona && !(LASER_ZONA.test(z.zona) || NO_LASER.test(z.zona) || FRASES.some((f) => z.zona.includes(f)) || /\bCOMBO\b/.test(z.zona))) z = { ...z, zona: "" }; // texto que no es una zona ("POR QUE NO VENIA RASURADA")
      res.push({ nota: z.nota, zona: z.zona || "SIN ZONA", n: m.n, total: m.total, ultima: m.ultima, mant: z.mant || /MANTENIMIENTO/.test(L), laser, regalo: REGALO.test(L) && !(m.total && m.total > 1), noRealizada });
    });
  }
  if (!res.length) {
    // sin número en la descripción: zonas sueltas ("Axilas", "cuerpo completo", "Bk french") -> sesión implícita
    // (el número, si existe, viene pegado al nombre en el título: "7a Ana", "5aAna")
    const nT = numeroDeTitulo(titulo);
    for (const L of lineas) for (const z of zonasDeLinea(L)) res.push({ ...z, n: nT, regalo: REGALO.test(L), noRealizada: NO_REALIZADA.test(L) });
  }
  const visto = new Set<string>();
  for (let i = res.length - 1; i >= 0; i--) if (res[i].zona === "SIN ZONA" && res[i].n != null && res.some((o) => o !== res[i] && o.n === res[i].n && o.zona !== "SIN ZONA")) res.splice(i, 1);
  const unicos = res.filter((s) => { const k = `${s.zona}|${s.n}|${s.ultima}`; if (visto.has(k)) return false; visto.add(k); return true; });
  if (NO_REALIZADA.test(UP(desc))) for (const s of unicos) s.noRealizada = true; // la frase puede venir en otra línea de la misma cita
  for (const s of unicos) { const p = s.zona.split(/\s+Y\s+|,/).map((x) => x.trim()).filter(Boolean); if (p.length > 1) s.partes = p; }
  return unicos;
}

// ---- Eventos que no son citas ----
const RE_COMIDA = /REFRIGERIO|COMIDA|ALMUERZO|DESAYUNO|\bCENA\b|LUNCH|🍽|🍖|🍗|🥩|🥓|🍕|🍔|🌮|🍜|🍲|🥗|🍝|🍣|🥪/;
const RE_JUNTA = /JUNTA|REUNION|MEETING|ZOOM|CAPACITA|TRAINING|SESION SEMANAL|KOVALTO|ENTREVISTA|CURSO/;
const RE_BLOQUEO = /CAMBIO (DE )?AGUA|AGUA (DEL |DE )?LASER|BLOQUE|DESCANSO|PERMISO|CAMBIAR AGUA|IR A SUCURSAL|INVENTARIO|LIMPIEZA|SIMULACRO|CIERRE|ASUETO|FESTIVO|VACACION|NO ASISTE|NO LABORA|CERRADO|INCAPACIDAD|DIA LIBRE|\bLIBRE\b|DISPONIBLE|NO HAY|SIN CITAS|MANTENIMIENTO DE EQUIPO|EQUIPO|MAQUINA|TECNICO|INSTALACION|FUMIGA|MUDANZA|PLOMER|ELECTRIC|CAMBIO DE TURNO|TURNO/;
const RE_TAREA = /\bAGENDAR?\b|\bAGENDA\b|SOLO AGENDAR|\bVIENE\b|\bMAMA\b|EXPEDIENT|^\W*(EXP\w*\W*)?#?\s*\d{3,4}([-,\s]+(Y\s+)?#?\d{3,4})*\W*$|NO AGENDAR|\bPZ\b|INSUMO|PEDIDO|RECORDATORIO|ESCRIBIRLE|LLAMAR|MANDAR|AVISAR|COBRAR|SEGUIMIENTO|PEDIR|COMPRAR|REVISAR|ENVIAR|CHECAR|PENDIENTE DE|RECOGER|ENTREGAR|DEPOSITAR|DEPOSITO|PAGAR|PAGO DE|FACTURA/;
const RE_VENTA = /VENTA DE|INHIBIDOR|\bCREMA\b|PRODUCTO|\bKIT\b|\bGEL\b|SERUM|PROTECTOR SOLAR|VELLO/;
const RE_CUMPLE = /CUMPLE|CUMPLEAN|ANIVERSARIO|BIRTHDAY|FELIZ/;
const RE_CERA = /\bCERA\b|DEPILACION CON CERA/;
const RE_OTRO = /LIPOLASER|BABY CLEAN|\bRFF\b|FACIAL|HIFU|RADIOFRECUENCIA|MOLDEO|DESPIGMENT|PDRN|SKIN|ANTICEL|POST ?OP|CIRE (BODY|LIFT|SCULPT)|APARATOL|LIMPIEZA|MICROAGUJA|PEELING|MASAJE|CAVITACION|TERAPIA|BOTOX|TRATAMIENTO|\bTX\b/;

const RE_PAGO_EV = /(^|\n)\s*(SEGUNDO |PRIMER |TERCER |ULTIMO )?(PAGO|ANTICIPO|ABONO|LIQUID|RECIBO|DEPOSITO)\b|\$\s?\d/;
const nombreLike = (n: string) => { const ws = n.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2); return ws.length >= 2 && ws.every((w) => /^\p{L}+$/u.test(w)); };

export function clasificar(e: EventoIn): Clasif {
  const t = e.t ?? "", d = e.d ?? "", T = UP(t), D = UP(d);
  const telT = telDe(t), telD = telT ? "" : telDe(d);
  const tel = telT || telD;
  const base: Clasif = {
    categoria: "sin_clasificar", sub: "", tel, telDeDescripcion: !!telD, nombre: nombreDe(t),
    ok: t.includes("✅"), noLlego: /❌|✖/.test(t), reagendada: /🔁|🔄|↪/.test(t), conTicket: t.includes("🧾"),
    anticipo: t.includes("🧊") ? "pendiente" : t.includes("💰") ? "pagado" : null, confirmada: t.includes("🆗"),
    sesionPerdida: /PERDI[OÓ] (SU )?SESION|PIERDE (SU )?SESION|SESION PERDIDA/.test(UP(t + " " + d)),
    sesiones: [], agendo: null, ticket: null,
  };
  const tk = D.match(/RECIBO\s*#?\s*(\d{3,5})|\bT\s*:\s*(\d{3,5})|(?:^|\s)#\s*(\d{4})\b/);
  base.ticket = tk ? (tk[1] ?? tk[2] ?? tk[3]) : null;
  const ini = [...D.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1]).filter((x) => INIC.has(x)).pop();
  base.agendo = ini ? AGENDADORAS[ini] : null;
  const fin = (c: Categoria, sub = ""): Clasif => ({ ...base, categoria: c, sub });
  const conSesiones = (): Clasif | null => {
    base.sesiones = parseSesiones(d, t);
    if (!base.sesiones.length) return null;
    const sinNum = base.sesiones.every((s) => s.n === null && !s.ultima);
    return fin("sesion", (base.sesiones.some((s) => s.laser) ? "laser" : "otro_servicio") + (sinNum ? "_sin_numero" : ""));
  };

  if (e.diaCompleto) return fin("dia_completo", RE_CUMPLE.test(T) ? "cumple" : /FESTIVO|ASUETO|NAVIDAD|AÑO NUEVO|ANO NUEVO|REYES|CONSTITUCION|INDEPENDENCIA|MUERTOS|REVOLUCION|SEMANA SANTA/.test(T) ? "festivo" : "otro");
  if (!t.trim()) return d.trim() ? fin("sin_titulo", "con_descripcion") : fin("sin_titulo", "vacio");

  if (tel) {
    const s = conSesiones(); if (s) return s;
    if (/VALORACI/.test(T + " " + D)) return fin("valoracion");
    if (RE_CERA.test(T + " " + D)) return fin("cera");
    if (RE_PAGO_EV.test(D) && (base.conTicket || /RECIBO|PAGO|ANTICIPO/.test(D)) || /\bPAGO\b/.test(D)) return fin("pago");
    if (RE_SEGUIMIENTO.test(D)) return fin("seguimiento");
    if (RE_OTRO.test(T + " " + D)) return fin("otro_servicio", "sin_numero_de_sesion");
    if (RE_VENTA.test(T + " " + D)) return fin("venta_producto", "con_celular");
    if (!d.trim()) return fin("cita_sin_detalle", "sin_descripcion");
    return fin("cita_sin_detalle", "descripcion_no_reconocida");
  }
  // sin celular en el título
  if (RE_COMIDA.test(T)) return fin("comida");
  if (RE_JUNTA.test(T) || RE_JUNTA.test(D.slice(0, 200))) return fin("junta");
  if (RE_VENTA.test(T)) return fin("venta_producto");
  if (RE_CUMPLE.test(T)) return fin("cumple");
  if (RE_TAREA.test(T)) return fin("tarea");
  if (RE_BLOQUEO.test(T)) return fin("bloqueo");
  if (base.conTicket || RE_PAGO_EV.test(D)) { const s = conSesiones(); if (!s) return fin("pago", "sin_celular"); }
  if (/VALORACI/.test(T + " " + D)) return fin("valoracion", "sin_celular");
  const s2 = conSesiones(); if (s2) return { ...s2, categoria: "cita_sin_celular", sub: "con_sesion" };
  if (RE_CERA.test(T + D) || RE_OTRO.test(T + D) || telD || base.ok) return fin("cita_sin_celular", telD ? "celular_en_descripcion" : "sin_celular");
  if (RE_SEGUIMIENTO.test(D) || RE_TAREA.test(D)) return fin("tarea", "por_descripcion");
  if (nombreLike(base.nombre)) return fin("cita_sin_celular", d.trim() ? "sin_servicio" : "sin_descripcion");
  return fin("sin_clasificar");
}
