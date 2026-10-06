import { Rng } from '@core';
import { DB, type Biome, type EnemyDef, type Rarity } from '../data';
import type { BattleMap } from '../battle/map';
import type { BattleContext, BattleResult, BattleSetup, BattleUnit, Victory } from '../battle/types';
import { unitFromCharacter, unitFromEnemy } from '../battle/units';
import { generateMap } from '../mapgen/generator';
import { derive, gainXp } from '../rules/character';
import { addRollToLoot, lootName, rollDrops } from '../rules/drops';
import { ambushMult, imprison, studiedSpecies } from './base';
import { delayVeil } from './veil';
import { huntedSpecies } from './capital_services';
import { afterBattle } from './loyalty';
import { recordBattle } from './telemetry';
import { battleDifficulty, difficultyOf } from './difficulty';
import { ensureTrait } from './traits';
import { bondName, bondsAfterBattle, forgetBonds } from './bonds';
import { addChronicle, chronicleBattle } from './chronicle';
import { applyRivalResult, maybeRival } from './rival';
import { makeCharacter, newId } from '../rules/recruit';
import { NOVICE_LEVEL, woundDays } from '../rules/stats';
import {
  addLog,
  campaignRng,
  dropLostCache,
  lostCacheHours,
  disbandIfEmpty,
  fitMembers,
  giveItem,
  atBase,
  members,
  removeFromSquads,
  squadById,
  allContracts,
  timeOfDayOf,
  type Campaign,
  type Contract,
  type Squad,
} from './campaign';
import { node } from './layout';
import { baseBiomes, isDistant, type Region } from './regions';
import { forceIcon, forceLabel, removeForce, type Force } from './forces';
import { FATIGUE, huntRations, isTired } from './logistics';
import { battleInProvince, contractDonePolitics } from './commander';
import { APPROVAL, approvalState } from './politics';
import CMD from '../data/world/commander.json';
import { CAPTAIN_SKILLS, captainHas, captainHunt, captainNegotiate } from './captains';

const PREP = CMD.prep;

/** Chance de encontro ao passar por um ponto de passagem (provisória). */
/** Chance por ponto de passagem (o mapa ampliado tem mais pontos por viagem). */
export const ENCOUNTER_CHANCE = 0.22;

export const ENCOUNTER_TIERS: { tier: Rarity; chance: number; levelOffset: number; label: string }[] = [
  { tier: 'comum', chance: 0.84, levelOffset: 0, label: 'Comum' },
  { tier: 'raro', chance: 0.1, levelOffset: 5, label: 'Raro' },
  { tier: 'epico', chance: 0.05, levelOffset: 10, label: 'Épico' },
  { tier: 'lendario', chance: 0.01, levelOffset: 15, label: 'Lendário' },
];

