import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { C, S, FONT, estiloTema, fechaLarga, cap } from "../agenda/ui.jsx";
import LogoCire from "../agenda/LogoCire.jsx";
import { apiLealtad, tokenDe, urlSello } from "../../lib/lealtad.js";

// Página pública /tarjeta/<token>: la tarjeta de la clienta con un sello por cada sesión de sus paquetes y un QR
// que recepción escanea para sellar. (Más adelante es el contenido del pase de Apple/Google Wallet.)

const Sello = ({ lleno, n }) => (
  <div style={{
    width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    background: lleno ? C.verde : C.menta, border: `2px solid ${lleno ? C.verde : C.gris}`,
    color: lleno ? "#fff" : C.suave, fontSize: lleno ? 20 : 13, fontWeight: 700, fontFamily: FONT,
  }}>{lleno ? "✓" : n}</div>
);

export default function TarjetaAnterior() {
  const token = tokenDe(location.pathname);
  const [d, setD] = useState(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    document.title = "Tu tarjeta · CIRE";
    document.body.style.margin = "0";
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
  useEffect(() => {
    if (!token) { setErr("Esta tarjeta no es válida."); return; }
    QRCode.toDataURL(urlSello(token), { margin: 1, width: 360, errorCorrectionLevel: "M" }).then(setQr).catch(() => {});
    const cargar = () => apiLealtad("tarjeta", { token }).then(setD).catch((e) => setErr(e.message));
    cargar();
    const t = setInterval(cargar, 30_000); // el sello aparece solo después de que recepción escanea
    const vis = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [token]);

  return (
    <div style={{ ...S.pagina, ...estiloTema("turquesa") }}>
      <div style={S.caja}>
        <div style={{ textAlign: "center", marginBottom: 18, color: "#fff" }}>
          <LogoCire size={150} />
          <div style={{ opacity: .95, fontSize: 14, fontWeight: 600, marginTop: 4 }}>Tu tarjeta de sesiones</div>
        </div>

        {err && <div style={S.pildora}>{err}</div>}
        {!d && !err && <div style={{ ...S.pildora, textAlign: "center" }}>Cargando tu tarjeta…</div>}

        {d && (
          <>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: "0 4px 12px" }}>Hola, {d.nombre} 👋</div>

            {d.paquetes.length === 0 && <div style={S.pildora}>Aún no tienes un paquete con varias sesiones. Cuando lo tengas, aquí verás tus sellos.</div>}

            {d.paquetes.map((p) => (
              <div key={p.id} style={S.tarjeta}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: C.verde, fontSize: 15, lineHeight: 1.25 }}>{p.servicio}</div>
                  <div style={{ fontSize: 13, color: C.suave, whiteSpace: "nowrap" }}>{p.usadas} de {p.total}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Array.from({ length: p.total }, (_, i) => <Sello key={i} lleno={i < p.usadas} n={i + 1} />)}
                </div>
                {!p.activo && p.usadas >= p.total && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: C.verdeMedio }}>🎉 ¡Completaste este paquete!</div>}
              </div>
            ))}

            {d.proxima && (
              <div style={S.pildora}>
                <div style={{ fontSize: 12, opacity: .85 }}>Tu próxima sesión</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{cap(fechaLarga(d.proxima.fecha))} · {d.proxima.hora}</div>
                {d.proxima.sucursal && <div style={{ fontSize: 13, opacity: .9 }}>CIRE {d.proxima.sucursal}</div>}
              </div>
            )}

            <div style={{ ...S.tarjeta, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.verde, marginBottom: 10 }}>Muestra este código en recepción al terminar tu sesión</div>
              {qr && <img src={qr} alt="Código de tu tarjeta" width={200} height={200} style={{ display: "block", margin: "0 auto" }} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
