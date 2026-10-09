# Fodinha, Ludo & Dobble

Jogos de mesa multiplayer em Next.js + PartyKit + Supabase (login). Depois do login,
`/lobby` é o menu onde se escolhe o jogo:

| Jogo | Lobby | Partida |
| --- | --- | --- |
| Fodinha | `/lobby/fodinha` | `/game/[sala]` (party `main`, `party/server.ts`) |
| Ludo | `/lobby/ludo` | `/ludo/[sala]` (party `ludo`, `party/ludo.ts`) |
| Dobble (Spot It!) | `/lobby/dobble` | `/dobble/[sala]` (party `dobble`, `party/dobble.ts`) |

Ludo e Dobble têm "Contra Bots": é uma sala comum do servidor com a URL
`?bots=3&level=hard&color=red` (Ludo) ou `?bots=3&level=hard&mode=tower` (Dobble) — o dono da sala monta e
começa a partida sozinho, e o servidor joga pelos bots (como o Modo Teste da Fodinha).

## Rodando

```bash
npm run dev          # Next em :3000
npx partykit dev     # room servers (Fodinha + Ludo + Dobble) em :1999
npm test             # vitest
```

Os jogos usam o mesmo projeto PartyKit (`partykit.json` registra Ludo e Dobble em `parties`) e o
mesmo `NEXT_PUBLIC_PARTYKIT_HOST`. Cada party tem seu próprio espaço de salas, então um código
de sala de um jogo nunca colide com o de outro.

## Como é feito

Ludo e Dobble seguem o mesmo molde: regras como funções puras → controlador (permissões + o que
acontece sozinho) → room server fino → telas.

- `src/lib/<jogo>/engine.ts` — regras puras. Ludo: sair da base com 6, capturas, casas seguras,
  barreira, três 6 perdem a vez, chegada exata. Dobble: baralho de 55 cartas (plano projetivo de
  ordem 7 — duas cartas quaisquer têm UM símbolo em comum), modos Torre e Poço, castigo por erro.
- `src/lib/<jogo>/controller.ts` — aplica as ações dos jogadores com permissões (host, vez) e dirige o
  que acontece sozinho: bots, passar a vez, contagem regressiva, segurar a rodada ganha na mesa
  (como a vaza da Fodinha). Tempos em `timing.ts`.
- `party/game-room.ts` — base dos room servers: autentica pelo token do Supabase (login recusado fecha
  com 4001; Supabase inalcançável/lento fecha com 4002 depois de 3s, e a tela diz qual dos dois),
  prazo de graça no lobby, jogador caído vira "desconectado", sala vazia pausa, estado no storage do
  próprio room (nenhuma tabela nova) e resultado em `match_history` (`room_id` com prefixo `LUDO:` /
  `DOBBLE:`). `party/ludo.ts` e `party/dobble.ts` só dizem o que é específico de cada jogo.
- Dobble: o servidor nunca manda o monte nem as cartas viradas pra baixo (`toView` só tem o que está
  virado pra cima), e cada clique de símbolo leva o número da rodada pra um clique atrasado não valer.
- `src/lib/party/usePartyRoom.ts` — conexão com a sala (token, join, códigos de fechamento) usada
  pelas telas dos dois jogos; `src/components/ConnectionProblem.tsx` é o painel de "não conectou".
- `src/components/ludo/` e `src/components/dobble/` — UI: tabuleiro em SVG com peões animados casa a
  casa e dado 3D (Ludo); cartas circulares com 8 emojis, castigo, carta voando pro vencedor (Dobble);
  sons sintetizados (`src/lib/audio.ts`) e layout por container query (retrato/paisagem).

## Avisos de serviço fora do ar

O menu de jogos (`/lobby/*`) e a tela de login conferem, a cada 15s, se o PartyKit
(`NEXT_PUBLIC_PARTYKIT_HOST`) e o Supabase respondem, e mostram um aviso no topo quando algum
não responde (`src/components/ServiceStatus.tsx`). As salas fazem o mesmo quando não conseguem
conectar: o painel nomeia o serviço que caiu.

## Testes

`npm test` roda tudo (vitest, ~1s). Os testes ficam ao lado do código e cobrem as três camadas dos jogos:

| Camada | O que garante | Onde |
| --- | --- | --- |
| Regras (funções puras) | cada regra de cada jogo, inclusive os cantos (barreiras, três 6, manilhas, castigo no Dobble) | `src/lib/game`, `src/lib/ludo/engine*.test.ts`, `src/lib/dobble/engine.test.ts` |
| Propriedades e simulações | partidas INTEIRAS jogadas ao acaso (de 2 a 8 mesas) conferindo as invariantes a cada passo: cartas únicas, contas das vazas, tabuleiro válido, partida sempre termina, mesma semente = mesma partida | `simulation.test.ts`, `rules.properties.test.ts` |
| IA dos bots | prioridades (chegar em casa, capturar, fugir do perigo) e que nunca escolhem jogada ilegal | `src/lib/ludo/bot.test.ts`, `src/lib/dobble/controller.test.ts` |
| Controladores | permissões (host, vez), timers dos bots, contagem regressiva, pausa — com um relógio manual, sem esperar | `src/lib/*/controller.test.ts` |
| Room servers | integração de verdade: conexões e mensagens de mentira contra o servidor real, com um Supabase de mentira (login, restauração do banco, histórico, reconexão, expulsão) | `party/*.test.ts` (`party/test-utils.ts` é o kit) |
| Telas (sem navegador) | cartas, dado e tabuleiro renderizados no servidor: quais peças são clicáveis, o que aparece em cada estado | `src/components/**/*.test.tsx` |
| Avisos de serviço | PartyKit/Supabase fora do ar, timeouts, códigos de fechamento da conexão | `src/lib/services.test.ts`, `src/lib/party/roomRules.test.ts` |

Um novo jogo com salas herda de `GameRoom` (`party/game-room.ts`) e ganha o contrato dele testado em
`party/game-room.test.ts` (feito com um "jogo" mínimo inventado lá).

## Teste ponta a ponta

Os room servers aceitam `LUDO_SPEED` / `DOBBLE_SPEED` (dividem todas as esperas dos bots e das
animações; em produção não existem) pra partidas inteiras rodarem em minutos:
`npx partykit dev --var LUDO_SPEED=8 --var DOBBLE_SPEED=8`.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
