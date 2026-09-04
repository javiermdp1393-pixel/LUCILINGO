import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL } from "./generateItems";
import { CATEGORY_LABELS } from "./constants";
import type { OtherIssue } from "./types";

// Evaluación de una traducción ES → EN. Una frase tiene muchas traducciones
// válidas, así que la comparación literal contra la de referencia daría falsos
// negativos constantes. Se juzga con el mismo criterio que el resto de la app:
// puntúa si la traducción transmite el significado Y esquiva el error objetivo;
// lo demás se informa pero no penaliza (§8.2).

const EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_correct", "quality", "feedback_es", "natural_version", "other_issues"],
  properties: {
    is_correct: { type: "boolean" },
    quality: { type: "integer", enum: [0, 1, 2, 3] },
    feedback_es: { type: "string" },
    // Versión natural de LA FRASE DEL USUARIO (no la de referencia): es lo que
    // de verdad le enseña, porque parte de lo que él ha escrito.
    natural_version: { type: "string" },
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

export interface TranslationEvaluation {
  isCorrect: boolean;
  quality: number;
  feedbackEs: string;
  naturalVersion: string;
  otherIssues: OtherIssue[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
  };
}

export interface TranslationEvalInput {
  title: string;
  category: string;
  explanation_es: string;
  wrongForm: string | null;
  promptEs: string; // frase en castellano
  answer: string; // traducción de referencia
  alternatives: string[];
  userAnswer: string;
}

export async function evaluateTranslation(
  input: TranslationEvalInput
): Promise<TranslationEvaluation> {
  const client = new Anthropic();
  const categoryLabel = CATEGORY_LABELS[input.category] ?? input.category;
  const alts =
    input.alternatives.length > 0 ? input.alternatives.map((a) => `- ${a}`).join("\n") : "(ninguna)";

  const prompt = `Evalúa la traducción castellano → inglés de un hispanohablante de nivel B2 que
trabaja en software y producto.

Frase en castellano: ${input.promptEs}
Traducción de referencia: ${input.answer}
Otras traducciones válidas conocidas:
${alts}

Error objetivo que este ejercicio entrena: ${input.title} (${categoryLabel})
- Explicación: ${input.explanation_es}
- Forma incorrecta que suele escribir: ${input.wrongForm ?? "—"}

Traducción del usuario: ${input.userAnswer}

Criterio de is_correct — true si se cumplen LAS DOS condiciones:
1. La traducción transmite el significado de la frase en castellano.
2. NO comete el error objetivo.
No exijas que coincida con la de referencia: hay muchas formas válidas de traducir. Acepta
sinónimos, otro orden, variantes británicas o americanas y giros más o menos formales, siempre
que sean inglés natural. Si comete el error objetivo, is_correct es false aunque se entienda.

Otros errores distintos del objetivo van en other_issues y NO afectan a is_correct.

natural_version: cómo diría un nativo LA FRASE DEL USUARIO, corrigiendo lo mínimo. Si su
traducción ya es natural, repítela tal cual.
feedback_es: una o dos frases en español centradas en el error objetivo.
quality: 0 (nada) a 3 (perfecta y natural).`;

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
    natural_version?: string;
    other_issues?: OtherIssue[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Si el modelo falla, no bloqueamos la sesión ni castigamos al usuario.
    return {
      isCorrect: true,
      quality: 2,
      feedbackEs: "",
      naturalVersion: "",
      otherIssues: [],
      usage,
    };
  }

  return {
    isCorrect: parsed.is_correct ?? false,
    quality: typeof parsed.quality === "number" ? parsed.quality : 0,
    feedbackEs: parsed.feedback_es ?? "",
    naturalVersion: (parsed.natural_version ?? "").trim(),
    otherIssues: Array.isArray(parsed.other_issues) ? parsed.other_issues : [],
    usage,
  };
}
