import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, computeCostUsd } from "@/lib/constants";
import { anthropicConfigured, GENERATION_MODEL } from "@/lib/generateItems";
import { generateHintForItem } from "@/lib/generateHint";
import { hintIsUsable } from "@/lib/hintQuality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cuántas veces se le pide otra pista al modelo si la que devuelve no sirve
// (se repite o desvela la respuesta). Con effort bajo cada intento es barato.
const MAX_ATTEMPTS = 2;

// POST /api/items/[id]/rehint → el usuario descarta la pista durante la sesión
// y pide otra. A diferencia del flag, el ejercicio NO se retira: la pista puede
// ser mala sin que el ejercicio lo sea.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!anthropicConfigured()) {
      return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el servidor." }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data: item, error: itemErr } = await sb
      .from("items")
      .select("id, mistake_id, type, prompt, answer, hint, hint_rejected")
      .eq("id", id)
      .single<{
        id: string;
        mistake_id: string;
        type: string;
        prompt: string;
        answer: string;
        hint: string | null;
        hint_rejected: string[] | null;
      }>();
    if (itemErr || !item) {
      return NextResponse.json({ error: "Ejercicio no encontrado." }, { status: 404 });
    }

    const { data: mistake, error: mErr } = await sb
      .from("mistakes")
      .select("category, explanation_es")
      .eq("id", item.mistake_id)
      .single<{ category: string; explanation_es: string }>();
    if (mErr || !mistake) {
      return NextResponse.json({ error: "Error asociado no encontrado." }, { status: 404 });
    }

    // La pista actual pasa a la lista de descartadas para que no vuelva a salir.
    const rejected = [...(item.hint_rejected ?? [])];
    if (item.hint?.trim() && !rejected.includes(item.hint.trim())) {
      rejected.push(item.hint.trim());
    }

    let hint = "";
    const totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !hint; attempt++) {
      const result = await generateHintForItem({
        category: mistake.category,
        explanation_es: mistake.explanation_es,
        type: item.type,
        prompt: item.prompt,
        answer: item.answer,
        rejected,
      });

      totals.input += result.usage.input_tokens;
      totals.output += result.usage.output_tokens;
      totals.cacheRead += result.usage.cache_read_tokens;
      totals.cacheCreation += result.usage.cache_creation_tokens;

      if (hintIsUsable(result.hint, item.answer, rejected)) {
        hint = result.hint;
      } else if (result.hint.trim()) {
        // No sirve: la sumamos a las descartadas para no repetirla al reintentar.
        rejected.push(result.hint.trim());
      }
    }

    // Registrar el consumo aunque no hayamos conseguido pista (se ha gastado).
    await sb.from("ai_generations").insert({
      user_id: OWNER_USER_ID,
      mistake_id: item.mistake_id,
      kind: "rehint",
      model: GENERATION_MODEL,
      input_tokens: totals.input,
      output_tokens: totals.output,
      cache_read_tokens: totals.cacheRead,
      cache_creation_tokens: totals.cacheCreation,
      items_inserted: 0,
    });

    if (!hint) {
      // Dejamos constancia del descarte aunque no haya sustituta: la próxima
      // vez el modelo partirá de una lista de descartadas más larga.
      await sb.from("items").update({ hint_rejected: rejected }).eq("id", item.id);
      return NextResponse.json(
        { error: "No he conseguido una pista mejor. Inténtalo otra vez." },
        { status: 502 }
      );
    }

    const { error: upErr } = await sb
      .from("items")
      .update({ hint, hint_rejected: rejected })
      .eq("id", item.id);
    if (upErr) throw upErr;

    return NextResponse.json({
      hint,
      costUsd: computeCostUsd({
        input_tokens: totals.input,
        output_tokens: totals.output,
        cache_read_tokens: totals.cacheRead,
        cache_creation_tokens: totals.cacheCreation,
      }),
    });
  } catch (err) {
    console.error("POST /api/items/[id]/rehint", err);
    return NextResponse.json({ error: "No se pudo rehacer la pista." }, { status: 500 });
  }
}
