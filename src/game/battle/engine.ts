import { Rng } from '@core';
import BONDS from '../data/base/bonds.json';
import { FRICTION } from '../rules/personality';
import { DB, ORB_COMBOS, item, skill, type ComboDef, type Element, type OrbComboRule, type SkillDef } from '../data';
import { addStatus, applyElementToTile, applyElementToUnit, dissipateClouds, driftSmoke, environmentTick, removeStatus, tileEffectsOnUnit, unitAt } from './elements';
import { COVER_PENALTY, coverAgainst, coverPropAgainst, type CoverLevel } from './cover';
import { damageProp, propHp } from './props';
import { hasLos, lineTiles, losBlocker, obscuredBy } from './los';
import { CLOUDS, DIRS, PROPS, TERRAIN, cloneMap, idx, inArea, inBounds, isWalkable, chebyshev, manhattan, tileAt, xy, type BattleMap } from './map';
import * as stack from './stack';
import * as tactics from './tactics';
import * as downed from './downed';
import * as build from './build';
import * as conc from './concentration';
import * as patrol from './patrol';
import * as scenery from './scenery';
import * as confine from './confine';
import type { BattleContext, BattleResult, BattleSetup, BattleState, BattleUnit, Objective, StatusId, Team, Wave } from './types';
import * as fx from './creature_fx';
import * as stats from '../rules/stats';
import { SKILL_MAX_RANK, rankCooldown } from '../rules/skill_tree';
import BASE_DATA from '../data/base/base.json';
import { RIVAL_DATA, rivalTaunt } from '../world/rival';
import CAPITALS from '../data/world/capitals.json';

const STUDY = BASE_DATA.research.studyBonus;
const HUNT = CAPITALS.hunterMark;

/** Tempo para uma unidade de Velocidade 10 encher a barra = 1 rodada de ambiente. */
/** Segundos da linha do tempo entre viradas de rodada (ambiente, zonas, regeneração). */
export const ROUND_TIME = stats.ROUND_SECONDS;
export const VISION_RANGE = 8;
/** Alcance da visão à noite. */
export const NIGHT_VISION_RANGE = 6;
export const CONE_RANGE = 6;
export const CONE_HALF_ANGLE = Math.PI / 3;
/** Fração do golpe de cada virote das bestas de mão gêmeas. */
export const TWIN_SHOT = 0.6;
/** Barra com que começa quem encerra o turno sem agir (só andou ou esperou). */
export const MOVE_ONLY_GAUGE = 50;
export const XP_PER_KILL_BASE = 10;
/** Turnos de Cegado causados pela granada de clarão. */
export const FLASH_TURNS = 2;

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

/** Fração do mapa (em cada direção) da área de formação inicial: 5/12 (entre 1/3 e metade). */
export const DEPLOY_FRACTION = 5 / 12;

/**
 * Retângulo da formação inicial: ⌈largura × 5/12⌉ × ⌈altura × 5/12⌉ casas (~42% do mapa na
 * horizontal e na vertical), em volta de onde o esquadrão começou e preso às bordas do mapa.
 * Fixo durante a formação.
 */
export function deploymentRect(state: BattleState): { x0: number; y0: number; x1: number; y1: number } {
  if (state.deploy) return state.deploy;
  const { w, h } = state.map;
  const cw = Math.ceil(w * DEPLOY_FRACTION);
  const ch = Math.ceil(h * DEPLOY_FRACTION);
  const players = state.units.filter((u) => u.team === 'player' && u.alive);
  const cx = players.length ? players.reduce((s, u) => s + u.x, 0) / players.length : 0;
  const cy = players.length ? players.reduce((s, u) => s + u.y, 0) / players.length : h / 2;
  // Encosta na borda do lado em que o esquadrão está; na vertical, centraliza nele.
  const x0 = cx < w / 2 ? 0 : w - cw;
  const y0 = Math.max(0, Math.min(h - ch, Math.round(cy - (ch - 1) / 2)));
  state.deploy = { x0, y0, x1: x0 + cw - 1, y1: y0 + ch - 1 };
  return state.deploy;
}

/** Área de formação inicial do jogador: o retângulo de 5/12 do mapa (casas livres e andáveis). */
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
    timeOfDay: setup.timeOfDay,
    enemyDmgMult: setup.difficulty && setup.difficulty.enemyDmg !== 1 ? setup.difficulty.enemyDmg : undefined,
    collapsed: setup.collapse ? 0 : undefined,
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
  // Patrulhas desavisadas (emboscada noturna): o esquadrão escolhe a hora de atacar.
  // Missões furtivas também: os guardas fazem a ronda em vez de esperar parados.
  if (setup.patrol || setup.stealthStart) patrol.assignPods(state);
  // Audição Aguçada: alguém do esquadrão ouve a emboscada a tempo.
  const listener = setup.ambush ? state.units.find((u) => u.team === 'player' && fx.passiveFx(u).some((f) => f.noSurprise)) : undefined;
  if (listener) {
    setup = { ...setup, ambush: false };
    state.ambush = false;
    state.log.push(`👂 ${listener.name} ouviu os passos: a emboscada falhou.`);
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
  // Roubo e suprimentos: pega e volta — a zona de fuga fica perto de onde o esquadrão entrou.
  if (defs.some((d) => isLoot(d.kind)) && !map.tiles.some((t) => t.spawn === 'extract')) {
    for (let r = 2; r <= 4 && !map.tiles.some((t) => t.spawn === 'extract'); r++)
      map.tiles.forEach((t, i) => {
        const [x, y] = xy(map, i);
        if (isWalkable(t) && !t.p && !t.spawn && chebyshev(x, y, sx, sy) <= r) t.spawn = 'extract';
      });
  }
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

/** Objetivos que são itens a carregar de volta (baú, documentos). */
export function isLoot(kind: string): boolean {
  return kind === 'bau' || kind === 'documentos';
}

/** O item que `u` carrega, se houver. */
export function lootOf(state: BattleState, u: BattleUnit): Objective | undefined {
  return (state.objectives ?? []).find((o) => o.carrier === u.uid && !o.extracted);
}

/** Carregador caído ou morto larga o item no chão; quem chega na zona de fuga entrega. */
function updateLoot(state: BattleState): void {
  for (const o of state.objectives ?? []) {
    if (!o.carrier || o.extracted) continue;
    const c = unitById(state, o.carrier);
    if (!c || !c.alive || c.downed) {
      if (c) [o.x, o.y] = [c.x, c.y];
      delete o.carrier;
      o.done = false;
      o.progress = Math.max(0, o.turns - 1);
      state.log.push(`📦 ${c?.name ?? 'O carregador'} larga ${o.label.toLowerCase()} no chão!`);
      state.events.push({ type: 'text', x: o.x, y: o.y, text: '📦 Largado!', color: '#ffb74d' });
    } else if (tileAt(state.map, c.x, c.y)?.spawn === 'extract') {
      o.extracted = true;
      [o.x, o.y] = [c.x, c.y];
      state.log.push(`🏁 ${c.name} entrega ${o.label.toLowerCase()} na zona de fuga.`);
      state.events.push({ type: 'text', x: c.x, y: c.y, text: '🏁 Entregue', color: '#a5d6a7' });
    }
  }
}

/** Objetivos ao alcance de Interagir (adjacente ou na mesma casa). */
export function interactTargets(state: BattleState, u: BattleUnit): number[] {
  const objs = (state.objectives ?? []).filter((o) => !o.done && chebyshev(u.x, u.y, o.x, o.y) <= 1).map((o) => idx(state.map, o.x, o.y));
  return [...new Set([...objs, ...doorTargets(state, u), ...downed.downedTargets(state, u), ...scenery.sceneryTargets(state, u), ...scenery.disarmTargets(state, u)])];
}

/** Interagir: abre a cela, pega o baú, decifra runas… (alguns levam mais de uma ação). */
export function interact(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const o = (state.objectives ?? []).find((ob) => !ob.done && ob.x === x && ob.y === y && chebyshev(u.x, u.y, x, y) <= 1);
  // Caído ao lado: estabilizar. Porta: abrir ou fechar não gasta a ação.
  if (!o && downed.downedTargets(state, u).includes(idx(state.map, x, y))) return downed.stabilize(state, u, x, y);
  if (!o && scenery.disarmTargets(state, u).includes(idx(state.map, x, y))) return scenery.disarm(state, u, x, y);
  if (!o && scenery.sceneryTargets(state, u).includes(idx(state.map, x, y))) return scenery.useScenery(state, u, x, y);
  if (!o) return toggleDoor(state, u, x, y);
  faceTowards(u, x, y);
  o.progress += 1;
  if (o.progress >= o.turns) {
    o.done = true;
    state.log.push(`🖐 ${u.name}: ${o.label} — concluído.`);
    state.events.push({ type: 'text', x, y, text: `✔ ${o.label}`, color: '#a5d6a7' });
    if (isLoot(o.kind)) {
      o.carrier = u.uid;
      state.log.push(`📦 ${u.name} carrega o item: leve-o de volta à zona de fuga perto do início.`);
    }
    const freed = o.releases ? unitById(state, o.releases) : undefined;
    if (freed) {
      freed.bound = false;
      state.log.push(`🔓 ${freed.name} está livre!`);
    }
  } else {
    state.log.push(`🖐 ${u.name}: ${o.label} (${o.progress}/${o.turns}).`);
    state.events.push({ type: 'text', x, y, text: `${o.progress}/${o.turns}`, color: '#fff59d' });
  }
  // Interagir é silencioso: quem está escondido continua escondido.
  finishAction(state, u, true);
  return true;
}

export function unitById(state: BattleState, uid: string | null): BattleUnit | undefined {
  return uid ? state.units.find((u) => u.uid === uid) : undefined;
}

export function activeUnit(state: BattleState): BattleUnit | undefined {
  return unitById(state, state.activeUid);
}

export function opponents(state: BattleState, u: BattleUnit): BattleUnit[] {
  // O prisioneiro ainda na cela não é alvo: os guardas querem o refém vivo.
  return state.units.filter((o) => o.alive && o.team !== u.team && !(o.vip && o.bound));
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
  const range = state.timeOfDay === 'noite' ? NIGHT_VISION_RANGE : VISION_RANGE;
  return opponents(state, u).find((o) => {
    // Colado é colado: quem está ao lado sempre percebe.
    if (chebyshev(o.x, o.y, u.x, u.y) <= 1) return true;
    if (!inCone(o, u.x, u.y) || Math.hypot(o.x - u.x, o.y - u.y) > range + (u.statuses.tocha ? 6 : 0) || !losBetween(state, o, u)) return false;
    // Furtivo atrás de cobertura (caixa, muro, barricada) do lado de quem olha: não é visto.
    return coverAgainst(state.map, u.x, u.y, o.x, o.y) === 'none';
  });
}

/** Linha de visão entre duas unidades, cada uma na altura onde pisa (andares e telhados). */
export function losBetween(state: BattleState, a: BattleUnit, b: BattleUnit): boolean {
  return hasLos(state.map, a.x, a.y, b.x, b.y, stack.unitH(state.map, a), stack.unitH(state.map, b));
}

/**
 * Altura de quem está (ou do que se mira) na coluna (x, y): a unidade que está lá, ou o topo da
 * coluna (telhado) se não há ninguém.
 */
export function targetH(state: BattleState, x: number, y: number): number {
  const o = unitAt(state, x, y);
  if (o) return stack.unitH(state.map, o);
  const t = tileAt(state.map, x, y);
  return t ? stack.columnTop(t) : 0;
}

/** Tiles vistos por um time (visão compartilhada do esquadrão). */
export function teamVision(state: BattleState, team: Team): Set<number> {
  const seen = new Set<number>();
  const map = state.map;
  // De dia, em campo aberto, não há névoa de guerra (escondidos continuam escondidos). Dentro das
  // casas (sob teto) a névoa continua: é preciso abrir a porta ou olhar pela janela.
  const day = state.timeOfDay === 'dia';
  if (day)
    for (let i = 0; i < map.tiles.length; i++) {
      const t = map.tiles[i]!;
      for (let l = 0; l < stack.levelCount(t); l++) if (!stack.covered(t, l)) seen.add(i + l * map.tiles.length);
    }
  const range = state.timeOfDay === 'noite' ? NIGHT_VISION_RANGE : VISION_RANGE;
  // À noite, o que está iluminado (fogo, brasas, lampiões) é visto de longe.
  const lit = state.timeOfDay === 'noite' ? litTiles(state) : null;
  for (const u of state.units) {
    if (!u.alive || u.team !== team) continue;
    const uh = stack.unitH(map, u);
    if (lit)
      for (const i of lit) {
        if (seen.has(i)) continue;
        const [x, y] = xy(map, i);
        if (Math.hypot(x - u.x, y - u.y) > stats.LIGHT.visionRange + 0.5) continue;
        if (hasLos(map, u.x, u.y, x, y, uh, map.tiles[i]!.h)) seen.add(i);
      }
    const ucell = stack.unitCell(map, u);
    for (let y = Math.max(0, u.y - range); y <= Math.min(map.h - 1, u.y + range); y++)
      for (let x = Math.max(0, u.x - range); x <= Math.min(map.w - 1, u.x + range); x++) {
        if (Math.hypot(x - u.x, y - u.y) > range + 0.5) continue;
        const t = map.tiles[idx(map, x, y)]!;
        for (let l = 0; l < stack.levelCount(t); l++) {
          const c = stack.cellId(map, x, y, l);
          if (seen.has(c)) continue;
          if (day && !stack.covered(t, l)) continue;
          if (c === ucell || hasLos(map, u.x, u.y, x, y, uh, stack.topOf(t, l))) seen.add(c);
        }
      }
  }
  return seen;
}

/**
 * Casas iluminadas à noite (chão): em volta de fogo, brasas, objetos que brilham (lampião, fogueira,
 * cristal, portal), lava e de quem está pegando fogo.
 */
export function litTiles(state: BattleState): Set<number> {
  const map = state.map;
  const out = new Set<number>();
  const shine = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(map.h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(map.w - 1, cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r + 0.3) out.add(idx(map, x, y));
  };
  const R = stats.LIGHT.radius;
  const BIG = stats.LIGHT.bigRadius;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[idx(map, x, y)]!;
      if (t.s === 'fogo' || t.glow || t.t === 'lava' || t.up?.some((p) => p.s === 'fogo')) shine(x, y, R);
      if (t.p && PROPS[t.p].light) shine(x, y, t.p === 'lampiao' || t.p === 'fogueira' ? BIG : R);
    }
  for (const u of state.units) if (u.alive && u.statuses.queimando) shine(u.x, u.y, 1);
  for (const u of state.units) if (u.alive && u.statuses.tocha) shine(u.x, u.y, stats.TACTICS.torchRadius);
  return out;
}

