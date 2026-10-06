import type { Rng } from '@core';
import EXP from '../data/world/expedition.json';
import EVENTS_JSON from '../data/world/events.json';
import { DB, type Attr } from '../data';
import { travelCheckChance } from '../rules/stats';
import { node } from './layout';
import { addInfluence, addIntel, addRep, react } from './politics';
import { provinceOf } from './provinces';
import { provinceState } from './territory';
import { ensureVeil, veilActive } from './veil';
import { giveClue, giveTreasureMap } from './expedition';
import { SUPPLY, supplyCap } from './logistics';
import { fitMembers, giveItem, members, travelers, type Campaign, type Squad } from './campaign';

/**
 * Eventos de viagem (C17): encontros sem luta na estrada, com escolhas. Uma escolha pode pedir um
 * teste de atributo do esquadrão (o melhor membro tenta; um traço que combina ajuda) ou um custo.
 * O resultado mexe em ouro, rações, ferimentos, cansaço, moral, reputação, informação e pistas.
 */
export const EVENTS_CFG = EXP.events;

export interface EventOutcome {
  text: string;
  gold?: number;
  supplies?: number;
  wound?: number;
  fatigue?: number;
  morale?: number;
  rep?: Record<string, number>;
  intel?: number;
  influence?: number;
  approval?: Record<string, number>;
  /** 'raro' sorteia um item raro; senão, o id do item. */
  item?: string;
  treasure?: boolean;
  clue?: boolean;
  veil?: number;
  fear?: number;
  /** Horas perdidas (o chamador avança o tempo). */
  hours?: number;
}

export interface EventChoice {
  label: string;
  check?: { attr: Attr; dc: number };
  /** Traço de personalidade que ajuda no teste. */
  trait?: string;
  /** Sorte pura (sem atributo). */
  random?: number;
  cost?: { gold?: number; supplies?: number; goldPerMember?: number };
  success: EventOutcome;
  fail?: EventOutcome;
}

export interface TravelEvent {
  id: string;
  title: string;
  text: string;
  realm: 'any' | 'reino' | 'distante';
  regions?: string[];
  minChapter?: number;
  choices: EventChoice[];
}

export const TRAVEL_EVENTS = EVENTS_JSON as TravelEvent[];

export function eventById(id: string): TravelEvent | undefined {
  return TRAVEL_EVENTS.find((e) => e.id === id);
}

/** Eventos que cabem no lugar e no capítulo. */
export function eventPool(c: Campaign, nodeId: string): TravelEvent[] {
  const n = node(nodeId);
  const ch = c.story?.chapter ?? 0;
  return TRAVEL_EVENTS.filter(
    (e) => (e.minChapter ?? 0) <= ch && (e.realm === 'any' || (e.realm === 'reino') === (n.realm === 'reino')) && (!e.regions || e.regions.includes(n.region)),
  );
}

/** Sorteio na chegada a um trecho de estrada (depois do encontro de batalha). */
export function rollTravelEvent(c: Campaign, s: Squad, rng: Rng): TravelEvent | null {
  if (!fitMembers(c, s).length || !rng.chance(EVENTS_CFG.chance)) return null;
  const pool = eventPool(c, s.at);
  return pool.length ? rng.pick(pool) : null;
}

function squadLevelOf(c: Campaign, s: Squad): number {
  const fit = fitMembers(c, s);
  return fit.length ? Math.round(fit.reduce((a, m) => a + m.level, 0) / fit.length) : 1;
}

/** Chance (0–100) de sucesso da escolha; null = não há teste (sempre dá certo). */
export function choiceChance(c: Campaign, s: Squad, ch: EventChoice): number | null {
  if (ch.random !== undefined) return Math.round(ch.random * 100);
  if (!ch.check) return null;
  const fit = fitMembers(c, s);
  if (!fit.length) return 0;
  const trait = ch.trait && fit.some((m) => m.trait === ch.trait) ? EVENTS_CFG.traitBonus : 0;
  const best = Math.max(...fit.map((m) => m.attrs[ch.check!.attr])) + trait;
  return Math.round(travelCheckChance(best, squadLevelOf(c, s), ch.check.dc));
}

/** O traço que ajuda está no esquadrão? */
export function traitHelps(c: Campaign, s: Squad, ch: EventChoice): boolean {
  return !!ch.trait && fitMembers(c, s).some((m) => m.trait === ch.trait);
}

