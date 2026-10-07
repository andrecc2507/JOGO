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
export type WeaponType = 'espada' | 'arco' | 'varinha' | 'bastao' | 'faca' | 'natural' | 'besta_mao';
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
  /** Id da forma fortificada (habilidades de teia no Nv 5). */
  fortified?: string;
  /** Bônus da forma fortificada (texto). */
  fortifiedBonus?: string;
  /** Na forma fortificada: id da habilidade normal (recarga e nível compartilhados). */
  fortifiedOf?: string;
  /** Evoluções desta habilidade (ids). */
  evolutions?: string[];
  /** Evolução: id da habilidade base (recarga e nível compartilhados), nível e requisito. */
  evolvedOf?: string;
  evolveRank?: number;
  evolveReq?: { skill: string; rank: number };
  evolveTag?: string;
  classId: ClassId;
  mp: number;
  /** Alcance em tiles; -1 = alcance da arma. */
  range: number;
  target: SkillTarget;
  shape: SkillShape;
  radius?: number;
  kind: SkillKind;
  power: number;
  /** Multiplicador de dano da teia (`TreeNode.powerMult`, balanceamento por simulação). */
  powerMult?: number;
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
  use?: { heal?: number; mp?: number; throwElement?: Element; radius?: number; smoke?: boolean; flash?: boolean; cure?: string[]; torch?: boolean; flare?: boolean; placeProp?: string };
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
  /** Regiões de transição ou distantes onde aparece (world/regions.ts). */
  regions?: string[];
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
  /** Facção da história (soldados reais, culto do Véu): não aparece em encontros aleatórios. */
  story?: boolean;
  fly?: boolean;
}

/** Condição de terreno/estado usada por passivas e requisitos. */
export type FxCondition = 'snow' | 'tree' | 'bush' | 'water' | 'sand' | 'grass' | 'still' | 'still_sand' | 'still_water' | 'low_hp' | 'not_hit' | 'hidden' | 'has_summon' | 'ground' | 'healthy';

/** Status aplicado por um efeito. */
export interface FxStatus {
  id: string;
  turns: number;
  /** Chance em % de aplicar (padrão 100). */
  chance?: number;
}

