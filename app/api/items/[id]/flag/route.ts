import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/items/[id]/flag → marca un ejercicio como defectuoso (§5.2).
// Pasa a 'flagged' y sale de la rotación de sesiones.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { error } = await sb.from("items").update({ status: "flagged" }).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/items/[id]/flag", err);
    return NextResponse.json({ error: "No se pudo marcar el ejercicio." }, { status: 500 });
  }
}