export const RARITY_LABEL: Record<Rarity, string> = { comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário' };
export const RARITY_COLOR: Record<Rarity, string> = { comum: '#cfd8dc', raro: '#4fc3f7', epico: '#ce93d8', lendario: '#ffb300' };

export interface EncounterPlan {
  tier: Rarity;
  level: number;
  biome: Region;
  enemies: { id: string; level: number }[];
  ambush: boolean;
  gold: number;
  drops: string[];
  description: string;
}

/** Folga de nível: uma fera pode aparecer até este tanto acima do nível do encontro. */
export const LEVEL_SLACK = 3;

/** Folga que vale no nível: 0 para novatos, 1 a cada 4 níveis depois, até LEVEL_SLACK. */
export function levelSlack(level: number): number {
  return level <= NOVICE_LEVEL ? 0 : Math.min(LEVEL_SLACK, Math.floor(level / 4));
}
const TIER_ORDER: Rarity[] = ['comum', 'raro', 'epico', 'lendario'];

/**
 * Feras da região e da raridade; com `level`, só as cuja faixa começa até o nível (+ folga).
 * Transição: as próprias + as dos dois biomas vizinhos. Bioma distante: só as próprias (as do bioma
 * de origem entram se faltar alguma daquela raridade).
 */
export function beastsOf(region: Region, tier: Rarity, level?: number): EnemyDef[] {
  const fits = (e: EnemyDef) => e.kind === 'beast' && !e.summonOnly && e.tier === tier && (level === undefined || (e.levelMin ?? 1) <= level + levelSlack(level));
  const own = Object.values(DB.enemies).filter((e) => fits(e) && !!e.regions?.includes(region));
  if (isDistant(region) && own.length) return own;
  const bases = baseBiomes(region);
  const base = Object.values(DB.enemies).filter((e) => fits(e) && !e.regions?.length && (e.biomes === 'all' || bases.some((b) => (e.biomes as Biome[]).includes(b))));
  return [...own, ...base];
}

/** Nível mínimo dos encontros na região (terras distantes são perigosas). */
export function regionFloor(region: Region): number {
  if (!isDistant(region)) return 1;
  const own = Object.values(DB.enemies).filter((e) => e.regions?.includes(region) && e.tier === 'comum');
  return own.length ? Math.min(...own.map((e) => e.levelMin ?? 1)) : 1;
}

/** Líder de um encontro: a raridade pedida ou, se nenhuma fera dela cabe no nível, a mais alta abaixo. */
export function pickLeader(rng: Rng, biome: Region, tier: Rarity, level: number): EnemyDef | undefined {
  for (let i = TIER_ORDER.indexOf(tier); i >= 1; i--) {
    const list = beastsOf(biome, TIER_ORDER[i]!, level);
    if (list.length) return rng.pick(list);
  }
  return undefined;
}

const HUMANS = ['bandido', 'rebelde_guerreiro', 'rebelde_arqueiro', 'rebelde_mago', 'rebelde_clerigo'];

export function rollTier(rng: Rng): (typeof ENCOUNTER_TIERS)[number] {
  let r = rng.next();
  for (const t of ENCOUNTER_TIERS) {
    if (r < t.chance) return t;
    r -= t.chance;
  }
  return ENCOUNTER_TIERS[0]!;
}

export function squadLevel(c: Campaign, s: Squad): number {
  const fit = fitMembers(c, s);
  return fit.length ? Math.max(1, Math.round(fit.reduce((a, m) => a + m.level, 0) / fit.length)) : 1;
}

/** Monta um encontro aleatório no nível médio do esquadrão, conforme o bioma. */
export function planEncounter(rng: Rng, biome: Region, baseLevel: number, forcedTier?: Rarity, opts: { beastsOnly?: boolean } = {}): EncounterPlan {
  const tierInfo = forcedTier ? ENCOUNTER_TIERS.find((t) => t.tier === forcedTier)! : rollTier(rng);
  const level = Math.max(1, regionFloor(biome), baseLevel + tierInfo.levelOffset);
  const novice = baseLevel <= NOVICE_LEVEL;
  const enemies: { id: string; level: number }[] = [];
  const commons = beastsOf(biome, 'comum', level);
  let humans = false;
  let actualTier = tierInfo.tier;
  const leader = (tier: Rarity) => {
    const def = pickLeader(rng, biome, tier, level);
    if (def) {
      actualTier = def.tier;
      return def.id;
    }
    return rng.pick(HUMANS);
  };
  switch (tierInfo.tier) {
    case 'comum':
      if ((!opts.beastsOnly && rng.chance(0.5)) || !commons.length) {
        humans = true;
        const n = novice ? rng.int(2, 3) : rng.int(3, 4);
        for (let i = 0; i < n; i++) enemies.push({ id: rng.pick(HUMANS), level: Math.max(1, level + rng.int(-1, 0)) });
      } else {
        const n = novice ? rng.int(2, 3) : rng.int(2, 4);
        for (let i = 0; i < n; i++) enemies.push({ id: rng.pick(commons).id, level });
      }
      break;
    case 'raro':
      enemies.push({ id: leader('raro'), level });
      for (let i = 0; i < 2; i++) enemies.push({ id: commons.length ? rng.pick(commons).id : rng.pick(HUMANS), level: level - 3 });
      break;
    case 'epico':
      enemies.push({ id: leader('epico'), level });
      for (let i = 0; i < 2; i++) enemies.push({ id: commons.length ? rng.pick(commons).id : rng.pick(HUMANS), level: level - 5 });
      break;
    case 'lendario':
      enemies.push({ id: leader('lendario'), level });
      enemies.push({ id: commons.length ? rng.pick(commons).id : rng.pick(HUMANS), level: level - 8 });
      break;
  }
  const goldMult = { comum: 1, raro: 2, epico: 4, lendario: 10 }[actualTier];
  const drops: string[] = [];
  const itemsOf = (r: Rarity) => Object.values(DB.items).filter((i) => i.rarity === r && i.slot !== 'utility');
  if (actualTier === 'comum' && rng.chance(0.15)) drops.push(rng.pick(itemsOf('comum')).id);
  if (actualTier === 'raro' && rng.chance(0.35)) drops.push(rng.pick(itemsOf('raro')).id);
  if (actualTier === 'epico') drops.push(rng.pick(rng.chance(0.4) ? itemsOf('epico') : itemsOf('raro')).id);
  if (actualTier === 'lendario') drops.push(rng.chance(0.5) ? 'olho_profetico' : 'lamina_do_farol');
  const ambush = !novice && rng.chance(humans ? 0.35 : 0.2);
  const names = enemies.map((e) => DB.enemies[e.id]?.name ?? e.id);
  return {
    tier: actualTier,
    level,
    biome,
    enemies,
    ambush,
    gold: Math.round((30 + level * 8) * goldMult),
    drops,
    description: `${ambush ? 'Emboscada! ' : ''}${[...new Set(names)].join(', ')} (nível ${level}, ${RARITY_LABEL[actualTier]})`,
  };
}

export function rollEncounter(c: Campaign, s: Squad): EncounterPlan | null {
  const n = node(s.at);
  if (n.type !== 'waypoint') return null;
  const rng = campaignRng(c);
  // Fora da estrada: mais feras, quase nenhuma patrulha (C3).
  if (!rng.chance(ENCOUNTER_CHANCE * (s.offroad ? 1.25 : 1))) return null;
  const plan = planEncounter(rng, n.region, Math.max(1, squadLevel(c, s) + difficultyOf(c).levelOffset), undefined, { beastsOnly: !!s.offroad });
  if (c.hunt) applyHunt(c, rng, plan);
  // Batedores do esconderijo (Silvânia): parte das emboscadas é descoberta a tempo.
  if (plan.ambush && !rng.chance(ambushMult(c))) plan.ambush = false;
  return plan;
}

/**
 * Caçada aberta: garante pelo menos uma da espécie caçada no encontro (troca um dos lacaios,
 * ou entra junto se o grupo for pequeno). A caçada se fecha.
 */
export function applyHunt(c: Campaign, rng: Rng, plan: EncounterPlan): void {
  const species = c.hunt;
  delete c.hunt;
  if (!species || !DB.enemies[species]) return;
  if (!plan.enemies.some((e) => e.id === species)) {
    const prey = { id: species, level: plan.level };
    // O líder (primeiro em encontros raros ou melhores) fica; troca um lacaio.
    const from = plan.tier === 'comum' ? 0 : 1;
    if (plan.enemies.length > from && plan.enemies.length >= 3) plan.enemies[rng.int(from, plan.enemies.length - 1)] = prey;
    else plan.enemies.push(prey);
  }
  const name = DB.enemies[species]!.name;
  plan.description = `🏹 Caçada: ${name}! ${plan.description}`;
  addLog(c, `🏹 A caçada encontrou o rastro: ${name} à vista.`);
}

function enemyUnits(rng: Rng, list: { id: string; level: number }[]): BattleUnit[] {
  return list.map((e) => unitFromEnemy(DB.enemies[e.id]!, Math.max(1, e.level), rng));
}

export function playerUnits(c: Campaign, s: Squad): BattleUnit[] {
  // Companheiro da história com aprovação no fundo se recusa a lutar (C16).
  return fitMembers(c, s).filter((m) => approvalState(c, m.storyId) !== 'recusa').map((m) => {
    ensureTrait(m);
    const u = unitFromCharacter(m, 'player');
    // Cansado (C22): barra de ação mais lenta e mira pior; com fome, começa enfraquecido (C9).
    if (isTired(m)) {
      u.attrs.spd = Math.max(1, u.attrs.spd - Math.max(1, Math.round(u.attrs.spd * (1 - FATIGUE.tiredSpeed))));
      u.accuracy -= FATIGUE.tiredAccuracy;
    }
    if ((s.hungry ?? 0) > 0) u.statuses.enfraquecido = 2;
    // Confiança no comandante (aprovação alta): mira e crítico melhores.
    if (approvalState(c, m.storyId) === 'confia') {
      u.accuracy += APPROVAL.trustAccuracy;
      u.crit += APPROVAL.trustCrit;
    }
    // Capitão com Inspirar (C19): aura no esquadrão inteiro.
    if (captainHas(c, s, 'inspirar')) {
      u.accuracy += CAPTAIN_SKILLS.inspirar.accuracy!;
      u.crit += CAPTAIN_SKILLS.inspirar.crit!;
    }
    return u;
  });
}

export function encounterSetup(c: Campaign, s: Squad, plan: EncounterPlan, map?: BattleMap): BattleSetup {
  const rng = campaignRng(c);
  const seed = rng.int(1, 1e9);
  return {
    map: map ?? generateMap({ biome: plan.biome, seed, w: rng.int(12, 15), h: rng.int(12, 15) }),
    players: playerUnits(c, s),
    enemies: [...enemyUnits(rng, plan.enemies), ...[maybeRival(c, seed, plan.level)].filter((x): x is BattleUnit => !!x)],
    victory: { type: 'eliminate' },
    ambush: plan.ambush,
    canFlee: true,
    seed,
    studied: studiedSpecies(c),
    hunted: huntedSpecies(c),
    difficulty: battleDifficulty(c),
    timeOfDay: timeOfDayOf(c),
    // À noite, sem emboscada inimiga: o esquadrão começa oculto e os inimigos patrulham desavisados.
    stealthStart: timeOfDayOf(c) === 'noite' && !plan.ambush,
    patrol: timeOfDayOf(c) === 'noite' && !plan.ambush,
    context: {
      kind: 'encounter',
      noPermadeath: !difficultyOf(c).permadeath,
      squadId: s.id,
      tier: plan.tier,
      baseXp: 30 + plan.level * 6,
      gold: plan.gold,
      itemDrops: plan.drops,
      title: `${timeOfDayOf(c) === 'dia' ? '☀' : '🌙'} Encontro ${RARITY_LABEL[plan.tier].toLowerCase()} — ${plan.description}`,
    },
  };
}

/** Peças especiais de cada tipo de missão (Interagir, VIP, rodadas, início escondido). */
function missionPieces(rng: Rng, contract: Contract): Pick<BattleSetup, 'objectives' | 'vip' | 'stealthStart' | 'roundLimit'> {
  switch (contract.mission) {
    case 'roubo':
      return { stealthStart: true, objectives: [{ kind: 'documentos', label: 'Roubar documentos', turns: 2 }] };
    case 'runas':
      return { roundLimit: 10, objectives: [{ kind: 'runas', label: 'Apagar as runas', turns: 2 }] };
    case 'suprimentos':
      return { roundLimit: 8, objectives: [1, 2, 3].map(() => ({ kind: 'bau' as const, label: 'Pegar suprimentos', turns: 1 })) };
    case 'resgate': {
      const ch = makeCharacter(rng, { classId: 'aprendiz', level: Math.max(1, contract.level - 2) });
      ch.name = `${ch.name} (preso)`;
      return { stealthStart: true, objectives: [{ kind: 'cela', label: 'Abrir a cela', turns: 1 }], vip: { unit: unitFromCharacter(ch, 'player'), captive: true } };
    }
    default:
      return {};
  }
}

export type Approach = 'atacar' | 'emboscar' | 'cercar' | 'defender';

/**
 * Batalha contra uma força do mapa (C11) com o preparo escolhido (C14): emboscar deixa os inimigos
 * desavisados; cercar impede a fuga (e rende mais); defender = a força chegou até o esquadrão.
 */
export function forceSetup(c: Campaign, s: Squad, f: Force, approach: Approach): BattleSetup {
  const rng = campaignRng(c);
  const seed = rng.int(1, 1e9);
  const n = node(s.at);
  const gold = Math.round((40 + f.level * 10) * f.units.length * 0.5 * (approach === 'cercar' ? 1 + PREP.encircleReward : 1));
  const surprise = approach === 'emboscar';
  return {
    map: generateMap({ biome: n.region, seed, w: rng.int(13, 15), h: rng.int(12, 14) }),
    players: playerUnits(c, s),
    enemies: enemyUnits(rng, f.units.map((id) => ({ id, level: f.level }))),
    victory: { type: 'eliminate' },
    ambush: approach === 'defender' && rng.chance(0.5),
    canFlee: true,
    seed,
    studied: studiedSpecies(c),
    hunted: huntedSpecies(c),
    difficulty: battleDifficulty(c),
    timeOfDay: timeOfDayOf(c),
    stealthStart: surprise,
    patrol: surprise,
    context: {
      kind: 'encounter',
      noPermadeath: !difficultyOf(c).permadeath,
      squadId: s.id,
      forceId: f.id,
      encircled: approach === 'cercar',
      baseXp: 40 + f.level * 7,
      gold,
      itemDrops: [],
      title: `${forceIcon(f)} ${forceLabel(f)} — ${n.type === 'waypoint' ? 'na estrada' : n.name}`,
    },
  };
}

/** Pode emboscar: precisa de batedor (arqueiro ou ladino apto) e de noite ou fora da estrada. */
export function canAmbush(c: Campaign, s: Squad): boolean {
  // O capitão com Olho de batedor faz as vezes do batedor.
  const scout = captainHas(c, s, 'olho_de_batedor') || fitMembers(c, s).some((m) => m.classId === 'arqueiro' || m.classId === 'ladrao');
  return scout && (timeOfDayOf(c) === 'noite' || !!s.offroad);
}

/** Chance de negociar com a força (INT do melhor negociador do esquadrão). */
export function negotiateChance(c: Campaign, s: Squad, f: Force): number {
  if (f.owner === 'vazio' || f.kind === 'bando') return 0;
  const best = Math.max(0, ...fitMembers(c, s).map((m) => m.attrs.int));
  return Math.round(Math.max(5, Math.min(85, PREP.negotiateBase + best * PREP.negotiatePerInt - f.level + captainNegotiate(c, s))));
}

export function contractSetup(c: Campaign, s: Squad, contract: Contract): BattleSetup {
  const rng = campaignRng(c);
  const n = node(contract.targetNode);
  const seed = rng.int(1, 1e9);
  const list: { id: string; level: number }[] = [];
  if (contract.enemyKind === 'beast') {
    const leader = pickLeader(rng, n.region, 'epico', contract.level);
    list.push({ id: leader?.id ?? rng.pick(HUMANS), level: contract.level });
    const commons = beastsOf(n.region, 'comum', contract.level).map((b) => b.id);
    for (let i = 0; i < 2; i++) list.push({ id: rng.pick(commons.length ? commons : HUMANS), level: contract.level - 2 });
  } else if (contract.forceUnits?.length) {
    // Cerco (C21): a própria força que cerca, com reforço.
    for (const id of [...contract.forceUnits, ...contract.forceUnits.slice(0, 2)]) list.push({ id, level: contract.level });
  } else {
    const count = contract.victory === 'survive' ? 6 : contract.victory === 'escape' ? 5 : 4;
    for (let i = 0; i < count; i++) list.push({ id: rng.pick(HUMANS), level: contract.level + (i === 0 ? 1 : 0) });
  }
  const victory: Victory =
    contract.victory === 'survive' ? { type: 'survive', rounds: contract.defense ? 8 : 6 } : contract.victory === 'target' ? { type: 'target' } : { type: contract.victory } as Victory;
  const pieces = missionPieces(rng, contract);
  return {
    ...pieces,
    map: generateMap({ biome: n.region, seed, w: 14, h: 14 }),
    players: playerUnits(c, s),
    enemies: enemyUnits(rng, list),
    victory,
    ambush: false,
    canFlee: true,
    seed,
    studied: studiedSpecies(c),
    hunted: huntedSpecies(c),
    difficulty: battleDifficulty(c),
    context: {
      kind: 'contract',
      noPermadeath: !difficultyOf(c).permadeath,
      squadId: s.id,
      contractId: contract.id,
      baseXp: contract.rewardXp,
      gold: contract.rewardGold,
      itemDrops: contract.rewardItem ? [contract.rewardItem] : [],
      title: contract.title,
    },
  };
}

export interface ResultSummary {
  lines: string[];
  levelUps: string[];
  dead: string[];
}

/** Aplica o resultado da batalha à campanha: XP, mortes, ferimentos, itens, ouro, contrato. */
export function applyBattleResult(c: Campaign, result: BattleResult): ResultSummary {
  const summary: ResultSummary = { lines: [], levelUps: [], dead: [] };
  recordBattle(c, result);
  const rivalLine = applyRivalResult(c, result);
  if (rivalLine) summary.lines.push(rivalLine);
  const s = squadById(c, result.context.squadId);
  const ctx: BattleContext = result.context;
  const victory = result.outcome === 'victory';
  // Dificuldade História: o herói caído é resgatado, com um ferimento longo.
  if (ctx.noPermadeath)
    for (const u of result.units)
      if (!u.alive && c.roster[u.charId]) {
        u.alive = true;
        u.hp = 1;
        u.lowHp = 0;
        summary.lines.push(`${c.roster[u.charId]!.name} caiu, mas foi resgatado inconsciente.`);
      }
  // Traição: o herói que passou para o inimigo deixa a resistência (vivo ou morto).
  for (const u of result.units.filter((x) => x.betrayed && c.roster[x.charId])) {
    const ch = c.roster[u.charId]!;
    summary.lines.push(u.alive ? `🗡 ${ch.name} traiu a resistência e fugiu com o inimigo.` : `🗡 ${ch.name} traiu a resistência e caiu como traidor.`);
    addChronicle(c, { text: `${ch.name} traiu a resistência em ${ctx.title} (lealdade ${Math.round(ch.loyalty ?? 0)}).`, who: [ch.id], kind: 'historia' });
    removeFromSquads(c, ch.id);
    forgetBonds(c, ch.id);
    delete c.roster[ch.id];
  }
  // Vínculos e crônica (antes de tirar os mortos do elenco).
  const bondEvents = bondsAfterBattle(c, result);
  chronicleBattle(c, result, bondEvents, ctx.title);
  for (const e of bondEvents) {
    const a = c.roster[e.a]?.name;
    const b = c.roster[e.b]?.name;
    if (e.kind === 'up') summary.lines.push(`🤝 ${a} e ${b} agora são ${bondName(e.level!)}.`);
    else summary.lines.push(`💔 ${a} perdeu ${b}${e.killer?.enemyId ? ` e jurou vingança contra ${e.killer.name}` : ''}.`);
  }
  const allyDeaths = result.units.filter((u) => !u.alive && c.roster[u.charId]).length;
  for (const u of result.units) {
    const ch = c.roster[u.charId];
    if (!ch) continue;
    ch.equipment.utility = u.items.slice(0, 3);
    if (!u.alive) {
      summary.dead.push(ch.name);
      // Itens do morto seguem com o esquadrão (se ele sobreviver).
      if (s) {
        for (const id of [ch.equipment.weapon, ch.equipment.offhand, ch.equipment.armor, ch.equipment.accessory, ...ch.equipment.utility])
          if (id) giveItem(s.carried, id);
        s.memberIds = s.memberIds.filter((m) => m !== ch.id);
      }
      delete c.roster[ch.id];
      continue;
    }
    ch.hp = u.hp;
    ch.mp = u.mp;
    ch.kills += u.kills;
    // Ferimento: quem caiu abaixo de 50% da vida em algum momento da luta (mesmo curado depois).
    const lowest = Math.min(u.lowHp ?? u.hp, u.hp) / Math.max(1, u.maxHp ?? derive(ch).maxHp);
    const days = Math.round(woundDays(lowest) * difficultyOf(c).woundMult);
    if (days > 0) {
      ch.woundDays = Math.max(ch.woundDays, days);
      summary.lines.push(`${ch.name} ficou ferido por ${ch.woundDays} dias (chegou a ${Math.round(lowest * 100)}% da vida).`);
    }
    const xp = (victory ? ctx.baseXp : 0) + u.killXp;
    let levels = 0;
    if (xp > 0) {
      levels = gainXp(ch, xp);
      summary.lines.push(`${ch.name}: +${xp} XP${u.kills ? ` (${u.kills} abate${u.kills > 1 ? 's' : ''})` : ''}`);
      if (levels) summary.levelUps.push(`${ch.name} subiu para o nível ${ch.level}!`);
    }
    afterBattle(ch, { victory, levels, allyDeaths });
  }
  // Rendidos vão para a Prisão (se houver vaga), mesmo sem vitória completa.
  for (const p of result.captured ?? []) {
    const msg = imprison(c, { id: newId('preso', campaignRng(c)), enemyId: p.enemyId, name: p.name, level: p.level });
    summary.lines.push(msg);
    addLog(c, msg);
  }
  // Abates por espécie (contam mesmo sem vitória) e drops das feras (só na vitória).
  for (const id of result.defeated ?? []) c.speciesKills[id] = (c.speciesKills[id] ?? 0) + 1;
  if (victory) {
    const loot: Record<string, number> = {};
    const rng = campaignRng(c);
    for (const id of result.defeated ?? []) addRollToLoot(loot, id, rollDrops(DB.creatures[id]?.drops, rng));
    if (Object.keys(loot).length) {
      const bag = s && c.squads.includes(s) && !atBase(c, s) ? s.loot : c.materials;
      for (const [k, n] of Object.entries(loot)) giveItem(bag, k, n);
      const jewels = Object.keys(loot).filter((k) => k.startsWith('joia:'));
      summary.lines.push(`Espólio: ${Object.entries(loot).filter(([k]) => !k.startsWith('joia:')).map(([k, n]) => `${lootName(k)} ×${n}`).join(', ')}`);
      for (const k of jewels) summary.lines.push(`💎 ${lootName(k)}!`);
    }
  }
  if (s && s.memberIds.length === 0) {
    const fled = (s.escort ?? []).map((id) => c.roster[id]?.name).filter(Boolean);
    if (fled.length) summary.lines.push(`Os escoltados (${fled.join(', ')}) escaparam e voltaram à base.`);
    const cache = dropLostCache(c, s);
    summary.lines.push(cache ? `${s.name} foi dizimado. Os itens ficaram em ${node(cache.nodeId).name}: outro esquadrão pode recuperá-los em até ${lostCacheHours() / 24} dias.` : `${s.name} foi dizimado.`);
    c.squads = c.squads.filter((x) => x !== s);
  }
  if (victory) {
    c.gold += ctx.gold;
    summary.lines.push(`+${ctx.gold} ouro`);
    for (const id of ctx.itemDrops) {
      if (s && c.squads.includes(s) && !atBase(c, s)) giveItem(s.carried, id);
      else giveItem(c.inventory, id);
      summary.lines.push(`Item obtido: ${DB.items[id]?.name ?? id}`);
    }
    if (ctx.contractId) {
      const ct = allContracts(c).find((x) => x.id === ctx.contractId);
      if (ct) {
        ct.status = 'done';
        for (const l of contractDonePolitics(c, ct)) summary.lines.push(l);
      }
      if (ct?.delay) summary.lines.push(`🜏 O Véu recua ${delayVeil(c, ct.delay)} (agora ${c.veil!.value}/100).`);
    }
  }
  // Camada de comandante: território da província, força interceptada, fadiga e caça (D126).
  if (s && c.squads.includes(s)) {
    battleInProvince(c, s.at, victory);
    for (const id of s.memberIds) {
      const ch = c.roster[id];
      if (ch) ch.fatigue = Math.min(100, (ch.fatigue ?? 0) + FATIGUE.battle);
    }
    if (victory) {
      const beasts = (result.defeated ?? []).filter((id) => DB.enemies[id]?.kind === 'beast').length;
      const meat = beasts ? huntRations(s, s.memberIds.length, beasts * captainHunt(c, s)) : 0;
      if (meat) summary.lines.push(`🍖 Caça: +${meat} rações.`);
    }
  }
  if (ctx.forceId) {
    const f = (c.world?.forces ?? []).find((x) => x.id === ctx.forceId);
    if (f && victory) {
      if (!ctx.encircled && campaignRng(c).chance(CMD.forces.fleeChance) && f.units.length > 2) {
        f.units = f.units.slice(0, Math.ceil(f.units.length / 2));
        summary.lines.push(`${forceLabel(f)} recuou com o que sobrou (${f.units.length}).`);
      } else {
        removeForce(c, f.id);
        summary.lines.push(`${forceLabel(f)} foi destruída.`);
      }
    }
  }
  if (s && members(c, s).length === 0) disbandIfEmpty(c);
  addLog(c, `${ctx.title}: ${result.outcome === 'victory' ? 'vitória' : result.outcome === 'fled' ? 'fuga' : 'derrota'}.`);
  return summary;
}
