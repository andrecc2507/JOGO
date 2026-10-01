import type { DataRegistry } from '@core';
import classes from './classes/classes.json';
import combos from './skills/combos.json';
import skills from './skills/skills.json';
import items from './items/items.json';
import enemies from './enemies/enemies.json';
import countries from './world/countries.json';
import creatures from './bestiary/creatures.json';
import type { ClassDef, ClassId, ComboDef, CountryDef, CreatureDef, EnemyDef, ItemDef, SkillDef } from './types';

export * from './types';

function index<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of list) {
    if (out[item.id]) throw new Error(`Id duplicado: ${item.id}`);
    out[item.id] = item;
  }
  return out;
}

/**
 * Acesso direto e tipado ao conteúdo estático. Módulos de regras (puros e testáveis)
 * usam `DB`; cenas também podem usar `ctx.data` (mesmo conteúdo).
 */
export const DB = {
  classes: index(classes as ClassDef[]) as Record<ClassId, ClassDef>,
  skills: index(skills as SkillDef[]),
  combos: index(combos as ComboDef[]),
  items: index(items as ItemDef[]),
  enemies: index(enemies as EnemyDef[]),
  countries: countries as CountryDef[],
  /** Bestiário ativo (repositório + edições locais). */
  creatures: {} as Record<string, CreatureDef>,
};

/** Converte uma habilidade de criatura no formato geral de habilidades do motor. */
export function creatureSkillToSkill(s: CreatureDef['skills'][number]): SkillDef {
  return {
    id: s.id,
    name: s.name,
    classId: 'fera',
    mp: 0,
    range: s.range,
    target: s.kind === 'physical' ? 'enemy' : 'self',
    shape: 'single',
    kind: s.kind === 'physical' ? 'physical' : 'utility',
    power: s.power,
    cooldown: s.cooldown,
    passive: s.kind === 'passive',
    effect: s.effect,
    value: s.value,
    status: s.status,
    description: s.description,
  };
}

/** Ficha do bestiário → definição de inimigo usada por encontros e batalhas. */
export function creatureToEnemy(c: CreatureDef): EnemyDef {
  return {
    id: c.id,
    name: c.name,
    kind: 'beast',
    biomes: c.biomes,
    tier: c.rarity,
    tameable: c.tameable,
    attrs: c.attrs,
    hp: c.hp,
    atk: Math.max(1, Math.round(c.attrs.str * 0.8)),
    range: Math.max(1, ...c.skills.filter((s) => s.kind === 'physical').map((s) => s.range)),
    move: c.move,
    element: c.element === 'neutro' ? undefined : c.element,
    skills: c.skills.map((s) => s.id),
    color: c.palette.W ?? Object.values(c.palette)[0] ?? '#888',
    size: c.size,
    description: c.description,
    levelMin: c.levelMin,
    levelMax: c.levelMax,
    xp: c.xp,
    sprite: c.sprite,
    palette: c.palette,
  };
}

/** Instala (ou reinstala) o bestiário no banco de dados do jogo. */
export function applyCreatures(list: CreatureDef[]): void {
  for (const id of Object.keys(DB.creatures)) delete DB.enemies[id];
  DB.creatures = {};
  for (const c of list) {
    DB.creatures[c.id] = c;
    DB.enemies[c.id] = creatureToEnemy(c);
    for (const s of c.skills) DB.skills[s.id] = creatureSkillToSkill(s);
  }
}

export const REPO_CREATURES = creatures as CreatureDef[];
applyCreatures(REPO_CREATURES);

export function skill(id: string): SkillDef {
  const s = DB.skills[id];
  if (!s) throw new Error(`Habilidade desconhecida: ${id}`);
  return s;
}

export function item(id: string): ItemDef {
  const i = DB.items[id];
  if (!i) throw new Error(`Item desconhecido: ${id}`);
  return i;
}

export function registerGameData(data: DataRegistry): void {
  data.register('classes', classes as ClassDef[]);
  data.register('skills', skills as SkillDef[]);
  data.register('combos', combos as ComboDef[]);
  data.register('items', items as ItemDef[]);
  data.register('enemies', enemies as EnemyDef[]);
  data.register('countries', countries as CountryDef[]);
  data.register('creatures', Object.values(DB.creatures));
}
