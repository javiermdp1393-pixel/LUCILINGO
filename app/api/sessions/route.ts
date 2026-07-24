import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSessionItems } from "@/lib/session";
import { OWNER_USER_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sessions → crea una sesión y devuelve la cola de ítems (§10).
export async function POST() {
  try {
    const items = await buildSessionItems();

    if (items.length === 0) {
      return NextResponse.json({ sessionId: null, items: [] });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("sessions")
      .insert({ user_id: OWNER_USER_ID, items_total: items.length })
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ sessionId: data.id, items });
  } catch (err) {
    console.error("POST /api/sessions", err);
    return NextResponse.json({ error: "No se pudo crear la sesión." }, { status: 500 });
  }
}
