import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, REPO_TREES, type ClassId } from '@game/data';
import { attack, castSkill, createBattle, damage, previewHit, reachable, type SkillLike } from '@game/battle/engine';
import { createEmptyMap } from '@game/battle/map';
import { tileEffectsOnUnit } from '@game/battle/elements';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { reactionState } from '@game/battle/creature_fx';
import { reactionKey, runWithReactions } from '@game/battle/reaction_prompt';
import { derive } from '@game/rules/character';
import { makeCharacter } from '@game/rules/recruit';

function setup(players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map: createEmptyMap(12, 12, 'planicie'), players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

function hero(classId: ClassId, skills: string[], level = 50): BattleUnit {
  const c = makeCharacter(new Rng(3), { classId, level });
  c.skills = skills;
  c.skillRanks = {};
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
    expect(tree.nodes.filter((n) => n.type !== 'base').reduce((a, n) => a + n.skills.length, 0)).toBe(80);
    expect(tree.nodes.filter((n) => n.type === 'evolucao').map((n) => n.id).sort()).toEqual(['arcano', 'berserker', 'escudeiro', 'espadachim']);
    const hybrids = Object.fromEntries(tree.nodes.filter((n) => n.type === 'hibrida').map((n) => [n.id, [...n.parents].sort()]));
    expect(hybrids).toEqual({ duelista: ['arcano', 'espadachim'], mestre: ['berserker', 'espadachim'], defensor: ['arcano', 'escudeiro'], campeao: ['berserker', 'escudeiro'] });
  });

  it('cada classe aprendida soma +10% de vida máxima (além dos +10% da classe base)', () => {
    const c = makeCharacter(new Rng(4), { classId: 'guerreiro', level: 30 });
    c.skills = [];
    const base = derive(c).maxHp;
    c.skills.push('espadachim_golpe_feroz');
    expect(Math.abs(derive(c).maxHp - (base / 1.1) * 1.2)).toBeLessThanOrEqual(1);
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
    expect(e.statuses.musculo_cortado).toBeGreaterThan(0);
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

describe('Mago: Gravitacional', () => {
  const sk = (id: string) => DB.skills[id]! as SkillLike;

  it('tem 10 habilidades, e a árvore do Mago fica completa nos nós de evolução', () => {
    const mago = REPO_TREES.find((t) => t.classId === 'mago')!;
    expect(mago.nodes.find((n) => n.id === 'gravitacional')!.skills).toHaveLength(10);
  });

  it('Horizonte de Eventos puxa os alvos para o centro da área', () => {
    const { s, u, e } = duel(hero('mago', ['gravitacional_horizonte_de_eventos']));
    [e.x, e.y] = [8, 7];
    e.hp = e.maxHp = 99999;
    castSkill(s, u, sk('gravitacional_horizonte_de_eventos'), 8, 5);
    expect(Math.abs(e.x - 8) + Math.abs(e.y - 5)).toBeLessThan(2);
  });

  it('Buraco Negro prende e impede ataques à distância', () => {
    const archer = hero('arqueiro', []);
    const s = createBattle(setup([hero('mago', ['gravitacional_buraco_negro'])], [archer]));
    const [u, a] = s.units as [BattleUnit, BattleUnit];
    a.team = 'enemy';
    a.hp = a.maxHp = 99999;
    [u.x, u.y, a.x, a.y] = [2, 2, 6, 2];
    const range = a.weaponRange;
    expect(range).toBeGreaterThan(1);
    castSkill(s, u, sk('gravitacional_buraco_negro'), 6, 2);
    expect(a.statuses.imobilizado).toBeGreaterThan(0);
    expect(a.statuses.sem_alcance).toBeGreaterThan(0);
    expect(attack(s, a, u.x, u.y)).toBe(false);
  });

  it('Voar ignora superfícies e elevação', () => {
    const { s, u } = duel(hero('mago', ['gravitacional_voar']));
    castSkill(s, u, sk('gravitacional_voar'), u.x, u.y);
    expect(u.statuses.voando).toBeGreaterThan(0);
    s.map.tiles[u.y * s.map.w + u.x]!.s = 'fogo';
    expect(tileEffectsOnUnit(s, u)).toBe(0);
    expect(u.statuses.queimando).toBeUndefined();
    // Sobe um paredão de 6 degraus que a pé seria impossível.
    s.map.tiles[u.y * s.map.w + u.x - 1]!.h += 6;
    expect(reachable(s, u).cost.has((u.y) * s.map.w + u.x - 1)).toBe(true);
  });

  it('Singularidade Instável puxa quem está na linha para o fim do trajeto', () => {
    const { s, u, e } = duel(hero('mago', ['gravitacional_singularidade_instavel']));
    e.hp = e.maxHp = 99999;
    castSkill(s, u, sk('gravitacional_singularidade_instavel'), 11, 5);
    expect(e.x).toBeGreaterThan(6);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('Repulsão Rúnica empurra os adjacentes 3 tiles', () => {
    const { s, u, e } = duel(hero('mago', ['gravitacional_repulsao_runica']));
    e.hp = e.maxHp = 99999;
    castSkill(s, u, sk('gravitacional_repulsao_runica'), u.x, u.y);
    expect(e.x - u.x).toBe(4);
  });

  it('Massa Crítica aumenta o dano gravitacional com mais inimigos na zona', () => {
    const u = hero('mago', ['gravitacional_massa_critica']);
    const e1 = wolf();
    const e2 = wolf();
    const s = createBattle(setup([u], [e1, e2]));
    const [a, d1, d2] = s.units as [BattleUnit, BattleUnit, BattleUnit];
    [a.x, a.y, d1.x, d1.y, d2.x, d2.y] = [1, 1, 8, 8, 1, 10];
    const q = sk('gravitacional_quasar');
    const alone = previewHit(s, a, d1, 'magic', q.power, undefined, 0, 1, q).max;
    [d2.x, d2.y] = [8, 9];
    expect(previewHit(s, a, d1, 'magic', q.power, undefined, 0, 1, q).max).toBeGreaterThan(alone);
  });
});

describe('janela de reação (usar ou não)', () => {
  const setupDuel = () => {
    const { s, u, e } = duel(hero('guerreiro', ['espadachim_corte_retaliador']));
    e.accuracy = 999;
    e.hp = e.maxHp = 99999;
    return { s, u, e };
  };

  it('pergunta quando o gatilho acontece e desfaz a ação até a resposta', () => {
    const { s, u, e } = setupDuel();
    const seed = s.rng.seed;
    const hp = u.hp;
    const q = runWithReactions(s, 'player', new Map(), () => attack(s, e, u.x, u.y));
    expect(q).toEqual({ unitUid: u.uid, skillId: 'espadachim_corte_retaliador', attackerUid: e.uid });
    expect(u.hp).toBe(hp);
    expect(e.hp).toBe(e.maxHp);
    expect(s.rng.seed).toBe(seed);
    expect(reactionState(u)).toBe('ready');
  });

  it('"Não usar": leva o golpe e guarda a reação para depois', () => {
    const { s, u, e } = setupDuel();
    const hp = u.hp;
    const q = runWithReactions(s, 'player', new Map([[reactionKey({ unitUid: u.uid, skillId: 'espadachim_corte_retaliador' }), false]]), () => attack(s, e, u.x, u.y));
    expect(q).toBeNull();
    expect(u.hp).toBeLessThan(hp);
    expect(reactionState(u)).toBe('ready');
  });

  it('"Usar": resultado idêntico ao de quem reage automaticamente', () => {
    const a = setupDuel();
    const b = setupDuel();
    runWithReactions(a.s, 'player', new Map(), () => attack(a.s, a.e, a.u.x, a.u.y));
    runWithReactions(a.s, 'player', new Map([[reactionKey({ unitUid: a.u.uid, skillId: 'espadachim_corte_retaliador' }), true]]), () => attack(a.s, a.e, a.u.x, a.u.y));
    attack(b.s, b.e, b.u.x, b.u.y);
    expect(reactionState(a.u)).toBe('spent');
    expect([a.u.hp, a.e.hp, a.e.statuses]).toEqual([b.u.hp, b.e.hp, b.e.statuses]);
  });

  it('toda reação de árvore é de uso único e sem sorteio', () => {
    for (const t of REPO_TREES)
      for (const n of t.nodes)
        for (const sk of n.skills) {
          if (!sk.react) continue;
          expect(sk.react.chance ?? 100, sk.id).toBe(100);
          expect(reactionState({ ...hero('guerreiro', [sk.id]) })).toBe('ready');
        }
  });
});
