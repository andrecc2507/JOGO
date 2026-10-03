import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { createBattle, teamVision, NIGHT_VISION_RANGE } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup, TimeOfDay } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign, timeOfDayOf } from '@game/world/campaign';
import { encounterSetup, planEncounter } from '@game/world/encounters';

function battle(timeOfDay?: TimeOfDay) {
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(2));
  const setup: BattleSetup = { map: createEmptyMap(30, 30, 'planicie'), players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 1, timeOfDay, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
  const s = createBattle(setup);
  const p = s.units.find((u) => u.team === 'player')!;
  [p.x, p.y] = [2, 2];
  return s;
}

describe('dia e noite', () => {
  it('relógio: 6h–18h59 é dia, o resto é noite', () => {
    expect(timeOfDayOf({ hours: 6 })).toBe('dia');
    expect(timeOfDayOf({ hours: 18.9 })).toBe('dia');
    expect(timeOfDayOf({ hours: 19 })).toBe('noite');
    expect(timeOfDayOf({ hours: 24 * 3 + 2 })).toBe('noite');
  });

  it('de dia não há névoa de guerra; de noite a visão encurta', () => {
    const day = battle('dia');
    expect(teamVision(day, 'player').size).toBe(30 * 30);
    const normal = teamVision(battle(), 'player').size;
    const night = teamVision(battle('noite'), 'player').size;
    expect(night).toBeLessThan(normal);
    expect(night).toBeGreaterThan(NIGHT_VISION_RANGE * NIGHT_VISION_RANGE);
  });

  it('o encontro aleatório leva a hora da campanha', () => {
    const c = newCampaign(3);
    const s = c.squads[0]!;
    const plan = planEncounter(new Rng(4), 'planicie', 5);
    c.hours = 10;
    expect(encounterSetup(c, s, plan).timeOfDay).toBe('dia');
    c.hours = 22;
    const night = encounterSetup(c, s, plan);
    expect(night.timeOfDay).toBe('noite');
    expect(night.context.title).toMatch(/🌙/);
  });
});
