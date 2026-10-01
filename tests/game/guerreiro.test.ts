import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, REPO_TREES, type ClassId } from '@game/data';
import { attack, castSkill, createBattle, damage, previewHit, type SkillLike } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { reactionState } from '@game/battle/creature_fx';
import { derive } from '@game/rules/character';
import { makeCharacter } from '@game/rules/recruit';

function setup(players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map: createEmptyMap(12, 12, 'planicie'), players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

function hero(classId: ClassId, skills: string[], level = 50): BattleUnit {
  const c = makeCharacter(new Rng(3), { classId, level });
  c.skills = skills;
  const u = unitFromCharacter(c, 'player');
  u.mp = u.maxMp = 9999;
  return u;
}

function wolf(level = 60): BattleUnit {
  const w = unitFromEnemy(DB.enemies.lobo_da_silvia!, level, new Rng(1));
  w.skills = [];
  return w;
}

/** Herói em (5,5) e um lobo colado em (6,5). */
function duel(u: BattleUnit, e = wolf()) {
  const s = createBattle(setup([u], [e]));
  [u.x, u.y, e.x, e.y] = [5, 5, 6, 5];
  return { s, u, e };
}

describe('Guerreiro: árvore', () => {
  const tree = REPO_TREES.find((t) => t.classId === 'guerreiro')!;

  it('tem 9 nós (base, 4 evoluções, 4 híbridas) e 80 habilidades', () => {
    expect(tree.nodes).toHaveLength(9);
    expect(tree.nodes.reduce((a, n) => a + n.skills.length, 0)).toBe(80);
    expect(tree.nodes.filter((n) => n.type === 'evolucao').map((n) => n.id).sort()).toEqual(['arcano', 'berserker', 'escudeiro', 'espadachim']);
    const hybrids = Object.fromEntries(tree.nodes.filter((n) => n.type === 'hibrida').map((n) => [n.id, [...n.parents].sort()]));
    expect(hybrids).toEqual({ duelista: ['arcano', 'espadachim'], mestre: ['berserker', 'espadachim'], defensor: ['arcano', 'escudeiro'], campeao: ['berserker', 'escudeiro'] });
  });

  it('cada classe aprendida soma +10% de vida máxima', () => {
    const c = makeCharacter(new Rng(4), { classId: 'guerreiro', level: 30 });
    c.skills = [];
    const base = derive(c).maxHp;
    c.skills.push('espadachim_golpe_feroz');
    expect(derive(c).maxHp).toBe(Math.round(base * 1.1));
  });
});

describe('reação única por batalha', () => {
  it('Corte Retaliador: esquiva, contra-ataca com sangramento e músculo cortado, e só uma vez', () => {
    const { s, u, e } = duel(hero('guerreiro', ['espadachim_corte_retaliador']));
    e.accuracy = 999;
    e.hp = e.maxHp = 99999;
    expect(reactionState(u)).toBe('ready');
    const hp = u.hp;
    attack(s, e, u.x, u.y);
    expect(u.hp).toBe(hp);
    expect(e.statuses.sangramento).toBeGreaterThan(0);
    expect(e.statuses.enfraquecido).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(reactionState(u)).toBe('spent');
    attack(s, e, u.x, u.y);
    expect(u.hp).toBeLessThan(hp);
  });

  it('reações de criaturas (sem árvore) não entram na regra', () => {
    expect(reactionState(wolf())).toBe('none');
  });

  it('Escudo Refletor devolve o dobro do dano e atordoa o conjurador', () => {
    const { s, u, e } = duel(hero('guerreiro', ['defensor_escudo_refletor']));
    e.hp = e.maxHp = 99999;
    const before = e.hp;
    // Magia do lobo (simulada) contra o Defensor.
    e.attrs.int = 40;
    const preview = previewHit(s, e, u, 'magic', 8, 'fogo');
    expect(preview.max).toBeGreaterThan(0);
    castSkill(s, e, { id: 'teste_magia', name: 'Magia', mp: 0, range: 5, target: 'enemy', shape: 'single', kind: 'magic', power: 8, element: 'fogo' } as SkillLike, u.x, u.y);
    expect(reactionState(u)).toBe('spent');
    expect(before - e.hp).toBeGreaterThanOrEqual(preview.min * 2 * 0.5);
    expect(e.statuses.atordoado).toBeGreaterThan(0);
  });
});

describe('Guerreiro: mecânicas', () => {
  it('Fúria Indomável segura o Berserker com 1 de vida uma vez', () => {
    const { s, u, e } = duel(hero('guerreiro', ['berserker_furia_indomavel']));
    damage(s, u, 99999, e, undefined);
    expect(u.alive).toBe(true);
    expect(u.hp).toBe(1);
    damage(s, u, 99999, e, undefined);
    expect(u.alive).toBe(false);
  });

  it('Perícia em Lanças aumenta o alcance da arma em 1', () => {
    const plain = createBattle(setup([hero('guerreiro', [])], [wolf()])).units[0]!;
    const lance = createBattle(setup([hero('guerreiro', ['campeao_pericia_em_lancas'])], [wolf()])).units[0]!;
    expect(lance.weaponRange).toBe(plain.weaponRange + 1);
  });

  it('Carga Estática: a cada 3 golpes físicos, explosão elétrica em área', () => {
    const { s, u, e } = duel(hero('guerreiro', ['arcano_carga_estatica']));
    u.accuracy = 999;
    e.hp = e.maxHp = 99999;
    const other = wolf();
    s.units.push(other);
    other.team = 'enemy';
    [other.x, other.y] = [6, 6];
    other.hp = other.maxHp = 99999;
    for (let i = 0; i < 3; i++) attack(s, u, e.x, e.y);
    expect(other.hp).toBeLessThan(other.maxHp);
  });

  it('Pancada de Escudo escala com a defesa', () => {
    const { s, u, e } = duel(hero('guerreiro', ['escudeiro_pancada_de_escudo']));
    const sk = DB.skills.escudeiro_pancada_de_escudo! as SkillLike;
    const low = previewHit(s, u, e, 'physical', sk.power, undefined, 0, 1, sk).max;
    u.def += 50;
    const high = previewHit(s, u, e, 'physical', sk.power, undefined, 0, 1, sk).max;
    expect(high).toBeGreaterThan(low + 20);
  });
});
