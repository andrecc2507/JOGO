import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, STORY_KITS } from '@game/data';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign } from '@game/world/campaign';
import { CITADEL_ID, node, shortestPath, edgeLength, edgeSpeed } from '@game/world/layout';
import { availableMissions, ensureStory, mission, placeOpen, WORLD_MISSIONS, worldOpen } from '@game/world/story';
import { finishMission } from '@game/world/story_battle';
import { unitFromCharacter } from '@game/battle/units';

describe('mundos paralelos (portal do palácio)', () => {
  it('o portal só chama com o Xamã no elenco; ao concluir, Sarth e Hrimgard abrem', () => {
    const c = newCampaign(11);
    const st = ensureStory(c);
    st.chapter = 5;
    st.done.push('a4_8');
    expect(availableMissions(c).some((m) => m.id === 'mw_portal')).toBe(false);
    const orun = makeCharacter(new Rng(1), { classId: 'mago', level: 22, name: 'Orun' });
    orun.storyId = 'Orun';
    c.roster[orun.id] = orun;
    expect(availableMissions(c).some((m) => m.id === 'mw_portal')).toBe(true);
    expect(placeOpen(c, node('sarth_portal'))).toBe(false);
    finishMission(c, mission('mw_portal')!);
    expect(worldOpen(c, 'sarth') && worldOpen(c, 'hrimgard')).toBe(true);
    expect(placeOpen(c, node('sarth_portal'))).toBe(true);
    const ids = availableMissions(c).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['mw_sarth1', 'mw_hrim1']));
  });

  it('a passagem do portal leva poucas horas, apesar da distância no mapa', () => {
    const path = shortestPath(CITADEL_ID, 'sarth_ossar');
    expect(path[0]).toBe('sarth_portal');
    const hours = edgeLength(CITADEL_ID, 'sarth_portal') / edgeSpeed(CITADEL_ID, 'sarth_portal');
    expect(hours).toBeLessThan(edgeLength(CITADEL_ID, 'sarth_portal') / 2);
  });

  it('heróis únicos: Escamados têm mobilidade alta; Altos têm a classe psíquica; supremas no fim das cadeias', () => {
    const recruits = WORLD_MISSIONS.flatMap((m) => (m.reward?.recruit ? [m.reward.recruit.name] : []));
    expect(recruits).toEqual(['Ssaruk', 'Ithra', 'Vel-Kesh', 'Ysolde', 'Torvald']);
    for (const name of recruits) {
      const kit = STORY_KITS[name]!;
      expect(kit).toBeTruthy();
      for (const id of [...kit.skills, kit.ultimate]) expect(DB.skills[id], id).toBeTruthy();
    }
    const ch = makeCharacter(new Rng(3), { classId: 'guerreiro', level: 22, name: 'Ssaruk' });
    const base = unitFromCharacter(ch, 'player');
    ch.storyId = 'Ssaruk';
    const reptile = unitFromCharacter(ch, 'player');
    expect(reptile.skills).toContain('escamado_sangue_agil');
    expect(DB.skills.escamado_sangue_agil!.fx?.moveBonus).toBe(2);
    expect(base.skills).not.toContain('escamado_sangue_agil');
    expect(WORLD_MISSIONS.filter((m) => m.reward?.kitFor?.length).map((m) => m.id)).toEqual(['mw_sarth5', 'mw_hrim2']);
    // Inimigos das missões existem.
    for (const m of WORLD_MISSIONS) for (const e of [...(m.battle?.enemies ?? []), ...(m.battle?.waves ?? []).flatMap((w) => w.enemies)]) expect(DB.enemies[e.id], `${m.id}: ${e.id}`).toBeTruthy();
  });
});
