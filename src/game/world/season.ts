import type { Rng } from '@core';
import EXP from '../data/world/expedition.json';
import type { BattleSetup } from '../battle/types';
import { PERMANENT } from '../battle/map';
import { baseBiomes, type Region } from './regions';
import { capitals } from './layout';

/**
 * Estações e clima (C7). Cada mês é uma estação (primavera → verão → outono → inverno). O inverno
 * deixa as terras frias lentas; a primavera inunda brejos e costas; o verão torna as terras áridas
 * sedentas; no outono e no inverno as tempestades fecham o mar por alguns dias. O clima do dia vai
 * para a batalha: chuva deixa poças, neve deixa gelo, neblina encurta a visão.
 */
export const SEASONS = EXP.seasons;
export type Season = 'primavera' | 'verao' | 'outono' | 'inverno';
export type Weather = 'limpo' | 'chuva' | 'neve' | 'neblina';

export const WEATHER_LABEL: Record<Weather, string> = { limpo: '', chuva: '🌧 Chuva', neve: '🌨 Neve', neblina: '🌫 Neblina' };

export interface SeasonState {
  weather: Weather;
  /** Tempestade no mar até esta hora. */
  stormUntil?: number;
  /** Capital em festa neste mês (preços menores). */
  festival?: string;
}

export interface SeasonHost {
  hours: number;
  season?: SeasonState;
}

export function ensureSeason(c: SeasonHost): SeasonState {
  c.season ??= { weather: 'limpo' };
  return c.season;
}

export function seasonOf(c: Pick<SeasonHost, 'hours'>): Season {
  const month = Math.floor(c.hours / 24 / 30);
  return SEASONS.order[month % SEASONS.order.length] as Season;
}

export function seasonLabel(c: SeasonHost): string {
  const w = ensureSeason(c).weather;
  return `${(SEASONS.label as Record<Season, string>)[seasonOf(c)]}${w !== 'limpo' ? ` · ${WEATHER_LABEL[w]}` : ''}`;
}

/** Multiplicador de velocidade da estação numa região. */
export function seasonSpeed(c: Pick<SeasonHost, 'hours'>, region: Region): number {
  const s = seasonOf(c);
  if (s === 'inverno' && SEASONS.winterSlow.includes(region)) return SEASONS.winterSpeed;
  if (s === 'primavera' && SEASONS.springFlood.includes(region)) return SEASONS.springSpeed;
  return 1;
}

/** Multiplicador de rações (verão nas terras áridas: falta água). */
export function seasonRations(c: Pick<SeasonHost, 'hours'>, region: Region): number {
  return seasonOf(c) === 'verao' && SEASONS.summerHarsh.includes(region) ? SEASONS.summerRations : 1;
}

export function stormAtSea(c: SeasonHost): boolean {
  return (ensureSeason(c).stormUntil ?? 0) > c.hours;
}

/** O dia vira: sorteia o clima e, no outono/inverno, uma tempestade no mar. Devolve avisos. */
export function seasonDay(c: SeasonHost, rng: Rng): string[] {
  const st = ensureSeason(c);
  const s = seasonOf(c);
  const odds = (SEASONS.weather as Record<Season, Partial<Record<Weather, number>>>)[s];
  let roll = rng.next();
  st.weather = 'limpo';
  for (const [w, p] of Object.entries(odds) as [Weather, number][]) {
    if (roll < p) {
      st.weather = w;
      break;
    }
    roll -= p;
  }
  const storm = (SEASONS.stormChance as Partial<Record<Season, number>>)[s] ?? 0;
  if (!stormAtSea(c) && storm && rng.chance(storm)) {
    st.stormUntil = c.hours + SEASONS.stormDays * 24;
    return [`⛈ Tempestade no mar: barcos parados por ${SEASONS.stormDays} dias.`];
  }
  return [];
}

/** Virada do mês: nova estação e uma capital em festa. */
export function seasonMonth(c: SeasonHost, rng: Rng): string[] {
  const st = ensureSeason(c);
  const cap = rng.pick(capitals());
  st.festival = cap.id;
  return [`${(SEASONS.label as Record<Season, string>)[seasonOf(c)]}: festa da estação em ${cap.name} (loja ${Math.round((1 - SEASONS.festivalDiscount) * 100)}% mais barata).`];
}

export function festivalMult(c: SeasonHost, capitalId: string): number {
  return ensureSeason(c).festival === capitalId ? SEASONS.festivalDiscount : 1;
}

/** Clima que vale numa região (neve só nas terras frias; no deserto não chove). */
export function weatherIn(c: SeasonHost, region: Region): Weather {
  const w = ensureSeason(c).weather;
  const biomes = baseBiomes(region);
  if (w === 'neve' && !biomes.includes('neve') && !SEASONS.winterSlow.includes(region)) return 'chuva';
  if (w === 'chuva' && (biomes.includes('deserto') || region === 'vulcao')) return 'limpo';
  return w;
}

/** Leva o clima para a batalha: poças de chuva, placas de gelo, neblina (visão de noite). */
export function applyWeather(setup: BattleSetup, weather: Weather, rng: Rng): void {
  if (weather === 'limpo') return;
  setup.context.title = `${setup.context.title} · ${WEATHER_LABEL[weather]}`;
  if (weather === 'neblina') {
    setup.timeOfDay = 'noite';
    return;
  }
  const surface = weather === 'chuva' ? 'agua' : 'gelo';
  const share = (SEASONS.weatherSurface as Record<string, number>)[weather] ?? 0;
  for (const t of setup.map.tiles) {
    if (t.p || t.s || t.spawn || t.t === 'agua_funda' || t.t === 'lava' || t.t === 'abismo') continue;
    if (rng.chance(share)) {
      t.s = surface;
      t.sTtl = PERMANENT;
    }
  }
}
