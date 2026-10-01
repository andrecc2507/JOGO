import { CLOUDS, PROPS, SURFACES, TERRAIN, idx, type BattleMap, type Tile } from '../battle/map';
import { STATUS_INFO, type BattleUnit, type StatusId } from '../battle/types';
import { CONE_HALF_ANGLE, CONE_RANGE } from '../battle/engine';
import { IsoCamera, STEP_H, TILE_H, TILE_W, shade } from './iso';
import { drawSprite, spriteFor, type SpriteSpec } from './sprites';

export interface Floater {
  x: number;
  y: number;
  h: number;
  text: string;
  color: string;
  age: number;
}

export interface BattleDrawOptions {
  highlights?: Map<number, string>;
  path?: Set<number>;
  area?: Set<number>;
  hover?: [number, number] | null;
  units?: BattleUnit[];
  unitVisible?: (u: BattleUnit) => boolean;
  displayPos?: Map<string, [number, number]>;
  vision?: Set<number> | null;
  activeUid?: string | null;
  cones?: BattleUnit[];
  showSpawns?: boolean;
  time: number;
  floaters?: Floater[];
  fx?: { x: number; y: number; color: string; age: number }[];
}

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - hh);
  ctx.lineTo(sx + hw, sy);
  ctx.lineTo(sx, sy + hh);
  ctx.lineTo(sx - hw, sy);
  ctx.closePath();
}

function tileTopColor(t: Tile): string {
  return TERRAIN[t.t].color;
}

export function drawBattle(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, o: BattleDrawOptions): void {
  const z = cam.zoom;
  const hw = (TILE_W * z) / 2;
  const hh = (TILE_H * z) / 2;
  const order = cam.drawOrder(map);
  const unitsByTile = new Map<number, BattleUnit[]>();
  for (const u of o.units ?? []) {
    if (!u.alive && !o.displayPos?.has(u.uid)) continue;
    const pos = o.displayPos?.get(u.uid) ?? [u.x, u.y];
    const key = idx(map, Math.round(pos[0]), Math.round(pos[1]));
    unitsByTile.set(key, [...(unitsByTile.get(key) ?? []), u]);
  }
  for (const [x, y] of order) {
    const i = idx(map, x, y);
    const t = map.tiles[i]!;
    const [sx, sy] = cam.project(map, x, y, t.h);
    const depth = t.h * STEP_H * z + 6 * z;
    const top = tileTopColor(t);
    const water = t.t === 'agua_funda';
    // Laterais.
    ctx.fillStyle = shade(top.startsWith('#') ? top : '#888888', 0.72);
    ctx.beginPath();
    ctx.moveTo(sx - hw, sy);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx, sy + hh + depth);
    ctx.lineTo(sx - hw, sy + depth);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(top, 0.55);
    ctx.beginPath();
    ctx.moveTo(sx + hw, sy);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx, sy + hh + depth);
    ctx.lineTo(sx + hw, sy + depth);
    ctx.closePath();
    ctx.fill();
    // Topo.
    diamond(ctx, sx, sy, hw, hh);
    ctx.fillStyle = water ? shade(top, 0.9 + Math.sin(o.time * 2 + x + y) * 0.08) : top;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Superfície.
    if (t.s) drawSurface(ctx, t, sx, sy, hw, hh, o.time);
    // Destaques (movimento, alcance, área).
    const hl = o.highlights?.get(i);
    if (hl) {
      diamond(ctx, sx, sy, hw * 0.92, hh * 0.92);
      ctx.fillStyle = hl;
      ctx.fill();
    }
    if (o.area?.has(i)) {
      diamond(ctx, sx, sy, hw * 0.92, hh * 0.92);
      ctx.fillStyle = 'rgba(255,80,60,0.45)';
      ctx.fill();
    }
    if (o.path?.has(i)) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 4 * z, 2 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (t.spawn && (o.showSpawns || t.spawn === 'extract')) {
      diamond(ctx, sx, sy, hw * 0.7, hh * 0.7);
      ctx.strokeStyle = t.spawn === 'player' ? '#4fc3f7' : t.spawn === 'enemy' ? '#ef5350' : `rgba(120,255,140,${0.6 + Math.sin(o.time * 4) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (o.hover && o.hover[0] === x && o.hover[1] === y) {
      diamond(ctx, sx, sy, hw, hh);
      ctx.strokeStyle = '#fff59d';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Neblina de guerra.
    if (o.vision && !o.vision.has(i)) {
      diamond(ctx, sx, sy, hw, hh);
      ctx.fillStyle = 'rgba(6,8,22,0.62)';
      ctx.fill();
    }
    if (t.p) drawProp(ctx, t, sx, sy, z, o.time);
    for (const u of unitsByTile.get(i) ?? []) drawUnit(ctx, cam, map, u, o, z);
    if (t.c) drawCloud(ctx, t, sx, sy, hw, hh, o.time);
  }
  // Cones de visão (mostrados no turno de quem está escondido).
  for (const e of o.cones ?? []) drawCone(ctx, cam, map, e);
  for (const f of o.fx ?? []) {
    const t = map.tiles[idx(map, f.x, f.y)];
    if (!t) continue;
    const [sx, sy] = cam.project(map, f.x, f.y, t.h);
    ctx.globalAlpha = Math.max(0, 1 - f.age / 0.6);
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(sx, sy - 10 * z, (6 + f.age * 40) * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const f of o.floaters ?? []) {
    const t = map.tiles[idx(map, Math.round(f.x), Math.round(f.y))];
    const [sx, sy] = cam.project(map, f.x, f.y, (t?.h ?? 0) + f.h);
    ctx.globalAlpha = Math.max(0, 1 - f.age / 1.2);
    ctx.font = `bold ${Math.round(14 * Math.max(0.8, z))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(f.text, sx, sy - 40 * z - f.age * 30);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy - 40 * z - f.age * 30);
    ctx.globalAlpha = 1;
  }
}

