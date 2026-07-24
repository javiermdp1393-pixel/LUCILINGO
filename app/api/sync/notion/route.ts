import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notionConfigured, fetchNotionPages, mapPage, type NotionMistake } from "@/lib/notionSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/sync/notion → pull incremental desde Notion (§5.1).
// Upsert por notion_page_id: crea los nuevos (con su item inicial) y actualiza
// los campos de los existentes. No toca items ni review_state de los existentes.
export async function POST() {
  try {
    if (!notionConfigured()) {
      return NextResponse.json({ error: "Falta NOTION_TOKEN en el servidor." }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // 1. Último sync.
    const { data: stateRow } = await sb
      .from("notion_sync_state")
      .select("last_sync_at")
      .eq("id", 1)
      .single<{ last_sync_at: string | null }>();
    const since = stateRow?.last_sync_at ?? null;

    // 2. Descargar páginas editadas después.
    const rawPages = await fetchNotionPages(since);
    const mapped: NotionMistake[] = [];
    let maxEdited = since;
    for (const p of rawPages) {
      const m = mapPage(p);
      if (m) mapped.push(m);
      const edited = p?.last_edited_time as string | undefined;
      if (edited && (!maxEdited || edited > maxEdited)) maxEdited = edited;
    }

    let created = 0;
    let updated = 0;

    if (mapped.length > 0) {
      // 3. ¿Cuáles ya existen?
      const ids = mapped.map((m) => m.notion_page_id);
      const { data: existingRows, error: exErr } = await sb
        .from("mistakes")
        .select("id, notion_page_id")
        .in("notion_page_id", ids);
      if (exErr) throw exErr;
      const idByPage = new Map(
        ((existingRows ?? []) as { id: string; notion_page_id: string }[]).map((r) => [
          r.notion_page_id,
          r.id,
        ])
      );

      const news = mapped.filter((m) => !idByPage.has(m.notion_page_id));
      const existing = mapped.filter((m) => idByPage.has(m.notion_page_id));

      // 4. Insertar nuevos mistakes (el trigger crea su review_state).
      if (news.length > 0) {
        const { data: inserted, error: insErr } = await sb
          .from("mistakes")
          .insert(
            news.map((m) => ({
              notion_page_id: m.notion_page_id,
              title: m.title,
              category: m.category,
              severity: m.severity,
              source: m.source,
              original_sentence: m.original_sentence,
              correct_form: m.correct_form,
              explanation_es: m.explanation_es,
            }))
          )
          .select("id, notion_page_id");
        if (insErr) throw insErr;
        created = inserted?.length ?? 0;

        const newIdByPage = new Map(
          ((inserted ?? []) as { id: string; notion_page_id: string }[]).map((r) => [
            r.notion_page_id,
            r.id,
          ])
        );

        // 5. Item inicial de cada nuevo mistake que lo tenga.
        const itemRows = news
          .filter((m) => m.initialItem && newIdByPage.has(m.notion_page_id))
          .map((m) => ({
            mistake_id: newIdByPage.get(m.notion_page_id)!,
            type: m.initialItem!.type,
            prompt: m.initialItem!.prompt,
            answer: m.initialItem!.answer,
            distractors: m.initialItem!.distractors,
            status: "active",
            generated_by: "manual",
          }));
        if (itemRows.length > 0) {
          const { error: itemErr } = await sb.from("items").insert(itemRows);
          if (itemErr) throw itemErr;
        }
      }

      // 6. Actualizar los existentes (solo campos del mistake, no items ni SRS).
      for (const m of existing) {
        const { error: upErr } = await sb
          .from("mistakes")
          .update({
            title: m.title,
            category: m.category,
            severity: m.severity,
            source: m.source,
            original_sentence: m.original_sentence,
            correct_form: m.correct_form,
            explanation_es: m.explanation_es,
          })
          .eq("notion_page_id", m.notion_page_id);
        if (upErr) throw upErr;
        updated += 1;
      }
    }

    // 7. Guardar estado del sync.
    const result = { created, updated, seen: rawPages.length };
    await sb
      .from("notion_sync_state")
      .update({
        last_sync_at: maxEdited ?? new Date().toISOString(),
        last_run_at: new Date().toISOString(),
        last_result: result,
      })
      .eq("id", 1);

    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/sync/notion", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo sincronizar: ${message}` }, { status: 500 });
  }
}
