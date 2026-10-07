import type { Character } from '../rules/character';
import CMD from '../data/world/commander.json';
import { node } from './layout';
import type { Region } from './regions';
import type { Campaign, Squad } from './campaign';
import { OPS, opActive } from './politics';

/**
 * Suprimentos e fadiga (C9, C22). Cada esquadrão leva rações (uma por pessoa por dia); fora da
 * estrada e em terra árida gasta mais. Sem rações, a moral cai, o HP não volta e os ferimentos
 * pioram. A fadiga sobe viajando e lutando e cai descansando; cansado, o herói luta pior.
 */
export const SUPPLY = CMD.supplies;
export const FATIGUE = CMD.fatigue;

export function supplyCap(s: Squad, people: number): number {
  return people * SUPPLY.perMember + (s.cart ? SUPPLY.cartBonus : 0);
}

/**
 * Rações gastas num dia de viagem (por pessoa: 1; mais fora da estrada e em terra árida).
 * `mult`: estação e capitão (world/season.ts, world/captains.ts).
 */
export function dailyRations(s: Squad, people: number, mult = 1): number {
  const region = node(s.to ?? s.at).region as Region;
  const harsh = SUPPLY.harshRegions.includes(region) ? SUPPLY.harshMult : 1;
  return Math.ceil(people * (s.offroad ? SUPPLY.offroadMult : 1) * harsh * mult);
}

/**
 * Um dia passa para o esquadrão. `fed` = descansou onde há comida (estalagem, base, capital).
 * Devolve a mensagem para o registro, se houver.
 */
export function supplyDay(s: Squad, people: Character[], fed: boolean, mult = 1): string | null {
  s.supplies ??= SUPPLY.start;
  if (fed || !people.length) {
    s.hungry = 0;
    return null;
  }
  const need = dailyRations(s, people.length, mult);
  if (s.supplies >= need) {
    s.supplies -= need;
    s.hungry = 0;
    return s.supplies < need * 2 ? `🍞 ${s.name}: rações para menos de 2 dias.` : null;
  }
  s.supplies = 0;
  s.hungry = (s.hungry ?? 0) + 1;
  for (const m of people) {
    m.morale = Math.max(0, (m.morale ?? 70) - SUPPLY.hungryMorale);
    if (m.woundDays > 0) m.woundDays += SUPPLY.hungryWoundDays;
  }
  return `🍞 ${s.name} está sem rações há ${s.hungry} dia(s): a moral cai e os ferimentos pioram.`;
}

/** Preço da ração agora (Colheita queimada, plano do inimigo, dobra). */
export function rationPrice(c: Campaign): number {
  return SUPPLY.price * (opActive(c, 'colheita_queimada') ? OPS.list.colheita_queimada.rationPrice : 1);
}

/** Comprar rações (até a capacidade). Devolve quantas comprou. */
export function buyRations(c: Campaign, s: Squad, people: number, n: number): number {
  s.supplies ??= SUPPLY.start;
  const price = rationPrice(c);
  const room = Math.max(0, supplyCap(s, people) - s.supplies);
  const k = Math.max(0, Math.min(n, room, Math.floor(c.gold / price)));
  s.supplies += k;
  c.gold -= k * price;
  return k;
}

/** Caça: feras abatidas viram carne. */
export function huntRations(s: Squad, people: number, beasts: number): number {
  s.supplies ??= SUPPLY.start;
  const add = Math.min(beasts * SUPPLY.huntPerBeast, Math.max(0, supplyCap(s, people) - s.supplies));
  s.supplies += add;
  return add;
}

/** Fadiga do dia: sobe viajando, cai descansando. */
export function fatigueDay(m: Character, traveling: boolean, resting: boolean): void {
  const f = m.fatigue ?? 0;
  m.fatigue = Math.max(0, Math.min(100, f + (traveling ? FATIGUE.travelPerDay : 0) - (resting ? FATIGUE.restPerDay : 0)));
}

export function isTired(m: Character): boolean {
  return (m.fatigue ?? 0) >= FATIGUE.tired;
}
