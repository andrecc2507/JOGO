import { DB, type Element, type FxCondition, type FxReaction, type FxStance, type FxStatus, type SkillDef, type SkillFx } from '../data';
import { addStatus, applyElementToTile, removeStatus, tileEffectsOnUnit, unitAt } from './elements';
import {
  allies,
  areaOf,
  damage,
  faceTowards,
  finishAction,
  heal,
  isFree,
  opponents,
  resolveAttack,
  type SkillLike,
} from './engine';
import { DIRS, inBounds, isWalkable, manhattan, tileAt } from './map';
import { STATUS_INFO, type BattleState, type BattleUnit, type StatusId } from './types';
import { unitFromEnemy } from './units';

/**
 * Efeitos das criaturas do bestiário. Cada habilidade é descrita por blocos genéricos
 * (`SkillFx`) e este módulo os resolve: passivas, reações, status, agarrões, invocações,
 * posturas e as mecânicas diferenciadas de épicos e lendários.
 */

/** Máximo de invocações vivas por criatura. */
export const MAX_SUMMONS = 8;
/** Multiplicador de dano quando um golpe de criatura atinge mais de 2 alvos. */
export const AREA_FALLOFF = 0.7;
/** Turnos até a primeira invocação ativa ficar pronta. */
export const SUMMON_START_DELAY = 2;
/** Invocações chegam este tanto de níveis abaixo de quem invoca. */
export const SUMMON_LEVEL_GAP = 12;
/** Golpe que solta um agarrão: fração da vida máxima do captor. */
export const GRAB_BREAK_PCT = 0.12;
/** Dano de sangramento / agarrão / prisão por turno (fração da vida máxima). */
export const DOT_PCT = { sangramento: 0.05, preso: 0.06, aprisionado: 0.08 } as const;
/** Dano quando a marca expira (fração da vida máxima). */
export const MARK_PCT = 0.15;

// ───────────────────────────── consultas ─────────────────────────────

export function skillsOf(u: BattleUnit): SkillDef[] {
  return u.skills.map((id) => DB.skills[id]).filter((s): s is SkillDef => !!s);
}

/** Blocos de efeito das passivas e reações da unidade. */
export function passiveFx(u: BattleUnit): SkillFx[] {
  return skillsOf(u)
    .filter((s) => s.passive && s.fx)
    .map((s) => s.fx!);
}

export function bag(u: BattleUnit): Record<string, number | string> {
  return (u.fx ??= {});
}

export function num(u: BattleUnit, key: string): number {
  const v = u.fx?.[key];
  return typeof v === 'number' ? v : 0;
}

export function isFera(s: SkillLike | SkillDef | undefined): boolean {
  return !!s && DB.skills[s.id]?.classId === 'fera';
}

function adjacentProp(state: BattleState, u: BattleUnit, props: string[]): boolean {
  for (const [dx, dy] of [[0, 0], ...DIRS]) {
    const t = tileAt(state.map, u.x + dx!, u.y + dy!);
    if (t?.p && props.includes(t.p)) return true;
  }
  return false;
}

export function inWater(state: BattleState, u: BattleUnit): boolean {
  const t = tileAt(state.map, u.x, u.y);
  if (t?.s === 'agua' || t?.s === 'agua_eletrica') return true;
  return DIRS.some(([dx, dy]) => tileAt(state.map, u.x + dx, u.y + dy)?.t === 'agua_funda');
}

export function checkCondition(state: BattleState, u: BattleUnit, cond: FxCondition | undefined): boolean {
  if (!cond) return true;
  const t = tileAt(state.map, u.x, u.y);
  switch (cond) {
    case 'snow':
      return t?.t === 'neve' || t?.s === 'gelo';
    case 'tree':
      return adjacentProp(state, u, ['arvore', 'pinheiro']);
    case 'bush':
      return adjacentProp(state, u, ['arbusto', 'arvore', 'pinheiro', 'cacto']);
    case 'water':
      return inWater(state, u);
    case 'sand':
      return t?.t === 'areia';
    case 'grass':
      return t?.t === 'grama';
    case 'still':
      return num(u, 'still') === 1;
    case 'still_sand':
      return num(u, 'still') === 1 && t?.t === 'areia';
    case 'still_water':
      return num(u, 'still') === 1 && inWater(state, u);
    case 'low_hp':
      return u.hp < u.maxHp * 0.35;
    case 'not_hit':
      return num(u, 'hitRound') !== state.round;
    case 'hidden':
      return u.hidden;
  }
}

export function isImmune(u: BattleUnit, status: string): boolean {
  if (passiveFx(u).some((f) => f.immune?.includes(status))) return true;
  const once = passiveFx(u).find((f) => f.ignoreOnce === status);
  if (once && !num(u, `once:${status}`)) {
    bag(u)[`once:${status}`] = 1;
    return true;
  }
  return false;
}

/** Aplica um status respeitando imunidades e acúmulos (lento + lento = imobilizado). */
export function applyStatus(state: BattleState, u: BattleUnit, st: FxStatus, source?: BattleUnit): boolean {
  if (!u.alive || !(st.id in STATUS_INFO)) return false;
  const id = st.id as StatusId;
  if (isImmune(u, id)) {
    state.log.push(`🛡 ${u.name} resiste a ${STATUS_INFO[id].name}.`);
    return false;
  }
  if (id === 'lento' && u.statuses.lento) addStatus(u, 'imobilizado', 1);
  if ((id === 'preso' || id === 'aprisionado') && source) u.boundBy = source.uid;
  if (id === 'camuflado') u.hidden = true;
  addStatus(u, id, st.turns);
  return true;
}

