import type * as Party from "partykit/server";
import {
  GameState,
  PlayerState,
  createInitialState,
  startNextRound,
  handleBet,
  handlePlayCard,
  handleShuffleAndDeal,
  voteToEndMatch,
} from "../src/lib/game/state-machine";
import { getWinningCardIndex } from "../src/lib/game/rules";
import { ClientMessage } from "../src/lib/game/party-protocol";

// Mesmos valores usados hoje no cliente (GameBoard.tsx) — mantidos aqui pra
// preservar o mesmo ritmo/UX de revelação de vaza e placar, só que rodando
// no lado do servidor (neutro) em vez de no navegador de quem for "host".
const TRICK_REVEAL_MS = 1200;
const TRICK_SELF_WIN_REVEAL_MS = 2000;
const LAST_TRICK_REVEAL_MS = 3000;
const SCOREBOARD_MS = 3000;

type Env = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };

export default class FodinhaRoom implements Party.Server {
  state: GameState | null = null;

  constructor(readonly room: Party.Room) {}

  private get env(): Env {
    return this.room.env as unknown as Env;
  }

  // Carrega o estado já existente do Postgres (se a sala já tinha uma
  // partida em andamento) — sobrevive a reinícios/evicção do room server.
  async onStart() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = this.env;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${this.room.id}&select=state`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      const rows = (await res.json()) as { state: GameState }[];
      if (rows?.[0]?.state) this.state = rows[0].state;
    } catch {
      // sem estado salvo ainda — segue com this.state = null
    }
  }

  // Verifica o token de acesso do Supabase contra a própria API de auth do
  // Supabase (evita precisar guardar o JWT secret aqui) e confirma que o
  // playerId reivindicado bate com o usuário autenticado de verdade.
  async onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get("token");
    const claimedName = url.searchParams.get("playerId");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = this.env;

    if (!token || !claimedName) {
      connection.close(4001, "missing auth");
      return;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      });
      if (!res.ok) {
        connection.close(4001, "unauthorized");
        return;
      }
      const user = (await res.json()) as { user_metadata?: { username?: string } };
      const verifiedName = user.user_metadata?.username;
      if (!verifiedName || verifiedName !== claimedName) {
        connection.close(4001, "identity mismatch");
        return;
      }
      connection.setState({ username: verifiedName });
    } catch {
      connection.close(4001, "auth check failed");
      return;
    }

    if (this.state) {
      connection.send(JSON.stringify({ type: "state", state: this.state }));
    }
  }

  private verifiedName(sender: Party.Connection): string | null {
    const s = sender.state as { username?: string } | null;
    return s?.username ?? null;
  }

  private async persist(state: GameState) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = this.env;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${this.room.id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ state }),
      });
    } catch {
      // best-effort — a próxima escrita corrige, e o estado em memória do
      // room server continua sendo a fonte de verdade pros clientes conectados
    }
  }

  private broadcastState() {
    if (this.state) this.room.broadcast(JSON.stringify({ type: "state", state: this.state }));
  }

  private async persistMatchHistoryIfGameOver(prevPhase: string, next: GameState) {
    if (next.phase !== "game_over" || prevPhase === "game_over") return;
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = this.env;
    const sorted = [...next.players].sort((a, b) => a.score - b.score);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/match_history`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          room_id: this.room.id,
          winner_name: sorted[0].name,
          players_summary: sorted.map((p) => ({ name: p.name, score: p.score })),
        }),
      });
    } catch {
      // histórico é best-effort, não deve travar a partida em si
    }
  }

  // Aplica uma transição de estado por completo: persiste, salva histórico
  // se a partida acabou, e transmite pra todo mundo — usado por toda ação
  // que não precisa segurar uma revelação de vaza antes (ver play_card).
  private async applyAndBroadcast(prevPhase: string, next: GameState) {
    this.state = next;
    await Promise.all([this.persist(next), this.persistMatchHistoryIfGameOver(prevPhase, next)]);
    this.broadcastState();
  }

  // Depois do hold de revelação (vaza ou placar), avança pra próxima rodada
  // — só se ainda fizer sentido (ninguém mais chamou isso antes por engano).
  private scheduleAdvance(delayMs: number) {
    setTimeout(async () => {
      if (!this.state || this.state.phase !== "round_end") return;
      await this.applyAndBroadcast(this.state.phase, startNextRound(this.state));
    }, delayMs);
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (typeof raw !== "string") return;
    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    const verified = this.verifiedName(sender);
    if (!verified) return;

    // Efêmeras (emoji, aviso de método de embaralhar): só repassa, sem
    // mexer no estado do jogo nem exigir dono da vez.
    if (message.type === "emoji" || message.type === "shuffle_announce") {
      this.room.broadcast(raw, [sender.id]);
      return;
    }

    if ("playerId" in message && message.playerId !== verified) return;

    if (message.type === "start_game") {
      // Permite criar do zero (nenhuma partida ainda) ou recomeçar depois
      // de um game_over — mas nunca pisar numa partida em andamento.
      if (this.state && this.state.phase !== "game_over") return;
      await this.applyAndBroadcast(
        this.state?.phase ?? "waiting",
        startNextRound(createInitialState(message.players))
      );
      return;
    }

    if (!this.state) return;

    if (message.type === "bet") {
      await this.applyAndBroadcast(this.state.phase, handleBet(this.state, message.playerId, message.bet));
      return;
    }

    if (message.type === "shuffle") {
      await this.applyAndBroadcast(
        this.state.phase,
        handleShuffleAndDeal(this.state, message.playerId, message.style)
      );
      return;
    }

    if (message.type === "vote_end") {
      const connectedCount = [...this.room.getConnections()].length;
      await this.applyAndBroadcast(
        this.state.phase,
        voteToEndMatch(this.state, message.playerId, connectedCount)
      );
      return;
    }

    if (message.type === "play_card") {
      const prev = this.state;
      if (prev.phase !== "playing") return;
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      if (currentPlayer.id !== message.playerId) return;

      const next = handlePlayCard(prev, message.playerId, message.cardIndex);
      const trickJustEnded =
        prev.tableCards.length === prev.players.length - 1 && next.tableCards.length === 0;

      if (trickJustEnded && prev.vira) {
        const lastCard = prev.players.find((p: PlayerState) => p.id === message.playerId)?.cards[
          message.cardIndex
        ];
        if (lastCard) {
          const completedCards = [...prev.tableCards, { playerId: message.playerId, card: lastCard }];
          const winIdx = getWinningCardIndex(completedCards.map((tc) => tc.card), prev.vira);
          const winnerId = completedCards[winIdx]?.playerId;
          if (winnerId) {
            // Segura a vaza visível pra todo mundo antes de aplicar o
            // avanço de turno de verdade — ninguém (nem quem jogou) vê o
            // estado avançar até o hold acabar, então não tem como
            // "jogar de novo sem querer" durante a revelação.
            const holdMs = winnerId === message.playerId ? TRICK_SELF_WIN_REVEAL_MS : TRICK_REVEAL_MS;
            this.room.broadcast(JSON.stringify({ type: "trick_result", winnerId, cards: completedCards }));
            setTimeout(async () => {
              await this.applyAndBroadcast(prev.phase, next);
              // round_end nunca acontece junto de trickJustEnded (a última
              // vaza da rodada fica visível na mesa, tableCards não zera) —
              // mas se algum dia mudar, o guard abaixo continua correto.
              if (next.phase === "round_end") this.scheduleAdvance(LAST_TRICK_REVEAL_MS + SCOREBOARD_MS);
            }, holdMs);
            return;
          }
        }
      }

      await this.applyAndBroadcast(prev.phase, next);
      if (next.phase === "round_end") this.scheduleAdvance(LAST_TRICK_REVEAL_MS + SCOREBOARD_MS);
    }
  }
}

FodinhaRoom satisfies Party.Worker;
