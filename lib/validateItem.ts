import type { ItemType } from "./types";

// Ítem candidato tal y como lo devuelve la IA (§8.1), antes de guardarse.
export interface CandidateItem {
  type: ItemType;
  prompt: string;
  answer: string;
  alternatives: string[];
  distractors: string[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** Normaliza un enunciado para comparar duplicados: minúsculas, espacios colapsados. */
function normalizePrompt(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Validación automática antes de guardar un ítem generado (§5.2). Filtra lo
 * estructural, no lo semántico (para eso está el botón de flag). Descarta si:
 * - fill_gap sin exactamente un ___
 * - la respuesta aparece literalmente en el prompt (fill_gap / multiple_choice)
 * - algún distractor coincide con la respuesta o con otro distractor
 * - multiple_choice con menos de 3 distractores
 * - el prompt es idéntico al de un ítem ya existente del mismo error
 */
export function validateItem(item: CandidateItem, existingPrompts: string[]): ValidationResult {
  const prompt = (item.prompt ?? "").trim();
  const answer = (item.answer ?? "").trim();

  if (!prompt) return { valid: false, reason: "prompt vacío" };
  if (!answer) return { valid: false, reason: "answer vacía" };

  // Prompt duplicado (contra los existentes del mismo error).
  const nPrompt = normalizePrompt(prompt);
  if (existingPrompts.some((p) => normalizePrompt(p) === nPrompt)) {
    return { valid: false, reason: "prompt idéntico a uno existente" };
  }

  if (item.type === "fill_gap") {
    const gaps = prompt.split("___").length - 1;
    if (gaps !== 1) {
      return { valid: false, reason: `fill_gap debe tener exactamente un ___ (tiene ${gaps})` };
    }
    if (prompt.toLowerCase().includes(answer.toLowerCase())) {
      return { valid: false, reason: "la respuesta aparece en el prompt" };
    }
  }

  if (item.type === "multiple_choice") {
    const distractors = (item.distractors ?? []).map((d) => d.trim()).filter(Boolean);
    if (distractors.length < 3) {
      return { valid: false, reason: `multiple_choice necesita 3 distractores (tiene ${distractors.length})` };
    }
    const lowerAnswer = answer.toLowerCase();
    // Distractor == respuesta.
    if (distractors.some((d) => d.toLowerCase() === lowerAnswer)) {
      return { valid: false, reason: "un distractor coincide con la respuesta" };
    }
    // Distractores duplicados entre sí.
    const seen = new Set<string>();
    for (const d of distractors) {
      const key = d.toLowerCase();
      if (seen.has(key)) return { valid: false, reason: "distractores duplicados" };
      seen.add(key);
    }
    if (prompt.toLowerCase().includes(lowerAnswer)) {
      return { valid: false, reason: "la respuesta aparece en el prompt" };
    }
  }

  return { valid: true };
}
