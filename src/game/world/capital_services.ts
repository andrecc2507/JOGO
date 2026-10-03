import { Rng } from '@core';
import { DB, type ItemDef } from '../data';
import CAPITALS from '../data/world/capitals.json';
import { lootPrice } from '../rules/drops';
import { refinedStats } from '../rules/stats';
import { lootSellMult, registerCustomItems } from './base';
import { giveItem, monthOf, type Campaign, type Squad } from './campaign';
import { countryOf } from './layout';

/**
 * Particularidades das capitais (números em `data/world/capitals.json`):
 * - Verdelume: Pavilhão dos Caçadores — registra o que se sabe de cada besta conforme os abates
 *   (ficha → atributos → habilidades → Marca do Caçador, bônus em batalha);
 * - Bastiamar: refino de armas e armaduras (+1…+5);
 * - Cristália: refino de itens mágicos (acessórios e itens de joia de forja);
 * - Vel'Qadar: Mercado Negro (itens raros, compra espólio por mais);
 * - Solenne: Enfermaria — esquadrão parado na capital sara ferimentos 2× mais rápido e restaura a moral.
 */
export type CapitalService = 'cacadores' | 'refino' | 'refino_magico' | 'mercado_negro' | 'enfermaria';

export const SERVICE_LABEL: Record<CapitalService, string> = {
  cacadores: '🏹 Pavilhão dos Caçadores',
  refino: '⚒ Refino de armas e armaduras',
  refino_magico: '🔮 Refino de itens mágicos',
  mercado_negro: '🗝 Mercado Negro',
  enfermaria: '⛪ Enfermaria',
};

export const HUNTER_MARK = CAPITALS.hunterMark;
export const LORE = CAPITALS.lore;
const REFINE = CAPITALS.refine;
const BM = CAPITALS.blackMarket;

export function capitalService(capitalId: string): CapitalService | null {
  const country = countryOf(capitalId);
  if (!country) return null;
  return ((CAPITALS.services as Record<string, string | null>)[country.id] ?? null) as CapitalService | null;
}

// ───────────────────────────── caçadores (Verdelume) ─────────────────────────────

/** Nível de conhecimento registrado (0–4). A ficha (1) vem de graça com o primeiro abate. */
export function loreTier(c: Campaign, species: string): number {
  const reg = c.lore?.[species] ?? 0;
  return Math.max(reg, (c.speciesKills[species] ?? 0) >= LORE[0]!.kills ? 1 : 0);
}

export function nextLore(c: Campaign, species: string): (typeof LORE)[number] | null {
  return LORE.find((t) => t.tier === loreTier(c, species) + 1) ?? null;
}

export function loreBlocker(c: Campaign, species: string): string | null {
  const next = nextLore(c, species);
  if (!next) return 'conhecimento completo';
  const kills = c.speciesKills[species] ?? 0;
  if (kills < next.kills) return `precisa de ${next.kills} abates (tem ${kills})`;
  if (c.gold < next.cost) return `precisa de ${next.cost} ouro`;
  return null;
}

export function registerLore(c: Campaign, species: string): boolean {
  const next = nextLore(c, species);
  if (!next || loreBlocker(c, species)) return false;
  c.gold -= next.cost;
  c.lore = { ...(c.lore ?? {}), [species]: next.tier };
  return true;
}

/**
 * Caçada (Pavilhão dos Caçadores): escolhe uma espécie já abatida; o próximo encontro de qualquer
 * esquadrão traz pelo menos uma dela. Só uma caçada por vez.
 */
export function huntBlocker(c: Campaign, species: string): string | null {
  if (!DB.creatures[species] || !DB.enemies[species]) return 'espécie desconhecida';
  if (loreTier(c, species) < 1) return 'abata uma antes para ter a ficha';
  if (c.hunt === species) return 'caçada já aberta';
  return null;
}

export function startHunt(c: Campaign, species: string): boolean {
  if (huntBlocker(c, species)) return false;
  c.hunt = species;
  return true;
}

export function cancelHunt(c: Campaign): void {
  delete c.hunt;
}

