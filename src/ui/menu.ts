import { h, uiRoot } from './dom';

/** Item de menu flutuante: ação, submenu (abre ao passar o mouse) ou cabeçalho/texto. */
export interface MenuEntry {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  sub?: MenuEntry[];
  /** Texto informativo (não clicável). */
  info?: boolean;
  /** Linha de destaque (título do menu). */
  header?: boolean;
  /** Separador antes deste item. */
  sep?: boolean;
}

let current: { el: HTMLElement; off: () => void } | null = null;

export function closeMenu(): void {
  current?.off();
  current?.el.remove();
  current = null;
}

export function menuOpen(): boolean {
  return !!current;
}

function list(entries: MenuEntry[], close: () => void): HTMLElement {
  const box = h('div', { class: 'ctx-list' });
  for (const e of entries) {
    if (e.sep) box.append(h('div', { class: 'ctx-sep' }));
    if (e.header || e.info) {
      box.append(h('div', { class: e.header ? 'ctx-header' : 'ctx-info', text: e.label }));
      continue;
    }
    const row = h('div', { class: `ctx-item${e.disabled ? ' disabled' : ''}${e.sub ? ' has-sub' : ''}`, title: e.title ?? '' }, h('span', { text: e.label }), e.sub ? h('span', { class: 'ctx-arrow', text: '▸' }) : null);
    if (e.sub) {
      const sub = list(e.sub.length ? e.sub : [{ label: 'nenhum', info: true }], close);
      sub.classList.add('ctx-sub');
      row.append(sub);
      row.addEventListener('click', (ev) => {
        if (ev.target === row || (ev.target as HTMLElement).parentElement === row) row.classList.toggle('open');
      });
    } else if (!e.disabled && e.onClick) {
      const fn = e.onClick;
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        close();
        fn();
      });
    }
    box.append(row);
  }
  return box;
}

/** Abre um menu flutuante (estilo botão direito) na posição de tela (clientX/clientY). */
export function openMenu(clientX: number, clientY: number, entries: MenuEntry[]): void {
  closeMenu();
  const el = list(entries, closeMenu);
  el.classList.add('ctx-menu');
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY}px`;
  uiRoot().append(el);
  // Mantém dentro da tela.
  const r = el.getBoundingClientRect();
  if (r.right > innerWidth - 4) el.style.left = `${Math.max(4, innerWidth - r.width - 4)}px`;
  if (r.bottom > innerHeight - 4) el.style.top = `${Math.max(4, innerHeight - r.height - 4)}px`;
  if (r.left + r.width * 2 > innerWidth) el.classList.add('subs-left');
  const onDown = (ev: MouseEvent) => {
    if (!el.contains(ev.target as Node)) closeMenu();
  };
  const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && closeMenu();
  setTimeout(() => {
    addEventListener('mousedown', onDown, true);
    addEventListener('keydown', onKey);
  });
  current = {
    el,
    off: () => {
      removeEventListener('mousedown', onDown, true);
      removeEventListener('keydown', onKey);
    },
  };
}
