import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditionId } from "@/lib/monopoly/editions";
import { MonoState, declineProperty, forfeit, proposeTrade, toView } from "@/lib/monopoly/engine";
import { at, game, must, own, ownAll, rollBy, withCash, withPlayer } from "@/lib/monopoly/testKit";
import { ActionPanel } from "./ActionPanel";
import { AssetsDialog } from "./AssetsDialog";
import { Board } from "./Board";
import { Deed } from "./Deed";
import { DicePair } from "./Dice";
import MonopolyLobbyRoom from "./MonopolyLobbyRoom";
import { Cash, PlayerTile, PropPips } from "./PlayerTile";
import { MonopolyRulesList } from "./Rules";
import { BundleList, TradeComposer, TradeOffer } from "./TradeDialog";
import type { MonopolySession } from "./useMonopolySession";

// As telas do Monopoly renderizadas no servidor (sem navegador): o que aparece em cada estado e quais botões
// existem/estão habilitados. A lógica de "o que dá pra fazer" vem pronta do servidor em `view.me`, então aqui
// se confere que a TELA obedece a ela. (O que depende de animação e de clique é coberto pelo E2E em e2e/.)

function session(state: MonoState, me = "a", edition: EditionId = state.edition): MonopolySession {
  return {
    edition,
    view: toView(state, me),
    me,
    status: "open",
    send: vi.fn(),
    error: null,
    clearError: vi.fn(),
    emojis: [],
    sendEmoji: vi.fn(),
    feed: [],
    playAgain: vi.fn(),
  };
}

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
/** Procura um botão pelo atributo data-* e diz se está desabilitado (`disabled=""`; as classes do Tailwind `disabled:` não contam). */
const button = (markup: string, attr: string) => {
  const m = new RegExp(`<button[^>]*${attr}[^>]*>`).exec(markup);
  return m ? { found: true, disabled: /\sdisabled=""/.test(m[0]), tag: m[0] } : { found: false, disabled: false, tag: "" };
};
const count = (markup: string, needle: RegExp) => (markup.match(needle) ?? []).length;

const panel = (s: ReturnType<typeof session>) =>
  html(<ActionPanel session={s} view={s.view!} onAssets={() => {}} onTrade={() => {}} onResign={() => {}} />);

