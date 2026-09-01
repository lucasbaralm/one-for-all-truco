/**
 * Autoridade de host é um problema de rede, não uma regra de jogo — mas fica
 * aqui como função pura (sem React/Supabase) para poder ser testada em isolado
 * e para não misturar essa lógica com as regras em state-machine.ts.
 */
export interface PresencePlayer {
  id: string;
  joinedAt: string;
}

/**
 * Decide quem deveria ter autoridade de host agora, dado o host atualmente
 * designado (persistido, pode ser null) e quem está conectado neste instante.
 *
 * Regra: se o host designado ainda está presente, ele continua sendo o host —
 * mesmo que outro jogador presente tenha um joinedAt mais antigo. Isso torna a
 * autoridade "pegajosa": uma vez que passa para outro jogador (porque o host
 * anterior caiu), ela não volta sozinha quando esse jogador reconecta.
 * Só quando o host designado NÃO está mais presente é que alguém novo assume
 * — e nesse caso é sempre o presente com o joinedAt mais antigo, então todo
 * cliente calculando isso a partir do mesmo snapshot de presença converge no
 * mesmo resultado sem precisar de coordenação extra.
 */
export function resolveHostId(
  hostId: string | null,
  presentPlayers: PresencePlayer[]
): string | null {
  if (hostId && presentPlayers.some((p) => p.id === hostId)) {
    return hostId;
  }
  if (presentPlayers.length === 0) return null;
  const earliest = [...presentPlayers].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  )[0];
  return earliest.id;
}
