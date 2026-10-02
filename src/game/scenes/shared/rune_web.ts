import type { TreeNode, TreeSkill } from '../../data';
import { skillIcon } from './skill_icons';
import { SKILL_MAX_RANK, chainOf, unlockSkillOf } from '../../rules/skill_tree';
import { webLayout, type SkillDotState, type WebOptions, type WebPoint } from './skill_web';

/**
 * Teia em estilo de "página de runas" (inspirada nas runas do LoL antigo) com o traço de mapa de
 * fantasia: fundo azul-noite, anéis de astrolábio e rosa dos ventos em nanquim dourado, cada
 * habilidade como um engaste com aro de metal, glifo do tipo e marcas de nível. Usa o mesmo
 * layout da teia comum (`webLayout`), só muda o desenho.
 */

const NS = 'http://www.w3.org/2000/svg';
const STEP = 31;
const R0 = 58;
const SOCKET = 11;

/** Cor de cada tipo de teia (evolução, híbrida, ramo) — brilho das runas aprendidas. */
const TYPE_COLOR: Record<TreeNode['type'], string> = { base: '#ffd54f', evolucao: '#4fc3f7', hibrida: '#d59cf0', ramo: '#9be29f' };


function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

function hash(n: number): number {
  const x = Math.sin(n * 91.7) * 43758.5453;
  return x - Math.floor(x);
}

function defs(): SVGDefsElement {
  const d = el('defs', {});
  d.append(
    el('linearGradient', { id: 'rw-gold', x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: '0%', 'stop-color': '#fff1c1' }),
      el('stop', { offset: '45%', 'stop-color': '#d9b25a' }),
      el('stop', { offset: '100%', 'stop-color': '#6b4f1d' }),
    ),
    el('radialGradient', { id: 'rw-socket', cx: '50%', cy: '40%', r: '60%' },
      el('stop', { offset: '0%', 'stop-color': '#1d2645' }),
      el('stop', { offset: '100%', 'stop-color': '#060912' }),
    ),
    el('radialGradient', { id: 'rw-core', cx: '50%', cy: '45%', r: '60%' },
      el('stop', { offset: '0%', 'stop-color': '#3a2c10' }),
      el('stop', { offset: '100%', 'stop-color': '#0b0a12' }),
    ),
    el('filter', { id: 'rw-glow', x: '-60%', y: '-60%', width: '220%', height: '220%' },
      el('feGaussianBlur', { stdDeviation: 2.6, result: 'b' }),
      el('feMerge', {}, el('feMergeNode', { in: 'b' }), el('feMergeNode', { in: 'SourceGraphic' })),
    ),
  );
  for (const [type, color] of Object.entries(TYPE_COLOR))
    d.append(
      el('radialGradient', { id: `rw-lit-${type}`, cx: '50%', cy: '40%', r: '65%' },
        el('stop', { offset: '0%', 'stop-color': '#ffffff' }),
        el('stop', { offset: '35%', 'stop-color': color }),
        el('stop', { offset: '100%', 'stop-color': '#0a0f1f' }),
      ),
    );
  return d;
}

