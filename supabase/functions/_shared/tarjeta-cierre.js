// Tarjeta de cierre de mensajes (1080 x 1440, 3:4) como árbol de elementos para satori: se dibuja en el servidor, sin navegador.
// Mismo diseño que la maqueta aprobada (identidad CIRE): fondo de marca por día, paneles blancos, color fijo por servicio.
// Medidas en px (1 % del ancho = 10.8 px). La letra más chica mide ~31 px para que se lea en el celular.

export const ANCHO = 1080;
export const ALTO = 1440;

const COLOR = {
  vino: "#6D1736", turquesaOs: "#02868B", ink2: "rgba(109,23,54,0.66)", track: "#FBD9E8", linea: "rgba(109,23,54,0.13)", down: "#C93876",
  servicio: { "Láser": "#02CDD2", HIFU: "#6D1736", Bikini: "#F57DB2", Facial: "#F2B93C", Moldeo: "#86B8F5", Otro: "#B9A8B3" },
};
// Un fondo por día de la semana (0 = lunes ... 6 = domingo)
export const TEMAS = [
  { bg: "#F988BC", hero: "#FFFFFF", fill: "#6D1736" }, { bg: "#01D3D7", hero: "#FFFFFF", fill: "#02868B" }, { bg: "#6D1736", hero: "#FFFFFF", fill: "#C93876" },
  { bg: "#C93876", hero: "#FFFFFF", fill: "#C93876" }, { bg: "#F9C6D9", hero: "#6D1736", fill: "#6D1736" }, { bg: "#02868B", hero: "#FFFFFF", fill: "#02868B" },
  { bg: "#FFEAF3", hero: "#6D1736", fill: "#6D1736" },
];
const ORDEN = ["Láser", "HIFU", "Bikini", "Facial", "Moldeo", "Otro"];

// Helpers: todo div lleva display:flex (satori lo exige)
const h = (type, style, ...hijos) => ({ type, props: { style: { display: "flex", ...style }, children: hijos.length === 1 ? hijos[0] : hijos } });
const t = (style, texto) => h("div", { lineHeight: 1.2, ...style }, String(texto));
const fmt = (n) => Math.round(n).toLocaleString("es-MX");
const cpm = (v) => (v < 10 ? "$" + v.toFixed(1) : "$" + Math.round(v));

const loto = (color, px) => ({
  type: "svg",
  props: {
    width: px, height: px, viewBox: "0 0 100 100", fill: "none",
    children: [
      { type: "path", props: { d: "M50 10 C38 26 38 46 50 62 C62 46 62 26 50 10Z", stroke: color, strokeWidth: 4.2, strokeLinejoin: "round", fill: "none" } },
      { type: "path", props: { d: "M50 62 C34 60 22 50 19 34 C34 35 44 44 50 62Z", stroke: color, strokeWidth: 4.2, strokeLinejoin: "round", fill: "none" } },
      { type: "path", props: { d: "M50 62 C66 60 78 50 81 34 C66 35 56 44 50 62Z", stroke: color, strokeWidth: 4.2, strokeLinejoin: "round", fill: "none" } },
      { type: "path", props: { d: "M12 76 H88", stroke: color, strokeWidth: 3.2, strokeLinecap: "round" } },
    ],
  },
});
const flecha = (sube, color, px) => ({
  type: "svg",
  props: { width: px, height: px, viewBox: "0 0 10 10", children: [{ type: "path", props: { d: sube ? "M5 1.2 L9.6 8.8 L0.4 8.8 Z" : "M5 8.8 L9.6 1.2 L0.4 1.2 Z", fill: color } }] },
});

