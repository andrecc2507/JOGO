import type { DataRegistry } from '@core';
import classes from './classes/classes.json';
import combos from './skills/combos.json';
import skills from './skills/skills.json';
import items from './items/items.json';
import enemies from './enemies/enemies.json';
import countries from './world/countries.json';
import type { ClassDef, ClassId, ComboDef, CountryDef, EnemyDef, ItemDef, SkillDef } from './types';

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
};

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
}
