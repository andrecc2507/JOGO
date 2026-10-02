import BASE from '../data/base/base.json';
import RECIPE_LIST from '../data/base/recipes.json';
import { DB, MATERIAL_FAMILIES, item, type Attr, type ClassId, type ItemDef, type Rarity } from '../data';
import type { Character } from '../rules/character';
import { jewelKey, lootName } from '../rules/drops';
import { countryOf } from './layout';

/**
 * A base da resistência (D12, D63–D68): esconderijo escolhido no fim do Ato 1, instalações, heróis
 * trabalhando, pesquisa e forja. Regras puras sobre o estado da campanha; quem chama (campaign.ts,
 * telas) registra no diário as mensagens devolvidas. Números em data/base/base.json.
 */

export type WorkKind = 'pesquisa' | 'forja';

export interface FacilityDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  days: number;
  builtin?: boolean;
}

export interface Recipe {
  id: string;
  output: string;
  materials: Record<string, number>;
  gold: number;
  days: number;
  /** Pesquisa que destrava a receita. */
  requires: string;
  /** Item que a receita melhora (é consumido). */
  consumes?: string;
}

/** Trabalho em andamento (o primeiro da fila é o ativo); dias restantes de trabalho. */
export interface Job {
  id: string;
  remaining: number;
  total: number;
}

export interface BaseState {
  nodeId: string;
  facilities: string[];
  building: Job[];
  research: { done: string[]; queue: Job[] };
  forge: Job[];
  /** Heróis da reserva designados para a Biblioteca ou a Forja. */
  assigned: Record<string, WorkKind>;
}

/** Recorte da campanha que a base precisa (evita depender de world/campaign). */
export interface BaseHost {
  act: number;
  gold: number;
  baseNode: string;
  base?: BaseState;
  roster: Record<string, Character>;
  squads: { memberIds: string[]; at: string; to: string | null }[];
  /** Itens mágicos fabricados com joias de forja (registrados em DB.items). */
  customItems?: ItemDef[];
  /** Humanos rendidos guardados na Prisão. */
  prisoners?: Prisoner[];
  inventory: Record<string, number>;
  materials: Record<string, number>;
  speciesKills: Record<string, number>;
}

export interface Prisoner {
  id: string;
  enemyId: string;
  name: string;
  level: number;
}

export const FACILITIES = BASE.facilities as FacilityDef[];
export const RECIPES = RECIPE_LIST as unknown as Recipe[];
export const BASE_RULES = BASE;
type Hideout = { label: string; text: string; ambushMult?: number; researchSpeed?: number; forgeSpeed?: number; forgeGold?: number; lootSell?: number; freeFacility?: string };
const HIDEOUTS = BASE.hideouts as Record<string, Hideout>;

function add(bag: Record<string, number>, id: string, n = 1): void {
  bag[id] = (bag[id] ?? 0) + n;
  if (bag[id]! <= 0) delete bag[id];
}

// ───────────────────────────── fundação e instalações ─────────────────────────────

/** Bônus do esconderijo (a capital escolhida). */
export function hideout(c: BaseHost): Hideout | undefined {
  if (!c.base) return undefined;
  const country = countryOf(c.base.nodeId);
  return country ? HIDEOUTS[country.id] : undefined;
}

export function hideoutFor(capitalId: string): Hideout | undefined {
  const country = countryOf(capitalId);
  return country ? HIDEOUTS[country.id] : undefined;
}

/** Funda a base na capital escolhida: Quartel, Biblioteca e Forja prontos (+ instalação grátis do esconderijo). */
export function foundBase(c: BaseHost, capitalId: string): string[] {
  const facilities = FACILITIES.filter((f) => f.builtin).map((f) => f.id);
  const free = hideoutFor(capitalId)?.freeFacility;
  if (free && !facilities.includes(free)) facilities.push(free);
  c.base = { nodeId: capitalId, facilities, building: [], research: { done: [], queue: [] }, forge: [], assigned: {} };
  c.baseNode = capitalId;
  return [`A resistência ergue seu esconderijo. A base agora é aqui.`];
}

export function hasFacility(c: BaseHost, id: string): boolean {
  return !!c.base?.facilities.includes(id);
}

export function baseSlots(c: BaseHost): number {
  return c.act >= 4 ? BASE.slots.act4 : BASE.slots.founding;
}

