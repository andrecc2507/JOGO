import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { advanceHours, members, newCampaign, orderMove, seaFee, travelHours, type Campaign } from '@game/world/campaign';
import { playerUnits } from '@game/world/encounters';
import { foundBase } from '@game/world/base';
import { node, shortestPath } from '@game/world/layout';
import type { BattleResult } from '@game/battle/types';
import { travelCheckChance } from '@game/rules/stats';
import { SEASONS, applyWeather, ensureSeason, seasonOf, seasonSpeed } from '@game/world/season';
import { campRest, dungeonAfterBattle, dungeonInfo, dungeonSetup, dungeonState } from '@game/world/dungeon';
import { EXPLORATION, arriveExpedition, ensureExpedition, giveClue } from '@game/world/expedition';
import { OUTPOST_KINDS, buildBlock, buildOutpost, outpostsMonth, raidOutpost } from '@game/world/outposts';
import { CAPTAINS, CAPTAIN_SKILLS, captainSpeed, learnBlock, learnCaptainSkill, setCaptain } from '@game/world/captains';
import { TRAVEL_EVENTS, choiceChance, eventPool, resolveChoice } from '@game/world/travel_events';
import { boardContracts, checkTasks, openBoards, refreshBoard } from '@game/world/boards';
import { rep } from '@game/world/politics';
import { ensureStory } from '@game/world/story';
import { ensureWorld } from '@game/world/territory';

function camp(chapter = 2): Campaign {
  const c = newCampaign(5);
  ensureStory(c).chapter = chapter;
  c.gold = 5000;
  return c;
}

const result = (setupCtx: BattleResult['context'], outcome: BattleResult['outcome']) => ({ outcome, context: setupCtx }) as unknown as BattleResult;

describe('estações e clima (C7)', () => {
  it('meses viram estações; inverno deixa a neve lenta; chuva deixa poças na batalha', () => {
    const c = camp();
    expect(seasonOf(c)).toBe('primavera');
    c.hours = 24 * 30 * 3;
    expect(seasonOf(c)).toBe('inverno');
    expect(seasonSpeed(c, 'neve')).toBe(SEASONS.winterSpeed);
    expect(seasonSpeed(c, 'deserto')).toBe(1);
    const s = c.squads[0]!;
    const setup = dungeonSetup(c, s, 'pantano_masmorra');
    setup.map.tiles.forEach((t) => (t.s = null));
    applyWeather(setup, 'chuva', new Rng(1));
    expect(setup.map.tiles.some((t) => t.s === 'agua')).toBe(true);
    applyWeather(setup, 'neblina', new Rng(1));
    expect(setup.timeOfDay).toBe('noite');
  });

  it('tempestade fecha o mar; o barco cobra passagem', () => {
    const c = camp();
    const s = c.squads[0]!;
    const fee = seaFee(c, s, 'arquipelago_vila');
    expect(fee).toBeGreaterThan(0);
    const g = c.gold;
    expect(orderMove(c, s, 'arquipelago_vila')).toBe(true);
    expect(c.gold).toBe(g - fee);
    s.to = null;
    s.route = [];
    ensureSeason(c).stormUntil = c.hours + 48;
    expect(orderMove(c, s, 'arquipelago_vila')).toBe(false);
  });
});

