/**
 * A IA usando as táticas do mapa (battle/tactics.ts, downed.ts, scenery.ts, build.ts): empurrar de
 * telhados e para o fogo, arremessar barris, atirar em barris de pólvora e lustres, estabilizar
 * aliados caídos, tocar o sino, puxar alavancas que abrem caminho e erguer cobertura. Cada função
 * avalia a posição atual de `u` (o planejador move `u` pelas casas alcançáveis antes de chamar).
 */
import { DB } from '../data';
import { PROPS, idx, manhattan, tileAt } from './map';
import { unitAt } from './elements';
import * as stats from '../rules/stats';
import * as tactics from './tactics';
import * as downed from './downed';
import * as scenery from './scenery';
import * as confine from './confine';
import { coverAgainst } from './cover';
import * as stack from './stack';
import type { BattleState, BattleUnit } from './types';
import { BASIC_ATTACK, inRange, opponents, skillRange, structureHit, type SkillLike } from './engine';

export type TacticKind = 'shove' | 'throw' | 'stabilize' | 'scenery' | 'propShot' | 'shootProp';

export interface TacticAction {
  kind: 'tactic';
  tactic: TacticKind;
  x: number;
  y: number;
  from?: [number, number];
}

/** Valor de empurrar `d` agora (chance × dano previsto; derrubar no abismo vale muito). */
export function shoveValue(state: BattleState, u: BattleUnit, d: BattleUnit): number {
  if (d.team === u.team) return 0;
  const p = tactics.shovePreview(state, u, d);
  const chance = tactics.shoveChanceOf(u, d) / 100;
  return chance * (p.kill ? 80 + d.level : p.damage + (p.damage >= d.hp ? 25 : 0));
}

/** Melhor empurrão da posição atual (ação livre: vem antes da ação principal). */
export function bestShove(state: BattleState, u: BattleUnit): { x: number; y: number; value: number } | null {
  let best: { x: number; y: number; value: number } | null = null;
  for (const i of tactics.shoveTargets(state, u)) {
    const d = state.units.find((o) => o.alive && idx(state.map, o.x, o.y) === i);
    if (!d) continue;
    const v = shoveValue(state, u, d);
    if (v > 6 && (!best || v > best.value)) best = { x: d.x, y: d.y, value: v };
  }
  return best;
}

/** Valor de uma explosão de pólvora em (x, y): dano em inimigos menos o dano em aliados. */
function blastValue(state: BattleState, u: BattleUnit, x: number, y: number): number {
  let v = 0;
  for (const o of state.units) {
    if (!o.alive || manhattan(o.x, o.y, x, y) > stats.TACTICS.explodeRadius) continue;
    const dmg = Math.round(o.maxHp * stats.TACTICS.explodePower);
    v += o.team === u.team ? -dmg * 1.5 : dmg + (dmg >= o.hp ? 25 : 0);
  }
  return v;
}

/** Ações táticas que valem a pena da posição atual (com o valor esperado de cada uma). */
export function tacticOptions(state: BattleState, u: BattleUnit): { value: number; action: TacticAction }[] {
  const out: { value: number; action: TacticAction }[] = [];
  const map = state.map;
  const range = skillRange(u, BASIC_ATTACK as SkillLike);
  // Estabilizar aliado caído ao lado (vale muito: um herói a mais na luta).
  for (const i of downed.downedTargets(state, u)) {
    const [x, y] = [i % map.w, Math.floor(i / map.w)];
    out.push({ value: 70, action: { kind: 'tactic', tactic: 'stabilize', x, y } });
  }
  // Barris ao alcance: atirar no de pólvora perto dos inimigos; arremessar barril ou caixa no inimigo.
  for (let y = Math.max(0, u.y - range); y <= Math.min(map.h - 1, u.y + range); y++)
    for (let x = Math.max(0, u.x - range); x <= Math.min(map.w - 1, u.x + range); x++) {
      const t = map.tiles[idx(map, x, y)]!;
      if (t.p !== 'barril_polvora' || unitAt(state, x, y)) continue;
      if (!inRange(state, u, range, x, y)) continue;
      const hp = t.pHp ?? PROPS[t.p].hp;
      if (structureHit(u, 'basic', 0) < hp) continue;
      const v = blastValue(state, u, x, y);
      if (v > 10) out.push({ value: v, action: { kind: 'tactic', tactic: 'shootProp', x, y } });
    }
  // Lustre sobre um inimigo.
  for (const i of tactics.propShotTargets(state, u, range)) {
    const [x, y] = [i % map.w, Math.floor(i / map.w)];
    const o = unitAt(state, x, y);
    if (o && o.team !== u.team) out.push({ value: Math.round(o.maxHp * stats.TACTICS.fallingPropCrush) + 8, action: { kind: 'tactic', tactic: 'propShot', x, y } });
  }
  for (const si of tactics.throwSources(state, u)) {
    const [sx, sy] = [si % map.w, Math.floor(si / map.w)];
    const p = tileAt(map, sx, sy)!.p!;
    for (const o of opponents(state, u)) {
      if (o.hidden || !tactics.arcReach(state, u, o.x, o.y, stats.throwRange(u.attrs.str))) continue;
      const v = (p === 'barril_polvora' ? blastValue(state, u, o.x, o.y) : 0) + structureHit(u, 'basic', stats.TACTICS.throwPower) + 4;
      out.push({ value: v, action: { kind: 'tactic', tactic: 'throw', x: o.x, y: o.y, from: [sx, sy] } });
    }
  }
  // Sino: inimigos escondidos ou corrompidos perto dele.
  for (const i of scenery.sceneryTargets(state, u)) {
    const [x, y] = [i % map.w, Math.floor(i / map.w)];
    if (tileAt(map, x, y)!.p !== 'sino') continue;
    const near = opponents(state, u).filter((o) => manhattan(o.x, o.y, x, y) <= 6);
    const v = near.filter((o) => o.hidden).length * 15 + near.filter((o) => o.element === 'sombra').length * 18;
    if (v > 0) out.push({ value: v, action: { kind: 'tactic', tactic: 'scenery', x, y } });
  }
  return out;
}

