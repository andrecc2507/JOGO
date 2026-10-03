/**
 * Prédios em andares. Cada coluna do mapa é o chão (bloco maciço de 0 até `t.h`) mais peças de
 * construção empilhadas (`t.up`): paredes, lajes de andar, telhados. Os vãos entre as peças são o
 * espaço onde se anda (andares), as portas (vão de 2 níveis com `door`) e as janelas (vão de
 * 1 nível: a visão e os tiros passam, ninguém passa).
 *
 * Níveis de uma coluna: 0 = topo do chão; k = topo de `t.up[k-1]`. Uma célula é (x, y, nível).
 * Regra simplificada: uma unidade por coluna (quem está no telhado bloqueia a casa de baixo).
 *
 * Física: peça sem apoio cai. Apoio vem de baixo (chão ou peça encostada) ou dos lados, por no máximo
 * `SPAN` casas de balanço. Peça que cai de `FALL_BREAK` níveis ou mais vira escombro. Módulo puro.
 */
import { PROPS, TERRAIN, inBounds, isWalkable, tileAt, type BattleMap, type Slab, type Tile } from './map';

/** Vão livre para ficar de pé. */
export const HEADROOM = 2;
/** Altura de um andar (piso a piso): 2 de vão + 1 de laje. */
export const STOREY = 3;
/** Balanço: quantas casas uma peça se segura só pelos lados. */
export const SPAN = 3;
/** Queda (em níveis) a partir da qual a peça se despedaça em escombros. */
export const FALL_BREAK = 2;
/** Resistência de peça de material sem valor próprio. */
export const DEFAULT_PIECE_HP = 60;
/** Altura máxima de construção (20 andares e telhado). */
export const MAX_BUILD_HEIGHT = 8 + 20 * STOREY + 2;

const DIRS4: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function isStacked(t: Tile | undefined): boolean {
  return !!t?.up?.length;
}

export function levelCount(t: Tile): number {
  return 1 + (t.up?.length ?? 0);
}

/** A peça cujo topo é o nível `l` (o próprio tile no nível 0). */
export function pieceOf(t: Tile, l: number): Tile | Slab {
  return l === 0 ? t : t.up![l - 1]!;
}

export function topOf(t: Tile, l: number): number {
  return l === 0 ? t.h : t.up![l - 1]!.h;
}

/** Base da próxima peça acima do nível `l` (Infinity = céu aberto). */
export function ceilOf(t: Tile, l: number): number {
  return t.up?.[l]?.b ?? Infinity;
}

/** Porta fechada no vão acima do nível `l`. */
export function doorClosed(t: Tile, l: number): boolean {
  const p = pieceOf(t, l);
  return !!p.door && !p.open && ceilOf(t, l) < Infinity;
}

/** Porta trancada no vão acima do nível `l`. */
export function doorLocked(t: Tile, l: number): boolean {
  return doorClosed(t, l) && !!pieceOf(t, l).locked;
}

/** Porta (aberta ou fechada) no vão acima do nível `l`. */
export function hasDoor(t: Tile, l: number): boolean {
  return !!pieceOf(t, l).door && ceilOf(t, l) < Infinity;
}

/** Dá para ficar de pé no nível `l`? (vão livre e chão firme, sem objeto que bloqueie). */
export function standable(t: Tile, l: number): boolean {
  if (l >= levelCount(t)) return false;
  if (ceilOf(t, l) - topOf(t, l) < HEADROOM) return false;
  if (l === 0) return isWalkable(t);
  const s = t.up![l - 1]!;
  return TERRAIN[s.t].walkable && !(s.p && PROPS[s.p].blocksMove);
}

/** Coberto: há peça acima do nível (dentro de casa, sob o telhado). */
export function covered(t: Tile, l: number): boolean {
  return ceilOf(t, l) < Infinity;
}

// ───────────────────────────── células ─────────────────────────────

export function cellId(map: BattleMap, x: number, y: number, l = 0): number {
  return l * map.w * map.h + y * map.w + x;
}

