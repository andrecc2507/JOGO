import type { Rng } from '@core';
import type { BattleResult, BattleSetup, BattleUnit } from '../battle/types';
import type { Character } from '../rules/character';
import type { Region } from './regions';
import { DB } from '../data';
import { crownDay, crownMissionDone, crownOrderDone } from './act_crown';
import { fugitiveAfterBattle, fugitiveBlock, fugitiveDay, useClues } from './act_fugitive';
import { frontOpDone, frontsAfterBattle, frontsDay, palacePrep } from './act_fronts';
import { allianceTroops, alliancesMonth, isBlighted, portalClosed, portalsDay } from './act_portals';
import { caravanDay, inVoid, startCaravan, voidDay, voidUnitMods } from './act_void';
import { atCamp, isClosed, shiftDay, shiftedRegion } from './act_camp';
import { baronKilled, baronPostTaken, baronSetup, baronsDay } from './act_barons';
import { warTableSetup } from './act_war_table';
import { chapterOf } from './acts_state';
import type { Campaign, Contract, Squad } from './campaign';

/**
 * Sistemas por ato (F5): um ponto só onde a campanha, as batalhas e as missões da história
 * consultam o que o ato atual muda. Cada sistema vive no seu módulo (act_*.ts).
 */

/** Um dia de jogo. */
export function actsDay(c: Campaign, day: number, rng: Rng): string[] {
  return [
    ...crownDay(c, day, rng),
    ...fugitiveDay(c, day, rng),
    ...frontsDay(c, day, rng),
    ...portalsDay(c, day, rng),
    ...voidDay(c, (a) => rng.pick(a)),
    ...caravanDay(c),
    ...shiftDay(c, day, rng),
    ...baronsDay(c, rng),
  ];
}

/** Virada do mês. */
export function actsMonth(c: Campaign): string[] {
  return alliancesMonth(c);
}

/** Missão da história concluída. */
export function actsMissionDone(c: Campaign, missionId: string, nodeId: string, chapter: number): string[] {
  const out = [...crownMissionDone(c, missionId, nodeId, chapter), ...baronKilled(c, missionId)];
  if (missionId === 'a5_5') {
    const line = startCaravan(c);
    if (line) out.push(line);
  }
  return out;
}

/** Por que a missão da história ainda não pode começar (ou null). */
export function actsMissionBlock(c: Campaign, missionId: string): string | null {
  return chapterOf(c) === 2 ? fugitiveBlock(c, missionId) : null;
}

/** Ajustes na batalha de uma missão da história. Devolve avisos para o jogador. */
export function actsStorySetup(c: Campaign, missionId: string, setup: BattleSetup, rng: Rng): string[] {
  return [useClues(c, missionId, setup), palacePrep(c, missionId, setup, rng), baronSetup(c, missionId, setup), warTableSetup(c, missionId, setup, rng)].filter((x): x is string => !!x);
}

/** Ajustes em qualquer batalha no mapa: tropas aliadas, mundo invertido. */
export function actsBattleMods(c: Campaign, setup: BattleSetup, s: Squad | undefined, rng: Rng): void {
  if (!s) return;
  allianceTroops(c, setup, s.at, rng);
  if (inVoid(c, s)) setup.inverted = true;
}

/** Depois de uma batalha com esquadrão. */
export function actsAfterBattle(c: Campaign, result: BattleResult, s: Squad, rng: Rng): string[] {
  const victory = result.outcome === 'victory';
  const humans = (result.defeated ?? []).filter((id) => DB.enemies[id]?.kind === 'human').length + (result.captured?.length ?? 0);
  frontsAfterBattle(c, s.at, victory);
  return fugitiveAfterBattle(c, s.at, victory, Math.max(humans, result.context.kind === 'contract' ? 1 : 0), rng);
}

/** Contrato de ato cumprido. */
export function actsContractDone(c: Campaign, ct: Contract, rng: Rng): string[] {
  switch (ct.actOp?.kind) {
    case 'ordem':
      return crownOrderDone(c, ct, rng);
    case 'frente':
      return frontOpDone(c, ct);
    case 'portal':
      return portalClosed(c, ct);
    case 'barao':
      return baronPostTaken(c, ct);
    default:
      return [];
  }
}

/** Região que vale para os encontros: Vazio, Terra Morta ou bioma trocado. */
export function actsRegion(c: Campaign, nodeId: string, s?: Squad): Region | null {
  if (s && inVoid(c, s)) return 'terra_morta';
  if (isBlighted(c, nodeId)) return 'terra_morta';
  return shiftedRegion(c, nodeId);
}

/** Lugar fechado pela sobreposição dos mundos. */
export function actsBlocked(c: Campaign, nodeId: string): boolean {
  return isClosed(c, nodeId);
}

/** O esquadrão está num lugar que vale como base (acampamento de expedição). */
export function actsCamp(c: Campaign, nodeId: string): boolean {
  return atCamp(c, nodeId);
}

/** No Vazio não há comida para comprar nem estalagem. */
export function actsNoFood(c: Campaign, s: Squad): boolean {
  return inVoid(c, s);
}

/** Ajustes do herói na ficha de batalha (Dom sombrio). */
export function actsUnitMods(c: Campaign, ch: Character, u: BattleUnit): void {
  voidUnitMods(c, ch, u);
}
