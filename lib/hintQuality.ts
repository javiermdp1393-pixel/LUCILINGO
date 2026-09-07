/**
 * Comprueba que una pista sirve antes de guardarla: que existe, que no desvela
 * la respuesta y que no repite una que el usuario ya descartó.
 *
 * Se valida en el servidor porque una pista que contiene la respuesta convierte
 * el ejercicio en un regalo, y el modelo se despista con eso de vez en cuando.
 */
export function hintIsUsable(hint: string, answer: string, rejected: string[] = []): boolean {
  const h = hint.trim().toLowerCase();
  if (!h) return false;

  const a = answer.trim().toLowerCase();

  // La respuesta entera dentro de la pista.
  if (a.length >= 4 && h.includes(a)) return false;

  // O todas sus palabras con carga: las cortas (the, to, in) salen en cualquier
  // frase y bloquear por ellas dejaría casi cualquier pista fuera.
  const revealing = a.split(/\s+/).filter((w) => w.length >= 4);
  if (revealing.length > 0 && revealing.every((w) => h.includes(w))) return false;

  return !rejected.some((r) => r.trim().toLowerCase() === h);
}
