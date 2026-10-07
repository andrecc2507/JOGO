/**
 * Simulação de campanha (camada de comandante): roda meses de jogo em cada capítulo com decisões
 * automáticas — atender crises e operações do ato, aceitar contratos de facção, interceptar forças,
 * comprar rações, construir postos, revelar e frustrar planos do inimigo — e mede economia,
 * território, pressão e o ritmo de cada sistema. As batalhas são resolvidas por sorteio (o motor de
 * batalha tem a própria simulação). Só roda com SIM=1 (npm run sim:campanha); grava o relatório em
 * `docs/design/simulacao_campanha.md`.
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Rng } from '@core';
import {
  acceptContract,
  advanceHours,
  allContracts,
  campaignRng,
  fitMembers,
  members,
  newCampaign,
  orderMove,
  travelHours,
  travelers,
  type Campaign,
  type Contract,
  type Squad,
} from '@game/world/campaign';
import { STORY, CHAPTER_TITLE, ensureStory } from '@game/world/story';
import { foundBase } from '@game/world/base';
import { node, nodeOpen, places, shortestPath } from '@game/world/layout';
import { removeForce } from '@game/world/forces';
import { contractDonePolitics, counterOp, mySide } from '@game/world/commander';
import { actsContractDone } from '@game/world/acts';
import { ensureActs } from '@game/world/acts_state';
import { buyRations, huntRations, SUPPLY, supplyCap } from '@game/world/logistics';
import { ensurePolitics, revealOp, RES, FACTIONS, rep, type Faction } from '@game/world/politics';
import { OWNER_LABEL, ensureWorld, type Owner } from '@game/world/territory';
import { rollEncounter } from '@game/world/encounters';
import { choiceChance, resolveChoice, rollTravelEvent } from '@game/world/travel_events';
import { boardContracts, openBoards, refreshBoard } from '@game/world/boards';
import { buildOutpost, buildBlock, type OutpostKind } from '@game/world/outposts';
import { ensureExpedition } from '@game/world/expedition';
import { crossVoid, inVoid } from '@game/world/act_void';
import { setCamp } from '@game/world/act_camp';
import { allocate, warPoints, WAR_FRONTS } from '@game/world/act_war_table';
import { makeAlliance, allianceBlock } from '@game/world/act_portals';
import { capitals } from '@game/world/layout';

const RUN = !!process.env.SIM;
const SEEDS = Number(process.env.SIM_N ?? 4);
const DAYS = Number(process.env.SIM_DAYS ?? 90);
const STEP = 6;
const WIN = 0.75;

interface Stats {
  goldStart: number;
  goldEnd: number;
  battles: number;
  wins: number;
  crisesSeen: Set<string>;
  crisesDone: number;
  crisesFailed: number;
  forcesFought: number;
  boardDone: number;
  events: number;
  hungerDays: number;
  outposts: number;
  owners: Record<string, number>;
  forcesActive: number[];
  rep: number;
  intel: number;
  influence: number;
  notes: string[];
}

function setupChapter(seed: number, ch: number): Campaign {
  const c = newCampaign(seed);
  const st = ensureStory(c);
  st.chapter = ch;
  st.done = STORY.filter((m) => m.chapter < ch).map((m) => m.id);
  c.act = Math.max(1, ch);
  c.gold += ch * 400;
  if (ch >= 2) foundBase(c, 'guerreiros_capital');
  for (const m of Object.values(c.roster)) m.level = Math.max(m.level, 2 + ch * 5);
  return c;
}

function hoursTo(s: Squad, id: string, ch: number): number {
  const path = shortestPath(s.to ?? s.at, id, { open: (n) => nodeOpen(n, ch) });
  return path.length ? travelHours([s.to ?? s.at, ...path]) : Infinity;
}

/** Vence ou perde uma luta abstrata; aplica cansaço e caça. */
function fight(c: Campaign, s: Squad, rng: Rng, stats: Stats, beasts = 0): boolean {
  stats.battles++;
  const win = rng.chance(WIN);
  if (win) stats.wins++;
  for (const m of travelers(c, s)) m.fatigue = Math.min(100, (m.fatigue ?? 0) + 10);
  if (win && beasts) huntRations(s, s.memberIds.length, beasts);
  return win;
}

