import BONDS from '../data/base/bonds.json';
import type { BattleResult } from '../battle/types';
import type { Character } from '../rules/character';
import { addFriction, compatibility } from '../rules/personality';
import { addMorale } from './loyalty';

/**
 * Vínculos entre heróis (D103): lutar junto cria pontos de vínculo (mais na vitória e terminando lado
 * a lado; conversas na base também contam). Níveis: Conhecidos, Camaradas, Irmãos de armas. Na
 * batalha, um aliado com vínculo ao lado dá acerto e dano (motor: `bondLevelNear`). Perder um vínculo
 * forte abala a moral e cria um juramento de vingança contra o tipo de inimigo que o matou.
 */
export const BOND = BONDS;

export interface BondHost {
  roster: Record<string, Character>;
}

export function bondLevel(points: number): number {
  return BONDS.levels.filter((t) => points >= t).length;
}

export function bondName(level: number): string {
  return BONDS.names[level] ?? '';
}

export function bondPoints(a: Character, b: Character): number {
  return a.bonds?.[b.id] ?? 0;
}

/** Soma pontos de vínculo entre dois heróis; devolve o novo nível se ele subiu (senão 0). */
export function addBond(a: Character, b: Character, n: number): number {
  if (a.id === b.id) return 0;
  const before = bondLevel(bondPoints(a, b));
  const p = bondPoints(a, b) + n;
  (a.bonds ??= {})[b.id] = p;
  (b.bonds ??= {})[a.id] = p;
  const after = bondLevel(p);
  return after > before ? after : 0;
}

export interface BondEvent {
  kind: 'up' | 'grief' | 'rival';
  a: string;
  b: string;
  level?: number;
  killer?: { name: string; enemyId?: string };
}

/**
 * Vínculos depois da batalha: quem lutou junto ganha pontos; quem perdeu um vínculo forte sofre
 * (moral) e jura vingança. Chamar antes de tirar os mortos do elenco.
 */
export function bondsAfterBattle(c: BondHost, r: BattleResult): BondEvent[] {
  const out: BondEvent[] = [];
  const units = r.units.filter((u) => c.roster[u.charId]);
  const victory = r.outcome === 'victory';
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) {
      const ua = units[i]!;
      const ub = units[j]!;
      const a = c.roster[ua.charId]!;
      const b = c.roster[ub.charId]!;
      if (!ua.alive || !ub.alive) continue;
      const adjacent = ua.x !== undefined && ub.x !== undefined && Math.abs(ua.x - ub.x!) + Math.abs(ua.y! - ub.y!) <= 1;
      // Personalidades que se chocam não viram amigas lutando juntas: o atrito cresce.
      const compat = compatibility(a, b);
      if (compat < 0) {
        const lv = addFriction(a, b, -compat);
        if (lv) out.push({ kind: 'rival', a: a.id, b: b.id, level: lv });
        continue;
      }
      const n = BONDS.perBattle + (victory ? BONDS.victoryBonus : 0) + (adjacent ? BONDS.adjacentBonus : 0) + (compat >= 2 ? BONDS.compatibleBonus : 0);
      const up = addBond(a, b, n);
      if (up) out.push({ kind: 'up', a: a.id, b: b.id, level: up });
    }
  // Luto e juramento: o sobrevivente com vínculo forte com quem caiu.
  for (const dead of units.filter((u) => !u.alive)) {
    const d = c.roster[dead.charId]!;
    for (const live of units.filter((u) => u.alive)) {
      const s = c.roster[live.charId]!;
      if (bondLevel(bondPoints(s, d)) < BONDS.griefBondLevel) continue;
      addMorale(s, BONDS.griefMorale);
      const k = dead.killedBy;
      if (k?.enemyId && !(s.vendetta ?? []).some((v) => v.enemyId === k.enemyId)) (s.vendetta ??= []).push({ enemyId: k.enemyId, name: k.name, for: d.name });
      out.push({ kind: 'grief', a: s.id, b: d.id, killer: k });
    }
  }
  return out;
}

/** Remove um herói dos vínculos dos outros (morte ou deserção). */
export function forgetBonds(c: BondHost, id: string): void {
  for (const ch of Object.values(c.roster)) {
    if (ch.bonds) delete ch.bonds[id];
    if (ch.friction) delete ch.friction[id];
  }
}