export function cellPos(map: BattleMap, c: number): [number, number, number] {
  const n = map.w * map.h;
  const l = Math.floor(c / n);
  const i = c - l * n;
  return [i % map.w, Math.floor(i / map.w), l];
}

/** Nível cujo topo está na altura `z` (sem `z`, o chão; sem peça nessa altura, o nível firme mais alto abaixo). */
export function levelAt(t: Tile, z: number | undefined): number {
  if (z === undefined || !t.up?.length) return 0;
  let best = 0;
  for (let k = 0; k < t.up.length; k++) {
    const h = t.up[k]!.h;
    if (h === z) return k + 1;
    if (h <= z && standable(t, k + 1)) best = k + 1;
  }
  return best;
}

/** Altura em que pisa quem está em (x, y) na altura declarada `z` (ausente = chão). */
export function standH(map: BattleMap, x: number, y: number, z?: number): number {
  const t = tileAt(map, x, y);
  if (!t) return 0;
  return topOf(t, levelAt(t, z));
}

export interface Placed {
  x: number;
  y: number;
  /** Altura do topo da peça onde pisa; ausente = chão da coluna. */
  z?: number;
}

export function unitLevel(map: BattleMap, u: Placed): number {
  const t = tileAt(map, u.x, u.y);
  return t ? levelAt(t, u.z) : 0;
}

export function unitH(map: BattleMap, u: Placed): number {
  return standH(map, u.x, u.y, u.z);
}

export function unitCell(map: BattleMap, u: Placed): number {
  return cellId(map, u.x, u.y, unitLevel(map, u));
}

/** Põe a unidade no nível `l` da coluna onde está. */
export function setLevel(map: BattleMap, u: Placed, l: number): void {
  const t = tileAt(map, u.x, u.y);
  if (!t || l <= 0) delete u.z;
  else u.z = topOf(t, l);
}

/** Nível em que se fica de pé ao chegar na coluna: o mais baixo livre (chão, ou o primeiro andar com vão). */
export function lowestStandable(t: Tile): number {
  for (let l = 0; l < levelCount(t); l++) if (standable(t, l)) return l;
  return levelCount(t) - 1;
}

/** Nível mais alto (telhado) da coluna. */
export function topLevel(t: Tile): number {
  return levelCount(t) - 1;
}

/** Altura mais alta da coluna (topo da última peça). */
export function columnTop(t: Tile): number {
  return topOf(t, topLevel(t));
}

// ───────────────────────────── espaço e passagem ─────────────────────────────

/** Há peça maciça na altura `z` desta coluna? (só peças de construção; o chão é tratado à parte) */
export function slabAt(t: Tile, z: number): number {
  if (!t.up) return -1;
  for (let k = 0; k < t.up.length; k++) {
    const s = t.up[k]!;
    if (z > s.b && z < s.h) return k + 1;
  }
  return -1;
}

/** Algo bloqueia a visão na altura `z`: peça maciça ou porta fechada. */
export function opaqueAt(t: Tile, z: number): boolean {
  if (!t.up?.length) return false;
  if (slabAt(t, z) >= 0) return true;
  for (let l = 0; l < levelCount(t); l++) {
    const top = topOf(t, l);
    if (doorClosed(t, l) && z > top && z < ceilOf(t, l)) return true;
    // Objetos altos sobre as peças (estantes, pilares dentro de casa).
    const p = l > 0 ? t.up![l - 1]!.p : null;
    if (p && PROPS[p].blocksLos && z > top && z < top + PROPS[p].height) return true;
  }
  return false;
}

/** Espaço livre de peças entre `z0` e `z1` nesta coluna (o chão fica abaixo de `z0` por construção). */
export function freeSpan(t: Tile, z0: number, z1: number): boolean {
  if (t.h > z0) return false;
  if (!t.up) return true;
  for (const s of t.up) if (s.b < z1 && s.h > z0) return false;
  return true;
}

