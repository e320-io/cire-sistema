// @ts-nocheck
// Motor de tarjetas de lealtad: de eventos de Google Calendar a paquetes por clienta (con confianza y grupo estricto).
// Portado SIN CAMBIOS DE LÓGICA del prototipo validado por Fer (tandas y controles, nov-2026). Funciones puras: sin red ni archivos.
// Las reglas del negocio están documentadas en docs/calendario-clasificador.md y en la memoria del proyecto.
import { clasificar, UP } from "./calendario-clasificador.ts";
const DIA = 864e5;
const Enlace = (() => {
const limpia = (n) => UP(String(n ?? "").replace(/\p{Extended_Pictographic}[\u{FE0F}\u{200D}]*/gu, "").replace(/\(.*?\)/g, " ").replace(/^\s*\d{1,2}\s?(TA|RA|DA|VA|MA|ER|A|O|°)?(?=\p{L})/iu, "")).replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["DE", "LA", "DEL", "LOS", "LAS", "Y", "SIN", "CON", "MA", "MARIA"].filter((x) => x !== "MARIA"));
const toks = (n) => limpia(n).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 9; const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
const tel10 = (t) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
const GEN = new Set(["COMBO", "COMPLETO", "COMPLETA", "COMPLETAS", "MEDIO", "MEDIA", "MEDIAS", "Y", "BASICO", "SEXY", "FRENCH"]);
const zt = (z) => new Set(UP(z).split(/[^A-Z]+/).filter((w) => w.length > 2 && !GEN.has(w)));

function armarPool(ev, sis, paq) { // ev: [{e,i,r}] eventos clasificados · sis: clientas del sistema (de la sucursal) · paq: paquetes del sistema (de la sucursal)
  const paqPorId = new Map(); for (const p of paq) paqPorId.set(p.clienta_id, [...(paqPorId.get(p.clienta_id) ?? []), p]);
  const pool = new Map(); const get = (t) => { let c = pool.get(t); if (!c) pool.set(t, (c = { tel: t, evs: [], sisNames: [], sisZonas: new Set() })); return c; };
  for (const x of ev) if (x.r.tel) { const nT = toks(x.r.nombre); get(x.r.tel).evs.push({ i: x.i, fecha: x.e.ini.slice(0, 10), toks: nT, zonas: x.r.sesiones.map((s) => s.zona), ns: x.r.sesiones.map((s) => s.n).filter((n) => n != null) }); }
  for (const c of sis) { if (!tel10(c.telefono)) continue; const g = get(tel10(c.telefono)); g.sisNames.push(toks(c.nombre)); for (const p of paqPorId.get(c.id) ?? []) zt(p.servicio).forEach((w) => g.sisZonas.add(w)); }
  const vocab = new Map(); for (const c of pool.values()) { const all = new Set([...c.evs.flatMap((e) => e.toks), ...c.sisNames.flat()]); for (const t of all) { if (!vocab.has(t)) vocab.set(t, new Set()); vocab.get(t).add(c.tel); } }
  return { ev, pool, vocab };
}
const cacheExp = new WeakMap();
const expand = (t, vocab) => { let m = cacheExp.get(vocab); if (!m) cacheExp.set(vocab, (m = new Map())); const k = t; if (m.has(k)) return m.get(k); const r = []; for (const v of vocab.keys()) { if (v === t) r.push([v, 1]); else if (t.length >= 5 && lev(t, v) <= 1) r.push([v, 0.85]); else if (t.length >= 4 && v.startsWith(t)) r.push([v, 0.8]); } m.set(k, r); return r; };

// Devuelve candidatos ordenados {tel, score, nombre, ctx}. excluirEv: índice del evento a ignorar (validación).
function resolver({ vocab, pool }, nombre, fecha, zonas, ns, excluirEv = -1) {
  const T = toks(nombre); if (!T.length) return [];
  const cand = new Map();
  for (const t of T) for (const [v, w] of expand(t, vocab)) for (const tel of vocab.get(v)) { const c = cand.get(tel) ?? { hit: new Map() }; cand.set(tel, c); c.hit.set(t, Math.max(c.hit.get(t) ?? 0, w)); }
  const zE = new Set(zonas.flatMap((z) => [...zt(z)]));
  const out = [];
  for (const [tel, c] of cand) {
    const P = pool.get(tel); const evs = P.evs.filter((e) => e.i !== excluirEv);
    // el candidato debe seguir existiendo sin el evento excluido
    if (!evs.length && !P.sisNames.length) continue;
    // ¿los tokens que coincidieron siguen respaldados sin el evento excluido?
    const aval = new Set([...evs.flatMap((e) => e.toks), ...P.sisNames.flat()]);
    let suma = 0, cubiertos = 0; for (const t of T) { const w = [...expand(t, vocab)].filter(([v]) => aval.has(v)).map(([, w]) => w); if (w.length) { cubiertos++; suma += Math.max(...w); } }
    if (!cubiertos) continue;
    const cobertura = cubiertos / T.length; let name = 0;
    if (T.length >= 2) name = cobertura === 1 ? (suma / T.length >= 0.99 ? 1 : 0.85) : cubiertos >= 2 && cobertura >= 0.66 ? 0.7 : 0; else name = suma >= 1 ? 0.5 : 0.35;
    if (!name) continue;
    let ctx = 0; const previos = evs.filter((e) => e.fecha <= fecha).map((e) => e.fecha).sort();
    if (previos.length) { const dias = (Date.parse(fecha) - Date.parse(previos.at(-1))) / 864e5; if (dias <= 200) ctx += 0.25; if (dias <= 60) ctx += 0.1; }
    const zC = new Set([...evs.flatMap((e) => e.zonas.flatMap((z) => [...zt(z)])), ...P.sisZonas]); if ([...zE].some((w) => zC.has(w))) ctx += 0.3;
    if (ns.length) { const prev = Math.max(0, ...evs.filter((e) => e.fecha < fecha).flatMap((e) => e.ns)); const n = Math.max(...ns); if (prev && n === prev + 1) ctx += 0.3; else if (prev && n > prev && n <= prev + 2) ctx += 0.15; }
    out.push({ tel, score: +(name + ctx).toFixed(2), name, ctx: +ctx.toFixed(2) });
  }
  return out.sort((a, b) => b.score - a.score);
}
function decidir(c) { // A = automática, B = probable, C = sin resolver
  if (!c.length) return { tier: "C", tel: null }; const [a, b] = c;
  if (a.score >= 1.15 && (!b || a.score - b.score >= 0.35)) return { tier: "A", tel: a.tel };
  if (a.score >= 0.85 && (!b || a.score - b.score >= 0.2)) return { tier: "B", tel: a.tel };
  return { tier: "C", tel: null };
}

return { armarPool, resolver, decidir, toks };
})();

