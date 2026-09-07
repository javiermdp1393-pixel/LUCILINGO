// Emparejar un error recién detectado con uno ya registrado.
//
// El emparejamiento va por el FRAGMENTO, no por la categoría: el fragmento
// incorrecto es la identidad del error ("from its side" es el mismo fallo lo
// etiquete el modelo como preposición o como pronombre), mientras que la
// categoría es una interpretación que varía entre llamadas. Filtrar por
// categoría hacía que reincidencias evidentes entraran como errores nuevos.

/** Minúsculas, sin puntuación ni espacios de sobra, para comparar formas. */
export function normalizeForm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!?¿¡"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿`needle` contiene a `stored` como palabra(s) completa(s)? */
function containsAsWords(needle: string, stored: string): boolean {
  return new RegExp(`(^|\\s)${stored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(needle);
}

// Palabras demasiado comunes para identificar un error por sí solas: si el
// fragmento es solo una de estas, exigimos igualdad exacta.
const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "is", "be", "it",
]);

function tooGenericAlone(form: string): boolean {
  return !form.includes(" ") && STOPWORDS.has(form);
}

/**
 * Dos formas designan el mismo error si son iguales, o si una contiene a la
 * otra como palabras completas. El límite de palabra evita que "bad" empareje
 * con "badge"; la lista de palabras vacías evita emparejar por un "the" suelto.
 */
export function formsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (!tooGenericAlone(b) && b.length >= 3 && containsAsWords(a, b)) return true;
  if (!tooGenericAlone(a) && a.length >= 3 && containsAsWords(b, a)) return true;
  return false;
}

export interface MistakeCandidate {
  id: string;
  wrong_form: string | null;
  category: string;
}

/**
 * Busca entre los errores ya registrados el que corresponde a este fragmento.
 * Si hay varios candidatos gana el de la misma categoría y, en su defecto, el
 * fragmento más específico (el más largo). Devuelve null si es un error nuevo.
 */
export function findExistingMistake<T extends MistakeCandidate>(
  wrong: string,
  category: string,
  candidates: T[]
): T | null {
  const needle = normalizeForm(wrong);
  if (!needle) return null;

  const matches = candidates.filter((row) =>
    formsMatch(needle, normalizeForm(row.wrong_form ?? ""))
  );
  if (matches.length === 0) return null;

  return (
    matches.find((m) => m.category === category) ??
    [...matches].sort((a, b) => (b.wrong_form ?? "").length - (a.wrong_form ?? "").length)[0]
  );
}
