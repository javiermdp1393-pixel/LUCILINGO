import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

// Cerrojo para los trabajos largos de Ajustes (generar variantes, pistas,
// traducciones, sync con Notion).
//
// Por qué hace falta: el botón se deshabilita mientras el fetch está en vuelo,
// pero si la petición se corta en el cliente (timeout del navegador, cambio de
// red, recarga de la página) el botón se vuelve a habilitar mientras la función
// del servidor SIGUE ejecutándose. Un segundo clic arrancaba entonces una
// segunda ejecución que leía la misma lista de errores pendientes y generaba
// ejercicios por duplicado, pagando dos veces la API.
//
// El cerrojo vive en la base de datos (no en memoria del proceso) porque cada
// invocación serverless es un proceso distinto.

export type JobKind = "generate_items" | "backfill_hints" | "generate_translations" | "sync_notion";

const DEFAULT_TTL_SECONDS = 300;

/** Intenta tomar el cerrojo. false = ya hay una ejecución viva. */
export async function acquireJobLock(
  kind: JobKind,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("try_acquire_job_lock", {
    p_kind: kind,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return data === true;
}

/** Libera el cerrojo. Best-effort: si falla, el TTL lo acaba soltando igual. */
export async function releaseJobLock(kind: JobKind): Promise<void> {
  try {
    await supabaseAdmin().rpc("release_job_lock", { p_kind: kind });
  } catch (e) {
    console.error("releaseJobLock", kind, e);
  }
}

/** Mensaje único para el 409, para que las cuatro rutas digan lo mismo. */
export const JOB_BUSY_MESSAGE =
  "Ya hay una ejecución en curso. Espera a que termine antes de volver a lanzarla.";
