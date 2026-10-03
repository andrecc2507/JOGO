import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { createBattle, hideChance, moveUnit, useItem, type SkillLike, castSkill } from '@game/battle/engine';
import { createEmptyMap, tileAt } from '@game/battle/map';
import type { BattleState, BattleUnit, TimeOfDay } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import * as tactics from '@game/battle/tactics';
import * as stack from '@game/battle/stack';
import { makeCharacter } from '@game/rules/recruit';
import { shoveChance, advantageChance, concentrationChance } from '@game/rules/stats';
import { damageProp } from '@game/battle/props';

function battle(timeOfDay?: TimeOfDay): { s: BattleState; hero: BattleUnit; foe: BattleUnit } {
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const s = createBattle({ map: createEmptyMap(16, 16, 'planicie'), players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 3, timeOfDay, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const h = s.units.find((u) => u.team === 'player')!;
  const f = s.units.find((u) => u.team === 'enemy')!;
  [h.x, h.y] = [5, 5];
  [f.x, f.y] = [6, 5];
  s.activeUid = h.uid;
  s.turn = { moved: false, acted: false, startX: 5, startY: 5, moveLeft: 9 };
  return { s, hero: h, foe: f };
}

describe('táticas: empurrar, arremessar, objetos', () => {
  it('Força × Força: mais força, mais chance; limites 5–95%', () => {
    expect(shoveChance(20, 10)).toBeGreaterThan(shoveChance(10, 10));
    expect(shoveChance(10, 40)).toBe(5);
    expect(shoveChance(60, 1)).toBe(95);
  });

  it('empurrar do telhado: cai e leva dano de queda; só uma vez por turno', () => {
    const { s, hero, foe } = battle();
    // Herói e lobo num platô alto; do lado do lobo, chão 6 níveis abaixo.
    for (const [x, y] of [[5, 5], [6, 5]] as [number, number][]) tileAt(s.map, x, y)!.h = 8;
    hero.attrs.str = 99;
    const hp = foe.hp;
    expect(tactics.shove(s, hero, 6, 5)).toBe(true);
    expect(foe.x).toBeGreaterThan(6);
    expect(foe.hp).toBeLessThan(hp);
    expect(tactics.shoveTargets(s, hero)).toEqual([]);
  });

  it('empurrar contra parede: bate e fica', () => {
    const { s, hero, foe } = battle();
    hero.attrs.str = 99;
    tileAt(s.map, 7, 5)!.up = [{ b: 1, h: 5, t: 'muralha' }];
    const hp = foe.hp;
    tactics.shove(s, hero, 6, 5);
    expect([foe.x, foe.y]).toEqual([6, 5]);
    expect(foe.hp).toBeLessThan(hp);
  });

  it('barril de pólvora explode ao quebrar (fogo em volta, dano, outros barris em cadeia)', () => {
    const { s, foe } = battle();
    tileAt(s.map, 7, 5)!.p = 'barril_polvora';
    tileAt(s.map, 9, 5)!.p = 'barril_polvora';
    const hp = foe.hp;
    damageProp(s, 7, 5, 999);
    expect(foe.hp).toBeLessThan(hp);
    expect(tileAt(s.map, 9, 5)!.p).toBeNull();
  });

  it('barril de óleo derrama; lustre despenca em quem está embaixo', () => {
    const { s, foe } = battle();
    tileAt(s.map, 10, 10)!.p = 'barril_oleo';
    damageProp(s, 10, 10, 999);
    expect(tileAt(s.map, 11, 10)!.s).toBe('oleo');
    tileAt(s.map, 6, 5)!.p = 'lustre';
    const hp = foe.hp;
    damageProp(s, 6, 5, 999);
    expect(foe.hp).toBeLessThan(hp);
  });

  it('arremessar objeto: barril no inimigo, em arco por cima de um muro', () => {
    const { s, hero, foe } = battle();
    [foe.x, foe.y] = [5, 8];
    tileAt(s.map, 5, 6)!.p = 'barril';
    tileAt(s.map, 5, 7)!.p = 'muro';
    hero.attrs.str = 30;
    const hp = foe.hp;
    expect(tactics.throwSources(s, hero).length).toBe(1);
    expect(tactics.throwProp(s, hero, 5, 6, 5, 8)).toBe(true);
    expect(foe.hp).toBeLessThan(hp);
    expect(s.turn.acted).toBe(true);
  });
});

describe('táticas: supressão, tiro perdido, luz', () => {
  const SUPPRESS: SkillLike = { id: 'teste_supressao', name: 'Rajada', mp: 0, range: 5, target: 'enemy', shape: 'single', kind: 'ranged', power: 1 };

  it('supressão: alvo suprimido; ao sair do lugar leva o tiro e a supressão acaba', () => {
    const { s, hero, foe } = battle();
    [foe.x, foe.y] = [5, 9];
    tactics.suppress(s, hero, foe);
    expect(foe.statuses.suprimido).toBeGreaterThan(0);
    expect(hideChance(s, foe)).toBe(0);
    s.activeUid = foe.uid;
    s.turn = { moved: false, acted: false, startX: 5, startY: 9, moveLeft: 9 };
    const logs = s.log.length;
    moveUnit(s, foe, 6, 9);
    expect(foe.statuses.suprimido).toBeUndefined();
    expect(s.log.slice(logs).some((l) => l.includes('saiu da cobertura'))).toBe(true);
    void SUPPRESS;
    void castSkill;
  });

  it('tiro perdido segue a linha e pode pegar quem está atrás (de qualquer lado)', () => {
    const { s, hero, foe } = battle();
    [foe.x, foe.y] = [5, 8];
    const ally = unitFromCharacter(makeCharacter(new Rng(9), { classId: 'mago', level: 5 }), 'player');
    [ally.x, ally.y] = [5, 10];
    s.units.push(ally);
    const hp = ally.hp;
    s.rng = new Rng(1);
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) {
      tactics.strayShot(s, hero, foe, 20);
      hit = ally.hp < hp;
    }
    expect(hit).toBe(true);
  });

  it('poção arremessada cura em área (efeito menor); tocha ilumina e impede esconder', () => {
    const { s, hero } = battle('noite');
    hero.items = ['pocao_de_vida', 'tocha'];
    delete hero.itemUses;
    const ally = unitFromCharacter(makeCharacter(new Rng(9), { classId: 'mago', level: 5 }), 'player');
    [ally.x, ally.y] = [5, 8];
    ally.hp = 1;
    s.units.push(ally);
    expect(useItem(s, hero, 0, 5, 8)).toBe(true);
    expect(ally.hp).toBeGreaterThan(1);
    s.turn.acted = false;
    useItem(s, hero, 1, 5, 5);
    expect(hero.statuses.tocha).toBeGreaterThan(0);
    expect(hideChance(s, hero)).toBe(0);
  });

  it('vantagem e desvantagem; concentração cai com golpes grandes', () => {
    expect(advantageChance(50, 1)).toBe(75);
    expect(advantageChance(50, -1)).toBe(25);
    expect(concentrationChance(10, 10, 5, 100)).toBeGreaterThan(concentrationChance(10, 10, 60, 100));
    void stack;
  });
});