describe("tabuleiro", () => {
  const render = (state: MonoState, me = "a") => {
    const s = session(state, me);
    return html(
      <Board view={s.view!} onSquare={() => {}} tokenDelayMs={0}>
        <span>miolo</span>
      </Board>,
    );
  };

  it.each(["monopoly", "banco"] as const)("%s: 40 casas, uma peça por jogador e o miolo", (edition) => {
    const m = render(game({ edition }));
    expect(count(m, /data-mono-sq="/g)).toBe(40);
    expect(count(m, /data-mono-token="/g)).toBe(3);
    expect(m).toContain("miolo");
    expect(m).toContain(edition === "banco" ? "Av. Paulista" : "Boardwalk");
    expect(m).toContain(edition === "banco" ? "Ponto de Partida" : "Saída");
  });

  it("mostra dono, casas, hotel e hipoteca em cada casa", () => {
    let s = ownAll(game(), "b", [1, 3], { houses: 2 });
    s = own(s, 6, "a", { mortgaged: true });
    s = own(s, 39, "c", { houses: 5 });
    const m = render(s);
    expect(m).toMatch(/data-mono-sq="1"[^>]*data-owner="b"[^>]*data-houses="2"/);
    expect(m).toMatch(/data-mono-sq="6"[^>]*data-owner="a"[^>]*data-mortgaged="true"/);
    expect(m).toMatch(/data-mono-sq="39"[^>]*data-houses="5"/);
    expect(count(m, /class="mono-house"/g)).toBe(4); // 2 casas em cada uma das duas ruas
    expect(count(m, /class="mono-hotel"/g)).toBe(1);
    expect(count(m, /class="mono-mortgaged"/g)).toBe(1);
  });

  it("falido não tem peça no tabuleiro; preso aparece com o cadeado", () => {
    let s = withPlayer(at(game(), "b", 10), "b", { jail: 1 });
    expect(render(s)).toMatch(/data-mono-token="b"[^>]*data-jailed="true"/);
    s = must(forfeit(s, "c")).state;
    const m = render(s);
    expect(m).not.toContain('data-mono-token="c"');
    expect(count(m, /data-mono-token="/g)).toBe(2);
  });

  it("destaca a casa onde se decide a compra (e a do leilão)", () => {
    const buying = must(rollBy(game(), "a", 6)).state;
    expect(render(buying)).toMatch(/data-mono-sq="6"[^>]*data-active="true"/);
    const auction = must(declineProperty(buying, "a")).state;
    expect(render(auction)).toMatch(/data-mono-sq="6"[^>]*data-active="true"/);
    expect(render(game())).not.toContain('data-active="true"');
  });

  it("cada casa de carta mostra o nome do baralho da edição", () => {
    expect(render(game())).toContain("Caixa Comunitária");
    expect(render(game({ edition: "banco" }))).toContain("Sorte ou Revés");
    expect(render(game({ edition: "banco" }))).not.toContain("Caixa Comunitária");
  });
});

describe("escritura", () => {
  const deed = (edition: EditionId, idx: number, state = game({ edition })) => html(<Deed edition={edition} idx={idx} prop={state.props[idx]} players={state.players} />);

  it("rua: preço, aluguel por casa, custo da casa e hipoteca", () => {
    const m = deed("monopoly", 39);
    expect(m).toContain("Boardwalk");
    expect(m).toContain("Preço $400");
    expect(m).toContain("$2.000"); // hotel
    expect(m).toContain("Hipoteca $200");
    expect(m).toContain("Livre — à venda");
    expect(deed("banco", 39)).toContain("Brooklin");
    expect(deed("banco", 39)).toContain("Preço R$ 400");
  });

  it("ferrovia, serviço e companhia têm a própria tabela", () => {
    expect(deed("monopoly", 5)).toContain("Com 4 ferrovias");
    expect(deed("monopoly", 12)).toContain("10 × os dados");
    expect(deed("banco", 5)).toContain("Com 6 companhias");
    expect(deed("banco", 5)).toContain("R$ 400");
  });

  it("diz de quem é, com construção e hipoteca", () => {
    const s = own(game(), 39, "b", { houses: 3 });
    expect(deed("monopoly", 39, s)).toContain("de B");
    expect(deed("monopoly", 39, s)).toContain("3 casas");
    expect(deed("monopoly", 39, own(game(), 39, "b", { mortgaged: true }))).toContain("hipotecada");
  });

  it("casas sem dono (imposto, prisão, cartas...) explicam o que acontece", () => {
    expect(deed("monopoly", 4)).toContain("Pague $200");
    expect(deed("banco", 38)).toContain("Receba R$ 100");
    expect(deed("monopoly", 10)).toContain("pague $50");
    expect(deed("monopoly", 30)).toContain("sem receber o salário");
    expect(deed("banco", 7)).toContain("Sorte ou Revés");
  });
});

describe("cartão do jogador", () => {
  const tile = (s: MonoState, id: string, me = "a") => {
    const v = toView(s, me);
    const idx = v.players.findIndex((p) => p.id === id);
    return html(<PlayerTile view={v} player={v.players[idx]} seat={idx} isMe={id === me} emojis={[]} onOpen={() => {}} />);
  };

  it("mostra o dinheiro, o patrimônio e uma pastilha por propriedade", () => {
    let s = own(own(game(), 1, "a"), 5, "a", { mortgaged: true });
    s = withCash(s, "a", 1234);
    const m = tile(s, "a");
    expect(m).toContain("$1.234");
    expect(m).toContain("(você)");
    expect(count(m, /data-mono-pip="/g)).toBe(2);
    expect(m).toContain('data-mono-cash-value="1234"');
  });

  it("estados: vez, preso, falido, desconectado, bot com nível", () => {
    let s = game();
    expect(tile(s, "a")).toContain('data-turn="true"');
    expect(tile(s, "b")).toContain('data-turn="false"');
    s = withPlayer(s, "b", { jail: 0, jailCards: [{ deck: "chance", idx: 7 }] });
    expect(tile(s, "b")).toContain("preso");
    expect(tile(s, "b")).toContain("1 carta de saída");
    s = withPlayer(s, "c", { connected: false });
    expect(tile(s, "c")).toContain("desconectado");
    s = must(forfeit(s, "c")).state;
    expect(tile(s, "c")).toContain('data-bankrupt="true"');
    expect(tile(s, "c")).not.toContain("data-mono-cash-value");
    s = { ...game(), players: game().players.map((p) => (p.id === "b" ? { ...p, bot: "hard" as const } : p)) };
    expect(tile(s, "b")).toContain("Bot Difícil");
  });

  it("Cash e PropPips isolados", () => {
    expect(html(<Cash value={50} edition="banco" />)).toContain("R$ 50");
    const v = toView(game(), "a");
    expect(html(<PropPips view={v} ownerId="a" />)).toContain("sem propriedades");
  });
});

describe("painel de ações", () => {
  it("antes de rolar: o botão de rolar só existe pra quem tem a vez", () => {
    const m = panel(session(game(), "a"));
    expect(button(m, "data-mono-roll")).toMatchObject({ found: true, disabled: false });
    expect(m).toContain("Sua vez!");
    const other = panel(session(game(), "b"));
    expect(other).not.toContain("data-mono-roll");
    expect(other).toContain("Vez de A");
    expect(other).toContain("vai rolar os dados");
  });

  it("dupla: avisa pra jogar de novo", () => {
    const s = { ...game(), doubles: 1 };
    expect(panel(session(s, "a"))).toContain("Dobrou!");
    expect(panel(session(s, "b"))).toContain("dobrou os dados");
  });

  it("preso: tentar dupla, fiança e carta (habilitadas só quando dá)", () => {
    let s = withPlayer(at(game(), "a", 10), "a", { jail: 1 });
    let m = panel(session(s, "a"));
    expect(m).toContain("tentativa 2/3");
    expect(m).toContain("Tentar tirar dupla");
    expect(button(m, "data-mono-bail").disabled).toBe(false);
    expect(button(m, "data-mono-jailcard").disabled).toBe(true);
    s = withPlayer(withCash(s, "a", 10), "a", { jailCards: [{ deck: "chest", idx: 4 }] });
    m = panel(session(s, "a"));
    expect(button(m, "data-mono-bail").disabled).toBe(true);
    expect(button(m, "data-mono-jailcard").disabled).toBe(false);
  });

  it("comprar: Monopoly oferece 'Leilão'; Banco Imobiliário, 'Não comprar'; sem dinheiro desabilita comprar", () => {
    const mono = must(rollBy(game(), "a", 6)).state;
    let m = panel(session(mono, "a"));
    expect(button(m, "data-mono-buy").disabled).toBe(false);
    expect(m).toContain("Comprar $100");
    expect(m).toMatch(/data-mono-decline[^>]*>[^<]*Leilão/);
    expect(m).toContain("vai a leilão");
    const br = must(rollBy(game({ edition: "banco" }), "a", 6)).state;
    m = panel(session(br, "a"));
    expect(m).toMatch(/data-mono-decline[^>]*>[^<]*Não comprar/);
    expect(m).toContain("Comprar R$ 100");
    expect(m).not.toContain("vai a leilão");
    m = panel(session(withCash(mono, "a", 10), "a"));
    expect(button(m, "data-mono-buy").disabled).toBe(true);
    expect(m).toContain("Dinheiro insuficiente");
    // quem espera vê o que está sendo decidido, sem botões
    const wait = panel(session(mono, "b"));
    expect(wait).not.toContain("data-mono-buy");
    expect(wait).toContain("Oriental Avenue");
  });

  it("os botões de comprar/recusar vêm ANTES da escritura (nunca abaixo da dobra em tela pequena)", () => {
    const m = panel(session(must(rollBy(game(), "a", 6)).state, "a"));
    expect(m.indexOf("data-mono-buy")).toBeLessThan(m.indexOf("data-mono-deed"));
  });

  it("fase livre: encerrar a vez; com troca pendente fica desabilitado", () => {
    const s = { ...own(game(), 1, "a"), step: "manage" as const };
    expect(button(panel(session(s, "a")), "data-mono-end")).toMatchObject({ found: true, disabled: false });
    const pending = must(proposeTrade(s, "a", { to: "b", give: { props: [1] } })).state;
    const m = panel(session(pending, "a"));
    expect(button(m, "data-mono-end").disabled).toBe(true);
    expect(m).toContain("Espere a resposta da troca");
    expect(m).toContain("data-mono-trade-waiting");
    expect(button(m, "data-mono-open-trade").disabled).toBe(true);
    expect(panel(session(s, "b"))).not.toContain("data-mono-end");
  });

  it("dívida: mostra quanto deve, a quem, e só deixa pagar quando tem o dinheiro", () => {
    let s = withCash(at(game(), "a", 1), "a", 100);
    s = must(rollBy(s, "a", 3)).state; // imposto de renda $200
    const m = panel(session(s, "a"));
    expect(m).toContain("Você deve $200 a o banco");
    expect(button(m, "data-mono-pay-debt").disabled).toBe(true);
    expect(m).toContain("faltam $100");
    expect(m).toContain("data-mono-bankrupt");
    expect(m).toContain("data-mono-open-assets");
    const ok = panel(session(withCash(s, "a", 500), "a"));
    expect(button(ok, "data-mono-pay-debt").disabled).toBe(false);
    expect(panel(session(s, "b"))).toContain("está sem dinheiro pra pagar $200");
  });

  it("leilão: quem tem a vez de lançar vê lances e 'passar'; os outros só acompanham", () => {
    const s = must(declineProperty(must(rollBy(game(), "a", 6)).state, "a")).state;
    const bidder = s.auction!.bidder;
    const other = ["a", "b", "c"].find((id) => id !== bidder)!;
    const m = panel(session(s, bidder));
    expect(m).toContain("Leilão: Oriental Avenue");
    expect(m).toContain("data-mono-pass");
    expect(m).toContain("data-mono-bid-input");
    expect(count(m, /data-mono-bid="/g)).toBe(3);
    expect(m).toContain("Ninguém deu lance ainda");
    const watching = panel(session(s, other));
    expect(watching).not.toContain("data-mono-pass");
    expect(watching).toContain("dar lance");
    // o botão +10/+50/+100 sobe a partir do maior lance
    const raised = { ...s, auction: { ...s.auction!, bid: 70, leader: other } };
    expect(panel(session(raised, bidder))).toContain('data-mono-bid="80"');
    expect(panel(session(raised, bidder))).toContain("Maior lance");
  });

  it("quem só assiste, ou já faliu, não recebe nenhum botão de jogada", () => {
    expect(panel(session(game(), "zzz"))).toContain("assistindo");
    const out = must(forfeit(game(), "b")).state;
    const m = panel(session(out, "b"));
    expect(m).toContain("Você faliu");
    for (const k of ["data-mono-roll", "data-mono-end", "data-mono-open-trade", "data-mono-resign"]) expect(m).not.toContain(k);
  });

  it("mostra a rodada e o limite", () => {
    expect(panel(session(game(), "a"))).toContain("Rodada 1");
    expect(panel(session(game({ limit: 20 }), "a"))).toContain("Rodada 1/20");
  });
});

describe("propriedades (construir / hipotecar)", () => {
  const dialog = (s: MonoState, me: string, whose = me) => {
    const sess = session(s, me);
    return html(<AssetsDialog session={sess} view={sess.view!} playerId={whose} onClose={() => {}} />);
  };

  it("com o grupo inteiro: construir habilitado (com o custo); com 1 rua só: desabilitado e com o motivo", () => {
    const full = { ...ownAll(game(), "a", [1, 3]), step: "manage" as const };
    let m = dialog(full, "a");
    expect(button(m, 'data-mono-build="1"')).toMatchObject({ found: true, disabled: false });
    expect(m).toContain("grupo completo");
    expect(button(m, 'data-mono-mortgage="1"').disabled).toBe(false);
    const half = { ...own(game(), 1, "a"), step: "manage" as const };
    m = dialog(half, "a");
    expect(button(m, 'data-mono-build="1"').disabled).toBe(true);
    expect(button(m, 'data-mono-build="1"').tag).toContain("todas as ruas da cor");
  });

  it("construir parelho: a 2ª casa na mesma rua fica desabilitada; vender começa pela mais construída", () => {
    let s: MonoState = { ...ownAll(game(), "a", [1, 3]), step: "manage" };
    s = own(s, 1, "a", { houses: 1 });
    const m = dialog(s, "a");
    expect(button(m, 'data-mono-build="1"').disabled).toBe(true);
    expect(button(m, 'data-mono-build="1"').tag).toContain("parelho");
    expect(button(m, 'data-mono-build="3"').disabled).toBe(false);
    expect(button(m, 'data-mono-sell="1"').disabled).toBe(false);
    expect(button(m, 'data-mono-sell="3"').disabled).toBe(true);
    // com casa no grupo não hipoteca
    expect(button(m, 'data-mono-mortgage="1"').disabled).toBe(true);
    expect(button(m, 'data-mono-mortgage="1"').tag).toContain("Venda as construções");
  });

  it("hipotecada mostra o valor recebido e o botão de tirar a hipoteca com o custo", () => {
    const s = { ...own(game(), 6, "a", { mortgaged: true }), step: "manage" as const };
    const m = dialog(s, "a");
    expect(m).toContain("hipotecada (recebeu $50)");
    expect(button(m, 'data-mono-unmortgage="6"')).toMatchObject({ found: true, disabled: false });
    expect(m).toContain("−$55");
  });

  it("fora da minha vez: tudo desabilitado; nas propriedades de outro, nenhum botão", () => {
    const s = ownAll(game(), "b", [1, 3]);
    expect(button(dialog(s, "a", "b"), "data-mono-build")).toMatchObject({ found: false });
    expect(dialog(s, "a", "b")).toContain("Propriedades de B");
    const mine = { ...ownAll(game(), "b", [1, 3]), step: "manage" as const };
    const m = dialog(mine, "b"); // b não tem a vez
    expect(button(m, 'data-mono-build="1"').disabled).toBe(true);
  });

  it("mostra o estoque do banco e o patrimônio", () => {
    const s = own(game(), 6, "a", { houses: 0 });
    const m = dialog(s, "a");
    expect(m).toContain("Banco: 32 casas · 12 hotéis");
    expect(m).toContain("patrimônio $1.600");
  });
});

describe("trocas", () => {
  it("o compositor: escolher com quem, e o que cada lado oferece", () => {
    const s = { ...own(own(game(), 1, "a"), 6, "b"), step: "manage" as const };
    const sess = session(s, "a");
    const m = html(<TradeComposer session={sess} view={sess.view!} onClose={() => {}} />);
    expect(m).toContain("Propor uma troca");
    expect(m).toContain('data-mono-trade-to="b"');
    expect(m).toContain('data-mono-trade-to="c"');
    expect(m).toContain("Escolha com quem trocar");
    expect(button(m, "data-mono-trade-send").disabled).toBe(true);
    // com um só adversário já vem selecionado: aparecem as duas colunas
    const duo = { ...s, players: s.players.filter((p) => p.id !== "c") };
    const sess2 = session(duo, "a");
    const m2 = html(<TradeComposer session={sess2} view={sess2.view!} onClose={() => {}} />);
    expect(m2).toContain('data-mono-trade-side="give"');
    expect(m2).toContain('data-mono-trade-side="take"');
    expect(m2).toContain('data-mono-trade-prop="give-1"');
    expect(m2).toContain('data-mono-trade-prop="take-6"');
  });

  it("propriedade com construção no grupo aparece bloqueada", () => {
    const s = { ...ownAll(game(), "a", [1, 3], { houses: 1 }), step: "manage" as const };
    const duo = { ...s, players: s.players.filter((p) => p.id !== "c") };
    const sess = session(duo, "a");
    const m = html(<TradeComposer session={sess} view={sess.view!} onClose={() => {}} />);
    expect(button(m, 'data-mono-trade-prop="give-1"').disabled).toBe(true);
    expect(button(m, 'data-mono-trade-prop="give-1"').tag).toContain("venda as casas");
  });

  it("a proposta recebida mostra o que entra e o que sai, e bloqueia aceitar sem o dinheiro", () => {
    const s = { ...own(own(game(), 1, "a"), 6, "b"), step: "manage" as const };
    const offered = must(proposeTrade(s, "a", { to: "b", give: { props: [1], cash: 20 }, take: { props: [6] } })).state;
    const sess = session(offered, "b");
    const m = html(<TradeOffer session={sess} view={sess.view!} />);
    expect(m).toContain("A propõe uma troca");
    expect(m).toContain("Você recebe");
    expect(m).toContain("Mediterranean Avenue");
    expect(m).toContain("$20");
    expect(m).toContain("Oriental Avenue");
    expect(button(m, "data-mono-trade-accept").disabled).toBe(false);
    expect(html(<TradeOffer session={session(offered, "c")} view={session(offered, "c").view!} />)).toBe("");
    // pedindo $300 do Bruno, que depois gastou o dinheiro: aceitar fica desabilitado com o aviso
    const askCash = must(proposeTrade({ ...s, step: "manage" }, "a", { to: "b", take: { cash: 300 } })).state;
    const poor = session(withCash(askCash, "b", 100), "b");
    const mp = html(<TradeOffer session={poor} view={poor.view!} />);
    expect(button(mp, "data-mono-trade-accept").disabled).toBe(true);
    expect(mp).toContain("não tem esse dinheiro");
  });

  it("BundleList descreve dinheiro, propriedades e cartas", () => {
    const v = toView(own(game(), 6, "a", { mortgaged: true }), "a");
    const m = html(<BundleList view={v} bundle={{ cash: 100, props: [6], jailCards: 2 }} />);
    expect(m).toContain("$100");
    expect(m).toContain("Oriental Avenue");
    expect(m).toContain("(hipotecada)");
    expect(m).toContain("2 cartas de saída da prisão");
    expect(html(<BundleList view={v} bundle={{ cash: 0, props: [], jailCards: 0 }} />)).toContain("nada");
  });
});

describe("lobby da sala", () => {
  const lobby = (me: string, edition: EditionId = "monopoly") => {
    let s = { ...game({ edition }), phase: "lobby" as const };
    s = { ...s, hostId: "a" };
    const sess = session(s, me);
    return html(<MonopolyLobbyRoom session={sess} roomId="ABCD" onExit={() => {}} />);
  };

  it("o host vê Iniciar, Adicionar bot e a duração editável; o convidado só espera", () => {
    const host = lobby("a");
    expect(host).toContain("ABCD");
    expect(host).toContain("data-mono-start");
    expect(host).toContain("data-mono-add-bot");
    expect(button(host, 'data-mono-limit="20"').disabled).toBe(false);
    const guest = lobby("b");
    expect(guest).not.toContain("data-mono-start");
    expect(guest).not.toContain("data-mono-add-bot");
    expect(guest).toContain("Aguardando o host");
    expect(button(guest, 'data-mono-limit="20"').disabled).toBe(true);
    expect(guest).toContain("Só o host muda isso");
  });

  it("cada edição mostra o próprio dinheiro inicial e título", () => {
    expect(lobby("a", "monopoly")).toContain("$1.500");
    expect(lobby("a", "banco")).toContain("R$ 2.500");
    expect(lobby("a", "banco")).toContain("Banco Imobiliário");
  });

  it("três jogadores, cada um com a sua ficha", () => {
    const m = lobby("a");
    expect(count(m, /data-mono-lobby-player="/g)).toBe(3);
    expect(m).toContain("🎩");
    expect(lobby("a", "banco")).toContain("🛵");
  });
});

describe("regras e dados", () => {
  it("as regras mudam com a edição (leilão × sem leilão, cartas, transportes)", () => {
    const mono = html(<MonopolyRulesList edition="monopoly" />);
    const br = html(<MonopolyRulesList edition="banco" />);
    expect(mono).toContain("LEILÃO");
    expect(mono).toContain("Caixa Comunitária");
    expect(mono).toContain("Ferrovias e serviços");
    expect(br).toContain("não tem leilão");
    expect(br).toContain("Sorte ou Revés");
    expect(br).toContain("6 companhias");
    expect(br).toContain("Habeas Corpus");
    expect(br).toContain("R$ 2.500");
  });

  it("os dados mostram o resultado final", () => {
    const m = html(<DicePair dice={[3, 4]} rollKey={1} animate={false} />);
    expect(m).toContain('data-mono-dice="3+4"');
    expect(m).toContain('data-mono-die="3"');
    expect(m).toContain('data-mono-die="4"');
    expect(html(<DicePair dice={null} rollKey={0} animate={false} />)).toContain('data-mono-dice=""');
  });
});
