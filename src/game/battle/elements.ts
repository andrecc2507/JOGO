import type { Element } from '../data';
import { DIRS, PERMANENT, isFlammable, tileAt, type BattleMap, type Tile } from './map';
import type { BattleState, BattleUnit, StatusId } from './types';

/**
 * Buffs semelhantes não se acumulam: um novo do mesmo grupo substitui o anterior.
 * (O mesmo estado também não soma: fica a maior duração.)
 */
export const BUFF_GROUPS: StatusId[][] = [
  ['fortificado', 'protegido'],
  ['inspirado', 'frenesi'],
  ['duplicatas', 'intangivel'],
];

export function addStatus(u: BattleUnit, id: StatusId, turns: number): void {
  for (const g of BUFF_GROUPS) if (g.includes(id)) for (const other of g) if (other !== id) delete u.statuses[other];
  u.statuses[id] = Math.max(u.statuses[id] ?? 0, turns);
}

export function removeStatus(u: BattleUnit, id: StatusId): void {
  delete u.statuses[id];
}

export function unitAt(state: BattleState, x: number, y: number): BattleUnit | undefined {
  return state.units.find((u) => u.alive && u.x === x && u.y === y);
}

function setSurface(t: Tile, s: Tile['s'], ttl: number): void {
  t.s = s;
  t.sTtl = ttl;
}

function setCloud(t: Tile, c: Tile['c'], ttl: number): void {
  t.c = c;
  t.cTtl = ttl;
  delete t.cBy;
  delete t.cDir;
}

/** Turnos que a fumaça de granada (e a de quem lançou e já caiu) fica parada antes de sumir. */
export const SMOKE_TURNS = 3;

/**
 * Fumaça de habilidade: um objeto atravessável que anda 1 casa a cada turno de quem a lançou,
 * na direção `dir` (índice em DIRS), até sair do mapa. Jogadores escolhem a direção depois de lançar.
 */
export function castSmoke(state: BattleState, owner: BattleUnit, tiles: [number, number][], dir: number): void {
  for (const [x, y] of tiles) {
    const t = tileAt(state.map, x, y);
    if (!t) continue;
    setCloud(t, 'fumaca', PERMANENT);
    t.cBy = owner.uid;
    t.cDir = dir;
  }
  if (owner.team === 'player' && !owner.ai) state.smokeToSteer = owner.uid;
}

/** Direção padrão da fumaça: de quem lançou para o alvo (ou para onde ele olha). */
export function smokeDirection(u: BattleUnit, x: number, y: number): number {
  const dx = x - u.x;
  const dy = y - u.y;
  if (dx === 0 && dy === 0) return u.facing;
  const d: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  return DIRS.findIndex(([a, b]) => a === d[0] && b === d[1]);
}

/** Muda a direção de toda a fumaça andante de `owner`. */
export function steerSmoke(state: BattleState, ownerUid: string, dir: number): void {
  for (const t of state.map.tiles) if (t.cBy === ownerUid) t.cDir = dir;
  if (state.smokeToSteer === ownerUid) delete state.smokeToSteer;
}

/** Início do turno de `owner`: a fumaça dele anda uma casa (a que sai do mapa some). */
export function driftSmoke(state: BattleState, owner: BattleUnit): void {
  const map = state.map;
  const moving: { x: number; y: number; dir: number }[] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x]!;
      if (t.c === 'fumaca' && t.cBy === owner.uid) {
        moving.push({ x, y, dir: t.cDir ?? 0 });
        setCloud(t, null, 0);
      }
    }
  for (const m of moving) {
    const [dx, dy] = DIRS[m.dir] ?? DIRS[0]!;
    const t = tileAt(map, m.x + dx, m.y + dy);
    if (!t) continue;
    setCloud(t, 'fumaca', PERMANENT);
    t.cBy = owner.uid;
    t.cDir = m.dir;
  }
}

/** Vento dissipa nuvens (fumaça, vapor, veneno) nos tiles atingidos. */
export function dissipateClouds(state: BattleState, tiles: [number, number][]): number {
  let n = 0;
  for (const [x, y] of tiles) {
    const t = tileAt(state.map, x, y);
    if (t?.c) {
      setCloud(t, null, 0);
      n++;
    }
  }
  return n;
}

/** Eletrifica todas as poças conectadas a partir de (x, y). */
function electrifyWater(map: BattleMap, x: number, y: number, touched: [number, number][]): void {
  const stack: [number, number][] = [[x, y]];
  const seen = new Set<number>();
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const key = cy * map.w + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = tileAt(map, cx, cy);
    if (!t || (t.s !== 'agua' && t.s !== 'agua_eletrica')) continue;
    setSurface(t, 'agua_eletrica', 2);
    touched.push([cx, cy]);
    for (const [dx, dy] of DIRS) stack.push([cx + dx, cy + dy]);
  }
}

