/**
 * Concentração (Baldur's Gate 3): efeitos fortes mantidos pelo conjurador (zonas, reforços longos).
 * Ao sofrer dano, teste de VIT + INT contra o tamanho do golpe; falhou, o efeito se desfaz (os estados
 * que a habilidade deu e as nuvens que ela criou). Uma concentração por vez.
 */
import { removeStatus } from './elements';
import { end as endConfine } from './confine';
import { DB } from '../data';
import * as stats from '../rules/stats';
import type { BattleState, BattleUnit, StatusId } from './types';

export type Snapshot = Map<string, Partial<Record<StatusId, number>>>;

export function needsConcentration(skillId: string): boolean {
  return !!DB.skills[skillId]?.fx?.concentration;
}

export function snapshot(state: BattleState): Snapshot {
  return new Map(state.units.map((u) => [u.uid, { ...u.statuses }]));
}

/** Depois do lançamento: guarda o que a habilidade causou e marca o conjurador. */
export function begin(state: BattleState, u: BattleUnit, skillId: string, before: Snapshot): void {
  const effects: { uid: string; status: StatusId }[] = [];
  for (const o of state.units) {
    const prev = before.get(o.uid) ?? {};
    for (const [k, v] of Object.entries(o.statuses) as [StatusId, number][]) if ((prev[k] ?? 0) < v && k !== 'concentrando') effects.push({ uid: o.uid, status: k });
  }
  (state.conc ??= {})[u.uid] = { skill: skillId, effects };
  u.statuses.concentrando = 99;
}

/** Dano no conjurador: teste para manter a concentração. */
export function onDamaged(state: BattleState, u: BattleUnit, amount: number): void {
  if (!state.conc?.[u.uid] || amount <= 0) return;
  if (!u.alive) return end(state, u, 'caiu');
  const chance = stats.concentrationChance(u.attrs.vit, u.attrs.int, amount, u.maxHp);
  if (state.rng.chance(chance / 100)) return;
  end(state, u, 'perdeu a concentração');
}

/** Desfaz o efeito mantido: tira os estados que deu e as nuvens que criou. */
export function end(state: BattleState, u: BattleUnit, why: string): void {
  const c = state.conc?.[u.uid];
  if (!c) return;
  for (const e of c.effects) {
    const o = state.units.find((x) => x.uid === e.uid);
    if (o) removeStatus(o, e.status);
  }
  for (const t of state.map.tiles) if (t.cBy === u.uid) {
    t.c = null;
    delete t.cTtl;
    delete t.cBy;
  }
  // Confinamento mantido por esta concentração: as paredes caem.
  endConfine(state, u.uid, 'a concentração se rompeu');
  // Zonas canalizadas (efeitos que se repetem nas próximas rodadas) também param.
  if (state.pending) state.pending = state.pending.filter((p) => !(p.casterUid === u.uid && p.skillId === c.skill));
  delete state.conc![u.uid];
  delete u.statuses.concentrando;
  state.log.push(`✧ ${u.name} ${why}: ${DB.skills[c.skill]?.name ?? 'o efeito'} se desfaz.`);
}
