import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, computeCostUsd } from "@/lib/constants";
import {
  anthropicConfigured,
  generateItemsForMistake,
  GENERATION_MODEL,
  type MistakeForPrompt,
} from "@/lib/generateItems";
import { validateItem, type CandidateItem } from "@/lib/validateItem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Máximo de errores por llamada, para acotar latencia y coste del batch.
const MAX_BATCH = 12;

interface GenerateBody {
  mistakeId?: string;
  all?: boolean;
  one?: boolean; // prueba: genera solo para el primer error que lo necesite
}

// POST /api/items/generate → genera variantes con IA (batch), valida y guarda (§5.2).
export async function POST(request: Request) {
  try {
    if (!anthropicConfigured()) {
      return NextResponse.json(
        { error: "Falta ANTHROPIC_API_KEY en el servidor." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as GenerateBody;
    const sb = supabaseAdmin();

    // 1. Errores objetivo.
    let mistakeIds: string[] = [];
    if (body.mistakeId) {
      mistakeIds = [body.mistakeId];
    } else if (body.all || body.one) {
      const { data, error } = await sb.rpc("mistakes_needing_items", { p_user_id: OWNER_USER_ID });
      if (error) throw error;
      mistakeIds = ((data ?? []) as { mistake_id: string }[]).map((r) => r.mistake_id);
      if (body.one) mistakeIds = mistakeIds.slice(0, 1);
    } else {
      return NextResponse.json({ error: "Indica mistakeId, one o all." }, { status: 400 });
    }

    const targets = mistakeIds.slice(0, MAX_BATCH);
    const remaining = Math.max(0, mistakeIds.length - targets.length);

    let inserted = 0;
    let rejected = 0;
    const rejectReasons: Record<string, number> = {};
    const totalTokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

    // 2. Por cada error: generar, validar, guardar.
    for (const mistakeId of targets) {
      const { data: mistake, error: mErr } = await sb
        .from("mistakes")
        .select("title, category, wrong_form, correct_form, original_sentence, explanation_es")
        .eq("id", mistakeId)
        .single<MistakeForPrompt>();
      if (mErr || !mistake) continue;

      const { data: existing } = await sb
        .from("items")
        .select("prompt")
        .eq("mistake_id", mistakeId)
        .eq("status", "active");
      const existingPrompts = ((existing ?? []) as { prompt: string }[]).map((r) => r.prompt);

      let candidates: CandidateItem[] = [];
      let usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
      try {
        const gen = await generateItemsForMistake(mistake, existingPrompts);
        candidates = gen.items;
        usage = gen.usage;
      } catch (e) {
        console.error("generateItemsForMistake", mistakeId, e);
        continue;
      }

      totalTokens.input += usage.input_tokens;
      totalTokens.output += usage.output_tokens;
      totalTokens.cacheRead += usage.cache_read_tokens;
      totalTokens.cacheCreation += usage.cache_creation_tokens;

      const toInsert: {
        mistake_id: string;
        type: string;
        prompt: string;
        answer: string;
        alternatives: string[];
        distractors: string[];
        hint: string | null;
        status: string;
        generated_by: string;
        model: string;
      }[] = [];

      // Validamos contra los existentes + los ya aceptados en esta tanda.
      const seenPrompts = [...existingPrompts];
      for (const c of candidates) {
        const result = validateItem(c, seenPrompts);
        if (!result.valid) {
          rejected += 1;
          if (result.reason) rejectReasons[result.reason] = (rejectReasons[result.reason] ?? 0) + 1;
          continue;
        }
        toInsert.push({
          mistake_id: mistakeId,
          type: c.type,
          prompt: c.prompt.trim(),
          answer: c.answer.trim(),
          alternatives: (c.alternatives ?? []).map((s) => s.trim()).filter(Boolean),
          distractors: c.type === "multiple_choice" ? (c.distractors ?? []).map((s) => s.trim()).filter(Boolean) : [],
          hint: c.hint?.trim() ? c.hint.trim() : null,
          status: "active",
          generated_by: "ai",
          model: GENERATION_MODEL,
        });
        seenPrompts.push(c.prompt);
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await sb.from("items").insert(toInsert);
        if (insErr) throw insErr;
        inserted += toInsert.length;
      }

      // Registrar el consumo de esta llamada (contador de gasto).
      await sb.from("ai_generations").insert({
        user_id: OWNER_USER_ID,
        mistake_id: mistakeId,
        kind: "generate",
        model: GENERATION_MODEL,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_tokens,
        cache_creation_tokens: usage.cache_creation_tokens,
        items_inserted: toInsert.length,
      });
    }

    const costUsd = computeCostUsd({
      input_tokens: totalTokens.input,
      output_tokens: totalTokens.output,
      cache_read_tokens: totalTokens.cacheRead,
      cache_creation_tokens: totalTokens.cacheCreation,
    });

    return NextResponse.json({
      processed: targets.length,
      inserted,
      rejected,
      rejectReasons,
      remaining,
      tokens: totalTokens,
      costUsd,
    });
  } catch (err) {
    console.error("POST /api/items/generate", err);
    return NextResponse.json({ error: "No se pudieron generar los ejercicios." }, { status: 500 });
  }
}
