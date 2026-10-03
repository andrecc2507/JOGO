import type { Cloud, Surface } from './map';
import { STATUS_INFO, type BattleState, type StatusId } from './types';

/** Avisos curtos que sobem acima dos tiles quando o ambiente ou os estados mudam. */
export interface Notice {
  x: number;
  y: number;
  text: string;
  color: string;
  /** Unidade a que o aviso se refere (estados). */
  uid?: string;
  /** Posição na fila daquele ponto, para empilhar avisos em sequência. */
  order: number;
}

export interface Snapshot {
  tiles: string[];
  statuses: Map<string, Set<StatusId>>;
}

export const SURFACE_NOTICE: Record<Surface, [string, string]> = {
  fogo: ['🔥 Em chamas', '#ff8a3d'],
  agua: ['💧 Alagado', '#64b5f6'],
  agua_eletrica: ['⚡ Eletrificado', '#fff176'],
  gelo: ['❄ Congelado', '#b3e5fc'],
  lama: ['🟫 Lamaçal', '#bcaaa4'],
  oleo: ['🛢 Óleo derramado', '#a1887f'],
};

export const CLOUD_NOTICE: Record<Cloud, [string, string]> = {
  vapor: ['♨ Vapor', '#eceff1'],
  vapor_eletrico: ['⚡ Vapor eletrificado', '#b3e5fc'],
  fumaca: ['🌫 Fumaça', '#bdbdbd'],
  veneno: ['☠ Gás venenoso', '#aed581'],
  gas_fetido: ['🦨 Gás fétido', '#c5c5a0'],
  esporos: ['🍄 Esporos', '#e1bee7'],
  nevasca: ['🌨 Nevasca', '#e3f2fd'],
  vapor_fervente: ['♨ Vapor fervente', '#ffccbc'],
  nevoa_lunar: ['🌑 Névoa lunar', '#9fa8da'],
  chama_fria: ['🔵 Chama fria', '#90caf9'],
  tinta: ['🦑 Tinta', '#90a4ae'],
  nevoa_de_sangue: ['🩸 Névoa de sangue', '#ef9a9a'],
};

export function snapshot(state: BattleState): Snapshot {
  const statuses = new Map<string, Set<StatusId>>();
  for (const u of state.units) if (u.alive) statuses.set(u.uid, new Set(Object.keys(u.statuses) as StatusId[]));
  return { tiles: state.map.tiles.map((t) => `${t.s ?? ''}|${t.c ?? ''}`), statuses };
}

/** O que mudou desde o retrato anterior: um aviso por tipo de ambiente novo e um por estado novo em cada unidade. */
export function diffNotices(state: BattleState, prev: Snapshot): Notice[] {
  const out: Notice[] = [];
  const groups = new Map<string, { color: string; pts: [number, number][] }>();
  const map = state.map;
  map.tiles.forEach((t, i) => {
    const [ps, pc] = (prev.tiles[i] ?? '|').split('|');
    const x = i % map.w;
    const y = Math.floor(i / map.w);
    const add = (label: [string, string]) => {
      const g = groups.get(label[0]) ?? { color: label[1], pts: [] };
      g.pts.push([x, y]);
      groups.set(label[0], g);
    };
    if (t.s && t.s !== ps) add(SURFACE_NOTICE[t.s]);
    if (t.c && t.c !== pc) add(CLOUD_NOTICE[t.c]);
  });
  for (const [text, g] of groups) {
    // Um aviso por tipo, no tile mais perto do centro da área afetada.
    const cx = g.pts.reduce((a, p) => a + p[0], 0) / g.pts.length;
    const cy = g.pts.reduce((a, p) => a + p[1], 0) / g.pts.length;
    const best = g.pts.reduce((a, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(a[0] - cx, a[1] - cy) ? p : a));
    out.push({ x: best[0], y: best[1], text, color: g.color, order: 0 });
  }
  for (const u of state.units) {
    if (!u.alive) continue;
    const before = prev.statuses.get(u.uid) ?? new Set<StatusId>();
    let order = 0;
    for (const id of Object.keys(u.statuses) as StatusId[]) {
      if (before.has(id)) continue;
      const info = STATUS_INFO[id];
      out.push({ x: u.x, y: u.y, uid: u.uid, text: `${info.icon} ${info.name}`, color: info.debuff ? '#ff8a80' : '#a5d6a7', order: order++ });
    }
  }
  return out;
}