export function clearDebuffs(u: BattleUnit): void {
  for (const k of Object.keys(u.statuses) as StatusId[]) if (STATUS_INFO[k].debuff) delete u.statuses[k];
  u.boundBy = undefined;
}

function hasStatusLike(state: BattleState, u: BattleUnit, spec: string): boolean {
  return spec.split('|').some((s) => {
    if (s === 'ferido') return u.hp < u.maxHp;
    if (s === 'fraco') return u.hp < u.maxHp * 0.3 || (u.maxMp > 0 && u.mp <= 0);
    if (s === 'escondido') return u.hidden;
    if (s === 'na_agua') return inWater(state, u);
    if (s.startsWith('el:')) return u.element === s.slice(3);
    return !!u.statuses[s as StatusId];
  });
}

/** Postura atual (ciclos de Quimera, Estações, Maré…). */
export function currentStance(state: BattleState, u: BattleUnit): FxStance | undefined {
  for (const f of passiveFx(u)) {
    if (!f.stances?.list.length) continue;
    const i = Math.floor((state.round - 1) / Math.max(1, f.stances.every)) % f.stances.list.length;
    return f.stances.list[i];
  }
  return undefined;
}

// ───────────────────────────── movimento ─────────────────────────────

export function isRooted(u: BattleUnit): boolean {
  return !!(u.statuses.imobilizado || u.statuses.preso || u.statuses.aprisionado || u.statuses.semente);
}

export function moveDelta(u: BattleUnit): number {
  let d = 0;
  if (u.statuses.lento) d -= 2;
  if (u.statuses.derrubado) d -= 2;
  if (u.statuses.veloz) d += 2;
  return d;
}

export function rateMult(u: BattleUnit): number {
  let m = 1;
  if (u.statuses.lento) m *= 0.7;
  if (u.statuses.veloz) m *= 1.3;
  return m;
}

export function canFly(u: BattleUnit): boolean {
  return passiveFx(u).some((f) => f.fly);
}

/** Pode atacar fisicamente (medo e desarme bloqueiam). */
export function canStrike(u: BattleUnit): boolean {
  return !u.statuses.medo && !u.statuses.desarmado;
}

// ───────────────────────────── acerto e dano ─────────────────────────────

export interface HitMods {
  accuracy: number;
  evasion: number;
  dmg: number;
  def: number;
  crit: number;
  /** O golpe não pode causar dano (intangível, imune a magia…). */
  immune: boolean;
}

/** Modificadores de acerto e dano vindos de status, passivas, posturas e da própria habilidade. */
export function hitMods(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean, sk?: SkillLike): HitMods {
  const m: HitMods = { accuracy: 0, evasion: 0, dmg: 1, def: 1, crit: 0, immune: false };
  const dist = manhattan(a.x, a.y, d.x, d.y);
  // atacante
  if (a.statuses.cegado) m.accuracy -= 25;
  if (a.statuses.confuso) m.accuracy -= 30;
  if (a.statuses.afiado) m.crit += 25;
  if (a.statuses.enfraquecido) m.dmg *= 0.75;
  for (const f of passiveFx(a)) {
    if (f.vs && hasStatusLike(state, d, f.vs.status)) m.dmg *= f.vs.mult;
    if (f.pierce) m.def *= 1 - f.pierce;
    if (f.fury && a.hp < a.maxHp * 0.5) m.dmg *= f.fury;
    if (f.pack) {
      const n = allies(state, a).filter((o) => o !== a && o.family === f.pack!.family).length;
      m.dmg *= 1 + f.pack.mult * n;
    }
    if (f.flank && allies(state, a).some((o) => o !== a && manhattan(o.x, o.y, d.x, d.y) === 1)) m.dmg *= 1 + f.flank;
    if (f.critBonus) m.crit += f.critBonus;
  }
  const stanceA = currentStance(state, a);
  if (stanceA?.dmg) m.dmg *= stanceA.dmg;
  const momentum = num(a, 'momentum');
  if (momentum && !magic) m.dmg *= 1 + momentum * 0.35;
  const tide = num(a, 'tide');
  if (tide) m.dmg *= 1 + tide * 0.1;
  const fx = sk ? DB.skills[sk.id]?.fx : undefined;
  if (fx?.vs && hasStatusLike(state, d, fx.vs.status)) m.dmg *= fx.vs.mult;
  if (fx?.crit) m.crit += fx.crit;
  if (fx?.pierce) m.def *= 1 - fx.pierce;
  if (fx?.fromHiding && a.hidden) m.dmg *= fx.fromHiding;
  // defensor
  if (d.statuses.derrubado) m.evasion -= 20;
  if (d.statuses.confuso) m.evasion -= 15;
  if (d.statuses.duplicatas) m.evasion += 30;
  if (d.statuses.fortificado) m.def *= 1.5;
  if (d.statuses.quebrado) m.def *= 0.5;
  if (d.statuses.intangivel && !magic) m.immune = true;
  if (num(d, 'thermalBroken') && !magic) m.dmg *= 1.5;
  for (const f of passiveFx(d)) {
    if (f.evasion && checkCondition(state, d, f.when)) m.evasion += f.evasion;
    if (f.reduce) {
      if (!magic && f.reduce.physical) m.dmg *= 1 - f.reduce.physical;
      if (!magic && dist > 1 && f.reduce.ranged) m.dmg *= 1 - f.reduce.ranged;
      if (!magic && dist <= 1 && f.reduce.melee) m.dmg *= 1 - f.reduce.melee;
      if (magic && f.reduce.magic) m.dmg *= 1 - f.reduce.magic;
    }
  }
  const stanceD = currentStance(state, d);
  if (stanceD?.evasion) m.evasion += stanceD.evasion;
  if (stanceD?.magicImmune && magic) m.immune = true;
  return m;
}