/** Faz a água escorrer um passo para vizinhos mais baixos. */
function flowWater(map: BattleMap, x: number, y: number, ttl: number): void {
  const t = tileAt(map, x, y);
  if (!t || ttl <= 1) return;
  for (const [dx, dy] of DIRS) {
    const n = tileAt(map, x + dx, y + dy);
    if (!n || n.s || n.h >= t.h || n.t === 'agua_funda') continue;
    setSurface(n, 'agua', ttl - 1);
  }
}

/**
 * Aplica um elemento a um tile, resolvendo interações com superfícies e nuvens.
 * Retorna os tiles afetados em cadeia (ex.: água eletrificada conectada, explosões).
 */
export function applyElementToTile(state: BattleState, x: number, y: number, el: Element | 'oleo' | 'fumaca'): [number, number][] {
  const map = state.map;
  const t = tileAt(map, x, y);
  const touched: [number, number][] = [[x, y]];
  if (!t) return [];
  switch (el) {
    case 'fogo':
      if (t.c === 'veneno') {
        setCloud(t, null, 0);
        state.events.push({ type: 'fx', x, y, element: 'fogo' });
        state.log.push('💥 A nuvem de veneno explodiu!');
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const u = unitAt(state, x + dx, y + dy);
            if (u) explosionDamage(state, u, 14);
          }
      }
      if (t.s === 'agua' || t.s === 'agua_eletrica') {
        setSurface(t, null, 0);
        setCloud(t, 'vapor', 2);
      } else if (t.s === 'gelo') {
        setSurface(t, 'agua', 4);
      } else if (t.s === 'oleo') {
        setSurface(t, 'fogo', 4);
        for (const [dx, dy] of DIRS) {
          const n = tileAt(map, x + dx, y + dy);
          if (n?.s === 'oleo') touched.push(...applyElementToTile(state, x + dx, y + dy, 'fogo'));
        }
      } else if (isFlammable(t)) {
        setSurface(t, 'fogo', 3);
      }
      if (t.c === 'fumaca') setCloud(t, null, 0);
      break;
    case 'agua':
      if (t.s === 'fogo') {
        setSurface(t, null, 0);
        setCloud(t, 'vapor', 2);
      } else if (t.s === 'gelo' || t.s === 'agua_eletrica') {
        // mantém
      } else if (t.t === 'terra' && t.s !== 'agua') {
        setSurface(t, 'lama', 8);
      } else if (t.t !== 'agua_funda') {
        setSurface(t, 'agua', 6);
        flowWater(map, x, y, 6);
      }
      break;
    case 'gelo':
      if (t.s === 'agua' || t.s === 'agua_eletrica') setSurface(t, 'gelo', 6);
      else if (t.s === 'fogo') setSurface(t, 'agua', 3);
      if (t.c === 'vapor' || t.c === 'vapor_eletrico') setCloud(t, null, 0);
      break;
    case 'eletricidade':
      if (t.s === 'agua' || t.s === 'agua_eletrica') electrifyWater(map, x, y, touched);
      if (t.c === 'vapor') setCloud(t, 'vapor_eletrico', 2);
      break;
    case 'vento':
      if (t.c) setCloud(t, null, 0);
      if (t.s === 'fogo') {
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = tileAt(map, x + dx, y + dy);
            if (n && n.s !== 'fogo' && n.t !== 'agua_funda' && n.s !== 'agua' && n.s !== 'gelo') {
              setSurface(n, 'fogo', 2);
              touched.push([x + dx, y + dy]);
            }
          }
      }
      break;
    case 'veneno':
      setCloud(t, 'veneno', 3);
      break;
    case 'terra':
    case 'oleo':
      if (t.t !== 'agua_funda' && t.s !== 'fogo') setSurface(t, 'oleo', PERMANENT);
      break;
    case 'fumaca':
      setCloud(t, 'fumaca', SMOKE_TURNS);
      break;
    case 'luz':
      if (t.c === 'fumaca') setCloud(t, null, 0);
      break;
    case 'sombra':
      break;
  }
  return touched;
}

function explosionDamage(state: BattleState, u: BattleUnit, amount: number): void {
  u.hp = Math.max(0, u.hp - amount);
  u.lowHp = Math.min(u.lowHp ?? u.hp, u.hp);
  state.events.push({ type: 'damage', uid: u.uid, amount, element: 'fogo' });
  if (u.hp <= 0 && u.alive) {
    u.alive = false;
    state.events.push({ type: 'death', uid: u.uid });
    state.log.push(`☠ ${u.name} caiu.`);
  }
}

