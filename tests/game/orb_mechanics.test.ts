import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { environmentTick, driftSmoke } from '@game/battle/elements';
import { attack, castSkill, createBattle, endTurn, moveBudget, moveUnit, previewHit, resolveAttack, type SkillLike } from '@game/battle/engine';
import { createEmptyMap, tileAt } from '@game/battle/map';
import type { BattleSetup, BattleState, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { makeCharacter } from '@game/rules/recruit';

/** Herói com as habilidades de orbe dadas (como se tivesse os orbes equipados). */
function hero(skills: string[], seed = 1): BattleUnit {
  const c = makeCharacter(new Rng(seed), { classId: 'guerreiro', level: 20 });
  c.skills = [];
  const u = unitFromCharacter(c, 'player');
  u.skills.push(...skills);
  u.orbs = Object.fromEntries(skills.map((s) => [s, DB.skills[s]?.element ?? 'neutro']));
  return u;
}

function foe(id = 'lobo_da_silvia', level = 10): BattleUnit {
  return unitFromEnemy(DB.enemies[id]!, level, new Rng(2));
}

function battle(players: BattleUnit[], enemies: BattleUnit[], ambush = false): BattleState {
  const setup: BattleSetup = { map: createEmptyMap(12, 12, 'planicie'), players, enemies, victory: { type: 'eliminate' }, ambush, canFlee: true, seed: 11, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } };
  const s = createBattle(setup);
  s.units.forEach((u, i) => {
    u.x = 1 + i * 2;
    u.y = 1;
  });
  return s;
}

function turnOf(s: BattleState, u: BattleUnit): void {
  s.activeUid = u.uid;
  s.turn = { moved: false, acted: false, startX: u.x, startY: u.y };
}

const sk = (id: string) => DB.skills[id]! as SkillLike;

describe('orbes: dados', () => {
  it('toda criatura (menos invocações) tem orbe de habilidade com uma habilidade dela', () => {
    for (const c of Object.values(DB.creatures)) {
      if (!c.drops) continue;
      const j = c.drops.jewel;
      expect(j.type, c.id).toBe('habilidade');
      expect(c.skills.some((s) => s.id === j.skill), c.id).toBe(true);
    }
  });
});

