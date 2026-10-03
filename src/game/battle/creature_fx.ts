import { DB, type Element, type FxCondition, type FxReaction, type FxStance, type FxStatus, type SkillDef, type SkillFx } from '../data';
import { addStatus, applyElementToTile, castSmoke, raiseIceBridge, removeStatus, smokeDirection, tileEffectsOnUnit, unitAt } from './elements';
import {
  allies,
  areaOf,
  damage,
  faceTowards,
  finishAction,
  heal,
  isFree,
  mainDir,
  moveBudget,
  opponents,
  resolveAttack,
  type SkillLike,
} from './engine';
import { DIRS, inBounds, isWalkable, manhattan, tileAt, type Tile } from './map';
import * as tactics from './tactics';
import * as stack from './stack';
import { lineTiles } from './los';
import { STATUS_INFO, type BattleState, type BattleUnit, type StatusId, type Trap } from './types';
import { unitFromEnemy } from './units';
import { rankMult } from '../rules/skill_tree';
import * as stats from '../rules/stats';

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

/** Nível (1–5) de uma habilidade de árvore da unidade. */
export function skillRank(u: BattleUnit, skillId: string): number {
  return u.skillRanks?.[skillId] ?? 1;
}

/** Multiplicador de poder do nível da habilidade (dano, cura, bônus de passiva). */
export function rankPower(u: BattleUnit, skillId: string): number {
  return rankMult(skillRank(u, skillId));
}

/** Bônus numéricos de passiva que crescem com o nível da habilidade. */
function scaledFx(f: SkillFx, k: number): SkillFx {
  if (k === 1) return f;
  const out: SkillFx = { ...f };
  for (const key of ['physBoost', 'magicBoost', 'haste', 'healBoost', 'critDamage', 'massBoost'] as const) if (f[key]) out[key] = f[key]! * k;
  if (f.steadyAim) out.steadyAim = Math.round(f.steadyAim * k);
  if (f.elementBoost) out.elementBoost = { ...f.elementBoost, mult: 1 + (f.elementBoost.mult - 1) * k };
  if (f.reduce) out.reduce = Object.fromEntries(Object.entries(f.reduce).map(([t, v]) => [t, Math.min(0.9, (v as number) * k)]));
  return out;
}

/** Blocos de efeito das passivas e reações da unidade (já ajustados pelo nível de cada passiva). */
export function passiveFx(u: BattleUnit): SkillFx[] {
  return skillsOf(u)
    .filter((s) => s.passive && s.fx)
    .map((s) => scaledFx(s.fx!, rankPower(u, s.id)));
}

export function bag(u: BattleUnit): Record<string, number | string> {
  return (u.fx ??= {});
}

export function num(u: BattleUnit, key: string): number {
  const v = u.fx?.[key];
  return typeof v === 'number' ? v : 0;
}

/** Habilidade resolvida pelos blocos de efeito (criaturas e árvores de classe). */
export function isFera(s: SkillLike | SkillDef | undefined): boolean {
  const d = s ? DB.skills[s.id] : undefined;
  return !!d && (d.classId === 'fera' || !!d.tree);
}

/** O atacante está nas costas do alvo (atrás da direção para onde ele olha)? */
export function isBehind(a: BattleUnit, d: BattleUnit): boolean {
  const [fx, fy] = DIRS[d.facing] ?? [0, 0];
  return (a.x - d.x) * fx + (a.y - d.y) * fy < 0;
}

export function summonsOf(state: BattleState, u: BattleUnit): BattleUnit[] {
  return state.units.filter((o) => o.alive && o.summonedBy === u.uid);
}

export function debuffCount(u: BattleUnit): number {
  return (Object.keys(u.statuses) as StatusId[]).filter((k) => STATUS_INFO[k]?.debuff).length;
}

/** Custo de MP com descontos de passivas. */
export function mpCost(u: BattleUnit, s: SkillLike): number {
  if (!s.mp) return 0;
  const node = DB.skills[s.id]?.tree;
  let pct = 0;
  for (const f of passiveFx(u)) if (f.mpDiscount && (!f.mpDiscount.node || f.mpDiscount.node === node)) pct += f.mpDiscount.pct;
  if (u.statuses.eficiente) pct += 0.3;
  return Math.max(0, Math.round(s.mp * (1 - Math.min(0.8, pct))));
}

/** Multiplicador de dano crítico. */
export function critMult(u: BattleUnit): number {
  return stats.CRIT_MULT + passiveFx(u).reduce((a, f) => a + (f.critDamage ?? 0), 0);
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
    case 'has_summon':
      return state.units.some((o) => o.alive && o.summonedBy === u.uid);
    case 'ground':
      return t?.t === 'terra' || t?.t === 'pedra' || t?.t === 'areia' || t?.t === 'grama';
    case 'healthy':
      return u.hp > u.maxHp * 0.5;
  }
}

export function isImmune(u: BattleUnit, status: string): boolean {
  if (passiveFx(u).some((f) => f.immune?.includes(status))) return true;
  if (u.statuses.inabalavel && (status === 'medo' || status === 'lento' || status === 'imobilizado')) return true;
  if (u.statuses.ancorado && (status === 'derrubado' || status === 'empurrao')) return true;
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
  if (st.chance !== undefined && !state.rng.chance(st.chance / 100)) return false;
  const id = st.id as StatusId;
  // Veneno Mortal não pega em lendários nem chefes.
  if (id === 'condenado' && (u.tier === 'lendario' || u.boss)) {
    state.log.push(`🛡 ${u.name} é forte demais para o Veneno Mortal.`);
    return false;
  }
  if (isImmune(u, id)) {
    state.log.push(`🛡 ${u.name} resiste a ${STATUS_INFO[id].name}.`);
    return false;
  }
  if (id === 'lento' && u.statuses.lento) addStatus(u, 'imobilizado', 1);
  if ((id === 'preso' || id === 'aprisionado') && source) u.boundBy = source.uid;
  if (id === 'camuflado') u.hidden = true;
  if (id === 'provocado' && source) bag(u).taunt = source.uid;
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
    if (s === 'conjurador') return u.maxMp > 0 && u.skills.some((id) => DB.skills[id]?.kind === 'magic' || DB.skills[id]?.kind === 'heal');
    if (s === 'invocado') return !!u.summonedBy;
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
  for (const f of passiveFx(u)) d += f.moveBonus ?? 0;
  return d;
}

export function rateMult(u: BattleUnit): number {
  let m = 1;
  if (u.statuses.frenesi) m *= 1.2;
  for (const f of passiveFx(u)) m *= 1 + (f.haste ?? 0) + (f.furyHaste ? f.furyHaste * (1 - u.hp / Math.max(1, u.maxHp)) : 0);
  if (u.statuses.lento) m *= 0.7;
  if (u.statuses.veloz) m *= 1.3;
  return m;
}

/** Habilidade gravitacional: do nó Gravitacional ou que puxa alvos (vórtice, puxão). */
function isGravity(sk: SkillLike): boolean {
  const f = DB.skills[sk.id]?.fx;
  return sk.id.startsWith('gravitacional_') || !!f?.vortex || !!f?.pull;
}

