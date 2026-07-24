import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { anthropicConfigured } from "@/lib/generateItems";
import { GenerateVariantsButton } from "./SettingsActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const hasKey = anthropicConfigured();

  let aiItems = 0;
  let flagged = 0;
  let needingCount = 0;
  try {
    const sb = supabaseAdmin();
    const [aiRes, needingRes, flaggedRes] = await Promise.all([
      sb.from("items").select("id", { count: "exact", head: true }).eq("generated_by", "ai"),
      sb.rpc("mistakes_needing_items", { p_user_id: OWNER_USER_ID }),
      sb.from("items").select("id", { count: "exact", head: true }).eq("status", "flagged"),
    ]);
    aiItems = aiRes.count ?? 0;
    flagged = flaggedRes.count ?? 0;
    needingCount = Array.isArray(needingRes.data) ? needingRes.data.length : 0;
  } catch {
    // Sin conexión a BD (p. ej. falta la service_role key): mostramos ceros.
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ajustes</h1>
        <Link href="/" className="text-sm text-brand-ink underline">
          Inicio
        </Link>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted">Generación de variantes (IA)</h2>
        <p className="mt-1 text-sm text-foreground">
          Cada error necesita varios ejercicios rotatorios para consolidar la regla y no
          memorizar una frase. Aquí generas los que falten.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{needingCount}</div>
            <div className="text-xs text-muted">errores sin variantes</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{aiItems ?? 0}</div>
            <div className="text-xs text-muted">ejercicios de IA</div>
          </div>
        </div>

        {!hasKey && (
          <div className="mt-4 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            Falta <code>ANTHROPIC_API_KEY</code> en el entorno. Añádela en Vercel (Settings →
            Environment Variables) y vuelve a desplegar para poder generar.
          </div>
        )}

        <div className="mt-4">
          <GenerateVariantsButton disabled={!hasKey} />
        </div>

        <p className="mt-3 text-xs text-muted">
          El validador descarta automáticamente los ejercicios mal formados. Coste aproximado:
          ~3 llamadas por error a lo largo de su vida.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted">Ejercicios marcados</h2>
        <p className="mt-1 text-sm text-foreground">
          {flagged ?? 0} ejercicios marcados como defectuosos y fuera de rotación.
        </p>
      </section>
    </main>
  );
}
