import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { createBattle, damage, stepTime, checkVictory } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign } from '@game/world/campaign';
import { foundBase } from '@game/world/base';
import { node } from '@game/world/layout';
import {
  CHAPTER_TITLE,
  CODEX_ENTRIES,
  EPILOGUE_LINES,
  PERSONAL,
  SPEAKER,
  STORY,
  endingOf,
  fallenCapitals,
  availableMissions,
  ensureStory,
  hasFlag,
  lineVisible,
  missionNode,
  requiresOf,
  storyLevel,
  type StoryLine,
} from '@game/world/story';
import { deserters, finishMission, storySetup } from '@game/world/story_battle';
import { ensureStats, recordBattle } from '@game/world/telemetry';

const allLines = (): StoryLine[] => [
  ...[...STORY, ...PERSONAL].flatMap((m) => [...m.brief, ...m.after, ...(m.lost ?? []), ...(m.choice?.options.flatMap((o) => o.lines ?? []) ?? [])]),
  ...EPILOGUE_LINES,
];

describe('história: dados', () => {
  it('ids únicos, um finale por capítulo (0–8), nós e pré-requisitos válidos', () => {
    expect(new Set(STORY.map((m) => m.id)).size).toBe(STORY.length);
    for (let ch = 0; ch <= 8; ch++) {
      expect(STORY.filter((m) => m.chapter === ch && m.finale)).toHaveLength(1);
      expect(CHAPTER_TITLE[ch]).toBeTruthy();
    }
    const ids = new Set(STORY.map((m) => m.id));
    for (const m of STORY) {
      if (m.node !== '$base') expect(node(m.node), m.id).toBeTruthy();
      for (const r of requiresOf(m)) expect(ids.has(r), `${m.id} requer ${r}`).toBe(true);
    }
  });

  it('inimigos, aliados, falantes e códice existem', () => {
    for (const m of STORY) {
      const foes = [...(m.battle?.enemies ?? []), ...(m.battle?.waves ?? []).flatMap((w) => w.enemies)];
      foes.push(...foes.flatMap((f) => f.phases ?? []).flatMap((p) => p.spawn ?? []));
      for (const f of foes) expect(DB.enemies[f.id], `${m.id}: ${f.id}`).toBeTruthy();
      for (const a of [...(m.battle?.allies ?? []), ...(m.battle?.vip ? [m.battle.vip] : [])]) expect(DB.classes[a.classId], `${m.id}: ${a.classId}`).toBeTruthy();
      for (const c of m.codex ?? []) expect(CODEX_ENTRIES[c], `${m.id}: códice ${c}`).toBeTruthy();
      if (m.reward?.item) expect(DB.items[m.reward.item]).toBeTruthy();
    }
    for (const l of allLines()) expect(l.s === 'cmd' || !!SPEAKER[l.s], `falante ${l.s}`).toBe(true);
  });

  it('toda condição usa uma marca que existe (escolha, missão feita, capital caída ou Véu)', () => {
    const all = [...STORY, ...PERSONAL];
    const flags = new Set(['veu', 'base_resistiu', ...all.flatMap((m) => m.choice?.options.map((o) => o.flag) ?? []), ...all.map((m) => `done:${m.id}`), ...all.flatMap((m) => (m.consequences ?? []).filter((k) => k.fall).map((k) => `caiu:${k.fall}`))]);
    const conds = [
      ...allLines().map((l) => l.if),
      ...all.map((m) => m.reward?.recruit?.if),
      ...all.map((m) => m.when),
      ...all.flatMap((m) => m.choice?.options.map((o) => o.if) ?? []),
      ...all.flatMap((m) => (m.consequences ?? []).map((k) => k.if)),
    ].filter(Boolean) as string[];
    for (const c of conds) for (const f of c.split(/[,|]/)) expect(flags.has(f.replace(/^!/, '')), f).toBe(true);
  });

  it('marcas escondem e mostram falas', () => {
    const c = newCampaign(1);
    expect(lineVisible(c, { s: 'narr', t: '', if: 'x' })).toBe(false);
    ensureStory(c).flags.push('x');
    expect(lineVisible(c, { s: 'narr', t: '', if: 'x' })).toBe(true);
    expect(lineVisible(c, { s: 'narr', t: '', if: '!x' })).toBe(false);
  });

  it('nível dos inimigos fica entre o da missão e o do esquadrão', () => {
    expect(storyLevel(10, 10)).toBe(10);
    expect(storyLevel(10, 20)).toBe(14);
    expect(storyLevel(10, 1)).toBe(7);
  });
});

