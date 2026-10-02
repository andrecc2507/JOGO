import { describe, expect, it } from 'vitest';
import { DB } from '@game/data';
import { advanceHours, newCampaign, reserve } from '@game/world/campaign';
import {
  RECIPES,
  assign,
  baseSlots,
  buildBlocker,
  craftBlocker,
  foundBase,
  hasFacility,
  isStudied,
  researchOptions,
  startBuilding,
  startCraft,
  startResearch,
  workReduction,
  workSpeed,
} from '@game/world/base';

function founded(capital = 'guerreiros_capital') {
  const c = newCampaign(9);
  foundBase(c, capital);
  return c;
}

describe('base da resistência', () => {
  it('fundar: base na capital escolhida com Quartel, Biblioteca e Forja; Aurélia já vem com Enfermaria', () => {
    const c = founded();
    expect(c.baseNode).toBe('guerreiros_capital');
    expect(['quartel', 'biblioteca', 'forja'].every((f) => hasFacility(c, f))).toBe(true);
    expect(hasFacility(c, 'enfermaria')).toBe(false);
    expect(hasFacility(founded('clerigos_capital'), 'enfermaria')).toBe(true);
  });

  it('instalações custam ouro e dias, e respeitam os espaços (4 até o Ato 4)', () => {
    const c = founded();
    c.gold = 5000;
    expect(baseSlots(c)).toBe(4);
    expect(startBuilding(c, 'enfermaria')).toBe(true);
    expect(buildBlocker(c, 'prisao')).toMatch(/sem espaço/);
    advanceHours(c, 24 * 5);
    expect(hasFacility(c, 'enfermaria')).toBe(true);
    c.act = 4;
    expect(baseSlots(c)).toBe(8);
    expect(buildBlocker(c, 'prisao')).toBeNull();
  });

  it('heróis designados aceleram: 15% cada, classe certa em dobro, no máximo 60%', () => {
    const c = founded();
    const idle = reserve(c);
    expect(idle.length).toBeGreaterThan(0);
    const mage = idle.find((ch) => ch.classId === 'mago') ?? idle[0]!;
    expect(assign(c, mage.id, 'pesquisa')).toBe(true);
    const r = workReduction(c, 'pesquisa');
    expect(r).toBeCloseTo(mage.classId === 'mago' || mage.classId === 'clerigo' ? 0.3 : 0.15);
    // Quem está num esquadrão não pode ser designado.
    const inSquad = c.squads[0]!.memberIds[0]!;
    expect(assign(c, inSquad, 'forja')).toBe(false);
    expect(workSpeed(c, 'pesquisa')).toBeGreaterThan(1);
  });

  it('pesquisa de material destrava receita; forja entrega o item no inventário', () => {
    const c = founded();
    c.gold = 1000;
    c.materials.glandula_de_veneno = 9;
    const opt = researchOptions(c).find((o) => o.id === 'material:glandula_de_veneno')!;
    expect(opt.ready).toBe(true);
    const recipe = RECIPES.find((r) => r.id === 'antidoto')!;
    expect(craftBlocker(c, recipe)).toMatch(/pesquise/);
    expect(startResearch(c, opt.id)).toBe(true);
    expect(c.materials.glandula_de_veneno).toBe(4);
    advanceHours(c, 24 * 3 + 1);
    expect(c.base!.research.done).toContain('material:glandula_de_veneno');
    expect(craftBlocker(c, recipe)).toBeNull();
    const before = c.inventory.antidoto ?? 0;
    expect(startCraft(c, 'antidoto')).toBe(true);
    advanceHours(c, 25);
    expect(c.inventory.antidoto).toBe(before + 1);
    expect(DB.items.antidoto?.uses).toBe(1);
  });

  it('estudo de criatura pede abates e materiais da família; depois a espécie conta como estudada', () => {
    const c = founded();
    c.speciesKills.lobo_da_silvia = 2;
    c.materials.couro_de_canideo = 3;
    let opt = researchOptions(c).find((o) => o.id === 'criatura:lobo_da_silvia')!;
    expect(opt.ready).toBe(false);
    expect(opt.missing).toMatch(/2\/3 abates/);
    c.speciesKills.lobo_da_silvia = 3;
    opt = researchOptions(c).find((o) => o.id === 'criatura:lobo_da_silvia')!;
    expect(startResearch(c, opt.id)).toBe(true);
    advanceHours(c, 24 * opt.days + 1);
    expect(isStudied(c, 'lobo_da_silvia')).toBe(true);
  });
});
