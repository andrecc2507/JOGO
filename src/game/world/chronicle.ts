import type { BattleResult } from '../battle/types';
import type { Character } from '../rules/character';
import { bondLevel, bondName, bondPoints, type BondEvent } from './bonds';
import { CHAPTER_TITLE, ensureStory, type StoryHost } from './story';

/**
 * Crônica da partida (D104): histórias que nascem do jogo — quem caiu, onde e por quem; quem perdeu um
 * irmão de armas e jurou vingança; quem derrubou um chefe; quem sobreviveu por um fio; vínculos
 * forjados. Cada herói acumula títulos; a crônica aparece no Diário e na ficha.
 */
export interface ChronicleEntry {
  day: number;
  chapter: number;
  text: string;
  /** Heróis citados (a ficha mostra as entradas de cada um). */
  who: string[];
  kind: 'morte' | 'luto' | 'feito' | 'vinculo' | 'titulo' | 'historia';
}

export interface ChronicleHost extends StoryHost {
  hours: number;
  roster: Record<string, Character>;
  chronicle?: ChronicleEntry[];
}

export const KILL_TITLES: [number, string][] = [
  [10, 'Veterano'],
  [50, 'Ceifador'],
  [150, 'Lenda Viva'],
];

function chapterShort(c: StoryHost): string {
  return CHAPTER_TITLE[ensureStory(c).chapter]?.split(' — ')[0] ?? '';
}

export function addChronicle(c: ChronicleHost, e: Omit<ChronicleEntry, 'day' | 'chapter'>): void {
  const list = (c.chronicle ??= []);
  list.unshift({ ...e, day: Math.floor(c.hours / 24) + 1, chapter: ensureStory(c).chapter });
  if (list.length > 300) list.length = 300;
}

function giveTitle(c: ChronicleHost, ch: Character, title: string, why: string): void {
  if ((ch.titles ??= []).includes(title)) return;
  ch.titles.push(title);
  addChronicle(c, { text: `${ch.name} passou a ser chamado de "${title}" — ${why}.`, who: [ch.id], kind: 'titulo' });
}

/**
 * Registra a batalha na crônica. Chamar antes de tirar os mortos do elenco (para ainda ter os nomes).
 * `where` é o nome da missão ou do encontro.
 */
export function chronicleBattle(c: ChronicleHost, r: BattleResult, bondEvents: BondEvent[], where: string): void {
  const when = chapterShort(c);
  const name = (id: string) => c.roster[id]?.name ?? '?';
  for (const u of r.units) {
    const ch = c.roster[u.charId];
    if (!ch) continue;
    if (!u.alive) {
      const by = u.killedBy ? `, derrubado por ${u.killedBy.name}` : '';
      addChronicle(c, { text: `${ch.name} (Nv ${ch.level}) caiu em ${where}${by}. ${when}.`, who: [ch.id], kind: 'morte' });
      continue;
    }
    for (const boss of u.feats ?? []) giveTitle(c, ch, `Algoz de ${boss.split(',')[0]}`, `deu o golpe final em ${boss} (${where})`);
    const lowest = (u.lowHp ?? u.hp) / Math.max(1, u.maxHp);
    if (r.outcome === 'victory' && lowest > 0 && lowest <= 0.1) {
      addChronicle(c, { text: `${ch.name} sobreviveu por um fio em ${where}, com ${Math.max(1, Math.round(lowest * 100))}% da vida.`, who: [ch.id], kind: 'feito' });
      giveTitle(c, ch, 'Teimoso como a Morte', 'voltou de uma luta em que quase caiu');
    }
    const total = ch.kills + u.kills;
    for (const [n, t] of KILL_TITLES) if (total >= n) giveTitle(c, ch, t, `${n} inimigos abatidos`);
  }
  for (const e of bondEvents) {
    if (e.kind === 'up' && e.level === 3)
      addChronicle(c, { text: `${name(e.a)} e ${name(e.b)} se tornaram ${bondName(3)}, depois de ${where}.`, who: [e.a, e.b], kind: 'vinculo' });
    else if (e.kind === 'up' && e.level === 2) addChronicle(c, { text: `${name(e.a)} e ${name(e.b)} agora são ${bondName(2)}.`, who: [e.a, e.b], kind: 'vinculo' });
    else if (e.kind === 'grief') {
      const lv = bondLevel(bondPoints(c.roster[e.a]!, c.roster[e.b]!));
      const oath = e.killer?.enemyId ? ` Jurou vingança contra ${e.killer.name}.` : '';
      addChronicle(c, { text: `${name(e.a)} perdeu ${lv >= 3 ? 'o irmão de armas' : 'o camarada'} ${name(e.b)} em ${where}. ${when}.${oath}`, who: [e.a, e.b], kind: 'luto' });
    }
  }
}

export function chronicleOf(c: ChronicleHost, charId: string): ChronicleEntry[] {
  return (c.chronicle ?? []).filter((e) => e.who.includes(charId));
}
