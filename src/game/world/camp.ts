import CAMP from '../data/story/camp.json';
import type { Character } from '../rules/character';
import { addBond, bondLevel, bondPoints, BOND } from './bonds';
import { addLoyalty, addMorale } from './loyalty';
import { ensureStory, type StoryLine } from './story';
import type { Campaign } from './campaign';

/**
 * Conversas na base entre missões (D105). Dois tipos: as escritas para os personagens da história
 * (liberadas por missão concluída) e as que nascem dos vínculos — quando dois heróis sobem de nível
 * de vínculo, aparece uma conversa entre eles. Conversar dá lealdade e pontos de vínculo.
 */
interface StoryConversation {
  id: string;
  title: string;
  chars: string[];
  after: string;
  lines: StoryLine[];
  loyalty: number;
}

const STORY_CONVS = CAMP.story as StoryConversation[];
const BOND_TEMPLATES = CAMP.bond as Record<string, StoryLine[][]>;

export interface Conversation {
  id: string;
  title: string;
  lines: StoryLine[];
  /** Heróis envolvidos (ids do elenco). */
  who: string[];
  loyalty: number;
  /** Conversa de vínculo (nível alcançado). */
  bondLevel?: number;
}

function byStory(c: Campaign, storyId: string): Character | undefined {
  return Object.values(c.roster).find((ch) => ch.storyId === storyId);
}

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Conversas disponíveis agora (ainda não vistas). */
export function availableConversations(c: Campaign): Conversation[] {
  const seen = new Set(c.campSeen ?? []);
  const st = ensureStory(c);
  const out: Conversation[] = [];
  for (const conv of STORY_CONVS) {
    if (seen.has(conv.id) || !st.done.includes(conv.after)) continue;
    const chars = conv.chars.map((id) => byStory(c, id));
    if (chars.some((x) => !x)) continue;
    out.push({ id: conv.id, title: conv.title, lines: conv.lines, who: chars.map((x) => x!.id), loyalty: conv.loyalty });
  }
  // Vínculos: uma conversa por par e por nível alcançado.
  const heroes = Object.values(c.roster);
  for (let i = 0; i < heroes.length; i++)
    for (let j = i + 1; j < heroes.length; j++) {
      const a = heroes[i]!;
      const b = heroes[j]!;
      const lv = bondLevel(bondPoints(a, b));
      for (let l = 1; l <= lv; l++) {
        const [x, y] = [a.id, b.id].sort();
        const id = `vinculo:${x}:${y}:${l}`;
        if (seen.has(id)) continue;
        const pool = BOND_TEMPLATES[String(l)] ?? [];
        const tpl = pool[hash(id) % pool.length];
        if (!tpl) continue;
        const fill = (t: string) => t.replaceAll('{a}', a.name).replaceAll('{b}', b.name);
        out.push({ id, title: `${a.name} e ${b.name} — ${BOND.names[l]}`, lines: tpl.map((ln) => ({ s: fill(ln.s), t: fill(ln.t) })), who: [a.id, b.id], loyalty: 2, bondLevel: l });
        break;
      }
    }
  return out;
}

/** Conversa vista: lealdade para os envolvidos e vínculo (entre eles, ou com o comandante). */
export function finishConversation(c: Campaign, conv: Conversation): string[] {
  (c.campSeen ??= []).push(conv.id);
  const lines: string[] = [];
  const people = conv.who.map((id) => c.roster[id]).filter((x): x is Character => !!x);
  for (const p of people) {
    addLoyalty(p, conv.loyalty);
    addMorale(p, 5);
  }
  const commander = c.roster[c.commanderId];
  if (people.length >= 2) addBond(people[0]!, people[1]!, BOND.conversation);
  else if (people[0] && commander) addBond(people[0], commander, BOND.conversation);
  lines.push(`${people.map((p) => p.name).join(' e ')}: lealdade +${conv.loyalty}.`);
  return lines;
}
