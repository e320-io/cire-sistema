import React, { useState } from "react";
import QRCode from "qrcode";
import { apiLealtad, urlTarjeta } from "../../lib/lealtad.js";

// Botón en la ficha de la clienta: genera (o recupera) su tarjeta y muestra el enlace para mandárselo.
export default function BotonTarjetaClienta({ clienta }) {
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  const [copiado, setCopiado] = useState(false);

  const abrir = async () => {
    setAbierto(true); setErr(""); setCopiado(false);
    try {
      const { token } = await apiLealtad("emitir", { clientaId: clienta.id }, { recepcion: true });
      const u = urlTarjeta(token);
      setUrl(u); setQr(await QRCode.toDataURL(u, { margin: 1, width: 240 }));
    } catch (e) { setErr(e.message); }
  };
  const tel = String(clienta.telefono || "").replace(/\D/g, "").slice(-10);
  const msg = `Hola ${String(clienta.nombre || "").split(" ")[0]}! Esta es tu tarjeta de sesiones CIRE: ${url}\nAhí verás tus sellos y tu próxima cita. Muéstrala en recepción al terminar cada sesión 💛`;

  return (
    <>
      <button className="btn-ghost" onClick={abrir} style={{ fontSize: "12px", padding: "8px 18px" }}>🪪 Tarjeta de lealtad</button>
      {abierto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setAbierto(false)}>
          <div className="glass" style={{ width: "100%", maxWidth: 400, padding: 22, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Tarjeta de {clienta.nombre}</div>
            {err && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 10 }}>{err}</div>}
            {!url && !err && <div style={{ opacity: .7 }}>Generando…</div>}
            {url && (
              <>
                {qr && <img src={qr} width={160} height={160} alt="QR de la tarjeta" style={{ borderRadius: 8, background: "#fff", padding: 6 }} />}
                <input className="inp" readOnly value={url} onFocus={(e) => e.target.select()} style={{ width: "100%", boxSizing: "border-box", margin: "12px 0", fontSize: 12 }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { navigator.clipboard?.writeText(url); setCopiado(true); }}>{copiado ? "✓ Copiado" : "Copiar enlace"}</button>
                  {tel.length === 10 && <a className="btn-blue" style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "9px 0" }} target="_blank" rel="noreferrer" href={`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`}>Mandar por WhatsApp</a>}
                </div>
                <div style={{ fontSize: 11, opacity: .6, marginTop: 10 }}>Se abre en el cel de la clienta; el QR de ahí es el que escanea recepción.</div>
              </>
            )}
            <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
