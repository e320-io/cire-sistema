// Supabase Edge Function: sync-zettle
// Sincroniza ventas de Zettle → tabla tickets
// Llamar con: ?sucursal=metepec (default: metepec)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// ─── Config por sucursal ────────────────────────────────────────────────────
// sucursal_id debe coincidir con el id en USUARIOS del frontend
const SUCURSALES: Record<string, { id: number; nombre: string }> = {
  metepec:  { id: 5, nombre: "Metepec"  },
  coapa:    { id: 1, nombre: "Coapa"    },
  valle:    { id: 2, nombre: "Valle"    },
  oriente:  { id: 3, nombre: "Oriente"  },
  polanco:  { id: 4, nombre: "Polanco"  },
}

// ─── Asignar sucursal para cuenta compartida Valle+Polanco ───────────────────
// Reglas:
// - "SUCURSAL DEL VALLE" → Valle
// - "SUCURSAL POLANCO"   → Polanco
// - "Jazmín Vázquez"     → Valle (antes de abril 2024 era solo Valle;
//                          después son ajustes/reembolsos pequeños que van a Valle)
function asignarSucursalCompartida(userDisplayName: string, fecha: string) {
  const u = (userDisplayName || "").toUpperCase()
  if (u.includes("POLANCO")) return SUCURSALES.polanco
  if (u.includes("VALLE"))   return SUCURSALES.valle
  // Jazmín Vázquez y cualquier otro → Valle
  return SUCURSALES.valle
}

// ─── Auth Zettle ─────────────────────────────────────────────────────────────
async function getZettleToken(clientId: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://oauth.zettle.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      client_id: clientId,
      assertion: apiKey,
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Zettle auth error ${resp.status}: ${body}`)
  }
  const { access_token } = await resp.json()
  return access_token
}

// ─── Fetch compras paginadas ─────────────────────────────────────────────────
async function fetchAllPurchases(token: string, startDate: string): Promise<any[]> {
  const all: any[] = []
  let lastHash: string | undefined

  while (true) {
    const params = new URLSearchParams({
      startDate,
      limit: "1000",
      descending: "false",
    })
    if (lastHash) params.set("lastPurchaseHash", lastHash)

    const resp = await fetch(`https://purchase.izettle.com/purchases/v2?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) throw new Error(`Zettle purchases error ${resp.status}: ${await resp.text()}`)

    const data = await resp.json()
    const purchases: any[] = data.purchases || []
    all.push(...purchases)

    if (!data.lastPurchaseHash || purchases.length < 1000) break
    lastHash = data.lastPurchaseHash
  }

  return all
}

// ─── Mapeo tipo de pago ──────────────────────────────────────────────────────
function mapPago(payments: any[]): string {
  const type = (payments?.[0]?.type || "").toUpperCase()
  if (type.includes("IZETTLE") || type.includes("CARD")) return "Zettle"
  if (type === "CASH")                                    return "Efectivo"
  if (type.includes("TRANSFER") || type.includes("SWISH")) return "Transferencia"
  return type || "Otro"
}

