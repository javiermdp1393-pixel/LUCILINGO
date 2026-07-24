import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OWNER_USER_ID, CATEGORY_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { MistakeCategory, SeverityLevel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MistakeRow {
  id: string;
  ref: number;
  title: string;
  category: MistakeCategory;
  severity: SeverityLevel;
}
interface StateRow {
  mistake_id: string;
  box: number;
  total_reviews: number;
  mastered_at: string | null;
}

export default async function LogPage() {
  const sb = supabaseAdmin();
  const [{ data: mistakes }, { data: states }] = await Promise.all([
    sb
      .from("mistakes")
      .select("id, ref, title, category, severity")
      .eq("user_id", OWNER_USER_ID)
      .eq("archived", false)
      .order("ref", { ascending: true }),
    sb.from("review_state").select("mistake_id, box, total_reviews, mastered_at"),
  ]);

  const stateById = new Map(((states ?? []) as StateRow[]).map((s) => [s.mistake_id, s]));
  const list = ((mistakes ?? []) as MistakeRow[]).map((m) => ({ m, s: stateById.get(m.id) }));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mis errores</h1>
        <Link href="/" className="text-sm text-brand-ink underline">
          Inicio
        </Link>
      </header>
      <p className="mt-1 text-sm text-muted">{list.length} errores en el log</p>

      <ul className="mt-6 flex flex-col gap-2">
        {list.map(({ m, s }) => {
          const mastered = !!s?.mastered_at && s.box === 5;
          const isNew = !s || s.total_reviews === 0;
          return (
            <li
              key={m.id}
              className="rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium leading-snug">
                    <span className="text-muted">#{m.ref}</span> {m.title}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {CATEGORY_LABELS[m.category] ?? m.category} ·{" "}
                    {SEVERITY_LABELS[m.severity] ?? m.severity}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    mastered
                      ? "bg-success-bg text-success"
                      : isNew
                        ? "bg-surface-muted text-muted"
                        : "bg-accent/15 text-accent"
                  }`}
                >
                  {mastered ? "Dominado" : isNew ? "Nuevo" : `Caja ${s?.box}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
