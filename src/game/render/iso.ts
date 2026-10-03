import type { BattleMap } from '../battle/map';

export const TILE_W = 48;
export const TILE_H = 24;
export const STEP_H = 12;

/** Duração (s) do giro de 90° da câmera. */
export const ROTATE_TIME = 0.42;

/** Agora, em segundos (relógio do navegador ou do Node nos testes). */
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** Suaviza o começo e o fim do giro. */
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Câmera isométrica com 4 rotações de 90° (estilo Final Fantasy Tactics), zoom e pan.
 * O giro é animado: o mapa gira de verdade (ângulo contínuo), sem corte.
 */
export class IsoCamera {
  /** Rotação de destino (0–3): é a que vale para a lógica (setas, espelhar). */
  rot = 0;
  zoom = 1;
  panX = 0;
  panY = 0;
  /** Giro em andamento: de `from` para `to` (em quartos de volta, sem dar a volta no 4). */
  private from = 0;
  private to = 0;
  private start = -Infinity;
  private orderCache: { key: string; order: [number, number][] } | null = null;
  constructor(
    public viewW: number,
    public viewH: number,
  ) {}

  rotate(dir: 1 | -1): void {
    // Começa do ângulo atual (girar de novo no meio do giro continua suave).
    this.from = this.turn();
    this.to += dir;
    this.start = now();
    this.rot = ((this.to % 4) + 4) % 4;
  }

  /** Gira sem animação (posição inicial). */
  snapTo(rot: number): void {
    this.rot = ((rot % 4) + 4) % 4;
    this.from = this.to = this.rot;
    this.start = -Infinity;
  }

  /** Ângulo atual em quartos de volta (contínuo durante o giro). */
  turn(): number {
    const t = (now() - this.start) / ROTATE_TIME;
    return t >= 1 ? this.to : this.from + (this.to - this.from) * ease(Math.max(0, t));
  }

  /** A câmera está girando agora? */
  rotating(): boolean {
    return now() - this.start < ROTATE_TIME;
  }

  /** Coordenadas do tile depois da rotação, relativas ao centro do mapa (contínuas no giro). */
  private spin(map: BattleMap, x: number, y: number, turn = this.turn()): [number, number] {
    const a = (turn * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = x - (map.w - 1) / 2;
    const dy = y - (map.h - 1) / 2;
    return [dx * c - dy * s, dx * s + dy * c];
  }

  /** Coordenadas do tile na rotação de destino (inteiras, origem no canto). */
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

  /** Centro da face superior do tile (x, y) na altura h, em pixels de tela (aceita frações). */
  project(map: BattleMap, x: number, y: number, h: number, turn = this.turn()): [number, number] {
    const [rx, ry] = this.spin(map, x, y, turn);
    const z = this.zoom;
    const sx = this.viewW / 2 + this.panX + ((rx - ry) * TILE_W * z) / 2;
    const sy = this.viewH / 2 + this.panY + ((rx + ry) * TILE_H * z) / 2 - (TILE_H * z) / 2 + 20 * z - h * STEP_H * z;
    return [sx, sy];
  }

  /**
   * Os 4 cantos da face de cima do tile (escala `k` em volta do centro), em ordem: no giro a face
   * vira um losango inclinado de verdade; parado, é o losango isométrico de sempre.
   */
  quad(map: BattleMap, x: number, y: number, h: number, k = 1): [number, number][] {
    const t = this.turn();
    const r = k / 2;
    return [
      this.project(map, x - r, y - r, h, t),
      this.project(map, x + r, y - r, h, t),
      this.project(map, x + r, y + r, h, t),
      this.project(map, x - r, y + r, h, t),
    ];
  }

  /** Profundidade de desenho de um ponto do mapa (maior = mais na frente). */
  depth(map: BattleMap, x: number, y: number): number {
    const [rx, ry] = this.spin(map, x, y);
    return rx + ry;
  }

  /** Ordem de desenho (de trás para frente) para o ângulo atual. */
  drawOrder(map: BattleMap): [number, number][] {
    const t = this.turn();
    const key = `${map.id}:${map.w}x${map.h}:${t.toFixed(3)}`;
    if (this.orderCache?.key === key) return this.orderCache.order;
    const out: { p: [number, number]; d: number; e: number }[] = [];
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const [rx, ry] = this.spin(map, x, y, t);
        out.push({ p: [x, y], d: rx + ry, e: rx });
      }
    out.sort((a, b) => a.d - b.d || a.e - b.e);
    const order = out.map((o) => o.p);
    this.orderCache = { key, order };
    return order;
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
