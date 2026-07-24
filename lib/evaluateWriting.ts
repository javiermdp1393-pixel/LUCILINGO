import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL } from "./generateItems";
import type { MistakeCategory, WritingIssue } from "./types";
export type { WritingIssue };

// Corrección de escritura libre (§5.4 / §8.3): devuelve el texto corregido y la
// lista de problemas, cada uno ya clasificado con la taxonomía de categorías.

const CATEGORIES: MistakeCategory[] = [
  "false_friend",
  "vocabulary",
  "preposition",
  "article",
  "word_order",
  "sentence_structure",
  "verb_tense",
  "uncountable",
  "agreement_pronouns",
  "register_tone",
  "spelling",
  "conciseness",
];

const WRITING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["corrected_text", "issues"],
  properties: {
    corrected_text: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["wrong", "correct", "category", "explanation_es"],
        properties: {
          wrong: { type: "string" },
          correct: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          explanation_es: { type: "string" },
        },
      },
    },
  },
} as const;

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

function usageOf(response: Anthropic.Message): Usage {
  return {
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

function textOf(response: Anthropic.Message): string {
  const block = response.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text : "{}";
}

export interface WritingEvaluation {
  correctedText: string;
  issues: WritingIssue[];
  usage: Usage;
}

/** Corrige el texto completo y clasifica cada problema (§8.3). */
export async function evaluateWriting(userText: string): Promise<WritingEvaluation> {
  const client = new Anthropic();

  const prompt = `Eres un profesor de inglés profesional para un hispanohablante de nivel B2 que trabaja en
software y producto (correos a clientes, documentación técnica, tickets, copy de interfaz).

Corrige el siguiente texto en inglés. Devuelve:
- corrected_text: el texto corregido completo, natural y con registro profesional.
- issues: la lista de problemas detectados. Para cada uno: wrong (fragmento incorrecto tal cual
  aparece), correct (cómo debería ser), category (una de la taxonomía) y explanation_es (por qué
  está mal, en español, una o dos frases). Incluye solo problemas reales; no inventes.

Categorías válidas: ${CATEGORIES.join(", ")}.

TEXTO DEL USUARIO:
${userText}`;

  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: WRITING_SCHEMA }, effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  });

  let parsed: { corrected_text?: string; issues?: WritingIssue[] };
  try {
    parsed = JSON.parse(textOf(response));
  } catch {
    parsed = {};
  }

  return {
    correctedText: parsed.corrected_text ?? userText,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    usage: usageOf(response),
  };
}

/** Propone una consigna corta en español para practicar (§5.4 punto 1). */
export async function proposeBrief(): Promise<{ brief: string; usage: Usage }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 300,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["brief"],
          properties: { brief: { type: "string" } },
        },
      },
      effort: "low",
    },
    messages: [
      {
        role: "user",
        content: `Propón UNA consigna corta en español (1-2 frases) para practicar escritura en inglés
en un contexto profesional de software/producto: un correo a un cliente internacional, una nota en
un ticket, un fragmento de documentación técnica o copy de interfaz. Devuelve solo la consigna en
el campo "brief". Varía el contexto cada vez.`,
      },
    ],
  });

  let brief = "";
  try {
    brief = (JSON.parse(textOf(response)).brief ?? "").trim();
  } catch {
    brief = "";
  }
  return { brief, usage: usageOf(response) };
}
