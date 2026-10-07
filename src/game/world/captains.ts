import EXP from '../data/world/expedition.json';
import type { Character } from '../rules/character';
import type { Campaign, Squad } from './campaign';

/**
 * Capitães de esquadrão (C19): um membro lidera o esquadrão e dá bônus de viagem e uma aura em
 * batalha. As habilidades de capitão se aprendem na Academia de Treino da base.
 */
export const CAPTAINS = EXP.captains;
export type CaptainSkill = keyof typeof CAPTAINS.skills;
export const CAPTAIN_SKILLS = CAPTAINS.skills as Record<CaptainSkill, { label: string; text: string; speed?: number; rations?: number; hunt?: number; accuracy?: number; crit?: number; woundRate?: number; negotiate?: number }>;
export const ACADEMY = 'academia';

export function captainOf(c: Campaign, s: Squad): Character | undefined {
  if (!s.captainId || !s.memberIds.includes(s.captainId)) return undefined;
  const ch = c.roster[s.captainId];
  return ch && ch.woundDays <= 0 ? ch : undefined;
}

export function captainHas(c: Campaign, s: Squad, skill: CaptainSkill): boolean {
  return !!captainOf(c, s)?.captainSkills?.includes(skill);
}

export function setCaptain(s: Squad, charId: string | null): void {
  if (charId && !s.memberIds.includes(charId)) return;
  s.captainId = charId ?? undefined;
}

/** Por que não dá para ensinar (ou null). */
export function learnBlock(c: Campaign, ch: Character, skill: CaptainSkill): string | null {
  if (!c.base?.facilities.includes(ACADEMY)) return 'Construa a Academia de Treino na base.';
  if (ch.captainSkills?.includes(skill)) return 'Já sabe.';
  if ((ch.captainSkills?.length ?? 0) >= CAPTAINS.maxSkills) return `No máximo ${CAPTAINS.maxSkills} habilidades de capitão.`;
  if (c.gold < CAPTAINS.learnCost) return `Custa ${CAPTAINS.learnCost} ouro.`;
  return null;
}

export function learnCaptainSkill(c: Campaign, ch: Character, skill: CaptainSkill): boolean {
  if (learnBlock(c, ch, skill)) return false;
  c.gold -= CAPTAINS.learnCost;
  (ch.captainSkills ??= []).push(skill);
  return true;
}

/** Multiplicadores de viagem do capitão. */
export function captainSpeed(c: Campaign, s: Squad): number {
  return captainHas(c, s, 'marcha_forcada') ? CAPTAIN_SKILLS.marcha_forcada.speed! : 1;
}

export function captainRations(c: Campaign, s: Squad): number {
  return captainHas(c, s, 'intendente') ? CAPTAIN_SKILLS.intendente.rations! : 1;
}

export function captainHunt(c: Campaign, s: Squad): number {
  return captainHas(c, s, 'intendente') ? CAPTAIN_SKILLS.intendente.hunt! : 1;
}

export function captainWoundRate(c: Campaign, s: Squad): number {
  return captainHas(c, s, 'medico_de_campo') ? CAPTAIN_SKILLS.medico_de_campo.woundRate! : 1;
}

export function captainNegotiate(c: Campaign, s: Squad): number {
  return captainHas(c, s, 'diplomata') ? CAPTAIN_SKILLS.diplomata.negotiate! : 0;
}
