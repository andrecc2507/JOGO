import { CLOUDS, PROPS, tileAt, type BattleMap } from './map';

/** Tiles atravessados por uma linha entre centros (Bresenham), sem as pontas. */
export function lineTiles(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [];
  let x = ax;
  let y = ay;
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === bx && y === by) break;
    out.push([x, y]);
  }
  return out;
}

/** O que corta a linha de tiro: o tile e o motivo (para mostrar ao jogador). */
export interface LosBlock {
  x: number;
  y: number;
  reason: string;
}

/**
 * Primeiro obstáculo da linha de visão (altura do terreno, objetos altos e nuvens), ou null se está livre.
 * Olho a 1,5 nível acima do tile de origem; alvo a 1 nível acima do tile de destino.
 */
export function losBlocker(map: BattleMap, ax: number, ay: number, bx: number, by: number): LosBlock | null {
  const a = tileAt(map, ax, ay);
  const b = tileAt(map, bx, by);
  if (!a || !b) return { x: bx, y: by, reason: 'fora do mapa' };
  const ha = a.h + 1.5;
  const hb = b.h + 1;
  const path = lineTiles(ax, ay, bx, by);
  const n = path.length + 1;
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i]!;
    const t = tileAt(map, x, y)!;
    const lineH = ha + ((hb - ha) * (i + 1)) / n;
    if (t.h > lineH) return { x, y, reason: 'terreno mais alto no caminho' };
    if (t.p && PROPS[t.p].blocksLos && t.h + PROPS[t.p].height > lineH) return { x, y, reason: PROPS[t.p].name };
    if (t.c && CLOUDS[t.c].blocksLos) return { x, y, reason: CLOUDS[t.c].name };
  }
  // Estar dentro de uma nuvem que bloqueia também esconde o alvo de longe.
  if (b.c && CLOUDS[b.c].blocksLos && Math.abs(ax - bx) + Math.abs(ay - by) > 1) return { x: bx, y: by, reason: `alvo dentro de ${CLOUDS[b.c].name.toLowerCase()}` };
  return null;
}

/** Linha de visão livre entre os dois tiles. */
export function hasLos(map: BattleMap, ax: number, ay: number, bx: number, by: number): boolean {
  return losBlocker(map, ax, ay, bx, by) === null;
}
