"use client";

import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { OtherIssue } from "@/lib/types";

/** Un fallo cosechable, con la frase donde lo cometiste para dar contexto. */
export interface HarvestCandidate extends OtherIssue {
  /** Lo que escribiste, para recordar de dónde sale el fallo. */
  userAnswer: string;
}

/**
 * Fallos que cometiste de paso durante la sesión y que no penalizaron ninguna
 * respuesta. Aquí se eligen los que merece la pena registrar: el sistema vive
 * de errores reales, y estos lo son tanto como el que estabas practicando.
 */
export function HarvestIssues({
  sessionId,
  candidates,
}: {
  sessionId: string;
  candidates: HarvestCandidate[];
}) {
  // Por defecto van todos marcados: si has llegado hasta aquí es porque quieres
  // registrarlos, y desmarcar los dos que sobren es menos trabajo que marcarlos.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(candidates.map((_, i) => i))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; reactivated: number } | null>(null);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function save() {
    if (saving || selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/harvest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accepted: candidates.filter((_, i) => selected.has(i)),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        added?: number;
        reactivated?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudieron añadir los errores.");
        return;
      }
      setResult({ added: data.added ?? 0, reactivated: data.reactivated ?? 0 });
    } catch {
      setError("Se ha cortado la conexión.");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const parts: string[] = [];
    if (result.added > 0) {
      parts.push(`${result.added} ${result.added === 1 ? "error nuevo" : "errores nuevos"}`);
    }
    if (result.reactivated > 0) {
      parts.push(
        `${result.reactivated} ${result.reactivated === 1 ? "reincidencia" : "reincidencias"}`
      );
    }
    return (
      <section className="mt-8 rounded-2xl border border-success/40 bg-success-bg px-4 py-4">
        <p className="text-sm font-semibold text-success">
          {parts.length > 0 ? `Añadido al log: ${parts.join(" y ")}.` : "Nada que añadir."}
        </p>
        <p className="mt-1 text-xs text-muted">
          {result.added > 0
            ? "Genera sus variantes desde Ajustes para empezar a practicarlos."
            : "Las reincidencias vuelven a caja 1 y saldrán en la próxima sesión."}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-muted">Fallos que cometiste de paso</h2>
      <p className="mt-1 text-xs text-muted">
        No penalizaron ninguna respuesta, pero son errores tuyos. Marca los que quieras añadir a
        tu registro para practicarlos.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {candidates.map((issue, i) => {
          const checked = selected.has(i);
          return (
            <li key={i}>
              <label
                className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition ${
                  checked ? "border-brand bg-surface" : "border-border bg-surface-muted opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(i)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand,#000)]"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div>
                    <span className="text-danger line-through">{issue.wrong}</span>{" "}
                    <span className="font-medium text-success">{issue.correct}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{issue.explanation_es}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                      {CATEGORY_LABELS[issue.category] ?? issue.category}
                    </span>
                  </div>
                  {issue.userAnswer && (
                    <p className="mt-2 border-l-2 border-border pl-2 text-xs italic text-muted">
                      “{issue.userAnswer}”
                    </p>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button
        onClick={save}
        disabled={saving || selected.size === 0}
        className="mt-4 min-h-12 w-full rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
      >
        {saving
          ? "Añadiendo…"
          : selected.size === 0
            ? "Selecciona alguno"
            : `Añadir ${selected.size} al log`}
      </button>
    </section>
  );
}
