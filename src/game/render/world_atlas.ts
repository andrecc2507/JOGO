import { DB, type Biome } from '../data';
import { CITADEL_ID, WORLD_H, WORLD_W, worldGraph, type WorldNode } from '../world/layout';

/**
 * Atlas do mundo em estilo de mapa de fantasia (pergaminho e nanquim): costa orgânica com linhas de
 * eco no mar, tinta por bioma, florestas, montanhas, dunas e colinas desenhadas à mão, fronteiras
 * tracejadas, estradas, rosa dos ventos e nomes das regiões. É estático: desenhado uma vez numa tela
 * fora da página (2× o tamanho do mundo) e depois só copiado com a câmera.
 */
const K = 2;
const G = 2; // resolução da grade de campo (unidades do mundo por célula)

let atlas: HTMLCanvasElement | null = null;

export function worldAtlas(): HTMLCanvasElement {
  if (!atlas) atlas = buildAtlas();
  return atlas;
}

// ───────────────────────────── ruído ─────────────────────────────

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(x * f, y * f);
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

// ───────────────────────────── campos ─────────────────────────────

interface Fields {
  gw: number;
  gh: number;
  /** > 0 = terra (em unidades do mundo, aproximadamente a distância até a costa). */
  land: Float32Array;
  /** Distância até a terra (no mar), em unidades do mundo. */
  seaDist: Float32Array;
}

const BIOME_TINT: Record<Biome, [number, number, number]> = {
  floresta: [58, 74, 46],
  neve: [176, 182, 186],
  costa: [98, 108, 86],
  deserto: [168, 128, 78],
  planicie: [120, 116, 78],
};

function majorNodes(): WorldNode[] {
  return Object.values(worldGraph().nodes).filter((n) => n.type !== 'waypoint');
}

function landField(x: number, y: number, nodes: WorldNode[]): number {
  let f = -999;
  for (const n of nodes) {
    const r = n.type === 'citadel' ? 125 : n.type === 'capital' ? 112 : n.type === 'city' ? 82 : 56;
    const v = r - Math.hypot(x - n.x, y - n.y);
    if (v > f) f = v;
  }
  return f + (fbm(x / 70, y / 70) - 0.5) * 60 + (fbm(x / 18 + 50, y / 18) - 0.5) * 14;
}

function buildFields(): Fields {
  const all = Object.values(worldGraph().nodes);
  const gw = Math.ceil(WORLD_W / G) + 1;
  const gh = Math.ceil(WORLD_H / G) + 1;
  const land = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) land[j * gw + i] = landField(i * G, j * G, all);
  // Distância até a terra (chanfro em duas passadas).
  const big = 1e6;
  const d = new Float32Array(gw * gh);
  for (let k = 0; k < d.length; k++) d[k] = land[k]! > 0 ? 0 : big;
  const D1 = G;
  const D2 = G * Math.SQRT2;
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      let v = d[k]!;
      if (i > 0) v = Math.min(v, d[k - 1]! + D1);
      if (j > 0) {
        v = Math.min(v, d[k - gw]! + D1);
        if (i > 0) v = Math.min(v, d[k - gw - 1]! + D2);
        if (i < gw - 1) v = Math.min(v, d[k - gw + 1]! + D2);
      }
      d[k] = v;
    }
  for (let j = gh - 1; j >= 0; j--)
    for (let i = gw - 1; i >= 0; i--) {
      const k = j * gw + i;
      let v = d[k]!;
      if (i < gw - 1) v = Math.min(v, d[k + 1]! + D1);
      if (j < gh - 1) {
        v = Math.min(v, d[k + gw]! + D1);
        if (i < gw - 1) v = Math.min(v, d[k + gw + 1]! + D2);
        if (i > 0) v = Math.min(v, d[k + gw - 1]! + D2);
      }
      d[k] = v;
    }
  return { gw, gh, land, seaDist: d };
}

