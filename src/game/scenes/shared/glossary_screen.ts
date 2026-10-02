import { clear, h, modal } from '@ui/dom';
import GLOSSARY from '../../data/story/glossary.json';

export interface GlossaryEntry {
  id: string;
  cat: string;
  term: string;
  text: string;
}

export const GLOSSARY_ENTRIES = GLOSSARY as GlossaryEntry[];

/** Glossário consultável: busca por termo ou texto, por categoria; `focus` abre num verbete. */
export function openGlossary(focus?: string): void {
  modal(
    '📖 Glossário',
    (body) => {
      const search = h('input', { type: 'text', placeholder: 'Buscar termo…', class: 'gloss-search' });
      const cats = h('div', { class: 'tabs' });
      const list = h('div', { class: 'gloss-list' });
      body.append(search, cats, list);
      const categories = ['Todos', ...new Set(GLOSSARY_ENTRIES.map((e) => e.cat))];
      let cat = 'Todos';
      const render = () => {
        clear(cats);
        for (const c of categories) {
          const b = h('button', { class: `btn ${c === cat ? 'active' : ''}`, onClick: () => ((cat = c), render()) }, c);
          cats.append(b);
        }
        clear(list);
        const q = search.value.trim().toLowerCase();
        const items = GLOSSARY_ENTRIES.filter((e) => (cat === 'Todos' || e.cat === cat) && (!q || `${e.term} ${e.text}`.toLowerCase().includes(q)));
        for (const e of items) {
          const el = h('div', { class: `gloss-item ${e.id === focus ? 'focus' : ''}`, 'data-id': e.id }, h('b', { text: e.term }), h('span', { class: 'gloss-cat', text: e.cat }), h('div', { text: e.text }));
          list.append(el);
        }
        if (!items.length) list.append(h('div', { class: 'muted', text: 'Nada encontrado.' }));
        if (focus) list.querySelector('.focus')?.scrollIntoView({ block: 'center' });
      };
      search.addEventListener('input', () => ((focus = undefined), render()));
      render();
      setTimeout(() => search.focus(), 0);
    },
    { wide: true },
  );
}
