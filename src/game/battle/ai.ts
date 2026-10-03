import { DB, skill, type SkillDef } from '../data';
import { hasLos } from '../battle/los';
import { BALANCE, healPower } from '../rules/stats';
import {
  BASIC_ATTACK,
  areaOf,
  attack,
  castSkill,
  defend,
  endTurn,
  inRange,
  isFree,
  moveUnit,
  opponents,
  previewHit,
  reachable,
  skillRange,
  skillUsable,
  type SkillLike,
} from './engine';
import { canStrike, isDebuff, isFera, passiveFx } from './creature_fx';
import { unitAt } from './elements';
import { DIRS, isWalkable, manhattan, tileAt } from './map';
import { cellPos, setLevel, unitCell } from './stack';
import type { BattleState, BattleUnit, StatusId } from './types';

/** Peso das habilidades frente ao ataque básico (as feras não ficam só lançando habilidades). */
const AI_SKILL_BIAS = BALANCE.rules.aiSkillBias;

export interface AiPlan {
  moveTo: [number, number] | null;
  /** Andar de destino (prédios); ausente = o mais barato na coluna. */
  moveLevel?: number;
  action: { kind: 'attack' | 'skill'; skill: SkillLike; x: number; y: number } | { kind: 'defend' } | null;
}

const OFFENSIVE = new Set(['physical', 'ranged', 'magic']);

function seesHidden(u: BattleUnit): boolean {
  return passiveFx(u).some((f) => f.seeHidden);
}

/** Peso de cada status para a IA (multiplicado por 10 + nível do alvo). */
const STATUS_WEIGHT: Partial<Record<StatusId, number>> = {
  atordoado: 1.5,
  aprisionado: 1.5,
  congelado: 1.3,
  medo: 1.1,
  desarmado: 1.0,
  silenciado: 0.9,
  preso: 0.9,
  imobilizado: 0.8,
  marcado: 0.8,
  sangramento: 0.6,
  envenenado: 0.6,
  queimando: 0.6,
  confuso: 0.6,
  cegado: 0.6,
  lento: 0.5,
  derrubado: 0.5,
  quebrado: 0.6,
  enfraquecido: 0.6,
  ferida_aberta: 0.4,
  sem_itens: 0.4,
};

function statusValue(t: BattleUnit, st: { id: string } | undefined): number {
  if (!st || t.statuses[st.id as StatusId]) return 0;
  const w = STATUS_WEIGHT[st.id as StatusId] ?? (isDebuff(st.id) ? 0.4 : 0);
  // Silêncio pesa pouco contra quem não tem habilidades; medo/desarme contra quem não ataca.
  const relevance = st.id === 'silenciado' && !t.skills.length ? 0.2 : 1;
  return w * relevance * (10 + t.level);
}

/** Valor esperado de usar `s` mirando (x, y) a partir da posição atual de `u`. */
function expectedValue(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): number {
  const def: SkillDef | undefined = DB.skills[s.id];
  const fxd = def?.fx ?? {};
  const fera = isFera(s);
  let victims: BattleUnit[];
  if (fxd.randomTargets) {
    const pool = opponents(state, u).filter((o) => !o.hidden || seesHidden(u));
    victims = pool.slice(0, Math.min(pool.length, fxd.randomTargets));
  } else victims = areaOf(state, u, s, x, y).map(([tx, ty]) => unitAt(state, tx, ty)).filter((t): t is BattleUnit => !!t && t !== u);
  let total = 0;
  const weak = passiveFx(u).some((f) => f.focusWeak);
  for (const t of victims) {
    if (fxd.noDamage && t.team !== u.team) {
      const pull = fxd.pull || fxd.push ? 3 : 0;
      total += (statusValue(t, s.status) + (fxd.also ?? []).reduce((a, st) => a + statusValue(t, st), 0)) * 0.8 + (fxd.mpBurn && t.mp > 0 ? 5 : 0) + pull;
      continue;
    }
    if (s.kind === 'heal') {
      if (t.team === u.team) total += Math.min(t.maxHp - t.hp, healPower(u.attrs, u.healBonus, s.power, u.level, s.scaling)) * 1.2;
      continue;
    }
    if (t.team === u.team) {
      // Fogo amigo: acertar um aliado custa o dano que ele levaria (e mais se o derrubar).
      const p = previewHit(state, u, t, s.id === 'ataque' ? 'basic' : s.kind, s.power, s.element, s.accuracy ?? 0, 1, s);
      const dmg = ((p.min + p.max) / 2) * (p.chance / 100);
      total -= dmg * 1.5 + (dmg >= t.hp ? 40 : 0) + (fera ? 0 : 5);
      continue;
    }
    const kind = s.id === 'ataque' ? 'basic' : s.kind;
    const p = previewHit(state, u, t, kind, s.power, s.element, s.accuracy ?? 0, 1, s);
    const hits = fxd.hits ?? 1;
    const dmg = ((p.min + p.max) / 2) * (p.chance / 100) * hits;
    total += dmg + (dmg >= t.hp ? 25 : 0) + (weak ? (1 - t.hp / t.maxHp) * 20 : 0) + (p.chance > 0 ? statusValue(t, s.status) + (fxd.also ?? []).reduce((a, st) => a + statusValue(t, st), 0) : 0);
  }
  return total;
}