/** Fundo: estrelas, anéis de astrolábio, raios das teias e a rosa dos ventos do centro. */
function backdrop(o: WebOptions, rings: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): SVGGElement {
  const g = el('g', { 'pointer-events': 'none' });
  const w = bounds.maxX - bounds.minX;
  const hh = bounds.maxY - bounds.minY;
  for (let k = 0; k < 140; k++) {
    const x = bounds.minX + hash(k) * w;
    const y = bounds.minY + hash(k + 500) * hh;
    g.append(el('circle', { cx: x, cy: y, r: 0.3 + hash(k + 900) * 0.9, fill: '#cfd8ff', opacity: 0.15 + hash(k + 77) * 0.35 }));
  }
  for (let k = 0; k <= rings; k++) {
    const r = R0 + STEP * k;
    g.append(el('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: '#c9a14a', 'stroke-width': k % 3 === 0 ? 0.8 : 0.4, opacity: k % 3 === 0 ? 0.22 : 0.12, 'stroke-dasharray': k % 2 ? '2 5' : '' }));
  }
  const outer = R0 + STEP * rings + 10;
  g.append(el('circle', { cx: 0, cy: 0, r: outer, fill: 'none', stroke: '#c9a14a', 'stroke-width': 1.2, opacity: 0.25 }));
  g.append(el('circle', { cx: 0, cy: 0, r: outer + 5, fill: 'none', stroke: '#c9a14a', 'stroke-width': 0.5, opacity: 0.2 }));
  // Marcas de grau no anel externo, como num astrolábio.
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const r1 = outer + (k % 6 === 0 ? -6 : -3);
    g.append(el('line', { x1: Math.cos(a) * r1, y1: Math.sin(a) * r1, x2: Math.cos(a) * outer, y2: Math.sin(a) * outer, stroke: '#c9a14a', 'stroke-width': 0.6, opacity: 0.3 }));
  }
  // Raios das teias de evolução até o anel externo.
  for (const n of o.tree.nodes) {
    if (n.type !== 'evolucao') continue;
    const base = o.tree.nodes.find((x) => x.type === 'base') ?? n;
    const dx = n.x - base.x;
    const dy = n.y - base.y;
    const l = Math.hypot(dx, dy) || 1;
    g.append(el('line', { x1: 0, y1: 0, x2: (dx / l) * outer, y2: (dy / l) * outer, stroke: '#c9a14a', 'stroke-width': 0.5, opacity: 0.12 }));
  }
  // Rosa dos ventos atrás do núcleo.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
    const long = k % 4 === 0 ? 52 : k % 2 === 0 ? 40 : 30;
    const side = 5;
    const tip = { x: Math.cos(a) * long, y: Math.sin(a) * long };
    const l = { x: Math.cos(a - Math.PI / 2) * side, y: Math.sin(a - Math.PI / 2) * side };
    g.append(el('polygon', { points: `${tip.x},${tip.y} ${l.x},${l.y} ${-l.x},${-l.y}`, fill: k % 2 ? '#2b2310' : '#6b5420', stroke: '#c9a14a', 'stroke-width': 0.4, opacity: 0.55 }));
  }
  return g;
}