/** Reação automática (gatilho → resposta), limitada por rodada. */
export interface FxReaction {
  /** Tipo de golpe recebido que dispara a reação. */
  on: 'physical' | 'ranged' | 'melee' | 'magic' | 'any' | 'crit' | 'heavy' | 'summon';
  /** dodge: evita · negate: anula o dano · reflect: devolve ao atacante · counter: contra-ataca ·
   *  status: aplica `status` no atacante · retreat: evita e recua · swap: troca dois inimigos de lugar. */
  do: 'dodge' | 'negate' | 'reflect' | 'counter' | 'status' | 'retreat' | 'swap' | 'split' | 'mitigate' | 'riposte' | 'icewall';
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
  // ── táticas (docs/design/competidores.md) ──
  /** Fogo de supressão: o alvo fica Suprimido (−acerto; sair do lugar provoca tiro) até o próximo turno de quem lança. */
  suppress?: boolean;
  /** Constrói peças no mapa (muralha, rampa, pilar, barricada, trepadeira/escada) — ver battle/build.ts. */
  build?: { shape: 'wall' | 'ramp' | 'pillar' | 'barricade' | 'ladder'; terrain?: string; height?: number; length?: number; turns?: number };
  /** Efeito mantido por concentração: dano no conjurador pode desfazê-lo. */
  concentration?: boolean;
  /** Selo de Confinamento: 4 selos nos cantos de um retângulo, paredes de energia (battle/confine.ts). */
  confine?: { turns: number; sealHp: number };
  /** Passiva: escala paredes (sobe em colunas de prédio sem limite de salto). */
  climb?: boolean;
  /** Passiva: aliados ao lado podem ser arremessados por esta criatura (até telhados). */
  launcher?: boolean;
  /** Passiva: +% na chance de empurrar e resistir a empurrões. */
  shoveBonus?: number;
  /** Cura que salta para mais N aliados feridos próximos (talismã). */
  bounce?: number;
  /** Teleporta para o lado de um aliado (através de paredes). */
  allyStep?: boolean;
  /** Golpes com vantagem (rola duas vezes) — 'always' ou só de cima/escondido. */
  advantage?: 'always' | 'high' | 'hidden';
  /** Empurra o alvo N casas (usa a regra do empurrão, sem teste). */
  knock?: number;
  /** Multiplica o dano em paredes, lajes e objetos (demolição). Em passiva, vale para todos os golpes. */
  demolish?: number;
  /** Acende luz forte no alvo (raio) por 3 turnos (flecha sinalizadora). */
  flare?: number;
  /** Lançado em arco: alcança por cima de muros (granadas, frascos). */
  arc?: boolean;
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
  trap?: { status?: FxStatus; damage?: number; radius?: number; count?: number; /** Segundo efeito (ex.: preso + lento). */ extra?: FxStatus };
  /** Troca de lugar com o alvo. */
  swap?: boolean;
  /** Ganha um movimento e uma ação extra neste turno. */
  extraTurn?: boolean;
  /** Barra de ação do alvo: aliados vão para 100, inimigos para 0. */
  gaugeShift?: boolean;
  /** Devolve o alvo para onde ele começou o último turno. */
  rewind?: boolean;
  /** Encanta os ataques básicos por N turnos (`charges`: só os próximos N golpes, de ataque ou habilidade). */
  imbue?: { turns: number; charges?: number; status?: FxStatus; element?: Element; bonus?: number; magic?: boolean; mpGain?: number; push?: number; surface?: Element; splash?: number };
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
  /** Elemento aplicado ao chão da área ('geada' congela o chão em volta, com ou sem água). */
  surface?: Element | 'oleo' | 'fumaca' | 'geada';
  /**
   * Nuvem criada na área (fumaça de habilidade com efeito): anda 1 casa por turno de quem lançou,
   * na direção escolhida, até sair do mapa. Com `cloudFollow`, vira aura que acompanha quem lançou por N turnos.
   */
  cloud?: 'fumaca' | 'gas_fetido' | 'esporos' | 'nevasca' | 'vapor_fervente' | 'nevoa_lunar' | 'chama_fria' | 'tinta' | 'nevoa_de_sangue';
  cloudFollow?: number;
  /** Ação sem custo: não gasta a ação do turno (pode vir antes ou depois dela). */
  free?: boolean;
  /** Ganha mais um deslocamento completo neste turno. */
  extraMove?: boolean;
  /** Só atinge quem está olhando para quem usou (olhar hipnótico, sopro frontal). */
  facingOnly?: boolean;
  /** A área não atinge aliados. */
  spareAllies?: boolean;
  /** Salta em linha até o tile escolhido, golpeando cada inimigo no caminho. */
  dashThrough?: boolean;
  /** Multiplicador de dano se quem salta estava mais alto que o alvo. */
  fromAbove?: number;
  /** Destrói escudos de vida e a proteção do alvo. */
  breakShield?: boolean;
  /** Corta a mana máxima do alvo pelo resto da batalha (fração). */
  maxMpCut?: number;
  /** Alvo abaixo de `below` da vida: devolve `pct` da barra de ação de quem atacou. */
  gaugeRefund?: { below: number; pct: number };
  /** Ponte de gelo em escada (2 casas: +1 e +2 de altura) por 3 turnos; quem estiver em cima quando ela some cai. */
  iceBridge?: boolean;
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
  /**
   * Passiva (Gênio do Campo de Batalha): na formação inicial, distribui 1–5 armadilhas (o nível da
   * habilidade) dos tipos que já aprendeu; elas só armam depois que todos agirem uma vez.
   */
  fieldTraps?: boolean;
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
  /** Passiva: pula alturas de até N níveis. */
  jumpTo?: number;
  /** Passiva: anda sem provocar ataques de oportunidade nem perseguição. */
  noOpportunity?: boolean;
  /** Passiva: some de vista ao encostar no terreno dado. */
  autoHide?: 'bush';
  /** Passiva: +dano contra o inimigo com menos vida (se houver mais de um). */
  vsWeakest?: number;
  /** Passiva: não é pego de surpresa (sem bônus de costas/escondido contra ele; o esquadrão não sofre emboscada). */
  noSurprise?: boolean;
  /** Passiva: reduz dano à distância vindo da frente (fração). */
  frontGuard?: number;
  /** Passiva: reduz dano de flechas, adagas e golpes perfurantes (fração). */
  pierceGuard?: number;
  /** Passiva: a barra de ação enche mais rápido conforme perde vida (até +N com a vida no fim). */
  furyHaste?: number;
  /** Passiva: ganha 1 m de movimento a cada 2 m que um inimigo ao lado tenta fugir. */
  chase?: boolean;
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
/**
 * Evolução de habilidade (Nv 3 ou 5): uma versão nova que aparece ao lado da original quando a
 * habilidade (ou outra perícia, em `req`) chega ao nível. Campos ausentes vêm da habilidade base;
 * `fx` é somado ao da base. Ex.: Perícia em Fogo Nv 3 → Raio de Fogo ganha a versão de supressão.
 */
export interface TreeEvolution extends Partial<Omit<TreeSkill, 'evolve' | 'id' | 'name' | 'description'>> {
  id: string;
  name: string;
  description: string;
  /** Nível da habilidade base que libera (3 ou 5). */
  rank: number;
  /** Outra habilidade que libera, no nível dado (em vez da própria). */
  req?: { skill: string; rank: number };
  /** Rótulo curto da mecânica nova (supressão, construção, concentração…). */
  tag?: string;
}

export interface TreeSkill extends CreatureSkill {
  mp: number;
  /** Evoluções liberadas no Nv 3/5 (aparecem ao lado da versão normal). */
  evolve?: TreeEvolution[];
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
  /** Nome curto para a ficha (ex.: "E. Arcano"); sem ele, abrevia o nome. */
  short?: string;
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
  /**
   * Ajuste fino de poder das habilidades desta teia (balanceamento por simulação, `npm run sim`;
   * ver docs/design/simulacao.md). 1 = sem ajuste.
   */
  powerMult?: number;
  /** Bônus percentuais de classe (0,1 = +10%): na classe base valem sempre; nas outras, ao aprender a 1ª habilidade. */
  bonus?: NodeBonus;
  /**
   * Escala das habilidades desta teia por tipo (peso × poder do atributo): físico/à distância,
   * magia e cura. Ex.: Berserker físico FOR 1,1; Espadachim Arcano FOR 0,65 + INT 0,65.
   * A habilidade pode ter o próprio `scaling`, que vale por cima deste.
   */
  scaling?: { physical?: Partial<Record<Attr, number>>; magic?: Partial<Record<Attr, number>>; heal?: Partial<Record<Attr, number>> };
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
  /** Criatura de transição ou bioma distante (data/bestiary/distant.json): regiões onde aparece. */
  regions?: string[];
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
  /** Facção da história (soldados reais, culto do Véu): não aparece em encontros aleatórios. */
  story?: boolean;
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
