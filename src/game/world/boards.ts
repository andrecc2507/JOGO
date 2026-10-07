import type { Rng } from '@core';
import EXP from '../data/world/expedition.json';
import type { Victory } from '../battle/types';
import { node, nodeOpen, places, shortestPath, type WorldNode } from './layout';
import { addRep, rep, type Faction } from './politics';
import { contractDonePolitics } from './commander';
import { dungeonState } from './dungeon';
import { regionFloor } from './encounters';
import { ensureWorld } from './territory';
import { averageLevel, campaignRng, newContractId, travelHours, type Campaign, type Contract, type MissionKind } from './campaign';

/**
 * Quadros de contratos por facção (C23, C24): a Coroa (até o Ato 1), a Guilda, o Clero e a
 * Resistência oferecem tipos próprios de trabalho, com reputação mínima. Além das batalhas, há
 * contratos sem luta: entrega com prazo, reconhecimento de províncias e resgate numa masmorra.
 */
export const BOARDS_CFG = EXP.contracts;
export type BoardId = keyof typeof BOARDS_CFG.boards;
export const BOARDS = BOARDS_CFG.boards as Record<BoardId, { label: string; minRep: number; from: number; to?: number; kinds: string[] }>;

const boardKey = (b: BoardId) => `faccao_${b}`;

function chapter(c: Campaign): number {
  return c.story?.chapter ?? 0;
}

export function boardRep(c: Campaign, b: BoardId): number {
  return b === 'coroa' ? 0 : rep(c, b as Faction);
}

/** Quadros abertos neste capítulo, com a reputação exigida. */
export function openBoards(c: Campaign): BoardId[] {
  const ch = chapter(c);
  return (Object.keys(BOARDS) as BoardId[]).filter((b) => BOARDS[b].from <= ch && (BOARDS[b].to ?? 99) >= ch && boardRep(c, b) >= BOARDS[b].minRep);
}

export function boardContracts(c: Campaign, b: BoardId): Contract[] {
  return c.contracts[boardKey(b)] ?? [];
}

function openPlaces(c: Campaign, filter: (n: WorldNode) => boolean): WorldNode[] {
  return places().filter((n) => nodeOpen(n, chapter(c)) && filter(n));
}

const TITLES: Record<string, string> = {
  entrega: 'Entrega urgente em {place}',
  roubo: 'Roubar o cofre de {place}',
  covil: 'Limpar o covil de {place}',
  caca: 'Caçar a fera de {place}',
  defender: 'Defender {place}',
  resgate_masmorra: 'Resgatar o explorador perdido em {place}',
  escolta: 'Escoltar a caravana até {place}',
  reconhecimento: 'Reconhecer as terras perto de {place}',
  sabotar: 'Sabotar o depósito de {place}',
};

const DESCS: Record<string, string> = {
  entrega: 'Leve a encomenda até o destino antes do prazo. Sem luta, se tudo correr bem.',
  roubo: 'Entre escondido e pegue os documentos (2 ações).',
  covil: 'Feras fizeram ninho no lugar. Elimine todas.',
  caca: 'Uma fera marcada ataca viajantes. Abata o alvo.',
  defender: 'Bandidos vão atacar. Resista até a guarda chegar.',
  resgate_masmorra: 'Um explorador sumiu lá dentro. Chegue ao segundo andar (ou limpe a masmorra) para trazê-lo de volta.',
  escolta: 'A caravana vai ser emboscada no caminho. Segure até ela passar.',
  reconhecimento: 'Revele as províncias marcadas (visite-as ou mande batedores).',
  sabotar: 'Apague as runas do depósito (2 ações) antes da rodada 10.',
};

interface KindDef {
  victory: Victory['type'];
  enemyKind: 'human' | 'beast';
  mission?: MissionKind;
  task?: Contract['task'];
  where: (n: WorldNode) => boolean;
}

const town = (n: WorldNode) => n.type === 'city' || n.type === 'village';
const KINDS: Record<string, KindDef> = {
  entrega: { victory: 'eliminate', enemyKind: 'human', task: 'entrega', where: town },
  roubo: { victory: 'interact', enemyKind: 'human', mission: 'roubo', where: (n) => n.realm === 'reino' && n.type === 'city' },
  covil: { victory: 'eliminate', enemyKind: 'beast', where: (n) => n.type === 'lair' },
  caca: { victory: 'target', enemyKind: 'beast', where: (n) => town(n) },
  defender: { victory: 'survive', enemyKind: 'human', where: (n) => n.realm === 'reino' && town(n) },
  resgate_masmorra: { victory: 'eliminate', enemyKind: 'beast', task: 'masmorra', where: (n) => n.type === 'dungeon' },
  escolta: { victory: 'survive', enemyKind: 'human', where: (n) => n.realm === 'reino' && town(n) },
  reconhecimento: { victory: 'eliminate', enemyKind: 'human', task: 'reconhecimento', where: town },
  sabotar: { victory: 'interact', enemyKind: 'human', mission: 'runas', where: (n) => n.realm === 'reino' && n.type === 'city' },
};

