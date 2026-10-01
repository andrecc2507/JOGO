import { setReactionDecider } from './creature_fx';
import type { BattleState, Team } from './types';

/** Reação de uma unidade do jogador que acabou de ser disparada e espera a decisão "usar ou não". */
export interface ReactionQuestion {
  unitUid: string;
  skillId: string;
  attackerUid: string;
}

class Ask {
  constructor(readonly question: ReactionQuestion) {}
}

export function reactionKey(q: Pick<ReactionQuestion, 'unitUid' | 'skillId'>): string {
  return `${q.unitUid}:${q.skillId}`;
}

/** Retrato completo da batalha (também usado para desfazer um movimento). */
export type BattleSnapshot = { data: Omit<BattleState, 'rng'>; seed: number };
type Snapshot = BattleSnapshot;

export function snapshotBattle(state: BattleState): Snapshot {
  const { rng, ...rest } = state;
  return { data: structuredClone(rest), seed: rng.seed };
}

/** Volta o estado ao retrato, mantendo a identidade dos objetos (unidades e mapa) que a cena guarda. */
export function restoreBattle(state: BattleState, snap: Snapshot): void {
  const data = structuredClone(snap.data);
  const byUid = new Map(state.units.map((u) => [u.uid, u]));
  const units = data.units.map((d) => {
    const u = byUid.get(d.uid);
    if (!u) return d;
    for (const k of Object.keys(u)) delete (u as unknown as Record<string, unknown>)[k];
    return Object.assign(u, d);
  });
  Object.assign(state.map, data.map);
  Object.assign(state, data, { units, map: state.map });
  if (!data.pending) delete state.pending;
  if (!data.traps) delete state.traps;
  state.rng.reseed(snap.seed);
}

/**
 * Executa uma ação do motor perguntando pelas reações das unidades de `team`.
 * Quando aparece uma reação ainda sem decisão em `decisions`, tudo é desfeito e a pergunta é devolvida;
 * depois de responder, basta rodar de novo: o RNG volta ao mesmo ponto e a ação se repete igual até ali.
 */
export function runWithReactions(state: BattleState, team: Team, decisions: Map<string, boolean>, fn: () => void): ReactionQuestion | null {
  const snap = snapshotBattle(state);
  setReactionDecider((d, skillId, a) => {
    if (d.team !== team) return true;
    const answer = decisions.get(reactionKey({ unitUid: d.uid, skillId }));
    if (answer !== undefined) return answer;
    throw new Ask({ unitUid: d.uid, skillId, attackerUid: a.uid });
  });
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof Ask)) throw e;
    restoreBattle(state, snap);
    return e.question;
  } finally {
    setReactionDecider(null);
  }
}
