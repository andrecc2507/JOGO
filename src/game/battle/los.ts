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

/**
 * Linha de visão considerando altura do terreno, objetos altos e nuvens.
 * Olho a 1,5 nível acima do tile de origem; alvo a 1 nível acima do tile de destino.
 */
export function hasLos(map: BattleMap, ax: number, ay: number, bx: number, by: number): boolean {
  const a = tileAt(map, ax, ay);
  const b = tileAt(map, bx, by);
  if (!a || !b) return false;
  const ha = a.h + 1.5;
  const hb = b.h + 1;
  const path = lineTiles(ax, ay, bx, by);
  const n = path.length + 1;
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i]!;
    const t = tileAt(map, x, y)!;
    const lineH = ha + ((hb - ha) * (i + 1)) / n;
    if (t.h > lineH) return false;
    if (t.p && PROPS[t.p].blocksLos && t.h + PROPS[t.p].height > lineH) return false;
    if (t.c && CLOUDS[t.c].blocksLos) return false;
  }
  // Estar dentro de uma nuvem que bloqueia também esconde o alvo de longe.
  if (b.c && CLOUDS[b.c].blocksLos && Math.abs(ax - bx) + Math.abs(ay - by) > 1) return false;
  return true;
}
