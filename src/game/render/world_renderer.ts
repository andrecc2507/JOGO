import { OUTPOST_KINDS } from '../world/outposts';
import { caravanPosition } from '../world/act_void';
import { DB } from '../data';
import { CITADEL_ID, WORLD_H, WORLD_W, worldGraph, type WorldNode } from '../world/layout';
import { allContracts, squadPosition, type Campaign, type Squad } from '../world/campaign';
import { node } from '../world/layout';
import { worldAtlas } from './world_atlas';
import { WORLDS, availableMissions, ensureStory, fallenCapitals, missionNode, placeOpen, worldOpen } from '../world/story';
import { provinceOf, provinces } from '../world/provinces';
import { OWNER_COLOR, ensureWorld, infoAge, STALE_HOURS } from '../world/territory';
import { forceIcon, forcePosition, forceVisible, type Force } from '../world/forces';

/** O local aparece no mapa? (aberto neste capítulo e na província conhecida) */
export function nodeVisible(c: Campaign, n: WorldNode): boolean {
  if (!placeOpen(c, n)) return false;
  return !!ensureWorld(c).provinces[provinceOf(n.id)]?.known;
}

export class WorldCamera {
  zoom = 1;
  panX = 0;
  panY = 0;
  constructor(
    public viewW: number,
    public viewH: number,
  ) {}
  get scale(): number {
    return Math.min(this.viewW / WORLD_W, this.viewH / WORLD_H) * 1.02 * this.zoom;
  }
  toScreen(x: number, y: number): [number, number] {
    const s = this.scale;
    return [(x - WORLD_W / 2) * s + this.viewW / 2 + this.panX, (y - WORLD_H / 2) * s + this.viewH / 2 + this.panY];
  }
  toWorld(sx: number, sy: number): [number, number] {
    const s = this.scale;
    return [(sx - this.viewW / 2 - this.panX) / s + WORLD_W / 2, (sy - this.viewH / 2 - this.panY) / s + WORLD_H / 2];
  }
}

export interface WorldDrawOptions {
  selectedSquad: string | null;
  selectedNode: string | null;
  hoverNode: string | null;
  time: number;
}

