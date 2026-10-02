import type { Biome, ClassId } from '../data';
import type { ObjectiveKind, StatusId, Victory } from '../battle/types';
import SPEAKERS from '../data/story/speakers.json';
import CODEX from '../data/story/codex.json';
import STORY_RULES from '../data/story/rules.json';
import CH0 from '../data/story/cap0_prologo.json';
import CH1 from '../data/story/cap1_rebeldes.json';
import CH2 from '../data/story/cap2_conspiracao.json';
import CH3 from '../data/story/cap3_palacio.json';
import CH4 from '../data/story/cap4_uniao.json';
import CH5 from '../data/story/cap5_vazio.json';
import CH6 from '../data/story/cap6_desconhecido.json';
import CH7 from '../data/story/cap7_baroes.json';
import CH8 from '../data/story/cap8_aniquilador.json';
import EPILOGUE from '../data/story/epilogue.json';

/**
 * Campanha principal (design/campanha.md): missões da história em dados (`data/story/`), estado
 * puro em `c.story`. Cada capítulo (0 = Prólogo, 1–8 = Atos) termina numa missão `finale`; concluir
 * o finale abre o capítulo seguinte (e, do Ato 1 em diante, avança o ato da campanha).
 */

/** Uma fala: quem (id de `speakers.json`, ou `cmd` para o comandante) e o texto. */
export interface StoryLine {
  s: string;
  t: string;
  /** Só aparece com esta marca (escolha feita antes); `!marca` = só sem ela. */
  if?: string;
}

export interface StoryPhase {
  at: number;
  say?: string;
  heal?: number;
  statuses?: { id: StatusId; turns: number }[];
  spawn?: StoryFoe[];
}

/** Inimigo de missão: id de `enemies.json`/bestiário, com nome e vida próprios se for personagem. */
export interface StoryFoe {
  id: string;
  n?: number;
  /** Diferença de nível em relação à missão. */
  lv?: number;
  name?: string;
  /** Multiplicador de vida (chefes). */
  hp?: number;
  boss?: boolean;
  phases?: StoryPhase[];
}

/** Aliado da história (IA) ou VIP. */
export interface StoryAlly {
  name: string;
  classId: ClassId;
  lv?: number;
}

export interface StoryBattle {
  biome?: Biome;
  w?: number;
  h?: number;
  victory: Victory['type'];
  rounds?: number;
  roundLimit?: number;
  stealth?: boolean;
  ambush?: boolean;
  canFlee?: boolean;
  /** Mapa do mundo invertido (o Vazio): paleta própria na batalha. */
  inverted?: boolean;
  enemies: StoryFoe[];
  waves?: { round: number; say?: string; enemies: StoryFoe[] }[];
  allies?: StoryAlly[];
  vip?: StoryAlly & { captive?: boolean };
  objectives?: { kind: ObjectiveKind; label: string; turns: number; n?: number }[];
}

export interface StoryChoice {
  /** `brief`: a escolha vem antes da batalha (padrão: depois). */
  at?: 'brief' | 'after';
  prompt: string;
  options: { label: string; flag: string; lines?: StoryLine[] }[];
}

export interface StoryReward {
  gold?: number;
  xp?: number;
  item?: string;
  /** Personagem da história que entra no elenco (vai para a reserva). */
  recruit?: { name: string; classId: ClassId; level: number; if?: string };
}

export interface StoryMission {
  id: string;
  chapter: number;
  code: string;
  title: string;
  /** Nó do mapa; `$base` = a base da resistência. */
  node: string;
  level: number;
  /** Objetivo em uma linha (marcador do mapa e diário). */
  goal: string;
  requires?: string[];
  /** Conclui o capítulo. */
  finale?: boolean;
  /** Missão de aliança: some se o nó for a própria base (o senhor anfitrião já é aliado). */
  notAtBase?: boolean;
  /** Ao concluir, heróis com lealdade baixa ficam com o rei (1.8, a Deserção). */
  desertion?: boolean;
  brief: StoryLine[];
  after: StoryLine[];
  /** Falas se o Véu romper o capítulo antes desta missão (ela é perdida). */
  lost?: StoryLine[];
  battle?: StoryBattle;
  choice?: StoryChoice;
  reward?: StoryReward;
  codex?: string[];
}

