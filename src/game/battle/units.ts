import type { Rng } from '@core';
import { DB, type EnemyDef, type Rarity } from '../data';
import { derive, type Character } from '../rules/character';
import { makeCharacter } from '../rules/recruit';
import type { BattleUnit, Team } from './types';

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
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
    skills: [...c.skills],
    items: [...c.equipment.utility],
    statuses: {},
    hidden: false,
    overwatch: false,
    defending: false,
    alive: true,
    kills: 0,
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
export function unitFromEnemy(def: EnemyDef, level: number, rng: Rng): BattleUnit {
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
  const scale = 1 + (level - 1) * 0.09;
  const a = def.attrs ?? { str: 6, dex: 6, int: 1, vit: 6, con: 5, spd: 8 };
  const attrs = {
    str: Math.round(a.str * scale),
    dex: Math.round(a.dex * scale),
    int: Math.round(a.int * scale),
    vit: Math.round(a.vit * scale),
    con: Math.round(a.con * scale),
    spd: Math.round(a.spd + (level - 1) * 0.3),
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
    def: attrs.con,
    weaponAtk: Math.round((def.atk ?? 7) * scale),
    weaponRange: def.range ?? 1,
    weaponType: 'natural',
    attackAttr: 'str',
    accuracy: 80 + attrs.dex,
    evasion: attrs.spd,
    crit: 5,
    healBonus: 0,
    move: def.move ?? 5,
    jump: 2,
    x: 0,
    y: 0,
    facing: 2,
    gauge: 0,
    skills: [],
    items: [],
    statuses: {},
    hidden: false,
    overwatch: false,
    defending: false,
    alive: true,
    kills: 0,
    tier: def.tier,
    element: def.element,
    tameable: def.tameable,
    look: {
      color: def.color,
      dark: '#2a1f1a',
      hairColor: def.color,
      hairStyle: 0,
      skin: def.color,
      size: def.size ?? 1,
      beast: true,
    },
  };
}
