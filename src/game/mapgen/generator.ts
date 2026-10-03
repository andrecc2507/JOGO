import { Rng } from '@core';
import type { Biome } from '../data';
import { DIRS, MAX_HEIGHT, PERMANENT, TERRAIN, idx, inBounds, isWalkable, type BattleMap, type Prop, type Terrain, type Tile } from '../battle/map';

export interface GenOptions {
  biome: Biome;
  w?: number;
  h?: number;
  seed?: number;
  name?: string;
}

/** Ruído de valor 2D com interpolação suave. */
function valueNoise(rng: Rng, w: number, h: number, cell: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = Array.from({ length: gw * gh }, () => rng.next());
  const at = (gx: number, gy: number) => grid[Math.min(gh - 1, gy) * gw + Math.min(gw - 1, gx)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

interface BiomeProfile {
  maxH: number;
  base: Terrain;
  props: [Prop, number][];
}

const PROFILES: Record<Biome, BiomeProfile> = {
  floresta: { maxH: 3, base: 'grama', props: [['arvore', 0.13], ['arbusto', 0.08], ['rocha', 0.02]] },
  neve: { maxH: 5, base: 'neve', props: [['pinheiro', 0.07], ['rocha', 0.05]] },
  costa: { maxH: 2, base: 'grama', props: [['rocha', 0.04], ['caixa', 0.03], ['arbusto', 0.03]] },
  deserto: { maxH: 3, base: 'areia', props: [['cacto', 0.04], ['rocha', 0.04]] },
  planicie: { maxH: 2, base: 'grama', props: [['arbusto', 0.05], ['arvore', 0.04], ['caixa', 0.01]] },
};

export const BIOME_LABEL: Record<Biome, string> = {
  floresta: 'Floresta',
  neve: 'Montanhas de neve',
  costa: 'Costa',
  deserto: 'Deserto',
  planicie: 'Planície',
};

/** Gera um mapa de batalha para o bioma, garantindo caminho entre as zonas de spawn. */
export function generateMap(opts: GenOptions): BattleMap {
  const w = opts.w ?? 14;
  const h = opts.h ?? 14;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = new Rng(seed);
  const profile = PROFILES[opts.biome];
  const n1 = valueNoise(rng, w, h, 5);
  const n2 = valueNoise(rng, w, h, 3);
  const n3 = valueNoise(rng, w, h, 4);
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = n1(x, y) * 0.7 + n2(x, y) * 0.3;
      let height = Math.round(v * profile.maxH);
      let t: Terrain = profile.base;
      const detail = n3(x, y);
      switch (opts.biome) {
        case 'floresta':
          if (detail > 0.68) t = 'terra';
          break;
        case 'neve':
          if (height >= 4) t = 'pedra';
          break;
        case 'costa':
          if (v < 0.3 && x > w * 0.25 && x < w * 0.75) {
            t = 'agua_funda';
            height = 0;
          } else if (v < 0.42) t = 'areia';
          break;
        case 'deserto':
          if (height >= 3 || detail > 0.8) t = 'pedra';
          break;
        case 'planicie':
          if (Math.abs(y - h / 2 - (detail - 0.5) * 4) < 0.8) t = 'terra';
          break;
      }
      tiles.push({ h: Math.min(MAX_HEIGHT, Math.max(0, height + 1)), t });
    }
  const map: BattleMap = { id: `gen_${opts.biome}_${seed}`, name: opts.name ?? `${BIOME_LABEL[opts.biome]} #${seed % 1000}`, w, h, biome: opts.biome, tiles };

  smoothCliffs(map);

  // Objetos e superfícies iniciais.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = map.tiles[idx(map, x, y)]!;
      if (t.t === 'agua_funda') continue;
      const inSpawn = x <= 2 || x >= w - 3;
      if (!inSpawn) {
        for (const [prop, chance] of profile.props) {
          if (rng.chance(chance)) {
            t.p = prop;
            break;
          }
        }
      }
      if (opts.biome === 'neve' && !t.p && t.h <= 2 && n3(x, y) > 0.72) {
        t.s = 'gelo';
        t.sTtl = PERMANENT;
      }
      if (opts.biome === 'costa' && !t.p && t.t === 'areia' && rng.chance(0.08)) {
        t.s = 'agua';
        t.sTtl = PERMANENT;
      }
      if (opts.biome === 'planicie' && !t.p && n2(x, y) < 0.18 && !inSpawn) {
        t.s = 'agua';
        t.sTtl = PERMANENT;
      }
    }

  markSpawns(map);
  ensureConnected(map);
  return map;
}

/** Limita desníveis bruscos para que a maioria dos tiles seja alcançável com salto 1. */
function smoothCliffs(map: BattleMap): void {
  for (let pass = 0; pass < 3; pass++)
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const t = map.tiles[idx(map, x, y)]!;
        for (const [dx, dy] of DIRS) {
          if (!inBounds(map, x + dx, y + dy)) continue;
          const n = map.tiles[idx(map, x + dx, y + dy)]!;
          if (n.t === 'agua_funda' || t.t === 'agua_funda') continue;
          if (t.h - n.h > 2) t.h = n.h + 2;
        }
      }
}

export function markSpawns(map: BattleMap): void {
  for (const t of map.tiles) if (t.spawn === 'player' || t.spawn === 'enemy') t.spawn = null;
  const pick = (cols: number[], kind: 'player' | 'enemy') => {
    const cands: [number, number][] = [];
    for (const x of cols) for (let y = 0; y < map.h; y++) if (isWalkable(map.tiles[idx(map, x, y)]!)) cands.push([x, y]);
    cands.sort((a, b) => Math.abs(a[1] - map.h / 2) - Math.abs(b[1] - map.h / 2));
    for (const [x, y] of cands.slice(0, 8)) map.tiles[idx(map, x, y)]!.spawn = kind;
  };
  pick([0, 1, 2], 'player');
  pick([map.w - 1, map.w - 2, map.w - 3], 'enemy');
}

/** Garante que existe caminho (salto 1) entre as zonas; se não houver, abre um corredor. */
export function ensureConnected(map: BattleMap): void {
  const start = map.tiles.findIndex((t) => t.spawn === 'player');
  const goal = map.tiles.findIndex((t) => t.spawn === 'enemy');
  if (start < 0 || goal < 0) return;
  if (connected(map, start, goal)) return;
  const y = Math.floor(map.h / 2);
  let prevH = map.tiles[idx(map, 0, y)]!.h;
  for (let x = 0; x < map.w; x++) {
    const t = map.tiles[idx(map, x, y)]!;
    // Água vira ponte; lava, abismo e afins viram chão firme.
    if (!TERRAIN[t.t].walkable) t.t = t.t === 'agua_funda' ? 'madeira' : 'cascalho';
    t.p = null;
    if (t.h > prevH + 1) t.h = prevH + 1;
    if (t.h < prevH - 1) t.h = prevH - 1;
    t.h = Math.max(1, t.h);
    prevH = t.h;
  }
  markSpawns(map);
}

function connected(map: BattleMap, from: number, to: number): boolean {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === to) return true;
    const x = cur % map.w;
    const y = Math.floor(cur / map.w);
    const ct = map.tiles[cur]!;
    for (const [dx, dy] of DIRS) {
      if (!inBounds(map, x + dx, y + dy)) continue;
      const ni = idx(map, x + dx, y + dy);
      const nt = map.tiles[ni]!;
      if (seen.has(ni) || !isWalkable(nt) || Math.abs(nt.h - ct.h) > 1) continue;
      seen.add(ni);
      stack.push(ni);
    }
  }
  return false;
}

export { connected as mapConnected };
