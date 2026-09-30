import type { BattleMap } from '../battle/map';

export const TILE_W = 48;
export const TILE_H = 24;
export const STEP_H = 12;

/** Câmera isométrica com 4 rotações de 90° (estilo Final Fantasy Tactics), zoom e pan. */
export class IsoCamera {
  rot = 0;
  zoom = 1;
  panX = 0;
  panY = 0;
  /** Rotação animada (para suavizar o giro). */
  constructor(
    public viewW: number,
    public viewH: number,
  ) {}

  rotate(dir: 1 | -1): void {
    this.rot = (this.rot + dir + 4) % 4;
  }

  /** Coordenadas do tile depois da rotação. */
  rotated(map: BattleMap, x: number, y: number): [number, number] {
    switch (this.rot) {
      case 1:
        return [map.h - 1 - y, x];
      case 2:
        return [map.w - 1 - x, map.h - 1 - y];
      case 3:
        return [y, map.w - 1 - x];
      default:
        return [x, y];
    }
  }

  /** Centro da face superior do tile (x, y) na altura h, em pixels de tela. */
  project(map: BattleMap, x: number, y: number, h: number): [number, number] {
    const [rx, ry] = this.rotated(map, x, y);
    const rw = this.rot % 2 === 0 ? map.w : map.h;
    const rh = this.rot % 2 === 0 ? map.h : map.w;
    const ox = this.viewW / 2 + this.panX;
    const oy = this.viewH / 2 + this.panY - ((rw + rh) * TILE_H * this.zoom) / 4 + 20 * this.zoom;
    const sx = ox + ((rx - ry) * TILE_W * this.zoom) / 2 - (((rw - rh) * TILE_W) / 4) * this.zoom;
    const sy = oy + ((rx + ry) * TILE_H * this.zoom) / 2 - h * STEP_H * this.zoom;
    return [sx, sy];
  }

  /** Ordem de desenho (de trás para frente) para a rotação atual. */
  drawOrder(map: BattleMap): [number, number][] {
    const out: [number, number][] = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) out.push([x, y]);
    out.sort((a, b) => {
      const [ax, ay] = this.rotated(map, a[0], a[1]);
      const [bx, by] = this.rotated(map, b[0], b[1]);
      return ax + ay - (bx + by) || ax - bx;
    });
    return out;
  }

  /** Tile sob o ponto de tela (testa as faces de cima, da frente para trás). */
  pick(map: BattleMap, px: number, py: number): [number, number] | null {
    const order = this.drawOrder(map);
    const hw = (TILE_W * this.zoom) / 2;
    const hh = (TILE_H * this.zoom) / 2;
    for (let i = order.length - 1; i >= 0; i--) {
      const [x, y] = order[i]!;
      const t = map.tiles[y * map.w + x]!;
      const [sx, sy] = this.project(map, x, y, t.h);
      if (Math.abs(px - sx) / hw + Math.abs(py - sy) / hh <= 1) return [x, y];
      // Clique na lateral de um bloco alto também seleciona o tile.
      if (Math.abs(px - sx) <= hw && py > sy && py < sy + t.h * STEP_H * this.zoom + hh && Math.abs(px - sx) / hw + Math.abs(py - (sy + t.h * STEP_H * this.zoom)) / hh <= 1.2) {
        return [x, y];
      }
    }
    return null;
  }

  /** Direção de tela (1 = direita) correspondente a uma direção do grid, para espelhar sprites. */
  screenFacingRight(map: BattleMap, facing: number): boolean {
    const d = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ][facing]!;
    const [ax] = this.project(map, 0, 0, 0);
    const [bx] = this.project(map, d[0]!, d[1]!, 0);
    return bx >= ax;
  }
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}
