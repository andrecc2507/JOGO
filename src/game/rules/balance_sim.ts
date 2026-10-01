import { Rng } from '@core';
import { DB, type ClassId } from '../data';
import { createBattle, previewHit } from '../battle/engine';
import { createEmptyMap } from '../battle/map';
import type { BattleUnit } from '../battle/types';
import { unitFromCharacter, unitFromEnemy } from '../battle/units';
import { makeCharacter } from './recruit';
import { actionInterval } from './stats';

/**
 * Simulador de balanceamento (puro): monta personagens com a build automática da classe em cada
 * nível e mede, com o motor de verdade, vida, dano por ação, dano por tempo e golpes para derrubar.
 * Base das tabelas de docs/design/matematica.md e dos testes de sanidade.
 */

export interface SimRow {
  level: number;
  classId: ClassId;
  hp: number;
  mp: number;
  /** Dano médio do ataque básico (DPA) contra um alvo de referência do mesmo nível. */
  dpa: number;
  /** Dano médio de uma habilidade de poder 6 (comum) contra o mesmo alvo. */
  skillDpa: number;
  /** Chance de acerto do básico contra o alvo de referência. */
  hit: number;
  /** Segundos entre ações e dano por minuto do básico (DPT). */
  interval: number;
  dpm: number;
  /** Golpes básicos para derrubar o alvo médio (Arqueiro), o tanque (Guerreiro) e a fera de referência do nível. */
  hitsToKill: number;
  hitsToKillTank: number;
  hitsToKillBeast: number;
  /** Fera de referência (a de menor raridade que existe nesse nível). */
  beast: string;
}

export const SIM_CLASSES: ClassId[] = ['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'];
export const SIM_LEVELS = [1, 10, 20, 30, 40, 50, 60];

function unitOf(classId: ClassId, level: number, seed: number): BattleUnit {
  const c = makeCharacter(new Rng(seed), { classId, level });
  return unitFromCharacter(c, 'player');
}

const TIER_ORDER = ['comum', 'raro', 'epico', 'lendario'];

/** Fera de referência: a de menor raridade cuja faixa de níveis cobre o nível pedido. */
function beastAt(level: number, rng: Rng): BattleUnit | null {
  const list = Object.values(DB.enemies)
    .filter((e) => e!.kind === 'beast' && !e!.summonOnly)
    .filter((e) => (e!.levelMin ?? 1) <= level && level <= (e!.levelMax ?? 60))
    .sort((a, b) => TIER_ORDER.indexOf(a!.tier) - TIER_ORDER.indexOf(b!.tier) || (b!.levelMin ?? 1) - (a!.levelMin ?? 1));
  const pick = list[0];
  return pick ? unitFromEnemy(pick, level, rng) : null;
}

export function simulate(level: number, classId: ClassId, seed = 7): SimRow {
  const a = unitOf(classId, level, seed);
  // Alvos de referência do mesmo nível: médio (Arqueiro) e tanque (Guerreiro).
  const d = unitOf('arqueiro', level, seed + 1);
  const tank = unitOf('guerreiro', level, seed + 3);
  const beast = beastAt(level, new Rng(seed + 2));
  const s = createBattle({ map: createEmptyMap(8, 8, 'planicie'), players: [a], enemies: beast ? [d, tank, beast] : [d, tank], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 'sim' } });
  const [pa, pd, pt, pb] = s.units as [BattleUnit, BattleUnit, BattleUnit, BattleUnit | undefined];
  [pa.x, pa.y, pd.x, pd.y, pt.x, pt.y] = [3, 3, 4, 3, 2, 3];
  if (pb) [pb.x, pb.y] = [3, 4];
  const kind = pa.weaponType === 'varinha' ? 'magic' : 'basic';
  const avg = (p: { min: number; max: number; chance: number; crit: number }) => ((p.min + p.max) / 2) * (1 + (p.crit / 100) * 0.5) * (p.chance / 100);
  const basic = previewHit(s, pa, pd, kind, 0);
  const skill = previewHit(s, pa, pd, pa.weaponType === 'varinha' || pa.classId === 'clerigo' ? 'magic' : 'physical', 6);
  const vsBeast = pb ? previewHit(s, pa, pb, kind, 0) : basic;
  const vsTank = previewHit(s, pa, pt, kind, 0);
  const interval = actionInterval(pa.attrs.spd);
  const dpa = avg(basic);
  return {
    level,
    classId,
    hp: pa.maxHp,
    mp: pa.maxMp,
    dpa: Math.round(dpa),
    skillDpa: Math.round(avg(skill)),
    hit: basic.chance,
    interval: Math.round(interval * 10) / 10,
    dpm: Math.round((dpa * 60) / interval),
    hitsToKill: Math.ceil(pd.maxHp / Math.max(1, dpa)),
    hitsToKillTank: Math.ceil(pt.maxHp / Math.max(1, avg(vsTank))),
    hitsToKillBeast: pb ? Math.ceil(pb.maxHp / Math.max(1, avg(vsBeast))) : 0,
    beast: pb ? `${pb.name} (${pb.tier})` : '—',
  };
}

export function simulateAll(): SimRow[] {
  return SIM_LEVELS.flatMap((lv) => SIM_CLASSES.map((c) => simulate(lv, c)));
}
