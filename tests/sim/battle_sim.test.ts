/**
 * Simulação em massa (balanceamento): batalhas IA × IA em mapas variados (natureza, cidade com
 * prédios, porto, citadela, caverna; dia e noite), com heróis montados por subclasse. Mede duração,
 * vitórias, quedas e o uso de cada mecânica tática. Só roda com SIM=1 (npm run sim); grava o relatório
 * em `docs/design/simulacao.md`.
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Rng } from '@core';
import { DB, type Attributes, type ClassId, type TreeNode } from '@game/data';
import { advance, createBattle, endTurn, activeUnit } from '@game/battle/engine';
import type { BattleState, BattleUnit, TimeOfDay } from '@game/battle/types';
import { unitFromCharacter, unitFromEnemy } from '@game/battle/units';
import { runAiTurn } from '@game/battle/ai';
import { generateMap } from '@game/mapgen/generator';
import { generateTheme, type ThemeId } from '@game/mapgen/themes';
import { makeCharacter } from '@game/rules/recruit';
import { learnSkill, type Character } from '@game/rules/character';
import { chainOf, rankOf, unlockSkillOf } from '@game/rules/skill_tree';
import { totalSkillPoints } from '@game/rules/stats';

const RUN = !!process.env.SIM;
const N = Number(process.env.SIM_N ?? 160);

/**
 * Atributos de quem segue a teia: o peso de atributo do tipo de golpe mais comum nas habilidades dela
 * (físico, mágico ou cura), mais um pouco de vitalidade e velocidade para aguentar a luta.
 */
function buildWeights(n: TreeNode): Partial<Attributes> {
  const count: Record<string, number> = {};
  for (const sk of chainOf(n)) {
    const k = sk.kind === 'ranged' ? 'physical' : sk.kind;
    if (k === 'physical' || k === 'magic' || k === 'heal') count[k] = (count[k] ?? 0) + 1;
  }
  const kind = (Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'physical') as 'physical' | 'magic' | 'heal';
  const sc = n.scaling?.[kind] ?? {};
  const w: Partial<Attributes> = { vit: 2, spd: 1 };
  for (const [a, v] of Object.entries(sc)) w[a as keyof Attributes] = (w[a as keyof Attributes] ?? 0) + (v as number) * 8;
  return w;
}

/**
 * Monta um herói numa subclasse como um jogador faria: numa teia híbrida, primeiro segue as duas
 * teias-mãe até a habilidade que a destrava; depois segue a teia em linha reta e fortalece até o
 * Nv 3 (evoluções) e, sobrando pontos, até o Nv 5.
 */