/** Reação do defensor que impede o golpe. Retorna true se o golpe foi evitado. */
export function preventingReaction(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean, crit: boolean, amount: number): boolean {
  if (a.team === d.team) return false;
  for (const s of skillsOf(d)) {
    const r = s.fx?.react;
    if (!r || !['dodge', 'negate', 'reflect', 'retreat', 'swap'].includes(r.do)) continue;
    if (!reactionFires(state, a, d, s.id, r, magic, crit, amount)) continue;
    state.log.push(`⟲ ${d.name}: ${s.name}!`);
    state.events.push({ type: 'text', x: d.x, y: d.y, text: s.name, color: '#b2ebf2' });
    if (r.damage) damage(state, a, r.damage + Math.round(d.level * 0.5), d, r.element);
    if (r.do === 'reflect') damage(state, a, amount, d, undefined);
    else if (r.do === 'retreat') push(state, a, d, 2);
    else if (r.do === 'swap') swapEnemies(state, d);
    else state.events.push({ type: 'miss', uid: d.uid });
    return true;
  }
  return false;
}

/** Reações depois de ser atingido: contra-ataque, espinhos, status no atacante. */
export function afterHitReactions(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean, crit: boolean, amount: number): void {
  if (a.team === d.team || !a.alive) return;
  const thorns = currentStance(state, d)?.thorns;
  if (thorns && !magic && manhattan(a.x, a.y, d.x, d.y) <= 1) damage(state, a, Math.max(1, Math.round(amount * thorns)), d, undefined);
  for (const s of skillsOf(d)) {
    const r = s.fx?.react;
    if (!r || (r.do !== 'counter' && r.do !== 'status' && r.do !== 'split')) continue;
    if (r.do === 'counter' && (!d.alive || manhattan(a.x, a.y, d.x, d.y) > 1)) continue;
    if (!reactionFires(state, a, d, s.id, r, magic, crit, amount)) continue;
    state.log.push(`⟲ ${d.name}: ${s.name}!`);
    if (r.damage) damage(state, a, r.damage + Math.round(d.level * 0.5), d, r.element ?? s.element);
    if (r.status) applyStatus(state, a, r.status, d);
    if (r.do === 'split' && d.alive && d.enemyId && !d.summonedBy) summon(state, d, d.enemyId, 1);
    if (r.do === 'counter' && a.alive && d.alive) resolveAttack(state, d, a, 'physical', s.power, s.element, 0, 1);
    if (!a.alive) return;
  }
}

function reactionFires(state: BattleState, a: BattleUnit, d: BattleUnit, id: string, r: FxReaction, magic: boolean, crit: boolean, amount: number): boolean {
  if (!d.alive || d.statuses.atordoado || d.statuses.semente) return false;
  const dist = manhattan(a.x, a.y, d.x, d.y);
  const match =
    r.on === 'any' ||
    (r.on === 'magic' && magic) ||
    (r.on === 'physical' && !magic) ||
    (r.on === 'melee' && !magic && dist <= 1) ||
    (r.on === 'ranged' && !magic && dist > 1) ||
    (r.on === 'crit' && crit) ||
    (r.on === 'heavy' && amount >= d.maxHp * 0.15);
  if (!match) return false;
  const key = `react:${id}`;
  if (num(d, 'reactRound') !== state.round) {
    for (const k of Object.keys(bag(d))) if (k.startsWith('react:')) delete bag(d)[k];
    bag(d).reactRound = state.round;
  }
  if (num(d, key) >= (r.perRound ?? 1)) return false;
  if (!state.rng.chance((r.chance ?? 100) / 100)) return false;
  bag(d)[key] = num(d, key) + 1;
  return true;
}

function swapEnemies(state: BattleState, d: BattleUnit): void {
  const list = opponents(state, d);
  if (list.length < 2) return;
  const a = state.rng.pick(list);
  const b = state.rng.pick(list.filter((o) => o !== a));
  [a.x, b.x] = [b.x, a.x];
  [a.y, b.y] = [b.y, a.y];
  state.log.push(`✧ ${a.name} e ${b.name} trocaram de lugar!`);
}

/** Ajusta o dano antes de aplicar: invulnerabilidades, carma, escudo e fios do destino. */
export function beforeDamage(state: BattleState, target: BattleUnit, amount: number, attacker: BattleUnit | undefined, el?: Element): number {
  if (amount <= 0) return 0;
  if (el && passiveFx(target).some((f) => f.absorb?.includes(el))) {
    state.log.push(`✚ ${target.name} absorve o ${el}.`);
    heal(state, target, amount);
    return 0;
  }
  if (passiveFx(target).some((f) => f.minionShield) && state.units.some((o) => o.alive && o.summonedBy === target.uid)) {
    state.events.push({ type: 'text', x: target.x, y: target.y, text: 'IMUNE', color: '#ffd54f' });
    return 0;
  }
  if (attacker && target.fx?.karma === attacker.uid) {
    state.log.push(`⚖ O carma reverte o golpe de ${attacker.name} em cura para ${target.name}.`);
    heal(state, target, amount);
    return 0;
  }
  if (target.shield) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
    if (absorbed) state.events.push({ type: 'text', x: target.x, y: target.y, text: `🛡${absorbed}`, color: '#90caf9' });
  }
  if (target.links?.length && amount > 0) {
    const linked = target.links.map((id) => state.units.find((u) => u.uid === id)).filter((u): u is BattleUnit => !!u && u.alive);
    if (linked.length) {
      const share = Math.round(amount / (linked.length + 1));
      for (const l of linked) damage(state, l, share, attacker, undefined);
      amount = share;
    }
  }
  return amount;
}