function drawSurface(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number, hw: number, hh: number, time: number): void {
  const s = t.s!;
  diamond(ctx, sx, sy, hw * 0.85, hh * 0.85);
  ctx.fillStyle = SURFACES[s].color;
  ctx.fill();
  if (s === 'fogo') {
    for (let k = 0; k < 4; k++) {
      const fx = sx + (k - 1.5) * hw * 0.35;
      const flick = Math.sin(time * 12 + k * 1.7) * 3;
      ctx.fillStyle = k % 2 ? '#ffd54f' : '#ff7043';
      ctx.beginPath();
      ctx.moveTo(fx - 4, sy + 2);
      ctx.lineTo(fx, sy - 12 - flick);
      ctx.lineTo(fx + 4, sy + 2);
      ctx.fill();
    }
  } else if (s === 'agua_eletrica') {
    ctx.strokeStyle = '#fffde7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const o = Math.sin(time * 20) * 3;
    ctx.moveTo(sx - hw * 0.5, sy + o);
    ctx.lineTo(sx - hw * 0.2, sy - 3 - o);
    ctx.lineTo(sx + hw * 0.1, sy + 3 + o);
    ctx.lineTo(sx + hw * 0.5, sy - 2);
    ctx.stroke();
  } else if (s === 'gelo') {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.3, sy - hh * 0.2);
    ctx.lineTo(sx + hw * 0.1, sy + hh * 0.3);
    ctx.stroke();
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number, hw: number, hh: number, time: number): void {
  ctx.fillStyle = CLOUDS[t.c!].color;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.ellipse(sx + Math.sin(time + k * 2) * hw * 0.3, sy - hh * (1.2 + k * 0.5), hw * (0.6 - k * 0.1), hh * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProp(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number, z: number, time: number): void {
  const def = PROPS[t.p!];
  switch (t.p) {
    case 'arvore':
      ctx.fillStyle = '#5d3a1e';
      ctx.fillRect(sx - 3 * z, sy - 18 * z, 6 * z, 18 * z);
      for (const [dx, dy, r, c] of [
        [0, -34, 14, '#2e6b2a'],
        [-8, -26, 10, '#357a31'],
        [8, -27, 10, '#2a6127'],
        [0, -42, 9, '#3f8a38'],
      ] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(sx + dx * z + Math.sin(time + sx) * 0.6, sy + dy * z, r * z, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'pinheiro':
      ctx.fillStyle = '#4e3420';
      ctx.fillRect(sx - 2 * z, sy - 10 * z, 4 * z, 10 * z);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k % 2 ? '#2c5a3c' : '#24503a';
        ctx.beginPath();
        ctx.moveTo(sx - (14 - k * 3) * z, sy - (8 + k * 11) * z);
        ctx.lineTo(sx, sy - (26 + k * 11) * z);
        ctx.lineTo(sx + (14 - k * 3) * z, sy - (8 + k * 11) * z);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(sx - 3 * z, sy - 49 * z, 6 * z, 3 * z);
      break;
    case 'rocha':
      ctx.fillStyle = '#6d6f73';
      ctx.beginPath();
      ctx.moveTo(sx - 12 * z, sy + 2 * z);
      ctx.lineTo(sx - 8 * z, sy - 12 * z);
      ctx.lineTo(sx + 4 * z, sy - 16 * z);
      ctx.lineTo(sx + 12 * z, sy - 4 * z);
      ctx.lineTo(sx + 10 * z, sy + 3 * z);
      ctx.fill();
      ctx.fillStyle = '#8b8e93';
      ctx.fillRect(sx - 6 * z, sy - 12 * z, 7 * z, 4 * z);
      break;
    case 'arbusto':
      ctx.fillStyle = '#3f7f34';
      for (const [dx, dy, r] of [
        [-6, -5, 7],
        [5, -6, 7],
        [0, -10, 7],
      ] as const) {
        ctx.beginPath();
        ctx.arc(sx + dx * z, sy + dy * z, r * z, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'muro':
      ctx.fillStyle = '#7a7066';
      ctx.fillRect(sx - 14 * z, sy - 24 * z, 28 * z, 26 * z);
      ctx.strokeStyle = '#5b534b';
      ctx.strokeRect(sx - 14 * z, sy - 24 * z, 28 * z, 26 * z);
      ctx.beginPath();
      ctx.moveTo(sx - 14 * z, sy - 11 * z);
      ctx.lineTo(sx + 14 * z, sy - 11 * z);
      ctx.stroke();
      break;
    case 'caixa':
      ctx.fillStyle = '#a0703a';
      ctx.fillRect(sx - 9 * z, sy - 16 * z, 18 * z, 16 * z);
      ctx.strokeStyle = '#6b4520';
      ctx.strokeRect(sx - 9 * z, sy - 16 * z, 18 * z, 16 * z);
      ctx.beginPath();
      ctx.moveTo(sx - 9 * z, sy - 16 * z);
      ctx.lineTo(sx + 9 * z, sy);
      ctx.stroke();
      break;
    case 'cacto':
      ctx.fillStyle = '#4f8a3a';
      ctx.fillRect(sx - 3 * z, sy - 26 * z, 6 * z, 26 * z);
      ctx.fillRect(sx - 10 * z, sy - 18 * z, 4 * z, 10 * z);
      ctx.fillRect(sx - 10 * z, sy - 12 * z, 8 * z, 3 * z);
      ctx.fillRect(sx + 6 * z, sy - 22 * z, 4 * z, 10 * z);
      ctx.fillRect(sx + 2 * z, sy - 14 * z, 8 * z, 3 * z);
      break;
    default:
      ctx.fillStyle = def.color;
      ctx.fillRect(sx - 6 * z, sy - 12 * z, 12 * z, 12 * z);
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, u: BattleUnit, o: BattleDrawOptions, z: number): void {
  if (o.unitVisible && !o.unitVisible(u)) return;
  const pos = o.displayPos?.get(u.uid) ?? [u.x, u.y];
  const tx = Math.round(pos[0]);
  const ty = Math.round(pos[1]);
  const tile = map.tiles[idx(map, tx, ty)];
  if (!tile) return;
  const [sx, sy] = cam.project(map, pos[0], pos[1], tile.h);
  const active = o.activeUid === u.uid;
  ctx.fillStyle = u.team === 'player' ? 'rgba(79,195,247,0.55)' : 'rgba(239,83,80,0.55)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, 13 * z * u.look.size, 6 * z * u.look.size, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!u.alive) ctx.globalAlpha = 0.35;
  else if (u.hidden) ctx.globalAlpha = 0.5;
  const bob = active ? Math.sin(o.time * 6) * 1.5 * z : 0;
  const flip = !cam.screenFacingRight(map, u.facing);
  const spec = unitSpec(u);
  const img = spriteFor(spec);
  // A largura na tela depende do tamanho (tiles), não da resolução da pixel art.
  const scale = 2 * z * u.look.size * (16 / Math.max(16, img.width - 2));
  drawSprite(ctx, spec, sx, sy + 2 * z + bob, scale, flip);
  ctx.globalAlpha = 1;
  if (!u.alive) return;
  const top = sy - Math.max(30 * z, img.height * scale - 2 * z) - 6 * z;
  const bw = 26 * z;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(sx - bw / 2, top, bw, 4 * z);
  ctx.fillStyle = u.team === 'player' ? '#66bb6a' : '#ef5350';
  ctx.fillRect(sx - bw / 2, top, (bw * u.hp) / u.maxHp, 4 * z);
  ctx.fillStyle = '#fdd835';
  ctx.fillRect(sx - bw / 2, top + 4 * z, (bw * Math.min(100, u.gauge)) / 100, 2 * z);
  const icons = (Object.keys(u.statuses) as StatusId[]).map((s) => STATUS_INFO[s].icon);
  if (u.overwatch) icons.push('🎯');
  if (u.hidden) icons.push('🌑');
  if (u.defending) icons.push('🛡');
  if (u.isTarget) icons.push('💀');
  if (icons.length) {
    ctx.font = `${Math.round(10 * Math.max(0.9, z))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(icons.join(''), sx, top - 4 * z);
  }
  if (active) {
    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    const ay = top - 14 * z + Math.sin(o.time * 5) * 3;
    ctx.moveTo(sx - 5 * z, ay);
    ctx.lineTo(sx + 5 * z, ay);
    ctx.lineTo(sx, ay + 6 * z);
    ctx.fill();
  }
}

function drawCone(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, e: BattleUnit): void {
  const t = map.tiles[idx(map, e.x, e.y)];
  if (!t) return;
  const [dx, dy] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ][e.facing]!;
  const base = Math.atan2(dy!, dx!);
  const pts: [number, number][] = [cam.project(map, e.x, e.y, t.h)];
  for (let k = 0; k <= 8; k++) {
    const a = base - CONE_HALF_ANGLE + (k / 8) * CONE_HALF_ANGLE * 2;
    pts.push(cam.project(map, e.x + Math.cos(a) * CONE_RANGE, e.y + Math.sin(a) * CONE_RANGE, t.h));
  }
  ctx.fillStyle = 'rgba(255,60,60,0.16)';
  ctx.strokeStyle = 'rgba(255,90,90,0.6)';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function unitSpec(u: BattleUnit): SpriteSpec {
  return {
    classId: u.classId,
    beast: u.look.beast,
    color: u.look.color,
    dark: u.look.dark,
    hairColor: u.look.hairColor,
    hairStyle: u.look.hairStyle,
    skin: u.look.skin,
    sprite: u.look.sprite,
    palette: u.look.palette,
  };
}
