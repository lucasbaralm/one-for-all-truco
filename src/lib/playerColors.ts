// Cor de cada jogador nas telas dos jogos sem "cor de jogador" nas regras (Dobble, Uno, Forca):
// ajuda a ver de quem é cada linha do histórico e cada cartão. Vem do lugar do jogador na mesa
// (estável durante a partida).

const PALETTE = ["#f472b6", "#38bdf8", "#a3e635", "#fb923c", "#c084fc", "#2dd4bf", "#f87171", "#facc15"];

export function playerColor(players: { id: string }[], id: string): string {
  const i = players.findIndex((p) => p.id === id);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