export function usedSlots(c: BaseHost): number {
  return c.base ? c.base.facilities.length + c.base.building.length : 0;
}

export function buildBlocker(c: BaseHost, id: string): string | null {
  const f = FACILITIES.find((x) => x.id === id);
  if (!c.base || !f) return 'sem base';
  if (c.base.facilities.includes(id)) return 'já construída';
  if (c.base.building.some((b) => b.id === id)) return 'em construção';
  if (usedSlots(c) >= baseSlots(c)) return `sem espaço (${baseSlots(c)}${c.act < 4 ? '; mais espaços no Ato 4' : ''})`;
  if (c.gold < f.cost) return 'ouro insuficiente';
  return null;
}

export function startBuilding(c: BaseHost, id: string): boolean {
  const f = FACILITIES.find((x) => x.id === id);
  if (!f || buildBlocker(c, id)) return false;
  c.gold -= f.cost;
  c.base!.building.push({ id, remaining: f.days, total: f.days });
  return true;
}

// ───────────────────────────── trabalho dos heróis ─────────────────────────────

function inSquad(c: BaseHost, charId: string): boolean {
  return c.squads.some((s) => s.memberIds.includes(charId));
}

/** Heróis designados que de fato estão na base (na reserva). */
export function workers(c: BaseHost, kind: WorkKind): Character[] {
  if (!c.base) return [];
  return Object.entries(c.base.assigned)
    .filter(([id, k]) => k === kind && c.roster[id] && !inSquad(c, id))
    .map(([id]) => c.roster[id]!);
}

export function assign(c: BaseHost, charId: string, kind: WorkKind | null): boolean {
  if (!c.base || !c.roster[charId]) return false;
  if (!kind) {
    delete c.base.assigned[charId];
    return true;
  }
  if (inSquad(c, charId)) return false;
  c.base.assigned[charId] = kind;
  return true;
}

/** Redução de tempo pelos heróis: 15% cada (até 3); a classe certa conta em dobro; no máximo 60%. */
export function workReduction(c: BaseHost, kind: WorkKind): number {
  const w = BASE.work;
  const bonus = (w.classBonus as Record<WorkKind, string[]>)[kind];
  const weights = workers(c, kind)
    .map((ch) => (bonus.includes(ch.classId as ClassId) ? 2 : 1))
    .sort((a, b) => b - a)
    .slice(0, w.maxHeroes);
  return Math.min(w.maxReduction, weights.reduce((s, x) => s + x * w.perHero, 0));
}

/** Dias de trabalho feitos por dia de calendário. */
export function workSpeed(c: BaseHost, kind: WorkKind): number {
  const h = hideout(c);
  const place = kind === 'pesquisa' ? h?.researchSpeed ?? 1 : h?.forgeSpeed ?? 1;
  return place / (1 - workReduction(c, kind));
}

// ───────────────────────────── pesquisa ─────────────────────────────

export type ResearchKind = 'material' | 'criatura' | 'joia' | 'interrogatorio';
const JEWELS = BASE.jewels;

export interface ResearchOption {
  id: string;
  kind: ResearchKind;
  name: string;
  /** Resultado em uma linha. */
  result: string;
  days: number;
  cost: Record<string, number>;
  ready: boolean;
  /** Por que ainda não dá (se não está pronta). */
  missing?: string;
}

function researchDone(c: BaseHost, id: string): boolean {
  return !!c.base?.research.done.includes(id);
}

function researchQueued(c: BaseHost, id: string): boolean {
  return !!c.base?.research.queue.some((j) => j.id === id);
}

export function isStudied(c: BaseHost, speciesId: string): boolean {
  return researchDone(c, `criatura:${speciesId}`);
}

/** Espécies estudadas (bônus de dano e acerto em batalha). */
export function studiedSpecies(c: BaseHost): string[] {
  return (c.base?.research.done ?? []).filter((id) => id.startsWith('criatura:')).map((id) => id.slice(9));
}

export function researchName(id: string): string {
  const [kind, ref] = id.split(':') as [string, string];
  if (kind === 'material') return `Estudo: ${DB.materials[ref]?.name ?? ref}`;
  if (kind === 'criatura') return `Estudo de criatura: ${DB.creatures[ref]?.name ?? ref}`;
  if (kind === 'joia') return `Afinação: ${lootName(jewelKey(ref))}`;
  if (kind === 'interrogatorio') return `Interrogatório: ${ref.split('|')[1] ?? 'prisioneiro'}`;
  return id;
}

