import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { ANIM_STYLES, DB, REPO_TREES, creatureSkillToSkill } from '@game/data';
import { BASIC_ATTACK, attack, createBattle, previewHit, resolveAttack, skillTargets, structureHit } from '@game/battle/engine';
import { propHp } from '@game/battle/props';
import { applyElementToTile, addStatus } from '@game/battle/elements';
import { COVER_PENALTY, coverAgainst, coverSides } from '@game/battle/cover';
import { PROPS, createEmptyMap, idx } from '@game/battle/map';
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
    a.accuracy = 40;
    d.evasion = 60;
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

describe('regras do pacote de ajustes', () => {
  it('fogo amigo: magia em área atinge o aliado, mas nunca quem lançou', async () => {
    const { castSkill } = await import('@game/battle/engine');
    const c = makeCharacter(new Rng(3), { classId: 'mago', level: 20 });
    c.skills = ['fogo_bola_de_fogo_maior'];
    c.skillRanks = {};
    const mage = unitFromCharacter(c, 'player');
    const friend = unitFromCharacter(makeCharacter(new Rng(4), { classId: 'guerreiro', level: 20 }), 'player');
    const foe = unitFromEnemy(DB.enemies.lobo_da_silvia!, 20, new Rng(1));
    const s = createBattle({ map: createEmptyMap(12, 12, 'planicie'), players: [mage, friend], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
    const [m, f, e] = s.units as [BattleUnit, BattleUnit, BattleUnit];
    [m.x, m.y, f.x, f.y, e.x, e.y] = [2, 5, 6, 6, 6, 5];
    m.mp = 999;
    f.evasion = e.evasion = -999;
    const [hpF, hpM] = [f.hp, m.hp];
    castSkill(s, m, DB.skills.fogo_bola_de_fogo_maior! as never, 6, 5);
    expect(f.hp).toBeLessThan(hpF);
    expect(m.hp).toBe(hpM);
  });

  it('buffs semelhantes não acumulam: protegido substitui fortificado; escudos ficam no maior', () => {
    const { s, d } = battle();
    addStatus(d, 'fortificado', 3);
    addStatus(d, 'protegido', 2);
    expect(d.statuses.fortificado).toBeUndefined();
    expect(d.statuses.protegido).toBe(2);
    addStatus(d, 'protegido', 1);
    expect(d.statuses.protegido).toBe(2);
    void s;
  });

  it('habilidades ativas das feras têm recarga mínima de 2 turnos', () => {
    for (const c of Object.values(DB.creatures))
      for (const sk of c!.skills) if (sk.kind !== 'passive' && sk.kind !== 'reaction') expect(sk.cooldown, `${c!.id}/${sk.id}`).toBeGreaterThanOrEqual(2);
  });
});

describe('formação inicial', () => {
  it('heróis só vão para a área inicial e trocam de lugar entre si', async () => {
    const { deploymentTiles, deployUnit } = await import('@game/battle/engine');
    const a = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'guerreiro', level: 5 }), 'player');
    const b = unitFromCharacter(makeCharacter(new Rng(2), { classId: 'mago', level: 5 }), 'player');
    const e = unitFromEnemy(DB.enemies.lobo_da_silvia!, 5, new Rng(1));
    const s = createBattle({ map: createEmptyMap(12, 12, 'planicie'), players: [a, b], enemies: [e], victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
    const [pa, pb, pe] = s.units as [BattleUnit, BattleUnit, BattleUnit];
    const area = deploymentTiles(s);
    expect(area.size).toBeGreaterThanOrEqual(6);
    expect(area.has(idx(s.map, pe.x, pe.y))).toBe(false);
    expect(deployUnit(s, pa, pe.x, pe.y)).toBe(false);
    const [ax, ay, bx, by] = [pa.x, pa.y, pb.x, pb.y];
    expect(deployUnit(s, pa, bx, by)).toBe(true);
    expect([pa.x, pa.y, pb.x, pb.y]).toEqual([bx, by, ax, ay]);
    const free = [...area].find((i) => !s.units.some((u) => idx(s.map, u.x, u.y) === i))!;
    expect(deployUnit(s, pa, free % s.map.w, Math.floor(free / s.map.w))).toBe(true);
  });
});

describe('coberturas destrutíveis', () => {
  it('ataque básico mirado numa cobertura acerta sempre e a quebra quando a resistência acaba', () => {
    const { s, a } = battle();
    const i = idx(s.map, 4, 5);
    s.map.tiles[i]!.p = 'caixa';
    expect(skillTargets(s, a, BASIC_ATTACK, new Set([i]))).toContain(i);
    const hit = structureHit(a, 'basic', 0);
    let swings = 0;
    while (s.map.tiles[i]!.p && swings < 50) {
      s.turn.acted = false;
      expect(attack(s, a, 4, 5)).toBe(true);
      swings++;
    }
    expect(s.map.tiles[i]!.p).toBeNull();
    expect(swings).toBe(Math.ceil(PROPS.caixa.hp / hit));
    expect(s.log.some((l) => l.includes('Caixa quebrou'))).toBe(true);
  });

  it('tiro que erra um alvo coberto acerta a cobertura', () => {
    const { s, a, d } = battle();
    s.map.tiles[idx(s.map, 5, 5)]!.p = 'muro';
    a.accuracy = -999;
    resolveAttack(s, a, d, 'basic', 0, undefined, 0, 1);
    expect(propHp(s.map, 5, 5)).toBeLessThan(PROPS.muro.hp);
  });

  it('a IA não mira coberturas', () => {
    const { s, d } = battle();
    const i = idx(s.map, 5, 5);
    s.map.tiles[i]!.p = 'caixa';
    expect(skillTargets(s, d, BASIC_ATTACK, new Set([i]))).not.toContain(i);
  });
});
