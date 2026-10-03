import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, type ClassId } from '@game/data';
import { advance, attack, castSkill, reachable, createBattle, endTurn, skillTargets, skillUsable, teamVision, type SkillLike } from '@game/battle/engine';
import { createEmptyMap, xy } from '@game/battle/map';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { unlockedEvolutions } from '@game/rules/skill_tree';
import { makeCharacter } from '@game/rules/recruit';
import { migrateCampaign, newCampaign } from '@game/world/campaign';

function setup(players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map: createEmptyMap(12, 12, 'planicie'), players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

function arena(classId: ClassId, skills: string[], ranks: Record<string, number>) {
  const c = makeCharacter(new Rng(3), { classId, level: 50 });
  c.skills = skills;
  c.skillRanks = ranks;
  const u = unitFromCharacter(c, 'player');
  u.mp = u.maxMp = 9999;
  const foes = [0, 1, 2].map(() => unitFromEnemy(DB.enemies.lobo_da_silvia!, 30, new Rng(1)));
  const s = createBattle(setup([u], foes));
  const [a, e1, e2, e3] = s.units as [BattleUnit, BattleUnit, BattleUnit, BattleUnit];
  [a.x, a.y, a.facing] = [5, 5, 0];
  [e1.x, e1.y] = [6, 5];
  [e2.x, e2.y] = [5, 8];
  [e3.x, e3.y] = [9, 5];
  s.activeUid = a.uid;
  s.turn = { moved: false, acted: false, startX: 5, startY: 5 };
  return { s, a, enemies: [e1, e2, e3] };
}

const EVOS = Object.values(DB.skills).filter((d) => d!.evolvedOf).map((d) => d!);

describe('evoluções Nv 3/5', () => {
  it('existem evoluções nas cinco árvores e as duas subclasses novas do ladino', () => {
    const classes = new Set(EVOS.map((e) => DB.skills[e.evolvedOf!]!.classId));
    expect([...classes].sort()).toEqual(['arqueiro', 'clerigo', 'guerreiro', 'ladrao', 'mago']);
    expect(EVOS.length).toBeGreaterThanOrEqual(40);
    expect(DB.trees.ladrao!.nodes.find((n) => n.id === 'sicario')!.name).toBe('Mestre dos Selos');
    expect(DB.trees.ladrao!.nodes.find((n) => n.id === 'algoz')!.name).toBe('Besteiro Gêmeo');
  });

  it('Perícia em Fogo Nv 3 libera a Rajada de Fogo (supressão) do Raio de Fogo', () => {
    const learned = ['elementalista_raio_de_fogo', 'fogo_pericia_em_fogo'];
    expect(unlockedEvolutions(learned, { elementalista_raio_de_fogo: 5, fogo_pericia_em_fogo: 2 })).not.toContain('elementalista_rajada_de_fogo');
    expect(unlockedEvolutions(learned, { elementalista_raio_de_fogo: 1, fogo_pericia_em_fogo: 3 })).toContain('elementalista_rajada_de_fogo');
    const { s, a, enemies } = arena('mago', learned, { elementalista_raio_de_fogo: 1, fogo_pericia_em_fogo: 3 });
    expect(a.skills).toContain('elementalista_rajada_de_fogo');
    const e = enemies[2]!;
    e.hp = e.maxHp = 99999;
    castSkill(s, a, DB.skills.elementalista_rajada_de_fogo! as SkillLike, e.x, e.y);
    expect(e.statuses.suprimido).toBeGreaterThan(0);
    // Divide a recarga com o raio normal.
    expect(a.cooldowns.elementalista_raio_de_fogo ?? 0).toBe(DB.skills.elementalista_raio_de_fogo!.cooldown ?? 0);
  });

  it.each(EVOS.filter((e) => !e.passive && !(e as { react?: unknown }).react).map((e) => [e.id, e.evolvedOf!] as const))('%s funciona em batalha', (id, base) => {
    const classId = DB.skills[base]!.classId as ClassId;
    const req = DB.skills[id]!.evolveReq;
    const ranks: Record<string, number> = { [base]: 5, ...(req ? { [req.skill]: 5 } : {}) };
    const { s, a } = arena(classId, [base, ...(req ? [req.skill] : [])], ranks);
    expect(a.skills).toContain(id);
    a.cooldowns = {};
    const sk = DB.skills[id]! as SkillLike;
    expect(skillUsable(s, a, sk)).toBe(true);
    const tiles = skillTargets(s, a, sk, teamVision(s, 'player'));
    expect(tiles.length).toBeGreaterThan(0);
    const withEnemy = tiles.find((i) => {
      const [x, y] = xy(s.map, i);
      return s.units.some((o) => o.alive && o.team === 'enemy' && o.x === x && o.y === y);
    });
    const [x, y] = xy(s.map, withEnemy ?? tiles[0]!);
    expect(castSkill(s, a, sk, x, y)).toBe(true);
    endTurn(s);
    for (let i = 0; i < 10 && !s.outcome; i++) if (advance(s)) endTurn(s);
    for (const o of s.units) expect(Number.isFinite(o.hp)).toBe(true);
  });

  it('passiva evoluída vale em batalha (Corrida nas Paredes: sobe prédio sem escada)', () => {
    const { s, a } = arena('clerigo', ['monge_passo_agil'], { monge_passo_agil: 3 });
    a.jump = 1;
    s.map.tiles[5 * s.map.w + 4]!.up = [{ b: 1, h: 7, t: 'muralha' }];
    s.turn.moveLeft = 9;
    const top = 5 * s.map.w + 4 + s.map.w * s.map.h;
    expect(reachable(s, a).cost.has(top)).toBe(true);
  });

  it('Mestre dos Selos ofensivo: Kitsunebi persegue atrás da parede; Bijuudama explode e arremessa', () => {
    const { s, a, enemies } = arena('ladrao', ['selos_kitsunebi', 'selos_bijuudama'], {});
    const e = enemies[2]!;
    e.hp = e.maxHp = 99999;
    s.map.tiles[6 * s.map.w + 5]!.up = [{ b: 1, h: 5, t: 'muralha' }];
    s.revealAll = true;
    expect(skillTargets(s, a, DB.skills.selos_kitsunebi! as SkillLike, teamVision(s, 'player'))).toContain(5 + 8 * s.map.w);
    expect(castSkill(s, a, DB.skills.selos_kitsunebi! as SkillLike, e.x, e.y)).toBe(true);
    expect(e.hp).toBeLessThan(99999);
    const { s: s2, a: a2, enemies: en2 } = arena('ladrao', ['selos_bijuudama'], {});
    const t = en2[2]!;
    t.hp = t.maxHp = 99999;
    const before = [t.x, t.y];
    castSkill(s2, a2, DB.skills.selos_bijuudama! as SkillLike, t.x, t.y - 1);
    expect(t.hp).toBeLessThan(99999);
    expect([t.x, t.y]).not.toEqual(before);
  });

  it('Bestas de mão gêmeas disparam dois virotes', () => {
    const { s, a, enemies } = arena('ladrao', [], {});
    a.weaponType = 'besta_mao';
    a.weaponRange = 4;
    const n = s.log.length;
    attack(s, a, enemies[0]!.x, enemies[0]!.y);
    const lines = s.log.slice(n).filter((l) => l.includes(a.name));
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('save antigo: habilidades do Sicário e do Algoz viram as novas na mesma posição', () => {
    const c = newCampaign(3);
    const ch = Object.values(c.roster)[0]!;
    ch.skills = ['sicario_ataque_fantasma', 'algoz_leque_de_laminas'];
    ch.skillRanks = { sicario_ataque_fantasma: 3 };
    migrateCampaign(c);
    expect(ch.skills).toEqual(['selos_ofuda_de_cura', 'gemeo_rajada_dupla']);
    expect(ch.skillRanks).toEqual({ selos_ofuda_de_cura: 3 });
  });
});