describe('eventos de viagem (C17)', () => {
  it('teste: 50% no empate, sobe com o atributo e o traço ajuda', () => {
    expect(travelCheckChance(10 + 0.6 * 10, 10, 0)).toBe(50);
    expect(travelCheckChance(30, 10, 0)).toBeGreaterThan(90);
    const c = camp();
    const s = c.squads[0]!;
    const ev = TRAVEL_EVENTS.find((e) => e.id === 'ponte_quebrada')!;
    const before = choiceChance(c, s, ev.choices[0]!)!;
    members(c, s)[0]!.trait = 'veterano';
    expect(choiceChance(c, s, ev.choices[0]!)!).toBeGreaterThan(before);
  });

  it('custos e resultados entram na campanha; eventos respeitam a região', () => {
    const c = camp();
    const s = c.squads[0]!;
    s.supplies = 20;
    const ev = TRAVEL_EVENTS.find((e) => e.id === 'peregrinos_doentes')!;
    const res = resolveChoice(c, s, ev, 1, new Rng(2));
    expect(res.ok).toBe(true);
    expect(s.supplies).toBe(12);
    expect(rep(c, 'povo')).toBe(3);
    expect(eventPool(c, 'magos_c0').every((e) => !e.regions || e.regions.includes(node('magos_c0').region))).toBe(true);
  });
});

describe('masmorras e lendas (C6, C25, C26)', () => {
  it('andares em sequência; chefe e item único no último; limpa no fim', () => {
    const c = camp();
    const s = c.squads[0]!;
    const id = 'vulcao_masmorra';
    const info = dungeonInfo(c, id);
    expect(info.floors).toBe(3);
    for (let f = 0; f < info.floors; f++) {
      const setup = dungeonSetup(c, s, id);
      const last = f === info.floors - 1;
      expect(setup.canFlee).toBe(false);
      expect(setup.enemies.some((u) => u.boss)).toBe(last);
      expect(setup.context.itemDrops).toEqual(last ? ['couraca_de_magma_frio'] : []);
      const out = dungeonAfterBattle(c, result(setup.context, 'victory'));
      expect(out.next).toBe(!last);
    }
    expect(dungeonState(c, id).cleared).toBe(true);
    expect(ensureExpedition(c).legends).toContain(id);
  });

  it('acampamento uma vez; derrota deixa metade do progresso', () => {
    const c = camp();
    const s = c.squads[0]!;
    const id = 'pantano_masmorra';
    dungeonAfterBattle(c, result(dungeonSetup(c, s, id).context, 'victory'));
    dungeonAfterBattle(c, result(dungeonSetup(c, s, id).context, 'victory'));
    const m = members(c, s)[0]!;
    m.hp = 1;
    expect(campRest(c, s, id)).toBe(true);
    expect(m.hp).toBeGreaterThan(1);
    expect(campRest(c, s, id)).toBe(false);
    dungeonAfterBattle(c, result(dungeonSetup(c, s, id).context, 'defeat'));
    expect(dungeonState(c, id).floor).toBe(1);
  });

  it('covil: sem pista só feras; com pista, a fera lendária', () => {
    const c = camp();
    const s = c.squads[0]!;
    expect(dungeonInfo(c, 'selva_covil').boss).toBeNull();
    ensureExpedition(c).clues.push('selva');
    expect(dungeonInfo(c, 'selva_covil').boss).toBe('Senhor das Mil Presas');
    expect(dungeonSetup(c, s, 'selva_covil').enemies.some((u) => u.boss)).toBe(true);
    expect(giveClue(c, new Rng(1))).toContain('Pista de lenda');
  });

  it('primeira visita rende informação, ouro e códice; o tesouro paga', () => {
    const c = camp();
    const s = c.squads[0]!;
    const g = c.gold;
    const lines = arriveExpedition(c, s, 'geleira_vila', new Rng(1));
    expect(lines.some((l) => l.includes('primeira vez'))).toBe(true);
    expect(ensureStory(c).codex).toContain('terra_geleira');
    expect(c.gold).toBe(g + EXPLORATION.firstVisitGold);
    expect(arriveExpedition(c, s, 'geleira_vila', new Rng(1))).toEqual([]);
    ensureExpedition(c).treasure = 'geleira_covil';
    arriveExpedition(c, s, 'geleira_covil', new Rng(1));
    expect(ensureExpedition(c).treasure).toBeUndefined();
    expect(c.gold).toBeGreaterThan(g + EXPLORATION.firstVisitGold * 2);
  });
});

