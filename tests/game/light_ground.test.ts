import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { GROUND_AIM_BONUS, castSkill, createBattle, groundTargets, litTiles, teamVision, type SkillLike } from '@game/battle/engine';
import { createEmptyMap, idx, tileAt } from '@game/battle/map';
import type { BattleState, TimeOfDay } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { LIGHT } from '@game/rules/stats';

const FIREBALL: SkillLike = { id: 'teste_bola_de_fogo', name: 'Bola de fogo', mp: 0, range: 4, target: 'enemy', shape: 'single', kind: 'magic', power: 1, element: 'fogo' };

function battle(timeOfDay?: TimeOfDay): BattleState {
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'mago', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const map = createEmptyMap(24, 24, 'planicie');
  for (const t of map.tiles) t.t = 'pedra';
  const s = createBattle({ map, players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 1, timeOfDay, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const p = s.units.find((u) => u.team === 'player')!;
  const e = s.units.find((u) => u.team === 'enemy')!;
  [p.x, p.y] = [2, 2];
  [e.x, e.y] = [22, 22];
  s.activeUid = p.uid;
  s.turn = { moved: false, acted: false, startX: 2, startY: 2 };
  return s;
}

describe('mirar no chão e luz à noite', () => {
  it('magia de alvo único pode mirar no chão, mais longe que o alcance normal', () => {
    const s = battle();
    const u = s.units.find((x) => x.team === 'player')!;
    const tiles = groundTargets(s, u, FIREBALL, new Set());
    expect(tiles).toContain(idx(s.map, 2, 2 + FIREBALL.range + GROUND_AIM_BONUS));
    expect(tiles).not.toContain(idx(s.map, 2, 2 + FIREBALL.range + GROUND_AIM_BONUS + 1));
  });

  it('bola de fogo no chão de pedra deixa brasas (luz); num barril, quebra/incendeia', () => {
    const s = battle();
    const u = s.units.find((x) => x.team === 'player')!;
    expect(castSkill(s, u, FIREBALL, 2, 6)).toBe(true);
    expect(tileAt(s.map, 2, 6)!.glow).toBe(LIGHT.emberTurns);
    const s2 = battle();
    const u2 = s2.units.find((x) => x.team === 'player')!;
    const b = tileAt(s2.map, 4, 2)!;
    b.p = 'barril';
    castSkill(s2, u2, FIREBALL, 4, 2);
    expect(b.p === null || b.pHp !== undefined || b.s === 'fogo').toBe(true);
  });

  it('à noite, o que está iluminado é visto de longe', () => {
    const s = battle('noite');
    const far = idx(s.map, 2, 14);
    expect(teamVision(s, 'player').has(far)).toBe(false);
    tileAt(s.map, 2, 14)!.glow = 3;
    expect(litTiles(s).has(far)).toBe(true);
    expect(teamVision(s, 'player').has(far)).toBe(true);
    // Lampião ilumina mais longe que brasa.
    tileAt(s.map, 10, 10)!.p = 'lampiao';
    expect(litTiles(s).has(idx(s.map, 10, 10 + LIGHT.bigRadius))).toBe(true);
  });
});
