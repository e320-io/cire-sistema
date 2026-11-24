import { useCallback, useEffect, useState } from "react";
import { useT } from "../../lib/theme.jsx";
import { apiEspera, slugSucursal } from "../../lib/espera.js";

// Pestaña "Espera" de recepción: clientas que no encontraron horario en la agenda en línea (/agendar).
// Recepción las contacta directo (WhatsApp o llamada) cuando se abre un lugar y va marcando el seguimiento.

const DIA = { lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb" };
const FRANJA = { manana: "Por la mañana", tarde: "Por la tarde", cualquiera: "Cualquier hora" };
const ESTADOS = [["pendiente", "Pendientes", "#f59e0b"], ["contactada", "Contactadas", "#3b82f6"], ["agendada", "Agendadas", "#10b981"], ["descartada", "Descartadas", "#9ca3af"], ["todas", "Todas", "#6b7280"]];
const colorDe = (e) => (ESTADOS.find((x) => x[0] === e) || [])[2] || "#6b7280";

const hace = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `hace ${m || 1} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440); return `hace ${d} ${d === 1 ? "día" : "días"}`;
};
const telBonito = (t) => String(t).replace(/^(\d{2})(\d{4})(\d{4})$/, "$1 $2 $3");

function Fila({ f, sucursal, T, light, onGuardar }) {
  const [nota, setNota] = useState(f.nota_equipo || "");
  const [ocupada, setOcupada] = useState(false);
  useEffect(() => setNota(f.nota_equipo || ""), [f.nota_equipo]);
  const primer = String(f.nombre).split(" ")[0];
  const msg = `Hola ${primer} 👋 te escribimos de CIRE ${sucursal}. Estás en nuestra lista de espera para ${f.servicio} y se nos abrió un lugar. ¿Te gustaría agendarlo? 🩷`;
  const marcar = async (estado) => { setOcupada(true); try { await onGuardar(f.id, estado, nota); } finally { setOcupada(false); } };
  const c = colorDe(f.estado);
  const chip = { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)", color: T.sub };
  const boton = (bg) => ({ border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: ocupada ? "default" : "pointer", opacity: ocupada ? 0.6 : 1, background: bg, color: "#fff", textDecoration: "none", display: "inline-block" });
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.cardBdr}`, borderLeft: `4px solid ${c}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{f.nombre}</div>
          <div style={{ fontSize: 13, color: T.sub }}>📱 {telBonito(f.telefono)} · {hace(f.created_at)}</div>
        </div>
        <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: c }}>{f.estado}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{f.servicio}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: f.comentario ? 8 : 12 }}>
        {(f.dias || []).map((d) => <span key={d} style={chip}>{DIA[d] || d}</span>)}
        <span style={chip}>{FRANJA[f.franja] || f.franja}</span>
      </div>
      {f.comentario && <div style={{ fontSize: 13, color: T.sub, fontStyle: "italic", marginBottom: 12 }}>“{f.comentario}”</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <a href={`https://wa.me/52${f.telefono}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" style={boton("#25a244")}>💬 WhatsApp</a>
        <a href={`tel:+52${f.telefono}`} style={boton("#3b82f6")}>📞 Llamar</a>
      </div>
      <input className="inp" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota del equipo (opcional): ej. le escribí, prefiere el sábado 10 am" style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {f.estado === "pendiente" ? (
          <>
            <button disabled={ocupada} style={boton("#3b82f6")} onClick={() => marcar("contactada")}>✅ Ya la contacté</button>
            <button disabled={ocupada} style={boton("#10b981")} onClick={() => marcar("agendada")}>📅 Quedó agendada</button>
            <button disabled={ocupada} style={boton("#9ca3af")} onClick={() => marcar("descartada")}>✖ Descartar</button>
          </>
        ) : (
          <>
            <button disabled={ocupada} style={boton("#f59e0b")} onClick={() => marcar("pendiente")}>↩ Volver a pendiente</button>
            {f.estado === "contactada" && <button disabled={ocupada} style={boton("#10b981")} onClick={() => marcar("agendada")}>📅 Quedó agendada</button>}
            {f.atendida_por && <span style={{ fontSize: 12, color: T.sub }}>por {f.atendida_por}</span>}
          </>
        )}
        {nota !== (f.nota_equipo || "") && <button disabled={ocupada} style={boton("#6b7280")} onClick={() => marcar(f.estado)}>Guardar nota</button>}
      </div>
    </div>
  );
}

