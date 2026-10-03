import type { Biome } from '../data';

export type Terrain = 'grama' | 'terra' | 'pedra' | 'areia' | 'neve' | 'madeira' | 'agua_funda';
export type Prop = 'arvore' | 'pinheiro' | 'rocha' | 'arbusto' | 'muro' | 'caixa' | 'cacto';
export type Surface = 'fogo' | 'agua' | 'agua_eletrica' | 'gelo' | 'lama' | 'oleo';
export type Cloud = 'vapor' | 'vapor_eletrico' | 'fumaca' | 'veneno' | 'gas_fetido' | 'esporos' | 'nevasca' | 'vapor_fervente' | 'nevoa_lunar' | 'chama_fria' | 'tinta' | 'nevoa_de_sangue';
export type Spawn = 'player' | 'enemy' | 'extract';

export interface Tile {
  /** Altura em níveis (0–8). */
  h: number;
  t: Terrain;
  p?: Prop | null;
  s?: Surface | null;
  sTtl?: number;
  /** Resistência restante do objeto (ausente = intacto); em 0 ele quebra. */
  pHp?: number;
  c?: Cloud | null;
  cTtl?: number;
  /** Fumaça de habilidade: quem a lançou (ela anda 1 casa a cada turno dessa unidade). */
  cBy?: string;
  /** Direção em que a fumaça anda (índice em DIRS); -1 = aura que acompanha quem lançou. */
  cDir?: number;
  /** Raio da aura que acompanha quem lançou. */
  cR?: number;
  /** Ponte de gelo: altura original e turnos restantes. */
  hBase?: number;
  hTtl?: number;
  spawn?: Spawn | null;
}

export interface BattleMap {
  id: string;
  name: string;
  w: number;
  h: number;
  biome: Biome;
  tiles: Tile[];
}

export const MAX_HEIGHT = 8;
/** Duração "permanente" de superfícies geradas pelo mapa. */
export const PERMANENT = 999;

export interface TerrainDef {
  name: string;
  color: string;
  walkable: boolean;
  flammable: boolean;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  grama: { name: 'Grama', color: '#5f9e45', walkable: true, flammable: true },
  terra: { name: 'Terra', color: '#a07f52', walkable: true, flammable: false },
  pedra: { name: 'Pedra', color: '#8b8f94', walkable: true, flammable: false },
  areia: { name: 'Areia', color: '#d9bf7a', walkable: true, flammable: false },
  neve: { name: 'Neve', color: '#e8eef4', walkable: true, flammable: false },
  madeira: { name: 'Madeira', color: '#9c6b3c', walkable: true, flammable: true },
  agua_funda: { name: 'Água funda', color: '#2f6fa3', walkable: false, flammable: false },
};

export interface PropDef {
  name: string;
  blocksMove: boolean;
  blocksLos: boolean;
  flammable: boolean;
  /** Altura visual em níveis. */
  height: number;
  color: string;
  /** Resistência: dano para destruir (coberturas são destrutíveis). */
  hp: number;
}

export const PROPS: Record<Prop, PropDef> = {
  arvore: { name: 'Árvore', blocksMove: true, blocksLos: true, flammable: true, height: 3, color: '#2f6b2a', hp: 60 },
  pinheiro: { name: 'Pinheiro', blocksMove: true, blocksLos: true, flammable: true, height: 3, color: '#2c5a3c', hp: 60 },
  rocha: { name: 'Rocha', blocksMove: true, blocksLos: true, flammable: false, height: 1, color: '#6d6f73', hp: 120 },
  arbusto: { name: 'Arbusto', blocksMove: false, blocksLos: false, flammable: true, height: 1, color: '#3f7f34', hp: 15 },
  muro: { name: 'Muro', blocksMove: true, blocksLos: true, flammable: false, height: 2, color: '#7a7066', hp: 150 },
  caixa: { name: 'Caixa', blocksMove: true, blocksLos: false, flammable: true, height: 1, color: '#a0703a', hp: 30 },
  cacto: { name: 'Cacto', blocksMove: true, blocksLos: false, flammable: true, height: 2, color: '#4f8a3a', hp: 30 },
};

