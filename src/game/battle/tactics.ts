/**
 * Mecânicas táticas inspiradas em XCOM, Xenonauts e Baldur's Gate 3, com o toque de Valdoria:
 * empurrar (Força × Força) e arremessar objetos, barris e lustres que reagem ao quebrar, fogo de
 * supressão, tiro que erra e segue a linha, arremesso em arco por cima de muros, furtividade ligada à
 * luz (tocha e sinalizador). Números em `data/balance.json` → `tactics` (contas em rules/stats.ts).
 */
import { DIRS, PROPS, idx, inBounds, manhattan, tileAt, type Prop } from './map';
import { lineTiles } from './los';
import { addStatus, applyElementToTile, removeStatus, tileEffectsOnUnit, unitAt } from './elements';
import * as stack from './stack';
import * as stats from '../rules/stats';
import type { BattleState, BattleUnit } from './types';
import * as fx from './creature_fx';
import { damage, faceTowards, finishAction, hitPiece, losBetween, resolveAttack, settleStructures, structureHit, targetH, unitById } from './engine';
import { damageProp } from './props';

const T = stats.TACTICS;

function sizeOf(u: BattleUnit): number {
  return u.look?.size ?? 1;
}

// ───────────────────────────── empurrar ─────────────────────────────

/** Vizinhos que `u` pode empurrar agora (uma vez por turno, ação livre). */
export function shoveTargets(state: BattleState, u: BattleUnit): number[] {
  if (fx.bag(u).shoved || !u.alive) return [];
  const out: number[] = [];
  const h = stack.unitH(state.map, u);
  for (const [dx, dy] of DIRS) {
    const o = unitAt(state, u.x + dx!, u.y + dy!);
    if (o && o.alive && Math.abs(stack.unitH(state.map, o) - h) <= 1 && !o.statuses.ancorado) out.push(idx(state.map, o.x, o.y));
  }
  return out;
}

export function shoveChanceOf(a: BattleUnit, d: BattleUnit): number {
  return stats.shoveChance(a.attrs.str, d.attrs.str, Math.round(sizeOf(a) - sizeOf(d)));
}

/**
 * Empurrão: teste de Força contra Força. Sucesso move o alvo 1 casa (2 com muita Força a mais) na
 * direção do empurrão: cai de telhados (dano de queda), entra no fogo ou na lama, bate em paredes.
 * Ação livre, uma vez por turno.
 */
export function shove(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const d = unitAt(state, x, y);
  if (!d || !shoveTargets(state, u).includes(idx(state.map, x, y))) return false;
  fx.bag(u).shoved = 1;
  const chance = shoveChanceOf(u, d);
  if (!state.rng.chance(chance / 100)) {
    state.log.push(`💪 ${d.name} resiste ao empurrão de ${u.name} (${chance}%).`);
    state.events.push({ type: 'text', x, y, text: 'Resistiu!', color: '#e0e0e0' });
    return true;
  }
  const dir: [number, number] = [Math.sign(x - u.x), Math.sign(y - u.y)];
  state.log.push(`💥 ${u.name} empurra ${d.name}!`);
  const n = stats.shoveDistance(u.attrs.str, d.attrs.str);
  for (let i = 0; i < n && d.alive; i++) if (!pushStep(state, d, dir[0], dir[1])) break;
  return true;
}

/**
 * Um passo de empurrão: o alvo vai para a casa vizinha se couber (no máximo 1 nível acima; qualquer
 * altura abaixo, caindo). Parede, borda do mapa ou outra unidade: bate e fica. Abismo: despenca.
 */
