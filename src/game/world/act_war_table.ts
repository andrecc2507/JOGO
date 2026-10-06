import type { Rng } from '@core';
import type { BattleSetup } from '../battle/types';
import type { ClassId } from '../data';
import { FACTIONS, REP, rep, type Faction } from './politics';
import { mySide } from './commander';
import { ensureWorld } from './territory';
import { ACTS, allyUnit, ensureActs } from './acts_state';
import { averageLevel, type Campaign } from './campaign';

/**
 * Ato 8 (marcha final). Tudo o que foi juntado vira pontos de força — alianças, companheiros da
 * história, facções amigas, postos e território — e o comandante distribui entre as frentes. Frente
 * com força suficiente luta com aliados e com uma onda a menos; cada frente vencida também manda
 * aliados para as batalhas finais.
 */
const WT = ACTS.warTable;
export const WAR_FRONTS = WT.fronts;

export function warPoints(c: Campaign): { total: number; parts: string[] } {
  const a = ensureActs(c);
  const P = WT.points;
  const companions = Object.values(c.roster).filter((ch) => ch.storyId).length;
  const friends = (Object.keys(FACTIONS) as Faction[]).filter((f) => rep(c, f) >= REP.influenceAt).length;
  const posts = Object.keys(c.outposts ?? {}).length;
  const side = mySide(c);
  const land = Object.values(ensureWorld(c).provinces).filter((st) => side.includes(st.owner) && st.owner !== 'livre').length;
  const parts = [
    `alianças ${a.alliances.length}×${P.alliance}`,
    `companheiros ${companions}×${P.companion}`,
    `facções amigas ${friends}×${P.repAlly}`,
    `postos ${posts}×${P.outpost}`,
    `províncias ${land}×${P.provinces}`,
  ];
  const total = Math.floor(a.alliances.length * P.alliance + companions * P.companion + friends * P.repAlly + posts * P.outpost + land * P.provinces);
  return { total, parts };
}

export function allocated(c: Campaign): number {
  return Object.values(ensureActs(c).warTable).reduce((x, y) => x + y, 0);
}

/** Muda a força numa frente (sem passar do total). */
export function allocate(c: Campaign, front: string, delta: number): boolean {
  const a = ensureActs(c);
  const cur = a.warTable[front] ?? 0;
  const next = Math.max(0, cur + delta);
  if (delta > 0 && allocated(c) + delta > warPoints(c).total) return false;
  a.warTable[front] = next;
  return true;
}

export function frontWon(c: Campaign, frontId: string): boolean {
  const f = WT.fronts.find((x) => x.id === frontId);
  return !!f && (ensureActs(c).warTable[f.id] ?? 0) >= f.need;
}

/** Batalhas do Ato 8: frentes bem servidas e o peso das frentes vencidas na batalha final. */
export function warTableSetup(c: Campaign, missionId: string, setup: BattleSetup, rng: Rng): string | null {
  const lv = averageLevel(c);
  const front = WT.fronts.find((f) => f.mission === missionId);
  if (front) {
    if (!frontWon(c, front.id)) return `${front.label}: força insuficiente na mesa de guerra.`;
    setup.waves = (setup.waves ?? []).slice(1);
    for (let i = 0; i < WT.wonAllies; i++) setup.allies = [...(setup.allies ?? []), allyUnit(rng, (['guerreiro', 'arqueiro', 'clerigo'] as ClassId[])[i % 3]!, lv, 'Tropa da aliança')];
    return `${front.label}: as forças da mesa de guerra chegaram (aliados e uma onda a menos).`;
  }
  if (WT.finalMissions.includes(missionId)) {
    const won = WT.fronts.filter((f) => frontWon(c, f.id)).length;
    if (!won) return null;
    for (let i = 0; i < won; i++) setup.allies = [...(setup.allies ?? []), allyUnit(rng, (['guerreiro', 'mago', 'clerigo'] as ClassId[])[i % 3]!, lv + 1, 'Veterano das frentes')];
    return `${won} frente(s) vencida(s) mandaram veteranos para a batalha final.`;
  }
  return null;
}
