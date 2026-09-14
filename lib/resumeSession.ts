/**
 * Por dónde se retoma una sesión interrumpida.
 *
 * Se calcula buscando la primera pregunta cuyo ítem no tiene respuesta
 * registrada, y NO contando cuántas respuestas hay: si una respuesta de en
 * medio no llegó a guardarse, contar dejaría al usuario saltándose una pregunta
 * y respondiendo otra dos veces.
 */
export interface ResumeState {
  /** Índice de la primera pregunta sin responder. */
  startIndex: number;
  /** true si ya están todas respondidas: no hay nada que retomar. */
  complete: boolean;
}

export function resumePosition(
  queue: { itemId: string }[],
  answeredItemIds: Iterable<string>
): ResumeState {
  const answered = new Set(answeredItemIds);
  const startIndex = queue.findIndex((it) => !answered.has(it.itemId));
  return startIndex === -1 ? { startIndex: queue.length, complete: true } : { startIndex, complete: false };
}
