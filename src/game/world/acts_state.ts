import ACTS_JSON from '../data/world/acts.json';
import type { Rng } from '@core';
import type { ClassId } from '../data';
import type { BattleUnit, Victory } from '../battle/types';
import { unitFromCharacter } from '../battle/units';
import { makeCharacter } from '../rules/recruit';
import { averageLevel, newContractId, type Campaign, type Contract, type MissionKind } from './campaign';

/**
 * Estado dos sistemas de cada ato (F5, docs/design/comandante.md, Parte 3). Cada ato liga um
 * sistema próprio; todos guardam o estado aqui, num só lugar da campanha.
 */
export const ACTS = ACTS_JSON;

export interface Clue {
  id: string;
  text: string;
  real: boolean;
  verified?: boolean;
}

export interface Front {
  country: string;
  crown: number;
  resistance: number;
  morale: number;
}

export interface Portal {
  id: string;
  at: string;
  maturity: number;
}

export interface Caravan {
  at: string;
  route: string[];
  progress: number;
  survivors: number;
  done?: boolean;
}

export interface Baron {
  id: string;
  rage: number;
  dead?: boolean;
  /** Postos do Barão ainda de pé (lugares). */
  posts: string[];
}

export interface ActsState {
  // Ato 1
  favor: number;
  suspicion: number;
  // Ato 2
  wanted: Record<string, number>;
  clues: Clue[];
  /** Missão que começa com pista falsa (emboscada). */
  falseLead?: string;
  // Ato 3
  fronts: Front[];
  prep: number;
  // Ato 4
  portals: Portal[];
  alliances: string[];
  blighted: string[];
  // Ato 5
  inVoid: string[];
  corruption: Record<string, number>;
  mutations: Record<string, string[]>;
  caravan?: Caravan;
  // Ato 6
  camp?: string;
  shifted: Record<string, string>;
  closed: string[];
  // Ato 7
  barons: Baron[];
  // Ato 8
  warTable: Record<string, number>;
  /** Últimos dias processados por sistema (ritmo semanal). */
  lastDay: Record<string, number>;
}

export function ensureActs(c: Campaign): ActsState {
  c.acts ??= {
    favor: ACTS.crown.favorStart,
    suspicion: 0,
    wanted: {},
    clues: [],
    fronts: [],
    prep: 0,
    portals: [],
    alliances: [],
    blighted: [],
    inVoid: [],
    corruption: {},
    mutations: {},
    shifted: {},
    closed: [],
    barons: [],
    warTable: {},
    lastDay: {},
  };
  return c.acts;
}

export function chapterOf(c: Campaign): number {
  return c.story?.chapter ?? 0;
}

/** Contrato de ato: qualquer esquadrão no local pode atender, com prazo opcional. */
export function actContract(
  c: Campaign,
  o: { title: string; desc: string; victory: Victory['type']; mission?: MissionKind; target: string; levelBonus?: number; expiresAt?: number; kind: string; ref: string; enemyKind?: 'human' | 'beast' },
): Contract {
  const level = Math.max(1, averageLevel(c) + (o.levelBonus ?? 1));
  const ct: Contract = {
    id: newContractId(c),
    capitalId: 'atos',
    act: c.act,
    title: o.title,
    description: o.desc,
    victory: o.victory,
    targetNode: o.target,
    level,
    enemyKind: o.enemyKind ?? 'human',
    mission: o.mission,
    rewardGold: 80 + level * 25,
    rewardXp: 60 + level * 12,
    rewardItem: null,
    status: 'accepted',
    squadId: null,
    crisis: true,
    expiresAt: o.expiresAt,
    actOp: { kind: o.kind, ref: o.ref },
  };
  (c.contracts.atos ??= []).push(ct);
  return ct;
}

export function actContracts(c: Campaign, kind?: string): Contract[] {
  return (c.contracts.atos ?? []).filter((ct) => ct.status !== 'done' && (!kind || ct.actOp?.kind === kind));
}

/** Aliado da IA para batalhas (tropa de uma aliança, rebeldes do preparo, frentes vencidas). */
export function allyUnit(rng: Rng, classId: ClassId, level: number, name: string): BattleUnit {
  const ch = makeCharacter(rng, { classId, level: Math.max(1, level), name });
  const u = unitFromCharacter(ch, 'player');
  // Não é herói do elenco: não volta no resultado da batalha.
  delete u.charId;
  return u;
}