function have(c: BaseHost, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([k, n]) => (c.materials[k] ?? 0) >= n);
}

/** Tudo o que a Biblioteca pode pesquisar agora ou logo (com o que falta). */
export function researchOptions(c: BaseHost): ResearchOption[] {
  if (!c.base) return [];
  const r = BASE.research;
  const out: ResearchOption[] = [];
  const skip = (id: string) => researchDone(c, id) || researchQueued(c, id);
  // Materiais: 5 unidades destravam as receitas que os usam.
  for (const m of Object.values(DB.materials)) {
    const id = `material:${m.id}`;
    const stock = c.materials[m.id] ?? 0;
    if (skip(id) || stock <= 0) continue;
    const recipes = RECIPES.filter((x) => x.requires === id).map((x) => item(x.output).name);
    const cost = { [m.id]: r.materialUnits };
    out.push({ id, kind: 'material', name: researchName(id), result: recipes.length ? `receitas: ${recipes.join(', ')}` : 'conhecimento do material (receitas futuras)', days: r.materialDays, cost, ready: have(c, cost), missing: have(c, cost) ? undefined : `${stock}/${r.materialUnits} ${m.name}` });
  }
  // Criaturas: abates + materiais da família → ficha completa e bônus contra a espécie.
  for (const [sp, kills] of Object.entries(c.speciesKills)) {
    const cr = DB.creatures[sp];
    const id = `criatura:${sp}`;
    if (!cr?.drops || skip(id) || kills <= 0) continue;
    const fam = MATERIAL_FAMILIES.find((f) => f.id === cr.drops!.family);
    const cost = fam ? { [fam.common]: r.creatureMaterials } : {};
    const okKills = kills >= r.creatureKills;
    const ready = okKills && have(c, cost);
    const miss = [okKills ? '' : `${kills}/${r.creatureKills} abates`, have(c, cost) ? '' : `${c.materials[fam?.common ?? ''] ?? 0}/${r.creatureMaterials} ${DB.materials[fam?.common ?? '']?.name ?? ''}`].filter(Boolean).join(' · ');
    out.push({ id, kind: 'criatura', name: researchName(id), result: `+${Math.round(r.studyBonus.damage * 100)}% de dano e +${r.studyBonus.accuracy} de acerto contra ela`, days: (r.creatureDays as Record<Rarity, number>)[cr.rarity], cost, ready, missing: ready ? undefined : miss });
  }
  // Interrogatórios: cada prisioneiro da Prisão (pesquisa de história).
  for (const p of c.prisoners ?? []) {
    const id = `interrogatorio:${p.id}|${p.name}`;
    if (skip(id)) continue;
    out.push({ id, kind: 'interrogatorio', name: researchName(id), result: 'informação, rumores e um esconderijo de ouro', days: BASE.prison.interrogationDays, cost: {}, ready: true });
  }
  // Joias da alma: uma pesquisa por besta, no Santuário (a joia não é gasta).
  for (const [key, n] of Object.entries(c.materials)) {
    if (!key.startsWith('joia:') || n <= 0) continue;
    const sp = key.slice(5);
    const cr = DB.creatures[sp];
    const id = `joia:${sp}`;
    if (!cr || skip(id)) continue;
    const j = cr.drops?.jewel;
    const ready = hasFacility(c, 'santuario') && !!j && j.type !== 'indefinida';
    const what = j?.type === 'habilidade' ? `joia de habilidade: ${cr.skills.find((s) => s.id === j.skill)?.name ?? '(habilidade não escolhida)'}` : j?.type === 'forja' ? `joia de forja: itens mágicos${j.bonus ? ` (${j.bonus})` : ''}` : 'tipo ainda não definido no Bestiário';
    out.push({ id, kind: 'joia', name: researchName(id), result: what, days: (JEWELS.researchDays as Record<Rarity, number>)[cr.rarity], cost: {}, ready, missing: ready ? undefined : !hasFacility(c, 'santuario') ? 'construir o Santuário' : 'definir o tipo da joia no Bestiário' });
  }
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
}

// ───────────────────────────── joias da alma ─────────────────────────────

export function jewelKnown(c: BaseHost, species: string): boolean {
  return researchDone(c, `joia:${species}`);
}

