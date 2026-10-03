import { describe, expect, it } from 'vitest';
import { createBattle, endTurn, stepTime } from '@game/battle/engine';
import { isWalkable, tileAt } from '@game/battle/map';
import { STORY_MAPS, buildStoryMap } from '@game/mapgen/story_maps';
import { newCampaign } from '@game/world/campaign';
import { mission } from '@game/world/story';
import { storySetup } from '@game/world/story_battle';
import { settings } from '@game/state/settings';
import { t } from '@game/i18n/i18n';

describe('mapas feitos à mão', () => {
  it('todos montam, têm início dos dois lados e linhas do mesmo tamanho', () => {
    for (const [id, def] of Object.entries(STORY_MAPS)) {
      expect(new Set(def.rows.map((r) => r.length)).size, id).toBe(1);
      const m = buildStoryMap(id)!;
      expect(m.tiles.filter((x) => x.spawn === 'player').length, id).toBeGreaterThanOrEqual(4);
      expect(m.tiles.some((x) => x.spawn === 'enemy'), id).toBe(true);
    }
  });

  it('a missão usa o mapa desenhado', () => {
    const c = newCampaign(1);
    const set = storySetup(c, c.squads[0]!, mission('a3_8')!);
    expect(set.map.name).toBe('Salão Oval');
    const st = createBattle(set);
    for (const u of st.units.filter((x) => x.team === 'player')) expect(isWalkable(tileAt(st.map, u.x, u.y)!)).toBe(true);
  });

  it('o caminho desaba uma coluna por rodada', () => {
    const c = newCampaign(2);
    const set = storySetup(c, c.squads[0]!, mission('a8_3')!);
    expect(set.collapse).toBe(true);
    const st = createBattle(set);
    for (let i = 0; i < 800 && st.round < 4 && !st.outcome; i++) if (stepTime(st, 1)) endTurn(st);
    expect(st.collapsed).toBeGreaterThanOrEqual(2);
    for (let y = 0; y < st.map.h; y++) expect(tileAt(st.map, 0, y)!.t).toBe('agua_funda');
    for (const u of st.units.filter((x) => x.alive)) expect(u.x).toBeGreaterThanOrEqual(st.collapsed!);
  });
});

describe('tradução da interface', () => {
  it('inglês quando escolhido; texto original sem tradução', () => {
    settings.language = 'en';
    expect(t('Novo jogo')).toBe('New game');
    expect(t('texto sem tradução')).toBe('texto sem tradução');
    settings.language = 'pt';
    expect(t('Novo jogo')).toBe('Novo jogo');
  });
});
