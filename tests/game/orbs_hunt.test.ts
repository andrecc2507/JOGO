import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, ORB_COMBOS, REPO_CREATURES, applyCreatures, type CreatureDef } from '@game/data';
import { castSkill, comboAsSkill, comboOptions, createBattle, orbComboRule } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { migrateCampaign, newCampaign } from '@game/world/campaign';
import { JEWEL_SLOTS, equipBlocker, equipJewel, foundBase, unequipJewel } from '@game/world/base';
import { cancelHunt, huntBlocker, startHunt } from '@game/world/capital_services';
import { applyHunt, planEncounter } from '@game/world/encounters';

/** Primeira habilidade ativa de criatura com o elemento pedido (e a criatura dona). */
function beastSkill(el: string): { cr: CreatureDef; skill: string } {
  for (const cr of REPO_CREATURES)
    for (const s of cr.skills) if (s.element === el && s.kind !== 'passive' && s.kind !== 'reaction') return { cr, skill: s.id };
  throw new Error(`sem habilidade de ${el}`);
}

function setup(players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map: createEmptyMap(10, 10, 'planicie'), players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 3, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

describe('dois orbes da alma', () => {
  it('dois espaços de orbe, separados do acessório; o mesmo orbe não entra duas vezes', () => {
    const fire = beastSkill('fogo');
    const wind = beastSkill('vento');
    const list = structuredClone(REPO_CREATURES);
    for (const x of [fire, wind]) {
      const cr = list.find((c) => c.id === x.cr.id)!;
      cr.drops!.jewel = { ...cr.drops!.jewel, type: 'habilidade', skill: x.skill };
    }
    applyCreatures(list);
    try {
      expect(JEWEL_SLOTS).toBe(2);
      const c = newCampaign(4);
      foundBase(c, 'guerreiros_capital');
      const hero = Object.values(c.roster)[0]!;
      hero.level = 50;
      c.base!.research.done.push(`joia:${fire.cr.id}`, `joia:${wind.cr.id}`);
      c.materials[`joia:${fire.cr.id}`] = 2;
      c.materials[`joia:${wind.cr.id}`] = 1;
      for (const s of c.squads) s.at = c.baseNode!;
      expect(equipJewel(c, hero.id, fire.cr.id)).toBe(true);
      expect(equipBlocker(c, hero.id, fire.cr.id)).toMatch(/já está equipado/);
      expect(equipJewel(c, hero.id, wind.cr.id)).toBe(true);
      expect(hero.jewels!.map((j) => j.species)).toEqual([fire.cr.id, wind.cr.id]);
      expect(hero.equipment.accessory).toBeNull();
      const u = unitFromCharacter(hero, 'player');
      expect(u.skills).toEqual(expect.arrayContaining([fire.skill, wind.skill]));
      expect(u.orbs).toEqual({ [fire.skill]: 'fogo', [wind.skill]: 'vento' });
      expect(unequipJewel(c, hero.id, 0)).toBe(true);
      expect(hero.jewels!.map((j) => j.species)).toEqual([wind.cr.id]);
      expect(c.materials[`joia:${fire.cr.id}`]).toBe(2);
    } finally {
      applyCreatures(REPO_CREATURES);
    }
  });

  it('save antigo com um orbe vira lista de orbes', () => {
    const c = newCampaign(5);
    const hero = Object.values(c.roster)[0]!;
    hero.jewel = { species: 'lobo', rank: 3 };
    migrateCampaign(c);
    expect(hero.jewel).toBeUndefined();
    expect(hero.jewels).toEqual([{ species: 'lobo', rank: 3 }]);
  });
});

describe('combos de orbes', () => {
  it('regras por elemento: pares que combinam e Ressonância no mesmo elemento', () => {
    expect(orbComboRule('fogo', 'vento')?.id).toBe('tormenta_de_brasas');
    expect(orbComboRule('vento', 'fogo')?.id).toBe('tormenta_de_brasas');
    expect(orbComboRule('gelo', 'gelo')?.id).toBe('ressonancia');
    expect(orbComboRule('neutro', 'neutro')).toBeUndefined();
    expect(orbComboRule('fogo', 'luz')).toBeUndefined();
  });

  it('um herói com dois orbes que combinam faz o combo sozinho; os dois orbes entram em recarga', () => {
    const fire = beastSkill('fogo').skill;
    const wind = beastSkill('vento').skill;
    const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 10 }), 'player');
    const foe = unitFromCharacter(makeCharacter(new Rng(2), { classId: 'guerreiro', level: 10 }), 'enemy');
    const s = createBattle(setup([hero], [foe]));
    const u = s.units.find((x) => x.team === 'player')!;
    const e = s.units.find((x) => x.team === 'enemy')!;
    [u.x, u.y, e.x, e.y] = [2, 2, 5, 2];
    u.skills.push(fire, wind);
    u.orbs = { [fire]: 'fogo', [wind]: 'vento' };
    u.skillRanks = { ...u.skillRanks, [fire]: 3, [wind]: 2 };
    const opts = comboOptions(s, u).filter((o) => o.orb);
    expect(opts).toHaveLength(1);
    const o = opts[0]!;
    expect(o.partner).toBe(u);
    const sk = comboAsSkill(o);
    expect(sk.power).toBe(ORB_COMBOS.combos[0]!.result.power + ORB_COMBOS.powerPerRank * 3);
    const hp = e.hp;
    expect(castSkill(s, u, { ...sk, range: 9 }, e.x, e.y, o)).toBe(true);
    expect(u.cooldowns[fire]).toBe(ORB_COMBOS.cooldown);
    expect(u.cooldowns[wind]).toBe(ORB_COMBOS.cooldown);
    expect(comboOptions(s, u).filter((x) => x.orb)).toHaveLength(0);
    expect(e.hp).toBeLessThanOrEqual(hp);
  });

  it('orbes de dois aliados próximos também combinam', () => {
    const ice = beastSkill('gelo').skill;
    const water = beastSkill('agua').skill;
    const a = unitFromCharacter(makeCharacter(new Rng(3), { classId: 'mago', level: 10 }), 'player');
    const b = unitFromCharacter(makeCharacter(new Rng(4), { classId: 'clerigo', level: 10 }), 'player');
    const foe = unitFromCharacter(makeCharacter(new Rng(5), { classId: 'guerreiro', level: 10 }), 'enemy');
    const s = createBattle(setup([a, b], [foe]));
    const [ua, ub] = s.units.filter((x) => x.team === 'player') as [BattleUnit, BattleUnit];
    [ua.x, ua.y, ub.x, ub.y] = [1, 1, 2, 1];
    ua.skills.push(ice);
    ua.orbs = { [ice]: 'gelo' };
    ub.skills.push(water);
    ub.orbs = { [water]: 'agua' };
    const o = comboOptions(s, ua).find((x) => x.orb);
    expect(o?.partner).toBe(ub);
    expect(o?.combo.id).toBe('orbe_prisao_glacial');
    ub.x = 8;
    expect(comboOptions(s, ua).some((x) => x.orb)).toBe(false);
  });
});

describe('caçada (Pavilhão dos Caçadores)', () => {
  it('só caça espécie com ficha; o próximo encontro traz pelo menos uma e a caçada fecha', () => {
    const c = newCampaign(6);
    const species = Object.keys(DB.creatures).find((id) => DB.enemies[id] && DB.creatures[id]!.rarity === 'epico')!;
    expect(huntBlocker(c, species)).toMatch(/abata/);
    c.speciesKills[species] = 1;
    expect(startHunt(c, species)).toBe(true);
    expect(c.hunt).toBe(species);
    for (let seed = 1; seed <= 20; seed++) {
      c.hunt = species;
      const rng = new Rng(seed);
      const plan = planEncounter(rng, 'planicie', 8);
      applyHunt(c, rng, plan);
      expect(plan.enemies.some((e) => e.id === species)).toBe(true);
      expect(plan.description).toMatch(/Caçada/);
      expect(c.hunt).toBeUndefined();
    }
    startHunt(c, species);
    cancelHunt(c);
    expect(c.hunt).toBeUndefined();
  });
});
