/**
 * Simulação em massa (balanceamento): batalhas IA × IA em mapas variados (natureza, cidade com
 * prédios, porto, citadela, caverna; dia e noite), com heróis montados por subclasse. Mede duração,
 * vitórias, quedas e o uso de cada mecânica tática. Só roda com SIM=1 (npm run sim); grava o relatório
 * em `docs/design/simulacao.md`.
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Rng } from '@core';
import { DB, type ClassId } from '@game/data';
import { advance, createBattle, endTurn, activeUnit } from '@game/battle/engine';
import type { BattleState, BattleUnit, TimeOfDay } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { runAiTurn } from '@game/battle/ai';
import { generateMap } from '@game/mapgen/generator';
import { generateTheme, type ThemeId } from '@game/mapgen/themes';
import { makeCharacter } from '@game/rules/recruit';
import { learnSkill, type Character } from '@game/rules/character';
import { chainOf, rankOf } from '@game/rules/skill_tree';
import { totalSkillPoints } from '@game/rules/stats';

const RUN = !!process.env.SIM;
const N = Number(process.env.SIM_N ?? 160);

/** Monta um herói numa subclasse: segue a teia em linha reta e fortalece até o Nv 3 (evoluções). */
function hero(rng: Rng, classId: ClassId, level: number, node: string): Character {
  const c = makeCharacter(rng, { classId, level });
  c.skills = [];
  c.skillRanks = {};
  c.skillPoints = totalSkillPoints(level);
  const chain = chainOf(DB.trees[classId]!.nodes.find((n) => n.id === node)!).map((s) => s.id);
  let progress = true;
  while (c.skillPoints > 0 && progress) {
    progress = false;
    const next = chain.find((id) => rankOf(c, id) === 0);
    if (next && learnSkill(c, next)) {
      progress = true;
      continue;
    }
    for (const id of chain) if (rankOf(c, id) > 0 && rankOf(c, id) < 3 && learnSkill(c, id)) {
      progress = true;
      break;
    }
    if (!progress) for (const id of chain) if (rankOf(c, id) > 0 && rankOf(c, id) < 5 && learnSkill(c, id)) {
      progress = true;
      break;
    }
  }
  return c;
}

const CLASSES: ClassId[] = ['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'];
function nodesOf(classId: ClassId): string[] {
  return DB.trees[classId]!.nodes.filter((n) => n.type === 'evolucao' || n.type === 'hibrida').map((n) => n.id);
}

const COUNTERS: [string, RegExp][] = [
  ['empurrões', /empurra /],
  ['quedas', /despenca/],
  ['explosões de pólvora', /BUM!/],
  ['desabamentos', /Desabamento!/],
  ['supressões', /sob fogo de supressão/],
  ['tiros perdidos que acertam', /tiro perdido/],
  ['confinamentos', /quatro selos/],
  ['concentração quebrada', /perdeu a concentração/],
  ['caídos sangrando', /caiu sangrando/],
  ['estabilizações', /estanca o sangue/],
  ['sangrou até a morte', /sangrou até a morte/],
  ['portas abertas', /abre a porta/],
  ['construções', /ergue (uma|um) /],
  ['lustres', /lustre despenca/],
  ['arremessos', /arremessa /],
  ['sinos', /toca o sino/],
];

interface Result {
  won: boolean;
  rounds: number;
  turns: number;
  counts: Record<string, number>;
  heroes: { node: string; kills: number; alive: boolean; dealt: number; healed: number; share: number }[];
  error?: string;
}

function battle(seed: number): Result {
  const rng = new Rng(seed);
  const level = rng.pick([10, 20, 30, 40]);
  const night: TimeOfDay | undefined = rng.chance(0.35) ? 'noite' : undefined;
  const theme = rng.pick<ThemeId | 'campo'>(['campo', 'campo', 'cidade', 'vila', 'porto', 'citadela', 'caverna', 'templo']);
  const map = theme === 'campo' ? generateMap({ biome: rng.pick(['floresta', 'neve', 'costa', 'deserto', 'planicie'] as const), seed, w: 14, h: 14 }) : generateTheme(theme, 16, 16, seed);
  // Barris de pólvora/óleo e um lustre aqui e ali (cidades).
  if (theme !== 'campo')
    for (let k = 0; k < 4; k++) {
      const t = map.tiles[rng.int(0, map.tiles.length - 1)]!;
      if (!t.p && !t.up && !t.spawn) t.p = rng.pick(['barril_polvora', 'barril_oleo'] as const);
    }
  const heroes: { node: string; u: BattleUnit }[] = [];
  for (let i = 0; i < 5; i++) {
    const cls = rng.pick(CLASSES);
    const node = rng.pick(nodesOf(cls).filter((n) => DB.trees[cls]!.nodes.find((x) => x.id === n)!.type === 'evolucao' || level >= 30));
    const c = hero(rng, cls, level, node);
    const u = unitFromCharacter(c, 'player');
    heroes.push({ node: `${cls}/${node}`, u });
  }
  const pool = Object.values(DB.enemies).filter((e) => (e!.tier === 'comum' || e!.tier === 'raro') && (e!.kind === 'human' || (e!.levelMin ?? 1) <= level));
  const enemies = Array.from({ length: 6 }, () => unitFromEnemy(rng.pick(pool)!, level, rng));
  const s: BattleState = createBattle({ map, players: heroes.map((h) => h.u), enemies, victory: { type: 'eliminate' }, ambush: false, canFlee: false, seed, timeOfDay: night, patrol: !!night, context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: 'sim' } });
  let turns = 0;
  try {
    while (!s.outcome && turns < 700) {
      const u = advance(s);
      if (!u) continue;
      runAiTurn(s, u);
      if (activeUnit(s) === u) endTurn(s);
      turns++;
    }
  } catch (e) {
    return { won: false, rounds: s.round, turns, counts: {}, heroes: [], error: String((e as Error).stack ?? e).slice(0, 600) };
  }
  if (process.env.SIM_DEBUG) writeFileSync('/tmp/claude-0/x/sim_debug.txt', JSON.stringify({ outcome: s.outcome, turns, units: s.units.map((u) => [u.name, u.team, u.alive, u.hp, u.x, u.y]), log: s.log.slice(0, 30) }, null, 1));
  const counts: Record<string, number> = {};
  for (const [k, re] of COUNTERS) counts[k] = s.log.filter((l) => re.test(l)).length;
  const byUid = new Map(s.units.map((u) => [u.uid, u]));
  return {
    won: s.outcome === 'victory',
    rounds: s.round,
    turns,
    counts,
    heroes: (() => {
      const list = heroes.map((h) => {
        const x = byUid.get(h.u.uid) ?? h.u;
        return { node: h.node, kills: x.kills, alive: !!x.alive, dealt: x.dealt ?? 0, healed: x.healed ?? 0, share: 0 };
      });
      // Contribuição relativa ao esquadrão desta batalha (1,00 = média): compara níveis diferentes.
      const avg = list.reduce((a, h) => a + h.dealt + h.healed, 0) / list.length || 1;
      for (const h of list) h.share = (h.dealt + h.healed) / avg;
      return list;
    })(),
  };
}