export function visibleToPlayer(state: BattleState, u: BattleUnit, vision: Set<number>): boolean {
  if (u.team === 'player' || state.revealAll) return true;
  return !u.hidden && vision.has(stack.unitCell(state.map, u));
}

// ───────────────────────────── movimento ─────────────────────────────

export interface Reach {
  cost: Map<number, number>;
  prev: Map<number, number>;
  /**
   * Caminho esperto até a célula: se der para chegar com menos ataques de oportunidade gastando
   * mais deslocamento (dentro do que resta), devolve esse caminho e o custo acumulado de cada passo.
   */
  smart?: (target: number) => { cells: number[]; costs: number[] } | undefined;
}

export function moveBudget(u: BattleUnit): number {
  if (fx.isRooted(u)) return 0;
  // Carregando um caído: anda 2 a menos.
  const load = fx.bag(u).carrying ? stats.TACTICS.carryMovePenalty : 0;
  return Math.max(1, u.move - (u.statuses.enlameado ? 2 : 0) + fx.moveDelta(u) + fx.num(u, 'chase') - load);
}

export function reachable(state: BattleState, u: BattleUnit): Reach {
  const map = state.map;
  // Células (x, y, andar): no chão o número é o mesmo índice do tile; andares de prédio vêm depois.
  const start = stack.unitCell(map, u);
  const cost = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const budget = state.activeUid === u.uid ? Math.min(moveBudget(u), state.turn.moveLeft ?? Infinity) : moveBudget(u);
  const steps = stepper(state, u);
  const queue: number[] = [start];
  while (queue.length) {
    queue.sort((a, b) => cost.get(a)! - cost.get(b)!);
    const cur = queue.shift()!;
    steps(cur, (nc, step) => {
      const c = cost.get(cur)! + step;
      if (c > budget) return;
      if (c < (cost.get(nc) ?? Infinity)) {
        cost.set(nc, c);
        prev.set(nc, cur);
        queue.push(nc);
      }
    });
  }
  let smart: Map<number, { cells: number[]; costs: number[] }> | undefined;
  return {
    cost,
    prev,
    smart: (target) => {
      smart ??= smartPaths(state, u, start, budget, steps);
      return smart.get(target);
    },
  };
}

/** Vizinhos de uma célula com o custo do passo (lama e porta fechada custam 1 a mais). */
function stepper(state: BattleState, u: BattleUnit): (cur: number, visit: (nc: number, step: number) => void) => void {
  const map = state.map;
  // Bloqueio por célula (coluna + andar): inimigo no telhado não impede passar por dentro da casa.
  const blockers = new Set(opponents(state, u).map((o) => stack.unitCell(map, o)));
  // A IA desvia das armadilhas do próprio time (as do outro lado são invisíveis para ela).
  // O jogador vê as suas no mapa e decide se passa por cima.
  if (u.team === 'enemy' || u.ai) for (const t of fx.knownTraps(state, u.team)) if (t.x !== u.x || t.y !== u.y) blockers.add(stack.cellId(map, t.x, t.y, 0));
  const flying = !!u.statuses.voando;
  // Voando, a diferença de altura não importa (sobe em telhados e torres).
  // Escalador (passiva): sobe paredes e prédios como se tivesse escada.
  const climber = fx.passiveFx(u).some((f) => f.climb);
  const jump = flying || climber ? 999 : u.jump;
  return (cur, visit) => {
    const [cx, cy, cl] = stack.cellPos(map, cur);
    const ct = map.tiles[idx(map, cx, cy)]!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = idx(map, nx, ny);
      if (confine.blocks(state, cx, cy, nx, ny)) continue;
      const nt = map.tiles[ni]!;
      for (let nl = 0; nl < stack.levelCount(nt); nl++) {
        if (blockers.has(stack.cellId(map, nx, ny, nl))) continue;
        if (!stack.standable(nt, nl) || stack.doorLocked(nt, nl) || !stack.canStep(map, cx, cy, cl, nx, ny, nl, jump)) continue;
        const extra = (stack.pieceOf(nt, nl).s === 'lama' && !flying ? 1 : 0) + (stack.doorClosed(nt, nl) ? 1 : 0);
        visit(stack.cellId(map, nx, ny, nl), 1 + extra);
      }
    }
    // Escada: sobe e desce os andares da mesma coluna.
    for (const l of stack.ladderLinks(ct, cl)) if (!blockers.has(stack.cellId(map, cx, cy, l))) visit(stack.cellId(map, cx, cy, l), 1);
  };
}

/**
 * Busca por (célula, deslocamento gasto) que minimiza os ataques de oportunidade provocados e, no
 * empate, o deslocamento. Só guarda as células em que o caminho esperto provoca menos ataques que
 * o mais curto — nas outras vale o caminho normal.
 */