/** Alavanca ao alcance que abre uma porta ou portão fechado (quando não há o que atacar). */
export function leverToPull(state: BattleState, u: BattleUnit): [number, number] | null {
  for (const i of scenery.sceneryTargets(state, u)) {
    const [x, y] = [i % state.map.w, Math.floor(i / state.map.w)];
    const t = tileAt(state.map, x, y)!;
    if (t.p !== 'alavanca' || !t.link) continue;
    const g = tileAt(state.map, t.link[0], t.link[1]);
    if (!g) continue;
    const closed = g.p === 'portao' || [...Array(stack.levelCount(g)).keys()].some((l) => stack.doorClosed(g, l));
    if (closed) return [x, y];
  }
  return null;
}

/** Bônus de posição: altura sobre os alvos e cobertura contra o mais perto (só para quem atira). */
export function positionValue(state: BattleState, u: BattleUnit, targets: BattleUnit[], ranged: boolean): number {
  if (!targets.length) return 0;
  const near = [...targets].sort((a, b) => manhattan(a.x, a.y, u.x, u.y) - manhattan(b.x, b.y, u.x, u.y))[0]!;
  const h = stack.unitH(state.map, u);
  const high = Math.max(0, Math.min(4, h - stack.unitH(state.map, near))) * (ranged ? 1.2 : 0.4);
  const cov = coverAgainst(state.map, u.x, u.y, near.x, near.y);
  const cover = ranged ? (cov === 'full' ? 4 : cov === 'half' ? 2 : 0) : 0;
  // Não ficar preso dentro de um confinamento inimigo.
  const caged = (state.confines ?? []).some((c) => confine.inside(c, u.x, u.y) && state.units.find((o) => o.uid === c.casterUid)?.team !== u.team) ? -15 : 0;
  return high + cover + caged;
}

/** Construção: erguer muralha/barricada entre si e o inimigo mais perto (para quem atira, longe). */
export function buildAim(state: BattleState, u: BattleUnit, s: SkillLike, targets: BattleUnit[]): { x: number; y: number; value: number } | null {
  const b = DB.skills[s.id]?.fx?.build;
  if (!b || (b.shape !== 'wall' && b.shape !== 'barricade')) return null;
  const near = [...targets].sort((a, c) => manhattan(a.x, a.y, u.x, u.y) - manhattan(c.x, c.y, u.x, u.y))[0];
  if (!near || manhattan(near.x, near.y, u.x, u.y) < 3) return null;
  if (coverAgainst(state.map, u.x, u.y, near.x, near.y) === 'full') return null;
  const dx = Math.sign(near.x - u.x);
  const dy = Math.abs(near.x - u.x) >= Math.abs(near.y - u.y) ? 0 : Math.sign(near.y - u.y);
  const x = u.x + (dy === 0 ? dx : 0);
  const y = u.y + dy;
  const t = tileAt(state.map, x, y);
  if (!t || unitAt(state, x, y)) return null;
  return { x, y, value: 14 };
}