// Clientas con citas RECIENTES sin ligar cuyo mejor candidato se les parece (≥0.85): su tarjeta puede estar incompleta -> no es del grupo estricto.
export function armarTarjetas({ sucursal, eventos, tickets = [], clientasSis = [], paquetesSis = [], ahoraMs, hoy }) {
  const ahora = ahoraMs ?? Date.now();
  const HOY = hoy ?? new Date(ahora).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  // ---- 1) enlace por nombre de las citas sin celular ----
  const evC = eventos.map((e, i) => ({ e, i, r: clasificar(e) }));
  const POOL = Enlace.armarPool(evC, clientasSis.filter((c) => c.sucursal_nombre === sucursal), paquetesSis.filter((p) => p.sucursal_nombre === sucursal));
  const linkDe = new Map(); const sospechosas = new Set(); const corte120 = new Date(ahora - 120 * DIA).toISOString().slice(0, 10);
  for (const { e, i, r } of evC) { if (r.categoria !== "cita_sin_celular") continue;
    const c = Enlace.resolver(POOL, r.nombre, e.ini.slice(0, 10), r.sesiones.map((x) => x.zona), r.sesiones.map((x) => x.n).filter((n) => n != null));
    const d = Enlace.decidir(c); linkDe.set(e.id, { id: e.id, tier: d.tier, tel: d.tel });
    if (d.tier === "C" && e.ini.slice(0, 10) >= corte120 && c[0] && c[0].score >= 0.85) sospechosas.add(c[0].tel); }
  // ---- 2) paquetes ----
const MOD = new Set(["MEDIA", "MEDIO", "MEDIAS", "COMPLETO", "COMPLETA", "COMPLETAS", "BAJA", "ALTA", "SUPERIOR", "INFERIOR", "Y", "DE", "SIN", "ZONA", "ZONAS", "CON", "DIODO", "LASER", "MANTENIMIENTO"]);
const COMBOS = { "COMBO SEXY": ["PIERNAS", "AXILAS", "BIKINI"], "COMBO PLAYA": ["PIERNAS", "AXILAS", "BIKINI"], "COMBO BIKINI": ["AXILAS", "BIKINI"], "COMBO PIERNAS": ["PIERNAS", "BIKINI"], "COMBO AXILAS": ["AXILAS", "PIERNAS"] };
const CUERPO = ["AXILAS", "BIKINI", "BRAZILIAN", "PIERNAS", "BRAZOS", "ABDOMEN", "ESPALDA", "GLUTEOS", "PECHO", "MANOS", "PIES", "CUELLO"];
const comboDe = (z) => { const k = Object.keys(COMBOS).find((c) => z.includes(c)); return k ? { nombre: k, incluye: COMBOS[k] } : null; };
const tokens = (z) => { const t = new Set(z.split(/[^A-Z]+/).filter((w) => w.length > 2 && !MOD.has(w))); const c = comboDe(z); if (c) c.incluye.forEach((x) => t.add(x)); if (/CUERPO COMPLETO/.test(z)) CUERPO.forEach((x) => t.add(x)); return t; };
const sub = (a, b) => [...a].every((x) => b.has(x));
const dd = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DIA;
const TRAT = /DESPIGMENT|HIFU|MOLDEO|FACIAL|SKIN|PDRN|LIPOLASER|BABY CLEAN|CIRE|SCULPT|ANTICEL|POST/;
const familia = (G) => [...new Set([...G.zonas].map((z) => (z.match(TRAT) ?? [""])[0]))].filter(Boolean).sort().join("+");
const cerro = (G) => G.ev.filter((e) => e.n != null && e.n >= 8 && !e.fut).map((e) => e.fecha).sort()[0];
const nuevoDespues = (A, B) => { const d = cerro(A); return !!d && B.ev.some((y) => y.n != null && y.n < 8 && y.fecha > d); }; // sesiones bajas DESPUÉS de una S8 = paquete nuevo
const compat = (A, B) => { if (familia(A) !== familia(B)) return false; if (nuevoDespues(A, B) || nuevoDespues(B, A)) return false; if (!!A.mant !== !!B.mant) return false; if (A.total && B.total && A.total !== B.total) return false; for (const x of A.ev) for (const y of B.ev) if (x.n != null && y.n != null && x.n === y.n && !x.fut && !y.fut && dd(x.fecha, y.fecha) > 20) return false; return true; };
const nums = (G) => [...new Set(G.ev.map((e) => e.n).filter((n) => n != null))].sort((a, b) => a - b);
const contiguo = (n) => n.length > 0 && n[n.length - 1] - n[0] + 1 === n.length;
// Una sesión numerada baja (<8) DESPUÉS de una S8 de la misma zona = otro paquete (ej. recompra o mantenimiento): se parte en ciclos.
function partirCiclos(g) {
  const ev = [...g.ev].sort((a, b) => a.fecha.localeCompare(b.fecha)); const ciclos = [[]]; let fecha8 = null, maxN = 0;
  for (const e of ev) {
    const cur = ciclos[ciclos.length - 1];
    const bajaS8 = e.n != null && fecha8 && e.n < 8 && e.fecha > fecha8 && dd(e.fecha, fecha8) > 28;                                             // sesión baja después de una S8
    const bajaFuerte = e.n != null && maxN >= 4 && e.n <= maxN - 3 && cur.length && dd(e.fecha, cur[cur.length - 1].fecha) > 14; // el número cae ≥3 (S7 → S2): paquete nuevo
    if (bajaS8) { ciclos.push([]); fecha8 = null; maxN = 0; }
    else if (bajaFuerte) { const pico = cur.map((x) => x.n).lastIndexOf(maxN); const cola = cur.splice(pico + 1); ciclos.push(cola); fecha8 = null; maxN = 0; }
    ciclos[ciclos.length - 1].push(e); if (e.n != null) maxN = Math.max(maxN, e.n); if (e.n != null && e.n >= 8 && !e.fut && !fecha8) fecha8 = e.fecha;
  }
  const conReglas = (cc, base) => { const total = Math.max(0, ...cc.map((x) => x.t ?? 0)) || null; const mant = cc.some((x) => x.m) || (total === 4 && base.laser);   // láser de 4 sesiones = mantenimiento
    return { ...base, zonas: new Set(base.zonas), ev: cc, total: total ?? (ciclos.length > 1 ? null : base.total), mant, regalo: cc.some((x) => x.reg), tk: base.tk }; };
  return ciclos.length === 1 ? [conReglas(ciclos[0], g)] : ciclos.map((c) => conReglas(c, g));
}
function unir(A, B) { A.ev.push(...B.ev); B.zonas.forEach((z) => A.zonas.add(z)); A.laser = A.laser || B.laser; A.mant = A.mant || B.mant; A.regalo = A.regalo || B.regalo; A.total = Math.max(A.total ?? 0, B.total ?? 0) || null; A.tk = tokens([...A.zonas].sort((a, b) => b.length - a.length)[0] + " " + [...A.zonas].join(" ")); }
function fusionar(gs) {
  let cambio = true;
  while (cambio) { cambio = false; gs.sort((a, b) => b.tk.size - a.tk.size || b.ev.length - a.ev.length);
    // paso 1: una zona contenida en otra (o igual) y sin contradicciones
    out1: for (let i = 0; i < gs.length; i++) for (let j = gs.length - 1; j > i; j--) { const A = gs[i], B = gs[j];
      if (!B.tk.size || !sub(B.tk, A.tk) || !compat(A, B)) continue;
      const otros = A.tk.size === B.tk.size ? [] : gs.filter((x, k) => k !== i && k !== j && x.tk.size !== A.tk.size && sub(B.tk, x.tk) && compat(x, B)); if (otros.length) continue;
      unir(A, B); gs.splice(j, 1); cambio = true; break out1; }
    if (cambio) continue;
    // paso 3: una sola cita S1 (zona "huérfana") que cae 14–60 días antes de la S2 de OTRO paquete sin S1 = zona mal escrita en la 1ª cita
    out3: for (let i = 0; i < gs.length; i++) { const O = gs[i], nO = nums(O); if (nO.length !== 1 || nO[0] !== 1 || O.ev.length !== 1 || O.ev[0].fut || familia(O) !== "") continue;
      for (let j = 0; j < gs.length; j++) { if (i === j) continue; const B = gs[j], nB = nums(B); if (!nB.length || Math.min(...nB) !== 2 || familia(B) !== "" || !!B.mant !== !!O.mant) continue;
        const s2 = B.ev.filter((e) => e.n === 2).sort((x, y) => x.fecha.localeCompare(y.fecha))[0]; const g = dd(O.ev[0].fecha, s2.fecha); if (O.ev[0].fecha < s2.fecha && g >= 14 && g <= 60) { B.nombreFijo = B.nombreFijo ?? [...B.zonas].sort((x, y) => tokens(y).size - tokens(x).size || y.length - x.length)[0]; B.nota1 = "la 1ª cita decía «" + [...O.zonas][0] + "» (parece error de captura de la zona)"; unir(B, O); gs.splice(i, 1); cambio = true; break out3; } } }
    if (cambio) continue;
    // paso 2: zonas que comparten una zona base y cuyas sesiones continúan una misma secuencia (combos con zona "a elegir")
    out2: for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) { const A = gs[i], B = gs[j];
      const famBik = (G) => [...G.zonas].some((z) => /BRAZILIAN|FRENCH|SEXY BIKINI|BASICO|^BIKINI$/.test(z) && !/COMBO/.test(z));
      const comun = [...A.tk].filter((x) => B.tk.has(x) && x !== "COMBO"); const mismaFamilia = famBik(A) && famBik(B);
      if ((!comun.length && !mismaFamilia) || !compat(A, B)) continue;
      const nA = nums(A), nB = nums(B); if (!nA.length || !nB.length) continue;
      const u = [...new Set([...nA, ...nB])].sort((a, b) => a - b); if (!contiguo(u)) continue;
      if (mismaFamilia && !comun.length) { const za = [...A.zonas].sort((x, y) => y.length - x.length)[0], zb = [...B.zonas].sort((x, y) => y.length - x.length)[0]; A.notaCambio = "la zona de bikini cambió durante el paquete: " + (nums(A)[0] <= nums(B)[0] ? bonito(za) + " → " + bonito(zb) : bonito(zb) + " → " + bonito(za)); A.nombreFijo = A.nombreFijo ?? (nums(A)[0] <= nums(B)[0] ? zb : za); } // se queda el nombre más reciente
      unir(A, B); gs.splice(j, 1); cambio = true; break out2; }
  }
  return gs;
}

