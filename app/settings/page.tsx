import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";
import { anthropicConfigured } from "@/lib/generateItems";
import { notionConfigured } from "@/lib/notionSync";
import { computeCostUsd } from "@/lib/constants";
import { GenerateVariantsButton, BackfillHintsButton, SyncNotionButton } from "./SettingsActions";

interface UsageRow {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

function formatUsd(v: number): string {
  if (v <= 0) return "$0,00";
  if (v < 0.01) return "<$0,01";
  return `$${v.toFixed(2).replace(".", ",")}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const hasKey = anthropicConfigured();
  const hasNotion = notionConfigured();

  let aiItems = 0;
  let flagged = 0;
  let needingCount = 0;
  let totalCostUsd = 0;
  let totalCalls = 0;
  let hintsMissing = 0;
  let notionLastRun: string | null = null;
  try {
    const sb = supabaseAdmin();
    const syncRes = await sb
      .from("notion_sync_state")
      .select("last_run_at")
      .eq("id", 1)
      .single<{ last_run_at: string | null }>();
    notionLastRun = syncRes.data?.last_run_at ?? null;
    const [aiRes, needingRes, flaggedRes, usageRes, hintsRes] = await Promise.all([
      sb.from("items").select("id", { count: "exact", head: true }).eq("generated_by", "ai"),
      sb.rpc("mistakes_needing_items", { p_user_id: OWNER_USER_ID }),
      sb.from("items").select("id", { count: "exact", head: true }).eq("status", "flagged"),
      sb
        .from("ai_generations")
        .select("input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens"),
      sb
        .from("items")
        .select("id", { count: "exact", head: true })
        .is("hint", null)
        .eq("status", "active")
        .in("type", ["fill_gap", "correct_sentence"]),
    ]);
    aiItems = aiRes.count ?? 0;
    flagged = flaggedRes.count ?? 0;
    needingCount = Array.isArray(needingRes.data) ? needingRes.data.length : 0;
    hintsMissing = hintsRes.count ?? 0;

    const rows = (usageRes.data ?? []) as UsageRow[];
    totalCalls = rows.length;
    const totals = rows.reduce(
      (acc, r) => ({
        input_tokens: acc.input_tokens + (r.input_tokens ?? 0),
        output_tokens: acc.output_tokens + (r.output_tokens ?? 0),
        cache_read_tokens: acc.cache_read_tokens + (r.cache_read_tokens ?? 0),
        cache_creation_tokens: acc.cache_creation_tokens + (r.cache_creation_tokens ?? 0),
      }),
      { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 }
    );
    totalCostUsd = computeCostUsd(totals);
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
        <h2 className="text-sm font-semibold text-muted">Sincronización con Notion</h2>
        <p className="mt-1 text-sm text-foreground">
          Trae los errores nuevos del <em>Mistake log</em> de Notion (upsert por página, no
          duplica). Los nuevos entran con su ejercicio inicial; luego genera variantes.
        </p>
        {!hasNotion && (
          <div className="mt-3 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            Falta <code>NOTION_TOKEN</code> en el entorno. Crea una integración en Notion, comparte
            el <em>Mistake log</em> con ella y añade el token en Vercel.
          </div>
        )}
        <div className="mt-3">
          <SyncNotionButton disabled={!hasNotion} />
        </div>
        {notionLastRun && (
          <p className="mt-2 text-xs text-muted">
            Última sincronización: {new Date(notionLastRun).toLocaleString("es-ES")}
          </p>
        )}
      </section>

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
          El validador descarta automáticamente los ejercicios mal formados.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted">Pistas contextuales</h2>
        <p className="mt-1 text-sm text-foreground">
          Una pista sutil bajo el enunciado (fill_gap y corrige la frase) para saber por dónde
          va la respuesta al releerla. Rellena las que falten en los ejercicios ya existentes.
        </p>
        <div className="mt-3">
          <div className="mb-3 rounded-2xl border border-border bg-surface px-4 py-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{hintsMissing}</div>
            <div className="text-xs text-muted">ejercicios sin pista</div>
          </div>
          <BackfillHintsButton disabled={!hasKey} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted">Gasto de IA</h2>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
          <div>
            <div className="text-2xl font-bold tabular-nums">{formatUsd(totalCostUsd)}</div>
            <div className="text-xs text-muted">acumulado ({totalCalls} llamadas)</div>
          </div>
          <div className="text-right text-xs text-muted">
            claude-sonnet-5
            <br />
            $2 / $10 por 1M tok.
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Coste real calculado con los tokens que devuelve la API en cada llamada.
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
