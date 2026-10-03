import { DB, type Biome } from '../data';
import { CONTINENT, DISTANT, baseBiome, regionSpeed, transitionOf, type Distant, type Region } from './regions';

/**
 * Locais do mapa-mundo. Além da Citadela, capitais, cidades e estradas do reino, há as terras
 * distantes (D125): cada bioma distante tem uma vila de fronteira, um covil e uma masmorra; o
 * arquipélago e o continente Além-Brumas só se alcançam de barco.
 */
export type NodeType = 'citadel' | 'capital' | 'city' | 'waypoint' | 'village' | 'lair' | 'dungeon';

export interface WorldNode {
  id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  countryId: string | null;
  /** Bioma-base (bestiário e batalha). */
  biome: Biome;
  /** Região (bioma-base, transição ou bioma distante). */
  region: Region;
  /** Reino, terras distantes ou o outro continente. */
  realm: 'reino' | 'distante' | 'continente';
  /** Ponto de passagem no mar (rota de barco). */
  sea?: boolean;
  /** Só aparece a partir deste capítulo da história. */
  fromChapter?: number;
}

export interface WorldGraph {
  nodes: Record<string, WorldNode>;
  edges: [string, string][];
  adj: Record<string, string[]>;
  width: number;
  height: number;
}

export const WORLD_W = 3000;
export const WORLD_H = 2000;
export const CITADEL_ID = 'citadela';
/** Escala do reino em relação ao mapa antigo (as distâncias entre capitais viram dias). */
const K = 1.6;
/** Raio do anel das terras distantes (unidades do mundo). */
const FAR = 900;
/** Espaço entre pontos de passagem (≈ meio dia de estrada). */
const WAYPOINT_SPACING = 90;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const DISTANT_NAMES: Record<Distant, [string, string, string]> = {
  pantano: ['Vila do Junco', 'Covil da Lama Viva', 'Catacumba Afogada'],
  vulcao: ['Posto das Cinzas', 'Ninho de Brasas', 'Forja Esquecida'],
  selva: ['Aldeia Rubra', 'Toca das Mil Presas', 'Templo Engolido'],
  geleira: ['Abrigo do Último Pico', 'Garganta do Uivo', 'Cripta de Gelo Eterno'],
  cristal: ['Acampamento dos Lapidários', 'Ninho de Prisma', 'Biblioteca Partida'],
  arquipelago: ['Porto das Velas', 'Gruta do Naufrágio', 'Farol Submerso'],
  terra_morta: ['Última Vigília', 'Fenda Cinzenta', 'Sepulcro dos Selos'],
};

const CONTINENT_NAMES: Record<string, [string, string]> = {
  geleira: ['Guarda Branca', 'Ponte Congelada'],
  selva: ['Raiz-Mãe', 'Ruínas Verdes'],
  cristal: ['Cidade Espelhada', 'Torre de Prisma'],
  vulcao: ['Coroa de Cinza', 'Caldeirão'],
  terra_morta: ['Capital Invertida', 'Trono Vazio'],
};

let cached: WorldGraph | null = null;

/**
 * Continente: Citadela no centro, 5 países em anel (cidades de fronteira viram transição entre os
 * dois biomas vizinhos), terras distantes num anel de fora e o continente Além-Brumas a leste.
 */