/** Consequências de ter recebido dano (agarrões, limiares de vida, mecânicas únicas). */
export function afterDamage(state: BattleState, target: BattleUnit, amount: number, attacker: BattleUnit | undefined, el: Element | undefined, magic: boolean): void {
  if (amount <= 0) return;
  const b = bag(target);
  b.hitRound = state.round;
  if (attacker && attacker.team !== target.team) b[`k:${attacker.uid}`] = num(target, `k:${attacker.uid}`) + amount;
  // Golpe forte (ou o elemento fraco do captor) solta quem esta unidade agarrou.
  if (amount >= target.maxHp * GRAB_BREAK_PCT || (el && passiveFx(target).concat(skillsOf(target).map((s) => s.fx ?? {})).some((f) => f.releaseOn?.includes(el)))) releaseBound(state, target);
  if (num(target, 'hourglass') > 0) b.hgDmg = num(target, 'hgDmg') + amount;
  if (num(target, 'momentum') && amount >= target.maxHp * 0.1) {
    b.momentum = 0;
    state.log.push(`${target.name} perdeu o embalo!`);
  }
  if (!target.alive || target.hp <= 0) return;
  const pct = target.hp / target.maxHp;
  const prev = num(target, 'lastPct') || 1;
  b.lastPct = pct;
  for (const f of passiveFx(target)) {
    if (f.summonAt) for (const th of f.summonAt.thresholds) if (prev > th && pct <= th) for (const s of f.summonAt.list) summon(state, target, s.id, s.count);
    if (f.special === 'frozen_blood' && prev > 0.5 && pct <= 0.5) {
      state.log.push(`❄ O sangue de ${target.name} congela o chão ao redor!`);
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 3) continue;
          const t = tileAt(state.map, target.x + dx, target.y + dy);
          if (t && t.t !== 'agua_funda') {
            t.s = 'gelo';
            t.sTtl = 8;
          }
        }
      bag(target).frozenBlood = 1;
    }
    if (f.special === 'hydra' && el !== 'fogo' && el !== 'veneno')
      for (const th of [0.66, 0.33])
        if (prev > th && pct <= th) {
          b.heads = num(target, 'heads') + 1;
          state.log.push(`🐍 Duas cabeças nascem no lugar da cortada! (${target.name})`);
        }
    if (f.special === 'thermal_shock' && el === 'gelo' && !num(target, 'thermalBroken')) {
      b.thermalBroken = 1;
      target.element = undefined;
      state.log.push(`💥 Choque térmico! A carapaça de ${target.name} explode — agora é vulnerável a golpes físicos.`);
      burst(state, target, 2, 8, 'fogo');
    }
    if (f.special === 'tide_growth' && el === 'agua') grow(state, target);
    if (f.special === 'straw_cloak' && el === 'fogo' && target.element !== 'fogo') {
      target.element = 'fogo';
      addStatus(target, 'queimando', 2);
      state.log.push(`🔥 O manto de palha de ${target.name} pega fogo — seus golpes agora queimam!`);
    }
    if (f.special === 'pain_echo' && magic && el) {
      const victims = opponents(state, target);
      if (victims.length) {
        const v = state.rng.pick(victims);
        state.log.push(`🐺 Uma cabeça de ${target.name} ecoa a dor em ${v.name}!`);
        damage(state, v, Math.max(1, Math.round(amount * 0.5)), target, el);
      }
    }
  }
}

function grow(state: BattleState, u: BattleUnit): void {
  if (num(u, 'tide') >= 5) return;
  bag(u).tide = num(u, 'tide') + 1;
  const extra = Math.round(u.maxHp * 0.2);
  u.maxHp += extra;
  u.hp += extra;
  state.log.push(`🌊 ${u.name} absorve a água e cresce!`);
}

export function releaseBound(state: BattleState, captor: BattleUnit): void {
  for (const o of state.units) {
    if (o.boundBy !== captor.uid) continue;
    o.boundBy = undefined;
    if (o.statuses.preso || o.statuses.aprisionado) state.log.push(`${o.name} se soltou!`);
    removeStatus(o, 'preso');
    removeStatus(o, 'aprisionado');
  }
}

/** Chamado quando a vida chega a zero. Retorna true se a unidade não morre (vira semente/ovo). */
export function onLethal(state: BattleState, u: BattleUnit, el?: Element): boolean {
  const b = passiveFx(u).find((f) => f.deathBurst)?.deathBurst;
  if (b && !num(u, 'burst')) {
    bag(u).burst = 1;
    state.log.push(`💥 ${u.name} explode!`);
    burst(state, u, b.radius, b.power, b.element);
  }
  const rev = passiveFx(u).find((f) => f.revive)?.revive;
  if (rev && !num(u, 'revived') && !(rev.unless && el === rev.unless)) {
    bag(u).revived = 1;
    bag(u).revivePct = rev.pct;
    u.hp = Math.max(1, Math.round(u.maxHp * 0.12));
    u.statuses = { semente: rev.rounds };
    u.shield = 0;
    releaseBound(state, u);
    state.log.push(`✿ ${u.name} se fecha numa casca! Destruam-na em ${rev.rounds} turnos ou ela renasce.`);
    return true;
  }
  return false;
}

/** Efeitos ao morrer de vez. */
export function onDeath(state: BattleState, u: BattleUnit): void {
  releaseBound(state, u);
  for (const o of state.units) if (o.links) o.links = o.links.filter((id) => id !== u.uid);
  u.links = undefined;
}

function burst(state: BattleState, src: BattleUnit, radius: number, power: number, el?: Element): void {
  for (const o of [...state.units]) {
    if (!o.alive || o === src || o.team === src.team) continue;
    if (manhattan(o.x, o.y, src.x, src.y) > radius) continue;
    damage(state, o, Math.round(power + src.level * 0.8), src, el);
  }
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > radius || !inBounds(state.map, src.x + dx, src.y + dy)) continue;
      state.events.push({ type: 'fx', x: src.x + dx, y: src.y + dy, element: el ?? 'hit' });
      if (el) applyElementToTile(state, src.x + dx, src.y + dy, el);
    }
}