describe('história: progressão de ponta a ponta', () => {
  it('do Prólogo ao epílogo: capítulos, atos, base, recrutas e fim', () => {
    const c = newCampaign(7);
    expect(availableMissions(c).map((m) => m.id)).toEqual(['p1']);
    finishMission(c, STORY[0]!);
    expect(availableMissions(c).map((m) => m.id).sort()).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
    let guard = 0;
    while (!ensureStory(c).ended && guard++ < 200) {
      // A Deserção abre o Ato 2: a base é escolhida antes da próxima missão.
      if (c.act >= 2 && !c.base) foundBase(c, 'guerreiros_capital');
      const m = availableMissions(c)[0];
      expect(m, `capítulo ${ensureStory(c).chapter} travou`).toBeTruthy();
      if (m!.choice) ensureStory(c).flags.push(m!.choice.options[0]!.flag);
      finishMission(c, m!);
    }
    const st = ensureStory(c);
    expect(st.ended).toBe(true);
    expect(c.act).toBe(8);
    // Aliança de Marenhal pulada: a base é em Bastiamar.
    expect(st.done).not.toContain('a4_3c');
    // Ramos: crianças com Maela (Arven Se Levanta); socorro a Cristália → Vel'Qadar cai.
    expect(st.done).toEqual(expect.arrayContaining(['a2_r', 'a4_rl']));
    expect(st.done).not.toContain('a2_o');
    expect(st.lost).toContain('a4_3d');
    expect(fallenCapitals(c)).toEqual(['ladroes_capital']);
    expect(endingOf(c)?.id).toBe('fim_guardiao');
    // Puladas: a2_o (outro ramo), a4_rm (Cristália não caiu), a4_3c (aliança na própria base).
    expect(st.done.length + st.lost.length).toBe(STORY.length - 3);
    const names = Object.values(c.roster).filter((ch) => ch.storyId).map((ch) => ch.name);
    expect(names).toEqual(expect.arrayContaining(['Edran', 'Lirael', 'Orun', 'Viajante', 'Maela', 'Nassira', 'Brann de Arven']));
    expect(st.codex.length).toBeGreaterThan(40);
    expect(hasFlag(c, 'done:a8_8')).toBe(true);
  });

  it('missões de base usam o nó da base', () => {
    const c = newCampaign(3);
    foundBase(c, 'magos_capital');
    expect(missionNode(c, STORY.find((m) => m.id === 'a2_1')!)).toBe('magos_capital');
  });

  it('Deserção: heróis com lealdade baixa ficam com o rei; os da história nunca', () => {
    const c = newCampaign(4);
    const list = Object.values(c.roster);
    list[1]!.loyalty = 10;
    list[2]!.loyalty = 10;
    list[2]!.storyId = 'Edran';
    expect(deserters(c)).toEqual([list[1]!.id]);
    const st = ensureStory(c);
    st.chapter = 1;
    st.done = STORY.filter((m) => m.chapter < 1 || (m.chapter === 1 && !m.finale)).map((m) => m.id);
    const out = finishMission(c, STORY.find((m) => m.id === 'a1_8')!);
    expect(c.roster[list[1]!.id]).toBeUndefined();
    expect(out.lines.some((l) => l.includes('ficou com o rei'))).toBe(true);
    expect(c.act).toBe(2);
  });
});

