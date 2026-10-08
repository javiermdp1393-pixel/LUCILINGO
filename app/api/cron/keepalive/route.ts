import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Latido para que Supabase no pause el proyecto.
//
// El plan gratuito pausa los proyectos con poca actividad en 7 días, y la
// documentación de Supabase dice que "unas pocas peticiones a la base de datos
// al día durante la semana previa" bastan para evitarlo. Como el cron del plan
// Hobby de Vercel se dispara una vez al día, esta ruta hace varias lecturas en
// la misma pasada en lugar de una sola.
//
// Son lecturas baratas de verdad: `head: true` pide solo el recuento, no las
// filas. No escribe nada ni llama al modelo.
//
// Sobre la autenticación: lo importante aquí es que el latido NO FALLE nunca en
// silencio, porque un fallo silencioso acaba en proyecto pausado otra vez. Por
// eso, mientras CRON_SECRET no esté definida, la ruta responde a cualquiera.
// Definir la variable en Vercel la cierra. El riesgo de dejarla abierta es
// pequeño: no devuelve datos, solo un ok.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  try {
    const sb = supabaseAdmin();

    // Tres tablas distintas, para que cuente como actividad real y de paso
    // sirva de comprobación de que el esquema responde.
    const [mistakes, items, reviews] = await Promise.all([
      sb
        .from("mistakes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", OWNER_USER_ID),
      sb.from("items").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("reviews").select("id", { count: "exact", head: true }),
    ]);

    const failed = [mistakes.error, items.error, reviews.error].filter(Boolean);
    if (failed.length > 0) throw failed[0];

    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
      // Útil para ver de un vistazo que la base responde de verdad y no solo
      // que la función se ejecutó.
      counts: {
        mistakes: mistakes.count ?? 0,
        items: items.count ?? 0,
        reviews: reviews.count ?? 0,
      },
      protected: !!secret,
    });
  } catch (err) {
    console.error("GET /api/cron/keepalive", err);
    return NextResponse.json({ ok: false, error: "La base de datos no respondió." }, { status: 500 });
  }
}