/** Candidatos de mira para uma habilidade a partir de (ux, uy). */
function aimPoints(state: BattleState, u: BattleUnit, s: SkillLike, targets: BattleUnit[]): [number, number][] {
  const range = skillRange(u, s);
  const out: [number, number][] = [];
  if (s.target === 'self' || DB.skills[s.id]?.fx?.randomTargets) return [[u.x, u.y]];
  if (s.shape === 'cone' || s.shape === 'line') {
    for (const [dx, dy] of DIRS) out.push([u.x + dx, u.y + dy]);
    if (s.shape === 'line') for (const t of targets) if ((t.x === u.x || t.y === u.y) && manhattan(u.x, u.y, t.x, t.y) <= range) out.push([t.x, t.y]);
    return out;
  }
  if (s.kind === 'heal' || s.kind === 'buff') {
    for (const a of state.units) if (a.alive && a.team === u.team && inRange(state, u, range, a.x, a.y, 0)) out.push([a.x, a.y]);
    return out;
  }
  for (const t of targets) if (inRange(state, u, range, t.x, t.y, s.target === 'tile' ? 1 : 1)) out.push([t.x, t.y]);
  return out;
}

function selfPlan(state: BattleState, u: BattleUnit, usable: SkillLike[], enemiesNear: boolean): AiPlan | null {
  const act = (s: SkillLike, x = u.x, y = u.y): AiPlan => ({ moveTo: null, action: { kind: 'skill', skill: s, x, y } });
  for (const s of usable) {
    const f = DB.skills[s.id]?.fx ?? {};
    if (f.summon && enemiesNear) return act(s);
    if ((f.special === 'storm_eye' || f.special === 'hourglass' || f.link) && enemiesNear) return act(s);
  }
  const debuffs = Object.keys(u.statuses).filter(isDebuff).length;
  for (const s of usable) {
    const f = DB.skills[s.id]?.fx ?? {};
    if (s.kind !== 'utility' && s.kind !== 'heal' && s.kind !== 'buff') continue;
    if (f.hide && u.hp < u.maxHp * 0.6) return act(s);
    if (f.cleanse && debuffs >= 1 && s.kind === 'utility') return act(s);
    if ((f.shield || f.healPct) && u.hp < u.maxHp * 0.5 && s.target === 'self') return act(s);
    if (f.self && !u.statuses[f.self.id as StatusId] && enemiesNear && !f.hide && !f.teleport) return act(s);
    if (s.kind === 'heal') {
      const hurt = state.units.find((a) => a.alive && a.team === u.team && a.hp < a.maxHp * 0.6 && inRange(state, u, Math.max(0, skillRange(u, s)), a.x, a.y, 0));
      if (hurt) return s.target === 'self' ? act(s) : act(s, hurt.x, hurt.y);
    }
    if (s.kind === 'buff' && enemiesNear && s.status) {
      const area = s.target === 'self' ? areaOf(state, u, s, u.x, u.y) : [[u.x, u.y] as [number, number]];
      const gain = area.map(([x, y]) => unitAt(state, x, y)).filter((a) => a && a.team === u.team && !a.statuses[s.status!.id as StatusId]).length;
      if (gain >= 1) return act(s);
    }
  }
  return null;
}

function fleePlan(state: BattleState, u: BattleUnit): AiPlan {
  const reach = reachable(state, u);
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (const i of reach.cost.keys()) {
    const [x, y] = cellPos(state.map, i);
    if (!isFree(state, x, y, u)) continue;
    const score = Math.min(...opponents(state, u).map((o) => manhattan(x, y, o.x, o.y)), 99);
    if (score > bestScore) {
      bestScore = score;
      best = [x, y];
    }
  }
  return { moveTo: best && (best[0] !== u.x || best[1] !== u.y) ? best : null, action: { kind: 'defend' } };
}

