import { CLOUDS, PROPS, SURFACES, TERRAIN, idx, type BattleMap, type Tile } from '../battle/map';
import { STATUS_INFO, type BattleUnit, type StatusId } from '../battle/types';
import { CONE_HALF_ANGLE, CONE_RANGE } from '../battle/engine';
import { IsoCamera, STEP_H, TILE_H, TILE_W, shade } from './iso';
import { drawCanvas, imageFrame, spriteFor, type SpriteSpec } from './sprites';
import { artFor, frameIndex, pickClip, resolvePose, type UnitPose } from './sprite_anims';

export interface Floater {
  x: number;
  y: number;
  h: number;
  text: string;
  color: string;
  /** Idade em s; negativa = ainda esperando a vez (avisos empilhados). */
  age: number;
  /** Duração (padrão 1,2 s). */
  life?: number;
  /** Aviso de ambiente/estado: desenhado como etiqueta que sobe devagar. */
  notice?: boolean;
  /** Exclamação grande de "avistado" (estilo Metal Gear). */
  alert?: boolean;
  /** Fala do herói (balão sobre a cabeça). */
  speech?: boolean;
}

/** Escudo de cobertura desenhado entre um tile e o obstáculo vizinho. */
export interface CoverMark {
  x: number;
  y: number;
  dx: number;
  dy: number;
  level: 'half' | 'full';
}

/** Linha de tiro do atacante até o tile sob o cursor, com o motivo de não dar para atacar. */
export interface FireLine {
  from: [number, number];
  to: [number, number];
  /** Obstáculo que corta a linha (ganha um ✖). */
  blocked?: [number, number];
  blockReason?: string;
  /** Alvo além do alcance da arma/habilidade. */
  outOfRange?: boolean;
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
  /** Elevação extra (em degraus) de unidades em movimento (pulinho da caminhada). */
  lift?: Map<string, number>;
  /** Escudos de cobertura do tile sob o cursor ao planejar o movimento. */
  cover?: CoverMark[];
  /** Linha de tiro do atacante até o tile sob o cursor; `blocked` marca o obstáculo que a corta. */
  fireLine?: FireLine;
  /** Tiles que pulsam com brilho (alvos válidos ao mirar). */
  glow?: Set<number>;
  /** Estado da reação única (ícone ao lado da barra de vida). */
  reaction?: (u: BattleUnit) => 'none' | 'ready' | 'spent';
  /** Objetivos de missão (cela, baú, documentos, runas). */
  objectives?: { x: number; y: number; kind: string; done: boolean; progress: number; turns: number }[];
  /** Casas do caminho previsto onde um inimigo dará ataque de oportunidade (⚔ vermelho). */
  threats?: { x: number; y: number }[];
  /** Pose de cada unidade (animações da arte pronta); sem isso, parado/caído/morto pelo estado. */
  pose?: (u: BattleUnit) => UnitPose;
  /** Unidades mortas que continuam no chão (arte com animação `dead`). */
  showDead?: (u: BattleUnit) => boolean;
  /** Previsão de dano ao mirar: parte da barra de vida que o golpe pode tirar (mín–máx). */
  forecast?: Map<string, { min: number; max: number; chance: number }>;
  /** Intenção prevista do próximo inimigo: de onde ataca, onde mira e as casas atingidas. */
  intents?: Intent[];
  /** Gradação de cor da batalha (tom sombrio; o Vazio é frio e violeta). */
  grade?: 'dark' | 'void';
}

export interface Intent {
  uid: string;
  from: [number, number];
  to: [number, number];
  tiles: [number, number][];
  label: string;
}

/** Quando cada unidade entrou na pose atual (para tocar animações do começo). */
const poseClock = new Map<string, { key: string; since: number }>();

/** Quadro da arte pronta para a pose atual, ou null (usa a imagem parada / pixel art). */
function poseFrame(u: BattleUnit, o: BattleDrawOptions): HTMLCanvasElement | null {
  const art = artFor(u.look.art);
  if (!art) return null;
  const pose = o.pose?.(u) ?? resolvePose(u);
  const pick = pickClip(art, pose);
  if (!pick) return null;
  const key = `${pick.name}|${pose.key ?? ''}`;
  let c = poseClock.get(u.uid);
  if (!c || c.key !== key || c.since > o.time) poseClock.set(u.uid, (c = { key, since: o.time }));
  return imageFrame(pick.clip.sheet, frameIndex(pick.clip, o.time - c.since), pick.clip.frames);
}

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - hh);
  ctx.lineTo(sx + hw, sy);
  ctx.lineTo(sx, sy + hh);
  ctx.lineTo(sx - hw, sy);
  ctx.closePath();
}

