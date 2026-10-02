/** Tipos dos domínios de dados (conteúdo em JSON). */

/** Cinco atributos (sem Sorte): Força, Destreza, Velocidade, Inteligência e Vitalidade. */
export const ATTRS = ['str', 'dex', 'spd', 'int', 'vit'] as const;
export type Attr = (typeof ATTRS)[number];
export type Attributes = Record<Attr, number>;

export const ATTR_LABEL: Record<Attr, string> = {
  str: 'Força',
  dex: 'Destreza',
  spd: 'Velocidade',
  int: 'Inteligência',
  vit: 'Vitalidade',
};
export const ATTR_SHORT: Record<Attr, string> = { str: 'FOR', dex: 'DES', spd: 'VEL', int: 'INT', vit: 'VIT' };

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
  /** Multiplicador da vida (regra dos 5 golpes): Guerreiro 1,3 · Clérigo 1,15 · Arqueiro/Ladino 1 · Mago 0,85. */
  hpFactor: number;
  mpBase: number;
  /** MP ganho por nível (antes do multiplicador de INT). */
  mpPerLevel: number;
  weapons: WeaponType[];
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
  /** Efeitos genéricos (ver `SkillFx`); habilidades de criaturas e das árvores usam. */
  fx?: SkillFx;
  /** Nó da árvore de classe de onde a habilidade vem. */
  tree?: string;
  /** Habilidade suprema do nó. */
  ultimate?: boolean;
  anim?: AnimStyle;
  /** Peso de cada atributo no poder da habilidade (ausente = o atributo de ataque da arma, ou INT nas magias). */
  scaling?: Partial<Record<Attr, number>>;
  /** Custo de tempo: multiplica o intervalo até a próxima ação (1,5 = demora 50% mais; 0,7 = ação rápida). */
  timeMult?: number;
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
  use?: { heal?: number; mp?: number; throwElement?: Element; radius?: number; smoke?: boolean; cure?: string[] };
  /** Usos por batalha (utilitários não somem: recarregam depois). Padrão 1. */
  uses?: number;
  /** Só de levar: +% de chance de render inimigos (corda, rede). Não é usado como ação. */
  captureBonus?: number;
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
export type FxCondition = 'snow' | 'tree' | 'bush' | 'water' | 'sand' | 'grass' | 'still' | 'still_sand' | 'still_water' | 'low_hp' | 'not_hit' | 'hidden' | 'has_summon' | 'ground' | 'healthy';

/** Status aplicado por um efeito. */
export interface FxStatus {
  id: string;
  turns: number;
}