describe('simulação em massa', () => {
  it.runIf(RUN)('roda e grava o relatório', () => {
    const results: Result[] = [];
    for (let i = 0; i < N; i++) results.push(battle(1000 + i * 7919));
    const ok = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);
    const unfinished = ok.filter((r) => r.turns >= 700).length;
    const total: Record<string, number> = {};
    for (const r of ok) for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + v;
    const nodes = new Map<string, { n: number; kills: number; alive: number; wins: number; dealt: number; healed: number; share: number }>();
    for (const r of ok)
      for (const h of r.heroes) {
        const e = nodes.get(h.node) ?? { n: 0, kills: 0, alive: 0, wins: 0, dealt: 0, healed: 0, share: 0 };
        e.share += h.share;
        e.dealt += h.dealt;
        e.healed += h.healed;
        e.n++;
        e.kills += h.kills;
        e.alive += h.alive ? 1 : 0;
        e.wins += r.won ? 1 : 0;
        nodes.set(h.node, e);
      }
    const lines = [
      '# Simulação em massa (balanceamento)',
      '',
      `Gerado por \`npm run sim\` (${N} batalhas IA × IA: 5 heróis montados por subclasse × 6 inimigos do bestiário no mesmo nível; mapas de natureza e cidades com prédios e barris; 35% à noite com patrulhas).`,
      '',
      `- Vitórias do esquadrão: **${Math.round((100 * ok.filter((r) => r.won).length) / Math.max(1, ok.length))}%**`,
      `- Rodadas por batalha (média): **${(ok.reduce((a, r) => a + r.rounds, 0) / Math.max(1, ok.length)).toFixed(1)}**`,
      `- Batalhas sem fim (700 turnos): **${unfinished}** · erros: **${errors.length}**`,
      '',
      '## Uso das mecânicas (total nas batalhas)',
      '',
      '| Mecânica | Vezes |',
      '|---|---|',
      ...Object.entries(total).map(([k, v]) => `| ${k} | ${v} |`),
      '',
      '## Subclasses (dano e cura por batalha, abates, sobrevivência)',
      '',
      '| Subclasse | Batalhas | Contribuição (1 = média) | Dano/batalha | Cura/batalha | Abates | Sobreviveu |',
      '|---|---|---|---|---|---|---|',
      ...[...nodes.entries()]
        .sort((a, b) => b[1].share / b[1].n - a[1].share / a[1].n)
        .map(([k, e]) => `| ${k} | ${e.n} | **${(e.share / e.n).toFixed(2)}** | ${Math.round(e.dealt / e.n)} | ${Math.round(e.healed / e.n)} | ${(e.kills / e.n).toFixed(2)} | ${Math.round((100 * e.alive) / e.n)}% |`),
      '',
      '## Como ler',
      '',
      '- Contribuição mede **dano + cura** relativos à média; tanques (templário, guardião da fé, defensor, escudeiro) e',
      '  suportes de controle ficam naturalmente abaixo de 1, porque o valor deles (absorver golpes, atrasar, enfraquecer)',
      '  não vira número. A sobrevivência alta deles é o sinal certo.',
      '- Alavanca de ajuste: `powerMult` no nó da teia (`data/skills/trees/*.json`) multiplica o golpe inteiro das',
      '  habilidades da teia. Ele mexe pouco em teias cujo dano vem do ataque básico e da arma (corpo a corpo), então',
      '  a diferença que sobra entre corpo a corpo e à distância é de papel (exposição, alcance), não de poder.',
      '- A IA não usa confinamento e quase não constrói: essas habilidades valem mais nas mãos do jogador do que aqui.',
      '',
      ...(errors.length ? ['## Erros', '', ...errors.slice(0, 5).map((e) => '```\n' + e.error + '\n```')] : []),
    ];
    writeFileSync('docs/design/simulacao.md', lines.join('\n') + '\n');
  }, 3_600_000);
});
