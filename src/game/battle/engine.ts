import { Rng } from '@core';
import { DB, item, skill, type ComboDef, type Element, type SkillDef } from '../data';
import { addStatus, applyElementToTile, applyElementToUnit, environmentTick, removeStatus, tileEffectsOnUnit, unitAt } from './elements';
import { COVER_PENALTY, coverAgainst, type CoverLevel } from './cover';
import { hasLos } from './los';
import { DIRS, cloneMap, idx, inBounds, isWalkable, manhattan, tileAt, xy, type BattleMap } from './map';
import type { BattleContext, BattleResult, BattleSetup, BattleState, BattleUnit, StatusId, Team } from './types';
import * as fx from './creature_fx';

/** Tempo para uma unidade de Velocidade 10 encher a barra = 1 rodada de ambiente. */
export const ROUND_TIME = 5;
export const VISION_RANGE = 8;
export const CONE_RANGE = 6;
export const CONE_HALF_ANGLE = Math.PI / 3;
export const MOVE_ONLY_GAUGE = 50;
export const XP_PER_KILL_BASE = 10;

// ───────────────────────────── criação ─────────────────────────────

function spawnTiles(map: BattleMap, kind: 'player' | 'enemy'): [number, number][] {
  const marked: [number, number][] = [];
  const fallback: [number, number][] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[idx(map, x, y)]!;
      if (!isWalkable(t)) continue;
      if (t.spawn === kind) marked.push([x, y]);
      fallback.push([x, y]);
    }
  fallback.sort((a, b) => (kind === 'player' ? a[0] - b[0] : b[0] - a[0]) || Math.abs(a[1] - map.h / 2) - Math.abs(b[1] - map.h / 2));
  return [...marked, ...fallback.filter((f) => !marked.some((m) => m[0] === f[0] && m[1] === f[1]))];
}

export function createBattle(setup: BattleSetup): BattleState {
  const rng = new Rng(setup.seed);
  const map = cloneMap(setup.map);
  const state: BattleState = {
    map,
    units: [],
    time: 0,
    round: 1,
    nextRoundAt: ROUND_TIME,
    activeUid: null,
    turn: { moved: false, acted: false, startX: 0, startY: 0 },
    victory: setup.victory,
    outcome: null,
    log: [],
    events: [],
    rng,
    biome: map.biome,
    ambush: setup.ambush,
    canFlee: setup.canFlee,
    revealAll: false,
  };
  const occupied = new Set<number>();
  const place = (units: BattleUnit[], kind: 'player' | 'enemy') => {
    const spots = spawnTiles(map, kind);
    for (const u of units) {
      const spot = spots.find(([x, y]) => !occupied.has(idx(map, x, y)));
      if (!spot) continue;
      u.x = spot[0];
      u.y = spot[1];
      occupied.add(idx(map, u.x, u.y));
      u.facing = kind === 'player' ? 0 : 2;
      state.units.push(u);
    }
  };
  place(setup.players, 'player');
  place(setup.enemies, 'enemy');

  if (setup.victory.type === 'target') {
    const enemies = state.units.filter((u) => u.team === 'enemy');
    const target = enemies.find((u) => u.uid === (setup.victory as { uid?: string }).uid) ?? [...enemies].sort((a, b) => b.maxHp - a.maxHp)[0];
    if (target) {
      target.isTarget = true;
      state.victory = { type: 'target', uid: target.uid };
    }
  }
  if (setup.victory.type === 'escape' && !map.tiles.some((t) => t.spawn === 'extract')) {
    for (let y = 0; y < map.h; y++) {
      const t = tileAt(map, map.w - 1, y)!;
      if (isWalkable(t) && !t.spawn) t.spawn = 'extract';
    }
  }
  for (const u of state.units) {
    const ambushed = setup.ambush && u.team === 'player';
    u.gauge = setup.ambush ? (u.team === 'enemy' ? rng.range(70, 95) : rng.range(0, 20)) : rng.range(0, 40);
    if (ambushed) u.gauge = Math.min(u.gauge, 20);
  }
  state.log.push(setup.ambush ? '⚠ Emboscada! Os inimigos agem primeiro.' : '⚔ A batalha começou.');
  fx.battleStart(state);
  return state;
}

// ───────────────────────────── consultas ─────────────────────────────

export function unitById(state: BattleState, uid: string | null): BattleUnit | undefined {
  return uid ? state.units.find((u) => u.uid === uid) : undefined;
}

export function activeUnit(state: BattleState): BattleUnit | undefined {
  return unitById(state, state.activeUid);
}

export function opponents(state: BattleState, u: BattleUnit): BattleUnit[] {
  return state.units.filter((o) => o.alive && o.team !== u.team);
}

export function allies(state: BattleState, u: BattleUnit): BattleUnit[] {
  return state.units.filter((o) => o.alive && o.team === u.team);
}

export function rate(u: BattleUnit): number {
  return Math.max(3, (10 + u.attrs.spd) * (u.statuses.eletrocutado ? 0.6 : 1) * fx.rateMult(u));
}

/** Ordem prevista dos próximos turnos (linha do tempo). */
export function predictOrder(state: BattleState, count: number): string[] {
  const sim = state.units.filter((u) => u.alive).map((u) => ({ uid: u.uid, g: u.gauge, r: rate(u), spd: u.attrs.spd }));
  const out: string[] = [];
  if (state.activeUid) {
    out.push(state.activeUid);
    const a = sim.find((s) => s.uid === state.activeUid);
    if (a) a.g = state.turn.moved && !state.turn.acted ? MOVE_ONLY_GAUGE : 0;
  }
  let guard = 0;
  while (out.length < count && sim.length && guard++ < 500) {
    const dt = Math.max(0, Math.min(...sim.map((s) => (100 - s.g) / s.r)));
    for (const s of sim) s.g += s.r * dt;
    const ready = sim.filter((s) => s.g >= 100 - 1e-6).sort((a, b) => b.g - a.g || b.spd - a.spd);
    const next = ready[0];
    if (!next) break;
    out.push(next.uid);
    next.g = 0;
  }
  return out;
}

