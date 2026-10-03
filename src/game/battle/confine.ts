/**
 * Selo de Confinamento (Mestre dos Selos): quatro selos arremessados nos cantos de um retângulo;
 * paredes de energia ligam os selos e prendem quem está dentro. Nenhum ataque, habilidade, item ou
 * passo atravessa a barreira (a visão, sim). Quem está dentro precisa quebrar um dos selos; quem está
 * fora pode quebrar a concentração de quem conjurou. Dura até `turns` rodadas.
 */
import { DB } from '../data';
import { tileAt } from './map';
import type { BattleState, BattleUnit } from './types';
import * as fx from './creature_fx';
import { unitById } from './engine';
import * as conc from './concentration';

export interface Confine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  casterUid: string;
  /** Rodadas que faltam. */
  ttl: number;
  seals: [number, number][];
}

/** Tamanho do lado (mín. 3, máx. 7). */
export const CONFINE_MIN = 3;
export const CONFINE_MAX = 7;

export function inside(c: Confine, x: number, y: number): boolean {
  return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
}

/** Algum confinamento separa (ax, ay) de (bx, by)? (um dentro, o outro fora) */
export function blocks(state: BattleState, ax: number, ay: number, bx: number, by: number): boolean {
  for (const c of state.confines ?? []) if (inside(c, ax, ay) !== inside(c, bx, by)) return true;
  return false;
}

/** Retângulo dos cantos (x, y) e (ox, oy), limitado ao mapa e ao tamanho. Ok se cada lado tiver 3–7 casas. */
export function rectOf(state: BattleState, ax: number, ay: number, bx: number, by: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const x0 = Math.max(0, Math.min(ax, bx));
  const x1 = Math.min(state.map.w - 1, Math.max(ax, bx));
  const y0 = Math.max(0, Math.min(ay, by));
  const y1 = Math.min(state.map.h - 1, Math.max(ay, by));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < CONFINE_MIN || h < CONFINE_MIN || w > CONFINE_MAX || h > CONFINE_MAX) return null;
  return { x0, y0, x1, y1 };
}

/** Guarda o primeiro canto escolhido na tela (o segundo vem no lançamento). */
export function setFirstCorner(u: BattleUnit, x: number, y: number): void {
  fx.bag(u).confineA = `${x},${y}`;
}

/**
 * Lança o confinamento: retângulo do primeiro canto guardado até (x, y); sem canto guardado (IA),
 * um quadrado 5×5 em volta de (x, y). Os quatro cantos recebem selos (objetos que dá para quebrar).
 */
export function cast(state: BattleState, u: BattleUnit, skillId: string, x: number, y: number): boolean {
  const def = DB.skills[skillId]?.fx?.confine;
  if (!def) return false;
  const first = String(fx.bag(u).confineA ?? '');
  delete fx.bag(u).confineA;
  const [ax, ay] = first ? first.split(',').map(Number) : [x - 2, y - 2];
  const [bx, by] = first ? [x, y] : [x + 2, y + 2];
  const r = rectOf(state, ax!, ay!, bx!, by!);
  if (!r) return false;
  // Um confinamento por conjurador.
  end(state, u.uid, 'refaz os selos');
  const seals: [number, number][] = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ];
  for (const [sx, sy] of seals) {
    const t = tileAt(state.map, sx, sy)!;
    t.p = 'selo_confinamento';
    t.pHp = def.sealHp;
    state.events.push({ type: 'fx', x: sx, y: sy, element: 'luz' });
  }
  (state.confines ??= []).push({ ...r, casterUid: u.uid, ttl: def.turns, seals });
  state.log.push(`⛩ ${u.name} arremessa quatro selos: paredes de energia se erguem! Quem está dentro precisa quebrar um selo.`);
  return true;
}

/** Desfaz o confinamento de `casterUid` (selos somem). */
export function end(state: BattleState, casterUid: string, why?: string): void {
  const list = state.confines ?? [];
  const mine = list.filter((c) => c.casterUid === casterUid);
  if (!mine.length) return;
  for (const c of mine)
    for (const [sx, sy] of c.seals) {
      const t = tileAt(state.map, sx, sy);
      if (t?.p === 'selo_confinamento') {
        t.p = null;
        delete t.pHp;
      }
    }
  state.confines = list.filter((c) => c.casterUid !== casterUid);
  if (why) state.log.push(`⛩ As paredes de energia caem (${why}).`);
}

/** Um selo quebrou em (x, y): o confinamento dele acaba (e a concentração de quem conjurou). */
export function sealBroken(state: BattleState, x: number, y: number): void {
  const c = (state.confines ?? []).find((k) => k.seals.some(([sx, sy]) => sx === x && sy === y));
  if (!c) return;
  const caster = unitById(state, c.casterUid);
  end(state, c.casterUid, 'um selo foi quebrado');
  if (caster && state.conc?.[caster.uid]) conc.end(state, caster, 'teve o selo quebrado');
}

/** Uma rodada passa: confinamentos expiram; conjurador caído desfaz o seu. */
export function confineTick(state: BattleState): void {
  for (const c of [...(state.confines ?? [])]) {
    c.ttl -= 1;
    const caster = unitById(state, c.casterUid);
    if (c.ttl <= 0 || !caster?.alive) {
      end(state, c.casterUid, c.ttl <= 0 ? 'o tempo acabou' : 'quem conjurou caiu');
      if (caster && state.conc?.[caster.uid]) conc.end(state, caster, 'o confinamento acabou');
    }
  }
}

/** Selo que a unidade presa deve quebrar (o mais perto), se ela estiver confinada pelo outro lado. */
export function sealToBreak(state: BattleState, u: BattleUnit): [number, number] | null {
  for (const c of state.confines ?? []) {
    const caster = unitById(state, c.casterUid);
    if (!caster || caster.team === u.team || !inside(c, u.x, u.y)) continue;
    const alive = c.seals.filter(([sx, sy]) => tileAt(state.map, sx, sy)?.p === 'selo_confinamento');
    alive.sort((a, b) => Math.abs(a[0] - u.x) + Math.abs(a[1] - u.y) - (Math.abs(b[0] - u.x) + Math.abs(b[1] - u.y)));
    if (alive[0]) return alive[0];
  }
  return null;
}
