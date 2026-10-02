import type { Rng } from '@core';
import { DB, DROP_DEFAULTS, DROP_PRICES, MATERIAL_FAMILIES, type CreatureDef, type CreatureDrops, type CreatureElement, type DropEntry, type MaterialDef, type Rarity } from '../data';

/**
 * Drops das feras (puro): tabela padrão por raridade, valor esperado por abate, de onde vem cada
 * material e o sorteio ao derrotar. Números em data/materials/materials.json; design em
 * docs/design/base_pesquisa_craft.md.
 */

/** Material elemental de um elemento (ou undefined para neutro). */
export function elementalMaterial(element: CreatureElement): MaterialDef | undefined {
  return Object.values(DB.materials).find((m) => m.kind === 'elemental' && m.element === element);
}

/** Tabela padrão: material comum e raro da família + elemental do elemento, com as chances da raridade. */
export function defaultDrops(rarity: Rarity, element: CreatureElement, family: string, jewelType: CreatureDrops['jewel']['type'] = 'indefinida'): CreatureDrops {
  const d = DROP_DEFAULTS[rarity];
  const fam = MATERIAL_FAMILIES.find((f) => f.id === family) ?? MATERIAL_FAMILIES[0]!;
  const table: DropEntry[] = [
    { material: fam.common, chance: d.common[0], min: d.common[1], max: d.common[2] },
    { material: fam.rare, chance: d.rare, min: 1, max: 1 },
  ];
  const el = elementalMaterial(element);
  if (el) table.push({ material: el.id, chance: d.elemental, min: 1, max: 1 });
  return { family: fam.id, table, trophy: d.trophy, jewel: { chance: d.jewel, type: jewelType } };
}

export function trophyName(c: Pick<CreatureDef, 'name'>): string {
  return `Troféu: ${c.name}`;
}

export function jewelName(c: Pick<CreatureDef, 'name'>): string {
  return `Joia da alma: ${c.name}`;
}

/** Ouro esperado por abate se tudo fosse vendido (materiais + troféu + joia). */
export function expectedValue(drops: CreatureDrops | undefined): number {
  if (!drops) return 0;
  let v = 0;
  for (const e of drops.table) v += e.chance * ((e.min + e.max) / 2) * (DB.materials[e.material]?.price ?? 0);
  if (drops.trophy) v += DROP_PRICES.trophy;
  v += drops.jewel.chance * DROP_PRICES.jewel;
  return Math.round(v * 10) / 10;
}

/** Quem deixa um material, com a linha da tabela de cada um. */
export function materialSources(materialId: string, creatures: CreatureDef[]): { creature: CreatureDef; entry: DropEntry }[] {
  const out: { creature: CreatureDef; entry: DropEntry }[] = [];
  for (const c of creatures) for (const e of c.drops?.table ?? []) if (e.material === materialId) out.push({ creature: c, entry: e });
  return out.sort((a, b) => b.entry.chance - a.entry.chance);
}

// ───────────────────────────── espólio (chaves do estoque) ─────────────────────────────

/**
 * O estoque de espólio guarda materiais pelo id e, para troféus e joias da alma, chaves com a espécie:
 * `trofeu:<criatura>` e `joia:<criatura>`.
 */
export function trophyKey(creatureId: string): string {
  return `trofeu:${creatureId}`;
}

export function jewelKey(creatureId: string): string {
  return `joia:${creatureId}`;
}

/** Nome legível de uma chave do estoque de espólio. */
export function lootName(key: string): string {
  const [kind, id] = key.includes(':') ? (key.split(':') as [string, string]) : ['', key];
  if (kind === 'trofeu') return trophyName({ name: DB.creatures[id]?.name ?? id });
  if (kind === 'joia') return jewelName({ name: DB.creatures[id]?.name ?? id });
  return DB.materials[key]?.name ?? key;
}

/** Preço de venda (ouro) de uma unidade do espólio. */
export function lootPrice(key: string): number {
  if (key.startsWith('trofeu:')) return DROP_PRICES.trophy;
  if (key.startsWith('joia:')) return DROP_PRICES.jewel;
  return DB.materials[key]?.price ?? 0;
}

/** Junta um sorteio no estoque (materiais, troféu e joia da espécie). */
export function addRollToLoot(bag: Record<string, number>, creatureId: string, roll: DropRoll): void {
  for (const [id, n] of Object.entries(roll.materials)) bag[id] = (bag[id] ?? 0) + n;
  if (roll.trophy) bag[trophyKey(creatureId)] = (bag[trophyKey(creatureId)] ?? 0) + 1;
  if (roll.jewel) bag[jewelKey(creatureId)] = (bag[jewelKey(creatureId)] ?? 0) + 1;
}

export interface DropRoll {
  materials: Record<string, number>;
  trophy: boolean;
  jewel: boolean;
}

/** Sorteia o que uma fera deixa ao ser derrotada. */
export function rollDrops(drops: CreatureDrops | undefined, rng: Rng): DropRoll {
  const out: DropRoll = { materials: {}, trophy: false, jewel: false };
  if (!drops) return out;
  for (const e of drops.table) {
    if (!rng.chance(e.chance)) continue;
    const n = rng.int(Math.min(e.min, e.max), Math.max(e.min, e.max));
    if (n > 0) out.materials[e.material] = (out.materials[e.material] ?? 0) + n;
  }
  out.trophy = drops.trophy;
  out.jewel = drops.jewel.chance > 0 && rng.chance(drops.jewel.chance);
  return out;
}
