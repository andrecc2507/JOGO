import EXP from '../data/world/expedition.json';
import { DB, type Rarity } from '../data';
import type { BattleResult, BattleSetup, BattleUnit } from '../battle/types';
import { unitFromEnemy } from '../battle/units';
import { generateMap } from '../mapgen/generator';
import { derive } from '../rules/character';
import { battleDifficulty, difficultyOf } from './difficulty';
import { studiedSpecies } from './base';
import { huntedSpecies } from './capital_services';
import { beastsOf, pickLeader, playerUnits, regionFloor, squadLevel } from './encounters';
import { LEGEND_REGIONS, ensureExpedition, hasClue, legendRegionOf, type DungeonState } from './expedition';
import { node, type WorldNode } from './layout';
import { unlockCodex } from './story';
import { campaignRng, members, type Campaign, type Squad } from './campaign';

/**
 * Masmorras e covis (C6): andares em sequência com desgaste. Entre um andar e outro não há
 * descanso, só um acampamento por descida (cura parte da vida e da magia). O último andar tem o
 * chefe e o espólio único; sair no meio (ou perder) deixa o progresso pela metade. O covil é uma
 * caçada de um andar: sem pista, só feras comuns; com pista, a fera lendária.
 */
export const DUNGEON = EXP.dungeon;

export interface DungeonInfo {
  name: string;
  floors: number;
  boss: string | null;
  item: string | null;
  title: string;
}

export function isDungeonNode(n: WorldNode): boolean {
  return n.type === 'dungeon' || n.type === 'lair';
}

export function dungeonInfo(c: Campaign, nodeId: string): DungeonInfo {
  const n = node(nodeId);
  const rid = legendRegionOf(n);
  const lair = n.type === 'lair';
  const floors = lair ? DUNGEON.floors.lair : DUNGEON.floors.dungeon;
  const legend = rid ? (lair ? LEGEND_REGIONS[rid].lair : LEGEND_REGIONS[rid].dungeon) : null;
  const done = ensureExpedition(c).legends.includes(nodeId);
  // O covil só mostra a fera lendária a quem tem a pista; a lenda vencida não volta.
  const hunt = !done && (!lair || !rid || hasClue(c, rid));
  return {
    name: n.name,
    floors,
    boss: hunt ? (legend?.boss ?? `Senhor de ${n.name}`) : null,
    item: hunt ? (legend?.item ?? null) : null,
    title: legend?.title ?? n.name,
  };
}

export function dungeonState(c: Campaign, nodeId: string): DungeonState {
  const e = ensureExpedition(c);
  return (e.dungeons[nodeId] ??= { floor: 0 });
}

/** Masmorra limpa não reabre (o covil, sim: volta a ter feras). */
export function dungeonClosed(c: Campaign, nodeId: string): boolean {
  return node(nodeId).type === 'dungeon' && !!dungeonState(c, nodeId).cleared;
}

function floorLevel(c: Campaign, s: Squad, nodeId: string, floor: number): number {
  const n = node(nodeId);
  return Math.max(regionFloor(n.region), squadLevel(c, s) + DUNGEON.levelOverAverage + difficultyOf(c).levelOffset) + floor * DUNGEON.levelPerFloor;
}

