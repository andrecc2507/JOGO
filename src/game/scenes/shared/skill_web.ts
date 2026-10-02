import type { SkillTree, TreeNode } from '../../data';
import { DEFAULT_UNLOCK_AT, SKILL_MAX_RANK, chainOf, unlockSkillOf } from '../../rules/skill_tree';

/**
 * Teia da classe: cada subclasse é uma fila de habilidades saindo do centro (a classe base),
 * Habilidade 1 perto do centro e a última na ponta. Híbridas e ramos saem da habilidade que os abre
 * nas teias de origem. O nome da subclasse fica ao fundo, como guia (não é clicável).
 */

/** Distância do centro à 1ª habilidade e entre habilidades vizinhas (unidades do SVG). */
const R0 = 58;
const STEP = 31;
const DOT = 9;
/** Abertura máxima (graus) do leque de ramos em volta da direção da teia de origem. */
const RAMO_FAN = 40;
/** Distância mínima entre duas habilidades de teias diferentes (cabe o engaste das runas). */
const MIN_GAP = 52;

export interface WebPoint {
  x: number;
  y: number;
}

export interface WebLayout {
  center: WebPoint;
  /** Posição de cada habilidade (fora da classe base). */
  skills: Map<string, WebPoint>;
  /** Direção de cada teia (vetor unitário) e onde ela começa. */
  chains: Map<string, { dir: WebPoint; start: WebPoint }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function unit(x: number, y: number): WebPoint {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

function rotate(p: WebPoint, deg: number): WebPoint {
  const a = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

/** Posições da teia a partir da direção de cada nó no canvas de design. */
export function webLayout(tree: SkillTree): WebLayout {
  const base = tree.nodes.find((n) => n.type === 'base') ?? tree.nodes[0]!;
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const skills = new Map<string, WebPoint>();
  const chains = new Map<string, { dir: WebPoint; start: WebPoint }>();
  const place = (n: TreeNode, start: WebPoint, dir: WebPoint) => {
    chains.set(n.id, { dir, start });
    chainOf(n).forEach((s, i) => skills.set(s.id, { x: start.x + dir.x * STEP * i, y: start.y + dir.y * STEP * i }));
  };
  for (const n of tree.nodes) {
    if (n.type !== 'evolucao') continue;
    const dir = unit(n.x - base.x, n.y - base.y);
    place(n, { x: dir.x * R0, y: dir.y * R0 }, dir);
  }
  // Ramos: leque saindo da habilidade-chave da teia de origem, ordenado pela posição no canvas.
  const ramosByParent = new Map<string, TreeNode[]>();
  for (const n of tree.nodes) if (n.type === 'ramo' && n.parents[0]) ramosByParent.set(n.parents[0], [...(ramosByParent.get(n.parents[0]) ?? []), n]);
  for (const [pid, ramos] of ramosByParent) {
    const parent = byId.get(pid);
    const pc = parent && chains.get(pid);
    if (!parent || !pc) continue;
    const sorted = [...ramos].sort((a, b) => Math.atan2(a.y - parent.y, a.x - parent.x) - Math.atan2(b.y - parent.y, b.x - parent.x));
    sorted.forEach((n, i) => {
      const key = unlockSkillOf(parent, n);
      const from = (key && skills.get(key.id)) ?? pc.start;
      const t = sorted.length > 1 ? i / (sorted.length - 1) : 0.5;
      const dir = rotate(pc.dir, -RAMO_FAN + t * RAMO_FAN * 2);
      place(n, { x: from.x + dir.x * STEP * 3, y: from.y + dir.y * STEP * 3 }, dir);
    });
  }
  // Híbridas por último: na diagonal entre os pais, um pouco além da habilidade que as abre; se a
  // fila esbarrar em outra teia (ex.: o leque de ramos do Mago), gira aos poucos até ficar livre.
  for (const n of tree.nodes) {
    if (n.type !== 'hibrida') continue;
    const base0 = unit(n.x - base.x, n.y - base.y);
    const r = R0 + STEP * ((n.unlockAt ?? DEFAULT_UNLOCK_AT) - 0.5);
    const taken = [...skills.values()];
    // Menor distância entre a fila (nessa direção) e o que já foi posto; maior = mais livre.
    const gap = (dir: WebPoint) =>
      Math.min(...chainOf(n).map((_, i) => {
        const p = { x: dir.x * (r + STEP * i), y: dir.y * (r + STEP * i) };
        return Math.min(Infinity, ...taken.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      }));
    let dir = base0;
    let best = -1;
    for (const deg of [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36]) {
      const d = rotate(base0, deg);
      const g = gap(d);
      if (g >= MIN_GAP) {
        dir = d;
        break;
      }
      if (g > best) {
        best = g;
        dir = d;
      }
    }
    place(n, { x: dir.x * r, y: dir.y * r }, dir);
  }
  const pts = [{ x: 0, y: 0 }, ...skills.values()];
  const bounds = {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
  return { center: { x: 0, y: 0 }, skills, chains, bounds };
}

export interface SkillDotState {
  /** 0 = não aprendida, 1–5 = nível. */
  rank: number;
  /** Pode ser aprendida ou fortalecida agora. */
  available: boolean;
}

export interface WebOptions {
  tree: SkillTree;
  /** Estado de cada habilidade (no editor, sem personagem, tudo aparece aceso). */
  state?: (skillId: string) => SkillDotState;
  selected?: string | null;
  onPick?: (skillId: string) => void;
  /** Clique no centro (classe base). */
  onCenter?: () => void;
  /** Largura máxima em px. */
  maxWidth?: number;
}

const NS = 'http://www.w3.org/2000/svg';
const NODE_COLOR: Record<TreeNode['type'], string> = { base: '#ffd54f', evolucao: '#4fc3f7', hibrida: '#ce93d8', ramo: '#a5d6a7' };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

/** Desenha a teia como SVG clicável. */
export function skillWeb(o: WebOptions): SVGSVGElement {
  const t = o.tree;
  const L = webLayout(t);
  const pad = 26;
  const { minX, minY, maxX, maxY } = L.bounds;
  const w = maxX - minX + pad * 2;
  const hgt = maxY - minY + pad * 2;
  const svg = el('svg', { viewBox: `${minX - pad} ${minY - pad} ${w} ${hgt}`, width: '100%', style: `max-width:${o.maxWidth ?? 640}px;display:block;margin:0 auto;user-select:none` });
  const base = t.nodes.find((n) => n.type === 'base');
  const state = (id: string): SkillDotState => o.state?.(id) ?? { rank: 1, available: true };
  const line = (a: WebPoint, b: WebPoint, color: string, dash = false) =>
    el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash ? '4 4' : '', 'stroke-linecap': 'round' });

  // Nome da subclasse ao fundo, ao longo da teia (guia, não clicável).
  const labels = el('g', { 'pointer-events': 'none' });
  for (const n of t.nodes) {
    const c = L.chains.get(n.id);
    const chain = chainOf(n);
    if (!c || !chain.length) continue;
    const mid = (chain.length - 1) / 2;
    const p = { x: c.start.x + c.dir.x * STEP * mid, y: c.start.y + c.dir.y * STEP * mid };
    let ang = (Math.atan2(c.dir.y, c.dir.x) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    // Afasta o texto para o lado da fila, para não cobrir as bolinhas.
    const off = { x: -c.dir.y * 15, y: c.dir.x * 15 };
    labels.append(
      el('text', {
        x: p.x + off.x,
        y: p.y + off.y,
        transform: `rotate(${ang} ${p.x + off.x} ${p.y + off.y})`,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: NODE_COLOR[n.type],
        opacity: 0.5,
        'font-size': n.type === 'ramo' ? 11 : 15,
        'font-weight': 'bold',
        'letter-spacing': 2,
      }, n.name.replace(/^Caminho d[aoe] /, '').toUpperCase()),
    );
  }
  svg.append(labels);

  // Ligações: centro → 1ª habilidade das evoluções; habilidade-chave dos pais → 1ª da híbrida/ramo; fila da teia.
  const links = el('g', {});
  for (const n of t.nodes) {
    const chain = chainOf(n);
    const first = chain[0] && L.skills.get(chain[0].id);
    if (!first) continue;
    const learned = (id: string) => state(id).rank > 0;
    if (n.type === 'evolucao') links.append(line(L.center, first, learned(chain[0]!.id) ? NODE_COLOR.evolucao : '#3a3f52'));
    for (const pid of n.parents) {
      const parent = t.nodes.find((x) => x.id === pid);
      const key = parent && unlockSkillOf(parent, n);
      const kp = key && L.skills.get(key.id);
      if (kp) links.append(line(kp, first, key && learned(key.id) ? NODE_COLOR[n.type] : '#3a3f52', true));
    }
    for (let i = 1; i < chain.length; i++) {
      const a = L.skills.get(chain[i - 1]!.id)!;
      const b = L.skills.get(chain[i]!.id)!;
      links.append(line(a, b, learned(chain[i]!.id) ? NODE_COLOR[n.type] : '#3a3f52'));
    }
  }
  svg.append(links);

  // Centro: a classe base e sua passiva inata.
  const passive = base?.skills.map((s) => `${s.name}: ${s.description}`).join('\n') ?? '';
  const center = el('g', { style: o.onCenter ? 'cursor:pointer' : '' },
    el('circle', { cx: 0, cy: 0, r: 30, fill: '#2a2414', stroke: NODE_COLOR.base, 'stroke-width': 2.5 }),
    el('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#ffe082', 'font-size': 11, 'font-weight': 'bold' }, base?.name ?? t.name),
    el('title', {}, `${base?.name ?? t.name}\n${passive}`),
  );
  if (o.onCenter) center.addEventListener('click', () => o.onCenter!());
  svg.append(center);

  // Habilidades.
  for (const n of t.nodes) {
    for (const s of chainOf(n)) {
      const p = L.skills.get(s.id);
      if (!p) continue;
      const st = state(s.id);
      const color = NODE_COLOR[n.type];
      const sel = o.selected === s.id;
      const g = el('g', { style: 'cursor:pointer', 'data-skill': s.id });
      if (sel) g.append(el('circle', { cx: p.x, cy: p.y, r: DOT + 5, fill: 'none', stroke: '#fff', 'stroke-width': 2 }));
      const fill = st.rank > 0 ? color : st.available ? '#1f2636' : '#151821';
      const stroke = st.rank > 0 ? '#fff8e1' : st.available ? color : '#3a3f52';
      if (s.ultimate) {
        // Suprema: losango dourado.
        const r = DOT + 2;
        g.append(el('polygon', { points: `${p.x},${p.y - r} ${p.x + r},${p.y} ${p.x},${p.y + r} ${p.x - r},${p.y}`, fill, stroke: st.rank > 0 ? '#fff8e1' : '#ffb300', 'stroke-width': 2 }));
      } else g.append(el('circle', { cx: p.x, cy: p.y, r: DOT, fill, stroke, 'stroke-width': st.available && st.rank === 0 ? 2.2 : 1.5, 'stroke-dasharray': s.kind === 'passive' ? '3 2' : '' }));
      if (st.rank > 0 && o.state) g.append(el('text', { x: p.x, y: p.y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#10131c', 'font-size': 10, 'font-weight': 'bold', 'pointer-events': 'none' }, String(st.rank)));
      const kind = s.kind === 'passive' ? ' (passiva)' : s.kind === 'reaction' ? ' (reação)' : '';
      g.append(el('title', {}, `${s.name}${kind}${st.rank ? ` — Nv ${st.rank}/${SKILL_MAX_RANK}` : ''}\n${s.description}`));
      if (o.onPick) g.addEventListener('click', () => o.onPick!(s.id));
      svg.append(g);
    }
  }
  return svg;
}