/**
 * Passo entre células vizinhas: diferença de altura dentro do salto (escada encostada ignora o
 * limite) e espaço livre para o corpo nas duas colunas até a mais alta + o vão (não se salta através
 * de teto nem de parede).
 */
export function canStep(map: BattleMap, ax: number, ay: number, la: number, bx: number, by: number, lb: number, jump: number): boolean {
  const A = tileAt(map, ax, ay);
  const B = tileAt(map, bx, by);
  if (!A || !B) return false;
  const ha = topOf(A, la);
  const hb = topOf(B, lb);
  const climb = !!A.ladder || !!B.ladder;
  if (!climb && (hb - ha > jump || ha - hb > jump + 1)) return false;
  const hi = Math.max(ha, hb) + HEADROOM;
  return freeSpan(A, ha, hi) && freeSpan(B, hb, hi);
}

/** Níveis ligados pela escada da coluna (o de baixo e o de cima, os dois de pé). */
export function ladderLinks(t: Tile, l: number): number[] {
  if (!t.ladder) return [];
  const out: number[] = [];
  for (let k = l - 1; k >= 0; k--)
    if (standable(t, k)) {
      out.push(k);
      break;
    }
  for (let k = l + 1; k < levelCount(t); k++)
    if (standable(t, k)) {
      out.push(k);
      break;
    }
  return out;
}

/**
 * Linha de visão em 3D contra peças de construção e portas fechadas (o relevo do chão é testado em
 * battle/los.ts). Devolve a coluna que corta a linha, ou null.
 */
export function rayBlocked(map: BattleMap, ax: number, ay: number, za: number, bx: number, by: number, zb: number): [number, number] | null {
  const d = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  const n = Math.max(2, Math.ceil(d * 8));
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const x = Math.round(ax + (bx - ax) * f);
    const y = Math.round(ay + (by - ay) * f);
    const t = tileAt(map, x, y);
    if (!t?.up?.length) continue;
    if (opaqueAt(t, za + (zb - za) * f)) return [x, y];
  }
  return null;
}

/** O mapa tem alguma peça de construção? (atalho para não marchar raios à toa) */
export function mapHasStacks(map: BattleMap): boolean {
  return map.tiles.some((t) => t.up?.length);
}

// ───────────────────────────── dano e física ─────────────────────────────

export function pieceMaxHp(s: Slab): number {
  return TERRAIN[s.t].hp ?? DEFAULT_PIECE_HP;
}

export function pieceHp(s: Slab): number {
  return s.hp ?? pieceMaxHp(s);
}

/** Peça (nível ≥ 1) que ocupa a altura `z` na coluna, ou a mais próxima dela; -1 se não há. */
export function pieceNear(t: Tile, z: number): number {
  if (!t.up?.length) return -1;
  const at = slabAt(t, z);
  if (at > 0) return at;
  let best = -1;
  let dist = Infinity;
  for (let k = 0; k < t.up.length; k++) {
    const s = t.up[k]!;
    const d = z < s.b ? s.b - z : z - s.h;
    if (d < dist) {
      dist = d;
      best = k + 1;
    }
  }
  return dist <= HEADROOM ? best : -1;
}

/** Tira resistência da peça `l` (≥ 1). Devolve a peça destruída (já removida da coluna) ou null. */
export function damagePiece(t: Tile, l: number, amount: number): Slab | null {
  const s = t.up?.[l - 1];
  if (!s || amount <= 0) return null;
  const left = pieceHp(s) - amount;
  if (left > 0) {
    s.hp = left;
    return null;
  }
  t.up!.splice(l - 1, 1);
  if (!t.up!.length) delete t.up;
  return s;
}

export interface Fall {
  x: number;
  y: number;
  slab: Slab;
  /** Base antes e depois da queda. */
  from: number;
  to: number;
  /** Virou escombro. */
  broke: boolean;
}

/**
 * Peças sem apoio: nem chão ou peça embaixo (em cadeia até o chão), nem vizinhas apoiadas dos lados
 * dentro do balanço. Devolve o conjunto de peças soltas.
 */