/** D = { fecha, total, vsProm, meta, mes, ideal, cierre, mesNombre, tema, sucs: [{ n, m, d, v: { servicio: [mensajes, costoPorMensaje] } }] } */
export function tarjetaCierre(D) {
  const T = TEMAS[D.tema] || TEMAS[0];
  const W = Math.round(ANCHO - 2 * 49.7); // ancho útil de cada bloque (satori no reparte solo el ancho)
  const anchoPanel = W - 2 * 41;
  const neg = D.vsProm != null && D.vsProm < 0;
  const idealPx = Math.min(1, D.ideal / D.meta) * anchoPanel;

  const filas = D.sucs.map((s, i) => {
    const lista = ORDEN.filter((n) => s.v[n]).map((n) => [n, s.v[n]]).sort((a, b) => b[1][0] - a[1][0]);
    const tot = lista.reduce((a, x) => a + x[1][0], 0) || 1;
    const sube = s.d >= 0;
    return h("div", { flexDirection: "column", paddingTop: i === 0 ? 0 : 9, paddingBottom: i === D.sucs.length - 1 ? 0 : 9, borderTop: i === 0 ? "0px solid transparent" : `1px solid ${COLOR.linea}` },
      h("div", { justifyContent: "space-between", alignItems: "center" },
        t({ fontSize: 43, fontWeight: 700, color: COLOR.vino }, s.n),
        h("div", { alignItems: "center" },
          t({ fontSize: 52, fontWeight: 800, color: COLOR.vino }, s.m),
          h("div", { alignItems: "center", marginLeft: 17 }, flecha(sube, sube ? COLOR.turquesaOs : COLOR.down, 28), t({ fontSize: 33, fontWeight: 700, marginLeft: 7, color: sube ? COLOR.turquesaOs : COLOR.down }, `${Math.abs(s.d)}%`)))),
      h("div", { height: 22, marginTop: 3, borderRadius: 999, overflow: "hidden" },
        ...lista.map(([n, x], k) => h("div", { width: `${(x[0] / tot) * 100}%`, height: 22, background: COLOR.servicio[n], borderRadius: 999, marginLeft: k === 0 ? 0 : 4 }, ""))),
      h("div", { marginTop: 4, alignItems: "center", height: 38 },
        ...lista.slice(0, 3).map(([n, x], k) => h("div", { alignItems: "center", marginLeft: k === 0 ? 0 : 28 },
          h("div", { width: 22, height: 22, borderRadius: 999, background: COLOR.servicio[n], marginRight: 10 }, ""),
          t({ fontSize: 31, fontWeight: 700, color: COLOR.vino }, n),
          t({ fontSize: 31, fontWeight: 500, color: COLOR.ink2, marginLeft: 8 }, `${x[0]} · ${cpm(x[1])}`)))));
  });

  return h("div", { width: ANCHO, height: ALTO, background: T.bg, color: T.hero, fontFamily: "Poppins", alignItems: "center", justifyContent: "center" },
   h("div", { width: W, height: ALTO - 76, flexDirection: "column", justifyContent: "space-between" },
    // Encabezado
    h("div", { width: W, justifyContent: "space-between", alignItems: "center" },
      h("div", { alignItems: "center", color: T.hero },
        loto(T.hero, 86),
        h("div", { flexDirection: "column", marginLeft: 26 },
          t({ fontSize: 71, fontWeight: 600, lineHeight: 1, color: T.hero }, "CIRE"),
          t({ fontSize: 24, fontWeight: 500, letterSpacing: 4.3, marginTop: 6, color: T.hero, opacity: 0.9 }, "ARTS EN DEPILACIÓN"))),
      t({ fontSize: 39, fontWeight: 700, background: COLOR.vino, color: "#FFFFFF", borderRadius: 999, padding: "14px 41px" }, D.fecha)),
    // 240 grande
    h("div", { width: W, alignItems: "center" },
      t({ fontSize: 227, fontWeight: 800, letterSpacing: -11, lineHeight: 0.9, color: T.hero }, D.total),
      h("div", { flexDirection: "column", marginLeft: 43, alignItems: "flex-start" },
        t({ fontSize: 42, fontWeight: 700, background: COLOR.vino, color: "#FFFFFF", borderRadius: 22, padding: "11px 35px" }, "mensajes ayer"),
        D.vsProm != null
          ? h("div", { alignItems: "center", marginTop: 13, background: "#FFFFFF", borderRadius: 999, padding: "10px 32px" },
              flecha(!neg, neg ? COLOR.down : COLOR.turquesaOs, 28),
              t({ fontSize: 37, fontWeight: 700, marginLeft: 9, color: neg ? COLOR.down : COLOR.turquesaOs }, `${Math.abs(D.vsProm)}% vs promedio`))
          : "")),
    // Meta del mes
    h("div", { width: W, flexDirection: "column", background: "#FFFFFF", borderRadius: 37 }, h("div", { flexDirection: "column", padding: "32px 41px" },
      h("div", { justifyContent: "space-between", alignItems: "baseline", marginBottom: 19 },
        h("div", { alignItems: "baseline" }, t({ fontSize: 36, fontWeight: 500, color: COLOR.ink2, marginRight: 10 }, `Meta de ${D.mesNombre} ·`), t({ fontSize: 43, fontWeight: 800, color: COLOR.vino }, fmt(D.meta))),
        h("div", { alignItems: "baseline" }, t({ fontSize: 43, fontWeight: 800, color: COLOR.vino }, fmt(D.mes)), t({ fontSize: 36, fontWeight: 500, color: COLOR.ink2, marginLeft: 10 }, `· ${Math.round(D.mes / D.meta * 100)}%`))),
      h("div", { position: "relative", width: anchoPanel, height: 41 },
        h("div", { position: "absolute", left: 0, top: 0, width: anchoPanel, height: 41, borderRadius: 999, background: COLOR.track }, ""),
        h("div", { position: "absolute", left: 0, top: 0, width: Math.max(14, Math.min(1, D.mes / D.meta) * anchoPanel), height: 41, borderRadius: 999, background: T.fill }, ""),
        h("div", { position: "absolute", left: idealPx - 4, top: -13, width: 9, height: 67, borderRadius: 3, background: COLOR.turquesaOs }, "")),
      h("div", { justifyContent: "space-between", alignItems: "center", marginTop: 22 },
        h("div", { alignItems: "center" }, h("div", { width: 9, height: 31, background: COLOR.turquesaOs, marginRight: 14 }, ""), t({ fontSize: 31, fontWeight: 500, color: COLOR.ink2 }, `ideal hoy ${fmt(D.ideal)}`)),
        t({ fontSize: 31, fontWeight: 500, color: COLOR.ink2 }, `cierre estimado ~${fmt(D.cierre)} · ${Math.round(D.cierre / D.meta * 100)}%`)))),
    // Sucursales
    h("div", { width: W, flexDirection: "column", background: "#FFFFFF", borderRadius: 37 }, h("div", { flexDirection: "column", padding: "30px 41px" }, ...filas))));
}