// ───────────────────────────── turnos e rodadas ─────────────────────────────

/** Início do turno de uma criatura/unidade. Retorna true se o turno é perdido. */
export function turnStart(state: BattleState, u: BattleUnit): boolean {
  // Captor caiu ou se afastou: solta o agarrão.
  if (u.boundBy) {
    const c = state.units.find((o) => o.uid === u.boundBy);
    if (!c || !c.alive || (u.statuses.preso && manhattan(c.x, c.y, u.x, u.y) > 1)) {
      u.boundBy = undefined;
      removeStatus(u, 'preso');
      removeStatus(u, 'aprisionado');
    }
  }
  const dot = (key: keyof typeof DOT_PCT, label: string) => {
    if (u.statuses[key]) {
      const captor = key === 'sangramento' ? undefined : state.units.find((o) => o.uid === u.boundBy);
      damage(state, u, Math.max(1, Math.round(u.maxHp * DOT_PCT[key]) + 1), captor, undefined);
      if (u.alive) state.log.push(`${label} ${u.name} sofre dano.`);
    }
  };
  dot('sangramento', '🩸');
  dot('preso', '✊');
  dot('aprisionado', '⛓');
  if (!u.alive) return true;
  // Regeneração.
  let regen = u.statuses.regenerando ? 0.08 : 0;
  for (const f of passiveFx(u)) if (f.regen && checkCondition(state, u, f.when)) regen += f.regen;
  const stance = currentStance(state, u);
  if (stance?.regen) regen += stance.regen;
  if (regen > 0 && u.hp < u.maxHp && !u.statuses.semente) heal(state, u, Math.max(1, Math.round(u.maxHp * regen)));
  if (passiveFx(u).some((f) => f.special === 'tide_growth') && inWater(state, u)) grow(state, u);
  if (passiveFx(u).some((f) => f.bloodSense) && opponents(state, u).some((o) => o.statuses.sangramento)) addStatus(u, 'veloz', 1);
  // Postura mudou?
  if (stance && bag(u).stance !== stance.name) {
    bag(u).stance = stance.name;
    state.log.push(`◐ ${u.name} assume: ${stance.name}.`);
    state.events.push({ type: 'text', x: u.x, y: u.y, text: stance.name, color: '#ffcc80' });
    if (stance.enemyStatus) for (const o of opponents(state, u)) if (manhattan(o.x, o.y, u.x, u.y) <= 3) applyStatus(state, o, stance.enemyStatus, u);
    if (stance.reflect) addStatus(u, 'refletindo', 2);
    if (stance.selfStatus) applyStatus(state, u, stance.selfStatus, u);
  }
  // Perde o turno.
  if (u.statuses.semente) {
    const left = (u.statuses.semente ?? 1) - 1;
    if (left <= 0) {
      removeStatus(u, 'semente');
      u.hp = Math.max(u.hp, Math.round(u.maxHp * (num(u, 'revivePct') || 0.5)));
      addStatus(u, 'inspirado', 3);
      state.log.push(`🌱 ${u.name} renasceu, mais forte!`);
      state.events.push({ type: 'heal', uid: u.uid, amount: u.hp });
      return false;
    }
    u.statuses.semente = left;
    return true;
  }
  if (u.statuses.atordoado) {
    removeStatus(u, 'atordoado');
    state.log.push(`💫 ${u.name} está atordoado e perde o turno.`);
    return true;
  }
  if (u.statuses.aprisionado) {
    const left = (u.statuses.aprisionado ?? 1) - 1;
    if (left <= 0) {
      removeStatus(u, 'aprisionado');
      u.boundBy = undefined;
    } else u.statuses.aprisionado = left;
    state.log.push(`⛓ ${u.name} está aprisionado.`);
    return true;
  }
  return false;
}

/** Status que expirou no início do turno. */
export function onStatusExpired(state: BattleState, u: BattleUnit, id: StatusId): void {
  if (id === 'marcado') {
    state.log.push(`◎ A marca em ${u.name} explode!`);
    damage(state, u, Math.max(1, Math.round(u.maxHp * MARK_PCT)), undefined, undefined);
  }
  if (id === 'camuflado' && u.hidden) {
    u.hidden = false;
    state.log.push(`${u.name} reapareceu.`);
  }
  if (id === 'preso') u.boundBy = undefined;
}

/** Fim de turno: registra se a unidade ficou parada (para passivas "imóvel"). */
export function turnEnd(state: BattleState, u: BattleUnit): void {
  bag(u).still = state.turn.moved ? 0 : 1;
}

