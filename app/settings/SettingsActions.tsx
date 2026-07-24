"use client";

import { useState } from "react";

interface GenerateResult {
  processed: number;
  inserted: number;
  rejected: number;
  remaining: number;
  rejectReasons?: Record<string, number>;
  costUsd?: number;
  error?: string;
}

export function GenerateVariantsButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState<"one" | "all" | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run(mode: "one" | "all") {
    setRunning(mode);
    setResult(null);
    try {
      const res = await fetch("/api/items/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "one" ? { one: true } : { all: true }),
      });
      const data: GenerateResult = await res.json();
      setResult(data);
    } catch {
      setResult({ processed: 0, inserted: 0, rejected: 0, remaining: 0, error: "Fallo de red." });
    } finally {
      setRunning(null);
    }
  }

  const busy = running !== null;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => run("one")}
          disabled={disabled || busy}
          className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-40"
        >
          {running === "one" ? "Generando…" : "Probar con 1 error"}
        </button>
        <button
          onClick={() => run("all")}
          disabled={disabled || busy}
          className="flex min-h-12 flex-[2] items-center justify-center rounded-2xl bg-brand px-4 text-base font-semibold text-white disabled:opacity-40"
        >
          {running === "all" ? "Generando…" : "Generar variantes que falten"}
        </button>
      </div>

      {result && (
        <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
          {result.error ? (
            <p className="text-danger">{result.error}</p>
          ) : (
            <>
              <p className="text-foreground">
                {result.inserted} ejercicios nuevos en {result.processed} errores
                {typeof result.costUsd === "number" && (
                  <> · coste {formatUsd(result.costUsd)}</>
                )}
                .
              </p>
              {result.rejected > 0 && (
                <p className="mt-1 text-muted">{result.rejected} descartados por el validador.</p>
              )}
              {result.remaining > 0 && (
                <p className="mt-1 text-muted">
                  Quedan {result.remaining} errores por procesar. Pulsa «Generar…» otra vez para seguir.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatUsd(v: number): string {
  if (v < 0.01) return `<$0,01`;
  return `$${v.toFixed(2).replace(".", ",")}`;
}
