import CAMP from '../data/story/camp.json';
import type { Character } from '../rules/character';
import { addBond, bondLevel, bondPoints, BOND } from './bonds';
import { addFriction, compatibility, FRICTION, frictionLevel, frictionName, frictionPoints, reactionQuirk } from '../rules/personality';
import { addLoyalty, addMorale } from './loyalty';
import { ensureStory, type StoryLine } from './story';
import type { Campaign } from './campaign';

/**
 * Conversas na base entre missões (D105). Dois tipos: as escritas para os personagens da história
 * (liberadas por missão concluída) e as que nascem das relações — vínculo alto (Camaradas, Irmãos de
 * armas) ou atrito (Rivais, Desafetos, que o comandante media). Conversar dá lealdade e vínculo (ou
 * alivia o atrito). Poucas ficam pendentes por vez: as conversas aparecem devagar.
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
const RIVAL_TEMPLATES = CAMP.rival as Record<string, StoryLine[][]>;
const REACT_TEMPLATES = CAMP.react as StoryLine[][];

export interface Conversation {
  id: string;
  title: string;
  lines: StoryLine[];
  /** Heróis envolvidos (ids do elenco). */
  who: string[];
  loyalty: number;
  /** Conversa de vínculo (nível alcançado). */
  bondLevel?: number;
  /** Conversa de atrito (o comandante media; alivia o atrito). */
  frictionLevel?: number;
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
  // Vínculos e atritos: uma conversa por par e por nível (só os níveis mais altos falam), e
  // poucas pendentes por vez — as conversas aparecem devagar, conforme a campanha anda.
  const pairs: Conversation[] = [];
  const heroes = Object.values(c.roster);
  for (let i = 0; i < heroes.length; i++)
    for (let j = i + 1; j < heroes.length; j++) {
      const a = heroes[i]!;
      const b = heroes[j]!;
      const [x, y] = [a.id, b.id].sort();
      const qa = reactionQuirk(a, b)?.name.toLowerCase() ?? '';
      const qb = reactionQuirk(b, a)?.name.toLowerCase() ?? '';
      const fill = (t: string) => t.replaceAll('{a}', a.name).replaceAll('{b}', b.name).replaceAll('{qa}', qa).replaceAll('{qb}', qb);
      const lv = bondLevel(bondPoints(a, b));
      for (let l = BOND.conversationMinLevel; l <= lv; l++) {
        const id = `vinculo:${x}:${y}:${l}`;
        if (seen.has(id)) continue;
        // Par que combina muito: a conversa comenta as personalidades.
        const pool = compatibility(a, b) >= 2 && REACT_TEMPLATES.length ? REACT_TEMPLATES : BOND_TEMPLATES[String(l)] ?? [];
        const tpl = pool[hash(id) % pool.length];
        if (!tpl) continue;
        pairs.push({ id, title: `${a.name} e ${b.name} — ${BOND.names[l]}`, lines: tpl.map((ln) => ({ s: fill(ln.s), t: fill(ln.t) })), who: [a.id, b.id], loyalty: 2, bondLevel: l });
        break;
      }
      const fl = frictionLevel(frictionPoints(a, b));
      for (let l = 1; l <= fl; l++) {
        const id = `atrito:${x}:${y}:${l}`;
        if (seen.has(id)) continue;
        const pool = RIVAL_TEMPLATES[String(l)] ?? [];
        const tpl = pool[hash(id) % pool.length];
        if (!tpl) continue;
        pairs.push({ id, title: `${a.name} e ${b.name} — ${frictionName(l)}`, lines: tpl.map((ln) => ({ s: fill(ln.s), t: fill(ln.t) })), who: [a.id, b.id], loyalty: 1, frictionLevel: l });
        break;
      }
    }
  out.push(...pairs.sort((p, q) => p.id.localeCompare(q.id)).slice(0, BOND.maxPendingConversations));
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
  // Conversa com o comandante (que não luta): só lealdade; entre dois heróis, também vínculo —
  // ou, se é atrito, o comandante media e a tensão diminui.
  if (people.length >= 2 && conv.frictionLevel) addFriction(people[0]!, people[1]!, -FRICTION.conversationRelief);
  else if (people.length >= 2) addBond(people[0]!, people[1]!, BOND.conversation);
  lines.push(`${people.map((p) => p.name).join(' e ')}: lealdade +${conv.loyalty}.`);
  return lines;
}
