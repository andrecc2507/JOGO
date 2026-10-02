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
  buildResult,
  checkVictory,
  interact,
  interactTargets,
  capturable,
  capture,
  captureChance,
  opportunityThreats,
  readyable,
  setOverwatch,
  type SkillLike,
} from '@game/battle/engine';
import { createEmptyMap, idx, tileAt, xy, type BattleMap } from '@game/battle/map';
import type { BattleSetup, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';
import { generateMap } from '@game/mapgen/generator';

function unit(classId: 'guerreiro' | 'mago' | 'arqueiro' | 'clerigo' | 'ladrao', team: 'player' | 'enemy', seed: number, level = 3): BattleUnit {
  const c = makeCharacter(new Rng(seed), { classId, level });
  c.skills = [];
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
    castSkill(s, mage, { ...DB.skills.elementalista_raio_de_eletricidade!, accuracy: 0 } as SkillLike, target.x, target.y);
    const dry = 9999 - target.hp;
    target.hp = 9999;
    applyElementToUnit(s, target, 'agua');
    mage.mp = 999;
    s.rng = new Rng(1);
    castSkill(s, mage, { ...DB.skills.elementalista_raio_de_eletricidade! } as SkillLike, target.x, target.y);
    const wet = 9999 - target.hp;
    expect(wet).toBeGreaterThan(dry * 1.5);
  });
});