export function inCone(viewer: BattleUnit, x: number, y: number): boolean {
  const dx = x - viewer.x;
  const dy = y - viewer.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 1.5) return true;
  if (dist > CONE_RANGE) return false;
  const [fx, fy] = DIRS[viewer.facing]!;
  const cos = (dx * fx + dy * fy) / dist;
  return cos >= Math.cos(CONE_HALF_ANGLE);
}

export function detectedBy(state: BattleState, u: BattleUnit): BattleUnit | undefined {
  return opponents(state, u).find((o) => inCone(o, u.x, u.y) && hasLos(state.map, o.x, o.y, u.x, u.y));
}

/** Tiles vistos por um time (visão compartilhada do esquadrão). */
export function teamVision(state: BattleState, team: Team): Set<number> {
  const seen = new Set<number>();
  const map = state.map;
  for (const u of state.units) {
    if (!u.alive || u.team !== team) continue;
    for (let y = Math.max(0, u.y - VISION_RANGE); y <= Math.min(map.h - 1, u.y + VISION_RANGE); y++)
      for (let x = Math.max(0, u.x - VISION_RANGE); x <= Math.min(map.w - 1, u.x + VISION_RANGE); x++) {
        const i = idx(map, x, y);
        if (seen.has(i)) continue;
        if (Math.hypot(x - u.x, y - u.y) > VISION_RANGE + 0.5) continue;
        if ((x === u.x && y === u.y) || hasLos(map, u.x, u.y, x, y)) seen.add(i);
      }
  }
  return seen;
}

export function visibleToPlayer(state: BattleState, u: BattleUnit, vision: Set<number>): boolean {
  if (u.team === 'player' || state.revealAll) return true;
  return !u.hidden && vision.has(idx(state.map, u.x, u.y));
}

// ───────────────────────────── movimento ─────────────────────────────

export interface Reach {
  cost: Map<number, number>;
  prev: Map<number, number>;
}

export function moveBudget(u: BattleUnit): number {
  if (fx.isRooted(u)) return 0;
  return Math.max(1, u.move - (u.statuses.enlameado ? 2 : 0) + fx.moveDelta(u));
}

export function reachable(state: BattleState, u: BattleUnit): Reach {
  const map = state.map;
  const start = idx(map, u.x, u.y);
  const cost = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const budget = moveBudget(u);
  const blockers = new Set(opponents(state, u).map((o) => idx(map, o.x, o.y)));
  const queue: number[] = [start];
  while (queue.length) {
    queue.sort((a, b) => cost.get(a)! - cost.get(b)!);
    const cur = queue.shift()!;
    const [cx, cy] = xy(map, cur);
    const ct = map.tiles[cur]!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = idx(map, nx, ny);
      const nt = map.tiles[ni]!;
      if (!isWalkable(nt) || blockers.has(ni)) continue;
      const dh = nt.h - ct.h;
      const jump = u.statuses.voando ? 10 : u.jump;
      if (dh > jump || -dh > jump + 1) continue;
      const c = cost.get(cur)! + 1 + (nt.s === 'lama' && jump < 10 ? 1 : 0);
      if (c > budget) continue;
      if (c < (cost.get(ni) ?? Infinity)) {
        cost.set(ni, c);
        prev.set(ni, cur);
        queue.push(ni);
      }
    }
  }
  return { cost, prev };
}

export function isFree(state: BattleState, x: number, y: number, except?: BattleUnit): boolean {
  return !state.units.some((o) => o.alive && o !== except && o.x === x && o.y === y);
}

export function moveTargets(state: BattleState, u: BattleUnit, reach = reachable(state, u)): number[] {
  return [...reach.cost.keys()].filter((i) => {
    const [x, y] = xy(state.map, i);
    return isFree(state, x, y, u) && !(x === u.x && y === u.y);
  });
}

export function pathTo(state: BattleState, reach: Reach, target: number): [number, number][] {
  const out: [number, number][] = [];
  let cur: number | undefined = target;
  while (cur !== undefined && reach.prev.has(cur)) {
    out.unshift(xy(state.map, cur));
    cur = reach.prev.get(cur);
  }
  return out;
}

export function faceTowards(u: BattleUnit, x: number, y: number): void {
  const dx = x - u.x;
  const dy = y - u.y;
  if (dx === 0 && dy === 0) return;
  u.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
}

