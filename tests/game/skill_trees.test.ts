import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, REPO_TREES, creatureSkillToSkill, type ClassId } from '@game/data';
import { advance, attack, castSkill, createBattle, damage, endTurn, hide, moveUnit, skillTargets, skillUsable, teamVision, type SkillLike } from '@game/battle/engine';
import { createEmptyMap, xy } from '@game/battle/map';
import { STATUS_INFO, type BattleSetup, type BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { CLONE_ID } from '@game/battle/creature_fx';
import { derive, learnSkill, learnableSkills } from '@game/rules/character';
import { lockReason, rankMult, rankOf } from '@game/rules/skill_tree';
import { makeCharacter } from '@game/rules/recruit';
import { describeSkill } from '@game/bestiary/describe';

function setup(players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map: createEmptyMap(12, 12, 'planicie'), players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed: 5, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

function caster(classId: ClassId, skills: string[], level = 50): BattleUnit {
  const c = makeCharacter(new Rng(3), { classId, level });
  c.skills = skills;
  c.skillRanks = {};
  c.mp = 9999;
  const u = unitFromCharacter(c, 'player');
  u.mp = u.maxMp = 9999;
  return u;
}

function foe(level = 30): BattleUnit {
  return unitFromEnemy(DB.enemies.lobo_da_silvia!, level, new Rng(1));
}

/** Coloca o conjurador no centro e inimigos em volta (perto e longe). */
function arena(u: BattleUnit) {
  const enemies = [foe(), foe(), foe()];
  const s = createBattle(setup([u], enemies));
  const [a, e1, e2, e3] = s.units as [BattleUnit, BattleUnit, BattleUnit, BattleUnit];
  [a.x, a.y, a.facing] = [5, 5, 0];
  [e1.x, e1.y] = [6, 5];
  [e2.x, e2.y] = [5, 8];
  [e3.x, e3.y] = [9, 5];
  s.activeUid = a.uid;
  s.turn = { moved: false, acted: false, startX: 5, startY: 5 };
  return { s, a, enemies: [e1, e2, e3] };
}

const allTreeSkills = REPO_TREES.flatMap((t) => t.nodes.flatMap((n) => n.skills.map((sk) => ({ tree: t, node: n, sk }))));

describe('árvores: conteúdo', () => {
  it('Arqueiro e Clérigo têm 9 nós e 80 habilidades cada', () => {
    for (const id of ['arqueiro', 'clerigo']) {
      const t = REPO_TREES.find((x) => x.classId === id)!;
      expect(t.nodes, id).toHaveLength(9);
      expect(t.nodes.filter((n) => n.type !== 'base').reduce((a, n) => a + n.skills.length, 0), id).toBe(80);
    }
  });

  it('Ladino tem 9 nós e 80 habilidades; Mago tem 15 nós e 131 habilidades (130 + Iniciado nos Elementos)', () => {
    const lad = REPO_TREES.find((t) => t.classId === 'ladrao')!;
    const mag = REPO_TREES.find((t) => t.classId === 'mago')!;
    expect(lad.nodes).toHaveLength(9);
    expect(lad.nodes.filter((n) => n.type !== 'base').reduce((a, n) => a + n.skills.length, 0)).toBe(80);
    expect(mag.nodes).toHaveLength(15);
    expect(mag.nodes.filter((n) => n.type !== 'base').reduce((a, n) => a + n.skills.length, 0)).toBe(131);
  });

  it('híbridas têm 2 pais, ramos têm 1 e todos os pais existem', () => {
    for (const t of REPO_TREES)
      for (const n of t.nodes) {
        if (n.type === 'hibrida') expect(n.parents, n.id).toHaveLength(2);
        if (n.type === 'ramo') expect(n.parents, n.id).toHaveLength(1);
        for (const p of n.parents) expect(t.nodes.some((o) => o.id === p), `${n.id} → ${p}`).toBe(true);
      }
  });

  it('toda habilidade é válida (status, invocações, conversão)', () => {
    for (const { sk } of allTreeSkills) {
      expect(() => creatureSkillToSkill(sk)).not.toThrow();
      expect(DB.skills[sk.id]?.tree, sk.id).toBeDefined();
      const f = sk.fx ?? {};
      for (const st of [sk.status, ...(f.also ?? []), f.self, f.imbue?.status, f.trap?.status, f.consume?.apply, sk.react?.status, f.onKill?.status, f.onCritSelf, f.onCastSelf?.status])
        if (st) expect(st.id in STATUS_INFO, `${sk.id}: ${st.id}`).toBe(true);
      for (const sm of f.summon ?? []) expect(sm.id === CLONE_ID || !!DB.enemies[sm.id], `${sk.id} invoca ${sm.id}`).toBe(true);
      if (f.onCritReset) expect(DB.skills[f.onCritReset], f.onCritReset).toBeDefined();
      expect(describeSkill(sk), sk.id).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('árvores: aprendizado', () => {
  const chain = (cls: ClassId, node: string) => REPO_TREES.find((t) => t.classId === cls)!.nodes.find((n) => n.id === node)!.skills.filter((x) => !x.grantedBy).map((x) => x.id);

  it('na teia, cada habilidade pede a anterior', () => {
    const c = makeCharacter(new Rng(2), { classId: 'ladrao', level: 30 });
    c.skills = [];
    const a = chain('ladrao', 'assassino');
    expect(lockReason(c, a[0]!)).toBeNull();
    expect(lockReason(c, a[1]!)).toContain(DB.skills[a[0]!]!.name);
    c.skills.push(a[0]!);
    expect(lockReason(c, a[1]!)).toBeNull();
  });

  it('híbrida abre com a 3ª habilidade de cada teia de origem; ramo com a última da origem', () => {
    const c = makeCharacter(new Rng(2), { classId: 'ladrao', level: 30 });
    c.skills = [];
    const sic = chain('ladrao', 'sicario')[0]!;
    const [a, n] = [chain('ladrao', 'assassino'), chain('ladrao', 'ninja')];
    c.skills.push(a[0]!, a[1]!, n[0]!, n[1]!);
    expect(lockReason(c, sic)).toMatch(/requer/);
    c.skills.push(a[2]!);
    expect(lockReason(c, sic)).toContain('Ninja');
    c.skills.push(n[2]!);
    expect(lockReason(c, sic)).toBeNull();

    const m = makeCharacter(new Rng(2), { classId: 'mago', level: 30 });
    m.skills = [];
    const el = chain('mago', 'elementalista');
    const fogo = chain('mago', 'fogo')[0]!;
    m.skills.push(...el.slice(0, -1));
    expect(lockReason(m, fogo)).not.toBeNull();
    m.skills.push(el[el.length - 1]!);
    expect(lockReason(m, fogo)).toBeNull();
  });

  it('pontos aprendem (Nv 1) e fortalecem até o Nv 5; nível mínimo respeitado', () => {
    const c = makeCharacter(new Rng(2), { classId: 'ladrao', level: 2 });
    c.skills = [];
    c.skillPoints = 9;
    const first = chain('ladrao', 'assassino')[0]!;
    expect(learnableSkills(c)).toContain(first);
    for (let i = 0; i < 5; i++) expect(learnSkill(c, first)).toBe(true);
    expect(rankOf(c, first)).toBe(5);
    expect(learnSkill(c, first)).toBe(false);
    expect(lockReason(c, first)).toBe('nível máximo');
    expect(c.skillPoints).toBe(4);
    expect(lockReason(c, 'mago_erudicao_arcana')).not.toBeNull();
    // Supremas mantêm o nível mínimo do personagem.
    const ult = REPO_TREES.find((t) => t.classId === 'ladrao')!.nodes.find((n) => n.id === 'assassino')!.skills.find((x) => x.ultimate)!;
    c.skills.push(...chain('ladrao', 'assassino').filter((id) => id !== ult.id));
    expect(lockReason(c, ult.id)).toMatch(/requer NV/);
  });

  it('cada nível deixa a habilidade mais forte (1,2× → 1,6× no exemplo do design)', () => {
    expect(rankMult(1)).toBeCloseTo(1);
    expect(rankMult(2)).toBeCloseTo(1.3 / 1.2);
    expect(rankMult(5)).toBeCloseTo(1.6 / 1.2);
    const { s, a, enemies } = arena(caster('guerreiro', ['espadachim_golpe_feroz']));
    const sk = DB.skills.espadachim_golpe_feroz! as SkillLike;
    const lv1 = previewHit(s, a, enemies[0]!, 'physical', sk.power, undefined, 0, 1, sk).max;
    a.skillRanks = { espadachim_golpe_feroz: 5 };
    expect(previewHit(s, a, enemies[0]!, 'physical', sk.power, undefined, 0, 1, sk).max).toBeGreaterThan(lv1 * 1.25);
  });

  it('bônus de MP do nó entra ao aprender a 1ª habilidade dele', () => {
    const m = makeCharacter(new Rng(2), { classId: 'mago', level: 10 });
    m.skills = [];
    const before = derive(m).maxMp;
    m.skills.push('elementalista_raio_de_gelo');
    // +40 MP do Elementalista, multiplicados pela INT (+2%/ponto) e pela passiva do Mago (+10%).
    const expected = 40 * (1 + derive(m).attrs.int * 0.02) * 1.1;
    expect(Math.abs(derive(m).maxMp - before - expected)).toBeLessThanOrEqual(2);
  });
});

describe('Mago: Iniciado no Estudo dos Elementos', () => {
  it('um ponto libera os seis raios, que acompanham o nível do Iniciado', () => {
    const m = makeCharacter(new Rng(2), { classId: 'mago', level: 5 });
    m.skills = [];
    m.skillRanks = {};
    m.skillPoints = 3;
    expect(lockReason(m, 'elementalista_raio_de_fogo')).toMatch(/vem com Iniciado/);
    expect(learnSkill(m, 'elementalista_iniciado_no_estudo_dos_elementos')).toBe(true);
    learnSkill(m, 'elementalista_iniciado_no_estudo_dos_elementos');
    const u = unitFromCharacter(m, 'player');
    for (const el of ['fogo', 'agua', 'terra', 'eletricidade', 'ar', 'gelo']) expect(u.skills, el).toContain(`elementalista_raio_de_${el}`);
    expect(u.skillRanks?.elementalista_raio_de_fogo).toBe(2);
    expect(lockReason(m, 'fogo_pericia_em_fogo')).toBeNull();
  });
});

describe('classes base: passivas inatas', () => {
  it('a classe base não tem habilidades a aprender e a passiva vem junto na batalha', () => {
    for (const t of REPO_TREES) {
      const base = t.nodes.find((n) => n.type === 'base')!;
      expect(base.skills, t.id).toHaveLength(1);
      expect(base.skills[0]!.kind, t.id).toBe('passive');
      const c = makeCharacter(new Rng(1), { classId: t.classId, level: 5 });
      expect(lockReason(c, base.skills[0]!.id)).toBe('passiva inata da classe');
      expect(unitFromCharacter(c, 'player').skills).toContain(base.skills[0]!.id);
    }
  });

  it('bônus de atributo: Guerreiro +10% FOR, Mago +10% INT e MP, Ladino +10% VEL, Arqueiro +10% DES', () => {
    const at = (cls: ClassId) => {
      const c = makeCharacter(new Rng(9), { classId: cls, level: 1 });
      c.attrs = { str: 30, dex: 30, spd: 30, int: 30, vit: 10 };
      c.equipment = { weapon: null, offhand: null, armor: null, accessory: null, utility: [null, null, null] };
      return derive(c).attrs;
    };
    expect(at('guerreiro').str).toBe(33);
    expect(at('mago').int).toBe(33);
    expect(at('clerigo').int).toBe(33);
    expect(at('ladrao').spd).toBe(33);
    expect(at('arqueiro').dex).toBe(33);
  });

  it('Ladino: uma vez por batalha esconder-se não gasta a ação', () => {
    const { s, a } = arena(caster('ladrao', []));
    hide(s, a);
    expect(s.turn.acted).toBe(false);
    hide(s, a);
    expect(s.turn.acted).toBe(true);
  });

  it('Arqueiro: sem se mover no turno, mais acerto', () => {
    const { s, a, enemies } = arena(caster('arqueiro', []));
    enemies[2]!.evasion = 150;
    const still = previewHit(s, a, enemies[2]!, 'basic', 0).chance;
    s.turn.moved = true;
    expect(previewHit(s, a, enemies[2]!, 'basic', 0).chance).toBeLessThan(still);
  });
});

describe('árvores: cada habilidade funciona em batalha', () => {
  const active = allTreeSkills.filter(({ sk }) => sk.kind !== 'passive' && sk.kind !== 'reaction');
  it.each(active.map(({ tree, sk }) => [sk.id, tree.classId] as const))('%s', (id, classId) => {
    const { s, a } = arena(caster(classId, [id]));
    if (DB.skills[id]!.fx?.corpse) damage(s, s.units[1]!, 9999, a, undefined);
    if (DB.skills[id]!.fx?.sacrifice) castSkill(s, a, DB.skills.invocador_servos_esqueleticos! as SkillLike, a.x, a.y);
    s.activeUid = a.uid;
    s.turn.acted = false;
    a.cooldowns = {};
    // Habilidades que pedem vegetação ao lado.
    if (DB.skills[id]!.fx?.hide === 'bush') s.map.tiles[5 * s.map.w + 4]!.p = 'arbusto';
    const sk = DB.skills[id]! as SkillLike;
    expect(skillUsable(s, a, sk), 'usável').toBe(true);
    const tiles = skillTargets(s, a, sk, teamVision(s, 'player'));
    expect(tiles.length, 'tem alvos').toBeGreaterThan(0);
    const withEnemy = tiles.find((i) => {
      const [x, y] = xy(s.map, i);
      return s.units.some((o) => o.alive && o.team === 'enemy' && o.x === x && o.y === y);
    });
    const [x, y] = xy(s.map, withEnemy ?? tiles[0]!);
    expect(castSkill(s, a, sk, x, y)).toBe(true);
    // Deixa os efeitos agendados agirem.
    endTurn(s);
    for (let i = 0; i < 12 && !s.outcome; i++) if (advance(s)) endTurn(s);
    for (const o of s.units) {
      expect(Number.isFinite(o.hp)).toBe(true);
      expect(o.hp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('árvores: mecânicas novas', () => {
  it('Carga de Dinamite explode na rodada seguinte', () => {
    const { s, a, enemies } = arena(caster('ladrao', ['sabotador_carga_de_dinamite']));
    const e = enemies[2]!;
    const hp = e.hp;
    castSkill(s, a, DB.skills.sabotador_carga_de_dinamite! as SkillLike, e.x, e.y);
    expect(e.hp).toBe(hp);
    expect(s.pending).toHaveLength(1);
    endTurn(s);
    for (let i = 0; i < 20 && s.pending?.length; i++) if (advance(s)) endTurn(s);
    expect(s.pending).toHaveLength(0);
    expect(e.hp).toBeLessThan(hp);
  });

  it('Lâmina Envenenada faz o ataque básico envenenar', () => {
    const { s, a, enemies } = arena(caster('ladrao', ['assassino_lamina_envenenada']));
    castSkill(s, a, DB.skills.assassino_lamina_envenenada! as SkillLike, a.x, a.y);
    expect(a.statuses.encantado).toBe(3);
    s.turn.acted = false;
    a.accuracy = 999;
    attack(s, a, enemies[0]!.x, enemies[0]!.y);
    expect(enemies[0]!.statuses.envenenado).toBeGreaterThan(0);
  });

  it('Fio de Tropeço derruba quem pisar', () => {
    const { s, a, enemies } = arena(caster('ladrao', ['sabotador_fio_de_tropeco']));
    castSkill(s, a, DB.skills.sabotador_fio_de_tropeco! as SkillLike, 7, 7);
    expect(s.traps?.length).toBeGreaterThan(0);
    const e = enemies[1]!;
    [e.x, e.y] = [7, 9];
    s.activeUid = e.uid;
    moveUnit(s, e, 7, 7);
    expect(e.statuses.derrubado).toBeGreaterThan(0);
  });

  it('Técnica dos Clones cria 2 clones de 1 HP do mesmo time', () => {
    const { s, a } = arena(caster('ladrao', ['ninja_tecnica_dos_clones_de_sombra']));
    castSkill(s, a, DB.skills.ninja_tecnica_dos_clones_de_sombra! as SkillLike, a.x, a.y);
    const clones = s.units.filter((u) => u.summonedBy === a.uid);
    expect(clones).toHaveLength(2);
    expect(clones.every((c) => c.team === 'player' && c.maxHp === 1 && !c.charId)).toBe(true);
  });

  it('Avançar devolve a ação no mesmo turno', () => {
    const { s, a } = arena(caster('mago', ['tempo_avancar']));
    castSkill(s, a, DB.skills.tempo_avancar! as SkillLike, a.x, a.y);
    expect(s.turn.acted).toBe(false);
    expect(s.turn.moved).toBe(false);
  });

  it('Pacto de Sangue salva de um golpe fatal uma vez', () => {
    const { s, a } = arena(caster('mago', ['necro_pacto_de_sangue']));
    damage(s, a, a.hp + 100, s.units[1], undefined);
    expect(a.alive).toBe(true);
    expect(a.hp).toBe(1);
    damage(s, a, 100, s.units[1], undefined);
    expect(a.alive).toBe(false);
  });

  it('Perícia em Fogo aumenta o dano de fogo', () => {
    const { s, a, enemies } = arena(caster('mago', []));
    const before = previewMax(s, a, enemies[0]!);
    a.skills = ['fogo_pericia_em_fogo'];
    expect(previewMax(s, a, enemies[0]!)).toBeGreaterThan(before);
  });
});

import { previewHit } from '@game/battle/engine';
import { planTurn } from '@game/battle/ai';

describe('árvores: Arqueiro e Clérigo', () => {
  it('bônus de classe percentual (+10% HP do Clérigo) entra ao aprender a 1ª habilidade do nó', () => {
    const c = makeCharacter(new Rng(4), { classId: 'clerigo', level: 10 });
    c.skills = [];
    const before = derive(c).maxHp;
    c.skills.push('monge_palma_espiritual');
    expect(Math.abs(derive(c).maxHp - (before / 1.1) * 1.2)).toBeLessThanOrEqual(1);
  });

  it('Interceder: o Paladino recebe o golpe no lugar do aliado adjacente', () => {
    const pal = caster('clerigo', ['paladino_interceder']);
    const friend = caster('mago', []);
    const s = createBattle(setup([pal, friend], [foe()]));
    [pal.x, pal.y, friend.x, friend.y] = [5, 5, 6, 5];
    const [hpFriend, hpPal] = [friend.hp, pal.hp];
    damage(s, friend, 40, s.units[2], undefined);
    expect(friend.hp).toBe(hpFriend);
    expect(pal.hp).toBeLessThan(hpPal);
  });

  it('Desafio Sagrado: inimigos provocados só miram o Paladino', () => {
    const pal = caster('clerigo', ['paladino_desafio_sagrado']);
    const friend = caster('mago', []);
    const e = foe();
    const s = createBattle(setup([pal, friend], [e]));
    [pal.x, pal.y, friend.x, friend.y, e.x, e.y] = [5, 5, 3, 3, 6, 5];
    s.activeUid = pal.uid;
    castSkill(s, pal, DB.skills.paladino_desafio_sagrado! as SkillLike, pal.x, pal.y);
    expect(e.statuses.provocado).toBeGreaterThan(0);
    [friend.x, friend.y] = [7, 5];
    e.skills = [];
    const plan = planTurn(s, e);
    const a = plan.action;
    expect(a && a.kind !== 'defend' ? [a.x, a.y] : null).toEqual([pal.x, pal.y]);
  });

  it('Disparo Perfurante atravessa a fila de inimigos', () => {
    const { s, a, enemies } = arena(caster('arqueiro', ['sniper_disparo_perfurante']));
    a.accuracy = 999;
    const hps = [enemies[0]!.hp, enemies[2]!.hp];
    castSkill(s, a, DB.skills.sniper_disparo_perfurante! as SkillLike, 9, 5);
    expect(enemies[0]!.hp).toBeLessThan(hps[0]!);
    expect(enemies[2]!.hp).toBeLessThan(hps[1]!);
  });

  it('Fortaleza Divina deixa o Paladino invulnerável', () => {
    const { s, a } = arena(caster('clerigo', ['paladino_fortaleza_divina']));
    castSkill(s, a, DB.skills.paladino_fortaleza_divina! as SkillLike, a.x, a.y);
    const hp = a.hp;
    damage(s, a, 500, s.units[1], undefined);
    expect(a.hp).toBe(hp);
  });

  it('Armadilha de Espinhos fere quem pisa e os vizinhos', () => {
    const { s, a, enemies } = arena(caster('arqueiro', ['trapper_armadilha_de_espinhos']));
    castSkill(s, a, DB.skills.trapper_armadilha_de_espinhos! as SkillLike, 7, 7);
    const [walker, near] = [enemies[1]!, enemies[2]!];
    [walker.x, walker.y, near.x, near.y] = [7, 9, 8, 7];
    const hp = near.hp;
    s.activeUid = walker.uid;
    moveUnit(s, walker, 7, 7);
    expect(walker.statuses.sangramento).toBeGreaterThan(0);
    expect(near.hp).toBeLessThan(hp);
  });
});
function previewMax(s: ReturnType<typeof arena>['s'], a: BattleUnit, t: BattleUnit): number {
  return previewHit(s, a, t, 'magic', 10, 'fogo').max;
}
