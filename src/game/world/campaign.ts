import type { RivalState } from './rival';
import RENAMED from '../data/skills/renamed.json';
import { Rng } from '@core';
import { DB, item, type ClassId, type ItemDef } from '../data';
import { canFight, derive, fullHeal, type Character } from '../rules/character';
import { lootPrice } from '../rules/drops';
import { advanceBase, extraContracts, lootSellMult, registerCustomItems, woundHealPerDay, type BaseState, type Prisoner } from './base';
import { ensureLoyalty, loyaltyDay, restoreMorale } from './loyalty';
import CAPITALS from '../data/world/capitals.json';
import { VEIL, veilDay, type DelayKind, type VeilState } from './veil';
import { CHAPTER_TITLE, ensureStory, migrateStory, veilRush, type StoryState } from './story';
import { ensureWorld, reveal, type WorldState } from './territory';
import { forcesAt, moveForces } from './forces';
import { commanderDay, commanderMonth, forceArrived } from './commander';
import { fatigueDay, supplyDay } from './logistics';
import { RES as POLITICS_RES, addIntel, monthOps, opActive, priceMult, recruitMod } from './politics';
import { politicsDay } from './commander';
import EXP from '../data/world/expedition.json';
import { festivalMult, seasonDay, seasonMonth, seasonRations, seasonSpeed, stormAtSea } from './season';
import { arriveExpedition } from './expedition';
import { outpostAt, outpostsDay, outpostsMonth } from './outposts';
import { captainRations, captainSpeed, captainWoundRate } from './captains';
import { boardsMonth, checkTasks } from './boards';
import { supplyCap } from './logistics';
import { actsBlocked, actsCamp, actsDay, actsMonth, actsNoFood } from './acts';
import { addClue, wantedPrice, wantedRecruitClosed } from './act_fugitive';
import type { PlayStats } from './telemetry';
import type { DifficultyId } from './difficulty';
import type { ChronicleEntry } from './chronicle';
import { ensureTrait } from './traits';
import { generateApprenticePool, generateRecruitPool, makeCharacter, newId, randomPath, spendSkillPoints, type Candidate } from '../rules/recruit';
import { mainSubclass } from '../rules/skill_tree';
import type { Victory } from '../battle/types';
import { CITADEL_ID, capitals, countryOf, edgeLength, edgeSpeed, hasNode, node, nodeOpen, places, shortestPath, worldGraph } from './layout';

export const SQUAD_MAX = 6;
/** Horas de jogo por segundo real em cada velocidade (pausa, 1×, 2×, 4×). */
export const SPEEDS = [0, 1, 2, 4] as const;
export const SPEED_LABEL = ['⏸', '▶', '▶▶', '▶▶▶'];
/** Unidades do mapa-mundo por hora de viagem. */
/** Unidades do mundo por hora numa estrada boa (Citadela → capital ≈ 4 dias; terras distantes ≈ 10). */
export const TRAVEL_SPEED = 5;
export const INN_COST_PER_MEMBER = 6;
export const DAYS_PER_MONTH = 30;
export const CONTRACTS_PER_CAPITAL = 3;
export const SQUAD_COLORS = ['#4fc3f7', '#ffb74d', '#ba68c8', '#81c784', '#f06292', '#fff176', '#e57373', '#90a4ae', '#ffffff', '#5c6bc0'];
/** Emblemas possíveis no estandarte do esquadrão. */
export const SQUAD_ICONS = ['', '⚔', '🛡', '🏹', '🗡', '🔥', '❄', '⚡', '☀', '🌙', '★', '👑', '🐺', '🦅', '🐉', '💀', '🌿', '⚓'];
/** Banco de escolta: feridos e aprendizes viajam junto, sem lutar nem ganhar XP. */
export const ESCORT_MAX = 6;

export interface Squad {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
  /** Nó atual (ou de partida, se viajando). */
  at: string;
  /** Próximo nó, se viajando. */
  to: string | null;
  route: string[];
  progress: number;
  carried: Record<string, number>;
  /** Espólio carregado (materiais, troféus, joias); entra no estoque quando volta à base. */
  loot: Record<string, number>;
  resting: boolean;
  /** Escoltados (banco de reserva): viajam com o esquadrão, não lutam e não ganham XP. */
  escort?: string[];
  /** Emblema no estandarte (vazio = só a cor). */
  icon?: string;
  /** Viaja fora da estrada: mais lento, menos patrulhas, mais feras (C3). */
  offroad?: boolean;
  /** Rações (uma por pessoa por dia) e dias seguidos sem comida (C9). */
  supplies?: number;
  hungry?: number;
  /** Carroça: carrega mais rações. */
  cart?: boolean;
  /** Capitão (C19): membro que lidera o esquadrão (world/captains.ts). */
  captainId?: string;
}

/** Itens de um esquadrão dizimado, à espera de outro esquadrão no local (D57). */
export interface LostCache {
  id: string;
  nodeId: string;
  squadName: string;
  items: Record<string, number>;
  loot: Record<string, number>;
  /** Hora da campanha em que some. */
  expiresAt: number;
}

