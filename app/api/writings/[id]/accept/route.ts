import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import type { WritingIssue } from "@/lib/evaluateWriting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  accepted: WritingIssue[];
}

interface CandidateRow {
  id: string;
  wrong_form: string | null;
  category: string;
}

/** Minúsculas, sin puntuación ni espacios de sobra, para comparar formas. */
function normalizeForm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!?¿¡"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿`needle` contiene a `stored` como palabra(s) completa(s)? */
function containsAsWords(needle: string, stored: string): boolean {
  return new RegExp(`(^|\\s)${stored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(needle);
}

// Palabras demasiado comunes para identificar un error por sí solas: si el
// fragmento es solo una de estas, exigimos igualdad exacta.
const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "is", "be", "it",
]);

function tooGenericAlone(form: string): boolean {
  return !form.includes(" ") && STOPWORDS.has(form);
}

/**
 * Dos formas designan el mismo error si son iguales, o si una contiene a la
 * otra como palabras completas. El límite de palabra evita que "bad" empareje
 * con "badge"; la lista de palabras vacías evita emparejar por un "the" suelto.
 */
function formsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (!tooGenericAlone(b) && b.length >= 3 && containsAsWords(a, b)) return true;
  if (!tooGenericAlone(a) && a.length >= 3 && containsAsWords(b, a)) return true;
  return false;
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

      // ¿Existe ya? El emparejamiento va por el FRAGMENTO, no por la categoría:
      // el fragmento incorrecto es la identidad del error ("from its side" es el
      // mismo fallo lo etiquete el modelo como preposición o como pronombre),
      // mientras que la categoría es una interpretación que varía entre
      // llamadas. Filtrar por categoría hacía que reincidencias evidentes
      // entraran como errores nuevos.
      const { data: candidates } = await sb
        .from("mistakes")
        .select("id, wrong_form, category")
        .eq("user_id", OWNER_USER_ID)
        .eq("archived", false)
        .not("wrong_form", "is", null);

      const needle = normalizeForm(wrong);
      const matches = ((candidates ?? []) as CandidateRow[]).filter((row) =>
        formsMatch(needle, normalizeForm(row.wrong_form ?? ""))
      );
      // Si hay varios, gana el de la misma categoría y, en su defecto, el
      // fragmento más específico (el más largo).
      const existing =
        matches.find((m) => m.category === issue.category) ??
        matches.sort((a, b) => (b.wrong_form ?? "").length - (a.wrong_form ?? "").length)[0];

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
