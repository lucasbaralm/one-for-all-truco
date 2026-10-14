# Fodinha, Ludo, Dobble, Uno & Forca

Jogos de mesa multiplayer em Next.js + PartyServer (Cloudflare Workers/Durable Objects) + Supabase (login). Depois do login,
`/lobby` é o menu onde se escolhe o jogo:

| Jogo | Lobby | Partida |
| --- | --- | --- |
| Fodinha | `/lobby/fodinha` | `/game/[sala]` (binding `Main`, `party/server.ts`) |
| Ludo | `/lobby/ludo` | `/ludo/[sala]` (binding `Ludo`, `party/ludo.ts`) |
| Dobble (Spot It!) | `/lobby/dobble` | `/dobble/[sala]` (binding `Dobble`, `party/dobble.ts`) |
| Uno | `/lobby/uno` | `/uno/[sala]` (binding `Uno`, `party/uno.ts`) |
| Forca | `/lobby/forca` | `/forca/[sala]` (binding `Forca`, `party/forca.ts`) |

Ludo, Dobble, Uno e Forca têm "Contra Bots": é uma sala comum do servidor com a URL
`?bots=3&level=hard&color=red` (Ludo), `?bots=3&level=hard&mode=tower` (Dobble), `?bots=3&level=hard` (Uno) ou
`?bots=3&level=hard&rounds=5` (Forca) — o dono da sala monta e começa a partida sozinho, e o servidor joga
pelos bots (como o Modo Teste da Fodinha).

## Rodando

```bash
cp .dev.vars.example .dev.vars   # uma vez: SUPABASE_URL e SUPABASE_ANON_KEY do Worker (mesmo projeto do .env.local)
npm run dev            # Next em :3000
npm run party:dev      # room servers (Fodinha + Ludo + Dobble + Uno + Forca) em :1999 — `wrangler dev`
npm test               # vitest
npm run typecheck:worker   # tipos do Worker (o `tsc` da raiz é o do navegador)
```

Os cinco jogos rodam no MESMO Worker (`worker/index.ts`, configurado em `wrangler.jsonc`): um Durable Object
por jogo, uma instância por sala. O nome do binding é o segmento da URL (`/parties/ludo/ABCD`), então o código de
sala de um jogo nunca colide com o de outro. O cliente acha o Worker por `NEXT_PUBLIC_PARTY_HOST`
(o nome antigo `NEXT_PUBLIC_PARTYKIT_HOST` ainda vale como reserva).

## Como é feito

Ludo, Dobble, Uno e Forca seguem o mesmo molde: regras como funções puras → controlador (permissões + o que
acontece sozinho) → room server fino → telas.

- `src/lib/<jogo>/engine.ts` — regras puras. Ludo: sair da base com 6, capturas, casas seguras,
  barreira, três 6 perdem a vez, chegada exata. Dobble: baralho de 55 cartas (plano projetivo de
  ordem 7 — duas cartas quaisquer têm UM símbolo em comum), modos Torre e Poço, castigo por erro. Uno: 108 cartas,
  Pular/Inverter/+2/Coringa/+4 (o +4 só sem a cor atual na mão — o servidor confere), comprar e jogar, gritar UNO e
  ser pego por quem viu. Forca: o servidor sorteia a palavra (com categoria de dica), vidas compartilhadas, a vez
  passa a cada chute, chute da palavra inteira custa 2 vidas se errar, 25 s por jogada com chute automático.
- `src/lib/<jogo>/controller.ts` — aplica as ações dos jogadores com permissões (host, vez) e dirige o
  que acontece sozinho: bots, passar a vez, contagem regressiva, segurar a rodada ganha na mesa
  (como a vaza da Fodinha). Tempos em `timing.ts`.
- `worker/` — a ÚNICA ponta que conhece o PartyServer: `adapter.ts` embrulha um servidor de sala num `Server` do
  PartyServer, `index.ts` exporta uma classe por jogo e roteia as requisições (`routePartykitRequest`). Os servidores
  de sala (`party/*.ts`) só dependem das interfaces de `party/room-types.ts`, por isso a troca PartyKit → PartyServer
  não mexeu em regra de jogo nem nos testes de integração (`party/test-utils.ts` liga as mesmas interfaces a uma
  sala de mentira).