export interface Contract {
  id: string;
  capitalId: string;
  act: number;
  title: string;
  description: string;
  victory: Victory['type'];
  targetNode: string;
  level: number;
  enemyKind: 'human' | 'beast';
  rewardGold: number;
  rewardXp: number;
  rewardItem: string | null;
  /** Missão de atraso do Véu: ao cumprir, o contador recua. */
  delay?: DelayKind;
  /** Missão com peças especiais (Interagir, VIP, rodadas, início escondido). */
  mission?: MissionKind;
  status: 'open' | 'accepted' | 'done';
  squadId: string | null;
  /** Crise (C13): qualquer esquadrão no local pode atender; tem prazo e consequência. */
  crisis?: boolean;
  expiresAt?: number;
  failed?: boolean;
  /** Defesa de cerco (C21): a força que cerca. */
  defense?: boolean;
  forceUnits?: string[];
  /** Força interceptada (C11/C14). */
  forceId?: string;
  /** Missão que frustra um plano do inimigo (C12). */
  opId?: import('./politics').OpId;
  /** Operação de um sistema de ato (world/acts.ts): ordem da Coroa, frente, portal, posto de Barão. */
  actOp?: { kind: string; ref: string };
  /** Quadro de facção que ofereceu o contrato (world/boards.ts). */
  board?: string;
  /** Contrato sem batalha: entrega com prazo, reconhecimento de províncias, resgate na masmorra. */
  task?: 'entrega' | 'reconhecimento' | 'masmorra';
  /** Reconhecimento: províncias a revelar. */
  scout?: string[];
}

export interface Campaign {
  version: 1;
  seed: number;
  hours: number;
  speed: number;
  gold: number;
  act: number;
  baseNode: string;
  roster: Record<string, Character>;
  squads: Squad[];
  inventory: Record<string, number>;
  /** Estoque de espólio na base (materiais, troféus, joias). */
  materials: Record<string, number>;
  /** Feras abatidas por espécie (pesquisa de criatura pede abates). */
  speciesKills: Record<string, number>;
  lostCaches: LostCache[];
  /** Base da resistência (existe a partir do fim do Ato 1). */
  base?: BaseState;
  /** Itens mágicos fabricados (joias de forja). */
  customItems?: ItemDef[];
  /** Conhecimento registrado no Pavilhão dos Caçadores (Verdelume), por espécie (1–4). */
  lore?: Record<string, number>;
  /** Caçada aberta no Pavilhão dos Caçadores: o próximo encontro traz pelo menos uma desta espécie. */
  hunt?: string;
  /** Humanos rendidos na Prisão. */
  prisoners?: Prisoner[];
  /** Contador do Véu (a partir do Ato 3). */
  veil?: VeilState;
  /** Campanha principal: capítulo, missões feitas, escolhas e códice (world/story.ts). */
  story?: StoryState;
  /** Tutorial guiado no Prólogo (world/tutorial.ts) e liberações já apresentadas. */
  tutorial?: boolean;
  tutorialSeen?: string[];
  /** Dificuldade e Modo Ferro (world/difficulty.ts). */
  difficulty?: DifficultyId;
  ironman?: boolean;
  /** Ferro: batalha em andamento (sair no meio conta como recuo). */
  inBattle?: string;
  /** Rival recorrente (world/rival.ts). */
  rival?: RivalState;
  /** Crônica: histórias que nasceram da partida (world/chronicle.ts). */
  chronicle?: ChronicleEntry[];
  /** Conversas da base já vistas (world/camp.ts). */
  campSeen?: string[];
  /** Telemetria de playtest (world/telemetry.ts). */
  stats?: PlayStats;
  /** Territórios e névoa do mapa (world/territory.ts). */
  world?: WorldState;
  /** Moradores levados pelas incursões do Vazio. */
  abducted?: number;
  /** Reputação, aprovação, influência, informação e planos do inimigo (world/politics.ts). */
  politics?: import('./politics').PoliticsState;
  /** Terras distantes, lendas, tesouro e masmorras (world/expedition.ts). */
  expedition?: import('./expedition').ExpeditionState;
  /** Estação e clima do dia (world/season.ts). */
  season?: import('./season').SeasonState;
  /** Sistemas de cada ato (world/acts.ts). */
  acts?: import('./acts_state').ActsState;
  /** Postos avançados por lugar (world/outposts.ts). */
  outposts?: Record<string, import('./outposts').OutpostKind>;
  recruits: Record<string, { month: number; list: Candidate[] }>;
  contracts: Record<string, Contract[]>;
  log: { day: number; text: string }[];
  /** Nome do comandante (estilo XCOM: o jogador comanda, não luta). */
  commanderName: string;
  /** Saves antigos: o comandante era um herói do elenco (vira um herói comum). */
  commanderId?: string;
}

let rngCache: { seed: number; rng: Rng } | null = null;
export function campaignRng(c: Campaign): Rng {
  if (!rngCache || rngCache.seed !== c.seed) rngCache = { seed: c.seed, rng: new Rng(c.seed ^ Math.floor(c.hours * 7919)) };
  return rngCache.rng;
}

// ───────────────────────────── tempo ─────────────────────────────

export function dayOf(c: Campaign): number {
  return Math.floor(c.hours / 24) + 1;
}
export function monthOf(c: Campaign): number {
  return Math.floor((dayOf(c) - 1) / DAYS_PER_MONTH) + 1;
}
export function dateLabel(c: Campaign): string {
  const day = dayOf(c);
  const hour = Math.floor(c.hours % 24);
  return `Ato ${c.act} · Mês ${monthOf(c)} · Dia ${((day - 1) % DAYS_PER_MONTH) + 1} · ${String(hour).padStart(2, '0')}h`;
}

/** Horas do dia com luz: das 6h às 18h59 é dia; o resto é noite. */
export const DAYLIGHT = { from: 6, to: 19 } as const;

/** Dia ou noite agora (vale para os encontros aleatórios). */
export function timeOfDayOf(c: Pick<Campaign, 'hours'>): 'dia' | 'noite' {
  const hour = Math.floor(c.hours % 24);
  return hour >= DAYLIGHT.from && hour < DAYLIGHT.to ? 'dia' : 'noite';
}

export function addLog(c: Campaign, text: string): void {
  c.log.unshift({ day: dayOf(c), text });
  if (c.log.length > 80) c.log.length = 80;
}

