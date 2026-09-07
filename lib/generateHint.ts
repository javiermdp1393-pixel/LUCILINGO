import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL } from "./generateItems";
import { CATEGORY_LABELS, TASK_INSTRUCTIONS } from "./constants";

// Genera una pista contextual corta para un ejercicio ya existente: para el
// backfill de los que no tienen, y para rehacer las que el usuario descarta
// durante la sesión.

const HINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hint"],
  properties: { hint: { type: "string" } },
} as const;

export interface HintInput {
  category: string;
  explanation_es: string;
  type: string;
  prompt: string;
  answer: string;
  /** Pistas ya descartadas: el modelo debe evitarlas y cambiar de enfoque. */
  rejected?: string[];
}

export interface HintResult {
  hint: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
  };
}

export async function generateHintForItem(input: HintInput): Promise<HintResult> {
  const client = new Anthropic();
  const categoryLabel = CATEGORY_LABELS[input.category] ?? input.category;
  const rejected = input.rejected ?? [];

  const rejectedBlock =
    rejected.length > 0
      ? `\nEl usuario ya ha descartado estas pistas por no ayudarle. No las repitas ni las
parafrasees, y cambia de enfoque: si las anteriores glosaban el significado, apunta a la
estructura o al matiz gramatical; si eran gramaticales, da un sinónimo de contexto.
${rejected.map((r) => `- ${r}`).join("\n")}\n`
      : "";

  const prompt = `Da una pista MUY corta (2 a 6 palabras) para este ejercicio de inglés, que oriente
sin desvelar la respuesta y sin contener la respuesta literal. Un sinónimo o gloss sutil en español
(o en inglés si queda más natural), pensado para que al releer el ejercicio dentro de una semana
sepas por dónde va.

Tarea del ejercicio: ${TASK_INSTRUCTIONS[input.type] ?? input.type}
Categoría: ${categoryLabel}
Explicación del error: ${input.explanation_es}
Enunciado: ${input.prompt}
Respuesta correcta (NO la incluyas en la pista): ${input.answer}
${rejectedBlock}`;

  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 400,
    output_config: { format: { type: "json_schema", schema: HINT_SCHEMA }, effort: "low" },
    messages: [{ role: "user", content: prompt }],
  });

  const usage = {
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  let hint = "";
  try {
    hint = (JSON.parse(raw).hint ?? "").trim();
  } catch {
    hint = "";
  }
  return { hint, usage };
}