function smartPaths(state: BattleState, u: BattleUnit, start: number, budget: number, steps: ReturnType<typeof stepper>): Map<number, { cells: number[]; costs: number[] }> {
  const out = new Map<number, { cells: number[]; costs: number[] }>();
  const map = state.map;
  const threats = u.hidden || fx.num(u, 'disengaged') || fx.passiveFx(u).some((f) => f.noOpportunity) ? [] : opponents(state, u).filter((o) => o.weaponRange <= 1 && !o.oaUsed);
  if (!threats.length || !Number.isFinite(budget)) return out;
  const provokes = (a: number, b: number): number => {
    const [ax, ay] = stack.cellPos(map, a);
    const [bx, by] = stack.cellPos(map, b);
    return threats.filter((o) => opportunityFrom(state, o, u, ax, ay, bx, by)).length;
  };
  // Rótulo por célula e gasto: menor número de ataques e de onde veio.
  type Label = { oa: number; prev?: string };
  const labels = new Map<string, Label>();
  const key = (c: number, k: number) => `${c}:${k}`;
  labels.set(key(start, 0), { oa: 0 });
  const layers: number[][] = Array.from({ length: budget + 1 }, () => []);
  layers[0]!.push(start);
  for (let k = 0; k <= budget; k++)
    for (const cur of layers[k]!) {
      const here = labels.get(key(cur, k))!;
      steps(cur, (nc, step) => {
        const nk = k + step;
        if (nk > budget) return;
        const oa = here.oa + provokes(cur, nc);
        const old = labels.get(key(nc, nk));
        if (old && old.oa <= oa) return;
        if (!old) layers[nk]!.push(nc);
        labels.set(key(nc, nk), { oa, prev: key(cur, k) });
      });
    }
  // Melhor rótulo de cada célula x o rótulo do caminho mais curto.
  const best = new Map<number, { oa: number; k: number }>();
  const first = new Map<number, number>();
  for (const [kk, l] of labels) {
    const [c, k] = kk.split(':').map(Number) as [number, number];
    if (!first.has(c) || k < first.get(c)!) first.set(c, k);
    const b = best.get(c);
    if (!b || l.oa < b.oa || (l.oa === b.oa && k < b.k)) best.set(c, { oa: l.oa, k });
  }
  for (const [c, b] of best) {
    const shortOa = labels.get(key(c, first.get(c)!))!.oa;
    if (b.oa >= shortOa) continue;
    const cells: number[] = [];
    const costs: number[] = [];
    let kk: string | undefined = key(c, b.k);
    while (kk && labels.get(kk)!.prev !== undefined) {
      const [cc, k] = kk.split(':').map(Number) as [number, number];
      cells.unshift(cc);
      costs.unshift(k);
      kk = labels.get(kk)!.prev;
    }
    out.set(c, { cells, costs });
  }
  return out;
}

/**
 * Casa livre. Com `level`, vale o andar: duas unidades dividem a coluna se estiverem em andares
 * diferentes (uma no telhado, outra dentro da casa). Sem `level`, a coluna inteira (colocar
 * invocações, empurrar, teleportar).
 */
export function isFree(state: BattleState, x: number, y: number, except?: BattleUnit, level?: number): boolean {
  return !state.units.some((o) => o.alive && o !== except && o.x === x && o.y === y && (level === undefined || stack.unitLevel(state.map, o) === level));
}

export function moveTargets(state: BattleState, u: BattleUnit, reach = reachable(state, u)): number[] {
  const here = stack.unitCell(state.map, u);
  return [...reach.cost.keys()].filter((c) => {
    const [x, y, l] = stack.cellPos(state.map, c);
    return isFree(state, x, y, u, l) && c !== here;
  });
}

/** Células do caminho até `target` (sem a de partida). */
export function pathCells(reach: Reach, target: number): number[] {
  const smart = reach.smart?.(target);
  if (smart) return [...smart.cells];
  const out: number[] = [];
  let cur: number | undefined = target;
  while (cur !== undefined && reach.prev.has(cur)) {
    out.unshift(cur);
    cur = reach.prev.get(cur);
  }
  return out;
}

export function pathTo(state: BattleState, reach: Reach, target: number): [number, number][] {
  return pathCells(reach, target).map((c) => {
    const [x, y] = stack.cellPos(state.map, c);
    return [x, y] as [number, number];
  });
}

/** Célula de destino na coluna (x, y): a do andar `l`, ou a mais barata de alcançar. */
export function columnCell(state: BattleState, reach: Reach, x: number, y: number, l?: number): number {
  const map = state.map;
  if (l !== undefined) return stack.cellId(map, x, y, l);
  const t = tileAt(map, x, y);
  let best = idx(map, x, y);
  let bc = Infinity;
  for (let k = 0; t && k < stack.levelCount(t); k++) {
    const c = stack.cellId(map, x, y, k);
    const v = reach.cost.get(c);
    if (v !== undefined && v < bc) {
      bc = v;
      best = c;
    }
  }
  return best;
}

export function faceTowards(u: BattleUnit, x: number, y: number): void {
  const dx = x - u.x;
  const dy = y - u.y;
  if (dx === 0 && dy === 0) return;
  u.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
}

