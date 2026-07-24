import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { Lucy } from "./components/Lucy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Stats {
  due_count: number;
  new_count: number;
  active_count: number;
  mastered_count: number;
  streak: number;
}

async function getStats(): Promise<Stats> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("dashboard_stats", { p_user_id: OWNER_USER_ID });
  if (error) throw error;
  const row = (data as Stats[])?.[0];
  return row ?? { due_count: 0, new_count: 0, active_count: 0, mastered_count: 0, streak: 0 };
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-border px-4 py-3 text-center">
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

export default async function HomePage() {
  let stats: Stats;
  let dbError = false;
  try {
    stats = await getStats();
  } catch {
    dbError = true;
    stats = { due_count: 0, new_count: 0, active_count: 0, mastered_count: 0, streak: 0 };
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-8">
      <header className="flex items-center gap-3">
        <Lucy size={56} />
        <div>
          <h1 className="text-xl font-bold leading-tight text-foreground">Lucilingo</h1>
          <p className="text-sm text-muted">Hoy toca vaciar errores.</p>
        </div>
        {stats.streak > 0 && (
          <span className="ml-auto rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
            🔥 {stats.streak}
          </span>
        )}
      </header>

      {dbError && (
        <div className="mt-6 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
          No se pudo conectar con la base de datos. Revisa las variables{" "}
          <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </div>
      )}

      <section className="mt-8 grid grid-cols-3 gap-3">
        <StatCard value={stats.due_count} label="vencidos" />
        <StatCard value={stats.active_count} label="activos" />
        <StatCard value={stats.mastered_count} label="dominados" />
      </section>

      <div className="mt-auto pt-10">
        <Link
          href="/session"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-6 text-lg font-semibold text-white shadow-sm transition active:scale-[0.99]"
        >
          Empezar sesión
        </Link>
        <p className="mt-2 text-center text-xs text-muted">
          {stats.due_count > 0
            ? `${Math.min(stats.due_count, 10)} de tus ${stats.due_count} errores vencidos, ~5 min`
            : "Sin vencimientos: repasarás los más próximos"}
        </p>

        <nav className="mt-6 flex justify-center gap-6 text-sm">
          <Link href="/log" className="text-brand-ink underline-offset-4 hover:underline">
            Ver mis errores
          </Link>
          <span className="text-muted">Escritura libre · pronto</span>
        </nav>
      </div>
    </main>
  );
}
