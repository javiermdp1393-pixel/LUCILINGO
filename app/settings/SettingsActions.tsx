"use client";

import { useState } from "react";

// Todos los botones de esta pantalla lanzan trabajos largos contra la API.
// Además de deshabilitarse mientras el fetch está en vuelo, el servidor lleva
// un cerrojo: si la petición se corta en el cliente (timeout, recarga, cambio
// de red) la función sigue viva en el servidor, y un segundo clic arrancaría
// una ejecución paralela que generaría lo mismo dos veces. En ese caso la ruta
// responde 409 y aquí lo contamos tal cual en vez de fingir un error.

/** Lanza un trabajo y normaliza el resultado, distinguiendo el 409 del cerrojo. */
async function runJob<T extends { error?: string }>(
  url: string,
  body: unknown,
  fallback: T
): Promise<T> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) {
      return { ...fallback, error: data.error ?? "No se pudo completar la operación." };
    }
    return data;
  } catch {
    return {
      ...fallback,
      error:
        "Se ha cortado la conexión. Puede que el proceso siga en el servidor: espera un momento antes de reintentar.",
    };
  }
}

interface GenerateResult {
  processed: number;
  inserted: number;
  rejected: number;
  remaining: number;
  rejectReasons?: Record<string, number>;
  costUsd?: number;
  error?: string;
}

const EMPTY_GENERATE: GenerateResult = { processed: 0, inserted: 0, rejected: 0, remaining: 0 };

export function GenerateVariantsButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState<"one" | "all" | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run(mode: "one" | "all") {
    setRunning(mode);
    setResult(null);
    try {
      setResult(
        await runJob<GenerateResult>(
          "/api/items/generate",
          mode === "one" ? { one: true } : { all: true },
          EMPTY_GENERATE
        )
      );
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

      {busy && <RunningNote />}

      {result && (
        <ResultBox error={result.error}>
          <p className="text-foreground">
            {result.inserted} ejercicios nuevos en {result.processed} errores
            {typeof result.costUsd === "number" && <> · coste {formatUsd(result.costUsd)}</>}.
          </p>
          {result.rejected > 0 && (
            <p className="mt-1 text-muted">{result.rejected} descartados por el validador.</p>
          )}
          {result.remaining > 0 && (
            <p className="mt-1 text-muted">
              Quedan {result.remaining} errores por procesar. Pulsa «Generar…» otra vez para seguir.
            </p>
          )}
        </ResultBox>
      )}
    </div>
  );
}

export function GenerateTranslationsButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      setResult(
        await runJob<GenerateResult>("/api/items/generate-translations", {}, EMPTY_GENERATE)
      );
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
        {running ? "Generando traducciones…" : "Generar traducciones que falten"}
      </button>

      {running && <RunningNote />}

      {result && (
        <ResultBox error={result.error}>
          <p className="text-foreground">
            {result.inserted} frases nuevas en {result.processed} errores
            {typeof result.costUsd === "number" && <> · coste {formatUsd(result.costUsd)}</>}.
          </p>
          {result.rejected > 0 && (
            <p className="mt-1 text-muted">{result.rejected} descartadas por el validador.</p>
          )}
          {result.remaining > 0 && (
            <p className="mt-1 text-muted">
              Quedan {result.remaining} errores por procesar. Pulsa otra vez para seguir.
            </p>
          )}
        </ResultBox>
      )}
    </div>
  );
}

interface SyncResult {
  created: number;
  updated: number;
  seen: number;
  error?: string;
}

export function SyncNotionButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      setResult(
        await runJob<SyncResult>("/api/sync/notion", undefined, {
          created: 0,
          updated: 0,
          seen: 0,
        })
      );
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
        {running ? "Sincronizando…" : "Sincronizar con Notion"}
      </button>

      {running && <RunningNote />}

      {result && (
        <ResultBox error={result.error}>
          <p className="text-foreground">
            {result.created} errores nuevos, {result.updated} actualizados
            <span className="text-muted"> (de {result.seen} revisados)</span>.
          </p>
        </ResultBox>
      )}
    </div>
  );
}

interface BackfillResult {
  processed: number;
  updated: number;
  remaining: number;
  costUsd?: number;
  error?: string;
}

export function BackfillHintsButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      setResult(
        await runJob<BackfillResult>("/api/items/backfill-hints", undefined, {
          processed: 0,
          updated: 0,
          remaining: 0,
        })
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={disabled || running}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-40"
      >
        {running ? "Generando pistas…" : "Generar pistas que falten"}
      </button>

      {running && <RunningNote />}

      {result && (
        <ResultBox error={result.error}>
          <p className="text-foreground">
            {result.updated} pistas nuevas
            {typeof result.costUsd === "number" && <> · coste {formatUsd(result.costUsd)}</>}.
          </p>
          {result.remaining > 0 && (
            <p className="mt-1 text-muted">
              Quedan {result.remaining} ejercicios sin pista. Pulsa otra vez para seguir.
            </p>
          )}
        </ResultBox>
      )}
    </div>
  );
}

// ---------- Piezas compartidas ----------

/** Aviso mientras el trabajo corre: deja claro que no hay que volver a pulsar. */
function RunningNote() {
  return (
    <p className="mt-2 text-xs text-muted">
      En marcha. Puede tardar hasta un minuto; no cierres la pantalla ni vuelvas a pulsar.
    </p>
  );
}

function ResultBox({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      {error ? <p className="text-danger">{error}</p> : children}
    </div>
  );
}

function formatUsd(v: number): string {
  if (v < 0.01) return `<$0,01`;
  return `$${v.toFixed(2).replace(".", ",")}`;
}
