import type { Rng } from '@core';
import EXP from '../data/world/expedition.json';
import LEGENDS from '../data/world/legends.json';
import { DB } from '../data';
import { node, nodeOpen, places, type WorldNode } from './layout';
import { isDistant, type Distant } from './regions';
import { unlockCodex } from './story';
import { addIntel } from './politics';
import type { Campaign, Squad } from './campaign';

/**
 * Terras distantes (C5, C25, C26): primeira visita rende informação, ouro, códice e uma ficha do
 * bestiário; pistas de lenda (tavernas e eventos) revelam a fera lendária do covil; mapas do
 * tesouro apontam um esconderijo numa terra distante. O estado das masmorras também vive aqui.
 */
export const EXPLORATION = EXP.exploration;
export type LegendRegion = keyof typeof LEGENDS.regions;
export const LEGEND_REGIONS = LEGENDS.regions as Record<LegendRegion, (typeof LEGENDS.regions)[LegendRegion]>;

export interface DungeonState {
  /** Próximo andar (0 = entrada). */
  floor: number;
  cleared?: boolean;
  /** Acampamento já usado nesta descida. */
  camped?: boolean;
}

export interface ExpeditionState {
  visited: string[];
  /** Regiões com pista da lenda (a fera do covil pode ser encontrada). */
  clues: string[];
  /** Lugares cuja lenda já foi vencida (covil ou masmorra). */
  legends: string[];
  dungeons: Record<string, DungeonState>;
  /** Esconderijo apontado por um mapa do tesouro. */
  treasure?: string;
}

export function ensureExpedition(c: Campaign): ExpeditionState {
  c.expedition ??= { visited: [], clues: [], legends: [], dungeons: {} };
  return c.expedition;
}

/** Região distante de um lugar (`pantano_vila` → `pantano`); nada para o reino e o continente. */
export function legendRegionOf(n: WorldNode): LegendRegion | null {
  if (n.realm !== 'distante') return null;
  const rid = n.id.replace(/_(vila|covil|masmorra)$/, '');
  return rid in LEGEND_REGIONS ? (rid as LegendRegion) : null;
}

function chapter(c: Campaign): number {
  return c.story?.chapter ?? 0;
}

/** Chegada a um lugar: primeira visita às terras de fora e tesouro escondido. */
export function arriveExpedition(c: Campaign, s: Squad, nodeId: string, rng: Rng): string[] {
  const e = ensureExpedition(c);
  const n = node(nodeId);
  const out: string[] = [];
  if (n.realm !== 'reino' && n.type !== 'waypoint' && !e.visited.includes(nodeId)) {
    e.visited.push(nodeId);
    addIntel(c, EXPLORATION.firstVisitIntel);
    c.gold += EXPLORATION.firstVisitGold;
    out.push(`🧭 ${s.name} chegou pela primeira vez a ${n.name}: +${EXPLORATION.firstVisitIntel} de informação e ${EXPLORATION.firstVisitGold} ouro em achados.`);
    const rid = legendRegionOf(n);
    if (rid && n.type === 'village') {
      for (const id of unlockCodex(c, [`terra_${rid}`])) out.push(`📜 Códice: ${LEGEND_REGIONS[rid].codex.title}.`);
      // Ficha do bestiário: uma criatura da região fica registrada.
      const local = Object.values(DB.creatures).filter((cr) => (cr as { regions?: string[] }).regions?.includes(rid));
      if (local.length) {
        const cr = rng.pick(local);
        c.lore ??= {};
        if (!c.lore[cr.id]) {
          c.lore[cr.id] = 1;
          out.push(`📖 Ficha do bestiário: ${cr.name}.`);
        }
      }
    }
  }
  if (e.treasure === nodeId) {
    delete e.treasure;
    const gold = rng.int(EXPLORATION.treasureGold[0]!, EXPLORATION.treasureGold[1]!);
    c.gold += gold;
    const pool = Object.values(DB.items).filter((it) => it.rarity === 'epico' || it.rarity === 'raro');
    const it = rng.pick(pool);
    s.carried[it.id] = (s.carried[it.id] ?? 0) + 1;
    out.push(`💰 O mapa do tesouro estava certo: ${gold} ouro e ${it.name} em ${n.name}.`);
  }
  return out;
}

/** Um mapa do tesouro aponta um covil ou masmorra aberto (que ainda não tem tesouro marcado). */
export function giveTreasureMap(c: Campaign, rng: Rng): string {
  const e = ensureExpedition(c);
  const spots = places().filter((n) => n.realm !== 'reino' && (n.type === 'lair' || n.type === 'dungeon' || n.type === 'village') && nodeOpen(n, chapter(c)));
  if (!spots.length) return '';
  const t = rng.pick(spots);
  e.treasure = t.id;
  return `🗺 Mapa do tesouro: algo está enterrado em ${t.name}.`;
}

/** Pista de uma lenda ainda não encontrada (tavernas, eventos de viagem). */
export function giveClue(c: Campaign, rng: Rng): string {
  const e = ensureExpedition(c);
  const open = (Object.keys(LEGEND_REGIONS) as LegendRegion[]).filter(
    (rid) => !e.clues.includes(rid) && !e.legends.includes(`${rid}_covil`) && nodeOpen(node(`${rid}_covil`), chapter(c)),
  );
  if (!open.length) return '';
  const rid = rng.pick(open);
  e.clues.push(rid);
  return `🗝 Pista de lenda — ${LEGEND_REGIONS[rid].lair.title}: ${LEGEND_REGIONS[rid].lair.clue} (${node(`${rid}_covil`).name})`;
}

export function hasClue(c: Campaign, rid: LegendRegion | null): boolean {
  return !!rid && ensureExpedition(c).clues.includes(rid);
}

/** Lendas: o que falta e o que já foi vencido (diário). */
export function legendList(c: Campaign): { title: string; where: string; done: boolean; known: boolean }[] {
  const e = ensureExpedition(c);
  const out: { title: string; where: string; done: boolean; known: boolean }[] = [];
  for (const [rid, def] of Object.entries(LEGEND_REGIONS) as [LegendRegion, (typeof LEGEND_REGIONS)[LegendRegion]][]) {
    out.push({ title: def.lair.title, where: node(`${rid}_covil`).name, done: e.legends.includes(`${rid}_covil`), known: e.clues.includes(rid) });
    out.push({ title: def.dungeon.title, where: node(`${rid}_masmorra`).name, done: e.legends.includes(`${rid}_masmorra`), known: e.visited.includes(`${rid}_vila`) });
  }
  return out;
}

export { isDistant, type Distant };
