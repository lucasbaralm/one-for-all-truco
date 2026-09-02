import { NextRequest, NextResponse } from "next/server";

const GATE_COOKIE = "fodinha_gate";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Deixa passar a própria tela do portão, a rota que valida a senha, e assets estáticos.
  if (
    pathname.startsWith("/gate") ||
    pathname.startsWith("/api/gate") ||
    pathname.startsWith("/themes") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const hasAccess = request.cookies.get(GATE_COOKIE)?.value === "1";
  if (!hasAccess) {
    const url = request.nextUrl.clone();
    url.pathname = "/gate";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Roda em tudo, menos assets internos do Next (JS/CSS/imagens geradas) — essas
  // já são filtradas pelo próprio matcher, sem precisar checar dentro da função.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