- `party/game-room.ts` — base dos room servers: autentica pelo token do Supabase (login recusado fecha
  com 4001; Supabase inalcançável/lento fecha com 4002 depois de 3s, e a tela diz qual dos dois),
  prazo de graça no lobby, jogador caído vira "desconectado", sala vazia pausa, estado no storage do
  próprio room (nenhuma tabela nova) e resultado em `match_history` (`room_id` com prefixo `LUDO:` /
  `DOBBLE:` / `UNO:` / `FORCA:`). `party/<jogo>.ts` só diz o que é específico de cada jogo.
- Dobble: o servidor nunca manda o monte nem as cartas viradas pra baixo (`toView` só tem o que está
  virado pra cima), e cada clique de símbolo leva o número da rodada pra um clique atrasado não valer.
- Uno e Forca guardam segredo, cada um do seu jeito. **Uno**: a mão de cada jogador só vai pra ele — a base `GameRoom`
  tem `perViewer()` + `stateMessage(state, viewer)` e manda UMA mensagem por conexão (`toView(state, viewerId)`: a
  própria mão e o que dá pra jogar; dos outros só a contagem; o monte nunca sai do servidor). **Forca**: a palavra só
  existe no servidor — `toView` manda o padrão com as letras já chutadas e a palavra inteira só depois que a rodada
  acaba (a vez e o prazo usam o relógio do servidor, como no Dobble).
- `src/lib/party/usePartyRoom.ts` — conexão com a sala (token, join, códigos de fechamento) usada
  pelas telas dos dois jogos; `src/components/ConnectionProblem.tsx` é o painel de "não conectou".
- `src/components/ludo/`, `dobble/`, `uno/` e `forca/` — UI: tabuleiro em SVG com peões animados casa a
  casa e dado 3D (Ludo); cartas circulares com 8 emojis, castigo, carta voando pro vencedor (Dobble); mão em leque,
  monte, pilha com a cor valendo e seletor de cor do Coringa (Uno); forca em SVG que vai se desenhando, palavra
  que se revela, teclado A–Z (e o do computador) e barra do tempo da vez (Forca);
  sons sintetizados (`src/lib/audio.ts`) e layout por container query (retrato/paisagem).

## Feedback da partida (igual nos cinco jogos)

