import type { Rng } from '@core';
import CMD from '../data/world/commander.json';
import { DB } from '../data';
import { CITADEL_ID, edgeLength, edgeSpeed, node, nodeOpen, places, shortestPath } from './layout';
import { provinceOf } from './provinces';
import { ensureWorld, infoAge, provinceState, type Owner, type WorldHost } from './territory';
import { beastsOf } from './encounters';
import type { Region } from './regions';

/**
 * Forças inimigas que andam pelo mapa (C11): patrulhas e caçadores da Coroa, caravanas do culto,
 * bandos de feras e rebeldes, incursões do Vazio e exércitos. Cada uma tem um alvo e um objetivo;
 * se chegar, a consequência acontece (vila saqueada, altar erguido, sequestro, cerco). Um esquadrão
 * pode interceptá-la no caminho.
 */
export type ForceKind = keyof typeof CMD.forces.kinds;
export type ForceGoal = 'hunt' | 'raid' | 'altar' | 'abduct' | 'siege';

export interface Force {
  id: string;
  kind: ForceKind;
  owner: Owner;
  goal: ForceGoal;
  at: string;
  to: string | null;
  route: string[];
  progress: number;
  /** Destino do objetivo. */
  target: string;
  level: number;
  /** Composição (ids do bestiário/inimigos). */
  units: string[];
}

export const FORCES = CMD.forces;

export interface ForceHost extends WorldHost {
  seed: number;
  world?: import('./territory').WorldState;
}

let seq = 0;

function kindDef(k: ForceKind) {
  return FORCES.kinds[k];
}

/** Lados aliados do jogador no capítulo: até o Ato 1 ele serve à Coroa; depois, à resistência. */
export function playerSide(chapter: number): Owner[] {
  return chapter <= 1 ? ['coroa'] : ['resistencia', 'livre'];
}

export function forceLabel(f: Force): string {
  return kindDef(f.kind).label;
}
export function forceIcon(f: Force): string {
  return kindDef(f.kind).icon;
}

/** Onde a força nasce: a Coroa na Citadela, o Vazio na Terra Morta, as feras e o culto longe dos esquadrões. */
function originOf(kind: ForceKind, owner: Owner, rng: Rng, chapter: number, avoid: string[]): string {
  const open = places().filter((n) => nodeOpen(n, chapter) && n.realm !== 'continente' && n.type !== 'citadel');
  if (owner === 'coroa' && kind !== 'patrulha') return CITADEL_ID;
  if (owner === 'vazio') {
    const dead = open.filter((n) => n.region === 'terra_morta');
    if (dead.length) return rng.pick(dead).id;
  }
  const far = open.filter((n) => !avoid.includes(n.id) && n.realm === 'reino');
  return rng.pick(far.length ? far : open).id;
}

/** Composição: humanos da lista do tipo; bando de feras sorteado da região de origem. */
function composition(kind: ForceKind, at: string, level: number, rng: Rng): string[] {
  const def = kindDef(kind);
  const n = rng.int(def.size[0]!, def.size[1]!);
  if (def.units.length) return Array.from({ length: n }, () => rng.pick(def.units)).filter((id) => DB.enemies[id]);
  const beasts = beastsOf(node(at).region as Region, 'comum', level);
  return beasts.length ? Array.from({ length: n }, () => rng.pick(beasts).id) : ['bandido', 'bandido', 'bandido'];
}

/** Alvo do objetivo. */
function targetFor(goal: ForceGoal, c: ForceHost, rng: Rng, chapter: number, squadsAt: string[], baseNode: string): string {
  const open = places().filter((n) => nodeOpen(n, chapter) && n.realm === 'reino');
  const mine = open.filter((n) => playerSide(chapter).includes(provinceState(c, n.id).owner));
  switch (goal) {
    case 'hunt':
      return squadsAt.length ? rng.pick(squadsAt) : rng.pick(open).id;
    case 'siege': {
      const caps = mine.filter((n) => n.type === 'capital' || n.id === baseNode);
      return (caps.length ? rng.pick(caps) : rng.pick(open)).id;
    }
    default: {
      // Postos avançados do comandante atraem saques (C18).
      const posts = Object.keys((c as { outposts?: Record<string, string> }).outposts ?? {});
      if (goal === 'raid' && posts.length && rng.chance(0.3)) return rng.pick(posts);
      const towns = (mine.length ? mine : open).filter((n) => n.type === 'city' || n.type === 'village');
      return rng.pick(towns.length ? towns : open).id;
    }
  }
}

