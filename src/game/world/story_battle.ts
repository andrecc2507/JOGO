import type { Rng } from '@core';
import { DB, STORY_KITS } from '../data';
import type { BattleSetup, BattleUnit, BossPhase, ObjectiveDef, Victory, Wave } from '../battle/types';
import { unitFromCharacter, unitFromEnemy } from '../battle/units';
import { generateMap } from '../mapgen/generator';
import { buildStoryMap } from '../mapgen/story_maps';
import { makeCharacter } from '../rules/recruit';
import { studiedSpecies } from './base';
import { huntedSpecies } from './capital_services';
import { addLog, advanceAct, campaignRng, giveItem, removeFromSquads, type Campaign, type Squad } from './campaign';
import { playerUnits, squadLevel } from './encounters';
import { node } from './layout';
import { ensureLoyalty } from './loyalty';
import { battleDifficulty, difficultyOf } from './difficulty';
import { lessonFor } from './tutorial';
import { addChronicle } from './chronicle';
import {
  CHAPTER_TITLE,
  CODEX_ENTRIES,
  RULES,
  STORY,
  completeMission,
  condOk,
  hasFlag,
  loseMission,
  setFlag,
  missionNode,
  storyLevel,
  type StoryAlly,
  type StoryFoe,
  type StoryMission,
} from './story';

/**
 * Batalhas e consequências das missões da história: monta o `BattleSetup` a partir da ficha da
 * missão (inimigos com nome e vida de personagem, chefes com fases, ondas, aliados IA, VIP) e
 * aplica o que a missão concluída muda na campanha (recrutas, desertores, ato seguinte).
 */

/** Nível dos inimigos da missão para este esquadrão. */
export function missionLevel(c: Campaign, s: Squad, m: StoryMission): number {
  return Math.max(1, storyLevel(m.level, squadLevel(c, s)) + difficultyOf(c).levelOffset);
}

function foeUnits(rng: Rng, foes: StoryFoe[], level: number): BattleUnit[] {
  const out: BattleUnit[] = [];
  for (const f of foes) {
    const def = DB.enemies[f.id];
    if (!def) continue;
    for (let i = 0; i < (f.n ?? 1); i++) {
      const u = unitFromEnemy(def, Math.max(1, level + (f.lv ?? 0)), rng);
      if (f.name) u.name = f.name;
      if (f.hp) {
        u.maxHp = Math.round(u.maxHp * f.hp);
        u.hp = u.startHp = u.maxHp;
        u.xpReward = Math.round((u.xpReward ?? 0) * f.hp);
      }
      if (f.boss) u.boss = true;
      if (f.phases?.length)
        u.phases = f.phases.map(
          (p): BossPhase => ({ at: p.at, say: p.say, heal: p.heal, statuses: p.statuses, spawn: p.spawn ? foeUnits(rng, p.spawn, level) : undefined }),
        );
      out.push(u);
    }
  }
  return out;
}

function allyUnit(rng: Rng, a: StoryAlly, level: number): BattleUnit {
  const ch = makeCharacter(rng, { classId: a.classId, level: Math.max(1, level + (a.lv ?? 0)), name: a.name });
  const u = unitFromCharacter(ch, 'player');
  // Não é herói do elenco: não volta no resultado da batalha.
  delete u.charId;
  return u;
}

export function storySetup(c: Campaign, s: Squad, m: StoryMission): BattleSetup {
  const b = m.battle!;
  const rng = campaignRng(c);
  const seed = rng.int(1, 1e9);
  const level = missionLevel(c, s, m);
  const enemies = foeUnits(rng, b.enemies, level);
  const boss = enemies.find((u) => u.boss);
  const victory: Victory =
    b.victory === 'survive' ? { type: 'survive', rounds: b.rounds ?? 6 } : b.victory === 'target' ? { type: 'target', uid: boss?.uid } : ({ type: b.victory } as Victory);
  const objectives: ObjectiveDef[] = (b.objectives ?? []).flatMap((o) => Array.from({ length: o.n ?? 1 }, () => ({ kind: o.kind, label: o.label, turns: o.turns })));
  const waves: Wave[] = (b.waves ?? []).map((w) => ({ round: w.round, say: w.say, units: foeUnits(rng, w.enemies, level) }));
  const vip = b.vip ? { unit: allyUnit(rng, b.vip, level), captive: !!b.vip.captive } : undefined;
  const n = node(missionNode(c, m));
  const players = playerUnits(c, s);
  // Batalha decisiva: o herói mais ressentido (lealdade < limite) pode trair no meio da luta.
  if (m.betrayal) {
    const traitor = players
      .map((u) => ({ u, ch: c.roster[u.charId ?? ''] }))
      .filter((x) => x.ch && x.ch.id !== c.commanderId && !x.ch.storyId && (x.ch.loyalty ?? 50) < RULES.betrayalLoyalty)
      .sort((a, b) => (a.ch!.loyalty ?? 50) - (b.ch!.loyalty ?? 50))[0];
    if (traitor) traitor.u.betrayAt = RULES.betrayalRound;
  }
  return {
    map: (b.map ? buildStoryMap(b.map) : undefined) ?? generateMap({ biome: b.biome ?? n.biome, seed, w: b.w ?? 14, h: b.h ?? 14 }),
    collapse: b.collapse,
    players,
    enemies,
    allies: (b.allies ?? []).map((a) => allyUnit(rng, a, level)),
    waves,
    victory,
    objectives: objectives.length ? objectives : undefined,
    vip,
    stealthStart: b.stealth,
    roundLimit: b.roundLimit,
    ambush: !!b.ambush,
    canFlee: b.canFlee ?? true,
    inverted: b.inverted,
    difficulty: battleDifficulty(c),
    seed,
    studied: studiedSpecies(c),
    hunted: huntedSpecies(c),
    context: {
      kind: 'story',
      storyId: m.id,
      noPermadeath: !difficultyOf(c).permadeath,
      lesson: lessonFor(c, m.id),
      squadId: s.id,
      baseXp: level * RULES.xpPerLevel,
      gold: level * RULES.goldPerLevel,
      itemDrops: [],
      title: `${m.code} ${m.title}`,
    },
  };
}

