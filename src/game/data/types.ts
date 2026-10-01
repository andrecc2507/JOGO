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
export type SkillShape = 'single' | 'radius' | 'line' | 'cone';

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
  /** Efeitos genéricos de criaturas (ver `SkillFx`). */
  fx?: SkillFx;
  /** Valor auxiliar (ex.: turnos escondido). */
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
  family?: string;
  summonOnly?: boolean;
  fly?: boolean;
}

/** Condição de terreno/estado usada por passivas e requisitos. */
export type FxCondition = 'snow' | 'tree' | 'bush' | 'water' | 'sand' | 'grass' | 'still' | 'still_sand' | 'still_water' | 'low_hp' | 'not_hit' | 'hidden';

/** Status aplicado por um efeito. */
export interface FxStatus {
  id: string;
  turns: number;
}

/** Reação automática (gatilho → resposta), limitada por rodada. */
export interface FxReaction {
  /** Tipo de golpe recebido que dispara a reação. */
  on: 'physical' | 'ranged' | 'melee' | 'magic' | 'any' | 'crit' | 'heavy';
  /** dodge: evita · negate: anula o dano · reflect: devolve ao atacante · counter: contra-ataca ·
   *  status: aplica `status` no atacante · retreat: evita e recua · swap: troca dois inimigos de lugar. */
  do: 'dodge' | 'negate' | 'reflect' | 'counter' | 'status' | 'retreat' | 'swap' | 'split';
  /** Chance em % (padrão 100). */
  chance?: number;
  /** Vezes por rodada (padrão 1). */
  perRound?: number;
  status?: FxStatus;
  /** Dano fixo extra devolvido ao atacante (espinhos, queimadura). */
  damage?: number;
  /** Elemento do dano devolvido. */
  element?: Element;
}

/** Postura de um ciclo (Quimera, Estações do Ano, Maré…). */
export interface FxStance {
  name: string;
  dmg?: number;
  evasion?: number;
  lifesteal?: number;
  regen?: number;
  magicImmune?: boolean;
  reflect?: number;
  element?: Element;
  /** Status aplicado aos inimigos a até 3 m quando a postura começa. */
  enemyStatus?: FxStatus;
  /** Status aplicado em si quando a postura começa. */
  selfStatus?: FxStatus;
  /** Fração do dano corpo a corpo devolvida ao atacante. */
  thorns?: number;
}

/**
 * Efeitos genéricos das criaturas. Toda habilidade do bestiário é uma combinação destes
 * blocos — o motor resolve cada campo, sem código específico por criatura.
 */