describe('postos avançados (C18)', () => {
  it('constrói em terra aliada, cobra manutenção, cai num saque', () => {
    const c = camp(1);
    const s = c.squads[0]!;
    s.at = 'magos_c1';
    expect(buildBlock(c, s, 'refugio')).toContain('capítulo');
    ensureStory(c).chapter = 4;
    for (const st of Object.values(ensureWorld(c).provinces)) st.owner = 'resistencia';
    expect(buildOutpost(c, s, 'deposito')).toBe(true);
    expect(c.outposts?.magos_c1).toBe('deposito');
    const g = c.gold;
    outpostsMonth(c);
    expect(c.gold).toBe(g - OUTPOST_KINDS.deposito.upkeep);
    c.gold = 0;
    expect(outpostsMonth(c).some((l) => l.includes('abandonado'))).toBe(true);
    c.outposts = { magos_c1: 'torre' };
    expect(raidOutpost(c, 'magos_c1')).toContain('destruído');
  });
});

describe('capitães (C19)', () => {
  it('precisa da Academia; Inspirar melhora a mira; Marcha forçada acelera', () => {
    const c = camp();
    const s = c.squads[0]!;
    const cap = members(c, s)[0]!;
    expect(learnBlock(c, cap, 'inspirar')).toContain('Academia');
    foundBase(c, 'magos_capital');
    c.base!.facilities.push('academia');
    const base = playerUnits(c, s)[1]!;
    expect(learnCaptainSkill(c, cap, 'inspirar')).toBe(true);
    expect(learnCaptainSkill(c, cap, 'marcha_forcada')).toBe(true);
    expect(learnBlock(c, cap, 'intendente')).toContain(String(CAPTAINS.maxSkills));
    setCaptain(s, cap.id);
    expect(playerUnits(c, s)[1]!.accuracy).toBe(base.accuracy + CAPTAIN_SKILLS.inspirar.accuracy!);
    expect(captainSpeed(c, s)).toBe(CAPTAIN_SKILLS.marcha_forcada.speed);
  });
});

describe('quadros de facção (C23, C24)', () => {
  it('abre por capítulo; entrega conclui ao chegar; reconhecimento ao revelar', () => {
    const c = camp(2);
    expect(openBoards(c)).toContain('resistencia');
    expect(openBoards(camp(0))).not.toContain('resistencia');
    refreshBoard(c, 'guilda');
    expect(boardContracts(c, 'guilda').length).toBeGreaterThan(0);
    const s = c.squads[0]!;
    const ct = { ...boardContracts(c, 'guilda')[0]!, task: 'entrega' as const, targetNode: 'magos_c1', status: 'accepted' as const, squadId: s.id, expiresAt: c.hours + 999 };
    c.contracts.faccao_guilda = [ct];
    expect(checkTasks(c)).toEqual([]);
    s.at = 'magos_c1';
    const g = c.gold;
    expect(checkTasks(c).some((l) => l.includes('cumprido'))).toBe(true);
    expect(c.gold).toBe(g + ct.rewardGold);
    expect(rep(c, 'guilda')).toBeGreaterThan(0);
  });

  it('entrega com prazo perdido custa reputação', () => {
    const c = camp(2);
    refreshBoard(c, 'guilda');
    const ct = { ...boardContracts(c, 'guilda')[0]!, task: 'entrega' as const, status: 'accepted' as const, squadId: 'ninguem', expiresAt: c.hours + 1 };
    c.contracts.faccao_guilda = [ct];
    advanceHours(c, 24);
    expect(ct.failed).toBe(true);
    expect(rep(c, 'guilda')).toBeLessThan(0);
  });

  it('viagem pelo mapa leva tempo coerente com o caminho', () => {
    expect(travelHours(['citadela', ...shortestPath('citadela', 'magos_capital')])).toBeGreaterThan(24);
  });
});