/** Batalha do andar atual. */
export function dungeonSetup(c: Campaign, s: Squad, nodeId: string): BattleSetup {
  const rng = campaignRng(c);
  const n = node(nodeId);
  const st = dungeonState(c, nodeId);
  const info = dungeonInfo(c, nodeId);
  const floor = st.floor;
  const last = floor >= info.floors - 1;
  const level = floorLevel(c, s, nodeId, floor);
  const seed = rng.int(1, 1e9);
  const enemies: BattleUnit[] = [];
  const pool = (tier: Rarity) => beastsOf(n.region, tier, level);
  const count = rng.int(DUNGEON.enemiesPerFloor[0]!, DUNGEON.enemiesPerFloor[1]!) - (last && info.boss ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const list = i === 0 && floor > 0 ? pool('raro') : pool('comum');
    const def = list.length ? rng.pick(list) : rng.pick(pool('comum').length ? pool('comum') : Object.values(DB.enemies).filter((e) => e.kind === 'beast' && !e.summonOnly));
    enemies.push(unitFromEnemy(def, level - 1, rng));
  }
  if (last && info.boss) {
    const def = pickLeader(rng, n.region, DUNGEON.bossTier as Rarity, level + 2);
    if (def) {
      const u = unitFromEnemy(def, level + 2, rng);
      u.name = info.boss;
      u.maxHp = Math.round(u.maxHp * DUNGEON.bossHp);
      u.hp = u.startHp = u.maxHp;
      u.xpReward = Math.round((u.xpReward ?? 0) * DUNGEON.bossHp);
      u.boss = true;
      enemies.push(u);
    }
  }
  const gold = DUNGEON.goldPerFloor + level * DUNGEON.goldPerLevel;
  return {
    map: generateMap({ biome: n.region, seed, w: 13, h: 13 }),
    players: playerUnits(c, s),
    enemies,
    victory: { type: 'eliminate' },
    ambush: false,
    // Nas profundezas não dá para fugir; sair é entre um andar e outro.
    canFlee: false,
    seed,
    timeOfDay: 'noite',
    studied: studiedSpecies(c),
    hunted: huntedSpecies(c),
    difficulty: battleDifficulty(c),
    context: {
      kind: 'encounter',
      noPermadeath: !difficultyOf(c).permadeath,
      squadId: s.id,
      dungeon: nodeId,
      baseXp: DUNGEON.xpPerFloor + level * DUNGEON.xpPerLevel,
      gold: last && info.boss ? gold * 2 : gold,
      itemDrops: last && info.item ? [info.item] : [],
      title: `${info.title} — ${info.floors > 1 ? `andar ${floor + 1}/${info.floors}` : 'covil'}`,
    },
  };
}

export interface DungeonOutcome {
  lines: string[];
  /** Há próximo andar e o esquadrão pode descer. */
  next: boolean;
}

/** Depois da batalha de um andar (chamado após `applyBattleResult`). */
export function dungeonAfterBattle(c: Campaign, result: BattleResult): DungeonOutcome {
  const nodeId = result.context.dungeon;
  if (!nodeId) return { lines: [], next: false };
  const st = dungeonState(c, nodeId);
  const info = dungeonInfo(c, nodeId);
  const e = ensureExpedition(c);
  const out: string[] = [];
  if (result.outcome !== 'victory') {
    st.floor = Math.floor(st.floor * DUNGEON.exitKeeps);
    st.camped = false;
    out.push(`⛏ O esquadrão recuou de ${info.name}. O caminho até o andar ${st.floor + 1} continua aberto.`);
    return { lines: out, next: false };
  }
  st.floor += 1;
  if (st.floor < info.floors) {
    out.push(`⛏ Andar ${st.floor}/${info.floors} vencido. Mais fundo, o ar fica pesado.`);
    return { lines: out, next: true };
  }
  // Fim da masmorra.
  st.floor = 0;
  st.camped = false;
  if (info.boss) {
    if (!e.legends.includes(nodeId)) e.legends.push(nodeId);
    out.push(`🏆 Lenda vencida: ${info.title}!`);
    const rid = legendRegionOf(node(nodeId));
    if (rid) for (const id of unlockCodex(c, [`terra_${rid}`])) out.push(`📜 Códice: ${LEGEND_REGIONS[rid].codex.title}.`);
  }
  if (node(nodeId).type === 'dungeon') {
    st.cleared = true;
    out.push(`${info.name} está limpa.`);
  }
  return { lines: out, next: false };
}

/** Acampamento entre andares (uma vez por descida): recupera parte da vida e da magia. */
export function campRest(c: Campaign, s: Squad, nodeId: string): boolean {
  const st = dungeonState(c, nodeId);
  if (st.camped || st.floor === 0) return false;
  st.camped = true;
  for (const m of members(c, s)) {
    const d = derive(m);
    m.hp = Math.min(d.maxHp, m.hp + Math.round(d.maxHp * DUNGEON.campHeal));
    m.mp = Math.min(d.maxMp, m.mp + Math.round(d.maxMp * DUNGEON.campHeal));
  }
  return true;
}

/** Sair no meio: o progresso fica pela metade. */
export function leaveDungeon(c: Campaign, nodeId: string): void {
  const st = dungeonState(c, nodeId);
  st.floor = Math.floor(st.floor * DUNGEON.exitKeeps);
  st.camped = false;
}