export function drawWorld(ctx: CanvasRenderingContext2D, cam: WorldCamera, c: Campaign, o: WorldDrawOptions): void {
  const g = worldGraph();
  const s = cam.scale;
  // Fundo fora do pergaminho e o atlas (pergaminho, costa, biomas, estradas, nomes).
  ctx.fillStyle = '#060405';
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);
  const [ax, ay] = cam.toScreen(0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(worldAtlas(), ax, ay, WORLD_W * s, WORLD_H * s);
  ctx.imageSmoothingEnabled = smooth;
  drawFog(ctx, cam, o.time);
  drawProvinces(ctx, cam, c, o.time);
  drawParallelWorlds(ctx, cam, c, o.time);
  // Rotas dos esquadrões.
  for (const sq of c.squads) {
    if (!sq.to) continue;
    const pts = [squadPosition(sq), node(sq.to), ...sq.route.map((id) => node(id))];
    ctx.strokeStyle = sq.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = cam.toScreen(p.x, p.y);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Nós.
  for (const n of Object.values(g.nodes)) if (nodeVisible(c, n)) drawNode(ctx, cam, n, c, o);
  // Contratos aceitos: pergaminho pulsando sobre o local da missão.
  const marked = new Set<string>();
  for (const ct of allContracts(c)) {
    if (ct.status !== 'accepted' || marked.has(ct.targetNode)) continue;
    marked.add(ct.targetNode);
    const n = g.nodes[ct.targetNode];
    if (n) drawContractMark(ctx, cam, n, o.time);
  }
  // Capitais caídas (escolha do Ato 4): brasas e fumaça sobre as ruínas.
  for (const id of fallenCapitals(c)) {
    const n = g.nodes[id];
    if (n) drawRuin(ctx, cam, n, o.time);
  }
  // Missões da história: losango dourado com "!" (nova) ou "…" (briefing já lido).
  const story = ensureStory(c);
  const storyMarked = new Set<string>();
  for (const m of availableMissions(c)) {
    const id = missionNode(c, m);
    if (storyMarked.has(id)) continue;
    storyMarked.add(id);
    const n = g.nodes[id];
    if (n) drawStoryMark(ctx, cam, n, o.time, story.seen.includes(m.id), marked.has(id), !!m.personal);
  }
  // Itens de esquadrões dizimados, com as horas que faltam para sumirem.
  for (const cache of c.lostCaches ?? []) {
    const n = g.nodes[cache.nodeId];
    if (n) drawLostCache(ctx, cam, n, Math.max(0, Math.ceil(cache.expiresAt - c.hours)), o.time);
  }
  // Postos avançados, acampamento de expedição, portais e caravana (F4/F5).
  for (const [id, k] of Object.entries(c.outposts ?? {})) {
    const n = g.nodes[id];
    if (n) drawMarker(ctx, cam, n.x + 12, n.y - 10, OUTPOST_KINDS[k].icon, '#81c784');
  }
  if (c.acts?.camp && g.nodes[c.acts.camp]) drawMarker(ctx, cam, g.nodes[c.acts.camp]!.x - 12, g.nodes[c.acts.camp]!.y - 10, '⛺', '#ffd54f');
  for (const p of c.acts?.portals ?? []) {
    const n = g.nodes[p.at];
    if (n) drawMarker(ctx, cam, n.x, n.y - 24, '🌀', '#ce93d8', `${Math.min(100, Math.round(p.maturity))}%`);
  }
  const cv = caravanPosition(c);
  if (cv) drawMarker(ctx, cam, cv.x, cv.y - 14, '🛒', '#ffb74d', String(c.acts!.caravan!.survivors));
  // Forças inimigas avistadas (C11): ícone na cor do dono e o rumo tracejado até o alvo.
  for (const f of c.world?.forces ?? []) if (forceVisible(c, f)) drawForce(ctx, cam, f, o.time);
  // Esquadrões.
  const stacked = new Map<string, number>();
  for (const sq of c.squads) drawSquad(ctx, cam, sq, sq.id === o.selectedSquad, o.time, stacked);
  drawMinimap(ctx, cam, c);
}

/** Marcador simples no mapa: ícone num círculo, com um texto pequeno embaixo. */
function drawMarker(ctx: CanvasRenderingContext2D, cam: WorldCamera, wx: number, wy: number, icon: string, color: string, label?: string): void {
  const [x, y] = cam.toScreen(wx, wy);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y + 1);
  if (label) {
    ctx.font = '9px system-ui';
    ctx.fillStyle = color;
    ctx.fillText(label, x, y + 16);
  }
  ctx.restore();
}

