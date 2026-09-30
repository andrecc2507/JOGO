import type { Rng } from '@core';
import { ATTRS, DB, item, type Attr, type Attributes, type ClassId, type WeaponType } from '../data';

/** Constantes de progressão (provisórias — ver docs/design/variaveis.md). */
export const MAX_LEVEL = 99;
export const MAX_ATTR = 99;
export const BASE_ATTR = 3;
export const STARTING_POINTS = 20;
export const STAT_POINTS_PER_LEVEL = 5;
export const SKILL_POINTS_PER_LEVEL = 1;
export const APPRENTICE_PROMOTION_LEVEL = 2;
export const UTILITY_SLOTS = 3;

export interface Appearance {
  hairStyle: number;
  hairColor: string;
  skin: string;
}

export interface Equipment {
  weapon: string | null;
  offhand: string | null;
  armor: string | null;
  accessory: string | null;
  utility: (string | null)[];
}

export interface Character {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  attrs: Attributes;
  statPoints: number;
  skillPoints: number;
  skills: string[];
  hp: number;
  mp: number;
  /** Dias de ferimento restantes (0 = apto). */
  woundDays: number;
  equipment: Equipment;
  appearance: Appearance;
  kills: number;
  /** Habilidades que liberam escudo / duas armas (futuro). */
  canDualWield?: boolean;
}

export const HAIR_COLORS = ['#2b1d14', '#6b3e1f', '#c98b3a', '#e8d27a', '#b33a2a', '#d9d9d9', '#3a4a8a', '#1a1a1a'];
export const SKIN_TONES = ['#f6d3b3', '#e8b98f', '#c98e62', '#9a6440', '#6b422a', '#4a2e1e'];
export const HAIR_STYLES = 4;

export const DEFAULT_WEAPON: Record<ClassId, string | null> = {
  aprendiz: 'faca_simples',
  guerreiro: 'espada_curta',
  arqueiro: 'arco_curto',
  mago: 'varinha_aprendiz',
  clerigo: 'bastao_de_carvalho',
  ladrao: 'faca_simples',
  fera: null,
};

/** Custo para subir um atributo que está em `value` (curva do Ragnarok). */
export function statCost(value: number): number {
  return Math.floor((value - 1) / 10) + 2;
}

/** XP necessário para ir do nível `level` ao próximo. */
export function xpToNext(level: number): number {
  return Math.round(40 * Math.pow(level, 1.6));
}

export function emptyAttrs(v = 0): Attributes {
  return { str: v, dex: v, int: v, vit: v, con: v, spd: v };
}

export interface Derived {
  attrs: Attributes;
  maxHp: number;
  maxMp: number;
  def: number;
  weaponAtk: number;
  weaponRange: number;
  weaponType: WeaponType;
  /** Atributo que escala o ataque básico. */
  attackAttr: Attr;
  ranged: boolean;
  accuracy: number;
  evasion: number;
  crit: number;
  healBonus: number;
  move: number;
  jump: number;
}

function equippedIds(c: Character): string[] {
  const e = c.equipment;
  return [e.weapon, e.offhand, e.armor, e.accessory].filter((x): x is string => !!x);
}

/** Atributos finais + valores derivados de combate. */
export function derive(c: Character): Derived {
  const cls = DB.classes[c.classId];
  const attrs = { ...c.attrs };
  let def = 0;
  let crit = 3;
  let evasion = 0;
  let accuracy = 0;
  let healBonus = 0;
  for (const id of equippedIds(c)) {
    const it = item(id);
    def += it.def ?? 0;
    const b = it.bonus ?? {};
    for (const a of ATTRS) attrs[a] += b[a] ?? 0;
    crit += b.crit ?? 0;
    evasion += b.evasion ?? 0;
    accuracy += b.accuracy ?? 0;
    healBonus += b.heal ?? 0;
  }
  const weapon = c.equipment.weapon ? item(c.equipment.weapon) : null;
  const weaponType: WeaponType = weapon?.weaponType ?? (c.classId === 'fera' ? 'natural' : 'faca');
  const attackAttr: Attr = weaponType === 'arco' ? 'dex' : weaponType === 'varinha' ? 'int' : 'str';
  return {
    attrs,
    maxHp: cls.hpBase + attrs.vit * 6 + c.level * 4,
    maxMp: cls.mpBase + attrs.int * 3 + c.level * 2,
    def: attrs.con + def,
    weaponAtk: weapon?.atk ?? 3,
    weaponRange: weapon?.range ?? 1,
    weaponType,
    attackAttr,
    ranged: (weapon?.range ?? 1) > 1,
    accuracy: 78 + attrs.dex * 1.2 + accuracy,
    evasion: attrs.spd * 1.2 + evasion,
    crit,
    healBonus,
    move: cls.move,
    jump: cls.jump,
  };
}

