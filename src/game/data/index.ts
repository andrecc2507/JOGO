import type { DataRegistry } from '@core';
import classes from './classes/classes.json';
import combos from './skills/combos.json';
import skills from './skills/skills.json';
import items from './items/items.json';
import enemies from './enemies/enemies.json';
import countries from './world/countries.json';
import creatures from './bestiary/creatures.json';
import materials from './materials/materials.json';
import treeLadrao from './skills/trees/ladrao.json';
import treeMago from './skills/trees/mago.json';
import treeArqueiro from './skills/trees/arqueiro.json';
import treeClerigo from './skills/trees/clerigo.json';
import treeGuerreiro from './skills/trees/guerreiro.json';
import type { ClassDef, ClassId, ComboDef, CountryDef, CreatureDef, CreatureSkill, EnemyDef, ItemDef, MaterialDef, MaterialFamily, Rarity, SkillDef, SkillFx, SkillTree, TreeNode, TreeSkill } from './types';

export * from './types';

function index<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of list) {
    if (out[item.id]) throw new Error(`Id duplicado: ${item.id}`);
    out[item.id] = item;
  }
  return out;
}

/**
 * Acesso direto e tipado ao conteúdo estático. Módulos de regras (puros e testáveis)
 * usam `DB`; cenas também podem usar `ctx.data` (mesmo conteúdo).
 */
export const DB = {
  classes: index(classes as ClassDef[]) as Record<ClassId, ClassDef>,
  skills: index(skills as SkillDef[]),
  combos: index(combos as ComboDef[]),
  items: index(items as ItemDef[]),
  enemies: index(enemies as EnemyDef[]),
  countries: countries as CountryDef[],
  /** Bestiário ativo (repositório + edições locais). */
  creatures: {} as Record<string, CreatureDef>,
  /** Rosas das classes (árvores de habilidades) por classe. */
  trees: {} as Partial<Record<ClassId, SkillTree>>,
  /** Materiais de drop (repositório + edições locais). */
  materials: {} as Record<string, MaterialDef>,
};

/** Famílias de material, valores padrão de drop por raridade e preços de troféu/joia (data/materials). */
export const MATERIAL_FAMILIES = materials.families as MaterialFamily[];
export const DROP_DEFAULTS = materials.defaults as Record<Rarity, { common: [number, number, number]; rare: number; elemental: number; trophy: boolean; jewel: number }>;
export const DROP_PRICES = materials.prices as { trophy: number; jewel: number };
export const REPO_MATERIALS = materials.materials as MaterialDef[];

/** Instala (ou reinstala) a lista de materiais. */
export function applyMaterials(list: MaterialDef[]): void {
  DB.materials = {};
  for (const m of list) DB.materials[m.id] = m;
}
applyMaterials(REPO_MATERIALS);

const KIND_MAP: Record<CreatureSkill['kind'], SkillDef['kind']> = {
  physical: 'physical',
  ranged: 'ranged',
  magic: 'magic',
  buff: 'buff',
  heal: 'heal',
  utility: 'utility',
  summon: 'utility',
  passive: 'utility',
  reaction: 'utility',
};

/** Alvo padrão de uma habilidade de criatura conforme o tipo e o formato. */
export function creatureSkillTarget(s: CreatureSkill): SkillDef['target'] {
  if (s.target) return s.target;
  if (s.kind === 'physical' || s.kind === 'ranged' || s.kind === 'magic') return s.fx?.randomTargets || s.range === 0 ? 'self' : s.shape === 'cone' || s.shape === 'line' ? 'tile' : 'enemy';
  if (s.kind === 'buff' || s.kind === 'heal') return s.range > 0 ? 'ally' : 'self';
  if (s.fx?.teleport) return 'tile';
  return 'self';
}

/** Converte uma habilidade de criatura (ou de árvore) no formato geral de habilidades do motor. */
export function creatureSkillToSkill(s: CreatureSkill, classId: ClassId = 'fera', mp = 0): SkillDef {
  const fx: SkillFx = { ...(s.fx ?? {}) };
  if (s.kind === 'reaction' && !s.react) throw new Error(`Reação sem gatilho: ${s.id}`);
  return {
    id: s.id,
    name: s.name,
    classId,
    mp,
    range: s.range,
    target: creatureSkillTarget(s),
    shape: s.shape ?? (s.radius ? 'radius' : 'single'),
    radius: s.radius,
    kind: KIND_MAP[s.kind],
    power: s.power,
    element: s.element,
    accuracy: s.accuracy,
    cooldown: s.cooldown,
    passive: s.kind === 'passive' || s.kind === 'reaction',
    status: s.status,
    fx: s.kind === 'reaction' ? { ...fx, react: s.react } : fx,
    value: s.value,
    anim: s.anim,
    scaling: s.scaling,
    timeMult: s.timeMult,
    description: s.description,
  };
}

