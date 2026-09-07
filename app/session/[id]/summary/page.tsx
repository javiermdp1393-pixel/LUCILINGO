import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CATEGORY_LABELS } from "@/lib/constants";
import { Lucy } from "@/app/components/Lucy";
import { normalizeForm } from "@/lib/matchMistake";
import { HarvestIssues, type HarvestCandidate } from "./HarvestIssues";
import type { MistakeCategory, OtherIssue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReviewRow {
  is_correct: boolean;
  response_ms: number | null;
  mistake_id: string;
  user_answer: string | null;
  other_issues: OtherIssue[] | null;
}

/**
 * Fallos cosechables de la sesión, sin repetidos: el mismo desliz cometido en
 * dos respuestas es un solo error que registrar.
 */
function harvestCandidates(rows: ReviewRow[]): HarvestCandidate[] {
  const byForm = new Map<string, HarvestCandidate>();
  for (const row of rows) {
    for (const issue of row.other_issues ?? []) {
      const wrong = (issue.wrong ?? "").trim();
      if (!wrong || !issue.category) continue;
      const key = normalizeForm(wrong);
      if (!key || byForm.has(key)) continue;
      byForm.set(key, { ...issue, wrong, userAnswer: (row.user_answer ?? "").trim() });
    }
  }
  return [...byForm.values()];
}

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: reviews } = await sb
    .from("reviews")
    .select("is_correct, response_ms, mistake_id, user_answer, other_issues")
    .eq("session_id", id);

  const rows = (reviews ?? []) as ReviewRow[];

  if (rows.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <Lucy size={72} />
        <p className="text-muted">No hay respuestas registradas en esta sesión.</p>
        <Link href="/" className="text-brand-ink underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  const total = rows.length;
  const correct = rows.filter((r) => r.is_correct).length;
  // Mediana y descarte de tiempos > 2 min: una pantalla dejada abierta no es
  // "pensar", y con la media un solo caso disparaba la cifra.
  const times = rows
    .map((r) => r.response_ms)
    .filter((t): t is number => typeof t === "number" && t >= 500 && t <= 120000)
    .sort((a, b) => a - b);
  const avgMs = times.length ? times[Math.floor(times.length / 2)] : 0;

  // Categorías flojas: las que tuvieron algún fallo en esta sesión.
  const mistakeIds = [...new Set(rows.map((r) => r.mistake_id))];
  const { data: mistakes } = await sb
    .from("mistakes")
    .select("id, category")
    .in("id", mistakeIds);
  const categoryById = new Map(
    ((mistakes ?? []) as { id: string; category: MistakeCategory }[]).map((m) => [m.id, m.category])
  );
  const weakSet = new Set<MistakeCategory>();
  for (const r of rows) {
    if (!r.is_correct) {
      const cat = categoryById.get(r.mistake_id);
      if (cat) weakSet.add(cat);
    }
  }
  const weak = [...weakSet];

  const pct = Math.round((correct / total) * 100);
  const candidates = harvestCandidates(rows);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-10">
      <div className="flex flex-col items-center text-center">
        <Lucy size={80} />
        <h1 className="mt-3 text-2xl font-bold">Sesión completada</h1>
        <p className="mt-1 text-muted">
          {correct} de {total} aciertos ({pct}%)
        </p>
      </div>

      <section className="mt-8 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{pct}%</div>
          <div className="text-xs text-muted">aciertos</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{(avgMs / 1000).toFixed(1)}s</div>
          <div className="text-xs text-muted">tiempo típico</div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">Categorías a vigilar</h2>
        {weak.length === 0 ? (
          <p className="mt-2 text-sm text-success">Ninguna: pleno de aciertos 👏</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {weak.map((c) => (
              <span
                key={c}
                className="rounded-full border border-danger/40 bg-danger-bg px-3 py-1 text-sm text-danger"
              >
                {CATEGORY_LABELS[c] ?? c}
              </span>
            ))}
          </div>
        )}
      </section>

      {candidates.length > 0 && <HarvestIssues sessionId={id} candidates={candidates} />}

      <div className="mt-auto pt-10 flex flex-col gap-3">
        <Link
          href="/session"
          className="flex min-h-14 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white active:scale-[0.99]"
        >
          Otra sesión
        </Link>
        <Link href="/" className="text-center text-sm text-brand-ink underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
