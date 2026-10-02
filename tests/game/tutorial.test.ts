import { describe, expect, it } from 'vitest';
import { newCampaign } from '@game/world/campaign';
import { STORY } from '@game/world/story';
import { finishMission, storySetup } from '@game/world/story_battle';
import { HINTS, LESSONS, featureUnlocked, takeNewUnlocks } from '@game/world/tutorial';
import { battleHints } from '@game/battle/hints';
import { createBattle } from '@game/battle/engine';
import GLOSSARY from '@game/data/story/glossary.json';

const gloss = new Set((GLOSSARY as { id: string }[]).map((g) => g.id));

describe('tutorial no Prólogo', () => {
  it('toda missão do Prólogo tem lição; cartas e dicas apontam para verbetes que existem', () => {
    for (const m of STORY.filter((x) => x.chapter === 0)) expect(LESSONS[m.id], m.id).toBeTruthy();
    for (const l of Object.values(LESSONS)) for (const c of l.cards) if (c.g) expect(gloss.has(c.g), c.g).toBe(true);
    for (const [id, c] of Object.entries(HINTS)) if (c.g) expect(gloss.has(c.g), id).toBe(true);
  });

  it('libera um recurso do mapa a cada missão do Prólogo', () => {
    const c = newCampaign(1);
    expect(featureUnlocked(c, 'viagem')).toBe(false);
    finishMission(c, STORY.find((m) => m.id === 'p1')!);
    expect(featureUnlocked(c, 'viagem')).toBe(true);
    expect(featureUnlocked(c, 'loja')).toBe(false);
    expect(takeNewUnlocks(c).map((u) => u.feature)).toEqual(['viagem']);
    expect(takeNewUnlocks(c)).toEqual([]);
    finishMission(c, STORY.find((m) => m.id === 'p3')!);
    expect(featureUnlocked(c, 'loja')).toBe(true);
    // Sem tutorial: tudo livre.
    const free = newCampaign(2, { tutorial: false });
    expect(featureUnlocked(free, 'servicos')).toBe(true);
  });

  it('a batalha da missão carrega a lição', () => {
    const c = newCampaign(3);
    const set = storySetup(c, c.squads[0]!, STORY[0]!);
    expect(set.context.lesson).toBe('p1');
    const off = newCampaign(4, { tutorial: false });
    expect(storySetup(off, off.squads[0]!, STORY[0]!).context.lesson).toBeUndefined();
  });

  it('dicas de batalha reagem ao estado', () => {
    const c = newCampaign(5);
    const st = createBattle(storySetup(c, c.squads[0]!, STORY.find((m) => m.id === 'p5')!));
    const ids = battleHints(st, { intents: true, moving: false, reactionReady: false, bonded: false });
    expect(ids).toEqual(expect.arrayContaining(['h_stealth', 'h_objective', 'h_intent']));
  });
});
