import { DB } from '../data';
import { CITADEL_ID, WORLD_H, WORLD_W, worldGraph, type WorldNode } from '../world/layout';
import { allContracts, squadPosition, type Campaign, type Squad } from '../world/campaign';
import { node } from '../world/layout';
import { worldAtlas } from './world_atlas';

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
  for (const n of Object.values(g.nodes)) drawNode(ctx, cam, n, c, o);
  // Contratos aceitos: pergaminho pulsando sobre o local da missão.
  const marked = new Set<string>();
  for (const ct of allContracts(c)) {
    if (ct.status !== 'accepted' || marked.has(ct.targetNode)) continue;
    marked.add(ct.targetNode);
    const n = g.nodes[ct.targetNode];
    if (n) drawContractMark(ctx, cam, n, o.time);
  }
  // Itens de esquadrões dizimados, com as horas que faltam para sumirem.
  for (const cache of c.lostCaches ?? []) {
    const n = g.nodes[cache.nodeId];
    if (n) drawLostCache(ctx, cam, n, Math.max(0, Math.ceil(cache.expiresAt - c.hours)), o.time);
  }
  // Esquadrões.
  const stacked = new Map<string, number>();
  for (const sq of c.squads) drawSquad(ctx, cam, sq, sq.id === o.selectedSquad, o.time, stacked);
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
  if (n.type === 'city') {
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
