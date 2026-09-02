import { NextRequest, NextResponse } from "next/server";

const GATE_COOKIE = "fodinha_gate";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(request: NextRequest) {
  let password: string | undefined;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const expected = process.env.SITE_GATE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Portão não configurado no servidor." }, { status: 500 });
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return response;
}
