import { describe, expect, it } from 'vitest';
import { buildResult, createBattle, endTurn, stepTime } from '@game/battle/engine';
import { newCampaign } from '@game/world/campaign';
import { foundBase } from '@game/world/base';
import { applyBattleResult } from '@game/world/encounters';
import { STORY, availableMissions, ensureStory, fallenCapitals, mission, setFlag } from '@game/world/story';
import { applyConsequences, storySetup } from '@game/world/story_battle';

describe('escolhas com peso mecânico', () => {
  it('a capital não socorrida cai: aliança perdida e missão exclusiva das ruínas', () => {
    const c = newCampaign(1);
    foundBase(c, 'guerreiros_capital');
    const st = ensureStory(c);
    st.chapter = 4;
    setFlag(c, 'socorro_ladroes');
    applyConsequences(c, mission('a4_1')!);
    expect(fallenCapitals(c)).toEqual(['magos_capital']);
    expect(st.lost).toContain('a4_3b');
    st.done.push('a4_1', 'a4_2');
    const ids = availableMissions(c).map((m) => m.id);
    expect(ids).toContain('a4_rm');
    expect(ids).not.toContain('a4_rl');
    expect(ids).not.toContain('a4_3b');
  });

  it('a base nunca cai', () => {
    const c = newCampaign(2);
    foundBase(c, 'ladroes_capital');
    setFlag(c, 'socorro_magos');
    const lines = applyConsequences(c, mission('a4_1')!);
    expect(fallenCapitals(c)).toEqual([]);
    expect(lines[0]).toContain('defesas');
  });

  it('missão de ramo: só a do caminho escolhido existe', () => {
    const c = newCampaign(3);
    const st = ensureStory(c);
    st.chapter = 2;
    st.done.push(...STORY.filter((m) => m.chapter < 2).map((m) => m.id), 'a2_1', 'a2_2', 'a2_3');
    setFlag(c, 'criancas_ostran');
    const ids = availableMissions(c).map((m) => m.id);
    expect(ids).toContain('a2_o');
    expect(ids).not.toContain('a2_r');
  });

  it('herói ressentido trai na batalha decisiva e deixa a resistência', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    const traitor = c.roster[s.memberIds[2]!]!;
    traitor.loyalty = 10;
    const set = storySetup(c, s, mission('a3_7')!);
    const u = set.players.find((p) => p.charId === traitor.id)!;
    expect(u.betrayAt).toBe(3);
    const state = createBattle(set);
    for (let i = 0; i < 500 && state.round < 3 && !state.outcome; i++) if (stepTime(state, 1)) endTurn(state);
    expect(u.team).toBe('enemy');
    expect(state.log.some((l) => l.includes('traiu'))).toBe(true);
    const r = buildResult(state, set.context);
    applyBattleResult(c, r);
    expect(c.roster[traitor.id]).toBeUndefined();
    expect((c.chronicle ?? []).some((e) => e.text.includes('traiu'))).toBe(true);
  });
});
