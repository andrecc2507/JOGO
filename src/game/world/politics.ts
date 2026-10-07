import POL from '../data/world/politics.json';
import { hasFlag, ensureStory } from './story';
import type { Campaign } from './campaign';

/**
 * Política da campanha (C12, C15, C16, C20): reputação com as facções, aprovação dos companheiros
 * da história, influência e informação como recursos, e os planos mensais do inimigo.
 */
export type Faction = keyof typeof POL.factions;
export type OpId = keyof typeof POL.ops.list;

export const FACTIONS = POL.factions as Record<Faction, string>;
export const REP = POL.rep;
export const APPROVAL = POL.approval;
export const RES = POL.resources;
export const OPS = POL.ops;

export interface EnemyOp {
  id: OpId;
  /** Revelado com informação (antes disso aparece como "???"). */
  revealed: boolean;
  /** Missão para frustrar já aberta / plano frustrado. */
  countering?: boolean;
  foiled?: boolean;
}

export interface PoliticsState {
  rep: Record<string, number>;
  approval: Record<string, number>;
  influence: number;
  intel: number;
  /** Marcas da história já contadas na reputação e na aprovação. */
  seenFlags: string[];
  /** Planos propostos neste mês (entram em vigor no mês seguinte se não forem frustrados). */
  proposed: EnemyOp[];
  /** Planos em vigor até a hora indicada. */
  active: { id: OpId; until: number }[];
  /** Província revelada pelos batedores até a hora indicada. */
  scouted?: Record<string, number>;
}

export function ensurePolitics(c: Campaign): PoliticsState {
  c.politics ??= { rep: {}, approval: {}, influence: 0, intel: 5, seenFlags: [], proposed: [], active: [] };
  return c.politics;
}

const clamp = (v: number) => Math.max(-100, Math.min(100, v));

export function rep(c: Campaign, f: Faction): number {
  return ensurePolitics(c).rep[f] ?? 0;
}

export function addRep(c: Campaign, f: Faction | string, delta: number): void {
  const p = ensurePolitics(c);
  if (!(f in FACTIONS)) return;
  p.rep[f] = clamp((p.rep[f] ?? 0) + delta);
}

/** Facção-país dona da capital/cidade (id do país). */
export function factionOfCountry(countryId: string | null | undefined): Faction | null {
  return countryId && countryId in FACTIONS ? (countryId as Faction) : null;
}

// ───────────────────────────── aprovação ─────────────────────────────

export function approval(c: Campaign, storyId: string): number {
  return ensurePolitics(c).approval[storyId] ?? 0;
}

/** Ajusta a aprovação dos companheiros presentes no elenco. Devolve falas de reação. */
export function react(c: Campaign, deltas: Record<string, number>): string[] {
  const p = ensurePolitics(c);
  const out: string[] = [];
  const present = new Set(Object.values(c.roster).map((ch) => ch.storyId).filter(Boolean) as string[]);
  for (const [who, d] of Object.entries(deltas)) {
    if (!present.has(who) || !d) continue;
    p.approval[who] = clamp((p.approval[who] ?? 0) + d);
    out.push(`${who} ${d > 0 ? 'aprova' : 'desaprova'} (${d > 0 ? '+' : ''}${d}).`);
  }
  return out;
}

export function reactTo(c: Campaign, action: keyof typeof POL.actionApproval): string[] {
  return react(c, POL.actionApproval[action] as Record<string, number>);
}

/** Bônus de confiança (aprovação alta) para a ficha de batalha; recusa e partida com aprovação baixa. */
export function approvalState(c: Campaign, storyId: string | undefined): 'confia' | 'recusa' | 'normal' {
  if (!storyId) return 'normal';
  const a = approval(c, storyId);
  if (a >= APPROVAL.trust) return 'confia';
  if (a <= APPROVAL.refuse) return 'recusa';
  return 'normal';
}

/**
 * Marcas novas da história: reputação e aprovação reagem uma vez a cada uma; quem chega ao fundo
 * da aprovação deixa a resistência. Devolve as linhas para o registro.
 */
export function politicsFromFlags(c: Campaign): string[] {
  const p = ensurePolitics(c);
  const out: string[] = [];
  const flags = ensureStory(c).flags;
  for (const f of flags) {
    if (p.seenFlags.includes(f)) continue;
    p.seenFlags.push(f);
    for (const [fac, d] of Object.entries((POL.flagRep as Record<string, Record<string, number>>)[f] ?? {})) addRep(c, fac, d);
    out.push(...react(c, (POL.flagApproval as Record<string, Record<string, number>>)[f] ?? {}));
  }
  out.push(...departures(c));
  return out;
}