export function canUseWeapon(classId: ClassId, itemId: string): boolean {
  const it = item(itemId);
  if (it.slot !== 'weapon') return false;
  return DB.classes[classId].weapons.includes(it.weaponType ?? 'natural');
}

export function canEquip(c: Character, itemId: string): boolean {
  const it = item(itemId);
  if (it.slot === 'weapon') return canUseWeapon(c.classId, itemId);
  if (it.slot === 'offhand') return !!c.canDualWield;
  return true;
}

export function allocate(c: Character, attr: Attr): boolean {
  const cost = statCost(c.attrs[attr]);
  if (c.statPoints < cost || c.attrs[attr] >= MAX_ATTR) return false;
  c.statPoints -= cost;
  c.attrs[attr] += 1;
  return true;
}

export function learnableSkills(c: Character): string[] {
  return DB.classes[c.classId].skills.filter((s) => !c.skills.includes(s));
}

export function learnSkill(c: Character, skillId: string): boolean {
  if (c.skillPoints < 1 || c.skills.includes(skillId)) return false;
  if (!DB.classes[c.classId].skills.includes(skillId)) return false;
  const req = DB.skills[skillId]?.levelReq ?? 1;
  if (c.level < req) return false;
  c.skillPoints -= 1;
  c.skills.push(skillId);
  return true;
}

export function canPromote(c: Character): boolean {
  return c.classId === 'aprendiz' && c.level >= APPRENTICE_PROMOTION_LEVEL;
}

export function promote(c: Character, classId: ClassId): boolean {
  if (!canPromote(c) || classId === 'aprendiz' || classId === 'fera') return false;
  c.classId = classId;
  if (c.equipment.weapon && !canUseWeapon(classId, c.equipment.weapon)) c.equipment.weapon = null;
  return true;
}

/** Aplica XP e sobe de nível quantas vezes couber. Retorna quantos níveis subiu. */
export function gainXp(c: Character, amount: number): number {
  let levels = 0;
  c.xp += amount;
  while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level += 1;
    c.statPoints += STAT_POINTS_PER_LEVEL;
    c.skillPoints += SKILL_POINTS_PER_LEVEL;
    levels++;
  }
  if (levels > 0) {
    const d = derive(c);
    c.hp = d.maxHp;
    c.mp = d.maxMp;
  }
  return levels;
}

/** Gasta pontos automaticamente seguindo pesos (usado por inimigos e recrutas de nível > 1). */
export function autoAllocate(c: Character, weights: Partial<Attributes>, rng: Rng): void {
  const pool = ATTRS.flatMap((a) => Array<Attr>(Math.max(1, Math.round((weights[a] ?? 0) * 2 + 1))).fill(a));
  let guard = 200;
  while (c.statPoints > 0 && guard-- > 0) {
    const a = rng.pick(pool);
    if (!allocate(c, a)) {
      if (c.statPoints < statCost(Math.min(...ATTRS.map((x) => c.attrs[x])))) break;
    }
  }
  while (c.skillPoints > 0) {
    const options = learnableSkills(c);
    if (!options.length) break;
    learnSkill(c, rng.pick(options));
  }
}

export function fullHeal(c: Character): void {
  const d = derive(c);
  c.hp = d.maxHp;
  c.mp = d.maxMp;
}