/** Reação automática (gatilho → resposta), limitada por rodada. */
export interface FxReaction {
  /** Tipo de golpe recebido que dispara a reação. */
  on: 'physical' | 'ranged' | 'melee' | 'magic' | 'any' | 'crit' | 'heavy' | 'summon';
  /** dodge: evita · negate: anula o dano · reflect: devolve ao atacante · counter: contra-ataca ·
   *  status: aplica `status` no atacante · retreat: evita e recua · swap: troca dois inimigos de lugar. */
  do: 'dodge' | 'negate' | 'reflect' | 'counter' | 'status' | 'retreat' | 'swap' | 'split' | 'mitigate' | 'riposte';
  /** Chance em % (padrão 100). */
  chance?: number;
  /** Vezes por rodada (padrão 1). */
  perRound?: number;
  status?: FxStatus;
  /** Dano fixo extra devolvido ao atacante (espinhos, queimadura). */
  damage?: number;
  /** Elemento do dano devolvido. */
  element?: Element;
  /** 'mitigate': fração do dano evitada. */
  reduce?: number;
  /** Recuo em metros ('retreat' / 'mitigate'). */
  distance?: number;
  /** Empurra o atacante N metros. */
  push?: number;
  /** Cura (fração do dano recebido). */
  healPct?: number;
  /** Só uma vez por batalha. */
  once?: boolean;
  /** MP recuperado (fração do dano evitado). */
  mpGain?: number;
  /** Status aplicados em quem reagiu. */
  self?: FxStatus[];
  /** Fica invisível ao reagir. */
  hide?: boolean;
  /** Próximo golpe: crítico garantido e silencia o alvo. */
  prime?: boolean;
  /** Guarda esta fração do dano evitado para somar ao próximo golpe. */
  store?: number;
  /** Golpes do contra-ataque. */
  hits?: number;
  /** Contra-ataque crítico garantido. */
  crit?: boolean;
  /** Efeito em área ao redor do ponto onde a reação aconteceu. */
  area?: { radius: number; push?: number; status?: FxStatus; damage?: number; surface?: Element | 'fumaca' | 'oleo' };
  /** Deixa um clone no lugar. */
  clone?: boolean;
  /** Toma o controle da invocação que atacou. */
  convert?: boolean;
  /** Multiplicador do dano refletido. */
  reflectMult?: number;
  /** Estados extras aplicados ao atacante. */
  foe?: FxStatus[];
  /** MP recuperado (fração do máximo). */
  selfMp?: number;
  /** Zera a recarga desta habilidade. */
  resetSkill?: string;
  /** Escudo (fração da vida máxima) em todo o grupo. */
  teamShield?: number;
  /** Revela todos os inimigos escondidos. */
  reveal?: boolean;
  /** Suas invocações agem já. */
  command?: boolean;
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
  /** Dano extra por metro de distância até o alvo (fração; também como passiva). */
  perTile?: number;
  /** Linha que atravessa inimigos (cada alvo seguinte perde `throughFalloff`). */
  through?: boolean;
  throughFalloff?: number;
  /** Puxa os alvos N metros para o centro da área. */
  vortex?: number;
  /** Ignora linha de visão e cobertura ao mirar. */
  homing?: boolean;
  /** Dano extra = fração da vida atual do alvo. */
  currentHpPct?: number;
  /** Detona todas as suas armadilhas no campo. */
  triggerTraps?: boolean;
  /** Desarma as armadilhas inimigas da área. */
  clearTraps?: boolean;
  /** Escudo (fração da vida máxima) no aliado mais próximo ao atacar. */
  allyShield?: number;
  /** Explosão ao redor de quem foi curado (`target`) ou de quem usou (`self`). */
  burstAround?: { radius: number; power: number; push?: number; around: 'target' | 'self' };
  /** Multiplicador se atacar pelas costas do alvo ou escondido. */
  backstab?: number;
  /** Ricocheteia em até N inimigos a até 3 m do alvo (dano × `chainMult`). */
  chain?: number;
  chainMult?: number;
  /** Se o alvo tem `status`, remove-o e aplica `apply`. */
  consume?: { status: string; apply: FxStatus };
  /** Causa de uma vez todo o dano restante destes status de dano contínuo. */
  detonate?: string[];
  /** Mata alvos abaixo desta fração de vida (épicos e lendários levam crítico). */
  execute?: number;
  /** Crítico garantido se o alvo tiver ao menos N status negativos. */
  critIfDebuffs?: number;
  /** Troca reforços do alvo por penalidades equivalentes. */
  invertBuffs?: boolean;
  /** Prolonga status: positivos em aliados e negativos em inimigos da área. */
  extend?: number;
  /** Mira um corpo caído (explode a área ao redor dele). */
  corpse?: boolean;
  /** O efeito acontece depois: `delay` rodadas e repete `repeat` vezes (bombas, canalizações, zonas). */
  pending?: { delay: number; repeat?: number };
  /** Ergue obstáculos (rocha/gelo) nos tiles livres da área. */
  wall?: 'rocha' | 'gelo';
  /** Destrói obstáculos da área. */
  destroyProps?: boolean;
  /** Arma uma armadilha nos tiles da área: quem pisar sofre. */
  trap?: { status?: FxStatus; damage?: number; radius?: number; count?: number };
  /** Troca de lugar com o alvo. */
  swap?: boolean;
  /** Ganha um movimento e uma ação extra neste turno. */
  extraTurn?: boolean;
  /** Barra de ação do alvo: aliados vão para 100, inimigos para 0. */
  gaugeShift?: boolean;
  /** Devolve o alvo para onde ele começou o último turno. */
  rewind?: boolean;
  /** Encanta os ataques básicos por N turnos. */
  imbue?: { turns: number; status?: FxStatus; element?: Element; bonus?: number; magic?: boolean; mpGain?: number; push?: number; surface?: Element; splash?: number };
  /** Gasta todo o MP próprio. */
  spendAllMp?: boolean;
  /** Reduz as recargas das outras habilidades. */
  reduceCooldowns?: number;
  /** Suas invocações agem já (barra cheia) e ganham reforço. */
  commandSummons?: boolean;
  /** Detona a própria invocação mais próxima (explosão em área). */
  sacrifice?: boolean;
  /** Cancela magias que o alvo está preparando (canalizações e bombas). */
  interrupt?: boolean;
  /** Escudo = fração da vida já perdida. */
  shieldFromLost?: number;
  /** Soma a defesa de quem ataca ao poder (× fator). */
  defScaling?: number;
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
  /** Fica veloz quando algum inimigo tem este status. */
  senseStatus?: string;
  /** Passiva: deslocamento extra (metros). */
  moveBonus?: number;
  /** Passiva: curas feitas são mais fortes (com `when`). */
  healBoost?: number;
  /** Passiva: assume parte do dano de aliados a até `radius` m (mitigando uma fração). */
  intercept?: { radius: number; pct: number; mitigate?: number; physicalOnly?: boolean; once?: boolean };
  /** Passiva: dano físico extra (fração). */
  physBoost?: number;
  /** Passiva: dano mágico extra (fração). */
  magicBoost?: number;
  /** Massa Crítica: +dano das habilidades gravitacionais por inimigo extra capturado na zona. */
  massBoost?: number;
  /** Esconder-se não gasta a ação (vezes por batalha). */
  freeHide?: number;
  /** Acerto extra quando não se moveu no turno. */
  steadyAim?: number;
  /** Passiva: barra de ação enche mais rápido (fração). */
  haste?: number;
  /** Passiva: a cada N golpes físicos, o próximo explode em área. */
  chargeEvery?: { n: number; power: number; radius: number; element?: Element };
  /** Passiva: uma vez por batalha sobrevive a golpe fatal com 1 de HP (sem custo). */
  lastStand?: boolean;
  /** Passiva: alcance do ataque básico +N. */
  reachBonus?: number;
  /** Passiva: golpe de graça em quem entra corpo a corpo. */
  guardZone?: boolean;
  /** Passiva: rouba vida com dano deste elemento. */
  elementLifesteal?: { element: Element; pct: number };
  /** Passiva: recupera MP quando uma armadilha sua dispara. */
  trapRefund?: number;
  /** Passiva: dano extra de crítico (+0,5 = ×2 em vez de ×1,5). */
  critDamage?: number;
  /** Passiva: crítico zera a recarga desta habilidade. */
  onCritReset?: string;
  /** Passiva: ao crítico ganha status. */
  onCritSelf?: FxStatus;
  /** Passiva: ao derrubar um inimigo. */
  onKill?: { healPct?: number; mpPct?: number; status?: FxStatus; hide?: boolean; resetCooldowns?: boolean };
  /** Passiva: quando qualquer inimigo cai. */
  onAnyDeath?: { healPct?: number; mpPct?: number };
  /** Passiva: ao sofrer dano físico, reduz recargas. */
  onHitCooldown?: number;
  /** Passiva: ao usar habilidade desta árvore (nó), ganha status. */
  onCastSelf?: { node?: string; status: FxStatus };
  /** Passiva: multiplica o dano de um elemento (sem elemento = qualquer dano elemental; respeita `when`). */
  elementBoost?: { element?: Element; mult: number };
  /** Passiva: reduz o custo de MP (nó opcional). */
  mpDiscount?: { pct: number; node?: string };
  /** Passiva: recupera MP por turno (fração do máximo). */
  mpRegen?: number;
  /** Passiva: parte do dano recebido vai para a invocação mais próxima. */
  shareWithSummons?: number;
  /** Passiva: uma vez por batalha sobrevive a golpe fatal com 1 de HP gastando metade do MP. */
  cheatDeath?: boolean;
  /** Passiva: invocações causam mais dano. */
  summonPower?: number;
  /** Passiva: cura-se com parte do dano das invocações. */
  summonLifelink?: number;
  /** Passiva: ataques básicos pelas costas não revelam (exceto crítico). */
  silentStrike?: boolean;
  /** Voa: ignora altura e terreno difícil. */
  fly?: boolean;
  /** Aura: a cada rodada aplica status nos inimigos a até `radius` m (99 = arena toda). */
  aura?: { radius: number; status?: FxStatus; damagePct?: number; allies?: boolean };
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
  special?: 'karma' | 'momentum' | 'hourglass' | 'thermal_shock' | 'tide_growth' | 'hydra' | 'storm_eye' | 'pain_echo' | 'frozen_blood' | 'straw_cloak' | 'spread_poison';
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
  /** Animação (padrão: escolhida pelo tipo, formato e elemento). */
  anim?: AnimStyle;
  /** Peso de cada atributo no poder da habilidade (ausente = o atributo de ataque da arma, ou INT nas magias). */
  scaling?: Partial<Record<Attr, number>>;
  /** Custo de tempo: multiplica o intervalo até a próxima ação (1,5 = demora 50% mais; 0,7 = ação rápida). */
  timeMult?: number;
}