/** Uma rodada de ambiente para as criaturas: auras, tempestade, invocações periódicas, carma. */
export function roundTick(state: BattleState): void {
  for (const u of [...state.units]) {
    if (!u.alive || u.statuses.semente) continue;
    for (const f of passiveFx(u)) {
      if (f.aura) {
        for (const o of opponents(state, u)) {
          if (manhattan(o.x, o.y, u.x, u.y) > f.aura.radius) continue;
          if (f.aura.status) applyStatus(state, o, f.aura.status, u);
          if (f.aura.damagePct) damage(state, o, Math.max(1, Math.round(o.maxHp * f.aura.damagePct)), u, undefined);
        }
      }
      if (f.summonEvery && state.round % f.summonEvery.rounds === 0) for (const s of f.summonEvery.list) summon(state, u, s.id, s.count);
      if (f.special === 'momentum' && num(u, 'hitRound') !== state.round) bag(u).momentum = Math.min(4, num(u, 'momentum') + 1);
      if (f.special === 'karma') {
        let best = '';
        let max = 0;
        for (const k of Object.keys(bag(u)))
          if (k.startsWith('k:')) {
            if (num(u, k) > max) {
              max = num(u, k);
              best = k.slice(2);
            }
            delete bag(u)[k];
          }
        if (best) {
          bag(u).karma = best;
          bag(u).karmaLeft = 2;
          const who = state.units.find((o) => o.uid === best);
          if (who) state.log.push(`⚖ ${u.name} marca ${who.name}: seus golpes viram cura por 2 rodadas.`);
        } else if (num(u, 'karmaLeft') > 0) {
          bag(u).karmaLeft = num(u, 'karmaLeft') - 1;
          if (num(u, 'karmaLeft') <= 0) delete bag(u).karma;
        }
      }
    }
    // Tempestade (Olho da Tempestade): fora do olho, o frio fere.
    if (num(u, 'storm') > 0) {
      bag(u).storm = num(u, 'storm') - 1;
      const ex = Math.max(0, Math.min(state.map.w - 1, num(u, 'eyeX') + state.rng.int(-2, 2)));
      const ey = Math.max(0, Math.min(state.map.h - 1, num(u, 'eyeY') + state.rng.int(-2, 2)));
      bag(u).eyeX = ex;
      bag(u).eyeY = ey;
      for (const o of opponents(state, u)) if (manhattan(o.x, o.y, ex, ey) > 2) damage(state, o, Math.max(1, Math.round(o.maxHp * 0.08)), u, 'gelo');
      state.log.push(`🌨 A nevasca castiga quem está fora do olho da tempestade (${ex}, ${ey}).`);
    }
    // Ampulheta do Destino.
    if (num(u, 'hourglass') > 0) {
      bag(u).hourglass = num(u, 'hourglass') - 1;
      if (num(u, 'hourglass') <= 0) {
        if (num(u, 'hgDmg') < u.maxHp * 0.25) {
          const restore = Math.max(0, num(u, 'hgHp') - u.hp);
          if (restore > 0) heal(state, u, restore);
          state.log.push(`⌛ A ampulheta virou: ${u.name} voltou no tempo!`);
        } else state.log.push(`⌛ A ampulheta de ${u.name} se partiu.`);
      }
    }
    if (u.links?.length && num(u, 'linkLeft') > 0) {
      bag(u).linkLeft = num(u, 'linkLeft') - 1;
      const linked = u.links.map((id) => state.units.find((o) => o.uid === id)).filter((o): o is BattleUnit => !!o && o.alive);
      const far = linked.length === 2 && manhattan(linked[0]!.x, linked[0]!.y, linked[1]!.x, linked[1]!.y) > 6;
      if (num(u, 'linkLeft') <= 0 || far) {
        u.links = undefined;
        state.log.push('Os fios do destino se romperam.');
      }
    }
  }
}

/** Início da batalha: invocações iniciais. */
export function battleStart(state: BattleState): void {
  for (const u of [...state.units]) {
    for (const f of passiveFx(u)) if (f.summonStart) for (const s of f.summonStart) summon(state, u, s.id, s.count);
    // Invocações ativas só ficam prontas depois de alguns turnos.
    for (const s of skillsOf(u)) if (s.fx?.summon) u.cooldowns[s.id] = Math.max(u.cooldowns[s.id] ?? 0, SUMMON_START_DELAY);
  }
}

// ───────────────────────────── invocação e deslocamento ─────────────────────────────

export function summon(state: BattleState, owner: BattleUnit, id: string, count: number): BattleUnit[] {
  const def = DB.enemies[id];
  if (!def) return [];
  const out: BattleUnit[] = [];
  for (let i = 0; i < count; i++) {
    if (state.units.filter((o) => o.alive && o.summonedBy === owner.uid).length >= MAX_SUMMONS) break;
    const spot = freeTileNear(state, owner.x, owner.y, 4);
    if (!spot) break;
    const u = unitFromEnemy(def, Math.max(1, owner.level - SUMMON_LEVEL_GAP), state.rng);
    u.team = owner.team;
    u.summonedBy = owner.uid;
    u.x = spot[0];
    u.y = spot[1];
    u.facing = owner.facing;
    u.gauge = 0;
    u.xpReward = Math.round((u.xpReward ?? 0) * 0.5);
    state.units.push(u);
    out.push(u);
  }
  if (out.length) state.log.push(`✶ ${owner.name} invoca ${out.length}× ${def.name}!`);
  return out;
}

export function freeTileNear(state: BattleState, x: number, y: number, radius: number): [number, number] | null {
  for (let r = 1; r <= radius; r++) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        const t = tileAt(state.map, tx, ty);
        if (t && isWalkable(t) && isFree(state, tx, ty)) ring.push([tx, ty]);
      }
    if (ring.length) return state.rng.pick(ring);
  }
  return null;
}

function stepOk(state: BattleState, u: BattleUnit, x: number, y: number): boolean {
  const t = tileAt(state.map, x, y);
  const cur = tileAt(state.map, u.x, u.y);
  return !!t && !!cur && isWalkable(t) && isFree(state, x, y, u) && Math.abs(t.h - cur.h) <= 2;
}

