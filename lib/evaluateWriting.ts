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

// Error ya registrado en el log, que se pasa al corrector como contexto.
export interface KnownMistake {
  title: string;
  wrong_form: string | null;
  correct_form: string | null;
  category: string;
}

/**
 * Corrige el texto completo y clasifica cada problema (§8.3).
 *
 * Recibe los errores ya registrados del usuario: sin ese contexto el corrector
 * es genérico y (a) pasa por alto fallos que en abstracto son aceptables pero
 * que este usuario arrastra, y (b) clasifica con una categoría distinta a la
 * del log, con lo que la reincidencia se guardaba como error duplicado.
 */
export async function evaluateWriting(
  userText: string,
  knownMistakes: KnownMistake[] = []
): Promise<WritingEvaluation> {
  const client = new Anthropic();

  const knownBlock =
    knownMistakes.length > 0
      ? `ERRORES RECURRENTES DE ESTE USUARIO (ya registrados en su log)
Presta especial atención: si el texto comete alguno de estos, señálalo SIEMPRE aunque en otro
contexto pudiera pasar por aceptable, y usa EXACTAMENTE la categoría indicada aquí para que
cuadre con su historial.

${knownMistakes
  .map(
    (m) =>
      `- [${m.category}] ${m.wrong_form ?? m.title}${m.correct_form ? ` → ${m.correct_form}` : ""}`
  )
  .join("\n")}

`
      : "";

  const prompt = `Eres un profesor de inglés profesional para un hispanohablante de nivel B2 que trabaja en
software y producto (correos a clientes, documentación técnica, tickets, copy de interfaz).

${knownBlock}Corrige el siguiente texto en inglés. Devuelve:
- corrected_text: el texto corregido completo, natural y con registro profesional.
- issues: la lista de problemas detectados. Para cada uno:
  - wrong: el fragmento incorrecto MÍNIMO, tal cual aparece en el texto (una o pocas palabras;
    no copies la frase entera).
  - correct: solo la forma corregida de ese fragmento (igual de breve).
  - category: una de la taxonomía. Si el problema coincide con un error recurrente de la lista
    anterior, usa su misma categoría.
  - explanation_es: por qué está mal, en español, una o dos frases.
  Incluye solo problemas reales; no inventes.

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
