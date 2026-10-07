import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { members, newCampaign, refreshRecruits, shopPrice, type Campaign } from '@game/world/campaign';
import { contractDonePolitics, counterOp, expireCrises, startCrisis } from '@game/world/commander';
import { playerUnits } from '@game/world/encounters';
import { buyRations, rationPrice, SUPPLY } from '@game/world/logistics';
import { APPROVAL, OPS, REP, RES, addRep, approval, approvalState, counterSlotsLeft, ensurePolitics, monthOps, opActive, politicsFromFlags, priceMult, rep, revealOp } from '@game/world/politics';
import { ensureStory } from '@game/world/story';
import { ensureWorld } from '@game/world/territory';

function camp(chapter = 2): Campaign {
  const c = newCampaign(5);
  ensureStory(c).chapter = chapter;
  return c;
}

/** Marca o primeiro membro do primeiro esquadrão como personagem da história. */
function storyMember(c: Campaign, storyId: string) {
  const m = members(c, c.squads[0]!)[0]!;
  m.storyId = storyId;
  return m;
}

describe('reputação e aprovação (C15, C16)', () => {
  it('marca da história conta uma vez só', () => {
    const c = camp();
    storyMember(c, 'Maela');
    ensureStory(c).flags.push('criancas_rebeldes');
    politicsFromFlags(c);
    politicsFromFlags(c);
    expect(rep(c, 'resistencia')).toBe(15);
    expect(approval(c, 'Maela')).toBe(25);
  });

  it('aprovação de quem não está no elenco não muda', () => {
    const c = camp();
    ensureStory(c).flags.push('criancas_rebeldes');
    politicsFromFlags(c);
    expect(approval(c, 'Maela')).toBe(0);
  });

  it('confia dá bônus; recusa não luta; no fundo vai embora', () => {
    const c = camp();
    const s = c.squads[0]!;
    const m = storyMember(c, 'Maela');
    const base = playerUnits(c, s).find((u) => u.charId === m.id)!;
    ensurePolitics(c).approval.Maela = APPROVAL.trust;
    expect(approvalState(c, 'Maela')).toBe('confia');
    const trusted = playerUnits(c, s).find((u) => u.charId === m.id)!;
    expect(trusted.accuracy).toBe(base.accuracy + APPROVAL.trustAccuracy);
    ensurePolitics(c).approval.Maela = APPROVAL.refuse;
    expect(playerUnits(c, s).some((u) => u.charId === m.id)).toBe(false);
    ensurePolitics(c).approval.Maela = APPROVAL.leave;
    politicsFromFlags(c);
    expect(c.roster[m.id]).toBeUndefined();
    expect(s.memberIds).not.toContain(m.id);
  });
});

describe('preços e recrutas pela reputação', () => {
  it('reputação barateia, a Sobretaxa encarece', () => {
    const c = camp();
    const cap = 'guerreiros_capital';
    const p0 = priceMult(c, 'guerreiros');
    addRep(c, 'guerreiros', 40);
    expect(priceMult(c, 'guerreiros')).toBeLessThan(p0);
    ensurePolitics(c).active.push({ id: 'sobretaxa', until: c.hours + 100 });
    expect(priceMult(c, 'guerreiros')).toBeCloseTo((1 - 40 / REP.priceSpan) * OPS.list.sobretaxa.price);
    expect(shopPrice(c, cap, 'faca_simples')).toBeGreaterThan(0);
  });

  it('país hostil fecha o recrutamento; aliado manda um a mais', () => {
    const c = camp();
    const cap = 'guerreiros_capital';
    refreshRecruits(c, cap);
    const n = c.recruits[cap]!.list.length;
    addRep(c, 'guerreiros', REP.recruitBlockAt);
    refreshRecruits(c, cap);
    expect(c.recruits[cap]!.list.length).toBe(0);
    addRep(c, 'guerreiros', REP.recruitBonusAt - REP.recruitBlockAt);
    refreshRecruits(c, cap);
    expect(c.recruits[cap]!.list.length).toBe(n + 1);
  });

  it('Colheita queimada dobra o preço das rações', () => {
    const c = camp();
    expect(rationPrice(c)).toBe(SUPPLY.price);
    ensurePolitics(c).active.push({ id: 'colheita_queimada', until: c.hours + 100 });
    const s = c.squads[0]!;
    s.supplies = 0;
    const g = c.gold;
    const k = buyRations(c, s, 6, 5);
    expect(c.gold).toBe(g - k * SUPPLY.price * 2);
  });
});

describe('planos do inimigo (C12, C20)', () => {
  it('o mês propõe planos; os não frustrados entram em vigor no mês seguinte', () => {
    const c = camp(2);
    const rng = new Rng(3);
    monthOps(c, rng);
    const p = ensurePolitics(c);
    expect(p.proposed.length).toBe(OPS.perMonth);
    for (const op of p.proposed) expect(OPS.list[op.id].from).toBeLessThanOrEqual(2);
    p.proposed[0]!.foiled = true;
    const [foiled, a, b] = p.proposed.map((o) => o.id);
    monthOps(c, rng);
    expect(opActive(c, foiled!)).toBe(false);
    expect(opActive(c, a!) && opActive(c, b!)).toBe(true);
  });

  it('revelar gasta informação; frustrar abre missão que, cumprida, derruba o plano', () => {
    const c = camp(2);
    monthOps(c, new Rng(9));
    const p = ensurePolitics(c);
    p.intel = RES.revealOpCost;
    expect(revealOp(c, 0)).toBe(true);
    expect(p.intel).toBe(0);
    expect(revealOp(c, 1)).toBe(false);
    const ct = counterOp(c, 0)!;
    expect(ct.opId).toBe(p.proposed[0]!.id);
    expect(counterSlotsLeft(c)).toBe(0);
    expect(counterOp(c, 1)).toBeNull();
    contractDonePolitics(c, ct);
    expect(p.proposed[0]!.foiled).toBe(true);
    expect(rep(c, 'povo')).toBe(REP.crisisDone);
    expect(p.influence).toBe(RES.influenceCrisis);
  });

  it('crise ignorada custa reputação com o povo', () => {
    const c = camp(2);
    for (const st of Object.values(ensureWorld(c).provinces)) st.owner = 'resistencia';
    const made = startCrisis(c);
    expect(made.length).toBeGreaterThan(0);
    c.hours = Math.max(...made.map((ct) => ct.expiresAt ?? 0)) + 1;
    expireCrises(c);
    expect(rep(c, 'povo')).toBe(REP.crisisIgnored * made.length);
  });
});
