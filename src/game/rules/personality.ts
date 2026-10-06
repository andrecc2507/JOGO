import { Rng } from '@core';
import QUIRK_DATA from '../data/story/quirks.json';
import type { Character } from './character';

/**
 * Personalidade além do traço de fala (traits.json): cada herói tem 1–3 virtudes, manias ou
 * pequenos transtornos (data/story/quirks.json), sorteados pela raridade — quanto mais peculiar,
 * mais raro, e a maioria é gente boa. Recrutas mais fortes puxam para as raridades altas.
 *
 * As personalidades reagem umas às outras: o que um aprecia ou não suporta no outro dá a
 * compatibilidade do par. Compatível, o vínculo cresce um pouco mais rápido; incompatível, em vez
 * de vínculo nasce atrito — Rivais (competem: mais dano, menos acerto lado a lado) e Desafetos
 * (atrapalham: menos dano e acerto). Uma conversa mediada pelo comandante alivia o atrito.
 */
export type QuirkRarity = 'comum' | 'incomum' | 'raro' | 'exotico';

export interface QuirkDef {
  id: string;
  name: string;
  desc: string;
  rarity: QuirkRarity;
  kind: string;
  tags: string[];
  likes: string[];
  dislikes: string[];
  battle?: { accuracy?: number; evasion?: number; crit?: number; hpPct?: number };
}

export const QUIRKS = QUIRK_DATA.quirks as QuirkDef[];
export const FRICTION = QUIRK_DATA.friction;
export const RARITY_LABEL = QUIRK_DATA.rarityLabel as Record<QuirkRarity, string>;
const RARITIES: QuirkRarity[] = ['comum', 'incomum', 'raro', 'exotico'];
const TRAIT_TAGS = QUIRK_DATA.traitTags as Record<string, string[]>;

export function quirkDef(id: string): QuirkDef | undefined {
  return QUIRKS.find((q) => q.id === id);
}

/**
 * Sorteia 1–3 peculiaridades sem repetir. `eccentricity` (0 = gente comum) aumenta o peso das
 * raridades altas: recrutas mais fortes têm personalidades mais marcantes.
 */
export function rollQuirks(rng: Rng, eccentricity = 0): string[] {
  const n = rng.chance(0.05 + eccentricity * 0.1) ? 3 : rng.chance(0.35 + eccentricity * 0.15) ? 2 : 1;
  const out: string[] = [];
  const weight = (q: QuirkDef) => (QUIRK_DATA.rarityWeight as Record<QuirkRarity, number>)[q.rarity] * (1 + eccentricity * RARITIES.indexOf(q.rarity));
  for (let i = 0; i < n; i++) {
    const pool = QUIRKS.filter((q) => !out.includes(q.id));
    const total = pool.reduce((a, q) => a + weight(q), 0);
    let r = rng.next() * total;
    const pick = pool.find((q) => (r -= weight(q)) < 0) ?? pool[0]!;
    out.push(pick.id);
  }
  return out;
}

/** Excentricidade de um recruta pelo nível (o de nível 1 é gente comum). */
export function eccentricityFor(level: number): number {
  return Math.max(0, level - 1) * QUIRK_DATA.eccentricityPerLevel;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Garante a personalidade (saves antigos e personagens da história: estável pelo id). */
export function ensureQuirks(ch: Character): string[] {
  ch.quirks ??= rollQuirks(new Rng(hash(`q:${ch.id}`)), 0);
  return ch.quirks;
}

/** Como o herói é visto pelos outros: as marcas das peculiaridades e do traço. */
export function tagsOf(ch: Character): string[] {
  return [...ensureQuirks(ch).flatMap((id) => quirkDef(id)?.tags ?? []), ...(TRAIT_TAGS[ch.trait ?? ''] ?? [])];
}

/** Quanto `a` gosta do jeito de `b` (positivo) ou não suporta (negativo). */
function opinion(a: Character, b: Character): number {
  const theirs = new Set(tagsOf(b));
  let v = 0;
  for (const q of ensureQuirks(a).map(quirkDef)) {
    if (!q) continue;
    v += q.likes.filter((t) => theirs.has(t)).length;
    v -= q.dislikes.filter((t) => theirs.has(t)).length;
  }
  return v;
}

/** Compatibilidade do par (−3 a +3): as duas opiniões somadas. */
export function compatibility(a: Character, b: Character): number {
  return Math.max(-3, Math.min(3, opinion(a, b) + opinion(b, a)));
}

/** A peculiaridade de `a` que mais pesa na relação com `b` (para as conversas). */
export function reactionQuirk(a: Character, b: Character): QuirkDef | undefined {
  const theirs = new Set(tagsOf(b));
  const qs = ensureQuirks(a).map(quirkDef).filter((q): q is QuirkDef => !!q);
  return qs.find((q) => q.dislikes.some((t) => theirs.has(t)) || q.likes.some((t) => theirs.has(t))) ?? qs[0];
}

export function frictionPoints(a: Character, b: Character): number {
  return a.friction?.[b.id] ?? 0;
}

export function frictionLevel(points: number): number {
  return FRICTION.levels.filter((t) => points >= t).length;
}

export function frictionName(level: number): string {
  return FRICTION.names[level] ?? '';
}

/** Soma (ou tira, com n negativo) atrito entre dois heróis; devolve o novo nível se ele subiu. */
export function addFriction(a: Character, b: Character, n: number): number {
  if (a.id === b.id) return 0;
  const before = frictionLevel(frictionPoints(a, b));
  const p = Math.max(0, frictionPoints(a, b) + n);
  (a.friction ??= {})[b.id] = p;
  (b.friction ??= {})[a.id] = p;
  const after = frictionLevel(p);
  return after > before ? after : 0;
}

/** Efeitos de batalha das peculiaridades somados. */
export function quirkBattle(ch: Character): { accuracy: number; evasion: number; crit: number; hpPct: number } {
  const out = { accuracy: 0, evasion: 0, crit: 0, hpPct: 0 };
  for (const q of ensureQuirks(ch).map(quirkDef)) {
    if (!q?.battle) continue;
    out.accuracy += q.battle.accuracy ?? 0;
    out.evasion += q.battle.evasion ?? 0;
    out.crit += q.battle.crit ?? 0;
    out.hpPct += q.battle.hpPct ?? 0;
  }
  return out;
}

/** Texto curto da personalidade (ficha e recrutamento). */
export function quirkLine(ch: Character): string {
  return ensureQuirks(ch).map((id) => quirkDef(id)?.name ?? id).join(' · ');
}
