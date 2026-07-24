import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sessions/[id]/finish → cierra la sesión y calcula el resultado.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: rows, error } = await sb
      .from("reviews")
      .select("is_correct")
      .eq("session_id", id);
    if (error) throw error;

    const total = rows?.length ?? 0;
    const correct = (rows ?? []).filter((r) => r.is_correct).length;

    const { error: upErr } = await sb
      .from("sessions")
      .update({ finished_at: new Date().toISOString(), items_total: total, items_correct: correct })
      .eq("id", id);
    if (upErr) throw upErr;

    return NextResponse.json({ total, correct });
  } catch (err) {
    console.error("POST /api/sessions/[id]/finish", err);
    return NextResponse.json({ error: "No se pudo cerrar la sesión." }, { status: 500 });
  }
}
