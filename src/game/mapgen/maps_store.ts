import type { BattleMap } from '../battle/map';

const KEY = 'jogo:maps';

/** Mapas feitos no editor, guardados no navegador. */
export function loadMaps(): Record<string, BattleMap> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, BattleMap>;
  } catch {
    return {};
  }
}

export function saveMap(map: BattleMap): void {
  const all = loadMaps();
  all[map.id] = map;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento disponível */
  }
}

export function deleteMap(id: string): void {
  const all = loadMaps();
  delete all[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento disponível */
  }
}

export function exportMap(map: BattleMap): void {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${map.name.replace(/[^\w-]+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function isBattleMap(v: unknown): v is BattleMap {
  const m = v as BattleMap;
  return !!m && typeof m.w === 'number' && typeof m.h === 'number' && Array.isArray(m.tiles) && m.tiles.length === m.w * m.h;
}
