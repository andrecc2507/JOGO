import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { attack, createBattle, moveUnit, reachable, settleStructures, teamVision, toggleDoor, wallTarget } from '@game/battle/engine';
import { hasLos } from '@game/battle/los';
import { createEmptyMap, tileAt, type BattleMap } from '@game/battle/map';
import * as stack from '@game/battle/stack';
import type { BattleState, BattleUnit, TimeOfDay } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { building, stamp } from '@game/mapgen/structures';
import { makeCharacter } from '@game/rules/recruit';

/** Casa de pedra 4×4 em (5, 5), 2 andares, sem janelas: porta em (6, 8), escada interna em (6, 6). */
function town(windows = 0): BattleMap {
  const map = createEmptyMap(16, 16, 'planicie');
  building(map, 5, 5, 4, 4, 2, { wall: 'muralha', floor: 'madeira', roof: 'ardosia', windows, furniture: [] });
  return map;
}

function battle(map: BattleMap, timeOfDay?: TimeOfDay): { s: BattleState; hero: BattleUnit; foe: BattleUnit } {
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const s = createBattle({ map, players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 1, timeOfDay, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const h = s.units.find((u) => u.team === 'player')!;
  const f = s.units.find((u) => u.team === 'enemy')!;
  [h.x, h.y] = [6, 11];
  [f.x, f.y] = [14, 1];
  delete h.z;
  delete f.z;
  s.activeUid = h.uid;
  s.turn = { moved: false, acted: false, startX: h.x, startY: h.y, moveLeft: 99 };
  h.move = 20;
  return { s, hero: h, foe: f };
}

describe('prédios: andares, portas, janelas e escadas', () => {
  it('casa oca: térreo coberto, laje do 2º andar, telhado onde se anda e paredes maciças', () => {
    const map = town();
    const inside = tileAt(map, 7, 7)!;
    expect(stack.standable(inside, 0)).toBe(true);
    expect(stack.covered(inside, 0)).toBe(true);
    // Piso do 2º andar 3 níveis acima do térreo; telhado no topo.
    expect(stack.topOf(inside, 1)).toBe(inside.h + stack.STOREY);
    expect(stack.standable(inside, 1)).toBe(true);
    expect(stack.covered(inside, stack.topLevel(inside))).toBe(false);
    const wall = tileAt(map, 5, 6)!;
    expect(stack.standable(wall, 0)).toBe(false);
    expect(stack.standable(wall, stack.topLevel(wall))).toBe(true);
    // Porta no meio da frente, escada no canto de dentro.
    expect(tileAt(map, 6, 8)!.door).toBe(true);
    expect(tileAt(map, 6, 6)!.ladder).toBe(true);
  });

  it('dá para 20 andares', () => {
    const map = createEmptyMap(12, 12, 'planicie');
    stamp(map, 'predio', 3, 3, 4, 4, 20);
    const t = tileAt(map, 4, 4)!;
    expect(stack.columnTop(t)).toBe(t.h + 20 * stack.STOREY);
    expect(stack.levelCount(t)).toBeGreaterThanOrEqual(21);
  });

  it('entra pela porta (abre ao passar) e sobe pela escada até o telhado', () => {
    const { s, hero } = battle(town());
    const r = reachable(s, hero);
    expect(r.cost.has(stack.cellId(s.map, 7, 7, 0))).toBe(true);
    const roof = tileAt(s.map, 7, 7)!;
    expect(r.cost.has(stack.cellId(s.map, 7, 7, stack.topLevel(roof)))).toBe(true);
    moveUnit(s, hero, 7, 7, 0);
    expect([hero.x, hero.y]).toEqual([7, 7]);
    expect(stack.doorClosed(tileAt(s.map, 6, 8)!, 0)).toBe(false);
  });

  it('sem escada nem salto não se sobe na parede; voando, sim', () => {
    const { s, hero } = battle(town());
    tileAt(s.map, 6, 6)!.ladder = false;
    hero.jump = 1;
    const top = stack.cellId(s.map, 5, 7, stack.topLevel(tileAt(s.map, 5, 7)!));
    expect(reachable(s, hero).cost.has(top)).toBe(false);
    hero.statuses.voando = 2;
    expect(reachable(s, hero).cost.has(top)).toBe(true);
  });

  it('parede e porta fechada cortam a visão; janela e porta aberta deixam passar', () => {
    const map = town();
    expect(hasLos(map, 6, 11, 6, 6)).toBe(false);
    tileAt(map, 6, 8)!.open = true;
    expect(hasLos(map, 6, 11, 6, 6)).toBe(true);
    // Janela na parede leste (8, 6): peitoril, vão de 1 nível, parede em cima.
    const w = tileAt(map, 8, 6)!;
    w.up = [{ b: 1, h: 2, t: 'muralha' }, { b: 3, h: 6, t: 'muralha' }, ...w.up!.filter((p) => p.b >= 6)];
    expect(hasLos(map, 11, 6, 7, 6)).toBe(true);
    // Mas não se passa pela janela (vão de 1 nível).
    expect(stack.standable(w, 1)).toBe(false);
  });

  it('dentro de casa há névoa mesmo de dia, até abrir a porta', () => {
    const { s, hero } = battle(town(), 'dia');
    [hero.x, hero.y] = [6, 9];
    const inside = stack.cellId(s.map, 7, 6, 0);
    expect(teamVision(s, 'player').has(inside)).toBe(false);
    expect(teamVision(s, 'player').has(stack.cellId(s.map, 2, 2, 0))).toBe(true);
    expect(toggleDoor(s, hero, 6, 8)).toBe(true);
    expect(teamVision(s, 'player').has(stack.cellId(s.map, 6, 6, 0))).toBe(true);
  });
});

describe('prédios: destruição e desabamento', () => {
  it('peça sem apoio cai e vira escombro; balanço lateral segura até o limite', () => {
    const map = createEmptyMap(8, 3, 'planicie');
    const col = (x: number) => tileAt(map, x, 1)!;
    col(0).up = [{ b: 1, h: 4, t: 'muralha' }, { b: 4, h: 5, t: 'lajota' }];
    for (let x = 1; x <= 4; x++) col(x).up = [{ b: 4, h: 5, t: 'lajota' }];
    const falls = stack.settle(map);
    // Balanço de 3 casas fica; a 4ª cai (3 níveis: vira escombro).
    expect(col(3).up![0]!.b).toBe(4);
    expect(falls.map((f) => f.x)).toEqual([4]);
    expect(col(4).up![0]!.t).toBe('escombros');
    expect(col(4).up![0]!.b).toBe(1);
  });

  it('derrubar a base faz o resto da coluna desabar', () => {
    const map = createEmptyMap(3, 3, 'planicie');
    const t = tileAt(map, 1, 1)!;
    t.up = [{ b: 1, h: 4, t: 'muralha' }, { b: 4, h: 7, t: 'muralha' }, { b: 7, h: 10, t: 'muralha' }];
    expect(stack.wouldCollapse(map, 1, 1, 1)).toBe(2);
    expect(stack.damagePiece(t, 1, 9999)).not.toBeNull();
    stack.settle(map);
    expect(t.up!.every((p) => p.t === 'escombros')).toBe(true);
    expect(stack.columnTop(t)).toBeLessThan(10);
  });

  it('quem está em cima despenca (dano de queda); quem está embaixo é soterrado', () => {
    const map = createEmptyMap(8, 8, 'planicie');
    const { s, hero, foe } = battle(map);
    const t = tileAt(s.map, 3, 3)!;
    t.up = [{ b: 1, h: 4, t: 'muralha' }, { b: 4, h: 7, t: 'muralha' }, { b: 7, h: 10, t: 'muralha' }];
    [hero.x, hero.y] = [3, 3];
    hero.z = 10;
    hero.jump = 1;
    // Laje sobre a cabeça do lobo, presa só na parede vizinha.
    const n = tileAt(s.map, 5, 5)!;
    const w = tileAt(s.map, 6, 5)!;
    w.up = [{ b: 1, h: 6, t: 'muralha' }];
    n.up = [{ b: 3, h: 5, t: 'lajota' }];
    [foe.x, foe.y] = [5, 5];
    delete foe.z;
    const hp0 = hero.hp;
    const fhp0 = foe.hp;
    stack.damagePiece(t, 1, 9999);
    stack.damagePiece(w, 1, 9999);
    settleStructures(s);
    expect(hero.hp).toBeLessThan(hp0);
    expect(stack.unitH(s.map, hero)).toBeLessThan(10);
    expect(foe.hp).toBeLessThan(fhp0);
    expect(stack.unitH(s.map, foe)).toBeGreaterThan(1);
  });

  it('ataque básico acerta a parede vizinha e tira resistência', () => {
    const { s, hero } = battle(town());
    [hero.x, hero.y] = [4, 6];
    const l = wallTarget(s, hero, 5, 6);
    expect(l).toBeGreaterThan(0);
    const piece = tileAt(s.map, 5, 6)!.up![l - 1]!;
    expect(attack(s, hero, 5, 6)).toBe(true);
    expect(stack.pieceHp(piece)).toBeLessThan(stack.pieceMaxHp(piece));
  });
});