describe('orbes: mecânicas novas', () => {
  it('ação sem custo: Salto Solar não gasta a ação, nem antes nem depois de agir', () => {
    const u = hero(['salto_solar']);
    const s = battle([u], [foe()]);
    turnOf(s, u);
    s.turn.acted = true;
    expect(castSkill(s, u, sk('salto_solar'), 6, 6)).toBe(true);
    expect([u.x, u.y]).toEqual([6, 6]);
    expect(s.turn.acted).toBe(true);
    turnOf(s, u);
    u.cooldowns = {};
    castSkill(s, u, sk('salto_solar'), 8, 8);
    expect(s.turn.acted).toBe(false);
  });

  it('Toxina Paralisante: só o próximo golpe envenena e deixa lento', () => {
    const u = hero(['toxina_paralisante']);
    const e = foe();
    const s = battle([u], [e]);
    const t = s.units[1]!;
    [t.x, t.y] = [u.x + 1, u.y];
    turnOf(s, u);
    castSkill(s, u, sk('toxina_paralisante'), u.x, u.y);
    expect(u.statuses.encantado).toBeGreaterThan(0);
    u.accuracy = 999;
    turnOf(s, u);
    attack(s, u, t.x, t.y);
    expect(t.statuses.lento).toBeGreaterThan(0);
    expect(t.statuses.envenenado).toBeGreaterThan(0);
    expect(u.statuses.encantado).toBeUndefined();
  });

  it('Cortina Fétida: gás que cega quem está dentro (menos quem lançou) e anda com o turno de quem lançou', () => {
    const u = hero(['cortina_fetida']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    [u.x, u.y, e.x, e.y] = [5, 5, 6, 5];
    turnOf(s, u);
    castSkill(s, u, sk('cortina_fetida'), u.x, u.y);
    expect(tileAt(s.map, 5, 5)!.c).toBe('gas_fetido');
    delete e.statuses.cegado;
    environmentTick(s);
    expect(e.statuses.cegado).toBeGreaterThan(0);
    expect(u.statuses.cegado).toBeUndefined();
    const before = s.map.tiles.filter((t) => t.c === 'gas_fetido').length;
    driftSmoke(s, u);
    expect(s.map.tiles.filter((t) => t.c === 'gas_fetido').length).toBeLessThanOrEqual(before);
  });

  it('Predador da Lua: aura que acompanha o lobo; dentro dela ele não erra pela névoa e ganha +50% de crítico', () => {
    const u = hero(['predador_da_lua']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    [u.x, u.y, e.x, e.y] = [5, 5, 5, 8];
    turnOf(s, u);
    const plain = previewHit(s, u, e, 'basic', 0);
    castSkill(s, u, sk('predador_da_lua'), u.x, u.y);
    expect(tileAt(s.map, 5, 5)!.c).toBe('nevoa_lunar');
    const inMist = previewHit(s, u, e, 'basic', 0);
    expect(inMist.obscured).toBeFalsy();
    expect(inMist.crit).toBe(Math.min(100, plain.crit + 50));
    // O inimigo atirando no lobo dentro da névoa sofre a penalidade.
    expect(previewHit(s, e, u, 'basic', 0).obscured).toBe(true);
    // Acompanha: no próximo turno, a aura se refaz em volta dele.
    [u.x, u.y] = [9, 9];
    driftSmoke(s, u);
    expect(tileAt(s.map, 9, 9)!.c).toBe('nevoa_lunar');
    expect(tileAt(s.map, 5, 5)!.c).toBeFalsy();
  });

  it('Veneno Mortal mata quando acaba; antídoto cura; lendário é imune', async () => {
    const { applyStatus, onStatusExpired } = await import('@game/battle/creature_fx');
    const u = hero([]);
    const s = battle([u], [foe(), foe('cryon', 40)]);
    const [e, legend] = [s.units[1]!, s.units[2]!];
    expect(applyStatus(s, legend, { id: 'condenado', turns: 3 }, u)).toBe(false);
    expect(applyStatus(s, e, { id: 'condenado', turns: 3 }, u)).toBe(true);
    delete e.statuses.condenado;
    onStatusExpired(s, e, 'condenado');
    expect(e.alive).toBe(false);
    expect(DB.items.antidoto!.use!.cure).toContain('condenado');
  });

  it('Olhar Hipnótico só pega quem está olhando para quem usou', () => {
    const u = hero(['olhar_hipnotico']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    [u.x, u.y, e.x, e.y] = [3, 3, 6, 3];
    e.facing = 0; // olhando para +x (de costas)
    turnOf(s, u);
    castSkill(s, u, sk('olhar_hipnotico'), e.x, e.y);
    expect(e.statuses.atordoado).toBeUndefined();
    e.facing = 2; // olhando para -x (para ela)
    u.cooldowns = {};
    for (let i = 0; i < 20 && !e.statuses.atordoado; i++) {
      u.cooldowns = {};
      castSkill(s, u, sk('olhar_hipnotico'), e.x, e.y);
    }
    expect(e.statuses.atordoado).toBeGreaterThan(0);
  });

  it('Salto Cortante: corre em linha até o tile e rasga quem estiver no caminho', () => {
    const u = hero(['salto_cortante']);
    const s = battle([u], [foe(), foe()]);
    const [a, b] = [s.units[1]!, s.units[2]!];
    [u.x, u.y, a.x, a.y, b.x, b.y] = [1, 5, 3, 5, 9, 9];
    u.accuracy = 999;
    const hp = a.hp;
    turnOf(s, u);
    castSkill(s, u, sk('salto_cortante'), 6, 5);
    expect([u.x, u.y]).toEqual([6, 5]);
    expect(a.hp).toBeLessThan(hp);
  });

  it('Passo Invernal: ponte de gelo em escada; ao derreter, quem está em cima cai e se fere', () => {
    const u = hero(['passo_invernal']);
    const s = battle([u], [foe()]);
    [u.x, u.y] = [2, 5];
    const h0 = tileAt(s.map, 4, 5)!.h;
    turnOf(s, u);
    castSkill(s, u, sk('passo_invernal'), 4, 5);
    expect(tileAt(s.map, 4, 5)!.h).toBe(h0 + 1);
    expect(tileAt(s.map, 5, 5)!.h).toBe(h0 + 2);
    const e = s.units[1]!;
    [e.x, e.y] = [5, 5];
    const hp = e.hp;
    for (let i = 0; i < 3; i++) environmentTick(s);
    expect(tileAt(s.map, 5, 5)!.h).toBe(h0);
    expect(e.hp).toBeLessThan(hp);
  });

  it('Veloz (Raposa-do-Líquen): sair do lado de um inimigo não provoca ataque de oportunidade', () => {
    const u = hero(['passo_veloz']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    [u.x, u.y, e.x, e.y] = [5, 5, 6, 5];
    turnOf(s, u);
    const hp = u.hp;
    moveUnit(s, u, 2, 5);
    expect(u.hp).toBe(hp);
    expect(s.log.some((l) => l.includes('ataque de oportunidade'))).toBe(false);
  });

  it('Audição Aguçada: o esquadrão não sofre emboscada', () => {
    const s = battle([hero(['audicao_agucada'])], [foe()], true);
    expect(s.ambush).toBe(false);
    expect(s.log.some((l) => l.includes('emboscada falhou'))).toBe(true);
  });

  it('Runas de Proteção: imune a dano mágico', () => {
    const u = hero(['runas_de_protecao']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    turnOf(s, u);
    castSkill(s, u, sk('runas_de_protecao'), u.x, u.y);
    expect(s.turn.acted).toBe(false);
    expect(previewHit(s, e, u, 'magic', 5).max).toBe(0);
    expect(previewHit(s, e, u, 'basic', 0).max).toBeGreaterThan(0);
  });

  it('Confuso pode acertar quem está ao lado do alvo (aliados também)', () => {
    const u = hero([]);
    const ally = hero([], 5);
    const s = battle([u, ally], [foe()]);
    const e = s.units[2]!;
    [u.x, u.y, e.x, e.y, ally.x, ally.y] = [3, 3, 4, 3, 4, 4];
    u.statuses.confuso = 9;
    u.accuracy = 999;
    for (let i = 0; i < 40 && !s.log.some((l) => l.includes('confuso, acerta')); i++) resolveAttack(s, u, e, 'basic', 0, undefined, 0, 1);
    expect(s.log.some((l) => l.includes(`confuso, acerta ${ally.name}`))).toBe(true);
  });

  it('Frenesi Sangrento: alvo quase morto devolve barra de ação', () => {
    const u = hero(['frenesi_sangrento']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    [e.x, e.y] = [u.x + 1, u.y];
    // Muita vida máxima e 10% dela: sobrevive ao golpe e fica abaixo de 30%.
    e.maxHp = 9999;
    e.hp = 1000;
    u.accuracy = 999;
    turnOf(s, u);
    castSkill(s, u, sk('frenesi_sangrento'), e.x, e.y);
    endTurn(s);
    expect(u.gauge).toBeGreaterThan(0);
  });

  it('Barreira Rúnica de Gelo: anula tiro e ergue parede de gelo', () => {
    const u = hero(['barreira_runica_de_gelo']);
    const archer = unitFromCharacter(makeCharacter(new Rng(9), { classId: 'arqueiro', level: 20 }), 'enemy');
    const s = battle([u], [archer]);
    const a = s.units[1]!;
    [u.x, u.y, a.x, a.y] = [3, 5, 8, 5];
    a.accuracy = 999;
    const hp = u.hp;
    resolveAttack(s, a, u, 'basic', 0, undefined, 0, 1);
    expect(u.hp).toBe(hp);
    expect(tileAt(s.map, 4, 5)!.p).toBe('rocha');
  });

  it('Perseguição Implacável: quem foge dá metros ao lobo', () => {
    const u = hero(['perseguicao_implacavel']);
    const s = battle([u], [foe()]);
    const e = s.units[1]!;
    [u.x, u.y, e.x, e.y] = [5, 5, 6, 5];
    const base = moveBudget(u);
    turnOf(s, e);
    e.hp = e.maxHp = 9999;
    moveUnit(s, e, 10, 5);
    expect(moveBudget(u)).toBeGreaterThan(base);
  });

  it('Salto Aprimorado: pula até 5 de altura', () => {
    const s = battle([hero(['salto_aprimorado'])], [foe()]);
    expect(s.units[0]!.jump).toBeGreaterThanOrEqual(5);
  });

  it('Carapaça de Bisão: tiro pela frente fere menos que pelas costas', () => {
    const archer = unitFromCharacter(makeCharacter(new Rng(9), { classId: 'arqueiro', level: 20 }), 'player');
    const s = battle([archer], [foe('touro_galo', 10)]);
    const [a, touro] = [s.units[0]!, s.units[1]!];
    [a.x, a.y, touro.x, touro.y] = [2, 5, 6, 5];
    touro.facing = 2; // olhando para o arqueiro
    const front = previewHit(s, a, touro, 'basic', 0).max;
    touro.facing = 0; // de costas
    const back = previewHit(s, a, touro, 'basic', 0).max;
    expect(front).toBeLessThan(back);
  });

  it('Camuflagem de Folhas: some ao encostar num arbusto', () => {
    const u = hero(['camuflagem_de_folhas']);
    const s = battle([u], [foe()]);
    [u.x, u.y] = [3, 8];
    tileAt(s.map, 5, 9)!.p = 'arbusto';
    s.units[1]!.x = 11;
    s.units[1]!.y = 1;
    turnOf(s, u);
    moveUnit(s, u, 5, 8);
    expect(u.hidden).toBe(true);
  });

  it('Flash Ofuscante cega os inimigos ao redor e poupa os aliados', () => {
    const u = hero(['flash_ofuscante']);
    const ally = hero([], 3);
    const s = battle([u, ally], [foe()]);
    const e = s.units[2]!;
    [u.x, u.y, ally.x, ally.y, e.x, e.y] = [5, 5, 5, 6, 6, 5];
    turnOf(s, u);
    for (let i = 0; i < 10 && !e.statuses.cegado; i++) {
      u.cooldowns = {};
      castSkill(s, u, sk('flash_ofuscante'), u.x, u.y);
    }
    expect(e.statuses.cegado).toBeGreaterThan(0);
    expect(ally.statuses.cegado).toBeUndefined();
  });
});
