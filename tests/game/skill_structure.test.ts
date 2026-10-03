import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB } from '@game/data';
import { makeCharacter } from '@game/rules/recruit';
import { learnSkill } from '@game/rules/character';
import { chainOf, lockReason, rankOf } from '@game/rules/skill_tree';
import * as stats from '@game/rules/stats';

const chains = () =>
  Object.values(DB.trees).flatMap((t) => t!.nodes.filter((n) => n.type !== 'base' && n.id !== 'elementalista').map((n) => ({ tree: t!, node: n, chain: chainOf(n) })));

/** Custo mínimo (pontos) da linha reta até a última habilidade da teia. */
function pathCost(len: number): number {
  let cost = 1; // a suprema no Nv 1
  for (let i = 1; i < len; i++) cost += stats.chainRankReq(i);
  return cost;
}

describe('estrutura das teias (auditoria)', () => {
  // Exceção pedida pelo design: no Trapper, a reação virou a passiva Gênio do Campo de Batalha.
  const NO_REACTION = new Set(['trapper']);

  it('toda teia tem exatamente uma reação, sempre na 5ª posição, e uma suprema no fim', () => {
    for (const { node, chain } of chains()) {
      const reacts = chain.map((s, i) => [s.kind, i] as const).filter(([k]) => k === 'reaction');
      expect(reacts, node.id).toEqual(NO_REACTION.has(node.id) ? [] : [['reaction', 4]]);
      expect(chain.filter((s) => s.ultimate).length, node.id).toBe(1);
      expect(chain[chain.length - 1]!.ultimate, node.id).toBe(true);
    }
  });

  it('a suprema pede NV 30 (evoluções e caminhos) ou 40 (híbridas)', () => {
    for (const { node, chain } of chains()) expect(chain[chain.length - 1]!.levelReq, node.id).toBe(node.type === 'hibrida' ? 40 : 30);
  });

  it('nomes únicos e nenhuma habilidade com mecânica idêntica a outra', () => {
    const names = new Map<string, string>();
    const sigs = new Map<string, string>();
    for (const { node, chain } of chains())
      for (const s of chain) {
        expect(names.get(s.name), `${s.name} repetido`).toBeUndefined();
        names.set(s.name, node.id);
        const { anim: _a, ...fx } = (s.fx ?? {}) as Record<string, unknown>;
        const sig = JSON.stringify([s.kind, s.shape, s.radius, s.element, s.status, fx, s.react]);
        expect(sigs.get(sig), `${s.name} repete ${sigs.get(sig)}`).toBeUndefined();
        sigs.set(sig, s.name);
      }
  });

  it('curva da teia: a linha reta até a suprema custa 28 pontos (10 habilidades) e 23 nos caminhos (9)', () => {
    expect(pathCost(10)).toBe(28);
    expect(pathCost(9)).toBe(23);
  });

  it('linha reta: a suprema só chega no nível 30, e chega nele sem esperar pontos', () => {
    const c = makeCharacter(new Rng(5), { classId: 'guerreiro', level: 1 });
    const chain = chainOf(DB.trees.guerreiro!.nodes.find((n) => n.id === 'berserker')!).map((s) => s.id);
    c.skills = [];
    c.skillRanks = {};
    c.skillPoints = 0;
    let reachedAt = 0;
    for (let lv = 1; lv <= 60 && !reachedAt; lv++) {
      c.level = lv;
      c.skillPoints = stats.totalSkillPoints(lv) - Object.values(c.skillRanks!).reduce((a, b) => a + b, 0);
      // Joga "em linha reta": aprende a próxima; se não der, fortalece a anterior.
      let progress = true;
      while (c.skillPoints > 0 && progress) {
        progress = false;
        const next = chain.find((id) => rankOf(c, id) === 0);
        if (next && lockReason(c, next) === null) progress = learnSkill(c, next);
        else {
          const prev = chain[chain.indexOf(next!) - 1];
          if (prev && rankOf(c, prev) < 5 && lockReason(c, prev) === null) progress = learnSkill(c, prev);
        }
      }
      if (c.skills.includes(chain[chain.length - 1]!)) reachedAt = lv;
    }
    expect(reachedAt).toBe(30);
  });

  it('nível 60 = 72 pontos: duas supremas e meia teia de outra (não três supremas)', () => {
    const total = stats.totalSkillPoints(60);
    expect(total).toBe(72);
    const ult = pathCost(10);
    expect(total).toBeGreaterThanOrEqual(2 * ult + Math.floor(ult / 2));
    expect(total).toBeLessThan(3 * ult);
    // Evolução + híbrida: a híbrida pede a 3ª habilidade da outra evolução (1 + 2 + 1 pontos).
    expect(total).toBeGreaterThanOrEqual(2 * ult + 4 + 9);
  });
});

import { buildLabel, shortNodeName } from '@game/rules/skill_tree';

describe('rótulo da build', () => {
  it('mostra onde os pontos foram gastos, da teia com mais pontos para a com menos', () => {
    const g = DB.trees.guerreiro!;
    const ids = (node: string) => chainOf(g.nodes.find((n) => n.id === node)!).map((s) => s.id);
    const [b1, b2] = ids('berserker');
    const [a1, a2] = ids('arcano');
    const [e1] = ids('escudeiro');
    const c = { classId: 'guerreiro' as const, skills: [b1!, b2!, a1!, a2!, e1!], skillRanks: { [b1!]: 3, [b2!]: 1, [a1!]: 2, [a2!]: 1, [e1!]: 2 } };
    expect(buildLabel(c)).toBe('Berserker 4 · E. Arcano 3 · Escudeiro 2');
    expect(buildLabel({ classId: 'clerigo', skills: [], skillRanks: {} })).toBe('Clérigo');
  });

  it('nomes curtos', () => {
    const name = (cls: string, id: string) => shortNodeName(DB.trees[cls as 'mago']!.nodes.find((n) => n.id === id)!);
    expect(name('guerreiro', 'mestre')).toBe('M. Batalha');
    expect(name('mago', 'fogo')).toBe('Fogo');
    expect(name('clerigo', 'guardiao_fe')).toBe('G. Fé');
  });
});
