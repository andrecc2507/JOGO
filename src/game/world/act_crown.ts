import type { Rng } from '@core';
import { DB } from '../data';
import type { Victory } from '../battle/types';
import { node, nodeOpen, places } from './layout';
import { addRep } from './politics';
import ACTS from '../data/world/acts.json';
import { actContract, actContracts, chapterOf, ensureActs } from './acts_state';
import { giveItem, type Campaign, type Contract } from './campaign';

/**
 * Prólogo e Ato 1 (comandante do rei). No Prólogo, resolver o problema de cada senhor dá a
 * confiança inicial daquela capital. No Ato 1, a Coroa manda ordens (cumprir dá Favor e
 * equipamento; ignorar tira Favor) e a Suspeita cresce em segredo com o que o comandante
 * investiga. Na Deserção (1.8), Favor, Suspeita e lealdade decidem quem segue e quanto ouro vai junto.
 */
const CROWN = ACTS.crown;

/** Missão da história concluída: reputação do Prólogo e Suspeita do Ato 1. */
export function crownMissionDone(c: Campaign, missionId: string, nodeId: string, chapter: number): string[] {
  const out: string[] = [];
  if (chapter === 0) {
    const n = node(nodeId);
    if (n.type === 'capital' && n.countryId) {
      addRep(c, n.countryId, ACTS.prologue.capitalRep);
      out.push(`🤝 ${n.name} confia no comandante (+${ACTS.prologue.capitalRep} de reputação). Isso pesa nas alianças do Ato 4.`);
    }
  }
  const sus = (CROWN.missionSuspicion as Record<string, number>)[missionId];
  if (sus) ensureActs(c).suspicion = Math.min(100, ensureActs(c).suspicion + sus);
  return out;
}

/** Poupar rebeldes (negociar com eles) no Ato 1 aumenta a Suspeita. */
export function crownSpare(c: Campaign): void {
  if (chapterOf(c) === 1) ensureActs(c).suspicion = Math.min(100, ensureActs(c).suspicion + CROWN.spareSuspicion);
}

/** Dia do Ato 1: abre uma nova ordem da Coroa quando não há nenhuma; ordens vencidas custam Favor. */
export function crownDay(c: Campaign, day: number, rng: Rng): string[] {
  if (chapterOf(c) !== 1) return [];
  const a = ensureActs(c);
  const out: string[] = [];
  for (const ct of actContracts(c, 'ordem'))
    if (ct.expiresAt !== undefined && ct.expiresAt <= c.hours) {
      ct.status = 'done';
      ct.failed = true;
      a.favor = Math.max(0, a.favor + CROWN.orderIgnored);
      a.suspicion = Math.min(100, a.suspicion + CROWN.orderSuspicion);
      out.push(`👑 A Coroa notou a ordem ignorada (${ct.title.replace('Ordem da Coroa: ', '')}). Favor ${a.favor}.`);
    }
  if (actContracts(c, 'ordem').length || (a.lastDay.ordem ?? -99) + 30 > day) return out;
  a.lastDay.ordem = day;
  const towns = places().filter((n) => n.realm === 'reino' && n.type === 'city' && nodeOpen(n, 1));
  const t = rng.pick(towns);
  const o = rng.pick(CROWN.orders);
  const ct = actContract(c, {
    title: o.title.replace('{place}', t.name),
    desc: `${o.desc} Cumprir: +${CROWN.orderFavor} de Favor e equipamento. Ignorar: ${CROWN.orderIgnored} de Favor.`,
    victory: o.victory as Victory['type'],
    target: t.id,
    expiresAt: c.hours + 14 * 24,
    kind: 'ordem',
    ref: t.id,
  });
  out.push(`👑 Nova ordem do rei: ${ct.title.replace('Ordem da Coroa: ', '')} (14 dias).`);
  return out;
}

/** Ordem cumprida: Favor e um equipamento da armaria real. */
export function crownOrderDone(c: Campaign, ct: Contract, rng: Rng): string[] {
  const a = ensureActs(c);
  a.favor = Math.min(100, a.favor + CROWN.orderFavor);
  const gear = Object.values(DB.items).filter((it) => it.rarity === 'raro' && it.slot !== 'utility');
  const it = rng.pick(gear);
  giveItem(c.inventory, it.id);
  return [`👑 O rei está satisfeito: Favor ${a.favor}. A armaria real manda ${it.name}.`];
}

/** Deserção (1.8): quanto a Suspeita mexe no limite de lealdade de quem fica com o rei. */
export function desertionShift(c: Campaign): number {
  return (ensureActs(c).suspicion - 50) * CROWN.desertionShift;
}

/** Soldo que o comandante leva ao desertar (proporcional ao Favor). */
export function desertionGold(c: Campaign): number {
  return Math.round(ensureActs(c).favor * CROWN.favorGold);
}
