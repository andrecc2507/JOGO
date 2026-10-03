import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { makeCharacter } from '@game/rules/recruit';
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
  // Dois heróis na reserva (o esquadrão inicial tem os 6 criados).
  for (const cls of ['mago', 'aprendiz'] as const) {
    const ch = makeCharacter(new Rng(c.seed + cls.length), { classId: cls });
    c.roster[ch.id] = ch;
  }
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

describe('joias da alma', () => {
  it('pesquisar no Santuário, equipar (habilidade da besta em batalha) e fortalecer com repetidas', async () => {
    const { applyCreatures, REPO_CREATURES } = await import('@game/data');
    const { unitFromCharacter } = await import('@game/battle/units');
    const { equipJewel, strengthenJewel, jewelKnown } = await import('@game/world/base');
    // Urso-Chifre como joia de habilidade (escolha manual no Bestiário).
    const list = structuredClone(REPO_CREATURES);
    const urso = list.find((x) => x.id === 'urso_chifre')!;
    urso.drops!.jewel = { ...urso.drops!.jewel, type: 'habilidade', skill: urso.skills.find((s) => s.kind !== 'passive')!.id };
    applyCreatures(list);
    const c = founded();
    c.gold = 5000;
    c.materials['joia:urso_chifre'] = 4;
    let opt = researchOptions(c).find((o) => o.id === 'joia:urso_chifre')!;
    expect(opt.ready).toBe(false);
    expect(opt.missing).toMatch(/Santuário/);
    startBuilding(c, 'santuario');
    advanceHours(c, 24 * 7 + 1);
    opt = researchOptions(c).find((o) => o.id === 'joia:urso_chifre')!;
    expect(startResearch(c, opt.id)).toBe(true);
    advanceHours(c, 24 * opt.days + 1);
    expect(jewelKnown(c, 'urso_chifre')).toBe(true);
    expect(c.materials['joia:urso_chifre']).toBe(4);
    const hero = Object.values(c.roster).sort((a, b) => b.level - a.level)[0]!;
    hero.level = Math.max(hero.level, 15);
    const { equipBlocker } = await import('@game/world/base');
    if (c.squads.some((s) => s.memberIds.includes(hero.id))) expect(equipBlocker(c, hero.id, 'urso_chifre')).toMatch(/na base/);
    for (const s of c.squads) s.at = c.baseNode;
    expect(equipJewel(c, hero.id, 'urso_chifre')).toBe(true);
    expect(c.materials['joia:urso_chifre']).toBe(3);
    const u = unitFromCharacter(hero, 'player');
    expect(u.skills).toContain(urso.drops!.jewel.skill);
    expect(strengthenJewel(c, hero.id)).toBe(true);
    expect(hero.jewels![0]!.rank).toBe(2);
    expect(unitFromCharacter(hero, 'player').skillRanks?.[urso.drops!.jewel.skill!]).toBe(2);
    applyCreatures(REPO_CREATURES);
  });
});

describe('itens mágicos (joia de forja)', () => {
  it('peça base + joia de forja + materiais viram item épico com bônus da besta', async () => {
    const { applyCreatures, REPO_CREATURES, DB: db } = await import('@game/data');
    const { startMagicItem, magicItemBlocker } = await import('@game/world/base');
    const list = structuredClone(REPO_CREATURES);
    const ifrit = list.find((x) => x.id === 'ifrit_ancestral')!;
    ifrit.drops!.jewel = { ...ifrit.drops!.jewel, type: 'forja', bonus: 'dano de fogo' };
    applyCreatures(list);
    const c = founded();
    c.gold = 5000;
    c.base!.research.done.push('joia:ifrit_ancestral');
    c.materials['joia:ifrit_ancestral'] = 1;
    c.materials.reliquia_mitica = 6;
    c.inventory.espada_curta = 1;
    expect(magicItemBlocker(c, 'ifrit_ancestral', 'espada_curta')).toBeNull();
    const def = startMagicItem(c, 'ifrit_ancestral', 'espada_curta')!;
    expect(def.rarity).toBe('epico');
    expect(def.atk).toBe((db.items.espada_curta!.atk ?? 0) + 2);
    expect(Object.values(def.bonus ?? {}).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThanOrEqual(5);
    advanceHours(c, 24 * 10 + 1);
    expect(c.inventory[def.id]).toBe(1);
    expect(c.customItems).toHaveLength(1);
    applyCreatures(REPO_CREATURES);
  });
});

describe('prisão e interrogatório', () => {
  it('sem Prisão o rendido é solto; com Prisão vira interrogatório que paga ouro e o solta', async () => {
    const { imprison } = await import('@game/world/base');
    const c = founded();
    const p = { id: 'p1', enemyId: 'rebelde_guerreiro', name: 'Rebelde', level: 5 };
    expect(imprison(c, p)).toMatch(/solto/);
    c.base!.facilities.push('prisao');
    expect(imprison(c, p)).toMatch(/Prisão/);
    const opt = researchOptions(c).find((o) => o.kind === 'interrogatorio')!;
    expect(opt.ready).toBe(true);
    const gold = c.gold;
    expect(startResearch(c, opt.id)).toBe(true);
    advanceHours(c, 24 * 3 + 1);
    expect(c.prisoners).toHaveLength(0);
    expect(c.gold).toBeGreaterThan(gold);
    expect(c.log.some((l) => l.text.includes('Interrogatório de Rebelde'))).toBe(true);
  });
});
