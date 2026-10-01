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
  | 'inspirado'
  | 'cegado'
  | 'submerso'
  | 'sangramento'
  | 'atordoado'
  | 'lento'
  | 'imobilizado'
  | 'derrubado'
  | 'medo'
  | 'desarmado'
  | 'silenciado'
  | 'confuso'
  | 'quebrado'
  | 'ferida_aberta'
  | 'preso'
  | 'aprisionado'
  | 'marcado'
  | 'fortificado'
  | 'veloz'
  | 'afiado'
  | 'regenerando'
  | 'camuflado'
  | 'refletindo'
  | 'intangivel'
  | 'semente'
  | 'duplicatas'
  | 'enfraquecido'
  | 'sem_itens'
  | 'exposto'
  | 'sono'
  | 'encantado'
  | 'inabalavel'
  | 'ancorado'
  | 'eficiente'
  | 'invulneravel'
  | 'provocado'
  | 'martirio'
  | 'preparado'
  | 'vulneravel'
  | 'sem_reacao'
  | 'frenesi'
  | 'protegido'
  | 'voando'
  | 'sem_alcance'
  | 'musculo_cortado';

export const STATUS_INFO: Record<StatusId, { name: string; color: string; icon: string; debuff?: boolean; help?: string }> = {
  molhado: { name: 'Molhado', color: '#4aa3ff', icon: '💧' },
  queimando: { name: 'Queimando', color: '#ff7a1a', icon: '🔥', debuff: true },
  congelado: { name: 'Congelado', color: '#bdefff', icon: '❄', debuff: true },
  eletrocutado: { name: 'Eletrocutado', color: '#fff45a', icon: '⚡', debuff: true },
  envenenado: { name: 'Envenenado', color: '#8fdc3c', icon: '☠', debuff: true },
  enlameado: { name: 'Enlameado', color: '#8a6038', icon: '◍', debuff: true },
  inspirado: { name: 'Inspirado (+25% dano)', color: '#ffd54f', icon: '✦' },
  cegado: { name: 'Cegado (−25 acerto)', color: '#e0e0e0', icon: '✖', debuff: true },
  submerso: { name: 'Submerso na neve', color: '#e3f2fd', icon: '❄' },
  sangramento: { name: 'Sangramento', color: '#e53935', icon: '🩸', debuff: true, help: 'Perde vida a cada turno.' },
  atordoado: { name: 'Atordoado', color: '#ffee58', icon: '💫', debuff: true, help: 'Perde o próximo turno.' },
  lento: { name: 'Lento', color: '#90a4ae', icon: '🐌', debuff: true, help: '−2 m de movimento e barra 30% mais lenta. Lento de novo = imobilizado.' },
  imobilizado: { name: 'Imobilizado', color: '#a1887f', icon: '⛓', debuff: true, help: 'Não pode se mover.' },
  derrubado: { name: 'Derrubado', color: '#bcaaa4', icon: '⤵', debuff: true, help: '−20 esquiva e −2 m de movimento.' },
  medo: { name: 'Apavorado', color: '#ce93d8', icon: '😱', debuff: true, help: 'Não consegue atacar.' },
  desarmado: { name: 'Desarmado', color: '#b0bec5', icon: '🚫', debuff: true, help: 'Sem ataques físicos.' },
  silenciado: { name: 'Silenciado', color: '#7e57c2', icon: '🔇', debuff: true, help: 'Não usa habilidades.' },
  confuso: { name: 'Confuso', color: '#f48fb1', icon: '❓', debuff: true, help: '−30 acerto e −15 esquiva.' },
  quebrado: { name: 'Armadura quebrada', color: '#8d6e63', icon: '🛡', debuff: true, help: 'Defesa pela metade.' },
  ferida_aberta: { name: 'Ferida aberta', color: '#c62828', icon: '✚', debuff: true, help: 'Não recebe cura.' },
  preso: { name: 'Agarrado', color: '#6d4c41', icon: '✊', debuff: true, help: 'Não se move e sofre dano; solta se o captor cair ou levar um golpe forte.' },
  aprisionado: { name: 'Aprisionado', color: '#4e342e', icon: '⛓', debuff: true, help: 'Não age e sofre dano; solta se o captor cair ou levar um golpe forte.' },
  marcado: { name: 'Marcado', color: '#ff7043', icon: '◎', debuff: true, help: 'Sofre um golpe quando a marca expira.' },
  fortificado: { name: 'Fortificado', color: '#90caf9', icon: '🛡', help: 'Defesa +50%.' },
  veloz: { name: 'Veloz', color: '#80deea', icon: '»', help: '+2 m de movimento e barra 30% mais rápida.' },
  afiado: { name: 'Afiado', color: '#ffab91', icon: '✧', help: '+25% de crítico.' },
  regenerando: { name: 'Regenerando', color: '#a5d6a7', icon: '✚', help: 'Recupera 8% da vida por turno.' },
  camuflado: { name: 'Camuflado', color: '#81c784', icon: '🍃' },
  refletindo: { name: 'Refletindo magia', color: '#b39ddb', icon: '◈' },
  intangivel: { name: 'Intangível', color: '#e0f7fa', icon: '≈', help: 'Imune a dano físico.' },
  semente: { name: 'Adormecido (revive)', color: '#66bb6a', icon: '✿', help: 'Revive se não for destruído a tempo.' },
  duplicatas: { name: 'Duplicatas', color: '#e1bee7', icon: '👥', help: '+30 de esquiva.' },
  enfraquecido: { name: 'Enfraquecido', color: '#bcaaa4', icon: '↓', debuff: true, help: 'Causa 25% menos dano.' },
  sem_itens: { name: 'Itens congelados', color: '#b3e5fc', icon: '🧊', debuff: true, help: 'Não pode usar itens.' },
  exposto: { name: 'Exposto', color: '#ff8a65', icon: '◎', debuff: true, help: 'Esquiva zerada.' },
  sono: { name: 'Dormindo', color: '#9fa8da', icon: '💤', debuff: true, help: 'Perde o turno; acorda ao sofrer dano.' },
  encantado: { name: 'Arma encantada', color: '#ce93d8', icon: '✦', help: 'Ataques básicos com efeito extra.' },
  ancorado: { name: 'Postura ancorada', color: '#a1887f', icon: '⚓', help: 'Não é empurrado nem derrubado; +20 de acerto.' },
  eficiente: { name: 'Encantamento veloz', color: '#80cbc4', icon: '◇', help: 'Habilidades custam 30% menos MP.' },
  invulneravel: { name: 'Invulnerável', color: '#fff59d', icon: '✪', help: 'Não sofre dano.' },
  provocado: { name: 'Provocado', color: '#ff7043', icon: '❗', debuff: true, help: 'Só consegue atacar quem o provocou.' },
  martirio: { name: 'Selo de Martírio', color: '#f8bbd0', icon: '✝', help: 'Quem o ferir sofre o mesmo dano.' },
  preparado: { name: 'Golpe preparado', color: '#fff176', icon: '⚔', help: 'Próximo golpe: crítico garantido.' },
  vulneravel: { name: 'Analisado', color: '#ff8a80', icon: '◉', debuff: true, help: 'Sofre +20% de dano.' },
  sem_reacao: { name: 'Sem reação', color: '#b0bec5', icon: '⊘', debuff: true, help: 'Não pode usar reações.' },
  frenesi: { name: 'Frenesi', color: '#ff5252', icon: '♨', help: '+30% de dano e defesa, barra mais rápida. Ao acabar: cansaço.' },
  protegido: { name: 'Protegido', color: '#90caf9', icon: '⛨', help: 'Sofre 50% menos dano.' },
  voando: { name: 'Voando', color: '#e1f5fe', icon: '🪽', help: 'Ignora elevação, lama, superfícies e armadilhas do chão.' },
  musculo_cortado: { name: 'Músculo cortado', color: '#e57373', icon: '✂', debuff: true, help: 'Causa 50% menos dano físico.' },
  sem_alcance: { name: 'Esmagado', color: '#7e57c2', icon: '⬇', debuff: true, help: 'Gravidade esmagadora: não consegue atacar à distância.' },
  inabalavel: { name: 'Inabalável', color: '#ef9a9a', icon: '♜', help: 'Imune a medo, lentidão e imobilização; +25% de dano.' },
};

