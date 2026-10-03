/**
 * Operações do editor de mapas que não dependem da tela: retângulo, balde de tinta e histórico
 * (desfazer/refazer). Testáveis sem DOM.
 */
import { DIRS, inBounds, type BattleMap, type Terrain, type Tile } from '../battle/map';

/** Tiles do retângulo entre dois cantos (inclusive). */
export function rectTiles(map: BattleMap, a: [number, number], b: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inBounds(map, x, y)) out.push([x, y]);
  return out;
}

/** Balde: pinta com `to` a região contígua do mesmo terreno e mesma altura de (x, y). */
export function floodTerrain(map: BattleMap, x: number, y: number, to: Terrain): number {
  if (!inBounds(map, x, y)) return 0;
  const start = map.tiles[y * map.w + x]!;
  const from = start.t;
  const h = start.h;
  if (from === to) return 0;
  const stack: [number, number][] = [[x, y]];
  const seen = new Set<number>();
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const i = cy * map.w + cx;
    if (seen.has(i) || !inBounds(map, cx, cy)) continue;
    seen.add(i);
    const t = map.tiles[i]!;
    if (t.t !== from || t.h !== h) continue;
    t.t = to;
    n++;
    for (const [dx, dy] of DIRS) stack.push([cx + dx, cy + dy]);
  }
  return n;
}

/** Histórico de edições: guarda cópias dos tiles antes de cada traço. */
export class MapHistory {
  private undoStack: Tile[][] = [];
  private redoStack: Tile[][] = [];
  constructor(private readonly limit = 50) {}

  private copy(map: BattleMap): Tile[] {
    return map.tiles.map((t) => ({ ...t }));
  }

  /** Chamar antes de mudar o mapa. */
  record(map: BattleMap): void {
    this.undoStack.push(this.copy(map));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(map: BattleMap): boolean {
    const prev = this.undoStack.pop();
    if (!prev || prev.length !== map.tiles.length) return false;
    this.redoStack.push(this.copy(map));
    map.tiles = prev;
    return true;
  }

  redo(map: BattleMap): boolean {
    const next = this.redoStack.pop();
    if (!next || next.length !== map.tiles.length) return false;
    this.undoStack.push(this.copy(map));
    map.tiles = next;
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