export interface MissionOutcome {
  lines: string[];
  /** Capítulo novo que começou (título), se o finale foi concluído. */
  newChapter?: string;
  /** A campanha terminou (epílogo). */
  ended: boolean;
}

/**
 * Consequências mecânicas das escolhas (Fase 5): capital que cai de vez (serviços e aliança perdidos),
 * missões perdidas, personagem que deixa o elenco.
 */
export function applyConsequences(c: Campaign, m: StoryMission): string[] {
  const out: string[] = [];
  for (const k of m.consequences ?? []) {
    if (!condOk(c, k.if)) continue;
    if (k.fall) {
      const name = node(k.fall).name;
      if (c.baseNode === k.fall) {
        setFlag(c, 'base_resistiu');
        out.push(`🛡 ${name} é a sua base: as defesas da resistência seguraram a cidade.`);
      } else {
        setFlag(c, `caiu:${k.fall}`);
        for (const a of STORY.filter((x) => x.notAtBase && x.node === k.fall)) loseMission(c, a.id);
        out.push(`🔥 ${name} caiu. A loja, o recrutamento, o serviço da capital e a aliança com o seu senhor se perderam para sempre.`);
        addChronicle(c, { text: `${name} caiu diante dos portais. A resistência não chegou a tempo.`, who: [], kind: 'historia' });
      }
    }
    for (const id of k.lose ?? []) loseMission(c, id);
    if (k.leave) {
      const ch = Object.values(c.roster).find((x) => x.storyId === k.leave);
      if (ch) {
        removeFromSquads(c, ch.id);
        delete c.roster[ch.id];
        out.push(`${ch.name} deixou a resistência.`);
      }
    }
  }
  return out;
}

/** Heróis com lealdade baixa ficam com o rei na Deserção (nunca o comandante nem os da história). */
export function deserters(c: Campaign): string[] {
  return Object.values(c.roster)
    .filter((ch) => ch.id !== c.commanderId && !ch.storyId && (ensureLoyalty(ch), ch.loyalty! < RULES.desertionLoyalty))
    .map((ch) => ch.id);
}

/** Missão concluída (vitória ou missão só de diálogo): recompensas, recrutas, desertores e ato. */
export function finishMission(c: Campaign, m: StoryMission): MissionOutcome {
  const lines: string[] = [];
  const r = m.reward ?? {};
  if (m.desertion) {
    for (const id of deserters(c)) {
      const ch = c.roster[id]!;
      lines.push(`🚪 ${ch.name} ficou com o rei (lealdade ${Math.round(ch.loyalty!)}).`);
      addChronicle(c, { text: `${ch.name} se recusou a desertar e ficou com o rei.`, who: [ch.id], kind: 'historia' });
      removeFromSquads(c, id);
      delete c.roster[id];
    }
    if (!lines.length) lines.push('Todos os seus heróis seguiram você na deserção.');
  }
  const done = completeMission(c, m.id);
  lines.push(...applyConsequences(c, m));
  if (r.gold) {
    c.gold += r.gold;
    lines.push(`+${r.gold} ouro (missão)`);
  }
  if (r.item) {
    giveItem(c.inventory, r.item);
    lines.push(`Item: ${DB.items[r.item]?.name ?? r.item}`);
  }
  if (r.recruit && (!r.recruit.if || hasFlag(c, r.recruit.if))) {
    const rng = campaignRng(c);
    const ch = makeCharacter(rng, { classId: r.recruit.classId, level: r.recruit.level, name: r.recruit.name });
    ch.storyId = r.recruit.name;
    ch.loyalty = 85;
    ch.morale = 80;
    ch.equipment.utility = ['pocao_de_vida', null, null];
    c.roster[ch.id] = ch;
    lines.push(`★ ${ch.name} (${DB.classes[ch.classId].name} Nv ${ch.level}) se juntou à resistência — está na reserva do Quartel.`);
    addChronicle(c, { text: `${ch.name} se juntou à resistência (${m.code} ${m.title}).`, who: [ch.id], kind: 'historia' });
  }
  if (r.kit && m.personal) {
    const ch = Object.values(c.roster).find((x) => x.storyId === m.personal);
    const kit = STORY_KITS[m.personal];
    if (ch && kit) {
      ch.kitUltimate = true;
      ch.loyalty = Math.min(100, (ch.loyalty ?? 50) + 10);
      lines.push(`★ ${ch.name} aprendeu a suprema "${DB.skills[kit.ultimate]?.name ?? kit.ultimate}" (${kit.title}).`);
      addChronicle(c, { text: `${ch.name} concluiu a missão pessoal "${m.title}".`, who: [ch.id], kind: 'historia' });
    }
  }
  for (const id of done.codex) lines.push(`📜 Códice: ${CODEX_ENTRIES[id]!.title}`);
  addLog(c, `📖 ${m.code} ${m.title}: concluída.`);
  let newChapter: string | undefined;
  if (done.chapterEnded && !done.ended) {
    const chapter = c.story!.chapter;
    if (chapter >= 2) advanceAct(c);
    newChapter = CHAPTER_TITLE[chapter];
    addLog(c, `📖 Começa: ${newChapter}.`);
  }
  return { lines, newChapter, ended: done.ended };
}
