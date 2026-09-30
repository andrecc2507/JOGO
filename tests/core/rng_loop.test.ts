import { describe, expect, it } from 'vitest';
import { GameLoop, Rng } from '@core';

describe('Rng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    expect([a.next(), a.int(0, 9), a.range(1, 2)]).toEqual([b.next(), b.int(0, 9), b.range(1, 2)]);
  });
});

describe('GameLoop', () => {
  it('roda ticks fixos conforme o tempo acumulado', () => {
    let updates = 0;
    const loop = new GameLoop({ update: () => updates++, render: () => {} }, 0.25);
    expect(loop.advance(0.625)).toBe(2);
    expect(loop.advance(0.125)).toBe(1);
    expect(updates).toBe(3);
  });
});