/** Companheiros com aprovação no fundo vão embora (com o que carregam). */
export function departures(c: Campaign): string[] {
  const out: string[] = [];
  for (const ch of Object.values(c.roster)) {
    if (!ch.storyId || approval(c, ch.storyId) > APPROVAL.leave) continue;
    for (const s of c.squads) {
      s.memberIds = s.memberIds.filter((id) => id !== ch.id);
      s.escort = (s.escort ?? []).filter((id) => id !== ch.id);
    }
    delete c.roster[ch.id];
    out.push(`🚪 ${ch.name} perdeu a fé no comandante e deixou a resistência.`);
  }
  return out;
}

// ───────────────────────────── recursos ─────────────────────────────

export function addIntel(c: Campaign, n: number): void {
  const p = ensurePolitics(c);
  p.intel = Math.max(0, p.intel + n);
}

export function addInfluence(c: Campaign, n: number): void {
  const p = ensurePolitics(c);
  p.influence = Math.max(0, p.influence + n);
}

export function spendIntel(c: Campaign, n: number): boolean {
  const p = ensurePolitics(c);
  if (p.intel < n) return false;
  p.intel -= n;
  return true;
}

export function spendInfluence(c: Campaign, n: number): boolean {
  const p = ensurePolitics(c);
  if (p.influence < n) return false;
  p.influence -= n;
  return true;
}

/** Multiplicador de preço numa capital: reputação com o país (±25%) e a Sobretaxa, se em vigor. */
export function priceMult(c: Campaign, countryId: string | null | undefined): number {
  const f = factionOfCountry(countryId);
  const r = f ? rep(c, f) : 0;
  const tax = opActive(c, 'sobretaxa') ? OPS.list.sobretaxa.price : 1;
  return Math.max(0.6, (1 - r / REP.priceSpan) * tax);
}

/** Recrutas extras (+1 com reputação alta) ou bloqueio (reputação baixa) numa capital. */
export function recruitMod(c: Campaign, countryId: string | null | undefined): number {
  const f = factionOfCountry(countryId);
  const r = f ? rep(c, f) : 0;
  return r >= REP.recruitBonusAt ? 1 : r <= REP.recruitBlockAt ? -99 : 0;
}

// ───────────────────────────── planos do inimigo ─────────────────────────────

export function opActive(c: Campaign, id: OpId): boolean {
  return ensurePolitics(c).active.some((o) => o.id === id && o.until > c.hours);
}

export function activeOps(c: Campaign): OpId[] {
  return ensurePolitics(c).active.filter((o) => o.until > c.hours).map((o) => o.id);
}

/**
 * Virada do mês: os planos propostos não frustrados entram em vigor; o inimigo propõe novos.
 * Devolve as linhas do relatório.
 */
export function monthOps(c: Campaign, rng: { pick<T>(a: readonly T[]): T; chance(p: number): boolean }): string[] {
  const p = ensurePolitics(c);
  const out: string[] = [];
  p.active = p.active.filter((o) => o.until > c.hours);
  for (const op of p.proposed) {
    if (op.foiled) continue;
    p.active.push({ id: op.id, until: c.hours + OPS.durationDays * 24 });
    out.push(`🜏 Em vigor por ${OPS.durationDays} dias: ${OPS.list[op.id].label} — ${OPS.list[op.id].text}`);
  }
  const ch = ensureStory(c).chapter;
  const pool = (Object.keys(OPS.list) as OpId[]).filter((id) => OPS.list[id].from <= ch && !p.active.some((a) => a.id === id));
  p.proposed = [];
  for (let i = 0; i < OPS.perMonth && pool.length; i++) {
    const id = rng.pick(pool);
    pool.splice(pool.indexOf(id), 1);
    p.proposed.push({ id, revealed: false });
  }
  if (p.proposed.length) out.push(`👁 O inimigo prepara ${p.proposed.length} plano(s) para o próximo mês. Gaste informação para revelá-los e frustre ${OPS.counterSlots} na Sala de guerra.`);
  // Influência: capitais com boa reputação mandam apoio.
  const allies = (Object.keys(FACTIONS) as Faction[]).filter((f) => rep(c, f) >= REP.influenceAt).length;
  if (allies) {
    addInfluence(c, allies * RES.influencePerAlly);
    out.push(`🤝 ${allies} facção(ões) aliada(s): +${allies * RES.influencePerAlly} de influência.`);
  }
  return out;
}

export function revealOp(c: Campaign, idx: number): boolean {
  const op = ensurePolitics(c).proposed[idx];
  if (!op || op.revealed || !spendIntel(c, RES.revealOpCost)) return false;
  op.revealed = true;
  return true;
}

/** Quantos planos ainda dá para frustrar neste mês. */
export function counterSlotsLeft(c: Campaign): number {
  return OPS.counterSlots - ensurePolitics(c).proposed.filter((o) => o.countering || o.foiled).length;
}

export { hasFlag };