/** Empurra `target` para longe de `from` (ou puxa, com n negativo). */
export function push(state: BattleState, from: BattleUnit, target: BattleUnit, n: number): void {
  if (!target.alive || n === 0 || passiveFx(target).some((f) => f.immune?.includes('empurrao'))) return;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  let dir: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
  if (n < 0) dir = [-dir[0], -dir[1]];
  const steps = Math.abs(n);
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const nx = target.x + dir[0];
    const ny = target.y + dir[1];
    if (n < 0 && manhattan(nx, ny, from.x, from.y) < 1) break;
    if (!stepOk(state, target, nx, ny)) {
      if (n > 0) {
        damage(state, target, Math.max(1, Math.round(target.maxHp * 0.05)), from, undefined);
        state.log.push(`${target.name} bate contra o obstáculo!`);
      }
      break;
    }
    target.x = nx;
    target.y = ny;
    moved++;
  }
  if (moved) {
    const d = tileEffectsOnUnit(state, target);
    if (d) damage(state, target, d, undefined, undefined);
  }
}

function moveNextTo(state: BattleState, u: BattleUnit, t: BattleUnit, behind: boolean): void {
  if (manhattan(u.x, u.y, t.x, t.y) === 1 && !behind) return;
  const options: [number, number][] = [];
  for (const [dx, dy] of DIRS) {
    const nx = t.x + dx;
    const ny = t.y + dy;
    const tile = tileAt(state.map, nx, ny);
    if (tile && isWalkable(tile) && isFree(state, nx, ny, u)) options.push([nx, ny]);
  }
  if (!options.length) return;
  const score = ([x, y]: [number, number]) => (behind ? -manhattan(x, y, u.x, u.y) : manhattan(x, y, u.x, u.y));
  options.sort((a, b) => score(a) - score(b));
  [u.x, u.y] = options[0]!;
  const d = tileEffectsOnUnit(state, u);
  if (d) damage(state, u, d, undefined, undefined);
}

// ───────────────────────────── uso de habilidades ─────────────────────────────

/** Requisitos extras de uma habilidade de criatura. */
export function creatureUsable(state: BattleState, u: BattleUnit, def: SkillDef): boolean {
  const fx = def.fx ?? {};
  if (!checkCondition(state, u, fx.requires)) return false;
  if (fx.hide) {
    if (u.hidden) return false;
    if (fx.hide !== 'any' && !checkCondition(state, u, fx.hide === 'bush' ? 'bush' : fx.hide)) return false;
  }
  if ((def.kind === 'physical' || def.kind === 'ranged') && !canStrike(u)) return false;
  if (fx.summon && state.units.filter((o) => o.alive && o.summonedBy === u.uid).length >= MAX_SUMMONS) return false;
  if (fx.randomTargets && !opponents(state, u).length) return false;
  return true;
}

function randomVictims(state: BattleState, u: BattleUnit, n: number, spareOne: boolean): BattleUnit[] {
  const pool = opponents(state, u).filter((o) => !o.hidden || passiveFx(u).some((f) => f.seeHidden));
  const list = [...pool];
  if (spareOne && list.length > 1) list.splice(state.rng.int(0, list.length - 1), 1);
  if (n >= list.length) return list;
  const out: BattleUnit[] = [];
  while (out.length < n && list.length) out.push(list.splice(state.rng.int(0, list.length - 1), 1)[0]!);
  return out;
}