/** Move a unidade pelo caminho. Pode parar antes (prontidão inimiga, morte). Retorna os passos feitos. */
export function moveUnit(state: BattleState, u: BattleUnit, tx: number, ty: number): [number, number][] {
  const reach = reachable(state, u);
  const target = idx(state.map, tx, ty);
  if (!reach.cost.has(target) || !isFree(state, tx, ty, u)) return [];
  const path = pathTo(state, reach, target);
  const done: [number, number][] = [];
  const pursued = new Set<string>();
  for (const [x, y] of path) {
    // Perseguição: quem se afasta de uma criatura perseguidora leva um golpe de graça.
    for (const o of opponents(state, u)) {
      if (pursued.has(o.uid) || manhattan(o.x, o.y, u.x, u.y) !== 1 || manhattan(o.x, o.y, x, y) <= 1) continue;
      if (!fx.passiveFx(o).some((f) => f.pursuit) || o.statuses.atordoado || o.statuses.semente) continue;
      pursued.add(o.uid);
      state.log.push(`🐺 ${o.name} persegue ${u.name}!`);
      resolveAttack(state, o, u, 'basic', 0, o.element, 0, 1);
      if (!u.alive) break;
    }
    if (!u.alive) break;
    faceTowards(u, x, y);
    u.x = x;
    u.y = y;
    // Muralha de piques: quem entra no alcance corpo a corpo leva um golpe.
    for (const o of opponents(state, u)) {
      if (pursued.has(`g${o.uid}`) || manhattan(o.x, o.y, x, y) > Math.max(1, o.weaponRange) || !fx.passiveFx(o).some((f) => f.guardZone) || o.statuses.atordoado) continue;
      pursued.add(`g${o.uid}`);
      state.log.push(`🔱 ${o.name} recebe ${u.name} na ponta da lança!`);
      resolveAttack(state, o, u, 'basic', 0, undefined, 0, 1);
      if (!u.alive) break;
    }
    if (!u.alive) break;
    done.push([x, y]);
    const dmg = tileEffectsOnUnit(state, u);
    if (dmg) damage(state, u, dmg, undefined, undefined);
    if (u.alive) fx.stepOnTile(state, u);
    if (!u.alive) break;
    if (u.hidden && detectedBy(state, u)) {
      u.hidden = false;
      state.log.push(`👁 ${u.name} foi avistado!`);
    }
    if (triggerOverwatch(state, u)) {
      if (!u.alive) break;
    }
  }
  // Não pode terminar em cima de aliado: se parou no meio, recua até um tile livre.
  while (done.length && !isFree(state, u.x, u.y, u)) {
    done.pop();
    const last = done[done.length - 1] ?? [state.turn.startX, state.turn.startY];
    u.x = last[0];
    u.y = last[1];
  }
  state.turn.moved = true;
  if (done.length) fx.bag(u).still = 0;
  return done;
}

function triggerOverwatch(state: BattleState, mover: BattleUnit): boolean {
  if (mover.hidden) return false;
  let fired = false;
  for (const o of opponents(state, mover)) {
    if (!o.overwatch || !mover.alive) continue;
    if (!inRange(state, o, o.weaponRange, mover.x, mover.y)) continue;
    o.overwatch = false;
    state.log.push(`🎯 ${o.name} (prontidão) reage a ${mover.name}!`);
    resolveAttack(state, o, mover, 'basic', 0, undefined, 0, 1);
    fired = true;
  }
  return fired;
}

// ───────────────────────────── alcance e área ─────────────────────────────

export function heightRangeBonus(state: BattleState, u: BattleUnit, x: number, y: number): number {
  const a = tileAt(state.map, u.x, u.y)!;
  const b = tileAt(state.map, x, y);
  return b ? Math.max(0, Math.floor((a.h - b.h) / 2)) : 0;
}

export function inRange(state: BattleState, u: BattleUnit, range: number, x: number, y: number, minRange = 1, needsLos = true): boolean {
  if (!inBounds(state.map, x, y)) return false;
  const d = manhattan(u.x, u.y, x, y);
  if (d < minRange) return false;
  const bonus = range > 1 ? heightRangeBonus(state, u, x, y) : 0;
  if (d > range + bonus) return false;
  if (range <= 1) {
    const dh = Math.abs(tileAt(state.map, u.x, u.y)!.h - tileAt(state.map, x, y)!.h);
    if (dh > 2) return false;
  }
  if (needsLos && d > 1 && !hasLos(state.map, u.x, u.y, x, y)) return false;
  return true;
}

export type SkillLike = Pick<SkillDef, 'range' | 'target' | 'shape' | 'radius' | 'kind' | 'power' | 'element' | 'accuracy' | 'status'> & {
  id: string;
  name: string;
  mp: number;
};

export function skillRange(u: BattleUnit, s: SkillLike): number {
  const r = s.range < 0 ? u.weaponRange : s.range;
  // Esmagado pela gravidade: ataques à distância só alcançam o vizinho.
  if (u.statuses.sem_alcance && (s.kind === 'ranged' || s.range < 0)) return Math.min(r, 1);
  return r;
}

/** Direção cardinal dominante de `u` para (x, y). */
export function mainDir(u: BattleUnit, x: number, y: number): [number, number] | null {
  const dx = x - u.x;
  const dy = y - u.y;
  if (dx === 0 && dy === 0) return null;
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

export function lineDir(u: BattleUnit, x: number, y: number): [number, number] | null {
  const dx = x - u.x;
  const dy = y - u.y;
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null;
  return [Math.sign(dx), Math.sign(dy)];
}

/** Tiles afetados por uma habilidade mirando (x, y). */
export function areaOf(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): [number, number][] {
  if (s.shape === 'radius') {
    const r = s.radius ?? 1;
    const cx = s.target === 'self' ? u.x : x;
    const cy = s.target === 'self' ? u.y : y;
    const out: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && inBounds(state.map, cx + dx, cy + dy)) out.push([cx + dx, cy + dy]);
    return out;
  }
  if (s.shape === 'cone') {
    // Cone: abre 1 tile para cada lado a cada 2 m de distância.
    const dir = mainDir(u, x, y);
    if (!dir) return [];
    const out: [number, number][] = [];
    const range = skillRange(u, s);
    for (let d = 1; d <= range; d++) {
      const spread = Math.floor(d / 2);
      for (let l = -spread; l <= spread; l++) {
        const tx = u.x + dir[0] * d + (dir[1] !== 0 ? l : 0);
        const ty = u.y + dir[1] * d + (dir[0] !== 0 ? l : 0);
        if (inBounds(state.map, tx, ty) && hasLos(state.map, u.x, u.y, tx, ty)) out.push([tx, ty]);
      }
    }
    return out;
  }
  if (s.shape === 'line') {
    const dir = lineDir(u, x, y);
    if (!dir) return [];
    const out: [number, number][] = [];
    const range = skillRange(u, s);
    for (let i = 1; i <= range; i++) {
      const tx = u.x + dir[0] * i;
      const ty = u.y + dir[1] * i;
      if (!inBounds(state.map, tx, ty)) break;
      out.push([tx, ty]);
      const hit = unitAt(state, tx, ty);
      if (hit && hit.team !== u.team) break;
      if (!isWalkable(tileAt(state.map, tx, ty)!)) break;
    }
    return out;
  }
  return [[x, y]];
}

