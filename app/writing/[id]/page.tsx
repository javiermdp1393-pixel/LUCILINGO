import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, CATEGORY_LABELS } from "@/lib/constants";
import { CopyButton } from "../CopyButton";
import type { WritingIssue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  created_at: string;
  user_text: string;
  corrected_text: string | null;
  brief_es: string | null;
  feedback_json: { issues?: WritingIssue[] } | null;
}

export default async function WritingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let row: Row | null = null;
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("writings")
      .select("id, created_at, user_text, corrected_text, brief_es, feedback_json")
      .eq("id", id)
      .eq("user_id", OWNER_USER_ID)
      .maybeSingle();
    row = (data as Row) ?? null;
  } catch {
    row = null;
  }

  if (!row) notFound();

  const issues = Array.isArray(row.feedback_json?.issues) ? row.feedback_json!.issues! : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-12 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Corrección</h1>
        <Link href="/writing/history" className="text-sm text-brand-ink underline">
          Volver
        </Link>
      </header>
      <p className="mt-1 text-xs text-muted">
        {new Date(row.created_at).toLocaleString("es-ES")}
      </p>

      {row.brief_es && (
        <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
          <span className="font-semibold text-brand-ink">Consigna:</span> {row.brief_es}
        </div>
      )}

      {row.corrected_text && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted">Texto corregido</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed">
            {row.corrected_text}
          </p>
          <div className="mt-3">
            <CopyButton text={row.corrected_text} />
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">Tu texto original</h2>
        <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted">
          {row.user_text}
        </p>
      </section>

      {issues.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">
            Problemas detectados ({issues.length})
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {issues.map((issue, i) => (
              <li key={i} className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                <p>
                  <span className="text-danger line-through">{issue.wrong}</span>{" "}
                  <span className="font-semibold text-success">{issue.correct}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {CATEGORY_LABELS[issue.category] ?? issue.category} — {issue.explanation_es}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
