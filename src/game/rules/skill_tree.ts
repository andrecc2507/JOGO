import { DB, type ClassId, type NodeBonus, type SkillTree, type TreeNode, type TreeSkill } from '../data';

/**
 * Regras da rosa das classes (puro). Cada subclasse é uma teia: uma fila de habilidades que sai do
 * centro (classe base). Evoluções começam livres; híbridas abrem com a habilidade `unlockAt` (padrão 3)
 * de cada teia de origem e ramos com a última da teia de origem. Dentro da teia, cada habilidade pede a anterior (ou os
 * pré-requisitos escritos na ficha). Os pontos ganhos em batalha aprendem a habilidade (nível 1) e a
 * fortalecem até o nível 5. A classe base não tem habilidades a aprender: dá uma passiva inata.
 */

export const SKILL_MAX_RANK = 5;
/** Habilidade, na teia de cada pai, que abre híbridas e ramos. */
export const DEFAULT_UNLOCK_AT = 3;

/**
 * Multiplicador de poder (dano, cura, bônus das passivas) por nível. Segue o exemplo do design —
 * Estocada 1,2× da Força no Nv 1, 1,3× no Nv 2, 1,4× no Nv 3… — relativo ao Nv 1.
 */
export function rankMult(rank: number): number {
  const r = Math.max(1, Math.min(SKILL_MAX_RANK, rank));
  return (1.1 + 0.1 * r) / 1.2;
}

/** Quem aprende: só o que importa para a árvore. */
export interface Learner {
  classId: ClassId;
  level: number;
  skills: string[];
  /** Nível de cada habilidade aprendida (ausente = 1). */
  skillRanks?: Record<string, number>;
}

export function treeOf(classId: ClassId): SkillTree | undefined {
  return DB.trees[classId];
}

export function nodeSkillIds(node: TreeNode): string[] {
  return node.skills.map((s) => s.id);
}

/** Fila da teia: as habilidades que se compram (sem as concedidas por outra). */
export function chainOf(node: TreeNode): TreeSkill[] {
  return node.skills.filter((s) => !s.grantedBy);
}

/** Habilidades concedidas pelas que o personagem aprendeu (ex.: Iniciado → seis raios). */
export function grantedSkillIds(classId: ClassId, learned: string[]): string[] {
  const out: string[] = [];
  for (const n of treeOf(classId)?.nodes ?? []) for (const s of n.skills) if (s.grantedBy && learned.includes(s.grantedBy) && !learned.includes(s.id)) out.push(s.id);
  return out;
}

/** Passivas inatas da classe (habilidades do nó base): valem sempre, sem aprender. */
export function innateSkillIds(classId: ClassId): string[] {
  return (treeOf(classId)?.nodes ?? []).filter((n) => n.type === 'base').flatMap(nodeSkillIds);
}

export function rankOf(c: Learner, skillId: string): number {
  if (!c.skills.includes(skillId)) return 0;
  return c.skillRanks?.[skillId] ?? 1;
}

export function hasSkillIn(c: Learner, node: TreeNode | undefined): boolean {
  return !!node && nodeSkillIds(node).some((id) => c.skills.includes(id));
}

function findSkill(tree: SkillTree, skillId: string): { node: TreeNode; skill: TreeSkill; index: number } | null {
  for (const node of tree.nodes) {
    const chain = chainOf(node);
    const index = chain.findIndex((s) => s.id === skillId);
    if (index >= 0) return { node, skill: chain[index]!, index };
    const granted = node.skills.find((s) => s.id === skillId);
    if (granted) return { node, skill: granted, index: -1 };
  }
  return null;
}

/**
 * Habilidade que abre a teia filha dentro da teia `parent`: a `unlockAt`ª (padrão: 3ª para híbridas,
 * a última da origem para ramos — os caminhos do Elementalista saem da ponta da teia dele).
 */
export function unlockSkillOf(parent: TreeNode, child: TreeNode): TreeSkill | undefined {
  const chain = chainOf(parent);
  const at = child.unlockAt ?? (child.type === 'ramo' ? chain.length : DEFAULT_UNLOCK_AT);
  return chain[Math.min(at, chain.length) - 1];
}

export function nodeUnlocked(c: Learner, tree: SkillTree, node: TreeNode): boolean {
  if (node.type === 'base' || node.type === 'evolucao') return true;
  return node.parents.every((p) => {
    const parent = tree.nodes.find((n) => n.id === p);
    const key = parent && unlockSkillOf(parent, node);
    return !!key && c.skills.includes(key.id);
  });
}

/** Pré-requisitos de uma habilidade: os da ficha ou, por padrão, a anterior na mesma teia. */
export function prerequisites(tree: SkillTree, skillId: string): string[] {
  const f = findSkill(tree, skillId);
  if (!f) return [];
  if (f.skill.requires) return f.skill.requires;
  return f.index > 0 ? [chainOf(f.node)[f.index - 1]!.id] : [];
}

/** Motivo pelo qual a habilidade não pode ser aprendida ou fortalecida agora (ou null se pode). */
export function lockReason(c: Learner, skillId: string): string | null {
  const tree = treeOf(c.classId);
  const f = tree && findSkill(tree, skillId);
  if (!tree || !f) return 'não é da sua classe';
  if (f.node.type === 'base') return 'passiva inata da classe';
  if (f.skill.grantedBy) return `vem com ${DB.skills[f.skill.grantedBy]?.name ?? f.skill.grantedBy}`;
  const rank = rankOf(c, skillId);
  if (rank >= SKILL_MAX_RANK) return 'nível máximo';
  if (rank > 0) return null;
  if (!nodeUnlocked(c, tree, f.node)) {
    const parts = f.node.parents.map((p) => {
      const parent = tree.nodes.find((n) => n.id === p);
      const key = parent && unlockSkillOf(parent, f.node);
      return parent && key ? `${key.name} (${parent.name})` : p;
    });
    return `requer ${parts.join(' e ')}`;
  }
  const missing = prerequisites(tree, skillId).filter((id) => !c.skills.includes(id));
  if (missing.length) return `requer ${missing.map((id) => DB.skills[id]?.name ?? id).join(' e ')}`;
  const req = f.skill.levelReq ?? 1;
  if (c.level < req) return `requer NV ${req}`;
  return null;
}

/** Tudo o que a classe pode aprender ou fortalecer (bloqueado ou não), na ordem da árvore. */
export function classSkillIds(classId: ClassId): string[] {
  return (treeOf(classId)?.nodes ?? []).filter((n) => n.type !== 'base').flatMap((n) => chainOf(n).map((s) => s.id));
}

function nodeActive(c: Learner, n: TreeNode): boolean {
  return n.type === 'base' || hasSkillIn(c, n);
}

/** MP máximo extra dos nós ativos (classe base sempre; os outros com 1 habilidade aprendida). */
export function treeMpBonus(c: Learner): number {
  return (treeOf(c.classId)?.nodes ?? []).reduce((sum, n) => sum + (n.mpBonus && nodeActive(c, n) ? n.mpBonus : 0), 0);
}

/** Soma dos bônus percentuais dos nós ativos. */
export function treeBonus(c: Learner): Required<NodeBonus> {
  const out: Required<NodeBonus> = { hp: 0, mp: 0, accuracy: 0, speed: 0, magic: 0, str: 0, dex: 0, int: 0 };
  for (const n of treeOf(c.classId)?.nodes ?? []) {
    if (!n.bonus || !nodeActive(c, n)) continue;
    for (const k of Object.keys(out) as (keyof NodeBonus)[]) out[k] += n.bonus[k] ?? 0;
  }
  return out;
}