/** Estilos de animação de ação na batalha. */
export type AnimStyle = 'slash' | 'claw' | 'thrust' | 'spin' | 'dash' | 'leap' | 'arrow' | 'volley' | 'bolt' | 'orb' | 'beam' | 'cone' | 'nova' | 'meteor' | 'heal' | 'buff' | 'smoke' | 'blink' | 'summon' | 'trap' | 'charge' | 'shout';
export const ANIM_STYLES: AnimStyle[] = ['slash', 'claw', 'thrust', 'spin', 'dash', 'leap', 'arrow', 'volley', 'bolt', 'orb', 'beam', 'cone', 'nova', 'meteor', 'heal', 'buff', 'smoke', 'blink', 'summon', 'trap', 'charge', 'shout'];

/** Habilidade de árvore de classe: mesma ficha das criaturas + custo de MP e nível. */
export interface TreeSkill extends CreatureSkill {
  mp: number;
  levelReq?: number;
  ultimate?: boolean;
  /** Pré-requisitos (ids na mesma árvore). Ausente = a habilidade anterior na teia; [] = nenhum. */
  requires?: string[];
  /** Vem junto com outra habilidade (ex.: os raios do Iniciado): não ocupa lugar na teia nem custa ponto. */
  grantedBy?: string;
}

