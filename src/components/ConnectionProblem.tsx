"use client";

import { useRouter } from "next/navigation";
import { Loader2, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PARTY_DOWN_TITLE, SUPABASE_DOWN_TITLE, useServiceStatus } from "@/components/ServiceStatus";
import type { RoomStatus } from "@/lib/party/usePartyRoom";

/**
 * Painel que aparece quando uma sala não conecta: descobre QUAL serviço está
 * fora (servidor de jogo ou Supabase) em vez de deixar a pessoa olhando uma tela de
 * "conectando" sem fim.
 */
export function ConnectionProblem({
  roomLabel,
  status,
  backHref,
  backLabel,
}: {
  /** Ex.: "sala ABCD". */
  roomLabel: string;
  status: RoomStatus;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { party, supabase, rechecking } = useServiceStatus();
  const checking = party === "checking" || supabase === "checking";

  let title: string;
  let detail: string;
  if (checking) {
    title = `Conectando à ${roomLabel}...`;
    detail = "Verificando os servidores.";
  } else if (party === "down") {
    title = PARTY_DOWN_TITLE;
    detail =
      process.env.NODE_ENV !== "production"
        ? "Não consegui falar com o servidor de jogo. Rode `npm run party:dev` no terminal — esta tela conecta sozinha quando ele voltar."
        : "Não consegui falar com o servidor de jogo. Esta tela conecta sozinha quando ele voltar.";
  } else if (supabase === "down") {
    title = SUPABASE_DOWN_TITLE;
    detail = "Sem o Supabase o servidor de jogo não consegue validar o seu login. Tente de novo em instantes.";
  } else if (status === "auth_unavailable") {
    title = "O servidor de jogo não consegue falar com o Supabase";
    detail =
      "O seu navegador alcança o Supabase, mas o servidor de jogo não — confira o SUPABASE_URL dele (secret do Worker; em dev, o .dev.vars). Esta tela tenta de novo sozinha.";
  } else if (status === "unauthorized") {
    title = "O servidor de jogo não aceitou o seu login";
    detail = "A sessão pode ter vencido. Entre de novo para continuar.";
  } else {
    title = `Ainda conectando à ${roomLabel}...`;
    detail = "Os servidores respondem, mas a sala ainda não abriu. Tentando de novo.";
  }

  const failing = party === "down" || supabase === "down" || status === "unauthorized" || status === "auth_unavailable";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {failing ? <ServerCrash className="h-12 w-12 text-amber-400" /> : <Loader2 className="h-10 w-10 animate-spin text-red-500" />}
      <div className="space-y-1">
        <p className="text-xl font-black text-white">{title}</p>
        <p className="max-w-sm text-sm text-zinc-400">{detail}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {status === "unauthorized" ? (
          <Button onClick={() => router.push("/")}>Entrar de novo</Button>
        ) : (
          <Button onClick={() => window.location.reload()} disabled={rechecking}>
            Tentar de novo
          </Button>
        )}
        <Button variant="secondary" onClick={() => router.push(backHref)}>
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
