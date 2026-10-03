import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { advanceHours, newCampaign } from '@game/world/campaign';
import { VEIL, delayVeil, veilActive, veilDay } from '@game/world/veil';
import { availableMissions, hasFlag } from '@game/world/story';

describe('Contador do Véu', () => {
  it('só liga a partir do Ato 3; sobe 1 por dia', () => {
    const c = newCampaign(1);
    expect(veilActive(c)).toBe(false);
    expect(veilDay(c, 1, new Rng(1))).toEqual([]);
    c.act = 3;
    veilDay(c, 1, new Rng(1));
    expect(c.veil!.value).toBe(VEIL.perDay);
  });

  it('missão de atraso recua; em 100 o Selo rompe antes da hora (ramo "e se"), sem game over', () => {
    const c = newCampaign(2);
    c.act = 3;
    c.story!.chapter = 3;
    c.veil = { value: 40, broken: [] };
    expect(delayVeil(c, 'altar')).toBe(20);
    expect(c.veil.value).toBe(20);
    c.veil.value = 99;
    advanceHours(c, 24);
    // O capítulo não pula: as missões que faltavam se perdem e o clímax abre na hora.
    expect(c.act).toBe(3);
    expect(c.story!.lost.length).toBe(7);
    expect(availableMissions(c).map((m) => m.id)).toEqual(['a3_8']);
    expect(hasFlag(c, 'veu:3')).toBe(true);
    expect(c.veil.broken).toEqual([3]);
    expect(c.veil.value).toBeLessThan(VEIL.max);
    expect(c.log.some((l) => l.text.includes('Selo rompeu antes da hora'))).toBe(true);
  });

  it('ação do culto cria uma missão de atraso numa capital', () => {
    const c = newCampaign(3);
    c.act = 3;
    let made = false;
    for (let d = 1; d <= 60 && !made; d++) {
      advanceHours(c, 24);
      made = Object.values(c.contracts).flat().some((ct) => ct.delay);
    }
    expect(made).toBe(true);
  });
});
