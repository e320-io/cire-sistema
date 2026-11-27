import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { tokenDe } from "../../lib/lealtad.js";

// Botón flotante "Escanear tarjeta" + modal. Lee el QR con la cámara (BarcodeDetector si existe, jsQR si no)
// o acepta el texto/enlace pegado — un lector USB de códigos "teclea" el enlace aquí y manda Enter.
export default function EscanerTarjeta({ onToken, onHoy }) {
  const [abierto, setAbierto] = useState(false);
  const [txt, setTxt] = useState("");
  const [err, setErr] = useState("");
  const [cam, setCam] = useState(false);
  const video = useRef(null);

  const entregar = (t) => { const tk = tokenDe(t); if (!tk) { setErr("Ese código no es de una tarjeta CIRE."); return false; } setAbierto(false); setCam(false); setTxt(""); setErr(""); onToken(tk); return true; };

  useEffect(() => {
    if (!cam) return;
    let stop = false, stream = null, raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current; v.srcObject = stream; await v.play();
        const det = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
        const cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
        const tick = async () => {
          if (stop) return;
          if (v.readyState >= 2) {
            let texto = null;
            if (det) { try { texto = (await det.detect(v))[0]?.rawValue || null; } catch { /* sigue */ } }
            else { cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0); texto = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data || null; }
            if (texto && entregar(texto)) return;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setErr("No pude abrir la cámara. Revisa el permiso del navegador o pega el código abajo."); setCam(false); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam]); // eslint-disable-line

  return (
    <>
      {onHoy && <button className="btn-ghost" onClick={onHoy} style={{ position: "fixed", right: 18, bottom: 70, zIndex: 900, padding: "10px 16px", borderRadius: 30, fontSize: 13, background: "rgba(20,30,60,.85)", color: "#fff" }}>📅 Hoy</button>}
      <button className="btn-blue" onClick={() => { setAbierto(true); setErr(""); }}
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 900, padding: "12px 18px", borderRadius: 30, fontSize: 14, boxShadow: "0 6px 20px rgba(0,0,0,.3)" }}>
        🪪 Escanear tarjeta
      </button>
      {abierto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setAbierto(false); setCam(false); }}>
          <div className="glass" style={{ width: "100%", maxWidth: 420, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Escanear tarjeta de la clienta</div>
            {cam
              ? <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 12, background: "#000", marginBottom: 12 }} />
              : <button className="btn-blue" style={{ width: "100%", padding: 12, marginBottom: 12 }} onClick={() => { setErr(""); setCam(true); }}>📷 Usar la cámara</button>}
            <div style={{ fontSize: 12, opacity: .7, marginBottom: 6 }}>O pega el enlace / usa un lector de códigos:</div>
            <input className="inp" autoFocus={!cam} placeholder="https://…/sello/…" value={txt} onChange={(e) => setTxt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && entregar(txt)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
            {err && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setAbierto(false); setCam(false); }}>Cancelar</button>
              <button className="btn-blue" style={{ flex: 1 }} onClick={() => entregar(txt)}>Continuar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
