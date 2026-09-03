"use client";

import { UserRound } from "lucide-react";

// Avatar de jogador reusado na sala de espera e na mesa de jogo: mostra a
// foto enviada (avatarUrl) ou cai pra inicial do nome numa bolinha colorida
// (e pro ícone genérico só se nem nome houver). Tamanho via className (classes
// w-*/h-*, responsivas ou não) em vez de um prop numérico — mais fácil de
// combinar com breakpoints sm: como o resto do layout já faz.
export function PlayerAvatar({
  avatarUrl,
  name,
  className = "w-10 h-10",
}: {
  avatarUrl?: string | null;
  name: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL vem do Supabase Storage, sem domínio fixo pra configurar no next/image
      <img
        src={avatarUrl}
        alt={name}
        className={`rounded-full object-cover shrink-0 bg-zinc-800 ${className}`}
      />
    );
  }

  return (
    <div className={`rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white shrink-0 ${className}`}>
      {name ? name.charAt(0).toUpperCase() : <UserRound className="w-1/2 h-1/2" />}
    </div>
  );
}