export function pushStep(state: BattleState, d: BattleUnit, dx: number, dy: number): boolean {
  const map = state.map;
  const nx = d.x + dx;
  const ny = d.y + dy;
  const collide = (what: string) => {
    damage(state, d, stats.collideDamage(d.maxHp), undefined, undefined);
    state.log.push(`🧱 ${d.name} bate ${what}.`);
    return false;
  };
  if (!inBounds(map, nx, ny)) return collide('na borda');
  const other = unitAt(state, nx, ny);
  if (other) {
    damage(state, other, stats.collideDamage(other.maxHp), undefined, undefined);
    return collide(`em ${other.name}`);
  }
  const t = tileAt(map, nx, ny)!;
  if (t.t === 'abismo') {
    state.log.push(`🕳 ${d.name} despenca no abismo!`);
    damage(state, d, d.hp + (d.shield ?? 0) + 9999, undefined, undefined);
    return false;
  }
  if (t.t === 'agua_funda') {
    addStatus(d, 'molhado', 3);
    addStatus(d, 'derrubado', 1);
    state.log.push(`🌊 ${d.name} cai na água e se arrasta de volta.`);
    return false;
  }
  if (t.t === 'lava') {
    addStatus(d, 'queimando', 3);
    damage(state, d, Math.round(d.maxHp * 0.25), undefined, 'fogo');
    state.log.push(`🌋 ${d.name} é empurrado contra a lava!`);
    return false;
  }
  const h0 = stack.unitH(map, d);
  let best = -1;
  for (let l = 0; l < stack.levelCount(t); l++) {
    const top = stack.topOf(t, l);
    if (!stack.standable(t, l) || top > h0 + 1) continue;
    // Precisa de espaço livre na altura do corpo para atravessar.
    if (!stack.freeSpan(t, top, Math.max(top, h0) + stack.HEADROOM)) continue;
    if (best < 0 || top > stack.topOf(t, best)) best = l;
  }
  if (best < 0) return collide('na parede');
  d.x = nx;
  d.y = ny;
  stack.setLevel(map, d, best);
  const drop = h0 - stack.unitH(map, d);
  if (drop > 0 && !d.statuses.voando) {
    if (state.inverted && drop > 1) {
      // Gravidade invertida do Vazio: em vez de cair, flutua.
      addStatus(d, 'voando', 1);
      state.log.push(`🌀 ${d.name} flutua no ar invertido do Vazio.`);
    } else {
      const dmg = stats.fallDamage(d.maxHp, drop, d.jump);
      if (dmg) {
        damage(state, d, dmg, undefined, undefined);
        state.log.push(`⬇ ${d.name} despenca ${drop} níveis.`);
      }
    }
  }
  const tdmg = tileEffectsOnUnit(state, d);
  if (tdmg) damage(state, d, tdmg, undefined, undefined);
  if (d.alive) fx.stepOnTile(state, d);
  return d.alive;
}

// ───────────────────────────── arremesso em arco ─────────────────────────────

/**
 * Arremesso em arco (granadas, frascos, objetos): alcança por cima de muros e unidades — o arco sobe
 * 3 níveis acima do ponto mais alto; não entra em lugar coberto (dentro de casa) sem linha de visão.
 */
export function arcReach(state: BattleState, u: BattleUnit, x: number, y: number, range: number): boolean {
  const map = state.map;
  if (!inBounds(map, x, y)) return false;
  const d = manhattan(u.x, u.y, x, y);
  if (d < 1 || d > range) return false;
  const t = tileAt(map, x, y)!;
  const ha = stack.unitH(map, u);
  const hb = targetH(state, x, y);
  const peak = Math.max(ha, hb) + 3;
  for (const [cx, cy] of lineTiles(u.x, u.y, x, y)) if (stack.columnTop(tileAt(map, cx, cy)!) >= peak) return false;
  // Alvo sob teto: só se der para ver (porta aberta, janela).
  const l = stack.levelAt(t, hb === stack.columnTop(t) ? undefined : hb);
  if (stack.isStacked(t) && stack.covered(t, l)) return !stack.rayBlocked(map, u.x, u.y, ha + 1.5, x, y, hb + 1);
  return true;
}

// ───────────────────────────── arremessar objetos ─────────────────────────────

/** Objetos leves ao lado (no chão) que `u` pode pegar e arremessar. */
export function throwSources(state: BattleState, u: BattleUnit): number[] {
  if (u.z !== undefined) return [];
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const t = tileAt(state.map, u.x + dx!, u.y + dy!);
    if (t?.p && PROPS[t.p].throwable && !unitAt(state, u.x + dx!, u.y + dy!)) out.push(idx(state.map, u.x + dx!, u.y + dy!));
  }
  return out;
}

export function throwTargets(state: BattleState, u: BattleUnit): number[] {
  const range = stats.throwRange(u.attrs.str);
  const out: number[] = [];
  for (let y = Math.max(0, u.y - range); y <= Math.min(state.map.h - 1, u.y + range); y++)
    for (let x = Math.max(0, u.x - range); x <= Math.min(state.map.w - 1, u.x + range); x++) if (arcReach(state, u, x, y, range)) out.push(idx(state.map, x, y));
  return out;
}

/**
 * Arremessa o objeto de (sx, sy) em (tx, ty): quem estiver lá leva o golpe (acerto garantido) e o
 * objeto quebra (barril de óleo derrama, de pólvora explode); sem ninguém, ele cai inteiro se couber.
 */
