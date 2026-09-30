import { skill } from '../data';
import { hasLos } from '../battle/los';
import {
  BASIC_ATTACK,
  areaOf,
  canCast,
  inRange,
  isFree,
  opponents,
  previewHit,
  reachable,
  skillRange,
  type SkillLike,
} from './engine';
import { unitAt } from './elements';
import { idx, manhattan, xy } from './map';
import type { BattleState, BattleUnit } from './types';

export interface AiPlan {
  moveTo: [number, number] | null;
  action: { kind: 'attack' | 'skill'; skill: SkillLike; x: number; y: number } | { kind: 'defend' } | null;
}

function expectedDamage(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): number {
  let total = 0;
  for (const [tx, ty] of areaOf(state, u, s, x, y)) {
    const t = unitAt(state, tx, ty);
    if (!t || t === u) continue;
    if (s.kind === 'heal') {
      if (t.team === u.team) total += Math.min(t.maxHp - t.hp, s.power + u.attrs.int) * 1.2;
      continue;
    }
    const kind = s.id === 'ataque' ? 'basic' : s.kind;
    const p = previewHit(state, u, t, kind, s.power, s.element, s.accuracy ?? 0, 1);
    const dmg = ((p.min + p.max) / 2) * (p.chance / 100);
    const kill = dmg >= t.hp ? 25 : 0;
    total += t.team === u.team ? -dmg * 1.5 : dmg + kill + (t.isTarget ? 0 : 0);
  }
  return total;
}

/** Decide movimento + ação para uma unidade controlada pela IA. */
export function planTurn(state: BattleState, u: BattleUnit): AiPlan {
  const targets = opponents(state, u).filter((o) => !o.hidden);
  const options: SkillLike[] = [BASIC_ATTACK, ...u.skills.map((id) => skill(id) as SkillLike).filter((s) => canCast(u, s) && s.kind !== 'buff' && s.kind !== 'utility')];
  const reach = reachable(state, u);
  const tiles = [...reach.cost.keys()].filter((i) => {
    const [x, y] = xy(state.map, i);
    return isFree(state, x, y, u);
  });
  const ox = u.x;
  const oy = u.y;
  let best: { score: number; plan: AiPlan } = { score: -Infinity, plan: { moveTo: null, action: null } };
  for (const ti of tiles) {
    const [tx, ty] = xy(state.map, ti);
    u.x = tx;
    u.y = ty;
    const moveCost = reach.cost.get(ti) ?? 0;
    for (const s of options) {
      const range = skillRange(u, s);
      const candidates: [number, number][] = [];
      if (s.kind === 'heal') {
        for (const a of state.units) if (a.alive && a.team === u.team && a.hp < a.maxHp * 0.6) candidates.push([a.x, a.y]);
      } else for (const t of targets) candidates.push([t.x, t.y]);
      for (const [cx, cy] of candidates) {
        if (s.shape === 'line') {
          if (!(cx === tx || cy === ty) || manhattan(tx, ty, cx, cy) > range) continue;
        } else if (!inRange(state, u, range, cx, cy, s.kind === 'heal' ? 0 : 1)) continue;
        const score = expectedDamage(state, u, s, cx, cy) - moveCost * 0.2 - s.mp * 0.1 + (u.weaponRange > 1 ? manhattan(tx, ty, cx, cy) * 0.3 : 0);
        if (score > best.score) {
          best = {
            score,
            plan: { moveTo: tx === ox && ty === oy ? null : [tx, ty], action: { kind: s.id === 'ataque' ? 'attack' : 'skill', skill: s, x: cx, y: cy } },
          };
        }
      }
    }
  }
  u.x = ox;
  u.y = oy;
  if (best.plan.action && best.score > 0) return best.plan;
  // Sem ataque possível: aproxima-se do alvo mais próximo (e, se possível, com linha de visão).
  const nearest = targets.sort((a, b) => manhattan(u.x, u.y, a.x, a.y) - manhattan(u.x, u.y, b.x, b.y))[0];
  if (!nearest) return { moveTo: null, action: { kind: 'defend' } };
  let bestTile: [number, number] | null = null;
  let bestD = manhattan(u.x, u.y, nearest.x, nearest.y);
  for (const ti of tiles) {
    const [tx, ty] = xy(state.map, ti);
    const d = manhattan(tx, ty, nearest.x, nearest.y) - (hasLos(state.map, tx, ty, nearest.x, nearest.y) ? 0.5 : 0);
    if (d < bestD) {
      bestD = d;
      bestTile = [tx, ty];
    }
  }
  void idx;
  return { moveTo: bestTile, action: bestTile ? null : { kind: 'defend' } };
}