describe('história: batalhas', () => {
  it('toda missão com luta monta uma batalha válida', () => {
    const c = newCampaign(5);
    const s = c.squads[0]!;
    foundBase(c, 'arqueiros_capital');
    for (const m of STORY.filter((x) => x.battle)) {
      const setup = storySetup(c, s, m);
      expect(setup.enemies.length, m.id).toBeGreaterThan(0);
      expect(setup.context.kind).toBe('story');
      expect(setup.context.storyId).toBe(m.id);
      const state = createBattle(setup);
      if (m.battle!.victory === 'target') {
        const t = state.units.find((u) => u.isTarget);
        expect(t?.boss, `${m.id}: alvo é o chefe`).toBe(true);
      }
      for (const a of setup.allies ?? []) expect(a.ai).toBe(true);
    }
  });

  function miniSetup(extra: Partial<BattleSetup>): BattleSetup {
    const rng = new Rng(3);
    const hero = unitFromCharacter(makeCharacter(rng, { classId: 'guerreiro', level: 10 }), 'player');
    const foe = unitFromEnemy(DB.enemies.soldado_real!, 10, rng);
    return {
      map: createEmptyMap(10, 10, 'planicie'),
      players: [hero],
      enemies: [foe],
      victory: { type: 'eliminate' },
      ambush: false,
      canFlee: true,
      seed: 1,
      context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: '' },
      ...extra,
    };
  }

  it('ondas entram na rodada marcada e seguram a vitória por eliminação', () => {
    const rng = new Rng(9);
    const wave = unitFromEnemy(DB.enemies.acolito_do_veu!, 10, rng);
    const state = createBattle(miniSetup({ waves: [{ round: 3, units: [wave] }] }));
    // Campo vazio antes da onda: a onda entra na hora em vez de dar vitória.
    for (const u of state.units) if (u.team === 'enemy') u.alive = false;
    checkVictory(state);
    expect(state.outcome).toBeNull();
    expect(state.units).toContain(wave);
    expect(state.log.some((l) => l.includes('Reforços'))).toBe(true);
    wave.alive = false;
    checkVictory(state);
    expect(state.outcome).toBe('victory');
  });

  it('onda por rodada entra quando a rodada vira', () => {
    const rng = new Rng(9);
    const wave = unitFromEnemy(DB.enemies.acolito_do_veu!, 10, rng);
    const state = createBattle(miniSetup({ waves: [{ round: 2, units: [wave] }] }));
    while (state.round < 2) {
      const u = stepTime(state, 1);
      if (u) state.activeUid = null;
    }
    expect(state.units).toContain(wave);
  });

  it('fases de chefe disparam uma vez ao cruzar o limiar: fala, cura e reforços', () => {
    const rng = new Rng(4);
    const setup = miniSetup({});
    const boss = setup.enemies[0]!;
    boss.maxHp = boss.hp = 100;
    const add = unitFromEnemy(DB.enemies.corrompido!, 10, rng);
    boss.phases = [{ at: 0.5, say: 'Fase dois!', heal: 0.2, spawn: [add] }];
    const state = createBattle(setup);
    damage(state, boss, 60, undefined, undefined);
    expect(boss.hp).toBe(60);
    expect(state.units).toContain(add);
    expect(state.log.some((l) => l.includes('Fase dois!'))).toBe(true);
    damage(state, boss, 20, undefined, undefined);
    expect(boss.hp).toBe(40);
  });

  it('aliados IA lutam do lado do jogador, mas sozinhos não seguram a batalha', () => {
    const rng = new Rng(5);
    const ally = unitFromCharacter(makeCharacter(rng, { classId: 'arqueiro', level: 10 }), 'player');
    delete ally.charId;
    const state = createBattle(miniSetup({ allies: [ally] }));
    expect(ally.ai).toBe(true);
    expect(ally.team).toBe('player');
    for (const u of state.units) if (u.team === 'player' && !u.ai) u.alive = false;
    checkVictory(state);
    expect(state.outcome).toBe('defeat');
  });
});

describe('telemetria', () => {
  it('conta batalhas, rodadas, mortes e tentativas por missão', () => {
    const c = newCampaign(6);
    recordBattle(c, { outcome: 'defeat', rounds: 7, context: { kind: 'story', storyId: 'p1', baseXp: 0, gold: 0, itemDrops: [], title: '' }, units: [{ charId: 'a', alive: false, hp: 0, mp: 0, maxHp: 10, startHp: 10, kills: 1, killXp: 0, items: [] }] });
    recordBattle(c, { outcome: 'victory', rounds: 5, context: { kind: 'story', storyId: 'p1', baseXp: 0, gold: 0, itemDrops: [], title: '' }, units: [] });
    const s = ensureStats(c);
    expect(s.battles).toBe(2);
    expect(s.rounds).toBe(12);
    expect(s.heroDeaths).toBe(1);
    expect(s.missions.p1).toEqual({ tries: 2, wins: 1, rounds: 12, deaths: 1 });
  });
});
