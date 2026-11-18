"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";
import { getEdition } from "@/lib/monopoly/editions";
import type { EditionId } from "@/lib/monopoly/editions";
import { money } from "@/lib/monopoly/labels";
import { EDITION_UI } from "./edition-ui";

function rulesFor(edition: EditionId): { icon: string; title: string; text: string }[] {
  const ed = getEdition(edition);
  const m = (n: number) => money(edition, n);
  const isBR = edition === "banco";
  return [
    { icon: "🎯", title: "O objetivo", text: "Compre propriedades, cobre aluguel dos outros e leve todo mundo à falência. O último que sobrar vence — ou, numa partida com limite de rodadas, quem tiver o maior patrimônio (dinheiro + propriedades + construções) no fim." },
    { icon: "🎲", title: "Sua vez", text: `Role os dois dados e ande a soma. Passar (ou cair) na ${ed.words.go} paga ${m(ed.salary)}. Tirou dupla? Joga de novo — mas a terceira dupla seguida manda direto pra ${ed.words.jail.toLowerCase()}. Cada um começa com ${m(ed.startCash)}.` },
    {
      icon: "🏠",
      title: "Casa livre",
      text: isBR
        ? "Caiu numa rua ou companhia sem dono? Compre pelo preço. Se não comprar, ela só continua livre — não tem leilão no Banco Imobiliário."
        : "Caiu numa rua, ferrovia ou companhia sem dono? Compre pelo preço. Se recusar, ela vai a LEILÃO: todos podem dar lances, o maior leva.",
    },
    { icon: "💸", title: "Aluguel", text: "Caiu numa propriedade de outro jogador? Pague o aluguel. Quem tem o grupo de cor inteiro e nenhuma casa cobra o dobro; com casas e hotel cobra a tabela da escritura (toque numa casa do tabuleiro pra ver). Hipotecada não cobra." },
    {
      icon: isBR ? "🚂" : "🚂",
      title: isBR ? "Companhias" : "Ferrovias e serviços",
      text: isBR
        ? `São 6 companhias: o aluguel cresce com quantas o dono tem (${ed.companyRent.map((r) => m(r)).join(", ")}).`
        : `Ferrovia: ${ed.railroadRent.map((r) => m(r)).join(", ")} conforme quantas o dono tem. Serviços (luz e água): 4× os dados com um, 10× com os dois.`,
    },
    { icon: "🏘️", title: "Construir", text: "Com TODAS as ruas de uma cor (e nenhuma hipotecada) você constrói, uma casa por vez e sempre parelho. 4 casas viram um hotel. O banco só tem 32 casas e 12 hotéis — acabou, acabou." },
    { icon: "🏦", title: "Hipoteca", text: `Precisa de dinheiro? Hipoteque (metade do preço, sem casas no grupo) ou venda casas por metade do custo. Tirar a hipoteca custa o valor + 10%.` },
    {
      icon: isBR ? "🍀" : "🃏",
      title: isBR ? "Sorte ou Revés" : "Sorte e Caixa Comunitária",
      text: isBR ? "Casas de carta: tire uma e obedeça — pode ser prêmio, multa, viagem até outra casa ou a prisão. O Habeas Corpus você guarda pra sair da prisão." : "Casas de carta: tire uma e obedeça — prêmio, multa, viagem até outra casa ou prisão. A de 'Saia livre da prisão' você guarda até precisar.",
    },
    { icon: "🔒", title: ed.words.jail, text: `Pra sair: tire dupla (3 tentativas), pague ${m(ed.bail)} ou use a carta. Na terceira tentativa sem dupla você paga e anda. Preso, você ainda cobra aluguel e pode construir.` },
    { icon: "🤝", title: "Trocas", text: "Na sua vez você propõe a outra pessoa dinheiro, propriedades e cartas de saída da prisão nos dois sentidos. Ela aceita ou recusa. Propriedade com casa no grupo não entra: venda as casas antes." },
    { icon: "💀", title: "Falência", text: "Não tem como pagar? Venda casas e hipoteque. Sem saída, declare falência: tudo vai pra quem você devia (ou pro banco). Também dá pra desistir a qualquer hora." },
    { icon: "🤖", title: "Bots", text: "Os fáceis compram ao acaso e constroem pouco; os difíceis valorizam completar grupos de cor, constroem rápido e dão lances agressivos." },
  ];
}

export function MonopolyRulesList({ edition }: { edition: EditionId }) {
  return (
    <ul className="space-y-3" data-mono-rules={edition}>
      {rulesFor(edition).map((r) => (
        <li key={r.title} className="flex gap-3">
          <span className="text-2xl leading-none">{r.icon}</span>
          <div>
            <p className="font-bold text-white">{r.title}</p>
            <p className="text-sm text-zinc-400">{r.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MonopolyRulesDialog({ edition, onClose }: { edition: EditionId; onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">Como jogar {EDITION_UI[edition].title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <MonopolyRulesList edition={edition} />
      </motion.div>
    </motion.div>
  );
}