/** Executa uma habilidade de criatura (custos e recarga já aplicados). */
export function castCreatureSkill(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number): boolean {
  const def = DB.skills[s.id]!;
  const fx = def.fx ?? {};
  const magic = s.kind === 'magic';
  let keepHidden = false;

  // ── efeitos em si ──
  if (fx.hide) {
    u.hidden = true;
    const turns = def.value ?? 2;
    addStatus(u, fx.hide === 'snow' ? 'submerso' : 'camuflado', turns);
    state.log.push(fx.hide === 'snow' ? `❄ ${u.name} mergulhou na neve e sumiu de vista.` : `🍃 ${u.name} sumiu de vista.`);
    keepHidden = true;
  }
  if (fx.teleport && s.target === 'tile') {
    const t = tileAt(state.map, x, y);
    if (t && isWalkable(t) && isFree(state, x, y, u)) {
      state.events.push({ type: 'fx', x: u.x, y: u.y, element: 'sombra' });
      u.x = x;
      u.y = y;
      state.log.push(`✧ ${u.name} reaparece em outro ponto.`);
      const d = tileEffectsOnUnit(state, u);
      if (d) damage(state, u, d, undefined, undefined);
    }
  }
  if (fx.cleanse) clearDebuffs(u);
  if (fx.shield) u.shield = (u.shield ?? 0) + Math.round(u.maxHp * fx.shield);
  if (fx.self) applyStatus(state, u, fx.self, u);
  if (fx.summon) for (const sm of fx.summon) summon(state, u, sm.id, sm.count);
  if (fx.special === 'storm_eye') {
    bag(u).storm = def.value ?? 3;
    bag(u).eyeX = Math.floor(state.map.w / 2);
    bag(u).eyeY = Math.floor(state.map.h / 2);
    state.log.push(`🌨 ${u.name} invoca a nevasca! Fiquem no olho da tempestade.`);
  }
  if (fx.special === 'hourglass') {
    bag(u).hourglass = def.value ?? 4;
    bag(u).hgHp = u.hp;
    bag(u).hgDmg = 0;
    state.log.push(`⌛ ${u.name} ativa a Ampulheta do Destino: causem ${Math.round(u.maxHp * 0.25)} de dano antes que a areia acabe!`);
  }
  if (fx.reveal) {
    for (const o of opponents(state, u))
      if (o.hidden) {
        o.hidden = false;
        state.log.push(`👁 ${o.name} foi revelado!`);
      }
  }
  if (fx.link) {
    const near = opponents(state, u)
      .sort((a, b) => manhattan(a.x, a.y, u.x, u.y) - manhattan(b.x, b.y, u.x, u.y))
      .slice(0, fx.link);
    if (near.length) {
      u.links = near.map((o) => o.uid);
      bag(u).linkLeft = def.value ?? 3;
      state.log.push(`🕸 ${u.name} liga sua vida a ${near.map((o) => o.name).join(' e ')}.`);
    }
  }

  // ── buffs e curas em aliados ──
  if (s.kind === 'buff' || s.kind === 'heal' || (s.kind === 'utility' && fx.healPct) || s.kind === 'utility' && (s.radius ?? 0) > 0 && s.status) {
    const area = s.target === 'self' && !s.radius ? [[u.x, u.y] as [number, number]] : areaOf(state, u, s, x, y);
    for (const [tx, ty] of area) {
      const t = unitAt(state, tx, ty);
      if (!t || t.team !== u.team) continue;
      if (fx.healPct) heal(state, t, Math.max(1, Math.round(t.maxHp * fx.healPct + s.power)));
      if (s.status) applyStatus(state, t, s.status, u);
      for (const st of fx.also ?? []) applyStatus(state, t, st, u);
      if (fx.cleanse) clearDebuffs(t);
    }
    finishAction(state, u, keepHidden);
    return true;
  }
  if (s.kind === 'utility' && !fx.randomTargets) {
    finishAction(state, u, keepHidden);
    return true;
  }

  // ── ataques ──
  let victims: BattleUnit[];
  let area: [number, number][] = [];
  if (fx.randomTargets) victims = randomVictims(state, u, fx.randomTargets, !!fx.spareOne);
  else {
    const primary = unitAt(state, x, y);
    if (primary && primary.team !== u.team && (fx.leap || fx.behind)) moveNextTo(state, u, primary, !!fx.behind);
    if (s.target !== 'self') faceTowards(u, x, y);
    area = areaOf(state, u, s, x, y);
    victims = area.map(([tx, ty]) => unitAt(state, tx, ty)).filter((t): t is BattleUnit => !!t && t.team !== u.team);
  }
  if (fx.only) victims = victims.filter((v) => hasStatusLike(state, v, fx.only!));
  if (fx.surface) for (const [tx, ty] of area.length ? area : victims.map((v) => [v.x, v.y] as [number, number])) applyElementToTile(state, tx, ty, fx.surface);
  for (const [tx, ty] of area) state.events.push({ type: 'fx', x: tx, y: ty, element: s.element ?? 'hit' });
  const hits = (fx.hits ?? 1) + (fx.hits && num(u, 'heads') ? num(u, 'heads') : 0);
  // Golpes que atingem muitos alvos perdem força em cada um.
  const spread = victims.length > 2 ? AREA_FALLOFF : 1;
  let dealt = 0;
  for (const t of victims) {
    let landed = !!fx.noDamage;
    if (fx.noDamage) {
      const chance = Math.max(10, Math.min(95, (s.accuracy ?? 85) + (u.attrs.int - t.attrs.int) - (t.statuses.duplicatas ? 30 : 0)));
      if (!state.rng.chance(chance / 100)) {
        state.events.push({ type: 'miss', uid: t.uid });
        state.log.push(`${t.name} resistiu a ${s.name}.`);
        continue;
      }
    }
    for (let i = 0; i < (fx.noDamage ? 0 : hits) && t.alive; i++) {
      const before = t.hp + (t.shield ?? 0);
      if (resolveAttack(state, u, t, s.kind, s.power, s.element, s.accuracy ?? 0, spread, s)) {
        landed = true;
        dealt += Math.max(0, before - t.hp - (t.shield ?? 0));
      }
    }
    if (!landed || !t.alive) continue;
    if (s.status) applyStatus(state, t, s.status, u);
    for (const st of fx.also ?? []) applyStatus(state, t, st, u);
    if (fx.mpBurn) {
      const burn = Math.min(t.mp, fx.mpBurn);
      t.mp -= burn;
      if (burn) state.events.push({ type: 'text', x: t.x, y: t.y, text: `−${burn} MP`, color: '#7e57c2' });
    }
    if (fx.dispel) for (const b of ['inspirado', 'fortificado', 'veloz', 'afiado', 'regenerando', 'refletindo'] as StatusId[]) removeStatus(t, b);
    if (fx.dispel) t.shield = 0;
    if (fx.push) push(state, u, t, fx.push);
    if (fx.pull) push(state, u, t, -fx.pull);
    if (fx.breakItem) {
      const slots = t.items.map((it, i) => (it ? i : -1)).filter((i) => i >= 0);
      if (slots.length) {
        const i = state.rng.pick(slots);
        state.log.push(`🪶 ${u.name} arranca ${DB.items[t.items[i]!]?.name ?? 'um item'} de ${t.name}!`);
        t.items[i] = null;
      }
    }
  }
  if (fx.healPct) for (const a of allies(state, u)) heal(state, a, Math.max(1, Math.round(a.maxHp * fx.healPct)));
  if (fx.retreat && victims[0] && u.alive) push(state, victims[0], u, fx.retreat);
  if (fx.drainToShield && dealt > 0) {
    u.shield = (u.shield ?? 0) + dealt;
    state.log.push(`🌿 ${u.name} converte ${dealt} de vida drenada em escudo.`);
  }
  if (!magic && num(u, 'momentum')) bag(u).momentum = 0;
  finishAction(state, u, keepHidden);
  return true;
}

/** Bônus de esquiva vindo de passivas condicionais (exibido na ficha). */
export function passiveEvasion(state: BattleState, u: BattleUnit): number {
  let bonus = 0;
  for (const f of passiveFx(u)) if (f.evasion && checkCondition(state, u, f.when)) bonus += f.evasion;
  return bonus;
}

/** O status impede ações ofensivas da IA? */
export function isDebuff(id: string): boolean {
  return !!STATUS_INFO[id as StatusId]?.debuff;
}