/** Ficha do bestiário → definição de inimigo usada por encontros e batalhas. */
export function creatureToEnemy(c: CreatureDef): EnemyDef {
  return {
    id: c.id,
    name: c.name,
    kind: 'beast',
    biomes: c.biomes,
    tier: c.rarity,
    tameable: c.tameable,
    attrs: c.attrs,
    hp: c.hp,
    atk: Math.max(1, Math.round(c.attrs.str * 0.8)),
    range: 1,
    move: c.move,
    element: c.element === 'neutro' ? undefined : c.element,
    skills: c.skills.map((s) => s.id),
    color: c.palette.W ?? Object.values(c.palette)[0] ?? '#888',
    size: c.size,
    description: c.description,
    levelMin: c.levelMin,
    levelMax: c.levelMax,
    xp: c.xp,
    sprite: c.sprite,
    palette: c.palette,
    family: c.family,
    summonOnly: c.summonOnly,
    fly: c.fly,
  };
}

/** Itens do repositório (armas, armaduras, acessórios e itens de campo). */
export const REPO_ITEMS = items as ItemDef[];

/** Instala (ou reinstala) a lista de itens no banco de dados do jogo. */
export function applyItems(list: ItemDef[]): void {
  DB.items = {};
  for (const it of list) DB.items[it.id] = it;
}

/** Instala (ou reinstala) o bestiário no banco de dados do jogo. */
export function applyCreatures(list: CreatureDef[]): void {
  for (const id of Object.keys(DB.creatures)) delete DB.enemies[id];
  DB.creatures = {};
  for (const c of list) {
    DB.creatures[c.id] = c;
    DB.enemies[c.id] = creatureToEnemy(c);
    for (const s of c.skills) DB.skills[s.id] = creatureSkillToSkill(s);
  }
}

/** Habilidade de árvore → habilidade do motor. */
export function treeSkillToSkill(s: TreeSkill, tree: SkillTree, node: TreeNode): SkillDef {
  const def = creatureSkillToSkill(s, tree.classId, s.mp);
  // Escala da subclasse (teia) pelo tipo, se a habilidade não tiver a própria.
  const byKind = s.kind === 'physical' || s.kind === 'ranged' ? node.scaling?.physical : s.kind === 'magic' ? node.scaling?.magic : s.kind === 'heal' ? node.scaling?.heal : undefined;
  return { ...def, scaling: s.scaling ?? byKind, tree: node.id, ultimate: s.ultimate, levelReq: s.levelReq };
}

/** Ids antigos de árvores instaladas (para limpar ao reinstalar). */
const installedTreeSkills = new Set<string>();

/** Instala (ou reinstala) as rosas das classes no banco de dados do jogo. */
export function applyTrees(list: SkillTree[]): void {
  for (const id of installedTreeSkills) delete DB.skills[id];
  installedTreeSkills.clear();
  DB.trees = {};
  for (const t of list) {
    DB.trees[t.classId] = t;
    for (const n of t.nodes)
      for (const s of n.skills) {
        if (DB.skills[s.id] && !installedTreeSkills.has(s.id)) throw new Error(`Id de habilidade repetido: ${s.id}`);
        DB.skills[s.id] = treeSkillToSkill(s, t, n);
        installedTreeSkills.add(s.id);
      }
  }
}

/** Nó da árvore ao qual uma habilidade pertence. */
export function nodeOfSkill(skillId: string): TreeNode | undefined {
  for (const t of Object.values(DB.trees))
    for (const n of t!.nodes) if (n.skills.some((s) => s.id === skillId)) return n;
  return undefined;
}

export const REPO_TREES = [treeArqueiro, treeClerigo, treeGuerreiro, treeLadrao, treeMago] as unknown as SkillTree[];

export const REPO_CREATURES = creatures as unknown as CreatureDef[];
applyCreatures(REPO_CREATURES);
applyTrees(REPO_TREES);

export function skill(id: string): SkillDef {
  const s = DB.skills[id];
  if (!s) throw new Error(`Habilidade desconhecida: ${id}`);
  return s;
}

export function item(id: string): ItemDef {
  const i = DB.items[id];
  if (!i) throw new Error(`Item desconhecido: ${id}`);
  return i;
}

export function registerGameData(data: DataRegistry): void {
  data.register('classes', classes as ClassDef[]);
  data.register('skills', skills as SkillDef[]);
  data.register('combos', combos as ComboDef[]);
  data.register('items', items as ItemDef[]);
  data.register('enemies', enemies as EnemyDef[]);
  data.register('countries', countries as CountryDef[]);
  data.register('creatures', Object.values(DB.creatures));
  data.register('trees', Object.values(DB.trees) as SkillTree[]);
  data.register('materials', Object.values(DB.materials));
}
