// Texto do fim de partida, igual pros três jogos e sempre do ponto de vista de
// quem está olhando: quem ganhou vê "Você venceu!", quem perdeu vê em que lugar
// ficou, e quem só assistia vê o nome do vencedor.

export type ResultTone = "win" | "lose" | "spectator";

export interface ResultHeadline {
  tone: ResultTone;
  /** Linha pequena, em cima. */
  kicker: string;
  /** Linha grande. */
  title: string;
  /** Linha de apoio, embaixo (opcional). */
  subtitle?: string;
}

/** Posição (1 = primeiro) de `meId` numa classificação já ordenada; null se não está nela. */
export function rankOf(order: { id: string }[], meId: string | null): number | null {
  if (!meId) return null;
  const i = order.findIndex((p) => p.id === meId);
  return i === -1 ? null : i + 1;
}

export function resultHeadline(
  order: { id: string; name: string }[],
  winnerId: string | null,
  meId: string | null
): ResultHeadline {
  const winner = order.find((p) => p.id === winnerId);
  const rank = rankOf(order, meId);
  if (rank === null) {
    return { tone: "spectator", kicker: "Fim de jogo", title: winner ? `${winner.name} venceu` : "Fim de jogo" };
  }
  if (winnerId === meId) return { tone: "win", kicker: "Parabéns!", title: "Você venceu!" };
  return {
    tone: "lose",
    kicker: "Fim de jogo",
    title: `Você ficou em ${rank}º lugar`,
    subtitle: winner ? `${winner.name} venceu` : undefined,
  };
}