- **Histórico** (`src/components/feed/EventFeed.tsx`, `src/lib/feed.ts`): cada jogo transforma as mudanças do
  estado em linhas ("Zeca rolou 6", "Bia capturou uma peça sua", "Você achou 🐵 em 0,9 s", "Beto errou: apostou 1,
  fez 0 (+1 ponto 💀)") com funções puras — `diffLudo` / `diffDobble` / `diffFodinha` / `diffUno` / `diffForca` (`src/lib/*/feed.ts`).
  Em tela larga o histórico ocupa um vão fixo do layout (nunca sobrepõe nada); em qualquer tela, o botão
  do cabeçalho abre a lista completa.
- **Fim de partida** (`src/components/GameOverPanel.tsx`, `src/lib/gameResult.ts`): o texto fala com quem olha
  (venceu / ficou em Nº lugar / assistia), a própria linha fica em destaque e cada linha traz as
  estatísticas da partida (Ludo: capturas e seis; Dobble: rodadas ganhas e melhor tempo; Fodinha: acertos; Uno: cartas
  jogadas/compradas, pegadas e UNOs esquecidos; Forca: letras certas, erros e palavras completadas).
- **Vez fora da aba** (`src/lib/useTurnAlert.ts`): com a aba escondida, o título pisca "🔔 Sua vez!".
- **Som**: os cinco jogos usam o mesmo liga/desliga (`src/lib/audio.ts`).
- Ludo: dado grande no centro do tabuleiro, rastro da última jogada, prévia do caminho e peça "fantasma"
  no destino, uma barrinha de progresso por peça. Dobble: faixa de quem ganhou a rodada com o tempo de
  reação (medido no servidor), "+1" no cartão de quem ganhou, cada jogador com uma cor. Fodinha: medidor
  da soma das apostas, aviso do número bloqueado, "+N 💀" subindo no placar. Uno: quantas cartas cada um tem (com "+1"
  subindo), botão UNO!/PEGAR!. Forca: "+N" nos pontos, tecla marcada com a cor de quem chutou.

## Avisos de serviço fora do ar

O menu de jogos (`/lobby/*`) e a tela de login conferem, a cada 15s, se o servidor de jogo
(`NEXT_PUBLIC_PARTY_HOST`) e o Supabase respondem, e mostram um aviso no topo quando algum
não responde (`src/components/ServiceStatus.tsx`) — e os cartões dos jogos no menu ficam esmaecidos
com "Servidor offline" / "Supabase offline" (continuam clicáveis: o aviso pode ser falso alarme). As
salas fazem o mesmo quando não conseguem conectar: o painel nomeia o serviço que caiu.

## Testes

`npm test` roda tudo (vitest, ~1s). Os testes ficam ao lado do código e cobrem as três camadas dos jogos:

| Camada | O que garante | Onde |
| --- | --- | --- |
| Regras (funções puras) | cada regra de cada jogo, inclusive os cantos (barreiras, três 6, manilhas, castigo no Dobble, +4 só sem a cor, UNO esquecido, acento na Forca) | `src/lib/game`, `src/lib/ludo/engine*.test.ts`, `src/lib/dobble/engine.test.ts`, `src/lib/uno/engine.test.ts`, `src/lib/forca/engine.test.ts` |
| Propriedades e simulações | partidas INTEIRAS jogadas ao acaso (de 2 a 8 mesas) conferindo as invariantes a cada passo: cartas únicas, contas das vazas, tabuleiro válido, partida sempre termina, mesma semente = mesma partida | `simulation.test.ts`, `rules.properties.test.ts` |
| IA dos bots | prioridades (chegar em casa, capturar, fugir do perigo, gritar UNO, usar a lista de palavras) e que nunca escolhem jogada ilegal | `src/lib/*/bot.test.ts`, `src/lib/dobble/controller.test.ts` |
| Controladores | permissões (host, vez), timers dos bots, contagem regressiva, pausa — com um relógio manual, sem esperar | `src/lib/*/controller.test.ts` |
| Room servers | integração de verdade: conexões e mensagens de mentira contra o servidor real, com um Supabase de mentira (login, restauração do banco, histórico, reconexão, expulsão, sigilo: a mão do Uno e a palavra da Forca não chegam a quem não pode ver) | `party/*.test.ts` (`party/test-utils.ts` é o kit) |
| Telas (sem navegador) | cartas, dado, tabuleiro, histórico, fim de partida e medidor de apostas renderizados no servidor: quais peças são clicáveis, o que aparece em cada estado | `src/components/**/*.test.tsx` |
| Histórico e estatísticas | o que vira linha do histórico (rolada, captura, acerto com tempo, aposta errada…), contagens da partida no engine, textos do fim de jogo | `src/lib/*/feed.test.ts`, `engine.stats.test.ts`, `summary.test.ts` |
| Avisos de serviço | servidor de jogo/Supabase fora do ar, timeouts, códigos de fechamento da conexão | `src/lib/services.test.ts`, `src/lib/party/roomRules.test.ts` |

Um novo jogo com salas herda de `GameRoom` (`party/game-room.ts`) e ganha o contrato dele testado em
`party/game-room.test.ts` (feito com um "jogo" mínimo inventado lá).

## Teste ponta a ponta

Os room servers aceitam `LUDO_SPEED` / `DOBBLE_SPEED` / `UNO_SPEED` / `FORCA_SPEED` (dividem todas as esperas dos bots e
das animações; em produção não existem) pra partidas inteiras rodarem em minutos:
`npx wrangler dev --port 1999 --var LUDO_SPEED:8 --var DOBBLE_SPEED:8 --var UNO_SPEED:8 --var FORCA_SPEED:8`
(um Supabase de mentira também entra por aqui: `--var SUPABASE_URL:http://localhost:4010`, que vale mais que o `.dev.vars`).

## Deploy do servidor de jogo (Cloudflare)

O Next continua na Vercel; os room servers vão pra sua conta Cloudflare (o plano gratuito comporta Durable Objects
com SQLite — confira os limites atuais antes de divulgar o jogo):

```bash
npx wrangler login                              # uma vez
npx wrangler secret put SUPABASE_URL            # o mesmo valor do .env.local
npx wrangler secret put SUPABASE_ANON_KEY
npm run party:deploy                            # imprime https://fodinha-party.<subdominio>.workers.dev
```

Depois, na Vercel, defina `NEXT_PUBLIC_PARTY_HOST=fodinha-party.<subdominio>.workers.dev` (sem `https://`) e faça
um novo deploy do Next (variáveis `NEXT_PUBLIC_*` são embutidas no build). O PartyKit antigo continua de pé até
você apagá-lo, então voltar atrás é só restaurar a variável. Nada de dados a migrar: as salas são efêmeras e o
histórico fica no Supabase. Ao adicionar um jogo novo: classe em `worker/index.ts`, binding em `wrangler.jsonc` e uma
migração NOVA (`v2`...) listando a classe — nunca edite a `v1` depois do deploy.

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
