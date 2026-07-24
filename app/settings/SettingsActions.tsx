"use client";

import { useState } from "react";

interface GenerateResult {
  processed: number;
  inserted: number;
  rejected: number;
  remaining: number;
  rejectReasons?: Record<string, number>;
  error?: string;
}

export function GenerateVariantsButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/items/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data: GenerateResult = await res.json();
      setResult(data);
    } catch {
      setResult({ processed: 0, inserted: 0, rejected: 0, remaining: 0, error: "Fallo de red." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={disabled || running}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-brand px-4 text-base font-semibold text-white disabled:opacity-40"
      >
        {running ? "Generando…" : "Generar variantes que falten"}
      </button>

      {result && (
        <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
          {result.error ? (
            <p className="text-danger">{result.error}</p>
          ) : (
            <>
              <p className="text-foreground">
                {result.inserted} ejercicios nuevos en {result.processed} errores.
              </p>
              {result.rejected > 0 && (
                <p className="mt-1 text-muted">{result.rejected} descartados por el validador.</p>
              )}
              {result.remaining > 0 && (
                <p className="mt-1 text-muted">
                  Quedan {result.remaining} errores por procesar. Pulsa otra vez para seguir.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
