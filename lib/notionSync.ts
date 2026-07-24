import "server-only";

// Cliente de sincronización con Notion (§5.1). Lee la base "Mistake log" vía la
// API de Notion (token de servidor) y mapea cada página a un mistake + su item
// inicial. La escritura de vuelta a Notion queda fuera de la v1.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Base "Mistake log" por defecto; se puede sobreescribir por entorno.
const DEFAULT_DATABASE_ID = "14458520-60d9-4d9d-b387-516c60e26101";

export function notionConfigured(): boolean {
  return !!process.env.NOTION_TOKEN;
}

function databaseId(): string {
  return process.env.NOTION_DATABASE_ID || DEFAULT_DATABASE_ID;
}

// ---------- Mapeos de etiquetas Notion → enums ----------
const CATEGORY_MAP: Record<string, string> = {
  "False friend": "false_friend",
  Vocabulary: "vocabulary",
  Preposition: "preposition",
  Article: "article",
  "Word order": "word_order",
  "Sentence structure": "sentence_structure",
  "Verb & tense": "verb_tense",
  "Agreement & pronouns": "agreement_pronouns",
  "Register & tone": "register_tone",
  "Spelling & capitalisation": "spelling",
  Conciseness: "conciseness",
  Uncountable: "uncountable",
};
const SEVERITY_MAP: Record<string, string> = {
  "Blocks meaning": "blocks_meaning",
  "Sounds unnatural": "unnatural",
  Style: "style",
};
const SOURCE_MAP: Record<string, string> = {
  "Client email": "client_email",
  "Technical doc": "technical_doc",
  "Chat / Teams": "chat_teams",
  "UI copy": "ui_copy",
  Other: "other",
};
const ITEM_TYPE_MAP: Record<string, string> = {
  "Fill the gap": "fill_gap",
  "Multiple choice": "multiple_choice",
  "Correct the sentence": "correct_sentence",
};

// ---------- Extractores de propiedades ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
function richText(prop: any): string | null {
  const arr = prop?.rich_text ?? prop?.title;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const text = arr.map((t: any) => t?.plain_text ?? "").join("").trim();
  return text || null;
}
function selectName(prop: any): string | null {
  return prop?.select?.name ?? null;
}

export interface NotionMistake {
  notion_page_id: string;
  title: string;
  category: string;
  severity: string;
  source: string;
  original_sentence: string | null;
  correct_form: string | null;
  explanation_es: string;
  initialItem: {
    type: string;
    prompt: string;
    answer: string;
    distractors: string[];
  } | null;
}

/** Mapea una página de Notion a nuestro modelo. Devuelve null si le falta lo esencial. */
export function mapPage(page: any): NotionMistake | null {
  const props = page?.properties ?? {};
  const title = richText(props["Mistake"]);
  const categoryLabel = selectName(props["Category"]);
  const explanation = richText(props["Explanation ES"]);

  const category = categoryLabel ? CATEGORY_MAP[categoryLabel] : undefined;
  // title, category y explanation_es son obligatorios en el modelo.
  if (!title || !category || !explanation) return null;

  const severity = SEVERITY_MAP[selectName(props["Severity"]) ?? ""] ?? "unnatural";
  const source = SOURCE_MAP[selectName(props["Source"]) ?? ""] ?? "other";

  const gap = richText(props["Gap sentence"]);
  const answer = richText(props["Answer"]);
  const typeLabel = selectName(props["Exercise type"]);
  const type = typeLabel ? ITEM_TYPE_MAP[typeLabel] : undefined;

  let initialItem: NotionMistake["initialItem"] = null;
  if (gap && answer && type) {
    const distractorsRaw = richText(props["Distractors"]);
    const distractors =
      type === "multiple_choice" && distractorsRaw
        ? distractorsRaw.split("|").map((s) => s.trim()).filter(Boolean)
        : [];
    initialItem = { type, prompt: gap, answer, distractors };
  }

  return {
    // Normalizamos sin guiones para casar con los ids guardados en la migración.
    notion_page_id: String(page.id ?? "").replace(/-/g, ""),
    title,
    category,
    severity,
    source,
    original_sentence: richText(props["Original sentence"]),
    correct_form: richText(props["Correct"]),
    explanation_es: explanation,
    initialItem,
  };
}

/** Descarga todas las páginas editadas después de `sinceISO` (o todas si es null). */
export async function fetchNotionPages(sinceISO: string | null): Promise<any[]> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Falta NOTION_TOKEN");

  const pages: any[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    };
    if (cursor) body.start_cursor = cursor;
    if (sinceISO) {
      body.filter = { timestamp: "last_edited_time", last_edited_time: { after: sinceISO } };
    }

    const res = await fetch(`${NOTION_API}/databases/${databaseId()}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    pages.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}
