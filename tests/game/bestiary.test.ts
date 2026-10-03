import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { BIOMES, DB, ELEMENTS, REPO_CREATURES, creatureSkillToSkill, type CreatureDef } from '@game/data';
import { runAiTurn } from '@game/battle/ai';
import { activeUnit, advance, attack, castSkill, createBattle, damage, endTurn, moveBudget, previewHit, resolveAttack } from '@game/battle/engine';
import { createEmptyMap, type BattleMap } from '@game/battle/map';
import { STATUS_INFO, type BattleSetup, type BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { applyStatus } from '@game/battle/creature_fx';
import { mergeBestiary } from '@game/bestiary/bestiary_store';
import { describeSkill } from '@game/bestiary/describe';
import { devPlayerUnits } from '@game/dev/dev_squad';
import { generateMap } from '@game/mapgen/generator';
import { makeCharacter } from '@game/rules/recruit';
import { planEncounter } from '@game/world/encounters';

const encounterable = REPO_CREATURES.filter((c) => !c.summonOnly);

function setup(map: BattleMap, players: BattleUnit[], enemies: BattleUnit[], seed = 99): BattleSetup {
  return { map, players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

function warrior(level = 10, seed = 1): BattleUnit {
  const c = makeCharacter(new Rng(seed), { classId: 'guerreiro', level });
  return unitFromCharacter(c, 'player');
}

function beast(id: string, level?: number): BattleUnit {
  const def = DB.enemies[id]!;
  return unitFromEnemy(def, level ?? def.levelMin ?? 1, new Rng(5));
}

function statusIdsOf(c: CreatureDef): string[] {
  const out: string[] = [];
  for (const s of c.skills) {
    if (s.status) out.push(s.status.id);
    if (s.react?.status) out.push(s.react.status.id);
    const f = s.fx ?? {};
    for (const a of f.also ?? []) out.push(a.id);
    if (f.self) out.push(f.self.id);
    if (f.aura?.status) out.push(f.aura.status.id);
    for (const st of f.stances?.list ?? []) {
      if (st.enemyStatus) out.push(st.enemyStatus.id);
      if (st.selfStatus) out.push(st.selfStatus.id);
    }
  }
  return out;
}

describe('bestiário: conteúdo', () => {
  it('tem 125 criaturas: 25 por bioma (10 comuns, 8 mágicas, 5 épicas, 2 lendárias)', () => {
    expect(encounterable).toHaveLength(125);
    for (const b of BIOMES) {
      const list = encounterable.filter((c) => c.biomes.includes(b));
      expect(list).toHaveLength(25);
      const count = (r: string) => list.filter((c) => c.rarity === r).length;
      expect([count('comum'), count('raro'), count('epico'), count('lendario')]).toEqual([10, 8, 5, 2]);
    }
  });

  it('toda ficha é válida (status, elementos, invocações, sprite e paleta)', () => {
    const skillIds = new Set<string>();
    for (const c of REPO_CREATURES) {
      expect(c.levelMin, c.id).toBeLessThanOrEqual(c.levelMax);
      expect(c.element === 'neutro' || ELEMENTS.includes(c.element), c.id).toBe(true);
      expect(c.skills.length, c.id).toBeGreaterThanOrEqual(2);
      for (const id of statusIdsOf(c)) expect(id in STATUS_INFO, `${c.id}: status ${id}`).toBe(true);
      for (const s of c.skills) {
        expect(skillIds.has(s.id), `habilidade repetida ${s.id}`).toBe(false);
        skillIds.add(s.id);
        expect(() => creatureSkillToSkill(s)).not.toThrow();
        expect(describeSkill(s)).not.toMatch(/undefined|NaN/);
        if (s.element) expect(ELEMENTS).toContain(s.element);
        const f = s.fx ?? {};
        const summons = [...(f.summon ?? []), ...(f.summonStart ?? []), ...(f.summonAt?.list ?? []), ...(f.summonEvery?.list ?? [])];
        for (const sm of summons) expect(DB.enemies[sm.id], `${c.id} invoca ${sm.id}`).toBeDefined();
      }
      const w = c.sprite[0]!.length;
      for (const row of c.sprite) {
        expect(row.length, `${c.id}: linhas do sprite com larguras diferentes`).toBe(w);
        for (const ch of row) if (ch !== '.') expect(c.palette[ch], `${c.id}: cor ${ch}`).toBeDefined();
      }
    }
  });

  it('épicos e lendários têm mecânica diferenciada marcada', () => {
    for (const c of encounterable.filter((c) => c.rarity === 'epico' || c.rarity === 'lendario')) {
      if (c.id === 'esfinge_guardia' || c.id === 'quelone_ilha') continue; // o arquivo de design não define mecânica para elas
      expect(c.skills.some((s) => s.signature), c.id).toBe(true);
    }
  });
});

describe('bestiário: toda criatura luta sem quebrar o motor', () => {
  it.each(encounterable.map((c) => [c.id] as const))('%s', (id) => {
    const c = DB.creatures[id]!;
    const lvl = c.levelMin;
    const rng = new Rng(11);
    const enemies = [unitFromEnemy(DB.enemies[id]!, lvl, rng), unitFromEnemy(DB.enemies[id]!, lvl, rng)];
    const s = createBattle(setup(generateMap({ biome: c.biomes[0]!, seed: 4 }), devPlayerUnits(Math.max(1, lvl)).slice(0, 4), enemies, 21));
    for (let i = 0; i < 60 && !s.outcome; i++) {
      const u = advance(s);
      if (!u) continue;
      runAiTurn(s, u);
      if (activeUnit(s)) endTurn(s);
      for (const x of s.units) {
        expect(Number.isFinite(x.hp), `${x.name} hp`).toBe(true);
        expect(x.hp).toBeGreaterThanOrEqual(0);
        expect(x.hp).toBeLessThanOrEqual(x.maxHp);
      }
    }
    // Usou alguma habilidade própria ou atacou.
    expect(s.log.length).toBeGreaterThan(3);
  });
});

describe('bestiário: mecânicas', () => {
  it('Coração da Floresta: o Ent vira semente e revive se não for destruído', () => {
    const s = createBattle(setup(createEmptyMap(8, 8, 'floresta'), [warrior()], [beast('ent_guardiao')]));
    const [p, ent] = [s.units[0]!, s.units[1]!];
    damage(s, ent, ent.hp + 50, p, undefined);
    expect(ent.alive).toBe(true);
    expect(ent.statuses.semente).toBe(3);
    for (let i = 0; i < 12 && ent.statuses.semente; i++) {
      const u = advance(s);
      if (u) endTurn(s);
    }
    expect(ent.statuses.semente).toBeUndefined();
    expect(ent.hp).toBeGreaterThanOrEqual(Math.round(ent.maxHp * 0.5));
    // Na segunda queda, morre de vez.
    damage(s, ent, ent.hp + 50, p, undefined);
    expect(ent.alive).toBe(false);
  });

  it('Núcleo Verde não revive o Leshy se o golpe final for de fogo', () => {
    const s = createBattle(setup(createEmptyMap(8, 8, 'floresta'), [warrior()], [beast('anciao_verde')]));
    const leshy = s.units[1]!;
    damage(s, leshy, leshy.hp + 999, s.units[0], 'fogo');
    expect(leshy.alive).toBe(false);
  });

  it('Salto Evasivo anula um golpe físico por rodada', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [warrior(20)], [beast('lebre_da_grama', 5)]));
    const [p, l] = [s.units[0]!, s.units[1]!];
    p.accuracy = 999;
    l.x = p.x + 1;
    l.y = p.y;
    const hp = l.hp;
    expect(resolveAttack(s, p, l, 'basic', 0, undefined, 0, 1)).toBe(false);
    expect(l.hp).toBe(hp);
    resolveAttack(s, p, l, 'basic', 0, undefined, 0, 1);
    expect(l.hp).toBeLessThan(hp);
  });

  it('Abraço Esmagador agarra; o alvo não anda e um golpe forte no urso o solta', () => {
    const s = createBattle(setup(createEmptyMap(8, 8, 'floresta'), [warrior(8)], [beast('urso_pardo_das_cavas', 8)]));
    const [p, bear] = [s.units[0]!, s.units[1]!];
    bear.x = p.x + 1;
    bear.y = p.y;
    bear.accuracy = 999;
    const hug = DB.skills.abraco_esmagador!;
    expect(castSkill(s, bear, hug, p.x, p.y)).toBe(true);
    expect(p.statuses.preso).toBeGreaterThan(0);
    expect(p.boundBy).toBe(bear.uid);
    expect(moveBudget(p)).toBe(0);
    damage(s, bear, Math.ceil(bear.maxHp * 0.2), p, undefined);
    expect(p.statuses.preso).toBeUndefined();
  });

  it('Kraken começa com 4 tentáculos e é imune enquanto eles vivem', () => {
    const s = createBattle(setup(createEmptyMap(12, 12, 'costa'), [warrior(60)], [beast('kraken')]));
    const kraken = s.units.find((u) => u.enemyId === 'kraken')!;
    const tentacles = s.units.filter((u) => u.summonedBy === kraken.uid);
    expect(tentacles).toHaveLength(4);
    const hp = kraken.hp;
    damage(s, kraken, 100, s.units[0], undefined);
    expect(kraken.hp).toBe(hp);
    for (const t of tentacles) damage(s, t, t.hp + 1, s.units[0], undefined);
    damage(s, kraken, 100, s.units[0], undefined);
    expect(kraken.hp).toBeLessThan(hp);
  });

  it('lento em quem já está lento vira imobilizado (petrificação gradual)', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [warrior()], [beast('gorgona_errante')]));
    const p = s.units[0]!;
    applyStatus(s, p, { id: 'lento', turns: 2 });
    expect(p.statuses.imobilizado).toBeUndefined();
    applyStatus(s, p, { id: 'lento', turns: 2 });
    expect(p.statuses.imobilizado).toBe(1);
    expect(moveBudget(p)).toBe(0);
  });

  it('imunidades das passivas são respeitadas (Rã: Pele Escorregadia)', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [warrior()], [beast('ra_saltadora')]));
    const ra = s.units[1]!;
    expect(applyStatus(s, ra, { id: 'imobilizado', turns: 2 })).toBe(false);
    expect(ra.statuses.imobilizado).toBeUndefined();
  });

  it('Carapaça Rúnica: gelo cura o Urso-Polar-Rúnico', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'neve'), [warrior()], [beast('urso_polar_runico')]));
    const bear = s.units[1]!;
    bear.hp -= 30;
    const hp = bear.hp;
    damage(s, bear, 20, s.units[0], 'gelo');
    expect(bear.hp).toBe(hp + 20);
  });

  it('medo impede o ataque básico', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [warrior()], [beast('lobo_da_silvia')]));
    const [p, w] = [s.units[0]!, s.units[1]!];
    w.x = p.x + 1;
    w.y = p.y;
    p.statuses.medo = 1;
    expect(attack(s, p, w.x, w.y)).toBe(false);
  });

  it('Pele de Escamas Divinas reduz dano mágico', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [warrior()], [beast('quirin_da_alvorada'), beast('centauro_nomade', 65)]));
    const [p, q, c] = [s.units[0]!, s.units[1]!, s.units[2]!];
    q.attrs = { ...c.attrs };
    q.def = c.def;
    expect(previewHit(s, p, q, 'magic', 10).max).toBeLessThan(previewHit(s, p, c, 'magic', 10).max);
  });
});

