import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { bondLevelNear, createBattle, previewHit } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import type { BattleResult, UnitOutcome } from '@game/battle/types';
import { makeCharacter } from '@game/rules/recruit';
import { newCampaign } from '@game/world/campaign';
import { addBond, bondLevel, bondsAfterBattle, forgetBonds } from '@game/world/bonds';
import { compatibility } from '@game/rules/personality';
import type { Character } from '@game/rules/character';
import { chronicleBattle } from '@game/world/chronicle';
import { availableConversations, finishConversation } from '@game/world/camp';
import { applyBattleResult } from '@game/world/encounters';
import { ensureStory } from '@game/world/story';

const outcome = (charId: string, extra: Partial<UnitOutcome> = {}): UnitOutcome => ({ charId, alive: true, hp: 50, mp: 0, maxHp: 100, startHp: 100, kills: 0, killXp: 0, items: [null, null, null], ...extra });
/** Personalidades neutras (sem choque nem afinidade) para os testes de vínculo. */
const neutral = (...cs: Character[]) => cs.forEach((x) => ((x.quirks = ['avarento']), (x.trait = 'veterano')));
const ctx = { kind: 'encounter' as const, baseXp: 0, gold: 0, itemDrops: [], title: 'Emboscada na estrada' };

describe('vínculos', () => {
  it('lutar junto dá pontos devagar; níveis em 6/16/30', () => {
    const c = newCampaign(1);
    const [a, b] = Object.values(c.roster);
    neutral(a!, b!);
    const r: BattleResult = { outcome: 'victory', rounds: 3, context: ctx, units: [outcome(a!.id, { x: 1, y: 1 }), outcome(b!.id, { x: 1, y: 2 })] };
    expect(bondsAfterBattle(c, r)).toEqual([]);
    expect(a!.bonds![b!.id]).toBe(3);
    expect(bondsAfterBattle(c, r)).toEqual([{ kind: 'up', a: a!.id, b: b!.id, level: 1 }]);
    expect(bondLevel(16)).toBe(2);
    expect(bondLevel(30)).toBe(3);
  });

  it('personalidades que se chocam criam atrito (Rivais) em vez de vínculo; lado a lado atrapalha', () => {
    const c = newCampaign(1);
    const [a, b] = Object.values(c.roster);
    neutral(a!, b!);
    a!.quirks = ['rabugento'];
    b!.quirks = ['bem_humorado'];
    expect(compatibility(a!, b!)).toBeLessThan(0);
    const r: BattleResult = { outcome: 'victory', rounds: 3, context: ctx, units: [outcome(a!.id), outcome(b!.id)] };
    const ev = [...bondsAfterBattle(c, r), ...bondsAfterBattle(c, r), ...bondsAfterBattle(c, r)];
    expect(a!.bonds?.[b!.id] ?? 0).toBe(0);
    expect(ev).toContainEqual({ kind: 'rival', a: a!.id, b: b!.id, level: 1 });
    const conv = availableConversations(c).find((x) => x.frictionLevel === 1)!;
    expect(conv).toBeTruthy();
    const before = a!.friction![b!.id]!;
    finishConversation(c, conv);
    expect(a!.friction![b!.id]!).toBeLessThan(before);
  });

  it('conversas de vínculo aparecem aos poucos (no máximo 2 pendentes) e somem com a morte', () => {
    const c = newCampaign(7);
    const hs = Object.values(c.roster);
    for (const x of hs) neutral(x);
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) addBond(hs[i]!, hs[j]!, 16);
    expect(availableConversations(c).filter((x) => x.bondLevel).length).toBe(2);
    const dead = availableConversations(c).find((x) => x.bondLevel)!.who[0]!;
    forgetBonds(c, dead);
    delete c.roster[dead];
    expect(availableConversations(c).some((x) => x.who.includes(dead))).toBe(false);
  });

  it('lado a lado na batalha: mais acerto e dano', () => {
    const rng = new Rng(2);
    const ca = makeCharacter(rng, { classId: 'guerreiro', level: 10 });
    const cb = makeCharacter(rng, { classId: 'guerreiro', level: 10 });
    neutral(ca, cb);
    addBond(ca, cb, 30);
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
    neutral(a!, b!);
    addBond(a!, b!, 16);
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
    neutral(a!, b!);
    addBond(a!, b!, 6);
    // Conhecidos ainda não conversam: só Camaradas em diante.
    expect(availableConversations(c).some((x) => x.bondLevel)).toBe(false);
    addBond(a!, b!, 10);
    const conv = availableConversations(c).find((x) => x.bondLevel === 2)!;
    expect(conv.title).toContain(a!.name);
    expect(conv.lines.some((l) => l.s === a!.name || l.s === b!.name || l.s === 'narr')).toBe(true);
  });
});

describe('personalidade', () => {
  it('a maioria é gente comum; recrutas mais fortes tendem a peculiaridades raras', async () => {
    const { rollQuirks, quirkDef, eccentricityFor } = await import('@game/rules/personality');
    const rng = new Rng(9);
    const share = (ecc: number) => {
      const all = Array.from({ length: 600 }, () => rollQuirks(rng, ecc)).flat();
      return all.filter((id) => ['raro', 'exotico'].includes(quirkDef(id)!.rarity)).length / all.length;
    };
    const common = share(0);
    expect(common).toBeLessThan(0.25);
    expect(share(eccentricityFor(3))).toBeGreaterThan(common);
  });
});
