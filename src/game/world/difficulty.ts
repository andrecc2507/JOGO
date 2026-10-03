import DIFF from '../data/base/difficulty.json';

/**
 * Dificuldade da campanha (escolhida no Novo jogo): vida e dano dos inimigos, nível dos encontros,
 * voltas de turno por batalha e morte permanente. O Modo Ferro vale com qualquer dificuldade:
 * um save só, gravado sozinho, e nenhuma volta de turno.
 */
export type DifficultyId = 'historia' | 'normal' | 'dificil';

export interface DifficultyDef {
  label: string;
  desc: string;
  enemyHp: number;
  enemyDmg: number;
  levelOffset: number;
  /** Voltas de turno por batalha (−1 = sem limite). */
  undo: number;
  permadeath: boolean;
  woundMult: number;
}

export const DIFFICULTIES = { historia: DIFF.historia, normal: DIFF.normal, dificil: DIFF.dificil } as Record<DifficultyId, DifficultyDef>;
export const IRONMAN_TEXT = DIFF._ferro;

export interface DifficultyHost {
  difficulty?: DifficultyId;
  ironman?: boolean;
}

export function difficultyOf(c: DifficultyHost): DifficultyDef {
  return DIFFICULTIES[c.difficulty ?? 'normal'];
}

/** O que a batalha precisa saber da dificuldade. */
export interface BattleDifficulty {
  enemyHp: number;
  enemyDmg: number;
  undo: number;
  permadeath: boolean;
}

export function battleDifficulty(c: DifficultyHost): BattleDifficulty {
  const d = difficultyOf(c);
  return { enemyHp: d.enemyHp, enemyDmg: d.enemyDmg, undo: c.ironman ? 0 : d.undo, permadeath: d.permadeath };
}

export function difficultyLabel(c: DifficultyHost): string {
  return `${difficultyOf(c).label}${c.ironman ? ' · Ferro' : ''}`;
}