function finishContract(c: Campaign, ct: Contract, rng: Rng, stats: Stats): void {
  ct.status = 'done';
  c.gold += ct.rewardGold;
  if (ct.actOp) actsContractDone(c, ct, rng);
  else contractDonePolitics(c, ct);
  if (ct.crisis) stats.crisesDone++;
  if (ct.board) stats.boardDone++;
}

/** O que um esquadrão parado decide fazer. */
function decide(c: Campaign, s: Squad, rng: Rng, stats: Stats): void {
  const ch = ensureStory(c).chapter;
  const people = travelers(c, s).length;
  // Ato 5: entra no Vazio e sai antes da segunda mutação (corrupção 45) ou quando a comida acaba.
  const worst = Math.max(0, ...members(c, s).map((m) => ensureActs(c).corruption[m.id] ?? 0));
  if (ch === 5 && ['capital', 'citadel'].includes(node(s.at).type) && !s.to) {
    if (!inVoid(c, s) && worst < 25) crossVoid(c, s);
    else if (inVoid(c, s) && (worst >= 45 || (s.supplies ?? 0) < people * 3)) crossVoid(c, s);
  }
  if (inVoid(c, s) && (worst >= 45 || (s.supplies ?? 0) < people * 3)) {
    const exit = places().filter((n) => n.type === 'capital' || n.type === 'citadel').sort((a, b) => hoursTo(s, a.id, ch) - hoursTo(s, b.id, ch))[0];
    if (exit && exit.id !== s.at && orderMove(c, s, exit.id)) return;
  }
  // Comida primeiro.
  if ((s.supplies ?? SUPPLY.start) < people * 3) {
    if (['city', 'village', 'capital', 'citadel'].includes(node(s.at).type) && !inVoid(c, s)) buyRations(c, s, people, 999);
    else {
      const towns = places().filter((n) => n.type !== 'waypoint' && n.type !== 'lair' && n.type !== 'dungeon' && nodeOpen(n, ch));
      const near = towns.sort((a, b) => hoursTo(s, a.id, ch) - hoursTo(s, b.id, ch))[0];
      if (near && orderMove(c, s, near.id)) return;
    }
  }
  // Crises e operações do ato: a mais perto com tempo.
  const urgent = allContracts(c)
    .filter((ct) => ct.status === 'accepted' && ct.crisis && !ct.squadId && nodeOpen(node(ct.targetNode), ch))
    .map((ct) => ({ ct, h: hoursTo(s, ct.targetNode, ch) }))
    .filter((x) => x.h < ((x.ct.expiresAt ?? Infinity) - c.hours))
    .sort((a, b) => a.h - b.h)[0];
  if (urgent && orderMove(c, s, urgent.ct.targetNode)) return;
  // Contratos de facção.
  for (const b of openBoards(c)) {
    if (!boardContracts(c, b).length) refreshBoard(c, b);
    const ct = boardContracts(c, b).find((x) => x.status === 'open' && !x.task && hoursTo(s, x.targetNode, ch) < 96);
    if (ct) {
      acceptContract(c, ct, s);
      if (orderMove(c, s, ct.targetNode)) return;
    }
  }
  // Ato 6: acampamento no continente; Ato 5: um esquadrão no Vazio.
  if (ch >= 6 && !c.acts?.camp) {
    if (node(s.at).realm === 'continente' && node(s.at).type === 'village') setCamp(c, s);
    else if (orderMove(c, s, 'continente_porto')) return;
  }
  // Postos: um refúgio ou depósito de vez em quando.
  if (ch >= 2 && c.gold > 1500 && rng.chance(0.1)) {
    const kind = (ch >= 4 ? rng.pick(['deposito', 'torre', 'enfermaria']) : 'refugio') as OutpostKind;
    if (!buildBlock(c, s, kind) && buildOutpost(c, s, kind)) stats.outposts++;
  }
  // Senão, patrulha uma cidade do lado do jogador.
  const side = mySide(c);
  const towns = places().filter((n) => (n.type === 'city' || n.type === 'village') && n.realm === 'reino' && nodeOpen(n, ch) && side.includes(ensureWorld(c).provinces[n.id]?.owner ?? 'livre'));
  if (towns.length) orderMove(c, s, rng.pick(towns).id);
}

