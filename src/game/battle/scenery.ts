/**
 * Cenário interativo (Baldur's Gate 3): alavancas que abrem portões e portas, portas trancadas
 * (arrombar), passagens secretas (perceber), sinos que atordoam os corrompidos pelo Vazio e revelam
 * escondidos, e armadilhas inimigas que dá para perceber, desarmar e — o Trapper — roubar.
 */
import { DB } from '../data';
import { DIRS, PROPS, idx, inBounds, chebyshev, manhattan, tileAt, type Tile } from './map';
import { addStatus, unitAt } from './elements';
import * as stack from './stack';
import * as stats from '../rules/stats';
import type { BattleState, BattleUnit, Trap } from './types';
import * as fx from './creature_fx';
import { faceTowards, finishAction } from './engine';
import { alertPod } from './patrol';

const T = stats.TACTICS;

// ───────────────────────────── alavancas e sinos ─────────────────────────────

/** Alavancas e sinos ao alcance (ao lado). */
export function sceneryTargets(state: BattleState, u: BattleUnit): number[] {
  const out: number[] = [];
  for (const [dx, dy] of [[0, 0], ...DIRS]) {
    const t = tileAt(state.map, u.x + dx!, u.y + dy!);
    if (t?.p && PROPS[t.p].interact) out.push(idx(state.map, u.x + dx!, u.y + dy!));
  }
  return out;
}

/** Puxa a alavanca (abre/fecha a porta ou o portão ligado) ou toca o sino. Gasta a ação. */
export function useScenery(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const t = tileAt(state.map, x, y);
  if (!t?.p || !sceneryTargets(state, u).includes(idx(state.map, x, y))) return false;
  faceTowards(u, x, y);
  if (PROPS[t.p].interact === 'lever') pullLever(state, u, t);
  else ringBell(state, u, x, y);
  finishAction(state, u, true);
  return true;
}

function pullLever(state: BattleState, u: BattleUnit, lever: Tile): void {
  const [lx, ly] = lever.link ?? [-1, -1];
  const g = tileAt(state.map, lx, ly);
  state.log.push(`🕹 ${u.name} puxa a alavanca.`);
  if (!g) return;
  if (g.p === 'portao') {
    g.p = null;
    g.gateOpen = true;
    state.log.push('⛓ O portão se ergue rangendo.');
  } else if (g.gateOpen && !unitAt(state, lx, ly)) {
    g.p = 'portao';
    delete g.gateOpen;
    state.log.push('⛓ O portão desce com estrondo.');
  }
  for (let l = 0; l < stack.levelCount(g); l++) {
    const p = stack.pieceOf(g, l);
    if (!p.door) continue;
    delete p.locked;
    p.open = !p.open;
    if (!p.open) delete p.open;
    state.log.push(`🚪 A porta ${p.open ? 'se abre' : 'se fecha'} sozinha.`);
  }
  state.events.push({ type: 'text', x: lx, y: ly, text: '⛓', color: '#ffe082' });
}

/** Sino de Aster: atordoa os corrompidos pelo Vazio por perto, revela escondidos e acorda patrulhas. */
function ringBell(state: BattleState, u: BattleUnit, x: number, y: number): void {
  state.log.push(`🔔 ${u.name} toca o sino! O som de Aster ecoa.`);
  state.events.push({ type: 'text', x, y, text: '🔔 DONG', color: '#ffd54f' });
  for (const o of state.units) {
    if (!o.alive || manhattan(o.x, o.y, x, y) > 6) continue;
    if (o.hidden) {
      o.hidden = false;
      state.log.push(`👁 O sino revela ${o.name}.`);
    }
    const corrupt = o.team !== u.team && (o.element === 'sombra' || (o.enemyId ?? '').match(/veu|corrompid|vazio/));
    if (corrupt) addStatus(o, 'atordoado', 1);
    if (o.unaware) alertPod(state, o, 'ouviu o sino');
  }
}

// ───────────────────────────── portas trancadas ─────────────────────────────

/** Arromba a fechadura (DES ou FOR); falhou, perde a ação. Devolve true se tentou. */
export function pickLock(state: BattleState, u: BattleUnit, x: number, y: number, l: number): boolean {
  const t = tileAt(state.map, x, y);
  if (!t) return false;
  const p = stack.pieceOf(t, l);
  if (!p.locked) return false;
  const chance = stats.lockpickChance(u.attrs.dex, u.attrs.str);
  faceTowards(u, x, y);
  if (state.rng.chance(chance / 100)) {
    delete p.locked;
    p.open = true;
    state.log.push(`🔓 ${u.name} arromba a fechadura (${chance}%).`);
  } else state.log.push(`🔒 ${u.name} não consegue abrir a fechadura (${chance}%).`);
  finishAction(state, u, true);
  return true;
}

