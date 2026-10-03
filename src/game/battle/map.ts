import type { Biome } from '../data';

export type Terrain =
  | 'grama' | 'terra' | 'pedra' | 'areia' | 'neve' | 'madeira' | 'agua_funda'
  | 'musgo' | 'cascalho' | 'pantano' | 'gelo_eterno' | 'lava'
  | 'caverna' | 'rocha_viva' | 'cristal' | 'abismo'
  | 'paralelepipedo' | 'lajota' | 'marmore' | 'tapete' | 'arenito'
  | 'telhado' | 'ardosia' | 'palha' | 'adobe' | 'muralha'
  | 'vazio' | 'carne' | 'escombros' | 'enxaimel' | 'tijolo';
export type Prop =
  | 'arvore' | 'pinheiro' | 'rocha' | 'arbusto' | 'muro' | 'caixa' | 'cacto'
  | 'arvore_morta' | 'tronco' | 'cogumelo' | 'flores'
  | 'estalagmite' | 'cristal' | 'minerio' | 'ossos' | 'teia' | 'cogumelos_brilho'
  | 'parede_madeira' | 'pilar' | 'pilar_quebrado' | 'carroca' | 'barril' | 'feno' | 'cerca' | 'poco'
  | 'banca' | 'tenda' | 'estatua' | 'fonte' | 'lampiao' | 'fogueira' | 'banco' | 'mesa' | 'estante'
  | 'bau' | 'altar' | 'trono' | 'estandarte' | 'portao'
  | 'lapide' | 'sarcofago' | 'obelisco' | 'portal_vazio';
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
  /**
   * Porta. Com uma peça logo acima (vão de passagem), é uma porta de verdade que abre e fecha;
   * num bloco maciço sem nada em cima, é só o desenho na face da frente (mapas antigos).
   */
  door?: boolean;
  /** Porta aberta (deixa passar a visão). */
  open?: boolean;
  /** Escada encostada: sobe e desce desta coluna sem limite de salto e liga os andares dela. */
  ladder?: boolean;
  /**
   * Peças de construção empilhadas sobre o chão (de baixo para cima): paredes, lajes de andar,
   * telhados. Cada uma é um bloco maciço de `b` até `h`; os vãos entre elas são andares, portas e
   * janelas. Ver battle/stack.ts.
   */
  up?: Slab[];
}

