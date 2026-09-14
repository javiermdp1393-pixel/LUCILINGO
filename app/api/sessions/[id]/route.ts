import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { resumePosition } from "@/lib/resumeSession";
import type { SessionItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sessions/[id] → devuelve la cola guardada de una sesión y por dónde
// se quedó, para poder retomarla. Las respuestas ya dadas están en `reviews`
// desde el primer día; lo que faltaba era saber qué preguntas quedaban.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: session, error } = await sb
      .from("sessions")
      .select("id, user_id, finished_at, queue")
      .eq("id", id)
      .single<{
        id: string;
        user_id: string;
        finished_at: string | null;
        queue: SessionItem[] | null;
      }>();

    if (error || !session || session.user_id !== OWNER_USER_ID) {
      return NextResponse.json({ error: "Sesión no encontrada." }, { status: 404 });
    }
    if (session.finished_at) {
      return NextResponse.json({ error: "Esa sesión ya está cerrada." }, { status: 409 });
    }
    // Sesiones anteriores a que se guardara la cola: no hay nada que retomar.
    if (!Array.isArray(session.queue) || session.queue.length === 0) {
      return NextResponse.json({ error: "Esta sesión no se puede retomar." }, { status: 409 });
    }

    const { data: reviews } = await sb
      .from("reviews")
      .select("item_id, is_correct")
      .eq("session_id", id);
    const rows = (reviews ?? []) as { item_id: string; is_correct: boolean }[];

    const { startIndex, complete } = resumePosition(
      session.queue,
      rows.map((r) => r.item_id)
    );
    if (complete) {
      return NextResponse.json(
        { error: "Esta sesión ya está completa.", complete: true },
        { status: 409 }
      );
    }

    return NextResponse.json({
      sessionId: session.id,
      items: session.queue,
      startIndex,
      correctCount: rows.filter((r) => r.is_correct).length,
    });
  } catch (err) {
    console.error("GET /api/sessions/[id]", err);
    return NextResponse.json({ error: "No se pudo recuperar la sesión." }, { status: 500 });
  }
}