export interface UnitLook {
  color: string;
  dark: string;
  hairColor: string;
  hairStyle: number;
  skin: string;
  size: number;
  beast: boolean;
  /** Pixel art própria (criaturas do bestiário). */
  sprite?: string[];
  palette?: Record<string, string>;
  /** Roupa da subclasse principal (`classe:subclasse`). */
  outfit?: string;
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
  /** Nível (1–5) das habilidades de árvore; ausente = 1. */
  skillRanks?: Record<string, number>;
  items: (string | null)[];
  statuses: Partial<Record<StatusId, number>>;
  hidden: boolean;
  overwatch: boolean;
  defending: boolean;
  alive: boolean;
  kills: number;
  /** XP acumulado por abates nesta batalha. */
  killXp: number;
  /** XP que esta unidade vale ao ser derrotada. */
  xpReward?: number;
  /** Turnos restantes de recarga por habilidade. */
  cooldowns: Record<string, number>;
  /** Escudo de vida (absorve dano antes do HP). */
  shield?: number;
  /** Quem agarrou/aprisionou esta unidade. */
  boundBy?: string;
  /** Quem invocou esta unidade. */
  summonedBy?: string;
  /** Família da criatura (bônus de bando). */
  family?: string;
  /** Estado das mecânicas de criaturas (reações por rodada, posturas, ciclos…). */
  fx?: Record<string, number | string>;
  /** Unidades ligadas pelos Fios do Destino. */
  links?: string[];
  /** Dano mágico extra (bônus de classe, fração). */
  magicDmg?: number;
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
  | { type: 'fx'; x: number; y: number; element: Element | 'hit' }
  /** Saiu do esconderijo por ter sido visto ("!" na cabeça, estilo Metal Gear). */
  | { type: 'spotted'; uid: string };

export interface TurnState {
  moved: boolean;
  acted: boolean;
  startX: number;
  startY: number;
  /** Custo de tempo da ação feita no turno (multiplica o intervalo até a próxima). */
  timeMult?: number;
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
  /** Efeitos agendados: bombas, canalizações e zonas que agem nas próximas rodadas. */
  pending?: PendingEffect[];
  /** Armadilhas armadas no mapa. */
  traps?: Trap[];
}

export interface PendingEffect {
  casterUid: string;
  skillId: string;
  x: number;
  y: number;
  /** Alvo que a habilidade persegue (ex.: Execução Sombria cai sobre ele onde estiver). */
  targetUid?: string;
  /** Rodadas até agir. */
  wait: number;
  /** Repetições que ainda faltam depois desta. */
  repeat: number;
}

export interface Trap {
  x: number;
  y: number;
  team: Team;
  ownerUid: string;
  name: string;
  status?: { id: string; turns: number };
  damage?: number;
  /** Raio da explosão ao disparar. */
  radius?: number;
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
