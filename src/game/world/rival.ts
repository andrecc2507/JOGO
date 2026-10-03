/**
 * Rival recorrente (XCOM 2: os Escolhidos): Ser Corvin, o Arauto do Vazio. A partir do Ato 2 pode
 * surgir em encontros aleatórios; foge quando cai a 30% da vida e volta mais resistente ao tipo de
 * dano (elemento ou físico) que mais o feriu. Morto de verdade, some da campanha (fica na crônica).
 * Números em `data/world/rival.json`.
 */
import { Rng } from '@core';
import { DB } from '../data';
import RIVAL from '../data/world/rival.json';
import type { BattleResult, BattleUnit } from '../battle/types';
import { unitFromEnemy } from '../battle/units';
import { addChronicle, type ChronicleHost } from './chronicle';

export const RIVAL_DATA = RIVAL;

export interface RivalState {
  appearances: number;
  /** Resistência aprendida por tipo de dano ('fisico' ou elemento): 0–0,6. */
  resist: Record<string, number>;
  defeated?: boolean;
}

export interface RivalHost extends ChronicleHost {
  act: number;
  rival?: RivalState;
}

/** Talvez o rival apareça neste encontro (sorteio separado, não mexe no resto da campanha). */
export function maybeRival(c: RivalHost, seed: number, level: number): BattleUnit | null {
  if (c.act < RIVAL.fromAct || c.rival?.defeated) return null;
  const rng = new Rng((seed ^ 0x5eed) >>> 0);
  if (!rng.chance(RIVAL.chance)) return null;
  return rivalUnit(c, level, rng);
}

export function rivalUnit(c: RivalHost, level: number, rng = new Rng(1)): BattleUnit {
  const st = (c.rival ??= { appearances: 0, resist: {} });
  const u = unitFromEnemy(DB.enemies[RIVAL.base]!, level + RIVAL.levelBonus, rng);
  u.name = RIVAL.name;
  u.maxHp = Math.round(u.maxHp * RIVAL.hpMult);
  u.hp = u.maxHp;
  u.rival = { resist: { ...st.resist } };
  u.fx = { ...(u.fx ?? {}), rivalSeen: st.appearances };
  return u;
}

/** Depois da batalha: aparição registrada, resistência aprendida, ou a queda definitiva. */
export function applyRivalResult(c: RivalHost, r: BattleResult): string | null {
  const info = r.rival;
  if (!info) return null;
  const st = (c.rival ??= { appearances: 0, resist: {} });
  st.appearances += 1;
  if (info.killed) {
    st.defeated = true;
    addChronicle(c, { text: `${RIVAL.name} caiu de vez depois de ${st.appearances} encontros. O Vazio perdeu sua voz.`, who: [], kind: 'historia' });
    return `🌑 ${RIVAL.name} caiu de vez!`;
  }
  const top = Object.entries(info.damage).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] <= 0) return `🌑 ${RIVAL.name} recuou para o Vazio.`;
  const [kind] = top;
  st.resist[kind] = Math.min(RIVAL.maxResist, (st.resist[kind] ?? 0) + RIVAL.learnPerBattle);
  addChronicle(c, { text: `${RIVAL.name} fugiu ferido e jurou não cair de novo diante de ${kind === 'fisico' ? 'lâminas e flechas' : `magia de ${kind}`}.`, who: [], kind: 'historia' });
  return `🌑 ${RIVAL.name} fugiu — agora resiste ${Math.round(st.resist[kind]! * 100)}% a ${kind === 'fisico' ? 'dano físico' : kind}.`;
}

/** Fala de fuga (determinística pelo número de aparições). */
export function rivalTaunt(appearances: number): string {
  return RIVAL.taunts[appearances % RIVAL.taunts.length]!;
}
