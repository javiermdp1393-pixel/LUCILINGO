// Constantes compartidas de Lucilingo (Mistake Trainer).

// Único usuario de la v1. `user_id` está en todas las tablas desde el día uno;
// cuando se añada Supabase Auth real, se sustituye por auth.uid() y se backfillea.
export const OWNER_USER_ID = "00000000-0000-0000-0000-000000000001";

// Tamaño de la cola de una sesión (§5.3).
export const SESSION_SIZE = 10;

// Leitner de 5 cajas. Intervalo base en días por caja (§6).
export const BOX_INTERVALS = [0, 1, 3, 7, 16, 35] as const;

// Modificador del intervalo por severidad (§6).
export const SEVERITY_MULTIPLIER: Record<string, number> = {
  blocks_meaning: 0.8, // aparece más a menudo
  unnatural: 1.0,
  style: 1.4,
};

// Condición de dominado: box 5 + racha >= 4 + aciertos en >= 3 items distintos.
export const MASTERY_MIN_BOX = 5;
export const MASTERY_MIN_STREAK = 4;
export const MASTERY_MIN_DISTINCT_ITEMS = 3;

// Distancia de Levenshtein por debajo (incl.) de la cual un fallo se considera
// errata y no desconocimiento de la regla (§7).
export const TYPO_MAX_DISTANCE = 2;

// Etiquetas en español para las 12 categorías de la taxonomía.
export const CATEGORY_LABELS: Record<string, string> = {
  false_friend: "Falso amigo",
  vocabulary: "Vocabulario",
  preposition: "Preposición",
  article: "Artículo",
  word_order: "Orden de palabras",
  sentence_structure: "Estructura de frase",
  verb_tense: "Verbo y tiempo",
  uncountable: "Incontable",
  agreement_pronouns: "Concordancia y pronombres",
  register_tone: "Registro y tono",
  spelling: "Ortografía",
  conciseness: "Concisión",
};

export const SEVERITY_LABELS: Record<string, string> = {
  blocks_meaning: "Impide el significado",
  unnatural: "Suena raro",
  style: "Estilo",
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  fill_gap: "Rellena el hueco",
  multiple_choice: "Elige la opción",
  correct_sentence: "Corrige la frase",
};

// Precios de claude-sonnet-5 en USD por millón de tokens (tarifa de
// introducción vigente hasta 2026-08-31; después input 3 / output 15).
// cache_read ≈ 0.1× input, cache_write ≈ 1.25× input.
export const SONNET5_PRICING = {
  input: 2,
  output: 10,
  cacheRead: 0.2,
  cacheWrite: 2.5,
} as const;

/** Coste en USD de una llamada a partir de sus tokens. */
export function computeCostUsd(tokens: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}): number {
  const p = SONNET5_PRICING;
  return (
    (tokens.input_tokens * p.input +
      tokens.output_tokens * p.output +
      tokens.cache_read_tokens * p.cacheRead +
      tokens.cache_creation_tokens * p.cacheWrite) /
    1_000_000
  );
}
