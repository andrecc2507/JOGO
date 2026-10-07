import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { attack, castSkill, createBattle, damage, inRange, reachable, type SkillLike } from '@game/battle/engine';
import { createEmptyMap, idx, tileAt } from '@game/battle/map';
import type { BattleState, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import * as confine from '@game/battle/confine';
import * as conc from '@game/battle/concentration';
import { planTurn } from '@game/battle/ai';
import { makeCharacter } from '@game/rules/recruit';

const SK = () => DB.skills.selos_selo_de_confinamento! as SkillLike;

function battle(): { s: BattleState; hero: BattleUnit; ally: BattleUnit; foe: BattleUnit } {
  const c = makeCharacter(new Rng(1), { classId: 'ladrao', level: 40 });
  c.skills = ['selos_selo_de_confinamento'];
  const hero = unitFromCharacter(c, 'player');
  const ally = unitFromCharacter(makeCharacter(new Rng(4), { classId: 'arqueiro', level: 10 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const s = createBattle({ map: createEmptyMap(16, 16, 'planicie'), players: [hero, ally], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 3, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const [h, a] = s.units.filter((u) => u.team === 'player') as [BattleUnit, BattleUnit];
  const f = s.units.find((u) => u.team === 'enemy')!;
  [h.x, h.y] = [2, 2];
  [a.x, a.y] = [5, 2];
  [f.x, f.y] = [7, 7];
  h.mp = h.maxMp = 999;
  s.activeUid = h.uid;
  s.turn = { moved: false, acted: false, startX: 2, startY: 2, moveLeft: 9 };
  return { s, hero: h, ally: a, foe: f };
}

function cage(s: BattleState, hero: BattleUnit): void {
  confine.setFirstCorner(hero, 5, 5);
  expect(castSkill(s, hero, SK(), 9, 9)).toBe(true);
}

describe('Selo de Confinamento', () => {
  it('4 selos nos cantos, ninguém entra ou sai, nada atravessa', () => {
    const { s, hero, ally, foe } = battle();
    cage(s, hero);
    for (const [x, y] of [[5, 5], [9, 5], [5, 9], [9, 9]] as [number, number][]) expect(tileAt(s.map, x, y)!.p).toBe('selo_confinamento');
    expect(hero.statuses.concentrando).toBeGreaterThan(0);
    // Movimento: o lobo não sai.
    s.activeUid = foe.uid;
    s.turn = { moved: false, acted: false, startX: 7, startY: 7, moveLeft: 20 };
    foe.move = 20;
    expect(reachable(s, foe).cost.has(idx(s.map, 11, 7))).toBe(false);
    // Ataques: de fora para dentro e de dentro para fora são barrados.
    [ally.x, ally.y] = [7, 4];
    expect(inRange(s, ally, 5, foe.x, foe.y)).toBe(false);
    const hp = foe.hp;
    attack(s, ally, foe.x, foe.y);
    expect(foe.hp).toBe(hp);
  });

  it('quem está dentro quebra um selo e as paredes caem', () => {
    const { s, hero, foe } = battle();
    cage(s, hero);
    [foe.x, foe.y] = [6, 5];
    s.activeUid = foe.uid;
    s.turn = { moved: false, acted: false, startX: 6, startY: 5 };
    const plan = planTurn(s, foe);
    expect(plan.action).toMatchObject({ kind: 'attack', x: 5, y: 5 });
    tileAt(s.map, 5, 5)!.pHp = 1;
    attack(s, foe, 5, 5);
    expect(s.confines ?? []).toHaveLength(0);
    expect(hero.statuses.concentrando).toBeUndefined();
    expect(tileAt(s.map, 9, 9)!.p).toBeNull();
  });

  it('quem está fora quebra a concentração de quem conjurou', () => {
    const { s, hero } = battle();
    cage(s, hero);
    s.rng = new Rng(9);
    for (let i = 0; i < 40 && s.confines?.length; i++) conc.onDamaged(s, hero, Math.round(hero.maxHp * 0.9));
    expect(s.confines ?? []).toHaveLength(0);
    void damage;
  });

  it('dura no máximo 3 rodadas; retângulo precisa de 3 a 7 casas de lado', () => {
    const { s, hero } = battle();
    cage(s, hero);
    for (let i = 0; i < 3; i++) confine.confineTick(s);
    expect(s.confines ?? []).toHaveLength(0);
    expect(confine.rectOf(s, 0, 0, 1, 5)).toBeNull();
    expect(confine.rectOf(s, 0, 0, 8, 3)).toBeNull();
    expect(confine.rectOf(s, 2, 2, 6, 4)).not.toBeNull();
  });
});
