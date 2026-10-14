import { UnoCard, UnoColor } from "./cards";
import type { BotLevel } from "./engine";

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: "Fácil", medium: "Médio", hard: "Difícil" };

export const COLOR_LABEL: Record<UnoColor, string> = { red: "vermelho", yellow: "amarelo", green: "verde", blue: "azul" };

/** Cor de tela de cada cor do Uno (fundo da carta, brilho da pilha). */
export const COLOR_HEX: Record<UnoColor, string> = { red: "#ef4444", yellow: "#facc15", green: "#22c55e", blue: "#3b82f6" };

/** Nome da carta pra frase ("verde 7", "Pular azul", "Coringa +4"). `chosen` = a cor escolhida num coringa. */
export function cardName(card: UnoCard, chosen?: UnoColor | null): string {
  const color = card.color ? COLOR_LABEL[card.color] : null;
  switch (card.kind) {
    case "number":
      return `${color} ${card.value}`;
    case "skip":
      return `Pular ${color}`;
    case "reverse":
      return `Inverter ${color}`;
    case "draw2":
      return `+2 ${color}`;
    case "wild":
      return chosen ? `Coringa (${COLOR_LABEL[chosen]})` : "Coringa";
    case "wild4":
      return chosen ? `Coringa +4 (${COLOR_LABEL[chosen]})` : "Coringa +4";
  }
}