// ───────────────────────────── criação ─────────────────────────────

function giveItem(bag: Record<string, number>, id: string, n = 1): void {
  bag[id] = (bag[id] ?? 0) + n;
  if (bag[id]! <= 0) delete bag[id];
}

export interface NewCampaignOptions {
  difficulty?: DifficultyId;
  ironman?: boolean;
  tutorial?: boolean;
  commanderName?: string;
  /** Primeiro esquadrão (criado pelo jogador). */
  squad?: { name: string; icon?: string; color?: string };
  /** Os 6 heróis criados pelo jogador; sem eles, são gerados (testes e atalhos). */
  heroes?: Character[];
}

export function newCampaign(seed = Date.now() % 1_000_000, opts: NewCampaignOptions = {}): Campaign {
  const rng = new Rng(seed);
  const roster: Record<string, Character> = {};
  const team: Character[] = opts.heroes?.length
    ? opts.heroes
    : (['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao', 'mago'] as ClassId[]).map((cls) => makeCharacter(rng, { classId: cls, level: rng.int(1, 2) }));
  for (const ch of team) {
    ch.equipment.utility[0] ??= 'pocao_de_vida';
    roster[ch.id] = ch;
  }
  // Magos começam tendo estudado os elementos: os seis raios (e os combos entre eles).
  for (const m of team.filter((t) => t.classId === 'mago' && !t.skills.length)) m.skills = ['elementalista_iniciado_no_estudo_dos_elementos'];
  const c: Campaign = {
    version: 1,
    seed,
    hours: 8,
    speed: 0,
    gold: 600,
    act: 1,
    baseNode: CITADEL_ID,
    roster,
    squads: [
      { id: newId('sq', rng), name: opts.squad?.name || 'Guarda Real', color: opts.squad?.color ?? SQUAD_COLORS[0]!, icon: opts.squad?.icon, memberIds: team.slice(0, SQUAD_MAX).map((t) => t.id), at: CITADEL_ID, to: null, route: [], progress: 0, carried: {}, loot: {}, resting: false },
    ],
    materials: {},
    speciesKills: {},
    lostCaches: [],
    inventory: { pocao_de_vida: 6, pocao_de_mana: 4, frasco_dagua: 3, frasco_de_fogo: 2, frasco_de_oleo: 2, bomba_de_fumaca: 2, granada_de_clarao: 1, roupa_de_couro: 2, espada_curta: 1, arco_curto: 1 },
    recruits: {},
    contracts: {},
    log: [],
    commanderName: opts.commanderName?.trim() || 'Comandante',
    difficulty: opts.difficulty ?? 'normal',
    ironman: !!opts.ironman,
    tutorial: opts.tutorial ?? true,
  };
  for (const cap of capitals()) refreshRecruits(c, cap.id);
  generateAllContracts(c);
  ensureStory(c);
  ensureWorld(c);
  addLog(c, `${c.commanderName}, o rei aguarda: a cerimônia da patente na Citadela (📖 no mapa).`);
  return c;
}

// ───────────────────────────── esquadrões ─────────────────────────────

export function squadById(c: Campaign, id: string | null | undefined): Squad | undefined {
  return c.squads.find((s) => s.id === id);
}

export function members(c: Campaign, s: Squad): Character[] {
  return s.memberIds.map((id) => c.roster[id]).filter((x): x is Character => !!x);
}

export function escorts(c: Campaign, s: Squad): Character[] {
  return (s.escort ?? []).map((id) => c.roster[id]).filter((x): x is Character => !!x);
}

/** Todos que viajam com o esquadrão (combatentes + escoltados). */
export function travelers(c: Campaign, s: Squad): Character[] {
  return [...members(c, s), ...escorts(c, s)];
}

/** Esquadrão em que o herói está (como combatente ou escoltado). */
export function squadOfChar(c: { squads: Squad[] }, charId: string): Squad | undefined {
  return c.squads.find((s) => s.memberIds.includes(charId) || !!s.escort?.includes(charId));
}

/** Tira o herói de qualquer esquadrão (combate ou escolta). */
export function removeFromSquads(c: Campaign, charId: string): void {
  for (const s of c.squads) {
    s.memberIds = s.memberIds.filter((m) => m !== charId);
    if (s.escort) s.escort = s.escort.filter((m) => m !== charId);
  }
}

/** Põe o herói na escolta de um esquadrão (precisa haver vaga). */
export function addEscort(c: Campaign, s: Squad, charId: string): boolean {
  if ((s.escort?.length ?? 0) >= ESCORT_MAX || !c.roster[charId]) return false;
  removeFromSquads(c, charId);
  s.escort = [...(s.escort ?? []), charId];
  return true;
}

/** Aptos para lutar: vivos e sem ferimento grave (ferido leve luta com menos vida). */
export function fitMembers(c: Campaign, s: Squad): Character[] {
  return members(c, s).filter(canFight);
}

export function reserve(c: Campaign): Character[] {
  const inSquad = new Set(c.squads.flatMap((s) => [...s.memberIds, ...(s.escort ?? [])]));
  return Object.values(c.roster).filter((ch) => !inSquad.has(ch.id));
}

export function squadPosition(s: Squad): { x: number; y: number } {
  const a = node(s.at);
  if (!s.to) return { x: a.x, y: a.y };
  const b = node(s.to);
  return { x: a.x + (b.x - a.x) * s.progress, y: a.y + (b.y - a.y) * s.progress };
}

export function isTraveling(s: Squad): boolean {
  return !!s.to;
}

/** Mar fechado (Bloqueio do mar, plano do inimigo; ou tempestade da estação). */
export function seaClosed(c: Campaign): boolean {
  return opActive(c, 'bloqueio_do_mar') || stormAtSea(c);
}

