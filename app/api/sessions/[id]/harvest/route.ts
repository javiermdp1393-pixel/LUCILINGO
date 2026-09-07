import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { findExistingMistake, type MistakeCandidate } from "@/lib/matchMistake";
import type { OtherIssue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  accepted: OtherIssue[];
}

// POST /api/sessions/[id]/harvest → convierte en errores del log los fallos que
// el usuario cometió de paso durante la sesión (los "otros detalles" que el
// evaluador detecta y que no penalizan la respuesta).
//
// Es el mismo principio que la escritura libre: el contenido se cosecha de
// errores reales. Antes esos fallos se pintaban en pantalla y se perdían al
// pasar de pregunta, aunque fueran tan buenos como el error que se practicaba.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Body;
    const accepted = Array.isArray(body.accepted) ? body.accepted : [];

    if (accepted.length === 0) {
      return NextResponse.json({ added: 0, reactivated: 0 });
    }

    const sb = supabaseAdmin();

    const { data: candidates } = await sb
      .from("mistakes")
      .select("id, wrong_form, category")
      .eq("user_id", OWNER_USER_ID)
      .eq("archived", false)
      .not("wrong_form", "is", null);
    const pool = (candidates ?? []) as MistakeCandidate[];

    let added = 0;
    let reactivated = 0;

    for (const issue of accepted) {
      const wrong = (issue.wrong ?? "").trim();
      const correct = (issue.correct ?? "").trim();
      if (!wrong || !issue.category) continue;

      const existing = findExistingMistake(wrong, issue.category, pool);

      if (existing) {
        // Reincidencia: vuelve a caja 1 y vencido ya.
        await sb
          .from("review_state")
          .update({
            box: 1,
            interval_days: 1,
            due_at: new Date().toISOString(),
            consecutive_correct: 0,
          })
          .eq("mistake_id", existing.id);
        reactivated += 1;
      } else {
        const { data: inserted, error: insErr } = await sb
          .from("mistakes")
          .insert({
            user_id: OWNER_USER_ID,
            title: `${wrong} → ${correct}`,
            category: issue.category,
            source: "session",
            wrong_form: wrong,
            correct_form: correct,
            explanation_es: issue.explanation_es ?? "",
            session_id: id,
          })
          .select("id, wrong_form, category")
          .single();
        if (insErr) throw insErr;
        // Entra al pool para que dos fallos iguales de la misma sesión no se
        // guarden por duplicado.
        if (inserted) pool.push(inserted as MistakeCandidate);
        added += 1;
      }
    }

    return NextResponse.json({ added, reactivated });
  } catch (err) {
    console.error("POST /api/sessions/[id]/harvest", err);
    return NextResponse.json({ error: "No se pudieron añadir los errores." }, { status: 500 });
  }
}
