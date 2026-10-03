import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { canCast, castSkill, createBattle, deploymentRect, deploymentTiles } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { fortifiedId } from '@game/rules/empower';

const treeSkills = () => Object.values(DB.trees).flatMap((t) => t!.nodes.flatMap((n) => n.skills));

describe('forma fortificada (Nv 5)', () => {
  it('toda habilidade ativa tem forma fortificada, mais cara e com bônus; passivas e reações não', () => {
    for (const s of treeSkills()) {
      const def = DB.skills[s.id]!;
      if (s.kind === 'passive' || s.kind === 'reaction') {
        expect(def.fortified, s.id).toBeUndefined();
        continue;
      }
      expect(def.fortified, s.id).toBe(fortifiedId(s.id));
      const f = DB.skills[def.fortified!]!;
      expect(f.fortifiedOf).toBe(s.id);
      expect(f.mp).toBeGreaterThan(def.mp);
      expect(def.fortifiedBonus).toBeTruthy();
    }
  });

  it('os bônus variam (golpe duplo, área, ricochete, estados…)', () => {
    const kinds = new Set(treeSkills().map((s) => DB.skills[s.id]!.fortifiedBonus?.split(' ')[0]).filter(Boolean));
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });

  it('na batalha: só com a habilidade no Nv 5; divide a recarga com a normal', () => {
    const id = 'espadachim_golpe_feroz';
    const def = DB.skills[id];
    const skillId = def ? id : treeSkills().find((s) => s.kind === 'physical' && (s.cooldown ?? 0) > 0)!.id;
    const ch = makeCharacter(new Rng(3), { classId: 'guerreiro', level: 20 });
    ch.skills = [skillId];
    ch.skillRanks = { [skillId]: 4 };
    const enemy = unitFromEnemy(DB.enemies.lobo_da_silvia!, 20, new Rng(1));
    const mk = () => {
      const setup: BattleSetup = { map: createEmptyMap(10, 10, 'planicie'), players: [unitFromCharacter(ch, 'player')], enemies: [enemy], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
      const s = createBattle(setup);
      const [a, d] = s.units as [BattleUnit, BattleUnit];
      [a.x, a.y, d.x, d.y] = [3, 3, 4, 3];
      a.mp = 999;
      return { s, a, d };
    };
    const twin = DB.skills[fortifiedId(skillId)]!;
    expect(canCast(mk().a, twin)).toBe(false);
    ch.skillRanks = { [skillId]: 5 };
    const { s, a, d } = mk();
    expect(a.skillRanks?.[twin.id]).toBe(5);
    expect(canCast(a, twin)).toBe(true);
    castSkill(s, a, twin, d.x, d.y);
    if ((DB.skills[skillId]!.cooldown ?? 0) > 0) {
      expect(canCast(a, DB.skills[skillId]!)).toBe(false);
      expect(canCast(a, twin)).toBe(false);
    }
  });
});

describe('formação inicial', () => {
  it('área = ⌈largura/3⌉ × ⌈altura/3⌉, do lado do esquadrão', () => {
    const ch = makeCharacter(new Rng(3), { classId: 'guerreiro', level: 5 });
    const setup: BattleSetup = { map: createEmptyMap(16, 11, 'planicie'), players: [unitFromCharacter(ch, 'player')], enemies: [unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(1))], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
    const s = createBattle(setup);
    const r = deploymentRect(s);
    expect(r.x1 - r.x0 + 1).toBe(6);
    expect(r.y1 - r.y0 + 1).toBe(4);
    const p = s.units.find((u) => u.team === 'player')!;
    expect(p.x).toBeGreaterThanOrEqual(r.x0);
    expect(p.x).toBeLessThanOrEqual(r.x1);
    expect(deploymentTiles(s).size).toBe(24);
  });
});

describe('raios do Elementalista', () => {
  it('são de alvo único, inclusive na forma fortificada (sem área nem ricochete)', () => {
    const rays = Object.values(DB.skills).filter((s) => s.id.startsWith('elementalista_raio_'));
    expect(rays.length).toBe(12);
    for (const s of rays) {
      expect(s.shape, s.id).toBe('single');
      expect(s.radius ?? 0, s.id).toBe(0);
      expect(s.fx?.chain, s.id).toBeUndefined();
    }
  });
});
