/**
 * Objetos do mapa (props): natureza, caverna, cidade medieval, templo e Vazio. Desenho procedural;
 * os que têm base (caixas, mesas, carroças) giram junto com a câmera (render/tile_shape.ts).
 */
import { PROPS, type Tile } from '../battle/map';
import { isoBox, isoCylinder, polygon, tileHash, tileHalf, tilePoint, tint } from './tile_shape';

type Ctx = CanvasRenderingContext2D;

function disc(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

function stroke(ctx: Ctx, pts: [number, number][], color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.stroke();
}

function flame(ctx: Ctx, x: number, y: number, z: number, time: number, size = 1): void {
  for (let k = 0; k < 3; k++) {
    const f = Math.sin(time * 11 + k * 2.1) * 1.5 * z;
    const hgt = (9 - k * 2) * z * size;
    ctx.fillStyle = ['#ff6a1a', '#ffb02e', '#fff0a0'][k]!;
    ctx.beginPath();
    ctx.moveTo(x - (5 - k * 1.4) * z * size, y);
    ctx.quadraticCurveTo(x + f, y - hgt * 1.4, x + (5 - k * 1.4) * z * size, y);
    ctx.fill();
  }
}

/** Sombra suave no chão (objetos ganham peso). */
function shadow(ctx: Ctx, sx: number, sy: number, z: number, r = 10): void {
  disc(ctx, sx, sy + 1 * z, r * z, r * 0.45 * z, 'rgba(0,0,0,0.22)');
}

export function drawPropArt(ctx: Ctx, t: Tile, sx: number, sy: number, z: number, time: number, x: number, y: number): void {
  const def = PROPS[t.p!];
  const [hw, hh] = tileHalf(z);
  const at = (u: number, v: number) => tilePoint(sx, sy, hw, hh, u, v);
  switch (t.p) {
    // ── natureza ──
    case 'arvore':
      shadow(ctx, sx, sy, z, 12);
      ctx.fillStyle = '#5d3a1e';
      ctx.fillRect(sx - 3 * z, sy - 18 * z, 6 * z, 18 * z);
      for (const [dx, dy, r, c] of [
        [0, -34, 14, '#2e6b2a'],
        [-8, -26, 10, '#357a31'],
        [8, -27, 10, '#2a6127'],
        [0, -42, 9, '#3f8a38'],
      ] as const)
        disc(ctx, sx + dx * z + Math.sin(time + sx) * 0.6, sy + dy * z, r * z, r * z, c);
      break;
    case 'pinheiro':
      shadow(ctx, sx, sy, z, 10);
      ctx.fillStyle = '#4e3420';
      ctx.fillRect(sx - 2 * z, sy - 10 * z, 4 * z, 10 * z);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k % 2 ? '#2c5a3c' : '#24503a';
        polygon(ctx, [[sx - (14 - k * 3) * z, sy - (8 + k * 11) * z], [sx, sy - (26 + k * 11) * z], [sx + (14 - k * 3) * z, sy - (8 + k * 11) * z]]);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(sx - 3 * z, sy - 49 * z, 6 * z, 3 * z);
      break;
    case 'rocha':
      ctx.fillStyle = '#6d6f73';
      polygon(ctx, [[sx - 12 * z, sy + 2 * z], [sx - 8 * z, sy - 12 * z], [sx + 4 * z, sy - 16 * z], [sx + 12 * z, sy - 4 * z], [sx + 10 * z, sy + 3 * z]]);
      ctx.fill();
      ctx.fillStyle = '#8b8e93';
      ctx.fillRect(sx - 6 * z, sy - 12 * z, 7 * z, 4 * z);
      break;
    case 'arbusto':
      for (const [dx, dy, r] of [
        [-6, -5, 7],
        [5, -6, 7],
        [0, -10, 7],
      ] as const)
        disc(ctx, sx + dx * z, sy + dy * z, r * z, r * z, '#3f7f34');
      break;
    case 'cacto':
      ctx.fillStyle = '#4f8a3a';
      ctx.fillRect(sx - 3 * z, sy - 26 * z, 6 * z, 26 * z);
      ctx.fillRect(sx - 10 * z, sy - 18 * z, 4 * z, 10 * z);
      ctx.fillRect(sx - 10 * z, sy - 12 * z, 8 * z, 3 * z);
      ctx.fillRect(sx + 6 * z, sy - 22 * z, 4 * z, 10 * z);
      ctx.fillRect(sx + 2 * z, sy - 14 * z, 8 * z, 3 * z);
      break;
    case 'arvore_morta':
      shadow(ctx, sx, sy, z, 8);
      stroke(ctx, [[sx, sy], [sx - 1 * z, sy - 30 * z]], '#4a3828', 5 * z);
      stroke(ctx, [[sx - 1 * z, sy - 18 * z], [sx - 12 * z, sy - 30 * z], [sx - 15 * z, sy - 38 * z]], '#4a3828', 2.5 * z);
      stroke(ctx, [[sx, sy - 24 * z], [sx + 11 * z, sy - 36 * z], [sx + 13 * z, sy - 44 * z]], '#4a3828', 2.5 * z);
      stroke(ctx, [[sx - 1 * z, sy - 30 * z], [sx + 3 * z, sy - 44 * z]], '#4a3828', 2 * z);
      break;
    case 'tronco': {
      const a = at(-0.38, 0.05);
      const b = at(0.38, -0.05);
      stroke(ctx, [a, b], '#6b4a2c', 9 * z);
      disc(ctx, b[0], b[1] - 0.5 * z, 4.2 * z, 4.2 * z, '#c49a64');
      disc(ctx, b[0], b[1] - 0.5 * z, 2 * z, 2 * z, '#8a6438');
      disc(ctx, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 4 * z, 3 * z, 1.5 * z, '#4f7a3a');
      break;
    }
    case 'cogumelo':
      shadow(ctx, sx, sy, z, 9);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(sx - 3 * z, sy - 16 * z, 6 * z, 16 * z);
      ctx.fillStyle = '#b0413e';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 16 * z, 13 * z, 9 * z, 0, Math.PI, 0);
      ctx.fill();
      for (const [dx, dy] of [
        [-6, -19],
        [3, -22],
        [7, -17],
      ] as const)
        disc(ctx, sx + dx * z, sy + dy * z, 1.8 * z, 1.4 * z, '#f4ecd8');
      break;
    case 'flores':
      for (let k = 0; k < 6; k++) {
        const p = at(tileHash(x, y, k) * 0.7 - 0.35, tileHash(x, y, k + 7) * 0.7 - 0.35);
        stroke(ctx, [p, [p[0], p[1] - 3 * z]], '#3f7f34', 1);
        disc(ctx, p[0], p[1] - 3.5 * z, 1.6 * z, 1.4 * z, ['#e0a0c8', '#f4e06a', '#a0c8f0'][k % 3]!);
      }
      break;
    // ── caverna ──
    case 'estalagmite':
      for (const [dx, w, hgt, c] of [
        [-5, 5, 22, '#6e665c'],
        [4, 6, 30, '#7d746a'],
        [9, 3, 14, '#5c554c'],
      ] as const) {
        ctx.fillStyle = c;
        polygon(ctx, [[sx + (dx - w) * z, sy + 1 * z], [sx + dx * z, sy - hgt * z], [sx + (dx + w) * z, sy + 1 * z]]);
        ctx.fill();
      }
      break;
    case 'cristal': {
      const pulse = 0.85 + Math.sin(time * 2 + x + y) * 0.15;
      for (const [dx, w, hgt, c] of [
        [-6, 4, 18, '#7fc8ee'],
        [2, 5, 28, '#bfeaff'],
        [8, 3, 14, '#5aa8d8'],
      ] as const) {
        ctx.fillStyle = c;
        polygon(ctx, [[sx + (dx - w) * z, sy], [sx + dx * z - 1 * z, sy - hgt * z * pulse], [sx + (dx + w) * z, sy], [sx + dx * z, sy + 2 * z]]);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(sx + 1 * z, sy - 22 * z, 1.5 * z, 8 * z);
      break;
    }
    case 'minerio':
      ctx.fillStyle = '#6a6056';
      polygon(ctx, [[sx - 13 * z, sy + 2 * z], [sx - 9 * z, sy - 11 * z], [sx + 3 * z, sy - 15 * z], [sx + 13 * z, sy - 5 * z], [sx + 11 * z, sy + 3 * z]]);
      ctx.fill();
      for (let k = 0; k < 5; k++) disc(ctx, sx + (tileHash(x, y, k) * 18 - 9) * z, sy - (2 + tileHash(x, y, k + 3) * 10) * z, 1.6 * z, 1.2 * z, k % 2 ? '#e8c050' : '#c0c8d0');
      break;
    case 'ossos':
      stroke(ctx, [at(-0.25, -0.05), at(0.2, 0.08)], '#e8e0cc', 2.2 * z);
      stroke(ctx, [at(-0.1, 0.2), at(0.15, -0.2)], '#d8d0bc', 2 * z);
      disc(ctx, at(0.22, -0.18)[0], at(0.22, -0.18)[1] - 3 * z, 4 * z, 3.4 * z, '#efe8d6');
      disc(ctx, at(0.22, -0.18)[0] - 1.4 * z, at(0.22, -0.18)[1] - 3.4 * z, 0.9 * z, 0.9 * z, '#3a3028');
      disc(ctx, at(0.22, -0.18)[0] + 1.2 * z, at(0.22, -0.18)[1] - 3.4 * z, 0.9 * z, 0.9 * z, '#3a3028');
      break;
    case 'teia': {
      const c = [sx, sy - 12 * z] as [number, number];
      ctx.strokeStyle = 'rgba(235,235,245,0.75)';
      ctx.lineWidth = 0.8;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        stroke(ctx, [c, [c[0] + Math.cos(a) * 13 * z, c[1] + Math.sin(a) * 10 * z]], 'rgba(235,235,245,0.75)', 0.8);
      }
      for (const r of [4, 8, 12]) {
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], r * z, r * 0.77 * z, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'cogumelos_brilho': {
      const glow = 0.7 + Math.sin(time * 2.4 + x * 2) * 0.3;
      for (let k = 0; k < 4; k++) {
        const p = at(tileHash(x, y, k) * 0.6 - 0.3, tileHash(x, y, k + 4) * 0.6 - 0.3);
        ctx.fillStyle = '#d8e8e0';
        ctx.fillRect(p[0] - 0.8 * z, p[1] - 4 * z, 1.6 * z, 4 * z);
        ctx.fillStyle = `rgba(102,240,200,${glow})`;
        ctx.beginPath();
        ctx.ellipse(p[0], p[1] - 4 * z, 3 * z, 2 * z, 0, Math.PI, 0);
        ctx.fill();
      }
      break;
    }
    // ── cidade ──
    case 'muro': {
      const top = isoBox(ctx, sx, sy, z, 0.46, 0.46, 24 * z, '#7a7066');
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      polygon(ctx, top);
      ctx.stroke();
      break;
    }
    case 'parede_madeira':
      for (let k = -2; k <= 2; k++) {
        const p = at(k * 0.2, 0);
        ctx.fillStyle = k % 2 ? '#7a5530' : '#6a4826';
        ctx.fillRect(p[0] - 4 * z, p[1] - 26 * z, 8 * z, 26 * z);
        polygon(ctx, [[p[0] - 4 * z, p[1] - 26 * z], [p[0], p[1] - 31 * z], [p[0] + 4 * z, p[1] - 26 * z]]);
        ctx.fill();
      }
      stroke(ctx, [at(-0.5, 0), at(0.5, 0)].map(([a, b]) => [a, b - 18 * z] as [number, number]), '#4a2e16', 2 * z);
      break;
    case 'pilar':
      shadow(ctx, sx, sy, z, 10);
      isoBox(ctx, sx, sy, z, 0.34, 0.34, 4 * z, '#b8b2a6');
      isoCylinder(ctx, sx, sy, z, 0.22, 34 * z, '#d8d2c6', 4 * z);
      isoBox(ctx, sx, sy, z, 0.32, 0.32, 4 * z, '#c8c2b6', 38 * z);
      break;
    case 'pilar_quebrado':
      isoBox(ctx, sx, sy, z, 0.34, 0.34, 4 * z, '#a39d92');
      isoCylinder(ctx, sx, sy, z, 0.22, 10 * z, '#bdb7ab', 4 * z);
      polygon(ctx, [[sx - 6 * z, sy - 14 * z], [sx - 2 * z, sy - 19 * z], [sx + 3 * z, sy - 15 * z], [sx + 6 * z, sy - 17 * z], [sx + 6 * z, sy - 13 * z], [sx - 6 * z, sy - 13 * z]]);
      ctx.fillStyle = '#bdb7ab';
      ctx.fill();
      disc(ctx, sx + 12 * z, sy + 1 * z, 4 * z, 2 * z, '#a39d92');
      break;
    case 'carroca': {
      shadow(ctx, sx, sy, z, 14);
      // Rodas atrás, caixa, rodas na frente, varais.
      const wheel = (u: number, v: number) => {
        const p = at(u, v);
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 1.6 * z;
        ctx.beginPath();
        ctx.ellipse(p[0], p[1] - 5 * z, 5 * z, 5.5 * z, 0, 0, Math.PI * 2);
        ctx.stroke();
        stroke(ctx, [[p[0] - 5 * z, p[1] - 5 * z], [p[0] + 5 * z, p[1] - 5 * z]], '#3a2412', 1);
        stroke(ctx, [[p[0], p[1] - 10.5 * z], [p[0], p[1] + 0.5 * z]], '#3a2412', 1);
      };
      wheel(0.12, -0.38);
      const top = isoBox(ctx, sx, sy, z, 0.42, 0.26, 8 * z, '#8a5a30', 5 * z);
      ctx.fillStyle = '#6a4220';
      polygon(ctx, top);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const p = at(-0.2 + k * 0.2, tileHash(x, y, k) * 0.2 - 0.1);
        disc(ctx, p[0], p[1] - 15 * z, 3.4 * z, 2.6 * z, '#d8b456');
      }
      wheel(0.12, 0.38);
      stroke(ctx, [at(0.42, -0.12), at(0.72, -0.12)].map(([a, b]) => [a, b - 8 * z] as [number, number]), '#6a4220', 1.6 * z);
      stroke(ctx, [at(0.42, 0.12), at(0.72, 0.12)].map(([a, b]) => [a, b - 8 * z] as [number, number]), '#6a4220', 1.6 * z);
      break;
    }
    case 'barril':
      shadow(ctx, sx, sy, z, 8);
      isoCylinder(ctx, sx, sy, z, 0.2, 16 * z, '#7d5230');
      for (const k of [3, 13]) stroke(ctx, [[sx - 6.8 * z, sy - k * z], [sx + 6.8 * z, sy - k * z]], '#3a3a40', 1.4 * z);
      break;
    case 'caixa': {
      const top = isoBox(ctx, sx, sy, z, 0.3, 0.3, 16 * z, '#a0703a');
      ctx.strokeStyle = '#6b4520';
      ctx.lineWidth = 1;
      polygon(ctx, top);
      ctx.stroke();
      stroke(ctx, [top[0]!, top[2]!], '#6b4520', 1);
      break;
    }
    case 'feno': {
      const top = isoBox(ctx, sx, sy, z, 0.36, 0.26, 13 * z, '#d8b456');
      for (let k = 0; k < 6; k++) {
        const p = [top[0]![0] + (top[2]![0] - top[0]![0]) * tileHash(x, y, k), top[0]![1] + (top[2]![1] - top[0]![1]) * tileHash(x, y, k + 3)] as [number, number];
        stroke(ctx, [p, [p[0] + 2 * z, p[1] + 1 * z]], '#a8842c', 1);
      }
      stroke(ctx, [top[0]!, top[1]!].map(([a, b]) => [a, b + 6 * z] as [number, number]), '#7a5a20', 1.2);
      break;
    }
    case 'cerca': {
      const posts = [-0.45, -0.15, 0.15, 0.45];
      for (const u of posts) {
        const p = at(u, 0);
        ctx.fillStyle = '#8a6a40';
        ctx.fillRect(p[0] - 1.5 * z, p[1] - 13 * z, 3 * z, 13 * z);
      }
      for (const hgt of [5, 10]) stroke(ctx, [at(-0.5, 0), at(0.5, 0)].map(([a, b]) => [a, b - hgt * z] as [number, number]), '#6a4a26', 2 * z);
      break;
    }
    case 'poco':
      shadow(ctx, sx, sy, z, 12);
      isoCylinder(ctx, sx, sy, z, 0.34, 11 * z, '#8a8780');
      disc(ctx, sx, sy - 11 * z, 9 * z, 4.4 * z, '#1e3a52');
      for (const d of [-10, 10]) {
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(sx + d * z - 1.2 * z, sy - 30 * z, 2.4 * z, 20 * z);
      }
      ctx.fillStyle = '#9a4a30';
      polygon(ctx, [[sx - 14 * z, sy - 28 * z], [sx, sy - 38 * z], [sx + 14 * z, sy - 28 * z]]);
      ctx.fill();
      stroke(ctx, [[sx, sy - 28 * z], [sx, sy - 16 * z]], '#c0a070', 1);
      break;
    case 'banca': {
      shadow(ctx, sx, sy, z, 13);
      const top = isoBox(ctx, sx, sy, z, 0.42, 0.28, 10 * z, '#8a5a32');
      for (let k = 0; k < 4; k++) {
        const p = [top[0]![0] + (top[2]![0] - top[0]![0]) * (0.2 + k * 0.2), top[0]![1] + (top[2]![1] - top[0]![1]) * (0.2 + k * 0.2)] as [number, number];
        disc(ctx, p[0], p[1] - 2 * z, 2.6 * z, 2 * z, ['#e04a30', '#f0c040', '#8ac050', '#e08a30'][k]!);
      }
      for (const [u, v] of [
        [-0.42, -0.28],
        [0.42, -0.28],
        [0.42, 0.28],
        [-0.42, 0.28],
      ] as const) {
        const p = at(u, v);
        stroke(ctx, [p, [p[0], p[1] - 28 * z]], '#5a3a20', 1.4 * z);
      }
      // Toldo listrado.
      const c = [at(-0.48, -0.34), at(0.48, -0.34), at(0.48, 0.34), at(-0.48, 0.34)].map(([a, b]) => [a, b - 28 * z] as [number, number]);
      ctx.fillStyle = (x + y) % 2 ? '#b0402c' : '#3a6a9a';
      polygon(ctx, c);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 3; k++) {
        const f0 = 0.15 + k * 0.3;
        const f1 = f0 + 0.15;
        const l = (p: [number, number], q: [number, number], f: number) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f] as [number, number];
        polygon(ctx, [l(c[0]!, c[1]!, f0), l(c[0]!, c[1]!, f1), l(c[3]!, c[2]!, f1), l(c[3]!, c[2]!, f0)]);
        ctx.fill();
      }
      break;
    }
    case 'tenda':
      shadow(ctx, sx, sy, z, 15);
      ctx.fillStyle = '#d8c8a0';
      polygon(ctx, [at(-0.48, -0.48), [sx, sy - 34 * z], at(0.48, -0.48)].map((p) => p as [number, number]));
      ctx.fill();
      ctx.fillStyle = '#c4b088';
      polygon(ctx, [at(-0.48, -0.48), [sx, sy - 34 * z], at(-0.48, 0.48)]);
      ctx.fill();
      ctx.fillStyle = '#b09a70';
      polygon(ctx, [at(0.48, -0.48), [sx, sy - 34 * z], at(0.48, 0.48)]);
      ctx.fill();
      ctx.fillStyle = '#e4d6b0';
      polygon(ctx, [at(-0.48, 0.48), [sx, sy - 34 * z], at(0.48, 0.48)]);
      ctx.fill();
      ctx.fillStyle = '#3a2a1a';
      polygon(ctx, [[sx - 4 * z, sy + 6 * z], [sx, sy - 10 * z], [sx + 4 * z, sy + 6 * z]]);
      ctx.fill();
      stroke(ctx, [[sx, sy - 34 * z], [sx, sy - 40 * z]], '#5a3a20', 1.4 * z);
      break;
    case 'estatua':
      shadow(ctx, sx, sy, z, 11);
      isoBox(ctx, sx, sy, z, 0.36, 0.36, 10 * z, '#a8a49c');
      ctx.fillStyle = '#c8c4bc';
      ctx.fillRect(sx - 4 * z, sy - 34 * z, 8 * z, 24 * z);
      disc(ctx, sx, sy - 38 * z, 4.5 * z, 4.5 * z, '#d0ccc4');
      stroke(ctx, [[sx + 4 * z, sy - 30 * z], [sx + 9 * z, sy - 44 * z]], '#b8b4ac', 2.4 * z);
      stroke(ctx, [[sx + 6 * z, sy - 40 * z], [sx + 12 * z, sy - 40 * z]], '#b8b4ac', 1.6 * z);
      break;
    case 'fonte': {
      shadow(ctx, sx, sy, z, 15);
      isoCylinder(ctx, sx, sy, z, 0.46, 8 * z, '#a8b0b8');
      disc(ctx, sx, sy - 8 * z, 14 * z, 6.8 * z, '#3f7fb8');
      isoCylinder(ctx, sx, sy, z, 0.1, 12 * z, '#b8c0c8', 8 * z);
      const sp = Math.sin(time * 5) * 1.5 * z;
      for (const d of [-1, 1]) {
        ctx.strokeStyle = 'rgba(180,220,255,0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 20 * z);
        ctx.quadraticCurveTo(sx + d * 7 * z, sy - 26 * z + sp, sx + d * 10 * z, sy - 9 * z);
        ctx.stroke();
      }
      break;
    }
    case 'lampiao': {
      shadow(ctx, sx, sy, z, 5);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(sx - 1.4 * z, sy - 40 * z, 2.8 * z, 40 * z);
      stroke(ctx, [[sx, sy - 40 * z], [sx + 7 * z, sy - 40 * z]], '#2a2a30', 1.6 * z);
      ctx.fillStyle = '#3a3a40';
      ctx.fillRect(sx + 4 * z, sy - 39 * z, 6 * z, 8 * z);
      const g = 0.75 + Math.sin(time * 9 + x) * 0.1;
      ctx.fillStyle = `rgba(255,210,110,${g})`;
      ctx.fillRect(sx + 5 * z, sy - 38 * z, 4 * z, 6 * z);
      break;
    }
    case 'fogueira':
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        disc(ctx, sx + Math.cos(a) * 8 * z, sy + Math.sin(a) * 4 * z, 2.6 * z, 1.8 * z, '#6a6660');
      }
      stroke(ctx, [[sx - 6 * z, sy + 1 * z], [sx + 6 * z, sy - 3 * z]], '#5a3a20', 2.4 * z);
      stroke(ctx, [[sx - 6 * z, sy - 3 * z], [sx + 6 * z, sy + 1 * z]], '#4a2e16', 2.4 * z);
      flame(ctx, sx, sy - 1 * z, z, time);
      break;
    case 'banco': {
      const top = isoBox(ctx, sx, sy, z, 0.4, 0.14, 2.5 * z, '#8a6038', 6 * z);
      for (const i of [0, 1]) {
        const p = top[i]!;
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(p[0] - 0.8 * z, p[1], 1.6 * z, 8 * z);
      }
      break;
    }
    case 'mesa': {
      for (const [u, v] of [
        [-0.32, -0.22],
        [0.32, -0.22],
        [0.32, 0.22],
        [-0.32, 0.22],
      ] as const) {
        const p = at(u, v);
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(p[0] - 1 * z, p[1] - 12 * z, 2 * z, 12 * z);
      }
      const top = isoBox(ctx, sx, sy, z, 0.38, 0.28, 3 * z, '#8a5a32', 12 * z);
      const c = [(top[0]![0] + top[2]![0]) / 2, (top[0]![1] + top[2]![1]) / 2] as [number, number];
      disc(ctx, c[0] - 4 * z, c[1], 2.4 * z, 1.4 * z, '#d8d0c0');
      ctx.fillStyle = '#c0a060';
      ctx.fillRect(c[0] + 2 * z, c[1] - 4 * z, 2.4 * z, 4 * z);
      break;
    }
    case 'estante': {
      const top = isoBox(ctx, sx, sy, z, 0.42, 0.16, 30 * z, '#6a4426');
      const front = [at(-0.42, 0.16), at(0.42, 0.16)];
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 6; k++) {
          const f = (k + 0.5) / 6;
          const p = [front[0]![0] + (front[1]![0] - front[0]![0]) * f, front[0]![1] + (front[1]![1] - front[0]![1]) * f - (4 + r * 9) * z] as [number, number];
          ctx.fillStyle = ['#8e2430', '#2a4a7a', '#3a6a3a', '#c9a14a'][(k + r + x) % 4]!;
          ctx.fillRect(p[0] - 1.2 * z, p[1] - 7 * z, 2.4 * z, 7 * z);
        }
      void top;
      break;
    }
    case 'bau': {
      const top = isoBox(ctx, sx, sy, z, 0.3, 0.2, 11 * z, '#9a6a2a');
      ctx.fillStyle = '#7a4a1a';
      polygon(ctx, top);
      ctx.fill();
      stroke(ctx, [top[0]!, top[1]!].map(([a, b]) => [a, b + 4 * z] as [number, number]), '#c9a14a', 1.2 * z);
      disc(ctx, sx, sy - 6 * z, 1.6 * z, 1.6 * z, '#e8c050');
      break;
    }
    case 'altar': {
      const top = isoBox(ctx, sx, sy, z, 0.42, 0.28, 13 * z, '#d8d2c4');
      const c = [(top[0]![0] + top[2]![0]) / 2, (top[0]![1] + top[2]![1]) / 2] as [number, number];
      for (const d of [-7, 7]) {
        ctx.fillStyle = '#f4ecd8';
        ctx.fillRect(c[0] + d * z - 1.2 * z, c[1] - 7 * z, 2.4 * z, 7 * z);
        flame(ctx, c[0] + d * z, c[1] - 7 * z, z * 0.35, time);
      }
      ctx.strokeStyle = '#c9a14a';
      ctx.lineWidth = 1.2 * z;
      ctx.beginPath();
      ctx.ellipse(c[0], c[1] - 1 * z, 5 * z, 2.4 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'trono': {
      shadow(ctx, sx, sy, z, 12);
      isoBox(ctx, sx, sy, z, 0.36, 0.32, 9 * z, '#8e2430');
      ctx.fillStyle = '#c9a14a';
      ctx.fillRect(sx - 9 * z, sy - 38 * z, 18 * z, 30 * z);
      ctx.fillStyle = '#8e2430';
      ctx.fillRect(sx - 6 * z, sy - 34 * z, 12 * z, 24 * z);
      polygon(ctx, [[sx - 9 * z, sy - 38 * z], [sx - 5 * z, sy - 44 * z], [sx, sy - 40 * z], [sx + 5 * z, sy - 44 * z], [sx + 9 * z, sy - 38 * z]]);
      ctx.fillStyle = '#e8c050';
      ctx.fill();
      break;
    }
    case 'estandarte': {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(sx - 1.2 * z, sy - 44 * z, 2.4 * z, 44 * z);
      const wave = Math.sin(time * 3 + x) * 2 * z;
      ctx.fillStyle = '#8e2430';
      polygon(ctx, [[sx + 1 * z, sy - 42 * z], [sx + 14 * z + wave, sy - 40 * z], [sx + 13 * z + wave, sy - 22 * z], [sx + 7 * z, sy - 26 * z], [sx + 1 * z, sy - 22 * z]]);
      ctx.fill();
      disc(ctx, sx + 7 * z + wave / 2, sy - 33 * z, 2.6 * z, 2.6 * z, '#e8c050');
      break;
    }
    case 'portao': {
      for (const u of [-0.45, 0.45]) {
        const p = at(u, 0);
        isoBox(ctx, p[0], p[1], z, 0.12, 0.12, 30 * z, '#7a7066');
      }
      const a = at(-0.35, 0);
      const b = at(0.35, 0);
      for (let k = 0; k <= 6; k++) {
        const f = k / 6;
        const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as [number, number];
        stroke(ctx, [p, [p[0], p[1] - 24 * z]], '#3c3c44', 1.6 * z);
      }
      for (const hgt of [6, 18, 24]) stroke(ctx, [a, b].map(([p, q]) => [p, q - hgt * z] as [number, number]), '#2c2c34', 1.8 * z);
      break;
    }
    // ── templo e Vazio ──
    case 'lapide':
      shadow(ctx, sx, sy, z, 7);
      ctx.fillStyle = '#8f8c86';
      ctx.beginPath();
      ctx.moveTo(sx - 6 * z, sy);
      ctx.lineTo(sx - 6 * z, sy - 14 * z);
      ctx.quadraticCurveTo(sx, sy - 22 * z, sx + 6 * z, sy - 14 * z);
      ctx.lineTo(sx + 6 * z, sy);
      ctx.fill();
      stroke(ctx, [[sx, sy - 16 * z], [sx, sy - 6 * z]], '#5a5852', 1.2 * z);
      stroke(ctx, [[sx - 3 * z, sy - 12 * z], [sx + 3 * z, sy - 12 * z]], '#5a5852', 1.2 * z);
      break;
    case 'sarcofago': {
      const top = isoBox(ctx, sx, sy, z, 0.44, 0.24, 11 * z, '#a7a196');
      const c = [(top[0]![0] + top[2]![0]) / 2, (top[0]![1] + top[2]![1]) / 2] as [number, number];
      disc(ctx, c[0], c[1], 7 * z, 3 * z, '#bdb7ab');
      disc(ctx, c[0] - 6 * z, c[1] + 1 * z, 2.4 * z, 1.8 * z, '#c8c2b6');
      break;
    }
    case 'obelisco': {
      shadow(ctx, sx, sy, z, 9);
      isoBox(ctx, sx, sy, z, 0.26, 0.26, 40 * z, '#3a3048');
      polygon(ctx, [[sx - 8 * z, sy - 40 * z], [sx, sy - 52 * z], [sx + 8 * z, sy - 40 * z], [sx, sy - 36 * z]]);
      ctx.fillStyle = '#4a3e5c';
      ctx.fill();
      const glow = 0.55 + Math.sin(time * 2 + x) * 0.35;
      ctx.fillStyle = `rgba(190,140,255,${glow})`;
      for (let k = 0; k < 4; k++) ctx.fillRect(sx - 2 * z + (k % 2) * 2 * z, sy - (12 + k * 7) * z, 2 * z, 4 * z);
      break;
    }
    case 'portal_vazio': {
      const r = 15 * z;
      const pulse = 1 + Math.sin(time * 3) * 0.06;
      const cy = sy - 22 * z;
      const g = ctx.createRadialGradient(sx, cy, 0, sx, cy, r * pulse);
      g.addColorStop(0, '#0a0012');
      g.addColorStop(0.6, '#5a2a8a');
      g.addColorStop(1, 'rgba(192,140,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sx, cy, r * 0.7 * pulse, r * 1.3 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,160,255,0.85)';
      ctx.lineWidth = 1.5 * z;
      ctx.beginPath();
      ctx.ellipse(sx, cy, r * 0.62, r * 1.18, Math.sin(time) * 0.1, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 5; k++) {
        const a = time * 1.5 + k * 1.25;
        disc(ctx, sx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 1.5, 1.2 * z, 1.2 * z, 'rgba(220,190,255,0.8)');
      }
      break;
    }
    default:
      ctx.fillStyle = def.color;
      ctx.fillRect(sx - 6 * z, sy - 12 * z, 12 * z, 12 * z);
  }
  void tint;
}