export function worldGraph(): WorldGraph {
  if (cached) return cached;
  const nodes: Record<string, WorldNode> = {};
  const edges: [string, string][] = [];
  const seaRoads = new Set<string>();
  const cx = WORLD_W / 2 - 180;
  const cy = WORLD_H / 2;
  const add = (n: Omit<WorldNode, 'realm'> & { realm?: WorldNode['realm'] }) => (nodes[n.id] = { realm: 'reino', ...n });
  add({ id: CITADEL_ID, name: 'Citadela Real', type: 'citadel', x: cx, y: cy, countryId: null, biome: 'planicie', region: 'planicie' });
  const roads: [string, string][] = [];
  const countries = DB.countries;
  const offsets = [-78, -32, 32, 78].map((d) => (d * Math.PI) / 180);
  countries.forEach((c, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / countries.length;
    const px = cx + Math.cos(a) * 285 * K;
    const py = cy + Math.sin(a) * 235 * K;
    const capId = `${c.id}_capital`;
    add({ id: capId, name: c.capital, type: 'capital', x: px, y: py, countryId: c.id, biome: c.biome, region: c.biome });
    roads.push([CITADEL_ID, capId]);
    c.cities.forEach((name, j) => {
      const ang = a + offsets[j]!;
      const r = (j === 0 || j === 3 ? 120 : 105) * K;
      const id = `${c.id}_c${j}`;
      add({ id, name, type: 'city', x: px + Math.cos(ang) * r, y: py + Math.sin(ang) * r * 0.85, countryId: c.id, biome: c.biome, region: c.biome });
      roads.push([capId, id]);
    });
    roads.push([`${c.id}_c0`, `${c.id}_c1`]);
    roads.push([`${c.id}_c2`, `${c.id}_c3`]);
  });
  // Fronteiras: última cidade de um país liga à primeira do vizinho; as duas viram transição.
  countries.forEach((c, i) => {
    const next = countries[(i + 1) % countries.length]!;
    roads.push([`${c.id}_c3`, `${next.id}_c0`]);
    const tr = transitionOf(c.biome, next.biome);
    if (tr) {
      nodes[`${c.id}_c3`]!.region = tr;
      nodes[`${next.id}_c0`]!.region = tr;
    }
  });
  const kingdom = Object.values(nodes).filter((n) => n.type === 'city' || n.type === 'capital');
  // Terras distantes: vila de fronteira, covil e masmorra por bioma distante.
  for (const [rid, def] of Object.entries(DISTANT) as [Distant, (typeof DISTANT)[Distant]][]) {
    const a = (def.angle * Math.PI) / 180;
    const at = (r: number, da: number) => ({ x: cx + Math.cos(a + da) * r * 1.15, y: cy + Math.sin(a + da) * r * 0.92 });
    const [vName, lName, dName] = DISTANT_NAMES[rid];
    const village = `${rid}_vila`;
    const extra = { countryId: null, biome: baseBiome(rid), region: rid as Region, realm: 'distante' as const, fromChapter: def.fromChapter };
    add({ id: village, name: vName, type: 'village', ...at(FAR - 70, 0), ...extra, region: rid === 'selva' ? 'mangue' : rid });
    add({ id: `${rid}_covil`, name: lName, type: 'lair', ...at(FAR + 40, 0.09), ...extra });
    add({ id: `${rid}_masmorra`, name: dName, type: 'dungeon', ...at(FAR + 60, -0.09), ...extra });
    roads.push([village, `${rid}_covil`], [village, `${rid}_masmorra`]);
    const v = nodes[village]!;
    if (def.sea) {
      // Arquipélago: rota de barco a partir da capital da costa.
      const port = kingdom.find((n) => n.type === 'capital' && n.biome === 'costa')!;
      roads.push([port.id, village]);
      seaRoads.add(`${port.id}|${village}`);
    } else {
      const near = [...kingdom].sort((p, q) => dist(p, v) - dist(q, v))[0]!;
      roads.push([near.id, village]);
    }
  }
  // Continente Além-Brumas (Ato 6): a leste, além do mar; porto ligado à capital da costa por barco.
  const ex = WORLD_W - 330;
  const port = add({ id: 'continente_porto', name: 'Cais da Bruma', type: 'village', x: ex - 120, y: cy + 60, countryId: null, biome: 'costa', region: 'costa', realm: 'continente', fromChapter: CONTINENT.fromChapter });
  const coast = kingdom.find((n) => n.type === 'capital' && n.biome === 'costa')!;
  roads.push([coast.id, port.id]);
  seaRoads.add(`${coast.id}|${port.id}`);
  CONTINENT.regions.forEach((rid, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / CONTINENT.regions.length;
    const [aName, bName] = CONTINENT_NAMES[rid]!;
    const extra = { countryId: null, biome: baseBiome(rid), region: rid as Region, realm: 'continente' as const, fromChapter: CONTINENT.fromChapter };
    const a = add({ id: `continente_${rid}`, name: aName, type: 'village', x: ex + Math.cos(ang) * 190, y: cy + Math.sin(ang) * 330, ...extra });
    const b = add({ id: `continente_${rid}_masmorra`, name: bName, type: rid === 'terra_morta' ? 'dungeon' : 'lair', x: ex + Math.cos(ang) * 290, y: cy + Math.sin(ang) * 470, ...extra });
    roads.push([port.id, a.id], [a.id, b.id]);
  });
  let wp = 0;
  for (const [a, b] of roads) {
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const d = dist(na, nb);
    const sea = seaRoads.has(`${a}|${b}`);
    const count = Math.max(1, Math.round(d / (sea ? WAYPOINT_SPACING * 2.5 : WAYPOINT_SPACING)));
    let prev = a;
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      const jitter = (wp % 2 === 0 ? 1 : -1) * 9;
      const nx = (nb.y - na.y) / d;
      const ny = -(nb.x - na.x) / d;
      const near = t < 0.5 ? na : nb;
      const id = `wp_${wp++}`;
      nodes[id] = {
        id,
        name: sea ? 'Mar' : 'Estrada',
        type: 'waypoint',
        x: na.x + (nb.x - na.x) * t + nx * jitter,
        y: na.y + (nb.y - na.y) * t + ny * jitter,
        countryId: near.countryId ?? (na.countryId ? na : nb).countryId,
        biome: near.biome,
        region: near.region,
        realm: near.realm,
        sea: sea || undefined,
        fromChapter: Math.max(na.fromChapter ?? 0, nb.fromChapter ?? 0) || undefined,
      };
      edges.push([prev, id]);
      prev = id;
    }
    edges.push([prev, b]);
  }
  const adj: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) adj[id] = [];
  for (const [a, b] of edges) {
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  cached = { nodes, edges, adj, width: WORLD_W, height: WORLD_H };
  return cached;
}

