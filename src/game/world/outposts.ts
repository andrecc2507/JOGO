import EXP from '../data/world/expedition.json';
import { node, nodeOpen, worldGraph } from './layout';
import { playerSide } from './forces';
import { provinceOf } from './provinces';
import { provinceState, reveal } from './territory';
import { spendIntel } from './politics';
import type { Campaign, Squad } from './campaign';

/**
 * Postos avançados (C18): torre de vigia, depósito, enfermaria de campo, refúgio e passagem
 * rúnica. Constrói-se com um esquadrão no lugar, em terra aliada ou livre; cada posto custa
 * manutenção no fim do mês e pode ser saqueado por forças inimigas.
 */
export const OUTPOSTS = EXP.outposts;
export type OutpostKind = keyof typeof OUTPOSTS.kinds;
export const OUTPOST_KINDS = OUTPOSTS.kinds as Record<OutpostKind, { label: string; icon: string; cost: number; upkeep: number; from: number; text: string; jumpIntel?: number }>;

function chapter(c: Campaign): number {
  return c.story?.chapter ?? 0;
}

export function outpostAt(c: Campaign, nodeId: string): OutpostKind | undefined {
  return c.outposts?.[nodeId];
}

export function outpostCount(c: Campaign): number {
  return Object.keys(c.outposts ?? {}).length;
}

/** Quantos postos o comandante sustenta neste capítulo. */
export function outpostLimit(c: Campaign): number {
  return Math.floor(OUTPOSTS.base + chapter(c) * OUTPOSTS.perChapter);
}

/** Por que não dá para construir aqui (ou null se dá). */
export function buildBlock(c: Campaign, s: Squad, kind: OutpostKind): string | null {
  const def = OUTPOST_KINDS[kind];
  const n = node(s.at);
  if (s.to) return 'O esquadrão precisa estar parado no lugar.';
  if (chapter(c) < def.from) return `Disponível a partir do capítulo ${def.from}.`;
  if (n.type === 'capital' || n.type === 'citadel' || n.type === 'dungeon' || n.type === 'lair' || n.sea) return 'Não dá para construir aqui.';
  if (outpostAt(c, s.at)) return 'Já há um posto aqui.';
  if (outpostCount(c) >= outpostLimit(c)) return `Limite de ${outpostLimit(c)} postos neste capítulo.`;
  const owner = provinceState(c, provinceOf(s.at)).owner;
  if (!playerSide(chapter(c)).includes(owner) && owner !== 'livre') return 'Só em terra aliada ou livre.';
  if (c.gold < def.cost) return `Custa ${def.cost} ouro.`;
  return null;
}

export function buildOutpost(c: Campaign, s: Squad, kind: OutpostKind): boolean {
  if (buildBlock(c, s, kind)) return false;
  c.gold -= OUTPOST_KINDS[kind].cost;
  (c.outposts ??= {})[s.at] = kind;
  if (kind === 'torre') watchFrom(c, s.at);
  return true;
}

/** Torre: a província e as vizinhas ficam com a informação em dia. */
function watchFrom(c: Campaign, nodeId: string): void {
  reveal(c, nodeId, chapter(c));
  for (const nb of worldGraph().adj[nodeId] ?? []) reveal(c, nb, chapter(c));
}

/** Todo dia as torres renovam a informação da área. */
export function outpostsDay(c: Campaign): void {
  for (const [id, kind] of Object.entries(c.outposts ?? {})) if (kind === 'torre') watchFrom(c, id);
}

/** Manutenção do mês: o que não for pago é abandonado. */
export function outpostsMonth(c: Campaign): string[] {
  const out: string[] = [];
  let total = 0;
  for (const [id, kind] of Object.entries(c.outposts ?? {})) {
    const cost = OUTPOST_KINDS[kind].upkeep;
    if (c.gold >= cost) {
      c.gold -= cost;
      total += cost;
    } else {
      delete c.outposts![id];
      out.push(`🏚 Sem ouro para manter: ${OUTPOST_KINDS[kind].label} em ${node(id).name} foi abandonado.`);
    }
  }
  if (total) out.unshift(`🏕 Manutenção dos postos avançados: −${total} ouro.`);
  return out;
}

/** Uma força inimiga saqueou o lugar: o posto cai. */
export function raidOutpost(c: Campaign, nodeId: string): string | null {
  const kind = outpostAt(c, nodeId);
  if (!kind) return null;
  delete c.outposts![nodeId];
  return `🔥 ${OUTPOST_KINDS[kind].label} em ${node(nodeId).name} foi destruído.`;
}

/** Passagens rúnicas abertas para onde o esquadrão pode saltar. */
export function runeDestinations(c: Campaign, s: Squad): string[] {
  if (s.to || outpostAt(c, s.at) !== 'passagem') return [];
  return Object.entries(c.outposts ?? {})
    .filter(([id, k]) => k === 'passagem' && id !== s.at && nodeOpen(node(id), chapter(c)))
    .map(([id]) => id);
}

/** Salto instantâneo entre passagens rúnicas (custa informação). */
export function runeJump(c: Campaign, s: Squad, dest: string): boolean {
  if (!runeDestinations(c, s).includes(dest) || !spendIntel(c, OUTPOST_KINDS.passagem.jumpIntel ?? 0)) return false;
  s.at = dest;
  s.route = [];
  s.progress = 0;
  return true;
}
