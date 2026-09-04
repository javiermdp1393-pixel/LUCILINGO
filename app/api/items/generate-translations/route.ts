import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, computeCostUsd } from "@/lib/constants";
import { anthropicConfigured, GENERATION_MODEL, type MistakeForPrompt } from "@/lib/generateItems";
import { generateTranslationsForMistake } from "@/lib/generateTranslations";
import { validateItem } from "@/lib/validateItem";
import { acquireJobLock, releaseJobLock, JOB_BUSY_MESSAGE } from "@/lib/jobLock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Por lote, para no rozar el timeout. El botón indica cuántos quedan.
const MAX_BATCH = 6;

// POST /api/items/generate-translations → genera ejercicios de traducción
// ES → EN para los errores que aún no tienen suficientes.
export async function POST() {
  let locked = false;
  try {
    if (!anthropicConfigured()) {
      return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el servidor." }, { status: 400 });
    }

    locked = await acquireJobLock("generate_translations");
    if (!locked) {
      return NextResponse.json({ error: JOB_BUSY_MESSAGE }, { status: 409 });
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb.rpc("mistakes_needing_translations", {
      p_user_id: OWNER_USER_ID,
    });
    if (error) throw error;

    const mistakeIds = ((data ?? []) as { mistake_id: string }[]).map((r) => r.mistake_id);
    const targets = mistakeIds.slice(0, MAX_BATCH);
    const remaining = Math.max(0, mistakeIds.length - targets.length);

    let inserted = 0;
    let rejected = 0;
    const rejectReasons: Record<string, number> = {};
    const totalTokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

    for (const mistakeId of targets) {
      const { data: mistake, error: mErr } = await sb
        .from("mistakes")
        .select("title, category, wrong_form, correct_form, original_sentence, explanation_es")
        .eq("id", mistakeId)
        .single<MistakeForPrompt>();
      if (mErr || !mistake) continue;

      // Solo las frases en castellano ya usadas para este error: son el espacio
      // donde puede repetirse, no los huecos ni las frases a corregir.
      const { data: existing } = await sb
        .from("items")
        .select("prompt")
        .eq("mistake_id", mistakeId)
        .eq("type", "translate_es_en")
        .eq("status", "active");
      const existingPrompts = ((existing ?? []) as { prompt: string }[]).map((r) => r.prompt);

      let candidates: Awaited<ReturnType<typeof generateTranslationsForMistake>>["items"] = [];
      let usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
      try {
        const gen = await generateTranslationsForMistake(mistake, existingPrompts);
        candidates = gen.items;
        usage = gen.usage;
      } catch (e) {
        console.error("generateTranslationsForMistake", mistakeId, e);
        continue;
      }

      totalTokens.input += usage.input_tokens;
      totalTokens.output += usage.output_tokens;
      totalTokens.cacheRead += usage.cache_read_tokens;
      totalTokens.cacheCreation += usage.cache_creation_tokens;

      const seenPrompts = [...existingPrompts];
      const toInsert = [];
      for (const c of candidates) {
        const result = validateItem(c, seenPrompts);
        if (!result.valid) {
          rejected += 1;
          if (result.reason) rejectReasons[result.reason] = (rejectReasons[result.reason] ?? 0) + 1;
          continue;
        }
        toInsert.push({
          mistake_id: mistakeId,
          type: "translate_es_en",
          prompt: c.prompt.trim(),
          answer: c.answer.trim(),
          alternatives: (c.alternatives ?? []).map((s) => s.trim()).filter(Boolean),
          distractors: [],
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

      await sb.from("ai_generations").insert({
        user_id: OWNER_USER_ID,
        mistake_id: mistakeId,
        kind: "translate_gen",
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
      costUsd,
    });
  } catch (err) {
    console.error("POST /api/items/generate-translations", err);
    return NextResponse.json({ error: "No se pudieron generar las traducciones." }, { status: 500 });
  } finally {
    if (locked) await releaseJobLock("generate_translations");
  }
}
