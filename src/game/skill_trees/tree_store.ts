import { REPO_TREES, applyTrees, type SkillTree } from '../data';

/** Edições locais das rosas das classes (só as árvores alteradas ficam salvas). */
const KEY = 'jogo:arvores';

function readEdits(): SkillTree[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SkillTree[]) : [];
  } catch {
    return [];
  }
}

/** Repositório com as árvores editadas no navegador por cima. */
export function mergeTrees(repo: SkillTree[], edits: SkillTree[]): SkillTree[] {
  const byId = new Map(edits.map((t) => [t.id, t]));
  const out = structuredClone(repo).map((t) => byId.get(t.id) ?? t);
  for (const t of edits) if (!repo.some((r) => r.id === t.id)) out.push(t);
  return out;
}

export function loadTrees(): SkillTree[] {
  return mergeTrees(REPO_TREES, readEdits());
}

export function saveTrees(list: SkillTree[]): void {
  const repo = new Map(REPO_TREES.map((t) => [t.id, JSON.stringify(t)]));
  const edits = list.filter((t) => repo.get(t.id) !== JSON.stringify(t));
  try {
    if (edits.length) localStorage.setItem(KEY, JSON.stringify(edits));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  applyTrees(list);
}

export function resetTrees(): SkillTree[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
  const list = structuredClone(REPO_TREES);
  applyTrees(list);
  return list;
}

export function hasTreeEdits(): boolean {
  return readEdits().length > 0;
}

export function initTrees(): void {
  try {
    applyTrees(loadTrees());
  } catch {
    // Edição local inválida (ex.: id repetido): volta para o repositório.
    applyTrees(resetTrees());
  }
}
