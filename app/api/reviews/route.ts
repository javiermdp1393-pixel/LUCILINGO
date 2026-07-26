import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateAnswer } from "@/lib/evaluate";
import { computeNextState } from "@/lib/leitner";
import { evaluateOpenAnswer } from "@/lib/evaluateOpen";
import { verifyAlternativeAnswer } from "@/lib/verifyAlternative";
import { anthropicConfigured, GENERATION_MODEL } from "@/lib/generateItems";
import { OWNER_USER_ID } from "@/lib/constants";
import type { Item, ReviewState, ReviewResult, SeverityLevel, OtherIssue } from "@/lib/types";

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
      .select("id, title, category, severity, explanation_es, original_sentence, correct_form")
      .eq("id", item.mistake_id)
      .single<{
        id: string;
        title: string;
        category: string;
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

    // 4. Evaluar. correct_sentence se evalúa por IA (§8.2): puntúa solo si se
    //    corrige el error objetivo. El resto de tipos, comparación local.
    let isCorrect: boolean;
    let isTypo = false;
    let evaluatedBy: "exact" | "llm" = "exact";
    let quality = 0;
    let feedbackEs: string | null = null;
    let otherIssues: OtherIssue[] = [];
    // Si la IA valida una respuesta alternativa, la guardamos en el ítem para
    // no volver a preguntar por ella (el sistema aprende y gasta menos).
    let acceptedAlternative: string | null = null;

    if (item.type === "correct_sentence" && anthropicConfigured()) {
      const evalResult = await evaluateOpenAnswer({
        title: mistake.title,
        category: mistake.category,
        explanation_es: mistake.explanation_es,
        prompt: item.prompt,
        answer: item.answer,
        userAnswer: userAnswer ?? "",
      });
      isCorrect = evalResult.isCorrect;
      evaluatedBy = "llm";
      quality = evalResult.quality;
      feedbackEs = evalResult.feedbackEs || null;
      otherIssues = evalResult.otherIssues;

      // Registrar el consumo de esta evaluación (contador de gasto).
      await sb.from("ai_generations").insert({
        user_id: OWNER_USER_ID,
        mistake_id: item.mistake_id,
        kind: "eval",
        model: GENERATION_MODEL,
        input_tokens: evalResult.usage.input_tokens,
        output_tokens: evalResult.usage.output_tokens,
        cache_read_tokens: evalResult.usage.cache_read_tokens,
        cache_creation_tokens: evalResult.usage.cache_creation_tokens,
        items_inserted: 0,
      });
    } else {
      const evaluation = evaluateAnswer(item, userAnswer ?? "");
      isCorrect = evaluation.isCorrect;
      isTypo = evaluation.isTypo;
      evaluatedBy = evaluation.evaluatedBy;
      quality = evaluation.isCorrect ? 3 : 0;

      // Segunda opinión para fill_gap fallados: la respuesta puede ser válida
      // aunque no coincida literalmente (variantes regionales, sinónimos, o
      // matices ajenos al error objetivo). Evita falsos negativos que mandarían
      // a caja 1 un error ya dominado (§7).
      const given = (userAnswer ?? "").trim();
      if (!isCorrect && item.type === "fill_gap" && given.length > 0 && anthropicConfigured()) {
        try {
          const verdict = await verifyAlternativeAnswer({
            title: mistake.title,
            category: mistake.category,
            explanation_es: mistake.explanation_es,
            prompt: item.prompt,
            answer: item.answer,
            userAnswer: given,
          });

          await sb.from("ai_generations").insert({
            user_id: OWNER_USER_ID,
            mistake_id: item.mistake_id,
            kind: "verify",
            model: GENERATION_MODEL,
            input_tokens: verdict.usage.input_tokens,
            output_tokens: verdict.usage.output_tokens,
            cache_read_tokens: verdict.usage.cache_read_tokens,
            cache_creation_tokens: verdict.usage.cache_creation_tokens,
            items_inserted: 0,
          });

          if (verdict.isValid) {
            isCorrect = true;
            isTypo = false;
            quality = 3;
            evaluatedBy = "llm";
            feedbackEs = verdict.reasonEs || "También es válido.";
            acceptedAlternative = given;
          }
        } catch (e) {
          // Si falla la verificación, mantenemos el veredicto original.
          console.error("verifyAlternativeAnswer", item.id, e);
        }
      }
    }

    // 5. Registrar la review (append-only).
    const { error: rErr } = await sb.from("reviews").insert({
      session_id: sessionId,
      mistake_id: item.mistake_id,
      item_id: item.id,
      user_answer: userAnswer ?? "",
      is_correct: isCorrect,
      quality,
      response_ms: Number.isFinite(responseMs) ? Math.round(responseMs) : null,
      evaluated_by: evaluatedBy,
      feedback_es: feedbackEs,
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
    const next = computeNextState(state, isCorrect, mistake.severity, distinctItemsOk);
    const masteredNow = next.mastered_at !== null && state.mastered_at === null;

    const { error: upErr } = await sb.from("review_state").update(next).eq("mistake_id", item.mistake_id);
    if (upErr) throw upErr;

    // 8. Incrementar times_served del ítem servido y, si la IA aceptó una
    //    respuesta alternativa, memorizarla para no volver a consultarla.
    const itemUpdate: { times_served: number; alternatives?: string[] } = {
      times_served: item.times_served + 1,
    };
    if (acceptedAlternative) {
      const current = item.alternatives ?? [];
      const already = current.some(
        (a) => a.trim().toLowerCase() === acceptedAlternative!.toLowerCase()
      );
      if (!already) itemUpdate.alternatives = [...current, acceptedAlternative];
    }
    const { error: tsErr } = await sb.from("items").update(itemUpdate).eq("id", item.id);
    if (tsErr) throw tsErr;

    const result: ReviewResult = {
      isCorrect,
      isTypo,
      correctAnswer: item.answer,
      explanationEs: mistake.explanation_es,
      originalSentence: mistake.original_sentence,
      correctForm: mistake.correct_form,
      feedbackEs,
      otherIssues,
      nextDueAt: next.due_at,
      masteredNow,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/reviews", err);
    return NextResponse.json({ error: "No se pudo registrar la respuesta." }, { status: 500 });
  }
}