/** Move a unidade pelo caminho. Pode parar antes (prontidão inimiga, morte). Retorna os passos feitos. */
export function moveUnit(state: BattleState, u: BattleUnit, tx: number, ty: number, tl?: number): [number, number][] {
  const reach = reachable(state, u);
  const target = columnCell(state, reach, tx, ty, tl);
  if (!reach.cost.has(target) || !isFree(state, tx, ty, u, stack.cellPos(state.map, target)[2])) return [];
  const cells = pathCells(reach, target);
  const path = cells.map((c) => stack.cellPos(state.map, c));
  const done: [number, number][] = [];
  const doneZ: (number | undefined)[] = [];
  state.moveHeights = [stack.unitH(state.map, u)];
  state.moveShots = [];
  const pursued = new Set<string>();
  // Passo veloz: não provoca ataque de oportunidade nem perseguição.
  const slippery = fx.passiveFx(u).some((f) => f.noOpportunity);
  if (slippery) for (const o of opponents(state, u)) pursued.add(o.uid);
  // Perseguição Implacável: quem estava colado em um caçador dá a ele 1 m a cada 2 m que fugir.
  const chasers = opponents(state, u).filter((o) => chebyshev(o.x, o.y, u.x, u.y) === 1 && fx.passiveFx(o).some((f) => f.chase));
  // Sob supressão: sair do lugar provoca o tiro de quem suprime.
  if (path.length) tactics.suppressedMove(state, u);
  if (!u.alive) return [];
  for (const [x, y, l] of path) {
    // Perseguição: quem se afasta de uma criatura perseguidora leva um golpe de graça.
    for (const o of opponents(state, u)) {
      if (pursued.has(o.uid) || chebyshev(o.x, o.y, u.x, u.y) !== 1 || chebyshev(o.x, o.y, x, y) <= 1) continue;
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
    stack.setLevel(state.map, u, l);
    openDoorAt(state, u, x, y, l);
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
    doneZ.push(u.z);
    state.moveHeights.push(stack.unitH(state.map, u));
    const dmg = tileEffectsOnUnit(state, u);
    if (dmg) damage(state, u, dmg, undefined, undefined);
    if (u.alive) fx.stepOnTile(state, u);
    if (!u.alive) break;
    // Pisou numa armadilha que prende (urso, raízes, gelo): o movimento acaba aqui mesmo.
    if (fx.isRooted(u)) {
      state.log.push(`⛓ ${u.name} fica preso onde pisou — o turno acaba ali.`);
      if (state.activeUid === u.uid) {
        state.turn.moveLeft = 0;
        state.turn.acted = true;
      }
      break;
    }
    if (u.hidden && detectedBy(state, u)) {
      u.hidden = false;
      state.log.push(`👁 ${u.name} foi avistado!`);
      state.events.push({ type: 'spotted', uid: u.uid });
    }
    // Camuflagem de Folhas: some ao encostar num arbusto.
    if (!u.hidden && fx.passiveFx(u).some((f) => f.autoHide) && fx.checkCondition(state, u, 'bush')) {
      u.hidden = true;
      addStatus(u, 'camuflado', 2);
      state.log.push(`🍃 ${u.name} some entre as folhas.`);
    }
    if (triggerOverwatch(state, u, done.length)) {
      if (!u.alive) break;
    }
  }
  // Não pode terminar em cima de aliado: se parou no meio, recua até um tile livre.
  while (done.length && !isFree(state, u.x, u.y, u, stack.unitLevel(state.map, u))) {
    done.pop();
    doneZ.pop();
    state.moveHeights.pop();
    const last = done[done.length - 1] ?? [state.turn.startX, state.turn.startY];
    u.x = last[0];
    u.y = last[1];
    u.z = done.length ? doneZ[doneZ.length - 1] : state.turn.startZ;
    if (u.z === undefined) delete u.z;
  }
  state.turn.moved = true;
  downed.followCarrier(state, u);
  patrol.checkAlerts(state);
  // Gasta só o caminho feito: o resto do deslocamento fica para depois (andar, agir, andar).
  const smart = reach.smart?.(target);
  const spent = smart ? smart.costs[done.length - 1] ?? 0 : reach.cost.get(stack.unitCell(state.map, u)) ?? 0;
  if (state.activeUid === u.uid) state.turn.moveLeft = Math.max(0, (state.turn.moveLeft ?? moveBudget(u)) - spent);
  if (done.length) fx.bag(u).still = 0;
  for (const o of chasers) {
    const gain = Math.floor(done.length / 2);
    if (gain > 0 && o.alive) {
      fx.bag(o).chase = fx.num(o, 'chase') + gain;
      state.log.push(`🐺 ${o.name} fareja a fuga de ${u.name} (+${gain} m no próximo turno).`);
    }
  }
  return done;
}

/**
 * `o` dá ataque de oportunidade em `mover` que sai de (fx, fy) para (tx, ty)? Só corpo a corpo, um por
 * turno de quem ataca, e só se o alvo estava ao alcance e deixa de estar (escondido não provoca).
 */
function opportunityFrom(state: BattleState, o: BattleUnit, mover: BattleUnit, fx_: number, fy: number, tx: number, ty: number): boolean {
  if (!o.alive || o.oaUsed || o.weaponRange > 1 || mover.hidden || fx.num(mover, 'disengaged') || !fx.canStrike(o)) return false;
  if (o.statuses.atordoado || o.statuses.congelado || o.statuses.semente || o.statuses.sem_reacao) return false;
  const reach = (x: number, y: number) => chebyshev(o.x, o.y, x, y) === 1 && inRange(state, o, 1, x, y);
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
  if (!inBounds(state.map, x, y)) return 0;
  return Math.max(0, Math.floor((stack.unitH(state.map, u) - targetH(state, x, y)) / 2));
}

export function inRange(state: BattleState, u: BattleUnit, range: number, x: number, y: number, minRange = 1, needsLos = true): boolean {
  if (!inBounds(state.map, x, y)) return false;
  // Paredes de energia do confinamento: nada entra nem sai.
  if (confine.blocks(state, u.x, u.y, x, y)) return false;
  // Arco não dispara à queima-roupa: tiros de arco pedem pelo menos 2 casas de distância.
  if (minRange >= 1 && range > 1 && u.weaponType === 'arco') minRange = 2;
  // Corpo a corpo (alcance 1) alcança as 8 casas ao redor; à distância conta em passos.
  const d = range <= 1 ? chebyshev(u.x, u.y, x, y) : manhattan(u.x, u.y, x, y);
  // Distância mínima conta as diagonais (a casa na diagonal também é "colada").
  if ((minRange >= 2 ? chebyshev(u.x, u.y, x, y) : d) < minRange) return false;
  const bonus = range > 1 ? heightRangeBonus(state, u, x, y) : 0;
  if (d > range + bonus) return false;
  const ha = stack.unitH(state.map, u);
  const hb = targetH(state, x, y);
  if (range <= 1) {
    if (Math.abs(ha - hb) > 2) return false;
    // Corpo a corpo não atravessa parede nem teto (vizinho do outro lado da parede, andar de cima).
    if (stack.isStacked(tileAt(state.map, u.x, u.y)) || stack.isStacked(tileAt(state.map, x, y))) {
      if (!hasLos(state.map, u.x, u.y, x, y, ha, hb)) return false;
    }
  }
  if (needsLos && d > 1 && !hasLos(state.map, u.x, u.y, x, y, ha, hb)) return false;
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

/** Tiles afetados por uma habilidade mirando (x, y) — sem os que a barreira de confinamento separa de quem usa. */
export function areaOf(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): [number, number][] {
  const out = areaOfRaw(state, u, s, x, y);
  return state.confines?.length ? out.filter(([tx, ty]) => !confine.blocks(state, u.x, u.y, tx, ty)) : out;
}

function areaOfRaw(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): [number, number][] {
  if (s.shape === 'radius') {
    const r = s.radius ?? 1;
    const cx = s.target === 'self' ? u.x : x;
    const cy = s.target === 'self' ? u.y : y;
    const out: [number, number][] = [];
    // Raio 1 = quadrado 3x3 (diagonais incluídas); raios maiores, um círculo (sem as quinas).
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (inArea(dx, dy, r) && inBounds(state.map, cx + dx, cy + dy)) out.push([cx + dx, cy + dy]);
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
        if (inBounds(state.map, tx, ty) && hasLos(state.map, u.x, u.y, tx, ty, stack.unitH(state.map, u), targetH(state, tx, ty))) out.push([tx, ty]);
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
        if (manhattan(u.x, u.y, x, y) <= range && isWalkable(t) && isFree(state, x, y) && vision.has(idx(state.map, x, y)) && !confine.blocks(state, u.x, u.y, x, y)) out.push(idx(state.map, x, y));
        continue;
      }
      if (s.target === 'tile') {
        // Granadas e frascos (arco): passam por cima de muros.
        if (DB.skills[s.id]?.fx?.arc ? tactics.arcReach(state, u, x, y, range) : inRange(state, u, range, x, y, 1)) out.push(idx(state.map, x, y));
        continue;
      }
      // Paredes de prédio também podem ser alvo do ataque básico (derrubar, abrir passagem).
      if (s.id === BASIC_ATTACK.id && u.team === 'player' && !propTarget(state, x, y) && wallTarget(state, u, x, y) > 0) {
        if (wallInRange(state, u, x, y, range)) out.push(idx(state.map, x, y));
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
  /** Fumaça ou vapor turvando o tiro (penalidade forte de acerto). */
  obscured?: boolean;
  /** Vantagem (+1) ou desvantagem (−1). */
  adv?: number;
}

type HitKind = 'basic' | SkillDef['kind'];

function heightDiff(state: BattleState, a: BattleUnit, d: BattleUnit): number {
  return stack.unitH(state.map, a) - stack.unitH(state.map, d);
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
  // Multiplicador da teia (ajuste de balanceamento da subclasse; ver docs/design/simulacao.md).
  let dmg = raw * stats.skillMultiplier(power) * (def?.powerMult ?? 1) * insp * (1 - res) * elementMult(d, el) * mult * m.dmg;
  // Criatura estudada na Biblioteca: o jogador acerta e fere mais (data/base/base.json).
  const studied = a.team === 'player' && !!d.enemyId && !!state.studied?.includes(d.enemyId);
  if (studied) {
    dmg *= 1 + STUDY.damage;
    accBonus += STUDY.accuracy;
  }
  // Marca do Caçador (Verdelume): mais dano e crítico contra a espécie (data/world/capitals.json).
  const hunted = a.team === 'player' && !!d.enemyId && !!state.hunted?.includes(d.enemyId);
  if (hunted) dmg *= 1 + HUNT.damage;
  // Vínculo: aliado com vínculo lado a lado dá acerto e dano (data/base/bonds.json).
  const bond = bondLevelNear(state, a);
  if (bond) {
    dmg *= 1 + BONDS.damagePerLevel * bond;
    accBonus += BONDS.accuracyPerLevel * bond;
  }
  // Atrito: Rivais ao lado competem (mais dano, menos acerto); Desafetos atrapalham.
  const rival = rivalLevelNear(state, a);
  if (rival) {
    dmg *= 1 + (rival >= 2 ? FRICTION.enemyDamage : FRICTION.rivalDamage);
    accBonus += rival >= 2 ? FRICTION.enemyAccuracy : FRICTION.rivalAccuracy;
  }
  // Juramento de vingança contra quem matou um irmão de armas.
  if (d.enemyId && a.vendetta?.includes(d.enemyId)) dmg *= 1 + BONDS.vendettaDamage;
  if (d.defending) dmg *= 0.5;
  if (d.statuses.congelado && !magic) dmg *= 1.3;
  let chance: number;
  const cover = magic ? 'none' : coverAgainst(state.map, d.x, d.y, a.x, a.y);
  const h = stats.BALANCE.hit;
  if (magic) chance = stats.magicHitChance(d.evasion - d.level, m.accuracy + (studied ? STUDY.accuracy : 0), m.evasion);
  else chance = stats.physicalHitChance(a.accuracy + accBonus + m.accuracy, d.evasion + m.evasion, heightDiff(state, a, d) * h.heightBonus - (d.defending ? h.defendingPenalty : 0) - COVER_PENALTY[cover]);
  // Sob supressão: mira tremida.
  if (a.statuses.suprimido) chance -= stats.TACTICS.suppressAccuracy;
  const obscured = !!obscuredBy(state.map, a.x, a.y, d.x, d.y, a.uid);
  // Névoa lunar: quem a lançou crava críticos dentro dela.
  const under = tileAt(state.map, a.x, a.y);
  const cloudCrit = under?.c && under.cBy === a.uid ? CLOUDS[under.c].ownerCrit ?? 0 : 0;
  if (obscured) chance = stats.obscuredHitChance(chance);
  // Vantagem/desvantagem (rola duas vezes): de bem mais alto, escondido ou contra alvo caído = vantagem;
  // cego, ou mirando de longe um alvo no escuro da noite = desvantagem.
  const adv = advantageOf(state, a, d, sk);
  if (adv) chance = stats.advantageChance(chance, adv);
  if (d.statuses.congelado) chance = 100;
  if (m.immune) return { chance: 0, min: 0, max: 0, crit: 0, cover };
  return { chance: Math.round(chance), min: Math.max(1, Math.floor(dmg * 0.9)), max: Math.max(1, Math.ceil(dmg * 1.1)), crit: Math.min(100, a.crit + m.crit + cloudCrit + (hunted ? HUNT.crit : 0)), cover, obscured, adv };
}

/** Soma de vantagens (+1) e desvantagens (−1) do ataque de `a` em `d`: −1, 0 ou +1. */
export function advantageOf(state: BattleState, a: BattleUnit, d: BattleUnit, sk?: SkillLike): number {
  let v = 0;
  const own = sk ? DB.skills[sk.id]?.fx?.advantage : undefined;
  const passive = fx.passiveFx(a).find((f) => f.advantage)?.advantage;
  const high = heightDiff(state, a, d) >= stats.TACTICS.advantageHeight;
  if (high || d.statuses.derrubado || own === 'always' || passive === 'always' || ((own === 'hidden' || passive === 'hidden') && a.hidden) || ((own === 'high' || passive === 'high') && heightDiff(state, a, d) >= 1)) v += 1;
  const far = manhattan(a.x, a.y, d.x, d.y) > 1;
  const dark = state.timeOfDay === 'noite' && far && !d.statuses.tocha && !litTiles(state).has(idx(state.map, d.x, d.y)) && manhattan(a.x, a.y, d.x, d.y) > NIGHT_VISION_RANGE - 2;
  if (a.statuses.cegado || dark) v -= 1;
  return Math.sign(v);
}

/** Maior nível de vínculo entre a unidade e um aliado vivo ao lado dela (0 se nenhum). */
export function bondLevelNear(state: BattleState, a: BattleUnit): number {
  if (!a.bonds) return 0;
  let best = 0;
  for (const o of state.units) {
    if (o === a || !o.alive || o.team !== a.team || !o.charId) continue;
    const lv = a.bonds[o.charId];
    if (lv && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) <= 1) best = Math.max(best, lv);
  }
  return best;
}

/** Maior nível de atrito entre a unidade e um aliado vivo ao lado dela (0 se nenhum). */
export function rivalLevelNear(state: BattleState, a: BattleUnit): number {
  if (!a.rivals) return 0;
  let best = 0;
  for (const o of state.units) {
    if (o === a || !o.alive || o.team !== a.team || !o.charId) continue;
    const lv = a.rivals[o.charId];
    if (lv && chebyshev(o.x, o.y, a.x, a.y) <= 1) best = Math.max(best, lv);
  }
  return best;
}

export function damage(state: BattleState, target: BattleUnit, amount: number, attacker: BattleUnit | undefined, el: Element | undefined, crit = false, magic = false): void {
  if (!target.alive) return;
  // Prisioneiro na cela: as grades protegem (ninguém mata o refém por acidente).
  if (target.vip && target.bound) return;
  if (state.enemyDmgMult && attacker?.team === 'enemy' && target.team === 'player') amount = Math.max(1, Math.round(amount * state.enemyDmgMult));
  amount = fx.beforeDamage(state, target, amount, attacker, el);
  if (!target.alive) return;
  // Rival: resiste ao que aprendeu e o jogo anota o que mais o feriu.
  if (target.rival) {
    const kind = el ?? 'fisico';
    amount = Math.max(1, Math.round(amount * (1 - (target.rival.resist[kind] ?? 0))));
    (state.rivalDamage ??= {})[kind] = (state.rivalDamage[kind] ?? 0) + amount;
  }
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  // Telemetria: dano causado (o golpe ou, sem atacante, quem está agindo — explosões, quedas).
  // Invocações contam para quem as invocou.
  const hitter = attacker ?? activeUnit(state);
  const by = hitter?.summonedBy ? unitById(state, hitter.summonedBy) ?? hitter : hitter;
  if (by && by.team !== target.team) by.dealt = (by.dealt ?? 0) + (hpBefore - target.hp);
  target.lowHp = Math.min(target.lowHp ?? target.hp, target.hp);
  state.events.push({ type: 'damage', uid: target.uid, amount, crit, element: el });
  if (target.hp > 0 && target.phases) bossPhases(state, target);
  // Rival foge com pouca vida (volta mais forte em outro encontro).
  if (target.rival && target.hp > 0 && target.hp <= target.maxHp * RIVAL_DATA.fleePct) {
    target.alive = false;
    state.rivalFled = true;
    state.events.push({ type: 'text', x: target.x, y: target.y, text: '🌑 Fugiu!', color: '#ce93d8' });
    state.log.push(`🌑 ${target.name}: "${rivalTaunt(fx.num(target, 'rivalSeen'))}" — some num rasgo do Vazio.`);
    checkVictory(state);
    return;
  }
  if (target.hp <= 0 && fx.onLethal(state, target, el)) return;
  fx.afterDamage(state, target, amount, attacker, el, magic);
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    const lastStatuses = target.statuses;
    target.statuses = {};
    target.overwatch = false;
    state.events.push({ type: 'death', uid: target.uid });
    // Herói do esquadrão cai sangrando (dá para salvar), a não ser num golpe devastador.
    if (downed.canBleed(target) && amount - hpBefore < target.maxHp) downed.fallBleeding(state, target);
    else state.log.push(`☠ ${target.name} caiu.`);
    if (attacker && attacker.team !== target.team) {
      attacker.kills += 1;
      attacker.killXp += target.xpReward ?? killXp(target.level);
      if (target.boss) (attacker.feats ??= []).push(target.name);
      target.killedBy = { name: attacker.name, enemyId: attacker.enemyId };
    }
    fx.onDeath(state, target, attacker, lastStatuses);
  }
  // Concentração: golpe no conjurador pode desfazer o efeito que ele mantém.
  conc.onDamaged(state, target, amount);
  // Patrulha atingida desperta o grupo todo.
  if (target.unaware) patrol.alertPod(state, target, `foi atacada${attacker ? ` por ${attacker.name}` : ''}`);
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
  // Telemetria: cura feita por quem está agindo.
  const actor = activeUnit(state);
  if (actor && actor.team === target.team) actor.healed = (actor.healed ?? 0) + real;
}

/** Rola acerto, aplica dano e efeitos de elemento na unidade. Retorna se acertou. */
/** Chance de um confuso acertar outra unidade ao lado do alvo (aliados também). */
export const CONFUSED_REDIRECT = 0.35;
let redirecting = false;

export function resolveAttack(state: BattleState, a: BattleUnit, d: BattleUnit, kind: HitKind, power: number, el: Element | undefined, accBonus: number, mult: number, sk?: SkillLike): boolean {
  if (confine.blocks(state, a.x, a.y, d.x, d.y)) {
    state.log.push(`⛩ A barreira de energia barra o golpe de ${a.name}.`);
    state.events.push({ type: 'miss', uid: d.uid });
    return false;
  }
  // Confuso (esporos, riso, canto): o golpe pode ir parar em quem está colado no alvo.
  if (a.statuses.confuso && !redirecting) {
    const near = state.units.filter((o) => o.alive && o !== a && o !== d && chebyshev(o.x, o.y, d.x, d.y) <= 1);
    if (near.length && state.rng.chance(CONFUSED_REDIRECT)) {
      const o = state.rng.pick(near);
      state.log.push(`❓ ${a.name}, confuso, acerta ${o.name}!`);
      redirecting = true;
      try {
        resolveAttack(state, a, o, kind, power, el, accBonus, mult, sk);
      } finally {
        redirecting = false;
      }
      return false;
    }
  }
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
  // Demolidor (passiva): mais dano em paredes e objetos.
  const demolish = fx.passiveFx(u).reduce((m, f) => m * (f.demolish ?? 1), 1);
  return Math.round(stats.structureDamage(stats.rawPower(weaponBase, u.attrs, magic ? { int: 1 } : { [u.attackAttr]: 1 }, u.level), power) * demolish);
}

/** Objeto que pode ser alvo do ataque básico em (x, y): sem unidade em cima e com cobertura. */
export function propTarget(state: BattleState, x: number, y: number): boolean {
  return !unitAt(state, x, y) && propHp(state.map, x, y) > 0;
}

// ───────────────────────────── prédios: portas, paredes e desabamento ─────────────────────────────

/** Abre a porta fechada da célula ao passar por ela. */
function openDoorAt(state: BattleState, u: BattleUnit, x: number, y: number, l: number): void {
  const t = tileAt(state.map, x, y);
  if (!t || !stack.doorClosed(t, l)) return;
  stack.pieceOf(t, l).open = true;
  state.log.push(`🚪 ${u.name} abre a porta.`);
  state.events.push({ type: 'text', x, y, text: '🚪', color: '#ffe082' });
}

/** Nível da porta ao alcance de `u` na coluna (x, y) (vizinha ou a própria), ou -1. */
export function doorLevelNear(state: BattleState, u: BattleUnit, x: number, y: number): number {
  const t = tileAt(state.map, x, y);
  if (!t?.up || manhattan(u.x, u.y, x, y) > 1) return -1;
  const h = stack.unitH(state.map, u);
  for (let l = 0; l < stack.levelCount(t); l++) if (stack.hasDoor(t, l) && Math.abs(stack.topOf(t, l) - h) <= 2) return l;
  return -1;
}

/** Portas que `u` pode abrir ou fechar agora (ninguém parado no vão). */
export function doorTargets(state: BattleState, u: BattleUnit): number[] {
  const out: number[] = [];
  for (const [dx, dy] of [[0, 0], ...DIRS]) {
    const x = u.x + dx!;
    const y = u.y + dy!;
    if (!inBounds(state.map, x, y) || doorLevelNear(state, u, x, y) < 0) continue;
    if (!(dx === 0 && dy === 0) && unitAt(state, x, y)) continue;
    out.push(idx(state.map, x, y));
  }
  return out;
}

/** Abre ou fecha a porta (ação livre: abrir para espiar o que há dentro). */
export function toggleDoor(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const l = doorLevelNear(state, u, x, y);
  if (l < 0) return false;
  const p = stack.pieceOf(tileAt(state.map, x, y)!, l);
  // Trancada: arrombar (gasta a ação).
  if (p.locked && !p.open) return scenery.pickLock(state, u, x, y, l);
  p.open = !p.open;
  if (!p.open) delete p.open;
  faceTowards(u, x, y);
  state.log.push(`🚪 ${u.name} ${p.open ? 'abre' : 'fecha'} a porta.`);
  state.events.push({ type: 'text', x, y, text: p.open ? '🚪 aberta' : '🚪 fechada', color: '#ffe082' });
  return true;
}

/** Peça de prédio (parede, laje) que `u` acerta mirando a coluna (x, y) vazia, ou -1. */
export function wallTarget(state: BattleState, u: BattleUnit, x: number, y: number): number {
  if (unitAt(state, x, y)) return -1;
  const t = tileAt(state.map, x, y);
  if (!stack.isStacked(t)) return -1;
  return stack.pieceNear(t!, stack.unitH(state.map, u) + 1);
}

/** A peça mirada está ao alcance (a própria parede não conta como obstáculo da linha de tiro). */
export function wallInRange(state: BattleState, u: BattleUnit, x: number, y: number, range = skillRange(u, BASIC_ATTACK)): boolean {
  const l = wallTarget(state, u, x, y);
  if (l < 1 || confine.blocks(state, u.x, u.y, x, y)) return false;
  const d = manhattan(u.x, u.y, x, y);
  if (d < 1 || d > range) return false;
  if (d === 1) return true;
  const s = tileAt(state.map, x, y)!.up![l - 1]!;
  const mid = Math.min(s.h - 0.5, Math.max(s.b + 0.5, stack.unitH(state.map, u) + 1));
  const b = losBlocker(state.map, u.x, u.y, x, y, stack.unitH(state.map, u), mid - 1);
  return !b || (b.x === x && b.y === y);
}

/** Casas a mais que um tiro no chão alcança (sem alvo, sem rolar acerto). */
export const GROUND_AIM_BONUS = stats.LIGHT.groundAimRangeBonus;

/** Habilidade que pode ser mirada no chão: alvo único em inimigo, que causa dano e alcança longe. */
export function groundAimable(u: BattleUnit, s: SkillLike): boolean {
  return s.target === 'enemy' && (s.shape ?? 'single') === 'single' && !(s.radius ?? 0) && skillRange(u, s) > 1 && (s.kind === 'physical' || s.kind === 'magic' || s.kind === 'ranged');
}

/**
 * Casas onde dá para mirar no chão (iluminar o caminho, incendiar um objeto, quebrar parede): sem
 * unidade visível, ao alcance + `GROUND_AIM_BONUS`, com linha de visão até o chão.
 */
export function groundTargets(state: BattleState, u: BattleUnit, s: SkillLike, vision: Set<number>): number[] {
  if (!groundAimable(u, s)) return [];
  const map = state.map;
  const range = skillRange(u, s) + GROUND_AIM_BONUS;
  const ha = stack.unitH(map, u);
  const out: number[] = [];
  for (let y = Math.max(0, u.y - range); y <= Math.min(map.h - 1, u.y + range); y++)
    for (let x = Math.max(0, u.x - range); x <= Math.min(map.w - 1, u.x + range); x++) {
      const d = manhattan(u.x, u.y, x, y);
      if (d < 1 || d > range || confine.blocks(state, u.x, u.y, x, y)) continue;
      const o = unitAt(state, x, y);
      if (o && (o.team === u.team || visibleToPlayer(state, o, vision))) continue;
      const t = map.tiles[idx(map, x, y)]!;
      // Parede: a própria peça não bloqueia a linha (mira nela).
      if (wallTarget(state, u, x, y) > 0) {
        if (wallInRange(state, u, x, y, range)) out.push(idx(map, x, y));
        continue;
      }
      if (hasLos(map, u.x, u.y, x, y, ha, stack.columnTop(t) - 1)) out.push(idx(map, x, y));
    }
  return out;
}

/** Tiro no chão: o elemento cai na casa, quebra objeto/parede e o fogo deixa brasas (luz). */
export function groundShot(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): void {
  const t = tileAt(state.map, x, y);
  if (!t) return;
  state.events.push({ type: 'fx', x, y, element: s.element ?? 'hit' });
  const power = structureHit(u, s.kind === 'magic' ? 'magic' : 'basic', s.power);
  const wl = propTarget(state, x, y) ? -1 : wallTarget(state, u, x, y);
  if (propTarget(state, x, y)) damageProp(state, x, y, power);
  else if (wl > 0 && hitPiece(state, x, y, wl, power)) settleStructures(state);
  if (s.element === 'fogo' && t.s !== 'fogo') {
    t.glow = Math.max(t.glow ?? 0, stats.LIGHT.emberTurns);
    state.log.push(`🔥 ${u.name} acende brasas no chão.`);
  } else if (s.element === 'luz') t.glow = Math.max(t.glow ?? 0, stats.LIGHT.emberTurns);
}

/** Golpe numa peça de prédio. Devolve true se ela quebrou (chame `settleStructures` depois). */
export function hitPiece(state: BattleState, x: number, y: number, l: number, amount: number): boolean {
  const t = tileAt(state.map, x, y);
  const s = t?.up?.[l - 1];
  if (!t || !s) return false;
  state.events.push({ type: 'fx', x, y, element: 'hit' });
  const name = TERRAIN[s.t].name;
  if (!stack.damagePiece(t, l, amount)) {
    state.events.push({ type: 'text', x, y, text: `-${amount}`, color: '#bcaaa4' });
    return false;
  }
  state.events.push({ type: 'text', x, y, text: `${name} quebrou!`, color: '#ffcc80' });
  state.log.push(`🧱 ${name} quebrou.`);
  return true;
}

/**
 * Física dos prédios: o que ficou sem apoio cai. Quem estava em cima cai junto (dano de queda);
 * quem estava embaixo é esmagado e fica em cima dos escombros.
 */
export function settleStructures(state: BattleState): void {
  const map = state.map;
  const watch = state.units
    .filter((u) => u.alive)
    .map((u) => {
      const t = tileAt(map, u.x, u.y)!;
      return { u, t, piece: u.z === undefined ? undefined : t.up?.find((p) => p.h === u.z), oldH: u.z ?? t.h };
    });
  // Gravidade invertida do Vazio: o que perde o apoio sobe e se desfaz no céu (sem esmagar ninguém).
  if (state.inverted) {
    const loose = stack.unsupported(map);
    for (const { x, y, slab } of loose) {
      const t = tileAt(map, x, y)!;
      t.up!.splice(t.up!.indexOf(slab), 1);
      if (!t.up!.length) delete t.up;
    }
    if (loose.length) state.log.push(`🌀 ${loose.length} pedra(s) sobem e se desfazem no céu invertido.`);
  }
  const falls = stack.settle(map);
  if (falls.length) {
    state.log.push(`🏚 Desabamento! ${falls.length} ${falls.length === 1 ? 'peça cai' : 'peças caem'}.`);
    const seen = new Set<number>();
    for (const f of falls) {
      const i = idx(map, f.x, f.y);
      if (seen.has(i)) continue;
      seen.add(i);
      state.events.push({ type: 'fx', x: f.x, y: f.y, element: 'hit' });
    }
    state.events.push({ type: 'text', x: falls[0]!.x, y: falls[0]!.y, text: '🏚 Desaba!', color: '#ffab91' });
  }
  for (const { u, t, piece, oldH } of watch) {
    if (piece && t.up?.includes(piece)) u.z = piece.h;
    stack.setLevel(map, u, stack.levelAt(t, u.z));
    let l = stack.unitLevel(map, u);
    if (!stack.standable(t, l) && stack.covered(t, l)) {
      // Escombros caíram em cima: esmaga e sobe para o topo do que caiu.
      const above = t.up![l]!;
      damage(state, u, stats.crushDamage(u.maxHp, above.h - above.b), undefined, undefined);
      state.log.push(`🪨 ${u.name} é soterrado pelos escombros!`);
      while (l < stack.topLevel(t) && !stack.standable(t, l)) l++;
      stack.setLevel(map, u, l);
    }
    const drop = oldH - stack.unitH(map, u);
    if (drop > 1 && u.alive && state.inverted) {
      addStatus(u, 'voando', 1);
      state.log.push(`🌀 ${u.name} flutua no ar invertido em vez de cair.`);
    } else if (drop > 0 && u.alive && !u.statuses.voando) {
      const d = stats.fallDamage(u.maxHp, drop, u.jump);
      if (d) {
        damage(state, u, d, undefined, undefined);
        state.log.push(`⬇ ${u.name} despenca ${drop} níveis.`);
      }
    }
  }
}

export function attack(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const wl = propTarget(state, x, y) ? -1 : wallTarget(state, u, x, y);
  if (wl > 0) {
    // Parede, laje ou telhado: acerto garantido; o que perder o apoio desaba.
    if (!wallInRange(state, u, x, y) || !fx.canStrike(u)) return false;
    faceTowards(u, x, y);
    hitPiece(state, x, y, wl, structureHit(u, u.weaponType === 'varinha' ? 'magic' : 'basic', 0));
    settleStructures(state);
    finishAction(state, u);
    return true;
  }
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
  // Bestas de mão gêmeas: dois virotes, cada um com 60% do golpe.
  const twin = u.weaponType === 'besta_mao';
  let hit = resolveAttack(state, u, target, kind, imbue?.bonus ?? 0, el, 0, twin ? TWIN_SHOT : 1);
  if (twin && target.alive) hit = resolveAttack(state, u, target, kind, imbue?.bonus ?? 0, el, 0, TWIN_SHOT) || hit;
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
  /** Combo de orbes da alma (o parceiro pode ser o próprio herói, com os dois orbes). */
  orb?: boolean;
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
  return [...out, ...orbComboOptions(state, u)];
}

/** Regra de combo para dois elementos de orbe (mesmo elemento = Ressonância). */
export function orbComboRule(a: string, b: string): OrbComboRule | undefined {
  if (a === b) return a === 'neutro' ? undefined : ORB_COMBOS.resonance;
  return ORB_COMBOS.combos.find((r) => r.elements && r.elements.includes(a) && r.elements.includes(b));
}

/** Habilidade de orbe pronta para combo: ativa e fora de recarga. */
function orbReady(u: BattleUnit, id: string): boolean {
  return !!u.orbs?.[id] && !DB.skills[id]?.passive && !((u.cooldowns[id] ?? 0) > 0);
}

/**
 * Combos de orbes: um orbe deste herói com o outro orbe dele, ou com o orbe de um aliado por perto.
 * O golpe ganha força com o nível dos dois orbes e põe os dois em recarga.
 */
function orbComboOptions(state: BattleState, u: BattleUnit): ComboOption[] {
  const out: ComboOption[] = [];
  if (!u.orbs || u.statuses.silenciado) return out;
  const partners = [u, ...allies(state, u).filter((p) => p !== u && !p.statuses.congelado && manhattan(u.x, u.y, p.x, p.y) <= ORB_COMBOS.partnerRange)];
  for (const mine of Object.keys(u.orbs)) {
    if (!orbReady(u, mine)) continue;
    for (const p of partners)
      for (const theirs of Object.keys(p.orbs ?? {})) {
        if ((p === u && theirs === mine) || !orbReady(p, theirs)) continue;
        // Com os dois orbes do mesmo herói, cada par aparece uma vez só.
        if (p === u && theirs < mine) continue;
        const elA = u.orbs[mine]!;
        const elB = p.orbs![theirs]!;
        const rule = orbComboRule(elA, elB);
        if (!rule) continue;
        const ranks = (u.skillRanks?.[mine] ?? 1) + (p.skillRanks?.[theirs] ?? 1) - 2;
        const result = { ...rule.result, power: rule.result.power + ORB_COMBOS.powerPerRank * ranks };
        if (!rule.elements) result.element = elA as Element;
        out.push({
          combo: { id: `orbe_${rule.id}`, name: `💎 ${rule.name}`, a: mine, b: theirs, partnerRange: ORB_COMBOS.partnerRange, result, description: rule.description },
          mySkill: mine,
          partner: p,
          partnerSkill: theirs,
          orb: true,
        });
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
  const cdId = def?.fortifiedOf ?? def?.evolvedOf ?? s.id;
  if ((u.cooldowns[cdId] ?? 0) > 0) return false;
  if (def?.fortifiedOf && ((u.skillRanks?.[def.fortifiedOf] ?? 1) < SKILL_MAX_RANK || !u.skills.includes(def.fortifiedOf))) return false;
  if (u.statuses.silenciado && s.id !== BASIC_ATTACK.id) return false;
  if ((s.kind === 'physical' || s.kind === 'ranged') && !fx.canStrike(u)) return false;
  return u.mp >= fx.mpCost(u, s);
}

/** Por que a habilidade não pode ser usada agora (texto curto para a interface), ou null. */
export function castBlockReason(state: BattleState, u: BattleUnit, s: SkillLike): string | null {
  const def = DB.skills[s.id];
  if (def?.passive) return 'Passiva: age sozinha';
  const cdId = def?.fortifiedOf ?? def?.evolvedOf ?? s.id;
  const cd = u.cooldowns[cdId] ?? 0;
  if (cd > 0) return `EM RECARGA (${cd} turno${cd > 1 ? 's' : ''})`;
  if (u.statuses.silenciado && s.id !== BASIC_ATTACK.id) return 'SILENCIADO';
  if ((s.kind === 'physical' || s.kind === 'ranged') && !fx.canStrike(u)) return 'NÃO PODE ATACAR AGORA';
  const cost = fx.mpCost(u, s);
  if (u.mp < cost) return `MP INSUFICIENTE (${u.mp}/${cost})`;
  if (def && def.classId === 'fera' && !fx.creatureUsable(state, u, def)) return 'CONDIÇÃO NÃO ATENDIDA (terreno ou situação)';
  if (state.turn.acted && !def?.fx?.free) return 'JÁ AGIU NESTE TURNO';
  return null;
}

/** Habilidades sem custo de ação prontas para uso (valem mesmo depois de agir). */
export function freeSkills(state: BattleState, u: BattleUnit): SkillLike[] {
  return u.skills.map((id) => DB.skills[id]).filter((d): d is SkillDef => !!d?.fx?.free && skillUsable(state, u, d as SkillLike)) as SkillLike[];
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

/** Executa uma habilidade (ou combo, se `combo` for passado). Habilidades de concentração ficam presas ao conjurador. */
export function castSkill(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number, combo?: ComboOption): boolean {
  const keep = conc.needsConcentration(s.id);
  // Uma concentração por vez: a antiga se desfaz antes da nova.
  if (keep && state.conc?.[u.uid] && canCast(u, s)) conc.end(state, u, 'troca de foco');
  const before = keep ? conc.snapshot(state) : undefined;
  const dealt0 = u.dealt ?? 0;
  const ok = castSkillInner(state, u, s, x, y, combo);
  // Telemetria: parte do dano que veio de habilidades (simulação de balanceamento).
  if (ok) {
    u.skillDealt = (u.skillDealt ?? 0) + (u.dealt ?? 0) - dealt0;
    u.casts = (u.casts ?? 0) + 1;
    const baseId = DB.skills[s.id]?.fortifiedOf ?? s.id;
    (u.castLog ??= {})[baseId] = (u.castLog[baseId] ?? 0) + 1;
  }
  if (ok && before && u.alive) conc.begin(state, u, s.id, before);
  return ok;
}

function castSkillInner(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number, combo?: ComboOption): boolean {
  if (!canCast(u, s)) return false;
  if (fx.isFera(s) && !fx.creatureUsable(state, u, DB.skills[s.id]!)) return false;
  u.mp -= fx.mpCost(u, s);
  // Nv 4+: recarga um turno menor.
  const cd = rankCooldown(DB.skills[s.id]?.cooldown ?? 0, u.skillRanks?.[s.id] ?? 1);
  if (cd > 0) u.cooldowns[DB.skills[s.id]?.fortifiedOf ?? DB.skills[s.id]?.evolvedOf ?? s.id] = cd;
  if (combo) {
    if (combo.partner !== u) {
      combo.partner.mp -= skill(combo.partnerSkill).mp;
      combo.partner.gauge = 0;
    }
    if (combo.orb) {
      // Os dois orbes entram em recarga.
      u.cooldowns[combo.mySkill] = ORB_COMBOS.cooldown;
      combo.partner.cooldowns[combo.partnerSkill] = ORB_COMBOS.cooldown;
    }
    state.log.push(combo.partner === u ? `💎 Combo de orbes! ${u.name}: ${s.name}` : `⚡ Combo! ${u.name} + ${combo.partner.name}: ${s.name}`);
  } else state.log.push(`${u.name} usa ${s.name}.`);
  // Ação sem custo não mexe no tempo da ação do turno.
  if (!DB.skills[s.id]?.fx?.free) state.turn.timeMult = DB.skills[s.id]?.timeMult ?? 1;
  const wasHidden = u.hidden;
  // Vento abre caminho nas nuvens: golpes de alvo único limpam a linha até o alvo; áreas limpam a área.
  if (s.element === 'vento') {
    const single = s.target !== 'self' && (s.shape ?? 'single') === 'single' && !(s.radius ?? 0);
    dissipateClouds(state, [...(single ? lineTiles(u.x, u.y, x, y) : []), ...areaOf(state, u, s, x, y)]);
  }
  if (s.target !== 'self') faceTowards(u, x, y);
  const sfx = DB.skills[s.id]?.fx;
  // Selo de Confinamento: quatro selos e paredes de energia.
  if (sfx?.confine) {
    if (!confine.cast(state, u, s.id, x, y)) return false;
    finishAction(state, u);
    return true;
  }
  // Construção tática: muralha, barricada, rampa, pilar, trepadeira.
  if (sfx?.build) {
    build.buildAt(state, u, sfx.build, x, y);
    if (!sfx.free) finishAction(state, u);
    return true;
  }
  // Passo até o aliado (talismã): reaparece ao lado dele, mesmo do outro lado de uma parede.
  if (sfx?.allyStep) {
    const ally = unitAt(state, x, y);
    // Sem aliado (mirando a si mesmo): só um passo rápido para a casa vizinha.
    if (!ally || ally.team !== u.team) return false;
    for (const [dx, dy] of DIRS) {
      const t = tileAt(state.map, x + dx!, y + dy!);
      if (!t || !isWalkable(t) || unitAt(state, x + dx!, y + dy!) || confine.blocks(state, u.x, u.y, x + dx!, y + dy!)) continue;
      u.x = x + dx!;
      u.y = y + dy!;
      delete u.z;
      if (sfx.self) addStatus(u, sfx.self.id as never, sfx.self.turns);
      state.log.push(ally === u ? `🦊 ${u.name} dá um passo de raposa.` : `🦊 ${u.name} surge ao lado de ${ally.name}.`);
      if (!sfx.free) finishAction(state, u);
      return true;
    }
    return false;
  }
  // Tiro no chão (sem ninguém no alvo): acerta o objeto ou a parede que estiver lá; fogo em chão que
  // não pega deixa brasas que iluminam a noite.
  const single = (s.shape ?? 'single') === 'single' && !(s.radius ?? 0);
  if (single && s.target === 'enemy' && !unitAt(state, x, y) && (s.kind === 'physical' || s.kind === 'magic' || s.kind === 'ranged')) {
    groundShot(state, u, s, x, y);
    if (!DB.skills[s.id]?.fx?.free) finishAction(state, u);
    return true;
  }
  // Habilidades de dano em área quebram as coberturas que pegam.
  const area = areaOf(state, u, s, x, y);
  const areaSkill = s.shape !== 'single' || (s.radius ?? 0) > 0;
  if (areaSkill && (s.kind === 'physical' || s.kind === 'magic')) {
    for (const [tx, ty] of area) if (propTarget(state, tx, ty)) damageProp(state, tx, ty, structureHit(u, s.kind, s.power));
    // Explosões castigam paredes e lajes na altura do centro; o que perder o apoio desaba.
    const ch = targetH(state, x, y) + 1;
    let broke = false;
    for (const [tx, ty] of area) {
      const t = tileAt(state.map, tx, ty);
      const l = t && !unitAt(state, tx, ty) ? stack.pieceNear(t, ch) : -1;
      if (l > 0 && hitPiece(state, tx, ty, l, Math.round(structureHit(u, s.kind, s.power) * stats.BLAST_STRUCTURE_MULT * (DB.skills[s.id]?.fx?.demolish ?? 1)))) broke = true;
    }
    if (broke) settleStructures(state);
  }
  if (fx.isFera(s)) return fx.castCreatureSkill(state, u, s, x, y);

  if (s.kind === 'buff') {
    for (const [tx, ty] of areaOf(state, u, s, x, y)) {
      const t = unitAt(state, tx, ty);
      if (t && t.team === u.team && s.status) addStatus(t, s.status.id as never, s.status.turns);
    }
    finishAction(state, u);
    return true;
  }
  if (s.kind === 'heal') {
    const amount = Math.round(stats.healPower(u.attrs, u.healBonus, s.power, u.level, s.scaling) * fx.healMult(state, u, s.id));
    const healed = new Set<BattleUnit>();
    for (const [tx, ty] of areaOf(state, u, s, x, y)) {
      const t = unitAt(state, tx, ty);
      if (t && t.team === u.team) {
        heal(state, t, amount);
        removeStatus(t, 'queimando');
        removeStatus(t, 'envenenado');
        healed.add(t);
      }
    }
    // Talismã que salta: cura mais aliados feridos perto do primeiro (60% cada).
    let from = unitAt(state, x, y);
    for (let k = 0; k < (sfx?.bounce ?? 0) && from; k++) {
      const next = state.units
        .filter((o) => o.alive && o.team === u.team && !healed.has(o) && o.hp < o.maxHp && manhattan(o.x, o.y, from!.x, from!.y) <= 3)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!next) break;
      heal(state, next, Math.round(amount * 0.6));
      healed.add(next);
      state.events.push({ type: 'fx', x: next.x, y: next.y, element: 'luz' });
      from = next;
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
  const mult = 1;
  if (s.element) for (const [tx, ty] of area) applyElementToTile(state, tx, ty, s.element);
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
    // Supressão: acertando ou não, o alvo fica sob fogo sustentado.
    if (DB.skills[s.id]?.fx?.suppress && t.alive && t.team !== u.team) tactics.suppress(state, u, t);
    // Golpe que arremessa o alvo para trás (regra do empurrão, sem teste).
    const knock = DB.skills[s.id]?.fx?.knock ?? 0;
    if (hit && knock && t.alive) {
      const kd: [number, number] = [Math.sign(t.x - u.x), Math.sign(t.y - u.y)];
      for (let k = 0; k < knock && t.alive; k++) if (!tactics.pushStep(state, t, kd[0], kd[1])) break;
    }
    if (hit && s.status && t.alive) addStatus(t, s.status.id as never, s.status.turns);
    if (hit) fx.afterSkillHit(state, u, t);
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
      const d = manhattan(u.x, u.y, x, y);
      if (it.use?.torch) {
        if (d === 0) out.push(idx(state.map, x, y));
      } else if (it.use?.placeProp) {
        const t = tileAt(state.map, x, y)!;
        if (d === 1 && !t.p && isWalkable(t) && !unitAt(state, x, y) && !t.up?.length) out.push(idx(state.map, x, y));
      } else if (it.use?.heal || it.use?.mp) {
        // Ao lado: bebe/dá a poção inteira. Mais longe: arremessa (cura em área, efeito menor).
        const t = unitAt(state, x, y);
        if ((t && t.team === u.team && d <= 1) || (d > 1 && tactics.arcReach(state, u, x, y, stats.TACTICS.arcRange))) out.push(idx(state.map, x, y));
      } else if (tactics.arcReach(state, u, x, y, it.use?.flare ? 6 : stats.TACTICS.arcRange)) out.push(idx(state.map, x, y));
    }
  return out;
}

export function useItem(state: BattleState, u: BattleUnit, slot: number, x: number, y: number): boolean {
  const itemId = u.items[slot];
  if (!itemId || itemUsesLeft(u, slot) <= 0) return false;
  const it = item(itemId);
  const use = it.use ?? {};
  const potion = (t: BattleUnit, mult: number) => {
    if (use.heal) heal(state, t, Math.max(1, Math.round(use.heal * mult)));
    for (const st of use.cure ?? []) removeStatus(t, st as StatusId);
    if (use.mp) {
      const real = Math.min(Math.round(use.mp * mult), t.maxMp - t.mp);
      t.mp += real;
      state.events.push({ type: 'heal', uid: t.uid, amount: real, mp: true });
    }
  };
  if (use.torch) {
    addStatus(u, 'tocha', 99);
    u.hidden = false;
    state.log.push(`🔦 ${u.name} acende uma tocha.`);
  } else if (use.placeProp) {
    const t = tileAt(state.map, x, y);
    if (!t || manhattan(u.x, u.y, x, y) !== 1 || t.p || unitAt(state, x, y)) return false;
    t.p = use.placeProp as never;
  } else if ((use.heal || use.mp) && chebyshev(u.x, u.y, x, y) <= 1) {
    const t = unitAt(state, x, y);
    if (!t || t.team !== u.team) return false;
    potion(t, 1);
  } else if (use.heal || use.mp) {
    // Poção arremessada: estoura e cura aliados em volta (raio 1), com efeito menor.
    if (!tactics.arcReach(state, u, x, y, stats.TACTICS.arcRange)) return false;
    faceTowards(u, x, y);
    for (const [dx, dy] of [[0, 0], ...DIRS]) {
      const t = unitAt(state, x + dx!, y + dy!);
      if (t && t.team === u.team) potion(t, stats.TACTICS.throwPotionMult);
      if (inBounds(state.map, x + dx!, y + dy!)) state.events.push({ type: 'fx', x: x + dx!, y: y + dy!, element: 'luz' });
    }
  } else if (use.flare) {
    if (!tactics.arcReach(state, u, x, y, 6)) return false;
    const r = stats.TACTICS.flareRadius;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = tileAt(state.map, x + dx, y + dy);
        if (t && Math.abs(dx) + Math.abs(dy) <= r) t.glow = Math.max(t.glow ?? 0, stats.LIGHT.emberTurns);
      }
    state.events.push({ type: 'fx', x, y, element: 'luz' });
  } else {
    if (!tactics.arcReach(state, u, x, y, stats.TACTICS.arcRange)) return false;
    faceTowards(u, x, y);
    const r = use.radius ?? 1;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (!inArea(dx, dy, r)) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(state.map, tx, ty)) continue;
        if (use.smoke) applyElementToTile(state, tx, ty, 'fumaca');
        else if (use.flash) {
          // Clarão: cega quem estiver na área (sem distinguir lados) e revela escondidos.
          const t = unitAt(state, tx, ty);
          if (t) {
            addStatus(t, 'cegado', FLASH_TURNS);
            applyElementToUnit(state, t, 'luz');
          }
        } else if (use.throwElement === 'terra') applyElementToTile(state, tx, ty, 'oleo');
        else if (use.throwElement) {
          applyElementToTile(state, tx, ty, use.throwElement);
          const t = unitAt(state, tx, ty);
          if (t) {
            applyElementToUnit(state, t, use.throwElement);
            if (use.throwElement === 'fogo') damage(state, t, 8, u, 'fogo');
          }
        }
        state.events.push({ type: 'fx', x: tx, y: ty, element: use.flash ? 'luz' : use.smoke ? 'hit' : (use.throwElement ?? 'hit') });
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

/**
 * Desengajar: gasta a ação do turno para recuar com cuidado — o resto do movimento deste turno não
 * provoca ataques de oportunidade.
 */
export function disengage(state: BattleState, u: BattleUnit): boolean {
  if (state.turn.acted) return false;
  fx.bag(u).disengaged = 1;
  state.log.push(`↩ ${u.name} desengaja: recua sem dar brecha.`);
  finishAction(state, u, true);
  return true;
}

export function defend(state: BattleState, u: BattleUnit): void {
  u.defending = true;
  state.log.push(`🛡 ${u.name} se defende.`);
  finishAction(state, u, true);
}

export function hideChance(state: BattleState, u: BattleUnit): number {
  // Tocha acesa ou sob fogo de supressão: impossível sumir.
  if (u.statuses.tocha || u.statuses.suprimido) return 0;
  if (!detectedBy(state, u)) return 100;
  let chance = u.classId === 'ladrao' ? 50 : 0;
  const t = tileAt(state.map, u.x, u.y);
  if (t?.p === 'arbusto' || t?.c === 'fumaca') chance += 30;
  // Luz: aceso à noite atrapalha, escuro ajuda; de dia, sob teto (sombra) ajuda um pouco.
  chance += tactics.hideLightMod(state, u, state.timeOfDay === 'noite' ? litTiles(state) : new Set());
  return Math.max(0, Math.min(95, chance));
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
  fx.bag(u).actedOnce = 1;
  delete fx.bag(u).shoved;
  delete fx.bag(u).disengaged;
  // Supressão sustentada: dura até quem suprime voltar a agir.
  tactics.releaseSuppression(state, u);
  if (u.bound) {
    u.gauge = 0;
    state.activeUid = null;
    return;
  }
  u.defending = false;
  driftSmoke(state, u);
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
  // Armadilha armada embaixo de quem começa o turno (ex.: Armadilha Abrupta): dispara agora.
  if (u.alive) fx.stepOnTile(state, u);
  // Percepção: armadilhas inimigas e passagens secretas por perto.
  if (u.alive) scenery.perceive(state, u);
  if (skip || !u.alive) {
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
      // Fogo nos andares pode ter consumido peças: o que ficou sem apoio cai.
      if (environmentTick(state)) settleStructures(state);
      fx.roundTick(state);
      downed.bleedTick(state);
      build.buildTick(state);
      confine.confineTick(state);
      state.round += 1;
      state.nextRoundAt += ROUND_TIME;
      for (const w of state.waves ?? []) if (!w.done && w.round <= state.round) spawnWave(state, w);
      for (const u of alive()) if (u.betrayAt && !u.betrayed && state.round >= u.betrayAt) betray(state, u);
      if (state.collapsed !== undefined && state.round >= 2) collapseColumn(state);
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
  state.turn = { moved: false, acted: false, startX: u.x, startY: u.y, startZ: u.z, moveLeft: moveBudget(u) };
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
  patrol.checkAlerts(state);
  checkVictory(state);
}

export function checkVictory(state: BattleState): void {
  if (state.outcome) return;
  updateLoot(state);
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
  if (v.type === 'interact' && (state.objectives ?? []).length && state.objectives!.every((o) => o.done && (!isLoot(o.kind) || o.extracted))) state.outcome = 'victory';
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

/**
 * O caminho que some (8.3): a coluna mais à esquerda ainda de pé desaba no vazio. Quem estava nela
 * salta para a casa livre mais próxima à direita, sofrendo 20% da vida; sem para onde ir, cai.
 */
function collapseColumn(state: BattleState): void {
  const x = state.collapsed!;
  if (x >= state.map.w - 2) return;
  state.collapsed = x + 1;
  for (let y = 0; y < state.map.h; y++) {
    const t = tileAt(state.map, x, y)!;
    t.t = 'agua_funda';
    t.p = null;
    t.s = null;
    t.h = 0;
  }
  for (const u of state.units.filter((o) => o.alive && o.x === x)) {
    let spot: [number, number] | null = null;
    for (let d = 1; d < 4 && !spot; d++)
      for (const dy of [0, -1, 1, -2, 2]) {
        const nx = x + d;
        const ny = u.y + dy;
        const t = tileAt(state.map, nx, ny);
        if (t && isWalkable(t) && isFree(state, nx, ny)) {
          spot = [nx, ny];
          break;
        }
      }
    if (spot) {
      [u.x, u.y] = spot;
      damage(state, u, Math.max(1, Math.round(u.maxHp * 0.2)), undefined, undefined);
      state.log.push(`🕳 O chão sumiu sob ${u.name}, que saltou a tempo.`);
    } else {
      damage(state, u, u.hp + (u.shield ?? 0) + 9999, undefined, undefined);
      state.log.push(`🕳 ${u.name} caiu no nada.`);
    }
  }
  state.events.push({ type: 'text', x, y: Math.floor(state.map.h / 2), text: 'O chão desaba!', color: '#ce93d8' });
}

/** Traição: o herói ressentido vira a arma contra o esquadrão. */
function betray(state: BattleState, u: BattleUnit): void {
  u.betrayed = true;
  u.team = 'enemy';
  u.overwatch = false;
  u.hidden = false;
  state.log.push(`🗡 ${u.name} traiu o esquadrão e passou para o lado inimigo!`);
  state.events.push({ type: 'text', x: u.x, y: u.y, text: 'Traição!', color: '#ff5252' });
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
    rival: state.units.some((u) => u.rival) ? { fled: !!state.rivalFled, killed: state.units.some((u) => u.rival && !u.alive) && !state.rivalFled, damage: { ...(state.rivalDamage ?? {}) } } : undefined,
    units: state.units
      .filter((u) => u.charId)
      .map((u) => ({
        charId: u.charId!,
        // Caído sangrando numa vitória: o esquadrão o leva de volta (com 1 de vida).
        alive: u.alive || (state.outcome === 'victory' && (u.downed ?? 0) > 0),
        hp: u.alive ? u.hp : (u.downed ?? 0) > 0 && state.outcome === 'victory' ? 1 : u.hp,
        mp: u.mp,
        maxHp: u.maxHp,
        startHp: u.startHp,
        lowHp: Math.min(u.lowHp ?? u.hp, u.hp),
        kills: u.kills,
        killXp: u.killXp,
        items: [...u.items],
        feats: u.feats,
        betrayed: u.betrayed,
        killedBy: u.killedBy,
        x: u.x,
        y: u.y,
      })),
  };
}
