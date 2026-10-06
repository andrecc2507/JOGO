import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { members, newCampaign, refreshRecruits, shopPrice, travelHours, type Campaign, type Contract } from '@game/world/campaign';
import { item } from '@game/data';
import type { BattleSetup } from '@game/battle/types';
import { foundBase } from '@game/world/base';
import { node, shortestPath } from '@game/world/layout';
import { provinceOf } from '@game/world/provinces';
import { ensureWorld, provinceState } from '@game/world/territory';
import { ensureStory, fallenCapitals } from '@game/world/story';
import { addRep, ensurePolitics, rep } from '@game/world/politics';
import { ACTS, actContracts, ensureActs } from '@game/world/acts_state';
import { actsMissionDone, actsRegion } from '@game/world/acts';
import { crownDay, crownOrderDone, desertionGold, desertionShift } from '@game/world/act_crown';
import { addClue, fugitiveAfterBattle, fugitiveBlock, useClues, verifyClue, wantedPrice } from '@game/world/act_fugitive';
import { ensureFronts, frontOpDone, frontsDay, palacePrep } from '@game/world/act_fronts';
import { allianceBlock, makeAlliance, portalClosed, portalsDay } from '@game/world/act_portals';
import { caravanDay, cleanse, cleanseBlock, crossVoid, inVoid, startCaravan, voidDay } from '@game/world/act_void';
import { atCamp, setCamp, shiftDay } from '@game/world/act_camp';
import { baronKilled, baronPostTaken, baronsDay, ensureBarons } from '@game/world/act_barons';
import { allocate, frontWon, warPoints, warTableSetup } from '@game/world/act_war_table';
import { ensureVeil } from '@game/world/veil';

function camp(chapter: number): Campaign {
  const c = newCampaign(7);
  ensureStory(c).chapter = chapter;
  c.gold = 5000;
  return c;
}

function fakeSetup(): BattleSetup {
  return { enemies: [{ maxHp: 100, hp: 100, startHp: 100 }], waves: [{ round: 2 }, { round: 4 }, { round: 6 }], allies: [], context: { title: 'X' } } as unknown as BattleSetup;
}

describe('Prólogo e Ato 1: confiança das capitais, Favor e Suspeita', () => {
  it('missão do Prólogo numa capital dá reputação com o país', () => {
    const c = camp(0);
    actsMissionDone(c, 'p2', 'arqueiros_capital', 0);
    expect(rep(c, 'arqueiros')).toBe(ACTS.prologue.capitalRep);
  });

  it('ordens da Coroa: cumprir dá Favor e item; ignorar tira Favor e soma Suspeita', () => {
    const c = camp(1);
    const rng = new Rng(1);
    crownDay(c, 1, rng);
    const [order] = actContracts(c, 'ordem');
    expect(order).toBeDefined();
    const inv = Object.keys(c.inventory).length;
    crownOrderDone(c, order!, rng);
    expect(ensureActs(c).favor).toBe(ACTS.crown.favorStart + ACTS.crown.orderFavor);
    expect(Object.keys(c.inventory).length).toBeGreaterThanOrEqual(inv);
    c.hours = order!.expiresAt! + 1;
    order!.status = 'accepted';
    crownDay(c, 20, rng);
    expect(ensureActs(c).favor).toBe(ACTS.crown.favorStart);
    expect(ensureActs(c).suspicion).toBe(ACTS.crown.orderSuspicion);
  });

  it('Suspeita alta faz menos gente ficar com o rei; Favor vira soldo', () => {
    const c = camp(1);
    actsMissionDone(c, 'a1_5', 'citadela', 1);
    actsMissionDone(c, 'a1_3', 'clerigos_c0', 1);
    expect(ensureActs(c).suspicion).toBe(35);
    ensureActs(c).suspicion = 90;
    expect(desertionShift(c)).toBeGreaterThan(0);
    expect(desertionGold(c)).toBe(ACTS.crown.favorStart * ACTS.crown.favorGold);
  });
});

