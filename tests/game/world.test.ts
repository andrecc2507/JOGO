import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { CITADEL_ID, capitals, shortestPath, worldGraph } from '@game/world/layout';
import {
  CONTRACTS_PER_CAPITAL,
  advanceAct,
  advanceHours,
  allContracts,
  buy,
  members,
  newCampaign,
  orderMove,
  recruit,
  setResting,
} from '@game/world/campaign';
import { ENCOUNTER_TIERS, applyBattleResult, planEncounter } from '@game/world/encounters';

describe('mundo', () => {
  it('1 Citadela, 5 capitais e 20 cidades de descanso, todos conectados', () => {
    const g = worldGraph();
    const nodes = Object.values(g.nodes);
    expect(nodes.filter((n) => n.type === 'citadel')).toHaveLength(1);
    expect(nodes.filter((n) => n.type === 'capital')).toHaveLength(5);
    expect(nodes.filter((n) => n.type === 'city')).toHaveLength(20);
    for (const n of nodes) if (n.id !== CITADEL_ID) expect(shortestPath(CITADEL_ID, n.id).length).toBeGreaterThan(0);
  });

  it('as faixas de encontro somam 100%', () => {
    expect(ENCOUNTER_TIERS.reduce((s, t) => s + t.chance, 0)).toBeCloseTo(1);
  });
});

describe('campanha', () => {
  it('esquadrão viaja com o tempo e chega ao destino', () => {
    const c = newCampaign(1);
    const s = c.squads[0]!;
    const dest = capitals()[0]!.id;
    orderMove(c, s, dest);
    let arrived = false;
    for (let i = 0; i < 400 && !arrived; i++) arrived = advanceHours(c, 1).some((e) => e.type === 'arrived' && e.nodeId === dest);
    expect(arrived).toBe(true);
    expect(s.at).toBe(dest);
  });

  it('contratos: 3 por capital e somem ao mudar de ato', () => {
    const c = newCampaign(2);
    expect(allContracts(c)).toHaveLength(5 * CONTRACTS_PER_CAPITAL);
    const first = allContracts(c)[0]!.id;
    advanceAct(c);
    expect(c.act).toBe(2);
    expect(allContracts(c).some((x) => x.id === first)).toBe(false);
  });

  it('compras longe da base ficam com o esquadrão', () => {
    const c = newCampaign(3);
    const s = c.squads[0]!;
    const cap = capitals()[1]!.id;
    s.at = cap;
    expect(buy(c, s, cap, 'pocao_de_vida')).toBe(true);
    expect(s.carried.pocao_de_vida).toBe(1);
  });

  it('estalagem cobra e acelera a cura de ferimentos', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    const city = Object.values(worldGraph().nodes).find((n) => n.type === 'city')!;
    s.at = city.id;
    const m = members(c, s)[0]!;
    m.woundDays = 4;
    expect(setResting(c, s, true)).toBe(true);
    const gold = c.gold;
    advanceHours(c, 24);
    expect(m.woundDays).toBe(2);
    expect(c.gold).toBeLessThan(gold);
  });

  it('recrutar entra no esquadrão presente (máx. 6)', () => {
    const c = newCampaign(5);
    const s = c.squads[0]!;
    const cap = capitals()[0]!.id;
    s.at = cap;
    s.memberIds = s.memberIds.slice(0, 5);
    c.gold = 5000;
    expect(recruit(c, s, cap, 0)).toBeNull();
    expect(s.memberIds).toHaveLength(6);
    expect(recruit(c, s, cap, 0)).not.toBeNull();
  });

  it('morte é permanente e os itens do morto seguem com o esquadrão', () => {
    const c = newCampaign(6);
    const s = c.squads[0]!;
    const dead = members(c, s)[1]!;
    const survivor = members(c, s)[0]!;
    const summary = applyBattleResult(c, {
      outcome: 'victory',
      rounds: 3,
      context: { kind: 'encounter', squadId: s.id, baseXp: 50, gold: 100, itemDrops: [], title: 'teste' },
      units: [
        { charId: dead.id, alive: false, hp: 0, mp: 0, maxHp: 50, startHp: 50, kills: 0, killXp: 0, items: [null, null, null] },
        { charId: survivor.id, alive: true, hp: 1, mp: 0, maxHp: 50, startHp: 50, kills: 2, killXp: 24, items: [null, null, null] },
      ],
    });
    expect(c.roster[dead.id]).toBeUndefined();
    expect(summary.dead).toContain(dead.name);
    expect(Object.keys(s.carried).length).toBeGreaterThan(0);
    expect(survivor.woundDays).toBeGreaterThan(0);
  });

  it('encontros usam o nível médio + deslocamento da faixa', () => {
    const plan = planEncounter(new Rng(9), 'neve', 10, 'raro');
    expect(plan.level).toBe(15);
    expect(plan.enemies.length).toBeGreaterThan(0);
  });
});
