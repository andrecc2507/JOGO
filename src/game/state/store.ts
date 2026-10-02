import type { SaveService } from '@core';
import type { BattleMap } from '../battle/map';
import type { BattleResult } from '../battle/types';
import { migrateCampaign, type Campaign } from '../world/campaign';
import { refundRemovedSkills } from '../rules/character';

export const SAVE_SLOT = 'campanha';

/** Estado global que atravessa cenas (campanha ativa, resultado de batalha, mapa do editor). */
export const store = {
  campaign: null as Campaign | null,
  battleResult: null as BattleResult | null,
  editorMap: null as BattleMap | null,
  encountersEnabled: true,
};

export function saveGame(save: SaveService): void {
  if (store.campaign) save.save(SAVE_SLOT, store.campaign);
}

export function loadGame(save: SaveService): boolean {
  const c = save.load<Campaign>(SAVE_SLOT);
  if (!c) return false;
  for (const ch of Object.values(c.roster)) refundRemovedSkills(ch);
  store.campaign = migrateCampaign(c);
  return true;
}
