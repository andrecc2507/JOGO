import { describe, expect, it } from 'vitest';
import { MemoryStorage, Rng, SaveService } from '@core';
import { DB } from '@game/data';
import { createBattle, damage } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign } from '@game/world/campaign';
import { applyBattleResult, encounterSetup, planEncounter } from '@game/world/encounters';
import { DIFFICULTIES, battleDifficulty } from '@game/world/difficulty';
import { AUTO_SLOT, SAVE_SLOTS, autosave, latestSlot, loadGame, saveGame, slotInfo, store } from '@game/state/store';

function setup(extra: Partial<BattleSetup>): BattleSetup {
  const rng = new Rng(3);
  return {
    map: createEmptyMap(10, 10, 'planicie'),
    players: [unitFromCharacter(makeCharacter(rng, { classId: 'guerreiro', level: 10 }), 'player')],
    enemies: [unitFromEnemy(DB.enemies.soldado_real!, 10, rng)],
    victory: { type: 'eliminate' },
    ambush: false,
    canFlee: true,
    seed: 1,
    context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: '' },
    ...extra,
  };
}

describe('dificuldade', () => {
  it('três níveis; Ferro zera as voltas de turno', () => {
    expect(Object.keys(DIFFICULTIES)).toEqual(['historia', 'normal', 'dificil']);
    expect(battleDifficulty({ difficulty: 'normal' }).undo).toBe(3);
    expect(battleDifficulty({ difficulty: 'historia', ironman: true }).undo).toBe(0);
    expect(battleDifficulty({ difficulty: 'historia' }).permadeath).toBe(false);
  });

  it('vida e dano dos inimigos seguem a dificuldade', () => {
    const base = createBattle(setup({}));
    const e0 = base.units.find((u) => u.team === 'enemy')!;
    const s = setup({ difficulty: { enemyHp: 1.2, enemyDmg: 0.5, undo: 1, permadeath: true } });
    const hp = s.enemies[0]!.maxHp;
    const st = createBattle(s);
    const e = st.units.find((u) => u.team === 'enemy')!;
    expect(e.maxHp).toBe(Math.round(hp * 1.2));
    const p = st.units.find((u) => u.team === 'player')!;
    const before = p.hp;
    damage(st, p, 40, e, undefined);
    expect(before - p.hp).toBe(20);
    expect(e0).toBeTruthy();
  });

  it('História: herói caído volta ferido em vez de morrer', () => {
    const c = newCampaign(4, { difficulty: 'historia' });
    const s = c.squads[0]!;
    const plan = planEncounter(new Rng(1), 'planicie', 3);
    const set = encounterSetup(c, s, plan);
    expect(set.context.noPermadeath).toBe(true);
    const id = s.memberIds[1]!;
    applyBattleResult(c, { outcome: 'defeat', rounds: 3, context: set.context, units: [{ charId: id, alive: false, hp: 0, mp: 0, maxHp: 100, startHp: 100, lowHp: 0, kills: 0, killXp: 0, items: [null, null, null] }] });
    expect(c.roster[id]).toBeTruthy();
    expect(c.roster[id]!.woundDays).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  it('espaços, automático, mais recente e Modo Ferro', () => {
    const save = new SaveService(new MemoryStorage(), 1);
    store.campaign = newCampaign(5);
    store.slot = SAVE_SLOTS[1]!;
    saveGame(save);
    expect(slotInfo(save, SAVE_SLOTS[1]!)?.label).toContain('Prólogo');
    autosave(save);
    expect(save.has(AUTO_SLOT)).toBe(true);
    expect(latestSlot(save)).toBeTruthy();
    // Ferro: sempre no espaço da campanha, e sair no meio da batalha vira recuo.
    store.campaign = newCampaign(6, { ironman: true });
    store.slot = SAVE_SLOTS[2]!;
    store.campaign.inBattle = store.campaign.squads[0]!.id;
    saveGame(save, SAVE_SLOTS[0]);
    expect(save.has(SAVE_SLOTS[0]!)).toBe(false);
    expect(loadGame(save, SAVE_SLOTS[2])).toBe(true);
    expect(store.campaign!.inBattle).toBeUndefined();
    expect(store.campaign!.log[0]!.text).toContain('Modo Ferro');
  });
});
