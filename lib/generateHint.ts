import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL } from "./generateItems";
import { CATEGORY_LABELS } from "./constants";

// Genera una pista contextual corta para un ejercicio ya existente (backfill).

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

  const prompt = `Da una pista MUY corta (2 a 6 palabras) para este ejercicio de inglés, que oriente
sin desvelar la respuesta y sin contener la respuesta literal. Un sinónimo o gloss sutil en español
(o en inglés si queda más natural), pensado para que al releer el ejercicio dentro de una semana
sepas por dónde va.

Categoría: ${categoryLabel}
Explicación del error: ${input.explanation_es}
Enunciado: ${input.prompt}
Respuesta correcta (NO la incluyas en la pista): ${input.answer}`;

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