function simulate(seed: number, ch: number): Stats {
  const c = setupChapter(seed, ch);
  const rng = new Rng(seed * 97 + ch);
  const stats: Stats = { goldStart: c.gold, goldEnd: 0, battles: 0, wins: 0, crisesSeen: new Set(), crisesDone: 0, crisesFailed: 0, forcesFought: 0, boardDone: 0, events: 0, hungerDays: 0, outposts: 0, owners: {}, forcesActive: [], rep: 0, intel: 0, influence: 0, notes: [] };
  for (let h = 0; h < DAYS * 24; h += STEP) {
    const evs = advanceHours(c, STEP);
    for (const ev of evs) {
      if (ev.type === 'day') {
        stats.forcesActive.push((c.world?.forces ?? []).length);
        stats.hungerDays += c.squads.filter((s) => (s.hungry ?? 0) > 0).length;
        for (const ct of allContracts(c)) if (ct.crisis) stats.crisesSeen.add(ct.id);
        // Planos do inimigo: revelar e frustrar o primeiro.
        const p = ensurePolitics(c);
        p.proposed.forEach((_, i) => p.intel >= RES.revealOpCost && revealOp(c, i));
        const idx = p.proposed.findIndex((o) => o.revealed && !o.countering && !o.foiled);
        if (idx >= 0) counterOp(c, idx);
        // Ato 4: alianças assim que der; Ato 8: distribui a força.
        if (ch === 4) for (const cap of capitals()) if (!allianceBlock(c, cap.countryId!)) makeAlliance(c, cap.countryId!);
        if (ch === 8) for (const f of WAR_FRONTS) while (allocate(c, f.id, 1)) if ((ensureActs(c).warTable[f.id] ?? 0) >= f.need) break;
      }
      if (ev.type === 'intercept') {
        const s = c.squads.find((x) => x.id === ev.squadId);
        const f = (c.world?.forces ?? []).find((x) => x.id === ev.forceId);
        if (s && f && fitMembers(c, s).length) {
          stats.forcesFought++;
          if (fight(c, s, rng, stats, f.owner === 'livre' ? f.units.length : 0)) removeForce(c, f.id);
        }
      }
      if (ev.type === 'arrived') {
        const s = c.squads.find((x) => x.id === ev.squadId);
        if (!s || s.to) continue;
        const ct = allContracts(c).find((x) => x.status === 'accepted' && !x.task && (x.squadId === s.id || (x.crisis && !x.squadId)) && x.targetNode === s.at);
        if (ct && fight(c, s, rng, stats)) finishContract(c, ct, rng, stats);
      }
    }
    for (const s of c.squads) {
      if (s.to) {
        // Na estrada: encontros e eventos de viagem.
        if (node(s.at).type === 'waypoint' && s.progress < 0.05) {
          const plan = rollEncounter(c, s);
          if (plan) fight(c, s, rng, stats, plan.enemies.length);
          else {
            const ev = rollTravelEvent(c, s, rng);
            if (ev) {
              stats.events++;
              const best = ev.choices.map((x, i) => ({ i, p: choiceChance(c, s, x) ?? 100 })).sort((a, b) => b.p - a.p)[0]!;
              resolveChoice(c, s, ev, best.i, rng);
            }
          }
        }
        continue;
      }
      decide(c, s, rng, stats);
    }
  }
  stats.crisesFailed = allContracts(c).filter((ct) => ct.crisis && ct.failed).length;
  stats.goldEnd = c.gold;
  for (const st of Object.values(ensureWorld(c).provinces)) stats.owners[st.owner] = (stats.owners[st.owner] ?? 0) + 1;
  stats.rep = Math.round((Object.keys(FACTIONS) as Faction[]).reduce((a, f) => a + rep(c, f), 0));
  stats.intel = ensurePolitics(c).intel;
  stats.influence = ensurePolitics(c).influence;
  const a = ensureActs(c);
  const notes: Record<number, string> = {
    1: `Favor ${a.favor} · Suspeita ${a.suspicion}`,
    2: `Procurado máx. ${Math.max(0, ...Object.values(a.wanted))} · pistas ${a.clues.length}`,
    3: `preparo ${a.prep} · frentes ${a.fronts.map((f) => `${f.resistance}/${f.crown}`).join(' ')}`,
    4: `portais ${a.portals.length} · Terra Morta ${a.blighted.length} · alianças ${a.alliances.length} · levados ${c.abducted ?? 0}`,
    5: `corrupção máx. ${Math.max(0, ...Object.values(a.corruption))} · mutações ${Object.values(a.mutations).flat().length} · caravana ${a.caravan ? a.caravan.survivors : '—'}`,
    6: `acampamento ${a.camp ? node(a.camp).name : '—'} · trocas ${Object.keys(a.shifted).length}`,
    7: `Barões: postos restantes ${a.barons.reduce((x, b) => x + b.posts.length, 0)} · rancor ${a.barons.map((b) => b.rage).join('/')} · Despertar ${c.veil?.value ?? 0}`,
    8: `força ${warPoints(c).total} · ${WAR_FRONTS.map((f) => `${f.id} ${a.warTable[f.id] ?? 0}/${f.need}`).join(' ')}`,
  };
  if (notes[ch]) stats.notes.push(notes[ch]!);
  stats.notes.push(`lendas com pista ${ensureExpedition(c).clues.length}`);
  return stats;
}

