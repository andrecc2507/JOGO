import { Rng } from '@core';
import { DB, type ClassId } from '../data';
import { unitFromCharacter } from '../battle/units';
import type { BattleUnit } from '../battle/types';
import { makeCharacter } from '../rules/recruit';
import type { Character } from '../rules/character';

/** Primeiras habilidades de cada teia de evolução da classe. */
function firstSkills(cls: ClassId, per = 2): string[] {
  return (DB.trees[cls]?.nodes ?? []).filter((n) => n.type === 'evolucao').flatMap((n) => n.skills.slice(0, per).map((s) => s.id));
}

/** Esquadrão de teste com o começo de cada teia da classe e itens de campo. */
export function devCharacters(level: number, seed = 7): Character[] {
  const rng = new Rng(seed);
  const classes: ClassId[] = ['guerreiro', 'arqueiro', 'mago', 'mago', 'clerigo', 'ladrao'];
  return classes.map((cls, i) => {
    const c = makeCharacter(rng, { classId: cls, level });
    c.skills = firstSkills(cls);
    c.skillRanks = {};
    c.equipment.utility = ['pocao_de_vida', i % 2 ? 'frasco_de_fogo' : 'frasco_dagua', i === 5 ? 'bomba_de_fumaca' : 'frasco_de_oleo'];
    return c;
  });
}

export function devPlayerUnits(level: number): BattleUnit[] {
  return devCharacters(level).map((c) => unitFromCharacter(c, 'player'));
}
