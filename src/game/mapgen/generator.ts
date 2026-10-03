import { Rng } from '@core';
import type { Biome } from '../data';
import { DISTANT, baseBiome, baseBiomes, isDistant, isTransition, regionLabel, type Region } from '../world/regions';
import { DIRS, MAX_HEIGHT, PERMANENT, TERRAIN, idx, inBounds, isWalkable, type BattleMap, type Prop, type Terrain, type Tile } from '../battle/map';

export interface GenOptions {
  /** Bioma-base ou região (transição mistura os dois vizinhos; bioma distante tem terreno próprio). */
  biome: Region;
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

/** Gera um mapa de batalha para a região, garantindo caminho entre as zonas de spawn. */
export function generateMap(opts: GenOptions): BattleMap {
  const region = opts.biome;
  // Transição: gera no bioma dominante e depois pinta a outra metade (gradiente com ruído).
  if (isTransition(region)) return blendMap(opts, baseBiomes(region) as [Biome, Biome]);
  if (isDistant(region)) return distantMap(opts, region);
  return baseMap({ ...opts, biome: region });
}

function baseMap(opts: GenOptions & { biome: Biome }): BattleMap {
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

/** Transição: a metade "de lá" do mapa ganha o terreno e os objetos do outro bioma, com borda irregular. */
function blendMap(opts: GenOptions, [a, b]: [Biome, Biome]): BattleMap {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const map = baseMap({ ...opts, biome: a, seed });
  const other = baseMap({ ...opts, biome: b, seed: seed + 7 });
  const rng = new Rng(seed + 13);
  const n = valueNoise(rng, map.w, map.h, 4);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const k = (x + y) / (map.w + map.h) + (n(x, y) - 0.5) * 0.35;
      if (k < 0.5) continue;
      const i = idx(map, x, y);
      const t = map.tiles[i]!;
      const o = other.tiles[i]!;
      // Só pinta terreno e objeto (a altura fica: o caminho entre os spawns continua valendo).
      if (t.t !== 'agua_funda' && o.t !== 'agua_funda') t.t = o.t;
      if (!t.spawn && !(x <= 2 || x >= map.w - 3)) {
        t.p = o.p;
        if (o.s) {
          t.s = o.s;
          t.sTtl = o.sTtl;
        }
      }
    }
  map.name = opts.name ?? `${regionLabel(opts.biome)} #${seed % 1000}`;
  map.id = `gen_${opts.biome}_${seed}`;
  ensureConnected(map);
  return map;
}

/** Bioma distante: terreno, terreno secundário, objetos e superfície da região (data/world/regions.json). */
function distantMap(opts: GenOptions, region: keyof typeof DISTANT): BattleMap {
  const def = DISTANT[region];
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const map = baseMap({ ...opts, biome: baseBiome(region), seed });
  const rng = new Rng(seed + 29);
  const n = valueNoise(rng, map.w, map.h, 3);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[idx(map, x, y)]!;
      const inSpawn = x <= 2 || x >= map.w - 3;
      const v = n(x, y);
      if (t.t === 'agua_funda' && !def.sea) t.t = def.terrain as Terrain;
      else if (t.t !== 'agua_funda') t.t = (v > 0.72 && !inSpawn && def.secondary !== 'agua_funda' ? def.secondary : def.terrain) as Terrain;
      if (def.secondary === 'lava' && v > 0.8 && !inSpawn && !t.p) t.t = 'lava';
      if (def.secondary === 'agua_funda' && v < 0.16 && !inSpawn && !t.p) {
        t.t = 'agua_funda';
        t.h = 1;
      }
      if (inSpawn || t.t === 'agua_funda' || t.t === 'lava') {
        if (t.p && inSpawn) t.p = undefined;
        continue;
      }
      t.p = undefined;
      for (const [prop, chance] of def.props) if (rng.chance(chance)) {
        t.p = prop as Prop;
        break;
      }
      if (def.surface && !t.p && v < 0.22) {
        t.s = def.surface as Tile['s'];
        t.sTtl = def.surface === 'fogo' ? 4 : PERMANENT;
      }
    }
  map.name = opts.name ?? `${regionLabel(region)} #${seed % 1000}`;
  map.id = `gen_${region}_${seed}`;
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
    delete t.up;
    delete t.door;
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
