// Direcciones de producción (dominio de CIRE; el DNS está en Wix y apunta a Vercel).
// DOMINIO_PUBLICO: lo que ve la clienta (agendar, opiniones, tarjeta de lealtad). DOMINIO_EQUIPO: el sistema de recepción.
// Los enlaces y QR siempre apuntan a producción (no a una vista previa de Vercel, que muestra la barra de Vercel y puede pedir login).
export const DOMINIO_PUBLICO = "https://ciredepilacion.com"; // el sitio principal presta /agendar, /opinion y /tarjeta (rewrites en cire-site); también abre en agenda.ciredepilacion.com
export const DOMINIO_EQUIPO = "https://ciredepilacion.com/sistema"; // también abre en https://sistema.ciredepilacion.com

// El sistema del equipo se sirve en sistema.ciredepilacion.com (raíz) y en ciredepilacion.com/sistema (el sitio principal lo "presta" con un rewrite).
// Bajo /sistema la ruta real llega con ese prefijo: se lo quitamos para decidir la pantalla y se usa como base al "volver al inicio".
export const PREFIJO_SISTEMA = /^\/sistema(\/|$)/.test(location.pathname) ? "/sistema" : "";
export const rutaLimpia = (p = location.pathname) => p.replace(/^\/sistema(?=\/|$)/, "") || "/";