describe('combos', () => {
  it('Bola de Fogo + Vendaval gera Onda Flamejante e zera a barra do parceiro', () => {
    const a = unit('mago', 'player', 11);
    const b = unit('mago', 'player', 12);
    a.skills = ['elementalista_raio_de_fogo'];
    b.skills = ['elementalista_raio_de_ar'];
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
    expect(unitFromEnemy(DB.enemies.lebre_artica!, 99, new Rng(1)).level).toBe(DB.enemies.lebre_artica!.levelMax);
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

describe('turno: andar, agir e andar o resto', () => {
  function flat(players: BattleUnit[], enemies: BattleUnit[]) {
    const s = createBattle(setup(createEmptyMap(14, 14, 'planicie'), players, enemies));
    for (const t of s.map.tiles) {
      t.p = undefined;
      t.h = 1;
    }
    return s;
  }

  it('agir não encerra o turno: o deslocamento que sobrou continua disponível', () => {
    const a = unit('guerreiro', 'player', 3);
    const e = unit('guerreiro', 'enemy', 4);
    const s = flat([a], [e]);
    [a.x, a.y, e.x, e.y] = [2, 2, 6, 2];
    a.gauge = 99.99;
    expect(advance(s)).toBe(a);
    const budget = a.move;
    moveUnit(s, a, 5, 2);
    expect(s.turn.moveLeft).toBe(budget - 3);
    s.rng.reseed(1);
    expect(attack(s, a, 6, 2)).toBe(true);
    expect(s.turn.acted).toBe(true);
    expect(activeUnit(s)).toBe(a);
    const left = moveTargets(s, a);
    expect(left.length).toBeGreaterThan(0);
    const far = Math.max(...left.map((i) => Math.abs(xy(s.map, i)[0] - 5) + Math.abs(xy(s.map, i)[1] - 2)));
    expect(far).toBeLessThanOrEqual(budget - 3);
    moveUnit(s, a, 5, 2 + (budget - 3));
    expect(s.turn.moveLeft).toBe(0);
    expect(moveTargets(s, a)).toEqual([]);
  });

  it('esperar sem agir (andando ou não) deixa a próxima barra em 50%; agir zera', () => {
    const a = unit('guerreiro', 'player', 3);
    const s = flat([a], [unit('guerreiro', 'enemy', 4)]);
    a.gauge = 99.99;
    advance(s);
    endTurn(s);
    expect(a.gauge).toBe(MOVE_ONLY_GAUGE);
    a.gauge = 99.99;
    advance(s);
    defend(s, a);
    endTurn(s);
    expect(a.gauge).toBe(0);
  });
});

describe('prontidão', () => {
  function duel(caster: BattleUnit) {
    const e = unit('guerreiro', 'enemy', 4);
    const s = createBattle(setup(createEmptyMap(14, 14, 'planicie'), [caster], [e]));
    for (const t of s.map.tiles) {
      t.p = undefined;
      t.h = 1;
    }
    [caster.x, caster.y, e.x, e.y] = [1, 5, 12, 5];
    s.activeUid = caster.uid;
    s.turn = { moved: false, acted: false, startX: 1, startY: 5 };
    return { s, e };
  }

  it('com a arma: atira no primeiro inimigo que entra no alcance e o motor marca o passo', () => {
    const a = unit('arqueiro', 'player', 3);
    const { s, e } = duel(a);
    expect(setOverwatch(s, a)).toBe(true);
    endTurn(s);
    e.x = 1 + a.weaponRange + 3;
    s.activeUid = e.uid;
    s.turn = { moved: false, acted: false, startX: e.x, startY: e.y };
    moveUnit(s, e, a.weaponRange, 5);
    expect(s.moveShots).toHaveLength(1);
    expect(s.moveShots![0]!.uid).toBe(a.uid);
    expect(s.log.some((l) => l.includes('(prontidão) reage'))).toBe(true);
    expect(a.overwatch).toBe(false);
  });

  it('com magia: o MP é pago ao preparar; dispara a habilidade ou se desfaz no próximo turno', () => {
    const mk = () => {
      const c = makeCharacter(new Rng(8), { classId: 'mago', level: 10 });
      return unitFromCharacter(c, 'player');
    };
    const m = mk();
    const sk = m.skills.map((id) => DB.skills[id]!).find((d) => readyable({ ...d, id: d.id, mp: d.mp ?? 0 } as SkillLike))!;
    expect(sk).toBeDefined();
    const { s, e } = duel(m);
    const mp = m.mp;
    expect(setOverwatch(s, m, sk.id)).toBe(true);
    expect(m.mp).toBeLessThan(mp);
    expect(m.overwatchSkill).toBe(sk.id);
    endTurn(s);
    s.activeUid = e.uid;
    s.turn = { moved: false, acted: false, startX: e.x, startY: e.y };
    moveUnit(s, e, 7, 5);
    expect(s.moveShots?.[0]?.skill).toBe(sk.id);
    expect(s.log.some((l) => l.includes(`solta ${sk.name}`))).toBe(true);

    // Ninguém veio: a magia se desfaz no próximo turno e o MP não volta.
    const m2 = mk();
    const d2 = duel(m2);
    setOverwatch(d2.s, m2, sk.id);
    const after = m2.mp;
    endTurn(d2.s);
    m2.gauge = 99.99;
    d2.e.gauge = 0;
    advance(d2.s);
    expect(m2.overwatch).toBe(false);
    expect(m2.mp).toBe(after);
    expect(d2.s.log.some((l) => l.includes('se desfez'))).toBe(true);
  });
});

describe('ataque de oportunidade (corpo a corpo)', () => {
  function arena(attacker: BattleUnit, mover: BattleUnit) {
    const s = createBattle(setup(createEmptyMap(10, 10, 'planicie'), [mover], [attacker]));
    for (const t of s.map.tiles) {
      t.p = undefined;
      t.h = 1;
    }
    [mover.x, mover.y, attacker.x, attacker.y] = [4, 4, 5, 4];
    s.activeUid = mover.uid;
    s.turn = { moved: false, acted: false, startX: 4, startY: 4 };
    return s;
  }

  it('sair do alcance de um inimigo corpo a corpo provoca um golpe; o caminho avisa antes', () => {
    const g = unit('guerreiro', 'enemy', 4);
    const m = unit('mago', 'player', 5);
    const s = arena(g, m);
    const path = moveTargets(s, m).map((i) => xy(s.map, i)).find(([x, y]) => x === 1 && y === 4)!;
    expect(path).toBeDefined();
    expect(opportunityThreats(s, m, [[3, 4], [2, 4], [1, 4]])).toEqual([{ step: 0, uid: g.uid, x: 4, y: 4 }]);
    // Aproximar-se (entrar no alcance) não provoca.
    m.x = 2;
    expect(opportunityThreats(s, m, [[3, 4], [4, 4]])).toEqual([]);
    m.x = 4;
    moveUnit(s, m, 1, 4);
    expect(s.log.some((l) => l.includes('ataque de oportunidade'))).toBe(true);
    expect(s.moveShots?.[0]).toMatchObject({ uid: g.uid, step: 0, kind: 'opportunity' });
    expect(g.oaUsed).toBe(true);
  });

  it('um por turno de quem ataca; arqueiro (à distância) não dá', () => {
    const g = unit('guerreiro', 'enemy', 4);
    const m = unit('mago', 'player', 5);
    const s = arena(g, m);
    g.oaUsed = true;
    expect(opportunityThreats(s, m, [[3, 4]])).toEqual([]);
    const a = unit('arqueiro', 'enemy', 6);
    const s2 = arena(a, unit('mago', 'player', 7));
    const mover = s2.units.find((u) => u.team === 'player')!;
    expect(a.weaponRange).toBeGreaterThan(1);
    expect(opportunityThreats(s2, mover, [[3, 4]])).toEqual([]);
  });
});

describe('captura (render)', () => {
  it('humano adjacente com até 25% da vida pode ser rendido; fera não; corda e rede aumentam a chance', () => {
    const hero = unit('guerreiro', 'player', 3);
    const foe = unitFromEnemy(DB.enemies.bandido!, 3, new Rng(1));
    const beast = unitFromEnemy(DB.enemies.lobo_da_silvia!, 3, new Rng(2));
    const s = createBattle(setup(createEmptyMap(8, 8, 'planicie'), [hero], [foe, beast]));
    [hero.x, hero.y, foe.x, foe.y, beast.x, beast.y] = [3, 3, 4, 3, 3, 4];
    beast.hp = 1;
    expect(capturable(hero, foe)).toBe(false);
    foe.hp = Math.floor(foe.maxHp * 0.25);
    expect(capturable(hero, foe)).toBe(true);
    expect(capturable(hero, beast)).toBe(false);
    expect(captureChance(hero)).toBe(50);
    hero.items = ['rede', null, null];
    expect(captureChance(hero)).toBe(85);
    s.activeUid = hero.uid;
    s.turn = { moved: false, acted: false, startX: 3, startY: 3 };
    let tries = 0;
    while (foe.alive && tries++ < 20) {
      s.turn.acted = false;
      capture(s, hero, 4, 3);
    }
    expect(foe.captured).toBe(true);
    const r = buildResult(s, { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' });
    expect(r.captured?.[0]?.enemyId).toBe('bandido');
    expect(r.defeated).not.toContain('bandido');
  });
});

describe('peças de missão (Interagir, VIP, rodadas, início escondido)', () => {
  function mission(extra: Partial<BattleSetup>) {
    const a = unit('guerreiro', 'player', 3);
    const e = unit('guerreiro', 'enemy', 4);
    const s = createBattle({ ...setup(createEmptyMap(10, 10, 'planicie'), [a], [e]), ...extra });
    return { s, a, e };
  }

  it('resgate: VIP preso na cela não age; Interagir abre; se o VIP morre, a missão falha', () => {
    const vip = unit('mago', 'player', 9);
    const { s, a } = mission({ victory: { type: 'escape' }, stealthStart: true, objectives: [{ kind: 'cela', label: 'Abrir a cela', turns: 1 }], vip: { unit: vip, captive: true } });
    const cell = s.objectives![0]!;
    expect(vip.bound).toBe(true);
    expect(cell.releases).toBe(vip.uid);
    expect(a.hidden).toBe(true);
    [a.x, a.y] = [cell.x === 0 ? 1 : cell.x - 1, cell.y];
    s.activeUid = a.uid;
    s.turn = { moved: false, acted: false, startX: a.x, startY: a.y };
    expect(interactTargets(s, a)).toContain(idx(s.map, cell.x, cell.y));
    expect(interact(s, a, cell.x, cell.y)).toBe(true);
    expect(cell.done).toBe(true);
    expect(vip.bound).toBe(false);
    damage(s, vip, 9999, undefined, undefined);
    checkVictory(s);
    expect(s.outcome).toBe('defeat');
  });

  it('objetivos com várias ações; todos concluídos = vitória; tempo esgotado = derrota', () => {
    const { s, a } = mission({ victory: { type: 'interact' }, objectives: [{ kind: 'documentos', label: 'Roubar documentos', turns: 2 }] });
    const o = s.objectives![0]!;
    [a.x, a.y] = [o.x === 0 ? 1 : o.x - 1, o.y];
    s.activeUid = a.uid;
    s.turn = { moved: false, acted: false, startX: a.x, startY: a.y };
    interact(s, a, o.x, o.y);
    expect(o.done).toBe(false);
    s.turn.acted = false;
    interact(s, a, o.x, o.y);
    expect(o.done).toBe(true);
    expect(s.outcome).toBe('victory');
    const t = mission({ victory: { type: 'interact' }, roundLimit: 2, objectives: [{ kind: 'bau', label: 'Baú', turns: 1 }] });
    t.s.round = 3;
    checkVictory(t.s);
    expect(t.s.outcome).toBe('defeat');
  });
});