export interface SkillFx {
  // ── ataque ──
  /** Só aplica status (sem rolagem de dano). */
  noDamage?: boolean;
  /** Golpes por uso (dano de cada golpe = poder do golpe). */
  hits?: number;
  /** Depois de atacar, recua N metros. */
  retreat?: number;
  /** Multiplicador se a criatura estava escondida ao atacar. */
  fromHiding?: number;
  /** Destrói/rouba um utilitário do alvo. */
  breakItem?: boolean;
  /** Só afeta alvos nesta situação (mesma sintaxe de `vs.status`). */
  only?: string;
  /** Revela todos os inimigos escondidos. */
  reveal?: boolean;
  /** Empurra / puxa o alvo N metros. */
  push?: number;
  pull?: number;
  /** Fração da defesa ignorada (1 = ignora toda a armadura). */
  pierce?: number;
  /** Fração do dano convertida em vida. */
  lifesteal?: number;
  /** MP drenado do alvo. */
  mpBurn?: number;
  /** Multiplicador contra alvos com status (ou 'ferido' / 'fraco' / 'escondido'). */
  vs?: { status: string; mult: number };
  /** Salta para perto do alvo antes de golpear. */
  leap?: boolean;
  /** Reaparece atrás do alvo antes de golpear. */
  behind?: boolean;
  /** Elemento aplicado ao chão da área. */
  surface?: Element | 'oleo' | 'fumaca';
  /** Status extras aplicados no alvo atingido. */
  also?: FxStatus[];
  /** Crítico extra (%) deste golpe. */
  crit?: number;
  /** Remove buffs do alvo. */
  dispel?: boolean;
  /** Atinge N inimigos aleatórios visíveis em qualquer lugar (99 = todos). */
  randomTargets?: number;
  /** Com `randomTargets`: poupa um inimigo aleatório. */
  spareOne?: boolean;
  /** O alvo fica preso a quem o agarrou (status 'preso' ou 'aprisionado'). */
  grab?: boolean;
  /** Liga a vida de N inimigos à criatura: o dano recebido é dividido com eles. */
  link?: number;
  /** Dano total da área vira escudo de vida para a criatura. */
  drainToShield?: boolean;
  // ── si mesmo / aliados ──
  /** Cura (fração da vida máxima) em si ou nos aliados atingidos. */
  healPct?: number;
  /** Remove status negativos. */
  cleanse?: boolean;
  /** Esconde-se (exige o terreno, se dado). Duração = `value`. */
  hide?: 'any' | 'snow' | 'bush' | 'tree' | 'sand' | 'water';
  /** Teleporta para um tile livre dentro do alcance. */
  teleport?: boolean;
  /** Escudo de vida (fração da vida máxima). */
  shield?: number;
  /** Status aplicado em si ao usar. */
  self?: FxStatus;
  /** Invoca criaturas ao lado. */
  summon?: { id: string; count: number }[];
  /** Requisito para usar. */
  requires?: FxCondition;
  // ── passivas ──
  evasion?: number;
  /** Condição das passivas de esquiva/regeneração. */
  when?: FxCondition;
  /** Redução de dano recebido por tipo (fração). */
  reduce?: { physical?: number; ranged?: number; melee?: number; magic?: number };
  /** Status aos quais é imune. */
  immune?: string[];
  /** Status ignorado uma única vez por batalha. */
  ignoreOnce?: string;
  /** Multiplicador de dano com menos de 50% de vida. */
  fury?: number;
  /** Regeneração por turno (fração da vida máxima). */
  regen?: number;
  /** Bônus de dano por aliado da mesma família vivo. */
  pack?: { family: string; mult: number };
  /** Bônus de dano se outro aliado estiver ao lado do alvo. */
  flank?: number;
  /** Crítico passivo. */
  critBonus?: number;
  /** Enxerga inimigos escondidos. */
  seeHidden?: boolean;
  /** IA prioriza o alvo mais fraco. */
  focusWeak?: boolean;
  /** Ataca de graça quem se afasta dela corpo a corpo. */
  pursuit?: boolean;
  /** Dano destes elementos cura em vez de ferir. */
  absorb?: Element[];
  /** Quem ela agarrou se solta ao receber dano destes elementos. */
  releaseOn?: Element[];
  /** Fica veloz quando algum inimigo sangra. */
  bloodSense?: boolean;
  /** Voa: ignora altura e terreno difícil. */
  fly?: boolean;
  /** Aura: a cada rodada aplica status nos inimigos a até `radius` m (99 = arena toda). */
  aura?: { radius: number; status?: FxStatus; damagePct?: number };
  /** Ao cair, vira semente/ovo e revive após N rodadas com `pct` da vida, se não for destruída. */
  revive?: { rounds: number; pct: number; unless?: Element };
  /** Explode ao morrer. */
  deathBurst?: { radius: number; power: number; element?: Element };
  /** Imune a dano enquanto suas invocações estiverem vivas. */
  minionShield?: boolean;
  /** Invocações no início da batalha, a cada N rodadas, ou ao cruzar frações de vida. */
  summonStart?: { id: string; count: number }[];
  summonEvery?: { rounds: number; list: { id: string; count: number }[] };
  summonAt?: { thresholds: number[]; list: { id: string; count: number }[] };
  /** Ciclo de posturas, trocando a cada `every` rodadas. */
  stances?: { every: number; list: FxStance[] };
  /** Mecânicas únicas resolvidas pelo motor. */
  /** Reação automática (habilidades do tipo 'reaction'). */
  react?: FxReaction;
  special?: 'karma' | 'momentum' | 'hourglass' | 'thermal_shock' | 'tide_growth' | 'hydra' | 'storm_eye' | 'pain_echo' | 'frozen_blood' | 'straw_cloak';
}

export type CreatureSkillKind = 'physical' | 'ranged' | 'magic' | 'buff' | 'heal' | 'utility' | 'summon' | 'passive' | 'reaction';
export const CREATURE_SKILL_KINDS: CreatureSkillKind[] = ['physical', 'ranged', 'magic', 'buff', 'heal', 'utility', 'summon', 'passive', 'reaction'];

/** Habilidade de criatura (definida dentro da ficha do bestiário). */
export interface CreatureSkill {
  id: string;
  name: string;
  description: string;
  kind: CreatureSkillKind;
  range: number;
  power: number;
  cooldown: number;
  shape?: SkillShape;
  radius?: number;
  /** Quem pode ser alvo (padrão conforme o tipo). */
  target?: SkillTarget;
  element?: Element;
  accuracy?: number;
  status?: FxStatus;
  /** Reação automática (tipo 'reaction'). */
  react?: FxReaction;
  /** Duração/valor auxiliar (ex.: turnos escondido). */
  value?: number;
  fx?: SkillFx;
  /** Mecânica diferenciada de épicos e lendários (exibida em destaque). */
  signature?: boolean;
}

/** Ficha do bestiário — fonte única das criaturas do jogo. */
export interface CreatureDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  levelMin: number;
  levelMax: number;
  /** HP no nível mínimo (cresce proporcionalmente a 10 + nível). */
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
  /** Família (bônus de bando, buffs de alcateia…): 'lobo', 'cao', 'felino'… */
  family?: string;
  /** Só aparece invocada por outra criatura (fora dos encontros). */
  summonOnly?: boolean;
  /** Voa ou flutua: ignora altura e lama. */
  fly?: boolean;
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
