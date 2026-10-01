import type { Rng } from '@core';
import { DB, type EnemyDef, type Rarity } from '../data';
import { derive, type Character } from '../rules/character';
import { makeCharacter } from '../rules/recruit';
import { grantedSkillIds, innateSkillIds } from '../rules/skill_tree';
import * as stats from '../rules/stats';
import type { BattleUnit, Team } from './types';

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

/** Níveis das habilidades; as concedidas (ex.: raios do Iniciado) acompanham o nível de quem as concede. */
function grantedRanks(c: Character): Record<string, number> {
  const ranks = { ...(c.skillRanks ?? {}) };
  for (const id of grantedSkillIds(c.classId, c.skills)) {
    const by = DB.skills[id]?.tree ? Object.values(DB.trees).flatMap((t) => t!.nodes.flatMap((n) => n.skills)).find((s) => s.id === id)?.grantedBy : undefined;
    if (by) ranks[id] = c.skillRanks?.[by] ?? 1;
  }
  return ranks;
}

export function unitFromCharacter(c: Character, team: Team): BattleUnit {
  const d = derive(c);
  const cls = DB.classes[c.classId];
  return {
    uid: uid(team === 'player' ? 'p' : 'e'),
    team,
    name: c.name,
    classId: c.classId,
    charId: team === 'player' ? c.id : undefined,
    level: c.level,
    attrs: d.attrs,
    maxHp: d.maxHp,
    hp: Math.min(c.hp, d.maxHp),
    startHp: Math.min(c.hp, d.maxHp),
    maxMp: d.maxMp,
    mp: Math.min(c.mp, d.maxMp),
    magicDmg: d.magicDmg || undefined,
    def: d.def,
    weaponAtk: d.weaponAtk,
    weaponRange: d.weaponRange,
    weaponType: d.weaponType,
    attackAttr: d.attackAttr,
    accuracy: d.accuracy,
    evasion: d.evasion,
    crit: d.crit,
    healBonus: d.healBonus,
    move: d.move,
    jump: d.jump,
    x: 0,
    y: 0,
    facing: team === 'player' ? 0 : 2,
    gauge: 0,
    skills: [...innateSkillIds(c.classId), ...c.skills.filter((id) => DB.skills[id]), ...grantedSkillIds(c.classId, c.skills)],
    skillRanks: grantedRanks(c),
    items: [...c.equipment.utility],
    statuses: {},
    hidden: false,
    overwatch: false,
    defending: false,
    alive: true,
    kills: 0,
    killXp: 0,
    xpReward: 10 + c.level * 2,
    cooldowns: {},
    look: {
      color: cls.color,
      dark: cls.dark,
      hairColor: c.appearance.hairColor,
      hairStyle: c.appearance.hairStyle,
      skin: c.appearance.skin,
      size: 1,
      beast: false,
    },
  };
}

const TIER_MULT: Record<Rarity, number> = { comum: 1, raro: 1.25, epico: 1.6, lendario: 2.2 };

/** Cria um inimigo no nível pedido. Humanos usam as classes do jogador com build coerente. */
/** Nível final de um inimigo: média do esquadrão, travada na faixa da criatura. */
export function clampLevel(def: EnemyDef, level: number): number {
  return Math.max(1, Math.min(stats.MAX_LEVEL, Math.max(def.levelMin ?? 1, Math.min(def.levelMax ?? stats.MAX_LEVEL, Math.round(level)))));
}

/**
 * Crescimento das feras: a ficha descreve a criatura no nível mínimo e os valores
 * crescem na proporção (10 + nível) / (10 + nível mínimo).
 */
export function levelScale(def: EnemyDef, level: number): number {
  return (10 + level) / (10 + (def.levelMin ?? 1));
}

function flies(def: EnemyDef): boolean {
  return !!def.fly || (def.skills ?? []).some((id) => DB.skills[id]?.fx?.fly);
}

export function unitFromEnemy(def: EnemyDef, rawLevel: number, rng: Rng): BattleUnit {
  const level = clampLevel(def, rawLevel);
  if (def.kind === 'human' && def.classId) {
    const c = makeCharacter(rng, { classId: def.classId, level });
    c.name = def.name;
    const u = unitFromCharacter(c, 'enemy');
    u.enemyId = def.id;
    u.tier = def.tier;
    u.look.hairColor = def.color;
    return u;
  }
  const m = TIER_MULT[def.tier];
  const scale = levelScale(def, level);
  const a = def.attrs ?? { str: 6, dex: 6, spd: 8, int: 1, vit: 6 };
  const attrs = {
    str: Math.round(a.str * scale),
    dex: Math.round(a.dex * scale),
    spd: Math.round(a.spd + (level - (def.levelMin ?? 1)) * 0.3),
    int: Math.round(a.int * scale),
    vit: Math.round(a.vit * scale),
  };
  const hp = Math.round((def.hp ?? 30) * scale * (1 + (m - 1) * 0.3));
  return {
    uid: uid('e'),
    team: 'enemy',
    name: def.name,
    classId: 'fera',
    enemyId: def.id,
    level,
    attrs,
    maxHp: hp,
    hp,
    startHp: hp,
    maxMp: 0,
    mp: 0,
    def: 0,
    weaponAtk: Math.round((def.atk ?? 7) * scale),
    weaponRange: def.range ?? 1,
    weaponType: 'natural',
    attackAttr: 'str',
    accuracy: stats.accuracy(level, attrs.dex),
    evasion: stats.evasion(level, attrs.spd, attrs.dex),
    crit: stats.BALANCE.critical.beastChance,
    healBonus: 0,
    move: def.move ?? 5,
    jump: flies(def) ? 10 : 2,
    x: 0,
    y: 0,
    facing: 2,
    gauge: 0,
    skills: [...(def.skills ?? [])],
    items: [],
    statuses: {},
    hidden: false,
    overwatch: false,
    defending: false,
    alive: true,
    kills: 0,
    killXp: 0,
    xpReward: Math.round((def.xp ?? 10 + level * 2) * (def.xp ? scale : 1)),
    cooldowns: {},
    tier: def.tier,
    element: def.element,
    tameable: def.tameable,
    family: def.family,
    look: {
      color: def.color,
      dark: '#2a1f1a',
      hairColor: def.color,
      hairStyle: 0,
      skin: def.color,
      size: def.size ?? 1,
      beast: true,
      sprite: def.sprite,
      palette: def.palette,
    },
  };
}