export function unsupported(map: BattleMap): { x: number; y: number; slab: Slab }[] {
  const dist = new Map<Slab, number>();
  const queue: { x: number; y: number; k: number; d: number }[] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x]!;
      t.up?.forEach((s, k) => {
        if (s.b <= t.h) {
          dist.set(s, 0);
          queue.push({ x, y, k, d: 0 });
        }
      });
    }
  const relax = (x: number, y: number, k: number, d: number) => {
    const s = map.tiles[y * map.w + x]!.up![k]!;
    if (d > SPAN || d >= (dist.get(s) ?? Infinity)) return;
    dist.set(s, d);
    queue.push({ x, y, k, d });
  };
  while (queue.length) {
    // Fila de prioridade simples: o menor balanço primeiro.
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.d < queue[bi]!.d) bi = i;
    const { x, y, k, d } = queue.splice(bi, 1)[0]!;
    const t = map.tiles[y * map.w + x]!;
    const s = t.up![k]!;
    if (d > (dist.get(s) ?? Infinity)) continue;
    // Em cima: a peça encostada herda o mesmo apoio. Embaixo (pendurada): conta como balanço.
    const above = t.up![k + 1];
    if (above && above.b <= s.h) relax(x, y, k + 1, d);
    const below = t.up![k - 1];
    if (below && below.h >= s.b) relax(x, y, k - 1, d + 1);
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nt = map.tiles[ny * map.w + nx]!;
      nt.up?.forEach((o, j) => {
        if (Math.min(o.h, s.h) - Math.max(o.b, s.b) > 0) relax(nx, ny, j, d + 1);
      });
    }
  }
  const out: { x: number; y: number; slab: Slab }[] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) for (const s of map.tiles[y * map.w + x]!.up ?? []) if (!dist.has(s)) out.push({ x, y, slab: s });
  return out;
}

/**
 * Derruba as peças sem apoio: cada uma cai na sua coluna até a primeira superfície embaixo. Queda de
 * `FALL_BREAK`+ níveis vira escombro (metade da espessura, objetos em cima se perdem) e esmaga o
 * objeto onde cai. Devolve as quedas (as unidades são tratadas pelo motor).
 */
export function settle(map: BattleMap): Fall[] {
  const loose = unsupported(map).sort((a, b) => a.slab.b - b.slab.b);
  const falls: Fall[] = [];
  for (const { x, y, slab } of loose) {
    const t = map.tiles[y * map.w + x]!;
    const list = t.up!;
    list.splice(list.indexOf(slab), 1);
    let land = t.h;
    let landing: Tile | Slab = t;
    for (const o of list)
      if (o.h <= slab.b && o.h >= land) {
        land = o.h;
        landing = o;
      }
    const from = slab.b;
    const thick = slab.h - slab.b;
    const broke = from - land >= FALL_BREAK;
    slab.b = land;
    if (broke) {
      slab.t = 'escombros';
      slab.h = land + Math.max(1, Math.ceil(thick / 2));
      slab.p = null;
      delete slab.pHp;
      delete slab.hp;
      delete slab.door;
      delete slab.open;
    } else slab.h = land + thick;
    // O que estava no chão onde a peça caiu é esmagado.
    if (landing.p && !(landing.p === 'portal_vazio')) {
      landing.p = null;
      delete landing.pHp;
    }
    delete landing.door;
    list.push(slab);
    list.sort((a, b) => a.b - b.b);
    falls.push({ x, y, slab, from, to: land, broke });
  }
  return falls;
}

/** Quanto a peça `l` (≥ 1) da coluna (x, y) sustenta: peças que cairiam se ela sumisse (prévia). */
export function wouldCollapse(map: BattleMap, x: number, y: number, l: number): number {
  const t = tileAt(map, x, y);
  const s = t?.up?.[l - 1];
  if (!t || !s) return 0;
  const list = t.up!;
  const k = list.indexOf(s);
  list.splice(k, 1);
  const n = unsupported(map).length;
  list.splice(k, 0, s);
  return n;
}
