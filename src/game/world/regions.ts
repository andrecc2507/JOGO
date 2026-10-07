import { BIOMES, type Biome } from '../data';
import REGIONS from '../data/world/regions.json';

/**
 * Regiões do mapa-mundo (D125). Os cinco biomas-base continuam sendo os do bestiário e do motor de
 * batalha; as **transições** misturam dois vizinhos (fronteira entre países) e os **biomas
 * distantes** ficam além das fronteiras do reino, com criaturas, terreno e masmorra próprios.
 */
export type Transition = 'taiga' | 'costa_gelada' | 'oasis' | 'estepe' | 'charneca' | 'mangue';
export type Distant = 'pantano' | 'vulcao' | 'selva' | 'geleira' | 'cristal' | 'arquipelago' | 'terra_morta';
export type Region = Biome | Transition | Distant;

interface TransitionDef {
  label: string;
  from: [Biome, Biome];
  roadSpeed: number;
  offroad: number;
}
export interface DistantDef {
  label: string;
  base: Biome;
  near: Biome[];
  roadSpeed: number;
  offroad: number;
  angle: number;
  terrain: string;
  secondary: string;
  props: [string, number][];
  surface: string | null;
  element: string;
  sea?: boolean;
  fromChapter?: number;
}

export const TRANSITIONS = REGIONS.transitions as Record<Transition, TransitionDef>;
export const DISTANT = REGIONS.distant as unknown as Record<Distant, DistantDef>;
export const CONTINENT = REGIONS.continent as { label: string; fromChapter: number; regions: Distant[] };
const BASE_SPEED = REGIONS.baseSpeed as Record<Biome, { roadSpeed: number; offroad: number }>;

export const REGION_IDS: Region[] = [...BIOMES, ...(Object.keys(TRANSITIONS) as Transition[]), ...(Object.keys(DISTANT) as Distant[])];

export function isTransition(r: Region): r is Transition {
  return r in TRANSITIONS;
}
export function isDistant(r: Region): r is Distant {
  return r in DISTANT;
}

/** Biomas-base que compõem a região (o primeiro é o dominante; vale para o motor de batalha). */
export function baseBiomes(r: Region): Biome[] {
  if (isTransition(r)) return [...TRANSITIONS[r].from];
  if (isDistant(r)) return [DISTANT[r].base, ...DISTANT[r].near.filter((b) => b !== DISTANT[r].base)];
  return [r];
}

export function baseBiome(r: Region): Biome {
  return baseBiomes(r)[0]!;
}

/** Transição entre dois biomas vizinhos (ordem não importa). */
export function transitionOf(a: Biome, b: Biome): Transition | null {
  for (const [id, t] of Object.entries(TRANSITIONS) as [Transition, TransitionDef][]) if ((t.from[0] === a && t.from[1] === b) || (t.from[0] === b && t.from[1] === a)) return id;
  return null;
}

const BASE_LABEL: Record<Biome, string> = { floresta: 'Floresta', neve: 'Montanhas de neve', costa: 'Costa', deserto: 'Deserto', planicie: 'Planície' };

export function regionLabel(r: Region): string {
  if (isTransition(r)) return TRANSITIONS[r].label;
  if (isDistant(r)) return DISTANT[r].label;
  return BASE_LABEL[r];
}

/** Velocidade de viagem na região: pela estrada e fora dela (C3). */
export function regionSpeed(r: Region, offroad = false): number {
  const d = isTransition(r) ? TRANSITIONS[r] : isDistant(r) ? DISTANT[r] : BASE_SPEED[r];
  return offroad ? d.offroad : d.roadSpeed;
}

/** Onde a criatura vive, por extenso (biomas-base e regiões). */
export function habitatLabel(c: { biomes: readonly string[] | 'all'; regions?: readonly string[] }): string {
  const list = [...(c.biomes === 'all' ? [] : c.biomes), ...(c.regions ?? [])] as Region[];
  return c.biomes === 'all' ? 'todos os biomas' : list.map(regionLabel).join(', ') || 'sem bioma';
}
