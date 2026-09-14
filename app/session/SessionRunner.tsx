"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORY_LABELS, TASK_INSTRUCTIONS } from "@/lib/constants";
import type { SessionItem, ReviewResult, SessionMode } from "@/lib/types";

/** En «corrige la frase» pre-rellenamos con la frase para que solo edites el error. */
function initialAnswerFor(item: SessionItem | undefined): string {
  return item?.type === "correct_sentence" ? item.prompt : "";
}

/** Los tipos que se responden escribiendo varias palabras usan textarea. */
function isLongAnswer(type: SessionItem["type"]): boolean {
  return type === "correct_sentence" || type === "translate_es_en";
}

/**
 * Corte para la petición de corrección. `AbortSignal.timeout` no existe en
 * Safari anteriores al 16, y aquí un fallo dejaría la sesión colgada, que es
 * justo lo que estamos arreglando: si no está, se va sin límite propio.
 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
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

/**
 * Corre una sesión. Sin `resumeId` crea una nueva; con él retoma una que quedó
 * a medias, saltando las preguntas ya respondidas (que ya están guardadas en el
 * servidor, una a una, desde el primer día).
 */
export default function SessionRunner({
  mode = "daily",
  resumeId,
}: {
  mode?: SessionMode;
  resumeId?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resumedFrom, setResumedFrom] = useState(0);

  const startedAt = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Crea la sesión al montar, o recupera la que se está retomando.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = resumeId
          ? await fetch(`/api/sessions/${resumeId}`)
          : await fetch("/api/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode }),
            });
        if (cancelled) return;
        if (!res.ok) {
          setPhase("error");
          return;
        }
        const data = (await res.json()) as {
          sessionId: string | null;
          items: SessionItem[];
          startIndex?: number;
          correctCount?: number;
        };
        if (cancelled) return;
        if (!data.sessionId || data.items.length === 0) {
          setPhase("empty");
          return;
        }

        // Al retomar, arrancamos en la primera pregunta sin responder.
        const start = Math.min(data.startIndex ?? 0, data.items.length - 1);
        setSessionId(data.sessionId);
        setItems(data.items);
        setIndex(start);
        setResumedFrom(start);
        setCorrectCount(data.correctCount ?? 0);
        setAnswer(initialAnswerFor(data.items[start]));
        setPhase("question");
        startedAt.current = Date.now();
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, resumeId]);

  const current = items[index];

  // Foco automático en el input al entrar en cada pregunta.
  useEffect(() => {
    if (phase === "question" && current && !isLongAnswer(current.type) && current.type !== "multiple_choice") {
      inputRef.current?.focus();
    }
  }, [phase, index, current]);

  const submit = useCallback(
    async (given: string) => {
      if (submitting || !current) return;
      setSubmitting(true);
      setSubmitError(null);
      // Guardamos el tiempo de esta respuesta: si hay que reintentar, no
      // queremos contar también lo que tardó el intento fallido.
      const elapsed = Date.now() - startedAt.current;
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            itemId: current.itemId,
            userAnswer: given,
            responseMs: elapsed,
          }),
          // Corte propio: si el servidor se queda colgado, preferimos avisar y
          // ofrecer reintentar antes que dejar la pantalla en blanco.
          signal: timeoutSignal(65_000),
        });

        // Un error de plataforma (504, por ejemplo) devuelve HTML, no JSON: hay
        // que mirar `res.ok` antes de intentar parsear.
        if (!res.ok) {
          setSubmitError("No se ha podido corregir la respuesta.");
          return;
        }
        const data = (await res.json()) as ReviewResult;
        setResult(data);
        if (data.isCorrect) setCorrectCount((c) => c + 1);
        setPhase("feedback");
      } catch {
        // Un fallo puntual (red, timeout) NO debe tirar la sesión: la pregunta
        // sigue en pantalla con la respuesta escrita y se puede reintentar.
        // Las respuestas anteriores ya están guardadas en el servidor.
        setSubmitError("No se ha podido corregir la respuesta.");
      } finally {
        setSubmitting(false);
      }
    },
    [current, sessionId, submitting]
  );

  const next = useCallback(async () => {
    setResult(null);
    setSubmitError(null);
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
        <p className="text-danger">
          {resumeId ? "No se ha podido retomar esa sesión." : "No se ha podido preparar la sesión."}
        </p>
        {resumeId && (
          <p className="mt-1 text-sm text-muted">
            Puede que ya estuviera terminada. Tus respuestas están guardadas.
          </p>
        )}
        <Link href="/session" className="mt-4 text-brand-ink underline">
          Empezar una sesión nueva
        </Link>
        <Link href="/" className="mt-2 text-sm text-muted underline">
          Volver al inicio
        </Link>
      </Centered>
    );
  }
  if (phase === "empty") {
    return (
      <Centered>
        {mode === "translate" ? (
          <>
            <p className="text-lg font-semibold">Aún no hay frases para traducir</p>
            <p className="mt-1 text-sm text-muted">
              Genera las traducciones desde Ajustes y vuelve.
            </p>
            <Link href="/settings" className="mt-4 text-brand-ink underline">
              Ir a Ajustes
            </Link>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">Nada que repasar ahora mismo 🎉</p>
            <p className="mt-1 text-sm text-muted">Vuelve cuando tengas errores vencidos.</p>
          </>
        )}
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

      {/* Solo en la primera pregunta tras retomar: confirma que no se perdió nada. */}
      {resumedFrom > 0 && index === resumedFrom && phase === "question" && (
        <p className="mt-3 rounded-2xl border border-border bg-surface px-4 py-2 text-xs text-muted">
          Sesión retomada. Las {resumedFrom} primeras respuestas ya estaban guardadas.
        </p>
      )}

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
        // key: reinicia el estado de la pista (vista/rehecha) en cada pregunta.
        <HintBlock
          key={current.itemId}
          itemId={current.itemId}
          hint={current.hint}
          canReveal={phase !== "feedback"}
        />
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
            {isLongAnswer(current.type) ? (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={phase === "feedback" || submitting}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                rows={3}
                placeholder={
                  current.type === "translate_es_en"
                    ? "Escribe tu traducción en inglés"
                    : "Reescribe la frase corregida"
                }
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
                {submitting ? "Corrigiendo…" : submitError ? "Reintentar" : "Comprobar"}
              </button>
            )}
          </form>
        )}

        {/* Fallo al corregir: la sesión sigue en pie y se puede reintentar. */}
        {submitError && phase === "question" && (
          <div className="mt-3 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm">
            <p className="text-danger">{submitError}</p>
            <p className="mt-1 text-xs text-muted">
              Tu respuesta sigue escrita y las anteriores están guardadas. Vuelve a pulsar
              «Reintentar».
            </p>
            {current.type === "multiple_choice" && answer && (
              <button
                onClick={() => submit(answer)}
                disabled={submitting}
                className="mt-2 text-xs font-semibold text-brand-ink underline underline-offset-2 disabled:opacity-50"
              >
                Reintentar «{answer}»
              </button>
            )}
          </div>
        )}
      </div>

      {/* Feedback */}
      {phase === "feedback" && result && (
        <Feedback
          result={result}
          onNext={next}
          isLast={index + 1 === items.length}
          itemId={current.itemId}
          itemType={current.type}
        />
      )}
    </main>
  );
}

