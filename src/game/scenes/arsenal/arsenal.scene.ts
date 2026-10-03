import { Rng, Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { ATTR_SHORT, DB, ELEMENTS, RARITIES, type Attr, type ClassId, type Element, type ItemDef, type ItemSlot, type WeaponType } from '../../data';
import { Audio } from '../../audio/audio';
import { unitFromCharacter, unitFromEnemy } from '../../battle/units';
import { DevPanel } from '../../dev/dev_panel';
import { devPlayerUnits } from '../../dev/dev_squad';
import { blankWeapon, hasItemEdits, loadItems, resetItems, saveItems } from '../../items/item_store';
import { generateMap } from '../../mapgen/generator';
import { makeCharacter } from '../../rules/recruit';
import { attrPower } from '../../rules/stats';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';
import { ELEMENT_LABEL, field } from '../shared/skill_form';

const SLOT_LABEL: Record<ItemSlot, string> = { weapon: 'Arma', offhand: 'Mão secundária', armor: 'Armadura', accessory: 'Acessório', utility: 'Item de campo' };
const WEAPON_LABEL: Record<WeaponType, string> = { espada: 'Espada', arco: 'Arco', varinha: 'Varinha', bastao: 'Bastão', faca: 'Faca', natural: 'Natural', besta_mao: 'Bestas de mão' };
/** Atributo que escala cada tipo de arma (mesma regra de rules/character). */
const WEAPON_ATTR: Record<WeaponType, Attr> = { espada: 'str', arco: 'dex', faca: 'dex', varinha: 'int', bastao: 'int', natural: 'str', besta_mao: 'dex' };
const BONUS_FIELDS: [string, string][] = [['str', 'FOR'], ['dex', 'DES'], ['spd', 'VEL'], ['int', 'INT'], ['vit', 'VIT'], ['crit', 'Crítico %'], ['accuracy', 'Precisão'], ['evasion', 'Esquiva'], ['heal', 'Cura']];
/** Atributo principal típico de um personagem focado, por nível (ver docs/design/matematica.md). */
const REF_ATTR: [number, number][] = [[1, 11], [20, 35], [40, 55], [60, 70]];
const last = { id: '', slot: 'weapon' as ItemSlot | '' };

/** Arsenal: editor de armas e equipamentos para gerenciar e balancear. */
export class ArsenalScene extends Scene {
  readonly id = 'arsenal';

  private list: ItemDef[] = [];
  private itemId = '';
  private slot: ItemSlot | '' = 'weapon';
  private dirty = false;
  private ui!: HTMLDivElement;
  private form!: HTMLDivElement;
  private side!: HTMLDivElement;

  protected override onEnter(): void {
    Audio.music('editor');
    this.list = loadItems();
    this.slot = last.slot;
    this.itemId = this.list.some((i) => i.id === last.id) ? last.id : this.visible()[0]?.id ?? '';
    this.ui = layer('arsenal-ui');
    this.form = h('div', { class: 'panel', style: 'left:8px;top:8px;bottom:8px;width:min(560px,56vw);overflow:auto' });
    this.side = h('div', { class: 'panel', style: 'right:8px;top:8px;bottom:8px;width:min(440px,40vw);overflow:auto' });
    this.ui.append(this.form, this.side);
    this.refresh();
    DevPanel.setGroups([{ title: 'Arsenal', actions: [{ label: 'Restaurar do repositório', run: () => this.restore() }] }]);
  }

  protected override onExit(): void {
    this.ui.remove();
    DevPanel.setGroups([]);
  }

  private get current(): ItemDef | undefined {
    return this.list.find((i) => i.id === this.itemId);
  }

  private visible(): ItemDef[] {
    return this.list.filter((i) => !this.slot || i.slot === this.slot);
  }

  private changed(): void {
    this.dirty = true;
    this.renderSide();
  }

  private refresh(): void {
    last.id = this.itemId;
    last.slot = this.slot;
    this.renderForm();
    this.renderSide();
  }

  // ───────────────────────────── ficha ─────────────────────────────

  private renderForm(): void {
    const el = this.form;
    clear(el);
    const slotPick = h('select', {});
    slotPick.append(h('option', { value: '', text: 'Todos os itens' }));
    for (const [v, t] of Object.entries(SLOT_LABEL)) slotPick.append(h('option', { value: v, text: `${t}s` }));
    slotPick.value = this.slot;
    slotPick.addEventListener('change', () => {
      this.slot = slotPick.value as ItemSlot | '';
      this.itemId = this.visible()[0]?.id ?? '';
      this.refresh();
    });
    const list = h('div', { class: 'col', style: 'max-height:200px;overflow:auto;gap:2px' });
    for (const it of this.visible()) {
      const sel = it.id === this.itemId;
      const stat = it.slot === 'weapon' ? `ATQ ${it.atk ?? 0}${(it.range ?? 1) > 1 ? ` · alcance ${it.range}` : ''}` : it.def ? `ARM ${it.def}` : '';
      list.append(
        h('div', { class: 'item row', style: `justify-content:space-between;cursor:pointer;padding:3px 6px;${sel ? 'outline:2px solid #fff59d' : ''}`, onClick: () => ((this.itemId = it.id), this.refresh()) },
          h('span', {}, h('b', { text: it.name, style: `color:${RARITY_COLOR[it.rarity]}` }), h('span', { class: 'muted', text: ` · ${it.slot === 'weapon' ? WEAPON_LABEL[it.weaponType ?? 'natural'] : SLOT_LABEL[it.slot]}` })),
          h('span', { class: 'muted', text: `${stat} · ${it.price} ouro` }),
        ),
      );
    }
    el.append(
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: '⚔ Arsenal' }), h('span', { class: 'muted', text: hasItemEdits() ? 'com edições locais' : 'versão do repositório' })),
      h('div', { class: 'row', style: 'gap:6px' }, slotPick, btn('+ Nova arma', () => this.add(), { class: 'small' }), btn('Duplicar', () => this.duplicate(), { class: 'small', disabled: !this.current }), btn('Excluir', () => this.remove(), { class: 'small danger', disabled: !this.current })),
      list,
    );
    const it = this.current;
    if (!it) return;
    const hooks = { changed: () => this.changed(), rerender: () => this.renderForm() };
    const { text, num, select } = field(hooks);
    const row = (...kids: (Node | null)[]) => h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' }, ...kids);
    const bonus = (k: string) => (it.bonus as Record<string, number> | undefined)?.[k] ?? 0;
    const parts: (Node | null)[] = [
      h('h3', { style: 'margin-top:10px', text: 'Ficha' }),
      h('div', { class: 'muted', style: 'font-size:11px', text: `id: ${it.id}` }),
      text('Nome', it.name, (v) => (it.name = v)),
      text('Descrição', it.description, (v) => (it.description = v), true),
      row(
        select('Tipo', it.slot, Object.entries(SLOT_LABEL), (v) => (it.slot = v as ItemSlot)),
        select('Raridade', it.rarity, RARITIES.map((r) => [r, RARITY_LABEL[r]] as [string, string]), (v) => (it.rarity = v as ItemDef['rarity'])),
        num('Preço', it.price, (v) => (it.price = Math.max(0, Math.round(v))), { min: 0, suffix: 'ouro' }),
      ),
      it.slot === 'weapon'
        ? row(
            select('Arma', it.weaponType ?? 'espada', Object.entries(WEAPON_LABEL).filter(([k]) => k !== 'natural'), (v) => (it.weaponType = v as WeaponType)),
            num('Ataque', it.atk ?? 0, (v) => (it.atk = Math.max(0, Math.round(v))), { min: 0 }),
            num('Alcance', it.range ?? 1, (v) => (it.range = Math.max(1, Math.round(v))), { min: 1, suffix: 'm' }),
          )
        : null,
      it.slot === 'armor' || it.slot === 'offhand' || it.slot === 'accessory' ? row(num('Armadura', it.def ?? 0, (v) => (it.def = Math.max(0, Math.round(v)) || undefined), { min: 0 })) : null,
      it.slot !== 'utility'
        ? h('div', { class: 'col' },
            h('span', { class: 'muted', style: 'font-size:11px', text: 'Bônus (somam aos atributos e derivados do personagem):' }),
            row(
              ...BONUS_FIELDS.map(([k, label]) =>
                num(label, bonus(k), (v) => {
                  const next: Record<string, number | undefined> = { ...(it.bonus as Record<string, number>), [k]: Math.round(v) || undefined };
                  for (const key of Object.keys(next)) if (!next[key]) delete next[key];
                  it.bonus = Object.keys(next).length ? (next as ItemDef['bonus']) : undefined;
                }),
              ),
            ),
          )
        : null,
      it.slot === 'utility'
        ? h('div', { class: 'col' },
            h('span', { class: 'muted', style: 'font-size:11px', text: 'Uso em batalha:' }),
            row(
              num('Cura', it.use?.heal ?? 0, (v) => (it.use = { ...it.use, heal: Math.max(0, Math.round(v)) || undefined }), { min: 0 }),
              num('MP', it.use?.mp ?? 0, (v) => (it.use = { ...it.use, mp: Math.max(0, Math.round(v)) || undefined }), { min: 0 }),
              num('Raio', it.use?.radius ?? 0, (v) => (it.use = { ...it.use, radius: Math.max(0, Math.round(v)) || undefined }), { min: 0 }),
              select('Elemento', it.use?.throwElement ?? '', [['', 'nenhum'], ...ELEMENTS.map((e) => [e, ELEMENT_LABEL[e]!] as [string, string])], (v) => (it.use = { ...it.use, throwElement: (v || undefined) as Element | undefined })),
            ),
          )
        : null,
    ];
    for (const p of parts) if (p) el.append(p);
  }

  // ───────────────────────────── prévia de balanceamento ─────────────────────────────

  private renderSide(): void {
    const el = this.side;
    clear(el);
    const it = this.current;
    el.append(h('h3', { text: 'Balanceamento' }));
    if (it?.slot === 'weapon') {
      const type = it.weaponType ?? 'espada';
      const attr = WEAPON_ATTR[type];
      const users = (Object.keys(DB.classes) as ClassId[]).filter((c) => c !== 'fera' && DB.classes[c].weapons.includes(type)).map((c) => DB.classes[c].name);
      el.append(
        h('div', { class: 'muted', style: 'font-size:12px', text: `${WEAPON_LABEL[type]} escala com ${ATTR_SHORT[attr]}. Usada por: ${users.join(', ') || 'ninguém'}.` }),
        h('div', { class: 'muted', style: 'font-size:12px', text: 'Ataque físico = ataque da arma + poder do atributo (valor + ⌊valor/10⌋²). Varinhas e bastões somam o ataque ao poder mágico.' }),
      );
      // Quanto a arma pesa no dano em cada fase do jogo (atributo típico de um personagem focado).
      const table = h('table', { class: 'stats' }, h('tr', {}, h('th', { text: 'Nível' }), h('th', { text: ATTR_SHORT[attr] }), h('th', { text: 'Ataque total' }), h('th', { text: 'Parte da arma' })));
      for (const [lv, v] of REF_ATTR) {
        const total = (it.atk ?? 0) + attrPower(v);
        table.append(h('tr', {}, h('td', { text: String(lv) }), h('td', { text: String(v) }), h('td', { text: String(total) }), h('td', { text: `${Math.round(((it.atk ?? 0) / total) * 100)}%` })));
      }
      el.append(table);
      // Comparação com as outras armas do mesmo tipo.
      const same = this.list.filter((o) => o.slot === 'weapon' && o.weaponType === type).sort((a, b) => (a.atk ?? 0) - (b.atk ?? 0));
      const max = Math.max(1, ...same.map((o) => o.atk ?? 0));
      el.append(h('h3', { style: 'margin-top:10px', text: `${WEAPON_LABEL[type]}s (${same.length})` }));
      for (const o of same)
        el.append(
          h('div', { class: 'row', style: 'gap:6px;font-size:12px;align-items:center' },
            h('span', { style: `min-width:130px;color:${RARITY_COLOR[o.rarity]};${o.id === it.id ? 'font-weight:bold' : ''}`, text: o.name }),
            h('div', { style: `height:10px;width:${Math.round(((o.atk ?? 0) / max) * 140)}px;background:${o.id === it.id ? '#ffd54f' : '#5c6bc0'};border-radius:2px` }),
            h('span', { class: 'muted', text: `${o.atk ?? 0} · ${o.price} ouro · ${o.atk ? Math.round(o.price / o.atk) : '—'} ouro/ATQ` }),
          ),
        );
    } else if (it) {
      el.append(h('div', { class: 'muted', style: 'font-size:12px', text: it.def ? `Armadura reduz o dano físico por armadura/(armadura+50): ${it.def} → ${Math.round((it.def / (it.def + 50)) * 100)}% (somada à resistência da VIT).` : 'Os bônus somam direto aos atributos e derivados do personagem.' }));
    }
    el.append(
      h('div', { class: 'col', style: 'margin-top:12px' },
        btn('💾 Salvar e aplicar no jogo', () => this.save(), { class: 'primary' }),
        btn('⚔ Testar arma em batalha', () => this.testBattle(), { disabled: it?.slot !== 'weapon' }),
        btn('⬇ Exportar items.json', () => this.exportJson()),
        btn('↺ Descartar alterações', () => {
          this.list = loadItems();
          this.dirty = false;
          this.refresh();
        }),
        btn('↩ Menu principal', () => this.leave()),
      ),
    );
  }

  // ───────────────────────────── ações ─────────────────────────────

  private newId(base: string): string {
    let i = 1;
    while (this.list.some((o) => o.id === `${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  private add(): void {
    const it = blankWeapon(this.newId('arma_nova'));
    this.list.push(it);
    this.itemId = it.id;
    this.slot = 'weapon';
    this.changed();
    this.refresh();
  }

  private duplicate(): void {
    const cur = this.current;
    if (!cur) return;
    const copy = { ...structuredClone(cur), id: this.newId(cur.id), name: `${cur.name} (cópia)` };
    this.list.push(copy);
    this.itemId = copy.id;
    this.changed();
    this.refresh();
  }

  private remove(): void {
    const cur = this.current;
    if (!cur) return;
    this.list = this.list.filter((o) => o.id !== cur.id);
    this.itemId = this.visible()[0]?.id ?? '';
    this.changed();
    this.refresh();
  }

  private validate(): string | null {
    const ids = new Set<string>();
    for (const it of this.list) {
      if (!it.name.trim()) return `Item sem nome (${it.id}).`;
      if (ids.has(it.id)) return `Id repetido: ${it.id}`;
      ids.add(it.id);
    }
    return null;
  }

  private save(): boolean {
    const err = this.validate();
    if (err) {
      toast(err);
      return false;
    }
    saveItems(this.list);
    this.dirty = false;
    toast('Arsenal salvo. Lojas, quartel e batalhas já usam estes valores.');
    this.refresh();
    return true;
  }

  private restore(): void {
    this.list = resetItems();
    this.dirty = false;
    toast('Arsenal restaurado do repositório.');
    this.refresh();
  }

  private exportJson(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(this.list, null, 2)], { type: 'application/json' }));
    a.download = 'items.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Para fixar no jogo, substitua src/game/data/items/items.json por este arquivo.');
  }

  /** Batalha de teste: um personagem da classe que usa a arma, equipado com ela, mais o esquadrão de testes. */
  private testBattle(): void {
    const it = this.current;
    if (!it || it.slot !== 'weapon' || (this.dirty && !this.save())) return;
    const cls = (Object.keys(DB.classes) as ClassId[]).find((c) => c !== 'fera' && c !== 'aprendiz' && DB.classes[c].weapons.includes(it.weaponType ?? 'espada')) ?? 'guerreiro';
    const level = 20;
    const rng = new Rng(Date.now() % 1e9);
    const c = makeCharacter(rng, { classId: cls, level });
    c.name = `Teste: ${it.name}`;
    c.equipment.weapon = it.id;
    const tester = unitFromCharacter(c, 'player');
    const foes = ['rebelde_guerreiro', 'rebelde_guerreiro', 'rebelde_arqueiro', 'rebelde_mago'].map((id) => unitFromEnemy(DB.enemies[id]!, level, rng));
    this.ctx.scenes.go('battle', {
      setup: {
        map: generateMap({ biome: 'planicie', seed: rng.int(1, 1e9) }),
        players: [tester, ...devPlayerUnits(level).slice(0, 3)],
        enemies: foes,
        victory: { type: 'eliminate' },
        ambush: false,
        canFlee: true,
        seed: rng.int(1, 1e9),
        context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: `Teste de arma: ${it.name} (NV ${level})` },
      },
      returnTo: 'arsenal',
    });
  }

  private leave(): void {
    if (this.dirty && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    this.ctx.scenes.go('main_menu');
  }
}