function sample(f: Float32Array, gw: number, gh: number, x: number, y: number): number {
  const gx = Math.max(0, Math.min(gw - 1.001, x / G));
  const gy = Math.max(0, Math.min(gh - 1.001, y / G));
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const u = gx - i;
  const v = gy - j;
  const a = f[j * gw + i]!;
  const b = f[j * gw + i + 1]!;
  const c = f[(j + 1) * gw + i]!;
  const d = f[(j + 1) * gw + i + 1]!;
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Nó principal mais próximo (com a posição deformada por ruído para fronteiras irregulares). */
function nearest(x: number, y: number, nodes: WorldNode[]): { n: WorldNode; d1: number; other: number } {
  const wx = x + (fbm(x / 60 + 7, y / 60) - 0.5) * 70;
  const wy = y + (fbm(x / 60, y / 60 + 9) - 0.5) * 70;
  let best = nodes[0]!;
  let d1 = Infinity;
  // Distância ao nó mais próximo de OUTRO país (para fronteiras).
  const byCountry = new Map<string, number>();
  for (const n of nodes) {
    const d = Math.hypot(wx - n.x, wy - n.y);
    const key = n.countryId ?? 'centro';
    if (d < (byCountry.get(key) ?? Infinity)) byCountry.set(key, d);
    if (d < d1) {
      d1 = d;
      best = n;
    }
  }
  const mine = best.countryId ?? 'centro';
  let other = Infinity;
  for (const [k, d] of byCountry) if (k !== mine && d < other) other = d;
  return { n: best, d1, other };
}

// ───────────────────────────── desenho ─────────────────────────────

function buildAtlas(): HTMLCanvasElement {
  const W = WORLD_W * K;
  const H = WORLD_H * K;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const F = buildFields();
  const majors = majorNodes();
  // Bioma/país por célula (grade grossa, 4 unidades) para não refazer o Voronoi a cada pixel.
  const VC = 4;
  const vw = Math.ceil(WORLD_W / VC) + 1;
  const vh = Math.ceil(WORLD_H / VC) + 1;
  const vBiome: Biome[] = new Array(vw * vh);
  const vBorder = new Float32Array(vw * vh);
  for (let j = 0; j < vh; j++)
    for (let i = 0; i < vw; i++) {
      const r = nearest(i * VC, j * VC, majors);
      vBiome[j * vw + i] = r.n.biome;
      vBorder[j * vw + i] = r.other - r.d1;
    }
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    const wy = y / K;
    for (let x = 0; x < W; x++) {
      const wx = x / K;
      const land = sample(F.land, F.gw, F.gh, wx, wy);
      const stain = fbm(wx / 160, wy / 160, 3);
      const grain = hash2(x, y) * 10 - 5;
      // Pergaminho velho e sujo: tons queimados, manchas fortes.
      const burn = fbm(wx / 60 + 40, wy / 60, 3);
      let r = 150 + (stain - 0.5) * 60 + (burn - 0.5) * 30 + grain;
      let g = 128 + (stain - 0.5) * 54 + (burn - 0.5) * 26 + grain;
      let b = 94 + (stain - 0.5) * 44 + (burn - 0.5) * 20 + grain;
      if (land <= 0) {
        // Mar: pergaminho azulado com linhas de eco seguindo a costa.
        const sd = sample(F.seaDist, F.gw, F.gh, wx, wy);
        // Mar escuro de ardósia, mais negro quanto mais longe da costa.
        const t = Math.min(1, 0.55 + sd / 180);
        r = r * (1 - t) + 26 * t;
        g = g * (1 - t) + 36 * t;
        b = b * (1 - t) + 42 * t;
        for (const L of [5, 11, 19, 30]) {
          const w = 0.7 + L * 0.02;
          if (Math.abs(sd - L) < w) {
            const a = 0.28 * (1 - L / 40);
            r = r * (1 - a) + 120 * a;
            g = g * (1 - a) + 126 * a;
            b = b * (1 - a) + 118 * a;
          }
        }
        if (land > -1.4) {
          r = 22;
          g = 16;
          b = 12;
        }
      } else {
        const vi = Math.min(vw - 1, Math.round(wx / VC));
        const vj = Math.min(vh - 1, Math.round(wy / VC));
        const tint = BIOME_TINT[vBiome[vj * vw + vi]!];
        const a = 0.5;
        r = r * (1 - a) + tint[0] * a;
        g = g * (1 - a) + tint[1] * a;
        b = b * (1 - a) + tint[2] * a;
        if (land < 1.3) {
          r = 22;
          g = 16;
          b = 12;
        } else if (land < 7) {
          // Sombra interna da costa.
          const s = 0.3 * (1 - land / 7);
          r *= 1 - s;
          g *= 1 - s;
          b *= 1 - s;
        }
        // Fronteira entre países: pontilhado vermelho-escuro.
        const bd = vBorder[vj * vw + vi]!;
        if (bd < 3.2 && ((Math.floor(wx / 3) + Math.floor(wy / 3)) & 1) === 0) {
          r = r * 0.4 + 110 * 0.6;
          g = g * 0.4 + 24 * 0.6;
          b = b * 0.4 + 20 * 0.6;
        }
      }
      // Vinheta nas bordas do pergaminho.
      const ex = Math.min(wx, WORLD_W - wx) / 90;
      const ey = Math.min(wy, WORLD_H - wy) / 90;
      const e = Math.min(1, Math.min(ex, ey));
      const vig = 0.25 + 0.75 * e * e;
      const k = (y * W + x) * 4;
      px[k] = r * vig;
      px[k + 1] = g * vig;
      px[k + 2] = b * vig;
      px[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.scale(K, K);
  drawRoads(ctx);
  drawScenery(ctx, F, majors, vBiome, vBorder, vw, vh, VC);
  // Bordas queimadas do pergaminho.
  const edge = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.35, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(8,4,2,0.75)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  drawCompass(ctx, 92, WORLD_H - 92, 46);
  drawLabels(ctx);
  // Moldura.
  ctx.strokeStyle = '#0d0907';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, WORLD_W - 12, WORLD_H - 12);
  ctx.lineWidth = 1;
  ctx.strokeRect(11, 11, WORLD_W - 22, WORLD_H - 22);
  return cv;
}

function drawRoads(ctx: CanvasRenderingContext2D): void {
  const g = worldGraph();
  ctx.save();
  ctx.setLineDash([5, 3.5]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(70,24,14,0.85)';
  for (const [a, b] of g.edges) {
    const na = g.nodes[a]!;
    const nb = g.nodes[b]!;
    // Leve curva para parecer traçado à mão.
    const mx = (na.x + nb.x) / 2 + (hash2(Math.round(na.x), Math.round(nb.y)) - 0.5) * 10;
    const my = (na.y + nb.y) / 2 + (hash2(Math.round(nb.x), Math.round(na.y)) - 0.5) * 10;
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.quadraticCurveTo(mx, my, nb.x, nb.y);
    ctx.stroke();
  }
  ctx.restore();
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

const INK = '#1d140c';

function drawScenery(ctx: CanvasRenderingContext2D, F: Fields, majors: WorldNode[], vBiome: Biome[], vBorder: Float32Array, vw: number, vh: number, VC: number): void {
  const g = worldGraph();
  const segs = g.edges.map(([a, b]) => [g.nodes[a]!, g.nodes[b]!] as const);
  const items: { x: number; y: number; draw: () => void }[] = [];
  const step = 11;
  for (let gy = 0; gy < WORLD_H; gy += step)
    for (let gx = 0; gx < WORLD_W; gx += step) {
      const x = gx + (hash2(gx, gy) - 0.5) * step * 0.9;
      const y = gy + (hash2(gy + 3, gx) - 0.5) * step * 0.9;
      const land = sample(F.land, F.gw, F.gh, x, y);
      if (land < 7) continue;
      if (majors.some((n) => Math.hypot(n.x - x, n.y - y) < (n.type === 'citadel' ? 40 : n.type === 'capital' ? 34 : 24))) continue;
      if (segs.some(([a, b]) => segDist(x, y, a.x, a.y, b.x, b.y) < 9)) continue;
      const vi = Math.min(vw - 1, Math.round(x / VC));
      const vj = Math.min(vh - 1, Math.round(y / VC));
      const biome = vBiome[vj * vw + vi]!;
      const border = vBorder[vj * vw + vi]!;
      const r = hash2(Math.round(x * 7), Math.round(y * 13));
      const dense = fbm(x / 90 + 20, y / 90);
      // Serras nas fronteiras entre países.
      if (border < 14 && border > 4 && r < 0.55) {
        items.push({ x, y, draw: () => mountain(ctx, x, y, 9 + r * 6, biome === 'neve') });
        continue;
      }
      switch (biome) {
        case 'floresta':
          if (dense > 0.42 || r < 0.25) items.push({ x, y, draw: () => trees(ctx, x, y, r, '#2f3d24') });
          break;
        case 'neve':
          if (dense > 0.55 && r < 0.7) items.push({ x, y, draw: () => mountain(ctx, x, y, 8 + r * 7, true) });
          else if (r < 0.35) items.push({ x, y, draw: () => pines(ctx, x, y, r) });
          break;
        case 'deserto':
          if (r < 0.32) items.push({ x, y, draw: () => dune(ctx, x, y, r) });
          else if (r < 0.5) items.push({ x, y, draw: () => stipple(ctx, x, y, r) });
          else if (dense > 0.62 && r < 0.6) items.push({ x, y, draw: () => mesa(ctx, x, y) });
          break;
        case 'costa':
          if (dense > 0.5 && r < 0.5) items.push({ x, y, draw: () => trees(ctx, x, y, r, '#3a4632') });
          else if (r < 0.3) items.push({ x, y, draw: () => marsh(ctx, x, y, r) });
          break;
        case 'planicie':
          if (dense > 0.6 && r < 0.6) items.push({ x, y, draw: () => hill(ctx, x, y, r) });
          else if (r < 0.18) items.push({ x, y, draw: () => tufts(ctx, x, y) });
          else if (r < 0.24) items.push({ x, y, draw: () => field(ctx, x, y, r) });
          else if (dense < 0.35 && r < 0.4) items.push({ x, y, draw: () => trees(ctx, x, y, r, '#3e4428') });
          break;
      }
    }
  // De cima para baixo, para os desenhos de baixo cobrirem os de trás.
  items.sort((a, b) => a.y - b.y);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const it of items) it.draw();
  ctx.restore();
}

function trees(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const n = 2 + Math.floor(r * 3);
  for (let k = 0; k < n; k++) {
    const tx = x + (hash2(k, Math.round(x)) - 0.5) * 9;
    const ty = y + (hash2(Math.round(y), k) - 0.5) * 7;
    const s = 3 + hash2(k + 9, Math.round(x + y)) * 1.6;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(tx, ty + s * 0.6);
    ctx.lineTo(tx, ty + s * 1.5);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tx, ty, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,30,15,0.5)';
    ctx.beginPath();
    ctx.arc(tx + s * 0.3, ty + s * 0.2, s * 0.55, 0, Math.PI * 0.8);
    ctx.stroke();
  }
}

function pines(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const n = 2 + Math.floor(r * 4);
  for (let k = 0; k < n; k++) {
    const tx = x + (hash2(k, Math.round(y)) - 0.5) * 10;
    const ty = y + (hash2(Math.round(x), k) - 0.5) * 6;
    ctx.fillStyle = '#2c3a33';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty - 6);
    ctx.lineTo(tx + 3, ty + 2);
    ctx.lineTo(tx - 3, ty + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty + 2);
    ctx.lineTo(tx, ty + 4);
    ctx.stroke();
  }
}

function mountain(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, snow: boolean): void {
  const w = s * 1.2;
  const top = y - s;
  const lean = (hash2(Math.round(x), Math.round(y)) - 0.5) * s * 0.4;
  ctx.fillStyle = snow ? '#b9bec2' : '#7c6a4e';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x + lean, top);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Hachura da encosta à sombra.
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(58,42,24,0.75)';
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    const ax = x + lean + (w - lean) * t * 0.95;
    const ay = top + (y - top) * t;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - s * 0.35, y - 0.5);
    ctx.stroke();
  }
  if (snow) {
    ctx.fillStyle = '#dfe3e6';
    ctx.beginPath();
    ctx.moveTo(x + lean, top);
    ctx.lineTo(x + lean - w * 0.3, top + s * 0.32);
    ctx.lineTo(x + lean, top + s * 0.24);
    ctx.lineTo(x + lean + w * 0.28, top + s * 0.34);
    ctx.closePath();
    ctx.fill();
  }
}

