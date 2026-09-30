import { DB, type Biome } from '../data';

export type NodeType = 'citadel' | 'capital' | 'city' | 'waypoint';

export interface WorldNode {
  id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  countryId: string | null;
  biome: Biome;
}

export interface WorldGraph {
  nodes: Record<string, WorldNode>;
  edges: [string, string][];
  adj: Record<string, string[]>;
  width: number;
  height: number;
}

export const WORLD_W = 1200;
export const WORLD_H = 820;
export const CITADEL_ID = 'citadela';

function dist(a: WorldNode, b: WorldNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

let cached: WorldGraph | null = null;

/** Continente: Citadela no centro, 5 países em anel, 5 cidades cada, pontos de passagem nas rotas. */
export function worldGraph(): WorldGraph {
  if (cached) return cached;
  const nodes: Record<string, WorldNode> = {};
  const edges: [string, string][] = [];
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  nodes[CITADEL_ID] = { id: CITADEL_ID, name: 'Citadela Real', type: 'citadel', x: cx, y: cy, countryId: null, biome: 'planicie' };
  const roads: [string, string][] = [];
  const countries = DB.countries;
  const offsets = [-78, -32, 32, 78].map((d) => (d * Math.PI) / 180);
  countries.forEach((c, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / countries.length;
    const px = cx + Math.cos(a) * 285;
    const py = cy + Math.sin(a) * 235;
    const capId = `${c.id}_capital`;
    nodes[capId] = { id: capId, name: c.capital, type: 'capital', x: px, y: py, countryId: c.id, biome: c.biome };
    roads.push([CITADEL_ID, capId]);
    c.cities.forEach((name, j) => {
      const ang = a + offsets[j]!;
      const r = j === 0 || j === 3 ? 120 : 105;
      const id = `${c.id}_c${j}`;
      nodes[id] = { id, name, type: 'city', x: px + Math.cos(ang) * r, y: py + Math.sin(ang) * r * 0.85, countryId: c.id, biome: c.biome };
      roads.push([capId, id]);
    });
    roads.push([`${c.id}_c0`, `${c.id}_c1`]);
    roads.push([`${c.id}_c2`, `${c.id}_c3`]);
  });
  // Fronteiras: última cidade de um país liga à primeira do vizinho.
  countries.forEach((c, i) => {
    const next = countries[(i + 1) % countries.length]!;
    roads.push([`${c.id}_c3`, `${next.id}_c0`]);
  });
  let wp = 0;
  for (const [a, b] of roads) {
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const d = dist(na, nb);
    const count = Math.max(1, Math.round(d / 115));
    let prev = a;
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      const jitter = (wp % 2 === 0 ? 1 : -1) * 9;
      const nx = (nb.y - na.y) / d;
      const ny = -(nb.x - na.x) / d;
      const owner = na.countryId ? na : nb;
      const id = `wp_${wp++}`;
      nodes[id] = {
        id,
        name: 'Estrada',
        type: 'waypoint',
        x: na.x + (nb.x - na.x) * t + nx * jitter,
        y: na.y + (nb.y - na.y) * t + ny * jitter,
        countryId: t < 0.5 ? na.countryId ?? owner.countryId : nb.countryId ?? owner.countryId,
        biome: (t < 0.5 ? (na.countryId ? na : nb) : nb.countryId ? nb : na).biome,
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

export function edgeLength(a: string, b: string): number {
  return dist(node(a), node(b));
}

/** Menor caminho (Dijkstra). Retorna os nós depois de `from`, até `to` inclusive. */
export function shortestPath(from: string, to: string): string[] {
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
      const nd = best + edgeLength(cur, nb);
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