function movePath(c: Campaign, s: Squad, dest: string): string[] {
  const chapter = ensureStory(c).chapter;
  const closed = seaClosed(c);
  return shortestPath(s.to ?? s.at, dest, { offroad: s.offroad, open: (n) => nodeOpen(n, chapter) && !(closed && n.sea) && !actsBlocked(c, n.id) });
}

/** Passagem de barco até o destino (0 se não há mar no caminho ou já está no mar). */
export function seaFee(c: Campaign, s: Squad, dest: string): number {
  if (node(s.to ?? s.at).sea) return 0;
  return movePath(c, s, dest).some((id) => node(id).sea) ? EXP.sea.feePerTraveler * travelers(c, s).length : 0;
}

export function orderMove(c: Campaign, s: Squad, dest: string): boolean {
  const path = movePath(c, s, dest);
  const fee = seaFee(c, s, dest);
  if (fee > c.gold) return false;
  if (fee) {
    c.gold -= fee;
    addLog(c, `⛵ ${s.name} pagou ${fee} ouro pela passagem de barco.`);
  }
  if (s.to) {
    s.route = path;
  } else {
    if (!path.length) return false;
    s.to = path.shift()!;
    s.route = path;
    s.progress = 0;
  }
  s.resting = false;
  addLog(c, `${s.name} parte rumo a ${node(dest).name}.`);
  return true;
}

export function stopSquad(s: Squad): void {
  s.route = [];
}

export function createSquad(c: Campaign, memberIds: string[]): Squad | null {
  if (!memberIds.length) return null;
  const rng = campaignRng(c);
  const s: Squad = {
    id: newId('sq', rng),
    name: `Esquadrão ${c.squads.length + 1}`,
    color: SQUAD_COLORS[c.squads.length % SQUAD_COLORS.length]!,
    memberIds: memberIds.slice(0, SQUAD_MAX),
    at: c.baseNode,
    to: null,
    route: [],
    progress: 0,
    carried: {},
    loot: {},
    resting: false,
  };
  for (const id of s.memberIds) removeFromSquads(c, id);
  c.squads.push(s);
  return s;
}

export function atBase(c: Campaign, s: Squad): boolean {
  return !s.to && s.at === c.baseNode;
}

export function disbandIfEmpty(c: Campaign): void {
  // Sem combatentes, o esquadrão se desfaz (os escoltados voltam à reserva).
  c.squads = c.squads.filter((s) => s.memberIds.length > 0);
}

/** Na base: itens e espólio carregados vão para o inventário e o estoque gerais. */
export function depositCarried(c: Campaign, s: Squad): void {
  for (const [id, n] of Object.entries(s.carried)) giveItem(c.inventory, id, n);
  s.carried = {};
  for (const [id, n] of Object.entries(s.loot)) giveItem(c.materials, id, n);
  s.loot = {};
}

/** Saves antigos: preenche campos novos. */
export function migrateCampaign(c: Campaign): Campaign {
  c.materials ??= {};
  c.speciesKills ??= {};
  c.lostCaches ??= [];
  c.lore ??= {};
  // Saves antigos: o comandante era um herói; agora ele só comanda (o herói continua no elenco).
  c.commanderName ??= (c.commanderId && c.roster[c.commanderId]?.name) || 'Comandante';
  migrateStory(c);
  ensureWorld(c);
  for (const s of c.squads) {
    s.loot ??= {};
    // Mapa ampliado (D125): estradas renumeradas. Quem estava no meio de uma volta ao último lugar com nome.
    if (!hasNode(s.at) || (s.to && !hasNode(s.to)) || s.route.some((id) => !hasNode(id))) {
      s.at = hasNode(s.at) && node(s.at).type !== 'waypoint' ? s.at : c.baseNode;
      s.to = null;
      s.route = [];
      s.progress = 0;
    }
  }
  c.lostCaches = c.lostCaches.filter((x) => hasNode(x.nodeId));
  for (const ch of Object.values(c.roster)) {
    // Subclasses refeitas (Sicário → Mestre dos Selos, Algoz → Besteiro Gêmeo): mesma posição na teia.
    const ren = RENAMED as Record<string, string>;
    if (ch.skills.some((id) => ren[id])) {
      ch.skills = ch.skills.map((id) => ren[id] ?? id);
      if (ch.skillRanks) ch.skillRanks = Object.fromEntries(Object.entries(ch.skillRanks).map(([k, v]) => [ren[k] ?? k, v]));
    }
    // Um espaço de orbe virou dois.
    if (ch.jewel) {
      ch.jewels = [ch.jewel];
      delete ch.jewel;
    }
    ensureLoyalty(ch);
    ensureTrait(ch);
    // Saves antigos: heróis de classe sem caminho escolhido ganham um (a 1ª habilidade dele).
    if (ch.classId !== 'aprendiz' && !mainSubclass(ch) && ch.skillPoints > 0) {
      const path = randomPath(campaignRng(c), ch.classId);
      if (path) spendSkillPoints(ch, path.id, 1);
    }
  }
  registerCustomItems(c);
  return c;
}

// ───────────────────────────── itens perdidos ─────────────────────────────

let lostHoursCache = 0;
/**
 * Quanto tempo os itens de um esquadrão dizimado esperam no mapa: a maior viagem do mapa
 * (arredondada para cima, em dias) + 2 dias para se preparar. Hoje: 4 dias.
 */
export function lostCacheHours(): number {
  if (lostHoursCache) return lostHoursCache;
  // Maior viagem entre lugares do reino (em horas, pela estrada), arredondada em dias + 2 dias.
  const ids = places().filter((n) => n.realm === 'reino').map((n) => n.id);
  let longest = 0;
  for (const a of ids)
    for (const b of ids) {
      if (a >= b) continue;
      longest = Math.max(longest, travelHours([a, ...shortestPath(a, b)]));
    }
  lostHoursCache = (Math.ceil(longest / 24) + 2) * 24;
  return lostHoursCache;
}

