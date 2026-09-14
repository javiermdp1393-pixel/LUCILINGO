import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSessionItems } from "@/lib/session";
import { OWNER_USER_ID } from "@/lib/constants";
import type { SessionMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sessions → crea una sesión y devuelve la cola de ítems (§10).
// Body opcional: { mode: "daily" | "translate" }.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const mode: SessionMode = body.mode === "translate" ? "translate" : "daily";

    const items = await buildSessionItems(mode);

    if (items.length === 0) {
      return NextResponse.json({ sessionId: null, items: [] });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("sessions")
      // La cola se guarda para poder retomar la sesión si se interrumpe. Es lo
      // mismo que se envía al cliente, así que no contiene respuestas correctas.
      .insert({ user_id: OWNER_USER_ID, items_total: items.length, queue: items })
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ sessionId: data.id, items, startIndex: 0, correctCount: 0 });
  } catch (err) {
    console.error("POST /api/sessions", err);
    return NextResponse.json({ error: "No se pudo crear la sesión." }, { status: 500 });
  }
}