/** Engaste de uma habilidade. */
function socket(p: WebPoint, n: TreeNode, sk: TreeSkill, st: SkillDotState, selected: boolean, showRank: boolean): SVGGElement {
  const ultimate = !!sk.ultimate;
  const g = el('g', {});
  const learned = st.rank > 0;
  const color = TYPE_COLOR[n.type];
  const r = ultimate ? SOCKET + 3 : SOCKET;
  const shape = (rad: number, attrs: Record<string, string | number>) =>
    ultimate
      ? el('polygon', { points: Array.from({ length: 6 }, (_, i) => `${p.x + Math.cos((i * Math.PI) / 3 - Math.PI / 2) * rad},${p.y + Math.sin((i * Math.PI) / 3 - Math.PI / 2) * rad}`).join(' '), ...attrs })
      : el('circle', { cx: p.x, cy: p.y, r: rad, ...attrs });
  if (selected) g.append(shape(r + 6, { fill: 'none', stroke: '#fff3c4', 'stroke-width': 1.6, filter: 'url(#rw-glow)' }));
  if (st.available && !learned) {
    const ring = shape(r + 3.5, { fill: 'none', stroke: color, 'stroke-width': 1.2 });
    ring.append(el('animate', { attributeName: 'opacity', values: '0.15;0.9;0.15', dur: '2.2s', repeatCount: 'indefinite' }));
    g.append(ring);
  }
  // Aro de metal (dourado se aprendida ou disponível, chumbo se bloqueada).
  g.append(shape(r + 1.5, { fill: '#05070e', stroke: learned || st.available ? 'url(#rw-gold)' : '#353b52', 'stroke-width': ultimate ? 2.6 : 2 }));
  if (ultimate) g.append(shape(r + 4.5, { fill: 'none', stroke: learned ? 'url(#rw-gold)' : '#353b52', 'stroke-width': 0.8 }));
  g.append(shape(r - 1, { fill: learned ? `url(#rw-lit-${n.type})` : st.available ? 'url(#rw-socket)' : '#090c16', filter: learned ? 'url(#rw-glow)' : '' }));
  // Ícone gravado (elemento ou tipo) + selo da forma no canto.
  const ink = learned ? '#0d1020' : st.available ? color : '#4a5068';
  const icon = skillIcon(sk);
  const size = ultimate ? 15 : 13;
  const ig = el('g', { transform: `translate(${p.x - size / 2} ${p.y - size / 2}) scale(${size / 24})`, 'pointer-events': 'none' });
  for (const d of icon.fill) ig.append(el('path', { d, fill: ink }));
  for (const d of icon.stroke) ig.append(el('path', { d, fill: 'none', stroke: ink, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  g.append(ig);
  if (icon.badge) {
    const bx = p.x + r * 0.72;
    const by = p.y + r * 0.72;
    const bg = el('g', { 'pointer-events': 'none' }, el('circle', { cx: bx, cy: by, r: 3.6, fill: '#05070e', stroke: learned || st.available ? '#c9a14a' : '#353b52', 'stroke-width': 0.7 }));
    const c = learned || st.available ? '#f3d58a' : '#4a5068';
    if (icon.badge === 'radius') bg.append(el('circle', { cx: bx, cy: by, r: 1.8, fill: 'none', stroke: c, 'stroke-width': 0.8 }));
    else if (icon.badge === 'cone') bg.append(el('path', { d: `M${bx - 1.8} ${by}L${bx + 1.8} ${by - 1.8}L${bx + 1.8} ${by + 1.8}Z`, fill: c }));
    else bg.append(el('path', { d: `M${bx - 2} ${by}H${bx + 2}M${bx + 0.8} ${by - 1.2}L${bx + 2} ${by}L${bx + 0.8} ${by + 1.2}`, stroke: c, 'stroke-width': 0.8, fill: 'none' }));
    g.append(bg);
  }
  // Marcas de nível: 5 pontos num arco acima do engaste.
  if (showRank)
    for (let i = 0; i < SKILL_MAX_RANK; i++) {
      const a = (-150 + (i * 120) / (SKILL_MAX_RANK - 1)) * (Math.PI / 180);
      const rr = r + 6.5;
      g.append(el('circle', { cx: p.x + Math.cos(a) * rr, cy: p.y + Math.sin(a) * rr, r: 1.5, fill: i < st.rank ? '#ffd54f' : '#232a40', stroke: i < st.rank ? '#fff3c4' : '#3a4260', 'stroke-width': 0.4 }));
    }
  return g;
}

/** Desenha a teia em estilo de runas. O SVG ocupa todo o espaço do contêiner. */
export function runeWeb(o: WebOptions): SVGSVGElement {
  const t = o.tree;
  const L = webLayout(t);
  const pad = 14;
  const maxR = Math.max(...[...L.skills.values()].map((p) => Math.hypot(p.x, p.y)), R0);
  const rings = Math.ceil((maxR - R0) / STEP);
  const outer = R0 + STEP * rings + 20;
  const b = {
    minX: Math.min(L.bounds.minX, -outer) - pad,
    minY: Math.min(L.bounds.minY, -outer) - pad,
    maxX: Math.max(L.bounds.maxX, outer) + pad,
    maxY: Math.max(L.bounds.maxY, outer) + pad,
  };
  const svg = el('svg', {
    viewBox: `${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`,
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    style: 'display:block;user-select:none',
  });
  svg.dataset.base = `${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`;
  svg.append(defs(), backdrop(o, rings, b));
  const state = (id: string): SkillDotState => o.state?.(id) ?? { rank: 1, available: true };
  const learned = (id: string) => state(id).rank > 0;

  // Ligações: sulco escuro com filete de luz quando a ligação está ativa.
  const links = el('g', { 'pointer-events': 'none' });
  const link = (a: WebPoint, c: WebPoint, color: string | null, dash = false) => {
    links.append(el('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, stroke: '#03050b', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    links.append(el('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, stroke: color ?? '#2c3350', 'stroke-width': color ? 2 : 1.2, 'stroke-linecap': 'round', 'stroke-dasharray': dash ? '3 4' : '', filter: color ? 'url(#rw-glow)' : '' }));
  };
  for (const n of t.nodes) {
    const chain = chainOf(n);
    const first = chain[0] && L.skills.get(chain[0].id);
    if (!first) continue;
    if (n.type === 'evolucao') link(L.center, first, learned(chain[0]!.id) ? TYPE_COLOR.evolucao : null);
    for (const pid of n.parents) {
      const parent = t.nodes.find((x) => x.id === pid);
      const key = parent && unlockSkillOf(parent, n);
      const kp = key && L.skills.get(key.id);
      if (kp) link(kp, first, key && learned(key.id) ? TYPE_COLOR[n.type] : null, true);
    }
    for (let i = 1; i < chain.length; i++) link(L.skills.get(chain[i - 1]!.id)!, L.skills.get(chain[i]!.id)!, learned(chain[i]!.id) ? TYPE_COLOR[n.type] : null);
  }
  svg.append(links);

  // Nomes das subclasses em letra de mapa, ao lado de cada fila.
  const labels = el('g', { 'pointer-events': 'none' });
  for (const n of t.nodes) {
    const c = L.chains.get(n.id);
    const chain = chainOf(n);
    if (!c || !chain.length) continue;
    const mid = (chain.length - 1) / 2;
    const p = { x: c.start.x + c.dir.x * STEP * mid, y: c.start.y + c.dir.y * STEP * mid };
    let ang = (Math.atan2(c.dir.y, c.dir.x) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    const off = { x: -c.dir.y * 25, y: c.dir.x * 25 };
    const any = chain.some((s) => learned(s.id));
    labels.append(
      el('text', {
        x: p.x + off.x,
        y: p.y + off.y,
        transform: `rotate(${ang} ${p.x + off.x} ${p.y + off.y})`,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: any ? TYPE_COLOR[n.type] : '#c9a14a',
        opacity: any ? 0.95 : 0.55,
        'font-size': n.type === 'ramo' ? 9 : 11.5,
        'font-family': "Georgia, 'Palatino Linotype', serif",
        'font-style': 'italic',
        'font-weight': 'bold',
        'letter-spacing': 2.5,
        stroke: '#03050b',
        'stroke-width': 3,
        'paint-order': 'stroke',
      }, n.name.replace(/^Caminho d[aoe] /, '').toUpperCase()),
    );
  }
  svg.append(labels);

  // Núcleo: a classe base.
  const base = t.nodes.find((n) => n.type === 'base');
  const core = el('g', { style: o.onCenter ? 'cursor:pointer' : '' },
    el('circle', { cx: 0, cy: 0, r: 30, fill: 'url(#rw-core)', stroke: 'url(#rw-gold)', 'stroke-width': 2.5 }),
    el('circle', { cx: 0, cy: 0, r: 25, fill: 'none', stroke: '#c9a14a', 'stroke-width': 0.6, opacity: 0.7 }),
    el('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#ffe9a8', 'font-size': Math.min(10.5, 220 / Math.max(6, (base?.name ?? t.name).length * 2.4)), 'font-weight': 'bold', 'font-family': "Georgia, 'Palatino Linotype', serif", 'letter-spacing': 1 }, (base?.name ?? t.name).toUpperCase()),
    el('title', {}, `${base?.name ?? t.name}\n${base?.skills.map((s) => `${s.name}: ${s.description}`).join('\n') ?? ''}`),
  );
  if (o.onCenter) core.addEventListener('click', () => o.onCenter!());
  svg.append(core);

  // Engastes.
  for (const n of t.nodes)
    for (const s of chainOf(n)) {
      const p = L.skills.get(s.id);
      if (!p) continue;
      const st = state(s.id);
      const g = socket(p, n, s, st, o.selected === s.id, !!o.state);
      g.setAttribute('style', 'cursor:pointer');
      g.setAttribute('data-skill', s.id);
      const kind = s.kind === 'passive' ? ' (passiva)' : s.kind === 'reaction' ? ' (reação)' : '';
      g.append(el('title', {}, `${s.name}${kind}${st.rank ? ` — Nv ${st.rank}/${SKILL_MAX_RANK}` : ''}\n${s.description}`));
      if (o.onPick) g.addEventListener('click', () => o.onPick!(s.id));
      svg.append(g);
    }
  return svg;
}

export interface ZoomView {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Zoom e arrasto na teia: roda do mouse aproxima no ponto do cursor (até 4×), arrastar move.
 * Um arrasto não conta como clique numa habilidade. `initial` restaura a vista entre redesenhos.
 */
export function attachZoom(svg: SVGSVGElement, initial: ZoomView | null, onView: (v: ZoomView) => void): { zoom: (f: number) => void; reset: () => void } {
  const [bx, by, bw, bh] = (svg.dataset.base ?? '0 0 100 100').split(' ').map(Number) as [number, number, number, number];
  let v: ZoomView = initial ?? { x: bx, y: by, w: bw, h: bh };
  const apply = () => {
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    onView(v);
  };
  const clampView = () => {
    v.w = Math.max(bw / 4, Math.min(bw, v.w));
    v.h = (v.w * bh) / bw;
    v.x = Math.max(bx - v.w * 0.25, Math.min(bx + bw - v.w * 0.75, v.x));
    v.y = Math.max(by - v.h * 0.25, Math.min(by + bh - v.h * 0.75, v.y));
  };
  const zoomAt = (f: number, fx = 0.5, fy = 0.5) => {
    const nw = v.w / f;
    const nh = v.h / f;
    v = { x: v.x + (v.w - nw) * fx, y: v.y + (v.h - nh) * fy, w: nw, h: nh };
    clampView();
    apply();
  };
  // Fração do ponto do cursor dentro da vista (considera o "meet" do SVG).
  const frac = (ev: MouseEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / v.w, r.height / v.h);
    const ox = (r.width - v.w * s) / 2;
    const oy = (r.height - v.h * s) / 2;
    return [Math.max(0, Math.min(1, (ev.clientX - r.left - ox) / (v.w * s))), Math.max(0, Math.min(1, (ev.clientY - r.top - oy) / (v.h * s)))];
  };
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [fx, fy] = frac(ev);
    zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, fx, fy);
  }, { passive: false });
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  let suppress = false;
  svg.addEventListener('mousedown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, vx: v.x, vy: v.y, moved: false };
    suppress = false;
  });
  const onMove = (ev: MouseEvent) => {
    if (!svg.isConnected) return cleanup();
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / v.w, r.height / v.h);
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    v.x = drag.vx - dx / s;
    v.y = drag.vy - dy / s;
    clampView();
    apply();
  };
  const onUp = () => {
    if (!svg.isConnected) return cleanup();
    if (drag?.moved) suppress = true;
    drag = null;
  };
  // Os ouvintes da janela saem quando a teia é redesenhada (o SVG antigo sai da página).
  const cleanup = () => {
    removeEventListener('mousemove', onMove);
    removeEventListener('mouseup', onUp);
  };
  addEventListener('mousemove', onMove);
  addEventListener('mouseup', onUp);
  svg.addEventListener('click', (ev) => {
    if (suppress) {
      ev.stopPropagation();
      suppress = false;
    }
  }, true);
  svg.style.cursor = 'grab';
  clampView();
  apply();
  return { zoom: (f) => zoomAt(f), reset: () => ((v = { x: bx, y: by, w: bw, h: bh }), apply()) };
}
