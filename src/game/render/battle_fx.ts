import type { AnimStyle } from '../data';
import type { BattleMap } from '../battle/map';
import type { IsoCamera } from './iso';

/** Ponto do mundo: tile (pode ser fracionário) e altura do chão. */
export type WorldPt = [number, number, number];

interface Particle {
  at: WorldPt;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  grav: number;
  life: number;
  age: number;
  size: number;
  color: string;
  shape: 'dot' | 'star' | 'plus' | 'puff' | 'arrow';
}

interface Effect {
  style: AnimStyle;
  from: WorldPt;
  to: WorldPt;
  age: number;
  dur: number;
  impact: number;
  color: string;
  light: string;
  radius: number;
  seed: number;
  /** Já soltou as partículas do impacto. */
  burst: boolean;
}

/** A batalha desenhada agora é à noite (definido a cada `draw`). */
let fxNight = false;

/** Poça de luz aditiva (projéteis à noite). */
function lightPool(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, 0.45));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Cor (#rrggbb ou rgb/rgba) com transparência. */
function withAlpha(c: string, a: number): string {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = c.match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : c;
}

/** Altura (em px, zoom 1) do centro do corpo acima do chão. */
const BODY = 18;

/** Tempo até o impacto e duração total de cada estilo (s). */
export function styleTiming(style: AnimStyle, dist: number): { impact: number; dur: number } {
  switch (style) {
    case 'arrow':
      return { impact: 0.14 + dist * 0.05, dur: 0.3 + dist * 0.05 };
    case 'orb':
      return { impact: 0.22 + dist * 0.06, dur: 0.42 + dist * 0.06 };
    case 'volley':
      return { impact: 0.5, dur: 0.75 };
    case 'dash':
    case 'leap':
      return { impact: 0.3, dur: 0.45 };
    case 'meteor':
      return { impact: 0.55, dur: 0.85 };
    case 'beam':
      return { impact: 0.18, dur: 0.55 };
    case 'bolt':
      return { impact: 0.08, dur: 0.4 };
    case 'cone':
    case 'nova':
    case 'shout':
      return { impact: 0.2, dur: 0.55 };
    case 'heal':
    case 'buff':
    case 'summon':
    case 'trap':
    case 'smoke':
    case 'blink':
      return { impact: 0.25, dur: 0.7 };
    case 'charge':
      return { impact: 0.35, dur: 0.4 };
    default:
      return { impact: 0.12, dur: 0.35 };
  }
}

/**
 * Efeitos visuais da batalha: golpes, projéteis, explosões e partículas,
 * no espírito dos sprites de magia do Chrono Trigger (formas simples, cores vivas, brilho).
 */
export class BattleFx {
  private effects: Effect[] = [];
  /** Batalha à noite: projéteis iluminam o trajeto. */
  night = false;
  private particles: Particle[] = [];
  /** Clarão de tela (0..1) e tremor (px). */
  flash = 0;
  flashColor = '#ffffff';
  shake = 0;
  private seed = 1;

  get busy(): boolean {
    return this.effects.length > 0;
  }

  /** Dispara um efeito; devolve o tempo (s) até o impacto. */
  play(style: AnimStyle, from: WorldPt, to: WorldPt, color: string, light: string, radius = 0): number {
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const t = styleTiming(style, dist);
    this.effects.push({ style, from, to, age: 0, dur: t.dur, impact: t.impact, color, light, radius, seed: this.seed++, burst: false });
    if (style === 'charge') this.gather(from, color, light);
    if (style === 'blink' || style === 'smoke') this.puffs(from, style === 'smoke' ? '#9e9e9e' : light, 10);
    return t.impact;
  }

  /** Energia sendo reunida em volta do conjurador (preparação de magia). */
  gather(at: WorldPt, color: string, light: string): void {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 34 + (i % 3) * 8;
      this.particles.push({ at, ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.6 - BODY, vx: -Math.cos(a) * r * 2.6, vy: -Math.sin(a) * r * 1.6, grav: 0, life: 0.38, age: 0, size: 2.5, color: i % 2 ? color : light, shape: i % 4 ? 'dot' : 'star' });
    }
  }

  /** Faíscas de impacto. */
  sparks(at: WorldPt, color: string, light: string, n = 12, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (60 + Math.random() * 90) * power;
      this.particles.push({ at, ox: 0, oy: -BODY, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 40, grav: 260, life: 0.45 + Math.random() * 0.25, age: 0, size: 2 + Math.random() * 2, color: i % 3 ? color : light, shape: i % 5 ? 'dot' : 'star' });
    }
  }

  puffs(at: WorldPt, color: string, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ at, ox: Math.cos(a) * 8, oy: -BODY / 2 + Math.sin(a) * 4, vx: Math.cos(a) * 30, vy: -20 - Math.random() * 25, grav: -10, life: 0.7, age: 0, size: 7 + Math.random() * 5, color, shape: 'puff' });
    }
  }

  rising(at: WorldPt, color: string, light: string, shape: Particle['shape'], n = 10): void {
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 30;
      this.particles.push({ at, ox, oy: Math.random() * 6, vx: 0, vy: -50 - Math.random() * 40, grav: 0, life: 0.6 + Math.random() * 0.3, age: 0, size: 3 + Math.random() * 2, color: i % 2 ? color : light, shape });
    }
  }

  /** Impacto genérico em um tile (dano, área). */
  hit(at: WorldPt, color: string, light: string, crit = false): void {
    this.sparks(at, color, light, crit ? 22 : 12, crit ? 1.4 : 1);
    this.shake = Math.max(this.shake, crit ? 7 : 3.5);
    if (crit) {
      this.flash = 0.45;
      this.flashColor = light;
    }
  }

  update(dt: number): void {
    for (const e of this.effects) {
      e.age += dt;
      if (!e.burst && e.age >= e.impact) {
        e.burst = true;
        this.onImpact(e);
      }
      if (e.style === 'orb' || e.style === 'meteor') {
        const p = Math.min(1, e.age / e.impact);
        if (p < 1 && Math.random() < 0.8) {
          const at = lerpPt(e.from, e.to, p);
          const lift = e.style === 'meteor' ? (1 - p) * 160 : Math.sin(p * Math.PI) * 26;
          this.particles.push({ at, ox: (Math.random() - 0.5) * 6, oy: -BODY - lift, vx: (Math.random() - 0.5) * 20, vy: -10, grav: 0, life: 0.3, age: 0, size: 3, color: e.light, shape: 'dot' });
        }
      }
    }
    this.effects = this.effects.filter((e) => e.age < e.dur);
    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.grav * dt;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 22);
  }

  private onImpact(e: Effect): void {
    const { to, color, light } = e;
    switch (e.style) {
      case 'heal':
        this.rising(to, color, light, 'plus', 12);
        break;
      case 'buff':
        this.rising(to, color, light, 'arrow', 10);
        break;
      case 'summon':
        this.rising(to, color, light, 'star', 16);
        this.flash = 0.25;
        this.flashColor = light;
        break;
      case 'smoke':
        this.puffs(to, 'rgba(160,160,170,0.9)', 14);
        break;
      case 'blink':
        this.rising(to, light, color, 'star', 10);
        break;
      case 'trap':
        this.sparks(to, color, light, 6, 0.5);
        break;
      case 'meteor':
      case 'nova':
        this.flash = e.style === 'meteor' ? 0.5 : 0.3;
        this.flashColor = light;
        this.shake = Math.max(this.shake, e.style === 'meteor' ? 9 : 5);
        this.sparks(to, color, light, 26, 1.6);
        break;
      case 'bolt':
        this.flash = 0.4;
        this.flashColor = light;
        this.sparks(to, color, light, 14, 1.2);
        break;
      case 'shout':
      case 'charge':
        break;
      default:
        this.sparks(to, color, light, 10, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap): void {
    fxNight = this.night;
    const z = cam.zoom;
    const scr = (p: WorldPt, lift = BODY): [number, number] => {
      const [sx, sy] = cam.project(map, p[0], p[1], p[2]);
      return [sx, sy - lift * z];
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const e of this.effects) drawEffect(ctx, e, scr, z);
    for (const p of this.particles) {
      const [sx, sy] = scr(p.at, 0);
      const x = sx + p.ox * z;
      const y = sy + p.oy * z;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      const s = p.size * z;
      if (p.shape === 'dot') {
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.ceil(s), Math.ceil(s));
      } else if (p.shape === 'star') {
        ctx.lineWidth = Math.max(1, s / 2.5);
        ctx.beginPath();
        ctx.moveTo(x - s * 1.4, y);
        ctx.lineTo(x + s * 1.4, y);
        ctx.moveTo(x, y - s * 1.4);
        ctx.lineTo(x, y + s * 1.4);
        ctx.stroke();
      } else if (p.shape === 'plus') {
        ctx.fillRect(x - s * 1.2, y - s * 0.35, s * 2.4, s * 0.7);
        ctx.fillRect(x - s * 0.35, y - s * 1.2, s * 0.7, s * 2.4);
      } else if (p.shape === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.4);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x - s, y);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.max(0, k * 0.7);
        ctx.beginPath();
        ctx.arc(x, y, s * (1.6 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Clarão de tela inteira (chamado depois do resto do desenho). */
  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.flash * 0.6;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function lerpPt(a: WorldPt, b: WorldPt, t: number): WorldPt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function glowLine(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, light: string, width: number): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 2.2;
  ctx.globalAlpha *= 0.55;
  ctx.stroke();
  ctx.globalAlpha /= 0.55;
  ctx.strokeStyle = light;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, scr: (p: WorldPt, lift?: number) => [number, number], z: number): void {
  const p = e.age / e.dur;
  const pi = Math.min(1, e.age / e.impact);
  const [fx, fy] = scr(e.from);
  const [tx, ty] = scr(e.to);
  const ang = Math.atan2(ty - fy, tx - fx);
  ctx.globalAlpha = 1;
  switch (e.style) {
    case 'slash':
    case 'claw': {
      // Meia-lua branca que corta na diagonal sobre o alvo.
      const fade = 1 - Math.max(0, (e.age - e.impact) / (e.dur - e.impact));
      ctx.globalAlpha = Math.max(0, fade);
      const lines = e.style === 'claw' ? [-7, 0, 7] : [0];
      for (const off of lines) {
        const sweep = pi * Math.PI * 0.9;
        const r = 20 * z;
        ctx.beginPath();
        ctx.arc(tx + off * z, ty, r, -Math.PI * 0.85 + ang * 0.2, -Math.PI * 0.85 + sweep + ang * 0.2);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = (e.style === 'claw' ? 3 : 6) * z;
        ctx.stroke();
        ctx.strokeStyle = e.light;
        ctx.lineWidth = (e.style === 'claw' ? 1.5 : 2.5) * z;
        ctx.stroke();
      }
      break;
    }
    case 'thrust': {
      const reach = Math.min(1, pi * 1.2);
      const ex = fx + (tx - fx) * reach;
      const ey = fy + (ty - fy) * reach;
      ctx.globalAlpha = 1 - Math.max(0, (e.age - e.impact) / (e.dur - e.impact));
      glowLine(ctx, [[fx + (ex - fx) * 0.5, fy + (ey - fy) * 0.5], [ex, ey]], e.color, e.light, 3 * z);
      break;
    }
    case 'spin': {
      ctx.globalAlpha = 1 - p;
      ctx.beginPath();
      ctx.ellipse(fx, fy + 8 * z, (14 + p * 30) * z, (7 + p * 15) * z, 0, p * 6, p * 6 + Math.PI * 1.5);
      ctx.strokeStyle = e.light;
      ctx.lineWidth = 4 * z;
      ctx.stroke();
      break;
    }
    case 'dash':
    case 'leap': {
      // Rastro de imagens residuais do atacante até o alvo.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = Math.max(0, pi - i * 0.08);
        const at = lerpPt(e.from, e.to, t);
        const [x, y] = scr(at);
        const lift = e.style === 'leap' ? Math.sin(t * Math.PI) * 50 * z : 0;
        ctx.globalAlpha = (1 - i / n) * 0.6 * (1 - Math.max(0, (e.age - e.impact) / (e.dur - e.impact)));
        ctx.fillStyle = i ? e.color : e.light;
        ctx.beginPath();
        ctx.ellipse(x, y - lift, 7 * z, 12 * z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'arrow': {
      if (pi >= 1) break;
      const at = lerpPt(e.from, e.to, pi);
      const [x, y] = scr(at);
      const lift = Math.sin(pi * Math.PI) * 22 * z;
      const dy = Math.cos(pi * Math.PI) * 22 * z * (Math.PI / Math.max(1, Math.hypot(tx - fx, ty - fy) / (10 * z)));
      const a = Math.atan2(ty - fy - dy, tx - fx);
      glowLine(ctx, [[x - Math.cos(a) * 12 * z, y - lift - Math.sin(a) * 12 * z], [x, y - lift]], e.color, e.light, 1.6 * z);
      break;
    }
    case 'volley': {
      // Flechas caem do céu sobre a área.
      for (let i = 0; i < 7; i++) {
        const t = Math.min(1, Math.max(0, (e.age - i * 0.04) / e.impact));
        if (t <= 0 || t >= 1) continue;
        const ox = (((e.seed * 37 + i * 53) % 21) - 10) * z * (1 + e.radius);
        const oy = (((e.seed * 17 + i * 29) % 11) - 5) * z * (1 + e.radius);
        const x = tx + ox;
        const y = ty + oy - (1 - t) * 140 * z;
        glowLine(ctx, [[x - 3 * z, y - 12 * z], [x, y]], e.color, e.light, 1.5 * z);
      }
      break;
    }
    case 'orb':
    case 'meteor': {
      if (pi < 1) {
        const at = lerpPt(e.from, e.to, pi);
        const [x, y] = scr(at);
        const lift = e.style === 'meteor' ? (1 - pi) * 160 * z : Math.sin(pi * Math.PI) * 26 * z;
        const r = (e.style === 'meteor' ? 11 : 7) * z;
        ctx.fillStyle = e.color;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(x, y - lift, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = e.light;
        ctx.beginPath();
        ctx.arc(x, y - lift, r, 0, Math.PI * 2);
        ctx.fill();
        // À noite, o projétil ilumina o caminho por onde passa.
        if (fxNight) lightPool(ctx, x, y - lift, 90 * z, e.light);
      } else ring(ctx, tx, ty + BODY * z, (e.age - e.impact) / (e.dur - e.impact), (16 + e.radius * 22) * z, e.color, e.light);
      break;
    }
    case 'beam': {
      const w = (4 + Math.sin(e.age * 50) * 1.5) * z * (1 - Math.max(0, (e.age - e.impact) / (e.dur - e.impact)));
      if (w > 0) {
        const reach = Math.min(1, pi);
        glowLine(ctx, [[fx, fy], [fx + (tx - fx) * reach, fy + (ty - fy) * reach]], e.color, e.light, w);
      }
      break;
    }
    case 'bolt': {
      if (e.age > e.dur * 0.7) break;
      const pts: [number, number][] = [[tx + 6 * z, ty - 150 * z]];
      for (let i = 1; i <= 6; i++) pts.push([tx + ((((e.seed + i) * 7919 + Math.floor(e.age * 30)) % 17) - 8) * z, ty - 150 * z + (150 * z * i) / 6]);
      ctx.globalAlpha = 1 - e.age / (e.dur * 0.7);
      glowLine(ctx, pts, e.color, e.light, 2.5 * z);
      break;
    }
    case 'cone': {
      const len = Math.hypot(tx - fx, ty - fy) * Math.min(1, pi * 1.3);
      ctx.globalAlpha = 0.55 * (1 - Math.max(0, (e.age - e.impact) / (e.dur - e.impact)));
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.arc(fx, fy, len, ang - 0.45, ang + 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha *= 1.4;
      ctx.strokeStyle = e.light;
      ctx.lineWidth = 2 * z;
      ctx.stroke();
      break;
    }
    case 'nova':
    case 'shout': {
      const [cx, cy] = e.style === 'shout' ? [fx, fy + BODY * z] : [tx, ty + BODY * z];
      const r = (18 + (e.radius + (e.style === 'shout' ? 1.5 : 0.5)) * 26) * z;
      ring(ctx, cx, cy, p, r, e.color, e.light);
      if (e.style === 'shout') ring(ctx, cx, cy, Math.max(0, p - 0.25), r, e.color, e.light);
      break;
    }
    case 'heal':
    case 'buff':
    case 'summon':
    case 'trap': {
      // Círculo mágico no chão, girando.
      const [cx, cy] = [tx, ty + BODY * z];
      const r = (e.style === 'summon' ? 22 : 16) * z * (0.6 + Math.min(1, p * 2) * 0.4);
      ctx.globalAlpha = Math.min(1, (1 - p) * 2);
      ctx.strokeStyle = e.light;
      ctx.lineWidth = 1.5 * z;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = e.color;
      ctx.beginPath();
      const sides = e.style === 'trap' ? 4 : 6;
      for (let i = 0; i <= sides; i++) {
        const a = e.age * 2 + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * r * 0.8;
        const y = cy + Math.sin(a) * r * 0.4;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      if (e.style !== 'trap') {
        const g = ctx.createLinearGradient(cx, cy, cx, cy - 60 * z);
        g.addColorStop(0, e.color);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 0.7, cy - 60 * z, r * 1.4, 60 * z);
      }
      break;
    }
    case 'blink':
    case 'smoke':
    case 'charge':
      break;
  }
  ctx.globalAlpha = 1;
}

function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, r: number, color: string, light: string): void {
  if (p <= 0 || p >= 1) return;
  const rr = r * (0.2 + p * 0.8);
  ctx.globalAlpha = 1 - p;
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rr, rr * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = light;
  ctx.lineWidth = 3;
  ctx.stroke();
}
