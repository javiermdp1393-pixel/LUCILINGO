import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, CATEGORY_LABELS, ITEM_TYPE_LABELS } from "@/lib/constants";
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
interface TypeRow {
  item_type: string;
  answers: number;
  correct: number;
  median_ms: number;
}
interface ToughRow {
  ref: number;
  title: string;
  category: MistakeCategory;
  attempts: number;
  misses: number;
  box: number;
}
interface Extras {
  reviews_7d: number;
  correct_7d: number;
  reviews_30d: number;
  correct_30d: number;
  sessions_30d: number;
  median_days_to_master: number;
  mastered_30d: number;
}

const EMPTY_SUMMARY: Summary = {
  total: 0,
  active: 0,
  mastered: 0,
  reincidences_30d: 0,
  total_reviews: 0,
  total_correct: 0,
};
const EMPTY_EXTRAS: Extras = {
  reviews_7d: 0,
  correct_7d: 0,
  reviews_30d: 0,
  correct_30d: 0,
  sessions_30d: 0,
  median_days_to_master: 0,
  mastered_30d: 0,
};

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

function Bar({ value, tone = "success" }: { value: number; tone?: "success" | "accent" }) {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
      <div
        className={`h-full rounded-full transition-all ${
          tone === "accent" ? "bg-accent" : "bg-success"
        }`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default async function ProgressPage() {
  let streak = 0;
  let bestStreak = 0;
  let summary: Summary = EMPTY_SUMMARY;
  let extras: Extras = EMPTY_EXTRAS;
  let categories: CategoryRow[] = [];
  let types: TypeRow[] = [];
  let tough: ToughRow[] = [];
  let dbError = false;

  try {
    const sb = supabaseAdmin();
    const [statsRes, sumRes, catRes, typeRes, toughRes, extrasRes] = await Promise.all([
      sb.rpc("dashboard_stats", { p_user_id: OWNER_USER_ID }),
      sb.rpc("progress_summary", { p_user_id: OWNER_USER_ID }),
      sb.rpc("progress_by_category", { p_user_id: OWNER_USER_ID }),
      sb.rpc("progress_by_item_type", { p_user_id: OWNER_USER_ID }),
      sb.rpc("toughest_mistakes", { p_user_id: OWNER_USER_ID, p_limit: 5 }),
      sb.rpc("progress_extras", { p_user_id: OWNER_USER_ID }),
    ]);
    const stats = (statsRes.data as { streak: number; best_streak: number }[])?.[0];
    streak = stats?.streak ?? 0;
    bestStreak = stats?.best_streak ?? 0;
    summary = (sumRes.data as Summary[])?.[0] ?? EMPTY_SUMMARY;
    extras = (extrasRes.data as Extras[])?.[0] ?? EMPTY_EXTRAS;
    categories = (catRes.data as CategoryRow[]) ?? [];
    types = (typeRes.data as TypeRow[]) ?? [];
    tough = (toughRes.data as ToughRow[]) ?? [];
  } catch {
    dbError = true;
  }

  const accuracy = pct(summary.total_correct, summary.total_reviews);
  const accuracy7d = pct(extras.correct_7d, extras.reviews_7d);
  const masteredPct = pct(summary.mastered, summary.total);
  // Comparamos la semana con el histórico para ver si la cosa mejora o no.
  const trend = extras.reviews_7d >= 5 ? accuracy7d - accuracy : null;

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
        <Tile value={`🔥 ${streak}`} label={`racha · récord ${bestStreak}`} />
        <Tile value={`${accuracy}%`} label="aciertos (histórico)" />
        <Tile value={summary.active} label="errores activos" />
        <Tile value={summary.mastered} label="dominados" />
      </section>

      {/* Tendencia: ¿voy a mejor que mi media? */}
      {trend !== null && (
        <section className="mt-6">
          <div className="rounded-2xl border border-border bg-surface px-4 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">Últimos 7 días</span>
              <span className="text-2xl font-bold tabular-nums text-foreground">{accuracy7d}%</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {trend > 2 ? (
                <>
                  <span className="text-success">▲ {trend} puntos</span> sobre tu media histórica,
                  con {extras.reviews_7d} respuestas.
                </>
              ) : trend < -2 ? (
                <>
                  <span className="text-danger">▼ {Math.abs(trend)} puntos</span> por debajo de tu
                  media. Suele pasar cuando entran errores nuevos a caja 1.
                </>
              ) : (
                <>En línea con tu media histórica, con {extras.reviews_7d} respuestas.</>
              )}
            </p>
          </div>
        </section>
      )}

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

      {/* Cierre del bucle: cuánto tarda un error en morir */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        <Tile
          value={extras.median_days_to_master > 0 ? `${extras.median_days_to_master}d` : "—"}
          label="hasta cerrar un error"
        />
        <Tile value={extras.mastered_30d} label="cerrados (30d)" />
        <Tile value={extras.sessions_30d} label="sesiones (30d)" />
      </section>
      <p className="mt-2 text-xs text-muted">
        «Hasta cerrar» es la mediana de días desde tu primer repaso de un error hasta que lo
        dominas: es el tiempo real que tarda el bucle en completarse.
      </p>

      {/* Por formato de ejercicio: dónde falla la producción frente al reconocimiento */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted">Acierto por tipo de ejercicio</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {types.map((t) => {
            const p = pct(t.correct, t.answers);
            return (
              <li key={t.item_type}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground">
                    {ITEM_TYPE_LABELS[t.item_type] ?? t.item_type}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {p}% · {t.answers} resp. · {fmtSeconds(t.median_ms)}
                  </span>
                </div>
                <Bar value={p} />
              </li>
            );
          })}
          {types.length === 0 && <li className="text-sm text-muted">Aún no hay datos.</li>}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Elegir opción y rellenar huecos es reconocer; corregir y traducir es producir. La
          diferencia entre ambos bloques dice cuánto te queda para escribir sin pensarlo.
        </p>
      </section>

      {/* Lista accionable */}
      {tough.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted">Los que más se te resisten</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {tough.map((t) => (
              <li
                key={t.ref}
                className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground">
                    #{t.ref} {t.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-danger">
                    {t.misses}/{t.attempts} fallos
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {CATEGORY_LABELS[t.category] ?? t.category} · caja {t.box}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Activos con al menos 3 intentos, ordenados por porcentaje de fallo. Si alguno lleva
            muchas vueltas atascado, quizá la regla del log esté mal planteada.
          </p>
        </section>
      )}

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
                <Bar value={p} />
              </li>
            );
          })}
          {categories.length === 0 && (
            <li className="text-sm text-muted">Aún no hay datos suficientes.</li>
          )}
        </ul>
        <p className="mt-3 text-xs text-muted">
          El tiempo es la mediana de respuesta (descartando pausas largas): un proxy de cuánto has
          automatizado la regla, que baja según la interiorizas.
        </p>
      </section>
    </main>
  );
}
