import type { BattleState } from './types';

/**
 * Dicas no contexto da batalha: devolve os ids (data/story/tutorial.json → hints) cujas condições
 * valem agora. A cena mostra a primeira que o jogador ainda não viu.
 */
export function battleHints(state: BattleState, o: { intents: boolean; moving: boolean; reactionReady: boolean; bonded: boolean }): string[] {
  const out: string[] = [];
  const heroes = state.units.filter((u) => u.team === 'player' && u.alive && !u.ai);
  const foes = state.units.filter((u) => u.team === 'enemy' && u.alive);
  if (heroes.some((u) => u.hidden)) out.push('h_stealth');
  if ((state.objectives ?? []).some((x) => !x.done)) out.push('h_objective');
  if ((state.waves ?? []).some((w) => !w.done)) out.push('h_waves');
  if (o.intents) out.push('h_intent');
  if (o.moving) out.push('h_cover');
  if (heroes.some((u) => u.hp < u.maxHp * 0.35)) out.push('h_low_hp');
  if (heroes.some((u) => u.hp < u.startHp * 0.6)) out.push('h_undo');
  if (foes.some((u) => u.statuses.molhado)) out.push('h_elements');
  if (foes.some((u) => u.overwatch)) out.push('h_overwatch');
  if (heroes.some((u) => Object.keys(u.statuses).length && Object.keys(u.statuses).some((k) => DEBUFFS.has(k)))) out.push('h_status');
  if (foes.some((u) => u.boss && u.phases?.some((p) => p.done))) out.push('h_boss');
  if (foes.some((u) => u.classId !== 'fera' && u.hp <= u.maxHp * 0.25)) out.push('h_capture');
  if (o.reactionReady) out.push('h_reaction');
  if (o.bonded) out.push('h_bond');
  return out;
}

const DEBUFFS = new Set(['queimando', 'congelado', 'eletrocutado', 'envenenado', 'cegado', 'sangramento', 'atordoado', 'lento', 'imobilizado', 'derrubado', 'medo', 'desarmado', 'silenciado', 'confuso', 'quebrado', 'ferida_aberta', 'marcado', 'enfraquecido', 'exposto', 'sono', 'provocado', 'vulneravel']);