// ───────────────────────────── perceber ─────────────────────────────

/** Abre uma passagem secreta na coluna (o vão de 2 níveis no térreo aparece). */
export function revealSecret(state: BattleState, x: number, y: number): void {
  const t = tileAt(state.map, x, y);
  const s = t?.up?.find((p) => p.secret);
  if (!t || !s) return;
  delete s.secret;
  if (s.b <= t.h) {
    if (s.h - (t.h + 2) <= 0) t.up!.splice(t.up!.indexOf(s), 1);
    else s.b = t.h + 2;
    if (!t.up!.length) delete t.up;
  }
  state.log.push('🔍 Uma passagem secreta!');
  state.events.push({ type: 'text', x, y, text: '🔍 Passagem!', color: '#a5d6a7' });
}

/** Teste de percepção de `u`: armadilhas inimigas e passagens secretas por perto. `bonus` dobra a chance (Procurar). */
export function perceive(state: BattleState, u: BattleUnit, bonus = 1, enemies = false): number {
  const chance = Math.min(95, stats.perceiveChance(u.attrs.dex, u.attrs.int) * bonus) / 100;
  const r = T.perceiveRange;
  let found = 0;
  for (const tr of state.traps ?? []) {
    if (tr.team === u.team || tr.spotted?.includes(u.team) || manhattan(tr.x, tr.y, u.x, u.y) > r) continue;
    if (!state.rng.chance(chance)) continue;
    (tr.spotted ??= []).push(u.team);
    found++;
    state.log.push(`👁 ${u.name} percebe uma armadilha (${tr.name}).`);
    state.events.push({ type: 'text', x: tr.x, y: tr.y, text: '⚠', color: '#ffb74d' });
  }
  for (let y = u.y - r; y <= u.y + r; y++)
    for (let x = u.x - r; x <= u.x + r; x++) {
      if (!inBounds(state.map, x, y) || manhattan(x, y, u.x, u.y) > r) continue;
      if (tileAt(state.map, x, y)!.up?.some((p) => p.secret) && state.rng.chance(chance)) {
        revealSecret(state, x, y);
        found++;
      }
    }
  // Procurar com calma também acha quem está escondido por perto.
  if (enemies)
    for (const o of state.units) {
      if (!o.alive || o.team === u.team || !o.hidden || manhattan(o.x, o.y, u.x, u.y) > r + 1 || !state.rng.chance(chance)) continue;
      o.hidden = false;
      found++;
      state.log.push(`👁 ${u.name} encontra ${o.name} escondido!`);
      state.events.push({ type: 'spotted', uid: o.uid });
    }
  return found;
}

/**
 * Procurar: gasta a ação e vasculha a área ao redor com o dobro da chance — armadilhas, passagens
 * secretas e inimigos escondidos. Diz quando não acha nada.
 */
export function search(state: BattleState, u: BattleUnit): void {
  state.log.push(`🔍 ${u.name} procura com cuidado.`);
  const found = perceive(state, u, 2, true);
  if (!found) {
    state.log.push(`🔍 ${u.name} não encontra nada por perto.`);
    state.events.push({ type: 'text', x: u.x, y: u.y, text: 'Nada aqui', color: '#e0e0e0' });
  }
  finishAction(state, u, true);
}

/** Armadilhas inimigas percebidas ao lado: desarmar (ou roubar, se for Trapper). */
export function disarmTargets(state: BattleState, u: BattleUnit): number[] {
  return (state.traps ?? []).filter((t) => t.team !== u.team && t.spotted?.includes(u.team) && chebyshev(t.x, t.y, u.x, u.y) <= 1).map((t) => idx(state.map, t.x, t.y));
}

function isTrapper(u: BattleUnit): boolean {
  return fx.passiveFx(u).some((f) => f.fieldTraps || f.trapRefund) || u.skills.some((id) => DB.skills[id]?.tree === 'trapper');
}

/** Desarma a armadilha (o Trapper a rouba: passa a ser dele, armada). Gasta a ação. */
export function disarm(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const tr = (state.traps ?? []).find((t: Trap) => t.x === x && t.y === y && t.team !== u.team && t.spotted?.includes(u.team));
  if (!tr || chebyshev(x, y, u.x, u.y) > 1) return false;
  faceTowards(u, x, y);
  if (isTrapper(u)) {
    tr.team = u.team;
    tr.ownerUid = u.uid;
    tr.armed = true;
    delete tr.spotted;
    state.log.push(`⚙ ${u.name} vira a armadilha contra o inimigo!`);
  } else {
    state.traps = state.traps!.filter((t) => t !== tr);
    state.log.push(`⚙ ${u.name} desarma ${tr.name}.`);
  }
  finishAction(state, u, true);
  return true;
}