describe('bestiário: edições locais', () => {
  const repo = REPO_CREATURES.slice(0, 3);
  it('edições substituem pelo id, excluídas somem e novas entram no fim', () => {
    const edited = { ...repo[0]!, hp: 999 };
    const novo = { ...repo[1]!, id: 'nova_criatura' };
    const out = mergeBestiary(repo, { edits: [edited, novo], deleted: [repo[2]!.id] });
    expect(out.map((c) => c.id)).toEqual([repo[0]!.id, repo[1]!.id, 'nova_criatura']);
    expect(out[0]!.hp).toBe(999);
  });
});

describe('bestiário: encontros', () => {
  it('feras só aparecem se o nível do encontro alcança a faixa delas', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = planEncounter(new Rng(seed), 'floresta', 3, 'lendario');
      for (const e of plan.enemies) {
        const def = DB.enemies[e.id]!;
        if (def.kind === 'beast') expect(def.levelMin ?? 1, e.id).toBeLessThanOrEqual(plan.level + 3);
      }
      expect(plan.tier).not.toBe('lendario');
    }
  });

  it('no nível certo, encontros lendários trazem uma lendária do bioma', () => {
    const plan = planEncounter(new Rng(1), 'costa', 70, 'lendario');
    expect(DB.enemies[plan.enemies[0]!.id]!.tier).toBe('lendario');
    expect(plan.enemies.some((e) => e.id === 'tentaculo_kraken')).toBe(false);
  });
});