export function hero(rng: Rng, classId: ClassId, level: number, node: string): Character {
  const tree = DB.trees[classId]!;
  const target = tree.nodes.find((n) => n.id === node)!;
  const c = makeCharacter(rng, { classId, level, weights: buildWeights(target) });
  c.skills = [];
  c.skillRanks = {};
  c.skillPoints = totalSkillPoints(level);
  const learnPath = (chain: string[], until?: string) => {
    let progress = true;
    while (c.skillPoints > 0 && progress && !(until && c.skills.includes(until))) {
      progress = false;
      const next = chain.find((id) => rankOf(c, id) === 0);
      if (next && learnSkill(c, next)) {
        progress = true;
        continue;
      }
      // A próxima pede a anterior num nível mínimo: fortalece a de menor nível (a mais nova no empate).
      const learned = chain.filter((id) => rankOf(c, id) > 0).reverse().sort((a, b) => rankOf(c, a) - rankOf(c, b));
      for (const id of learned) if (learnSkill(c, id)) {
        progress = true;
        break;
      }
    }
  };
  for (const pid of target.parents) {
    const parent = tree.nodes.find((n) => n.id === pid)!;
    const key = unlockSkillOf(parent, target);
    if (key) learnPath(chainOf(parent).map((s) => s.id), key.id);
  }
  const chain = chainOf(target).map((s) => s.id);
  learnPath(chain);
  // Elementalista: a teia é só a porta; o resto vem dos ramos (dois elementos sorteados).
  const ramos = tree.nodes.filter((n) => n.type === 'ramo' && n.parents.includes(node));
  for (const r of [...ramos].sort(() => rng.next() - 0.5).slice(0, 2)) learnPath(chainOf(r).map((s) => s.id));
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
  heroes: { node: string; kills: number; alive: boolean; dealt: number; healed: number; skillDealt: number; casts: number; share: number; known: string[]; castLog: Record<string, number> }[];
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
  if (process.env.SIM_DEBUG && turns >= 700) writeFileSync(`/tmp/claude-0/x/sim_stuck_${seed}.txt`, JSON.stringify({ outcome: s.outcome, turns, round: s.round, units: s.units.map((u) => [u.name, u.team, u.alive, u.hp, u.x, u.y, u.z, u.ai]), log: s.log.slice(-60) }, null, 1));
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
        return { node: h.node, kills: x.kills, alive: !!x.alive, dealt: x.dealt ?? 0, healed: x.healed ?? 0, skillDealt: x.skillDealt ?? 0, casts: x.casts ?? 0, share: 0, known: [...x.skills], castLog: x.castLog ?? {} };
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
    const stuckSeeds = results.map((r, i) => (r.turns >= 700 ? 1000 + i * 7919 : 0)).filter(Boolean);
    const total: Record<string, number> = {};
    for (const r of ok) for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + v;
    const nodes = new Map<string, { n: number; kills: number; alive: number; wins: number; dealt: number; healed: number; share: number; skillDealt: number; casts: number }>();
    for (const r of ok)
      for (const h of r.heroes) {
        const e = nodes.get(h.node) ?? { n: 0, kills: 0, alive: 0, wins: 0, dealt: 0, healed: 0, share: 0, skillDealt: 0, casts: 0 };
        e.skillDealt += h.skillDealt;
        e.casts += h.casts;
        e.share += h.share;
        e.dealt += h.dealt;
        e.healed += h.healed;
        e.n++;
        e.kills += h.kills;
        e.alive += h.alive ? 1 : 0;
        e.wins += r.won ? 1 : 0;
        nodes.set(h.node, e);
      }
    // Habilidades ativas que os heróis tinham e quantas vezes foram lançadas.
    const held = new Map<string, { have: number; cast: number }>();
    for (const r of ok)
      for (const h of r.heroes)
        for (const id of h.known) {
          const d = DB.skills[id];
          if (!d || d.passive || d.fx?.react || d.evolvedOf) continue;
          // A habilidade conta como usada se ela ou uma evolução dela foi lançada.
          const family = [id, ...(d.evolutions ?? [])];
          const e = held.get(id) ?? { have: 0, cast: 0 };
          e.have++;
          e.cast += family.reduce((a, f) => a + (h.castLog[f] ?? 0), 0);
          held.set(id, e);
        }
    const unused = [...held.entries()].filter(([, e]) => e.have >= 5 && e.cast === 0).sort((a, b) => b[1].have - a[1].have);
    const lines = [
      '# Simulação em massa (balanceamento)',
      '',
      `Gerado por \`npm run sim\` (${N} batalhas IA × IA: 5 heróis montados por subclasse × 6 inimigos do bestiário no mesmo nível; mapas de natureza e cidades com prédios e barris; 35% à noite com patrulhas).`,
      '',
      `- Vitórias do esquadrão: **${Math.round((100 * ok.filter((r) => r.won).length) / Math.max(1, ok.length))}%**`,
      `- Rodadas por batalha (média): **${(ok.reduce((a, r) => a + r.rounds, 0) / Math.max(1, ok.length)).toFixed(1)}**`,
      `- Batalhas sem fim (700 turnos): **${unfinished}**${stuckSeeds.length ? ` (sementes ${stuckSeeds.join(', ')})` : ''} · erros: **${errors.length}**`,
      '',
      '## Uso das mecânicas (total nas batalhas)',
      '',
      '| Mecânica | Vezes |',
      '|---|---|',
      ...Object.entries(total).map(([k, v]) => `| ${k} | ${v} |`),
      '',
      '## Subclasses (dano e cura por batalha, abates, sobrevivência)',
      '',
      '| Subclasse | Batalhas | Contribuição (1 = média) | Dano/batalha | % por habilidade | Lançamentos | Cura/batalha | Abates | Sobreviveu |',
      '|---|---|---|---|---|---|---|---|---|',
      ...[...nodes.entries()]
        .sort((a, b) => b[1].share / b[1].n - a[1].share / a[1].n)
        .map(([k, e]) => `| ${k} | ${e.n} | **${(e.share / e.n).toFixed(2)}** | ${Math.round(e.dealt / e.n)} | ${Math.round((100 * e.skillDealt) / Math.max(1, e.dealt))}% | ${(e.casts / e.n).toFixed(1)} | ${Math.round(e.healed / e.n)} | ${(e.kills / e.n).toFixed(2)} | ${Math.round((100 * e.alive) / e.n)}% |`),
      '',
      `## Habilidades que a IA tem e nunca usa (${unused.length} de ${held.size})`,
      '',
      unused.length ? unused.slice(0, 40).map(([id, e]) => `${DB.skills[id]!.name} (\`${id}\`, ${e.have}×)`).join(' · ') : 'Nenhuma.',
      '',
      '## Como ler',
      '',
      '- Cada herói segue uma teia como um jogador faria: distribui atributos pelos pesos da teia (`scaling`), aprende',
      '  as teias-mãe até destravar a híbrida e fortalece as habilidades até o Nv 3 (evoluções) e depois o Nv 5.',
      '- Contribuição mede **dano + cura** relativos à média da batalha (invocações contam para quem invocou). Tanques',
      '  (templário, guardião da fé, defensor, escudeiro) e controladores (cronomante) ficam naturalmente abaixo de 1:',
      '  o valor deles (absorver golpes, atrasar, enfraquecer) não vira número. A sobrevivência alta é o sinal certo.',
      '- O peso dos atributos (`scaling`) define **em que investir**, não a força: pela regra de',
      '  [matematica.md](matematica.md), toda escala dá o mesmo poder na build máxima (90–100). A alavanca de força é',
      '  `powerMult` no nó da teia, que multiplica o dano das habilidades dela no motor.',
      '- Controle (lentidão, exaustão, silêncio, prender) também não vira número: Mestre de Batalha, Entropia e',
      '  Cronomante gastam boa parte das ações em estados e aparecem abaixo de 1 mesmo com `powerMult` alto.',
      '- A lista de habilidades nunca usadas mede a cobertura da IA (base e evolução contam juntas). As que sobram são',
      '  utilidades de nicho (voltar no tempo, trocar de lugar, teleporte fora de perseguição, áreas de apoio).',
      '- Com 600 batalhas, diferenças de ±0,1 são ruído.',
      '',
      ...(errors.length ? ['## Erros', '', ...errors.slice(0, 5).map((e) => '```\n' + e.error + '\n```')] : []),
    ];
    writeFileSync('docs/design/simulacao.md', lines.join('\n') + '\n');
  }, 3_600_000);
});