export interface Speaker {
  name: string;
  icon: string;
  color: string;
}

export interface CodexEntry {
  title: string;
  chapter: number;
  text: string;
}

export interface StoryState {
  chapter: number;
  done: string[];
  /** Missões perdidas quando o Véu rompeu o capítulo antes da hora. */
  lost: string[];
  flags: string[];
  codex: string[];
  /** Missões cujo briefing já foi lido (marcador muda de "!" para "…"). */
  seen: string[];
  ended?: boolean;
}

export interface StoryHost {
  act: number;
  baseNode: string;
  base?: unknown;
  story?: StoryState;
}

export const STORY: StoryMission[] = [CH0, CH1, CH2, CH3, CH4, CH5, CH6, CH7, CH8].flat() as StoryMission[];
export const SPEAKER = SPEAKERS as Record<string, Speaker>;
export const CODEX_ENTRIES = CODEX as Record<string, CodexEntry>;
export const RULES = STORY_RULES;
export const EPILOGUE_LINES = EPILOGUE as StoryLine[];
export const LAST_CHAPTER = 8;

export const CHAPTER_TITLE: Record<number, string> = {
  0: 'Prólogo — O Comandante do Reino',
  1: 'Ato 1 — Crianças da Lua',
  2: 'Ato 2 — Teoria da Conspiração',
  3: 'Ato 3 — A Coroa e a Porta',
  4: 'Ato 4 — Incursões e União',
  5: 'Ato 5 — Do Outro Lado',
  6: 'Ato 6 — A Metade Esquecida',
  7: 'Ato 7 — Os Barões',
  8: 'Ato 8 — O Aniquilador',
};

const byId = new Map(STORY.map((m) => [m.id, m]));

export function mission(id: string): StoryMission | undefined {
  return byId.get(id);
}

export function ensureStory(c: StoryHost): StoryState {
  return (c.story ??= { chapter: 0, done: [], lost: [], flags: [], codex: [], seen: [] });
}

/** Saves de antes da história: começa no capítulo do ato atual, com os anteriores dados como feitos. */
export function migrateStory(c: StoryHost): void {
  if (c.story) return;
  const st = ensureStory(c);
  if (c.act > 1) {
    st.chapter = c.act;
    st.done = STORY.filter((m) => m.chapter < c.act).map((m) => m.id);
  }
}

export function hasFlag(c: StoryHost, flag: string): boolean {
  return ensureStory(c).flags.includes(flag);
}

/** A fala vale com as marcas atuais? (`if: "x"` pede a marca; `if: "!x"` pede a ausência.) */
export function lineVisible(c: StoryHost, l: StoryLine): boolean {
  if (!l.if) return true;
  return l.if.split(',').every((cond) => (cond.startsWith('!') ? !hasFlag(c, cond.slice(1)) : hasFlag(c, cond)));
}

export function visibleLines(c: StoryHost, lines: StoryLine[]): StoryLine[] {
  return lines.filter((l) => lineVisible(c, l));
}

export function missionNode(c: StoryHost, m: StoryMission): string {
  return m.node === '$base' ? c.baseNode : m.node;
}

function closed(st: StoryState, id: string): boolean {
  return st.done.includes(id) || st.lost.includes(id);
}

/** A missão está fora do jogo (aliança na própria base)? */
function skipped(c: StoryHost, m: StoryMission): boolean {
  return !!m.notAtBase && !!c.base && missionNode(c, m) === c.baseNode;
}

/** Pré-requisitos: os declarados ou, sem eles, a missão anterior do mesmo capítulo. */
export function requiresOf(m: StoryMission): string[] {
  if (m.requires) return m.requires;
  const list = chapterMissions(m.chapter);
  const i = list.indexOf(m);
  return i > 0 ? [list[i - 1]!.id] : [];
}

/** Missões que podem ser feitas agora (capítulo atual, pré-requisitos cumpridos). */
export function availableMissions(c: StoryHost): StoryMission[] {
  const st = ensureStory(c);
  if (st.ended) return [];
  return STORY.filter(
    (m) =>
      m.chapter === st.chapter &&
      !closed(st, m.id) &&
      !skipped(c, m) &&
      requiresOf(m).every((r) => closed(st, r) || (mission(r) ? skipped(c, mission(r)!) : true)) &&
      // O finale só abre quando todas as outras do capítulo estão fechadas.
      (!m.finale || STORY.filter((o) => o.chapter === m.chapter && o !== m).every((o) => closed(st, o.id) || skipped(c, o))),
  );
}

