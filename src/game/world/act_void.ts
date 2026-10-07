import type { BattleUnit } from '../battle/types';
import type { Attr } from '../data';
import type { Character } from '../rules/character';
import { edgeLength, node, shortestPath } from './layout';
import { addInfluence, addRep } from './politics';
import { setFlag } from './story';
import ACTS from '../data/world/acts.json';
import { chapterOf, ensureActs } from './acts_state';
import { TRAVEL_SPEED, members, type Campaign, type Squad } from './campaign';

/**
 * Ato 5 (o outro mundo). Nas capitais e na Citadela há travessias para o mundo invertido: lá as
 * lojas não existem, as batalhas são do Vazio e cada dia soma corrupção a quem está no esquadrão.
 * Pouca corrupção dá um Dom sombrio (mira e crítico); muita dá mutações que ficam para sempre.
 * O santuário da base limpa a corrupção, não as mutações. Depois da Queda do Muro (5.5), os
 * sobreviventes de Aurélia viajam numa caravana lenta até a base — e só andam com escolta.
 */
const VO = ACTS.void;
export const MUTATIONS = VO.mutations as { id: string; label: string; attr: Attr; delta: number }[];

export function inVoid(c: Campaign, s: Squad): boolean {
  return ensureActs(c).inVoid.includes(s.id);
}

/** Lugares com travessia (Ato 5 em diante). */
export function canCross(c: Campaign, s: Squad): boolean {
  const n = node(s.at);
  return chapterOf(c) >= 5 && !s.to && (n.type === 'capital' || n.type === 'citadel');
}

export function crossVoid(c: Campaign, s: Squad): boolean {
  if (!canCross(c, s)) return false;
  const a = ensureActs(c);
  a.inVoid = a.inVoid.includes(s.id) ? a.inVoid.filter((id) => id !== s.id) : [...a.inVoid, s.id];
  return true;
}

export function corruption(c: Campaign, ch: Character): number {
  return ensureActs(c).corruption[ch.id] ?? 0;
}

/** Um dia no Vazio: corrupção sobe; ao cruzar os limites, uma mutação permanente. */
export function voidDay(c: Campaign, rngPick: <T>(a: readonly T[]) => T): string[] {
  const a = ensureActs(c);
  const out: string[] = [];
  for (const s of c.squads) {
    if (!a.inVoid.includes(s.id)) continue;
    for (const ch of members(c, s)) {
      const before = a.corruption[ch.id] ?? 0;
      const after = Math.min(100, before + VO.corruptionPerDay);
      a.corruption[ch.id] = after;
      if (before < VO.darkGiftAt && after >= VO.darkGiftAt) out.push(`🌑 ${ch.name} recebeu o Dom sombrio (+mira, +crítico).`);
      for (const at of VO.mutationAt)
        if (before < at && after >= at) {
          const have = a.mutations[ch.id] ?? [];
          const pool = MUTATIONS.filter((m) => !have.includes(m.id));
          if (!pool.length) continue;
          const m = rngPick(pool);
          a.mutations[ch.id] = [...have, m.id];
          ch.attrs[m.attr] = Math.max(1, ch.attrs[m.attr] + m.delta);
          out.push(`🧬 ${ch.name} sofreu uma mutação permanente: ${m.label} (${m.attr.toUpperCase()} ${m.delta}).`);
        }
    }
  }
  return out;
}

/** Dom sombrio em batalha. */
export function voidUnitMods(c: Campaign, ch: Character, u: BattleUnit): void {
  if (corruption(c, ch) >= VO.darkGiftAt) {
    u.crit += VO.darkGiftCrit;
    u.accuracy += VO.darkGiftAccuracy;
  }
}

/** Santuário da base: limpa a corrupção (as mutações ficam). */
export function cleanseBlock(c: Campaign, ch: Character): string | null {
  if (!c.base?.facilities.includes('santuario')) return 'Precisa do Santuário na base.';
  if (!corruption(c, ch)) return 'Sem corrupção.';
  if (c.gold < VO.cleanseGold) return `Custa ${VO.cleanseGold} ouro.`;
  return null;
}

export function cleanse(c: Campaign, ch: Character): boolean {
  if (cleanseBlock(c, ch)) return false;
  c.gold -= VO.cleanseGold;
  ensureActs(c).corruption[ch.id] = 0;
  return true;
}

// ───────────────────────────── caravana ─────────────────────────────

export function startCaravan(c: Campaign): string {
  const a = ensureActs(c);
  if (a.caravan) return '';
  const from = VO.caravan.from;
  a.caravan = { at: from, route: shortestPath(from, c.baseNode), progress: 0, survivors: VO.caravan.survivors };
  return `🛒 ${VO.caravan.survivors} sobreviventes partem de ${node(from).name} rumo à base. Sem escolta, a caravana para e perde gente.`;
}

/** Posição da caravana para o mapa. */
export function caravanPosition(c: Campaign): { x: number; y: number } | null {
  const cv = c.acts?.caravan;
  if (!cv || cv.done) return null;
  const a = node(cv.at);
  const b = cv.route[0] ? node(cv.route[0]) : a;
  return { x: a.x + (b.x - a.x) * cv.progress, y: a.y + (b.y - a.y) * cv.progress };
}

/** Um dia da caravana: anda se houver esquadrão junto; senão para e perde sobreviventes. */
export function caravanDay(c: Campaign): string[] {
  const cv = ensureActs(c).caravan;
  if (!cv || cv.done) return [];
  const escorted = c.squads.some((s) => s.memberIds.length && (s.at === cv.at || s.to === cv.at || s.at === cv.route[0]));
  if (!escorted) {
    const lost = Math.max(1, Math.round(cv.survivors * VO.caravan.lossPerDay));
    cv.survivors = Math.max(0, cv.survivors - lost);
    if (!cv.survivors) {
      cv.done = true;
      return ['☠ A caravana de sobreviventes se perdeu sem escolta.'];
    }
    return [`🛒 Caravana sem escolta: ${lost} sobreviventes se perderam (${cv.survivors} restam).`];
  }
  let budget = 24 * TRAVEL_SPEED * VO.caravan.speed;
  while (budget > 0 && cv.route.length) {
    const next = cv.route[0]!;
    const len = Math.max(1, edgeLength(cv.at, next));
    const left = (1 - cv.progress) * len;
    if (budget >= left) {
      budget -= left;
      cv.at = next;
      cv.route.shift();
      cv.progress = 0;
    } else {
      cv.progress += budget / len;
      budget = 0;
    }
  }
  if (!cv.route.length) {
    cv.done = true;
    addRep(c, 'povo', VO.caravan.reachRep);
    addInfluence(c, Math.round(cv.survivors / 10));
    setFlag(c, 'sobreviventes_salvos');
    return [`🛒 A caravana chegou à base com ${cv.survivors} sobreviventes. O povo não esquece (+${VO.caravan.reachRep} de reputação).`];
  }
  return [];
}