/** Outros inimigos "capturados" na zona em volta do alvo (Massa Crítica). */
function capturedNear(state: BattleState, a: BattleUnit, d: BattleUnit, radius: number): number {
  return opponents(state, a).filter((o) => o !== d && manhattan(o.x, o.y, d.x, d.y) <= radius).length;
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
export function hitMods(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean, sk?: SkillLike, el?: Element): HitMods {
  const m: HitMods = { accuracy: 0, evasion: 0, dmg: 1, def: 1, crit: 0, immune: false };
  const dist = manhattan(a.x, a.y, d.x, d.y);
  // atacante
  if (a.statuses.cegado) m.accuracy -= 25;
  if (a.statuses.confuso) m.accuracy -= 30;
  if (a.statuses.afiado) m.crit += 25;
  if (a.statuses.enfraquecido) m.dmg *= 0.75;
  if (a.statuses.musculo_cortado && !magic) m.dmg *= 0.5;
  if (a.statuses.inabalavel) m.dmg *= 1.25;
  if (a.statuses.frenesi) m.dmg *= 1.3;
  if (a.statuses.preparado) m.crit += 100;
  if (a.statuses.ancorado) m.accuracy += 20;
  if (magic && a.magicDmg) m.dmg *= 1 + a.magicDmg;
  if (sk) m.dmg *= rankPower(a, sk.id);
  if (a.summonedBy) {
    const owner = state.units.find((o) => o.uid === a.summonedBy);
    if (owner) for (const f of passiveFx(owner)) if (f.summonPower) m.dmg *= 1 + f.summonPower;
  }
  for (const f of passiveFx(a)) {
    if (f.elementBoost && el && (!f.elementBoost.element || el === f.elementBoost.element) && checkCondition(state, a, f.when)) m.dmg *= f.elementBoost.mult;
    if (f.perTile) m.dmg *= 1 + f.perTile * dist;
    if (f.physBoost && !magic && checkCondition(state, a, f.when)) m.dmg *= 1 + f.physBoost;
    if (f.magicBoost && magic) m.dmg *= 1 + f.magicBoost;
    if (f.steadyAim && state.activeUid === a.uid && !state.turn.moved) m.accuracy += f.steadyAim;
    if (f.massBoost && sk && isGravity(sk)) m.dmg *= 1 + f.massBoost * capturedNear(state, a, d, Math.max(1, sk.radius ?? 0));
    if (f.vs && hasStatusLike(state, d, f.vs.status)) m.dmg *= f.vs.mult;
    if (f.pierce) m.def *= 1 - f.pierce;
    if (f.fury && a.hp < a.maxHp * 0.5) m.dmg *= f.fury;
    if (f.pack) {
      const n = allies(state, a).filter((o) => o !== a && o.family === f.pack!.family).length;
      m.dmg *= 1 + f.pack.mult * n;
    }
    if (f.flank && allies(state, a).some((o) => o !== a && manhattan(o.x, o.y, d.x, d.y) === 1)) m.dmg *= 1 + f.flank;
    if (f.vsWeakest) {
      const foes = opponents(state, a);
      if (foes.length > 1 && foes.every((o) => o.hp >= d.hp)) m.dmg *= 1 + f.vsWeakest;
    }
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
  // Quem não é pego de surpresa (Audição Aguçada) anula os bônus de esconderijo e de costas.
  const alert = passiveFx(d).some((f) => f.noSurprise);
  if (fx?.fromHiding && a.hidden && !alert) m.dmg *= fx.fromHiding;
  if (fx?.backstab && (a.hidden || isBehind(a, d)) && !alert) m.dmg *= fx.backstab;
  if (fx?.perTile) m.dmg *= 1 + fx.perTile * dist;
  if (fx?.homing) m.accuracy += 100;
  if (fx?.critIfDebuffs && debuffCount(d) >= fx.critIfDebuffs) m.crit += 100;
  if (fx?.execute && d.hp < d.maxHp * fx.execute && (d.tier === 'epico' || d.tier === 'lendario')) m.crit += 100;
  // defensor
  if (d.statuses.derrubado) m.evasion -= 20;
  if (d.statuses.confuso) m.evasion -= 15;
  if (d.statuses.duplicatas) m.evasion += 30;
  if (d.statuses.exposto || d.statuses.sono) m.evasion -= 999;
  if (d.statuses.fortificado) m.def *= 1.5;
  if (d.statuses.frenesi) m.def *= 1.3;
  if (d.statuses.vulneravel) m.dmg *= 1.2;
  if (d.statuses.protegido) m.dmg *= 0.5;
  if (d.statuses.quebrado) m.def *= 0.5;
  if (d.statuses.intangivel && !magic) m.immune = true;
  if (d.statuses.runico && magic) m.immune = true;
  if (d.statuses.invulneravel) m.immune = true;
  if (num(d, 'thermalBroken') && !magic) m.dmg *= 1.5;
  for (const f of passiveFx(d)) {
    if (f.evasion && checkCondition(state, d, f.when)) m.evasion += f.evasion;
    if (f.reduce) {
      if (!magic && f.reduce.physical) m.dmg *= 1 - f.reduce.physical;
      if (!magic && dist > 1 && f.reduce.ranged) m.dmg *= 1 - f.reduce.ranged;
      if (!magic && dist <= 1 && f.reduce.melee) m.dmg *= 1 - f.reduce.melee;
      if (magic && f.reduce.magic) m.dmg *= 1 - f.reduce.magic;
    }
    // Carapaça frontal: tiro de longe vindo da frente.
    if (f.frontGuard && !magic && dist > 1 && !isBehind(a, d)) m.dmg *= 1 - f.frontGuard;
    // Pele impenetrável: flechas, adagas e golpes perfurantes.
    if (f.pierceGuard && !magic && (dist > 1 || a.weaponType === 'faca' || !!fx?.pierce)) m.dmg *= 1 - f.pierceGuard;
  }
  const stanceD = currentStance(state, d);
  if (stanceD?.evasion) m.evasion += stanceD.evasion;
  if (stanceD?.magicImmune && magic) m.immune = true;
  return m;
}

/** Reações das árvores de classe só podem ser usadas uma vez por batalha (regra global). */
export const CLASS_REACTIONS_ONCE = true;

/**
 * Decide se uma reação que acabou de ser disparada será usada (janela "usar ou não" do jogador).
 * Sem decisor (IA, testes), a reação é sempre usada.
 */
export type ReactionDecider = (d: BattleUnit, skillId: string, a: BattleUnit) => boolean;
let reactionDecider: ReactionDecider | null = null;

export function setReactionDecider(fn: ReactionDecider | null): void {
  reactionDecider = fn;
}

/** Reação sujeita à regra de uso único (toda reação de árvore de classe). */
export function isOnceReaction(id: string, r: FxReaction): boolean {
  return !!r.once || (CLASS_REACTIONS_ONCE && !!DB.skills[id]?.tree);
}

/** A unidade ainda tem alguma reação de classe disponível? (indicador da interface) */
/** Esconder-se ainda é ação livre (passiva do Ladino, N vezes por batalha)? Consome um uso. */
export function useFreeHide(u: BattleUnit): boolean {
  const max = passiveFx(u).reduce((a, f) => a + (f.freeHide ?? 0), 0);
  if (num(u, 'freeHides') >= max) return false;
  bag(u).freeHides = num(u, 'freeHides') + 1;
  return true;
}

export function reactionState(u: BattleUnit): 'none' | 'ready' | 'spent' {
  const ids = skillsOf(u).filter((s) => s.fx?.react && isOnceReaction(s.id, s.fx.react)).map((s) => s.id);
  if (!ids.length) return 'none';
  return ids.some((id) => !num(u, `onceReact:${id}`)) ? 'ready' : 'spent';
}

/** Efeitos extras de uma reação que disparou. `ox, oy`: onde o defensor estava. */
function reactionExtras(state: BattleState, a: BattleUnit, d: BattleUnit, r: FxReaction, amount: number, ox: number, oy: number): void {
  for (const st of r.self ?? []) applyStatus(state, d, st, d);
  for (const st of r.foe ?? []) if (a.alive) applyStatus(state, a, st, d);
  if (r.hide) {
    d.hidden = true;
    addStatus(d, 'camuflado', 1);
  }
  if (r.prime) {
    addStatus(d, 'preparado', 3);
    bag(d).primeSilence = 1;
  }
  if (r.store) {
    addStatus(d, 'preparado', 3);
    bag(d).storedDmg = num(d, 'storedDmg') + Math.round(amount * r.store);
  }
  if (r.selfMp && d.maxMp) d.mp = Math.min(d.maxMp, d.mp + Math.round(d.maxMp * r.selfMp));
  if (r.resetSkill) delete d.cooldowns[r.resetSkill];
  if (r.teamShield) for (const o of allies(state, d)) o.shield = Math.max(o.shield ?? 0, Math.round(o.maxHp * r.teamShield));
  if (r.reveal)
    for (const o of opponents(state, d))
      if (o.hidden) {
        o.hidden = false;
        state.log.push(`👁 ${o.name} foi revelado!`);
        state.events.push({ type: 'spotted', uid: o.uid });
      }
  if (r.command)
    for (const m of summonsOf(state, d)) m.gauge = 100;
  if (r.clone) summon(state, d, CLONE_ID, 1);
  if (r.convert && a.summonedBy && a.alive) {
    a.team = d.team;
    a.summonedBy = d.uid;
    state.log.push(`🪙 ${d.name} suborna ${a.name}, que muda de lado!`);
  }
  if (r.area) {
    const ar = r.area;
    for (let dy = -ar.radius; dy <= ar.radius; dy++)
      for (let dx = -ar.radius; dx <= ar.radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > ar.radius || !inBounds(state.map, ox + dx, oy + dy)) continue;
        if (ar.surface) applyElementToTile(state, ox + dx, oy + dy, ar.surface);
        state.events.push({ type: 'fx', x: ox + dx, y: oy + dy, element: ar.surface === 'fumaca' || ar.surface === 'oleo' ? 'hit' : ar.surface ?? 'hit' });
      }
    for (const o of opponents(state, d)) {
      if (manhattan(o.x, o.y, ox, oy) > ar.radius) continue;
      if (ar.damage) damage(state, o, ar.damage + Math.round(d.level * 0.5), d, ar.surface && ar.surface !== 'fumaca' && ar.surface !== 'oleo' ? ar.surface : undefined);
      if (ar.status && o.alive) applyStatus(state, o, ar.status, d);
      if (ar.push && o.alive) push(state, { ...d, x: ox, y: oy } as BattleUnit, o, ar.push);
    }
  }
}

/** Contra-ataque de uma reação. */
function counterAttack(state: BattleState, d: BattleUnit, a: BattleUnit, s: SkillDef, r: FxReaction): void {
  if (r.crit) addStatus(d, 'preparado', 1);
  for (let i = 0; i < (r.hits ?? 1) && a.alive && d.alive; i++) resolveAttack(state, d, a, 'physical', s.power, s.element, r.crit ? 999 : 0, 1, s);
}

/** Reação do defensor antes do dano: pode evitar o golpe ou reduzi-lo. */
export function preventingReaction(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean, crit: boolean, amount: number): { prevented: boolean; amount: number } {
  if (a.team === d.team) return { prevented: false, amount };
  for (const s of skillsOf(d)) {
    const r = s.fx?.react;
    if (!r || !['dodge', 'negate', 'reflect', 'retreat', 'swap', 'mitigate', 'riposte', 'icewall'].includes(r.do)) continue;
    if (!reactionFires(state, a, d, s.id, r, magic, crit, amount)) continue;
    const [ox, oy] = [d.x, d.y];
    state.log.push(`⟲ ${d.name}: ${s.name}!`);
    state.events.push({ type: 'text', x: d.x, y: d.y, text: `⟲ ${s.name}`, color: '#b2ebf2' });
    if (r.damage) damage(state, a, r.damage + Math.round(d.level * 0.5), d, r.element);
    if (r.status && a.alive) applyStatus(state, a, r.status, d);
    if (r.push && a.alive) push(state, d, a, r.push);
    if (r.mpGain && d.maxMp) d.mp = Math.min(d.maxMp, d.mp + Math.round(amount * r.mpGain));
    if (r.do === 'mitigate') {
      const reduced = Math.max(0, Math.round(amount * (1 - (r.reduce ?? 0.5))));
      if (r.distance) push(state, a, d, r.distance);
      reactionExtras(state, a, d, r, amount, ox, oy);
      return { prevented: reduced <= 0, amount: reduced };
    }
    if (r.do === 'reflect') damage(state, a, Math.round(amount * (r.reflectMult ?? 1)), d, undefined, false, magic);
    else if (r.do === 'retreat') push(state, a, d, r.distance ?? 2);
    else if (r.do === 'swap') swapEnemies(state, d);
    else if (r.do === 'icewall') {
      // Barreira de gelo: anula o tiro e ergue um bloco de gelo na direção de quem atirou.
      state.events.push({ type: 'miss', uid: d.uid });
      const dx = Math.sign(a.x - d.x);
      const dy = Math.sign(a.y - d.y);
      const [wx, wy] = Math.abs(a.x - d.x) >= Math.abs(a.y - d.y) ? [d.x + dx, d.y] : [d.x, d.y + dy];
      const w = tileAt(state.map, wx, wy);
      if (w && isWalkable(w) && isFree(state, wx, wy)) {
        w.p = 'rocha';
        w.s = 'gelo';
        w.sTtl = 6;
        state.log.push(`🧊 ${d.name} ergue uma parede de gelo.`);
      }
    } else state.events.push({ type: 'miss', uid: d.uid });
    reactionExtras(state, a, d, r, amount, ox, oy);
    if (r.do === 'riposte' && a.alive && d.alive && manhattan(a.x, a.y, d.x, d.y) <= 1) counterAttack(state, d, a, s, r);
    return { prevented: true, amount: 0 };
  }
  return { prevented: false, amount };
}

/** Depois de um golpe que acertou: golpe preparado (crítico + silêncio + dano guardado) e carga estática. */
export function afterAttackerHit(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean): void {
  if (a.statuses.preparado) {
    removeStatus(a, 'preparado');
    if (num(a, 'primeSilence') && d.alive) applyStatus(state, d, { id: 'silenciado', turns: 1 }, a);
    const stored = num(a, 'storedDmg');
    if (stored > 0 && d.alive) damage(state, d, stored, a, undefined, false, true);
    bag(a).primeSilence = 0;
    bag(a).storedDmg = 0;
  }
  if (magic) return;
  for (const f of passiveFx(a)) {
    if (!f.chargeEvery) continue;
    const n = num(a, 'charges') + 1;
    bag(a).charges = n % f.chargeEvery.n;
    if (n >= f.chargeEvery.n) {
      state.log.push(`⚡ ${a.name} descarrega a carga acumulada!`);
      burstFrom(state, a, d.x, d.y, { radius: f.chargeEvery.radius, power: f.chargeEvery.power, around: 'target' }, f.chargeEvery.element);
    }
  }
}

/** Passivas ligadas a acerto crítico. */
export function onCrit(state: BattleState, a: BattleUnit): void {
  for (const f of passiveFx(a)) {
    if (f.onCritReset && a.cooldowns[f.onCritReset]) {
      delete a.cooldowns[f.onCritReset];
      state.log.push(`↻ ${a.name}: recarga de ${DB.skills[f.onCritReset]?.name ?? f.onCritReset} zerada!`);
    }
    if (f.onCritSelf) applyStatus(state, a, f.onCritSelf, a);
  }
}

/** Reações depois de ser atingido: contra-ataque, espinhos, status no atacante. */
export function afterHitReactions(state: BattleState, a: BattleUnit, d: BattleUnit, magic: boolean, crit: boolean, amount: number): void {
  if (a.team === d.team || !a.alive) return;
  if (d.statuses.martirio && amount > 0) {
    state.log.push(`✝ O selo de martírio fere ${a.name}!`);
    damage(state, a, amount, d, 'luz');
    if (!a.alive) return;
  }
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
    if (r.push) push(state, d, a, r.push);
    if (r.healPct && d.alive) heal(state, d, Math.max(1, Math.round(amount * r.healPct)));
    if (r.do === 'split' && d.alive && d.enemyId && !d.summonedBy) summon(state, d, d.enemyId, 1);
    reactionExtras(state, a, d, r, amount, d.x, d.y);
    if (r.do === 'counter' && a.alive && d.alive) counterAttack(state, d, a, s, r);
    if (!a.alive) return;
  }
}