export const SURFACES: Record<Surface, { name: string; color: string }> = {
  fogo: { name: 'Chamas', color: 'rgba(255,110,20,0.75)' },
  agua: { name: 'Poça', color: 'rgba(60,140,230,0.6)' },
  agua_eletrica: { name: 'Água eletrificada', color: 'rgba(120,220,255,0.8)' },
  gelo: { name: 'Gelo', color: 'rgba(200,240,255,0.85)' },
  lama: { name: 'Lama', color: 'rgba(90,60,30,0.75)' },
  oleo: { name: 'Óleo', color: 'rgba(30,25,20,0.7)' },
};

/**
 * Nuvens não cortam a linha de tiro: as que turvam (`obscures`) atrapalham muito quem atira através
 * delas ou em alguém lá dentro, menos quando os dois estão lado a lado (stats.obscuredHitChance).
 */
export interface CloudInfo {
  name: string;
  color: string;
  obscures: boolean;
  /** Status em quem está dentro (a cada rodada e ao entrar); quem lançou não sofre. */
  status?: { id: string; turns: number };
  /** Dano por rodada em quem está dentro (fração da vida máxima). */
  damagePct?: number;
  /** MP queimado por rodada de quem está dentro. */
  mpBurn?: number;
  /** Quem lançou não sofre a penalidade de acerto dentro dela. */
  ownerClear?: boolean;
  /** Crítico extra de quem lançou enquanto está dentro dela. */
  ownerCrit?: number;
}

export const CLOUDS: Record<Cloud, CloudInfo> = {
  vapor: { name: 'Vapor', color: 'rgba(235,240,245,0.55)', obscures: true },
  vapor_eletrico: { name: 'Vapor eletrificado', color: 'rgba(170,230,255,0.6)', obscures: true },
  fumaca: { name: 'Fumaça', color: 'rgba(90,90,95,0.65)', obscures: true },
  veneno: { name: 'Nuvem de veneno', color: 'rgba(120,200,60,0.5)', obscures: false },
  gas_fetido: { name: 'Gás fétido', color: 'rgba(120,120,95,0.65)', obscures: true, status: { id: 'cegado', turns: 1 } },
  esporos: { name: 'Nuvem de esporos', color: 'rgba(200,150,220,0.55)', obscures: true, status: { id: 'confuso', turns: 1 } },
  nevasca: { name: 'Nevasca', color: 'rgba(225,240,255,0.6)', obscures: true, status: { id: 'lento', turns: 1 } },
  vapor_fervente: { name: 'Vapor fervente', color: 'rgba(255,200,170,0.55)', obscures: true, damagePct: 0.06, status: { id: 'queimando', turns: 1 }, ownerClear: true },
  nevoa_lunar: { name: 'Névoa lunar', color: 'rgba(40,40,80,0.6)', obscures: true, ownerClear: true, ownerCrit: 50 },
  chama_fria: { name: 'Chama fria', color: 'rgba(90,160,255,0.5)', obscures: false, mpBurn: 6 },
  tinta: { name: 'Tinta', color: 'rgba(20,20,35,0.7)', obscures: true, status: { id: 'cegado', turns: 1 } },
  nevoa_de_sangue: { name: 'Névoa de sangue', color: 'rgba(160,20,30,0.5)', obscures: true, status: { id: 'sangramento', turns: 1 } },
};

export function idx(map: BattleMap, x: number, y: number): number {
  return y * map.w + x;
}

export function inBounds(map: BattleMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.w && y < map.h;
}

export function tileAt(map: BattleMap, x: number, y: number): Tile | undefined {
  return inBounds(map, x, y) ? map.tiles[idx(map, x, y)] : undefined;
}

export function xy(map: BattleMap, i: number): [number, number] {
  return [i % map.w, Math.floor(i / map.w)];
}

export function isWalkable(t: Tile): boolean {
  return TERRAIN[t.t].walkable && !(t.p && PROPS[t.p].blocksMove);
}

export function isFlammable(t: Tile): boolean {
  return TERRAIN[t.t].flammable || (!!t.p && PROPS[t.p].flammable);
}

export function createEmptyMap(w: number, h: number, biome: Biome, name = 'Novo mapa'): BattleMap {
  const base: Terrain = biome === 'neve' ? 'neve' : biome === 'deserto' ? 'areia' : 'grama';
  return {
    id: `map_${Date.now().toString(36)}`,
    name,
    w,
    h,
    biome,
    tiles: Array.from({ length: w * h }, () => ({ h: 1, t: base })),
  };
}

export function cloneMap(map: BattleMap): BattleMap {
  return { ...map, tiles: map.tiles.map((t) => ({ ...t })) };
}

export const DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
