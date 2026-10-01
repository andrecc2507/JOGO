import { DB, type ClassId, type SkillTree, type TreeNode } from '../data';

/**
 * Regras da rosa das classes (puro). Liberdade total: qualquer evolução da própria classe pode
 * receber pontos; híbridas pedem ao menos 1 habilidade em cada evolução vizinha e ramos (ex.:
 * Caminho do Fogo) pedem 1 habilidade no nó de origem.
 */

/** Quem aprende: só o que importa para a árvore. */
export interface Learner {
  classId: ClassId;
  level: number;
  skills: string[];
}

export function treeOf(classId: ClassId): SkillTree | undefined {
  return DB.trees[classId];
}

/** Ids de todas as habilidades de um nó (novas e antigas). */
export function nodeSkillIds(node: TreeNode): string[] {
  return [...(node.legacySkills ?? []), ...node.skills.map((s) => s.id)];
}

export function hasSkillIn(c: Learner, node: TreeNode | undefined): boolean {
  return !!node && nodeSkillIds(node).some((id) => c.skills.includes(id));
}

export function nodeUnlocked(c: Learner, tree: SkillTree, node: TreeNode): boolean {
  if (node.type === 'base' || node.type === 'evolucao') return true;
  return node.parents.every((p) => hasSkillIn(c, tree.nodes.find((n) => n.id === p)));
}

/** Motivo pelo qual a habilidade não pode ser aprendida agora (ou null se pode). */
export function lockReason(c: Learner, skillId: string): string | null {
  if (c.skills.includes(skillId)) return 'já aprendida';
  const tree = treeOf(c.classId);
  const node = tree?.nodes.find((n) => nodeSkillIds(n).includes(skillId));
  if (!tree || !node) return DB.classes[c.classId]?.skills.includes(skillId) ? null : 'não é da sua classe';
  if (!nodeUnlocked(c, tree, node)) {
    const names = node.parents.map((p) => tree.nodes.find((n) => n.id === p)?.name ?? p);
    return `requer 1 habilidade em ${names.join(' e ')}`;
  }
  const req = DB.skills[skillId]?.levelReq ?? 1;
  if (c.level < req) return `requer NV ${req}`;
  return null;
}

/** Tudo o que a classe pode aprender (bloqueado ou não), na ordem da árvore. */
export function classSkillIds(classId: ClassId): string[] {
  const tree = treeOf(classId);
  const out = [...(DB.classes[classId]?.skills ?? [])];
  for (const n of tree?.nodes ?? []) for (const id of nodeSkillIds(n)) if (!out.includes(id)) out.push(id);
  return out;
}

/** MP máximo extra dos nós em que o personagem já tem habilidade. */
export function treeMpBonus(c: Learner): number {
  const tree = treeOf(c.classId);
  return (tree?.nodes ?? []).reduce((sum, n) => sum + (n.mpBonus && hasSkillIn(c, n) ? n.mpBonus : 0), 0);
}
