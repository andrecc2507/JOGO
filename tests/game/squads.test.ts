import { describe, expect, it } from 'vitest';
import { ESCORT_MAX, addEscort, advanceHours, createSquad, dailyTick, disbandIfEmpty, infirmaryAt, newCampaign, reserve, squadOfChar, travelers } from '@game/world/campaign';
import { applyBattleResult } from '@game/world/encounters';
import { capitalService } from '@game/world/capital_services';

describe('escolta (banco de reserva do esquadrão)', () => {
  it('escoltados viajam com o esquadrão, saem da reserva e não contam como combatentes', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    const extra = reserve(c)[0] ?? Object.values(c.roster).find((ch) => !s.memberIds.includes(ch.id));
    const id = extra ? extra.id : s.memberIds.pop()!;
    expect(addEscort(c, s, id)).toBe(true);
    expect(s.escort).toEqual([id]);
    expect(s.memberIds).not.toContain(id);
    expect(reserve(c).map((x) => x.id)).not.toContain(id);
    expect(squadOfChar(c, id)).toBe(s);
    expect(travelers(c, s).map((x) => x.id)).toContain(id);
  });

  it('limite de escolta', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    s.escort = Array.from({ length: ESCORT_MAX }, (_, i) => `x${i}`);
    const id = s.memberIds[0]!;
    expect(addEscort(c, s, id)).toBe(false);
  });

  it('ferido na escolta se recupera no caminho e não ganha XP na batalha', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    const id = s.memberIds[s.memberIds.length - 1]!;
    addEscort(c, s, id);
    const ch = c.roster[id]!;
    ch.woundDays = 3;
    const xp = ch.xp;
    dailyTick(c);
    expect(ch.woundDays).toBe(2);
    const result = {
      outcome: 'victory' as const,
      units: s.memberIds.map((m) => ({ charId: m, alive: true, hp: 1, mp: 0, items: [], kills: 0, killXp: 0 })),
      context: { kind: 'encounter' as const, squadId: s.id, baseXp: 50, gold: 0, itemDrops: [], title: 't' },
    };
    applyBattleResult(c, result as never);
    expect(ch.xp).toBe(xp);
  });

  it('esquadrão sem combatentes se desfaz e os escoltados voltam à reserva', () => {
    const c = newCampaign(4);
    const s = c.squads[0]!;
    const [a, ...rest] = s.memberIds;
    s.memberIds = [a!];
    for (const id of rest.slice(0, 2)) addEscort(c, s, id);
    const n = createSquad(c, rest.slice(2));
    expect(n).toBeTruthy();
    s.memberIds = [];
    disbandIfEmpty(c);
    expect(c.squads.includes(s)).toBe(false);
    for (const id of rest.slice(0, 2)) expect(reserve(c).map((x) => x.id)).toContain(id);
  });
});

describe('Enfermaria de Solenne', () => {
  it('Solenne tem enfermaria; ferimentos saram 2× e a moral volta', () => {
    expect(capitalService('clerigos_capital')).toBe('enfermaria');
    expect(infirmaryAt('clerigos_capital')).toBe(true);
    expect(infirmaryAt('guerreiros_capital')).toBe(false);
    const c = newCampaign(4);
    const s = c.squads[0]!;
    s.at = 'clerigos_capital';
    const ch = c.roster[s.memberIds[0]!]!;
    ch.woundDays = 5;
    ch.morale = 10;
    advanceHours(c, 24);
    expect(ch.woundDays).toBe(3);
    expect(ch.morale).toBeGreaterThanOrEqual(70);
  });
});
