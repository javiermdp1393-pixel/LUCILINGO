import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, getPassword } from "@/lib/auth";

// Puerta de acceso: protege toda la app con la contraseña. En Next 16 esta es
// la convención "proxy" (antes "middleware"). Deja pasar la pantalla de login,
// su endpoint y los assets estáticos (excluidos por el matcher).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  const expected = await authToken(getPassword());
  const authed = !!cookie && cookie === expected;

  if (authed) return NextResponse.next();

  // Rutas accesibles sin sesión.
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  // API sin sesión → 401 (no redirigimos fetch a una página HTML).
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Páginas sin sesión → al login.
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Excluye estáticos, imágenes optimizadas, favicon y la imagen de Lucy (para
// que se vea en la pantalla de login sin sesión).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|lucy.png|manifest.webmanifest).*)"],
};
