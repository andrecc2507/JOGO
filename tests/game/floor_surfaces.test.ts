import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { createBattle } from '@game/battle/engine';
import { applyElementToTile, environmentTick, surfaceAt, surfaceUnder, tileEffectsOnUnit } from '@game/battle/elements';
import { createEmptyMap, tileAt } from '@game/battle/map';
import * as stack from '@game/battle/stack';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { building } from '@game/mapgen/structures';
import { makeCharacter } from '@game/rules/recruit';

/** Casa de enxaimel com telhado de palha 4×4 em (4, 4), 1 andar. */
function setup() {
  const map = createEmptyMap(12, 12, 'planicie');
  building(map, 4, 4, 4, 4, 1, { wall: 'enxaimel', floor: 'madeira', roof: 'palha', windows: 0, furniture: [] });
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const s = createBattle({ map, players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 1, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const h = s.units.find((u) => u.team === 'player')!;
  const f = s.units.find((u) => u.team === 'enemy')!;
  [f.x, f.y] = [11, 11];
  delete f.z;
  return { s, h };
}

describe('superfícies nos andares', () => {
  it('fogo mirado na casa pega no telhado, não no chão de dentro', () => {
    const { s, h } = setup();
    [h.x, h.y] = [0, 0];
    delete h.z;
    applyElementToTile(s, 5, 5, 'fogo');
    const t = tileAt(s.map, 5, 5)!;
    expect(surfaceAt(s.map, 5, 5, stack.topLevel(t))?.s).toBe('fogo');
    expect(t.s ?? null).toBeNull();
  });

  it('quem está no telhado em chamas queima; fogo no chão não alcança o telhado', () => {
    const { s, h } = setup();
    const t = tileAt(s.map, 6, 6)!;
    [h.x, h.y] = [6, 6];
    stack.setLevel(s.map, h, stack.topLevel(t));
    t.s = 'fogo';
    t.sTtl = 3;
    expect(surfaceUnder(s, h)).toBeNull();
    tileEffectsOnUnit(s, h);
    expect(h.statuses.queimando).toBeUndefined();
    applyElementToTile(s, 6, 6, 'fogo');
    expect(surfaceUnder(s, h)).toBe('fogo');
    tileEffectsOnUnit(s, h);
    expect(h.statuses.queimando).toBeGreaterThan(0);
  });

  it('telhado de palha queima, se espalha e acaba consumido', () => {
    const { s, h } = setup();
    [h.x, h.y] = [0, 0];
    delete h.z;
    const t = tileAt(s.map, 5, 5)!;
    const levels0 = stack.levelCount(t);
    applyElementToTile(s, 5, 5, 'fogo');
    for (let r = 0; r < 12; r++) environmentTick(s);
    const burning = [...Array(4).keys()].flatMap((dy) => [...Array(4).keys()].map((dx) => tileAt(s.map, 4 + dx, 4 + dy)!)).filter((c) => c.up?.some((p) => p.s === 'fogo'));
    expect(stack.levelCount(t) < levels0 || burning.length > 1).toBe(true);
    expect(s.log.some((l) => l.includes('O fogo consome'))).toBe(true);
  });

  it('água no assoalho do andar molha quem está lá', () => {
    const map = createEmptyMap(8, 8, 'planicie');
    const t = tileAt(map, 3, 3)!;
    t.up = [{ b: 1, h: 4, t: 'muralha' }, { b: 6, h: 7, t: 'madeira' }];
    const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'mago', level: 5 }), 'player');
    const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
    const s = createBattle({ map, players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 1, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
    const h = s.units.find((u) => u.team === 'player')!;
    [h.x, h.y] = [3, 3];
    stack.setLevel(s.map, h, 2);
    applyElementToTile(s, 3, 3, 'agua');
    expect(surfaceUnder(s, h)).toBe('agua');
    expect(tileAt(s.map, 3, 3)!.s ?? null).toBeNull();
    tileEffectsOnUnit(s, h);
    expect(h.statuses.molhado).toBeGreaterThan(0);
  });
});
