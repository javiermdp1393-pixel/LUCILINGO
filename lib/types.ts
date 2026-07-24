// Tipos del dominio, alineados con el esquema de Supabase (§4).

export type MistakeCategory =
  | "false_friend"
  | "vocabulary"
  | "preposition"
  | "article"
  | "word_order"
  | "sentence_structure"
  | "verb_tense"
  | "uncountable"
  | "agreement_pronouns"
  | "register_tone"
  | "spelling"
  | "conciseness";

export type SeverityLevel = "blocks_meaning" | "unnatural" | "style";
export type ItemType = "fill_gap" | "multiple_choice" | "correct_sentence";
export type ItemStatus = "active" | "retired" | "flagged";

export interface Mistake {
  id: string;
  ref: number;
  title: string;
  category: MistakeCategory;
  severity: SeverityLevel;
  wrong_form: string | null;
  correct_form: string | null;
  original_sentence: string | null;
  corrected_sentence: string | null;
  explanation_es: string;
  archived: boolean;
}

export interface Item {
  id: string;
  mistake_id: string;
  type: ItemType;
  prompt: string;
  answer: string;
  alternatives: string[];
  distractors: string[];
  status: ItemStatus;
  times_served: number;
}

export interface ReviewState {
  mistake_id: string;
  box: number;
  interval_days: number;
  due_at: string;
  consecutive_correct: number;
  total_reviews: number;
  total_correct: number;
  distinct_items_ok: number;
  mastered_at: string | null;
  last_reviewed_at: string | null;
}

// Ítem tal y como viaja al cliente en una sesión: SIN la respuesta correcta.
// Para multiple_choice se envían las opciones ya barajadas.
export interface SessionItem {
  ord: number;
  itemId: string;
  mistakeId: string;
  ref: number;
  title: string;
  category: MistakeCategory;
  severity: SeverityLevel;
  type: ItemType;
  prompt: string;
  options?: string[];
  hint?: string | null;
}

// Otro error detectado en una respuesta abierta (§8.2), a título informativo.
export interface OtherIssue {
  wrong: string;
  correct: string;
  explanation_es: string;
}

// Problema detectado al corregir escritura libre (§8.3).
export interface WritingIssue {
  wrong: string;
  correct: string;
  category: MistakeCategory;
  explanation_es: string;
}

// Respuesta de /api/reviews: feedback inmediato tras responder (§5.3).
export interface ReviewResult {
  isCorrect: boolean;
  isTypo: boolean;
  correctAnswer: string;
  explanationEs: string;
  originalSentence: string | null;
  correctForm: string | null;
  feedbackEs: string | null;
  otherIssues?: OtherIssue[];
  nextDueAt: string;
  masteredNow: boolean;
}