describe('Ato 2: Procurado e quadro de investigação', () => {
  it('batalhas sobem o Procurado; alto, a loja cobra suborno e o recrutamento fecha', () => {
    const c = camp(2);
    const cap = 'guerreiros_capital';
    const base = shopPrice(c, cap, 'faca_simples');
    for (let i = 0; i < 5; i++) fugitiveAfterBattle(c, cap, false, 0, new Rng(i));
    expect(ensureActs(c).wanted[provinceOf(cap)]).toBe(5);
    expect(wantedPrice(c, cap)).toBe(ACTS.fugitive.priceMult);
    expect(shopPrice(c, cap, 'faca_simples')).toBeGreaterThan(base);
    refreshRecruits(c, cap);
    expect(c.recruits[cap]!.list.length).toBe(0);
    expect(item('faca_simples')).toBeDefined();
  });

  it('missões pedem pistas; verificar descarta as falsas; pista falsa vira emboscada', () => {
    const c = camp(2);
    expect(fugitiveBlock(c, 'a2_5')).toContain('0/3');
    const rng = new Rng(3);
    for (let i = 0; i < 6; i++) addClue(c, rng);
    const a = ensureActs(c);
    a.clues.forEach((cl, i) => (cl.real = i !== 0));
    ensurePolitics(c).intel = 99;
    expect(verifyClue(c, a.clues[0]!.id)).toBe('falsa');
    expect(a.clues.length).toBe(5);
    expect(fugitiveBlock(c, 'a2_5')).toBeNull();
    a.clues[0]!.real = false;
    const setup = fakeSetup();
    expect(useClues(c, 'a2_5', setup)).toContain('falsa');
    expect(setup.ambush).toBe(true);
    expect(a.clues.length).toBe(2);
  });
});

describe('Ato 3: frentes e preparo do palácio', () => {
  it('a semana abre operações; cumprir muda a balança e prepara o assalto', () => {
    const c = camp(3);
    const lines = frontsDay(c, 7, new Rng(2));
    expect(lines.some((l) => l.includes('Operação'))).toBe(true);
    const op = actContracts(c, 'frente')[0]!;
    const country = op.actOp!.ref.split(':')[0];
    const f = ensureFronts(c).find((x) => x.country === country)!;
    const before = { crown: f.crown, res: f.resistance, morale: f.morale };
    frontOpDone(c, op);
    expect(f.crown < before.crown || f.resistance > before.res || f.morale < before.morale).toBe(true);
    expect(ensureActs(c).prep).toBe(1);
    ensureActs(c).prep = 2;
    const setup = fakeSetup();
    palacePrep(c, 'a3_7', setup, new Rng(1));
    expect(setup.waves!.length).toBe(1);
    expect(setup.allies!.length).toBe(2);
  });

  it('frente forte toma cidades da Coroa', () => {
    const c = camp(3);
    for (const st of Object.values(ensureWorld(c).provinces)) st.owner = 'coroa';
    for (const f of ensureFronts(c)) ((f.resistance = 100), (f.crown = 0));
    const lines = frontsDay(c, 7, new Rng(4));
    expect(lines.some((l) => l.includes('tomou'))).toBe(true);
  });
});

describe('Ato 4: portais, Terra Morta e alianças', () => {
  it('portal amadurece, leva moradores e espalha Terra Morta; fechar remove', () => {
    const c = camp(4);
    portalsDay(c, 6, new Rng(1));
    const a = ensureActs(c);
    expect(a.portals.length).toBe(1);
    const p = a.portals[0]!;
    const ct = actContracts(c, 'portal')[0]!;
    expect(portalClosed(c, ct)).toHaveLength(1);
    expect(a.portals.length).toBe(0);
    portalsDay(c, 12, new Rng(1));
    const q = a.portals[0]!;
    q.maturity = 99;
    portalsDay(c, 13, new Rng(1));
    expect(a.blighted).toContain(provinceOf(q.at));
    expect(c.abducted).toBeGreaterThan(0);
    expect(actsRegion(c, q.at)).toBe('terra_morta');
    expect(p.id).not.toBe(q.id);
  });

  it('aliança pede confiança e influência; capital em pânico cai', () => {
    const c = camp(4);
    expect(allianceBlock(c, 'magos')).toContain('Confiança');
    addRep(c, 'magos', 30);
    ensurePolitics(c).influence = 50;
    expect(makeAlliance(c, 'magos')).toBe(true);
    expect(provinceState(c, provinceOf('magos_capital')).owner).toBe('resistencia');
    provinceState(c, provinceOf('ladroes_capital')).fear = 100;
    portalsDay(c, 1, new Rng(1));
    expect(fallenCapitals(c)).toContain('ladroes_capital');
    provinceState(c, provinceOf('magos_capital')).fear = 100;
    portalsDay(c, 2, new Rng(1));
    expect(fallenCapitals(c)).not.toContain('magos_capital');
  });
});

