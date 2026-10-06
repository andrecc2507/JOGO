/**
 * Emboscada com patrulhas (XCOM): em encontros noturnos e missões furtivas o esquadrão começa
 * escondido e os inimigos andam em grupos (patrulhas) que ainda não sabem de nada. Cada grupo segue
 * uma rota em ciclo atrás do líder, devagar, olhando para a frente — as costas, as pausas e as áreas
 * longe da rota são as brechas. Ao avistar alguém (ou ser atingido), o grupo inteiro desperta.
 */
import { hasLos } from './los';
import { isWalkable, manhattan, tileAt } from './map';
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
    lead.route = patrolRoute(state, lead);
    lead.routeAt = 0;
    pod++;
  }
  if (foes.length) state.log.push(`👣 ${pod} patrulha(s) andam pelo mapa sem saber de vocês.`);
}

/** Rota de ronda: o posto do líder e 2 pontos a 3–7 casas dele, visitados em ciclo. */
function patrolRoute(state: BattleState, lead: BattleUnit): [number, number][] {
  const route: [number, number][] = [[lead.x, lead.y]];
  for (let tries = 0; tries < 60 && route.length < 3; tries++) {
    const x = lead.x + state.rng.int(-7, 7);
    const y = lead.y + state.rng.int(-7, 7);
    const d = manhattan(x, y, lead.x, lead.y);
    const t = tileAt(state.map, x, y);
    if (t && isWalkable(t) && !t.p && d >= 3 && d <= 7 && !route.some(([rx, ry]) => manhattan(rx, ry, x, y) < 3)) route.push([x, y]);
  }
  return route;
}

/** Líder da patrulha de `u` (quem tem a rota). */
export function podLead(state: BattleState, u: BattleUnit): BattleUnit | undefined {
  return state.units.find((o) => o.alive && o.team === u.team && o.pod === u.pod && o.route);
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