/** Tiles que podem ser escolhidos como alvo para a habilidade. */
export function skillTargets(state: BattleState, u: BattleUnit, s: SkillLike, vision: Set<number>): number[] {
  const out: number[] = [];
  const range = skillRange(u, s);
  if (s.target === 'self') return [idx(state.map, u.x, u.y)];
  const teleport = !!DB.skills[s.id]?.fx?.teleport;
  const corpse = !!DB.skills[s.id]?.fx?.corpse;
  for (let y = 0; y < state.map.h; y++)
    for (let x = 0; x < state.map.w; x++) {
      if (s.shape === 'line') {
        if (lineDir(u, x, y) && manhattan(u.x, u.y, x, y) <= range) out.push(idx(state.map, x, y));
        continue;
      }
      if (s.shape === 'cone') {
        if (mainDir(u, x, y) && manhattan(u.x, u.y, x, y) <= range && (x === u.x || y === u.y)) out.push(idx(state.map, x, y));
        continue;
      }
      if (corpse) {
        if (manhattan(u.x, u.y, x, y) <= range && state.units.some((o) => !o.alive && o.x === x && o.y === y) && vision.has(idx(state.map, x, y))) out.push(idx(state.map, x, y));
        continue;
      }
      if (teleport) {
        const t = tileAt(state.map, x, y)!;
        if (manhattan(u.x, u.y, x, y) <= range && isWalkable(t) && isFree(state, x, y) && vision.has(idx(state.map, x, y))) out.push(idx(state.map, x, y));
        continue;
      }
      if (s.target === 'tile') {
        if (inRange(state, u, range, x, y, 1)) out.push(idx(state.map, x, y));
        continue;
      }
      const minRange = s.target === 'ally' || s.kind === 'heal' ? 0 : 1;
      if (!inRange(state, u, range, x, y, minRange, !DB.skills[s.id]?.fx?.homing)) continue;
      const target = unitAt(state, x, y);
      if (s.target === 'enemy' && !(target && target.team !== u.team && visibleToPlayerOrAi(state, u, target, vision))) continue;
      if (s.target === 'ally' && !(target && target.team === u.team)) continue;
      out.push(idx(state.map, x, y));
    }
  return out;
}

function visibleToPlayerOrAi(state: BattleState, viewer: BattleUnit, target: BattleUnit, vision: Set<number>): boolean {
  if (viewer.team === 'enemy') return !target.hidden;
  return visibleToPlayer(state, target, vision);
}

export const BASIC_ATTACK: SkillLike = { id: 'ataque', name: 'Atacar', mp: 0, range: -1, target: 'enemy', shape: 'single', kind: 'physical', power: 0 };

// ───────────────────────────── acerto e dano ─────────────────────────────

export interface HitPreview {
  chance: number;
  min: number;
  max: number;
  crit: number;
  /** Cobertura do alvo contra este ataque (só físico à distância). */
  cover: CoverLevel;
}

type HitKind = 'basic' | SkillDef['kind'];

function heightDiff(state: BattleState, a: BattleUnit, d: BattleUnit): number {
  return tileAt(state.map, a.x, a.y)!.h - tileAt(state.map, d.x, d.y)!.h;
}

function elementMult(d: BattleUnit, el: Element | undefined): number {
  if (!el) return 1;
  let m = 1;
  if (el === 'eletricidade' && d.statuses.molhado) m *= 2;
  if (el === 'fogo' && d.statuses.molhado) m *= 0.5;
  if (d.element && d.element === el) m *= 0.5;
  if (el === 'luz' && d.element === 'sombra') m *= 1.6;
  if (el === 'fogo' && d.element === 'gelo') m *= 1.5;
  if (el === 'agua' && d.element === 'fogo') m *= 1.5;
  if (el === 'gelo' && d.element === 'vento') m *= 1.3;
  return m;
}

