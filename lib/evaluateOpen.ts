import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL } from "./generateItems";
import { CATEGORY_LABELS } from "./constants";
import type { OtherIssue } from "./types";

// Evaluación de respuesta abierta (correct_sentence y, en el futuro, escritura
// libre) por modelo (§8.2). Puntúa SOLO si se corrige el error objetivo; los
// demás errores se informan pero no penalizan.

const EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_correct", "quality", "feedback_es", "other_issues"],
  properties: {
    is_correct: { type: "boolean" },
    quality: { type: "integer", enum: [0, 1, 2, 3] },
    feedback_es: { type: "string" },
    other_issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["wrong", "correct", "explanation_es"],
        properties: {
          wrong: { type: "string" },
          correct: { type: "string" },
          explanation_es: { type: "string" },
        },
      },
    },
  },
} as const;

export interface OpenEvaluation {
  isCorrect: boolean;
  quality: number;
  feedbackEs: string;
  otherIssues: OtherIssue[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
  };
}

export interface OpenEvalInput {
  title: string;
  category: string;
  explanation_es: string;
  prompt: string; // frase original con el error
  answer: string; // respuesta correcta de referencia
  userAnswer: string;
}

export async function evaluateOpenAnswer(input: OpenEvalInput): Promise<OpenEvaluation> {
  const client = new Anthropic();
  const categoryLabel = CATEGORY_LABELS[input.category] ?? input.category;

  const prompt = `Evalúa si el usuario ha corregido este error concreto.

Error objetivo: ${input.title} (${categoryLabel}) — ${input.explanation_es}
Frase original con el error: ${input.prompt}
Respuesta correcta de referencia: ${input.answer}
Respuesta del usuario: ${input.userAnswer}

Criterio: is_correct es true si el usuario ha corregido EL ERROR OBJETIVO, aunque su frase
difiera de la de referencia en otros aspectos y aunque introduzca otros errores distintos.
Los demás errores se listan en other_issues pero NO afectan a is_correct. feedback_es es una o
dos frases en español. quality va de 0 (nada) a 3 (perfecto).`;

  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: EVAL_SCHEMA }, effort: "low" },
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

  let parsed: {
    is_correct?: boolean;
    quality?: number;
    feedback_es?: string;
    other_issues?: OtherIssue[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Si el modelo falla, no bloqueamos la sesión: lo damos por correcto sin feedback.
    return { isCorrect: true, quality: 2, feedbackEs: "", otherIssues: [], usage };
  }

  return {
    isCorrect: parsed.is_correct ?? false,
    quality: typeof parsed.quality === "number" ? parsed.quality : 0,
    feedbackEs: parsed.feedback_es ?? "",
    otherIssues: Array.isArray(parsed.other_issues) ? parsed.other_issues : [],
    usage,
  };
}