export function missionsAt(c: StoryHost, nodeId: string): StoryMission[] {
  return availableMissions(c).filter((m) => missionNode(c, m) === nodeId);
}

export function chapterMissions(chapter: number): StoryMission[] {
  return STORY.filter((m) => m.chapter === chapter);
}

/** Progresso do capítulo atual: feitas / total (sem as alianças puladas). */
export function chapterProgress(c: StoryHost): { done: number; total: number } {
  const st = ensureStory(c);
  const list = chapterMissions(st.chapter).filter((m) => !skipped(c, m));
  return { done: list.filter((m) => closed(st, m.id)).length, total: list.length };
}

export function markSeen(c: StoryHost, id: string): void {
  const st = ensureStory(c);
  if (!st.seen.includes(id)) st.seen.push(id);
}

export function setFlag(c: StoryHost, flag: string): void {
  const st = ensureStory(c);
  if (!st.flags.includes(flag)) st.flags.push(flag);
}

export function unlockCodex(c: StoryHost, ids: string[]): string[] {
  const st = ensureStory(c);
  const fresh = ids.filter((id) => CODEX_ENTRIES[id] && !st.codex.includes(id));
  st.codex.push(...fresh);
  return fresh;
}

export interface Completion {
  /** O capítulo terminou: o próximo começou (o chamador avança o ato se precisar). */
  chapterEnded: boolean;
  /** A campanha terminou (finale do último ato). */
  ended: boolean;
  codex: string[];
}

/** Conclui a missão (vitória ou missão sem batalha). Recompensas ficam com o chamador. */
export function completeMission(c: StoryHost, id: string): Completion {
  const st = ensureStory(c);
  const m = mission(id);
  if (!m || st.done.includes(id)) return { chapterEnded: false, ended: false, codex: [] };
  st.done.push(id);
  setFlag(c, `done:${id}`);
  const codex = unlockCodex(c, m.codex ?? []);
  if (!m.finale) return { chapterEnded: false, ended: false, codex };
  if (m.chapter >= LAST_CHAPTER) {
    st.ended = true;
    return { chapterEnded: true, ended: true, codex };
  }
  st.chapter = m.chapter + 1;
  return { chapterEnded: true, ended: false, codex };
}

/**
 * O Véu chegou a 100: o Selo do capítulo rompe antes da hora. As missões que faltavam (menos o
 * finale) se perdem — ficam registradas como ramo "e se" (marca `veu:<capítulo>` e `lost:<id>`) e o
 * clímax abre na hora. Devolve as missões perdidas.
 */
export function veilRush(c: StoryHost): StoryMission[] {
  const st = ensureStory(c);
  const lost = STORY.filter((m) => m.chapter === st.chapter && !m.finale && !closed(st, m.id) && !skipped(c, m));
  for (const m of lost) {
    st.lost.push(m.id);
    setFlag(c, `lost:${m.id}`);
  }
  setFlag(c, `veu:${st.chapter}`);
  setFlag(c, 'veu');
  return lost;
}

/** Nome de quem fala (o comandante usa o nome do personagem). */
export function speakerOf(id: string, commanderName: string): Speaker {
  if (id === 'cmd') return { name: commanderName, icon: '⚔', color: '#ffcc80' };
  return SPEAKER[id] ?? { name: id, icon: '•', color: '#cfd8dc' };
}

/** Nível dos inimigos: entre o pedido pela missão e o do esquadrão (nunca abaixo de missão − 3). */
export function storyLevel(missionLevel: number, squadLevel: number): number {
  return Math.max(1, missionLevel - RULES.levelFloor, Math.round(missionLevel * RULES.missionWeight + squadLevel * (1 - RULES.missionWeight)));
}

/** Contagem de vezes que o Véu rompeu um capítulo (para o epílogo). */
export function rushedChapters(c: StoryHost): number[] {
  return ensureStory(c)
    .flags.filter((f) => f.startsWith('veu:'))
    .map((f) => Number(f.slice(4)));
}
