"use client";

import { GROUP_COLOR, Edition, EditionId, getEdition, mortgageValue } from "@/lib/monopoly/editions";
import type { MonoPlayer, PropState } from "@/lib/monopoly/engine";
import { money } from "@/lib/monopoly/labels";
import { playerColor } from "@/lib/playerColors";

// A escritura de uma casa (o "título de propriedade"): preço, aluguéis, custo da casa e hipoteca,
// mais de quem é agora. Aparece ao tocar numa casa do tabuleiro e na hora de decidir a compra.

const COMPANY_ICON: Record<string, string> = {
  "Companhia Ferroviária": "🚂",
  "Companhia de Viação": "🚌",
  "Companhia de Táxi": "🚕",
  "Companhia de Navegação": "🚢",
  "Companhia de Aviação": "✈️",
  "Companhia de Petróleo": "🛢️",
};

/** Ícone de uma casa que não é rua (ferrovia, serviço, companhia, imposto...). */
export function squareIcon(ed: Edition, idx: number): string {
  const sq = ed.squares[idx];
  switch (sq.kind) {
    case "railroad":
      return "🚂";
    case "utility":
      return /electric|elétric/i.test(sq.name) ? "💡" : "🚰";
    case "company":
      return COMPANY_ICON[sq.name] ?? "🏢";
    case "tax":
      return "💸";
    case "bonus":
      return "💰";
    case "go":
      return "🏁";
    case "jail":
      return "🔒";
    case "parking":
      return "🅿️";
    case "gotojail":
      return "👮";
    case "card":
      return sq.deck === "chance" ? "❓" : "📦";
    default:
      return "";
  }
}

export function Deed({
  edition,
  idx,
  prop,
  players,
  className = "",
}: {
  edition: EditionId;
  idx: number;
  prop: PropState | null;
  players: MonoPlayer[];
  className?: string;
}) {
  const ed = getEdition(edition);
  const sq = ed.squares[idx];
  if (!("price" in sq)) {
    return (
      <div className={`rounded-xl bg-white p-3 text-center text-zinc-900 ${className}`}>
        <p className="text-2xl">{squareIcon(ed, idx)}</p>
        <p className="font-black">{sq.kind === "card" ? ed.deckNames[sq.deck] : sq.name}</p>
        {sq.kind === "tax" && <p className="text-sm">Pague {money(edition, sq.amount)}</p>}
        {sq.kind === "bonus" && <p className="text-sm">Receba {money(edition, sq.amount)}</p>}
        {sq.kind === "go" && <p className="text-sm">Receba {money(edition, ed.salary)} ao passar ou cair aqui</p>}
        {sq.kind === "jail" && <p className="text-sm">Preso: pague {money(edition, ed.bail)}, use a carta ou tire dupla. Só de visita? Nada acontece.</p>}
        {sq.kind === "gotojail" && <p className="text-sm">Vá direto para a prisão, sem receber o salário.</p>}
        {sq.kind === "parking" && <p className="text-sm">Descanse: nada acontece.</p>}
        {sq.kind === "card" && <p className="text-sm">Tire uma carta e obedeça.</p>}
      </div>
    );
  }
  const owner = prop?.owner ? players.find((p) => p.id === prop.owner) : undefined;
  const band = sq.kind === "street" ? GROUP_COLOR[sq.group] : "#3f3f46";
  const rows: [string, string][] = [];
  if (sq.kind === "street") {
    rows.push(["Aluguel", money(edition, sq.rent[0])]);
    rows.push(["Grupo de cor completo", money(edition, sq.rent[0] * 2)]);
    (["1 casa", "2 casas", "3 casas", "4 casas", "Hotel"] as const).forEach((label, i) => rows.push([label, money(edition, sq.rent[i + 1])]));
  } else if (sq.kind === "railroad") {
    ed.railroadRent.forEach((r, i) => rows.push([`Com ${i + 1} ${i === 0 ? "ferrovia" : "ferrovias"}`, money(edition, r)]));
  } else if (sq.kind === "company") {
    ed.companyRent.forEach((r, i) => rows.push([`Com ${i + 1} ${i === 0 ? "companhia" : "companhias"}`, money(edition, r)]));
  } else {
    ed.utilityMultiplier.forEach((m, i) => rows.push([`Com ${i + 1} ${i === 0 ? "serviço" : "serviços"}`, `${m} × os dados`]));
  }

  return (
    <div className={`overflow-hidden rounded-xl bg-white text-zinc-900 shadow-xl ${className}`} data-mono-deed={idx}>
      <div className="px-3 py-2 text-center" style={{ background: band, color: sq.kind === "street" && ["sky", "yellow"].includes(sq.group) ? "#111" : "#fff" }}>
        <p className="text-[0.6rem] font-black uppercase tracking-widest opacity-80">{sq.kind === "street" ? "Escritura" : "Título"}</p>
        <p className="text-base font-black leading-tight">
          {squareIcon(ed, idx)} {sq.name}
        </p>
      </div>
      <div className="space-y-0.5 px-3 py-2 text-xs">
        <p className="mb-1 text-center text-sm font-black">Preço {money(edition, sq.price)}</p>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-zinc-200 py-0.5 last:border-0">
            <span>{k}</span>
            <span className="font-bold tabular-nums">{v}</span>
          </div>
        ))}
        {sq.kind === "street" && (
          <p className="pt-1 text-center text-[0.7rem] text-zinc-600">
            Casa {money(edition, sq.houseCost)} · Hotel {money(edition, sq.houseCost)} + 4 casas
          </p>
        )}
        <p className="pt-0.5 text-center text-[0.7rem] text-zinc-600">Hipoteca {money(edition, mortgageValue(sq))}</p>
      </div>
      <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-1.5 text-center text-xs font-bold">
        {owner ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: playerColor(players, owner.id) }} />
            de {owner.name}
            {prop && prop.houses > 0 && <span className="text-zinc-600"> · {prop.houses === 5 ? "hotel" : `${prop.houses} ${prop.houses === 1 ? "casa" : "casas"}`}</span>}
            {prop?.mortgaged && <span className="text-red-600"> · hipotecada</span>}
          </span>
        ) : (
          <span className="text-emerald-700">Livre — à venda</span>
        )}
      </div>
    </div>
  );
}
