/**
 * Sangrando no chão (XCOM): herói do esquadrão que chega a 0 de vida cai e sangra por algumas
 * rodadas. Aliado ao lado pode **estabilizá-lo** (volta com 10% da vida) ou **carregá-lo** (anda
 * mais devagar, o corpo vai junto). Se o contador zerar, morre. Vencer a batalha com ele caído
 * (sem ter sangrado até o fim) o salva. Números em `balance.json` → `tactics`.
 */
import { DIRS, idx, inBounds, isWalkable, manhattan, tileAt } from './map';
import { unitAt } from './elements';
import * as stats from '../rules/stats';
import type { BattleState, BattleUnit } from './types';
import * as fx from './creature_fx';
import { faceTowards, finishAction } from './engine';

const T = stats.TACTICS;

/** Quem cai sangrando em vez de morrer: herói do esquadrão (não invocação, não traidor). */
export function canBleed(u: BattleUnit): boolean {
  return u.team === 'player' && !!u.charId && !u.betrayed && !u.summonedBy;
}

/** Marca a queda (chamado quando a vida chega a 0). */
export function fallBleeding(state: BattleState, u: BattleUnit): void {
  u.downed = T.bleedTurns;
  u.statuses = { caido: T.bleedTurns };
  state.log.push(`✚ ${u.name} caiu sangrando! ${T.bleedTurns} rodadas para estabilizar.`);
}

/** Uma rodada passa: o contador de quem sangra desce; no zero, morre. */
export function bleedTick(state: BattleState): void {
  for (const u of state.units) {
    if (u.alive || !u.downed) continue;
    u.downed -= 1;
    if (u.downed <= 0) {
      delete u.downed;
      u.statuses = {};
      state.log.push(`☠ ${u.name} sangrou até a morte.`);
      state.events.push({ type: 'text', x: u.x, y: u.y, text: '☠', color: '#e57373' });
    } else u.statuses = { caido: u.downed };
  }
}

/** Caídos (ainda sangrando) ao lado de `u`. */
export function downedNear(state: BattleState, u: BattleUnit): BattleUnit[] {
  return state.units.filter((o) => !o.alive && o.downed && o.team === u.team && o !== u && manhattan(o.x, o.y, u.x, u.y) <= 1 && !o.carriedBy);
}

/** Estabilizar: o caído volta de pé com 10% da vida (gasta a ação). */
export function stabilize(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const o = downedNear(state, u).find((d) => d.x === x && d.y === y);
  if (!o || unitAt(state, x, y)) return false;
  o.alive = true;
  o.hp = Math.max(1, Math.round(o.maxHp * T.stabilizeHpPct));
  o.lowHp = Math.min(o.lowHp ?? o.hp, o.hp);
  o.statuses = {};
  delete o.downed;
  o.gauge = 0;
  faceTowards(u, x, y);
  state.log.push(`✚ ${u.name} estanca o sangue de ${o.name}: de pé de novo!`);
  state.events.push({ type: 'heal', uid: o.uid, amount: o.hp });
  finishAction(state, u);
  return true;
}

/** Carregar o caído ao lado: ele vai junto; quem carrega anda 2 a menos. */
export function pickUp(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const o = downedNear(state, u).find((d) => d.x === x && d.y === y);
  if (!o || carrying(state, u)) return false;
  o.carriedBy = u.uid;
  fx.bag(u).carrying = o.uid;
  o.x = u.x;
  o.y = u.y;
  state.log.push(`🧍 ${u.name} põe ${o.name} nas costas.`);
  return true;
}

export function carrying(state: BattleState, u: BattleUnit): BattleUnit | undefined {
  const id = fx.bag(u).carrying;
  return id ? state.units.find((o) => o.uid === id && o.carriedBy === u.uid) : undefined;
}

/** O corpo acompanha quem carrega (chamado depois de cada movimento). */
export function followCarrier(state: BattleState, u: BattleUnit): void {
  const o = carrying(state, u);
  if (!o) return;
  o.x = u.x;
  o.y = u.y;
  if (u.z === undefined) delete o.z;
  else o.z = u.z;
}

/** Largar o carregado numa casa vizinha livre. */
export function putDown(state: BattleState, u: BattleUnit): boolean {
  const o = carrying(state, u);
  if (!o) return false;
  for (const [dx, dy] of DIRS) {
    const x = u.x + dx!;
    const y = u.y + dy!;
    const t = tileAt(state.map, x, y);
    if (!t || !inBounds(state.map, x, y) || !isWalkable(t) || unitAt(state, x, y)) continue;
    o.x = x;
    o.y = y;
    delete o.carriedBy;
    delete fx.bag(u).carrying;
    state.log.push(`🧍 ${u.name} deixa ${o.name} no chão.`);
    return true;
  }
  return false;
}

/** Casas com caídos para estabilizar ou carregar. */
export function downedTargets(state: BattleState, u: BattleUnit): number[] {
  return downedNear(state, u).filter((o) => !unitAt(state, o.x, o.y)).map((o) => idx(state.map, o.x, o.y));
}