function dune(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = 'rgba(60,36,14,0.85)';
  ctx.lineWidth = 0.8;
  const w = 7 + r * 8;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.2, y - 5, x + w, y + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y + 3.5);
  ctx.quadraticCurveTo(x + w * 0.1, y, x + w * 0.7, y + 4);
  ctx.stroke();
}

function stipple(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(50,30,14,0.75)';
  for (let k = 0; k < 7; k++) {
    const dx = (hash2(k, Math.round(x * r * 10)) - 0.5) * 12;
    const dy = (hash2(Math.round(y), k + 4) - 0.5) * 9;
    ctx.fillRect(x + dx, y + dy, 0.9, 0.9);
  }
}

function mesa(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#8a6440';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 5, y - 6);
  ctx.lineTo(x + 5, y - 6);
  ctx.lineTo(x + 8, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 6);
  ctx.lineTo(x + 3, y);
  ctx.stroke();
}

function marsh(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = 'rgba(60,80,50,0.85)';
  ctx.lineWidth = 0.7;
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * 2.5, y);
    ctx.lineTo(x + k * 3.5, y - 4 - r * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(70,90,110,0.6)';
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 2);
  ctx.lineTo(x + 6, y + 2);
  ctx.stroke();
}

function hill(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const w = 7 + r * 5;
  ctx.fillStyle = 'rgba(104,96,62,0.95)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y - w * 1.1, x + w, y);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.5;
  for (let k = 1; k <= 3; k++) {
    const ax = x + (w * k) / 4;
    ctx.beginPath();
    ctx.moveTo(ax, y - (w * 0.55 * (4 - k)) / 4);
    ctx.lineTo(ax - 1.5, y);
    ctx.stroke();
  }
}

