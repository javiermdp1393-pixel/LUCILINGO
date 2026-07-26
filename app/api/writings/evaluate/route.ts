import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { anthropicConfigured, GENERATION_MODEL } from "@/lib/generateItems";
import { evaluateWriting, type KnownMistake } from "@/lib/evaluateWriting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  userText: string;
  briefEs?: string | null;
}

// POST /api/writings/evaluate → guarda el texto, lo corrige y devuelve los problemas.
export async function POST(request: Request) {
  try {
    if (!anthropicConfigured()) {
      return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el servidor." }, { status: 400 });
    }

    const body = (await request.json()) as Body;
    const userText = (body.userText ?? "").trim();
    if (userText.length < 10) {
      return NextResponse.json({ error: "Escribe un poco más para poder corregir." }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // 1. Guardar el texto (draft).
    const { data: writing, error: wErr } = await sb
      .from("writings")
      .insert({ user_id: OWNER_USER_ID, user_text: userText, brief_es: body.briefEs ?? null })
      .select("id")
      .single();
    if (wErr || !writing) throw wErr ?? new Error("No se pudo guardar el texto.");

    // 2. Cargar los errores ya registrados: el corrector los usa para cazar los
    //    fallos propios de este usuario y para clasificarlos con las mismas
    //    categorías del log (si no, una reincidencia entra como error nuevo).
    const { data: known } = await sb
      .from("mistakes")
      .select("title, wrong_form, correct_form, category")
      .eq("user_id", OWNER_USER_ID)
      .eq("archived", false)
      .order("created_at", { ascending: true })
      .limit(120);

    // 3. Corregir.
    const evaluation = await evaluateWriting(userText, (known ?? []) as KnownMistake[]);

    // 4. Guardar resultado.
    await sb
      .from("writings")
      .update({
        corrected_text: evaluation.correctedText,
        feedback_json: { issues: evaluation.issues },
        status: "evaluated",
      })
      .eq("id", writing.id);

    // 5. Registrar consumo.
    await sb.from("ai_generations").insert({
      user_id: OWNER_USER_ID,
      kind: "writing",
      model: GENERATION_MODEL,
      input_tokens: evaluation.usage.input_tokens,
      output_tokens: evaluation.usage.output_tokens,
      cache_read_tokens: evaluation.usage.cache_read_tokens,
      cache_creation_tokens: evaluation.usage.cache_creation_tokens,
      items_inserted: 0,
    });

    return NextResponse.json({
      writingId: writing.id,
      correctedText: evaluation.correctedText,
      issues: evaluation.issues,
    });
  } catch (err) {
    console.error("POST /api/writings/evaluate", err);
    return NextResponse.json({ error: "No se pudo corregir el texto." }, { status: 500 });
  }
}
