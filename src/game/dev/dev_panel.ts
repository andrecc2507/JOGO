import { btn, h, uiRoot } from '@ui/dom';

export interface DevAction {
  label: string;
  run: () => void;
}

export interface DevGroup {
  title: string;
  actions: DevAction[];
  extra?: () => HTMLElement;
}

/**
 * Painel de desenvolvedor: botão "DEV" fixo + painel com ações da cena atual.
 * Atalho: F2 ou ` (crase).
 */
class DevPanelImpl {
  private toggleBtn: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private groups: DevGroup[] = [];
  private open = false;

  mount(): void {
    if (this.toggleBtn) return;
    this.toggleBtn = btn('DEV', () => this.toggle(), { class: 'dev-toggle', title: 'Dev mode (F2)' });
    uiRoot().append(this.toggleBtn);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  setGroups(groups: DevGroup[]): void {
    this.groups = groups;
    this.render();
  }

  toggle(): void {
    this.open = !this.open;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.panel?.remove();
    this.panel = null;
    if (!this.open) return;
    const panel = h('div', { class: 'dev-panel' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: '🛠 DEV MODE', style: 'color:#9ccc65' }), btn('✕', () => this.toggle(), { class: 'small' })));
    if (!this.groups.length) panel.append(h('div', { class: 'muted', text: 'Sem ações nesta tela.' }));
    for (const g of this.groups) {
      panel.append(h('h4', { text: g.title }));
      if (g.extra) panel.append(g.extra());
      const row = h('div', { class: 'row' });
      for (const a of g.actions) row.append(btn(a.label, () => a.run(), { class: 'small' }));
      panel.append(row);
    }
    uiRoot().append(panel);
    this.panel = panel;
  }
}

export const DevPanel = new DevPanelImpl();
