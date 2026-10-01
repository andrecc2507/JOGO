import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { ANIM_STYLES, DB, REPO_TREES, creatureSkillToSkill } from '@game/data';
import { createBattle, previewHit } from '@game/battle/engine';
import { applyElementToTile, addStatus } from '@game/battle/elements';
import { COVER_PENALTY, coverAgainst, coverSides } from '@game/battle/cover';
import { createEmptyMap, idx } from '@game/battle/map';
import { diffNotices, snapshot } from '@game/battle/notices';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { animFor, moveSpeed } from '@game/render/anim_style';
import { styleTiming } from '@game/render/battle_fx';

function battle() {
  const c = makeCharacter(new Rng(3), { classId: 'arqueiro', level: 20 });
  c.skills = [];
  const a = unitFromCharacter(c, 'player');
  const d = unitFromEnemy(DB.enemies.lobo_da_silvia!, 20, new Rng(1));
  d.skills = [];
  const setup: BattleSetup = { map: createEmptyMap(12, 12, 'planicie'), players: [a], enemies: [d], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
  const s = createBattle(setup);
  const [pa, pd] = s.units as [BattleUnit, BattleUnit];
  for (const t of s.map.tiles) {
    t.p = undefined;
    t.h = 1;
  }
  [pa.x, pa.y, pd.x, pd.y] = [1, 5, 6, 5];
  return { s, a: pa, d: pd };
}

describe('cobertura (estilo XCOM)', () => {
  it('muro entre o alvo e o atirador dá cobertura total; caixa dá parcial', () => {
    const { s, d } = battle();
    s.map.tiles[idx(s.map, 5, 5)]!.p = 'muro';
    expect(coverAgainst(s.map, d.x, d.y, 1, 5)).toBe('full');
    s.map.tiles[idx(s.map, 5, 5)]!.p = 'caixa';
    expect(coverAgainst(s.map, d.x, d.y, 1, 5)).toBe('half');
  });

  it('flanquear (atirar do lado aberto) e o corpo a corpo ignoram a cobertura', () => {
    const { s, d } = battle();
    s.map.tiles[idx(s.map, 5, 5)]!.p = 'muro';
    expect(coverAgainst(s.map, d.x, d.y, 10, 5)).toBe('none');
    expect(coverAgainst(s.map, d.x, d.y, 6, 9)).toBe('none');
    expect(coverAgainst(s.map, d.x, d.y, 5, 5)).toBe('none');
  });

  it('degrau alto ao lado também protege', () => {
    const { s, d } = battle();
    s.map.tiles[idx(s.map, 5, 5)]!.h = 3;
    expect(coverAgainst(s.map, d.x, d.y, 1, 5)).toBe('full');
    expect(coverSides(s.map, d.x, d.y)).toEqual([{ dx: -1, dy: 0, level: 'full' }]);
  });

  it('a cobertura reduz a chance de acerto físico à distância, não a mágica', () => {
    const { s, a, d } = battle();
    a.accuracy = 120;
    d.evasion = 40;
    const open = previewHit(s, a, d, 'basic', 0);
    s.map.tiles[idx(s.map, 5, 5)]!.p = 'caixa';
    const half = previewHit(s, a, d, 'basic', 0);
    expect(half.cover).toBe('half');
    expect(open.chance - half.chance).toBe(COVER_PENALTY.half);
    expect(previewHit(s, a, d, 'magic', 5).cover).toBe('none');
  });
});

describe('avisos de ambiente e de estado', () => {
  it('um aviso por tipo de terreno novo e um por estado novo', () => {
    const { s, d } = battle();
    const before = snapshot(s);
    for (const [x, y] of [
      [3, 3],
      [3, 4],
      [4, 3],
    ] as const)
      applyElementToTile(s, x, y, 'fogo');
    addStatus(d, 'lento', 2);
    const notes = diffNotices(s, before);
    expect(notes.filter((n) => n.text.includes('Em chamas'))).toHaveLength(1);
    expect(notes.find((n) => n.uid === d.uid)?.text).toContain('Lento');
    expect(diffNotices(s, snapshot(s))).toEqual([]);
  });
});

describe('animações', () => {
  const actor = { beast: false, weaponRange: 1, wand: false };

  it('ataque básico: corte, garra, flecha ou orbe conforme quem ataca', () => {
    const basic = { id: 'ataque', kind: 'physical' as const, range: -1 };
    expect(animFor(basic, actor)).toBe('slash');
    expect(animFor(basic, { ...actor, beast: true })).toBe('claw');
    expect(animFor(basic, { ...actor, weaponRange: 6 })).toBe('arrow');
    expect(animFor(basic, { ...actor, weaponRange: 4, wand: true })).toBe('orb');
  });

  it('magias e habilidades escolhem pelo formato e elemento; a ficha pode forçar', () => {
    expect(animFor({ id: 'x', kind: 'magic', range: 5, shape: 'radius', radius: 2, element: 'fogo' }, actor)).toBe('meteor');
    expect(animFor({ id: 'x', kind: 'magic', range: 5, element: 'eletricidade' }, actor)).toBe('bolt');
    expect(animFor({ id: 'x', kind: 'magic', range: 4, shape: 'cone' }, actor)).toBe('cone');
    expect(animFor({ id: 'x', kind: 'heal', range: 3 }, actor)).toBe('heal');
    expect(animFor({ id: 'x', kind: 'physical', range: 1, anim: 'leap' }, actor)).toBe('leap');
  });

  it('toda habilidade de árvore tem animação válida e tempos positivos', () => {
    for (const t of REPO_TREES)
      for (const n of t.nodes)
        for (const sk of n.skills) {
          const def = creatureSkillToSkill(sk);
          const style = animFor({ id: def.id, kind: def.kind, shape: def.shape, range: def.range, radius: def.radius, element: def.element, anim: def.anim, fx: def.fx }, actor);
          expect(ANIM_STYLES, sk.id).toContain(style);
          const tm = styleTiming(style, 4);
          expect(tm.impact).toBeGreaterThan(0);
          expect(tm.dur).toBeGreaterThanOrEqual(tm.impact);
        }
  });

  it('mais Velocidade, caminhada mais rápida (com limites)', () => {
    expect(moveSpeed(40)).toBeGreaterThan(moveSpeed(5));
    expect(moveSpeed(0)).toBeGreaterThanOrEqual(3);
    expect(moveSpeed(999)).toBeLessThanOrEqual(9);
  });
});
