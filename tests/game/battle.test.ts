import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { planTurn } from '@game/battle/ai';
import { applyElementToTile, applyElementToUnit, environmentTick } from '@game/battle/elements';
import {
  MOVE_ONLY_GAUGE,
  activeUnit,
  advance,
  attack,
  castSkill,
  comboOptions,
  comboAsSkill,
  createBattle,
  defend,
  endTurn,
  moveTargets,
  moveUnit,
  predictOrder,
  previewHit,
  damage,
  rate,
} from '@game/battle/engine';
import { createEmptyMap, idx, tileAt, xy, type BattleMap } from '@game/battle/map';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { generateMap } from '@game/mapgen/generator';

function unit(classId: 'guerreiro' | 'mago' | 'arqueiro' | 'clerigo' | 'ladrao', team: 'player' | 'enemy', seed: number, level = 3): BattleUnit {
  const c = makeCharacter(new Rng(seed), { classId, level });
  c.skills = [...DB.classes[classId].skills];
  return unitFromCharacter(c, team);
}

function setup(map: BattleMap, players: BattleUnit[], enemies: BattleUnit[]): BattleSetup {
  return { map, players, enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 99, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
}

describe('barra de ação (ATB)', () => {
  it('unidade com o dobro da taxa age duas vezes antes da lenta', () => {
    const fast = unit('ladrao', 'player', 1);
    const slow = unit('guerreiro', 'enemy', 2);
    fast.attrs.spd = 30;
    slow.attrs.spd = 0;
    const s = createBattle(setup(createEmptyMap(8, 8, 'planicie'), [fast], [slow]));
    for (const u of s.units) u.gauge = 0;
    const order = predictOrder(s, 3);
    expect(rate(fast)).toBeGreaterThanOrEqual(rate(slow) * 2);
    expect(order.slice(0, 2)).toEqual([fast.uid, fast.uid]);
  });

  it('só mover deixa a próxima barra em 50%', () => {
    const a = unit('guerreiro', 'player', 3);
    const s = createBattle(setup(createEmptyMap(8, 8, 'planicie'), [a], [unit('guerreiro', 'enemy', 4)]));
    a.gauge = 99.99;
    const u = advance(s)!;
    expect(u.uid).toBe(a.uid);
    const [tx, ty] = xy(s.map, moveTargets(s, u)[0]!);
    moveUnit(s, u, tx, ty);
    endTurn(s);
    expect(a.gauge).toBe(MOVE_ONLY_GAUGE);
  });

  it('agir zera a barra', () => {
    const a = unit('guerreiro', 'player', 5);
    const s = createBattle(setup(createEmptyMap(8, 8, 'planicie'), [a], [unit('guerreiro', 'enemy', 6)]));
    a.gauge = 99.99;
    const u = advance(s)!;
    defend(s, u);
    endTurn(s);
    expect(a.gauge).toBe(0);
  });
});

describe('elementos', () => {
  const base = () => createBattle(setup(createEmptyMap(6, 6, 'planicie'), [unit('mago', 'player', 7)], [unit('guerreiro', 'enemy', 8)]));

  it('fogo + água = vapor', () => {
    const s = base();
    applyElementToTile(s, 3, 3, 'agua');
    applyElementToTile(s, 3, 3, 'fogo');
    const t = tileAt(s.map, 3, 3)!;
    expect(t.s).toBeFalsy();
    expect(t.c).toBe('vapor');
  });

  it('fogo em grama vira incêndio e se espalha com o tempo', () => {
    const s = base();
    applyElementToTile(s, 2, 2, 'fogo');
    expect(tileAt(s.map, 2, 2)!.s).toBe('fogo');
    for (let i = 0; i < 6; i++) environmentTick(s);
    const burnt = s.map.tiles.filter((t) => t.t === 'terra').length;
    expect(burnt).toBeGreaterThan(0);
  });

  it('eletricidade se propaga por poças conectadas', () => {
    const s = base();
    for (let x = 0; x < 5; x++) applyElementToTile(s, x, 0, 'agua');
    applyElementToTile(s, 0, 0, 'eletricidade');
    expect(tileAt(s.map, 4, 0)!.s).toBe('agua_eletrica');
  });

  it('gelo em alvo molhado congela; congelado perde o turno', () => {
    const s = base();
    const target = s.units[1]!;
    applyElementToUnit(s, target, 'agua');
    applyElementToUnit(s, target, 'gelo');
    expect(target.statuses.congelado).toBeTruthy();
    for (const u of s.units) u.gauge = 0;
    target.gauge = 99.99;
    const next = advance(s);
    expect(next?.uid).not.toBe(target.uid);
    expect(target.gauge).toBe(0);
  });

  it('óleo + fogo pega fogo em cadeia', () => {
    const s = base();
    for (let x = 0; x < 4; x++) applyElementToTile(s, x, 5, 'oleo');
    applyElementToTile(s, 0, 5, 'fogo');
    expect(tileAt(s.map, 3, 5)!.s).toBe('fogo');
  });

  it('raio causa o dobro em alvo molhado', () => {
    const s = base();
    const mage = s.units[0]!;
    const target = s.units[1]!;
    target.x = mage.x + 2;
    target.y = mage.y;
    target.hp = target.maxHp = 9999;
    s.rng = new Rng(1);
    s.activeUid = mage.uid;
    castSkill(s, mage, { ...DB.skills.raio!, accuracy: 0 }, target.x, target.y);
    const dry = 9999 - target.hp;
    target.hp = 9999;
    applyElementToUnit(s, target, 'agua');
    mage.mp = 999;
    s.rng = new Rng(1);
    castSkill(s, mage, { ...DB.skills.raio! }, target.x, target.y);
    const wet = 9999 - target.hp;
    expect(wet).toBeGreaterThan(dry * 1.5);
  });
});

describe('combos', () => {
  it('Bola de Fogo + Vendaval gera Onda Flamejante e zera a barra do parceiro', () => {
    const a = unit('mago', 'player', 11);
    const b = unit('mago', 'player', 12);
    a.skills = ['bola_de_fogo'];
    b.skills = ['vendaval'];
    const s = createBattle(setup(createEmptyMap(10, 10, 'planicie'), [a, b], [unit('guerreiro', 'enemy', 13)]));
    b.x = a.x;
    b.y = a.y + 1;
    b.gauge = 60;
    const opts = comboOptions(s, a);
    expect(opts.map((o) => o.combo.id)).toContain('onda_flamejante');
    const combo = opts.find((o) => o.combo.id === 'onda_flamejante')!;
    castSkill(s, a, comboAsSkill(combo), a.x + 3, a.y, combo);
    expect(b.gauge).toBe(0);
    expect(s.log.join(' ')).toContain('Combo');
  });
});

describe('mapas gerados', () => {
  it.each(['floresta', 'neve', 'costa', 'deserto', 'planicie'] as const)('%s tem spawns e caminho', (biome) => {
    for (const seed of [1, 2, 3]) {
      const m = generateMap({ biome, seed });
      expect(m.tiles.some((t) => t.spawn === 'player')).toBe(true);
      expect(m.tiles.some((t) => t.spawn === 'enemy')).toBe(true);
    }
  });
});

describe('batalha completa IA × IA', () => {
  it.each(['floresta', 'neve', 'costa', 'deserto', 'planicie'] as const)('termina sem erros em %s', (biome) => {
    const rng = new Rng(biome.length * 17);
    const players = (['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'] as const).map((c, i) => unit(c, 'player', 100 + i, 4));
    const enemies = ['bandido', 'rebelde_guerreiro', 'rebelde_mago', 'lebre_artica'].map((id) => unitFromEnemy(DB.enemies[id]!, 4, rng));
    const s = createBattle(setup(generateMap({ biome, seed: 5 }), players, enemies));
    let turns = 0;
    while (!s.outcome && turns < 600) {
      const u = advance(s);
      if (!u) continue;
      const plan = planTurn(s, u);
      if (plan.moveTo) moveUnit(s, u, plan.moveTo[0], plan.moveTo[1]);
      if (plan.action && u.alive && !s.outcome) {
        if (plan.action.kind === 'attack') attack(s, u, plan.action.x, plan.action.y);
        else if (plan.action.kind === 'skill') castSkill(s, u, plan.action.skill, plan.action.x, plan.action.y);
        else defend(s, u);
      }
      if (activeUnit(s) === u) endTurn(s);
      turns++;
    }
    expect(s.outcome).not.toBeNull();
    expect(idx(s.map, 0, 0)).toBe(0);
  });
});

describe('bestiário: Lebre-Ártica', () => {
  const lebre = () => unitFromEnemy(DB.enemies.lebre_artica!, 5, new Rng(3));

  it('nível fica travado na faixa da criatura', () => {
    expect(unitFromEnemy(DB.enemies.lebre_artica!, 99, new Rng(1)).level).toBe(12);
    expect(unitFromEnemy(DB.enemies.lebre_artica!, 0, new Rng(1)).level).toBe(1);
  });

  it('Mergulho na Neve só funciona na neve e esconde a lebre', () => {
    const map = createEmptyMap(6, 6, 'neve');
    const s = createBattle(setup(map, [unit('guerreiro', 'player', 1)], [lebre()]));
    const l = s.units[1]!;
    const dive = { ...DB.skills.mergulho_na_neve!, name: 'x' };
    expect(castSkill(s, l, dive, l.x, l.y)).toBe(true);
    expect(l.hidden).toBe(true);
    expect(l.statuses.submerso).toBe(2);
    const grass = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [unit('guerreiro', 'player', 1)], [lebre()]));
    expect(castSkill(grass, grass.units[1]!, dive, 0, 0)).toBe(false);
  });

  it('Chute de Gelo cega o alvo e reduz o acerto dele', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'neve'), [unit('guerreiro', 'player', 1)], [lebre()]));
    const [p, l] = [s.units[0]!, s.units[1]!];
    const before = previewHit(s, p, l, 'basic', 0).chance;
    p.statuses.cegado = 2;
    expect(previewHit(s, p, l, 'basic', 0).chance).toBeLessThan(before);
  });

  it('Velocidade Branca aumenta a esquiva só na neve', () => {
    const snow = createBattle(setup(createEmptyMap(6, 6, 'neve'), [unit('guerreiro', 'player', 1)], [lebre()]));
    const grass = createBattle(setup(createEmptyMap(6, 6, 'planicie'), [unit('guerreiro', 'player', 1)], [lebre()]));
    const onSnow = previewHit(snow, snow.units[0]!, snow.units[1]!, 'basic', 0).chance;
    const onGrass = previewHit(grass, grass.units[0]!, grass.units[1]!, 'basic', 0).chance;
    expect(onSnow).toBeLessThan(onGrass);
  });

  it('abater dá o XP da ficha', () => {
    const s = createBattle(setup(createEmptyMap(6, 6, 'neve'), [unit('guerreiro', 'player', 1)], [lebre()]));
    const [p, l] = [s.units[0]!, s.units[1]!];
    l.hp = 1;
    damage(s, l, 5, p, undefined);
    expect(p.killXp).toBe(l.xpReward);
    expect(l.xpReward).toBeGreaterThanOrEqual(12);
  });
});
