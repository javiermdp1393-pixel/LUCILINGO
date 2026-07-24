import { Lucy } from "../components/Lucy";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6">
      <Lucy size={96} />
      <h1 className="mt-4 text-2xl font-bold">Lucilingo</h1>
      <p className="mt-1 text-sm text-muted">Introduce la contraseña para entrar.</p>

      <form action="/api/login" method="post" className="mt-8 w-full">
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Contraseña"
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-lg outline-none focus:border-brand"
        />
        {error && (
          <p className="mt-2 text-sm text-danger">Contraseña incorrecta. Inténtalo de nuevo.</p>
        )}
        <button
          type="submit"
          className="mt-4 min-h-14 w-full rounded-2xl bg-brand text-lg font-semibold text-white active:scale-[0.99]"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