function costOf(c: Campaign, s: Squad, ch: EventChoice): { gold: number; supplies: number } {
  return { gold: (ch.cost?.gold ?? 0) + (ch.cost?.goldPerMember ?? 0) * travelers(c, s).length, supplies: ch.cost?.supplies ?? 0 };
}

export function canAfford(c: Campaign, s: Squad, ch: EventChoice): boolean {
  const k = costOf(c, s, ch);
  return c.gold >= k.gold && (s.supplies ?? SUPPLY.start) >= k.supplies;
}

export interface EventResult {
  ok: boolean;
  lines: string[];
  hours: number;
}

/** Resolve a escolha: paga o custo, faz o teste e aplica o resultado. */
export function resolveChoice(c: Campaign, s: Squad, ev: TravelEvent, idx: number, rng: Rng): EventResult {
  const ch = ev.choices[idx];
  if (!ch || !canAfford(c, s, ch)) return { ok: false, lines: [], hours: 0 };
  const k = costOf(c, s, ch);
  c.gold -= k.gold;
  s.supplies = (s.supplies ?? SUPPLY.start) - k.supplies;
  const chance = choiceChance(c, s, ch);
  const ok = chance === null || rng.chance(chance / 100);
  const o = ok ? ch.success : (ch.fail ?? { text: 'Nada acontece.' });
  return { ok, lines: [o.text, ...applyOutcome(c, s, o, rng)], hours: o.hours ?? 0 };
}

export function applyOutcome(c: Campaign, s: Squad, o: EventOutcome, rng: Rng): string[] {
  const out: string[] = [];
  const people = members(c, s);
  if (o.gold) {
    const g = Math.max(-c.gold, o.gold);
    c.gold += g;
    out.push(`${g >= 0 ? '+' : ''}${g} ouro`);
  }
  if (o.supplies) {
    const before = s.supplies ?? SUPPLY.start;
    s.supplies = Math.max(0, Math.min(supplyCap(s, travelers(c, s).length), before + o.supplies));
    out.push(`${s.supplies - before >= 0 ? '+' : ''}${s.supplies - before} rações`);
  }
  if (o.wound && people.length) {
    const m = rng.pick(people);
    m.woundDays = Math.max(m.woundDays, o.wound);
    out.push(`${m.name} ficou ferido por ${o.wound} dia(s).`);
  }
  if (o.fatigue) for (const m of people) m.fatigue = Math.max(0, Math.min(100, (m.fatigue ?? 0) + o.fatigue));
  if (o.fatigue) out.push(o.fatigue > 0 ? `Cansaço +${o.fatigue}` : `Descanso: cansaço ${o.fatigue}`);
  if (o.morale) {
    for (const m of people) m.morale = Math.max(0, Math.min(100, (m.morale ?? 70) + o.morale));
    out.push(`Moral ${o.morale > 0 ? '+' : ''}${o.morale}`);
  }
  for (const [f, d] of Object.entries(o.rep ?? {})) addRep(c, f, d);
  if (o.rep) out.push(`Reputação: ${Object.entries(o.rep).map(([f, d]) => `${f} ${d > 0 ? '+' : ''}${d}`).join(', ')}`);
  if (o.intel) {
    addIntel(c, o.intel);
    out.push(`+${o.intel} de informação`);
  }
  if (o.influence) {
    addInfluence(c, o.influence);
    out.push(`+${o.influence} de influência`);
  }
  if (o.approval) out.push(...react(c, o.approval));
  if (o.item) {
    const id = o.item === 'raro' ? rng.pick(Object.values(DB.items).filter((it) => it.rarity === 'raro')).id : o.item;
    giveItem(s.carried, id);
    out.push(`Item: ${DB.items[id]?.name ?? id}`);
  }
  if (o.treasure) {
    const line = giveTreasureMap(c, rng);
    if (line) out.push(line);
  }
  if (o.clue) {
    const line = giveClue(c, rng);
    if (line) out.push(line);
  }
  if (o.veil && veilActive(c)) {
    const v = ensureVeil(c);
    v.value = Math.max(0, Math.min(99, v.value + o.veil));
    out.push(`O Véu ${o.veil < 0 ? 'recua' : 'avança'} (${v.value}/100).`);
  }
  if (o.fear) {
    const st = provinceState(c, provinceOf(s.at));
    st.fear = Math.min(100, st.fear + o.fear);
  }
  return out;
}
