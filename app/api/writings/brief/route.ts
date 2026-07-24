import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { anthropicConfigured, GENERATION_MODEL } from "@/lib/generateItems";
import { proposeBrief } from "@/lib/evaluateWriting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/writings/brief → propone una consigna corta en español.
export async function POST() {
  try {
    if (!anthropicConfigured()) {
      return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el servidor." }, { status: 400 });
    }

    const { brief, usage } = await proposeBrief();

    const sb = supabaseAdmin();
    await sb.from("ai_generations").insert({
      user_id: OWNER_USER_ID,
      kind: "brief",
      model: GENERATION_MODEL,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_tokens: usage.cache_read_tokens,
      cache_creation_tokens: usage.cache_creation_tokens,
      items_inserted: 0,
    });

    return NextResponse.json({ brief });
  } catch (err) {
    console.error("POST /api/writings/brief", err);
    return NextResponse.json({ error: "No se pudo proponer una consigna." }, { status: 500 });
  }
}
