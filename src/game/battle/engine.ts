import { Rng } from '@core';
import { DB, item, skill, type ComboDef, type Element, type SkillDef } from '../data';
import { addStatus, applyElementToTile, applyElementToUnit, environmentTick, removeStatus, tileEffectsOnUnit, unitAt } from './elements';
import { COVER_PENALTY, coverAgainst, coverPropAgainst, type CoverLevel } from './cover';
import { damageProp, propHp } from './props';
import { hasLos } from './los';
import { DIRS, cloneMap, idx, inBounds, isWalkable, manhattan, tileAt, xy, type BattleMap } from './map';
import type { BattleContext, BattleResult, BattleSetup, BattleState, BattleUnit, StatusId, Team, Wave } from './types';
import * as fx from './creature_fx';
import * as stats from '../rules/stats';
import { SKILL_MAX_RANK } from '../rules/skill_tree';
import BASE_DATA from '../data/base/base.json';
import CAPITALS from '../data/world/capitals.json';

const STUDY = BASE_DATA.research.studyBonus;
const HUNT = CAPITALS.hunterMark;

/** Tempo para uma unidade de Velocidade 10 encher a barra = 1 rodada de ambiente. */
/** Segundos da linha do tempo entre viradas de rodada (ambiente, zonas, regeneração). */
export const ROUND_TIME = stats.ROUND_SECONDS;
export const VISION_RANGE = 8;
export const CONE_RANGE = 6;
export const CONE_HALF_ANGLE = Math.PI / 3;
/** Barra com que começa quem encerra o turno sem agir (só andou ou esperou). */
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

/**
 * Retângulo da formação inicial: ⌈largura/3⌉ × ⌈altura/3⌉ casas (1/3 do mapa na horizontal e na
 * vertical), em volta de onde o esquadrão começou e preso às bordas do mapa. Fixo durante a formação.
 */
export function deploymentRect(state: BattleState): { x0: number; y0: number; x1: number; y1: number } {
  if (state.deploy) return state.deploy;
  const { w, h } = state.map;
  const cw = Math.ceil(w / 3);
  const ch = Math.ceil(h / 3);
  const players = state.units.filter((u) => u.team === 'player' && u.alive);
  const cx = players.length ? players.reduce((s, u) => s + u.x, 0) / players.length : 0;
  const cy = players.length ? players.reduce((s, u) => s + u.y, 0) / players.length : h / 2;
  // Encosta na borda do lado em que o esquadrão está; na vertical, centraliza nele.
  const x0 = cx < w / 2 ? 0 : w - cw;
  const y0 = Math.max(0, Math.min(h - ch, Math.round(cy - (ch - 1) / 2)));
  state.deploy = { x0, y0, x1: x0 + cw - 1, y1: y0 + ch - 1 };
  return state.deploy;
}

/** Área de formação inicial do jogador: o retângulo de 1/3 do mapa (casas livres e andáveis). */
export function deploymentTiles(state: BattleState): Set<number> {
  const r = deploymentRect(state);
  const players = state.units.filter((u) => u.team === 'player' && u.alive);
  const enemyAt = new Set(state.units.filter((u) => u.team !== 'player' && u.alive).map((u) => idx(state.map, u.x, u.y)));
  const out = new Set<number>();
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++) {
      const i = idx(state.map, x, y);
      if (isWalkable(state.map.tiles[i]!) && !enemyAt.has(i)) out.add(i);
    }
  for (const p of players) out.add(idx(state.map, p.x, p.y));
  return out;
}

