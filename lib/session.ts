import { supabaseAdmin } from "./supabaseAdmin";
import {
  OWNER_USER_ID,
  SESSION_SIZE,
  TRANSLATIONS_PER_SESSION,
  TRANSLATE_SESSION_SIZE,
  CLASSIC_ITEM_TYPES,
  TRANSLATE_ITEM_TYPES,
} from "./constants";
import { interleave } from "./interleave";
import type {
  SessionItem,
  MistakeCategory,
  SeverityLevel,
  ItemType,
  SessionMode,
} from "./types";

/** Baraja una copia del array (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface QueueRow {
  mistake_id: string;
  item_id: string;
  ord: number;
}

interface ItemRow {
  id: string;
  mistake_id: string;
  type: ItemType;
  prompt: string;
  answer: string;
  distractors: string[] | null;
  hint: string | null;
}

interface MistakeRow {
  id: string;
  ref: number;
  title: string;
  category: MistakeCategory;
  severity: SeverityLevel;
}

/** Una pasada de la cola: pide N ítems de ciertos tipos, excluyendo errores ya elegidos. */
async function queue(limit: number, types: string[], exclude: string[]): Promise<QueueRow[]> {
  if (limit <= 0) return [];
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("build_session_queue", {
    p_user_id: OWNER_USER_ID,
    p_limit: limit,
    p_types: types,
    p_exclude: exclude,
  });
  if (error) throw error;
  return (data ?? []) as QueueRow[];
}

/** Hidrata las filas de la cola con el enunciado, sin filtrar la respuesta al cliente. */
async function hydrate(rows: QueueRow[]): Promise<SessionItem[]> {
  if (rows.length === 0) return [];
  const sb = supabaseAdmin();

  const [{ data: items, error: e2 }, { data: mistakes, error: e3 }] = await Promise.all([
    sb
      .from("items")
      .select("id, mistake_id, type, prompt, answer, distractors, hint")
      .in("id", rows.map((r) => r.item_id)),
    sb
      .from("mistakes")
      .select("id, ref, title, category, severity")
      .in("id", rows.map((r) => r.mistake_id)),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;

  const itemById = new Map((items as ItemRow[]).map((i) => [i.id, i]));
  const mistakeById = new Map((mistakes as MistakeRow[]).map((m) => [m.id, m]));

  const result: SessionItem[] = [];
  for (const q of rows) {
    const item = itemById.get(q.item_id);
    const mistake = mistakeById.get(q.mistake_id);
    if (!item || !mistake) continue;

    const base: SessionItem = {
      ord: q.ord,
      itemId: item.id,
      mistakeId: mistake.id,
      ref: mistake.ref,
      title: mistake.title,
      category: mistake.category,
      severity: mistake.severity,
      type: item.type,
      prompt: item.prompt,
      hint: item.hint,
    };

    if (item.type === "multiple_choice") {
      base.options = shuffle([item.answer, ...(item.distractors ?? [])]);
    }
    result.push(base);
  }
  return result;
}

/**
 * Construye la cola de una sesión (§5.3).
 *
 * La sesión diaria («daily») es una sola: 15 ítems de los que 3 son de
 * traducción ES → EN, repartidos a lo largo de la cola. Se montan en dos
 * pasadas —primero las traducciones, luego el resto excluyendo esos errores—
 * para que un mismo error no salga dos veces en la misma sesión. Si no hay
 * traducciones disponibles, la sesión se completa con ejercicios clásicos.
 *
 * «translate» es la sesión opcional de solo traducción, más corta.
 */
export async function buildSessionItems(mode: SessionMode = "daily"): Promise<SessionItem[]> {
  if (mode === "translate") {
    return hydrate(await queue(TRANSLATE_SESSION_SIZE, TRANSLATE_ITEM_TYPES, []));
  }

  const translateRows = await queue(TRANSLATIONS_PER_SESSION, TRANSLATE_ITEM_TYPES, []);
  const classicRows = await queue(
    SESSION_SIZE - translateRows.length,
    CLASSIC_ITEM_TYPES,
    translateRows.map((r) => r.mistake_id)
  );

  const [translate, classic] = await Promise.all([hydrate(translateRows), hydrate(classicRows)]);

  return interleave(classic, translate).map((item, i) => ({ ...item, ord: i + 1 }));
}