describe('Ato 5: Vazio, corrupção e caravana', () => {
  it('no Vazio a corrupção sobe e deixa mutações permanentes; o Santuário limpa só a corrupção', () => {
    const c = camp(5);
    const s = c.squads[0]!;
    s.at = 'magos_capital';
    expect(crossVoid(c, s)).toBe(true);
    expect(inVoid(c, s)).toBe(true);
    expect(actsRegion(c, s.at, s)).toBe('terra_morta');
    const m = members(c, s)[0]!;
    const total = () => m.attrs.str + m.attrs.dex + m.attrs.spd + m.attrs.int + m.attrs.vit;
    const t0 = total();
    for (let d = 0; d < 13; d++) voidDay(c, (a) => a[0]!);
    expect(ensureActs(c).corruption[m.id]).toBe(52);
    expect(total()).toBe(t0 - 2);
    expect(cleanseBlock(c, m)).toContain('Santuário');
    foundBase(c, 'magos_capital');
    c.base!.facilities.push('santuario');
    expect(cleanse(c, m)).toBe(true);
    expect(ensureActs(c).corruption[m.id]).toBe(0);
    expect(ensureActs(c).mutations[m.id]).toHaveLength(1);
  });

  it('caravana anda com escolta e perde gente sem', () => {
    const c = camp(5);
    startCaravan(c);
    const cv = ensureActs(c).caravan!;
    c.squads[0]!.at = 'citadela';
    caravanDay(c);
    expect(cv.survivors).toBeLessThan(ACTS.void.caravan.survivors);
    c.squads[0]!.at = cv.at;
    const before = cv.route.length;
    caravanDay(c);
    expect(cv.route.length < before || cv.progress > 0).toBe(true);
    expect(travelHours([cv.at, ...shortestPath(cv.at, c.baseNode)])).toBeGreaterThanOrEqual(0);
  });
});

describe('Ato 6: acampamento e mundos sobrepostos', () => {
  it('acampamento só no continente; a semana troca biomas', () => {
    const c = camp(6);
    const s = c.squads[0]!;
    s.at = 'continente_selva';
    expect(setCamp(c, s)).toBe(true);
    expect(atCamp(c, 'continente_selva')).toBe(true);
    const lines = shiftDay(c, 7, new Rng(5));
    expect(lines.length).toBe(ACTS.camp.shiftCount);
    const [id] = Object.keys(ensureActs(c).shifted);
    expect(actsRegion(c, id!)).toBe(ensureActs(c).shifted[id!]);
    expect(node(id!).realm).toBe('continente');
  });
});

describe('Ato 7: Barões', () => {
  it('postos viram missões; tomar dá posto e atrasa o Despertar; matar um fortalece os outros', () => {
    const c = camp(7);
    c.act = 7;
    ensureVeil(c).value = 50;
    baronsDay(c, new Rng(1));
    const posts = actContracts(c, 'barao');
    expect(posts.length).toBe(ACTS.barons.list.length * ACTS.barons.postsPerDomain);
    baronPostTaken(c, posts[0] as Contract);
    expect(c.outposts?.[posts[0]!.targetNode]).toBe(ACTS.barons.postReward);
    expect(c.veil!.value).toBe(50 - ACTS.barons.postDelay);
    baronKilled(c, 'a7_3');
    const [pastor, coro] = ensureBarons(c);
    expect(pastor!.dead).toBe(true);
    expect(coro!.rage).toBe(1);
  });
});

describe('Ato 8: mesa de guerra', () => {
  it('pontos vêm do que foi juntado; frente bem servida ganha aliados', () => {
    const c = camp(8);
    ensureActs(c).alliances.push('magos', 'arqueiros', 'guerreiros');
    const { total } = warPoints(c);
    expect(total).toBeGreaterThanOrEqual(9);
    for (let i = 0; i < 6; i++) expect(allocate(c, 'posto', 1)).toBe(true);
    expect(frontWon(c, 'posto')).toBe(true);
    for (let i = 0; i < 99; i++) allocate(c, 'coracao', 1);
    expect(Object.values(ensureActs(c).warTable).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(total);
    const setup = fakeSetup();
    expect(warTableSetup(c, 'a8_2', setup, new Rng(1))).toContain('chegaram');
    expect(setup.allies!.length).toBe(ACTS.warTable.wonAllies);
    expect(setup.waves!.length).toBe(2);
  });
});
