"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORY_LABELS, TASK_INSTRUCTIONS } from "@/lib/constants";
import type { SessionItem, ReviewResult } from "@/lib/types";

/** En «corrige la frase» pre-rellenamos con la frase para que solo edites el error. */
function initialAnswerFor(item: SessionItem | undefined): string {
  return item?.type === "correct_sentence" ? item.prompt : "";
}

type Phase = "loading" | "empty" | "question" | "feedback" | "finishing" | "error";

/** Renderiza el enunciado resaltando el hueco ___ (§9). */
function Prompt({ text }: { text: string }) {
  const parts = text.split("___");
  return (
    <p className="text-xl leading-relaxed text-foreground">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="mx-1 inline-block min-w-[3ch] border-b-2 border-brand align-baseline" />
          )}
        </span>
      ))}
    </p>
  );
}

export default function SessionPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const startedAt = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Crea la sesión al montar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sessions", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPhase("error");
          return;
        }
        if (!data.sessionId || data.items.length === 0) {
          setPhase("empty");
          return;
        }
        setSessionId(data.sessionId);
        setItems(data.items);
        setAnswer(initialAnswerFor(data.items[0]));
        setPhase("question");
        startedAt.current = Date.now();
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = items[index];

  // Foco automático en el input al entrar en cada pregunta.
  useEffect(() => {
    if (phase === "question" && current?.type !== "multiple_choice") {
      inputRef.current?.focus();
    }
  }, [phase, index, current]);

  const submit = useCallback(
    async (given: string) => {
      if (submitting || !current) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            itemId: current.itemId,
            userAnswer: given,
            responseMs: Date.now() - startedAt.current,
          }),
        });
        const data: ReviewResult = await res.json();
        if (!res.ok) {
          setPhase("error");
          return;
        }
        setResult(data);
        if (data.isCorrect) setCorrectCount((c) => c + 1);
        setPhase("feedback");
      } catch {
        setPhase("error");
      } finally {
        setSubmitting(false);
      }
    },
    [current, sessionId, submitting]
  );

  const next = useCallback(async () => {
    setResult(null);
    setShowHint(false);
    if (index + 1 < items.length) {
      setAnswer(initialAnswerFor(items[index + 1]));
      setIndex((i) => i + 1);
      setPhase("question");
      startedAt.current = Date.now();
    } else {
      setPhase("finishing");
      try {
        await fetch(`/api/sessions/${sessionId}/finish`, { method: "POST" });
      } catch {
        /* la sesión ya está registrada por reviews; el cierre es best-effort */
      }
      router.push(`/session/${sessionId}/summary`);
    }
  }, [index, items.length, sessionId, router]);

  // --- Estados de carga / vacío / error ---
  if (phase === "loading") {
    return <Centered>Preparando tu sesión…</Centered>;
  }
  if (phase === "finishing") {
    return <Centered>Guardando resultados…</Centered>;
  }
  if (phase === "error") {
    return (
      <Centered>
        <p className="text-danger">Algo ha ido mal.</p>
        <Link href="/" className="mt-4 text-brand-ink underline">
          Volver al inicio
        </Link>
      </Centered>
    );
  }
  if (phase === "empty") {
    return (
      <Centered>
        <p className="text-lg font-semibold">Nada que repasar ahora mismo 🎉</p>
        <p className="mt-1 text-sm text-muted">Vuelve cuando tengas errores vencidos.</p>
        <Link href="/" className="mt-4 text-brand-ink underline">
          Volver al inicio
        </Link>
      </Centered>
    );
  }
  if (!current) return null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-5">
      {/* Progreso */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${((index + (phase === "feedback" ? 1 : 0)) / items.length) * 100}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted">
          {index + 1}/{items.length}
        </span>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface-muted px-2 py-0.5">
          #{current.ref} · {CATEGORY_LABELS[current.category] ?? current.category}
        </span>
      </div>

      <p className="mt-4 text-sm font-semibold text-brand-ink">
        {TASK_INSTRUCTIONS[current.type] ?? "Responde"}
      </p>

      <div className="mt-2">
        <Prompt text={current.prompt} />
      </div>

      {current.hint && current.type !== "multiple_choice" && (
        <div className="mt-2 min-h-6">
          {showHint ? (
            <p className="text-sm italic text-muted">💡 {current.hint}</p>
          ) : (
            <button
              type="button"
              onClick={() => setShowHint(true)}
              disabled={phase === "feedback"}
              className="text-sm text-muted underline underline-offset-2 disabled:opacity-40"
            >
              💡 Ver pista
            </button>
          )}
        </div>
      )}

      {/* Zona de respuesta */}
      <div className="mt-8 flex-1">
        {current.type === "multiple_choice" ? (
          <div className="flex flex-col gap-3">
            {current.options?.map((opt) => {
              const chosen = result && answer === opt;
              const isRight = result?.isCorrect && chosen;
              const isWrong = result && !result.isCorrect && chosen;
              return (
                <button
                  key={opt}
                  disabled={phase === "feedback" || submitting}
                  onClick={() => {
                    setAnswer(opt);
                    submit(opt);
                  }}
                  className={`min-h-14 rounded-2xl border px-4 py-3 text-left text-base transition active:scale-[0.99] disabled:cursor-default ${
                    isRight
                      ? "border-success bg-success-bg text-success"
                      : isWrong
                        ? "border-danger bg-danger-bg text-danger"
                        : "border-border bg-surface hover:border-brand"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (phase === "question" && answer.trim()) submit(answer.trim());
            }}
          >
            {current.type === "correct_sentence" ? (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={phase === "feedback" || submitting}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                rows={3}
                placeholder="Reescribe la frase corregida"
                className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-lg outline-none focus:border-brand disabled:opacity-70"
              />
            ) : (
              <input
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={phase === "feedback" || submitting}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Escribe tu respuesta"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-lg outline-none focus:border-brand disabled:opacity-70"
              />
            )}
            {phase === "question" && (
              <button
                type="submit"
                disabled={!answer.trim() || submitting}
                className="mt-3 min-h-12 w-full rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
              >
                Comprobar
              </button>
            )}
          </form>
        )}
      </div>

      {/* Feedback */}
      {phase === "feedback" && result && (
        <Feedback
          result={result}
          onNext={next}
          isLast={index + 1 === items.length}
          itemId={current.itemId}
        />
      )}
    </main>
  );
}

function Feedback({
  result,
  onNext,
  isLast,
  itemId,
}: {
  result: ReviewResult;
  onNext: () => void;
  isLast: boolean;
  itemId: string;
}) {
  const [flagged, setFlagged] = useState(false);
  const [flagging, setFlagging] = useState(false);

  const flag = useCallback(async () => {
    if (flagging || flagged) return;
    setFlagging(true);
    try {
      const res = await fetch(`/api/items/${itemId}/flag`, { method: "POST" });
      if (res.ok) setFlagged(true);
    } catch {
      /* silencioso: no es crítico */
    } finally {
      setFlagging(false);
    }
  }, [itemId, flagging, flagged]);

  return (
    <div className="mt-4">
      {result.isCorrect ? (
        <div className="rounded-2xl border border-success/40 bg-success-bg px-4 py-3 text-success">
          <p className="font-semibold">¡Correcto! ✅</p>
          {result.feedbackEs && <p className="mt-1 text-sm">{result.feedbackEs}</p>}
          {result.masteredNow && (
            <p className="mt-1 text-sm">Este error queda dominado. Entra en el pool de refresco.</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3">
          <p className="font-semibold text-danger">
            {result.isTypo ? "Casi: parece una errata." : "No exactamente."}
          </p>
          <p className="mt-2 text-sm text-foreground">
            Respuesta correcta: <strong>{result.correctAnswer}</strong>
          </p>
          <p className="mt-2 text-sm text-foreground">{result.feedbackEs || result.explanationEs}</p>
          {result.originalSentence && (
            <p className="mt-3 border-l-2 border-danger/40 pl-3 text-sm italic text-muted">
              Tu frase original: “{result.originalSentence}”
            </p>
          )}
        </div>
      )}

      {result.otherIssues && result.otherIssues.length > 0 && (
        <div className="mt-3 rounded-2xl border border-border bg-surface-muted px-4 py-3">
          <p className="text-xs font-semibold text-muted">
            Otros detalles de tu frase (no penalizan)
          </p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {result.otherIssues.map((issue, i) => (
              <li key={i} className="text-sm text-foreground">
                <span className="text-danger line-through">{issue.wrong}</span>{" "}
                <span className="text-success">{issue.correct}</span>
                <span className="text-muted"> — {issue.explanation_es}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={onNext}
        autoFocus
        className="mt-4 min-h-14 w-full rounded-2xl bg-foreground text-base font-semibold text-background active:scale-[0.99]"
      >
        {isLast ? "Ver resumen" : "Siguiente"}
      </button>

      <div className="mt-3 text-center">
        {flagged ? (
          <span className="text-xs text-muted">Marcado. No volverá a aparecer.</span>
        ) : (
          <button
            onClick={flag}
            disabled={flagging}
            className="text-xs text-muted underline underline-offset-2 disabled:opacity-50"
          >
            Este ejercicio está mal
          </button>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 text-center text-muted">
      {children}
    </main>
  );
}
