import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { castSmoke, driftSmoke, environmentTick, steerSmoke, applyElementToTile, SMOKE_TURNS } from '@game/battle/elements';
import { FLASH_TURNS, castSkill, createBattle, previewHit, useItem } from '@game/battle/engine';
import { createEmptyMap, tileAt, type BattleMap } from '@game/battle/map';
import type { BattleSetup, BattleState, BattleUnit } from '@game/battle/types';
import { unitFromCharacter } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { BALANCE } from '@game/rules/stats';

function unit(classId: 'guerreiro' | 'arqueiro' | 'mago', team: 'player' | 'enemy', seed: number): BattleUnit {
  const c = makeCharacter(new Rng(seed), { classId, level: 3 });
  c.skills = [];
  return unitFromCharacter(c, team);
}

function setup(map: BattleMap, players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map, players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 7, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

function duel(ax: number, ay: number, bx: number, by: number): { s: BattleState; a: BattleUnit; d: BattleUnit } {
  const a = unit('arqueiro', 'player', 1);
  const d = unit('guerreiro', 'enemy', 2);
  const s = createBattle(setup(createEmptyMap(10, 10, 'planicie'), [a], [d]));
  const [pa, pd] = [s.units.find((u) => u.team === 'player')!, s.units.find((u) => u.team === 'enemy')!];
  [pa.x, pa.y, pd.x, pd.y] = [ax, ay, bx, by];
  return { s, a: pa, d: pd };
}

describe('fumaça', () => {
  it('não corta a linha de tiro, mas penaliza muito o acerto através dela', () => {
    const { s, a, d } = duel(1, 5, 5, 5);
    const clear = previewHit(s, a, d, 'physical', 0);
    applyElementToTile(s, 3, 5, 'fumaca');
    const smoky = previewHit(s, a, d, 'physical', 0);
    expect(smoky.obscured).toBe(true);
    expect(smoky.chance).toBe(Math.max(BALANCE.hit.min, clear.chance - BALANCE.hit.obscuredPenalty));
  });

  it('alvo dentro da fumaça também é turvado; magia também sofre', () => {
    const { s, a, d } = duel(1, 5, 5, 5);
    const before = previewHit(s, a, d, 'magic', 0);
    applyElementToTile(s, 5, 5, 'fumaca');
    const after = previewHit(s, a, d, 'magic', 0);
    expect(after.obscured).toBe(true);
    expect(after.chance).toBeLessThan(before.chance - 20);
  });

  it('adversários lado a lado (até na diagonal) não sofrem a penalidade', () => {
    for (const [bx, by] of [[2, 5], [2, 6]]) {
      const { s, a, d } = duel(1, 5, bx!, by!);
      const clear = previewHit(s, a, d, 'physical', 0);
      applyElementToTile(s, bx!, by!, 'fumaca');
      applyElementToTile(s, 1, 5, 'fumaca');
      const p = previewHit(s, a, d, 'physical', 0);
      expect(p.obscured).toBeFalsy();
      expect(p.chance).toBe(clear.chance);
    }
  });

  it('fumaça de granada fica parada e some em 3 turnos', () => {
    const { s } = duel(1, 1, 8, 8);
    applyElementToTile(s, 4, 4, 'fumaca');
    for (let i = 0; i < SMOKE_TURNS - 1; i++) environmentTick(s);
    expect(tileAt(s.map, 4, 4)!.c).toBe('fumaca');
    environmentTick(s);
    expect(tileAt(s.map, 4, 4)!.c).toBeFalsy();
  });

  it('fumaça de habilidade anda 1 casa por turno de quem lançou, na direção escolhida, até sair do mapa', () => {
    const { s, a } = duel(1, 1, 8, 8);
    castSmoke(s, a, [[7, 4], [8, 4]], 0);
    expect(s.smokeToSteer).toBe(a.uid);
    steerSmoke(s, a.uid, 0);
    expect(s.smokeToSteer).toBeUndefined();
    environmentTick(s); // não envelhece enquanto quem lançou está de pé
    driftSmoke(s, a);
    expect(tileAt(s.map, 7, 4)!.c).toBeFalsy();
    expect(tileAt(s.map, 8, 4)!.c).toBe('fumaca');
    expect(tileAt(s.map, 9, 4)!.c).toBe('fumaca');
    driftSmoke(s, a);
    driftSmoke(s, a);
    expect(s.map.tiles.some((t) => t.c === 'fumaca')).toBe(false);
  });

  it('quando quem lançou cai, a fumaça para e se dissipa', () => {
    const { s, a } = duel(1, 1, 8, 8);
    castSmoke(s, a, [[4, 4]], 1);
    a.alive = false;
    environmentTick(s); // percebe a queda: a fumaça para
    expect(tileAt(s.map, 4, 4)!.c).toBe('fumaca');
    for (let i = 0; i < SMOKE_TURNS; i++) environmentTick(s);
    expect(tileAt(s.map, 4, 4)!.c).toBeFalsy();
  });

  it('habilidade de fumaça da árvore cria fumaça andante na direção do lançamento', () => {
    const { s, a } = duel(1, 4, 8, 8);
    const sk = DB.skills.sabotador_bomba_de_fumaca_sufocante!;
    a.mp = 99;
    a.skills = [sk.id];
    expect(castSkill(s, a, { ...sk, mp: 0 }, 4, 4)).toBe(true);
    const tiles = s.map.tiles.filter((t) => t.c === 'fumaca');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.cBy === a.uid && t.cDir === 0)).toBe(true);
  });
});

describe('vento dissipa nuvens', () => {
  it('golpe de vento num alvo abre uma linha na fumaça (e na nuvem de veneno)', () => {
    const { s, a } = duel(1, 5, 6, 5);
    for (let y = 3; y <= 7; y++) for (let x = 2; x <= 7; x++) applyElementToTile(s, x, y, x === 3 && y === 5 ? 'veneno' : 'fumaca');
    a.mp = 99;
    const sk = DB.skills.elementalista_raio_de_ar!;
    expect(sk.element).toBe('vento');
    castSkill(s, a, { ...sk, mp: 0, range: 9 }, 6, 5);
    for (let x = 2; x <= 6; x++) expect(tileAt(s.map, x, 5)!.c, `${x},5`).toBeFalsy();
    expect(tileAt(s.map, 7, 5)!.c).toBe('fumaca');
    expect(tileAt(s.map, 4, 4)!.c).toBe('fumaca');
  });

  it('vento em área dissipa só a área atingida', () => {
    const { s, a } = duel(1, 5, 9, 9);
    for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++) applyElementToTile(s, x, y, 'fumaca');
    a.mp = 99;
    const sk = DB.skills.ar_vacuo_subito!;
    castSkill(s, a, { ...sk, mp: 0, range: 9 }, 6, 5);
    for (const [x, y] of [[6, 5], [5, 5], [4, 5], [6, 3], [7, 6]]) expect(tileAt(s.map, x!, y!)!.c, `${x},${y}`).toBeFalsy();
    expect(tileAt(s.map, 2, 5)!.c).toBe('fumaca');
    expect(tileAt(s.map, 3, 5)!.c).toBe('fumaca');
  });
});

describe('clarão', () => {
  it('granada de clarão cega todos na área', () => {
    const { s, a, d } = duel(3, 3, 5, 5);
    a.items = ['granada_de_clarao'];
    a.itemUses = [1];
    expect(useItem(s, a, 0, 5, 4)).toBe(true);
    expect(d.statuses.cegado).toBe(FLASH_TURNS);
  });
});