export function previewHit(state: BattleState, a: BattleUnit, d: BattleUnit, kind: HitKind, power: number, el?: Element, accBonus = 0, mult = 1, sk?: SkillLike): HitPreview {
  const magic = kind === 'magic';
  const m = fx.hitMods(state, a, d, magic, sk, el);
  const insp = a.statuses.inspirado ? 1.25 : 1;
  const defScale = sk ? DB.skills[sk.id]?.fx?.defScaling ?? 0 : 0;
  const base = (magic ? power * 1.8 + a.attrs.int * 1.9 : a.weaponAtk + a.attrs[a.attackAttr] * 1.4 + power * 1.5) + a.def * defScale;
  const mitig = (magic ? d.def * 0.3 + d.attrs.int * 0.5 : d.def * 0.8) * m.def;
  let dmg = Math.max(1, base * insp - mitig) * elementMult(d, el) * mult * m.dmg;
  if (d.defending) dmg *= 0.5;
  if (d.statuses.congelado && !magic) dmg *= 1.3;
  let chance: number;
  const cover = magic ? 'none' : coverAgainst(state.map, d.x, d.y, a.x, a.y);
  if (magic) chance = Math.max(60, Math.min(99, 95 - (d.evasion + m.evasion) * 0.2 + m.accuracy * 0.5));
  else chance = Math.max(5, Math.min(98, a.accuracy + accBonus + m.accuracy - d.evasion - m.evasion + heightDiff(state, a, d) * 6 - (d.defending ? 10 : 0) - COVER_PENALTY[cover]));
  if (d.statuses.congelado) chance = 100;
  if (m.immune) return { chance: 0, min: 0, max: 0, crit: 0, cover };
  return { chance: Math.round(chance), min: Math.max(1, Math.floor(dmg * 0.9)), max: Math.max(1, Math.ceil(dmg * 1.1)), crit: Math.min(100, a.crit + m.crit), cover };
}

export function damage(state: BattleState, target: BattleUnit, amount: number, attacker: BattleUnit | undefined, el: Element | undefined, crit = false, magic = false): void {
  if (!target.alive) return;
  amount = fx.beforeDamage(state, target, amount, attacker, el);
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - amount);
  state.events.push({ type: 'damage', uid: target.uid, amount, crit, element: el });
  if (target.hp <= 0 && fx.onLethal(state, target, el)) return;
  fx.afterDamage(state, target, amount, attacker, el, magic);
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    const lastStatuses = target.statuses;
    target.statuses = {};
    target.overwatch = false;
    state.events.push({ type: 'death', uid: target.uid });
    state.log.push(`☠ ${target.name} caiu.`);
    if (attacker && attacker.team !== target.team) {
      attacker.kills += 1;
      attacker.killXp += target.xpReward ?? killXp(target.level);
    }
    fx.onDeath(state, target, attacker, lastStatuses);
  }
}

export function heal(state: BattleState, target: BattleUnit, amount: number): void {
  if (!target.alive) return;
  if (target.statuses.ferida_aberta) {
    state.events.push({ type: 'text', x: target.x, y: target.y, text: 'sem cura', color: '#e57373' });
    return;
  }
  const real = Math.min(amount, target.maxHp - target.hp);
  target.hp += real;
  state.events.push({ type: 'heal', uid: target.uid, amount: real });
}

/** Rola acerto, aplica dano e efeitos de elemento na unidade. Retorna se acertou. */
export function resolveAttack(state: BattleState, a: BattleUnit, d: BattleUnit, kind: HitKind, power: number, el: Element | undefined, accBonus: number, mult: number, sk?: SkillLike): boolean {
  const p = previewHit(state, a, d, kind, power, el, accBonus, mult, sk);
  const magic = kind === 'magic';
  if (p.max <= 0 || !state.rng.chance(p.chance / 100)) {
    state.events.push({ type: 'miss', uid: d.uid });
    state.log.push(p.max <= 0 ? `${d.name} é imune ao golpe de ${a.name}.` : `${a.name} errou ${d.name}.`);
    return false;
  }
  const crit = state.rng.chance(p.crit / 100);
  let amount = Math.round(state.rng.range(p.min, p.max));
  if (crit) amount = Math.round(amount * fx.critMult(a));
  const reaction = fx.preventingReaction(state, a, d, magic, crit, amount);
  if (reaction.prevented) return false;
  amount = reaction.amount;
  if (crit) fx.onCrit(state, a);
  if (magic && d.statuses.refletindo) {
    state.log.push(`◈ ${d.name} reflete a magia de volta!`);
    damage(state, a, amount, d, el, false, true);
    return false;
  }
  if (el) applyElementToUnit(state, d, el);
  const before = d.hp;
  damage(state, d, amount, a, el, crit, magic);
  state.log.push(`${a.name} → ${d.name}: ${amount}${crit ? ' (crítico!)' : ''}`);
  const steal =
    (sk ? DB.skills[sk.id]?.fx?.lifesteal ?? 0 : 0) +
    (fx.currentStance(state, a)?.lifesteal ?? 0) +
    fx.passiveFx(a).reduce((acc, f) => acc + (f.elementLifesteal && f.elementLifesteal.element === el ? f.elementLifesteal.pct : 0), 0);
  if (steal > 0 && a.alive) heal(state, a, Math.max(1, Math.round((before - d.hp) * steal)));
  fx.afterAttackerHit(state, a, d, magic);
  fx.afterHitReactions(state, a, d, magic, crit, amount);
  return true;
}

// ───────────────────────────── ações ─────────────────────────────

export function finishAction(state: BattleState, u: BattleUnit, keepHidden = false): void {
  state.turn.acted = true;
  if (!keepHidden && u.hidden) {
    u.hidden = false;
    state.log.push(`👁 ${u.name} saiu do esconderijo.`);
  }
  checkVictory(state);
}

