import { TYPO_MAX_DISTANCE } from "./constants";
import type { Item } from "./types";

export interface Evaluation {
  isCorrect: boolean;
  isTypo: boolean;
  evaluatedBy: "exact" | "llm";
}

/** Normaliza para comparar: minúsculas, sin espacios de sobra ni puntuación final. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?¿¡"']+$/g, "")
    .replace(/\s+/g, " ");
}

/** Distancia de Levenshtein clásica (iterativa, O(n*m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Evalúa una respuesta (§7). En F1 se cubren multiple_choice (comparación
 * exacta) y fill_gap (normalización + alternativas, con detección de errata por
 * Levenshtein <= 2). `correct_sentence` usa por ahora el mismo camino que
 * fill_gap como respaldo; la evaluación por modelo llega en F2.
 */
export function evaluateAnswer(item: Item, userAnswer: string): Evaluation {
  const ua = userAnswer ?? "";

  if (item.type === "multiple_choice") {
    // La respuesta llega como el texto de la opción elegida.
    const isCorrect = normalize(ua) === normalize(item.answer);
    return { isCorrect, isTypo: false, evaluatedBy: "exact" };
  }

  // fill_gap y (respaldo) correct_sentence
  const nUser = normalize(ua);
  const candidates = [item.answer, ...(item.alternatives ?? [])].map(normalize);

  if (candidates.includes(nUser)) {
    return { isCorrect: true, isTypo: false, evaluatedBy: "exact" };
  }

  const isTypo = candidates.some(
    (c) => c.length > TYPO_MAX_DISTANCE && levenshtein(nUser, c) <= TYPO_MAX_DISTANCE
  );

  return { isCorrect: false, isTypo, evaluatedBy: "exact" };
}
