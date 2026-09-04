import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, SESSION_SIZE, TRANSLATIONS_PER_SESSION } from "@/lib/constants";
import { Lucy } from "./components/Lucy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Stats {
  due_count: number;
  new_count: number;
  active_count: number;
  mastered_count: number;
  streak: number;
  best_streak: number;
  sessions_total: number;
}

const EMPTY_STATS: Stats = {
  due_count: 0,
  new_count: 0,
  active_count: 0,
  mastered_count: 0,
  streak: 0,
  best_streak: 0,
  sessions_total: 0,
};

async function getStats(): Promise<Stats> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("dashboard_stats", { p_user_id: OWNER_USER_ID });
  if (error) throw error;
  return (data as Stats[])?.[0] ?? EMPTY_STATS;
}

/** ¿Hay ya frases de traducción generadas? Si no, no ofrecemos la sesión suelta. */
async function hasTranslations(): Promise<boolean> {
  const sb = supabaseAdmin();
  const { count } = await sb
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("type", "translate_es_en");
  return (count ?? 0) > 0;
}

function StatCard({
  value,
  label,
  accent = false,
}: {
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 text-center ${
        accent ? "border-accent/40 bg-accent/10" : "border-border bg-surface"
      }`}
    >
      <div
        className={`text-2xl font-bold tabular-nums ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>;
}

export default async function HomePage() {
  let stats: Stats = EMPTY_STATS;
  let dbError = false;
  let translateReady = false;
  try {
    [stats, translateReady] = await Promise.all([getStats(), hasTranslations()]);
  } catch {
    dbError = true;
  }

  // La sesión sirve traducciones solo si las hay generadas.
  const translationsInSession = translateReady ? TRANSLATIONS_PER_SESSION : 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6">
      {/* Hero: Lucy protagonista */}
      <section className="flex flex-col items-center pt-2 text-center">
        <div className="relative flex items-center justify-center">
          <div aria-hidden className="absolute h-48 w-48 rounded-full bg-accent/10 blur-2xl" />
          <Lucy size={164} className="relative drop-shadow-sm" />
        </div>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Lucilingo</h1>
        <p className="mt-1 text-base text-muted">
          {stats.due_count > 0 ? "Hoy toca vaciar errores." : "Todo al día. Repasemos igualmente."}
        </p>
      </section>

      {dbError && (
        <div className="mt-6 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
          No se pudo conectar con la base de datos. Revisa las variables{" "}
          <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </div>
      )}

      {/* El hábito: lo que sostiene todo lo demás */}
      <section className="mt-7">
        <SectionLabel>Constancia</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <StatCard value={`🔥 ${stats.streak}`} label="racha actual" accent={stats.streak > 0} />
          <StatCard value={`🏆 ${stats.best_streak}`} label="racha récord" />
          <StatCard value={stats.sessions_total} label="sesiones" />
        </div>
        {stats.best_streak > 0 && stats.streak >= stats.best_streak && stats.streak > 1 && (
          <p className="mt-2 text-center text-xs text-accent">
            Estás en tu mejor racha. Una sesión más y la superas.
          </p>
        )}
      </section>

      {/* El log: en qué punto está el conjunto de errores */}
      <section className="mt-6">
        <SectionLabel>Tus errores</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <StatCard value={stats.due_count} label="vencidos" />
          <StatCard value={stats.active_count} label="activos" />
          <StatCard value={stats.mastered_count} label="dominados" />
        </div>
      </section>

      <div className="mt-auto pt-8">
        <Link
          href="/session"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-6 text-lg font-semibold text-white shadow-sm transition active:scale-[0.99]"
        >
          Empezar sesión
        </Link>
        <p className="mt-2 text-center text-xs text-muted">
          {SESSION_SIZE} ejercicios
          {translationsInSession > 0 && <>, {translationsInSession} de traducción</>} · ~6 min
        </p>

        <nav className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link href="/progress" className="text-brand-ink underline-offset-4 hover:underline">
            Progreso
          </Link>
          <Link href="/log" className="text-brand-ink underline-offset-4 hover:underline">
            Ver mis errores
          </Link>
          <Link href="/writing" className="text-brand-ink underline-offset-4 hover:underline">
            Escritura libre
          </Link>
          {translateReady && (
            <Link
              href="/session/translate"
              className="text-brand-ink underline-offset-4 hover:underline"
            >
              Solo traducción
            </Link>
          )}
          <Link href="/settings" className="text-brand-ink underline-offset-4 hover:underline">
            Ajustes
          </Link>
        </nav>
      </div>
    </main>
  );
}