export default function ListaEsperaPanel({ sucursal, onCambio }) {
  const { T, light } = useT();
  const slug = slugSucursal(sucursal);
  const [filas, setFilas] = useState(null);
  const [filtro, setFiltro] = useState("pendiente");
  const [err, setErr] = useState("");

  const cargar = useCallback(async () => {
    try { const j = await apiEspera("listar", { slug }); setFilas(j.espera); setErr(""); onCambio?.(j.espera.filter((x) => x.estado === "pendiente").length); }
    catch (e) { setErr(e.message); }
  }, [slug]); // eslint-disable-line
  useEffect(() => { setFilas(null); cargar(); const t = setInterval(cargar, 45000); return () => clearInterval(t); }, [cargar]);

  const guardar = async (id, estado, nota) => {
    try { await apiEspera("actualizar", { id, estado, nota }); await cargar(); } catch (e) { setErr(e.message); }
  };
  const cuenta = (e) => (filas || []).filter((f) => e === "todas" || f.estado === e).length;
  const lista = (filas || []).filter((f) => filtro === "todas" || f.estado === filtro);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      <div style={{ fontSize: 11, letterSpacing: "2px", color: T.sub, marginBottom: 4 }}>⏳ LISTA DE ESPERA · {sucursal}</div>
      <div style={{ fontSize: 13, color: T.sub, marginBottom: 14 }}>Clientas que no encontraron horario en la agenda en línea. Contáctalas directo cuando se abra un lugar y marca cómo va cada una.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {ESTADOS.map(([k, t, c]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `1px solid ${filtro === k ? c : T.cardBdr}`, background: filtro === k ? c : "transparent", color: filtro === k ? "#fff" : T.sub }}>
            {t} · {cuenta(k)}
          </button>
        ))}
        <button onClick={cargar} style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, border: `1px solid ${T.cardBdr}`, background: "transparent", color: T.sub }}>↻ Actualizar</button>
      </div>
      {err && <div style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>{err}</div>}
      {!filas && !err && <div style={{ color: T.sub, fontSize: 14 }}>Cargando…</div>}
      {filas && !lista.length && (
        <div style={{ color: T.sub, fontSize: 14, padding: "30px 0", textAlign: "center" }}>{filtro === "pendiente" ? "No hay clientas pendientes en la lista de espera 🎉" : "No hay registros en esta vista."}</div>
      )}
      {lista.map((f) => <Fila key={f.id} f={f} sucursal={sucursal} T={T} light={light} onGuardar={guardar} />)}
    </div>
  );
}

/** Pestaña "Espera" del panel principal (dueñas, socias, admin): una sucursal a la vez, con selector y pendientes por sucursal. */
export function EsperaDashboard({ sucursales }) {
  const { T } = useT();
  const [suc, setSuc] = useState(sucursales[0]);
  const [cuentas, setCuentas] = useState({});
  useEffect(() => { if (!sucursales.includes(suc)) setSuc(sucursales[0]); }, [sucursales.join("|")]); // eslint-disable-line
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const r = await Promise.all(sucursales.map(async (n) => { try { return [n, (await apiEspera("conteo", { slug: slugSucursal(n) })).pendientes]; } catch { return [n, null]; } }));
      if (vivo) setCuentas(Object.fromEntries(r));
    };
    const t0 = setTimeout(cargar, 800), t = setInterval(cargar, 45000);
    return () => { vivo = false; clearTimeout(t0); clearInterval(t); };
  }, [sucursales.join("|")]); // eslint-disable-line
  if (!sucursales.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sucursales.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "16px 24px 0" }}>
          {sucursales.map((n) => (
            <button key={n} onClick={() => setSuc(n)} style={{ padding: "6px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1px solid ${suc === n ? "#2721E8" : T.cardBdr}`, background: suc === n ? "#2721E8" : "transparent", color: suc === n ? "#fff" : T.sub }}>
              {n}{cuentas[n] > 0 && <span style={{ marginLeft: 8, background: "#ef4444", color: "#fff", borderRadius: 999, fontSize: 11, padding: "1px 7px" }}>{cuentas[n]}</span>}
            </button>
          ))}
        </div>
      )}
      <ListaEsperaPanel key={suc} sucursal={suc} onCambio={(n) => setCuentas((c) => ({ ...c, [suc]: n }))} />
    </div>
  );
}
