import { Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { DROP_DEFAULTS, DROP_PRICES, MATERIAL_FAMILIES, RARITIES, type CreatureDef, type MaterialDef, type MaterialKind } from '../../data';
import { Audio } from '../../audio/audio';
import { loadBestiary } from '../../bestiary/bestiary_store';
import { DevPanel } from '../../dev/dev_panel';
import { hasMaterialEdits, loadMaterials, resetMaterials, saveMaterials } from '../../materials/material_store';
import { expectedValue, jewelName, materialSources, trophyName } from '../../rules/drops';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';
import { habitatLabel } from '../../world/regions';
import { ELEMENT_LABEL, field } from '../shared/skill_form';
import { focusCreature } from '../bestiary/bestiary.scene';

type Tab = 'materiais' | 'joias' | 'trofeus';
const KIND_LABEL: Record<MaterialKind, string> = { comum: 'Comum', raro: 'Raro', elemental: 'Elemental' };
const JEWEL_TYPE_LABEL = { indefinida: '— a definir —', habilidade: 'Habilidade', forja: 'Forja' } as const;
const last = { tab: 'materiais' as Tab, id: '', kind: '' as MaterialKind | '' };

/**
 * Materiais e drops (dev): todos os materiais, de quais feras vêm e com que chance, além das
 * joias da alma e troféus de cada espécie. As tabelas de cada fera são editadas na aba Drops do
 * Bestiário; aqui se editam nome, descrição e preço dos materiais.
 */
export class MaterialsScene extends Scene {
  readonly id = 'materials';

  private list: MaterialDef[] = [];
  private creatures: CreatureDef[] = [];
  private dirty = false;
  private ui!: HTMLDivElement;
  private form!: HTMLDivElement;
  private side!: HTMLDivElement;

  protected override onEnter(): void {
    Audio.music('editor');
    this.list = loadMaterials();
    this.creatures = loadBestiary();
    if (!this.list.some((m) => m.id === last.id)) last.id = this.list[0]?.id ?? '';
    this.ui = layer('materials-ui');
    this.form = h('div', { class: 'panel', style: 'left:8px;top:8px;bottom:8px;width:min(560px,56vw);overflow:auto' });
    this.side = h('div', { class: 'panel', style: 'right:8px;top:8px;bottom:8px;width:min(440px,40vw);overflow:auto' });
    this.ui.append(this.form, this.side);
    this.refresh();
    DevPanel.setGroups([{ title: 'Materiais', actions: [{ label: 'Restaurar do repositório', run: () => this.restore() }] }]);
  }

  protected override onExit(): void {
    this.ui.remove();
    DevPanel.setGroups([]);
  }

  private get current(): MaterialDef | undefined {
    return this.list.find((m) => m.id === last.id);
  }

  private withDrops(): CreatureDef[] {
    return this.creatures.filter((c) => c.drops);
  }

  private refresh(): void {
    this.renderForm();
    this.renderSide();
  }

  private openCreature(c: CreatureDef): void {
    if (this.dirty && !confirm('Há alterações não salvas nos materiais. Sair mesmo assim?')) return;
    focusCreature(c.id, 'drops');
    this.ctx.scenes.go('bestiary');
  }

  private creatureLink(c: CreatureDef): HTMLElement {
    return h('span', { text: c.name, style: `color:${RARITY_COLOR[c.rarity]};cursor:pointer;text-decoration:underline`, onClick: () => this.openCreature(c) });
  }

  // ───────────────────────────── esquerda: listas ─────────────────────────────

  private renderForm(): void {
    const el = this.form;
    clear(el);
    el.append(
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: '💎 Materiais e drops' }), h('span', { class: 'muted', text: hasMaterialEdits() ? 'com edições locais' : 'versão do repositório' })),
      h('div', { class: 'tabs' },
        ...([['materiais', `Materiais (${this.list.length})`], ['joias', 'Joias da alma'], ['trofeus', 'Troféus']] as [Tab, string][]).map(([t, label]) =>
          btn(label, () => ((last.tab = t), this.refresh()), { class: last.tab === t ? 'active' : '' }),
        ),
      ),
    );
    if (last.tab === 'materiais') this.materialsList(el);
    else if (last.tab === 'joias') this.jewelsList(el);
    else this.trophiesList(el);
  }

  private materialsList(el: HTMLElement): void {
    const kindSel = h('select', {});
    kindSel.append(h('option', { value: '', text: 'Todos os tipos' }), ...Object.entries(KIND_LABEL).map(([v, t]) => h('option', { value: v, text: t })));
    kindSel.value = last.kind;
    kindSel.addEventListener('change', () => ((last.kind = kindSel.value as MaterialKind | ''), this.refresh()));
    const list = h('div', { class: 'col', style: 'gap:2px;margin-top:6px' });
    for (const m of this.list.filter((x) => !last.kind || x.kind === last.kind)) {
      const sources = materialSources(m.id, this.creatures).length;
      const sel = m.id === last.id;
      const origin = m.kind === 'elemental' ? ELEMENT_LABEL[m.element ?? 'neutro'] : MATERIAL_FAMILIES.find((f) => f.id === m.family)?.name ?? '';
      list.append(
        h('div', { class: 'item row', style: `justify-content:space-between;cursor:pointer;padding:3px 6px;${sel ? 'outline:2px solid #fff59d' : ''}`, onClick: () => ((last.id = m.id), this.refresh()) },
          h('span', {}, h('b', { text: m.name }), h('span', { class: 'muted', text: ` · ${KIND_LABEL[m.kind]} · ${origin}` })),
          h('span', { class: 'muted', text: `${sources} fera${sources === 1 ? '' : 's'} · ${m.price} ouro` }),
        ),
      );
    }
    el.append(h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, kindSel), list);
  }

  private jewelsList(el: HTMLElement): void {
    const all = this.withDrops();
    const count = (t: string) => all.filter((c) => c.drops!.jewel.type === t).length;
    el.append(
      h('div', { class: 'muted', style: 'margin:6px 0', text: `${all.length} espécies · ${count('habilidade')} de habilidade · ${count('forja')} de forja · ${count('indefinida')} a definir. Clique numa fera para escolher o tipo na aba Drops do Bestiário.` }),
    );
    const table = h('div', { class: 'col', style: 'gap:2px' });
    for (const r of RARITIES) {
      const group = all.filter((c) => c.rarity === r);
      if (!group.length) continue;
      table.append(h('h3', { style: `margin-top:8px;color:${RARITY_COLOR[r]}`, text: `${RARITY_LABEL[r]} (${group.length})` }));
      for (const c of group) {
        const j = c.drops!.jewel;
        const detail = j.type === 'habilidade' ? c.skills.find((s) => s.id === j.skill)?.name ?? '(escolha a habilidade)' : j.type === 'forja' ? j.bonus ?? '(descreva o bônus)' : '';
        table.append(
          h('div', { class: 'item row', style: 'justify-content:space-between;padding:3px 6px' },
            h('span', {}, this.creatureLink(c), h('span', { class: 'muted', text: ` · ${(j.chance * 100).toFixed(1)}%` })),
            h('span', { style: `color:${j.type === 'indefinida' ? '#9e9e9e' : j.type === 'habilidade' ? '#4fc3f7' : '#ffb74d'}`, text: `${JEWEL_TYPE_LABEL[j.type]}${detail ? `: ${detail}` : ''}` }),
          ),
        );
      }
    }
    el.append(table);
  }

  private trophiesList(el: HTMLElement): void {
    const list = this.withDrops().filter((c) => c.drops!.trophy);
    el.append(h('div', { class: 'muted', style: 'margin:6px 0', text: `${list.length} troféus (sempre caem). Venda: ${DROP_PRICES.trophy} ouro. Servirão para itens únicos e pesquisa de chefes.` }));
    for (const c of list) el.append(h('div', { class: 'item row', style: 'justify-content:space-between;padding:3px 6px' }, this.creatureLink(c), h('span', { class: 'muted', text: trophyName(c) })));
  }

  // ───────────────────────────── direita: detalhes ─────────────────────────────

  private renderSide(): void {
    const el = this.side;
    clear(el);
    const m = this.current;
    if (last.tab === 'materiais' && m) {
      const hooks = { changed: () => ((this.dirty = true), this.renderForm()), rerender: () => this.renderSide() };
      const { text, num } = field(hooks);
      const sources = materialSources(m.id, this.creatures);
      const origin = m.kind === 'elemental' ? `Elemento: ${ELEMENT_LABEL[m.element ?? 'neutro']}` : `Família: ${MATERIAL_FAMILIES.find((f) => f.id === m.family)?.name ?? m.family}`;
      el.append(
        h('h3', { text: m.name }),
        h('div', { class: 'muted', style: 'font-size:11px', text: `id: ${m.id} · ${KIND_LABEL[m.kind]} · ${origin}` }),
        text('Nome', m.name, (v) => (m.name = v)),
        text('Descrição', m.description, (v) => (m.description = v), true),
        num('Preço de venda', m.price, (v) => (m.price = Math.max(0, Math.round(v))), { min: 0, suffix: 'ouro / unidade' }),
        h('h3', { style: 'margin-top:10px', text: `Fontes (${sources.length})` }),
      );
      if (!sources.length) el.append(h('div', { class: 'muted', text: 'Nenhuma fera deixa este material ainda.' }));
      for (const { creature: c, entry: e } of sources)
        el.append(
          h('div', { class: 'item row', style: 'justify-content:space-between;padding:3px 6px' },
            h('span', {}, this.creatureLink(c), h('span', { class: 'muted', text: ` · NV ${c.levelMin}–${c.levelMax} · ${habitatLabel(c)}` })),
            h('span', { text: `${Math.round(e.chance * 1000) / 10}% · ${e.min === e.max ? e.min : `${e.min}–${e.max}`} un.` }),
          ),
        );
      el.append(h('h3', { style: 'margin-top:10px', text: 'Usos' }), h('div', { class: 'muted', text: 'Pesquisa e receitas de fabricação entram nas próximas etapas (ver docs/design/base_pesquisa_craft.md).' }));
    } else this.summary(el);
    el.append(
      h('div', { class: 'col', style: 'margin-top:12px;gap:4px' },
        btn('💾 Salvar materiais', () => this.save(), { class: 'primary' }),
        btn('⬇ Exportar materials.json', () => this.exportJson()),
        btn('📖 Bestiário', () => this.leave('bestiary')),
        btn('↩ Menu principal', () => this.leave('main_menu')),
      ),
    );
  }

  /** Resumo: valores padrão por raridade e ouro esperado por abate. */
  private summary(el: HTMLElement): void {
    el.append(h('h3', { text: 'Padrões por raridade' }), h('div', { class: 'muted', style: 'font-size:11px', text: 'Usados ao criar ou restaurar a tabela de uma fera. Ficam em data/materials/materials.json.' }));
    for (const r of RARITIES) {
      const d = DROP_DEFAULTS[r];
      const group = this.withDrops().filter((c) => c.rarity === r);
      const avg = group.length ? Math.round(group.reduce((s, c) => s + expectedValue(c.drops), 0) / group.length) : 0;
      el.append(
        h('div', { class: 'item', style: 'padding:4px 6px' },
          h('b', { text: RARITY_LABEL[r], style: `color:${RARITY_COLOR[r]}` }),
          h('div', { class: 'muted', style: 'font-size:12px', text: `comum ${d.common[0] * 100}% (${d.common[1]}–${d.common[2]}) · raro ${d.rare * 100}% · elemental ${d.elemental * 100}% · joia ${d.jewel * 100}%${d.trophy ? ' · troféu' : ''}` }),
          h('div', { style: 'font-size:12px', text: `${group.length} feras · ~${avg} ouro por abate (vendendo tudo)` }),
        ),
      );
    }
    el.append(h('div', { class: 'muted', style: 'margin-top:6px', text: `Joia vendida: ${DROP_PRICES.jewel} ouro (${jewelName({ name: '…' })}).` }));
  }

  private save(): void {
    if (this.list.some((m) => !m.name.trim())) {
      toast('Todo material precisa de nome.');
      return;
    }
    saveMaterials(this.list);
    this.dirty = false;
    toast('Materiais salvos.');
    this.refresh();
  }

  private restore(): void {
    this.list = resetMaterials();
    this.dirty = false;
    toast('Materiais restaurados do repositório.');
    this.refresh();
  }

  private exportJson(): void {
    const data = { families: MATERIAL_FAMILIES, defaults: DROP_DEFAULTS, prices: DROP_PRICES, materials: this.list };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'materials.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Para fixar no jogo, substitua src/game/data/materials/materials.json por este arquivo.');
  }

  private leave(to: 'bestiary' | 'main_menu'): void {
    if (this.dirty && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    this.ctx.scenes.go(to);
  }
}