export function jewelMinLevel(species: string): number {
  const cr = DB.creatures[species];
  return cr ? (JEWELS.minLevel as Record<Rarity, number>)[cr.rarity] : 1;
}

/** Herói está na base (reserva ou esquadrão parado na base)? */
function atBaseChar(c: BaseHost, charId: string): boolean {
  const s = c.squads.find((x) => x.memberIds.includes(charId));
  return !s || (!s.to && s.at === c.baseNode);
}

export function equipBlocker(c: BaseHost, charId: string, species: string): string | null {
  const ch = c.roster[charId];
  const cr = DB.creatures[species];
  const j = cr?.drops?.jewel;
  if (!ch || !cr || !j) return 'joia desconhecida';
  if (j.type !== 'habilidade' || !j.skill) return 'não é joia de habilidade';
  if (!jewelKnown(c, species)) return 'pesquise a joia no Santuário';
  if ((c.materials[jewelKey(species)] ?? 0) <= 0) return 'nenhuma joia no estoque';
  if (ch.level < jewelMinLevel(species)) return `requer NV ${jewelMinLevel(species)}`;
  if (!atBaseChar(c, charId)) return 'o herói precisa estar na base';
  return null;
}

/** Equipa a joia (troca a anterior, que volta ao estoque). */
export function equipJewel(c: BaseHost, charId: string, species: string): boolean {
  if (equipBlocker(c, charId, species)) return false;
  unequipJewel(c, charId);
  add(c.materials, jewelKey(species), -1);
  c.roster[charId]!.jewel = { species, rank: 1 };
  return true;
}

/** Tira a joia (volta 1 joia ao estoque; as repetidas usadas para fortalecer ficaram fundidas nela). */
export function unequipJewel(c: BaseHost, charId: string): boolean {
  const ch = c.roster[charId];
  if (!ch?.jewel) return false;
  add(c.materials, jewelKey(ch.jewel.species), 1);
  delete ch.jewel;
  return true;
}

export function strengthenCost(rank: number): number | null {
  return rank >= 5 ? null : JEWELS.strengthen[rank - 1] ?? null;
}

export function strengthenBlocker(c: BaseHost, charId: string): string | null {
  const ch = c.roster[charId];
  if (!ch?.jewel) return 'sem joia';
  if (!hasFacility(c, 'santuario')) return 'construir o Santuário';
  const cost = strengthenCost(ch.jewel.rank);
  if (cost === null) return 'nível máximo';
  if ((c.materials[jewelKey(ch.jewel.species)] ?? 0) < cost) return `precisa de ${cost} joia(s) repetida(s)`;
  return null;
}

/** Fortalece a joia equipada fundindo joias repetidas (Nv 1–5, como as habilidades). */
export function strengthenJewel(c: BaseHost, charId: string): boolean {
  if (strengthenBlocker(c, charId)) return false;
  const ch = c.roster[charId]!;
  add(c.materials, jewelKey(ch.jewel!.species), -strengthenCost(ch.jewel!.rank)!);
  ch.jewel!.rank += 1;
  return true;
}

// ───────────────────────────── itens mágicos (joias de forja) ─────────────────────────────

/** Registra no jogo os itens mágicos da campanha. */
export function registerCustomItems(c: BaseHost): void {
  for (const it of c.customItems ?? []) DB.items[it.id] = it;
}

export function magicItemCost(c: BaseHost, species: string): { materials: Record<string, number>; gold: number } {
  const fam = MATERIAL_FAMILIES.find((f) => f.id === DB.creatures[species]?.drops?.family);
  const mi = JEWELS.magicItem;
  return { materials: fam ? { [fam.common]: mi.familyMaterials } : {}, gold: Math.round(mi.gold * (hideout(c)?.forgeGold ?? 1)) };
}

export function magicItemBlocker(c: BaseHost, species: string, baseItem: string): string | null {
  const cr = DB.creatures[species];
  const it = DB.items[baseItem];
  if (!c.base || !cr || !it) return 'inválido';
  if (cr.drops?.jewel.type !== 'forja') return 'não é joia de forja';
  if (!jewelKnown(c, species)) return 'pesquise a joia no Santuário';
  if (!['weapon', 'armor', 'accessory', 'offhand'].includes(it.slot)) return 'só armas, armaduras e acessórios';
  if ((c.inventory[baseItem] ?? 0) <= 0) return 'item fora do inventário da base';
  if ((c.materials[jewelKey(species)] ?? 0) <= 0) return 'nenhuma joia no estoque';
  const cost = magicItemCost(c, species);
  if (!have(c, cost.materials)) return 'faltam materiais';
  if (c.gold < cost.gold) return 'ouro insuficiente';
  return null;
}

