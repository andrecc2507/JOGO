import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, type SkillDef } from '@game/data';
import { buildResult, castSkill, createBattle, damage, moveBudget, reachable, type SkillLike } from '@game/battle/engine';
import { coverFrom } from '@game/battle/cover';
import { createEmptyMap, tileAt } from '@game/battle/map';
import type { BattleState, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import * as downed from '@game/battle/downed';
import * as build from '@game/battle/build';
import * as conc from '@game/battle/concentration';
import * as patrol from '@game/battle/patrol';
import * as stack from '@game/battle/stack';
import { runAiTurn } from '@game/battle/ai';
import { makeCharacter } from '@game/rules/recruit';

function battle(): { s: BattleState; hero: BattleUnit; ally: BattleUnit; foe: BattleUnit } {
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 5 }), 'player');
  const ally = unitFromCharacter(makeCharacter(new Rng(5), { classId: 'mago', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const s = createBattle({ map: createEmptyMap(16, 16, 'planicie'), players: [hero, ally], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 3, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const [h, a] = s.units.filter((u) => u.team === 'player') as [BattleUnit, BattleUnit];
  const f = s.units.find((u) => u.team === 'enemy')!;
  h.charId ??= 'c1';
  a.charId ??= 'c2';
  [h.x, h.y] = [5, 5];
  [a.x, a.y] = [6, 5];
  [f.x, f.y] = [12, 12];
  s.activeUid = h.uid;
  s.turn = { moved: false, acted: false, startX: 5, startY: 5, moveLeft: 9 };
  return { s, hero: h, ally: a, foe: f };
}

/** Instala uma habilidade de teste no banco (e remove depois). */
function withSkill(def: Partial<SkillDef> & { id: string }, fn: (s: SkillLike) => void): void {
  const full = { name: def.id, classId: 'mago', mp: 0, range: 4, target: 'tile', shape: 'single', kind: 'utility', power: 0, description: '', ...def } as SkillDef;
  DB.skills[def.id] = full;
  try {
    fn(full as unknown as SkillLike);
  } finally {
    delete DB.skills[def.id];
  }
}

describe('sangrando, estabilizar e carregar', () => {
  it('herói a 0 cai sangrando; aliado estabiliza; golpe devastador mata de vez', () => {
    const { s, hero, ally } = battle();
    damage(s, ally, ally.hp, undefined, undefined);
    expect(ally.alive).toBe(false);
    expect(ally.downed).toBe(3);
    expect(downed.downedTargets(s, hero)).toHaveLength(1);
    expect(downed.stabilize(s, hero, 6, 5)).toBe(true);
    expect(ally.alive).toBe(true);
    expect(ally.hp).toBeGreaterThan(0);
    const { s: s2, ally: a2 } = battle();
    damage(s2, a2, a2.hp + a2.maxHp * 2, undefined, undefined);
    expect(a2.downed).toBeUndefined();
  });

  it('sangra até morrer se ninguém ajudar; vencer com ele caído o salva', () => {
    const { s, ally } = battle();
    damage(s, ally, ally.hp, undefined, undefined);
    downed.bleedTick(s);
    s.outcome = 'victory';
    expect(buildResult(s, s.context!).units.find((u) => u.charId === ally.charId)!.alive).toBe(true);
    downed.bleedTick(s);
    downed.bleedTick(s);
    expect(ally.downed).toBeUndefined();
    expect(buildResult(s, s.context!).units.find((u) => u.charId === ally.charId)!.alive).toBe(false);
  });

  it('carregar: o corpo vai junto e quem carrega anda menos', () => {
    const { s, hero, ally } = battle();
    damage(s, ally, ally.hp, undefined, undefined);
    const before = moveBudget(hero);
    expect(downed.pickUp(s, hero, 6, 5)).toBe(true);
    expect(moveBudget(hero)).toBe(before - 2);
    hero.x = 3;
    downed.followCarrier(s, hero);
    expect(ally.x).toBe(3);
    expect(downed.putDown(s, hero)).toBe(true);
    expect(ally.carriedBy).toBeUndefined();
  });
});

describe('construção tática e arremesso de aliado', () => {
  it('muralha atravessada vira cobertura; rampa leva ao telhado', () => {
    const { s, hero } = battle();
    withSkill({ id: 'teste_muralha', fx: { build: { shape: 'wall', length: 3, height: 2 } } }, (sk) => {
      expect(castSkill(s, hero, sk, 5, 7)).toBe(true);
    });
    for (const x of [4, 5, 6]) expect(tileAt(s.map, x, 7)!.up?.length).toBe(1);
    expect(coverFrom(s.map, 5, 8, 0, -1)).toBe('full');
    // Rampa até um telhado de 3 níveis.
    const { s: s2, hero: h2, ally: a2 } = battle();
    h2.jump = 1;
    [a2.x, a2.y] = [1, 1];
    tileAt(s2.map, 9, 5)!.up = [{ b: 1, h: 4, t: 'muralha' }];
    withSkill({ id: 'teste_rampa', fx: { build: { shape: 'ramp', length: 3, terrain: 'gelo_eterno', turns: 2 } } }, (sk) => {
      expect(castSkill(s2, h2, sk, 6, 5)).toBe(true);
    });
    const roof = stack.cellId(s2.map, 9, 5, 1);
    expect(reachable(s2, h2).cost.has(roof)).toBe(true);
    build.buildTick(s2);
    build.buildTick(s2);
    expect(tileAt(s2.map, 6, 5)!.up).toBeUndefined();
  });

  it('criatura grande arremessa o aliado até o telhado', () => {
    const { s, hero, ally } = battle();
    withSkill({ id: 'teste_catapulta', kind: 'utility', passive: true, fx: { launcher: true } } as never, () => {
      ally.skills = [...ally.skills, 'teste_catapulta'];
      tileAt(s.map, 5, 8)!.up = [{ b: 1, h: 7, t: 'muralha' }];
      const targets = build.launchTargets(s, hero);
      expect(targets).toContain(5 + 8 * s.map.w);
      expect(build.launch(s, hero, 5, 8)).toBe(true);
      expect(stack.unitH(s.map, hero)).toBe(7);
      expect(build.launchTargets(s, hero)).toEqual([]);
    });
  });
});

describe('concentração e patrulhas', () => {
  it('golpe forte no conjurador desfaz o reforço mantido por concentração', () => {
    const { s, hero, ally } = battle();
    withSkill({ id: 'teste_conc', kind: 'buff', target: 'ally', range: 3, status: { id: 'fortificado', turns: 5 }, fx: { concentration: true } }, (sk) => {
      castSkill(s, ally, sk, 5, 5);
    });
    expect(hero.statuses.fortificado).toBeGreaterThan(0);
    expect(ally.statuses.concentrando).toBeGreaterThan(0);
    s.rng = new Rng(7);
    for (let i = 0; i < 30 && s.conc?.[ally.uid]; i++) conc.onDamaged(s, ally, Math.round(ally.maxHp * 0.8));
    expect(s.conc?.[ally.uid]).toBeUndefined();
    expect(hero.statuses.fortificado).toBeUndefined();
  });

  it('patrulha desavisada não ataca; ao ver alguém, o grupo inteiro desperta', () => {
    const { s, hero, foe } = battle();
    patrol.assignPods(s);
    expect(foe.unaware).toBe(true);
    hero.hidden = true;
    s.activeUid = foe.uid;
    s.turn = { moved: false, acted: false, startX: foe.x, startY: foe.y, moveLeft: foe.move };
    const plan = runAiTurn(s, foe);
    expect(plan.action).toBeNull();
    hero.hidden = false;
    [hero.x, hero.y] = [foe.x - 1, foe.y];
    patrol.checkAlerts(s);
    expect(foe.unaware).toBe(false);
  });
});
