/** Utilitários mínimos para montar interface em DOM sem framework. */

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  style?: string;
  title?: string;
  text?: string;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  type?: string;
  value?: string;
  placeholder?: string;
  [data: `data-${string}`]: string;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'class') el.className = v as string;
    else if (k === 'style') el.setAttribute('style', v as string);
    else if (k === 'text') el.textContent = v as string;
    else if (k === 'onClick')
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        (v as (e: MouseEvent) => void)(e as MouseEvent);
      });
    else if (k === 'disabled') (el as HTMLButtonElement).disabled = !!v;
    else if (k === 'value') (el as HTMLInputElement).value = v as string;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export function btn(label: string, onClick: () => void, opts: { disabled?: boolean; class?: string; title?: string } = {}): HTMLButtonElement {
  return h('button', { class: `btn ${opts.class ?? ''}`, onClick: () => onClick(), disabled: opts.disabled, title: opts.title }, label);
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.firstChild.remove();
}

export function uiRoot(): HTMLElement {
  const root = document.getElementById('ui-root');
  if (!root) throw new Error('#ui-root ausente');
  return root;
}

/** Camada de UI de uma cena. Remova com `.remove()` ao sair da cena. */
export function layer(className = ''): HTMLDivElement {
  const el = h('div', { class: `layer ${className}` });
  uiRoot().append(el);
  return el;
}

export interface Modal {
  el: HTMLDivElement;
  body: HTMLDivElement;
  close: () => void;
}

let openModals = 0;
export function modalOpen(): boolean {
  return openModals > 0;
}

export function modal(title: string, content: Node | ((body: HTMLDivElement, m: Modal) => void), opts: { wide?: boolean; onClose?: () => void; closable?: boolean } = {}): Modal {
  const body = h('div', { class: 'modal-body' });
  const box = h('div', { class: `modal ${opts.wide ? 'wide' : ''}` });
  const backdrop = h('div', { class: 'modal-backdrop' }, box);
  let closed = false;
  const m: Modal = {
    el: backdrop,
    body,
    close: () => {
      if (closed) return;
      closed = true;
      openModals -= 1;
      backdrop.remove();
      opts.onClose?.();
    },
  };
  const header = h('div', { class: 'modal-header' }, h('h2', { text: title }), opts.closable === false ? null : btn('✕', () => m.close(), { class: 'ghost' }));
  box.append(header, body);
  if (typeof content === 'function') content(body, m);
  else body.append(content);
  uiRoot().append(backdrop);
  openModals += 1;
  return m;
}

export function toast(text: string, ms = 2600): void {
  const el = h('div', { class: 'toast', text });
  uiRoot().append(el);
  setTimeout(() => el.remove(), ms);
}

export function bar(value: number, max: number, color: string, label?: string): HTMLDivElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h(
    'div',
    { class: 'bar' },
    h('div', { class: 'bar-fill', style: `width:${pct}%;background:${color}` }),
    h('span', { class: 'bar-label', text: label ?? `${Math.round(value)}/${Math.round(max)}` }),
  );
}