/** Horas para percorrer o caminho (lista de nós, do primeiro ao último). */
export function travelHours(path: string[], offroad = false): number {
  let h = 0;
  for (let k = 1; k < path.length; k++) h += edgeLength(path[k - 1]!, path[k]!) / (TRAVEL_SPEED * edgeSpeed(path[k - 1]!, path[k]!, offroad));
  return h;
}

/** Nó onde o esquadrão está (ou do qual está mais perto, se viajando). */
export function squadNode(s: Squad): string {
  return s.to && s.progress >= 0.5 ? s.to : s.at;
}

/** Deixa os itens de um esquadrão dizimado no mapa. */
export function dropLostCache(c: Campaign, s: Squad): LostCache | null {
  const items = { ...s.carried };
  const loot = { ...s.loot };
  if (!Object.keys(items).length && !Object.keys(loot).length) return null;
  const cache: LostCache = { id: newId('perdido', campaignRng(c)), nodeId: squadNode(s), squadName: s.name, items, loot, expiresAt: c.hours + lostCacheHours() };
  c.lostCaches.push(cache);
  s.carried = {};
  s.loot = {};
  addLog(c, `Os itens de ${s.name} ficaram em ${node(cache.nodeId).name} (somem em ${lostCacheHours() / 24} dias).`);
  return cache;
}

/** Um esquadrão que chega a um local com itens perdidos recolhe tudo. */
export function recoverLostCaches(c: Campaign, s: Squad): number {
  const here = c.lostCaches.filter((x) => x.nodeId === s.at);
  for (const cache of here) {
    for (const [id, n] of Object.entries(cache.items)) giveItem(s.carried, id, n);
    for (const [id, n] of Object.entries(cache.loot)) giveItem(s.loot, id, n);
    addLog(c, `${s.name} recuperou os itens de ${cache.squadName} em ${node(cache.nodeId).name}.`);
  }
  c.lostCaches = c.lostCaches.filter((x) => !here.includes(x));
  return here.length;
}

export function expireLostCaches(c: Campaign): void {
  const gone = c.lostCaches.filter((x) => c.hours >= x.expiresAt);
  for (const cache of gone) addLog(c, `Os itens de ${cache.squadName} em ${node(cache.nodeId).name} se perderam para sempre.`);
  c.lostCaches = c.lostCaches.filter((x) => !gone.includes(x));
}

/** Vende espólio (materiais, troféus, joias) de um estoque. */
export function sellLoot(c: Campaign, bag: Record<string, number>, key: string, n = 1): number {
  const have = bag[key] ?? 0;
  const k = Math.min(have, Math.max(0, n));
  if (!k) return 0;
  giveItem(bag, key, -k);
  const gold = Math.round(k * lootPrice(key) * lootSellMult(c));
  c.gold += gold;
  return gold;
}

// ───────────────────────────── avanço do tempo ─────────────────────────────

export type CampaignEvent =
  | { type: 'arrived'; squadId: string; nodeId: string }
  | { type: 'day'; day: number }
  | { type: 'month'; month: number; report: string[] }
  /** Esquadrão e força inimiga no mesmo lugar (C11): quem chegou decide se ataca. */
  | { type: 'intercept'; squadId: string; forceId: string; byForce: boolean }
  /** Aviso importante da camada de comandante (queda de província, cerco, crise). */
  | { type: 'notice'; text: string };

