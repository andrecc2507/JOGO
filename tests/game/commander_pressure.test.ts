import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { advanceHours, members, newCampaign, orderMove, type Campaign } from '@game/world/campaign';
import { commanderDay, commanderMonth, defenseContract, expireCrises, startCrisis } from '@game/world/commander';
import { applyBattleResult, forceSetup, playerUnits } from '@game/world/encounters';
import { forceArrived } from '@game/world/commander';
import { FORCES, moveForces, playerSide, spawnForce, type Force } from '@game/world/forces';
import { FATIGUE, SUPPLY, buyRations, supplyCap, supplyDay } from '@game/world/logistics';
import { ensureStory } from '@game/world/story';
import { ensureWorld, provinceState } from '@game/world/territory';

function camp(chapter = 2): Campaign {
  const c = newCampaign(5);
  ensureStory(c).chapter = chapter;
  return c;
}

function force(c: Campaign, over: Partial<Force>): Force {
  const f: Force = { id: 'ftest', kind: 'caravana', owner: 'culto', goal: 'raid', at: 'magos_c1', to: null, route: [], progress: 0, target: 'magos_c1', level: 5, units: ['acolito_do_veu', 'lamina_do_veu'], ...over };
  (ensureWorld(c).forces ??= []).push(f);
  return f;
}

describe('suprimentos e fadiga (C9, C22)', () => {
  it('viajando gasta rações; sem rações a moral cai e os ferimentos pioram; na cidade não gasta', () => {
    const c = camp();
    const s = c.squads[0]!;
    const people = members(c, s);
    s.supplies = 30;
    expect(supplyDay(s, people, false)).toBeNull();
    expect(s.supplies).toBe(30 - people.length);
    s.supplies = 0;
    const m0 = people[0]!.morale ?? 70;
    people[0]!.woundDays = 2;
    supplyDay(s, people, false);
    expect(s.hungry).toBe(1);
    expect(people[0]!.morale).toBeLessThan(m0);
    expect(people[0]!.woundDays).toBe(3);
    supplyDay(s, people, true);
    expect(s.hungry).toBe(0);
  });

  it('compra até a capacidade e cobra', () => {
    const c = camp();
    const s = c.squads[0]!;
    s.supplies = 0;
    const gold = c.gold;
    const k = buyRations(c, s, 6, 999);
    expect(k).toBe(supplyCap(s, 6));
    expect(c.gold).toBe(gold - k * SUPPLY.price);
  });

  it('cansado luta pior; com fome começa enfraquecido', () => {
    const c = camp();
    const s = c.squads[0]!;
    const m = members(c, s)[0]!;
    const fresh = playerUnits(c, s)[0]!;
    m.fatigue = 90;
    s.hungry = 1;
    const tired = playerUnits(c, s)[0]!;
    expect(tired.attrs.spd).toBeLessThan(fresh.attrs.spd);
    expect(tired.accuracy).toBe(fresh.accuracy - FATIGUE.tiredAccuracy);
    expect(tired.statuses.enfraquecido).toBeGreaterThan(0);
  });

  it('viajar dias seguidos cansa; ficar na cidade descansa', () => {
    const c = camp();
    const s = c.squads[0]!;
    orderMove(c, s, 'magos_capital');
    advanceHours(c, 48);
    const f = members(c, s)[0]!.fatigue ?? 0;
    expect(f).toBeGreaterThan(0);
  });
});

describe('território, forças, crises e cercos (C10, C11, C13, C21)', () => {
  it('as forças são sempre do lado inimigo do capítulo', () => {
    for (const ch of [0, 1, 2, 3, 4, 7]) {
      const c = camp(ch);
      const rng = new Rng(ch + 1);
      for (let i = 0; i < 6; i++) {
        const f = spawnForce(c, rng, ch, 10, [], c.baseNode);
        if (f) expect(playerSide(ch)).not.toContain(f.owner);
      }
    }
  });

  it('a força anda até o alvo e o saque assusta a província', () => {
    const c = camp();
    const rng = new Rng(4);
    const f = spawnForce(c, rng, 2, 8, [], c.baseNode, 'caravana')!;
    let arrived: Force | null = null;
    for (let h = 0; h < 24 * 30 && !arrived; h++) for (const ev of moveForces(c, 1, 5, new Set())) if (ev.type === 'force_arrived') arrived = ev.force;
    expect(arrived?.id).toBe(f.id);
    const fear0 = provinceState(c, f.target).fear;
    f.goal = 'raid';
    forceArrived(c, f);
    expect(provinceState(c, f.target).fear).toBeGreaterThan(fear0);
    expect(ensureWorld(c).forces!.some((x) => x.id === f.id)).toBe(false);
  });

  it('medo em 100 faz a província cair para quem ameaça', () => {
    const c = camp(4);
    provinceState(c, 'magos_c1').owner = 'resistencia';
    provinceState(c, 'magos_c1').fear = 100;
    const msgs = commanderDay(c);
    expect(provinceState(c, 'magos_c1').owner).toBe('vazio');
    expect(msgs.some((m) => m.includes('caiu'))).toBe(true);
  });

  it('crise ignorada cobra medo; cerco ignorado derruba a província', () => {
    const c = camp();
    for (const id of Object.keys(ensureWorld(c).provinces)) ensureWorld(c).provinces[id]!.owner = 'resistencia';
    const made = startCrisis(c);
    expect(made.length).toBeGreaterThanOrEqual(2);
    const t = made[0]!.targetNode;
    const fear0 = provinceState(c, t).fear;
    c.hours = made[0]!.expiresAt! + 1;
    expireCrises(c);
    expect(provinceState(c, t).fear).toBeGreaterThan(fear0);
    const f = force(c, { goal: 'siege', target: 'magos_capital', owner: 'coroa', kind: 'exercito' });
    const ct = defenseContract(c, f);
    c.hours = ct.expiresAt! + 1;
    expireCrises(c);
    expect(provinceState(c, 'magos_capital').owner).toBe('coroa');
  });

  it('esquadrão que chega onde há uma força gera encontro; vitória cercada destrói a força', () => {
    const c = camp();
    const s = c.squads[0]!;
    s.at = 'magos_c0';
    const f = force(c, { at: 'magos_c1', target: 'magos_c1' });
    orderMove(c, s, 'magos_c1');
    let ev = null;
    for (let h = 0; h < 24 * 10 && !ev; h++) ev = advanceHours(c, 1).find((e) => e.type === 'intercept') ?? null;
    expect(ev).toMatchObject({ type: 'intercept', forceId: f.id });
    const setup = forceSetup(c, s, f, 'emboscar');
    expect(setup.stealthStart).toBe(true);
    const cerco = forceSetup(c, s, f, 'cercar');
    expect(cerco.context.encircled).toBe(true);
    applyBattleResult(c, { outcome: 'victory', rounds: 3, defeated: [], context: cerco.context, units: [] });
    expect(ensureWorld(c).forces!.some((x) => x.id === f.id)).toBe(false);
  });

  it('o mês paga pelas províncias aliadas', () => {
    const c = camp(1);
    const gold = c.gold;
    const lines = commanderMonth(c);
    expect(c.gold).toBeGreaterThan(gold);
    expect(lines[0]).toContain('Renda');
    expect(FORCES.maxActive).toBeGreaterThan(0);
  });
});
