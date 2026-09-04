import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, computeCostUsd } from "@/lib/constants";
import { anthropicConfigured, GENERATION_MODEL } from "@/lib/generateItems";
import { generateHintForItem } from "@/lib/generateHint";
import { acquireJobLock, releaseJobLock, JOB_BUSY_MESSAGE } from "@/lib/jobLock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Genera pistas para ejercicios que aún no tienen (fill_gap y correct_sentence).
// Por lotes para no pasarnos del timeout; devuelve cuántos quedan.
const MAX_BATCH = 10;

interface ItemRow {
  id: string;
  type: string;
  prompt: string;
  answer: string;
  mistakes: { category: string; explanation_es: string } | null;
}

// POST /api/items/backfill-hints
export async function POST() {
  let locked = false;
  try {
    if (!anthropicConfigured()) {
      return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el servidor." }, { status: 400 });
    }

    locked = await acquireJobLock("backfill_hints");
    if (!locked) {
      return NextResponse.json({ error: JOB_BUSY_MESSAGE }, { status: 409 });
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("items")
      .select("id, type, prompt, answer, mistakes!inner(category, explanation_es)")
      .is("hint", null)
      .in("type", ["fill_gap", "correct_sentence"])
      .eq("status", "active")
      .limit(MAX_BATCH + 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as ItemRow[];
    const targets = rows.slice(0, MAX_BATCH);
    const remaining = Math.max(0, rows.length - targets.length);

    let updated = 0;
    const totalTokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

    for (const item of targets) {
      if (!item.mistakes) continue;
      let hint = "";
      let usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
      try {
        const res = await generateHintForItem({
          category: item.mistakes.category,
          explanation_es: item.mistakes.explanation_es,
          type: item.type,
          prompt: item.prompt,
          answer: item.answer,
        });
        hint = res.hint;
        usage = res.usage;
      } catch (e) {
        console.error("generateHintForItem", item.id, e);
        continue;
      }

      totalTokens.input += usage.input_tokens;
      totalTokens.output += usage.output_tokens;
      totalTokens.cacheRead += usage.cache_read_tokens;
      totalTokens.cacheCreation += usage.cache_creation_tokens;

      if (hint) {
        const { error: upErr } = await sb.from("items").update({ hint }).eq("id", item.id);
        if (upErr) throw upErr;
        updated += 1;
      }

      await sb.from("ai_generations").insert({
        user_id: OWNER_USER_ID,
        kind: "hint",
        model: GENERATION_MODEL,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_tokens,
        cache_creation_tokens: usage.cache_creation_tokens,
        items_inserted: 0,
      });
    }

    const costUsd = computeCostUsd({
      input_tokens: totalTokens.input,
      output_tokens: totalTokens.output,
      cache_read_tokens: totalTokens.cacheRead,
      cache_creation_tokens: totalTokens.cacheCreation,
    });

    return NextResponse.json({ processed: targets.length, updated, remaining, costUsd });
  } catch (err) {
    console.error("POST /api/items/backfill-hints", err);
    return NextResponse.json({ error: "No se pudieron generar las pistas." }, { status: 500 });
  } finally {
    if (locked) await releaseJobLock("backfill_hints");
  }
}