export function attack(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const target = unitAt(state, x, y);
  if (!target || target.team === u.team || !inRange(state, u, skillRange(u, BASIC_ATTACK), x, y) || !fx.canStrike(u)) return false;
  faceTowards(u, x, y);
  const imbue = fx.imbueOf(u);
  const el = imbue?.element ?? (u.weaponType === 'natural' ? fx.currentStance(state, u)?.element ?? u.element : undefined);
  const kind: HitKind = u.weaponType === 'varinha' || imbue?.magic ? 'magic' : 'basic';
  const behind = fx.isBehind(u, target);
  const events = state.events.length;
  const hit = resolveAttack(state, u, target, kind, (kind === 'magic' ? 4 : 0) + (imbue?.bonus ?? 0), el, 0, 1);
  if (hit) fx.afterBasicHit(state, u, target);
  if (fx.num(u, 'momentum')) fx.bag(u).momentum = 0;
  if (el) applyElementToTile(state, x, y, el);
  // Morte Sutil: golpe pelas costas sem crítico não revela.
  const crit = state.events.slice(events).some((e) => e.type === 'damage' && e.uid === target.uid && e.crit);
  const silent = u.hidden && behind && !crit && fx.passiveFx(u).some((f) => f.silentStrike);
  finishAction(state, u, silent);
  return true;
}

export interface ComboOption {
  combo: ComboDef;
  mySkill: string;
  partner: BattleUnit;
  partnerSkill: string;
}

export function comboOptions(state: BattleState, u: BattleUnit): ComboOption[] {
  const out: ComboOption[] = [];
  for (const combo of Object.values(DB.combos)) {
    for (const [mine, theirs] of [
      [combo.a, combo.b],
      [combo.b, combo.a],
    ] as const) {
      if (!u.skills.includes(mine) || u.mp < skill(mine).mp) continue;
      for (const p of allies(state, u)) {
        if (p === u || !p.skills.includes(theirs) || p.mp < skill(theirs).mp || p.statuses.congelado) continue;
        if (manhattan(u.x, u.y, p.x, p.y) > combo.partnerRange) continue;
        out.push({ combo, mySkill: mine, partner: p, partnerSkill: theirs });
      }
    }
  }
  return out;
}

export function comboAsSkill(c: ComboOption): SkillLike {
  return { ...c.combo.result, id: c.combo.id, name: c.combo.name, mp: skill(c.mySkill).mp };
}

export function canCast(u: BattleUnit, s: SkillLike): boolean {
  const def = DB.skills[s.id];
  if (def?.passive) return false;
  if ((u.cooldowns[s.id] ?? 0) > 0) return false;
  if (u.statuses.silenciado && s.id !== BASIC_ATTACK.id) return false;
  if ((s.kind === 'physical' || s.kind === 'ranged') && !fx.canStrike(u)) return false;
  return u.mp >= fx.mpCost(u, s);
}

/** Como `canCast`, mas também checa requisitos do terreno e da situação (criaturas). */
export function skillUsable(state: BattleState, u: BattleUnit, s: SkillLike): boolean {
  if (!canCast(u, s)) return false;
  const def = DB.skills[s.id];
  if (def && def.classId === 'fera') return fx.creatureUsable(state, u, def);
  return true;
}

export function onSnow(state: BattleState, u: BattleUnit): boolean {
  return fx.checkCondition(state, u, 'snow');
}

export const passiveEvasion = fx.passiveEvasion;

/** Executa uma habilidade (ou combo, se `combo` for passado). */
export function castSkill(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number, combo?: ComboOption): boolean {
  if (!canCast(u, s)) return false;
  if (fx.isFera(s) && !fx.creatureUsable(state, u, DB.skills[s.id]!)) return false;
  u.mp -= fx.mpCost(u, s);
  const cd = DB.skills[s.id]?.cooldown ?? 0;
  if (cd > 0) u.cooldowns[s.id] = cd;
  if (combo) {
    combo.partner.mp -= skill(combo.partnerSkill).mp;
    combo.partner.gauge = 0;
    state.log.push(`⚡ Combo! ${u.name} + ${combo.partner.name}: ${s.name}`);
  } else state.log.push(`${u.name} usa ${s.name}.`);
  const wasHidden = u.hidden;
  if (fx.isFera(s)) return fx.castCreatureSkill(state, u, s, x, y);
  if (s.target !== 'self') faceTowards(u, x, y);

  if (s.id === 'passo_sombrio') {
    u.hidden = true;
    state.log.push(`🌑 ${u.name} some nas sombras.`);
    finishAction(state, u, true);
    return true;
  }
  if (s.kind === 'buff') {
    for (const [tx, ty] of areaOf(state, u, s, x, y)) {
      const t = unitAt(state, tx, ty);
      if (t && t.team === u.team && s.status) addStatus(t, s.status.id as never, s.status.turns);
    }
    finishAction(state, u);
    return true;
  }
  if (s.kind === 'heal') {
    for (const [tx, ty] of areaOf(state, u, s, x, y)) {
      const t = unitAt(state, tx, ty);
      if (t && t.team === u.team) {
        heal(state, t, Math.round(s.power + u.attrs.int * 1.2 + u.healBonus));
        removeStatus(t, 'queimando');
        removeStatus(t, 'envenenado');
      }
    }
    finishAction(state, u);
    return true;
  }
  if (s.shape === 'line') {
    // Investida: avança até o primeiro inimigo da linha e o acerta.
    const line = areaOf(state, u, s, x, y);
    let target: BattleUnit | undefined;
    for (const [tx, ty] of line) {
      if (s.element) applyElementToTile(state, tx, ty, s.element);
      const hit = unitAt(state, tx, ty);
      if (hit && hit.team !== u.team) {
        target = hit;
        break;
      }
      const t = tileAt(state.map, tx, ty)!;
      const cur = tileAt(state.map, u.x, u.y)!;
      if (!isWalkable(t) || Math.abs(t.h - cur.h) > u.jump + 1 || !isFree(state, tx, ty, u)) break;
      u.x = tx;
      u.y = ty;
      const dmg = tileEffectsOnUnit(state, u);
      if (dmg) damage(state, u, dmg, undefined, undefined);
      if (!u.alive) break;
    }
    if (target && u.alive) resolveAttack(state, u, target, s.kind, s.power, s.element, s.accuracy ?? 0, 1);
    finishAction(state, u);
    return true;
  }
  const area = areaOf(state, u, s, x, y);
  const mult = s.id === 'golpe_furtivo' && wasHidden ? 2 : 1;
  if (s.element) for (const [tx, ty] of area) applyElementToTile(state, tx, ty, s.element);
  if (s.id === 'frasco_venenoso') {
    for (const [tx, ty] of area) {
      const t = unitAt(state, tx, ty);
      if (t) addStatus(t, 'envenenado', 3);
    }
    finishAction(state, u);
    return true;
  }
  for (const [tx, ty] of area) {
    state.events.push({ type: 'fx', x: tx, y: ty, element: s.element ?? 'hit' });
    const t = unitAt(state, tx, ty);
    if (!t || (s.target === 'enemy' && t.team === u.team)) continue;
    if (s.element === 'luz' && t.team === u.team) {
      applyElementToUnit(state, t, 'luz');
      continue;
    }
    const hit = resolveAttack(state, u, t, s.kind, s.power, s.element, s.accuracy ?? 0, mult);
    if (hit && s.status && t.alive) addStatus(t, s.status.id as never, s.status.turns);
    if (s.element === 'luz') applyElementToUnit(state, t, 'luz');
  }
  finishAction(state, u);
  return true;
}

