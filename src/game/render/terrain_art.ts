/**
 * Texturas dos terrenos (topo dos tiles) e desenho das paredes laterais (casas, muralhas, caverna).
 * Tudo procedural e determinístico por tile, girando junto com a câmera (render/tile_shape.ts).
 */
import { TERRAIN, type Tile, type WallPattern } from '../battle/map';
import { STEP_H } from './iso';
import { polygon, tileHash, tilePoint, tint } from './tile_shape';

type Pt = [number, number];

/** Ponto aleatório (u, v) dentro do tile, sem encostar na borda. */
function spot(x: number, y: number, k: number, margin = 0.08): [number, number] {
  const r = 0.5 - margin;
  return [tileHash(x, y, k) * 2 * r - r, tileHash(x, y, k + 97) * 2 * r - r];
}

function blob(ctx: CanvasRenderingContext2D, p: Pt, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(p[0], p[1], Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, width = 1): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

/** Quadradinhos de pedra (calçamento, lajes): `n × n` peças com rejunte, linhas alternadas deslocadas. */
function paving(ctx: CanvasRenderingContext2D, sx: number, sy: number, hw: number, hh: number, x: number, y: number, n: number, base: string, offset: boolean, gap = 0.05): void {
  const at = (u: number, v: number) => tilePoint(sx, sy, hw, hh, u, v);
  const step = 1 / n;
  for (let j = 0; j < n; j++) {
    const shift = offset && j % 2 ? step / 2 : 0;
    for (let i = -1; i < n; i++) {
      let u0 = -0.5 + i * step + shift + gap / 2;
      let u1 = u0 + step - gap;
      u0 = Math.max(-0.5 + gap / 2, u0);
      u1 = Math.min(0.5 - gap / 2, u1);
      if (u1 - u0 < gap) continue;
      const v0 = -0.5 + j * step + gap / 2;
      const v1 = v0 + step - gap;
      const f = 0.9 + tileHash(x * 7 + i, y * 5 + j, 3) * 0.22;
      ctx.fillStyle = tint(base, f);
      polygon(ctx, [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]);
      ctx.fill();
    }
  }
}

/** Desenha a textura do terreno sobre o topo já pintado. */
export function drawTexture(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number, hw: number, hh: number, x: number, y: number, time: number): void {
  const def = TERRAIN[t.t];
  const at = (u: number, v: number) => tilePoint(sx, sy, hw, hh, u, v);
  const s = hw / 24;
  switch (def.tex) {
    case 'grama':
      for (let k = 0; k < 5; k++) {
        const p = at(...spot(x, y, k));
        line(ctx, p, [p[0] - 1.5 * s, p[1] - 3 * s], k % 2 ? '#76b85a' : '#4a8236');
        line(ctx, p, [p[0] + 1.5 * s, p[1] - 3.5 * s], k % 2 ? '#4a8236' : '#76b85a');
      }
      break;
    case 'terra':
      for (let k = 0; k < 7; k++) blob(ctx, at(...spot(x, y, k)), (1 + tileHash(x, y, k + 21) * 1.6) * 1.4 * s, (1 + tileHash(x, y, k + 21)) * 0.8 * s, k % 3 === 0 ? '#cdb48a' : k % 3 === 1 ? '#5e4528' : '#a88a5e');
      line(ctx, at(-0.15, -0.05), at(0.05, 0.05), 'rgba(60,40,20,0.45)');
      break;
    case 'areia':
      for (let k = 0; k < 3; k++) {
        const v = -0.3 + k * 0.28 + tileHash(x, y, k) * 0.08;
        ctx.strokeStyle = 'rgba(160,120,60,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const a = at(-0.4, v);
        const b = at(0, v - 0.06);
        const c = at(0.4, v);
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]);
        ctx.stroke();
      }
      break;
    case 'neve':
      for (let k = 0; k < 4; k++) blob(ctx, at(...spot(x, y, k)), 1.2 * s, 0.8 * s, 'rgba(255,255,255,0.9)');
      blob(ctx, at(...spot(x, y, 9)), 2.5 * s, 1.2 * s, 'rgba(190,210,230,0.5)');
      break;
    case 'madeira':
      for (let k = -2; k <= 2; k++) line(ctx, at(-0.5, k / 5), at(0.5, k / 5), 'rgba(60,35,15,0.5)');
      for (let k = 0; k < 3; k++) {
        const v = -0.4 + k * 0.35;
        const u = -0.3 + tileHash(x, y, k) * 0.6;
        line(ctx, at(u, v), at(u, v + 0.18), 'rgba(60,35,15,0.4)');
      }
      break;
    case 'musgo':
      for (let k = 0; k < 6; k++) blob(ctx, at(...spot(x, y, k)), (2 + tileHash(x, y, k) * 3) * s, (1.2 + tileHash(x, y, k) * 1.5) * s, k % 2 ? '#6a9a48' : '#3e6a2e');
      for (let k = 0; k < 3; k++) blob(ctx, at(...spot(x, y, k + 30)), 1 * s, 0.8 * s, '#e8e0a0');
      break;
    case 'cascalho':
      for (let k = 0; k < 12; k++) blob(ctx, at(...spot(x, y, k, 0.05)), (1 + tileHash(x, y, k) * 1.5) * s, (0.7 + tileHash(x, y, k) * 0.8) * s, k % 3 ? '#a49d90' : '#6c665c');
      break;
    case 'pantano':
      blob(ctx, at(...spot(x, y, 1, 0.2)), 7 * s, 3.5 * s, 'rgba(40,60,50,0.75)');
      blob(ctx, at(...spot(x, y, 2, 0.25)), 4 * s, 2 * s, 'rgba(70,90,60,0.6)');
      for (let k = 0; k < 3; k++) {
        const p = at(...spot(x, y, k + 10));
        line(ctx, p, [p[0], p[1] - 6 * s], '#6b7a3a', 1.2);
        blob(ctx, [p[0], p[1] - 6 * s], 0.8 * s, 1.8 * s, '#5a4a2a');
      }
      break;
    case 'gelo': {
      const g = ctx.createLinearGradient(sx - hw, sy - hh, sx + hw, sy + hh);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      polygon(ctx, [at(-0.5, -0.5), at(0.5, -0.5), at(0.5, 0.5), at(-0.5, 0.5)]);
      ctx.fill();
      const a = at(...spot(x, y, 3, 0.15));
      line(ctx, a, at(...spot(x, y, 4, 0.1)), 'rgba(120,170,200,0.6)');
      line(ctx, a, at(...spot(x, y, 5, 0.1)), 'rgba(120,170,200,0.6)');
      break;
    }
    case 'lava': {
      const pulse = 0.5 + Math.sin(time * 2 + x * 1.3 + y) * 0.5;
      for (let k = 0; k < 3; k++) blob(ctx, at(...spot(x, y, k, 0.15)), (4 + pulse * 2) * s, (2 + pulse) * s, `rgba(255,${200 + k * 15},90,${0.5 + pulse * 0.3})`);
      line(ctx, at(-0.4, tileHash(x, y, 7) - 0.5), at(0.3, tileHash(x, y, 8) - 0.5), 'rgba(90,20,10,0.6)', 1.5);
      break;
    }
    case 'caverna':
      for (let k = 0; k < 8; k++) blob(ctx, at(...spot(x, y, k)), (0.8 + tileHash(x, y, k) * 1.5) * s, 0.7 * s, k % 2 ? '#5f5850' : '#2e2a26');
      line(ctx, at(...spot(x, y, 20)), at(...spot(x, y, 21)), 'rgba(20,18,16,0.6)');
      break;
    case 'cristal':
      for (let k = 0; k < 3; k++) {
        const [u, v] = spot(x, y, k, 0.18);
        const p = at(u, v);
        const hgt = (5 + tileHash(x, y, k) * 6) * s;
        ctx.fillStyle = k % 2 ? '#bfeaff' : '#7fc8ee';
        polygon(ctx, [[p[0] - 2 * s, p[1]], [p[0], p[1] - hgt], [p[0] + 2 * s, p[1]], [p[0], p[1] + 1.5 * s]]);
        ctx.fill();
      }
      break;
    case 'abismo': {
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, hw);
      g.addColorStop(0, 'rgba(60,20,90,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      polygon(ctx, [at(-0.5, -0.5), at(0.5, -0.5), at(0.5, 0.5), at(-0.5, 0.5)]);
      ctx.fill();
      for (let k = 0; k < 3; k++) blob(ctx, at(...spot(x, y, k)), 0.8 * s, 0.8 * s, 'rgba(200,170,255,0.5)');
      break;
    }
    case 'paralelepipedo':
      paving(ctx, sx, sy, hw, hh, x, y, 3, def.color, true);
      break;
    case 'lajota':
      paving(ctx, sx, sy, hw, hh, x, y, 2, def.color, (x + y) % 2 === 0, 0.04);
      break;
    case 'marmore':
      paving(ctx, sx, sy, hw, hh, x, y, 2, def.color, false, 0.025);
      line(ctx, at(...spot(x, y, 1)), at(...spot(x, y, 2)), 'rgba(150,140,130,0.35)');
      line(ctx, at(...spot(x, y, 2)), at(...spot(x, y, 3)), 'rgba(150,140,130,0.25)');
      break;
    case 'tapete':
      line(ctx, at(-0.42, -0.5), at(-0.42, 0.5), '#d8b04a', 2 * s);
      line(ctx, at(0.42, -0.5), at(0.42, 0.5), '#d8b04a', 2 * s);
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = 'rgba(216,176,74,0.55)';
        polygon(ctx, [at(0, -0.18), at(0.14, 0), at(0, 0.18), at(-0.14, 0)]);
        ctx.fill();
      }
      break;
    case 'telhas':
      for (let k = 0; k < 4; k++) {
        const v = -0.5 + (k + 0.5) / 4;
        for (let i = 0; i < 4; i++) {
          const u = -0.5 + (i + 0.5) / 4 + (k % 2 ? 0.125 : 0);
          if (u > 0.5) continue;
          const p = at(u, v);
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(p[0], p[1], 3.2 * s, 1.8 * s, 0, 0, Math.PI);
          ctx.stroke();
        }
      }
      break;
    case 'palha':
      for (let k = 0; k < 14; k++) {
        const p = at(...spot(x, y, k, 0.04));
        line(ctx, p, [p[0] + (tileHash(x, y, k) - 0.5) * 3 * s, p[1] + 3 * s], k % 2 ? '#e2c46e' : '#9e7c34');
      }
      break;
    case 'vazio': {
      const glow = 0.4 + Math.sin(time * 1.5 + x + y * 0.7) * 0.25;
      const a = at(...spot(x, y, 1, 0.1));
      const b = at(...spot(x, y, 2, 0.1));
      const c = at(...spot(x, y, 3, 0.1));
      ctx.strokeStyle = `rgba(176,124,255,${glow})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.stroke();
      break;
    }
    case 'carne': {
      const beat = 1 + Math.sin(time * 3 + x * 0.5) * 0.12;
      for (let k = 0; k < 4; k++) blob(ctx, at(...spot(x, y, k, 0.15)), 3 * s * beat, 1.6 * s * beat, k % 2 ? '#8a3448' : '#521a2a');
      line(ctx, at(...spot(x, y, 10)), at(...spot(x, y, 11)), 'rgba(180,60,80,0.6)', 1.2);
      break;
    }
    default:
      break;
  }
}

/**
 * Parede lateral (face de um bloco alto): `a`→`b` é a borda de cima da face e `depth` a altura em
 * pixels. Desenha tijolos, enxaimel com janelas, adobe ou rocha conforme o terreno do topo.
 * `door`: desenha uma porta no pé desta face.
 */
export function drawWall(ctx: CanvasRenderingContext2D, pattern: WallPattern, a: Pt, b: Pt, depth: number, z: number, x: number, y: number, face: number, door: boolean, plain = false): void {
  const lerp = (s: number, t: number): Pt => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s + depth * t];
  const levels = Math.max(1, Math.round(depth / (STEP_H * z)));
  ctx.save();
  polygon(ctx, [a, b, [b[0], b[1] + depth], [a[0], a[1] + depth]]);
  ctx.clip();
  switch (pattern) {
    case 'pedra':
    case 'tijolo': {
      const rows = levels * (pattern === 'tijolo' ? 3 : 2);
      const cols = pattern === 'tijolo' ? 4 : 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      for (let r = 1; r < rows; r++) {
        const t = r / rows;
        const p = lerp(0, t);
        const q = lerp(1, t);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      for (let r = 0; r < rows; r++)
        for (let c = 1; c <= cols; c++) {
          const s = (c - (r % 2 ? 0.5 : 0)) / cols;
          if (s <= 0 || s >= 1) continue;
          const p = lerp(s, r / rows);
          const q = lerp(s, (r + 1) / rows);
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
          ctx.stroke();
        }
      break;
    }
    case 'enxaimel': {
      const beam = '#5a3a20';
      ctx.strokeStyle = beam;
      ctx.lineWidth = Math.max(1.5, 2 * z);
      const seg = (p: Pt, q: Pt) => {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      };
      // Vigas: em cima, no meio de cada andar e postes nas pontas.
      for (let r = 0; r <= levels; r++) seg(lerp(0, r / levels), lerp(1, r / levels));
      seg(lerp(0.02, 0), lerp(0.02, 1));
      seg(lerp(0.98, 0), lerp(0.98, 1));
      if (tileHash(x, y, face + 50) < 0.5) seg(lerp(0.02, 0), lerp(0.5, 1 / levels));
      // Janela (com luz quente às vezes).
      if (levels >= 2 && !door && !plain && tileHash(x, y, face) < 0.75) windowAt(ctx, lerp, 0.5, 0.18, 0.28, 0.22, tileHash(x, y, face + 9) < 0.4);
      break;
    }
    case 'adobe':
      ctx.strokeStyle = 'rgba(120,80,40,0.25)';
      ctx.lineWidth = 1;
      for (let r = 1; r < levels * 2; r++) {
        const p = lerp(tileHash(x, y, r) * 0.3, r / (levels * 2));
        const q = lerp(0.7 + tileHash(x, y, r + 5) * 0.3, r / (levels * 2));
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      if (levels >= 2 && !door && !plain && tileHash(x, y, face) < 0.6) windowAt(ctx, lerp, 0.5, 0.2, 0.2, 0.2, false, true);
      break;
    case 'rocha':
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      for (let r = 0; r < levels + 1; r++) {
        const t = (r + tileHash(x, y, r + face) * 0.6) / (levels + 1);
        const p = lerp(0, t);
        const m = lerp(0.5, t + (tileHash(x, y, r + 3) - 0.5) * 0.12);
        const q = lerp(1, t + (tileHash(x, y, r + 7) - 0.5) * 0.12);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(m[0], m[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      break;
  }
  if (door) {
    // Porta em arco no pé da face (até 1,6 andar de altura).
    const hDoor = Math.min(1, (1.6 * STEP_H * z) / depth);
    const p0 = lerp(0.32, 1);
    const p1 = lerp(0.68, 1);
    const p2 = lerp(0.68, 1 - hDoor);
    const p3 = lerp(0.32, 1 - hDoor);
    ctx.fillStyle = '#4a2c16';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.quadraticCurveTo((p2[0] + p3[0]) / 2, Math.min(p2[1], p3[1]) - 4 * z, p3[0], p3[1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2a170a';
    ctx.lineWidth = 1;
    ctx.stroke();
    const k = lerp(0.6, 1 - hDoor / 2);
    blob(ctx, k, 0.9 * z, 0.9 * z, '#d8b04a');
  }
  ctx.restore();
}

function windowAt(ctx: CanvasRenderingContext2D, lerp: (s: number, t: number) => Pt, s: number, t: number, w: number, hgt: number, lit: boolean, arch = false): void {
  const p0 = lerp(s - w / 2, t);
  const p1 = lerp(s + w / 2, t);
  const p2 = lerp(s + w / 2, t + hgt);
  const p3 = lerp(s - w / 2, t + hgt);
  ctx.fillStyle = lit ? '#ffcf6a' : '#2a2430';
  polygon(ctx, arch ? [p3, p0, lerp(s, t - hgt * 0.3), p1, p2] : [p0, p1, p2, p3]);
  ctx.fill();
  ctx.strokeStyle = '#3a2412';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!arch) {
    const m0 = lerp(s, t);
    const m1 = lerp(s, t + hgt);
    ctx.beginPath();
    ctx.moveTo(m0[0], m0[1]);
    ctx.lineTo(m1[0], m1[1]);
    ctx.stroke();
  }
}
