import { supabaseAdmin } from "./supabaseAdmin";
import { OWNER_USER_ID, SESSION_SIZE } from "./constants";
import type { SessionItem, MistakeCategory, SeverityLevel, ItemType } from "./types";

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

/**
 * Construye la cola de una sesión (§5.3). Llama a la función SQL
 * build_session_queue y monta los SessionItem SIN filtrar la respuesta
 * correcta al cliente. Para multiple_choice baraja answer + distractores.
 */
export async function buildSessionItems(): Promise<SessionItem[]> {
  const sb = supabaseAdmin();

  const { data: queue, error } = await sb.rpc("build_session_queue", {
    p_user_id: OWNER_USER_ID,
    p_limit: SESSION_SIZE,
  });
  if (error) throw error;

  const rows = (queue ?? []) as QueueRow[];
  if (rows.length === 0) return [];

  const itemIds = rows.map((r) => r.item_id);
  const mistakeIds = rows.map((r) => r.mistake_id);

  const [{ data: items, error: e2 }, { data: mistakes, error: e3 }] = await Promise.all([
    sb.from("items").select("id, mistake_id, type, prompt, answer, distractors, hint").in("id", itemIds),
    sb.from("mistakes").select("id, ref, title, category, severity").in("id", mistakeIds),
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