/**
 * Pista contextual, oculta tras un botón para no regalar la respuesta.
 *
 * Una pista puede ser mala sin que el ejercicio lo sea, así que descartarla es
 * una acción distinta de marcar el ejercicio como defectuoso: aquí se pide otra
 * al modelo y se guarda, de modo que la próxima vez que salga el ejercicio ya
 * venga con la buena.
 */
function HintBlock({
  itemId,
  hint,
  canReveal,
}: {
  itemId: string;
  hint: string;
  canReveal: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [text, setText] = useState(hint);
  const [rehinting, setRehinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rehint = useCallback(async () => {
    if (rehinting) return;
    setRehinting(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/rehint`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!res.ok || !data.hint) {
        setError(data.error ?? "No se pudo rehacer la pista.");
        return;
      }
      setText(data.hint);
    } catch {
      setError("Se ha cortado la conexión.");
    } finally {
      setRehinting(false);
    }
  }, [itemId, rehinting]);

  if (!shown) {
    return (
      <div className="mt-2 min-h-6">
        <button
          type="button"
          onClick={() => setShown(true)}
          disabled={!canReveal}
          className="text-sm text-muted underline underline-offset-2 disabled:opacity-40"
        >
          💡 Ver pista
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm italic text-muted">💡 {text}</p>
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={rehint}
          disabled={rehinting}
          className="text-xs text-muted underline underline-offset-2 disabled:opacity-50"
        >
          {rehinting ? "Buscando otra pista…" : "↻ Esta pista no me ayuda"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}

function Feedback({
  result,
  onNext,
  isLast,
  itemId,
  itemType,
}: {
  result: ReviewResult;
  onNext: () => void;
  isLast: boolean;
  itemId: string;
  itemType: SessionItem["type"];
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
            {itemType === "translate_es_en" ? "Traducción de referencia" : "Respuesta correcta"}:{" "}
            <strong>{result.correctAnswer}</strong>
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