export function throwProp(state: BattleState, u: BattleUnit, sx: number, sy: number, tx: number, ty: number): boolean {
  const src = tileAt(state.map, sx, sy);
  if (!src?.p || !PROPS[src.p].throwable || manhattan(u.x, u.y, sx, sy) !== 1) return false;
  if (!arcReach(state, u, tx, ty, stats.throwRange(u.attrs.str))) return false;
  const p = src.p;
  faceTowards(u, tx, ty);
  finishAction(state, u);
  src.p = null;
  delete src.pHp;
  state.events.push({ type: 'fx', x: tx, y: ty, element: 'hit' });
  state.log.push(`🪣 ${u.name} arremessa ${PROPS[p].name}.`);
  const hit = unitAt(state, tx, ty);
  const dst = tileAt(state.map, tx, ty)!;
  if (hit) {
    damage(state, hit, structureHit(u, 'basic', T.throwPower), u, undefined);
    addStatus(hit, 'derrubado', 1);
    propBroke(state, tx, ty, p);
  } else if (PROPS[p].onBreak) propBroke(state, tx, ty, p);
  else if (!dst.p && !dst.up?.length && dst.t !== 'agua_funda') dst.p = p;
  return true;
}

// ───────────────────────────── objetos que reagem ─────────────────────────────

/** Efeito de um objeto que quebrou em (x, y): derrama óleo, explode ou despenca (lustre). */
export function propBroke(state: BattleState, x: number, y: number, p: Prop): void {
  const kind = PROPS[p].onBreak;
  if (!kind) return;
  const map = state.map;
  if (kind === 'oil') {
    for (const [dx, dy] of [[0, 0], ...DIRS]) if (inBounds(map, x + dx!, y + dy!)) applyElementToTile(state, x + dx!, y + dy!, 'oleo');
    state.log.push('🛢 O barril racha e o óleo se espalha.');
    return;
  }
  if (kind === 'fall') {
    const o = unitAt(state, x, y);
    state.log.push('💡 O lustre despenca!');
    if (o) {
      damage(state, o, Math.max(1, Math.round(o.maxHp * T.fallingPropCrush)), undefined, undefined);
      addStatus(o, 'derrubado', 1);
    }
    return;
  }
  explode(state, x, y);
}

/** Explosão de pólvora alquímica (Vel'Qadar): fogo em volta, dano, paredes rachadas e outros barris em cadeia. */
export function explode(state: BattleState, x: number, y: number): void {
  const map = state.map;
  const r = T.explodeRadius;
  state.log.push('💥 BUM! A pólvora alquímica explode!');
  state.events.push({ type: 'text', x, y, text: '💥', color: '#ffab40' });
  const chain: [number, number][] = [];
  let broke = false;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(map, tx, ty)) continue;
      state.events.push({ type: 'fx', x: tx, y: ty, element: 'fogo' });
      const t = tileAt(map, tx, ty)!;
      if (t.p === 'barril_polvora' && (dx || dy)) chain.push([tx, ty]);
      else applyElementToTile(state, tx, ty, 'fogo');
      const o = unitAt(state, tx, ty);
      if (o) damage(state, o, Math.max(1, Math.round(o.maxHp * T.explodePower)), undefined, 'fogo');
      const l = stack.pieceNear(t, t.h + 1);
      if (l > 0 && hitPiece(state, tx, ty, l, 40)) broke = true;
    }
  for (const [cx, cy] of chain) {
    const t = tileAt(map, cx, cy)!;
    if (t.p !== 'barril_polvora') continue;
    t.p = null;
    explode(state, cx, cy);
  }
  if (broke) settleStructures(state);
}

/** Objetos pendurados (lustres) ou quaisquer objetos ao alcance da arma que `u` pode mirar diretamente. */
export function propShotTargets(state: BattleState, u: BattleUnit, range: number): number[] {
  const out: number[] = [];
  const map = state.map;
  for (let y = Math.max(0, u.y - range); y <= Math.min(map.h - 1, u.y + range); y++)
    for (let x = Math.max(0, u.x - range); x <= Math.min(map.w - 1, u.x + range); x++) {
      const t = map.tiles[idx(map, x, y)]!;
      if (!t.p || !PROPS[t.p].hanging) continue;
      const d = manhattan(u.x, u.y, x, y);
      if (d < 1 || d > range) continue;
      if (stack.rayBlocked(map, u.x, u.y, stack.unitH(map, u) + 1.5, x, y, t.h + 2.5)) continue;
      out.push(idx(map, x, y));
    }
  return out;
}

