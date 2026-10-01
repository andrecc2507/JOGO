import { describe, expect, it } from 'vitest';
import * as stats from '@game/rules/stats';
import { simulateAll } from '@game/rules/balance_sim';
import { DB } from '@game/data';
import { Rng } from '@core';
import { makeCharacter } from '@game/rules/recruit';
import { BASE_ATTR, gainXp } from '@game/rules/character';

describe('matemática central: exemplos do design', () => {
  it('poder de atributo = valor + ⌊valor/10⌋² (FOR 10 → 11, 20 → 24, 30 → 39, 40 → 56)', () => {
    expect([10, 20, 30, 40].map(stats.attrPower)).toEqual([11, 24, 39, 56]);
  });

  it('linha do tempo: VEL 5 → 15 s, VEL 20 → 10 s', () => {
    expect(stats.actionInterval(5)).toBeCloseTo(15);
    expect(stats.actionInterval(20)).toBeCloseTo(10);
  });

  it('resistência física de VIT tem retorno decrescente (VIT/(VIT+K))', () => {
    const k = stats.BALANCE.defense.vitK;
    expect(stats.physicalResistance(k, 0)).toBeCloseTo(0.5);
    expect(stats.physicalResistance(20, 0) - stats.physicalResistance(10, 0)).toBeGreaterThan(stats.physicalResistance(90, 0) - stats.physicalResistance(80, 0));
    expect(stats.physicalResistance(999, 999)).toBeLessThanOrEqual(stats.BALANCE.defense.maxReduction);
  });

  it('progressão: nível 60, teto 60, 60 pontos de habilidade e atributos crescendo por nível', () => {
    expect(stats.MAX_LEVEL).toBe(60);
    expect(stats.MAX_ATTR).toBe(60);
    expect(stats.totalSkillPoints(60)).toBe(60);
    expect(stats.totalSkillPoints(60)).toBe(stats.BALANCE.progression.totalSkillPoints);
    expect([2, 6, 10, 30, 60].map(stats.attributePointsAt)).toEqual([4, 5, 6, 11, 18]);
    expect([1, 10, 11, 20, 21, 51, 59].map(stats.attributeCost)).toEqual([2, 2, 3, 3, 4, 7, 7]);
  });

  it('total de atributo = custo real (curva crescente) da build 60/50/40/30/10 = 696', () => {
    const build = stats.BALANCE.progression.targetBuild;
    expect(build).toEqual([60, 50, 40, 30, 10]);
    expect(build.map((t) => stats.attributeCostRange(1, t))).toEqual([263, 194, 135, 86, 18]);
    expect(stats.TOTAL_ATTRIBUTE_POINTS).toBe(696);
    expect(stats.STARTING_ATTRIBUTE_POINTS).toBe(54);
    expect(stats.totalAttributePoints(60)).toBe(696);
  });

  it('um personagem nível 60 recebeu exatamente 696 pontos de atributo e 60 de habilidade', () => {
    const c = makeCharacter(new Rng(1), { classId: 'mago', level: 1 });
    const spent = (Object.values(c.attrs) as number[]).reduce((sum, v) => sum + stats.attributeCostRange(BASE_ATTR, v), 0);
    expect(spent + c.statPoints).toBe(stats.STARTING_ATTRIBUTE_POINTS);
    const skills = c.skillPoints + c.skills.length;
    gainXp(c, 1e12);
    expect(c.level).toBe(60);
    expect(spent + c.statPoints).toBe(696);
    expect(skills + c.skillPoints).toBe(60);
  });

  it('pré-renovação sem Sorte: o crítico é 1,5× e o acerto físico fica entre 5% e 95%', () => {
    expect(stats.CRIT_MULT).toBe(1.5);
    expect(stats.physicalHitChance(999, 0)).toBe(95);
    expect(stats.physicalHitChance(0, 999)).toBe(5);
  });
});

describe('matemática central: monotonicidade', () => {
  const values = Array.from({ length: 100 }, (_, i) => i);
  const nonDecreasing = (f: (v: number) => number) => values.every((v) => f(v + 1) >= f(v));

  it('FOR/INT ↑ → poder não diminui; VIT ↑ → vida e resistência não diminuem; INT ↑ → MP não diminui', () => {
    expect(nonDecreasing(stats.attrPower)).toBe(true);
    expect(nonDecreasing((v) => stats.maxHp(40, 8, 20, v))).toBe(true);
    expect(nonDecreasing((v) => stats.physicalResistance(v, 10))).toBe(true);
    expect(nonDecreasing((v) => stats.maxMp(20, 2, 20, v))).toBe(true);
    expect(nonDecreasing(stats.magicResistance)).toBe(true);
    expect(nonDecreasing((v) => stats.accuracy(20, v))).toBe(true);
  });

  it('VEL ↑ → intervalo de ação não aumenta; nível ↑ → vida não diminui', () => {
    expect(values.every((v) => stats.actionInterval(v + 1) <= stats.actionInterval(v))).toBe(true);
    expect(nonDecreasing((lv) => stats.maxHp(40, 8, lv, 20))).toBe(true);
  });
});

describe('matemática central: valores inválidos', () => {
  const bad = [0, -5, NaN, Infinity, -Infinity];

  it('nenhuma fórmula devolve NaN, Infinity, negativo ou intervalo ≤ 0', () => {
    for (const v of bad) {
      for (const r of [stats.attrPower(v), stats.maxHp(40, 8, v, v), stats.maxMp(20, 2, v, v), stats.physicalResistance(v, v), stats.magicResistance(v), stats.actionInterval(v), stats.evasion(v, v, v), stats.accuracy(v, v)]) {
        expect(Number.isFinite(r), `${v}`).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
      expect(stats.actionInterval(v)).toBeGreaterThan(0);
      expect(stats.maxHp(40, 8, v, v)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('simulação de balanceamento (sanidade)', () => {
  const rows = simulateAll();

  it('alvo médio do mesmo nível cai entre 2 e 12 golpes básicos, em todos os níveis e classes', () => {
    for (const r of rows) expect(r.hitsToKill, `${r.classId} nv ${r.level}`).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.hitsToKill, `${r.classId} nv ${r.level}`).toBeLessThanOrEqual(12);
  });

  it('o tanque aguenta mais que o alvo médio; o Ladino age mais vezes que o Guerreiro', () => {
    for (const r of rows) expect(r.hitsToKillTank).toBeGreaterThanOrEqual(r.hitsToKill);
    for (const lv of [1, 30, 60]) {
      const thief = rows.find((r) => r.level === lv && r.classId === 'ladrao')!;
      const warrior = rows.find((r) => r.level === lv && r.classId === 'guerreiro')!;
      expect(thief.interval).toBeLessThan(warrior.interval);
    }
  });

  it('nenhuma criatura passa do nível 60', () => {
    for (const e of Object.values(DB.enemies)) expect(e!.levelMax ?? 1, e!.id).toBeLessThanOrEqual(60);
  });
});
