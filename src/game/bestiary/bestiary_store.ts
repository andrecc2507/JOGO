import { REPO_CREATURES, applyCreatures, type CreatureDef } from '../data';

const KEY = 'jogo:bestiario';

/** Bestiário ativo: edições salvas no navegador ou, sem edições, o do repositório. */
export function loadBestiary(): CreatureDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as CreatureDef[];
  } catch {
    /* sem armazenamento */
  }
  return structuredClone(REPO_CREATURES);
}

/** Salva as edições e aplica no jogo (encontros e batalhas passam a usar os novos valores). */
export function saveBestiary(list: CreatureDef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento */
  }
  applyCreatures(list);
}

export function resetBestiary(): CreatureDef[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  const list = structuredClone(REPO_CREATURES);
  applyCreatures(list);
  return list;
}

export function hasLocalEdits(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function initBestiary(): void {
  applyCreatures(loadBestiary());
}

export function blankCreature(n: number): CreatureDef {
  return {
    id: `criatura_${Date.now().toString(36)}`,
    name: `Nova criatura ${n}`,
    description: '',
    rarity: 'comum',
    levelMin: 1,
    levelMax: 10,
    hp: 30,
    element: 'neutro',
    move: 6,
    size: 1,
    xp: 10,
    attrs: { str: 5, dex: 5, int: 1, vit: 5, con: 5, spd: 10 },
    biomes: ['floresta'],
    tameable: false,
    skills: [],
    sprite: [
      '................',
      '..........HH....',
      '.........HCCC...',
      '........CCECCN..',
      '..C....CCCCCC...',
      '..CCCCCCCCCC....',
      '.CCCCCCCCCCC....',
      '.CCCCCCCCCCC....',
      '..DD.DD..DD.DD..',
      '..DD.DD..DD.DD..',
      '..KK.KK..KK.KK..',
    ],
    palette: { C: '#8d6e63', D: '#4e342e', H: '#5d4037', E: '#1b1b24', N: '#e0c0a0', K: '#2d2018' },
  };
}