/** Cria uma força do capítulo (se houver vaga). */
export function spawnForce(c: ForceHost, rng: Rng, chapter: number, level: number, squadsAt: string[], baseNode: string, kind?: ForceKind): Force | null {
  const w = ensureWorld(c);
  w.forces ??= [];
  if (w.forces.length >= FORCES.maxActive) return null;
  const pool = (FORCES.byChapter as Record<string, string[]>)[String(Math.min(8, chapter))] ?? ['bando'];
  const k = kind ?? (rng.pick(pool) as ForceKind);
  const def = kindDef(k);
  // Do Ato 4 em diante, os exércitos que marcham são dos Barões (Vazio).
  const owner = (k === 'exercito' && chapter >= 4 ? 'vazio' : def.owner) as Owner;
  if (playerSide(chapter).includes(owner)) return null;
  const goal = def.goal as ForceGoal;
  const at = originOf(k, owner, rng, chapter, squadsAt);
  const target = targetFor(goal, c, rng, chapter, squadsAt, baseNode);
  const lvl = Math.max(1, level + def.levelOffset);
  const f: Force = { id: `f${rng.int(1, 1e9)}_${seq++}`, kind: k, owner, goal, at, to: null, route: [], progress: 0, target, level: lvl, units: composition(k, at, lvl, rng) };
  routeTo(f, target, chapter);
  w.forces.push(f);
  return f;
}

export function routeTo(f: Force, dest: string, chapter: number): void {
  const path = shortestPath(f.to ?? f.at, dest, { open: (n) => nodeOpen(n, chapter) });
  if (f.to) f.route = path;
  else {
    f.to = path.shift() ?? null;
    f.route = path;
    f.progress = 0;
  }
}

export type ForceEvent = { type: 'force_arrived'; force: Force } | { type: 'force_meets'; force: Force; nodeId: string };

/** Anda as forças. Devolve chegadas ao alvo e encontros com nós ocupados por esquadrões. */
export function moveForces(c: ForceHost, hours: number, travelSpeed: number, squadNodes: Set<string>): ForceEvent[] {
  const w = ensureWorld(c);
  const out: ForceEvent[] = [];
  for (const f of w.forces ?? []) {
    if (!f.to) continue;
    const len = Math.max(1, edgeLength(f.at, f.to));
    f.progress += (hours * travelSpeed * FORCES.speed * edgeSpeed(f.at, f.to)) / len;
    if (f.progress < 1) continue;
    f.at = f.to;
    f.progress = 0;
    f.to = f.route.shift() ?? null;
    if (squadNodes.has(f.at)) out.push({ type: 'force_meets', force: f, nodeId: f.at });
    else if (!f.to) out.push({ type: 'force_arrived', force: f });
  }
  return out;
}

/** Forças paradas ou passando por este nó. */
export function forcesAt(c: ForceHost, nodeId: string): Force[] {
  return (ensureWorld(c).forces ?? []).filter((f) => f.at === nodeId && f.progress < 0.5);
}

/**
 * A força aparece no mapa? Província vista nas últimas horas, ou província aliada com controle
 * firme (os moradores avisam).
 */
export function forceVisible(c: ForceHost, f: Force): boolean {
  const pid = provinceOf(f.at);
  if (infoAge(c, pid) <= FORCES.visibleAgeHours) return true;
  const st = provinceState(c, pid);
  const chapter = (c as { story?: { chapter: number } }).story?.chapter ?? 0;
  return playerSide(chapter).includes(st.owner) && st.owner !== 'livre' && st.control >= FORCES.informControl;
}

export function removeForce(c: ForceHost, id: string): void {
  const w = ensureWorld(c);
  w.forces = (w.forces ?? []).filter((f) => f.id !== id);
}

/** Posição desenhável da força. */
export function forcePosition(f: Force): { x: number; y: number } {
  const a = node(f.at);
  if (!f.to) return { x: a.x, y: a.y };
  const b = node(f.to);
  return { x: a.x + (b.x - a.x) * f.progress, y: a.y + (b.y - a.y) * f.progress };
}

/** Força a caminho: horas até chegar ao alvo (estimativa). */
export function forceEta(f: Force, travelSpeed: number): number {
  const path = [f.at, ...(f.to ? [f.to] : []), ...f.route];
  let h = 0;
  for (let k = 1; k < path.length; k++) h += edgeLength(path[k - 1]!, path[k]!) / (travelSpeed * FORCES.speed * edgeSpeed(path[k - 1]!, path[k]!));
  return Math.max(0, h - (f.to ? (edgeLength(f.at, f.to) / (travelSpeed * FORCES.speed * edgeSpeed(f.at, f.to))) * f.progress : 0));
}

export const GOAL_LABEL: Record<ForceGoal, string> = { hunt: 'caçar seus esquadrões', raid: 'saquear', altar: 'erguer um altar', abduct: 'sequestrar moradores', siege: 'sitiar' };


