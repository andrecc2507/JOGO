import { DB } from '../data';
import { CITADEL_ID, WORLD_H, WORLD_W, worldGraph, type WorldNode } from '../world/layout';
import { squadPosition, type Campaign, type Squad } from '../world/campaign';
import { node } from '../world/layout';

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

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
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
  // Mar.
  const grad = ctx.createLinearGradient(0, 0, 0, cam.viewH);
  grad.addColorStop(0, '#0f2a44');
  grad.addColorStop(1, '#0a1c30');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);
  ctx.strokeStyle = 'rgba(120,170,220,0.12)';
  for (let k = 0; k < 40; k++) {
    const [wx, wy] = cam.toScreen(hash(k) * WORLD_W, hash(k + 99) * WORLD_H);
    const off = Math.sin(o.time + k) * 4;
    ctx.beginPath();
    ctx.moveTo(wx - 10 + off, wy);
    ctx.quadraticCurveTo(wx + off, wy - 4, wx + 10 + off, wy);
    ctx.stroke();
  }
  // Terra: bolhas por país + Citadela.
  const blobs: { x: number; y: number; r: number; color: string }[] = [];
  for (const n of Object.values(g.nodes)) {
    if (n.type === 'waypoint') continue;
    const country = n.countryId ? DB.countries.find((x) => x.id === n.countryId) : null;
    const r = n.type === 'citadel' ? 120 : n.type === 'capital' ? 105 : 70;
    blobs.push({ x: n.x, y: n.y, r, color: country?.color ?? '#7d735c' });
  }
  for (const n of Object.values(g.nodes)) if (n.type === 'waypoint') blobs.push({ x: n.x, y: n.y, r: 48, color: n.countryId ? DB.countries.find((x) => x.id === n.countryId)!.color : '#7d735c' });
  ctx.fillStyle = '#d8c79a';
  for (const b of blobs) {
    const [x, y] = cam.toScreen(b.x, b.y);
    ctx.beginPath();
    ctx.arc(x, y, (b.r + 10) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of blobs) {
    const [x, y] = cam.toScreen(b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(x, y, b.r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Decoração por bioma.
  for (const n of Object.values(g.nodes)) {
    if (n.type !== 'city' && n.type !== 'capital') continue;
    for (let k = 0; k < 7; k++) {
      const a = hash(n.x + k * 13) * Math.PI * 2;
      const r = 30 + hash(n.y + k * 7) * 45;
      const [x, y] = cam.toScreen(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r);
      drawBiomeMark(ctx, n, x, y, s);
    }
  }
  // Estradas.
  ctx.setLineDash([6 * s, 5 * s]);
  ctx.lineWidth = Math.max(1, 2.2 * s);
  ctx.strokeStyle = 'rgba(70,50,25,0.8)';
  for (const [a, b] of g.edges) {
    const na = g.nodes[a]!;
    const nb = g.nodes[b]!;
    const [x1, y1] = cam.toScreen(na.x, na.y);
    const [x2, y2] = cam.toScreen(nb.x, nb.y);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
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
  // Esquadrões.
  const stacked = new Map<string, number>();
  for (const sq of c.squads) drawSquad(ctx, cam, sq, sq.id === o.selectedSquad, o.time, stacked);
}

function drawBiomeMark(ctx: CanvasRenderingContext2D, n: WorldNode, x: number, y: number, s: number): void {
  const z = s * 1.2;
  switch (n.biome) {
    case 'floresta':
      ctx.fillStyle = '#244f22';
      ctx.beginPath();
      ctx.moveTo(x - 5 * z, y + 4 * z);
      ctx.lineTo(x, y - 8 * z);
      ctx.lineTo(x + 5 * z, y + 4 * z);
      ctx.fill();
      break;
    case 'neve':
      ctx.fillStyle = '#6d8ba3';
      ctx.beginPath();
      ctx.moveTo(x - 8 * z, y + 5 * z);
      ctx.lineTo(x, y - 9 * z);
      ctx.lineTo(x + 8 * z, y + 5 * z);
      ctx.fill();
      ctx.fillStyle = '#f4f8fb';
      ctx.beginPath();
      ctx.moveTo(x - 3 * z, y - 3 * z);
      ctx.lineTo(x, y - 9 * z);
      ctx.lineTo(x + 3 * z, y - 3 * z);
      ctx.fill();
      break;
    case 'costa':
      ctx.strokeStyle = '#bcd6e8';
      ctx.beginPath();
      ctx.arc(x, y, 4 * z, Math.PI, 0);
      ctx.stroke();
      break;
    case 'deserto':
      ctx.strokeStyle = '#8f6d34';
      ctx.beginPath();
      ctx.moveTo(x - 7 * z, y);
      ctx.quadraticCurveTo(x, y - 5 * z, x + 7 * z, y);
      ctx.stroke();
      break;
    case 'planicie':
      ctx.strokeStyle = '#5f7a2c';
      ctx.beginPath();
      ctx.moveTo(x - 2 * z, y);
      ctx.lineTo(x - 3 * z, y - 5 * z);
      ctx.moveTo(x + 2 * z, y);
      ctx.lineTo(x + 3 * z, y - 5 * z);
      ctx.stroke();
      break;
  }
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
  ctx.font = `${n.type === 'city' ? 'normal' : 'bold'} ${Math.round((n.type === 'city' ? 9 : 11) * Math.max(0.9, cam.scale * 1.4))}px 'Trebuchet MS', sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  const label = n.id === CITADEL_ID ? 'Citadela Real' : n.name;
  ctx.strokeText(label, x, y + 20 * s);
  ctx.fillStyle = n.type === 'city' ? '#e8e0cc' : '#ffe9b0';
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
  ctx.fillStyle = '#2a1d12';
  ctx.fillRect(x - 1, y - 20 + bob, 2, 22);
  ctx.fillStyle = sq.color;
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 20 + bob);
  ctx.lineTo(x + 14, y - 15 + bob);
  ctx.lineTo(x + 1, y - 10 + bob);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (sq.resting) {
    ctx.font = '11px system-ui';
    ctx.fillText('💤', x + 12, y - 22);
  }
}

export function squadScreenPos(cam: WorldCamera, sq: Squad): [number, number] {
  const p = squadPosition(sq);
  const [x, y] = cam.toScreen(p.x, p.y);
  return [x + 5, y - 25];
}
