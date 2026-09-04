import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL, type MistakeForPrompt, type GenerationUsage } from "./generateItems";
import type { CandidateItem } from "./validateItem";
import { CATEGORY_LABELS, TRANSLATIONS_PER_MISTAKE } from "./constants";

// Ejercicios de traducción ES → EN (§ modo traducción). Siguen el mismo
// principio que el resto: no son frases genéricas de libro, sino frases en
// castellano cuya versión inglesa natural OBLIGA a aplicar la regla que este
// usuario falla. Si la traducción se puede resolver esquivando la regla, el
// ejercicio no mide nada.

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt_es", "answer_en", "alternatives", "hint"],
        properties: {
          prompt_es: { type: "string" },
          answer_en: { type: "string" },
          alternatives: { type: "array", items: { type: "string" } },
          hint: { type: "string" },
        },
      },
    },
  },
} as const;

function buildPrompt(m: MistakeForPrompt, existingPrompts: string[]): string {
  const categoryLabel = CATEGORY_LABELS[m.category] ?? m.category;
  const existing =
    existingPrompts.length > 0 ? existingPrompts.map((p) => `- ${p}`).join("\n") : "(ninguna todavía)";

  return `Eres un profesor de inglés profesional para un hispanohablante de nivel B2 que trabaja en
software y producto: escribe correos a clientes internacionales, documentación técnica,
tickets y copy de interfaz.

Este usuario entiende bien el inglés escrito; donde falla es al PRODUCIR desde el castellano.

ERROR A PRACTICAR
- Regla: ${m.title}
- Categoría: ${categoryLabel}
- Forma incorrecta que suele escribir: ${m.wrong_form ?? "—"}
- Forma correcta: ${m.correct_form ?? "—"}
- Frase real donde lo cometió: ${m.original_sentence ?? "—"}
- Explicación: ${m.explanation_es}

Frases que ya existen para este error (NO las repitas ni las parafrasees):
${existing}

Genera ${TRANSLATIONS_PER_MISTAKE} ejercicios de traducción castellano → inglés, en contextos
profesionales distintos entre sí y distintos del original.

Reglas imprescindibles:
- prompt_es: la frase EN CASTELLANO, de 8 a 18 palabras, natural, del tipo que este usuario
  escribiría de verdad en su trabajo. Nada de castellano artificial calcado del inglés.
- La frase en castellano debe estar construida de forma que su traducción natural al inglés
  OBLIGUE a aplicar esta regla concreta. Si se puede traducir bien sin tocar la regla, no sirve.
- La frase en castellano es justo la que induce el error: debe tentar a escribir
  "${m.wrong_form ?? "la forma incorrecta"}".
- answer_en: la traducción inglesa correcta y natural (registro profesional).
- alternatives: otras traducciones igualmente válidas que también aplican bien la regla
  (2 o 3 si las hay; puede ir vacío). Sirven para no marcar como fallo una respuesta buena.
- hint: pista MUY corta (2 a 6 palabras) que oriente sobre la trampa sin desvelar la traducción.
  NO puede contener la respuesta ni la forma correcta literal.
- No incluyas la traducción inglesa dentro de prompt_es.`;
}

export interface TranslationGenerationResult {
  items: CandidateItem[];
  usage: GenerationUsage;
}

interface RawTranslation {
  prompt_es?: string;
  answer_en?: string;
  alternatives?: string[];
  hint?: string;
}

/** Genera ejercicios de traducción ES → EN para un error. No valida ni guarda. */
export async function generateTranslationsForMistake(
  mistake: MistakeForPrompt,
  existingPrompts: string[]
): Promise<TranslationGenerationResult> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA }, effort: "medium" },
    messages: [{ role: "user", content: buildPrompt(mistake, existingPrompts) }],
  });

  const usage: GenerationUsage = {
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  let parsed: { items?: RawTranslation[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: [], usage };
  }

  const items: CandidateItem[] = (parsed.items ?? []).map((t) => ({
    type: "translate_es_en" as const,
    prompt: (t.prompt_es ?? "").trim(),
    answer: (t.answer_en ?? "").trim(),
    alternatives: (t.alternatives ?? []).map((s) => s.trim()).filter(Boolean),
    distractors: [],
    hint: t.hint?.trim() || undefined,
  }));

  return { items, usage };
}
