/**
 * Emboscada com patrulhas (XCOM): em encontros noturnos o esquadrão começa escondido e os inimigos
 * andam em grupos (patrulhas) que ainda não sabem de nada. Patrulha desavisada anda devagar e não
 * ataca; ao avistar alguém (ou ser atingida), o grupo inteiro desperta.
 */
import { hasLos } from './los';
import { manhattan } from './map';
import * as stack from './stack';
import type { BattleState, BattleUnit } from './types';
import { NIGHT_VISION_RANGE, VISION_RANGE, inCone } from './engine';

/** Divide os inimigos em grupos de 2–3 pelos mais próximos e os deixa desavisados. */
export function assignPods(state: BattleState): void {
  const foes = state.units.filter((u) => u.team === 'enemy' && u.alive && !u.boss && !u.bound);
  const left = [...foes];
  let pod = 0;
  while (left.length) {
    const lead = left.shift()!;
    left.sort((a, b) => manhattan(a.x, a.y, lead.x, lead.y) - manhattan(b.x, b.y, lead.x, lead.y));
    const group = [lead, ...left.splice(0, Math.min(2, left.length))];
    for (const u of group) {
      u.pod = pod;
      u.unaware = true;
    }
    pod++;
  }
  if (foes.length) state.log.push(`🌙 ${pod} patrulha(s) andam pelo mapa sem saber de vocês.`);
}

/** Desperta o grupo inteiro de `u`. */
export function alertPod(state: BattleState, u: BattleUnit, why: string): void {
  if (!u.unaware) return;
  const group = state.units.filter((o) => o.pod === u.pod && o.team === u.team && o.unaware);
  for (const o of group) {
    o.unaware = false;
    state.events.push({ type: 'text', x: o.x, y: o.y, text: '!', color: '#ff5252' });
  }
  state.log.push(`⚠ A patrulha ${why}!`);
}

/** Alguma patrulha desavisada vê um herói não escondido? Desperta o grupo. */
export function checkAlerts(state: BattleState): void {
  const range = state.timeOfDay === 'noite' ? NIGHT_VISION_RANGE : VISION_RANGE;
  for (const e of state.units) {
    if (!e.alive || !e.unaware) continue;
    const seen = state.units.find(
      (p) =>
        p.alive &&
        p.team !== e.team &&
        !p.hidden &&
        (manhattan(e.x, e.y, p.x, p.y) <= 2 || (inCone(e, p.x, p.y) && Math.hypot(e.x - p.x, e.y - p.y) <= range + (p.statuses.tocha ? 6 : 0))) &&
        hasLos(state.map, e.x, e.y, p.x, p.y, stack.unitH(state.map, e), stack.unitH(state.map, p)),
    );
    if (seen) alertPod(state, e, `avistou ${seen.name}`);
  }
}
