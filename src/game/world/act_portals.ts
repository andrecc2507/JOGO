import type { Rng } from '@core';
import { DB, type ClassId } from '../data';
import type { BattleSetup } from '../battle/types';
import { capitals, node, nodeOpen, places } from './layout';
import { provinceOf } from './provinces';
import { provinceState, setOwner, ensureWorld } from './territory';
import { spawnForce } from './forces';
import { rep, spendInfluence, type Faction } from './politics';
import { fallenCapitals, setFlag } from './story';
import { ACTS, actContract, actContracts, allyUnit, chapterOf, ensureActs } from './acts_state';
import { averageLevel, type Campaign, type Contract } from './campaign';

/**
 * Ato 4 (incursões e união). Portais abrem no mapa e amadurecem; maduros, viram incursões que
 * levam moradores e espalham a Terra Morta pela província. Fechar um portal é uma missão. A
 * confiança de cada capital (reputação) mais a influência compram alianças: tropa ao lado nas
 * batalhas naquele país, território e renda. Capital com medo em 100 cai de vez.
 */
const PO = ACTS.portals;

/** Dia do Ato 4: portais nascem, amadurecem e explodem; capitais em pânico caem. */
export function portalsDay(c: Campaign, day: number, rng: Rng): string[] {
  const ch = chapterOf(c);
  if (ch < 4) return [];
  const a = ensureActs(c);
  const out: string[] = [];
  if (ch === 4) {
    if ((a.lastDay.portal ?? -99) + PO.everyDays <= day && a.portals.length < PO.max) {
      a.lastDay.portal = day;
      const spots = places().filter((n) => n.realm === 'reino' && (n.type === 'city' || n.type === 'village') && nodeOpen(n, ch) && !a.portals.some((p) => p.at === n.id));
      const t = rng.pick(spots);
      const id = `portal_${day}_${rng.int(1, 1e6)}`;
      a.portals.push({ id, at: t.id, maturity: 0 });
      actContract(c, { title: `🌀 Fechar o portal em ${t.name}`, desc: 'Apague as runas do portal (2 ações) antes que ele amadureça.', victory: 'interact', mission: 'runas', target: t.id, kind: 'portal', ref: id, levelBonus: 2 });
      out.push(`🌀 Um portal abriu em ${t.name}. Ele amadurece em ~${Math.ceil(100 / PO.maturePerDay)} dias.`);
    }
    for (const p of [...a.portals]) {
      p.maturity += PO.maturePerDay;
      if (p.maturity < 100) continue;
      // Maduro: incursão, sequestros e Terra Morta.
      a.portals = a.portals.filter((x) => x !== p);
      for (const ct of actContracts(c, 'portal')) if (ct.actOp?.ref === p.id) ((ct.status = 'done'), (ct.failed = true));
      const taken = rng.int(PO.abducted[0]!, PO.abducted[1]!);
      c.abducted = (c.abducted ?? 0) + taken;
      const prov = provinceOf(p.at);
      if (!a.blighted.includes(prov)) a.blighted.push(prov);
      const st = provinceState(c, prov);
      st.fear = Math.min(100, st.fear + PO.spreadFear);
      spawnForce(c, rng, ch, averageLevel(c) + 2, [p.at], c.baseNode, 'incursao');
      out.push(`🌀 O portal de ${node(p.at).name} amadureceu: ${taken} moradores levados e a Terra Morta se espalhou.`);
    }
  }
  // Capital em pânico (medo 100) cai de vez — a não ser que seja a base ou uma aliada.
  for (const cap of capitals()) {
    const st = ensureWorld(c).provinces[provinceOf(cap.id)];
    if (!st || st.fear < PO.capitalFallsAt || cap.id === c.baseNode || fallenCapitals(c).includes(cap.id) || a.alliances.includes(cap.countryId!)) continue;
    setFlag(c, `caiu:${cap.id}`);
    out.push(`🔥 ${cap.name} entrou em pânico e caiu. A capital está perdida.`);
  }
  return out;
}

/** Portal fechado pela missão. */
export function portalClosed(c: Campaign, ct: Contract): string[] {
  const a = ensureActs(c);
  const p = a.portals.find((x) => x.id === ct.actOp?.ref);
  if (!p) return [];
  a.portals = a.portals.filter((x) => x !== p);
  const st = provinceState(c, provinceOf(p.at));
  st.fear = Math.max(0, st.fear - 10);
  return [`🌀 Portal de ${node(p.at).name} fechado.`];
}

export function isBlighted(c: Campaign, nodeId: string): boolean {
  return ensureActs(c).blighted.includes(provinceOf(nodeId));
}

// ───────────────────────────── diplomacia ─────────────────────────────

/** Por que a aliança com o país ainda não sai (ou null). */
export function allianceBlock(c: Campaign, countryId: string): string | null {
  const a = ensureActs(c);
  const cap = capitals().find((n) => n.countryId === countryId);
  if (chapterOf(c) < 4) return 'Alianças a partir do Ato 4.';
  if (a.alliances.includes(countryId)) return 'Já é aliado.';
  if (cap && fallenCapitals(c).includes(cap.id)) return 'A capital caiu.';
  if (rep(c, countryId as Faction) < PO.allianceRep) return `Confiança insuficiente (reputação ${rep(c, countryId as Faction)}/${PO.allianceRep}).`;
  if ((c.politics?.influence ?? 0) < PO.allianceInfluence) return `Custa ${PO.allianceInfluence} de influência.`;
  return null;
}

export function makeAlliance(c: Campaign, countryId: string): boolean {
  if (allianceBlock(c, countryId) || !spendInfluence(c, PO.allianceInfluence)) return false;
  ensureActs(c).alliances.push(countryId);
  for (const n of places().filter((x) => x.countryId === countryId)) {
    const pid = provinceOf(n.id);
    if (provinceState(c, pid).owner !== 'resistencia') setOwner(c, pid, 'resistencia', 60);
  }
  return true;
}

/** Renda mensal das alianças. */
export function alliancesMonth(c: Campaign): string[] {
  const n = ensureActs(c).alliances.length;
  if (!n) return [];
  c.gold += n * PO.allianceIncome;
  return [`🤝 Alianças (${n}): +${n * PO.allianceIncome} ouro.`];
}

/** Batalha num país aliado: um soldado dele luta ao lado. */
export function allianceTroops(c: Campaign, setup: BattleSetup, nodeId: string, rng: Rng): void {
  const country = node(nodeId).countryId;
  if (!country || !ensureActs(c).alliances.includes(country)) return;
  const def = DB.countries.find((x) => x.id === country);
  if (!def) return;
  setup.allies = [...(setup.allies ?? []), allyUnit(rng, def.classId as ClassId, averageLevel(c), `Soldado de ${def.name}`)];
}