function drawForce(ctx: CanvasRenderingContext2D, cam: WorldCamera, f: Force, time: number): void {
  const p = forcePosition(f);
  const [x, y] = cam.toScreen(p.x, p.y);
  const [tx, ty] = cam.toScreen(node(f.target).x, node(f.target).y);
  const col = OWNER_COLOR[f.owner];
  ctx.save();
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const r = 9 + Math.sin(time * 4) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(x, y - 14, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(forceIcon(f), x, y - 10);
  ctx.restore();
}

/** Minimapa no canto inferior direito: mundo inteiro, esquadrões e o retângulo da câmera. */
const MINI = { w: 150, h: 100, pad: 10 };
function miniRect(cam: WorldCamera): { x: number; y: number; w: number; h: number } {
  return { x: cam.viewW - MINI.w - MINI.pad, y: cam.viewH - MINI.h - MINI.pad - 40, w: MINI.w, h: MINI.h };
}

function drawMinimap(ctx: CanvasRenderingContext2D, cam: WorldCamera, c: Campaign): void {
  const r = miniRect(cam);
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#0b0806';
  ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.drawImage(worldAtlas(), r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  const k = r.w / WORLD_W;
  // Névoa das províncias desconhecidas.
  const w = ensureWorld(c);
  const chapter = ensureStory(c).chapter;
  for (const p of provinces()) {
    const st = w.provinces[p.id];
    if (st?.known && placeOpen(c, p.center)) continue;
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    ctx.beginPath();
    p.polygon.forEach(([px, py], i) => (i ? ctx.lineTo(r.x + px * k, r.y + py * k) : ctx.moveTo(r.x + px * k, r.y + py * k)));
    ctx.closePath();
    ctx.fill();
  }
  for (const sq of c.squads) {
    const p = squadPosition(sq);
    ctx.fillStyle = sq.color;
    ctx.fillRect(r.x + p.x * k - 2, r.y + p.y * k - 2, 4, 4);
  }
  // Retângulo da câmera.
  const [ax, ay] = cam.toWorld(0, 0);
  const [bx, by] = cam.toWorld(cam.viewW, cam.viewH);
  ctx.strokeStyle = '#ffe082';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + ax * k, r.y + ay * k, (bx - ax) * k, (by - ay) * k);
  ctx.strokeStyle = '#3a2a1a';
  ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.restore();
}

/** Clique no minimapa: ponto do mundo correspondente (ou null se fora). */
export function minimapHit(cam: WorldCamera, sx: number, sy: number): { x: number; y: number } | null {
  const r = miniRect(cam);
  if (sx < r.x || sy < r.y || sx > r.x + r.w || sy > r.y + r.h) return null;
  return { x: ((sx - r.x) / r.w) * WORLD_W, y: ((sy - r.y) / r.h) * WORLD_H };
}

/** Marcador de itens perdidos: saco com contagem regressiva. */
function drawLostCache(ctx: CanvasRenderingContext2D, cam: WorldCamera, n: WorldNode, hoursLeft: number, time: number): void {
  const [x, y0] = cam.toScreen(n.x, n.y);
  const s = Math.max(0.8, cam.scale * 1.3);
  const y = y0 - (n.type === 'waypoint' ? 14 : 26) * s + Math.sin(time * 4) * 1.5 * s;
  const urgent = hoursLeft <= 24;
  ctx.fillStyle = urgent ? `rgba(255,82,82,${0.35 + Math.sin(time * 6) * 0.2})` : 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x, y, 11 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${Math.round(15 * s)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('🎒', x, y + 5 * s);
  ctx.font = `bold ${Math.round(9 * Math.max(1, s))}px system-ui`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  const label = hoursLeft >= 24 ? `${Math.floor(hoursLeft / 24)}d ${hoursLeft % 24}h` : `${hoursLeft}h`;
  ctx.strokeText(label, x, y + 18 * s);
  ctx.fillStyle = urgent ? '#ff8a80' : '#ffe082';
  ctx.fillText(label, x, y + 18 * s);
}

/** Ruína de capital caída: brilho de brasa pulsando e fumaça subindo. */
function drawRuin(ctx: CanvasRenderingContext2D, cam: WorldCamera, n: WorldNode, time: number): void {
  const [x, y] = cam.toScreen(n.x, n.y);
  const s = Math.max(0.8, cam.scale * 1.3);
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 30 * s);
  glow.addColorStop(0, `rgba(255,90,30,${0.55 + Math.sin(time * 3) * 0.15})`);
  glow.addColorStop(1, 'rgba(60,10,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 30 * s, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const t = (time * 0.4 + i / 4) % 1;
    ctx.fillStyle = `rgba(40,30,30,${0.5 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 6 + i) * 6 * s, y - t * 40 * s, (5 + t * 10) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Marcador de missão da história: losango dourado com "!" (nova) ou "…" (já lida), anel pulsando. */
function drawStoryMark(ctx: CanvasRenderingContext2D, cam: WorldCamera, n: WorldNode, time: number, seen: boolean, shifted: boolean, personal = false): void {
  const [x0, y0] = cam.toScreen(n.x, n.y);
  const s = Math.max(0.8, cam.scale * 1.3);
  const x = x0 + (shifted ? 18 * s : 0);
  const pulse = (time * 0.6) % 1;
  ctx.strokeStyle = `rgba(255,193,7,${0.9 * (1 - pulse)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x0, y0, (12 + pulse * 22) * s, 0, Math.PI * 2);
  ctx.stroke();
  const y = y0 - (n.type === 'waypoint' ? 18 : 34) * s + Math.sin(time * 2.5) * 2.5 * s;
  const r = 10 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(x + 2, y - r + 2);
  ctx.lineTo(x + r + 2, y + 2);
  ctx.lineTo(x + 2, y + r + 2);
  ctx.lineTo(x - r + 2, y + 2);
  ctx.fill();
  const grad = ctx.createLinearGradient(x, y - r, x, y + r);
  grad.addColorStop(0, '#ffe082');
  grad.addColorStop(1, '#c48a12');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a2508';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#2a1606';
  ctx.font = `bold ${Math.round(13 * s)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(personal ? '★' : seen ? '…' : '!', x, y + 4.5 * s);
}

/** Ícone de contrato (pergaminho com lacre) sobre o local da missão, com um anel pulsando. */
function drawContractMark(ctx: CanvasRenderingContext2D, cam: WorldCamera, n: WorldNode, time: number): void {
  const [x, y0] = cam.toScreen(n.x, n.y);
  const s = Math.max(0.8, cam.scale * 1.3);
  const pulse = (time * 0.8) % 1;
  ctx.strokeStyle = `rgba(255,213,79,${0.8 * (1 - pulse)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y0, (10 + pulse * 18) * s, 0, Math.PI * 2);
  ctx.stroke();
  const y = y0 - (n.type === 'waypoint' ? 16 : 30) * s + Math.sin(time * 3) * 2 * s;
  const w = 14 * s;
  const hgt = 16 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - w / 2 + 2, y - hgt / 2 + 2, w, hgt);
  ctx.fillStyle = '#f3e3b8';
  ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
  ctx.fillStyle = '#d9c38c';
  ctx.fillRect(x - w / 2 - 2 * s, y - hgt / 2 - 2 * s, w + 4 * s, 4 * s);
  ctx.fillRect(x - w / 2 - 2 * s, y + hgt / 2 - 2 * s, w + 4 * s, 4 * s);
  ctx.fillStyle = '#7a5a30';
  for (let k = 0; k < 3; k++) ctx.fillRect(x - w / 2 + 3 * s, y - hgt / 2 + (4 + k * 3.5) * s, w - 6 * s, 1.2 * s);
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.arc(x + w / 2 - 3 * s, y + hgt / 2 - 4 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a1d12';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2, y - hgt / 2, w, hgt);
}

function drawNode(ctx: CanvasRenderingContext2D, cam: WorldCamera, n: WorldNode, c: Campaign, o: WorldDrawOptions): void {
  const [x, y] = cam.toScreen(n.x, n.y);
  const s = Math.max(0.7, cam.scale * 1.3);
  const hl = o.selectedNode === n.id || o.hoverNode === n.id;
  if (hl) {
    ctx.strokeStyle = o.selectedNode === n.id ? '#ffe082' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, (n.type === 'waypoint' ? 8 : 18) * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  const country = n.countryId ? DB.countries.find((cc) => cc.id === n.countryId) : null;
  if (n.type === 'waypoint') {
    ctx.fillStyle = '#3b2c18';
    ctx.beginPath();
    ctx.arc(x, y, 3.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8d8a8';
    ctx.beginPath();
    ctx.arc(x, y, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (n.type === 'village' || n.type === 'lair' || n.type === 'dungeon') {
    ctx.font = `${Math.round(16 * s)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(n.type === 'village' ? '🏕' : n.type === 'lair' ? '🦴' : '⛓', x + 1, y + 6 * s + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(n.type === 'village' ? '🏕' : n.type === 'lair' ? '🦴' : '⛓', x, y + 6 * s);
  } else if (n.type === 'city') {
    ctx.fillStyle = '#e9dcc0';
    ctx.fillRect(x - 6 * s, y - 4 * s, 12 * s, 9 * s);
    ctx.fillStyle = '#8a3b2a';
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 3 * s);
    ctx.lineTo(x, y - 10 * s);
    ctx.lineTo(x + 8 * s, y - 3 * s);
    ctx.fill();
    ctx.strokeStyle = '#2a1d12';
    ctx.strokeRect(x - 6 * s, y - 4 * s, 12 * s, 9 * s);
  } else {
    const big = n.type === 'citadel' ? 1.5 : 1;
    const w = 20 * s * big;
    const hgt = 14 * s * big;
    ctx.fillStyle = n.type === 'citadel' ? '#cfc6b0' : '#ddd3bd';
    ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
    for (let k = 0; k < 4; k++) ctx.fillRect(x - w / 2 + (k * w) / 3.5, y - hgt / 2 - 4 * s * big, w / 7, 4 * s * big);
    ctx.fillStyle = '#3a2c1c';
    ctx.fillRect(x - 3 * s * big, y, 6 * s * big, hgt / 2);
    ctx.strokeStyle = '#2a1d12';
    ctx.strokeRect(x - w / 2, y - hgt / 2, w, hgt);
    ctx.fillStyle = country?.color ?? '#b71c1c';
    ctx.fillRect(x + w / 2 - 2, y - hgt / 2 - 16 * s * big, 10 * s, 6 * s);
    ctx.fillStyle = '#2a1d12';
    ctx.fillRect(x + w / 2 - 3, y - hgt / 2 - 16 * s * big, 1.5, 14 * s * big);
  }
  if (n.id === c.baseNode) {
    ctx.fillStyle = '#ffd54f';
    ctx.font = `${Math.round(14 * s)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('★', x - 16 * s, y - 10 * s);
  }
  ctx.font = `${n.type === 'city' ? 'italic' : 'bold'} ${Math.round((n.type === 'city' ? 10 : 12) * Math.max(0.9, cam.scale * 1.4))}px Georgia, 'Palatino Linotype', serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,5,4,0.9)';
  const label = n.id === CITADEL_ID ? 'Citadela Real' : n.name;
  ctx.strokeText(label, x, y + 20 * s);
  ctx.fillStyle = n.type === 'city' ? '#cdbb98' : '#e8c98a';
  ctx.fillText(label, x, y + 20 * s);
}

function drawSquad(ctx: CanvasRenderingContext2D, cam: WorldCamera, sq: Squad, selected: boolean, time: number, stacked: Map<string, number>): void {
  const p = squadPosition(sq);
  const key = sq.to ? `${sq.id}` : sq.at;
  const k = stacked.get(key) ?? 0;
  stacked.set(key, k + 1);
  const [x0, y0] = cam.toScreen(p.x, p.y);
  const x = x0 + k * 12;
  const y = y0 - 10;
  const bob = sq.to ? Math.sin(time * 8) * 1.5 : 0;
  if (selected) {
    ctx.strokeStyle = '#fff59d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 4, y + bob - 8, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Mastro e estandarte (cor do esquadrão, com o emblema escolhido).
  ctx.fillStyle = '#2a1d12';
  ctx.fillRect(x - 1, y - 24 + bob, 2, 26);
  const fw = sq.icon ? 18 : 14;
  const fh = sq.icon ? 14 : 10;
  ctx.fillStyle = sq.color;
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 24 + bob);
  ctx.lineTo(x + 1 + fw, y - 24 + bob);
  ctx.lineTo(x + 1 + fw - 4, y - 24 + fh / 2 + bob);
  ctx.lineTo(x + 1 + fw, y - 24 + fh + bob);
  ctx.lineTo(x + 1, y - 24 + fh + bob);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (sq.icon) {
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1208';
    ctx.fillText(sq.icon, x + 8, y - 24 + fh - 3 + bob);
  }
  if (sq.escort?.length) {
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(`+${sq.escort.length}`, x + 4, y + 9);
    ctx.fillText(`+${sq.escort.length}`, x + 4, y + 9);
  }
  if (sq.resting) {
    ctx.font = '11px system-ui';
    ctx.fillText('💤', x + 12, y - 22);
  }
}

/**
 * Províncias (C1/C8/C10): tinta leve da cor do dono e fronteira; as desconhecidas ficam sob névoa
 * de pergaminho com "?"; as de informação velha, um véu mais leve.
 */
/**
 * Mundos paralelos abertos pelo portal do palácio: um véu da cor do mundo atrás dos locais, as
 * estradas de lá e o círculo do portal pulsando (na Citadela e na entrada de cada mundo).
 */
function drawParallelWorlds(ctx: CanvasRenderingContext2D, cam: WorldCamera, c: Campaign, time: number): void {
  const g = worldGraph();
  const open = Object.keys(WORLDS).filter((w) => worldOpen(c, w));
  if (!open.length) return;
  const s = cam.scale;
  ctx.save();
  for (const w of open) {
    const ns = Object.values(g.nodes).filter((n) => n.world === w && n.type !== 'waypoint');
    const cx = ns.reduce((a, n) => a + n.x, 0) / ns.length;
    const cy = ns.reduce((a, n) => a + n.y, 0) / ns.length;
    const r = Math.max(...ns.map((n) => Math.hypot(n.x - cx, n.y - cy))) + 90;
    const [sx, sy] = cam.toScreen(cx, cy);
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * s);
    grad.addColorStop(0, `${WORLDS[w]!.color}55`);
    grad.addColorStop(1, `${WORLDS[w]!.color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold ${Math.round(Math.max(11, 20 * s))}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WORLDS[w]!.color;
    ctx.fillText(`🌀 ${WORLDS[w]!.short}`, sx, sy - (r - 30) * s);
  }
  // Estradas dentro dos mundos (o atlas não as desenha).
  ctx.setLineDash([5, 3.5]);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(200,230,200,0.75)';
  for (const [a, b] of g.edges) {
    const na = g.nodes[a]!;
    const nb = g.nodes[b]!;
    if (!na.world || !nb.world || !open.includes(na.world)) continue;
    const [x1, y1] = cam.toScreen(na.x, na.y);
    const [x2, y2] = cam.toScreen(nb.x, nb.y);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Círculos do portal: na Citadela e na entrada de cada mundo aberto.
  const pulse = 1 + Math.sin(time * 3) * 0.15;
  for (const n of [g.nodes[CITADEL_ID]!, ...Object.values(g.nodes).filter((n) => n.portal && open.includes(n.world ?? ''))]) {
    const [x, y] = cam.toScreen(n.x, n.y);
    ctx.strokeStyle = 'rgba(186,104,200,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22 * s * pulse + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProvinces(ctx: CanvasRenderingContext2D, cam: WorldCamera, c: Campaign, time: number): void {
  const w = ensureWorld(c);
  const chapter = ensureStory(c).chapter;
  ctx.save();
  for (const p of provinces()) {
    const st = w.provinces[p.id];
    if (!st) continue;
    const path = () => {
      ctx.beginPath();
      p.polygon.forEach(([px, py], i) => {
        const [x, y] = cam.toScreen(px, py);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
    };
    path();
    const open = placeOpen(c, p.center);
    if (!open || !st.known) {
      ctx.fillStyle = open ? 'rgba(28,22,16,0.78)' : 'rgba(12,10,9,0.92)';
      ctx.fill();
      if (open) {
        const [x, y] = cam.toScreen(p.center.x, p.center.y);
        ctx.font = `bold ${Math.round(Math.max(12, 26 * cam.scale))}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(200,180,140,${0.35 + Math.sin(time * 1.5 + p.center.x) * 0.1})`;
        ctx.fillText('?', x, y + 8);
      }
      continue;
    }
    const col = OWNER_COLOR[st.owner];
    ctx.globalAlpha = st.owner === 'livre' ? 0.05 : 0.12;
    ctx.fillStyle = col;
    ctx.fill();
    // Informação velha: véu cinzento.
    if (infoAge(c, p.id) > STALE_HOURS) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#20180f';
      ctx.fill();
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Medo alto: brasa pulsando no centro.
    if (st.fear >= 60) {
      const [x, y] = cam.toScreen(p.center.x, p.center.y);
      const r = (14 + (st.fear - 60) * 0.4) * Math.max(0.6, cam.scale * 1.3);
      const gl = ctx.createRadialGradient(x, y, 1, x, y, r);
      gl.addColorStop(0, `rgba(229,57,53,${0.25 + Math.sin(time * 3) * 0.1})`);
      gl.addColorStop(1, 'rgba(229,57,53,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

/** Névoa que corre devagar sobre o mapa e uma vinheta na tela: clima sombrio. */
function drawFog(ctx: CanvasRenderingContext2D, cam: WorldCamera, t: number): void {
  ctx.save();
  for (let k = 0; k < 9; k++) {
    const sx = Math.sin(k * 12.9898) * 43758.5453;
    const r1 = sx - Math.floor(sx);
    const wx = ((r1 * WORLD_W + t * (6 + r1 * 8)) % (WORLD_W + 400)) - 200;
    const wy = (Math.sin(k * 7.1) * 0.5 + 0.5) * WORLD_H;
    const [x, y] = cam.toScreen(wx, wy);
    const rad = (160 + r1 * 140) * cam.scale;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(70,72,78,0.16)');
    g.addColorStop(1, 'rgba(70,72,78,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const vig = ctx.createRadialGradient(cam.viewW / 2, cam.viewH / 2, cam.viewH * 0.3, cam.viewW / 2, cam.viewH / 2, cam.viewW * 0.65);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);
  ctx.restore();
}

export function squadScreenPos(cam: WorldCamera, sq: Squad): [number, number] {
  const p = squadPosition(sq);
  const [x, y] = cam.toScreen(p.x, p.y);
  return [x + 5, y - 25];
}
