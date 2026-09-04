/**
 * Reparte las traducciones a lo largo de la sesión en vez de amontonarlas.
 *
 * Importa por dos razones: traducir es con diferencia lo más lento (~48s de
 * mediana frente a 8-19s del resto), así que agrupadas crean un muro; y la
 * primera pregunta marca el tono, de modo que la sesión arranca siempre con
 * una clásica, más rápida.
 *
 * Conserva el orden relativo dentro de cada grupo: la cola ya viene ordenada
 * por prioridad de repaso y eso no se toca.
 */
export function interleave<T>(classic: T[], translate: T[]): T[] {
  if (translate.length === 0) return classic;
  if (classic.length === 0) return translate;

  const total = classic.length + translate.length;

  // Posiciones repartidas: para 12+3 salen la 4ª, la 8ª y la 12ª.
  const slots = new Set<number>();
  for (let i = 1; i <= translate.length; i++) {
    const pos = Math.round((i * (total + 1)) / (translate.length + 1)) - 1;
    slots.add(Math.min(total - 1, Math.max(1, pos)));
  }

  const out: T[] = [];
  let ci = 0;
  let ti = 0;
  for (let pos = 0; pos < total; pos++) {
    if (slots.has(pos) && ti < translate.length) out.push(translate[ti++]);
    else if (ci < classic.length) out.push(classic[ci++]);
    else if (ti < translate.length) out.push(translate[ti++]);
  }
  return out;
}
