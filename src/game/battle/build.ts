/**
 * Construção tática (a marca de Valdoria): habilidades que moldam o mapa com peças de prédio
 * (battle/stack.ts) — muralha de pedra do geomante, barricada de escudos, rampa de gelo, pilar,
 * trepadeira que vira escada. Peças temporárias somem depois de `turns` rodadas (e o que estiver em
 * cima cai). Também o arremesso de aliado por criaturas grandes (gigantes, ursos).
 */
import { DIRS, idx, inBounds, chebyshev, manhattan, tileAt, type Slab, type Terrain } from './map';
import { unitAt } from './elements';
import * as stack from './stack';
import type { BattleState, BattleUnit } from './types';
import type { SkillFx } from '../data';
import * as fx from './creature_fx';
import { arcReach } from './tactics';
import { faceTowards, settleStructures } from './engine';

type Build = NonNullable<SkillFx['build']>;

/** Direção principal de `u` até (x, y). */
function dirTo(u: BattleUnit, x: number, y: number): [number, number] {
  const dx = x - u.x;
  const dy = y - u.y;
  if (dx === 0 && dy === 0) return [1, 0];
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

/** Casas que a construção ocupa (muralha/barricada atravessada; rampa para longe de quem lança). */
export function buildTiles(state: BattleState, u: BattleUnit, b: Build, x: number, y: number): [number, number][] {
  const [dx, dy] = dirTo(u, x, y);
  const len = b.length ?? 3;
  const out: [number, number][] = [];
  if (b.shape === 'wall' || b.shape === 'barricade') {
    const half = Math.floor(len / 2);
    for (let k = -half; k < len - half; k++) out.push([x + dy * k, y + dx * k]);
  } else if (b.shape === 'ramp') {
    for (let k = 0; k < len; k++) out.push([x + dx * k, y + dy * k]);
  } else out.push([x, y]);
  return out.filter(([tx, ty]) => inBounds(state.map, tx, ty));
}

/**
 * Ergue a construção mirando (x, y). Muralha: peças de `height` (padrão 2) — bloqueiam passagem e
 * visão (cobertura inteira); barricada: 1 nível (meia cobertura); rampa: degraus 1, 2, 3… (sobe em
 * telhados); pilar: coluna alta; trepadeira: escada na coluna.
 */
export function buildAt(state: BattleState, u: BattleUnit, b: Build, x: number, y: number): number {
  const terrain = (b.terrain ?? (b.shape === 'barricade' ? 'madeira' : 'muralha')) as Terrain;
  let n = 0;
  faceTowards(u, x, y);
  buildTiles(state, u, b, x, y).forEach(([tx, ty], k) => {
    const t = tileAt(state.map, tx, ty)!;
    if (b.shape === 'ladder') {
      t.ladder = true;
      t.ladderTtl = b.turns ?? 3;
      n++;
      return;
    }
    if (unitAt(state, tx, ty) || t.t === 'agua_funda' || t.t === 'lava' || t.t === 'abismo') return;
    const top = stack.columnTop(t);
    const h = b.shape === 'ramp' ? k + 1 : b.shape === 'barricade' ? 1 : (b.height ?? 2);
    if (top + h > stack.MAX_BUILD_HEIGHT) return;
    const piece: Slab = { b: top, h: top + h, t: terrain };
    if (b.turns) piece.ttl = b.turns;
    (t.up ??= []).push(piece);
    t.p = null;
    n++;
  });
  if (n) state.log.push(`🧱 ${u.name} ergue ${b.shape === 'wall' ? 'uma muralha' : b.shape === 'barricade' ? 'uma barricada' : b.shape === 'ramp' ? 'uma rampa' : b.shape === 'ladder' ? 'uma trepadeira' : 'um pilar'}.`);
  return n;
}

/** Uma rodada passa: construções temporárias se desfazem (e o que estava em cima cai). */
export function buildTick(state: BattleState): void {
  let gone = false;
  for (const t of state.map.tiles) {
    if (t.ladderTtl) {
      t.ladderTtl -= 1;
      if (t.ladderTtl <= 0) {
        delete t.ladderTtl;
        delete t.ladder;
      }
    }
    if (!t.up) continue;
    for (const p of [...t.up]) {
      if (p.ttl === undefined) continue;
      p.ttl -= 1;
      if (p.ttl <= 0) {
        t.up.splice(t.up.indexOf(p), 1);
        gone = true;
      }
    }
    if (!t.up.length) delete t.up;
  }
  if (gone) {
    state.log.push('🧱 Uma construção mágica se desfaz.');
    settleStructures(state);
  }
}

// ───────────────────────────── arremessar aliado ─────────────────────────────

/** Aliado grande ao lado, que ainda não arremessou ninguém nesta rodada, pronto para lançar `u`. */
export function launcherFor(state: BattleState, u: BattleUnit): BattleUnit | undefined {
  return state.units.find(
    (o) =>
      o.alive &&
      o !== u &&
      o.team === u.team &&
      chebyshev(o.x, o.y, u.x, u.y) === 1 &&
      fx.passiveFx(o).some((f) => f.launcher) &&
      fx.num(o, 'launched') !== state.round + 1 &&
      !o.statuses.atordoado,
  );
}

/** Casas onde `u` pode ser arremessado (até 4 a partir de quem arremessa, até telhados). */
export function launchTargets(state: BattleState, u: BattleUnit): number[] {
  const l = launcherFor(state, u);
  if (!l || state.turn.moved) return [];
  const out: number[] = [];
  for (let y = l.y - 4; y <= l.y + 4; y++)
    for (let x = l.x - 4; x <= l.x + 4; x++) {
      const t = tileAt(state.map, x, y);
      if (!t || unitAt(state, x, y) || !arcReach(state, l, x, y, 4)) continue;
      if (!stack.standable(t, stack.topLevel(t))) continue;
      out.push(idx(state.map, x, y));
    }
  return out;
}

/** Voo de catapulta: cai no topo da coluna (telhado); gasta o movimento. */
export function launch(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const l = launcherFor(state, u);
  if (!l || !launchTargets(state, u).includes(idx(state.map, x, y))) return false;
  const t = tileAt(state.map, x, y)!;
  u.x = x;
  u.y = y;
  stack.setLevel(state.map, u, stack.topLevel(t));
  fx.bag(l).launched = state.round + 1;
  state.turn.moved = true;
  state.turn.moveLeft = 0;
  state.log.push(`🦍 ${l.name} arremessa ${u.name} pelos ares!`);
  state.events.push({ type: 'text', x, y, text: '🦍 Upa!', color: '#ffe082' });
  void DIRS;
  return true;
}