/** Decide movimento + ação para uma unidade controlada pela IA. */
export function planTurn(state: BattleState, u: BattleUnit): AiPlan {
  if (u.statuses.medo) return fleePlan(state, u);
  const all = u.skills.map((id) => skill(id) as SkillLike).filter((s) => !DB.skills[s.id]?.passive && skillUsable(state, u, s));
  let targets = opponents(state, u).filter((o) => !o.hidden || seesHidden(u));
  // Provocado: só ataca quem provocou.
  const taunter = u.statuses.provocado ? targets.find((o) => o.uid === u.fx?.taunt) : undefined;
  if (taunter) targets = [taunter];
  const nearest = Math.min(99, ...targets.map((t) => manhattan(u.x, u.y, t.x, t.y)));
  const self = selfPlan(state, u, all, nearest <= u.move + 4);
  if (self) return self;

  const options: SkillLike[] = [
    ...(canStrike(u) ? [BASIC_ATTACK] : []),
    ...all.filter((s) => OFFENSIVE.has(s.kind) || (s.kind === 'heal' && !isFera(s))),
  ];
  const reach = reachable(state, u);
  const tiles = [...reach.cost.keys()].filter((i) => {
    const [x, y] = cellPos(state.map, i);
    return isFree(state, x, y, u);
  });
  const ox = u.x;
  const oy = u.y;
  const oz = u.z;
  const ocell = unitCell(state.map, u);
  let best: { score: number; plan: AiPlan } = { score: -Infinity, plan: { moveTo: null, action: null } };
  for (const ti of tiles) {
    const [tx, ty, tl] = cellPos(state.map, ti);
    u.x = tx;
    u.y = ty;
    setLevel(state.map, u, tl);
    const moveCost = reach.cost.get(ti) ?? 0;
    for (const s of options) {
      if (DB.skills[s.id]?.fx?.randomTargets && (tx !== ox || ty !== oy)) continue;
      for (const [cx, cy] of aimPoints(state, u, s, targets)) {
        const ranged = s.id === 'ataque' ? u.weaponRange > 1 : skillRange(u, s) > 1;
        const kite = ranged ? Math.min(...targets.map((t) => manhattan(tx, ty, t.x, t.y)), 6) * 0.3 : 0;
        // Habilidades valem um pouco menos que o ataque básico: só compensam quando são claramente melhores.
        const bias = s.id === 'ataque' ? 1 : AI_SKILL_BIAS;
        const score = expectedValue(state, u, s, cx, cy) * bias - moveCost * 0.2 - s.mp * 0.1 + kite;
        if (score > best.score) {
          best = {
            score,
            plan: { moveTo: ti === ocell ? null : [tx, ty], moveLevel: tl, action: { kind: s.id === 'ataque' ? 'attack' : 'skill', skill: s, x: cx, y: cy } },
          };
        }
      }
    }
  }
  u.x = ox;
  u.y = oy;
  u.z = oz;
  if (oz === undefined) delete u.z;
  if (best.plan.action && best.score > 0) return best.plan;
  const goal = [...targets].sort((a, b) => manhattan(u.x, u.y, a.x, a.y) - manhattan(u.x, u.y, b.x, b.y))[0];
  if (!goal) return { moveTo: null, action: { kind: 'defend' } };
  // Teleporte como deslocamento: salta para perto do alvo.
  const blink = all.find((s) => DB.skills[s.id]?.fx?.teleport);
  if (blink && manhattan(u.x, u.y, goal.x, goal.y) > u.move) {
    const range = skillRange(u, blink);
    let spot: [number, number] | null = null;
    for (const [dx, dy] of DIRS) {
      const x = goal.x + dx;
      const y = goal.y + dy;
      const t = tileAt(state.map, x, y);
      if (t && isWalkable(t) && isFree(state, x, y) && manhattan(u.x, u.y, x, y) <= range) spot = [x, y];
    }
    if (spot) return { moveTo: null, action: { kind: 'skill', skill: blink, x: spot[0], y: spot[1] } };
  }
  // Sem ataque possível: aproxima-se do alvo mais próximo (de preferência com linha de visão).
  let bestTile: [number, number] | null = null;
  let bestLevel: number | undefined;
  let bestD = manhattan(u.x, u.y, goal.x, goal.y);
  for (const ti of tiles) {
    const [tx, ty, tl] = cellPos(state.map, ti);
    const d = manhattan(tx, ty, goal.x, goal.y) - (hasLos(state.map, tx, ty, goal.x, goal.y) ? 0.5 : 0);
    if (d < bestD) {
      bestD = d;
      bestTile = [tx, ty];
      bestLevel = tl;
    }
  }
  return { moveTo: bestTile, moveLevel: bestLevel, action: bestTile ? null : { kind: 'defend' } };
}

/** Executa um turno completo da IA sem animação (testes, simulações, batalhas rápidas). */
export function runAiTurn(state: BattleState, u: BattleUnit): AiPlan {
  const plan = planTurn(state, u);
  if (plan.moveTo) moveUnit(state, u, plan.moveTo[0], plan.moveTo[1], plan.moveLevel);
  const a = plan.action;
  if (a && u.alive && !state.outcome) {
    if (a.kind === 'defend') defend(state, u);
    else if (a.kind === 'attack') attack(state, u, a.x, a.y);
    else castSkill(state, u, a.skill, a.x, a.y);
  }
  if (state.activeUid === u.uid) endTurn(state);
  return plan;
}
