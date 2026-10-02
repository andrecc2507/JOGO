import type { Rng } from '@core';
import TRAIT_DATA from '../data/story/traits.json';
import type { Character } from '../rules/character';

/**
 * Personalidade dos heróis (D96): cada herói tem um traço (data/story/traits.json) com falas curtas
 * para momentos da batalha. A lealdade decide o tom: leal (≥ 60) apoia o comandante; ressentido
 * (< 35) reclama dele. Personagens da história têm traço fixo.
 */
export type BarkKind = 'start' | 'kill' | 'hurt' | 'allyDown' | 'victory';

interface TraitDef {
  name: string;
  desc: string;
  start: string[];
  kill: string[];
  hurt: string[];
  allyDown: { loyal: string[]; bitter: string[] };
  victory: { loyal: string[]; bitter: string[] };
}

export const TRAITS = TRAIT_DATA as Record<string, TraitDef>;
/** Traços sorteáveis para heróis comuns (os outros são dos personagens da história). */
export const COMMON_TRAITS = ['bravo', 'cauteloso', 'devoto', 'sarcastico', 'silencioso', 'ambicioso'];
export const STORY_TRAITS: Record<string, string> = { Edran: 'veterano', Lirael: 'idealista', Orun: 'mistico', Viajante: 'cinico', Maela: 'rebelde' };
export const LOYAL_AT = 60;
export const BITTER_BELOW = 35;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Garante o traço: o da história, ou um sorteado de forma estável pelo id do herói. */
export function ensureTrait(ch: Character): string {
  if (ch.storyId && STORY_TRAITS[ch.storyId]) ch.trait = STORY_TRAITS[ch.storyId];
  ch.trait ??= COMMON_TRAITS[hash(ch.id) % COMMON_TRAITS.length]!;
  return ch.trait;
}

export function traitOf(id: string | undefined): TraitDef | undefined {
  return id ? TRAITS[id] : undefined;
}

/** Tom da fala pela lealdade. */
export function mood(loyalty: number): 'loyal' | 'bitter' | 'neutral' {
  return loyalty >= LOYAL_AT ? 'loyal' : loyalty < BITTER_BELOW ? 'bitter' : 'neutral';
}

/** Uma fala do herói para o momento (ou null se o traço não fala disso). */
export function bark(trait: string | undefined, kind: BarkKind, loyalty: number, rng: Rng): string | null {
  const t = traitOf(trait);
  if (!t) return null;
  const pool = t[kind];
  if (Array.isArray(pool)) return pool.length ? rng.pick(pool) : null;
  const m = mood(loyalty);
  const list = m === 'bitter' ? pool.bitter : m === 'loyal' ? pool.loyal : [...pool.loyal, ...pool.bitter.slice(0, 1)];
  return list.length ? rng.pick(list) : null;
}
