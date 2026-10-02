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
  refreshRecruits,
  setResting,
} from '@game/world/campaign';
import { ENCOUNTER_TIERS, applyBattleResult, beastsOf, planEncounter } from '@game/world/encounters';
import { BIOMES, DB } from '@game/data';
import { NOVICE_LEVEL } from '@game/rules/stats';
import { makeCharacter } from '@game/rules/recruit';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { createBattle, previewHit } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleUnit } from '@game/battle/types';

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

describe('encontros de novatos (nível ≤ 4)', () => {
  const heroes = (L: number) =>
    (['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'] as const).map((c) => unitFromCharacter(makeCharacter(new Rng(5), { classId: c, level: L }), 'player'));

  it('grupos de 2–3, sem emboscada e sem feras acima do nível do esquadrão', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const L = 1 + (i % NOVICE_LEVEL);
      const plan = planEncounter(rng, 'floresta', L, 'comum');
      expect(plan.enemies.length).toBeLessThanOrEqual(3);
      expect(plan.ambush).toBe(false);
      for (const e of plan.enemies) expect(DB.enemies[e.id]!.levelMin ?? 1).toBeLessThanOrEqual(L);
    }
  });

  it('nenhum inimigo possível tira mais de 60% da vida de um herói com um golpe (sem crítico)', () => {
    for (let L = 1; L <= NOVICE_LEVEL; L++) {
      const ids = new Set(['bandido', 'rebelde_guerreiro', 'rebelde_arqueiro', 'rebelde_mago', 'rebelde_clerigo']);
      for (const b of BIOMES) for (const e of beastsOf(b, 'comum', L)) ids.add(e.id);
      for (const id of ids) {
        const e = unitFromEnemy(DB.enemies[id]!, L, new Rng(2));
        for (const h of heroes(L)) {
          const s = createBattle({ map: createEmptyMap(6, 6, 'planicie'), players: [h], enemies: [e], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 1, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
          const [ph, pe] = s.units as [BattleUnit, BattleUnit];
          const hits = [previewHit(s, pe, ph, pe.weaponType === 'varinha' ? 'magic' : 'basic', 0)];
          for (const sid of pe.skills) {
            const sk = DB.skills[sid];
            if (sk?.power) hits.push(previewHit(s, pe, ph, sk.kind === 'magic' ? 'magic' : 'physical', sk.power, sk.element));
          }
          for (const p of hits) expect(p.max / ph.maxHp, `${id} nv${L} → ${h.classId}`).toBeLessThanOrEqual(0.6);
        }
      }
    }
  });
});

describe('Citadela Real', () => {
  it('recruta só Aprendizes e renova a lista', () => {
    const c = newCampaign(7);
    refreshRecruits(c, CITADEL_ID);
    const list = c.recruits[CITADEL_ID]!.list;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((cand) => cand.character.classId === 'aprendiz')).toBe(true);
    c.gold = 10_000;
    const before = Object.keys(c.roster).length;
    expect(recruit(c, undefined, CITADEL_ID, 0)).toBeNull();
    expect(Object.keys(c.roster).length).toBe(before + 1);
  });
});
