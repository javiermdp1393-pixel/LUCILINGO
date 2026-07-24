"use client";

import { useState } from "react";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { WritingIssue } from "@/lib/types";

type Phase = "write" | "evaluating" | "review" | "accepting" | "done";

export default function WritingPage() {
  const [phase, setPhase] = useState<Phase>("write");
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [writingId, setWritingId] = useState<string | null>(null);
  const [corrected, setCorrected] = useState("");
  const [issues, setIssues] = useState<WritingIssue[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ added: number; reactivated: number } | null>(null);

  async function proposeBrief() {
    setBriefLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/writings/brief", { method: "POST" });
      const data = await res.json();
      if (res.ok) setBrief(data.brief);
      else setError(data.error ?? "No se pudo proponer una consigna.");
    } catch {
      setError("Fallo de red.");
    } finally {
      setBriefLoading(false);
    }
  }

  async function evaluate() {
    if (text.trim().length < 10) return;
    setPhase("evaluating");
    setError(null);
    try {
      const res = await fetch("/api/writings/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: text.trim(), briefEs: brief }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo corregir.");
        setPhase("write");
        return;
      }
      setWritingId(data.writingId);
      setCorrected(data.correctedText);
      setIssues(data.issues ?? []);
      setSelected(new Set((data.issues ?? []).map((_: WritingIssue, i: number) => i)));
      setPhase("review");
    } catch {
      setError("Fallo de red.");
      setPhase("write");
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function accept() {
    if (!writingId) return;
    setPhase("accepting");
    setError(null);
    try {
      const accepted = issues.filter((_, i) => selected.has(i));
      const res = await fetch(`/api/writings/${writingId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron añadir.");
        setPhase("review");
        return;
      }
      setResult(data);
      setPhase("done");
    } catch {
      setError("Fallo de red.");
      setPhase("review");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-12 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Escritura libre</h1>
        <Link href="/" className="text-sm text-brand-ink underline">
          Inicio
        </Link>
      </header>

      {error && (
        <div className="mt-4 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {(phase === "write" || phase === "evaluating") && (
        <>
          <p className="mt-2 text-sm text-muted">
            Escribe en inglés (o pega un correo real que tengas que enviar). La IA lo corrige y
            eliges qué errores añadir a tu log.
          </p>

          {brief && (
            <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
              <span className="font-semibold text-brand-ink">Consigna:</span> {brief}
            </div>
          )}

          <button
            onClick={proposeBrief}
            disabled={briefLoading || phase === "evaluating"}
            className="mt-3 text-sm text-brand-ink underline underline-offset-2 disabled:opacity-40"
          >
            {briefLoading ? "Pensando…" : brief ? "Otra consigna" : "Proponme una consigna"}
          </button>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={phase === "evaluating"}
            autoCapitalize="off"
            spellCheck={false}
            rows={8}
            placeholder="Write your text here…"
            className="mt-4 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-brand disabled:opacity-70"
          />

          <button
            onClick={evaluate}
            disabled={text.trim().length < 10 || phase === "evaluating"}
            className="mt-3 flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white disabled:opacity-40"
          >
            {phase === "evaluating" ? "Corrigiendo…" : "Evaluar"}
          </button>
        </>
      )}

      {phase === "review" && (
        <>
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-muted">Texto corregido</h2>
            <p className="mt-2 rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed">
              {corrected}
            </p>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-muted">
              Problemas detectados ({issues.length})
            </h2>
            <p className="mt-1 text-xs text-muted">
              Marca solo los que quieras añadir al log. Si eliges todo, el log se llena de ruido.
            </p>

            {issues.length === 0 ? (
              <p className="mt-3 text-sm text-success">Sin errores relevantes. ¡Bien! 👏</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <label
                      className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 ${
                        selected.has(i) ? "border-brand bg-brand/5" : "border-border bg-surface"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-1 h-5 w-5 shrink-0 accent-brand"
                      />
                      <div className="text-sm">
                        <p>
                          <span className="text-danger line-through">{issue.wrong}</span>{" "}
                          <span className="font-semibold text-success">{issue.correct}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {CATEGORY_LABELS[issue.category] ?? issue.category} — {issue.explanation_es}
                        </p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {issues.length > 0 && (
            <button
              onClick={accept}
              className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white active:scale-[0.99]"
            >
              Añadir {selected.size} al log
            </button>
          )}
          <Link href="/" className="mt-3 text-center text-sm text-brand-ink underline">
            Descartar y volver
          </Link>
        </>
      )}

      {phase === "accepting" && (
        <p className="mt-10 text-center text-muted">Añadiendo al log…</p>
      )}

      {phase === "done" && result && (
        <section className="mt-8 flex flex-col items-center text-center">
          <p className="text-2xl font-bold">Hecho ✅</p>
          <p className="mt-2 text-foreground">
            {result.added} errores nuevos
            {result.reactivated > 0 && <>, {result.reactivated} reincidencias reactivadas</>}.
          </p>
          {result.added > 0 && (
            <p className="mt-2 text-sm text-muted">
              Genera variantes en Ajustes para poder practicarlos.
            </p>
          )}
          <div className="mt-6 flex w-full flex-col gap-3">
            <Link
              href="/settings"
              className="flex min-h-12 items-center justify-center rounded-2xl bg-brand text-base font-semibold text-white"
            >
              Ir a generar variantes
            </Link>
            <Link href="/" className="text-center text-sm text-brand-ink underline">
              Volver al inicio
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
