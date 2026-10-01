import { Rng } from '@core';
import { DB, type Biome, type EnemyDef, type Rarity } from '../data';
import type { BattleMap } from '../battle/map';
import type { BattleContext, BattleResult, BattleSetup, BattleUnit, Victory } from '../battle/types';
import { unitFromCharacter, unitFromEnemy } from '../battle/units';
import { generateMap } from '../mapgen/generator';
import { derive, gainXp } from '../rules/character';
import { NOVICE_LEVEL } from '../rules/stats';
import {
  addLog,
  campaignRng,
  disbandIfEmpty,
  fitMembers,
  giveItem,
  atBase,
  members,
  squadById,
  allContracts,
  type Campaign,
  type Contract,
  type Squad,
} from './campaign';
import { node } from './layout';

/** Chance de encontro ao passar por um ponto de passagem (provisória). */
export const ENCOUNTER_CHANCE = 0.3;

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
  biome: Biome;
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

/** Feras do bioma e da raridade; com `level`, só as cuja faixa começa até o nível (+ folga). */
export function beastsOf(biome: Biome, tier: Rarity, level?: number): EnemyDef[] {
  return Object.values(DB.enemies).filter(
    (e) =>
      e.kind === 'beast' &&
      !e.summonOnly &&
      e.tier === tier &&
      (e.biomes === 'all' || e.biomes.includes(biome)) &&
      (level === undefined || (e.levelMin ?? 1) <= level + levelSlack(level)),
  );
}

/** Líder de um encontro: a raridade pedida ou, se nenhuma fera dela cabe no nível, a mais alta abaixo. */
export function pickLeader(rng: Rng, biome: Biome, tier: Rarity, level: number): EnemyDef | undefined {
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
export function planEncounter(rng: Rng, biome: Biome, baseLevel: number, forcedTier?: Rarity): EncounterPlan {
  const tierInfo = forcedTier ? ENCOUNTER_TIERS.find((t) => t.tier === forcedTier)! : rollTier(rng);
  const level = Math.max(1, baseLevel + tierInfo.levelOffset);
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
      if (rng.chance(0.5) || !commons.length) {
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
  if (!rng.chance(ENCOUNTER_CHANCE)) return null;
  return planEncounter(rng, n.biome, squadLevel(c, s));
}

function enemyUnits(rng: Rng, list: { id: string; level: number }[]): BattleUnit[] {
  return list.map((e) => unitFromEnemy(DB.enemies[e.id]!, Math.max(1, e.level), rng));
}

export function playerUnits(c: Campaign, s: Squad): BattleUnit[] {
  return fitMembers(c, s).map((m) => unitFromCharacter(m, 'player'));
}

export function encounterSetup(c: Campaign, s: Squad, plan: EncounterPlan, map?: BattleMap): BattleSetup {
  const rng = campaignRng(c);
  const seed = rng.int(1, 1e9);
  return {
    map: map ?? generateMap({ biome: plan.biome, seed, w: rng.int(12, 15), h: rng.int(12, 15) }),
    players: playerUnits(c, s),
    enemies: enemyUnits(rng, plan.enemies),
    victory: { type: 'eliminate' },
    ambush: plan.ambush,
    canFlee: true,
    seed,
    context: {
      kind: 'encounter',
      squadId: s.id,
      tier: plan.tier,
      baseXp: 30 + plan.level * 6,
      gold: plan.gold,
      itemDrops: plan.drops,
      title: `Encontro ${RARITY_LABEL[plan.tier].toLowerCase()} — ${plan.description}`,
    },
  };
}

export function contractSetup(c: Campaign, s: Squad, contract: Contract): BattleSetup {
  const rng = campaignRng(c);
  const n = node(contract.targetNode);
  const seed = rng.int(1, 1e9);
  const list: { id: string; level: number }[] = [];
  if (contract.enemyKind === 'beast') {
    const leader = pickLeader(rng, n.biome, 'epico', contract.level);
    list.push({ id: leader?.id ?? rng.pick(HUMANS), level: contract.level });
    const commons = beastsOf(n.biome, 'comum', contract.level).map((b) => b.id);
    for (let i = 0; i < 2; i++) list.push({ id: rng.pick(commons.length ? commons : HUMANS), level: contract.level - 2 });
  } else {
    const count = contract.victory === 'survive' ? 6 : contract.victory === 'escape' ? 5 : 4;
    for (let i = 0; i < count; i++) list.push({ id: rng.pick(HUMANS), level: contract.level + (i === 0 ? 1 : 0) });
  }
  const victory: Victory =
    contract.victory === 'survive' ? { type: 'survive', rounds: 6 } : contract.victory === 'target' ? { type: 'target' } : { type: contract.victory } as Victory;
  return {
    map: generateMap({ biome: n.biome, seed, w: 14, h: 14 }),
    players: playerUnits(c, s),
    enemies: enemyUnits(rng, list),
    victory,
    ambush: false,
    canFlee: true,
    seed,
    context: {
      kind: 'contract',
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
  const s = squadById(c, result.context.squadId);
  const ctx: BattleContext = result.context;
  const victory = result.outcome === 'victory';
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
    const lost = (derive(ch).maxHp - u.hp) / derive(ch).maxHp;
    if (lost >= 0.5) {
      ch.woundDays = Math.max(ch.woundDays, Math.ceil(lost * 6));
      summary.lines.push(`${ch.name} ficou ferido por ${ch.woundDays} dias.`);
    }
    const xp = (victory ? ctx.baseXp : 0) + u.killXp;
    if (xp > 0) {
      const levels = gainXp(ch, xp);
      summary.lines.push(`${ch.name}: +${xp} XP${u.kills ? ` (${u.kills} abate${u.kills > 1 ? 's' : ''})` : ''}`);
      if (levels) summary.levelUps.push(`${ch.name} subiu para o nível ${ch.level}!`);
    }
  }
  if (s && s.memberIds.length === 0) {
    summary.lines.push(`${s.name} foi dizimado. Os itens que carregava se perderam.`);
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
      if (ct) ct.status = 'done';
    }
  }
  if (s && members(c, s).length === 0) disbandIfEmpty(c);
  addLog(c, `${ctx.title}: ${result.outcome === 'victory' ? 'vitória' : result.outcome === 'fled' ? 'fuga' : 'derrota'}.`);
  return summary;
}