export function itemTargets(state: BattleState, u: BattleUnit, itemId: string): number[] {
  const it = item(itemId);
  const out: number[] = [];
  for (let y = 0; y < state.map.h; y++)
    for (let x = 0; x < state.map.w; x++) {
      if (it.use?.heal || it.use?.mp) {
        const t = unitAt(state, x, y);
        if (t && t.team === u.team && manhattan(u.x, u.y, x, y) <= 1) out.push(idx(state.map, x, y));
      } else if (inRange(state, u, 4, x, y, 1)) out.push(idx(state.map, x, y));
    }
  return out;
}

export function useItem(state: BattleState, u: BattleUnit, slot: number, x: number, y: number): boolean {
  const itemId = u.items[slot];
  if (!itemId) return false;
  const it = item(itemId);
  const use = it.use ?? {};
  if (use.heal || use.mp) {
    const t = unitAt(state, x, y);
    if (!t || t.team !== u.team || manhattan(u.x, u.y, x, y) > 1) return false;
    if (use.heal) heal(state, t, use.heal);
    if (use.mp) {
      const real = Math.min(use.mp, t.maxMp - t.mp);
      t.mp += real;
      state.events.push({ type: 'heal', uid: t.uid, amount: real, mp: true });
    }
  } else {
    if (!inRange(state, u, 4, x, y, 1)) return false;
    faceTowards(u, x, y);
    const r = use.radius ?? 1;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(state.map, tx, ty)) continue;
        if (use.smoke) applyElementToTile(state, tx, ty, 'fumaca');
        else if (use.throwElement === 'terra') applyElementToTile(state, tx, ty, 'oleo');
        else if (use.throwElement) {
          applyElementToTile(state, tx, ty, use.throwElement);
          const t = unitAt(state, tx, ty);
          if (t) {
            applyElementToUnit(state, t, use.throwElement);
            if (use.throwElement === 'fogo') damage(state, t, 8, u, 'fogo');
          }
        }
        state.events.push({ type: 'fx', x: tx, y: ty, element: use.smoke ? 'hit' : (use.throwElement ?? 'hit') });
      }
  }
  state.log.push(`${u.name} usa ${it.name}.`);
  u.items[slot] = null;
  finishAction(state, u);
  return true;
}

export function defend(state: BattleState, u: BattleUnit): void {
  u.defending = true;
  state.log.push(`🛡 ${u.name} se defende.`);
  finishAction(state, u, true);
}

export function hideChance(state: BattleState, u: BattleUnit): number {
  if (!detectedBy(state, u)) return 100;
  let chance = u.classId === 'ladrao' ? 50 : 0;
  const t = tileAt(state.map, u.x, u.y);
  if (t?.p === 'arbusto' || t?.c === 'fumaca') chance += 30;
  return chance;
}

export function hide(state: BattleState, u: BattleUnit): boolean {
  const chance = hideChance(state, u);
  const ok = chance >= 100 || state.rng.chance(chance / 100);
  if (ok) {
    u.hidden = true;
    state.log.push(`🌑 ${u.name} se escondeu.`);
  } else state.log.push(`${u.name} não conseguiu se esconder.`);
  finishAction(state, u, ok);
  return ok;
}

export function setOverwatch(state: BattleState, u: BattleUnit): void {
  u.overwatch = true;
  state.log.push(`🎯 ${u.name} está de prontidão.`);
  finishAction(state, u, true);
}

export function fleeChance(state: BattleState): number {
  const avg = (list: BattleUnit[]) => (list.length ? list.reduce((s, u) => s + u.attrs.spd, 0) / list.length : 0);
  const p = state.units.filter((u) => u.alive && u.team === 'player');
  const e = state.units.filter((u) => u.alive && u.team === 'enemy');
  return Math.round(Math.max(20, Math.min(90, 50 + (avg(p) - avg(e)) * 2)));
}