function makeContract(c: Campaign, b: BoardId, kind: string, rng: Rng): Contract | null {
  const k = KINDS[kind];
  if (!k) return null;
  let spots = openPlaces(c, k.where);
  if (k.task === 'masmorra') spots = spots.filter((n) => !dungeonState(c, n.id).cleared);
  // Nada muito acima do esquadrão médio (as terras distantes têm nível mínimo alto).
  spots = spots.filter((n) => regionFloor(n.region) <= averageLevel(c) + BOARDS_CFG.maxOverLevel);
  if (!spots.length) return null;
  const t = rng.pick(spots);
  const level = Math.max(regionFloor(t.region), averageLevel(c) + rng.int(0, 2) + (c.act - 1) * 3);
  const ct: Contract = {
    id: newContractId(c),
    capitalId: boardKey(b),
    board: b,
    act: c.act,
    title: TITLES[kind]!.replace('{place}', t.name),
    description: DESCS[kind]!,
    victory: k.victory,
    targetNode: t.id,
    level,
    enemyKind: k.enemyKind,
    mission: k.mission,
    task: k.task,
    rewardGold: 120 + level * 35,
    rewardXp: 50 + level * 12,
    rewardItem: null,
    status: 'open',
    squadId: null,
  };
  if (k.task === 'entrega') {
    const h = travelHours(shortestPath(c.baseNode, t.id, { open: (n) => nodeOpen(n, chapter(c)) }));
    ct.expiresAt = c.hours + Math.round(h * 1.5) + 48;
  }
  if (k.task === 'reconhecimento') {
    const w = ensureWorld(c);
    const unknown = Object.keys(w.provinces).filter((id) => !w.provinces[id]!.known && nodeOpen(node(id), chapter(c)));
    if (unknown.length < 1) return null;
    ct.scout = [];
    for (let i = 0; i < BOARDS_CFG.scoutTargets && unknown.length; i++) ct.scout.push(unknown.splice(rng.int(0, unknown.length - 1), 1)[0]!);
    ct.description = `${DESCS.reconhecimento} Alvos: ${ct.scout.map((id) => node(id).name).join(', ')}.`;
  }
  return ct;
}

/** Novo quadro (mantém os contratos já aceitos). */
export function refreshBoard(c: Campaign, b: BoardId): void {
  const rng = campaignRng(c);
  const keep = boardContracts(c, b).filter((ct) => ct.status === 'accepted');
  const list: Contract[] = [...keep];
  for (let i = 0; i < BOARDS_CFG.perBoard * 3 && list.length < BOARDS_CFG.perBoard + keep.length; i++) {
    const ct = makeContract(c, b, rng.pick(BOARDS[b].kinds), rng);
    if (ct) list.push(ct);
  }
  c.contracts[boardKey(b)] = list;
}

/** Virada do mês: os quadros abertos se renovam. */
export function boardsMonth(c: Campaign): void {
  for (const b of openBoards(c)) refreshBoard(c, b);
}

/** Contratos sem batalha: conclui ou expira. Devolve as linhas do registro. */
export function checkTasks(c: Campaign): string[] {
  const out: string[] = [];
  const w = ensureWorld(c);
  for (const list of Object.values(c.contracts))
    for (const ct of list) {
      if (ct.status !== 'accepted') continue;
      if (ct.expiresAt !== undefined && ct.expiresAt <= c.hours && ct.board) {
        ct.status = 'done';
        ct.failed = true;
        addRep(c, ct.board, -3);
        out.push(`✖ Prazo perdido: ${ct.title}.`);
        continue;
      }
      if (!ct.task) continue;
      const s = c.squads.find((x) => x.id === ct.squadId);
      const done =
        ct.task === 'entrega' ? !!s && !s.to && s.at === ct.targetNode
        : ct.task === 'reconhecimento' ? (ct.scout ?? []).every((id) => w.provinces[id]?.known)
        : !!dungeonState(c, ct.targetNode).cleared || dungeonState(c, ct.targetNode).floor >= 2;
      if (!done) continue;
      ct.status = 'done';
      c.gold += ct.rewardGold;
      out.push(`📜 Contrato cumprido: ${ct.title} (+${ct.rewardGold} ouro).`, ...contractDonePolitics(c, ct));
    }
  return out;
}
