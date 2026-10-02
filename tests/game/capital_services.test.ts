import { describe, expect, it } from 'vitest';
import { DB } from '@game/data';
import { newCampaign } from '@game/world/campaign';
import { refinedStats } from '@game/rules/stats';
import {
  blackMarketPrice,
  blackMarketStock,
  buyBlackMarket,
  HUNTER_MARK,
  capitalService,
  huntedSpecies,
  loreBlocker,
  loreTier,
  refineBlocker,
  refineCost,
  refineItem,
  refineLevel,
  refineService,
  registerLore,
} from '@game/world/capital_services';
import { Rng } from '@core';
import { createBattle, previewHit } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';

describe('particularidades das capitais', () => {
  it('cada capital tem o seu serviço; Solenne é a enfermaria', () => {
    expect(capitalService('arqueiros_capital')).toBe('cacadores');
    expect(capitalService('guerreiros_capital')).toBe('refino');
    expect(capitalService('magos_capital')).toBe('refino_magico');
    expect(capitalService('ladroes_capital')).toBe('mercado_negro');
    expect(capitalService('clerigos_capital')).toBe('enfermaria');
    expect(capitalService('citadela')).toBeNull();
  });

  it('Verdelume: conhecimento sobe com abates e ouro até a Marca do Caçador', () => {
    const c = newCampaign(3);
    c.gold = 1000;
    const sp = 'esquilo_farpa';
    expect(loreTier(c, sp)).toBe(0);
    c.speciesKills[sp] = 1;
    expect(loreTier(c, sp)).toBe(1);
    expect(loreBlocker(c, sp)).toMatch(/5 abates/);
    c.speciesKills[sp] = 20;
    expect(registerLore(c, sp)).toBe(true);
    expect(registerLore(c, sp)).toBe(true);
    expect(huntedSpecies(c)).toEqual([]);
    expect(registerLore(c, sp)).toBe(true);
    expect(loreTier(c, sp)).toBe(4);
    expect(huntedSpecies(c)).toEqual([sp]);
    expect(c.gold).toBe(1000 - 40 - 90 - 180);
    expect(registerLore(c, sp)).toBe(false);
  });

  it('refino: arma em Bastiamar, acessório em Cristália, até +5', () => {
    const c = newCampaign(3);
    c.gold = 100000;
    expect(refineService('espada_curta')).toBe('refino');
    const acc = Object.values(DB.items).find((i) => i.slot === 'accessory')!;
    expect(refineService(acc.id)).toBe('refino_magico');
    expect(refineBlocker(c, 'espada_curta', 'refino_magico')).toMatch(/não trabalha/);
    let id = 'espada_curta';
    for (let k = 1; k <= 5; k++) {
      id = refineItem(c, id, 'refino')!;
      expect(refineLevel(id)).toBe(k);
    }
    expect(refineBlocker(c, id, 'refino')).toMatch(/\+5/);
    expect(DB.items[id]!.atk).toBe(Math.round(DB.items.espada_curta!.atk! * 1.5));
    expect(DB.items[id]!.name).toMatch(/\+5$/);
    expect(refineCost('espada_curta+1')).toBeGreaterThan(refineCost('espada_curta'));
  });

  it('refino mágico soma +1 nos bônus de atributo por nível', () => {
    expect(refinedStats({ bonus: { agi: 2, crit: 3 } }, 2, true).bonus).toEqual({ agi: 4, crit: 5 });
    expect(refinedStats({ def: 2 }, 3, false).def).toBe(5);
  });

  it('Mercado Negro: estoque do mês com raros e épicos, mais caro', () => {
    const c = newCampaign(3);
    const stock = blackMarketStock(c);
    expect(stock.length).toBeGreaterThan(0);
    expect(new Set(stock).size).toBe(stock.length);
    for (const id of stock) expect(['raro', 'epico']).toContain(DB.items[id]!.rarity);
    expect(blackMarketStock(c)).toEqual(stock);
    const id = stock[0]!;
    expect(blackMarketPrice(id)).toBeGreaterThan(DB.items[id]!.price);
    c.gold = blackMarketPrice(id);
    expect(buyBlackMarket(c, undefined, id)).toBe(true);
    expect(c.inventory[id]).toBe(1);
    expect(c.gold).toBe(0);
  });

  it('Marca do Caçador aumenta dano e crítico contra a espécie', () => {
    const ch = makeCharacter(new Rng(3), { classId: 'arqueiro', level: 20 });
    ch.skills = [];
    const enemy = DB.enemies.lobo_da_silvia!;
    const setup: BattleSetup = { map: createEmptyMap(12, 12, 'planicie'), players: [unitFromCharacter(ch, 'player')], enemies: [unitFromEnemy(enemy, 20, new Rng(1))], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
    const plain = createBattle(setup);
    const marked = createBattle({ ...setup, hunted: [enemy.id] });
    const hit = (s: typeof plain) => previewHit(s, s.units[0]!, s.units[1]!, 'basic', 0);
    expect(hit(marked).max).toBeGreaterThan(hit(plain).max);
    expect(hit(marked).crit - hit(plain).crit).toBe(HUNTER_MARK.crit);
  });
});