export interface NodeBonus {
  hp?: number;
  mp?: number;
  accuracy?: number;
  speed?: number;
  magic?: number;
  /** Força, Destreza e Inteligência (passivas das classes base). */
  str?: number;
  dex?: number;
  int?: number;
}

export type TreeNodeType = 'base' | 'evolucao' | 'hibrida' | 'ramo';

/** Nó da rosa das classes (classe base, evolução, híbrida ou ramo de uma evolução). */
export interface TreeNode {
  id: string;
  name: string;
  type: TreeNodeType;
  /** Teias de origem: híbridas e ramos só abrem com a habilidade `unlockAt` de cada uma. */
  parents: string[];
  /** Posição, na teia de cada pai, da habilidade que abre esta teia (padrão 3). */
  unlockAt?: number;
  /** Posição no diagrama (coordenadas do canvas de design). */
  x: number;
  y: number;
  description: string;
  /** MP máximo extra ao aprender a 1ª habilidade do nó. */
  mpBonus?: number;
  /** Bônus percentuais de classe (0,1 = +10%): na classe base valem sempre; nas outras, ao aprender a 1ª habilidade. */
  bonus?: NodeBonus;
  skills: TreeSkill[];
}

export interface SkillTree {
  id: string;
  classId: ClassId;
  name: string;
  nodes: TreeNode[];
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
  /** O que deixa ao ser derrotada (sem isso, nada — ex.: invocações). Ver docs/design/base_pesquisa_craft.md. */
  drops?: CreatureDrops;
  /** Pixel art de combate: linhas de letras mapeadas na paleta ('.' = transparente). */
  sprite: string[];
  palette: Record<string, string>;
}

/** Tipo de material: comum e raro vêm da família da fera; elemental, do elemento dela. */
export type MaterialKind = 'comum' | 'raro' | 'elemental';

export interface MaterialDef {
  id: string;
  name: string;
  description: string;
  kind: MaterialKind;
  /** Família de material de onde vem (comum/raro). */
  family?: string;
  /** Elemento de origem (elemental). */
  element?: Element;
  /** Preço de venda por unidade (ouro). */
  price: number;
}

/** Família de material: grupo de feras que deixam os mesmos materiais (ex.: serpentes). */
export interface MaterialFamily {
  id: string;
  name: string;
  common: string;
  rare: string;
}

export interface DropEntry {
  material: string;
  /** Chance de 0 a 1. */
  chance: number;
  min: number;
  max: number;
}

/** Joia da alma: o tipo é escolhido à mão por espécie (habilidade = espaço próprio; forja = itens mágicos). */
export type JewelType = 'indefinida' | 'habilidade' | 'forja';

export interface CreatureDrops {
  /** Família de material (define o material comum e o raro padrão). */
  family: string;
  table: DropEntry[];
  /** Troféu da espécie (épicas e lendárias). */
  trophy: boolean;
  jewel: {
    chance: number;
    type: JewelType;
    /** Habilidade da besta que a joia dá (tipo habilidade). */
    skill?: string;
    /** Bônus dos itens mágicos feitos com ela (tipo forja), em texto até existir a Forja. */
    bonus?: string;
  };
}

export interface CountryDef {
  id: string;
  /** Nome fantasia do país (sem a classe). */
  name: string;
  /** Epíteto mostrado junto do nome: "Lar dos Arqueiros". */
  epithet: string;
  classId: ClassId;
  biome: Biome;
  color: string;
  capital: string;
  /** Senhor(a) da capital (personagem da história; nome provisório). */
  lord: string;
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
    trees: SkillTree;
    materials: MaterialDef;
  }
}
