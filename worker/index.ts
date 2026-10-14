import { routePartykitRequest } from "partyserver";
import DobbleRoom from "../party/dobble";
import FodinhaRoom from "../party/server";
import ForcaRoom from "../party/forca";
import LudoRoom from "../party/ludo";
import UnoRoom from "../party/uno";
import { partyServer } from "./adapter";

// Entrada do Worker que hospeda TODOS os room servers (um Durable Object por jogo; cada sala é
// uma instância, nomeada pelo código na URL). As classes exportadas aqui são as que o
// wrangler.jsonc liga aos bindings — o nome do binding é o segmento da URL:
//   /parties/main/<sala>   Fodinha        /parties/ludo/<sala>    Ludo
//   /parties/dobble/<sala> Dobble         /parties/uno/<sala>     Uno
//   /parties/forca/<sala>  Forca
export const Main = partyServer(FodinhaRoom);
export const Ludo = partyServer(LudoRoom);
export const Dobble = partyServer(DobbleRoom);
export const Uno = partyServer(UnoRoom);
export const Forca = partyServer(ForcaRoom);

export default {
  async fetch(request, env) {
    // Qualquer outro caminho (inclusive a "/" que o menu usa pra saber se o servidor está de pé)
    // responde 404 — o navegador só precisa de QUALQUER resposta HTTP.
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
