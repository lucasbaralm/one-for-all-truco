import { NextRequest, NextResponse } from "next/server";
import { buildIceServers } from "@/lib/call/iceServers";

// Servidores ICE (STUN + TURN) da videochamada, com credencial temporária por pessoa. Só quem está logado
// recebe (o token do Supabase vai no cabeçalho Authorization): o TURN gasta banda de quem paga por ele.
// POST de propósito — gerar credencial é uma ação, e nunca deve cair em cache.

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Faça login pra entrar na chamada." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Login não configurado no servidor." }, { status: 500 });

  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon }, cache: "no-store" });
    if (res.status >= 500) return NextResponse.json({ error: "Não deu pra confirmar o login agora." }, { status: 503 });
    if (!res.ok) return NextResponse.json({ error: "Login inválido." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Não deu pra confirmar o login agora." }, { status: 503 });
  }

  const env = process.env;
  const result = await buildIceServers({
    CLOUDFLARE_TURN_KEY_ID: env.CLOUDFLARE_TURN_KEY_ID,
    CLOUDFLARE_TURN_API_TOKEN: env.CLOUDFLARE_TURN_API_TOKEN,
    TURN_URLS: env.TURN_URLS,
    TURN_USERNAME: env.TURN_USERNAME,
    TURN_CREDENTIAL: env.TURN_CREDENTIAL,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
