import { describe, expect, it } from 'vitest';
import { DB, type Attr } from '@game/data';
import * as stats from '@game/rules/stats';

const treeSkills = () =>
  Object.values(DB.trees).flatMap((t) => t!.nodes.flatMap((n) => n.skills.map((s) => ({ tree: t!.classId, node: n.id, def: DB.skills[s.id]! }))));
const scalingOf = (tree: string, node: string, kind: string) => treeSkills().find((x) => x.tree === tree && x.node === node && x.def.kind === kind)!.def.scaling;

/** Poder da escala numa build de nível 60 (60/50/40/30/10, o maior valor no maior peso). */
function bestPower(sc: Partial<Record<Attr, number>>): number {
  const build = [60, 50, 40, 30, 10];
  return Object.values(sc)
    .sort((a, b) => b! - a!)
    .reduce((sum: number, w, i) => sum + w! * stats.attrPower(build[i]!), 0);
}

describe('escala das habilidades por subclasse', () => {
  it('cada subclasse escala com os seus atributos', () => {
    expect(scalingOf('guerreiro', 'berserker', 'physical')).toEqual({ str: 1 });
    expect(Object.keys(scalingOf('guerreiro', 'arcano', 'physical')!).sort()).toEqual(['int', 'str']);
    expect(Object.keys(scalingOf('guerreiro', 'arcano', 'magic')!).sort()).toEqual(['int', 'str']);
    expect(scalingOf('arqueiro', 'sniper', 'ranged')).toEqual({ dex: 1 });
    expect(scalingOf('arqueiro', 'arcano', 'magic')).toEqual({ int: 1 });
    expect(Object.keys(scalingOf('arqueiro', 'atirador_runico', 'magic')!).sort()).toEqual(['dex', 'int']);
    expect(scalingOf('mago', 'fogo', 'magic')).toEqual({ int: 1 });
  });

  it('toda habilidade com dano (poder > 0) ou cura das teias tem escala definida', () => {
    for (const { def } of treeSkills())
      if (((def.kind === 'physical' || def.kind === 'ranged' || def.kind === 'magic') && def.power > 0) || def.kind === 'heal') expect(def.scaling, def.id).toBeTruthy();
  });

  it('equilíbrio: na build máxima, toda escala dá poder entre 90 e 100 (puro = 96)', () => {
    for (const t of Object.values(DB.trees))
      for (const n of t!.nodes)
        for (const sc of Object.values(n.scaling ?? {})) {
          const p = bestPower(sc!);
          expect(p, `${t!.classId}/${n.id}`).toBeGreaterThanOrEqual(90);
          expect(p, `${t!.classId}/${n.id}`).toBeLessThanOrEqual(100);
        }
  });

  it('magia mista (FOR/DES + INT) usa a arma; magia pura só com varinha ou bastão', () => {
    expect(stats.magicUsesWeapon('espada', { str: 0.55, int: 0.55 })).toBe(true);
    expect(stats.magicUsesWeapon('arco', { dex: 0.55, int: 0.55 })).toBe(true);
    expect(stats.magicUsesWeapon('espada', { int: 1 })).toBe(false);
    expect(stats.magicUsesWeapon('varinha', { int: 1 })).toBe(true);
  });

  it('cura escala pela teia (Defensor: INT + VIT)', () => {
    const base = { str: 10, dex: 10, spd: 10, int: 20, vit: 10 };
    const sc = { int: 0.55, vit: 0.55 };
    expect(stats.healPower({ ...base, vit: 40 }, 0, 0, 10, sc)).toBeGreaterThan(stats.healPower(base, 0, 0, 10, sc));
    expect(stats.healPower({ ...base, vit: 40 }, 0, 0, 10)).toBe(stats.healPower(base, 0, 0, 10));
  });
});
