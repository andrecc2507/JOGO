import L from '../data/base/loyalty.json';
import type { Character, Equipment } from '../rules/character';

/**
 * Lealdade e moral das tropas (D76). Ambas vão de 0 a 100.
 * - Lealdade sobe com o uso (missões), o nível, o equipamento e a atenção do comandante;
 *   cai devagar com a moral baixa e com o tempo parado na reserva.
 * - Moral cai ao ver aliados morrerem e com derrotas; sobe com vitórias, descanso e conversa,
 *   voltando aos poucos ao valor de referência.
 * Números em `data/base/loyalty.json`.
 */
export const LOYALTY = L;

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Garante os campos (saves antigos e recrutas novos). */
export function ensureLoyalty(ch: Character): void {
  ch.loyalty ??= L.start.loyalty;
  ch.morale ??= L.start.morale;
}

export function addLoyalty(ch: Character, v: number): void {
  ensureLoyalty(ch);
  ch.loyalty = clamp(ch.loyalty! + v);
}

export function addMorale(ch: Character, v: number): void {
  ensureLoyalty(ch);
  ch.morale = clamp(ch.morale! + v);
}

/** Efeito de uma batalha num sobrevivente: participação, níveis ganhos, aliados mortos e resultado. */
export function afterBattle(ch: Character, o: { victory: boolean; levels: number; allyDeaths: number }): void {
  const b = L.battle;
  addLoyalty(ch, b.loyaltyPerMission + (o.victory ? b.loyaltyVictoryBonus : 0) + o.levels * b.loyaltyPerLevel);
  addMorale(ch, (o.victory ? b.moraleVictory : b.moraleDefeat) + o.allyDeaths * b.moralePerAllyDeath);
}

/** Enfermaria (Solenne): a moral volta ao valor de referência se estiver abaixo. */
export function restoreMorale(ch: Character): void {
  ensureLoyalty(ch);
  if (ch.morale! < L.daily.moraleBaseline) ch.morale = L.daily.moraleBaseline;
}

/** Fração dos espaços principais ocupados (arma, mão secundária ou armadura, acessório). */
export function equippedRatio(eq: Equipment): number {
  const slots = [eq.weapon, eq.armor, eq.accessory, eq.offhand];
  return slots.filter(Boolean).length / slots.length;
}

/** Passagem de um dia. `resting`: na base ou na estalagem; `idle`: parado na reserva. */
export function loyaltyDay(ch: Character, o: { resting: boolean; idle: boolean }): void {
  ensureLoyalty(ch);
  const d = L.daily;
  if (ch.morale! < d.moraleBaseline) addMorale(ch, Math.min(d.moraleBaseline - ch.morale!, o.resting ? d.moraleRecoverRest : d.moraleRecover));
  if (ch.morale! < d.veryLowMorale) addLoyalty(ch, -d.loyaltyLossVeryLow);
  else if (ch.morale! < d.lowMorale) addLoyalty(ch, -d.loyaltyLossLow);
  if (o.idle) addLoyalty(ch, -d.loyaltyIdleLoss);
  if (equippedRatio(ch.equipment) >= d.equipThreshold) addLoyalty(ch, d.loyaltyEquipped);
}

/** Dias até poder conversar de novo (0 = pode agora). */
export function talkCooldown(ch: Character, day: number): number {
  if (ch.lastTalkDay === undefined) return 0;
  return Math.max(0, ch.lastTalkDay + L.talk.cooldownDays - day);
}

/** Atenção do comandante: conversa no Quartel. */
export function talk(ch: Character, day: number): boolean {
  if (talkCooldown(ch, day) > 0) return false;
  addLoyalty(ch, L.talk.loyalty);
  addMorale(ch, L.talk.morale);
  ch.lastTalkDay = day;
  return true;
}

export function loyaltyLabel(v: number): string {
  return v >= 80 ? 'devotado' : v >= 60 ? 'leal' : v >= 40 ? 'estável' : v >= 20 ? 'hesitante' : 'desleal';
}

export function moraleLabel(v: number): string {
  return v >= 80 ? 'animado' : v >= 55 ? 'firme' : v >= 30 ? 'abalado' : v >= 15 ? 'desanimado' : 'em colapso';
}
