import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateAnswer } from "@/lib/evaluate";
import { computeNextState } from "@/lib/leitner";
import type { Item, ReviewState, ReviewResult, SeverityLevel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReviewBody {
  sessionId: string | null;
  itemId: string;
  userAnswer: string;
  responseMs: number;
}

// POST /api/reviews → evalúa la respuesta, la registra y actualiza el SRS (§10).
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewBody;
    const { sessionId, itemId, userAnswer, responseMs } = body;

    if (!itemId) {
      return NextResponse.json({ error: "Falta itemId." }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // 1. Ítem autoritativo (la respuesta correcta vive solo en el servidor).
    const { data: item, error: itemErr } = await sb
      .from("items")
      .select("id, mistake_id, type, prompt, answer, alternatives, distractors, status, times_served")
      .eq("id", itemId)
      .single<Item>();
    if (itemErr || !item) {
      return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
    }

    // 2. Error asociado (para el feedback: explicación y frase original).
    const { data: mistake, error: mErr } = await sb
      .from("mistakes")
      .select("id, severity, explanation_es, original_sentence, correct_form")
      .eq("id", item.mistake_id)
      .single<{
        id: string;
        severity: SeverityLevel;
        explanation_es: string;
        original_sentence: string | null;
        correct_form: string | null;
      }>();
    if (mErr || !mistake) {
      return NextResponse.json({ error: "Error asociado no encontrado." }, { status: 404 });
    }

    // 3. Estado de repaso actual.
    const { data: state, error: sErr } = await sb
      .from("review_state")
      .select("*")
      .eq("mistake_id", item.mistake_id)
      .single<ReviewState>();
    if (sErr || !state) {
      return NextResponse.json({ error: "Estado de repaso no encontrado." }, { status: 404 });
    }

    // 4. Evaluar.
    const evaluation = evaluateAnswer(item, userAnswer ?? "");

    // 5. Registrar la review (append-only).
    const { error: rErr } = await sb.from("reviews").insert({
      session_id: sessionId,
      mistake_id: item.mistake_id,
      item_id: item.id,
      user_answer: userAnswer ?? "",
      is_correct: evaluation.isCorrect,
      quality: evaluation.isCorrect ? 3 : 0,
      response_ms: Number.isFinite(responseMs) ? Math.round(responseMs) : null,
      evaluated_by: evaluation.evaluatedBy,
      feedback_es: null,
    });
    if (rErr) throw rErr;

    // 6. Nº de items distintos de este error acertados alguna vez (para dominado).
    const { data: correctRows, error: cErr } = await sb
      .from("reviews")
      .select("item_id")
      .eq("mistake_id", item.mistake_id)
      .eq("is_correct", true);
    if (cErr) throw cErr;
    const distinctItemsOk = new Set((correctRows ?? []).map((r) => r.item_id)).size;

    // 7. Nuevo estado Leitner.
    const next = computeNextState(state, evaluation.isCorrect, mistake.severity, distinctItemsOk);
    const masteredNow = next.mastered_at !== null && state.mastered_at === null;

    const { error: upErr } = await sb.from("review_state").update(next).eq("mistake_id", item.mistake_id);
    if (upErr) throw upErr;

    // 8. Incrementar times_served del ítem servido.
    const { error: tsErr } = await sb
      .from("items")
      .update({ times_served: item.times_served + 1 })
      .eq("id", item.id);
    if (tsErr) throw tsErr;

    const result: ReviewResult = {
      isCorrect: evaluation.isCorrect,
      isTypo: evaluation.isTypo,
      correctAnswer: item.answer,
      explanationEs: mistake.explanation_es,
      originalSentence: mistake.original_sentence,
      correctForm: mistake.correct_form,
      feedbackEs: null,
      nextDueAt: next.due_at,
      masteredNow,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/reviews", err);
    return NextResponse.json({ error: "No se pudo registrar la respuesta." }, { status: 500 });
  }
}