/** Formação: põe o herói na casa escolhida da área inicial (troca de lugar se já houver outro herói). */
export function deployUnit(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  if (u.team !== 'player' || !deploymentTiles(state).has(idx(state.map, x, y))) return false;
  const other = unitAt(state, x, y);
  if (other && other.team !== 'player') return false;
  if (other) [other.x, other.y] = [u.x, u.y];
  [u.x, u.y] = [x, y];
  return true;
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
    studied: setup.studied,
    hunted: setup.hunted,
    roundLimit: setup.roundLimit,
    waves: setup.waves?.length ? setup.waves.map((w) => ({ ...w, done: false })) : undefined,
    inverted: setup.inverted,
    enemyDmgMult: setup.difficulty && setup.difficulty.enemyDmg !== 1 ? setup.difficulty.enemyDmg : undefined,
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
  for (const a of setup.allies ?? []) a.ai = true;
  place(setup.allies ?? [], 'player');
  place(setup.enemies, 'enemy');
  // Dificuldade: vida dos inimigos (os de campo, as ondas e os reforços de fase).
  const hpMult = setup.difficulty?.enemyHp ?? 1;
  if (hpMult !== 1) {
    const scale = (u: BattleUnit) => {
      u.maxHp = Math.max(1, Math.round(u.maxHp * hpMult));
      u.hp = u.startHp = u.maxHp;
      for (const p of u.phases ?? []) for (const x of p.spawn ?? []) scale(x);
    };
    for (const u of [...setup.enemies, ...(state.waves ?? []).flatMap((w) => w.units)]) scale(u);
  }

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
  placeMissionPieces(state, setup);
  if (setup.stealthStart) for (const u of state.units) if (u.team === 'player' && !u.bound) u.hidden = true;
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

/** Objetivos e VIP: longe da área de início do jogador, em casas livres e andáveis. */
function placeMissionPieces(state: BattleState, setup: BattleSetup): void {
  const map = state.map;
  const defs = setup.objectives ?? [];
  if (!defs.length && !setup.vip) return;
  const starts = map.tiles.map((t, i) => (t.spawn === 'player' ? xy(map, i) : null)).filter((p): p is [number, number] => !!p);
  const [sx, sy] = starts.length ? starts[0]! : [0, 0];
  const free = map.tiles
    .map((t, i) => [t, ...xy(map, i)] as const)
    .filter(([t, x, y]) => isWalkable(t) && !t.p && !t.spawn && isFree(state, x, y))
    .sort((a, b) => manhattan(b[1], b[2], sx, sy) - manhattan(a[1], a[2], sx, sy));
  const far = free.slice(0, Math.max(defs.length + 2, Math.floor(free.length / 3)));
  const pick = (): [number, number] => {
    const i = state.rng.int(0, far.length - 1);
    const [, x, y] = far.splice(i, 1)[0]!;
    return [x, y];
  };
  state.objectives = [];
  for (const d of defs) {
    const [x, y] = pick();
    state.objectives.push({ ...d, x, y, progress: 0, done: false });
  }
  if (setup.vip) {
    const v = setup.vip.unit;
    v.vip = true;
    const cell = setup.vip.captive ? state.objectives.find((o) => o.kind === 'cela') : undefined;
    const [x, y] = cell ? [cell.x, cell.y] : starts[1] ?? pick();
    [v.x, v.y] = [x, y];
    if (cell) {
      v.bound = true;
      cell.releases = v.uid;
    }
    state.units.push(v);
  }
}

/** Objetivos ao alcance de Interagir (adjacente ou na mesma casa). */
export function interactTargets(state: BattleState, u: BattleUnit): number[] {
  return (state.objectives ?? []).filter((o) => !o.done && manhattan(u.x, u.y, o.x, o.y) <= 1).map((o) => idx(state.map, o.x, o.y));
}

/** Interagir: abre a cela, pega o baú, decifra runas… (alguns levam mais de uma ação). */
export function interact(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const o = (state.objectives ?? []).find((ob) => !ob.done && ob.x === x && ob.y === y && manhattan(u.x, u.y, x, y) <= 1);
  if (!o) return false;
  faceTowards(u, x, y);
  o.progress += 1;
  if (o.progress >= o.turns) {
    o.done = true;
    state.log.push(`🖐 ${u.name}: ${o.label} — concluído.`);
    state.events.push({ type: 'text', x, y, text: `✔ ${o.label}`, color: '#a5d6a7' });
    const freed = o.releases ? unitById(state, o.releases) : undefined;
    if (freed) {
      freed.bound = false;
      state.log.push(`🔓 ${freed.name} está livre!`);
    }
  } else {
    state.log.push(`🖐 ${u.name}: ${o.label} (${o.progress}/${o.turns}).`);
    state.events.push({ type: 'text', x, y, text: `${o.progress}/${o.turns}`, color: '#fff59d' });
  }
  finishAction(state, u);
  return true;
}

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

/** Quanto a barra de ação enche por segundo: 100 a cada intervalo de ação (450 / (VEL + 25) s). */
export function rate(u: BattleUnit): number {
  return (100 / stats.actionInterval(u.attrs.spd)) * (u.statuses.eletrocutado ? 0.6 : 1) * fx.rateMult(u);
}

/** Ordem prevista dos próximos turnos (linha do tempo). */
export function predictOrder(state: BattleState, count: number): string[] {
  const sim = state.units.filter((u) => u.alive).map((u) => ({ uid: u.uid, g: u.gauge, r: rate(u), spd: u.attrs.spd }));
  const out: string[] = [];
  if (state.activeUid) {
    out.push(state.activeUid);
    const a = sim.find((s) => s.uid === state.activeUid);
    if (a) a.g = !state.turn.acted ? MOVE_ONLY_GAUGE : 0;
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
  const budget = state.activeUid === u.uid ? Math.min(moveBudget(u), state.turn.moveLeft ?? Infinity) : moveBudget(u);
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
  state.moveShots = [];
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
    // Ataque de oportunidade: sair do alcance corpo a corpo de um inimigo provoca um golpe.
    for (const o of opponents(state, u)) {
      if (pursued.has(o.uid) || !opportunityFrom(state, o, u, u.x, u.y, x, y)) continue;
      pursued.add(o.uid);
      o.oaUsed = true;
      faceTowards(o, u.x, u.y);
      state.log.push(`⚔ ${o.name}: ataque de oportunidade em ${u.name}!`);
      (state.moveShots ??= []).push({ uid: o.uid, target: u.uid, step: done.length, kind: 'opportunity' });
      resolveAttack(state, o, u, 'basic', 0, undefined, 0, 1);
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
      state.events.push({ type: 'spotted', uid: u.uid });
    }
    if (triggerOverwatch(state, u, done.length)) {
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
  // Gasta só o caminho feito: o resto do deslocamento fica para depois (andar, agir, andar).
  const spent = reach.cost.get(idx(state.map, u.x, u.y)) ?? 0;
  if (state.activeUid === u.uid) state.turn.moveLeft = Math.max(0, (state.turn.moveLeft ?? moveBudget(u)) - spent);
  if (done.length) fx.bag(u).still = 0;
  return done;
}

/**
 * `o` dá ataque de oportunidade em `mover` que sai de (fx, fy) para (tx, ty)? Só corpo a corpo, um por
 * turno de quem ataca, e só se o alvo estava ao alcance e deixa de estar (escondido não provoca).
 */
function opportunityFrom(state: BattleState, o: BattleUnit, mover: BattleUnit, fx_: number, fy: number, tx: number, ty: number): boolean {
  if (!o.alive || o.oaUsed || o.weaponRange > 1 || mover.hidden || !fx.canStrike(o)) return false;
  if (o.statuses.atordoado || o.statuses.congelado || o.statuses.semente || o.statuses.sem_reacao) return false;
  const reach = (x: number, y: number) => manhattan(o.x, o.y, x, y) === 1 && inRange(state, o, 1, x, y);
  return reach(fx_, fy) && !reach(tx, ty);
}

/** Ataques de oportunidade que um caminho provocaria (previsão para o indicador, sem sortear nada). */
export function opportunityThreats(state: BattleState, u: BattleUnit, path: [number, number][]): { step: number; uid: string; x: number; y: number }[] {
  const out: { step: number; uid: string; x: number; y: number }[] = [];
  const used = new Set<string>();
  let [cx, cy] = [u.x, u.y];
  path.forEach(([x, y], step) => {
    for (const o of opponents(state, u)) {
      if (used.has(o.uid) || !opportunityFrom(state, o, u, cx, cy, x, y)) continue;
      used.add(o.uid);
      out.push({ step, uid: o.uid, x: cx, y: cy });
    }
    [cx, cy] = [x, y];
  });
  return out;
}

/** Habilidades que podem ser preparadas na prontidão: dano num alvo ou em área em volta dele. */
export function readyable(s: SkillLike): boolean {
  const def = DB.skills[s.id];
  if (!def || def.passive || def.classId === 'fera' || s.power <= 0) return false;
  if (!(s.kind === 'physical' || s.kind === 'magic' || s.kind === 'ranged')) return false;
  return (s.target === 'enemy' && (s.shape === 'single' || s.shape === 'radius')) || (s.target === 'tile' && s.shape === 'radius' && (s.radius ?? 0) > 0);
}

/** Alcance da prontidão: o da habilidade preparada ou o da arma. */
export function overwatchRange(u: BattleUnit): number {
  return u.overwatchSkill ? skillRange(u, skill(u.overwatchSkill)) : u.weaponRange;
}

/** Dispara a prontidão de `o` no primeiro inimigo que se move dentro do alcance. */
function triggerOverwatch(state: BattleState, mover: BattleUnit, step: number): boolean {
  if (mover.hidden) return false;
  let fired = false;
  for (const o of opponents(state, mover)) {
    if (!o.overwatch || !mover.alive || !o.alive) continue;
    const sk = o.overwatchSkill ? (skill(o.overwatchSkill) as SkillLike) : undefined;
    if (!inRange(state, o, overwatchRange(o), mover.x, mover.y, 1, !(sk && DB.skills[sk.id]?.fx?.homing))) continue;
    o.overwatch = false;
    delete o.overwatchSkill;
    faceTowards(o, mover.x, mover.y);
    (state.moveShots ??= []).push({ uid: o.uid, target: mover.uid, step, skill: sk?.id, kind: 'overwatch' });
    if (!sk) {
      state.log.push(`🎯 ${o.name} (prontidão) reage a ${mover.name}!`);
      resolveAttack(state, o, mover, 'basic', 0, undefined, 0, 1);
    } else {
      state.log.push(`🎯 ${o.name} solta ${sk.name} preparada em ${mover.name}!`);
      readiedStrike(state, o, sk, mover);
    }
    fired = true;
  }
  return fired;
}

/** Golpe preparado: dano, elemento e estado da habilidade no alvo (e na área, se tiver raio). */
function readiedStrike(state: BattleState, o: BattleUnit, sk: SkillLike, mover: BattleUnit): void {
  const area: [number, number][] = (sk.radius ?? 0) > 0 ? areaOf(state, o, sk, mover.x, mover.y) : [[mover.x, mover.y]];
  for (const [tx, ty] of area) {
    if (sk.element) applyElementToTile(state, tx, ty, sk.element);
    state.events.push({ type: 'fx', x: tx, y: ty, element: sk.element ?? 'hit' });
    const t = unitAt(state, tx, ty);
    // Fogo amigo como nas outras áreas: só não acerta quem lançou.
    if (!t || t === o || (t.team === o.team && !stats.FRIENDLY_FIRE)) continue;
    const hit = resolveAttack(state, o, t, sk.kind, sk.power, sk.element, sk.accuracy ?? 0, 1, sk);
    if (hit && sk.status && t.alive) addStatus(t, sk.status.id as never, sk.status.turns);
  }
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

export type SkillLike = Pick<SkillDef, 'range' | 'target' | 'shape' | 'radius' | 'kind' | 'power' | 'element' | 'accuracy' | 'status' | 'scaling'> & {
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
      // O jogador também pode mirar o ataque básico numa cobertura para quebrá-la.
      const prop = s.id === BASIC_ATTACK.id && u.team === 'player' && propTarget(state, x, y) && vision.has(idx(state.map, x, y));
      if (s.target === 'enemy' && !prop && !(target && target.team !== u.team && visibleToPlayerOrAi(state, u, target, vision))) continue;
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

/**
 * Pipeline central de um golpe (ver docs/design/matematica.md): poder bruto (arma + atributos) →
 * multiplicador da habilidade → modificadores ofensivos → resistência (com penetração) → elemento.
 * O crítico é aplicado ao resolver. `power` é o poder da ficha (0 = ataque básico).
 */
export function previewHit(state: BattleState, a: BattleUnit, d: BattleUnit, kind: HitKind, power: number, el?: Element, accBonus = 0, mult = 1, sk?: SkillLike): HitPreview {
  const magic = kind === 'magic';
  const m = fx.hitMods(state, a, d, magic, sk, el);
  const insp = a.statuses.inspirado ? 1.25 : 1;
  const def = sk ? DB.skills[sk.id] : undefined;
  const defScale = def?.fx?.defScaling ?? 0;
  const scaling = def?.scaling ?? (magic ? { int: 1 } : { [a.attackAttr]: 1 });
  const weaponBase = magic ? (stats.magicUsesWeapon(a.weaponType, def?.scaling) ? a.weaponAtk : 0) : a.weaponAtk;
  const raw = stats.rawPower(weaponBase, a.attrs, scaling, a.level) + (a.def + a.attrs.vit) * defScale;
  // Fortificado, quebrado e penetração mexem na defesa efetiva do alvo (m.def).
  const res = magic ? stats.magicResistance(d.attrs.int * m.def) : stats.physicalResistance(d.def * m.def);
  let dmg = raw * stats.skillMultiplier(power) * insp * (1 - res) * elementMult(d, el) * mult * m.dmg;
  // Criatura estudada na Biblioteca: o jogador acerta e fere mais (data/base/base.json).
  const studied = a.team === 'player' && !!d.enemyId && !!state.studied?.includes(d.enemyId);
  if (studied) {
    dmg *= 1 + STUDY.damage;
    accBonus += STUDY.accuracy;
  }
  // Marca do Caçador (Verdelume): mais dano e crítico contra a espécie (data/world/capitals.json).
  const hunted = a.team === 'player' && !!d.enemyId && !!state.hunted?.includes(d.enemyId);
  if (hunted) dmg *= 1 + HUNT.damage;
  if (d.defending) dmg *= 0.5;
  if (d.statuses.congelado && !magic) dmg *= 1.3;
  let chance: number;
  const cover = magic ? 'none' : coverAgainst(state.map, d.x, d.y, a.x, a.y);
  const h = stats.BALANCE.hit;
  if (magic) chance = stats.magicHitChance(d.evasion - d.level, m.accuracy + (studied ? STUDY.accuracy : 0), m.evasion);
  else chance = stats.physicalHitChance(a.accuracy + accBonus + m.accuracy, d.evasion + m.evasion, heightDiff(state, a, d) * h.heightBonus - (d.defending ? h.defendingPenalty : 0) - COVER_PENALTY[cover]);
  if (d.statuses.congelado) chance = 100;
  if (m.immune) return { chance: 0, min: 0, max: 0, crit: 0, cover };
  return { chance: Math.round(chance), min: Math.max(1, Math.floor(dmg * 0.9)), max: Math.max(1, Math.ceil(dmg * 1.1)), crit: Math.min(100, a.crit + m.crit + (hunted ? HUNT.crit : 0)), cover };
}

export function damage(state: BattleState, target: BattleUnit, amount: number, attacker: BattleUnit | undefined, el: Element | undefined, crit = false, magic = false): void {
  if (!target.alive) return;
  if (state.enemyDmgMult && attacker?.team === 'enemy' && target.team === 'player') amount = Math.max(1, Math.round(amount * state.enemyDmgMult));
  amount = fx.beforeDamage(state, target, amount, attacker, el);
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - amount);
  target.lowHp = Math.min(target.lowHp ?? target.hp, target.hp);
  state.events.push({ type: 'damage', uid: target.uid, amount, crit, element: el });
  if (target.hp > 0 && target.phases) bossPhases(state, target);
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
    // Tiro que erra um alvo protegido acerta a cobertura (dano médio, sem sorteio a mais).
    const cover = p.max > 0 && p.cover !== 'none' ? coverPropAgainst(state.map, d.x, d.y, a.x, a.y) : null;
    if (cover) damageProp(state, cover[0], cover[1], Math.round((p.min + p.max) / 2));
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

/** Dano de um golpe em objeto: mesmo poder bruto do golpe em unidade, sem esquiva nem resistência. */
export function structureHit(u: BattleUnit, kind: HitKind, power: number): number {
  const magic = kind === 'magic';
  const weaponBase = magic ? (u.weaponType === 'varinha' || u.weaponType === 'bastao' ? u.weaponAtk : 0) : u.weaponAtk;
  return stats.structureDamage(stats.rawPower(weaponBase, u.attrs, magic ? { int: 1 } : { [u.attackAttr]: 1 }, u.level), power);
}

/** Objeto que pode ser alvo do ataque básico em (x, y): sem unidade em cima e com cobertura. */
export function propTarget(state: BattleState, x: number, y: number): boolean {
  return !unitAt(state, x, y) && propHp(state.map, x, y) > 0;
}

export function attack(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  if (propTarget(state, x, y)) {
    // Quebrar cobertura: acerto garantido, sem crítico.
    if (!inRange(state, u, skillRange(u, BASIC_ATTACK), x, y) || !fx.canStrike(u)) return false;
    faceTowards(u, x, y);
    damageProp(state, x, y, structureHit(u, u.weaponType === 'varinha' ? 'magic' : 'basic', 0));
    finishAction(state, u);
    return true;
  }
  const target = unitAt(state, x, y);
  if (!target || target.team === u.team || !inRange(state, u, skillRange(u, BASIC_ATTACK), x, y) || !fx.canStrike(u)) return false;
  faceTowards(u, x, y);
  const imbue = fx.imbueOf(u);
  const el = imbue?.element ?? (u.weaponType === 'natural' ? fx.currentStance(state, u)?.element ?? u.element : undefined);
  const kind: HitKind = u.weaponType === 'varinha' || imbue?.magic ? 'magic' : 'basic';
  const behind = fx.isBehind(u, target);
  const events = state.events.length;
  const hit = resolveAttack(state, u, target, kind, imbue?.bonus ?? 0, el, 0, 1);
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
  // A forma fortificada divide a recarga com a normal e só existe com a habilidade no Nv 5.
  const cdId = def?.fortifiedOf ?? s.id;
  if ((u.cooldowns[cdId] ?? 0) > 0) return false;
  if (def?.fortifiedOf && ((u.skillRanks?.[def.fortifiedOf] ?? 1) < SKILL_MAX_RANK || !u.skills.includes(def.fortifiedOf))) return false;
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
  if (cd > 0) u.cooldowns[DB.skills[s.id]?.fortifiedOf ?? s.id] = cd;
  if (combo) {
    combo.partner.mp -= skill(combo.partnerSkill).mp;
    combo.partner.gauge = 0;
    state.log.push(`⚡ Combo! ${u.name} + ${combo.partner.name}: ${s.name}`);
  } else state.log.push(`${u.name} usa ${s.name}.`);
  state.turn.timeMult = DB.skills[s.id]?.timeMult ?? 1;
  const wasHidden = u.hidden;
  if (fx.isFera(s)) return fx.castCreatureSkill(state, u, s, x, y);
  if (s.target !== 'self') faceTowards(u, x, y);

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
        heal(state, t, Math.round(stats.healPower(u.attrs, u.healBonus, s.power, u.level, s.scaling) * fx.healMult(state, u, s.id)));
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
  const mult = 1;
  if (s.element) for (const [tx, ty] of area) applyElementToTile(state, tx, ty, s.element);
  // Habilidades de dano em área quebram as coberturas que pegam.
  const areaSkill = s.shape !== 'single' || (s.radius ?? 0) > 0;
  if (areaSkill && (s.kind === 'physical' || s.kind === 'magic'))
    for (const [tx, ty] of area) if (propTarget(state, tx, ty)) damageProp(state, tx, ty, structureHit(u, s.kind, s.power));
  for (const [tx, ty] of area) {
    state.events.push({ type: 'fx', x: tx, y: ty, element: s.element ?? 'hit' });
    const t = unitAt(state, tx, ty);
    // Fogo amigo: só habilidades de área atingem aliados; quem lança nunca se acerta.
    const areaHit = stats.FRIENDLY_FIRE && (s.shape !== 'single' || (s.radius ?? 0) > 0);
    if (!t || t === u || (s.target === 'enemy' && t.team === u.team && !areaHit)) continue;
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

/** Usos que ainda restam do item no espaço `slot` nesta batalha. */
export function itemUsesLeft(u: BattleUnit, slot: number): number {
  const id = u.items[slot];
  if (!id) return 0;
  return u.itemUses?.[slot] ?? DB.items[id]?.uses ?? 1;
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
  if (!itemId || itemUsesLeft(u, slot) <= 0) return false;
  const it = item(itemId);
  const use = it.use ?? {};
  if (use.heal || use.mp) {
    const t = unitAt(state, x, y);
    if (!t || t.team !== u.team || manhattan(u.x, u.y, x, y) > 1) return false;
    if (use.heal) heal(state, t, use.heal);
    for (const st of use.cure ?? []) removeStatus(t, st as StatusId);
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
  // Utilitários não somem: gastam um uso desta batalha e recarregam depois (D56).
  (u.itemUses ??= u.items.map((id) => (id ? DB.items[id]?.uses ?? 1 : 0)))[slot] = itemUsesLeft(u, slot) - 1;
  finishAction(state, u);
  return true;
}

// ───────────────────────────── captura (D67) ─────────────────────────────

const CAPTURE = BASE_DATA.capture;

/** Humano inimigo adjacente com pouca vida pode ser rendido. */
export function capturable(u: BattleUnit, t: BattleUnit): boolean {
  if (!t.alive || t.team === u.team || !t.enemyId || DB.enemies[t.enemyId]?.kind !== 'human') return false;
  if (t.statuses.invulneravel || manhattan(u.x, u.y, t.x, t.y) !== 1) return false;
  return t.hp <= t.maxHp * CAPTURE.hpPct;
}

/** Chance (%) de render: 50% + o melhor bônus de corda/rede que o herói carrega. */
export function captureChance(u: BattleUnit): number {
  const bonus = Math.max(0, ...u.items.map((id) => (id ? DB.items[id]?.captureBonus ?? 0 : 0)));
  return Math.min(CAPTURE.maxChance, CAPTURE.chance + bonus);
}

export function captureTargets(state: BattleState, u: BattleUnit): number[] {
  return state.units.filter((t) => capturable(u, t)).map((t) => idx(state.map, t.x, t.y));
}

/** Tenta render o inimigo em (x, y). Falhar gasta a ação. */
export function capture(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const t = unitAt(state, x, y);
  if (!t || !capturable(u, t)) return false;
  faceTowards(u, x, y);
  if (state.rng.chance(captureChance(u) / 100)) {
    t.alive = false;
    t.captured = true;
    t.statuses = {};
    u.killXp += t.xpReward ?? killXp(t.level);
    state.events.push({ type: 'text', x, y, text: '⛓ Rendido!', color: '#ffe082' });
    state.log.push(`⛓ ${u.name} rendeu ${t.name}.`);
  } else {
    state.events.push({ type: 'text', x, y, text: 'Resistiu!', color: '#ff8a80' });
    state.log.push(`${t.name} resiste à captura de ${u.name}.`);
  }
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
  // Passiva do Ladino: uma vez por batalha, esconder-se não gasta a ação.
  if (fx.useFreeHide(u)) {
    state.log.push(`⚡ ${u.name} se esconde sem perder a ação.`);
    return ok;
  }
  finishAction(state, u, ok);
  return ok;
}

/**
 * Prontidão: atira no primeiro inimigo que se mover dentro do alcance. Com `skillId`, prepara a
 * habilidade: o MP e a recarga são pagos agora e, se ninguém entrar no alcance até o próximo turno,
 * a magia se desfaz sem devolver o MP.
 */
export function setOverwatch(state: BattleState, u: BattleUnit, skillId?: string): boolean {
  if (skillId) {
    const sk = skill(skillId) as SkillLike;
    if (!u.skills.includes(skillId) || !readyable(sk) || !canCast(u, sk)) return false;
    u.mp -= fx.mpCost(u, sk);
    const cd = DB.skills[skillId]?.cooldown ?? 0;
    if (cd > 0) u.cooldowns[skillId] = cd;
    u.overwatchSkill = skillId;
    state.log.push(`🎯 ${u.name} prepara ${sk.name} e fica de prontidão.`);
  } else {
    delete u.overwatchSkill;
    state.log.push(`🎯 ${u.name} está de prontidão.`);
  }
  u.overwatch = true;
  finishAction(state, u, true);
  return true;
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
  if (u.bound) {
    u.gauge = 0;
    state.activeUid = null;
    return;
  }
  u.defending = false;
  if (u.overwatch && u.overwatchSkill) state.log.push(`💨 ${skill(u.overwatchSkill).name} preparada por ${u.name} se desfez (o MP foi gasto).`);
  u.overwatch = false;
  delete u.overwatchSkill;
  u.oaUsed = false;
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

/**
 * Avança a linha do tempo no máximo `maxDt` segundos (ou até alguém encher a barra) e, se alguém
 * estiver pronto, começa o turno dele. Retorna a unidade ativa (ou null se o tempo só passou).
 * A cena chama em pedaços para mostrar as barras enchendo; `advance` chama de uma vez.
 */
export function stepTime(state: BattleState, maxDt: number): BattleUnit | null {
  if (state.outcome) return null;
  const current = activeUnit(state);
  if (current) return current;
  const alive = () => state.units.filter((u) => u.alive);
  if (!alive().length) return null;
  let ready = alive().filter((u) => u.gauge >= 100 - 1e-6);
  if (!ready.length) {
    const toNext = Math.min(...alive().map((u) => (100 - u.gauge) / rate(u)));
    const dt = Math.min(toNext, Math.max(0, maxDt));
    const end = state.time + dt;
    while (state.nextRoundAt <= end && !state.outcome) {
      const step = state.nextRoundAt - state.time;
      for (const u of alive()) u.gauge += rate(u) * step;
      state.time = state.nextRoundAt;
      environmentTick(state);
      fx.roundTick(state);
      state.round += 1;
      state.nextRoundAt += ROUND_TIME;
      for (const w of state.waves ?? []) if (!w.done && w.round <= state.round) spawnWave(state, w);
      checkVictory(state);
    }
    if (state.outcome) return null;
    const rest = end - state.time;
    for (const u of alive()) u.gauge += rate(u) * rest;
    state.time = end;
    if (dt < toNext - 1e-9) return null;
    ready = alive().filter((u) => u.gauge >= 100 - 1e-6);
  }
  ready.sort((a, b) => b.gauge - a.gauge || b.attrs.spd - a.attrs.spd || (a.team === 'player' ? -1 : 1));
  const u = ready[0];
  if (!u) return null;
  u.gauge = 100;
  state.activeUid = u.uid;
  state.turn = { moved: false, acted: false, startX: u.x, startY: u.y, moveLeft: moveBudget(u) };
  beginTurn(state, u);
  return activeUnit(state) ?? null;
}

/** Avança o tempo até a próxima unidade com barra cheia. Retorna a unidade ativa (ou null). */
export function advance(state: BattleState): BattleUnit | null {
  return stepTime(state, Infinity);
}

/** Encerra o turno. Sem agir (só andar ou esperar) a próxima barra começa em 50%. */
export function endTurn(state: BattleState): void {
  const u = activeUnit(state);
  // Habilidades lentas (custo de tempo > 1) começam a próxima espera abaixo de zero; rápidas, acima.
  if (u) u.gauge = (!state.turn.acted ? MOVE_ONLY_GAUGE : 0) - 100 * ((state.turn.timeMult ?? 1) - 1);
  if (u) fx.turnEnd(state, u);
  state.activeUid = null;
  checkVictory(state);
}

export function checkVictory(state: BattleState): void {
  if (state.outcome) return;
  const players = state.units.filter((u) => u.alive && u.team === 'player');
  const enemies = state.units.filter((u) => u.alive && u.team === 'enemy');
  if (!players.some((u) => !u.ai)) {
    state.outcome = 'defeat';
    return;
  }
  const v = state.victory;
  const vip = state.units.find((u) => u.vip);
  if (vip && !vip.alive) {
    state.outcome = 'defeat';
    state.log.push(`☠ ${vip.name} morreu — missão fracassada.`);
    return;
  }
  if (v.type === 'interact' && (state.objectives ?? []).length && state.objectives!.every((o) => o.done)) state.outcome = 'victory';
  else if (!enemies.length && pendingWave(state)) spawnWave(state, pendingWave(state)!);
  else if (!enemies.length) state.outcome = 'victory';
  else if (v.type === 'target') {
    const t = state.units.find((u) => u.uid === v.uid);
    if (t && !t.alive) state.outcome = 'victory';
  } else if (v.type === 'survive' && state.round > v.rounds) state.outcome = 'victory';
  else if (v.type === 'escape' && !state.activeUid) {
    if (players.filter((u) => !u.ai).every((u) => tileAt(state.map, u.x, u.y)?.spawn === 'extract')) state.outcome = 'victory';
  }
  if (!state.outcome && state.roundLimit && state.round > state.roundLimit) {
    state.outcome = 'defeat';
    state.log.push('⌛ O tempo acabou.');
  }
  if (state.outcome) state.log.push(state.outcome === 'victory' ? '🏆 Vitória!' : 'Derrota.');
}

// ───────────────────────────── história: ondas e fases ─────────────────────────────

function pendingWave(state: BattleState): Wave | undefined {
  return (state.waves ?? []).filter((w) => !w.done).sort((a, b) => a.round - b.round)[0];
}

/** Põe unidades novas em campo: casas livres do lado inimigo (ou, sem vaga, qualquer casa livre). */
export function spawnUnits(state: BattleState, units: BattleUnit[], near?: { x: number; y: number }): BattleUnit[] {
  const map = state.map;
  const taken = new Set(state.units.filter((u) => u.alive).map((u) => idx(map, u.x, u.y)));
  let spots = spawnTiles(map, units[0]?.team === 'player' ? 'player' : 'enemy');
  if (near) spots = [...spots].sort((a, b) => Math.abs(a[0] - near.x) + Math.abs(a[1] - near.y) - (Math.abs(b[0] - near.x) + Math.abs(b[1] - near.y)));
  const placed: BattleUnit[] = [];
  for (const u of units) {
    const spot = spots.find(([x, y]) => !taken.has(idx(map, x, y)));
    if (!spot) break;
    [u.x, u.y] = spot;
    taken.add(idx(map, u.x, u.y));
    u.facing = u.team === 'player' ? 0 : 2;
    u.gauge = state.rng.range(0, 30);
    state.units.push(u);
    placed.push(u);
  }
  return placed;
}

function spawnWave(state: BattleState, w: Wave): void {
  w.done = true;
  const placed = spawnUnits(state, w.units);
  if (!placed.length) return;
  state.log.push(`⚠ ${w.say ?? `Reforços inimigos: ${[...new Set(placed.map((u) => u.name))].join(', ')}.`}`);
  state.events.push({ type: 'text', x: placed[0]!.x, y: placed[0]!.y, text: 'Reforços!', color: '#ff8a65' });
}

/** Fases de chefe: cada limiar de vida cruzado dispara uma vez (fala, cura, estados, reforços). */
function bossPhases(state: BattleState, u: BattleUnit): void {
  for (const p of u.phases ?? []) {
    if (p.done || u.hp > u.maxHp * p.at) continue;
    p.done = true;
    if (p.say) {
      state.log.push(`💀 ${u.name}: "${p.say}"`);
      state.events.push({ type: 'text', x: u.x, y: u.y, text: 'Nova fase!', color: '#ce93d8' });
    }
    if (p.heal) u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * p.heal));
    for (const s of p.statuses ?? []) u.statuses[s.id] = Math.max(u.statuses[s.id] ?? 0, s.turns);
    if (p.spawn?.length) spawnUnits(state, p.spawn, u);
  }
}

export function killXp(level: number): number {
  return XP_PER_KILL_BASE + level * 2;
}

export function buildResult(state: BattleState, context: BattleContext): BattleResult {
  return {
    outcome: state.outcome === 'victory' ? 'victory' : state.outcome === 'fled' ? 'fled' : 'defeat',
    context,
    rounds: state.round,
    defeated: state.units.filter((u) => u.team === 'enemy' && !u.alive && !u.captured && u.enemyId).map((u) => u.enemyId!),
    captured: state.units.filter((u) => u.team === 'enemy' && u.captured && u.enemyId).map((u) => ({ enemyId: u.enemyId!, name: u.name, level: u.level })),
    units: state.units
      .filter((u) => u.charId)
      .map((u) => ({
        charId: u.charId!,
        alive: u.alive,
        hp: u.hp,
        mp: u.mp,
        maxHp: u.maxHp,
        startHp: u.startHp,
        lowHp: Math.min(u.lowHp ?? u.hp, u.hp),
        kills: u.kills,
        killXp: u.killXp,
        items: [...u.items],
      })),
  };
}