/** Efeito direto de um elemento numa unidade (status). */
export function applyElementToUnit(state: BattleState, u: BattleUnit, el: Element): void {
  switch (el) {
    case 'fogo':
      if (u.statuses.molhado) removeStatus(u, 'molhado');
      else addStatus(u, 'queimando', 2);
      removeStatus(u, 'congelado');
      break;
    case 'agua':
      addStatus(u, 'molhado', 3);
      removeStatus(u, 'queimando');
      break;
    case 'gelo':
      if (u.statuses.molhado) {
        removeStatus(u, 'molhado');
        addStatus(u, 'congelado', 1);
        state.log.push(`❄ ${u.name} congelou!`);
      }
      removeStatus(u, 'queimando');
      break;
    case 'eletricidade':
      addStatus(u, 'eletrocutado', 2);
      break;
    case 'veneno':
      addStatus(u, 'envenenado', 3);
      break;
    case 'luz':
      if (u.hidden) {
        u.hidden = false;
        state.log.push(`✦ A luz revelou ${u.name}!`);
      }
      break;
    default:
      break;
  }
}

/** Efeitos ao entrar/estar num tile com superfície ou nuvem. Retorna dano causado. */
export function tileEffectsOnUnit(state: BattleState, u: BattleUnit): number {
  const t = tileAt(state.map, u.x, u.y);
  if (!t || u.statuses.voando) return 0;
  let dmg = 0;
  switch (t.s) {
    case 'fogo':
      if (u.statuses.molhado) removeStatus(u, 'molhado');
      else {
        addStatus(u, 'queimando', 2);
        dmg += 4;
      }
      break;
    case 'agua':
      addStatus(u, 'molhado', 3);
      removeStatus(u, 'queimando');
      break;
    case 'agua_eletrica':
      addStatus(u, 'molhado', 3);
      addStatus(u, 'eletrocutado', 2);
      dmg += 6;
      break;
    case 'lama':
      addStatus(u, 'enlameado', 2);
      break;
    default:
      break;
  }
  if (t.c === 'veneno') addStatus(u, 'envenenado', 3);
  if (t.c === 'vapor_eletrico') {
    addStatus(u, 'eletrocutado', 2);
    dmg += 4;
  }
  return dmg;
}

/** Uma rodada de ambiente: durações, propagação de fogo, clima do bioma. */
export function environmentTick(state: BattleState): void {
  const map = state.map;
  const ignite: [number, number][] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x]!;
      if (t.s === 'fogo') {
        for (const [dx, dy] of DIRS) {
          const n = tileAt(map, x + dx, y + dy);
          if (!n) continue;
          if (n.s === 'oleo') ignite.push([x + dx, y + dy]);
          else if (!n.s && isFlammable(n) && state.rng.chance(0.3)) ignite.push([x + dx, y + dy]);
        }
      }
      if (t.s && t.sTtl !== undefined && t.sTtl < PERMANENT) {
        t.sTtl -= 1;
        if (state.biome === 'deserto' && t.s === 'agua') t.sTtl -= 1;
        if (state.biome === 'neve' && t.s === 'agua' && state.rng.chance(0.25)) {
          t.s = 'gelo';
          t.sTtl = 6;
        }
        if (t.sTtl <= 0) {
          if (t.s === 'gelo') setSurface(t, 'agua', 4);
          else if (t.s === 'agua_eletrica') setSurface(t, 'agua', 3);
          else if (t.s === 'fogo') {
            if (t.p && (t.p === 'arvore' || t.p === 'pinheiro' || t.p === 'arbusto' || t.p === 'caixa' || t.p === 'cacto')) t.p = null;
            if (t.t === 'grama' || t.t === 'madeira') t.t = 'terra';
            setSurface(t, null, 0);
          } else setSurface(t, null, 0);
        }
      }
      // Fumaça andante não envelhece enquanto quem a lançou está de pé; depois fica parada e some.
      if (t.cBy) {
        const owner = state.units.find((u) => u.uid === t.cBy);
        if (owner?.alive) continue;
        delete t.cBy;
        delete t.cDir;
        t.cTtl = SMOKE_TURNS + 1;
      }
      if (t.c && t.cTtl !== undefined) {
        t.cTtl -= 1;
        if (t.cTtl <= 0) setCloud(t, null, 0);
      }
    }
  for (const [x, y] of ignite) applyElementToTile(state, x, y, 'fogo');
  for (const u of state.units) {
    if (!u.alive) continue;
    const t = tileAt(map, u.x, u.y);
    if (t?.s === 'fogo' && !u.statuses.molhado) addStatus(u, 'queimando', 2);
    if (t?.c === 'veneno') addStatus(u, 'envenenado', 2);
  }
}
