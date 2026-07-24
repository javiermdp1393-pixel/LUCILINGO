import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CandidateItem } from "./validateItem";
import { CATEGORY_LABELS } from "./constants";

// Modelo de generación. Sonnet 5: buena calidad de ejercicios a coste bajo.
export const GENERATION_MODEL = "claude-sonnet-5";

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Datos mínimos del error que necesita el prompt.
export interface MistakeForPrompt {
  title: string;
  category: string;
  wrong_form: string | null;
  correct_form: string | null;
  original_sentence: string | null;
  explanation_es: string;
}

// Esquema de salida: garantiza JSON válido con la forma esperada (§8.1).
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
        required: ["type", "prompt", "answer", "alternatives", "distractors"],
        properties: {
          type: { type: "string", enum: ["fill_gap", "multiple_choice", "correct_sentence"] },
          prompt: { type: "string" },
          answer: { type: "string" },
          alternatives: { type: "array", items: { type: "string" } },
          distractors: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function buildPrompt(m: MistakeForPrompt, existingPrompts: string[]): string {
  const categoryLabel = CATEGORY_LABELS[m.category] ?? m.category;
  const existing =
    existingPrompts.length > 0
      ? existingPrompts.map((p) => `- ${p}`).join("\n")
      : "(ninguno todavía)";

  return `Eres un profesor de inglés profesional para un hispanohablante de nivel B2 que trabaja en
software y producto: escribe correos a clientes internacionales, documentación técnica,
tickets y copy de interfaz.

ERROR A PRACTICAR
- Regla: ${m.title}
- Categoría: ${categoryLabel}
- Forma incorrecta: ${m.wrong_form ?? "—"}
- Forma correcta: ${m.correct_form ?? "—"}
- Frase real donde lo cometió: ${m.original_sentence ?? "—"}
- Explicación: ${m.explanation_es}

Ejercicios que ya existen para este error (NO los repitas ni los parafrasees):
${existing}

Genera 3 ejercicios nuevos, uno de cada tipo, en contextos profesionales DISTINTOS entre sí
y distintos del original. Frases de 8 a 20 palabras, naturales, del tipo que este usuario
escribiría de verdad en su trabajo.

Reglas:
- fill_gap: exactamente un hueco marcado con ___ , y la respuesta NO puede aparecer en la frase.
- multiple_choice: 3 distractores plausibles, cada uno reflejando un error típico de un
  hispanohablante, no opciones absurdas. La respuesta correcta va en "answer" (no la incluyas
  en "distractors").
- correct_sentence: una frase que contenga este error y solo este error; "answer" es la frase corregida.

Devuelve para cada ejercicio: type, prompt, answer, alternatives (respuestas alternativas válidas,
puede ir vacío) y distractors (solo para multiple_choice; vacío en los demás).`;
}

/**
 * Genera 3 ejercicios (uno de cada tipo) para un error, vía Anthropic (§8.1).
 * Requiere ANTHROPIC_API_KEY en el entorno (solo servidor). No valida ni guarda:
 * de eso se encarga la ruta con validateItem.
 */
export async function generateItemsForMistake(
  mistake: MistakeForPrompt,
  existingPrompts: string[]
): Promise<CandidateItem[]> {
  const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA }, effort: "medium" },
    messages: [{ role: "user", content: buildPrompt(mistake, existingPrompts) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  let parsed: { items?: CandidateItem[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}