export function flee(state: BattleState, u: BattleUnit): boolean {
  if (!state.canFlee) return false;
  const ok = state.rng.chance(fleeChance(state) / 100);
  state.log.push(ok ? '🏃 O esquadrão fugiu!' : '🏃 A fuga falhou!');
  state.turn.acted = true;
  if (ok) state.outcome = 'fled';
  void u;
  return ok;
}

// ───────────────────────────── turnos ─────────────────────────────

function beginTurn(state: BattleState, u: BattleUnit): void {
  u.defending = false;
  u.overwatch = false;
  if (u.statuses.congelado) {
    state.log.push(`❄ ${u.name} está congelado e perde o turno.`);
    removeStatus(u, 'congelado');
    u.gauge = 0;
    state.activeUid = null;
    return;
  }
  if (u.statuses.queimando && !u.statuses.molhado) damage(state, u, Math.round(u.maxHp * 0.07) + 2, undefined, 'fogo');
  if (u.statuses.envenenado) damage(state, u, Math.round(u.maxHp * 0.05) + 2, undefined, 'veneno');
  for (const id of Object.keys(u.cooldowns)) {
    u.cooldowns[id] = (u.cooldowns[id] ?? 0) - 1;
    if (u.cooldowns[id]! <= 0) delete u.cooldowns[id];
  }
  const skip = u.alive && fx.turnStart(state, u);
  const wasSubmerged = !!u.statuses.submerso;
  for (const k of Object.keys(u.statuses) as StatusId[]) {
    if (k === 'aprisionado' || k === 'semente') continue;
    const v = (u.statuses[k] ?? 0) - 1;
    if (v <= 0) {
      delete u.statuses[k];
      fx.onStatusExpired(state, u, k);
    } else u.statuses[k] = v;
  }
  if (skip) {
    u.gauge = 0;
    state.activeUid = null;
    checkVictory(state);
    return;
  }
  if (wasSubmerged && !u.statuses.submerso && u.hidden) {
    u.hidden = false;
    state.log.push(`${u.name} emergiu da neve.`);
  }
  if (!u.alive) {
    state.activeUid = null;
    checkVictory(state);
  }
}

/** Avança o tempo até a próxima unidade com barra cheia. Retorna a unidade ativa (ou null). */
export function advance(state: BattleState): BattleUnit | null {
  if (state.outcome) return null;
  const current = activeUnit(state);
  if (current) return current;
  const alive = () => state.units.filter((u) => u.alive);
  if (!alive().length) return null;
  let ready = alive().filter((u) => u.gauge >= 100 - 1e-6);
  if (!ready.length) {
    const dt = Math.min(...alive().map((u) => (100 - u.gauge) / rate(u)));
    const end = state.time + dt;
    while (state.nextRoundAt <= end && !state.outcome) {
      const step = state.nextRoundAt - state.time;
      for (const u of alive()) u.gauge += rate(u) * step;
      state.time = state.nextRoundAt;
      environmentTick(state);
      fx.roundTick(state);
      state.round += 1;
      state.nextRoundAt += ROUND_TIME;
      checkVictory(state);
    }
    if (state.outcome) return null;
    const rest = end - state.time;
    for (const u of alive()) u.gauge += rate(u) * rest;
    state.time = end;
    ready = alive().filter((u) => u.gauge >= 100 - 1e-6);
  }
  ready.sort((a, b) => b.gauge - a.gauge || b.attrs.spd - a.attrs.spd || (a.team === 'player' ? -1 : 1));
  const u = ready[0];
  if (!u) return null;
  u.gauge = 100;
  state.activeUid = u.uid;
  state.turn = { moved: false, acted: false, startX: u.x, startY: u.y };
  beginTurn(state, u);
  return activeUnit(state) ?? null;
}

/** Encerra o turno. Só mover (sem agir) deixa a próxima barra em 50%. */
export function endTurn(state: BattleState): void {
  const u = activeUnit(state);
  if (u) u.gauge = state.turn.moved && !state.turn.acted ? MOVE_ONLY_GAUGE : 0;
  if (u) fx.turnEnd(state, u);
  state.activeUid = null;
  checkVictory(state);
}

export function checkVictory(state: BattleState): void {
  if (state.outcome) return;
  const players = state.units.filter((u) => u.alive && u.team === 'player');
  const enemies = state.units.filter((u) => u.alive && u.team === 'enemy');
  if (!players.length) {
    state.outcome = 'defeat';
    return;
  }
  const v = state.victory;
  if (!enemies.length) state.outcome = 'victory';
  else if (v.type === 'target') {
    const t = state.units.find((u) => u.uid === v.uid);
    if (t && !t.alive) state.outcome = 'victory';
  } else if (v.type === 'survive' && state.round > v.rounds) state.outcome = 'victory';
  else if (v.type === 'escape' && !state.activeUid) {
    if (players.every((u) => tileAt(state.map, u.x, u.y)?.spawn === 'extract')) state.outcome = 'victory';
  }
  if (state.outcome) state.log.push(state.outcome === 'victory' ? '🏆 Vitória!' : 'Derrota.');
}

export function killXp(level: number): number {
  return XP_PER_KILL_BASE + level * 2;
}

export function buildResult(state: BattleState, context: BattleContext): BattleResult {
  return {
    outcome: state.outcome === 'victory' ? 'victory' : state.outcome === 'fled' ? 'fled' : 'defeat',
    context,
    rounds: state.round,
    units: state.units
      .filter((u) => u.charId)
      .map((u) => ({
        charId: u.charId!,
        alive: u.alive,
        hp: u.hp,
        mp: u.mp,
        maxHp: u.maxHp,
        startHp: u.startHp,
        kills: u.kills,
        killXp: u.killXp,
        items: [...u.items],
      })),
  };
}