describe.skipIf(!RUN)('simulação de campanha (camada de comandante)', () => {
  it('roda cada capítulo e grava o relatório', () => {
    const rows: string[] = [];
    const notes: string[] = [];
    for (let ch = 0; ch <= 8; ch++) {
      const runs = Array.from({ length: SEEDS }, (_, i) => simulate(1000 + i * 17, ch));
      const avg = (f: (s: Stats) => number) => runs.reduce((a, s) => a + f(s), 0) / runs.length;
      const own = (o: Owner) => avg((s) => s.owners[o] ?? 0).toFixed(0);
      const months = DAYS / 30;
      rows.push(
        `| ${CHAPTER_TITLE[ch]!.split(' — ')[0]} | ${Math.round(avg((s) => (s.goldEnd - s.goldStart) / months))} | ${avg((s) => s.battles / months).toFixed(1)} | ${Math.round(avg((s) => (100 * s.wins) / Math.max(1, s.battles)))}% | ${avg((s) => s.crisesSeen.size / months).toFixed(1)} | ${avg((s) => s.crisesDone / months).toFixed(1)} | ${avg((s) => s.crisesFailed / months).toFixed(1)} | ${avg((s) => s.forcesFought / months).toFixed(1)} | ${avg((s) => s.forcesActive.reduce((a, b) => a + b, 0) / Math.max(1, s.forcesActive.length)).toFixed(1)} | ${avg((s) => s.boardDone / months).toFixed(1)} | ${avg((s) => s.events / months).toFixed(1)} | ${avg((s) => s.hungerDays / months).toFixed(1)} | ${own('resistencia')}/${own('coroa')}/${own('culto')}/${own('vazio')}/${own('livre')} | ${Math.round(avg((s) => s.rep))} | ${Math.round(avg((s) => s.intel))}/${Math.round(avg((s) => s.influence))} |`,
      );
      notes.push(`- **${CHAPTER_TITLE[ch]}**: ${runs[0]!.notes.join(' · ')}`);
    }
    const lines = [
      '# Simulação de campanha (camada de comandante)',
      '',
      `Gerado por \`npm run sim:campanha\` — ${SEEDS} campanhas por capítulo, ${DAYS} dias cada, batalhas resolvidas por sorteio (${Math.round(WIN * 100)}% de vitória).`,
      'Números por mês, médias entre as campanhas.',
      '',
      `| Capítulo | Ouro líquido | Batalhas | Vitórias | Crises surgidas | Crises atendidas | Crises perdidas | Forças combatidas | Forças ativas | Contratos de facção | Eventos de viagem | Dias de fome | Províncias (${['resistencia', 'coroa', 'culto', 'vazio', 'livre'].map((o) => OWNER_LABEL[o as Owner]).join('/')}) | Reputação (soma) | Informação/Influência (fim) |`,
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...rows,
      '',
      '## Sistema do ato (primeira campanha de cada capítulo, no fim)',
      '',
      ...notes,
      '',
      '## Como ler',
      '',
      '- O piloto automático é simples: atende a crise mais perto que ainda dá tempo, aceita contratos de facção,',
      '  compra rações quando faltam três dias, intercepta o que aparece no caminho, revela e frustra planos do inimigo.',
      '  Um jogador atento faz melhor; o objetivo é medir a pressão de cada sistema, não a vitória.',
      '- "Crises perdidas" altas num capítulo significam pressão demais para dois esquadrões; "dias de fome" acima de',
      '  zero mostram rotas longas sem cidade (terras distantes, Vazio).',
      '- Ouro líquido inclui renda das províncias, contratos, manutenção dos postos e compras de rações.',
    ];
    writeFileSync('docs/design/simulacao_campanha.md', lines.join('\n') + '\n');
  }, 3_600_000);
});
