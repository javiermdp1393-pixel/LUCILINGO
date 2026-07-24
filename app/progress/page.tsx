import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, CATEGORY_LABELS } from "@/lib/constants";
import type { MistakeCategory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Summary {
  total: number;
  active: number;
  mastered: number;
  reincidences_30d: number;
  total_reviews: number;
  total_correct: number;
}
interface CategoryRow {
  category: MistakeCategory;
  total: number;
  mastered: number;
  avg_ms: number;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
function fmtSeconds(ms: number): string {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-3 text-center">
      <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export default async function ProgressPage() {
  let streak = 0;
  let summary: Summary = {
    total: 0,
    active: 0,
    mastered: 0,
    reincidences_30d: 0,
    total_reviews: 0,
    total_correct: 0,
  };
  let categories: CategoryRow[] = [];
  let dbError = false;

  try {
    const sb = supabaseAdmin();
    const [statsRes, sumRes, catRes] = await Promise.all([
      sb.rpc("dashboard_stats", { p_user_id: OWNER_USER_ID }),
      sb.rpc("progress_summary", { p_user_id: OWNER_USER_ID }),
      sb.rpc("progress_by_category", { p_user_id: OWNER_USER_ID }),
    ]);
    streak = (statsRes.data as { streak: number }[])?.[0]?.streak ?? 0;
    summary = (sumRes.data as Summary[])?.[0] ?? summary;
    categories = (catRes.data as CategoryRow[]) ?? [];
  } catch {
    dbError = true;
  }

  const accuracy = pct(summary.total_correct, summary.total_reviews);
  const masteredPct = pct(summary.mastered, summary.total);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-12 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Progreso</h1>
        <Link href="/" className="text-sm text-brand-ink underline">
          Inicio
        </Link>
      </header>

      {dbError && (
        <div className="mt-6 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
          No se pudo cargar el progreso.
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3">
        <Tile value={`🔥 ${streak}`} label="racha (días)" />
        <Tile value={`${accuracy}%`} label="aciertos" />
        <Tile value={summary.active} label="errores activos" />
        <Tile value={summary.mastered} label="dominados" />
      </section>

      {/* Reincidencias: la métrica de éxito del sistema */}
      <section className="mt-6">
        <div
          className={`rounded-2xl border px-4 py-4 ${
            summary.reincidences_30d > 0
              ? "border-accent/40 bg-accent/10"
              : "border-success/40 bg-success-bg"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">Reincidencias (30 días)</span>
            <span
              className={`text-2xl font-bold tabular-nums ${
                summary.reincidences_30d > 0 ? "text-accent" : "text-success"
              }`}
            >
              {summary.reincidences_30d}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {summary.reincidences_30d > 0
              ? "Errores dominados que volviste a fallar. Es la señal más valiosa: bajar esto es el objetivo."
              : "Ningún error dominado ha reincidido este mes. 👏"}
          </p>
        </div>
      </section>

      {/* Dominio por categoría */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-muted">Dominio por categoría</h2>
          <span className="text-xs text-muted">{masteredPct}% global</span>
        </div>

        <ul className="mt-3 flex flex-col gap-3">
          {categories.map((c) => {
            const p = pct(c.mastered, c.total);
            return (
              <li key={c.category}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground">
                    {CATEGORY_LABELS[c.category] ?? c.category}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {c.mastered}/{c.total} · {fmtSeconds(c.avg_ms)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${p}%` }}
                  />
                </div>
              </li>
            );
          })}
          {categories.length === 0 && (
            <li className="text-sm text-muted">Aún no hay datos suficientes.</li>
          )}
        </ul>
        <p className="mt-3 text-xs text-muted">
          El tiempo medio de respuesta es un proxy de cuánto has automatizado la regla: baja según la
          interiorizas.
        </p>
      </section>
    </main>
  );
}
