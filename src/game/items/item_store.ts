import { REPO_ITEMS, applyItems, type ItemDef } from '../data';

/** Edições locais do arsenal (só os itens alterados/criados e os ids excluídos ficam salvos). */
const KEY = 'jogo:arsenal';

interface StoredEdits {
  edits: ItemDef[];
  deleted: string[];
}

function readEdits(): StoredEdits | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredEdits;
    return { edits: data.edits ?? [], deleted: data.deleted ?? [] };
  } catch {
    return null;
  }
}

/** Junta o repositório com as edições locais (edições vencem; excluídos somem). */
export function mergeItems(repo: ItemDef[], stored: StoredEdits | null): ItemDef[] {
  const list = structuredClone(repo);
  if (!stored) return list;
  const byId = new Map(stored.edits.map((i) => [i.id, i]));
  const out = list.filter((i) => !stored.deleted.includes(i.id)).map((i) => byId.get(i.id) ?? i);
  const known = new Set(repo.map((i) => i.id));
  for (const i of stored.edits) if (!known.has(i.id) && !stored.deleted.includes(i.id)) out.push(i);
  return out;
}

export function loadItems(): ItemDef[] {
  return mergeItems(REPO_ITEMS, readEdits());
}

/** Salva as edições e aplica no jogo (lojas, equipamentos e batalhas passam a usar os novos valores). */
export function saveItems(list: ItemDef[]): void {
  const repo = new Map(REPO_ITEMS.map((i) => [i.id, JSON.stringify(i)]));
  const ids = new Set(list.map((i) => i.id));
  const stored: StoredEdits = {
    edits: list.filter((i) => repo.get(i.id) !== JSON.stringify(i)),
    deleted: REPO_ITEMS.filter((i) => !ids.has(i.id)).map((i) => i.id),
  };
  try {
    if (stored.edits.length || stored.deleted.length) localStorage.setItem(KEY, JSON.stringify(stored));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  applyItems(list);
}

export function resetItems(): ItemDef[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  const list = structuredClone(REPO_ITEMS);
  applyItems(list);
  return list;
}

export function hasItemEdits(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Arma nova com valores neutros. */
export function blankWeapon(id: string): ItemDef {
  return { id, name: 'Nova arma', slot: 'weapon', rarity: 'comum', price: 100, weaponType: 'espada', atk: 10, range: 1, description: '' };
}
