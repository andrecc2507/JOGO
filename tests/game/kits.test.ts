import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, STORY_KITS, skill } from '@game/data';
import { castSkill, createBattle, skillTargets, teamVision } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign } from '@game/world/campaign';
import { node } from '@game/world/layout';
import { CODEX_ENTRIES, PERSONAL, availableMissions, ensureStory, mission } from '@game/world/story';
import { finishMission, storySetup } from '@game/world/story_battle';

describe('kits únicos e missões pessoais', () => {
  it('cada personagem da história tem kit com habilidades instaladas e uma missão pessoal válida', () => {
    for (const [who, kit] of Object.entries(STORY_KITS)) {
      for (const id of [...kit.skills, kit.ultimate]) expect(DB.skills[id], `${who}: ${id}`).toBeTruthy();
      const pm = PERSONAL.find((m) => m.id === kit.personal)!;
      expect(pm.personal).toBe(who);
      expect(node(pm.node)).toBeTruthy();
      for (const r of pm.requires ?? []) expect(mission(r), r).toBeTruthy();
      for (const c of pm.codex ?? []) expect(CODEX_ENTRIES[c]).toBeTruthy();
      for (const f of pm.battle?.enemies ?? []) expect(DB.enemies[f.id], f.id).toBeTruthy();
    }
  });

  it('a unidade leva o kit; a suprema só depois da missão pessoal', () => {
    const c = newCampaign(1);
    const ed = makeCharacter(new Rng(2), { classId: 'guerreiro', level: 12, name: 'Edran' });
    ed.storyId = 'Edran';
    c.roster[ed.id] = ed;
    let u = unitFromCharacter(ed, 'player');
    expect(u.skills).toEqual(expect.arrayContaining(STORY_KITS.Edran!.skills));
    expect(u.skills).not.toContain('edran_porta_trancada');
    expect(u.title).toBe('Veterano da Guarda');
    const st = ensureStory(c);
    st.chapter = 2;
    st.done.push('a2_1');
    const pm = availableMissions(c).find((m) => m.id === 'pm_edran')!;
    expect(pm).toBeTruthy();
    expect(storySetup(c, c.squads[0]!, pm).enemies.length).toBeGreaterThan(0);
    finishMission(c, pm);
    expect(ed.kitUltimate).toBe(true);
    u = unitFromCharacter(ed, 'player');
    expect(u.skills).toContain('edran_porta_trancada');
    expect(availableMissions(c).some((m) => m.id === 'pm_edran')).toBe(false);
  });

  it('missão pessoal só aparece com o personagem no elenco', () => {
    const c = newCampaign(3);
    const st = ensureStory(c);
    st.chapter = 2;
    st.done.push('a2_1');
    expect(availableMissions(c).some((m) => m.id === 'pm_edran')).toBe(false);
  });
});


describe('habilidades dos kits funcionam no motor', () => {
  function battle(classId: 'guerreiro' | 'clerigo' | 'mago' | 'ladrao', storyId: string) {
    const rng = new Rng(5);
    const hero = makeCharacter(rng, { classId, level: 20, name: storyId });
    hero.storyId = storyId;
    hero.kitUltimate = true;
    hero.mp = 999;
    const ally = makeCharacter(rng, { classId: 'guerreiro', level: 20 });
    const uh = unitFromCharacter(hero, 'player');
    const ua = unitFromCharacter(ally, 'player');
    const foe = unitFromEnemy(DB.enemies.soldado_real!, 20, rng);
    const st = createBattle({ map: createEmptyMap(12, 12, 'planicie'), players: [uh, ua], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 2, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: '' } });
    [uh.x, uh.y, ua.x, ua.y, foe.x, foe.y] = [3, 3, 3, 4, 5, 3];
    uh.mp = uh.maxMp = 999;
    st.activeUid = uh.uid;
    st.turn = { moved: false, acted: false, startX: 3, startY: 3 };
    return { st, uh, ua, foe };
  }

  it('Grito de Arven inspira os aliados em volta', () => {
    const { st, uh, ua } = battle('guerreiro', 'Maela');
    const sk = skill('maela_grito_de_arven');
    const [x, y] = [uh.x, uh.y];
    expect(castSkill(st, uh, sk, x, y)).toBe(true);
    expect(ua.statuses.inspirado).toBeTruthy();
  });

  it('O Sétimo Selo cura os aliados em volta', () => {
    const { st, uh, ua } = battle('clerigo', 'Lirael');
    ua.hp = 10;
    expect(castSkill(st, uh, skill('lirael_setimo_selo'), uh.x, uh.y)).toBe(true);
    expect(ua.hp).toBeGreaterThan(10);
  });

  it('Selo de Luz fere o inimigo', () => {
    const { st, uh, foe } = battle('clerigo', 'Lirael');
    const sk = skill('lirael_selo_de_luz');
    const tiles = skillTargets(st, uh, sk, teamVision(st, 'player'));
    expect(tiles.length).toBeGreaterThan(0);
    const hp = foe.hp;
    for (let i = 0; i < 6 && foe.hp === hp; i++) {
      uh.cooldowns = {};
      st.turn.acted = false;
      castSkill(st, uh, sk, foe.x, foe.y);
    }
    expect(foe.hp).toBeLessThan(hp);
  });
});
