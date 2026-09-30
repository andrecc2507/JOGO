import type { Rng } from '@core';
import type { Attr, Attributes, Biome, ClassId, Element, Rarity, WeaponType } from '../data';
import type { BattleMap } from './map';

export type Team = 'player' | 'enemy';

export type StatusId =
  | 'molhado'
  | 'queimando'
  | 'congelado'
  | 'eletrocutado'
  | 'envenenado'
  | 'enlameado'
  | 'inspirado';

export const STATUS_INFO: Record<StatusId, { name: string; color: string; icon: string }> = {
  molhado: { name: 'Molhado', color: '#4aa3ff', icon: '💧' },
  queimando: { name: 'Queimando', color: '#ff7a1a', icon: '🔥' },
  congelado: { name: 'Congelado', color: '#bdefff', icon: '❄' },
  eletrocutado: { name: 'Eletrocutado', color: '#fff45a', icon: '⚡' },
  envenenado: { name: 'Envenenado', color: '#8fdc3c', icon: '☠' },
  enlameado: { name: 'Enlameado', color: '#8a6038', icon: '◍' },
  inspirado: { name: 'Inspirado', color: '#ffd54f', icon: '✦' },
};

export interface UnitLook {
  color: string;
  dark: string;
  hairColor: string;
  hairStyle: number;
  skin: string;
  size: number;
  beast: boolean;
}

export interface BattleUnit {
  uid: string;
  team: Team;
  name: string;
  classId: ClassId;
  /** Personagem da campanha representado por esta unidade. */
  charId?: string;
  enemyId?: string;
  level: number;
  attrs: Attributes;
  maxHp: number;
  hp: number;
  startHp: number;
  maxMp: number;
  mp: number;
  def: number;
  weaponAtk: number;
  weaponRange: number;
  weaponType: WeaponType;
  attackAttr: Attr;
  accuracy: number;
  evasion: number;
  crit: number;
  healBonus: number;
  move: number;
  jump: number;
  x: number;
  y: number;
  /** 0:+x 1:+y 2:-x 3:-y */
  facing: number;
  /** Barra de ação 0–100. */
  gauge: number;
  skills: string[];
  items: (string | null)[];
  statuses: Partial<Record<StatusId, number>>;
  hidden: boolean;
  overwatch: boolean;
  defending: boolean;
  alive: boolean;
  kills: number;
  isTarget?: boolean;
  tier?: Rarity;
  element?: Element;
  tameable?: boolean;
  look: UnitLook;
}

export type Victory =
  | { type: 'eliminate' }
  | { type: 'target'; uid?: string }
  | { type: 'escape' }
  | { type: 'survive'; rounds: number };

export const VICTORY_LABEL: Record<Victory['type'], string> = {
  eliminate: 'Derrote todos os inimigos',
  target: 'Derrote o alvo marcado',
  escape: 'Leve o esquadrão até a zona de fuga',
  survive: 'Sobreviva até a rodada indicada',
};

export type BattleEvent =
  | { type: 'damage'; uid: string; amount: number; crit?: boolean; element?: Element }
  | { type: 'heal'; uid: string; amount: number; mp?: boolean }
  | { type: 'miss'; uid: string }
  | { type: 'death'; uid: string }
  | { type: 'text'; x: number; y: number; text: string; color: string }
  | { type: 'fx'; x: number; y: number; element: Element | 'hit' };

export interface TurnState {
  moved: boolean;
  acted: boolean;
  startX: number;
  startY: number;
}

export interface BattleState {
  map: BattleMap;
  units: BattleUnit[];
  time: number;
  round: number;
  nextRoundAt: number;
  activeUid: string | null;
  turn: TurnState;
  victory: Victory;
  outcome: null | 'victory' | 'defeat' | 'fled';
  log: string[];
  events: BattleEvent[];
  rng: Rng;
  biome: Biome;
  ambush: boolean;
  canFlee: boolean;
  revealAll: boolean;
}

export interface UnitSeed {
  team: Team;
  /** Unidade já construída (personagem ou inimigo). */
  unit: BattleUnit;
}

export interface BattleContext {
  kind: 'encounter' | 'contract' | 'dev' | 'editor';
  squadId?: string;
  contractId?: string;
  tier?: Rarity;
  baseXp: number;
  gold: number;
  itemDrops: string[];
  title: string;
}

export interface BattleSetup {
  map: BattleMap;
  players: BattleUnit[];
  enemies: BattleUnit[];
  victory: Victory;
  ambush: boolean;
  canFlee: boolean;
  seed: number;
  context: BattleContext;
}

export interface UnitOutcome {
  charId: string;
  alive: boolean;
  hp: number;
  mp: number;
  maxHp: number;
  startHp: number;
  kills: number;
  killXp: number;
  items: (string | null)[];
}

export interface BattleResult {
  outcome: 'victory' | 'defeat' | 'fled';
  context: BattleContext;
  units: UnitOutcome[];
  rounds: number;
}