export function advanceHours(c: Campaign, hours: number): CampaignEvent[] {
  const events: CampaignEvent[] = [];
  const prevDay = dayOf(c);
  const prevMonth = monthOf(c);
  c.hours += hours;
  for (const s of c.squads) {
    if (!s.to) continue;
    const len = Math.max(1, edgeLength(s.at, s.to));
    // Estação (neve, cheias) e capitão (marcha forçada) mudam o passo.
    s.progress += (hours * TRAVEL_SPEED * edgeSpeed(s.at, s.to, s.offroad) * seasonSpeed(c, node(s.to).region) * captainSpeed(c, s)) / len;
    if (s.progress >= 1) {
      s.at = s.to;
      s.progress = 0;
      s.to = s.route.shift() ?? null;
      events.push({ type: 'arrived', squadId: s.id, nodeId: s.at });
      for (const id of reveal(c, s.at, ensureStory(c).chapter)) {
        addLog(c, `🗺 ${s.name} descobriu ${node(id).name}.`);
        addIntel(c, POLITICS_RES.intelDiscovery);
      }
      recoverLostCaches(c, s);
      if (atBase(c, s)) depositCarried(c, s);
      // Depósito avançado: rações cheias de graça.
      if (outpostAt(c, s.at) === 'deposito') s.supplies = Math.max(s.supplies ?? 0, supplyCap(s, travelers(c, s).length));
      for (const msg of arriveExpedition(c, s, s.at, campaignRng(c))) {
        addLog(c, msg);
        events.push({ type: 'notice', text: msg });
      }
      for (const msg of checkTasks(c)) {
        addLog(c, msg);
        events.push({ type: 'notice', text: msg });
      }
      // Chegou onde há uma força inimiga: encontro (o esquadrão decide como entrar).
      const f = forcesAt(c, s.at)[0];
      if (f) events.push({ type: 'intercept', squadId: s.id, forceId: f.id, byForce: false });
    }
  }
  // Forças inimigas andam; ao chegar no alvo, a consequência acontece; ao alcançar um esquadrão, encontro.
  const squadNodes = new Set(c.squads.filter((s) => !s.to || s.progress < 0.05).map((s) => s.at));
  for (const ev of moveForces(c, hours, TRAVEL_SPEED, squadNodes)) {
    if (ev.type === 'force_meets') {
      const s = c.squads.find((x) => x.at === ev.nodeId && (!x.to || x.progress < 0.05));
      if (s) events.push({ type: 'intercept', squadId: s.id, forceId: ev.force.id, byForce: true });
    } else
      for (const msg of forceArrived(c, ev.force)) {
        addLog(c, msg);
        events.push({ type: 'notice', text: msg });
      }
  }
  expireLostCaches(c);
  for (const msg of advanceBase(c, hours)) {
    addLog(c, msg);
    // Interrogatório rende informação; no Ato 2, também uma pista para o quadro.
    if (msg.startsWith('🗣 Interrogatório')) {
      addIntel(c, POLITICS_RES.intelInterrogation);
      if (ensureStory(c).chapter === 2) addLog(c, addClue(c, campaignRng(c)));
    }
  }
  for (let d = prevDay + 1; d <= dayOf(c); d++) {
    dailyTick(c);
    for (const msg of politicsDay(c)) addLog(c, msg);
    // Clima com semente própria por dia: não mexe na sequência dos outros sorteios.
    for (const msg of seasonDay(c, new Rng((c.seed * 31 + d * 7919) >>> 0))) {
      addLog(c, msg);
      events.push({ type: 'notice', text: msg });
    }
    outpostsDay(c);
    for (const msg of actsDay(c, d, campaignRng(c))) {
      addLog(c, msg);
      events.push({ type: 'notice', text: msg });
    }
    for (const msg of checkTasks(c)) addLog(c, msg);
    for (const msg of commanderDay(c)) {
      addLog(c, msg);
      events.push({ type: 'notice', text: msg });
    }
    for (const ev of veilDay(c, d, campaignRng(c))) {
      if (ev.kind === 'cult') {
        addLog(c, `🜏 ${ev.text} O Véu avança.`);
        addDelayContract(c);
      } else {
        const lost = veilRush(c);
        addLog(c, `🜏 O Contador do Véu chegou a 100: o Selo rompeu antes da hora! ${lost.length ? `Missões perdidas: ${lost.map((m) => m.title).join(', ')}. ` : ''}O clímax de ${CHAPTER_TITLE[ensureStory(c).chapter]} está aberto.`);
      }
    }
    events.push({ type: 'day', day: d });
  }
  if (monthOf(c) > prevMonth) {
    for (const cap of capitals()) refreshRecruits(c, cap.id);
    refreshRecruits(c, CITADEL_ID);
    addLog(c, 'Novo mês: as listas de recrutamento foram renovadas.');
    boardsMonth(c);
    const report = [...seasonMonth(c, campaignRng(c)), ...commanderMonth(c), ...outpostsMonth(c), ...actsMonth(c), ...monthOps(c, campaignRng(c))];
    for (const l of report.slice(-3)) addLog(c, l);
    events.push({ type: 'month', month: monthOf(c), report });
  }
  return events;
}

export function dailyTick(c: Campaign): void {
  for (const s of c.squads) {
    const here = !s.to;
    const inn = here && s.resting && (node(s.at).type === 'city' || node(s.at).type === 'village');
    if (inn) {
      const cost = INN_COST_PER_MEMBER * travelers(c, s).length;
      if (c.gold >= cost) {
        c.gold -= cost;
      } else {
        s.resting = false;
        addLog(c, `${s.name} saiu da estalagem: falta ouro.`);
      }
    }
    // Enfermaria de Solenne: ferimentos saram 2× mais rápido e a moral se restaura.
    const post = here ? outpostAt(c, s.at) : undefined;
    const infirmary = here && (infirmaryAt(s.at) || post === 'enfermaria');
    // Suprimentos e fadiga (C9, C22): parado numa cidade come lá; viajando, gasta rações.
    // No Vazio não há comida; o acampamento de expedição (Ato 6) vale como base.
    const camp = here && actsCamp(c, s.at);
    const town = here && !actsNoFood(c, s) && (['city', 'village', 'capital', 'citadel'].includes(node(s.at).type) || post === 'refugio' || camp);
    const rested = here && (s.resting || atBase(c, s) || infirmary || camp);
    // Verão nas terras áridas pede mais; o intendente economiza.
    const hungerMsg = supplyDay(s, travelers(c, s), town || atBase(c, s), seasonRations(c, node(s.to ?? s.at).region) * captainRations(c, s));
    if (hungerMsg) addLog(c, hungerMsg);
    for (const m of travelers(c, s)) fatigueDay(m, !here, !!rested || !!town);
    for (const m of travelers(c, s)) {
      const rate = (s.resting && inn ? 2 : 1) * (infirmary ? CAPITALS.infirmary.woundMult : 1) * (here ? 1 : captainWoundRate(c, s));
      if (m.woundDays > 0) m.woundDays = Math.max(0, m.woundDays - rate);
      if ((s.resting && inn) || atBase(c, s) || infirmary || camp) fullHeal(m);
      else regen(m, 0.2);
      loyaltyDay(m, { resting: (s.resting && inn) || atBase(c, s) || infirmary, idle: false });
      if (infirmary) restoreMorale(m);
    }
  }
  for (const m of reserve(c)) {
    fatigueDay(m, false, true);
    if (m.woundDays > 0) m.woundDays = Math.max(0, m.woundDays - woundHealPerDay(c));
    fullHeal(m);
    loyaltyDay(m, { resting: true, idle: true });
  }
}

