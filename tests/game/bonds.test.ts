import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { bondLevelNear, createBattle, previewHit } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import type { BattleResult, UnitOutcome } from '@game/battle/types';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign } from '@game/world/campaign';
import { addBond, bondLevel, bondsAfterBattle } from '@game/world/bonds';
import { chronicleBattle } from '@game/world/chronicle';
import { availableConversations, finishConversation } from '@game/world/camp';
import { applyBattleResult } from '@game/world/encounters';
import { ensureStory } from '@game/world/story';

const outcome = (charId: string, extra: Partial<UnitOutcome> = {}): UnitOutcome => ({ charId, alive: true, hp: 50, mp: 0, maxHp: 100, startHp: 100, kills: 0, killXp: 0, items: [null, null, null], ...extra });
const ctx = { kind: 'encounter' as const, baseXp: 0, gold: 0, itemDrops: [], title: 'Emboscada na estrada' };

describe('vínculos', () => {
  it('lutar junto dá pontos; níveis em 3/8/15', () => {
    const c = newCampaign(1);
    const [a, b] = Object.values(c.roster);
    const r: BattleResult = { outcome: 'victory', rounds: 3, context: ctx, units: [outcome(a!.id, { x: 1, y: 1 }), outcome(b!.id, { x: 1, y: 2 })] };
    const ev = bondsAfterBattle(c, r);
    expect(a!.bonds![b!.id]).toBe(3);
    expect(ev).toEqual([{ kind: 'up', a: a!.id, b: b!.id, level: 1 }]);
    expect(bondLevel(8)).toBe(2);
    expect(bondLevel(15)).toBe(3);
  });

  it('lado a lado na batalha: mais acerto e dano', () => {
    const rng = new Rng(2);
    const ca = makeCharacter(rng, { classId: 'guerreiro', level: 10 });
    const cb = makeCharacter(rng, { classId: 'guerreiro', level: 10 });
    addBond(ca, cb, 15);
    const ua = unitFromCharacter(ca, 'player');
    const ub = unitFromCharacter(cb, 'player');
    const foe = unitFromEnemy(DB.enemies.soldado_real!, 10, rng);
    const st = createBattle({ map: createEmptyMap(10, 10, 'planicie'), players: [ua, ub], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 1, context: ctx });
    [ua.x, ua.y, ub.x, ub.y, foe.x, foe.y] = [2, 2, 2, 3, 3, 2];
    const near = previewHit(st, ua, foe, 'basic', 0);
    expect(bondLevelNear(st, ua)).toBe(3);
    [ub.x, ub.y] = [8, 8];
    const far = previewHit(st, ua, foe, 'basic', 0);
    expect(near.max).toBeGreaterThan(far.max);
  });

  it('perder um irmão de armas: luto, juramento de vingança e crônica', () => {
    const c = newCampaign(3);
    const [a, b] = Object.values(c.roster).slice(1, 3);
    addBond(a!, b!, 10);
    const r: BattleResult = { outcome: 'defeat', rounds: 5, context: ctx, units: [outcome(a!.id), outcome(b!.id, { alive: false, hp: 0, killedBy: { name: 'Lâmina do Véu', enemyId: 'lamina_do_veu' } })] };
    const before = a!.morale ?? 70;
    applyBattleResult(c, r);
    expect(a!.morale!).toBeLessThan(before);
    expect(a!.vendetta).toEqual([{ enemyId: 'lamina_do_veu', name: 'Lâmina do Véu', for: b!.name }]);
    const texts = (c.chronicle ?? []).map((e) => e.text).join('\n');
    expect(texts).toContain(`${a!.name} perdeu o camarada ${b!.name}`);
    expect(texts).toContain(`${b!.name} (Nv ${b!.level}) caiu em Emboscada na estrada, derrubado por Lâmina do Véu`);
  });

  it('feitos viram títulos', () => {
    const c = newCampaign(4);
    const a = Object.values(c.roster)[0]!;
    chronicleBattle(c, { outcome: 'victory', rounds: 4, context: ctx, units: [outcome(a.id, { feats: ['Capitão Varek'], lowHp: 5, kills: 12 })] }, [], 'Estrada');
    expect(a.titles).toEqual(expect.arrayContaining(['Algoz de Capitão Varek', 'Teimoso como a Morte', 'Veterano']));
  });
});

describe('conversas na base', () => {
  it('conversa da história aparece depois da missão e com o personagem no elenco', () => {
    const c = newCampaign(5);
    expect(availableConversations(c).some((x) => x.id === 'edran_porao')).toBe(false);
    const ed = makeCharacter(new Rng(1), { classId: 'guerreiro', level: 9, name: 'Edran' });
    ed.storyId = 'Edran';
    c.roster[ed.id] = ed;
    ensureStory(c).done.push('a1_6');
    const conv = availableConversations(c).find((x) => x.id === 'edran_porao')!;
    expect(conv).toBeTruthy();
    const before = ed.loyalty ?? 50;
    finishConversation(c, conv);
    expect(ed.loyalty!).toBeGreaterThan(before);
    expect(availableConversations(c).some((x) => x.id === 'edran_porao')).toBe(false);
  });

  it('vínculo novo abre conversa entre os dois heróis', () => {
    const c = newCampaign(6);
    const [a, b] = Object.values(c.roster).slice(1, 3);
    addBond(a!, b!, 3);
    const conv = availableConversations(c).find((x) => x.bondLevel === 1)!;
    expect(conv.title).toContain(a!.name);
    expect(conv.lines.some((l) => l.s === a!.name || l.s === b!.name || l.s === 'narr')).toBe(true);
  });
});
