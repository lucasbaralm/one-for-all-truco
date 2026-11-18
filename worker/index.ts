import { routePartykitRequest } from "partyserver";
import DobbleRoom from "../party/dobble";
import FodinhaRoom from "../party/server";
import ForcaRoom from "../party/forca";
import LudoRoom from "../party/ludo";
import MimicaRoom from "../party/mimica";
import { BancoRoom, MonopolyRoom } from "../party/monopoly";
import UnoRoom from "../party/uno";
import { keepSupabaseAwake } from "../party/keepalive";
import { partyServer } from "./adapter";

// Entrada do Worker que hospeda TODOS os room servers (um Durable Object por jogo; cada sala é
// uma instância, nomeada pelo código na URL). As classes exportadas aqui são as que o
// wrangler.jsonc liga aos bindings — o nome do binding é o segmento da URL:
//   /parties/main/<sala>   Fodinha        /parties/ludo/<sala>    Ludo
//   /parties/dobble/<sala> Dobble         /parties/uno/<sala>     Uno
//   /parties/forca/<sala>  Forca         /parties/mimica/<sala> Mímica
//   /parties/monopoly/<sala> Monopoly     /parties/banco/<sala>   Banco Imobiliário
export const Main = partyServer(FodinhaRoom);
export const Ludo = partyServer(LudoRoom);
export const Dobble = partyServer(DobbleRoom);
export const Uno = partyServer(UnoRoom);
export const Forca = partyServer(ForcaRoom);
export const Mimica = partyServer(MimicaRoom);
export const Monopoly = partyServer(MonopolyRoom);
export const Banco = partyServer(BancoRoom);

export default {
  async fetch(request, env) {
    // Qualquer outro caminho (inclusive a "/" que o menu usa pra saber se o servidor está de pé)
    // responde 404 — o navegador só precisa de QUALQUER resposta HTTP.
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
  // Cron Trigger diário (wrangler.jsonc): uma leitura mínima pra o Supabase gratuito não pausar por inatividade.
  async scheduled(_controller, env) {
    await keepSupabaseAwake(env);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
