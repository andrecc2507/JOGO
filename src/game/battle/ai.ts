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
import { unitAt, unitsAt } from './elements';
import { DIRS, isWalkable, manhattan, tileAt } from './map';
import { cellPos, setLevel, unitCell, unitLevel } from './stack';
import { sealToBreak } from './confine';
import { bestShove, buildAim, confineAim, leverToPull, positionValue, tacticOptions, type TacticAction } from './ai_tactics';
import * as tactics from './tactics';
import * as downed from './downed';
import * as scenery from './scenery';
import * as patrol from './patrol';
import type { BattleState, BattleUnit, StatusId } from './types';

/** Peso das habilidades frente ao ataque básico (as feras não ficam só lançando habilidades). */
const AI_SKILL_BIAS = BALANCE.rules.aiSkillBias;

export interface AiPlan {
  moveTo: [number, number] | null;
  /** Andar de destino (prédios); ausente = o mais barato na coluna. */
  moveLevel?: number;
  action: { kind: 'attack' | 'skill'; skill: SkillLike; x: number; y: number } | { kind: 'defend' } | TacticAction | null;
  /** Empurrão (ação livre) feito depois de andar e antes da ação. */
  shove?: [number, number];
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
  suprimido: 0.7,
};

function statusValue(t: BattleUnit, st: { id: string } | undefined): number {
  if (!st || t.statuses[st.id as StatusId]) return 0;
  const w = STATUS_WEIGHT[st.id as StatusId] ?? (isDebuff(st.id) ? 0.4 : 0);
  // Silêncio pesa pouco contra quem não tem habilidades; medo/desarme contra quem não ataca.
  const relevance = st.id === 'silenciado' && !t.skills.length ? 0.2 : 1;
  // Vale como uma fatia da vida do alvo (o dano que ele deixa de causar), para não sumir diante do
  // dano das habilidades nos níveis altos.
  return w * relevance * Math.max(10 + t.level, t.maxHp * BALANCE.rules.aiStatusHpShare);
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
      // Dissipar vale pelos buffs que o alvo perde; queimar MP, pelo MP que ele tem.
      const buffs = fxd.dispel ? Object.keys(t.statuses).filter((k) => !isDebuff(k)).length * (10 + t.level) * 0.5 : 0;
      const burn = fxd.mpBurn && t.mp > 0 ? Math.min(t.mp, fxd.mpBurn) * 0.6 + 5 : 0;
      total += (statusValue(t, s.status) + (fxd.also ?? []).reduce((a, st) => a + statusValue(t, st), 0)) * 0.8 + burn + buffs + pull;
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
    let dmg = ((p.min + p.max) / 2) * (p.chance / 100) * hits;
    // O refém libertado não é a prioridade dos guardas: primeiro os soldados que vieram buscá-lo.
    if (t.vip) dmg *= 0.35;
    // Quem foge com o item roubado é o alvo número um.
    if (state.objectives?.some((o) => o.carrier === t.uid && !o.extracted)) dmg *= 1.5;
    // Execução: abaixo do limiar, o golpe mata.
    if (fxd.execute && t.hp <= t.maxHp * fxd.execute) dmg = Math.max(dmg, t.hp * (p.chance / 100));
    // Ricochete: o tiro salta para os inimigos perto do alvo.
    if (fxd.chain) {
      const near = opponents(state, u).filter((o) => o !== t && manhattan(o.x, o.y, t.x, t.y) <= 3).length;
      dmg += dmg * (fxd.chainMult ?? 0.7) * Math.min(fxd.chain, near);
    }
    // Supressão prende o alvo; empurrar/derrubar tira de posição.
    const control = p.chance > 0 ? (fxd.suppress ? statusValue(t, { id: 'suprimido' }) : 0) + (fxd.knock || fxd.push ? 3 : 0) : 0;
    total += dmg + (dmg >= t.hp ? 25 : 0) + (weak ? (1 - t.hp / t.maxHp) * 20 : 0) + control + (p.chance > 0 ? statusValue(t, s.status) + (fxd.also ?? []).reduce((a, st) => a + statusValue(t, st), 0) : 0);
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
    // Turno extra, comandar invocações e escudo pela vida perdida.
    if (f.extraTurn && !f.teleport && s.target === 'self' && enemiesNear) return act(s);
    if (f.commandSummons && state.units.some((o) => o.alive && o.summonedBy === u.uid)) return act(s);
    if (f.shieldFromLost && u.hp < u.maxHp * 0.5) return act(s);
    // Escudo num aliado ferido (ou em perigo) ao alcance.
    if (f.shield && s.target === 'ally') {
      const ally = state.units.find((a) => a.alive && a.team === u.team && a !== u && a.hp < a.maxHp * 0.6 && !a.shield && inRange(state, u, Math.max(0, skillRange(u, s)), a.x, a.y, 0));
      if (ally) return act(s, ally.x, ally.y);
    }
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

/** Vai até ao alcance do selo e o ataca. */
function breakSealPlan(state: BattleState, u: BattleUnit, [sx, sy]: [number, number]): AiPlan {
  const range = Math.max(1, u.weaponRange);
  const reach = reachable(state, u);
  let best: { c: number; cost: number } | null = null;
  for (const [c, cost] of reach.cost) {
    const [x, y, cl] = cellPos(state.map, c);
    if (!isFree(state, x, y, u, cl) && !(x === u.x && y === u.y)) continue;
    const d = manhattan(x, y, sx, sy);
    if (d < 1 || d > range) continue;
    if (!best || cost < best.cost) best = { c, cost };
  }
  if (!best) {
    // Longe demais: chega o mais perto possível.
    let near: { c: number; d: number } | null = null;
    for (const c of reach.cost.keys()) {
      const [x, y, cl] = cellPos(state.map, c);
      if (!isFree(state, x, y, u, cl)) continue;
      const d = manhattan(x, y, sx, sy);
      if (!near || d < near.d) near = { c, d };
    }
    if (!near) return { moveTo: null, action: { kind: 'defend' } };
    const [x, y, l] = cellPos(state.map, near.c);
    return { moveTo: [x, y], moveLevel: l, action: null };
  }
  const [x, y, l] = cellPos(state.map, best.c);
  const here = x === u.x && y === u.y;
  return { moveTo: here ? null : [x, y], moveLevel: l, action: { kind: 'attack', skill: BASIC_ATTACK, x: sx, y: sy } };
}

/**
 * Patrulha desavisada: anda devagar (até metade do deslocamento) e não ataca. O líder segue a rota
 * em ciclo e às vezes para e olha em volta; os outros vão atrás dele.
 */
function patrolPlan(state: BattleState, u: BattleUnit): AiPlan {
  const reach = reachable(state, u);
  const near = [...reach.cost.entries()].filter(([c, cost]) => cost > 0 && cost <= Math.ceil(u.move / 2) && isFree(state, ...(cellPos(state.map, c).slice(0, 2) as [number, number]), u, cellPos(state.map, c)[2]));
  let goal: [number, number] | undefined;
  if (u.route?.length) {
    let at = u.routeAt ?? 0;
    if (manhattan(u.x, u.y, ...u.route[at]!) <= 1) {
      at = (at + 1) % u.route.length;
      u.routeAt = at;
      // Chegou ao ponto: às vezes fica parado olhando em volta (uma brecha para passar).
      if (state.rng.chance(0.35)) {
        u.facing = state.rng.int(0, 3);
        return { moveTo: null, action: null };
      }
    }
    goal = u.route[at];
  } else {
    const lead = patrol.podLead(state, u);
    if (lead && manhattan(u.x, u.y, lead.x, lead.y) <= 2) return { moveTo: null, action: null };
    if (lead) goal = [lead.x, lead.y];
  }
  if (!near.length) return { moveTo: null, action: null };
  const [c] = goal
    ? near.reduce((a, b) => (manhattan(...(cellPos(state.map, b[0]).slice(0, 2) as [number, number]), ...goal!) < manhattan(...(cellPos(state.map, a[0]).slice(0, 2) as [number, number]), ...goal!) ? b : a))
    : state.rng.pick(near);
  const [x, y, l] = cellPos(state.map, c);
  if (goal && manhattan(x, y, ...goal) >= manhattan(u.x, u.y, ...goal)) return { moveTo: null, action: null };
  return { moveTo: [x, y], moveLevel: l, action: null };
}

function fleePlan(state: BattleState, u: BattleUnit): AiPlan {
  const reach = reachable(state, u);
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (const i of reach.cost.keys()) {
    const [x, y, l] = cellPos(state.map, i);
    if (!isFree(state, x, y, u, l)) continue;
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
  if (u.unaware) return patrolPlan(state, u);
  // Preso num confinamento inimigo: quebrar um selo.
  const seal = sealToBreak(state, u);
  if (seal) return breakSealPlan(state, u, seal);
  // Evoluções antes das versões base: no empate, a IA usa a forma mais nova.
  const all = u.skills
    .map((id) => skill(id) as SkillLike)
    .filter((s) => !DB.skills[s.id]?.passive && skillUsable(state, u, s))
    .sort((a, b) => (DB.skills[b.id]?.evolvedOf ? 1 : 0) - (DB.skills[a.id]?.evolvedOf ? 1 : 0));
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
  const here = unitCell(state.map, u);
  // Suprimido: sair do lugar custa um tiro — só se mexe se estiver mal.
  const pinned = !!u.statuses.suprimido && u.hp > u.maxHp * 0.35;
  const tiles = [...reach.cost.keys()].filter((i) => {
    const [x, y, l] = cellPos(state.map, i);
    return isFree(state, x, y, u, l) && (!pinned || i === here);
  });
  const builders = all.filter((s) => DB.skills[s.id]?.fx?.build);
  const confiners = all.filter((s) => DB.skills[s.id]?.fx?.confine);
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
    const posMelee = positionValue(state, u, targets, false);
    const posRanged = positionValue(state, u, targets, true);
    const consider = (score: number, action: AiPlan['action']) => {
      if (score > best.score) best = { score, plan: { moveTo: ti === ocell ? null : [tx, ty], moveLevel: tl, action } };
    };
    // Táticas do mapa: estabilizar, barris, lustres, arremessos, sino.
    for (const t of tacticOptions(state, u)) consider(t.value - moveCost * 0.2 + posRanged, t.action);
    // Construção: cobertura entre si e o inimigo.
    for (const s of builders) {
      const b = buildAim(state, u, s, targets);
      if (b) consider(b.value - s.mp * 0.1 - moveCost * 0.2, { kind: 'skill', skill: s, x: b.x, y: b.y });
    }
    // Confinamento: separa parte dos inimigos ou prende o mais perigoso.
    for (const s of confiners) {
      const b = confineAim(state, u, s, targets);
      if (b) consider(b.value - s.mp * 0.1 - moveCost * 0.2, { kind: 'skill', skill: s, x: b.x, y: b.y });
    }
    for (const s of options) {
      if (DB.skills[s.id]?.fx?.randomTargets && (tx !== ox || ty !== oy)) continue;
      for (const [cx, cy] of aimPoints(state, u, s, targets)) {
        const ranged = s.id === 'ataque' ? u.weaponRange > 1 : skillRange(u, s) > 1;
        const kite = ranged ? Math.min(...targets.map((t) => manhattan(tx, ty, t.x, t.y)), 6) * 0.3 : 0;
        // Habilidades valem um pouco menos que o ataque básico: só compensam quando são claramente melhores.
        const bias = s.id === 'ataque' ? 1 : AI_SKILL_BIAS;
        const evolved = DB.skills[s.id]?.evolvedOf ? 0.5 : 0;
        const score = expectedValue(state, u, s, cx, cy) * bias - moveCost * 0.2 - s.mp * 0.1 + kite + evolved + (ranged ? posRanged : posMelee);
        if (score > best.score) {
          best = {
            score,
            plan: { moveTo: ti === ocell ? null : [tx, ty], moveLevel: tl, action: { kind: s.id === 'ataque' ? 'attack' : 'skill', skill: s, x: cx, y: cy } },
          };
        }
      }
    }
  }
  // Empurrão a partir de onde vai parar.
  const finalCell = best.plan.moveTo ? stackCellOf(state, best.plan.moveTo[0], best.plan.moveTo[1], best.plan.moveLevel) : ocell;
  {
    const [fx_, fy, fl] = cellPos(state.map, finalCell);
    u.x = fx_;
    u.y = fy;
    setLevel(state.map, u, fl);
    // Empurrar gasta a ação: só vale se render mais que a ação planejada.
    const sh = bestShove(state, u);
    const act = best.plan.action;
    const actValue = act && (act.kind === 'attack' || act.kind === 'skill') ? expectedValue(state, u, act.kind === 'attack' ? BASIC_ATTACK : act.skill, act.x, act.y) : act ? 5 : 0;
    if (sh && sh.value > actValue) best.plan.action = { kind: 'tactic', tactic: 'shove', x: sh.x, y: sh.y };
  }
  // Nada para atacar: puxa a alavanca que abre caminho (de onde der).
  if (!(best.plan.action && best.score > 0))
    for (const ti of tiles) {
      const [tx, ty, tl] = cellPos(state.map, ti);
      u.x = tx;
      u.y = ty;
      setLevel(state.map, u, tl);
      const lv = leverToPull(state, u);
      if (lv) {
        best = { score: 1, plan: { moveTo: ti === ocell ? null : [tx, ty], moveLevel: tl, action: { kind: 'tactic', tactic: 'scenery', x: lv[0], y: lv[1] } } };
        break;
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
    if (ti === ocell) continue;
    const [tx, ty, tl] = cellPos(state.map, ti);
    const d = manhattan(tx, ty, goal.x, goal.y) - (hasLos(state.map, tx, ty, goal.x, goal.y) ? 0.5 : 0);
    if (d < bestD) {
      bestD = d;
      bestTile = [tx, ty];
      bestLevel = tl;
    }
  }
  // Turno só de aproximação: aproveita a ação para se preparar (encantar a arma, buff próprio, armadilha no caminho).
  const prep = prepAction(state, u, all, bestTile ?? [u.x, u.y], goal);
  return { moveTo: bestTile, moveLevel: bestLevel, action: prep ?? (bestTile ? null : { kind: 'defend' }) };
}

/** Ação de preparo num turno sem alvo ao alcance. */
function prepAction(state: BattleState, u: BattleUnit, usable: SkillLike[], [px, py]: [number, number], goal: BattleUnit): AiPlan['action'] {
  for (const s of usable) {
    const f = DB.skills[s.id]?.fx ?? {};
    if (s.target !== 'self') continue;
    if (f.imbue && !u.statuses.encantado) return { kind: 'skill', skill: s, x: px, y: py };
    if (f.self && !u.statuses[f.self.id as StatusId] && !f.hide && !f.teleport && s.kind !== 'heal') return { kind: 'skill', skill: s, x: px, y: py };
  }
  // Armadilha entre si e o inimigo, a 1–2 casas dele (onde ele vai pisar para chegar).
  const trap = usable.find((s) => DB.skills[s.id]?.fx?.trap);
  if (trap) {
    const range = skillRange(u, trap);
    const dx = Math.sign(px - goal.x);
    const dy = Math.sign(py - goal.y);
    for (const k of [2, 1]) {
      const x = goal.x + dx * k;
      const y = goal.y + (dx === 0 ? dy * k : 0);
      const t = tileAt(state.map, x, y);
      if (t && isWalkable(t) && isFree(state, x, y) && manhattan(px, py, x, y) <= range) return { kind: 'skill', skill: trap, x, y };
    }
  }
  return null;
}

function stackCellOf(state: BattleState, x: number, y: number, l?: number): number {
  return (l ?? 0) * state.map.w * state.map.h + y * state.map.w + x;
}

/** Executa uma ação tática da IA. */
export function runTactic(state: BattleState, u: BattleUnit, a: TacticAction): boolean {
  switch (a.tactic) {
    case 'stabilize':
      return downed.stabilize(state, u, a.x, a.y);
    case 'throw':
      return !!a.from && tactics.throwProp(state, u, a.from[0], a.from[1], a.x, a.y);
    case 'scenery':
      return scenery.useScenery(state, u, a.x, a.y);
    case 'propShot':
      return tactics.shootProp(state, u, a.x, a.y, skillRange(u, BASIC_ATTACK));
    case 'shootProp':
      return attack(state, u, a.x, a.y);
    case 'shove':
      return tactics.shove(state, u, a.x, a.y);
  }
}

/** Executa um turno completo da IA sem animação (testes, simulações, batalhas rápidas). */
/**
 * Mira no andar certo: se a coluna do alvo tiver mais de uma unidade (andares diferentes), a IA
 * escolhe a do outro lado (a mais ferida, se houver duas).
 */
export function aimAt(state: BattleState, u: BattleUnit, x: number, y: number): void {
  const foes = unitsAt(state, x, y).filter((o) => o.team !== u.team);
  if (!foes.length) {
    delete state.aimLevel;
    return;
  }
  const pick = foes.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]!;
  state.aimLevel = unitLevel(state.map, pick);
}

export function runAiTurn(state: BattleState, u: BattleUnit): AiPlan {
  const plan = planTurn(state, u);
  if (plan.moveTo) moveUnit(state, u, plan.moveTo[0], plan.moveTo[1], plan.moveLevel);
  if (plan.shove && u.alive && !state.outcome) tactics.shove(state, u, plan.shove[0], plan.shove[1]);
  const a = plan.action;
  // Preso numa armadilha no caminho: o turno acabou ali.
  if (a && u.alive && !state.outcome && !state.turn.acted) {
    if (a.kind === 'defend') defend(state, u);
    else if (a.kind === 'attack') {
      aimAt(state, u, a.x, a.y);
      attack(state, u, a.x, a.y);
    } else if (a.kind === 'tactic') runTactic(state, u, a);
    else {
      aimAt(state, u, a.x, a.y);
      castSkill(state, u, a.skill, a.x, a.y);
    }
  }
  if (state.activeUid === u.uid) endTurn(state);
  return plan;
}
