// Puerta de acceso simple con una sola contraseña (§ app personal, un usuario).
// No es Supabase Auth: es un candado para que la URL pública no la use cualquiera
// hasta que montemos el login real. La contraseña se lee de APP_PASSWORD; si no
// está definida, cae a un valor por defecto para que funcione sin config extra.

const SALT = "lucilingo.v1";

export const AUTH_COOKIE = "lucilingo_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 365; // 1 año

export function getPassword(): string {
  return process.env.APP_PASSWORD || "LUCIMIV";
}

/**
 * Token que se guarda en la cookie: SHA-256 de la contraseña + salt. Así la
 * cookie no contiene la contraseña en claro. Web Crypto funciona igual en el
 * runtime edge (middleware) y en Node (route handlers).
 */
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}:${SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
