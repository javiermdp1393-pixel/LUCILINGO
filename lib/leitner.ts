import {
  BOX_INTERVALS,
  SEVERITY_MULTIPLIER,
  MASTERY_MIN_BOX,
  MASTERY_MIN_STREAK,
  MASTERY_MIN_DISTINCT_ITEMS,
} from "./constants";
import type { ReviewState, SeverityLevel } from "./types";

export interface NextState {
  box: number;
  interval_days: number;
  due_at: string;
  consecutive_correct: number;
  total_reviews: number;
  total_correct: number;
  distinct_items_ok: number;
  mastered_at: string | null;
  last_reviewed_at: string;
}

/**
 * Calcula el nuevo review_state tras una respuesta (§6).
 *
 * Acierto: box = min(box+1, 5), racha += 1.
 * Fallo:   box = 1, racha = 0. Sin excepciones.
 *
 * El intervalo base de la caja se escala por severidad. `mastered_at` es
 * derivado: box 5 + racha >= 4 + aciertos en >= 3 items distintos. Una vez
 * fijado no se borra (historial de que llegó a dominarse); si el error vuelve
 * a fallar, box baja a 1 y deja de contar como dominado por la condición de box.
 */
export function computeNextState(
  current: Pick<
    ReviewState,
    "box" | "consecutive_correct" | "total_reviews" | "total_correct" | "mastered_at"
  >,
  isCorrect: boolean,
  severity: SeverityLevel,
  distinctItemsOk: number,
  now: Date = new Date()
): NextState {
  const box = isCorrect ? Math.min(current.box + 1, 5) : 1;
  const consecutive = isCorrect ? current.consecutive_correct + 1 : 0;

  const base = BOX_INTERVALS[box] ?? 0;
  const multiplier = SEVERITY_MULTIPLIER[severity] ?? 1;
  const interval_days = box === 0 ? 0 : Math.max(1, Math.round(base * multiplier));

  const due = new Date(now.getTime() + interval_days * 24 * 60 * 60 * 1000);

  const isMastered =
    box >= MASTERY_MIN_BOX &&
    consecutive >= MASTERY_MIN_STREAK &&
    distinctItemsOk >= MASTERY_MIN_DISTINCT_ITEMS;

  return {
    box,
    interval_days,
    due_at: due.toISOString(),
    consecutive_correct: consecutive,
    total_reviews: current.total_reviews + 1,
    total_correct: current.total_correct + (isCorrect ? 1 : 0),
    distinct_items_ok: distinctItemsOk,
    mastered_at: isMastered ? current.mastered_at ?? now.toISOString() : current.mastered_at,
    last_reviewed_at: now.toISOString(),
  };
}