/** Espécies com a Marca do Caçador (último nível): bônus de dano e crítico contra elas. */
export function huntedSpecies(c: Campaign): string[] {
  return Object.entries(c.lore ?? {})
    .filter(([, t]) => t >= LORE[LORE.length - 1]!.tier)
    .map(([id]) => id);
}

// ───────────────────────────── refino (Bastiamar e Cristália) ─────────────────────────────

export function refineLevel(id: string): number {
  const m = /\+(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

export function baseItemId(id: string): string {
  return id.replace(/\+\d+$/, '');
}

/** Qual serviço refina o item (ou null se não refina). */
export function refineService(id: string): CapitalService | null {
  const it = DB.items[baseItemId(id)];
  if (!it) return null;
  if (it.id.startsWith('magico_') || it.slot === 'accessory') return 'refino_magico';
  if (it.slot === 'weapon' || it.slot === 'armor' || it.slot === 'offhand') return 'refino';
  return null;
}

export function refineCost(id: string): number {
  const it = DB.items[baseItemId(id)];
  return Math.max(REFINE.minGold, Math.round((it?.price ?? 0) * REFINE.goldPerLevel * (refineLevel(id) + 1)));
}

export function refineBlocker(c: Campaign, id: string, service: CapitalService): string | null {
  if (refineService(id) !== service) return 'esta oficina não trabalha este item';
  if (refineLevel(id) >= REFINE.max) return `já está em +${REFINE.max}`;
  if (c.gold < refineCost(id)) return `precisa de ${refineCost(id)} ouro`;
  return null;
}

/** Definição do item refinado em `level` (registrada nos itens personalizados da campanha). */
export function refinedDef(c: Campaign, baseId: string, level: number): ItemDef {
  const id = `${baseId}+${level}`;
  const known = c.customItems?.find((x) => x.id === id);
  if (known) return known;
  const base = DB.items[baseId]!;
  const magic = refineService(baseId) === 'refino_magico';
  const def: ItemDef = { ...base, ...refinedStats(base, level, magic), id, name: `${base.name} +${level}`, price: Math.round(base.price * (1 + 0.5 * level)) } as ItemDef;
  c.customItems = [...(c.customItems ?? []), def];
  registerCustomItems(c);
  return def;
}

/** Refina e devolve o id novo (quem chama troca no equipamento ou na mochila). */
export function refineItem(c: Campaign, id: string, service: CapitalService): string | null {
  if (refineBlocker(c, id, service)) return null;
  c.gold -= refineCost(id);
  return refinedDef(c, baseItemId(id), refineLevel(id) + 1).id;
}

// ───────────────────────────── Mercado Negro (Vel'Qadar) ─────────────────────────────

/** Estoque do mês: itens raros e épicos, sorteados pela semente da campanha. */
export function blackMarketStock(c: Campaign): string[] {
  const pool = Object.values(DB.items)
    .filter((i) => BM.rarities.includes(i.rarity) && !i.id.startsWith('magico_') && !/\+\d+$/.test(i.id))
    .map((i) => i.id)
    .sort();
  const rng = new Rng((c.seed ^ (monthOf(c) * 7349)) >>> 0);
  const out: string[] = [];
  while (out.length < Math.min(BM.stockSize, pool.length)) {
    const id = rng.pick(pool);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function blackMarketPrice(id: string): number {
  return Math.round((DB.items[id]?.price ?? 0) * BM.priceMult);
}

export function buyBlackMarket(c: Campaign, s: Squad | undefined, id: string): boolean {
  const price = blackMarketPrice(id);
  if (c.gold < price || !blackMarketStock(c).includes(id)) return false;
  c.gold -= price;
  giveItem(s ? s.carried : c.inventory, id);
  return true;
}

export function blackMarketLootPrice(c: Campaign, key: string): number {
  return Math.round(lootPrice(key) * lootSellMult(c) * BM.lootSellMult);
}

export function sellLootBlackMarket(c: Campaign, bag: Record<string, number>, key: string, n = 1): number {
  const k = Math.min(bag[key] ?? 0, Math.max(0, n));
  if (!k) return 0;
  giveItem(bag, key, -k);
  const gold = k * blackMarketLootPrice(c, key);
  c.gold += gold;
  return gold;
}
