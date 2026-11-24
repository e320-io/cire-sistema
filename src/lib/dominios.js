// Direcciones de producción (dominio de CIRE; el DNS está en Wix y apunta a Vercel).
// DOMINIO_PUBLICO: lo que ve la clienta (agendar, opiniones, tarjeta de lealtad). DOMINIO_EQUIPO: el sistema de recepción.
// Los enlaces y QR siempre apuntan a producción (no a una vista previa de Vercel, que muestra la barra de Vercel y puede pedir login).
export const DOMINIO_PUBLICO = "https://agenda.ciredepilacion.com";
export const DOMINIO_EQUIPO = "https://sistema.ciredepilacion.com";