/** A capital deste nó tem enfermaria (Solenne)? */
export function infirmaryAt(nodeId: string): boolean {
  const n = node(nodeId);
  const country = n.type === 'capital' ? countryOf(nodeId) : null;
  return !!country && (CAPITALS.services as Record<string, string | null>)[country.id] === 'enfermaria';
}

function regen(m: Character, ratio: number): void {
  const d = derive(m);
  m.hp = Math.min(d.maxHp, m.hp + Math.ceil(d.maxHp * ratio));
  m.mp = Math.min(d.maxMp, m.mp + Math.ceil(d.maxMp * ratio));
}

export function setResting(c: Campaign, s: Squad, on: boolean): boolean {
  if (on && (s.to || (node(s.at).type !== 'city' && node(s.at).type !== 'village'))) return false;
  s.resting = on;
  addLog(c, on ? `${s.name} se hospedou na estalagem de ${node(s.at).name}.` : `${s.name} deixou a estalagem.`);
  return true;
}

// ───────────────────────────── loja ─────────────────────────────

const CLASS_THEMES: Partial<Record<ClassId, string[]>> = {
  arqueiro: ['arco_longo', 'anel_de_agilidade', 'veste_sombria'],
  mago: ['cajado_gelido', 'manto_arcano', 'varinha_aprendiz'],
  guerreiro: ['espada_longa', 'lamina_do_farol', 'cota_de_malha', 'escudo_de_madeira'],
  ladrao: ['adaga_curva', 'veste_sombria', 'amuleto_da_sorte'],
  clerigo: ['bastao_sagrado', 'amuleto_da_sorte', 'manto_arcano'],
};

/** Toda capital vende o básico; a capital de cada classe vende os melhores itens da sua classe. */
export function shopStock(capitalId: string): string[] {
  const country = countryOf(capitalId);
  const basics = Object.values(DB.items)
    .filter((i) => i.rarity === 'comum')
    .map((i) => i.id);
  const themed = country ? CLASS_THEMES[country.classId] ?? [] : [];
  return [...new Set([...basics, ...themed])];
}

/** Preço de um item numa capital (reputação com o país e a Sobretaxa do inimigo, C15/C12). */
export function shopPrice(c: Campaign, capitalId: string, itemId: string): number {
  const country = hasNode(capitalId) ? countryOf(capitalId) : null;
  return Math.max(1, Math.round(item(itemId).price * priceMult(c, country?.id) * festivalMult(c, capitalId) * wantedPrice(c, capitalId)));
}

export function buy(c: Campaign, s: Squad | undefined, capitalId: string, itemId: string): boolean {
  const price = shopPrice(c, capitalId, itemId);
  if (c.gold < price) return false;
  c.gold -= price;
  if (capitalId === c.baseNode || !s) giveItem(c.inventory, itemId);
  else giveItem(s.carried, itemId);
  return true;
}

export function sell(c: Campaign, bag: Record<string, number>, itemId: string): boolean {
  if (!bag[itemId]) return false;
  giveItem(bag, itemId, -1);
  c.gold += Math.floor(item(itemId).price / 2);
  return true;
}

// ───────────────────────────── recrutamento ─────────────────────────────

/** Renova a lista de recrutas de uma capital (ou da Citadela Real, que só tem Aprendizes). */
export function refreshRecruits(c: Campaign, capitalId: string): void {
  const rng = campaignRng(c);
  if (capitalId === CITADEL_ID) {
    c.recruits[capitalId] = { month: monthOf(c), list: generateApprenticePool(rng) };
    return;
  }
  const country = countryOf(capitalId);
  // Reputação (C15): país amigo manda um recruta a mais; país hostil fecha o recrutamento.
  const mod = recruitMod(c, country?.id);
  // Procurado no máximo (Ato 2): ninguém se arrisca a se alistar.
  const list = mod < 0 || wantedRecruitClosed(c, capitalId) ? [] : generateRecruitPool(rng, country?.classId ?? 'guerreiro');
  if (mod > 0) list.push(...generateRecruitPool(rng, country?.classId ?? 'guerreiro').slice(0, mod));
  c.recruits[capitalId] = { month: monthOf(c), list };
}

export function recruit(c: Campaign, s: Squad | undefined, capitalId: string, index: number): string | null {
  const pool = c.recruits[capitalId];
  const cand = pool?.list[index];
  if (!pool || !cand) return 'Candidato indisponível.';
  if (c.gold < cand.price) return 'Ouro insuficiente.';
  const joinsSquad = s && !s.to && s.at === capitalId && s.memberIds.length < SQUAD_MAX;
  if (!joinsSquad && capitalId !== c.baseNode) return 'O esquadrão aqui está cheio (máx. 6). Recrute na base ou libere espaço.';
  c.gold -= cand.price;
  c.roster[cand.character.id] = cand.character;
  if (joinsSquad) s!.memberIds.push(cand.character.id);
  pool.list.splice(index, 1);
  addLog(c, `${cand.character.name} foi recrutado.`);
  return null;
}

// ───────────────────────────── contratos ─────────────────────────────

/** Missões com peças especiais (tipos do XCOM 2 adaptados, D70). */
export type MissionKind = 'roubo' | 'resgate' | 'suprimentos' | 'runas';

