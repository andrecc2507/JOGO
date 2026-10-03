import type { Rng } from '@core';
import BASE from '../data/base/base.json';

/**
 * Contador do Véu (D69, design/campanha.md): quanto falta para o culto forçar o próximo Selo.
 * Liga quando o plano do inimigo é revelado (fim do Ato 2), sobe com os dias e com ações do culto
 * no mapa e desce com missões de atraso. Em 100 o Selo rompe antes da hora: o ato é antecipado e
 * fica registrado um ramo "e se" para a história — sem game over.
 */

export const VEIL = BASE.veil;
export type DelayKind = keyof typeof VEIL.delay;

export interface VeilState {
  value: number;
  /** Atos antecipados pelo Véu (ramos "e se" a escrever). */
  broken: number[];
}

export interface VeilHost {
  act: number;
  hours: number;
  veil?: VeilState;
}

export function veilActive(c: VeilHost): boolean {
  return c.act >= VEIL.startAct;
}

export function ensureVeil(c: VeilHost): VeilState {
  return (c.veil ??= { value: 0, broken: [] });
}

export type VeilEvent = { kind: 'cult'; text: string } | { kind: 'break'; act: number };

/** Um dia passa: +1; a cada semana o culto pode agir (+5). Devolve eventos para a campanha tratar. */
export function veilDay(c: VeilHost, day: number, rng: Rng): VeilEvent[] {
  if (!veilActive(c)) return [];
  const v = ensureVeil(c);
  const out: VeilEvent[] = [];
  v.value += VEIL.perDay;
  if (day % VEIL.enemyActionEveryDays === 0 && rng.chance(VEIL.enemyActionChance)) {
    v.value += VEIL.enemyAction;
    out.push({ kind: 'cult', text: 'O culto agiu no mapa (sequestros, um altar novo).' });
  }
  if (v.value >= VEIL.max) {
    v.broken.push(c.act);
    v.value = VEIL.resetAfterBreak;
    out.push({ kind: 'break', act: c.act });
  }
  return out;
}

/** Missão de atraso cumprida: o contador recua. */
export function delayVeil(c: VeilHost, kind: DelayKind): number {
  const v = ensureVeil(c);
  const amount = VEIL.delay[kind];
  v.value = Math.max(0, v.value - amount);
  return amount;
}
