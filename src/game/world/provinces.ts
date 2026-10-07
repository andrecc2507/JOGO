import { node, places, worldGraph, type WorldNode } from './layout';

/**
 * Províncias (C1): cada lugar com nome é o centro de uma província. A forma é a célula de Voronoi
 * entre os centros, recortada por um círculo (fronteiras de mapa antigo, sem invadir o mar aberto).
 * Vizinhas são as ligadas por estrada.
 */
export interface Province {
  id: string;
  name: string;
  center: WorldNode;
  polygon: [number, number][];
  neighbors: string[];
}

const CLIP_R: Record<WorldNode['realm'], number> = { reino: 175, distante: 150, continente: 200, mundo: 130 };
const CIRCLE_SIDES = 22;

let cache: { list: Province[]; byId: Map<string, Province> } | null = null;

/** Recorta o polígono pelo semiplano dos pontos mais perto de `a` do que de `b`. */
function clipBisector(poly: [number, number][], a: WorldNode, b: WorldNode): [number, number][] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const side = (p: [number, number]) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp * sq < 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function build(): { list: Province[]; byId: Map<string, Province> } {
  const centers = places();
  const g = worldGraph();
  const list: Province[] = centers.map((c) => {
    const r = CLIP_R[c.realm];
    // Círculo levemente irregular (contorno desenhado à mão).
    let poly: [number, number][] = Array.from({ length: CIRCLE_SIDES }, (_, k) => {
      const a = (k / CIRCLE_SIDES) * Math.PI * 2;
      const wobble = 1 + 0.08 * Math.sin(a * 3 + c.x * 0.01) + 0.05 * Math.cos(a * 5 + c.y * 0.013);
      return [c.x + Math.cos(a) * r * wobble, c.y + Math.sin(a) * r * wobble] as [number, number];
    });
    for (const o of centers) if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) < r * 2.4) poly = clipBisector(poly, c, o);
    return { id: c.id, name: c.name, center: c, polygon: poly, neighbors: [] };
  });
  const byId = new Map(list.map((p) => [p.id, p]));
  // Vizinhança: anda pelas estradas (pontos de passagem) até o próximo lugar com nome.
  for (const p of list) {
    const seen = new Set([p.id]);
    const queue = [p.id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of g.adj[cur] ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        if (g.nodes[nb]!.type === 'waypoint') queue.push(nb);
        else if (!p.neighbors.includes(nb)) p.neighbors.push(nb);
      }
    }
  }
  return { list, byId };
}

export function provinces(): Province[] {
  return (cache ??= build()).list;
}

export function province(id: string): Province | undefined {
  return (cache ??= build()).byId.get(id);
}

/** Província de um local (ponto de passagem: o lugar com nome mais perto pela estrada). */
export function provinceOf(nodeId: string): string {
  const n = node(nodeId);
  if (n.type !== 'waypoint') return n.id;
  let best = '';
  let bestD = Infinity;
  for (const p of provinces()) {
    const d = Math.hypot(p.center.x - n.x, p.center.y - n.y);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/** Ponto dentro do polígono? (para clicar numa província) */
export function insidePolygon(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