/** Tiro direto num objeto pendurado (lustre): acerto garantido; ele despenca em quem estiver embaixo. */
export function shootProp(state: BattleState, u: BattleUnit, x: number, y: number, range: number): boolean {
  if (!propShotTargets(state, u, range).includes(idx(state.map, x, y))) return false;
  faceTowards(u, x, y);
  damageProp(state, x, y, structureHit(u, u.weaponType === 'varinha' ? 'magic' : 'basic', 0));
  finishAction(state, u);
  return true;
}

// ───────────────────────────── supressão ─────────────────────────────

/** Põe o alvo sob fogo de supressão (dura até o próximo turno de quem suprime). */
export function suppress(state: BattleState, a: BattleUnit, d: BattleUnit): void {
  if (!d.alive) return;
  addStatus(d, 'suprimido', 2);
  fx.bag(d).suppressedBy = a.uid;
  state.log.push(`⛆ ${d.name} está sob fogo de supressão de ${a.name}.`);
  state.events.push({ type: 'text', x: d.x, y: d.y, text: '⛆ Suprimido', color: '#ffb74d' });
}

/** Quem estava suprimindo volta a agir: a supressão que mantinha acaba. */
export function releaseSuppression(state: BattleState, a: BattleUnit): void {
  for (const o of state.units) if (o.statuses.suprimido && fx.bag(o).suppressedBy === a.uid) removeStatus(o, 'suprimido');
}

/** Suprimido que sai do lugar leva o tiro de quem o suprime (uma vez). */
export function suppressedMove(state: BattleState, mover: BattleUnit): void {
  if (!mover.statuses.suprimido) return;
  const s = unitById(state, String(fx.bag(mover).suppressedBy ?? ""));
  removeStatus(mover, 'suprimido');
  if (!s || !s.alive || !losBetween(state, s, mover)) return;
  state.log.push(`⛆ ${s.name} dispara em ${mover.name}, que saiu da cobertura!`);
  resolveAttack(state, s, mover, 'basic', T.suppressShotPower, undefined, 0, 1);
}

// ───────────────────────────── tiro que continua ─────────────────────────────

/**
 * Tiro à distância que errou segue a linha por até 4 casas além do alvo: pode pegar outra unidade
 * (de qualquer lado; metade do dano), uma parede ou um objeto.
 */
export function strayShot(state: BattleState, a: BattleUnit, d: BattleUnit, mid: number): void {
  const dx = d.x - a.x;
  const dy = d.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1.01) return;
  const ex = Math.round(d.x + (dx / len) * T.strayRange);
  const ey = Math.round(d.y + (dy / len) * T.strayRange);
  const h = stack.unitH(state.map, d) + 1;
  for (const [x, y] of [...lineTiles(d.x, d.y, ex, ey), [ex, ey] as [number, number]]) {
    if (!inBounds(state.map, x, y)) return;
    const o = unitAt(state, x, y);
    if (o && o !== a) {
      if (state.rng.chance(T.strayChance)) {
        state.log.push(`🎯 O tiro perdido de ${a.name} acerta ${o.name}!`);
        damage(state, o, Math.max(1, Math.round(mid * T.strayDamage)), a, undefined);
      }
      return;
    }
    const t = tileAt(state.map, x, y)!;
    const l = stack.slabAt(t, h);
    if (l > 0) {
      if (hitPiece(state, x, y, l, Math.max(1, Math.round(mid * T.strayDamage)))) settleStructures(state);
      return;
    }
    if (t.p && PROPS[t.p].blocksLos) {
      damageProp(state, x, y, Math.max(1, Math.round(mid * T.strayDamage)));
      return;
    }
    if (t.h > h) return;
  }
}

// ───────────────────────────── luz e furtividade ─────────────────────────────

/** Modificador de Esconder pela luz: aceso à noite atrapalha, escuro ajuda; sob teto de dia, sombra. */
export function hideLightMod(state: BattleState, u: BattleUnit, lit: Set<number>): number {
  const t = tileAt(state.map, u.x, u.y);
  if (state.timeOfDay === 'noite') return lit.has(idx(state.map, u.x, u.y)) ? T.hideLit : T.hideDark;
  if (t && stack.covered(t, stack.unitLevel(state.map, u))) return T.hideShade;
  return 0;
}