/** Peça de construção: bloco maciço de `b` até `h` (níveis absolutos) que pode quebrar e cair. */
export interface Slab {
  b: number;
  h: number;
  t: Terrain;
  p?: Prop | null;
  pHp?: number;
  /** Resistência restante (ausente = intacta; ver TERRAIN[t].hp). */
  hp?: number;
  /** Porta no vão logo acima desta peça. */
  door?: boolean;
  open?: boolean;
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

/** Grupos da paleta do editor (ambientes da história). */
export type MapGroup = 'natureza' | 'caverna' | 'cidade' | 'construcao' | 'templo' | 'vazio';
export const GROUP_LABEL: Record<MapGroup, string> = {
  natureza: '🌲 Natureza',
  caverna: '⛰ Caverna',
  cidade: '🏘 Cidade e vila',
  construcao: '🧱 Telhados e muros',
  templo: '⛪ Templo e palácio',
  vazio: '🌀 Vazio',
};

/** Desenho das paredes laterais de um bloco (casas, muralhas, paredes de caverna). */
export type WallPattern = 'pedra' | 'enxaimel' | 'adobe' | 'rocha' | 'tijolo';

/** Textura desenhada sobre a cor do topo (ver render/terrain_art.ts). */
export type TerrainTexture =
  | 'terra' | 'madeira' | 'musgo' | 'cascalho' | 'pantano' | 'gelo' | 'lava' | 'caverna' | 'cristal' | 'abismo'
  | 'paralelepipedo' | 'lajota' | 'marmore' | 'tapete' | 'telhas' | 'palha' | 'vazio' | 'carne' | 'neve' | 'areia' | 'grama';

export interface TerrainDef {
  name: string;
  color: string;
  walkable: boolean;
  flammable: boolean;
  group: MapGroup;
  /** Cor das laterais (paredes); sem ela, a lateral é o topo escurecido. */
  side?: string;
  /** Desenho das laterais (janelas, tábuas, tijolos). */
  wall?: WallPattern;
  tex?: TerrainTexture;
  /** Líquido (ondula na tela). */
  liquid?: boolean;
  /** Brilha à noite (cor da luz). */
  light?: string;
  /** Resistência de uma peça de construção feita deste material. */
  hp?: number;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  grama: { name: 'Grama', color: '#5f9e45', walkable: true, flammable: true, group: 'natureza', tex: 'grama' },
  terra: { name: 'Terra', color: '#a07f52', walkable: true, flammable: false, group: 'natureza', tex: 'terra' },
  pedra: { name: 'Pedra', color: '#8b8f94', walkable: true, flammable: false, group: 'natureza', hp: 100 },
  areia: { name: 'Areia', color: '#d9bf7a', walkable: true, flammable: false, group: 'natureza', tex: 'areia' },
  neve: { name: 'Neve', color: '#e8eef4', walkable: true, flammable: false, group: 'natureza', tex: 'neve' },
  madeira: { name: 'Assoalho / píer', color: '#9c6b3c', walkable: true, flammable: true, group: 'cidade', side: '#6e4a28', tex: 'madeira', hp: 40 },
  agua_funda: { name: 'Água funda', color: '#2f6fa3', walkable: false, flammable: false, group: 'natureza', liquid: true },
  musgo: { name: 'Musgo (Verdelume)', color: '#4f7a3a', walkable: true, flammable: true, group: 'natureza', tex: 'musgo' },
  cascalho: { name: 'Cascalho', color: '#8a8378', walkable: true, flammable: false, group: 'natureza', tex: 'cascalho' },
  pantano: { name: 'Pântano', color: '#4d5a35', walkable: true, flammable: false, group: 'natureza', tex: 'pantano' },
  gelo_eterno: { name: 'Gelo eterno (Cristália)', color: '#bfe3f2', walkable: true, flammable: false, group: 'natureza', side: '#8fc4dc', tex: 'gelo' },
  lava: { name: 'Lava', color: '#e0521c', walkable: false, flammable: false, group: 'caverna', liquid: true, tex: 'lava', light: '#ff7a2a' },
  caverna: { name: 'Chão de caverna', color: '#4a4540', walkable: true, flammable: false, group: 'caverna', side: '#38332e', tex: 'caverna' },
  rocha_viva: { name: 'Parede de caverna', color: '#5a534c', walkable: true, flammable: false, group: 'caverna', side: '#3a342f', wall: 'rocha', tex: 'caverna', hp: 160 },
  cristal: { name: 'Veio de cristal', color: '#7fb8d8', walkable: true, flammable: false, group: 'caverna', side: '#4f7f9c', tex: 'cristal', light: '#9fe3ff' },
  abismo: { name: 'Abismo', color: '#0c0a12', walkable: false, flammable: false, group: 'caverna', side: '#07060b', tex: 'abismo' },
  paralelepipedo: { name: 'Paralelepípedo (ruas)', color: '#8c8780', walkable: true, flammable: false, group: 'cidade', side: '#6a665f', tex: 'paralelepipedo', hp: 90 },
  lajota: { name: 'Laje de pedra', color: '#a39e94', walkable: true, flammable: false, group: 'templo', side: '#7d786f', tex: 'lajota', hp: 90 },
  marmore: { name: 'Mármore (Solenne, palácio)', color: '#e4e0d6', walkable: true, flammable: false, group: 'templo', side: '#bdb8ac', tex: 'marmore', hp: 110 },
  tapete: { name: 'Tapete real', color: '#8e2430', walkable: true, flammable: true, group: 'templo', tex: 'tapete', hp: 30 },
  arenito: { name: 'Arenito (Vel\'Qadar)', color: '#c9a26a', walkable: true, flammable: false, group: 'cidade', side: '#a8804c', tex: 'lajota', hp: 80 },
  telhado: { name: 'Telhado de barro', color: '#a8503a', walkable: true, flammable: false, group: 'construcao', side: '#d8c7a0', wall: 'enxaimel', tex: 'telhas', hp: 50 },
  ardosia: { name: 'Telhado de ardósia', color: '#4c5866', walkable: true, flammable: false, group: 'construcao', side: '#8a8f96', wall: 'pedra', tex: 'telhas', hp: 70 },
  palha: { name: 'Telhado de palha', color: '#c8a457', walkable: true, flammable: true, group: 'construcao', side: '#cdb894', wall: 'enxaimel', tex: 'palha', hp: 25 },
  adobe: { name: 'Terraço de adobe', color: '#c79a64', walkable: true, flammable: false, group: 'construcao', side: '#c08e58', wall: 'adobe', hp: 60 },
  muralha: { name: 'Muralha / torre', color: '#8d8a84', walkable: true, flammable: false, group: 'construcao', side: '#76726c', wall: 'pedra', tex: 'lajota', hp: 120 },
  vazio: { name: 'Chão do Vazio', color: '#3b2a52', walkable: true, flammable: false, group: 'vazio', side: '#24183a', tex: 'vazio', light: '#8a5cff' },
  enxaimel: { name: 'Parede de enxaimel', color: '#d8c7a0', walkable: true, flammable: true, group: 'construcao', side: '#d8c7a0', wall: 'enxaimel', tex: 'madeira', hp: 45 },
  tijolo: { name: 'Parede de tijolo', color: '#9a5a44', walkable: true, flammable: false, group: 'construcao', side: '#9a5a44', wall: 'tijolo', hp: 90 },
  escombros: { name: 'Escombros', color: '#7d766c', walkable: true, flammable: false, group: 'construcao', side: '#5e584f', tex: 'cascalho', hp: 30 },
  carne: { name: 'Carne do Vazio', color: '#6e2a3a', walkable: true, flammable: false, group: 'vazio', side: '#4a1726', tex: 'carne' },
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
  group: MapGroup;
  /** Brilha à noite (cor da luz). */
  light?: string;
}

const P = (name: string, group: MapGroup, height: number, color: string, hp: number, o: { move?: boolean; los?: boolean; fire?: boolean; light?: string } = {}): PropDef => ({
  name,
  group,
  height,
  color,
  hp,
  blocksMove: o.move ?? true,
  blocksLos: o.los ?? false,
  flammable: o.fire ?? false,
  light: o.light,
});

export const PROPS: Record<Prop, PropDef> = {
  arvore: P('Árvore', 'natureza', 3, '#2f6b2a', 60, { los: true, fire: true }),
  pinheiro: P('Pinheiro', 'natureza', 3, '#2c5a3c', 60, { los: true, fire: true }),
  rocha: P('Rocha', 'natureza', 1, '#6d6f73', 120, { los: true }),
  arbusto: P('Arbusto', 'natureza', 1, '#3f7f34', 15, { move: false, fire: true }),
  cacto: P('Cacto', 'natureza', 2, '#4f8a3a', 30, { fire: true }),
  arvore_morta: P('Árvore morta', 'natureza', 3, '#5a4632', 40, { fire: true }),
  tronco: P('Tronco caído', 'natureza', 1, '#6b4a2c', 40, { fire: true }),
  cogumelo: P('Cogumelo gigante', 'natureza', 2, '#b0413e', 30, { fire: true }),
  flores: P('Flores', 'natureza', 0, '#e0a0c8', 5, { move: false, fire: true }),
  estalagmite: P('Estalagmite', 'caverna', 2, '#6e665c', 100, { los: true }),
  cristal: P('Cristal', 'caverna', 2, '#8fd6ff', 70, { light: '#8fd6ff' }),
  minerio: P('Veio de minério', 'caverna', 1, '#7a6a58', 110, { los: true }),
  ossos: P('Ossos', 'caverna', 0, '#d8d0bc', 5, { move: false }),
  teia: P('Teia', 'caverna', 1, '#e8e8ee', 5, { move: false, fire: true }),
  cogumelos_brilho: P('Cogumelos brilhantes', 'caverna', 0, '#66f0c8', 5, { move: false, light: '#66f0c8' }),
  muro: P('Muro de pedra', 'cidade', 2, '#7a7066', 150, { los: true }),
  parede_madeira: P('Paliçada de madeira', 'cidade', 2, '#7a5530', 80, { los: true, fire: true }),
  pilar: P('Pilar', 'templo', 3, '#cfcac0', 140, { los: true }),
  pilar_quebrado: P('Pilar quebrado', 'templo', 1, '#a9a49a', 100, {}),
  carroca: P('Carroça', 'cidade', 1, '#8a5a30', 50, { fire: true }),
  barril: P('Barril', 'cidade', 1, '#7d5230', 25, { fire: true }),
  caixa: P('Caixa', 'cidade', 1, '#a0703a', 30, { fire: true }),
  feno: P('Fardo de feno', 'cidade', 1, '#d8b456', 20, { fire: true }),
  cerca: P('Cerca', 'cidade', 1, '#8a6a40', 20, { fire: true }),
  poco: P('Poço', 'cidade', 1, '#8a8780', 120, {}),
  banca: P('Banca de mercado', 'cidade', 2, '#b0402c', 40, { fire: true }),
  tenda: P('Tenda', 'cidade', 2, '#d8c8a0', 30, { los: true, fire: true }),
  estatua: P('Estátua', 'templo', 3, '#b8b4ac', 160, { los: true }),
  fonte: P('Fonte', 'cidade', 1, '#a8b0b8', 130, {}),
  lampiao: P('Poste com lampião', 'cidade', 3, '#3a3a40', 40, { light: '#ffcc66' }),
  fogueira: P('Fogueira', 'cidade', 0, '#ff8a30', 20, { light: '#ff9a40' }),
  banco: P('Banco', 'cidade', 0, '#8a6038', 20, { fire: true }),
  mesa: P('Mesa', 'cidade', 1, '#8a5a32', 25, { fire: true }),
  estante: P('Estante de livros', 'templo', 2, '#6a4426', 35, { los: true, fire: true }),
  bau: P('Baú', 'cidade', 1, '#9a6a2a', 40, { fire: true }),
  altar: P('Altar', 'templo', 1, '#d8d2c4', 140, {}),
  trono: P('Trono', 'templo', 2, '#c9a14a', 120, {}),
  estandarte: P('Estandarte', 'templo', 3, '#8e2430', 25, { fire: true }),
  portao: P('Portão de ferro', 'cidade', 2, '#3c3c44', 160, {}),
  lapide: P('Lápide', 'templo', 1, '#8f8c86', 80, {}),
  sarcofago: P('Sarcófago', 'templo', 1, '#a7a196', 140, {}),
  obelisco: P('Obelisco rúnico (Selo)', 'vazio', 3, '#3a3048', 180, { los: true, light: '#b07cff' }),
  portal_vazio: P('Portal do Vazio', 'vazio', 3, '#5a2a8a', 999, { light: '#c08cff' }),
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

/** Cópia de um tile com as peças empilhadas (elas são objetos próprios). */
export function cloneTile(t: Tile): Tile {
  return t.up ? { ...t, up: t.up.map((s) => ({ ...s })) } : { ...t };
}

export function cloneMap(map: BattleMap): BattleMap {
  return { ...map, tiles: map.tiles.map(cloneTile) };
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
