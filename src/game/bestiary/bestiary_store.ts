import { REPO_CREATURES, applyCreatures, type CreatureDef } from '../data';

const KEY = 'jogo:bestiario';

/** Formato salvo: só as criaturas editadas/criadas e os ids excluídos. */
interface StoredEdits {
  edits: CreatureDef[];
  deleted: string[];
}

/** Converte fichas salvas por versões antigas do editor. */
function migrate(c: CreatureDef): CreatureDef {
  for (const s of c.skills as (CreatureDef['skills'][number] & { effect?: string })[]) {
    if (s.effect === 'hide_in_snow') s.fx = { ...s.fx, hide: 'snow' };
    if (s.effect === 'snow_evasion') s.fx = { ...s.fx, evasion: s.value ?? 25, when: 'snow' };
    delete s.effect;
  }
  return c;
}

function readEdits(): StoredEdits | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CreatureDef[] | StoredEdits;
    // Versão antiga: lista completa (só existia a Lebre-Ártica) — vira edições.
    if (Array.isArray(data)) return { edits: data.map(migrate), deleted: [] };
    return { edits: data.edits.map(migrate), deleted: data.deleted ?? [] };
  } catch {
    return null;
  }
}

/** Junta o bestiário do repositório com as edições locais (edições vencem; excluídas somem). */
export function mergeBestiary(repo: CreatureDef[], stored: StoredEdits | null): CreatureDef[] {
  const list = structuredClone(repo);
  if (!stored) return list;
  const byId = new Map(stored.edits.map((c) => [c.id, c]));
  const out = list.filter((c) => !stored.deleted.includes(c.id)).map((c) => byId.get(c.id) ?? c);
  const known = new Set(repo.map((c) => c.id));
  for (const c of stored.edits) if (!known.has(c.id) && !stored.deleted.includes(c.id)) out.push(c);
  return out;
}

/** Bestiário ativo: repositório + edições salvas no navegador. */
export function loadBestiary(): CreatureDef[] {
  return mergeBestiary(REPO_CREATURES, readEdits());
}

/** Salva as edições e aplica no jogo (encontros e batalhas passam a usar os novos valores). */
export function saveBestiary(list: CreatureDef[]): void {
  const repo = new Map(REPO_CREATURES.map((c) => [c.id, JSON.stringify(c)]));
  const ids = new Set(list.map((c) => c.id));
  const stored: StoredEdits = {
    edits: list.filter((c) => repo.get(c.id) !== JSON.stringify(c)),
    deleted: REPO_CREATURES.filter((c) => !ids.has(c.id)).map((c) => c.id),
  };
  try {
    if (stored.edits.length || stored.deleted.length) localStorage.setItem(KEY, JSON.stringify(stored));
    else localStorage.removeItem(KEY);
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
    attrs: { str: 5, dex: 5, spd: 10, int: 1, vit: 5 },
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