/**
 * Item mágico: a peça base + a joia de forja. Ganha +3/+2 nos dois maiores atributos da besta e
 * +2 de ataque ou defesa; o texto do bônus vem da ficha da joia no Bestiário.
 */
export function magicItemDef(c: BaseHost, species: string, baseItem: string): ItemDef {
  const cr = DB.creatures[species]!;
  const base = item(baseItem);
  const mi = JEWELS.magicItem;
  const top = (Object.entries(cr.attrs) as [Attr, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const bonus: Record<string, number> = { ...(base.bonus ?? {}) };
  top.forEach(([a], i) => (bonus[a] = (bonus[a] ?? 0) + (mi.attrBonus[i] ?? 0)));
  const short = cr.name.split(' (')[0]!;
  const n = (c.customItems?.length ?? 0) + 1;
  return {
    ...base,
    id: `magico_${n}_${species}`,
    name: `${base.name} de ${short}`,
    rarity: 'epico',
    price: base.price * 3 + 300,
    atk: base.atk !== undefined ? base.atk + mi.statBonus : undefined,
    def: base.def !== undefined ? base.def + mi.statBonus : undefined,
    bonus: bonus as ItemDef['bonus'],
    description: `Forjado com a joia da alma de ${short}. ${cr.drops?.jewel.bonus ?? ''}`.trim(),
  };
}

export function startMagicItem(c: BaseHost, species: string, baseItem: string): ItemDef | null {
  if (magicItemBlocker(c, species, baseItem)) return null;
  const cost = magicItemCost(c, species);
  const def = magicItemDef(c, species, baseItem);
  for (const [k, n] of Object.entries(cost.materials)) add(c.materials, k, -n);
  add(c.materials, jewelKey(species), -1);
  add(c.inventory, baseItem, -1);
  c.gold -= cost.gold;
  (c.customItems ??= []).push(def);
  DB.items[def.id] = def;
  const days = JEWELS.magicItem.days;
  c.base!.forge.push({ id: `magico:${def.id}`, remaining: days, total: days });
  return def;
}

export function startResearch(c: BaseHost, id: string, options = researchOptions(c)): boolean {
  const opt = options.find((o) => o.id === id);
  if (!c.base || !opt || !opt.ready) return false;
  for (const [k, n] of Object.entries(opt.cost)) add(c.materials, k, -n);
  c.base.research.queue.push({ id, remaining: opt.days, total: opt.days });
  return true;
}

// ───────────────────────────── forja ─────────────────────────────

export function recipeUnlocked(c: BaseHost, r: Recipe): boolean {
  return researchDone(c, r.requires);
}

export function recipeGold(c: BaseHost, r: Recipe): number {
  return Math.round(r.gold * (hideout(c)?.forgeGold ?? 1));
}

export function craftBlocker(c: BaseHost, r: Recipe): string | null {
  if (!c.base) return 'sem base';
  if (!recipeUnlocked(c, r)) return `pesquise ${researchName(r.requires)}`;
  if (!have(c, r.materials)) return 'faltam materiais';
  if (r.consumes && (c.inventory[r.consumes] ?? 0) <= 0) return `precisa de ${item(r.consumes).name} no inventário da base`;
  if (c.gold < recipeGold(c, r)) return 'ouro insuficiente';
  return null;
}

export function startCraft(c: BaseHost, recipeId: string): boolean {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r || craftBlocker(c, r)) return false;
  for (const [k, n] of Object.entries(r.materials)) add(c.materials, k, -n);
  if (r.consumes) add(c.inventory, r.consumes, -1);
  c.gold -= recipeGold(c, r);
  c.base!.forge.push({ id: r.id, remaining: r.days, total: r.days });
  return true;
}

// ───────────────────────────── tempo ─────────────────────────────

/** Avança obras, pesquisa e forja. Devolve mensagens para o diário. */
export function advanceBase(c: BaseHost, hours: number): string[] {
  const b = c.base;
  if (!b || hours <= 0) return [];
  const msgs: string[] = [];
  const days = hours / 24;
  for (const job of b.building) job.remaining -= days;
  for (const job of b.building.filter((j) => j.remaining <= 0)) {
    b.facilities.push(job.id);
    msgs.push(`🏗 ${FACILITIES.find((f) => f.id === job.id)?.name ?? job.id} construída.`);
  }
  b.building = b.building.filter((j) => j.remaining > 0);
  const step = (queue: Job[], speed: number, done: (j: Job) => void) => {
    let left = days * speed;
    while (queue.length && left > 0) {
      const j = queue[0]!;
      const use = Math.min(left, j.remaining);
      j.remaining -= use;
      left -= use;
      if (j.remaining <= 1e-9) {
        queue.shift();
        done(j);
      }
    }
  };
  step(b.research.queue, workSpeed(c, 'pesquisa'), (j) => {
    if (j.id.startsWith('interrogatorio:')) {
      msgs.push(...interrogate(c, j.id.slice(15).split('|')[0]!));
      return;
    }
    b.research.done.push(j.id);
    msgs.push(`📚 Pesquisa concluída: ${researchName(j.id)}.`);
  });
  step(b.forge, workSpeed(c, 'forja'), (j) => {
    if (j.id.startsWith('magico:')) {
      const id = j.id.slice(7);
      add(c.inventory, id);
      msgs.push(`✨ Forja: ${DB.items[id]?.name ?? id} pronto (no inventário da base).`);
      return;
    }
    const r = RECIPES.find((x) => x.id === j.id);
    if (!r) return;
    add(c.inventory, r.output);
    msgs.push(`⚒ Forja: ${item(r.output).name} pronto (no inventário da base).`);
  });
  return msgs;
}

// ───────────────────────────── prisão ─────────────────────────────

/** Falas de interrogatório (provisórias; as da história entram com as missões). */
const INTEL: Record<string, string[]> = {
  bandido: ['"O templo paga melhor que o rei."', '"As carroças saem de noite. Sempre de noite."', '"Tem gente na estrada que não é bandido, é soldado sem farda."'],
  rebelde: ['"Vocês ainda acham que estão protegendo o reino?"', '"Pergunte ao rei onde estão as crianças."', '"O símbolo do medalhão está nas portas dos templos."'],
};

/** Prisão: guarda o prisioneiro se houver vaga. Devolve a mensagem. */
export function imprison(c: BaseHost, p: Prisoner): string {
  if (!hasFacility(c, 'prisao')) return `${p.name} foi solto: não há Prisão na base.`;
  c.prisoners ??= [];
  if (c.prisoners.length >= BASE.prison.capacity) return `${p.name} foi solto: a Prisão está cheia.`;
  c.prisoners.push(p);
  return `⛓ ${p.name} foi levado para a Prisão (interrogue na Biblioteca).`;
}

/** Interrogatório concluído: o prisioneiro fala, entrega um esconderijo de ouro e é solto. */
export function interrogate(c: BaseHost, prisonerId: string): string[] {
  const p = (c.prisoners ?? []).find((x) => x.id === prisonerId);
  if (!p) return [];
  c.prisoners = c.prisoners!.filter((x) => x !== p);
  const pool = INTEL[p.enemyId.startsWith('rebelde') ? 'rebelde' : 'bandido'] ?? INTEL.bandido!;
  const line = pool[[...p.id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % pool.length]!;
  const gold = Math.min(BASE.prison.goldMax, BASE.prison.goldMin + p.level * 10);
  c.gold += gold;
  return [`🗣 Interrogatório de ${p.name}: ${line}`, `${p.name} entregou um esconderijo com ${gold} ouro e foi solto.`];
}

/** Ferimentos curam mais rápido com Enfermaria. */
export function woundHealPerDay(c: BaseHost): number {
  return hasFacility(c, 'enfermaria') ? 2 : 1;
}

export function extraContracts(c: BaseHost): number {
  return hasFacility(c, 'rede_informantes') ? 1 : 0;
}

export function lootSellMult(c: BaseHost): number {
  return hideout(c)?.lootSell ?? 1;
}

export function ambushMult(c: BaseHost): number {
  return hideout(c)?.ambushMult ?? 1;
}

/** Bônus de quem estudou a criatura (em batalha). */
export const STUDY_BONUS = BASE.research.studyBonus;
