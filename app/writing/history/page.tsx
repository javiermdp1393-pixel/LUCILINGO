import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  created_at: string;
  user_text: string;
  corrected_text: string | null;
  brief_es: string | null;
  feedback_json: { issues?: unknown[] } | null;
}

function preview(s: string, n = 90): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

export default async function WritingHistoryPage() {
  let rows: Row[] = [];
  let dbError = false;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("writings")
      .select("id, created_at, user_text, corrected_text, brief_es, feedback_json")
      .eq("user_id", OWNER_USER_ID)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    rows = (data ?? []) as Row[];
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-12 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Correcciones</h1>
        <Link href="/writing" className="text-sm text-brand-ink underline">
          Escribir
        </Link>
      </header>
      <p className="mt-1 text-sm text-muted">
        Tus textos corregidos, por si necesitas recuperar alguno.
      </p>

      {dbError && (
        <div className="mt-6 rounded-2xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
          No se pudo cargar el historial.
        </div>
      )}

      {rows.length === 0 && !dbError ? (
        <div className="mt-10 text-center">
          <p className="text-muted">Todavía no has corregido ningún texto.</p>
          <Link
            href="/writing"
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-6 text-base font-semibold text-white"
          >
            Escribir el primero
          </Link>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {rows.map((r) => {
            const n = Array.isArray(r.feedback_json?.issues) ? r.feedback_json!.issues!.length : 0;
            return (
              <li key={r.id}>
                <Link
                  href={`/writing/${r.id}`}
                  className="block rounded-2xl border border-border bg-surface px-4 py-3 active:scale-[0.99]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-muted">
                      {new Date(r.created_at).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {n === 0 ? "sin errores" : `${n} ${n === 1 ? "error" : "errores"}`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-foreground">
                    {preview(r.corrected_text || r.user_text)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