// ─── Handler principal ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const sucursalKey = (url.searchParams.get("sucursal") || "metepec").toLowerCase()
    // valle_polanco es la cuenta compartida — usa config de valle como placeholder
    const config = sucursalKey === "valle_polanco" ? SUCURSALES.valle : SUCURSALES[sucursalKey]

    if (!config) {
      return new Response(
        JSON.stringify({ error: `Sucursal "${sucursalKey}" no configurada. Opciones: ${Object.keys(SUCURSALES).join(", ")}, valle_polanco` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Credenciales: valle_polanco reutiliza los secrets de polanco (misma cuenta)
    const secretKey = sucursalKey === "valle_polanco" ? "POLANCO" : sucursalKey.toUpperCase()
    const clientId = Deno.env.get(`ZETTLE_${secretKey}_CLIENT_ID`)
    const apiKey   = Deno.env.get(`ZETTLE_${secretKey}_API_KEY`)
    if (!clientId || !apiKey) {
      return new Response(
        JSON.stringify({ error: `Secrets ZETTLE_${sucursalKey.toUpperCase()}_CLIENT_ID / API_KEY no configurados` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // startDate puede venir como query param para forzar histórico completo
    // Si no se pasa, usa la fecha del último ticket Zettle ya guardado
    // Si no hay ninguno, usa 3 años atrás (máximo que soporta Zettle)
    const startDateParam = url.searchParams.get("startDate")
    let startDate: string

    if (startDateParam) {
      startDate = startDateParam
    } else {
      const { data: lastRow } = await supabase
        .from("tickets")
        .select("fecha")
        .eq("sucursal_nombre", config.nombre)
        .eq("fuente", "zettle")
        .order("fecha", { ascending: false })
        .limit(1)
      startDate = lastRow?.[0]?.fecha
        ?? new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    }

    console.log(`[sync-zettle] Sucursal: ${config.nombre} | Desde: ${startDate}`)

    // Auth Zettle
    const token = await getZettleToken(clientId, apiKey)

    // Modo preview: recorre todo el historial y devuelve un resumen de
    // userDisplayName únicos para identificar si hay mezcla de sucursales
    // Modo export: devuelve CSV con número de recibo, fecha, monto, usuario
    // Para cruzar contra sheets con VLOOKUP
    if (url.searchParams.get("export") === "true") {
      const all = await fetchAllPurchases(token, startDate)
      const lines = ["numero_recibo,fecha,monto,usuario"]
      for (const p of all) {
        const num    = p.purchaseNumber ?? ""
        const fecha  = (p.timestamp || "").slice(0, 10)
        const monto  = Math.round((p.amount ?? 0) / 100)
        const user   = (p.userDisplayName || "").replace(/,/g, " ")
        lines.push(`${num},${fecha},${monto},${user}`)
      }
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="zettle-${sucursalKey}.csv"`,
        },
      })
    }

    if (url.searchParams.get("preview") === "true") {
      const all = await fetchAllPurchases(token, startDate)
      // Totales por mes y usuario: { "2026-01": { "SUCURSAL DEL VALLE": 450000, ... } }
      const porMes: Record<string, Record<string, number>> = {}
      for (const p of all) {
        const mes = (p.timestamp || "").slice(0, 7)   // "2026-01"
        const user = p.userDisplayName || "(sin nombre)"
        const monto = Math.round((p.amount ?? 0) / 100)
        if (!porMes[mes]) porMes[mes] = {}
        porMes[mes][user] = (porMes[mes][user] || 0) + monto
      }
      // Ordenar por mes
      const resultado = Object.entries(porMes)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce((acc, [mes, users]) => ({ ...acc, [mes]: users }), {})
      return new Response(JSON.stringify(resultado, null, 2), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Traer compras
    const purchases = await fetchAllPurchases(token, startDate)
    console.log(`[sync-zettle] ${purchases.length} compras encontradas en Zettle`)

    if (purchases.length === 0) {
      return new Response(
        JSON.stringify({ synced: 0, sucursal: config.nombre, startDate }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // Mapear Zettle → formato tickets
    // Para cuenta compartida (valle_polanco), la sucursal se determina por userDisplayName
    const esCompartida = sucursalKey === "valle_polanco"
    const rows = purchases.map((p: any) => {
      const suc = esCompartida
        ? asignarSucursalCompartida(p.userDisplayName, (p.timestamp || "").slice(0, 10))
        : config
      return {
        sucursal_id:     suc.id,
        sucursal_nombre: suc.nombre,
        servicios:       (p.products || []).map((pr: any) => pr.name).filter(Boolean),
        total:           Math.round((p.amount ?? 0) / 100),
        metodo_pago:     mapPago(p.payments || []),
        descuento:       0,
        tipo_clienta:    "Recompra",
        fecha:           (p.timestamp || "").slice(0, 10),
        fuente:          "zettle",
        zettle_uuid:     p.purchaseUUID,
      }
    })

    // Upsert: si zettle_uuid ya existe no duplica, si es nuevo lo inserta
    const { error } = await supabase
      .from("tickets")
      .upsert(rows, { onConflict: "zettle_uuid", ignoreDuplicates: true })

    if (error) throw new Error(`Supabase upsert error: ${error.message}`)

    const porSucursal = rows.reduce((acc: Record<string, number>, r: any) => {
      acc[r.sucursal_nombre] = (acc[r.sucursal_nombre] || 0) + 1
      return acc
    }, {})

    return new Response(
      JSON.stringify({ synced: rows.length, por_sucursal: porSucursal, startDate, ok: true }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (err) {
    console.error("[sync-zettle] ERROR:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
