/** Tipos dos domínios de dados (conteúdo em JSON). */

export const ATTRS = ['str', 'dex', 'int', 'vit', 'con', 'spd'] as const;
export type Attr = (typeof ATTRS)[number];
export type Attributes = Record<Attr, number>;

export const ATTR_LABEL: Record<Attr, string> = {
  str: 'Força',
  dex: 'Destreza',
  int: 'Inteligência',
  vit: 'Vitalidade',
  con: 'Constituição',
  spd: 'Velocidade',
};
export const ATTR_SHORT: Record<Attr, string> = { str: 'FOR', dex: 'DES', int: 'INT', vit: 'VIT', con: 'CON', spd: 'VEL' };

export type ClassId = 'aprendiz' | 'guerreiro' | 'arqueiro' | 'mago' | 'clerigo' | 'ladrao' | 'fera';
export type WeaponType = 'espada' | 'arco' | 'varinha' | 'bastao' | 'faca' | 'natural';
export type Biome = 'floresta' | 'neve' | 'costa' | 'deserto' | 'planicie';
export type Element = 'fogo' | 'agua' | 'gelo' | 'eletricidade' | 'vento' | 'terra' | 'veneno' | 'luz' | 'sombra';
export type Rarity = 'comum' | 'raro' | 'epico' | 'lendario';
/** Elemento de uma criatura; 'neutro' = sem afinidade. */
export type CreatureElement = Element | 'neutro';
export const ELEMENTS: Element[] = ['fogo', 'agua', 'gelo', 'eletricidade', 'vento', 'terra', 'veneno', 'luz', 'sombra'];
export const BIOMES: Biome[] = ['floresta', 'neve', 'costa', 'deserto', 'planicie'];
export const RARITIES: Rarity[] = ['comum', 'raro', 'epico', 'lendario'];

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  move: number;
  jump: number;
  hpBase: number;
  mpBase: number;
  weapons: WeaponType[];
  skills: string[];
  /** Pontos extras na distribuição inicial de recrutas desta classe. */
  bias: Partial<Attributes>;
  color: string;
  dark: string;
}

export type SkillKind = 'physical' | 'ranged' | 'magic' | 'heal' | 'buff' | 'utility';
export type SkillTarget = 'enemy' | 'ally' | 'tile' | 'self';
export type SkillShape = 'single' | 'radius' | 'line';

export interface SkillDef {
  id: string;
  name: string;
  classId: ClassId;
  mp: number;
  /** Alcance em tiles; -1 = alcance da arma. */
  range: number;
  target: SkillTarget;
  shape: SkillShape;
  radius?: number;
  kind: SkillKind;
  power: number;
  element?: Element;
  accuracy?: number;
  status?: { id: string; turns: number };
  levelReq?: number;
  /** Turnos de recarga após usar (0 = sem recarga). */
  cooldown?: number;
  /** Habilidade passiva: nunca é "usada", só modifica regras. */
  passive?: boolean;
  /** Efeito especial resolvido pelo motor (ex.: 'hide_in_snow', 'snow_evasion'). */
  effect?: string;
  /** Valor numérico do efeito especial (turnos, bônus…). */
  value?: number;
  description: string;
}

export interface ComboDef {
  id: string;
  name: string;
  a: string;
  b: string;
  /** Distância máxima entre os parceiros. */
  partnerRange: number;
  result: Omit<SkillDef, 'id' | 'name' | 'classId' | 'mp' | 'description'>;
  description: string;
}

export type ItemSlot = 'weapon' | 'offhand' | 'armor' | 'accessory' | 'utility';
export interface ItemDef {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  price: number;
  weaponType?: WeaponType;
  atk?: number;
  range?: number;
  def?: number;
  bonus?: Partial<Attributes & { crit: number; evasion: number; accuracy: number; heal: number }>;
  use?: { heal?: number; mp?: number; throwElement?: Element; radius?: number; smoke?: boolean };
  description: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  kind: 'human' | 'beast';
  classId?: ClassId;
  biomes: Biome[] | 'all';
  tier: Rarity;
  tameable?: boolean;
  /** Atributos base de feras (humanos são gerados pela classe). */
  attrs?: Attributes;
  hp?: number;
  atk?: number;
  range?: number;
  move?: number;
  element?: Element;
  skills?: string[];
  color: string;
  size?: number;
  description?: string;
  levelMin?: number;
  levelMax?: number;
  xp?: number;
  sprite?: string[];
  palette?: Record<string, string>;
}

/** Habilidade de criatura (definida dentro da ficha do bestiário). */
export interface CreatureSkill {
  id: string;
  name: string;
  description: string;
  /** physical: ataque corpo a corpo · utility: efeito em si mesma · passive: sempre ativa. */
  kind: 'physical' | 'utility' | 'passive';
  range: number;
  power: number;
  cooldown: number;
  effect?: 'hide_in_snow' | 'snow_evasion';
  value?: number;
  status?: { id: string; turns: number };
}

/** Ficha do bestiário — fonte única das criaturas do jogo. */
export interface CreatureDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  levelMin: number;
  levelMax: number;
  /** HP no nível mínimo (cresce ~9% por nível). */
  hp: number;
  element: CreatureElement;
  /** Deslocamento em metros (1 tile = 1 m). */
  move: number;
  /** Tamanho em tiles (lado). */
  size: number;
  /** XP por abate no nível mínimo. */
  xp: number;
  attrs: Attributes;
  biomes: Biome[];
  tameable: boolean;
  skills: CreatureSkill[];
  /** Pixel art de combate: linhas de letras mapeadas na paleta ('.' = transparente). */
  sprite: string[];
  palette: Record<string, string>;
}

export interface CountryDef {
  id: string;
  name: string;
  classId: ClassId;
  biome: Biome;
  color: string;
  capital: string;
  cities: string[];
}

declare module '@core/data/data_registry' {
  interface DataCatalog {
    classes: ClassDef;
    skills: SkillDef;
    combos: ComboDef;
    items: ItemDef;
    enemies: EnemyDef;
    countries: CountryDef;
    creatures: CreatureDef;
  }
}