const CONTRACT_TEMPLATES: { victory: Victory['type']; kind: 'human' | 'beast'; title: string; desc: string; mission?: MissionKind }[] = [
  { victory: 'interact', kind: 'human', title: 'Roubar registros em {city}', desc: 'Entre escondido e roube os documentos (2 ações).', mission: 'roubo' },
  { victory: 'escape', kind: 'human', title: 'Resgatar o preso de {city}', desc: 'Abra a cela e leve o prisioneiro até a zona de fuga. Se ele morrer, a missão falha.', mission: 'resgate' },
  { victory: 'interact', kind: 'human', title: 'Incursão de suprimentos em {city}', desc: 'Pegue os 3 baús antes da rodada 8.', mission: 'suprimentos' },
  { victory: 'eliminate', kind: 'human', title: 'Reprimir revolta em {city}', desc: 'Rebeldes armados tomaram a estrada. Disperse-os.' },
  { victory: 'target', kind: 'beast', title: 'Caçar a fera de {city}', desc: 'Uma criatura ataca viajantes. Abata o alvo marcado.' },
  { victory: 'escape', kind: 'human', title: 'Romper o bloqueio de {city}', desc: 'Atravesse a linha inimiga e alcance a zona de fuga.' },
  { victory: 'survive', kind: 'human', title: 'Segurar a ponte de {city}', desc: 'Resista ao ataque até a chegada de reforços.' },
];

const DELAY_TEMPLATES: { kind: DelayKind; victory: Victory['type']; title: string; desc: string; mission?: MissionKind }[] = [
  { kind: 'sabotar', victory: 'interact', title: 'Sabotar o ritual em {city}', desc: 'Apague as runas do círculo (2 ações) antes da rodada 10.', mission: 'runas' },
  { kind: 'resgatar', victory: 'escape', title: 'Resgatar sequestrados em {city}', desc: 'Abra a cela e leve o sequestrado até a zona de fuga.', mission: 'resgate' },
  { kind: 'retaliacao', victory: 'survive', title: 'Defender {city} dos cultistas', desc: 'O culto ataca a cidade. Resista até a guarda chegar.' },
  { kind: 'altar', victory: 'target', title: 'Destruir o altar de {city}', desc: 'Elimine o sacerdote que guarda o altar.' },
];

/** Ação do culto: surge uma missão de atraso do Véu numa capital aleatória. */
export function addDelayContract(c: Campaign): Contract | null {
  const rng = campaignRng(c);
  const cap = rng.pick(capitals());
  const country = countryOf(cap.id);
  if (!country) return null;
  const targets = Object.values(worldGraph().nodes).filter((n) => n.countryId === country.id && n.type === 'city');
  const target = rng.pick(targets);
  const tpl = rng.pick(DELAY_TEMPLATES);
  const level = Math.max(1, averageLevel(c) + rng.int(0, 2));
  const ct: Contract = {
    id: newId('ct', rng),
    capitalId: cap.id,
    act: c.act,
    title: `🜏 ${tpl.title.replace('{city}', target.name)}`,
    description: `${tpl.desc} Atrasa o Véu em ${VEIL.delay[tpl.kind]}.`,
    victory: tpl.victory,
    targetNode: target.id,
    level,
    enemyKind: 'human',
    rewardGold: 100 + level * 30,
    rewardXp: 50 + level * 12,
    rewardItem: null,
    delay: tpl.kind,
    mission: tpl.mission,
    status: 'open',
    squadId: null,
  };
  (c.contracts[cap.id] ??= []).push(ct);
  return ct;
}

export function averageLevel(c: Campaign): number {
  const all = Object.values(c.roster);
  return all.length ? Math.round(all.reduce((s, m) => s + m.level, 0) / all.length) : 1;
}

export function generateContracts(c: Campaign, capitalId: string): void {
  const rng = campaignRng(c);
  const country = countryOf(capitalId);
  if (!country) return;
  const targets = Object.values(worldGraph().nodes).filter((n) => n.countryId === country.id && (n.type === 'city' || n.type === 'waypoint'));
  const list: Contract[] = [];
  for (let i = 0; i < CONTRACTS_PER_CAPITAL + extraContracts(c); i++) {
    const tpl = rng.pick(CONTRACT_TEMPLATES);
    const target = rng.pick(targets);
    const cityName = target.type === 'city' ? target.name : `estrada de ${country.capital}`;
    const level = Math.max(1, averageLevel(c) + rng.int(0, 2) + (c.act - 1) * 3);
    list.push({
      id: newId('ct', rng),
      capitalId,
      act: c.act,
      title: tpl.title.replace('{city}', cityName),
      description: tpl.desc,
      victory: tpl.victory,
      targetNode: target.id,
      level,
      enemyKind: tpl.kind,
      mission: tpl.mission,
      rewardGold: 120 + level * 35,
      rewardXp: 50 + level * 12,
      rewardItem: rng.chance(0.4) ? rng.pick(Object.values(DB.items).filter((it) => it.rarity === 'raro')).id : null,
      status: 'open',
      squadId: null,
    });
  }
  c.contracts[capitalId] = list;
}

export function generateAllContracts(c: Campaign): void {
  for (const cap of capitals()) generateContracts(c, cap.id);
}

export function allContracts(c: Campaign): Contract[] {
  return Object.values(c.contracts).flat();
}

export function acceptContract(c: Campaign, contract: Contract, s: Squad): void {
  contract.status = 'accepted';
  contract.squadId = s.id;
  addLog(c, `${s.name} aceitou: ${contract.title}.`);
}

export function contractReadyAt(c: Campaign, s: Squad): Contract | undefined {
  return allContracts(c).find((ct) => ct.status === 'accepted' && !ct.task && (ct.squadId === s.id || (ct.crisis && !ct.squadId)) && ct.targetNode === s.at);
}

let ctSeq = 0;
/** Id de contrato novo (crises, cercos). */
export function newContractId(c: Campaign): string {
  return `ct_${c.seed}_${Math.floor(c.hours)}_${ctSeq++}`;
}

/** Avança o ato: contratos não concluídos somem e novos são gerados. */
export function advanceAct(c: Campaign): void {
  c.act += 1;
  generateAllContracts(c);
  addLog(c, `Começa o Ato ${c.act}. Contratos antigos expiraram.`);
}

export { giveItem };
