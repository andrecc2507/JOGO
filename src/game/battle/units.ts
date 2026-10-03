import type { Rng } from '@core';
import { DB, STORY_KITS, type EnemyDef, type Rarity } from '../data';
import { derive, type Character } from '../rules/character';
import { makeCharacter } from '../rules/recruit';
import { grantedSkillIds, innateSkillIds, outfitKey } from '../rules/skill_tree';
import * as stats from '../rules/stats';
import ARTWORK from '../data/sprite_art.json';
import BOND_DATA from '../data/base/bonds.json';
import type { BattleUnit, Team } from './types';

/** Pontos de vínculo → níveis (só os que já têm nível). */
function bondLevels(points: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!points) return undefined;
  const out: Record<string, number> = {};
  for (const [id, p] of Object.entries(points)) {
    const lv = BOND_DATA.levels.filter((t) => p >= t).length;
    if (lv) out[id] = lv;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Habilidades do kit único (personagens da história); a suprema vem da missão pessoal. */
export function kitSkills(c: Character): string[] {
  const kit = c.storyId ? STORY_KITS[c.storyId] : undefined;
  if (!kit) return [];
  return [...kit.skills, ...(c.kitUltimate ? [kit.ultimate] : [])].filter((id) => DB.skills[id]);
}

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
  // Forma fortificada: mesmo nível da habilidade normal (só existe no Nv 5).
  for (const [id, r] of Object.entries(ranks)) {
    const f = DB.skills[id]?.fortified;
    if (f) ranks[f] = r;
  }
  return ranks;
}

/** Habilidade da besta dada por um orbe da alma (joia de habilidade), se houver. */
function orbSkillOf(species: string): string | undefined {
  const id = DB.creatures[species]?.drops?.jewel.skill;
  return id && DB.skills[id] ? id : undefined;
}

/** Habilidades dos orbes equipados (até dois). */
function jewelSkill(c: Character): string[] {
  return (c.jewels ?? []).map((j) => orbSkillOf(j.species)).filter((x): x is string => !!x);
}

function jewelRank(c: Character): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of c.jewels ?? []) {
    const id = orbSkillOf(j.species);
    if (id) out[id] = j.rank;
  }
  return out;
}

/** Elemento de cada habilidade de orbe (o da habilidade ou, sem ele, o da besta): base dos combos de orbes. */
function orbElements(c: Character): Record<string, string> {
  const out: Record<string, string> = {};
  for (const j of c.jewels ?? []) {
    const id = orbSkillOf(j.species);
    if (id) out[id] = DB.skills[id]?.element ?? DB.creatures[j.species]?.element ?? 'neutro';
  }
  return out;
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
    trait: c.trait,
    loyalty: c.loyalty,
    bonds: bondLevels(c.bonds),
    vendetta: c.vendetta?.length ? c.vendetta.map((v) => v.enemyId) : undefined,
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
    skills: [...innateSkillIds(c.classId), ...c.skills.filter((id) => DB.skills[id]), ...grantedSkillIds(c.classId, c.skills), ...jewelSkill(c), ...kitSkills(c)],
    title: c.storyId ? STORY_KITS[c.storyId]?.title : undefined,
    skillRanks: { ...grantedRanks(c), ...jewelRank(c) },
    orbs: orbElements(c),
    items: [...c.equipment.utility],
    itemUses: c.equipment.utility.map((id) => (id ? DB.items[id]?.uses ?? 1 : 0)),
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
      outfit: outfitKey(c),
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
    // Humanos genéricos usam as habilidades no Nv 1 (fortalecer é progresso dos heróis do jogador);
    // os de nível novato são recrutas: só ataque básico e passivas da classe.
    c.skillRanks = {};
    if (level <= stats.NOVICE_LEVEL) c.skills = [];
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
  // Mesma regra dos 5 golpes dos heróis: o "fator" da fera vem da vida de design do bestiário
  // (vida ÷ (20 + 8 × nível mínimo); a fera comum mediana tem 1,8 → fator 1, igual a um herói médio).
  const factor = (def.hp ?? 30) / (20 + 8 * (def.levelMin ?? 1)) / stats.BALANCE.hp.beastDesignRef;
  const hp = Math.round(stats.maxHp(factor, level, attrs.vit) * (1 + (m - 1) * 0.3));
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
      art: def.id in ARTWORK ? def.id : undefined,
    },
  };
}
