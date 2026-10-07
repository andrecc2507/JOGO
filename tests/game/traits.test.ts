import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { makeCharacter } from '@game/rules/recruit';
import { COMMON_TRAITS, TRAITS, bark, ensureTrait, mood } from '@game/world/traits';
import { unitFromCharacter } from '@game/battle/units';

describe('personalidade dos heróis', () => {
  it('traço estável por herói; personagens da história têm o seu', () => {
    const rng = new Rng(1);
    const a = makeCharacter(rng, { classId: 'guerreiro' });
    const t = ensureTrait(a);
    expect(COMMON_TRAITS).toContain(t);
    a.trait = undefined;
    expect(ensureTrait(a)).toBe(t);
    const edran = makeCharacter(rng, { classId: 'guerreiro', name: 'Edran' });
    edran.storyId = 'Edran';
    expect(ensureTrait(edran)).toBe('veterano');
  });

  it('todo traço tem falas para todos os momentos', () => {
    for (const [id, t] of Object.entries(TRAITS)) {
      for (const k of ['start', 'kill', 'hurt'] as const) expect(t[k].length, `${id}.${k}`).toBeGreaterThan(0);
      for (const k of ['allyDown', 'victory'] as const) {
        expect(t[k].loyal.length, `${id}.${k}.loyal`).toBeGreaterThan(0);
        expect(t[k].bitter.length, `${id}.${k}.bitter`).toBeGreaterThan(0);
      }
    }
  });

  it('a lealdade decide o tom da fala', () => {
    expect(mood(80)).toBe('loyal');
    expect(mood(50)).toBe('neutral');
    expect(mood(10)).toBe('bitter');
    const rng = new Rng(2);
    const loyal = new Set(TRAITS.bravo!.victory.loyal);
    const bitter = new Set(TRAITS.bravo!.victory.bitter);
    for (let i = 0; i < 20; i++) {
      expect(loyal.has(bark('bravo', 'victory', 90, rng)!)).toBe(true);
      expect(bitter.has(bark('bravo', 'victory', 5, rng)!)).toBe(true);
    }
    expect(bark(undefined, 'kill', 50, rng)).toBeNull();
  });

  it('a unidade de batalha leva traço e lealdade do herói', () => {
    const ch = makeCharacter(new Rng(3), { classId: 'mago' });
    ensureTrait(ch);
    ch.loyalty = 77;
    const u = unitFromCharacter(ch, 'player');
    expect(u.trait).toBe(ch.trait);
    expect(u.loyalty).toBe(77);
  });
});