// ---- Segunda fuente: tickets de Zettle (qué se compró y de cuántas sesiones) ----
const TKS = tickets, CLIS = clientasSis;
const t10 = (t) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
const UPs = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const telDeId = new Map(CLIS.map((c) => [c.id, t10(c.telefono)]));
const STOPN = new Set(["DE", "LA", "DEL", "LOS", "LAS", "Y"]); const GEN2 = new Set(["MUJER", "HOMBRE", "PACK", "ZONAS", "SES", "SESION", "SESIONES", "COMBO"]);
const memoNom = new Map(); // el mismo nombre se normaliza miles de veces (un paquete × cada ticket): se guarda
  const nomTk = (n) => { let r = memoNom.get(n); if (!r) { r = new Set(UPs(n).replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOPN.has(w))); memoNom.set(n, r); } return r; };
const mismoNombre = (A, B) => { if (A.size < 2 || B.size < 2) return false; const [c, l] = A.size <= B.size ? [A, B] : [B, A]; return [...c].every((x) => l.has(x)) || [...c].filter((x) => l.has(x)).length >= 3; };
const totalDeServ = (s) => { const m = s.match(/\((\d{1,2})\s*SES/) || s.match(/(\d{1,2})\s*SES(?:ION|IONES)?\b/) || s.match(/\bSESIONES?\s*(\d{1,2})\b/); return m ? +m[1] : null; };
const ticketsDe = (suc) => TKS.filter((t) => t.sucursal_nombre === suc).map((t) => ({ fecha: t.fecha, tel: t.clienta_id ? telDeId.get(t.clienta_id) ?? "" : "", nom: nomTk(t.clienta_nombre),
  servs: (Array.isArray(t.servicios) ? t.servicios : []).map((raw) => { const up = UPs(raw).replace(/FULL BODY|CUERPO COMPLETO \*?\s*LASER/g, "CUERPO COMPLETO"); const tk = new Set([...tokens(up)].filter((x) => !GEN2.has(x))); return { raw, mant: /MANT/.test(up), total: totalDeServ(up), tk }; }) }));
function mejorTicket(tickets, c, g, dias) {
  const pk = new Set([...tokens([...g.zonas].join(" "))].filter((x) => x !== "COMBO")); if (!pk.size || !dias.length) return null;
  const f0 = dias[0].fecha, f1 = dias[dias.length - 1].fecha; let mejor = null;
  for (const t of tickets) {
    if (!((c.tel && t.tel === c.tel) || mismoNombre(nomTk(c.nombre), t.nom))) continue;
    if (dd(t.fecha, f0) > 120 && t.fecha < f0) continue; if (t.fecha > f1 && dd(t.fecha, f1) > 45) continue;
    for (const s of t.servs) { if (!!s.mant !== !!g.mant) continue; const inter = [...s.tk].filter((x) => pk.has(x)).length; if (!inter || inter < Math.min(pk.size, s.tk.size) * 0.5) continue;
      const sc = inter - 0.3 * (s.tk.size - inter) - Math.min(dd(t.fecha, f0), 120) / 400; if (!mejor || sc > mejor.sc) mejor = { sc, fecha: t.fecha, servicio: s.raw, total: s.total }; } }
  return mejor;
}
// ---- Confianza: ¿puedo mandar esta tarjeta sin que nadie la revise? ----
const mediana = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
function confianza({ dias, total, porConfirmar, tkt, conflicto, pasadas }) {
  const mot = []; const num = dias.filter((d) => d.n != null && !d.suelta).sort((x, y) => x.fecha.localeCompare(y.fecha));
  if (!num.length) { if (!(pasadas.length && pasadas.every((d) => d.ok))) mot.push("sin números"); } // sin números pero todas con ✅: se cuenta por días
  // (total desconocido ya no bloquea: la tarjeta muestra "N sesiones" sin "de N")
  if (conflicto) mot.push("total distinto al del ticket");
  if (porConfirmar) mot.push("por confirmar");
  if (dias.some((d) => d.ligada === "B")) mot.push("ligada probable");
  // cadencia entre sesiones consecutivas (≈ 4 semanas; en Valle ≈ 6)
  const gaps = []; for (let i = 1; i < num.length; i++) if (num[i].n === num[i - 1].n + 1) gaps.push(dd(num[i].fecha, num[i - 1].fecha)); const m = mediana(gaps) ?? 35;
  for (let i = 1; i < num.length; i++) if (num[i].n < num[i - 1].n) { mot.push("numeración fuera de orden"); break; }
  const ns = [...new Set(num.map((d) => d.n))].sort((a, b) => a - b);
  for (let i = 1; i < ns.length; i++) { const k = ns[i] - ns[i - 1] - 1; if (k > 0) { const a = num.find((d) => d.n === ns[i - 1]), b = num.find((d) => d.n === ns[i]); if (dd(a.fecha, b.fecha) < (k + 1) * m * 0.7) { mot.push("huecos no explicados"); break; } } }
  // números repetidos: no bloquean (el número más alto manda y el conteo no cambia)
  const inf = dias.filter((d) => d.inf); if (inf.length) { const sig = num.find((d) => !d.inf); const g1 = sig ? dd(inf[inf.length - 1].fecha, sig.fecha) : 999; if (!(g1 >= 10 && g1 <= 75)) mot.push("numeración inferida sin cadencia"); }
  return { alta: mot.length === 0, motivos: mot };
}
const P = { BASICO: "básico", GLUTEOS: "glúteos", ESPALDA: "espalda", Y: "y", DE: "de", MENTON: "mentón", COMBO: "combo" };
const bonito = (z) => { const s = z.toLowerCase().split(" ").map((w) => P[w.toUpperCase()] ?? w).join(" "); return s.charAt(0).toUpperCase() + s.slice(1); };
const NO_8 = /HIFU|MOLDEO|FACIAL|DESPIGMENT|SKIN|PDRN|LIPOLASER|BABY CLEAN|RFF|CIRE BODY|CIRE LIFT|SCULPT|ANTICEL|POST/;


  // ---- 3) paquetes por clienta ----

  const ev = eventos;
  const TICKETS = ticketsDe(sucursal);
  const C = new Map(), UPx = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const compraMant = new Map(); // tel -> {fecha, tk}  ("COMPRO MANTENIMIENTO DE AXILAS GLUTEOS Y BIKINI ...")
  for (const e of ev) { const r0 = clasificar(e); const m = UPx(e.d).match(/COMPRO\s+MANTENIMIENTO\s+(?:DE\s+)?([A-Z ,Y]{4,60})/); if (m && r0.tel) { const prev = compraMant.get(r0.tel); const tk = tokens(m[1]); if (!prev || e.ini.slice(0, 10) < prev.fecha) compraMant.set(r0.tel, { fecha: e.ini.slice(0, 10), tk }); } }
  for (const e of ev) {
    const r = clasificar(e); if (!r.sesiones.length || !["sesion", "cita_sin_celular"].includes(r.categoria)) continue;
    const lk = r.categoria === "cita_sin_celular" ? linkDe.get(e.id) : null; let tel = r.tel, ligada = null; if (lk && lk.tier !== "C") { tel = lk.tel; ligada = lk.tier; }
    const nombre = r.nombre.replace(/^\d{1,2}\s?(ta|ra|da|va|ma|er|a|o|°)?(?=\p{L})/iu, "").replace(/[-\s]+$/, "").trim();
    const key = tel || "N:" + nombre.toUpperCase(); const c = C.get(key) ?? { key, tel, nombre, titulos: [], gs: new Map() }; C.set(key, c);
    c.titulos.push({ f: e.ini.slice(0, 10), t: e.t.replace(/[‎‏‪-‮]/g, "") });
    const fecha = e.ini.slice(0, 10), fut = Date.parse(e.ini) > ahora;
    const nMant = new Set(r.sesiones.filter((s) => s.mant && s.n != null).map((s) => s.n)); const cm = tel ? compraMant.get(tel) : null;
    for (const s of r.sesiones) {
      if (s.n != null && nMant.has(s.n)) s.mant = true;                                   // mismo evento y misma sesión que una línea de mantenimiento
      if (cm && fecha >= cm.fecha && s.n != null && s.n <= 4 && sub(new Set([...tokens(s.zona)].filter((x) => x !== "COMBO")), cm.tk) && tokens(s.zona).size) s.mant = true; // posterior a "COMPRO MANTENIMIENTO"
      const gk = s.zona + (s.mant ? "|M" : "");
      const g = c.gs.get(gk) ?? { zonas: new Set([s.zona]), ev: [], laser: false, mant: false, total: null, tk: tokens(s.zona) }; c.gs.set(gk, g);
      g.laser = g.laser || s.laser; g.mant = g.mant || s.mant; if (s.total) g.total = Math.max(g.total ?? 0, s.total);
      g.regalo = g.regalo || !!s.regalo;
      g.ev.push({ nr: !!s.noRealizada, nt: s.nota, t: s.total, m: s.mant, reg: !!s.regalo, n: s.n, fecha, ok: r.ok && !fut && !r.noLlego && !s.noRealizada && ligada !== "B", no: r.noLlego || !!s.noRealizada, fut, ligada, z: s.zona, ultima: s.ultima });
    }
  }
  const salida = [];
  for (const c of C.values()) {
    const sinZona = []; const grupos = [...c.gs.values()].flatMap(partirCiclos).filter((g) => { if ([...g.zonas].every((z) => z === "SIN ZONA")) { sinZona.push(...g.ev.map((x) => ({ fecha: x.fecha, n: x.n }))); return false; } return true; });
    const paquetes = fusionar(grupos).filter((g) => !g.ev.every((e) => e.no && !e.fut)).map((g) => {
      // 1) una sesión por día
      const porDia = new Map(); for (const x of g.ev.sort((a, b) => a.fecha.localeCompare(b.fecha))) { const d = porDia.get(x.fecha) ?? { fecha: x.fecha, ns: new Set(), ok: false, no: false, fut: x.fut, zonas: new Set(), ligada: null }; porDia.set(x.fecha, d);
        if (x.n != null) d.ns.add(x.n); d.ok = d.ok || x.ok; d.no = d.no || x.no; d.ult = d.ult || x.ultima; if (x.nt) d.nt = x.nt; d.zonas.add(x.z); if (x.ligada) d.ligada = x.ligada; }
      let dias = [...porDia.values()].map((d) => ({ ...d, n: d.ns.size ? Math.max(...d.ns) : null, inf: false, suelta: false, zonas: [...d.zonas] }));
      // 2) sesiones sin número ANTES de la primera numerada: se numeran hacia atrás; después de una numerada y a ≤21 días: zona suelta (no cuenta como sesión)
      const iPrimera = dias.findIndex((d) => d.n != null);
      if (iPrimera > 0) { const k = iPrimera, firstN = dias[iPrimera].n; if (firstN - 1 >= k) for (let i = 0; i < k; i++) { dias[i].n = firstN - (k - i); dias[i].inf = true; } }
      for (let i = 0; i < dias.length; i++) for (let j = 0; j < i; j++) if (dias[i].n != null && dias[i].n === dias[j].n && !dias[j].suelta && !dias[i].fut && dd(dias[i].fecha, dias[j].fecha) <= 21) { dias[i].suelta = true; break; }
      let ultimaNum = null; for (const d of dias) { if (d.n != null && !d.inf) ultimaNum = d; else if (d.n == null && ultimaNum && dd(d.fecha, ultimaNum.fecha) <= 21 && !d.fut) d.suelta = true; }
      // 2b) total previo y "Última sesión": si el evento dice "última", ese día es la sesión N del paquete
      const zTxt0 = [...g.zonas].join(" "); const tkt = mejorTicket(TICKETS, c, g, dias); const conflicto = !!(g.total && tkt?.total && g.total !== tkt.total);
      const totalPre = g.regalo ? 1 : g.total ?? tkt?.total ?? (g.laser && !g.mant && !NO_8.test(zTxt0) ? 8 : null);
      for (const d of dias) if (d.ult && d.n == null && totalPre) d.n = totalPre;
      // 3) sellos
      const pasadas = dias.filter((d) => !d.fut && !d.suelta), oks = pasadas.filter((d) => d.ok), numerados = dias.filter((d) => d.n != null && !d.suelta);
      const viejas = pasadas.filter((d) => d.n != null && !d.no && d.fecha < HOY), maxVieja = Math.max(0, ...viejas.map((d) => d.n));
      const maxOk = Math.max(0, ...oks.filter((d) => d.n != null).map((d) => d.n), maxVieja), anyMax = Math.max(0, ...numerados.map((d) => d.n)), implicado = anyMax >= 2 ? anyMax - 1 : 0;
      const primeraN = numerados.length ? Math.min(...numerados.map((d) => d.n)) : 1, conteo = oks.length;
      // total
      const zTxt = [...g.zonas].join(" "), comboInfo = [...g.zonas].map(comboDe).find(Boolean), noOcho = NO_8.test(zTxt);
      let total = totalPre; let totalSupuesto = false; const ns0 = numerados.map((d) => d.n), repetido = ns0.length !== new Set(ns0).size, diasPas = pasadas.filter((d) => !d.no && d.fecha < HOY).length;
      let sellos = Math.max(maxOk, implicado, conteo, repetido ? diasPas : 0); // "1° 1° 1° 1°" copiado y pegado: cada día pasado es una sesión
      if (g.mant && !total && sellos >= 4) { total = 4; totalSupuesto = true; } // mantenimiento con ≥4 sesiones: casi seguro ya terminó (los totales conocidos son 1, 2 o 4)
      if (!total && /FACIAL|SKIN|HIFU|CIRE LIFT|BIENESTAR/.test(zTxt0) && !dias.some((d) => d.fut) && sellos >= 1) { total = sellos; totalSupuesto = true; } // facial/HIFU suelen ser de 1 sesión
      if (total) sellos = Math.min(sellos, total);
      const ultPas = [...pasadas].reverse().find((d) => d.n != null); const porConfirmar = ultPas && ultPas.n > sellos && !ultPas.ok ? { n: ultPas.n, fecha: ultPas.fecha } : null;
      const prox = dias.filter((d) => d.fut).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]; const ultFecha = pasadas.map((d) => d.fecha).sort().pop();
      const estado = total && sellos >= total ? "completo" : prox || (ultFecha && (ahora - Date.parse(ultFecha)) / DIA <= 120) ? "activo" : "inactivo";
      const nombre = g.nombreFijo ? g.nombreFijo : comboInfo ? [...g.zonas].filter((z) => z.includes("COMBO")).sort((a, b) => b.length - a.length)[0] : [...g.zonas].sort((a, b) => tokens(b).size - tokens(a).size || b.length - a.length)[0];
      const conf = confianza({ dias, total, porConfirmar, tkt, conflicto, pasadas });
      const notas = []; if (g.nota1) notas.push(g.nota1); if (g.notaCambio) notas.push(g.notaCambio); if (dias.some((d) => d.inf)) notas.push("numeré la(s) sesión(es) anterior(es) a la primera con número"); if (dias.some((d) => d.suelta)) notas.push("hay citas de zona suelta pegadas a una sesión del combo");
      return { totalSupuesto, confianza: conf, ticket: tkt ? { fecha: tkt.fecha, servicio: tkt.servicio, total: tkt.total } : null, regalo: !!g.regalo, nombre: bonito(nombre), crudo: nombre, combo: comboInfo ? { nombre: bonito(comboInfo.nombre), incluye: comboInfo.incluye.map((x) => bonito(x)) } : null, mant: g.mant, tipo: g.mant ? "mantenimiento" : noOcho ? "otro" : g.laser ? "laser" : "otro", total, sellos, porConfirmar, estado, proxima: prox ? { fecha: prox.fecha, n: prox.n } : null,
        ultima: ultFecha ?? null, variantes: [...g.zonas].filter((z) => z !== nombre).map(bonito), notas,
        leyendas: dias.filter((d) => d.nt).map((d) => ({ fecha: d.fecha, texto: d.nt })), sesiones: dias.map((d) => ({ fecha: d.fecha, n: d.n, inf: d.inf, ok: d.ok, no: d.no, fut: d.fut, suelta: d.suelta, zonas: d.zonas.map(bonito), ligada: d.ligada })) };
    });
    const t = c.titulos.sort((a, b) => b.f.localeCompare(a.f))[0]?.t ?? "";
    salida.push({ tel: c.tel, nombre: c.nombre, titulo: t, paquetes, sinAsignar: sinZona });
  }

  // ---- 4) grupo estricto ----
  const esEstricta = (c) => { if (c.tel && sospechosas.has(c.tel)) return false; const ps = c.paquetes.filter((p) => p.estado !== "inactivo"); if (!ps.some((p) => p.estado === "activo") || ps.length > 3) return false;
    return ps.every((p) => { const num = p.sesiones.filter((s) => !s.suelta); const ns = num.map((s) => s.n);
      return p.confianza.alta && p.tipo === "laser" && !p.mant && !p.regalo && !p.totalSupuesto && p.total === 8 && num.length && ns.every((n) => n != null) && !p.sesiones.some((s) => s.inf) && ns.length === new Set(ns).size; }); };
  for (const c of salida) { c.estricta = esEstricta(c); c.nivel = c.estricta ? "estricto" : (c.paquetes.filter((p) => p.estado !== "inactivo").length <= 4 && c.paquetes.filter((p) => p.estado !== "inactivo").every((p) => p.confianza.alta)) ? "alta" : "revisar"; }
  return { clientas: salida, sospechosas: [...sospechosas] };
}
