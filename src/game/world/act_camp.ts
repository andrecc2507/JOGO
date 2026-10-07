import type { Rng } from '@core';
import { node, places } from './layout';
import { DISTANT, type Region } from './regions';
import ACTS from '../data/world/acts.json';
import { chapterOf, ensureActs } from './acts_state';
import type { Campaign, Squad } from './campaign';

/**
 * Ato 6 (expedição). No continente Além-Brumas não há base: o comandante monta um acampamento de
 * expedição numa vila do continente (descanso, comida e cura como na base) e pode mudá-lo de
 * lugar. Os mundos sobrepostos fazem algumas terras trocarem de bioma toda semana, e uma parte
 * delas fecha a passagem até a próxima mudança.
 */
const CAMP = ACTS.camp;

export function campBlock(c: Campaign, s: Squad): string | null {
  const n = node(s.at);
  if (chapterOf(c) < 6) return 'O acampamento de expedição chega no Ato 6.';
  if (s.to || n.realm !== 'continente' || n.type !== 'village') return 'Só numa vila do continente, com o esquadrão parado.';
  if (ensureActs(c).camp === s.at) return 'O acampamento já está aqui.';
  if (ensureActs(c).camp && c.gold < CAMP.moveGold) return `Mudar o acampamento custa ${CAMP.moveGold} ouro.`;
  return null;
}

export function setCamp(c: Campaign, s: Squad): boolean {
  if (campBlock(c, s)) return false;
  const a = ensureActs(c);
  if (a.camp) c.gold -= CAMP.moveGold;
  a.camp = s.at;
  return true;
}

/** O esquadrão está no acampamento (conta como base para comer, descansar e curar). */
export function atCamp(c: Campaign, nodeId: string): boolean {
  return !!c.acts?.camp && c.acts.camp === nodeId;
}

/** Semana dos mundos sobrepostos: terras do continente trocam de bioma; algumas fecham. */
export function shiftDay(c: Campaign, day: number, rng: Rng): string[] {
  if (chapterOf(c) < 6) return [];
  const a = ensureActs(c);
  if ((a.lastDay.shift ?? -99) + CAMP.shiftEveryDays > day) return [];
  a.lastDay.shift = day;
  a.shifted = {};
  a.closed = [];
  const land = places().filter((n) => n.realm === 'continente' && n.id !== 'continente_porto' && n.id !== a.camp);
  const regions = Object.keys(DISTANT).filter((r) => r !== 'arquipelago');
  const out: string[] = [];
  for (let i = 0; i < CAMP.shiftCount && land.length; i++) {
    const n = land.splice(rng.int(0, land.length - 1), 1)[0]!;
    const r = rng.pick(regions.filter((x) => x !== n.region));
    a.shifted[n.id] = r;
    const closed = rng.chance(CAMP.closeChance);
    if (closed) a.closed.push(n.id);
    out.push(`🌫 Os mundos se sobrepõem: ${n.name} virou ${(DISTANT as Record<string, { label: string }>)[r]?.label ?? r}${closed ? ' e a passagem fechou por uma semana' : ''}.`);
  }
  return out;
}

/** Região que vale agora num lugar (bioma trocado pelos mundos sobrepostos). */
export function shiftedRegion(c: Campaign, nodeId: string): Region | null {
  return (c.acts?.shifted[nodeId] as Region | undefined) ?? null;
}

export function isClosed(c: Campaign, nodeId: string): boolean {
  return !!c.acts?.closed.includes(nodeId);
}
