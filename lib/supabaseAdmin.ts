import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de servidor con la service_role key. Bypassa RLS y NUNCA debe
// llegar al cliente: por eso el import de "server-only" hace fallar el build
// si este módulo se importa desde un componente de cliente.
//
// Toda la E/S de datos de la app pasa por aquí (route handlers de servidor).
// La clave pública/anon queda bloqueada por RLS sin políticas.

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Copia .env.example a .env.local y rellénalas."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
