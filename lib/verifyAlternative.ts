import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL } from "./generateItems";
import { CATEGORY_LABELS } from "./constants";

// Segunda opinión para los fill_gap que fallan la comparación exacta.
//
// Motivo (§7): la tarjeta solo debe puntuar el ERROR OBJETIVO. Sin esto, se
// marcaban como fallo respuestas que en realidad eran correctas —p. ej. "fill
// out the gaps" (válido en inglés americano) o corregir el existencial sin
// adivinar un "probably" ajeno a la regla—. Eso frustra y, peor, manda a caja 1
// errores ya dominados, corrompiendo el calendario de repaso.

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_valid", "reason_es"],
  properties: {
    is_valid: { type: "boolean" },
    reason_es: { type: "string" },
  },
} as const;

export interface VerifyInput {
  title: string;
  category: string;
  explanation_es: string;
  prompt: string;
  answer: string;
  userAnswer: string;
}

export interface VerifyResult {
  isValid: boolean;
  reasonEs: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
  };
}

export async function verifyAlternativeAnswer(input: VerifyInput): Promise<VerifyResult> {
  const client = new Anthropic();
  const categoryLabel = CATEGORY_LABELS[input.category] ?? input.category;

  const prompt = `Un hispanohablante practica un error concreto de inglés con un ejercicio de hueco.
Su respuesta no coincide literalmente con la de referencia. Decide si aun así es VÁLIDA.

Error que se practica: ${input.title} (${categoryLabel}) — ${input.explanation_es}
Frase con el hueco: ${input.prompt}
Respuesta de referencia: ${input.answer}
Respuesta del usuario: ${input.userAnswer}

Criterio: is_valid es true si, al colocar la respuesta del usuario en el hueco, la frase resulta
correcta en inglés Y demuestra que ha evitado el error objetivo. Acepta variantes regionales
(por ejemplo británico frente a americano) y sinónimos naturales. No exijas que coincida palabra
por palabra con la referencia, ni penalices por omitir matices que no forman parte del error
objetivo.
is_valid es false si la respuesta comete el error objetivo, o si hace la frase incorrecta o poco
natural en inglés.
reason_es: una frase breve en español explicando la decisión.`;

  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 800,
    output_config: { format: { type: "json_schema", schema: VERIFY_SCHEMA }, effort: "low" },
    messages: [{ role: "user", content: prompt }],
  });

  const usage = {
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  const block = response.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      isValid: parsed.is_valid === true,
      reasonEs: (parsed.reason_es ?? "").trim(),
      usage,
    };
  } catch {
    // Ante la duda, no cambiamos el veredicto original.
    return { isValid: false, reasonEs: "", usage };
  }
}
