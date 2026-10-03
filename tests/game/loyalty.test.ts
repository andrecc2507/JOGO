import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { makeCharacter } from '../../src/game/rules/recruit';
import { LOYALTY, afterBattle, ensureLoyalty, loyaltyDay, talk, talkCooldown } from '../../src/game/world/loyalty';

const hero = () => {
  const ch = makeCharacter(new Rng(7), { classId: 'guerreiro' });
  ensureLoyalty(ch);
  return ch;
};

describe('lealdade e moral', () => {
  it('começa nos valores de referência', () => {
    const ch = hero();
    expect(ch.loyalty).toBe(LOYALTY.start.loyalty);
    expect(ch.morale).toBe(LOYALTY.start.morale);
  });

  it('missão e nível sobem a lealdade; mortes de aliados derrubam a moral', () => {
    const ch = hero();
    afterBattle(ch, { victory: true, levels: 1, allyDeaths: 0 });
    expect(ch.loyalty).toBe(50 + 2 + 1 + 3);
    expect(ch.morale).toBe(75);
    afterBattle(ch, { victory: true, levels: 0, allyDeaths: 2 });
    expect(ch.morale).toBe(75 + 5 - 30);
  });

  it('moral baixa corrói a lealdade aos poucos e a moral volta com descanso', () => {
    const ch = hero();
    ch.morale = 10;
    ch.equipment = { weapon: null, offhand: null, armor: null, accessory: null, utility: [null, null, null] };
    loyaltyDay(ch, { resting: true, idle: false });
    expect(ch.morale).toBe(13);
    expect(ch.loyalty).toBe(49);
    loyaltyDay(ch, { resting: true, idle: false });
    expect(ch.morale).toBe(16);
    expect(ch.loyalty).toBe(48.5);
    for (let i = 0; i < 30; i++) loyaltyDay(ch, { resting: true, idle: false });
    expect(ch.morale).toBe(LOYALTY.daily.moraleBaseline);
  });

  it('bem equipado ganha lealdade; parado na reserva perde', () => {
    const ch = hero();
    ch.equipment = { weapon: 'espada_curta', offhand: 'escudo', armor: 'x', accessory: 'y', utility: [null, null, null] };
    loyaltyDay(ch, { resting: false, idle: false });
    expect(ch.loyalty).toBeCloseTo(50.2);
    ch.equipment = { weapon: null, offhand: null, armor: null, accessory: null, utility: [null, null, null] };
    loyaltyDay(ch, { resting: true, idle: true });
    expect(ch.loyalty).toBeCloseTo(50.1);
  });

  it('conversar tem recarga', () => {
    const ch = hero();
    expect(talk(ch, 10)).toBe(true);
    expect(ch.loyalty).toBe(53);
    expect(talk(ch, 12)).toBe(false);
    expect(talkCooldown(ch, 12)).toBe(5);
    expect(talk(ch, 17)).toBe(true);
  });

  it('limita entre 0 e 100', () => {
    const ch = hero();
    for (let i = 0; i < 10; i++) afterBattle(ch, { victory: false, levels: 0, allyDeaths: 3 });
    expect(ch.morale).toBe(0);
    for (let i = 0; i < 40; i++) afterBattle(ch, { victory: true, levels: 2, allyDeaths: 0 });
    expect(ch.loyalty).toBe(100);
  });
});
