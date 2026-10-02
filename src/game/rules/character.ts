import type { Rng } from '@core';
import { ATTRS, DB, item, type Attr, type Attributes, type ClassId, type WeaponType } from '../data';
import { classSkillIds, lockReason, rankOf, treeBonus, treeMpBonus } from './skill_tree';
import * as stats from './stats';

/** Constantes de progressão (valores em data/balance.json — ver docs/design/matematica.md). */
export const MAX_LEVEL = stats.MAX_LEVEL;
export const MAX_ATTR = stats.MAX_ATTR;
export const BASE_ATTR = stats.BALANCE.progression.baseAttribute;
/** Pontos de atributo do nível 1 (pagos com o mesmo custo dos demais; ver stats.ts). */
export const STARTING_POINTS = stats.STARTING_ATTRIBUTE_POINTS;
export const SKILL_POINTS_PER_LEVEL = stats.BALANCE.progression.skillPointsPerLevel;
/** Ponto de habilidade com que recrutas de classe chegam (1ª habilidade de uma teia). */
export const STARTING_SKILL_POINTS = stats.BALANCE.progression.startingSkillPoints;
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
  /** Nível (1–5) de cada habilidade aprendida; ausente = 1. */
  skillRanks?: Record<string, number>;
  hp: number;
  mp: number;
  /** Dias de ferimento restantes (0 = apto). */
  woundDays: number;
  equipment: Equipment;
  appearance: Appearance;
  kills: number;
  /** Habilidades que liberam escudo / duas armas (futuro). */
  canDualWield?: boolean;
  /** Joia da alma equipada (espaço de joia): espécie de origem e nível (1–5). */
  jewel?: { species: string; rank: number };
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
export const statCost = stats.attributeCost;

/** XP necessário para ir do nível `level` ao próximo. */
export const xpToNext = stats.xpToNext;

export function emptyAttrs(v = 0): Attributes {
  return { str: v, dex: v, spd: v, int: v, vit: v };
}

export interface Derived {
  attrs: Attributes;
  maxHp: number;
  maxMp: number;
  /** Dano mágico extra dos bônus de classe (fração). */
  magicDmg: number;
  /** Armadura (equipamentos). */
  def: number;
  /** Poder físico do atributo de ataque e poder mágico (INT). */
  physPower: number;
  magicPower: number;
  /** Redução de dano física e mágica (0–1). */
  physRes: number;
  magicRes: number;
  /** Segundos entre ações na linha do tempo. */
  actionInterval: number;
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
  let crit = stats.BALANCE.critical.baseChance;
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
  // Arcos e facas pedem precisão (DES); varinhas e bastões canalizam INT; o resto é FOR.
  const attackAttr: Attr = weaponType === 'arco' || weaponType === 'faca' ? 'dex' : weaponType === 'varinha' || weaponType === 'bastao' ? 'int' : 'str';
  const tb = treeBonus(c);
  attrs.spd = Math.round(attrs.spd * (1 + tb.speed));
  attrs.str = Math.round(attrs.str * (1 + tb.str));
  attrs.dex = Math.round(attrs.dex * (1 + tb.dex));
  attrs.int = Math.round(attrs.int * (1 + tb.int));
  return {
    attrs,
    maxHp: Math.round(stats.maxHp(cls.hpBase, cls.hpPerLevel, c.level, attrs.vit) * (1 + tb.hp)),
    maxMp: Math.round(stats.maxMp(cls.mpBase, cls.mpPerLevel, c.level, attrs.int, treeMpBonus(c)) * (1 + tb.mp)),
    magicDmg: tb.magic,
    def,
    physPower: stats.physicalPower(attrs, attackAttr),
    magicPower: stats.magicPower(attrs),
    physRes: stats.physicalResistance(attrs.vit, def),
    magicRes: stats.magicResistance(attrs.int),
    actionInterval: stats.actionInterval(attrs.spd),
    weaponAtk: weapon?.atk ?? 3,
    weaponRange: weapon?.range ?? 1,
    weaponType,
    attackAttr,
    ranged: (weapon?.range ?? 1) > 1,
    accuracy: Math.round(stats.accuracy(c.level, attrs.dex, accuracy) * (1 + tb.accuracy)),
    evasion: stats.evasion(c.level, attrs.spd, attrs.dex, evasion),
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

/** Habilidades que o personagem pode aprender ou fortalecer agora. */
export function learnableSkills(c: Character): string[] {
  return classSkillIds(c.classId).filter((id) => lockReason(c, id) === null);
}

/** Gasta 1 ponto: aprende a habilidade (nível 1) ou sobe um nível (até 5). */
export function learnSkill(c: Character, skillId: string): boolean {
  if (c.skillPoints < 1 || lockReason(c, skillId) !== null) return false;
  c.skillPoints -= 1;
  const rank = rankOf(c, skillId);
  if (rank === 0) c.skills.push(skillId);
  else (c.skillRanks ??= {})[skillId] = rank + 1;
  return true;
}

/**
 * Saves antigos: habilidades que não existem mais (as da classe básica, trocadas por passivas)
 * saem da ficha e o ponto gasto nelas volta. Retorna quantos pontos foram devolvidos.
 */
export function refundRemovedSkills(c: Character): number {
  const gone = c.skills.filter((id) => !DB.skills[id]);
  if (!gone.length) return 0;
  c.skills = c.skills.filter((id) => DB.skills[id]);
  c.skillPoints += gone.length;
  return gone.length;
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
    c.statPoints += stats.attributePointsAt(c.level);
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
  let guard = 2000;
  while (c.statPoints > 0 && guard-- > 0) {
    const a = rng.pick(pool);
    if (!allocate(c, a)) {
      if (c.statPoints < statCost(Math.min(...ATTRS.map((x) => c.attrs[x])))) break;
      // Atributo no teto: o resto vai para qualquer outro que ainda cabe.
      const open = ATTRS.filter((x) => c.attrs[x] < MAX_ATTR);
      if (!open.length) break;
      allocate(c, rng.pick(open));
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