function tufts(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(80,90,40,0.8)';
  ctx.lineWidth = 0.6;
  for (const dx of [-2, 0, 2]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y);
    ctx.lineTo(x + dx * 1.6, y - 3.5);
    ctx.stroke();
  }
}

function field(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((r - 0.2) * 6);
  ctx.strokeStyle = 'rgba(110,95,45,0.7)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-6, -4, 12, 8);
  for (let k = -4; k <= 4; k += 2) {
    ctx.beginPath();
    ctx.moveTo(k, -4);
    ctx.lineTo(k, 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0;
    const len = long ? r : r * 0.55;
    ctx.save();
    ctx.rotate((k * Math.PI) / 4);
    for (const side of [1, -1]) {
      ctx.fillStyle = side === 1 ? INK : '#8e7a58';
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(side * len * 0.16, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.font = "bold 13px Georgia, 'Palatino Linotype', serif";
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -r - 5);
  ctx.restore();
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width + spacing);
  let cx = x - widths.reduce((a, b) => a + b, 0) / 2;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.strokeText(ch, cx, y);
    ctx.fillText(ch, cx, y);
    cx += widths[i]!;
  });
}

function drawLabels(ctx: CanvasRenderingContext2D): void {
  const g = worldGraph();
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  // Nomes dos países.
  for (const c of DB.countries) {
    const cap = g.nodes[`${c.id}_capital`];
    if (!cap) continue;
    const dx = cap.x - cx;
    const dy = cap.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    // Do lado de dentro (entre a capital e a Citadela), onde não há cidades.
    const x = cap.x - (dx / d) * 78;
    const y = cap.y - (dy / d) * 64 + 6;
    ctx.font = "italic bold 19px Georgia, 'Palatino Linotype', serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,6,4,0.85)';
    ctx.fillStyle = 'rgba(214,190,148,0.9)';
    spaced(ctx, c.name.toUpperCase(), x, y, 4);
  }
  // Mares.
  ctx.font = "italic 16px Georgia, 'Palatino Linotype', serif";
  ctx.fillStyle = 'rgba(140,156,160,0.55)';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  spaced(ctx, 'Mar Cinzento', 170, 70, 3);
  spaced(ctx, 'Mar das Brumas', WORLD_W - 180, WORLD_H - 50, 3);
  void CITADEL_ID;
  ctx.restore();
}