function reactionFires(state: BattleState, a: BattleUnit, d: BattleUnit, id: string, r: FxReaction, magic: boolean, crit: boolean, amount: number): boolean {
  if (!d.alive || d.statuses.atordoado || d.statuses.semente || d.statuses.sem_reacao || d.statuses.sono) return false;
  const dist = manhattan(a.x, a.y, d.x, d.y);
  const match =
    r.on === 'any' ||
    (r.on === 'magic' && magic) ||
    (r.on === 'physical' && !magic) ||
    (r.on === 'melee' && !magic && dist <= 1) ||
    (r.on === 'ranged' && !magic && dist > 1) ||
    (r.on === 'crit' && crit) ||
    (r.on === 'heavy' && amount >= d.maxHp * 0.15) ||
    (r.on === 'summon' && !!a.summonedBy);
  if (!match) return false;
  const once = isOnceReaction(id, r);
  if (once && num(d, `onceReact:${id}`)) return false;
  const key = `react:${id}`;
  if (num(d, 'reactRound') !== state.round) {
    for (const k of Object.keys(bag(d))) if (k.startsWith('react:')) delete bag(d)[k];
    bag(d).reactRound = state.round;
  }
  if (num(d, key) >= (r.perRound ?? 1)) return false;
  if (!state.rng.chance((r.chance ?? 100) / 100)) return false;
  if (once && reactionDecider && !reactionDecider(d, id, a)) return false;
  bag(d)[key] = num(d, key) + 1;
  if (once) bag(d)[`onceReact:${id}`] = 1;
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
  if (target.statuses.invulneravel) {
    state.events.push({ type: 'text', x: target.x, y: target.y, text: 'INVULNERÁVEL', color: '#fff59d' });
    return 0;
  }
  // Proteção de aliados (Interceder, Reflexo Protetor, Aura de Redenção).
  if (attacker && attacker.team !== target.team && !num(target, 'intercepting')) {
    for (const g of allies(state, target)) {
      if (g === target || num(g, 'intercepting')) continue;
      const ic = passiveFx(g).find((f) => f.intercept)?.intercept;
      if (!ic || manhattan(g.x, g.y, target.x, target.y) > ic.radius || g.statuses.atordoado || g.statuses.sono) continue;
      if (ic.once && num(g, 'interceptUsed')) continue;
      if (ic.once) bag(g).interceptUsed = 1;
      if (ic.physicalOnly && el) continue;
      const part = Math.round(amount * ic.pct);
      if (part <= 0) continue;
      amount -= part;
      bag(g).intercepting = 1;
      state.log.push(`🛡 ${g.name} protege ${target.name}!`);
      damage(state, g, Math.max(0, Math.round(part * (1 - (ic.mitigate ?? 0)))), attacker, el);
      bag(g).intercepting = 0;
      break;
    }
  }
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
  const share = passiveFx(target).reduce((a, f) => a + (f.shareWithSummons ?? 0), 0);
  if (share > 0 && amount > 0) {
    const minion = summonsOf(state, target).sort((p, q) => manhattan(p.x, p.y, target.x, target.y) - manhattan(q.x, q.y, target.x, target.y))[0];
    if (minion) {
      const part = Math.round(amount * Math.min(1, share));
      damage(state, minion, part, attacker, undefined);
      amount -= part;
    }
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
  if (target.statuses.sono) {
    removeStatus(target, 'sono');
    state.log.push(`${target.name} acordou!`);
  }
  if (!magic) for (const f of passiveFx(target)) if (f.onHitCooldown) for (const k of Object.keys(target.cooldowns)) target.cooldowns[k] = Math.max(0, (target.cooldowns[k] ?? 0) - f.onHitCooldown);
  if (attacker?.summonedBy) {
    const owner = state.units.find((o) => o.uid === attacker.summonedBy);
    if (owner?.alive) for (const f of passiveFx(owner)) if (f.summonLifelink) heal(state, owner, Math.max(1, Math.round(amount * f.summonLifelink)));
  }
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
  if (passiveFx(u).some((f) => f.lastStand) && !num(u, 'cheated')) {
    bag(u).cheated = 1;
    u.hp = 1;
    state.log.push(`🔥 ${u.name} se recusa a cair!`);
    return true;
  }
  if (passiveFx(u).some((f) => f.cheatDeath) && !num(u, 'cheated') && u.mp > 0) {
    bag(u).cheated = 1;
    u.mp = Math.floor(u.mp / 2);
    u.hp = 1;
    state.log.push(`🩸 ${u.name} sacrifica mana e se recusa a cair!`);
    return true;
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
export function onDeath(state: BattleState, u: BattleUnit, killer?: BattleUnit, lastStatuses: BattleUnit['statuses'] = {}): void {
  releaseBound(state, u);
  for (const o of state.units) if (o.links) o.links = o.links.filter((id) => id !== u.uid);
  u.links = undefined;
  // Passivas de quem derrubou.
  if (killer && killer.alive && killer.team !== u.team)
    for (const f of passiveFx(killer)) {
      const k = f.onKill;
      if (!k) continue;
      if (k.healPct) heal(state, killer, Math.max(1, Math.round(killer.maxHp * k.healPct)));
      if (k.mpPct) killer.mp = Math.min(killer.maxMp, killer.mp + Math.round(killer.maxMp * k.mpPct));
      if (k.status) applyStatus(state, killer, k.status, killer);
      if (k.resetCooldowns) killer.cooldowns = {};
      if (k.hide) {
        killer.hidden = true;
        addStatus(killer, 'camuflado', 1);
        state.log.push(`🌑 ${killer.name} volta às sombras.`);
      }
    }
  // Passivas de todos os inimigos de quem caiu.
  for (const o of state.units) {
    if (!o.alive || o.team === u.team) continue;
    for (const f of passiveFx(o)) {
      if (f.onAnyDeath) {
        if (f.onAnyDeath.healPct) heal(state, o, Math.max(1, Math.round(o.maxHp * f.onAnyDeath.healPct)));
        if (f.onAnyDeath.mpPct) o.mp = Math.min(o.maxMp, o.mp + Math.round(o.maxMp * f.onAnyDeath.mpPct));
      }
      if (f.special === 'spread_poison' && lastStatuses.envenenado) {
        for (const n of state.units)
          if (n.alive && n.team === u.team && manhattan(n.x, n.y, u.x, u.y) === 1) applyStatus(state, n, { id: 'envenenado', turns: lastStatuses.envenenado }, o);
        state.log.push(`☠ O veneno de ${u.name} contamina os vizinhos!`);
      }
    }
  }
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
  // Onde o turno começou (para "Volte").
  bag(u).sx = u.x;
  bag(u).sy = u.y;
  for (const f of passiveFx(u))
    if (f.mpRegen && u.maxMp > 0 && checkCondition(state, u, f.when)) u.mp = Math.min(u.maxMp, u.mp + Math.max(1, Math.round(u.maxMp * f.mpRegen)));
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
  // Armadura de Musgo: só regenera se não foi atingido na rodada.
  if (u.statuses.musgo && checkCondition(state, u, 'not_hit')) regen += 0.08;
  for (const f of passiveFx(u)) if (f.regen && checkCondition(state, u, f.when)) regen += f.regen;
  const stance = currentStance(state, u);
  if (stance?.regen) regen += stance.regen;
  if (regen > 0 && u.hp < u.maxHp && !u.statuses.semente) heal(state, u, Math.max(1, Math.round(u.maxHp * regen)));
  if (passiveFx(u).some((f) => f.special === 'tide_growth') && inWater(state, u)) grow(state, u);
  if (passiveFx(u).some((f) => f.bloodSense) && opponents(state, u).some((o) => o.statuses.sangramento)) addStatus(u, 'veloz', 1);
  for (const f of passiveFx(u)) if (f.senseStatus && opponents(state, u).some((o) => o.statuses[f.senseStatus as StatusId])) addStatus(u, 'veloz', 1);
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
  if (u.statuses.sono) {
    state.log.push(`💤 ${u.name} está dormindo.`);
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
  if (id === 'frenesi') {
    addStatus(u, 'lento', 2);
    addStatus(u, 'desarmado', 2);
    state.log.push(`😮‍💨 ${u.name} desaba de cansaço depois do frenesi.`);
  }
  if (id === 'marcado') {
    state.log.push(`◎ A marca em ${u.name} explode!`);
    damage(state, u, Math.max(1, Math.round(u.maxHp * MARK_PCT)), undefined, undefined);
  }
  if (id === 'camuflado' && u.hidden) {
    u.hidden = false;
    state.log.push(`${u.name} reapareceu.`);
  }
  if (id === 'preso') u.boundBy = undefined;
  if (id === 'condenado' && u.alive) {
    state.log.push(`💀 O Veneno Mortal consome ${u.name}!`);
    state.events.push({ type: 'text', x: u.x, y: u.y, text: '💀', color: '#76ff03' });
    damage(state, u, u.hp + (u.shield ?? 0), undefined, 'veneno');
  }
}

/** Fim de turno: registra se a unidade ficou parada (para passivas "imóvel"). */
export function turnEnd(state: BattleState, u: BattleUnit): void {
  bag(u).still = state.turn.moved ? 0 : 1;
  // Frenesi Sangrento: parte da barra de ação volta.
  if (num(u, 'gaugeBonus')) {
    u.gauge += num(u, 'gaugeBonus');
    bag(u).gaugeBonus = 0;
  }
  bag(u).chase = 0;
  // Armadilhas armam no fim do turno de quem as colocou (as de quem já caiu também).
  for (const t of state.traps ?? []) if (t.armed === false && !t.waitAll && (t.ownerUid === u.uid || !state.units.some((o) => o.uid === t.ownerUid && o.alive))) t.armed = true;
  // As da formação (Gênio do Campo de Batalha) esperam todos agirem pelo menos uma vez
  // (`actedOnce` é marcado no início do turno; turno perdido também conta).
  const waiting = (state.traps ?? []).filter((t) => t.waitAll && t.armed === false);
  if (waiting.length && state.units.every((o) => !o.alive || num(o, 'actedOnce'))) {
    for (const t of waiting) t.armed = true;
    state.log.push(`⚙ As armadilhas preparadas antes da batalha estão armadas (${waiting.length}).`);
  }
}

/** Gênio do Campo de Batalha: quantas armadilhas pode distribuir na formação (0 sem a passiva). */
export function fieldTrapCount(u: BattleUnit): number {
  const s = skillsOf(u).find((d) => d.passive && d.fx?.fieldTraps);
  return s ? skillRank(u, s.id) : 0;
}

/** Tipos de armadilha que a unidade pode distribuir: as habilidades de armadilha que ela aprendeu. */
export function fieldTrapTypes(u: BattleUnit): SkillDef[] {
  return skillsOf(u).filter((d) => !!d.fx?.trap && !d.passive);
}

/** Armadilhas da formação que a unidade ainda pode colocar. */
export function fieldTrapsLeft(state: BattleState, u: BattleUnit): number {
  return Math.max(0, fieldTrapCount(u) - (state.traps ?? []).filter((t) => t.ownerUid === u.uid && t.waitAll).length);
}

/** Coloca (ou tira, clicando de novo) uma armadilha da formação em (x, y). */
export function placeFieldTrap(state: BattleState, u: BattleUnit, skillId: string, x: number, y: number): boolean {
  const traps = (state.traps ??= []);
  const mine = traps.findIndex((t) => t.x === x && t.y === y && t.ownerUid === u.uid && t.waitAll);
  if (mine >= 0) {
    traps.splice(mine, 1);
    return true;
  }
  const def = fieldTrapTypes(u).find((d) => d.id === skillId);
  const t = tileAt(state.map, x, y);
  if (!def?.fx?.trap || !t || !isWalkable(t) || unitAt(state, x, y) || traps.some((o) => o.x === x && o.y === y)) return false;
  if (fieldTrapsLeft(state, u) <= 0) return false;
  const tr = def.fx.trap;
  traps.push({ x, y, team: u.team, ownerUid: u.uid, name: def.name, status: tr.status, damage: tr.damage, radius: tr.radius, armed: false, waitAll: true });
  return true;
}

/** Armadilhas que cada time conhece (só as próprias). */
export function knownTraps(state: BattleState, team: string): Trap[] {
  return (state.traps ?? []).filter((t) => t.team === team || t.spotted?.includes(team as Trap['team']));
}

/** Uma rodada de ambiente para as criaturas: auras, tempestade, invocações periódicas, carma. */
export function roundTick(state: BattleState): void {
  tickPending(state);
  for (const u of [...state.units]) {
    if (!u.alive || u.statuses.semente) continue;
    for (const f of passiveFx(u)) {
      if (f.aura) {
        for (const o of f.aura.allies ? allies(state, u) : opponents(state, u)) {
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

/** Resolve efeitos agendados (bombas, canalizações, zonas). */
function tickPending(state: BattleState): void {
  const list = state.pending ?? [];
  for (const p of [...list]) {
    const caster = state.units.find((u) => u.uid === p.casterUid);
    if (!caster?.alive) {
      list.splice(list.indexOf(p), 1);
      continue;
    }
    p.wait -= 1;
    if (p.wait > 0) continue;
    const target = p.targetUid ? state.units.find((u) => u.uid === p.targetUid && u.alive) : undefined;
    const sk = DB.skills[p.skillId];
    if (sk) castCreatureSkill(state, caster, sk as SkillLike, target?.x ?? p.x, target?.y ?? p.y, true);
    if (p.repeat > 0) {
      p.repeat -= 1;
      p.wait = 1;
    } else list.splice(list.indexOf(p), 1);
  }
}

/**
 * Armadilha no tile em que a unidade acabou de pisar. Fogo amigo: dispara em qualquer um
 * (aliados também), desde que já esteja armada. Cada lado só vê as próprias armadilhas.
 */
export function stepOnTile(state: BattleState, u: BattleUnit): void {
  if (u.statuses.voando) return;
  const traps = state.traps ?? [];
  const i = traps.findIndex((t) => t.x === u.x && t.y === u.y && t.armed !== false);
  if (i < 0) return;
  const t = traps[i]!;
  traps.splice(i, 1);
  state.log.push(`⚠ ${u.name} caiu em ${t.name}!`);
  state.events.push({ type: 'fx', x: u.x, y: u.y, element: 'hit' });
  const owner = state.units.find((o) => o.uid === t.ownerUid);
  springTrap(state, t, owner, u);
}

/** Dispara uma armadilha: atinge quem a ativou (ou o tile) e, com raio, os vizinhos. */
export function springTrap(state: BattleState, t: Trap, owner: BattleUnit | undefined, victim?: BattleUnit): void {
  const hit = state.units.filter((o) => o.alive && manhattan(o.x, o.y, t.x, t.y) <= (t.radius ?? 0));
  if (victim && !hit.includes(victim)) hit.push(victim);
  for (const o of hit) {
    if (t.damage) damage(state, o, t.damage, owner, undefined);
    if (t.status && o.alive) applyStatus(state, o, t.status, owner);
  }
  if (owner?.alive) for (const f of passiveFx(owner)) if (f.trapRefund && owner.maxMp) owner.mp = Math.min(owner.maxMp, owner.mp + f.trapRefund);
}

/** Início da batalha: invocações iniciais. */
export function battleStart(state: BattleState): void {
  for (const u of [...state.units]) {
    for (const f of passiveFx(u)) if (f.reachBonus) u.weaponRange += f.reachBonus;
    for (const f of passiveFx(u)) if (f.jumpTo) u.jump = Math.max(u.jump, f.jumpTo);
    for (const f of passiveFx(u)) if (f.summonStart) for (const s of f.summonStart) summon(state, u, s.id, s.count);
    // Invocações ativas das feras só ficam prontas depois de alguns turnos.
    if (u.team === 'enemy') for (const s of skillsOf(u)) if (s.fx?.summon) u.cooldowns[s.id] = Math.max(u.cooldowns[s.id] ?? 0, SUMMON_START_DELAY);
  }
}

// ───────────────────────────── invocação e deslocamento ─────────────────────────────

/** Cópia ilusória de uma unidade: some com qualquer golpe e causa 25% do dano. */
export const CLONE_ID = '@clone';

function makeClone(state: BattleState, owner: BattleUnit): BattleUnit {
  const n = state.units.filter((o) => o.summonedBy === owner.uid).length + 1;
  return {
    ...owner,
    uid: `${owner.uid}c${n}r${state.round}`,
    name: `Clone de ${owner.name}`,
    charId: undefined,
    maxHp: 1,
    hp: 1,
    startHp: 1,
    mp: 0,
    maxMp: 0,
    weaponAtk: Math.max(1, Math.round(owner.weaponAtk * 0.25)),
    attrs: { ...owner.attrs, str: Math.round(owner.attrs.str * 0.25), int: Math.round(owner.attrs.int * 0.25), dex: Math.round(owner.attrs.dex * 0.25) },
    skills: [],
    items: [],
    statuses: {},
    cooldowns: {},
    hidden: false,
    overwatch: false,
    defending: false,
    kills: 0,
    killXp: 0,
    xpReward: 0,
    shield: 0,
    fx: {},
    links: undefined,
    boundBy: undefined,
    look: { ...owner.look },
  };
}

export function summon(state: BattleState, owner: BattleUnit, id: string, count: number): BattleUnit[] {
  const def = id === CLONE_ID ? undefined : DB.enemies[id];
  if (!def && id !== CLONE_ID) return [];
  const out: BattleUnit[] = [];
  for (let i = 0; i < count; i++) {
    if (state.units.filter((o) => o.alive && o.summonedBy === owner.uid).length >= MAX_SUMMONS) break;
    const spot = freeTileNear(state, owner.x, owner.y, 4);
    if (!spot) break;
    // Invocações do jogador vêm no nível de quem invoca; as das feras, mais fracas.
    const gap = owner.team === 'player' ? 0 : SUMMON_LEVEL_GAP;
    const u = def ? unitFromEnemy(def, Math.max(1, owner.level - gap), state.rng) : makeClone(state, owner);
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
  if (out.length) state.log.push(`✶ ${owner.name} invoca ${out.length}× ${def?.name ?? 'clone'}!`);
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
  if (!target.alive || n === 0 || isImmune(target, 'empurrao')) return;
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
  if (fx.corpse && !state.units.some((o) => !o.alive && manhattan(o.x, o.y, u.x, u.y) <= Math.max(1, def.range))) return false;
  if (fx.sacrifice && !summonsOf(state, u).length) return false;
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

const BUFFS: StatusId[] = ['inspirado', 'fortificado', 'veloz', 'afiado', 'regenerando', 'refletindo', 'duplicatas', 'inabalavel', 'encantado'];
const INVERT: Partial<Record<StatusId, StatusId>> = { inspirado: 'enfraquecido', fortificado: 'quebrado', veloz: 'lento', afiado: 'cegado', regenerando: 'envenenado', duplicatas: 'exposto' };
/** Dano por turno de cada status de dano contínuo (fração da vida máxima). */
const DOT_OF: Partial<Record<StatusId, number>> = { envenenado: 0.05, queimando: 0.07, sangramento: DOT_PCT.sangramento };

/** O turno já tinha gastado a ação antes desta habilidade (para as ações sem custo). */
let actedBeforeCast = false;

function finish(state: BattleState, u: BattleUnit, keepHidden: boolean, resolving: boolean, def: SkillDef): void {
  if (resolving) return;
  for (const f of passiveFx(u)) if (f.onCastSelf && (!f.onCastSelf.node || f.onCastSelf.node === def.tree)) applyStatus(state, u, f.onCastSelf.status, u);
  finishAction(state, u, keepHidden);
  // Ação sem custo: o turno continua como estava.
  if (def.fx?.free) state.turn.acted = actedBeforeCast;
  if (def.fx?.extraTurn && u.alive) {
    state.turn.moved = false;
    state.turn.acted = false;
    state.turn.moveLeft = undefined;
    state.log.push(`⏩ ${u.name} ganha uma ação extra!`);
  }
}

/**
 * Executa uma habilidade de bloco de efeitos (custos e recarga já aplicados).
 * `resolving` = efeito agendado agindo agora (bomba, canalização), sem os efeitos em si.
 */
/** Nível mais alto onde dá para ficar de pé na coluna (−1 se nenhum). */
function stackTopStandable(t: Tile): number {
  for (let l = stack.topLevel(t); l >= 0; l--) if (stack.standable(t, l)) return l;
  return -1;
}

/** Cura que salta entre aliados feridos (até `n` saltos de 3 casas). */
function bounceHeal(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number, n: number): void {
  const def = DB.skills[s.id]!;
  const amount = Math.round(stats.healPower(u.attrs, u.healBonus, s.power, u.level, s.scaling) * healMult(state, u, s.id) * 0.6);
  void def;
  const healed = new Set<BattleUnit>();
  let from = unitAt(state, x, y);
  if (from) healed.add(from);
  for (let k = 0; k < n && from; k++) {
    const next = state.units
      .filter((o) => o.alive && o.team === u.team && !healed.has(o) && o.hp < o.maxHp && manhattan(o.x, o.y, from!.x, from!.y) <= 3)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!next) break;
    heal(state, next, Math.max(1, amount));
    healed.add(next);
    state.events.push({ type: 'fx', x: next.x, y: next.y, element: 'luz' });
    from = next;
  }
}

export function castCreatureSkill(state: BattleState, u: BattleUnit, s: SkillLike, x: number, y: number, resolving = false): boolean {
  const def = DB.skills[s.id]!;
  const fx = def.fx ?? {};
  const magic = s.kind === 'magic';
  let keepHidden = false;
  if (!resolving) actedBeforeCast = state.turn.acted;

  // ── efeitos em si (só no momento do uso) ──
  if (!resolving) {
    if (fx.hide) {
      u.hidden = true;
      const turns = def.value ?? 2;
      addStatus(u, fx.hide === 'snow' ? 'submerso' : 'camuflado', turns);
      state.log.push(fx.hide === 'snow' ? `❄ ${u.name} mergulhou na neve e sumiu de vista.` : `🍃 ${u.name} sumiu de vista.`);
      keepHidden = true;
    }
    if (fx.teleport && s.target === 'tile') {
      const t = tileAt(state.map, x, y);
      const top = t ? stackTopStandable(t) : -1;
      if (t && top >= 0 && isFree(state, x, y, u)) {
        state.events.push({ type: 'fx', x: u.x, y: u.y, element: 'sombra' });
        u.x = x;
        u.y = y;
        // Em prédios, aparece no topo (telhado, muralha).
        stack.setLevel(state.map, u, top);
        state.log.push(`✧ ${u.name} reaparece em outro ponto.`);
        const d = tileEffectsOnUnit(state, u);
        if (d) damage(state, u, d, undefined, undefined);
      }
    }
    if (fx.cleanse && s.kind !== 'heal' && s.kind !== 'buff') clearDebuffs(u);
    if (fx.shield && (s.kind === 'utility' || s.target === 'self')) u.shield = Math.max(u.shield ?? 0, Math.round(u.maxHp * fx.shield));
    if (fx.self) applyStatus(state, u, fx.self, u);
    if (s.kind === 'utility') for (const st of fx.also ?? []) applyStatus(state, u, st, u);
    if (fx.summon) for (const sm of fx.summon) summon(state, u, sm.id, sm.count);
    if (fx.shieldFromLost) u.shield = Math.max(u.shield ?? 0, Math.round((u.maxHp - u.hp) * fx.shieldFromLost));
    if (fx.imbue && s.kind !== 'buff') {
      addStatus(u, 'encantado', fx.imbue.turns);
      bag(u).imbue = JSON.stringify(fx.imbue);
      bag(u).imbueCharges = fx.imbue.charges ?? 0;
      state.log.push(fx.imbue.charges ? `✦ ${u.name} prepara o próximo golpe.` : `✦ ${u.name} encanta sua arma.`);
    }
    if (fx.extraMove && state.activeUid === u.uid) {
      state.turn.moveLeft = (state.turn.moveLeft ?? moveBudget(u)) + moveBudget(u);
      state.log.push(`🐎 ${u.name} dispara em velocidade máxima!`);
    }
    if (fx.reduceCooldowns) for (const k of Object.keys(u.cooldowns)) if (k !== s.id) u.cooldowns[k] = Math.max(0, (u.cooldowns[k] ?? 0) - fx.reduceCooldowns);
    if (fx.commandSummons)
      for (const m of summonsOf(state, u)) {
        m.gauge = 100;
        addStatus(m, 'inspirado', 2);
      }
    if (fx.sacrifice) {
      const m = summonsOf(state, u).sort((p, q) => manhattan(p.x, p.y, u.x, u.y) - manhattan(q.x, q.y, u.x, u.y))[0];
      if (m) {
        state.log.push(`💥 ${u.name} detona ${m.name}!`);
        burst(state, m, 2, s.power + 6, s.element);
        damage(state, m, m.hp + (m.shield ?? 0), undefined, undefined);
        if (u.maxMp) u.mp = Math.min(u.maxMp, u.mp + Math.round(u.maxMp * 0.2));
      }
    }
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
          state.events.push({ type: 'spotted', uid: o.uid });
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
    // Efeito agendado: arma agora, age nas próximas rodadas (ou já, se `delay` 0).
    if (fx.pending) {
      const target = unitAt(state, x, y);
      const entry = { casterUid: u.uid, skillId: s.id, x, y, targetUid: target && target.team !== u.team ? target.uid : undefined, wait: fx.pending.delay, repeat: fx.pending.repeat ?? 0 };
      (state.pending ??= []).push(entry);
      state.events.push({ type: 'text', x, y, text: '⏳', color: '#ffcc80' });
      state.log.push(fx.pending.delay > 0 ? `⏳ ${u.name} prepara ${s.name}…` : `◎ ${u.name} sustenta ${s.name}.`);
      if (fx.pending.delay <= 0) {
        castCreatureSkill(state, u, s, x, y, true);
        if (entry.repeat > 0) {
          entry.repeat -= 1;
          entry.wait = 1;
        } else state.pending.splice(state.pending.indexOf(entry), 1);
      }
      if (fx.spendAllMp) u.mp = 0;
      finish(state, u, keepHidden || !!fx.hide, false, def);
      return true;
    }
  }

  // Flecha sinalizadora: luz forte no alvo (revela à noite).
  if (fx.flare && !resolving)
    for (let dy = -fx.flare; dy <= fx.flare; dy++)
      for (let dx = -fx.flare; dx <= fx.flare; dx++) {
        const t = tileAt(state.map, x + dx, y + dy);
        if (t && Math.abs(dx) + Math.abs(dy) <= fx.flare) t.glow = Math.max(t.glow ?? 0, stats.LIGHT.emberTurns);
      }

  // ── terreno ──
  const tileArea = (): [number, number][] => (s.target === 'self' && !s.radius ? [[u.x, u.y]] : areaOf(state, u, s, x, y));
  if (fx.triggerTraps) {
    const mine = (state.traps ?? []).filter((t) => t.ownerUid === u.uid);
    state.traps = (state.traps ?? []).filter((t) => t.ownerUid !== u.uid);
    if (mine.length) state.log.push(`💥 ${u.name} detona ${mine.length} armadilha(s)!`);
    for (const t of mine) {
      state.events.push({ type: 'fx', x: t.x, y: t.y, element: 'fogo' });
      springTrap(state, { ...t, radius: Math.max(1, t.radius ?? 0) }, u);
    }
  }
  if (fx.clearTraps) {
    const area = tileArea();
    const before = state.traps?.length ?? 0;
    state.traps = (state.traps ?? []).filter((t) => t.team === u.team || !area.some(([x2, y2]) => x2 === t.x && y2 === t.y));
    if ((state.traps.length ?? 0) < before) state.log.push(`⚙ ${u.name} desarma armadilhas inimigas.`);
  }
  if (fx.wall || fx.destroyProps || fx.trap) {
    let tiles = tileArea();
    // Campo minado: espalha N armadilhas em tiles aleatórios da área.
    if (fx.trap?.count) {
      const pool = tiles.filter(([tx, ty]) => isWalkable(tileAt(state.map, tx, ty)!) && isFree(state, tx, ty));
      tiles = [];
      while (tiles.length < fx.trap.count && pool.length) tiles.push(pool.splice(state.rng.int(0, pool.length - 1), 1)[0]!);
    }
    for (const [tx, ty] of tiles) {
      const t = tileAt(state.map, tx, ty);
      if (!t) continue;
      if (fx.destroyProps && t.p) t.p = null;
      if (fx.wall && isWalkable(t) && isFree(state, tx, ty)) {
        t.p = 'rocha';
        if (fx.wall === 'gelo') {
          t.s = 'gelo';
          t.sTtl = 6;
        }
      }
      if (fx.trap && isWalkable(t)) {
        // Arma só no fim do turno de quem colocou; quem estiver em cima dispara no início do próprio turno.
        (state.traps ??= []).push({ x: tx, y: ty, team: u.team, ownerUid: u.uid, name: s.name, status: fx.trap.status, damage: fx.trap.damage, radius: fx.trap.radius, armed: false });
      }
    }
    if (fx.wall) state.log.push(`🧱 ${u.name} ergue ${s.name}.`);
    if (fx.trap) state.log.push(`⚙ ${u.name} arma ${s.name}.`);
  }
  if (fx.iceBridge && !resolving) {
    const dir = mainDir(u, x, y) ?? (DIRS[u.facing] as [number, number]);
    if (raiseIceBridge(state, x, y, dir)) state.log.push(`🧊 ${u.name} ergue uma ponte de gelo.`);
  }

  // ── efeitos sobre uma unidade qualquer (troca de lugar, barra, voltar no tempo) ──
  if (fx.swap || fx.gaugeShift || fx.rewind) {
    const t = unitAt(state, x, y);
    if (t && t !== u) {
      if (fx.swap) {
        [u.x, t.x] = [t.x, u.x];
        [u.y, t.y] = [t.y, u.y];
        state.log.push(`⇄ ${u.name} troca de lugar com ${t.name}.`);
      }
      if (fx.gaugeShift) {
        t.gauge = t.team === u.team ? 100 : 0;
        state.log.push(t.team === u.team ? `⏩ ${t.name} vai agir em seguida.` : `⏪ ${t.name} vai para o fim da fila.`);
      }
      if (fx.rewind && t.fx?.sx !== undefined) {
        const [rx, ry] = [num(t, 'sx'), num(t, 'sy')];
        if (isFree(state, rx, ry, t)) {
          t.x = rx;
          t.y = ry;
          state.log.push(`⟲ ${t.name} volta para onde estava.`);
        }
      }
    }
  }

  // ── buffs e curas em aliados ──
  if (s.kind === 'buff' || s.kind === 'heal' || (s.kind === 'utility' && fx.healPct) || (s.kind === 'utility' && (s.radius ?? 0) > 0 && s.status) || (s.kind === 'utility' && fx.extend)) {
    for (const [tx, ty] of tileArea()) {
      const t = unitAt(state, tx, ty);
      if (!t) continue;
      if (fx.extend) {
        for (const k of Object.keys(t.statuses) as StatusId[]) {
          const good = !STATUS_INFO[k]?.debuff;
          if ((t.team === u.team) === good) t.statuses[k] = (t.statuses[k] ?? 0) + fx.extend;
        }
      }
      if (t.team !== u.team) continue;
      if (fx.healPct) heal(state, t, Math.max(1, Math.round((t.maxHp * fx.healPct + stats.healPower(u.attrs, u.healBonus, s.power, u.level, s.scaling)) * healMult(state, u, s.id))));
      if (s.status) applyStatus(state, t, s.status, u);
      for (const st of fx.also ?? []) applyStatus(state, t, st, u);
      if (fx.cleanse) clearDebuffs(t);
      if (fx.imbue && s.kind === 'buff') {
        addStatus(t, 'encantado', fx.imbue.turns);
        bag(t).imbue = JSON.stringify(fx.imbue);
      }
      if (fx.shield && s.kind !== 'utility' && !(t === u && s.target === 'self')) t.shield = Math.max(t.shield ?? 0, Math.round(t.maxHp * fx.shield));
      if (fx.burstAround?.around === 'target') burstFrom(state, u, t.x, t.y, fx.burstAround, s.element);
    }
    if (fx.burstAround?.around === 'self') burstFrom(state, u, u.x, u.y, fx.burstAround, s.element);
    // Talismã que salta: cura mais aliados feridos perto do alvo (60% cada).
    if (fx.bounce && s.kind === 'heal') bounceHeal(state, u, s, x, y, fx.bounce);
    finish(state, u, keepHidden, resolving, def);
    return true;
  }
  if (s.kind === 'utility' && !fx.randomTargets) {
    if (fx.spendAllMp) u.mp = 0;
    finish(state, u, keepHidden, resolving, def);
    return true;
  }

  // ── ataques ──
  let victims: BattleUnit[];
  let area: [number, number][] = [];
  let aboveMult = 1;
  if (fx.randomTargets) victims = randomVictims(state, u, fx.randomTargets, !!fx.spareOne);
  else if (fx.dashThrough) {
    // Salto Cortante: corre em linha até o tile, rasgando quem estiver no caminho.
    area = [...lineTiles(u.x, u.y, x, y), [x, y] as [number, number]];
    victims = area.map(([tx, ty]) => unitAt(state, tx, ty)).filter((t): t is BattleUnit => !!t && t.team !== u.team);
    faceTowards(u, x, y);
    let land: [number, number] | null = null;
    for (const [tx, ty] of area) {
      const t = tileAt(state.map, tx, ty);
      if (t && isWalkable(t) && isFree(state, tx, ty, u) && Math.abs(t.h - tileAt(state.map, u.x, u.y)!.h) <= Math.max(3, u.jump)) land = [tx, ty];
    }
    if (land) [u.x, u.y] = land;
  } else {
    const primary = unitAt(state, x, y);
    if (fx.fromAbove && primary && tileAt(state.map, u.x, u.y)!.h > tileAt(state.map, primary.x, primary.y)!.h) aboveMult = fx.fromAbove;
    if (primary && primary.team !== u.team && (fx.leap || fx.behind)) moveNextTo(state, u, primary, !!fx.behind);
    if (s.target !== 'self') faceTowards(u, x, y);
    area = fx.through ? lineThrough(state, u, x, y, s.range) : areaOf(state, u, s, x, y);
    // Fogo amigo: áreas e linhas que atravessam também atingem aliados (nunca quem lançou).
    const areaHit = stats.FRIENDLY_FIRE && (!!fx.through || s.shape === 'cone' || s.shape === 'line' || (s.shape === 'radius' && (s.radius ?? 0) > 0));
    victims = area.map(([tx, ty]) => unitAt(state, tx, ty)).filter((t): t is BattleUnit => !!t && t !== u && (t.team !== u.team || areaHit));
  }
  if (fx.only) victims = victims.filter((v) => hasStatusLike(state, v, fx.only!));
  if (fx.spareAllies) victims = victims.filter((v) => v.team !== u.team);
  // Olhar e sopro frontais: só pegam quem está virado para quem usou.
  if (fx.facingOnly)
    victims = victims.filter((v) => {
      const [fx2, fy2] = DIRS[v.facing] ?? [0, 0];
      return (u.x - v.x) * fx2 + (u.y - v.y) * fy2 > 0;
    });
  const surfaced = area.length ? area : victims.map((v) => [v.x, v.y] as [number, number]);
  // Fumaça de habilidade anda: por padrão para onde o golpe foi lançado (o jogador escolhe depois).
  if (fx.cloud) castSmoke(state, u, surfaced, smokeDirection(u, x, y), fx.cloud, fx.cloudFollow ? { radius: Math.max(1, s.radius ?? 1), turns: fx.cloudFollow } : undefined);
  else if (fx.surface === 'fumaca') castSmoke(state, u, surfaced, smokeDirection(u, x, y));
  else if (fx.surface) for (const [tx, ty] of surfaced) applyElementToTile(state, tx, ty, fx.surface);
  for (const [tx, ty] of area) state.events.push({ type: 'fx', x: tx, y: ty, element: s.element ?? 'hit' });
  const hits = (fx.hits ?? 1) + (fx.hits && num(u, 'heads') ? num(u, 'heads') : 0);
  // Golpes que atingem muitos alvos perdem força em cada um.
  const spread = victims.length > 2 ? AREA_FALLOFF : 1;
  let dealt = 0;
  const hitOne = (t: BattleUnit, mult: number): void => {
    // Fogo de supressão: acertando ou não, o alvo fica sob fogo sustentado.
    if (fx.suppress && t.team !== u.team && t.alive) tactics.suppress(state, u, t);
    let landed = !!fx.noDamage;
    if (fx.noDamage) {
      const chance = Math.max(10, Math.min(95, (s.accuracy ?? 85) + (u.attrs.int - t.attrs.int) - (t.statuses.duplicatas ? 30 : 0)));
      if (!state.rng.chance(chance / 100)) {
        state.events.push({ type: 'miss', uid: t.uid });
        state.log.push(`${t.name} resistiu a ${s.name}.`);
        return;
      }
    }
    for (let i = 0; i < (fx.noDamage ? 0 : hits) && t.alive; i++) {
      const before = t.hp + (t.shield ?? 0);
      if (resolveAttack(state, u, t, s.kind, s.power, s.element, s.accuracy ?? 0, mult, s)) {
        landed = true;
        dealt += Math.max(0, before - t.hp - (t.shield ?? 0));
      }
    }
    if (!landed || !t.alive) return;
    if (fx.currentHpPct && t.alive) damage(state, t, Math.max(1, Math.round(t.hp * fx.currentHpPct)), u, s.element);
    if (!t.alive) return;
    if (fx.execute && t.hp < t.maxHp * fx.execute && t.tier !== 'epico' && t.tier !== 'lendario') {
      state.log.push(`☠ ${s.name}: ${t.name} é executado!`);
      damage(state, t, t.hp + (t.shield ?? 0), u, undefined);
      return;
    }
    if (fx.interrupt && state.pending?.some((p) => p.casterUid === t.uid)) {
      state.pending = state.pending.filter((p) => p.casterUid !== t.uid);
      state.log.push(`✋ ${s.name} interrompe a conjuração de ${t.name}!`);
    }
    if (fx.consume && t.statuses[fx.consume.status as StatusId]) {
      removeStatus(t, fx.consume.status as StatusId);
      applyStatus(state, t, fx.consume.apply, u);
    }
    if (fx.detonate) {
      let total = 0;
      for (const id of fx.detonate as StatusId[]) {
        const left = t.statuses[id];
        const pct = DOT_OF[id];
        if (!left || !pct) continue;
        total += (Math.round(t.maxHp * pct) + 2) * left;
        removeStatus(t, id);
      }
      if (total > 0) {
        state.log.push(`💥 ${s.name}: ${t.name} sofre todo o dano contínuo de uma vez!`);
        damage(state, t, total, u, undefined);
        if (!t.alive) return;
      }
    }
    if (fx.invertBuffs)
      for (const [from, to] of Object.entries(INVERT) as [StatusId, StatusId][]) {
        const left = t.statuses[from];
        if (!left) continue;
        removeStatus(t, from);
        addStatus(t, to, left);
      }
    if (s.status) applyStatus(state, t, s.status, u);
    for (const st of fx.also ?? []) applyStatus(state, t, st, u);
    // Golpe que arremessa o alvo para trás (regra do empurrão, sem teste).
    if (fx.knock && t.alive) {
      const kd: [number, number] = [Math.sign(t.x - u.x), Math.sign(t.y - u.y)];
      for (let k = 0; k < fx.knock && t.alive; k++) if (!tactics.pushStep(state, t, kd[0], kd[1])) break;
    }
    if (!t.alive) return;
    afterSkillHit(state, u, t);
    if (fx.breakShield && ((t.shield ?? 0) > 0 || t.statuses.protegido)) {
      t.shield = 0;
      removeStatus(t, 'protegido');
      state.log.push(`🦷 ${u.name} despedaça a proteção de ${t.name}!`);
    }
    if (fx.maxMpCut && t.maxMp > 0) {
      const cut = Math.max(1, Math.round(t.maxMp * fx.maxMpCut));
      t.maxMp -= cut;
      t.mp = Math.min(t.mp, t.maxMp);
      state.events.push({ type: 'text', x: t.x, y: t.y, text: `−${cut} MP máx.`, color: '#4fc3f7' });
    }
    if (fx.gaugeRefund && t.hp < t.maxHp * fx.gaugeRefund.below && !num(u, 'gaugeBonus')) {
      bag(u).gaugeBonus = fx.gaugeRefund.pct;
      state.log.push(`🩸 ${u.name} sente o sangue e acelera.`);
    }
    if (fx.mpBurn) {
      const burn = Math.min(t.mp, fx.mpBurn);
      t.mp -= burn;
      if (burn) state.events.push({ type: 'text', x: t.x, y: t.y, text: `−${burn} MP`, color: '#7e57c2' });
    }
    if (fx.dispel) {
      for (const b of BUFFS) removeStatus(t, b);
      t.shield = 0;
    }
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
  };
  victims.forEach((t, i) => hitOne(t, (fx.through ? Math.max(0.2, 1 - (fx.throughFalloff ?? 0.2) * i) : spread) * aboveMult));
  if (fx.vortex) for (const t of victims) if (t.alive) pullTo(state, t, x, y, fx.vortex);
  if (fx.allyShield) {
    const ally = allies(state, u).filter((o) => o !== u).sort((p, q) => manhattan(p.x, p.y, u.x, u.y) - manhattan(q.x, q.y, u.x, u.y))[0];
    if (ally) ally.shield = Math.max(ally.shield ?? 0, Math.round(ally.maxHp * fx.allyShield));
  }
  if (fx.burstAround?.around === 'self') burstFrom(state, u, u.x, u.y, fx.burstAround, s.element);
  // Ricochete: salta para inimigos próximos do primeiro alvo.
  if (fx.chain && victims[0]) {
    const first = victims[0];
    const extra = opponents(state, u)
      .filter((o) => !victims.includes(o) && manhattan(o.x, o.y, first.x, first.y) <= 3)
      .sort((p, q) => manhattan(p.x, p.y, first.x, first.y) - manhattan(q.x, q.y, first.x, first.y))
      .slice(0, fx.chain);
    for (const o of extra) {
      state.events.push({ type: 'fx', x: o.x, y: o.y, element: s.element ?? 'hit' });
      hitOne(o, fx.chainMult ?? 0.6);
    }
  }
  if (fx.healPct) for (const a of allies(state, u)) heal(state, a, Math.max(1, Math.round(a.maxHp * fx.healPct)));
  if (fx.retreat && victims[0] && u.alive) push(state, victims[0], u, fx.retreat);
  if (fx.drainToShield && dealt > 0) {
    u.shield = Math.max(u.shield ?? 0, dealt);
    state.log.push(`🌿 ${u.name} converte ${dealt} de vida drenada em escudo.`);
  }
  if (fx.spendAllMp && !resolving) u.mp = 0;
  if (!magic && num(u, 'momentum')) bag(u).momentum = 0;
  finish(state, u, keepHidden, resolving, def);
  return true;
}

/** Multiplicador de cura do conjurador (passivas de cura). */
export function healMult(state: BattleState, u: BattleUnit, skillId?: string): number {
  let m = skillId ? rankPower(u, skillId) : 1;
  for (const f of passiveFx(u)) if (f.healBoost && checkCondition(state, u, f.when)) m += f.healBoost;
  return m;
}

/** Tiles de uma linha reta até o alcance, atravessando unidades (para em obstáculos). */
function lineThrough(state: BattleState, u: BattleUnit, x: number, y: number, range: number): [number, number][] {
  const dx = Math.sign(x - u.x);
  const dy = Math.sign(y - u.y);
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return [[x, y]];
  const out: [number, number][] = [];
  for (let i = 1; i <= range; i++) {
    const t = tileAt(state.map, u.x + dx * i, u.y + dy * i);
    if (!t || !isWalkable(t)) break;
    out.push([u.x + dx * i, u.y + dy * i]);
  }
  return out;
}

/** Puxa uma unidade N metros em direção a (x, y). */
function pullTo(state: BattleState, t: BattleUnit, x: number, y: number, n: number): void {
  if (isImmune(t, 'empurrao')) return;
  for (let i = 0; i < n; i++) {
    if (t.x === x && t.y === y) break;
    const dx = x - t.x;
    const dy = y - t.y;
    const [nx, ny] = Math.abs(dx) >= Math.abs(dy) ? [t.x + Math.sign(dx), t.y] : [t.x, t.y + Math.sign(dy)];
    const tile = tileAt(state.map, nx, ny);
    if (!tile || !isWalkable(tile) || !isFree(state, nx, ny, t)) break;
    t.x = nx;
    t.y = ny;
  }
}

function burstFrom(state: BattleState, u: BattleUnit, x: number, y: number, b: NonNullable<SkillFx['burstAround']>, el?: Element): void {
  for (const o of opponents(state, u)) {
    if (manhattan(o.x, o.y, x, y) > b.radius) continue;
    if (b.power) damage(state, o, Math.max(1, Math.round(b.power + stats.magicPower(u.attrs) * 0.5)), u, el);
    if (b.push && o.alive) {
      const from = { ...u, x, y } as BattleUnit;
      push(state, from, o, b.push);
    }
  }
}

/** Parâmetros da arma encantada (se ativa). */
export function imbueOf(u: BattleUnit): SkillFx['imbue'] | undefined {
  if (!u.statuses.encantado) return undefined;
  const raw = u.fx?.imbue;
  return typeof raw === 'string' ? (JSON.parse(raw) as SkillFx['imbue']) : undefined;
}

/** Efeitos da arma encantada depois de um ataque básico que acertou. */
export function afterBasicHit(state: BattleState, u: BattleUnit, t: BattleUnit): void {
  const im = imbueOf(u);
  if (!im) return;
  spendCharge(state, u);
  if (im.status && t.alive) applyStatus(state, t, im.status, u);
  if (im.mpGain && u.maxMp) u.mp = Math.min(u.maxMp, u.mp + im.mpGain);
  if (im.push && t.alive) push(state, u, t, im.push);
  if (im.surface) applyElementToTile(state, t.x, t.y, im.surface);
  if (im.splash)
    for (const o of opponents(state, u))
      if (o !== t && manhattan(o.x, o.y, t.x, t.y) <= 1) damage(state, o, Math.max(1, Math.round(im.splash + stats.magicPower(u.attrs) * 0.4)), u, im.element);
}

/** Golpe preparado (cargas): gasta uma; sem cargas, o encanto acaba. */
function spendCharge(state: BattleState, u: BattleUnit): void {
  if (!num(u, 'imbueCharges')) return;
  bag(u).imbueCharges = num(u, 'imbueCharges') - 1;
  if (num(u, 'imbueCharges') <= 0) {
    removeStatus(u, 'encantado');
    delete bag(u).imbue;
  }
}

/** Golpe preparado também vale em habilidades: aplica o efeito no alvo atingido e gasta a carga. */
export function afterSkillHit(state: BattleState, u: BattleUnit, t: BattleUnit): void {
  const im = imbueOf(u);
  if (!im || !num(u, 'imbueCharges')) return;
  if (im.status && t.alive) applyStatus(state, t, im.status, u);
  const elSt = im.element ? ELEMENT_STATUS[im.element] : undefined;
  if (elSt && t.alive) applyStatus(state, t, elSt, u);
  spendCharge(state, u);
}

const ELEMENT_STATUS: Partial<Record<Element, FxStatus>> = { veneno: { id: 'envenenado', turns: 3 }, fogo: { id: 'queimando', turns: 2 }, gelo: { id: 'lento', turns: 1 }, eletricidade: { id: 'eletrocutado', turns: 2 } };

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
