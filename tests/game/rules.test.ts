import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { allocate, canPromote, derive, gainXp, promote, statCost, xpToNext, STAT_POINTS_PER_LEVEL } from '@game/rules/character';
import { generateRecruitPool, makeCharacter } from '@game/rules/recruit';

describe('progressão estilo Ragnarok', () => {
  it('custo de atributo cresce a cada 10 pontos', () => {
    expect(statCost(1)).toBe(2);
    expect(statCost(10)).toBe(2);
    expect(statCost(11)).toBe(3);
    expect(statCost(91)).toBe(11);
  });

  it('subir de nível dá 5 pontos de atributo e 1 de habilidade', () => {
    const c = makeCharacter(new Rng(1), { classId: 'guerreiro' });
    const before = { s: c.statPoints, k: c.skillPoints };
    gainXp(c, xpToNext(1));
    expect(c.level).toBe(2);
    expect(c.statPoints).toBe(before.s + STAT_POINTS_PER_LEVEL);
    expect(c.skillPoints).toBe(before.k + 1);
  });

  it('distribuir atributo gasta o custo da curva', () => {
    const c = makeCharacter(new Rng(2), { classId: 'mago' });
    c.statPoints = 10;
    const v = c.attrs.int;
    expect(allocate(c, 'int')).toBe(true);
    expect(c.attrs.int).toBe(v + 1);
    expect(c.statPoints).toBe(10 - statCost(v));
  });

  it('Aprendiz escolhe a classe a partir do nível 2', () => {
    const c = makeCharacter(new Rng(3), { classId: 'aprendiz' });
    expect(canPromote(c)).toBe(false);
    gainXp(c, xpToNext(1));
    expect(promote(c, 'arqueiro')).toBe(true);
    expect(c.classId).toBe('arqueiro');
  });

  it('recrutas da capital vêm com build direcionada à classe', () => {
    const pool = generateRecruitPool(new Rng(4), 'mago');
    const mages = pool.filter((p) => p.character.classId === 'mago');
    expect(pool.filter((p) => p.character.classId === 'aprendiz')).toHaveLength(4);
    expect(mages).toHaveLength(3);
    for (const m of mages) expect(m.character.attrs.int).toBeGreaterThanOrEqual(Math.max(m.character.attrs.str, m.character.attrs.con));
  });

  it('atributos derivam HP (VIT), MP (INT), defesa (CON)', () => {
    const c = makeCharacter(new Rng(5), { classId: 'guerreiro' });
    const d1 = derive(c);
    c.attrs.vit += 5;
    c.attrs.int += 5;
    c.attrs.con += 5;
    const d2 = derive(c);
    expect(d2.maxHp).toBeGreaterThan(d1.maxHp);
    expect(d2.maxMp).toBeGreaterThan(d1.maxMp);
    expect(d2.def).toBe(d1.def + 5);
  });
});
