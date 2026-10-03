import type { SaveService } from '@core';
import type { BattleMap } from '../battle/map';
import type { BattleResult } from '../battle/types';
import { addLog, migrateCampaign, travelers, type Campaign } from '../world/campaign';
import { refundRemovedSkills } from '../rules/character';
import { difficultyLabel } from '../world/difficulty';
import { CHAPTER_TITLE, ensureStory } from '../world/story';

/** Espaço do primeiro save (mantém o nome antigo: saves existentes continuam valendo). */
export const SAVE_SLOT = 'campanha';
/** Espaços manuais e o automático. */
export const SAVE_SLOTS = [SAVE_SLOT, 'campanha_2', 'campanha_3'];
export const AUTO_SLOT = 'auto';

/** Estado global que atravessa cenas (campanha ativa, resultado de batalha, mapa do editor). */
export const store = {
  campaign: null as Campaign | null,
  battleResult: null as BattleResult | null,
  editorMap: null as BattleMap | null,
  encountersEnabled: true,
  /** Espaço em que a campanha atual é gravada. */
  slot: SAVE_SLOT,
};

export function saveGame(save: SaveService, slot = store.slot): void {
  if (!store.campaign) return;
  // Modo Ferro: um único save, sempre o da campanha.
  if (store.campaign.ironman) slot = store.slot;
  save.save(slot, store.campaign);
  store.slot = slot;
}

/** Salvamento automático: no espaço "auto" (no Modo Ferro, no próprio espaço da campanha). */
export function autosave(save: SaveService): void {
  if (!store.campaign) return;
  if (store.campaign.ironman) save.save(store.slot, store.campaign);
  else save.save(AUTO_SLOT, store.campaign);
}

export interface SlotInfo {
  slot: string;
  savedAt: string;
  label: string;
  ironman: boolean;
}

/** Resumo de um espaço (para as telas de carregar e salvar); null se vazio. */
export function slotInfo(save: SaveService, slot: string): SlotInfo | null {
  const savedAt = save.savedAt(slot);
  if (!savedAt) return null;
  try {
    const c = save.load<Campaign>(slot);
    if (!c) return null;
    const st = c.story;
    const chapter = CHAPTER_TITLE[st?.chapter ?? 0]?.split(' — ')[0] ?? `Ato ${c.act}`;
    const commander = c.commanderName ?? (c.commanderId && c.roster[c.commanderId]?.name) ?? 'Comandante';
    return { slot, savedAt, ironman: !!c.ironman, label: `${commander} · ${st?.ended ? 'Campanha concluída' : chapter} · Dia ${Math.floor(c.hours / 24) + 1} · ${difficultyLabel(c)}` };
  } catch {
    return { slot, savedAt, ironman: false, label: 'Save ilegível' };
  }
}

/** Espaço mais recente (para "Continuar"). */
export function latestSlot(save: SaveService): string | null {
  let best: string | null = null;
  let at = '';
  for (const s of [...SAVE_SLOTS, AUTO_SLOT]) {
    const t = save.savedAt(s);
    if (t && t > at) {
      at = t;
      best = s;
    }
  }
  return best;
}

export function loadGame(save: SaveService, slot?: string): boolean {
  const from = slot ?? latestSlot(save);
  if (!from) return false;
  const c = save.load<Campaign>(from);
  if (!c) return false;
  for (const ch of Object.values(c.roster)) refundRemovedSkills(ch);
  store.campaign = migrateCampaign(c);
  ensureStory(store.campaign);
  // Carregar o automático continua gravando no primeiro espaço manual.
  store.slot = from === AUTO_SLOT ? SAVE_SLOT : from;
  // Modo Ferro: quem fechou o jogo no meio da batalha recuou dela.
  if (c.ironman && c.inBattle) {
    const sq = c.squads.find((s) => s.id === c.inBattle);
    for (const ch of sq ? travelers(c, sq) : []) ch.woundDays = Math.max(ch.woundDays, 3);
    addLog(c, '⛓ Modo Ferro: a batalha foi abandonada. O esquadrão recuou ferido.');
    delete c.inBattle;
    save.save(store.slot, c);
  }
  return true;
}
