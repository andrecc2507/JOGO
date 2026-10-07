/**
 * Forma de um tile na tela, ciente do giro da câmera: tudo que se desenha preso ao chão (topo,
 * texturas, objetos em caixa) passa por aqui, para girar junto quando a câmera gira (render/iso.ts).
 */
import { TILE_H, TILE_W } from './iso';

/** Ângulo residual do giro da câmera neste quadro (radianos; 0 = parado numa das 4 vistas). */
let spin = 0;

export function setSpin(rad: number): void {
  spin = rad;
}

export function getSpin(): number {
  return spin;
}

/**
 * Deslocamento na tela de um ponto do chão do tile, em unidades de tile (u, v ∈ [-0,5; 0,5] cobre o
 * topo), para um tile cuja meia-largura na tela é `hw` e meia-altura `hh`.
 */
export function tileOffset(u: number, v: number, hw: number, hh: number): [number, number] {
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  const ru = u * c - v * s;
  const rv = u * s + v * c;
  return [(ru - rv) * hw, (ru + rv) * hh];
}

/** Ponto do chão do tile centrado em (sx, sy). */
export function tilePoint(sx: number, sy: number, hw: number, hh: number, u: number, v: number): [number, number] {
  const [dx, dy] = tileOffset(u, v, hw, hh);
  return [sx + dx, sy + dy];
}

/** Cantos do topo do tile (ou de um retângulo menor `a × b` em volta do centro). */
export function tileCorners(sx: number, sy: number, hw: number, hh: number, a = 0.5, b = a): [number, number][] {
  return [tilePoint(sx, sy, hw, hh, -a, -b), tilePoint(sx, sy, hw, hh, a, -b), tilePoint(sx, sy, hw, hh, a, b), tilePoint(sx, sy, hw, hh, -a, b)];
}

/** Meia-largura e meia-altura de um tile no zoom `z`. */
export function tileHalf(z: number): [number, number] {
  return [(TILE_W * z) / 2, (TILE_H * z) / 2];
}

/** Ruído determinístico por tile (texturas não piscam entre quadros). */
export function tileHash(x: number, y: number, k: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
}

/** Escurece/clareia uma cor #rrggbb. */
export function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/**
 * Caixa isométrica (objetos): base `a × b` (meias medidas em tiles) e altura `height` em pixels de
 * tela. Desenha as laterais que olham para a câmera e o topo; devolve os cantos do topo.
 */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  z: number,
  a: number,
  b: number,
  height: number,
  color: string,
  lift = 0,
): [number, number][] {
  const [hw, hh] = tileHalf(z);
  const base = tileCorners(sx, sy - lift, hw, hh, a, b);
  const top = base.map(([x, y]) => [x, y - height] as [number, number]);
  const cy = sy - lift;
  for (let e = 0; e < 4; e++) {
    const p = base[e]!;
    const q = base[(e + 1) % 4]!;
    if ((p[1] + q[1]) / 2 <= cy + 0.01) continue;
    ctx.fillStyle = tint(color, (p[0] + q[0]) / 2 < sx ? 0.8 : 0.62);
    polygon(ctx, [p, q, [q[0], q[1] - height], [p[0], p[1] - height]]);
    ctx.fill();
  }
  ctx.fillStyle = color;
  polygon(ctx, top);
  ctx.fill();
  return top;
}

/** Cilindro em pé (barril, pilar, poço): raio em tiles, altura em pixels. */
export function isoCylinder(ctx: CanvasRenderingContext2D, sx: number, sy: number, z: number, r: number, height: number, color: string, lift = 0): void {
  const [hw, hh] = tileHalf(z);
  const rx = r * hw * 1.41;
  const ry = r * hh * 1.41;
  const y0 = sy - lift;
  const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, tint(color, 0.85));
  g.addColorStop(0.45, tint(color, 1.05));
  g.addColorStop(1, tint(color, 0.6));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, y0, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(sx - rx, y0 - height);
  ctx.ellipse(sx, y0 - height, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint(color, 1.12);
  ctx.beginPath();
  ctx.ellipse(sx, y0 - height, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
