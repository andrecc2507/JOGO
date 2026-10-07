import { REPO_MATERIALS, applyMaterials, type MaterialDef } from '../data';

/** Edições locais dos materiais (só os itens alterados/criados e os ids excluídos ficam salvos). */
const KEY = 'jogo:materiais';

interface StoredEdits {
  edits: MaterialDef[];
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
export function mergeMaterials(repo: MaterialDef[], stored: StoredEdits | null): MaterialDef[] {
  const list = structuredClone(repo);
  if (!stored) return list;
  const byId = new Map(stored.edits.map((i) => [i.id, i]));
  const out = list.filter((i) => !stored.deleted.includes(i.id)).map((i) => byId.get(i.id) ?? i);
  const known = new Set(repo.map((i) => i.id));
  for (const i of stored.edits) if (!known.has(i.id) && !stored.deleted.includes(i.id)) out.push(i);
  return out;
}

export function loadMaterials(): MaterialDef[] {
  return mergeMaterials(REPO_MATERIALS, readEdits());
}

/** Salva as edições e aplica no jogo (venda e telas passam a usar os novos valores). */
export function saveMaterials(list: MaterialDef[]): void {
  const repo = new Map(REPO_MATERIALS.map((i) => [i.id, JSON.stringify(i)]));
  const ids = new Set(list.map((i) => i.id));
  const stored: StoredEdits = {
    edits: list.filter((i) => repo.get(i.id) !== JSON.stringify(i)),
    deleted: REPO_MATERIALS.filter((i) => !ids.has(i.id)).map((i) => i.id),
  };
  try {
    if (stored.edits.length || stored.deleted.length) localStorage.setItem(KEY, JSON.stringify(stored));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  applyMaterials(list);
}

export function resetMaterials(): MaterialDef[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  const list = structuredClone(REPO_MATERIALS);
  applyMaterials(list);
  return list;
}

export function hasMaterialEdits(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

