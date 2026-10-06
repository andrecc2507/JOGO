import type { Rng } from '@core';
import type { BattleSetup } from '../battle/types';
import { node, places } from './layout';
import { provinceOf } from './provinces';
import { spawnForce } from './forces';
import { spendIntel } from './politics';
import { outpostAt } from './outposts';
import { ACTS, chapterOf, ensureActs, type Clue } from './acts_state';
import { atBase, averageLevel, type Campaign } from './campaign';

/**
 * Ato 2 (fugitivo). Cada província tem um nível de Procurado (0–5): esquadrões vistos na estrada
 * e batalhas fazem subir; ir pelo mato e parar em refúgios esconde. Com Procurado alto, os
 * Caçadores da Coroa saem atrás, as lojas cobram suborno e o recrutamento fecha. As missões
 * principais pedem pistas do quadro de investigação — e algumas pistas são falsas.
 */
const FUG = ACTS.fugitive;

const CLUE_TEXTS = [
  'Um carroceiro jura que viu o selo do Templo numa carga que ia para {place}.',
  'Uma criada do nobre fala de cartas queimadas toda noite em {place}.',
  'Um soldado bêbado conta que o Conselheiro recebe visitas encapuzadas perto de {place}.',
  'Moedas novas do Templo apareceram nas tavernas de {place}.',
  'Um mapa rasgado marca um círculo de runas ao norte de {place}.',
  'Um padre fugido diz que os registros verdadeiros saíram por {place}.',
];

export function wanted(c: Campaign, nodeId: string): number {
  return ensureActs(c).wanted[provinceOf(nodeId)] ?? 0;
}

function bump(c: Campaign, nodeId: string, n: number): void {
  const a = ensureActs(c);
  const p = provinceOf(nodeId);
  a.wanted[p] = Math.max(0, Math.min(FUG.wantedMax, (a.wanted[p] ?? 0) + n));
}

/** Dia do Ato 2: quem anda à vista sobe o Procurado; o tempo esfria; os caçadores saem. */
export function fugitiveDay(c: Campaign, day: number, rng: Rng): string[] {
  if (chapterOf(c) !== 2) return [];
  const a = ensureActs(c);
  const out: string[] = [];
  const present = new Set<string>();
  for (const s of c.squads) {
    const at = s.to ?? s.at;
    if (node(at).realm !== 'reino' || atBase(c, s) || outpostAt(c, s.at) === 'refugio') continue;
    present.add(provinceOf(at));
    const chance = FUG.seenChance * (s.offroad ? FUG.offroadMult : 1) * (!s.to && s.resting ? FUG.nightMult : 1);
    if (rng.chance(chance)) bump(c, at, 1);
  }
  if (day % FUG.decayEveryDays === 0)
    for (const p of Object.keys(a.wanted)) if (!present.has(p)) a.wanted[p] = Math.max(0, a.wanted[p]! - 1);
  // Caçadores atrás do esquadrão mais procurado.
  const hot = c.squads.filter((s) => wanted(c, s.to ?? s.at) >= FUG.huntersAt);
  if (hot.length && rng.chance(FUG.hunterChance)) {
    const s = rng.pick(hot);
    const f = spawnForce(c, rng, 2, averageLevel(c), [s.to ?? s.at], c.baseNode, 'cacadores');
    if (f) out.push(`🏹 Caçadores da Coroa saíram atrás de ${s.name} (Procurado ${wanted(c, s.to ?? s.at)} em ${node(s.to ?? s.at).name}).`);
  }
  return out;
}

/** Batalha no Ato 2: a notícia corre (Procurado sobe); vencer humanos às vezes rende uma pista. */
export function fugitiveAfterBattle(c: Campaign, nodeId: string, victory: boolean, humans: number, rng: Rng): string[] {
  if (chapterOf(c) !== 2) return [];
  bump(c, nodeId, FUG.battleWanted);
  if (victory && humans > 0 && rng.chance(FUG.clueBattleChance)) return [addClue(c, rng)];
  return [];
}

/** Suborno nas lojas de províncias com Procurado alto. */
export function wantedPrice(c: Campaign, capitalId: string): number {
  return chapterOf(c) === 2 && wanted(c, capitalId) >= FUG.priceAt ? FUG.priceMult : 1;
}

export function wantedRecruitClosed(c: Campaign, capitalId: string): boolean {
  return chapterOf(c) === 2 && wanted(c, capitalId) >= FUG.recruitClosedAt;
}

/** Nova pista no quadro (verdadeira ou falsa). */
export function addClue(c: Campaign, rng: Rng): string {
  const a = ensureActs(c);
  const place = rng.pick(places().filter((n) => n.realm === 'reino' && n.type === 'city'));
  const clue: Clue = { id: `pista_${a.clues.length}_${rng.int(1, 1e6)}`, text: rng.pick(CLUE_TEXTS).replace('{place}', place.name), real: rng.chance(FUG.clueRealChance) };
  a.clues.push(clue);
  return `🔎 Pista nova no quadro: ${clue.text}`;
}

/** Verificar uma pista (gasta informação): a falsa sai do quadro. */
export function verifyClue(c: Campaign, id: string): 'real' | 'falsa' | null {
  const a = ensureActs(c);
  const clue = a.clues.find((x) => x.id === id);
  if (!clue || clue.verified || !spendIntel(c, FUG.verifyIntel)) return null;
  if (!clue.real) {
    a.clues = a.clues.filter((x) => x !== clue);
    return 'falsa';
  }
  clue.verified = true;
  return 'real';
}

export function cluesNeeded(missionId: string): number {
  return (FUG.cluesNeeded as Record<string, number>)[missionId] ?? 0;
}

/** Por que a missão ainda não pode começar (pistas insuficientes). */
export function fugitiveBlock(c: Campaign, missionId: string): string | null {
  const need = cluesNeeded(missionId);
  const have = ensureActs(c).clues.length;
  return need > have ? `Faltam pistas no quadro de investigação (${have}/${need}). Rumores de taverna, interrogatórios e vitórias sobre humanos rendem pistas.` : null;
}

/** Ao começar a missão: usa as pistas (verificadas primeiro). Pista falsa leva a uma emboscada. */
export function useClues(c: Campaign, missionId: string, setup: BattleSetup): string | null {
  const need = cluesNeeded(missionId);
  if (!need) return null;
  const a = ensureActs(c);
  const order = [...a.clues].sort((x, y) => Number(!!y.verified) - Number(!!x.verified));
  const used = order.slice(0, need);
  a.clues = a.clues.filter((x) => !used.includes(x));
  if (used.some((x) => !x.real)) {
    setup.ambush = true;
    for (const u of setup.enemies) {
      u.maxHp = Math.round(u.maxHp * (1 + FUG.fakeHp));
      u.hp = u.startHp = u.maxHp;
    }
    setup.context.title = `${setup.context.title} · pista falsa!`;
    return 'Uma das pistas era falsa: o inimigo esperava vocês.';
  }
  return null;
}
