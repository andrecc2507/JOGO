import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { createBattle, damage } from '@game/battle/engine';
import { createEmptyMap, tileAt } from '@game/battle/map';
import type { BattleState, BattleUnit } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { planTurn, runAiTurn } from '@game/battle/ai';
import * as tactics from '@game/battle/tactics';
import * as confine from '@game/battle/confine';
import { makeCharacter } from '@game/rules/recruit';

function battle(enemyId = 'soldado_real'): { s: BattleState; hero: BattleUnit; foe: BattleUnit } {
  const hero = unitFromCharacter(makeCharacter(new Rng(1), { classId: 'mago', level: 5 }), 'player');
  const foe = unitFromEnemy(DB.enemies[enemyId]!, 8, new Rng(2));
  const s = createBattle({ map: createEmptyMap(16, 16, 'planicie'), players: [hero], enemies: [foe], victory: { type: 'eliminate' }, ambush: false, canFlee: true, seed: 3, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 't' } });
  const h = s.units.find((u) => u.team === 'player')!;
  const f = s.units.find((u) => u.team === 'enemy')!;
  s.activeUid = f.uid;
  return { s, hero: h, foe: f };
}

function turnOf(s: BattleState, u: BattleUnit): void {
  s.activeUid = u.uid;
  s.turn = { moved: false, acted: false, startX: u.x, startY: u.y, moveLeft: u.move };
}

describe('IA tática', () => {
  it('empurra do telhado quando compensa (gasta a ação no lugar do ataque)', () => {
    const { s, hero, foe } = battle();
    // Platô alto: herói na beirada, chão 7 níveis abaixo do lado de fora.
    for (let y = 4; y <= 8; y++) for (let x = 4; x <= 7; x++) tileAt(s.map, x, y)!.h = 8;
    [hero.x, hero.y] = [7, 6];
    [foe.x, foe.y] = [6, 6];
    foe.attrs.str = 60;
    // Sem MP e com um alvo duro de matar: a queda vale mais que o ataque básico.
    foe.mp = 0;
    hero.maxHp = hero.hp = 2000;
    turnOf(s, foe);
    expect(tactics.shovePreview(s, foe, hero).damage).toBeGreaterThan(0);
    const plan = planTurn(s, foe);
    expect(plan.action).toMatchObject({ kind: 'tactic', tactic: 'shove' });
    const hp = hero.hp;
    runAiTurn(s, foe);
    expect(hero.hp).toBeLessThan(hp);
  });

  it('atira no barril de pólvora ao lado dos heróis', () => {
    const { s, hero, foe } = battle('besteiro_real');
    [hero.x, hero.y] = [8, 8];
    const ally = unitFromCharacter(makeCharacter(new Rng(7), { classId: 'guerreiro', level: 5 }), 'player');
    [ally.x, ally.y] = [9, 9];
    s.units.push(ally);
    tileAt(s.map, 8, 9)!.p = 'barril_polvora';
    tileAt(s.map, 8, 9)!.pHp = 1;
    [foe.x, foe.y] = [8, 4];
    // Sem mana: a escolha é entre o ataque básico e a pólvora.
    foe.mp = 0;
    turnOf(s, foe);
    const plan = planTurn(s, foe);
    // Atira no barril ou o arremessa nos heróis: as duas jogadas usam a pólvora.
    expect(plan.action).toMatchObject({ kind: 'tactic' });
    expect(['shootProp', 'throw']).toContain((plan.action as { tactic: string }).tactic);
  });

  it('aliado controlado pela IA estabiliza herói caído', () => {
    const { s, hero, foe } = battle();
    const c = makeCharacter(new Rng(9), { classId: 'clerigo', level: 5 });
    const medic = unitFromCharacter(c, 'player');
    medic.ai = true;
    [medic.x, medic.y] = [3, 3];
    hero.charId ??= 'heroi';
    [hero.x, hero.y] = [4, 3];
    [foe.x, foe.y] = [14, 14];
    s.units.push(medic);
    hero.hp = 10;
    hero.shield = 0;
    hero.mp = 0;
    hero.skills = [];
    damage(s, hero, 25, undefined, undefined);
    expect(hero.downed).toBeGreaterThan(0);
    turnOf(s, medic);
    runAiTurn(s, medic);
    expect(hero.alive).toBe(true);
  });

  it('suprimido fica no lugar; alavanca abre o portão quando não há o que atacar', () => {
    const { s, hero, foe } = battle();
    [hero.x, hero.y] = [2, 2];
    [foe.x, foe.y] = [12, 12];
    foe.statuses.suprimido = 2;
    turnOf(s, foe);
    expect(planTurn(s, foe).moveTo).toBeNull();
    delete foe.statuses.suprimido;
    // Cerca o lobo com portões; a alavanca ao lado comanda o portão do norte.
    for (const [x, y] of [[11, 12], [13, 12]] as [number, number][]) tileAt(s.map, x, y)!.p = 'muro';
    tileAt(s.map, 12, 11)!.p = 'portao';
    tileAt(s.map, 12, 13)!.p = 'alavanca';
    tileAt(s.map, 12, 13)!.link = [12, 11];
    turnOf(s, foe);
    const plan = planTurn(s, foe);
    expect(plan.action).toMatchObject({ kind: 'tactic', tactic: 'scenery', x: 12, y: 13 });
  });

  it('lança o Selo de Confinamento para separar parte dos inimigos', () => {
    const { s, hero, foe } = battle();
    const c2 = unitFromCharacter(makeCharacter(new Rng(11), { classId: 'guerreiro', level: 5 }), 'player');
    const c3 = unitFromCharacter(makeCharacter(new Rng(12), { classId: 'clerigo', level: 5 }), 'player');
    s.units.push(c2, c3);
    [hero.x, hero.y] = [11, 11];
    [c2.x, c2.y] = [12, 11];
    [c3.x, c3.y] = [2, 2];
    [foe.x, foe.y] = [7, 9];
    foe.skills = ['selos_selo_de_confinamento'];
    foe.mp = foe.maxMp = 99;
    turnOf(s, foe);
    const plan = planTurn(s, foe);
    expect(plan.action).toMatchObject({ kind: 'skill' });
    runAiTurn(s, foe);
    const box = s.confines?.[0];
    expect(box).toBeDefined();
    expect(confine.inside(box!, hero.x, hero.y) && confine.inside(box!, c2.x, c2.y)).toBe(true);
    expect(confine.inside(box!, foe.x, foe.y)).toBe(false);
  });
});
