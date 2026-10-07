import type { Rng } from '@core';
import type { BattleSetup } from '../battle/types';
import { node, places } from './layout';
import { spawnForce } from './forces';
import { ensureVeil } from './veil';
import { OUTPOSTS, type OutpostKind } from './outposts';
import ACTS from '../data/world/acts.json';
import { actContract, actContracts, chapterOf, ensureActs, type Baron } from './acts_state';
import { averageLevel, type Campaign, type Contract } from './campaign';

/**
 * Ato 7 (caça aos Barões). Cada Barão domina um país com postos fortificados. Tomar um posto
 * vira um posto avançado de verdade do comandante e atrasa o Despertar (o Véu deste ato). O
 * Barão atacado guarda rancor e contra-ataca; matar um Barão deixa os outros mais fortes.
 */
const BA = ACTS.barons;

export function ensureBarons(c: Campaign): Baron[] {
  const a = ensureActs(c);
  if (!a.barons.length)
    for (const b of BA.list) {
      const cities = places().filter((n) => n.countryId === b.country && n.type === 'city').slice(0, BA.postsPerDomain);
      a.barons.push({ id: b.id, rage: 0, posts: cities.map((n) => n.id) });
    }
  return a.barons;
}

export function baronDef(id: string) {
  return BA.list.find((b) => b.id === id)!;
}

/** Dia do Ato 7: postos do Barão viram missões; Barão com rancor contra-ataca. */
export function baronsDay(c: Campaign, rng: Rng): string[] {
  if (chapterOf(c) !== 7) return [];
  const out: string[] = [];
  const open = new Set(actContracts(c, 'barao').map((ct) => ct.targetNode));
  for (const b of ensureBarons(c)) {
    if (b.dead) continue;
    const def = baronDef(b.id);
    for (const post of b.posts)
      if (!open.has(post))
        actContract(c, { title: `☠ Tomar o posto de ${def.name} em ${node(post).name}`, desc: 'Elimine a guarnição do Barão. O posto vira seu e o Despertar atrasa.', victory: 'eliminate', target: post, kind: 'barao', ref: b.id, levelBonus: 3 });
    if (b.rage >= BA.rageCounterAt) {
      b.rage = 0;
      const targets = Object.keys(c.outposts ?? {});
      const f = spawnForce(c, rng, 7, averageLevel(c) + 3, targets.length ? [rng.pick(targets)] : [c.baseNode], c.baseNode, 'exercito');
      if (f) out.push(`☠ ${def.name} contra-ataca: um exército marcha contra os seus postos.`);
    }
  }
  return out;
}

/** Posto do Barão tomado: vira posto avançado, atrasa o Despertar e enfurece o Barão. */
export function baronPostTaken(c: Campaign, ct: Contract): string[] {
  const b = ensureBarons(c).find((x) => x.id === ct.actOp?.ref);
  if (!b) return [];
  b.posts = b.posts.filter((p) => p !== ct.targetNode);
  b.rage += 1;
  (c.outposts ??= {})[ct.targetNode] = BA.postReward as OutpostKind;
  const v = ensureVeil(c);
  v.value = Math.max(0, v.value - BA.postDelay);
  return [`☠ Posto tomado: ${node(ct.targetNode).name} agora é um posto avançado (${OUTPOSTS.kinds[BA.postReward as OutpostKind].label}). O Despertar recua (${v.value}/100). ${baronDef(b.id).name} guarda rancor.`];
}

/** Missão da história de um Barão concluída: ele morre; os outros ficam mais fortes. */
export function baronKilled(c: Campaign, missionId: string): string[] {
  const def = BA.list.find((b) => b.mission === missionId);
  if (!def) return [];
  const barons = ensureBarons(c);
  const b = barons.find((x) => x.id === def.id)!;
  b.dead = true;
  for (const o of barons) if (!o.dead) o.rage += 1;
  for (const ct of actContracts(c, 'barao')) if (ct.actOp?.ref === b.id) ct.status = 'done';
  return [`☠ ${def.name} caiu. Os Barões que restam ficam mais perigosos.`];
}

/** Barões que já caíram deixam os outros mais fortes nas missões deles. */
export function baronSetup(c: Campaign, missionId: string, setup: BattleSetup): string | null {
  const def = BA.list.find((b) => b.mission === missionId);
  if (!def) return null;
  const killed = ensureBarons(c).filter((x) => x.dead).length;
  if (!killed) return null;
  for (const u of setup.enemies) {
    u.maxHp = Math.round(u.maxHp * (1 + BA.killedHp * killed));
    u.hp = u.startHp = u.maxHp;
  }
  return `${def.name} aprendeu com a queda dos outros (${killed}): inimigos mais resistentes.`;
}
