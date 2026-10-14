// Quando um erro de símbolo vindo do servidor merece reação na tela (carta tremendo,
// som, vibração). Um erro que JÁ estava no estado quando a tela abriu (reconexão,
// recarregar) é história velha e não reage; o primeiro erro de verdade da partida
// reage — mesmo que ninguém tivesse errado antes.

/**
 * @param seen        último erro já tratado (null = ainda não chegou nenhuma visão do servidor)
 * @param wrongSeq    número do último erro no estado atual (undefined = ninguém errou ainda)
 */
export function nextWrongReaction(seen: number | null, wrongSeq: number | undefined): { react: boolean; seen: number } {
  // Primeira visão: o que já está lá não é novidade.
  if (seen === null) return { react: false, seen: wrongSeq ?? 0 };
  if (wrongSeq === undefined || wrongSeq === seen) return { react: false, seen };
  return { react: true, seen: wrongSeq };
}
