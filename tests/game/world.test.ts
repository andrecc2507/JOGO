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
  lostCacheHours,
  recoverLostCaches,
  sellLoot,
} from '@game/world/campaign';
import { ENCOUNTER_TIERS, applyBattleResult, beastsOf, planEncounter } from '@game/world/encounters';
import { BIOMES, DB } from '@game/data';
import { NOVICE_LEVEL, encounterLevelOffset, severeWound, woundHpMult } from '@game/rules/stats';
import { makeCharacter } from '@game/rules/recruit';
import { canFight, type Character } from '@game/rules/character';
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

  it('ferimento vem da menor vida na luta, mesmo se foi curado até o fim', () => {
    const c = newCampaign(6);
    const s = c.squads[0]!;
    const [healed, fine] = members(c, s) as [Character, Character];
    applyBattleResult(c, {
      outcome: 'victory',
      rounds: 3,
      context: { kind: 'encounter', squadId: s.id, baseXp: 0, gold: 0, itemDrops: [], title: 'teste' },
      units: [
        { charId: healed.id, alive: true, hp: 100, mp: 0, maxHp: 100, startHp: 100, lowHp: 30, kills: 0, killXp: 0, items: [null, null, null] },
        { charId: fine.id, alive: true, hp: 55, mp: 0, maxHp: 100, startHp: 100, lowHp: 55, kills: 0, killXp: 0, items: [null, null, null] },
      ],
    });
    expect(healed.woundDays).toBe(5);
    expect(fine.woundDays).toBe(0);
  });

  it('encontros usam o nível médio + deslocamento da faixa', () => {
    const plan = planEncounter(new Rng(9), 'neve', 10, 'raro');
    expect(plan.level).toBe(11);
    expect(plan.enemies.length).toBeGreaterThan(0);
  });

  it('faixas de nível: a maioria mais fraca que a média, raramente mais forte', () => {
    const rng = new Rng(4);
    const offs = Array.from({ length: 4000 }, () => encounterLevelOffset(rng.next(), (a, b) => rng.int(a, b)));
    const share = (f: (o: number) => boolean) => offs.filter(f).length / offs.length;
    expect(share((o) => o <= -2)).toBeGreaterThan(0.5);
    expect(share((o) => o === -1)).toBeGreaterThan(0.12);
    expect(share((o) => o === 0)).toBeGreaterThan(0.1);
    expect(share((o) => o > 0)).toBeLessThan(0.08);
    expect(share((o) => o > 0)).toBeGreaterThan(0);
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

  it('nenhum inimigo possível tira mais de 65% da vida de um herói com um golpe (sem crítico)', () => {
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
          for (const p of hits) expect(p.max / ph.maxHp, `${id} nv${L} → ${h.classId}`).toBeLessThanOrEqual(0.65);
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

describe('espólio e itens perdidos', () => {
  const unitOut = (id: string, alive: boolean) => ({ charId: id, alive, hp: alive ? 10 : 0, mp: 0, maxHp: 50, startHp: 50, kills: 0, killXp: 0, items: [null, null, null] as (string | null)[] });

  it('marcador dura a maior viagem dentro do reino arredondada + 2 dias (mapa ampliado: 14 dias)', () => {
    expect(lostCacheHours()).toBe(336);
  });

  it('vitória sorteia drops das feras derrotadas, conta abates por espécie e o espólio vende', () => {
    const c = newCampaign(3);
    const s = c.squads[0]!;
    // Fora da base: espólio fica com o esquadrão.
    s.at = 'arqueiros_capital';
    const defeated = Array<string>(20).fill('lobo_da_silvia');
    applyBattleResult(c, { outcome: 'victory', rounds: 2, defeated, context: { kind: 'encounter', squadId: s.id, baseXp: 0, gold: 0, itemDrops: [], title: 't' }, units: members(c, s).map((m) => unitOut(m.id, true)) });
    expect(c.speciesKills.lobo_da_silvia).toBe(20);
    expect(s.loot.couro_de_canideo ?? 0).toBeGreaterThan(10);
    const before = c.gold;
    const n = s.loot.couro_de_canideo!;
    expect(sellLoot(c, s.loot, 'couro_de_canideo', n)).toBe(n * DB.materials.couro_de_canideo!.price);
    expect(c.gold - before).toBe(n * 5);
    expect(s.loot.couro_de_canideo ?? 0).toBe(0);
  });

  it('esquadrão dizimado deixa os itens no local; outro esquadrão recupera; senão somem em 4 dias', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    s.at = 'arqueiros_c0';
    s.loot = { presa: 2 };
    applyBattleResult(c, { outcome: 'defeat', rounds: 2, context: { kind: 'encounter', squadId: s.id, baseXp: 0, gold: 0, itemDrops: [], title: 't' }, units: members(c, s).map((m) => unitOut(m.id, false)) });
    expect(c.squads.includes(s)).toBe(false);
    expect(c.lostCaches).toHaveLength(1);
    const cache = c.lostCaches[0]!;
    expect(cache.nodeId).toBe('arqueiros_c0');
    expect(cache.loot.presa).toBe(2);
    expect(Object.keys(cache.items).length).toBeGreaterThan(0);
    // Outro esquadrão chega ao local e recupera.
    const rescuer = makeCharacter(new Rng(3), { classId: 'guerreiro' });
    c.roster[rescuer.id] = rescuer;
    const reserveIds = [rescuer.id];
    const other = { ...structuredClone(s), id: 'sq_x', name: 'Resgate', memberIds: reserveIds.slice(0, 1), at: 'arqueiros_c0', carried: {} as Record<string, number>, loot: {} as Record<string, number> };
    c.squads.push(other);
    expect(recoverLostCaches(c, other)).toBe(1);
    expect(other.loot.presa).toBe(2);
    expect(c.lostCaches).toHaveLength(0);
    // Novo marcador que ninguém busca: some depois de 4 dias.
    c.lostCaches.push({ ...cache, id: 'p2', expiresAt: c.hours + 96 });
    advanceHours(c, 95);
    expect(c.lostCaches).toHaveLength(1);
    advanceHours(c, 2);
    expect(c.lostCaches).toHaveLength(0);
  });
});

describe('feridas (grave x leve)', () => {
  it('abaixo de 10% no fim da luta é grave; o leve luta com vida máxima reduzida', () => {
    expect(severeWound(0.05)).toBe(true);
    expect(severeWound(0.3)).toBe(false);
    const ch = makeCharacter(new Rng(3), { classId: 'guerreiro', level: 3 });
    const full = unitFromCharacter(ch, 'player').maxHp;
    ch.woundDays = 3;
    expect(canFight(ch)).toBe(true);
    expect(unitFromCharacter(ch, 'player').maxHp).toBe(Math.round(full * woundHpMult()));
    ch.severeWound = true;
    expect(canFight(ch)).toBe(false);
  });
});
