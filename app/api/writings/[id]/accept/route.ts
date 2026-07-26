import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import type { WritingIssue } from "@/lib/evaluateWriting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  accepted: WritingIssue[];
}

// POST /api/writings/[id]/accept → convierte los problemas aceptados en mistakes.
// Si el error ya existe (mismo wrong_form + category) no se duplica: se reinicia
// su review_state a box 1 (volver a cometerlo es la señal más valiosa, §5.4).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Body;
    const accepted = Array.isArray(body.accepted) ? body.accepted : [];

    const sb = supabaseAdmin();

    let added = 0;
    let reactivated = 0;

    for (const issue of accepted) {
      const wrong = (issue.wrong ?? "").trim();
      const correct = (issue.correct ?? "").trim();
      if (!wrong || !issue.category) continue;

      // ¿Existe ya? Comparamos dentro de la misma categoría de forma tolerante:
      // la IA puede devolver "any doubts" donde el log guarda "doubts", así que
      // vale si una forma contiene a la otra. Sin esto se duplicarían errores
      // que en realidad son reincidencias — la señal más valiosa del sistema.
      const { data: sameCategory } = await sb
        .from("mistakes")
        .select("id, wrong_form")
        .eq("user_id", OWNER_USER_ID)
        .eq("category", issue.category)
        .eq("archived", false)
        .not("wrong_form", "is", null);

      const needle = wrong.toLowerCase();
      const existing = ((sameCategory ?? []) as { id: string; wrong_form: string }[]).find((row) => {
        const stored = (row.wrong_form ?? "").trim().toLowerCase();
        if (!stored) return false;
        return stored === needle || needle.includes(stored) || stored.includes(needle);
      });

      if (existing) {
        // Reincidencia: reiniciar el repaso a box 1, vencido ya.
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
        // Nuevo error desde escritura libre.
        const { error: insErr } = await sb.from("mistakes").insert({
          user_id: OWNER_USER_ID,
          title: `${wrong} → ${correct}`,
          category: issue.category,
          source: "free_writing",
          wrong_form: wrong,
          correct_form: correct,
          explanation_es: issue.explanation_es ?? "",
          writing_id: id,
        });
        if (insErr) throw insErr;
        added += 1;
      }
    }

    await sb.from("writings").update({ status: "processed" }).eq("id", id);

    return NextResponse.json({ added, reactivated });
  } catch (err) {
    console.error("POST /api/writings/[id]/accept", err);
    return NextResponse.json({ error: "No se pudieron añadir los errores." }, { status: 500 });
  }
}
