import { btn, clear, h, modal } from '@ui/dom';
import type { Campaign } from '../../world/campaign';
import { node } from '../../world/layout';
import {
  CHAPTER_TITLE,
  CODEX_ENTRIES,
  LAST_CHAPTER,
  PERSONAL,
  availableMissions,
  chapterMissions,
  chapterProgress,
  ensureStory,
  missionNode,
  type StoryMission,
} from '../../world/story';
import { statsLines } from '../../world/telemetry';

export type JournalTab = 'missoes' | 'codice' | 'cronica' | 'registro';

function placeOf(c: Campaign, m: StoryMission): string {
  const id = missionNode(c, m);
  return id === c.baseNode ? `${node(id).name} (base)` : node(id).name;
}

/** Diário da campanha: missões por capítulo, códice (documentos achados) e registro da partida. */
export function openJournal(c: Campaign, initial: JournalTab = 'missoes'): void {
  let tab: JournalTab = initial;
  let reading: string | null = null;
  modal(
    '📜 Diário da Campanha',
    (body, m) => {
      (m.el.firstElementChild as HTMLElement).classList.add('journal');
      const tabs = h('div', { class: 'tabs' });
      const content = h('div', { class: 'journal-content' });
      body.append(tabs, content);
      const render = () => {
        clear(tabs);
        clear(content);
        for (const [id, label] of [['missoes', 'Missões'], ['codice', `Códice (${ensureStory(c).codex.length})`], ['cronica', 'Crônica'], ['registro', 'Registro']] as [JournalTab, string][])
          tabs.append(btn(label, () => ((tab = id), render()), { class: tab === id ? 'active' : '' }));
        if (tab === 'missoes') renderMissions(content, c);
        else if (tab === 'codice') renderCodex(content, c, reading, (id) => ((reading = id), render()));
        else if (tab === 'cronica') renderChronicle(content, c);
        else for (const l of statsLines(c)) content.append(h('div', { class: 'item', text: l }));
      };
      render();
    },
    { wide: true },
  );
}

function renderMissions(el: HTMLElement, c: Campaign): void {
  const st = ensureStory(c);
  const open = new Set(availableMissions(c).map((m) => m.id));
  if (st.ended) el.append(h('div', { class: 'story-banner', text: '✦ A campanha terminou. O mundo continua — contratos, caçadas e a base seguem abertos.' }));
  const personal = PERSONAL.filter((m) => st.done.includes(m.id) || open.has(m.id));
  if (personal.length) {
    const sec = h('details', { class: 'journal-chapter' });
    sec.open = true;
    sec.append(h('summary', {}, h('b', { text: '★ Missões pessoais' })));
    for (const m of personal) {
      const done = st.done.includes(m.id);
      sec.append(h('div', { class: `journal-mission ${done ? 'done' : 'open'}` }, h('span', { class: 'jm-icon', text: done ? '✔' : '★' }), h('div', {}, h('div', {}, h('b', { text: m.title }), h('span', { class: 'muted', text: ` · ${m.personal} · ${placeOf(c, m)}` })), h('div', { class: 'muted', text: m.goal }))));
    }
    el.append(sec);
  }
  for (let ch = Math.min(st.chapter, LAST_CHAPTER); ch >= 0; ch--) {
    const current = ch === st.chapter && !st.ended;
    const prog = current ? chapterProgress(c) : null;
    const section = h('details', { class: 'journal-chapter' });
    section.open = current;
    section.append(h('summary', {}, h('b', { text: CHAPTER_TITLE[ch] ?? `Capítulo ${ch}` }), prog ? h('span', { class: 'muted', text: `  ${prog.done}/${prog.total}` }) : null));
    for (const m of chapterMissions(ch)) {
      const done = st.done.includes(m.id);
      const lost = st.lost.includes(m.id);
      const avail = open.has(m.id);
      if (!done && !lost && !avail && !current) continue;
      const icon = done ? '✔' : lost ? '✖' : avail ? '◆' : '🔒';
      const cls = done ? 'done' : lost ? 'lost' : avail ? 'open' : 'locked';
      section.append(
        h('div', { class: `journal-mission ${cls}` },
          h('span', { class: 'jm-icon', text: icon }),
          h('div', {},
            h('div', {}, h('b', { text: `${m.code} ${m.title}` }), h('span', { class: 'muted', text: ` · ${placeOf(c, m)}${avail ? ` · nível ${m.level}` : ''}` })),
            h('div', { class: 'muted', text: lost ? 'Perdida: o Véu rompeu o Selo antes da hora.' : avail || done ? m.goal : 'Bloqueada: conclua as missões anteriores.' }),
          ),
        ),
      );
    }
    el.append(section);
  }
}

function renderCodex(el: HTMLElement, c: Campaign, reading: string | null, pick: (id: string) => void): void {
  const st = ensureStory(c);
  if (!st.codex.length) {
    el.append(h('div', { class: 'muted', text: 'Nenhum documento ainda. Missões da história revelam documentos, cartas e segredos.' }));
    return;
  }
  const list = h('div', { class: 'codex-list' });
  const page = h('div', { class: 'codex-page' });
  const ids = [...st.codex].sort((a, b) => CODEX_ENTRIES[a]!.chapter - CODEX_ENTRIES[b]!.chapter);
  const cur = reading && st.codex.includes(reading) ? reading : ids[ids.length - 1]!;
  let lastCh = -1;
  for (const id of ids) {
    const e = CODEX_ENTRIES[id]!;
    if (e.chapter !== lastCh) {
      lastCh = e.chapter;
      list.append(h('div', { class: 'codex-ch', text: CHAPTER_TITLE[e.chapter]?.split(' — ')[0] ?? '' }));
    }
    list.append(h('div', { class: `codex-item ${id === cur ? 'active' : ''}`, text: e.title, onClick: () => pick(id) }));
  }
  const e = CODEX_ENTRIES[cur]!;
  page.append(h('h3', { text: e.title }), h('p', { text: e.text }));
  el.append(h('div', { class: 'codex' }, list, page));
}

const CHRONICLE_ICON: Record<string, string> = { morte: '☠', luto: '💔', feito: '✦', vinculo: '🤝', titulo: '🏅', historia: '📖' };

/** Crônica: as histórias que nasceram da partida, da mais recente para a mais antiga. */
function renderChronicle(el: HTMLElement, c: Campaign): void {
  const list = c.chronicle ?? [];
  if (!list.length) {
    el.append(h('div', { class: 'muted', text: 'Nada registrado ainda. Batalhas, perdas, vínculos e feitos dos heróis aparecem aqui.' }));
    return;
  }
  for (const e of list) el.append(h('div', { class: `chron chron-${e.kind}` }, h('span', { class: 'chron-icon', text: CHRONICLE_ICON[e.kind] ?? '•' }), h('div', {}, h('div', { class: 'muted', style: 'font-size:11px', text: `Dia ${e.day} · ${CHAPTER_TITLE[e.chapter]?.split(' — ')[0] ?? ''}` }), h('div', { text: e.text }))));
}