/** Gradação da batalha em curso (definida no início de cada desenho). */
let grade: BattleDrawOptions['grade'];
const gradeCache = new Map<string, string>();

/**
 * Tom sombrio do terreno (as unidades e os números ficam com a cor original): dessatura e escurece;
 * no Vazio, puxa para um violeta frio.
 */
export function gradeColor(hex: string, mode: NonNullable<BattleDrawOptions['grade']>): string {
  const key = `${mode}${hex}`;
  const hit = gradeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1, 7), 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const [desat, dark, tint, mixT] = mode === 'void' ? [0.55, 0.7, [72, 52, 120], 0.3] : [0.3, 0.8, [60, 48, 40], 0.12];
  const f = (c: number, t: number) => Math.round(((c * (1 - desat) + lum * desat) * (1 - mixT) + t * mixT) * dark);
  [r, g, b] = [f(r, tint[0]!), f(g, tint[1]!), f(b, tint[2]!)];
  const out = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  gradeCache.set(key, out);
  return out;
}

function tileTopColor(t: Tile): string {
  const c = TERRAIN[t.t].color;
  return grade && c.startsWith('#') ? gradeColor(c, grade) : c;
}

export function drawBattle(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, o: BattleDrawOptions): void {
  grade = o.grade;
  const z = cam.zoom;
  const hw = (TILE_W * z) / 2;
  const hh = (TILE_H * z) / 2;
  const order = cam.drawOrder(map);
  const unitsByTile = new Map<number, BattleUnit[]>();
  for (const u of o.units ?? []) {
    if (!u.alive && !o.displayPos?.has(u.uid) && !o.showDead?.(u)) continue;
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
    // Textura do chão (terra e madeira não se confundem com lama nem entre si).
    if (t.t === 'terra') drawDirt(ctx, sx, sy, hw, hh, x, y);
    else if (t.t === 'madeira') drawPlanks(ctx, sx, sy, hw, hh);
    // Superfície.
    if (t.s) drawSurface(ctx, t, sx, sy, hw, hh, o.time);
    // Destaques (movimento, alcance, área).
    const hl = o.highlights?.get(i);
    if (hl) {
      diamond(ctx, sx, sy, hw * 0.92, hh * 0.92);
      ctx.fillStyle = hl;
      ctx.fill();
    }
    if (o.glow?.has(i)) {
      // Brilho que pulsa devagar para os alvos se destacarem do chão.
      diamond(ctx, sx, sy, hw * 0.86, hh * 0.86);
      ctx.strokeStyle = `rgba(255,236,170,${0.45 + Math.sin(o.time * 4 + (x + y) * 0.6) * 0.35})`;
      ctx.lineWidth = 2;
      ctx.stroke();
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
    if (t.p) {
      drawProp(ctx, t, sx, sy, z, o.time);
      if (t.pHp !== undefined) drawPropHp(ctx, t, sx, sy, z);
    }
    for (const u of unitsByTile.get(i) ?? []) drawUnit(ctx, cam, map, u, o, z);
    if (t.c) drawCloud(ctx, t, sx, sy, hw, hh, o.time);
  }
  for (const it of o.intents ?? []) drawIntent(ctx, cam, map, it, z, o.time);
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
  for (const c of o.cover ?? []) drawCoverMark(ctx, cam, map, c, z);
  if (o.fireLine) drawFireLine(ctx, cam, map, o.fireLine, z, o.time);
  for (const t of o.threats ?? []) drawThreat(ctx, cam, map, t.x, t.y, z, o.time);
  for (const ob of o.objectives ?? []) drawObjective(ctx, cam, map, ob, z, o.time);
  for (const f of o.floaters ?? []) {
    if (f.age < 0) continue;
    const life = f.life ?? 1.2;
    const t = map.tiles[idx(map, Math.round(f.x), Math.round(f.y))];
    const [sx, sy] = cam.project(map, f.x, f.y, (t?.h ?? 0) + f.h);
    const fade = Math.min(1, f.age / 0.12, (life - f.age) / 0.35);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.textAlign = 'center';
    if (f.speech) {
      // Balão de fala: fundo claro, texto escuro, rabicho apontando para a cabeça.
      const y = sy - 66 * z;
      ctx.font = `italic ${Math.round(12 * Math.max(0.9, z))}px Georgia, serif`;
      const w = Math.min(220, ctx.measureText(f.text).width + 16);
      const hgt = 20 * Math.max(0.9, z);
      ctx.fillStyle = 'rgba(244,236,218,0.95)';
      ctx.strokeStyle = 'rgba(60,40,20,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(sx - w / 2, y - hgt, w, hgt, 6);
      ctx.moveTo(sx - 5, y);
      ctx.lineTo(sx, y + 7 * z);
      ctx.lineTo(sx + 5, y);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a1a10';
      ctx.fillText(f.text, sx, y - hgt / 2 + 4 * z, w - 10);
    } else if (f.alert) {
      // "!" que salta e fica parado sobre a cabeça.
      const pop = f.age < 0.18 ? 1 + Math.sin((f.age / 0.18) * Math.PI) * 0.6 : 1;
      const size = Math.round(30 * Math.max(0.9, z) * pop);
      const y = sy - 62 * z;
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText('!', sx, y);
      ctx.fillStyle = '#ff3d3d';
      ctx.fillText('!', sx, y);
    } else if (f.notice) {
      const y = sy - 52 * z - Math.min(1, f.age / 0.4) * 14 * z - f.age * 6 * z;
      ctx.font = `bold ${Math.round(11 * Math.max(0.85, z))}px system-ui, sans-serif`;
      const w = ctx.measureText(f.text).width + 12;
      const hgt = 16 * Math.max(0.85, z);
      ctx.fillStyle = 'rgba(16,22,64,0.85)';
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(sx - w / 2, y - hgt + 4, w, hgt, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, y);
    } else {
      // Números saltam um pouco antes de subir (estilo SNES).
      const pop = f.age < 0.15 ? Math.sin((f.age / 0.15) * Math.PI) * 6 * z : 0;
      const y = sy - 40 * z - f.age * 30 - pop;
      ctx.font = `bold ${Math.round(14 * Math.max(0.8, z))}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, sx, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, y);
    }
    ctx.globalAlpha = 1;
  }
}

/** Intenção do próximo inimigo: arco tracejado vermelho até o alvo e anel pulsando nas casas atingidas. */
function drawIntent(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, it: Intent, z: number, time: number): void {
  const at = (x: number, y: number, lift: number): [number, number] => {
    const t = map.tiles[idx(map, x, y)];
    const [sx, sy] = cam.project(map, x, y, t?.h ?? 0);
    return [sx, sy - lift * z];
  };
  const [ax, ay] = at(it.from[0], it.from[1], 26);
  const [bx, by] = at(it.to[0], it.to[1], 14);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,60,60,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5 * z, 4 * z]);
  ctx.lineDashOffset = -time * 24;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 40 * z, bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of it.tiles) {
    const t = map.tiles[idx(map, x, y)];
    const [sx, sy] = cam.project(map, x, y, t?.h ?? 0);
    diamond(ctx, sx, sy, (TILE_W * z) / 2 * 0.8, (TILE_H * z) / 2 * 0.8);
    ctx.strokeStyle = `rgba(255,70,70,${0.55 + Math.sin(time * 6) * 0.35})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  label(ctx, `⚠ ${it.label}`, ax, ay - 14 * z, z, '#ff8a80');
  ctx.restore();
}

function drawFireLine(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, f: NonNullable<BattleDrawOptions['fireLine']>, z: number, time: number): void {
  const at = (x: number, y: number, lift: number): [number, number] => {
    const t = map.tiles[idx(map, x, y)];
    const [sx, sy] = cam.project(map, x, y, t?.h ?? 0);
    return [sx, sy - lift * z];
  };
  const [ax, ay] = at(f.from[0], f.from[1], 22);
  const [bx, by] = at(f.to[0], f.to[1], 16);
  ctx.save();
  ctx.setLineDash([6 * z, 4 * z]);
  ctx.lineDashOffset = -time * 30;
  ctx.lineWidth = 2.5;
  if (f.blocked) {
    // Até o obstáculo em branco, dali em diante em vermelho.
    const [cx, cy] = at(f.blocked[0], f.blocked[1], 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,70,70,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    const t = map.tiles[idx(map, f.blocked[0], f.blocked[1])];
    const [tx, ty] = cam.project(map, f.blocked[0], f.blocked[1], t?.h ?? 0);
    diamond(ctx, tx, ty, (TILE_W * z) / 2, (TILE_H * z) / 2);
    ctx.fillStyle = `rgba(255,40,40,${0.35 + Math.sin(time * 8) * 0.15})`;
    ctx.fill();
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `bold ${Math.round(16 * z)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText('✖', tx, ty - 24 * z);
    ctx.fillStyle = '#ff5252';
    ctx.fillText('✖', tx, ty - 24 * z);
    if (f.blockReason) label(ctx, f.blockReason, tx, ty - 40 * z, z, '#ff8a80');
  } else {
    // Fora de alcance: linha laranja inteira; livre: amarela.
    ctx.strokeStyle = f.outOfRange ? 'rgba(255,152,0,0.9)' : 'rgba(255,245,180,0.9)';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (f.outOfRange) label(ctx, 'FORA DE ALCANCE', bx, by - 26 * z, z, '#ffb74d');
  ctx.restore();
}

const OBJECTIVE_ICON: Record<string, string> = { cela: '🔒', bau: '📦', documentos: '📜', runas: '🜏' };

/** Marcador de objetivo: ícone pulsando e progresso; concluído fica verde. */
function drawObjective(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, ob: NonNullable<BattleDrawOptions['objectives']>[number], z: number, time: number): void {
  const t = map.tiles[idx(map, ob.x, ob.y)];
  const [sx, sy] = cam.project(map, ob.x, ob.y, t?.h ?? 0);
  ctx.save();
  diamond(ctx, sx, sy, (TILE_W * z) / 2, (TILE_H * z) / 2);
  ctx.strokeStyle = ob.done ? '#81c784' : `rgba(255,224,130,${0.6 + Math.sin(time * 4) * 0.3})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.font = `${Math.round(16 * z)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(ob.done ? '✔' : OBJECTIVE_ICON[ob.kind] ?? '❖', sx, sy - 30 * z + Math.sin(time * 3) * 2 * z);
  if (!ob.done && ob.turns > 1) label(ctx, `${ob.progress}/${ob.turns}`, sx, sy - 44 * z, z, '#fff59d');
  ctx.restore();
}

/** Aviso de ataque de oportunidade sobre uma casa do caminho (estilo Baldur's Gate). */
function drawThreat(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, x: number, y: number, z: number, time: number): void {
  const t = map.tiles[idx(map, x, y)];
  const [sx, sy] = cam.project(map, x, y, t?.h ?? 0);
  ctx.save();
  diamond(ctx, sx, sy, (TILE_W * z) / 2, (TILE_H * z) / 2);
  ctx.fillStyle = `rgba(255,50,50,${0.28 + Math.sin(time * 7) * 0.1})`;
  ctx.fill();
  ctx.strokeStyle = '#ff5252';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `bold ${Math.round(15 * z)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeText('⚔!', sx, sy - 26 * z);
  ctx.fillStyle = '#ff5252';
  ctx.fillText('⚔!', sx, sy - 26 * z);
  ctx.restore();
}

/** Etiqueta de texto com contorno (motivos da linha de tiro). */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, z: number, color: string): void {
  ctx.font = `bold ${Math.round(10 * Math.max(1, z))}px system-ui`;
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 8;
  const hgt = 14 * Math.max(1, z);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - w / 2, y - hgt + 3, w, hgt);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawCoverMark(ctx: CanvasRenderingContext2D, cam: IsoCamera, map: BattleMap, c: CoverMark, z: number): void {
  const t = map.tiles[idx(map, c.x, c.y)];
  if (!t) return;
  const [sx, sy] = cam.project(map, c.x + c.dx * 0.45, c.y + c.dy * 0.45, t.h);
  const y = sy - 14 * z;
  const w = 7 * z;
  const hgt = 9 * z;
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(sx - w, y - hgt);
    ctx.lineTo(sx + w, y - hgt);
    ctx.lineTo(sx + w, y);
    ctx.quadraticCurveTo(sx + w, y + hgt * 0.8, sx, y + hgt * 1.2);
    ctx.quadraticCurveTo(sx - w, y + hgt * 0.8, sx - w, y);
    ctx.closePath();
  };
  shield();
  ctx.fillStyle = 'rgba(10,20,50,0.8)';
  ctx.fill();
  ctx.save();
  shield();
  ctx.clip();
  ctx.fillStyle = '#4fc3f7';
  // Cobertura total: escudo cheio; parcial: só metade.
  if (c.level === 'full') ctx.fillRect(sx - w, y - hgt, w * 2, hgt * 2.4);
  else ctx.fillRect(sx - w, y - hgt, w, hgt * 2.4);
  ctx.restore();
  shield();
  ctx.strokeStyle = '#e1f5fe';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Número pseudoaleatório fixo por tile (a textura não "pisca" entre quadros). */
function tileHash(x: number, y: number, k: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Terra batida: pedrinhas claras, torrões escuros e uma rachadura. */
function drawDirt(ctx: CanvasRenderingContext2D, sx: number, sy: number, hw: number, hh: number, x: number, y: number): void {
  for (let k = 0; k < 7; k++) {
    // Ponto aleatório dentro do losango.
    const u = tileHash(x, y, k) * 1.6 - 0.8;
    const v = tileHash(x, y, k + 9) * 1.6 - 0.8;
    if (Math.abs(u) + Math.abs(v) > 0.85) continue;
    const px = sx + u * hw;
    const py = sy + v * hh;
    const r = 1 + tileHash(x, y, k + 21) * 1.6;
    ctx.fillStyle = k % 3 === 0 ? '#cdb48a' : k % 3 === 1 ? '#5e4528' : '#a88a5e';
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.4, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(60,40,20,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const cx = sx + (tileHash(x, y, 40) - 0.5) * hw * 0.6;
  ctx.moveTo(cx - hw * 0.25, sy - hh * 0.1);
  ctx.lineTo(cx, sy + hh * 0.05);
  ctx.lineTo(cx + hw * 0.2, sy - hh * 0.05);
  ctx.stroke();
}

/** Madeira: tábuas paralelas. */
function drawPlanks(ctx: CanvasRenderingContext2D, sx: number, sy: number, hw: number, hh: number): void {
  ctx.strokeStyle = 'rgba(60,35,15,0.5)';
  ctx.lineWidth = 1;
  for (let k = -2; k <= 2; k++) {
    const f = k / 3;
    ctx.beginPath();
    ctx.moveTo(sx + f * hw - hw * 0.5 * (1 - Math.abs(f)), sy - hh * 0.5 * (1 - Math.abs(f)) + f * hh * 0.5);
    ctx.lineTo(sx + f * hw + hw * 0.5 * (1 - Math.abs(f)), sy + hh * 0.5 * (1 - Math.abs(f)) + f * hh * 0.5);
    ctx.stroke();
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

/** Barra de resistência de uma cobertura já danificada. */
function drawPropHp(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number, z: number): void {
  const def = PROPS[t.p!];
  const w = 22 * z;
  const y = sy - (def.height * STEP_H + 14) * z;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, 3 * z + 2);
  ctx.fillStyle = '#bcaaa4';
  ctx.fillRect(sx - w / 2, y, (w * (t.pHp ?? def.hp)) / def.hp, 3 * z);
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
  const corpse = !u.alive && !!o.showDead?.(u);
  if (o.unitVisible && !o.unitVisible(u) && !corpse) return;
  const pos = o.displayPos?.get(u.uid) ?? [u.x, u.y];
  const tx = Math.round(pos[0]);
  const ty = Math.round(pos[1]);
  const tile = map.tiles[idx(map, tx, ty)];
  if (!tile) return;
  const [sx, sy] = cam.project(map, pos[0], pos[1], tile.h + (o.lift?.get(u.uid) ?? 0));
  const active = o.activeUid === u.uid;
  if (!corpse) {
    ctx.fillStyle = u.team === 'player' ? 'rgba(79,195,247,0.55)' : 'rgba(239,83,80,0.55)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 13 * z * u.look.size, 6 * z * u.look.size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!u.alive && !corpse) ctx.globalAlpha = 0.35;
  else if (u.hidden) ctx.globalAlpha = 0.5;
  const bob = active ? Math.sin(o.time * 6) * 1.5 * z : 0;
  const flip = !cam.screenFacingRight(map, u.facing);
  const spec = unitSpec(u);
  const img = spriteFor(spec);
  // A largura na tela depende do tamanho (tiles), não da resolução da pixel art.
  const scale = 2 * z * u.look.size * (16 / Math.max(16, img.width - 2));
  drawCanvas(ctx, poseFrame(u, o) ?? img, sx, sy + 2 * z + bob, scale, flip);
  ctx.globalAlpha = 1;
  if (!u.alive) return;
  const top = sy - Math.max(30 * z, img.height * scale - 2 * z) - 6 * z;
  const bw = 26 * z;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(sx - bw / 2, top, bw, 4 * z);
  ctx.fillStyle = u.team === 'player' ? '#66bb6a' : '#ef5350';
  ctx.fillRect(sx - bw / 2, top, (bw * u.hp) / u.maxHp, 4 * z);
  const fc = o.forecast?.get(u.uid);
  if (fc) {
    // Fatia que o golpe pode tirar: escura até o dano mínimo, piscando até o máximo.
    const after = (hp: number) => (bw * Math.max(0, hp)) / u.maxHp;
    const x0 = sx - bw / 2;
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.fillRect(x0 + after(u.hp - fc.min), top, after(u.hp) - after(u.hp - fc.min), 4 * z);
    ctx.fillStyle = `rgba(255,240,200,${0.35 + Math.sin(o.time * 7) * 0.25})`;
    ctx.fillRect(x0 + after(u.hp - fc.max), top, after(u.hp - fc.min) - after(u.hp - fc.max), 4 * z);
    const lethal = fc.min >= u.hp;
    const text = `${lethal ? '☠ ' : ''}${fc.chance}%`;
    label(ctx, text, sx, top - 8 * z, z, lethal ? '#ff5252' : '#ffe082');
  }
  // Barra de ação (ATB) sob os pés: amarela enchendo; brilha quando está pronto para agir.
  const g = Math.max(0, Math.min(100, u.gauge)) / 100;
  const ab = 30 * z;
  const ay = sy + 7 * z;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(sx - ab / 2 - 1, ay - 1, ab + 2, 5 * z + 2);
  const ready = g >= 0.999 || active;
  ctx.fillStyle = ready ? `rgba(255,253,231,${0.75 + Math.sin(o.time * 8) * 0.25})` : '#fbc02d';
  ctx.fillRect(sx - ab / 2, ay, ab * g, 5 * z);
  if (!ready && g > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(sx - ab / 2, ay, ab * g, 1.5 * z);
  }
  const react = o.reaction?.(u) ?? 'none';
  if (react !== 'none') {
    // Reação única: losango aceso enquanto disponível, apagado e riscado depois de gasta.
    const rx = sx + bw / 2 + 5 * z;
    const ry = top + 3 * z;
    const r = 3.5 * z;
    ctx.beginPath();
    ctx.moveTo(rx, ry - r);
    ctx.lineTo(rx + r, ry);
    ctx.lineTo(rx, ry + r);
    ctx.lineTo(rx - r, ry);
    ctx.closePath();
    ctx.fillStyle = react === 'ready' ? '#4dd0e1' : 'rgba(90,90,90,0.9)';
    ctx.fill();
    ctx.strokeStyle = react === 'ready' ? '#e0f7fa' : '#222';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (react === 'spent') {
      ctx.strokeStyle = '#ef5350';
      ctx.beginPath();
      ctx.moveTo(rx - r, ry + r);
      ctx.lineTo(rx + r, ry - r);
      ctx.stroke();
    }
  }
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
    art: u.look.art,
    outfit: u.look.outfit,
  };
}
