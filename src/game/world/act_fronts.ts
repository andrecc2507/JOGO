import type { Rng } from '@core';
import type { BattleSetup } from '../battle/types';
import type { Victory } from '../battle/types';
import type { ClassId } from '../data';
import { capitals, node, places } from './layout';
import { provinceOf } from './provinces';
import { provinceState, setOwner } from './territory';
import ACTS from '../data/world/acts.json';
import { actContract, actContracts, allyUnit, chapterOf, ensureActs, type Front } from './acts_state';
import { averageLevel, type Campaign, type Contract, type MissionKind } from './campaign';

/**
 * Ato 3 (guerra civil). Cada país é uma frente com a força da Coroa, a força da Resistência e a
 * moral da Coroa. Toda semana a frente pende para quem é mais forte e uma cidade troca de dono.
 * O comandante não move exércitos: abre operações (saquear, matar o oficial, proteger a ponte) que
 * mudam a balança. Cada operação feita antes do assalto ao palácio enfraquece a batalha final.
 */
const FR = ACTS.fronts;

export function ensureFronts(c: Campaign): Front[] {
  const a = ensureActs(c);
  if (!a.fronts.length) for (const cap of capitals()) a.fronts.push({ country: cap.countryId!, crown: FR.start.crown, resistance: FR.start.resistance, morale: 50 });
  return a.fronts;
}

function countryName(id: string): string {
  return capitals().find((n) => n.countryId === id)?.name ?? id;
}

/** Semana do Ato 3: as frentes andam e surgem operações novas. */
export function frontsDay(c: Campaign, day: number, rng: Rng): string[] {
  if (chapterOf(c) !== 3) return [];
  const a = ensureActs(c);
  const fronts = ensureFronts(c);
  if ((a.lastDay.fronts ?? -99) + FR.everyDays > day) return [];
  a.lastDay.fronts = day;
  const out: string[] = [];
  for (const f of fronts) {
    const push = f.resistance - f.crown + (50 - f.morale) / 5 + rng.int(-5, 5);
    const cities = places().filter((n) => n.countryId === f.country && n.type === 'city');
    if (push >= FR.advanceAt) {
      const t = cities.find((n) => provinceState(c, provinceOf(n.id)).owner === 'coroa');
      if (t) {
        setOwner(c, provinceOf(t.id), 'resistencia');
        out.push(`⚔ Frente de ${countryName(f.country)}: a Resistência tomou ${t.name}.`);
      }
    } else if (push <= -FR.advanceAt) {
      const t = cities.find((n) => provinceState(c, provinceOf(n.id)).owner === 'resistencia');
      if (t) {
        setOwner(c, provinceOf(t.id), 'coroa');
        out.push(`⚔ Frente de ${countryName(f.country)}: a Coroa retomou ${t.name}.`);
      }
    }
    // Os dois lados se reabastecem um pouco toda semana; a moral volta devagar ao normal.
    f.crown = Math.min(100, f.crown + FR.drift);
    f.resistance = Math.min(100, f.resistance + FR.drift);
    f.morale = Math.min(100, f.morale + FR.drift);
  }
  // Duas operações novas por semana, em frentes diferentes.
  const open = new Set(actContracts(c, 'frente').map((ct) => ct.actOp!.ref.split(':')[0]));
  const free = fronts.filter((f) => !open.has(f.country));
  for (let i = 0; i < 2 && free.length; i++) {
    const f = free.splice(rng.int(0, free.length - 1), 1)[0]!;
    const op = rng.pick(FR.ops);
    const cities = places().filter((n) => n.countryId === f.country && n.type === 'city');
    const t = rng.pick(cities);
    const ct = actContract(c, {
      title: op.title.replace('{country}', countryName(f.country)).replace('{place}', t.name),
      desc: op.desc,
      victory: op.victory as Victory['type'],
      mission: (op as { mission?: MissionKind }).mission,
      target: t.id,
      expiresAt: c.hours + FR.everyDays * 24,
      kind: 'frente',
      ref: `${f.country}:${op.kind}`,
    });
    out.push(`⚔ Operação aberta: ${ct.title}.`);
  }
  for (const ct of actContracts(c, 'frente')) if (ct.expiresAt !== undefined && ct.expiresAt <= c.hours) ((ct.status = 'done'), (ct.failed = true));
  return out;
}

/** Operação cumprida: muda a balança da frente e conta como preparo do assalto ao palácio. */
export function frontOpDone(c: Campaign, ct: Contract): string[] {
  const a = ensureActs(c);
  const [country, kind] = (ct.actOp?.ref ?? '').split(':');
  const f = ensureFronts(c).find((x) => x.country === country);
  if (!f) return [];
  const op = FR.ops.find((o) => o.kind === kind) ?? FR.ops[0]!;
  const o = op as { crown?: number; resistance?: number; crownMorale?: number };
  f.crown = Math.max(0, Math.min(100, f.crown + (o.crown ?? 0)));
  f.resistance = Math.max(0, Math.min(100, f.resistance + (o.resistance ?? 0)));
  f.morale = Math.max(0, Math.min(100, f.morale + (o.crownMorale ?? 0)));
  a.prep = Math.min(FR.prepMax, a.prep + 1);
  return [`⚔ Frente de ${countryName(f.country)}: Coroa ${f.crown} · Resistência ${f.resistance} · moral ${f.morale}. Preparo do assalto ao palácio: ${a.prep}/${FR.prepMax}.`];
}

/** Vitória numa província do Ato 3 fortalece a Resistência naquela frente. */
export function frontsAfterBattle(c: Campaign, nodeId: string, victory: boolean): void {
  if (chapterOf(c) !== 3 || !victory) return;
  const f = ensureActs(c).fronts.find((x) => x.country === node(nodeId).countryId);
  if (f) f.resistance = Math.min(100, f.resistance + FR.victoryStrength);
}

/** Assalto ao palácio: cada operação de preparo tira uma onda; com 2 ou mais, rebeldes lutam junto. */
export function palacePrep(c: Campaign, missionId: string, setup: BattleSetup, rng: Rng): string | null {
  if (!FR.prepMissions.includes(missionId)) return null;
  const p = ensureActs(c).prep;
  if (!p) return null;
  setup.waves = (setup.waves ?? []).slice(p);
  if (p >= 2) {
    const lv = averageLevel(c);
    setup.allies = [...(setup.allies ?? []), allyUnit(rng, 'guerreiro' as ClassId, lv, 'Rebelde de Arven'), allyUnit(rng, 'arqueiro' as ClassId, lv, 'Arqueira rebelde')];
  }
  setup.context.title = `${setup.context.title} · preparo ${p}/${FR.prepMax}`;
  return `Preparo do assalto: ${p} onda(s) a menos${p >= 2 ? ' e rebeldes lutando ao lado' : ''}.`;
}