export function node(id: string): WorldNode {
  const n = worldGraph().nodes[id];
  if (!n) throw new Error(`Nó desconhecido: ${id}`);
  return n;
}

export function hasNode(id: string | null | undefined): boolean {
  return !!id && !!worldGraph().nodes[id];
}

export function edgeLength(a: string, b: string): number {
  return dist(node(a), node(b));
}

/** Velocidade num trecho: média das regiões das pontas; no mar o barco é mais rápido. Fora da estrada, mais lento. */
export function edgeSpeed(a: string, b: string, offroad = false): number {
  const na = node(a);
  const nb = node(b);
  if (na.sea || nb.sea) return SEA_SPEED;
  return (regionSpeed(na.region, offroad) + regionSpeed(nb.region, offroad)) / 2;
}

export const SEA_SPEED = 1.3;

/** Local disponível neste capítulo da história (terras que só se abrem mais tarde ficam fora). */
export function nodeOpen(n: WorldNode, chapter: number): boolean {
  return (n.fromChapter ?? 0) <= chapter;
}

/**
 * Menor caminho em tempo de viagem (Dijkstra pelo terreno). Retorna os nós depois de `from`, até
 * `to` inclusive. `open` filtra os locais ainda fechados.
 */
export function shortestPath(from: string, to: string, opts: { offroad?: boolean; open?: (n: WorldNode) => boolean } = {}): string[] {
  if (from === to) return [];
  const g = worldGraph();
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const n of open) if ((d.get(n) ?? Infinity) < best) (best = d.get(n)!), (cur = n);
    open.delete(cur);
    if (cur === to) break;
    for (const nb of g.adj[cur] ?? []) {
      if (opts.open && !opts.open(g.nodes[nb]!)) continue;
      const nd = best + edgeLength(cur, nb) / edgeSpeed(cur, nb, opts.offroad);
      if (nd < (d.get(nb) ?? Infinity)) {
        d.set(nb, nd);
        prev.set(nb, cur);
        open.add(nb);
      }
    }
  }
  if (!prev.has(to)) return [];
  const path: string[] = [];
  let cur: string | undefined = to;
  while (cur && cur !== from) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path;
}

export function countryOf(nodeId: string) {
  const n = node(nodeId);
  return n.countryId ? DB.countries.find((c) => c.id === n.countryId) ?? null : null;
}

export function capitals(): WorldNode[] {
  return Object.values(worldGraph().nodes).filter((n) => n.type === 'capital');
}

/** Locais com nome (sem os pontos de passagem). */
export function places(): WorldNode[] {
  return Object.values(worldGraph().nodes).filter((n) => n.type !== 'waypoint');
}
