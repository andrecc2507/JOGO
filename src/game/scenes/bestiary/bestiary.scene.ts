import { Rng, Scene } from '@core';
import { MAX_LEVEL } from '../../rules/stats';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { ATTRS, ATTR_LABEL, BIOMES, DB, MATERIAL_FAMILIES, RARITIES, creatureToEnemy, type CreatureDef, type CreatureDrops, type JewelType } from '../../data';
import { defaultDrops, expectedValue, jewelName, trophyName } from '../../rules/drops';
import { ELEMENT_LABEL, skillCard } from '../shared/skill_form';
import { Audio } from '../../audio/audio';
import { blankCreature, hasLocalEdits, loadBestiary, resetBestiary, saveBestiary } from '../../bestiary/bestiary_store';
import { createEmptyMap, type BattleMap } from '../../battle/map';
import { clampLevel, unitFromEnemy } from '../../battle/units';
import type { BattleUnit } from '../../battle/types';
import { DevPanel } from '../../dev/dev_panel';
import { devPlayerUnits } from '../../dev/dev_squad';
import { habitatLabel } from '../../world/regions';
import { BIOME_LABEL, generateMap } from '../../mapgen/generator';
import { drawBattle, unitSpec } from '../../render/battle_renderer';
import { IsoCamera } from '../../render/iso';
import { portraitCanvas } from '../../render/sprites';
import { POSES, artFor, pickClip, type Pose, type UnitPose } from '../../render/sprite_anims';
import { clearLocalSprites, localSprites } from '../../render/sprite_local';
import { openSpriteImporter } from './sprite_importer';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';

/** Quantas cópias da criatura entram no teste de batalha. */
const TEST_COUNT: Record<CreatureDef['rarity'], number> = { comum: 3, raro: 2, epico: 1, lendario: 1 };

/** Bestiário editável: ficha à esquerda, prévia de combate e retrato à direita. */
/** Aba aberta no editor e criatura pedida por outra tela (ex.: menu de materiais). */
const view = { tab: 'ficha' as 'ficha' | 'drops', openId: '' };

/** Abre o Bestiário já numa criatura e aba (usado pelo menu de materiais). */
export function focusCreature(id: string, tab: 'ficha' | 'drops' = 'drops'): void {
  view.openId = id;
  view.tab = tab;
}

const JEWEL_LABEL: Record<JewelType, string> = { indefinida: 'A definir', habilidade: 'Habilidade (espaço de joia)', forja: 'Forja (itens mágicos)' };

export class BestiaryScene extends Scene {
  readonly id = 'bestiary';

  private list: CreatureDef[] = [];
  private index = 0;
  private dirty = false;
  private previewLevel = 1;
  private filterBiome = '';
  private filterRarity = '';
  private ui!: HTMLDivElement;
  private form!: HTMLDivElement;
  private side!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private statsBox!: HTMLDivElement;
  private portraitBox!: HTMLDivElement;
  /** Pose mostrada na prévia (testar as animações da arte pronta). */
  private poseBox!: HTMLDivElement;
  private previewPose: UnitPose = { pose: 'idle' };
  private cam = new IsoCamera(360, 300);
  private previewMap!: BattleMap;
  private previewUnit: BattleUnit | null = null;
  private time = 0;

  protected override onEnter(): void {
    Audio.music('editor');
    this.list = loadBestiary();
    if (view.openId) {
      const i = this.list.findIndex((c) => c.id === view.openId);
      if (i >= 0) this.index = i;
      view.openId = '';
    }
    this.ui = layer('bestiary-ui');
    this.form = h('div', { class: 'panel', style: 'left:8px;top:8px;bottom:8px;width:min(560px,58vw);overflow:auto' });
    this.side = h('div', { class: 'panel', style: 'right:8px;top:8px;width:min(400px,38vw);max-height:calc(100vh - 16px);overflow:auto' });
    this.ui.append(this.form, this.side);
    this.buildSide();
    this.renderForm();
    DevPanel.setGroups([{ title: 'Bestiário', actions: [{ label: 'Restaurar do repositório', run: () => this.restore() }] }]);
  }

  protected override onExit(): void {
    this.ui.remove();
    DevPanel.setGroups([]);
  }

  private get current(): CreatureDef | undefined {
    return this.list[this.index];
  }

  protected override onUpdate(dt: number): void {
    this.time += dt;
    if (this.ctx.input.justPressed('rotate_left')) this.cam.rotate(-1);
    if (this.ctx.input.justPressed('rotate_right')) this.cam.rotate(1);
  }

  protected override onRender(): void {
    const g = this.canvas?.getContext('2d');
    if (!g || !this.previewUnit) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#10131c';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Poses que tocam uma vez recomeçam a cada 2 s para dar tempo de ver.
    const art = artFor(this.previewUnit.look.art);
    const loop = art ? pickClip(art, this.previewPose)?.clip.loop : true;
    const pose = { ...this.previewPose, key: loop ? 0 : Math.floor(this.time / 2) };
    drawBattle(g, this.cam, this.previewMap, { units: [this.previewUnit], time: this.time, activeUid: this.previewUnit.uid, pose: () => pose });
  }

  // ───────────────────────────── ficha (esquerda) ─────────────────────────────

  private changed(): void {
    this.dirty = true;
    this.refreshPreview();
  }

  private renderForm(): void {
    const el = this.form;
    clear(el);
    const tabs = h('div', { class: 'row', style: 'gap:6px' });
    const filterBiome = h('select', {});
    filterBiome.append(h('option', { value: '', text: 'Todos os biomas' }), ...BIOMES.map((b) => h('option', { value: b, text: BIOME_LABEL[b] })));
    filterBiome.value = this.filterBiome;
    const filterRarity = h('select', {});
    filterRarity.append(h('option', { value: '', text: 'Todas as raridades' }), ...RARITIES.map((r) => h('option', { value: r, text: RARITY_LABEL[r] })));
    filterRarity.value = this.filterRarity;
    const picker = h('select', {});
    const shown = this.list.map((c, i) => [c, i] as const).filter(([c]) => (!this.filterBiome || c.biomes.includes(this.filterBiome as never)) && (!this.filterRarity || c.rarity === this.filterRarity));
    for (const [c, i] of shown) picker.append(h('option', { value: String(i), text: `${c.name || '(sem nome)'} · ${RARITY_LABEL[c.rarity]} · NV ${c.levelMin}–${c.levelMax}` }));
    picker.value = String(this.index);
    picker.style.maxWidth = '100%';
    const pick = (i: number) => {
      this.index = i;
      this.previewLevel = this.list[i]?.levelMin ?? 1;
      this.renderForm();
    };
    picker.addEventListener('change', () => pick(Number(picker.value)));
    filterBiome.addEventListener('change', () => {
      this.filterBiome = filterBiome.value;
      const first = this.list.findIndex((c) => (!this.filterBiome || c.biomes.includes(this.filterBiome as never)) && (!this.filterRarity || c.rarity === this.filterRarity));
      pick(first >= 0 ? first : this.index);
    });
    filterRarity.addEventListener('change', () => {
      this.filterRarity = filterRarity.value;
      const first = this.list.findIndex((c) => (!this.filterBiome || c.biomes.includes(this.filterBiome as never)) && (!this.filterRarity || c.rarity === this.filterRarity));
      pick(first >= 0 ? first : this.index);
    });
    const step = (d: number) => {
      const pos = shown.findIndex(([, i]) => i === this.index);
      const next = shown[(pos + d + shown.length) % Math.max(1, shown.length)];
      if (next) pick(next[1]);
    };
    tabs.append(filterBiome, filterRarity, h('span', { class: 'muted', text: `${shown.length}/${this.list.length}` }));
    const nav = h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, btn('◀', () => step(-1), { class: 'small' }), picker, btn('▶', () => step(1), { class: 'small' }));
    nav.append(
      btn('+ Nova criatura', () => {
        this.list.push(blankCreature(this.list.length + 1));
        this.index = this.list.length - 1;
        this.changed();
        this.renderForm();
      }, { class: 'small' }),
    );
    el.append(h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: `📖 Bestiário (${this.list.length} criaturas)` }), h('span', { class: 'muted', text: hasLocalEdits() ? 'com edições locais' : 'versão do repositório' })), tabs, nav);
    const c = this.current;
    if (!c) {
      el.append(h('p', { class: 'muted', text: 'Nenhuma criatura. Use “+ Nova criatura”.' }));
      this.refreshPreview();
      return;
    }
    this.previewLevel = Math.max(c.levelMin, Math.min(c.levelMax, this.previewLevel));
    el.append(
      h('div', { class: 'tabs', style: 'margin-top:8px' },
        btn('📋 Ficha', () => ((view.tab = 'ficha'), this.renderForm()), { class: view.tab === 'ficha' ? 'active' : '' }),
        btn(`💎 Drops${c.drops ? '' : ' (nenhum)'}`, () => ((view.tab = 'drops'), this.renderForm()), { class: view.tab === 'drops' ? 'active' : '' }),
      ),
    );
    if (view.tab === 'drops') {
      el.append(this.dropsTab(c));
      this.refreshPreview();
      return;
    }

    const section = (title: string, ...rows: (Node | null)[]) => h('div', { class: 'col', style: 'margin-top:10px' }, h('h3', { text: title }), ...rows);
    const text = (label: string, value: string, set: (v: string) => void, area = false) => {
      const input = area ? h('textarea', {}) : h('input', { value });
      if (area) (input as HTMLTextAreaElement).value = value;
      input.style.width = '100%';
      if (area) input.setAttribute('rows', '2');
      input.addEventListener('input', () => {
        set((input as HTMLInputElement).value);
        this.changed();
      });
      return h('label', { class: 'col' }, h('span', { class: 'muted', text: label }), input);
    };
    const num = (label: string, value: number, set: (v: number) => void, opts: { min?: number; max?: number; step?: number; suffix?: string } = {}) => {
      const input = h('input', { type: 'number', value: String(value) });
      input.style.width = '72px';
      if (opts.min !== undefined) input.min = String(opts.min);
      if (opts.max !== undefined) input.max = String(opts.max);
      input.step = String(opts.step ?? 1);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        set(v);
        this.changed();
      });
      return h('label', { class: 'row', style: 'gap:4px' }, h('span', { style: 'min-width:120px', text: label }), input, opts.suffix ? h('span', { class: 'muted', text: opts.suffix }) : null);
    };
    const select = (label: string, value: string, options: [string, string][], set: (v: string) => void) => {
      const s = h('select', {});
      for (const [v, t] of options) s.append(h('option', { value: v, text: t }));
      s.value = value;
      s.addEventListener('change', () => {
        set(s.value);
        this.changed();
        this.renderForm();
      });
      return h('label', { class: 'row', style: 'gap:4px' }, h('span', { style: 'min-width:120px', text: label }), s);
    };
    const check = (label: string, value: boolean, set: (v: boolean) => void) => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = value;
      cb.addEventListener('change', () => {
        set(cb.checked);
        this.changed();
      });
      return h('label', { class: 'row', style: 'gap:4px' }, cb, h('span', { text: label }));
    };

    el.append(
      section(
        'Identidade',
        text('Nome', c.name, (v) => {
          c.name = v;
        }),
        text('Descrição', c.description, (v) => (c.description = v), true),
        h('div', { class: 'row', style: 'gap:14px' },
          select('Raridade', c.rarity, RARITIES.map((r) => [r, RARITY_LABEL[r]]), (v) => (c.rarity = v as CreatureDef['rarity'])),
          check('Adestrável', c.tameable, (v) => (c.tameable = v)),
          check('Só invocada', !!c.summonOnly, (v) => (c.summonOnly = v || undefined)),
        ),
        text('Família (bando/alcateia)', c.family ?? '', (v) => (c.family = v.trim() || undefined)),
      ),
      section(
        'Balanceamento',
        h('div', { class: 'row', style: 'gap:6px' },
          num('Range de NV', c.levelMin, (v) => (c.levelMin = Math.max(1, Math.min(MAX_LEVEL, Math.round(v)))), { min: 1, max: MAX_LEVEL }),
          h('span', { text: 'até' }),
          (() => {
            const i = h('input', { type: 'number', value: String(c.levelMax) });
            i.style.width = '72px';
            i.addEventListener('input', () => {
              c.levelMax = Math.max(c.levelMin, Math.min(MAX_LEVEL, Math.round(Number(i.value) || c.levelMin)));
              this.changed();
            });
            return i;
          })(),
        ),
        h('div', { class: 'muted', style: 'font-size:11px', text: 'Aparece no nível médio do esquadrão, travado entre o mínimo e o máximo.' }),
        num('HP (no NV mínimo)', c.hp, (v) => (c.hp = Math.max(1, Math.round(v))), { min: 1 }),
        select('Elemento', c.element, Object.entries(ELEMENT_LABEL), (v) => (c.element = v as CreatureDef['element'])),
        num('Deslocamento', c.move, (v) => (c.move = Math.max(0, Math.round(v))), { min: 0, suffix: 'm (1 tile = 1 m)' }),
        num('Tamanho', c.size, (v) => (c.size = Math.max(1, Math.min(4, v))), { min: 1, max: 4, step: 0.5, suffix: 'tiles' }),
        num('XP ao derrotar', c.xp, (v) => (c.xp = Math.max(0, Math.round(v))), { min: 0, suffix: 'no NV mínimo' }),
      ),
      section('Atributos (no NV mínimo)', h('div', { class: 'grid3' }, ...ATTRS.map((a) => num(ATTR_LABEL[a], c.attrs[a], (v) => (c.attrs[a] = Math.max(0, Math.round(v))), { min: 0 })))),
      section(
        'Bioma encontrado',
        h('div', { class: 'row', style: 'gap:12px' },
          ...BIOMES.map((b) =>
            check(BIOME_LABEL[b], c.biomes.includes(b), (on) => {
              c.biomes = on ? [...new Set([...c.biomes, b])] : c.biomes.filter((x) => x !== b);
            }),
          ),
        ),
      ),
      this.skillsSection(c, section),
      this.appearanceSection(c, section),
      section(
        'Identificador',
        text('id (usado no código e nos saves)', c.id, (v) => (c.id = v.trim().replace(/\s+/g, '_').toLowerCase() || c.id)),
        btn('Excluir esta criatura', () => {
          this.list.splice(this.index, 1);
          this.index = Math.max(0, this.index - 1);
          this.changed();
          this.renderForm();
        }, { class: 'small danger' }),
      ),
    );
    this.refreshPreview();
  }

  /** Aba de drops: família de material, tabela (material, chance, quantidade), troféu e joia da alma. */
  private dropsTab(c: CreatureDef): HTMLElement {
    const box = h('div', { class: 'col', style: 'margin-top:8px;gap:8px' });
    const redraw = () => this.renderForm();
    const showValue = () => (value.textContent = `Valor esperado por abate (vendendo tudo): ${expectedValue(c.drops)} ouro`);
    const edited = () => {
      this.dirty = true;
      showValue();
    };
    if (!c.drops) {
      box.append(
        h('div', { class: 'muted', text: 'Esta criatura não deixa nada ao ser derrotada (ex.: invocações).' }),
        btn('Criar tabela padrão', () => {
          c.drops = defaultDrops(c.rarity, c.element, MATERIAL_FAMILIES[0]!.id);
          this.dirty = true;
          redraw();
        }),
      );
      return box;
    }
    const d: CreatureDrops = c.drops;
    const value = h('div', { class: 'gold' });
    const numIn = (v: number, set: (v: number) => void, w = 56, step = 1) => {
      const i = h('input', { type: 'number', value: String(v) });
      i.style.width = `${w}px`;
      i.step = String(step);
      i.addEventListener('input', () => {
        const n = Number(i.value);
        if (!Number.isFinite(n)) return;
        set(n);
        edited();
      });
      return i;
    };
    const pct = (v: number, set: (v: number) => void) => h('span', { class: 'row', style: 'gap:2px' }, numIn(Math.round(v * 1000) / 10, (n) => set(Math.max(0, Math.min(100, n)) / 100), 64, 0.1), h('span', { class: 'muted', text: '%' }));

    // Família de material: trocar mantém as chances e troca os materiais comum/raro.
    const famSel = h('select', {});
    for (const f of MATERIAL_FAMILIES) famSel.append(h('option', { value: f.id, text: f.name }));
    famSel.value = d.family;
    famSel.addEventListener('change', () => {
      const old = MATERIAL_FAMILIES.find((f) => f.id === d.family);
      const neu = MATERIAL_FAMILIES.find((f) => f.id === famSel.value)!;
      for (const e of d.table) {
        if (old && e.material === old.common) e.material = neu.common;
        else if (old && e.material === old.rare) e.material = neu.rare;
      }
      d.family = neu.id;
      this.dirty = true;
      redraw();
    });
    box.append(
      h('h3', { text: 'Materiais' }),
      h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:140px', text: 'Família de material' }), famSel),
    );

    const mats = Object.values(DB.materials);
    const table = h('div', { class: 'col', style: 'gap:4px' });
    table.append(h('div', { class: 'row muted', style: 'gap:6px;font-size:11px' }, h('span', { style: 'width:190px', text: 'material' }), h('span', { style: 'width:84px', text: 'chance' }), h('span', { text: 'quantidade (mín–máx)' })));
    d.table.forEach((e, i) => {
      const sel = h('select', {});
      sel.style.width = '190px';
      for (const kind of ['comum', 'raro', 'elemental'] as const) {
        const g = document.createElement('optgroup');
        g.label = kind === 'comum' ? 'Comuns' : kind === 'raro' ? 'Raros' : 'Elementais';
        for (const m of mats.filter((x) => x.kind === kind)) g.append(h('option', { value: m.id, text: `${m.name} (${m.price} ouro)` }));
        sel.append(g);
      }
      sel.value = e.material;
      sel.addEventListener('change', () => {
        e.material = sel.value;
        edited();
      });
      table.append(
        h('div', { class: 'row', style: 'gap:6px' },
          sel,
          pct(e.chance, (v) => (e.chance = v)),
          numIn(e.min, (v) => (e.min = Math.max(0, Math.round(v)))),
          h('span', { text: '–' }),
          numIn(e.max, (v) => (e.max = Math.max(0, Math.round(v)))),
          btn('✕', () => {
            d.table.splice(i, 1);
            this.dirty = true;
            redraw();
          }, { class: 'small danger' }),
        ),
      );
    });
    box.append(
      table,
      h('div', { class: 'row', style: 'gap:6px' },
        btn('+ Material', () => {
          d.table.push({ material: MATERIAL_FAMILIES.find((f) => f.id === d.family)?.common ?? mats[0]!.id, chance: 0.1, min: 1, max: 1 });
          this.dirty = true;
          redraw();
        }, { class: 'small' }),
        btn('Restaurar padrão da raridade', () => {
          c.drops = { ...defaultDrops(c.rarity, c.element, d.family), jewel: { ...defaultDrops(c.rarity, c.element, d.family).jewel, type: d.jewel.type, skill: d.jewel.skill, bonus: d.jewel.bonus } };
          this.dirty = true;
          redraw();
        }, { class: 'small' }),
      ),
    );

    // Troféu e joia da alma.
    const trophy = h('input', { type: 'checkbox' });
    trophy.checked = d.trophy;
    trophy.addEventListener('change', () => {
      d.trophy = trophy.checked;
      edited();
    });
    box.append(h('h3', { text: 'Troféu' }), h('label', { class: 'row', style: 'gap:6px' }, trophy, h('span', { text: `${trophyName(c)} (sempre cai; épicas e lendárias)` })));

    const typeSel = h('select', {});
    for (const [v, t] of Object.entries(JEWEL_LABEL)) typeSel.append(h('option', { value: v, text: t }));
    typeSel.value = d.jewel.type;
    typeSel.addEventListener('change', () => {
      d.jewel.type = typeSel.value as JewelType;
      this.dirty = true;
      redraw();
    });
    const jewelRows: Node[] = [
      h('div', { class: 'muted', text: jewelName(c) }),
      h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:140px', text: 'Chance' }), pct(d.jewel.chance, (v) => (d.jewel.chance = v))),
      h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:140px', text: 'Tipo' }), typeSel),
    ];
    if (d.jewel.type === 'habilidade') {
      const skSel = h('select', {});
      skSel.append(h('option', { value: '', text: '— escolha a habilidade —' }));
      for (const s of c.skills) skSel.append(h('option', { value: s.id, text: `${s.name}${s.kind === 'passive' ? ' (passiva)' : ''}` }));
      skSel.value = d.jewel.skill ?? '';
      skSel.addEventListener('change', () => {
        d.jewel.skill = skSel.value || undefined;
        edited();
      });
      jewelRows.push(h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:140px', text: 'Habilidade que dá' }), skSel));
    }
    if (d.jewel.type === 'forja') {
      const bonus = h('textarea', {});
      bonus.value = d.jewel.bonus ?? '';
      bonus.setAttribute('rows', '2');
      bonus.style.width = '100%';
      bonus.placeholder = 'Ex.: dano de fogo +15% e imunidade a queimadura';
      bonus.addEventListener('input', () => {
        d.jewel.bonus = bonus.value.trim() || undefined;
        edited();
      });
      jewelRows.push(h('label', { class: 'col' }, h('span', { class: 'muted', text: 'Bônus dos itens mágicos feitos com ela' }), bonus));
    }
    box.append(h('h3', { text: 'Joia da alma' }), ...jewelRows);
    box.append(
      value,
      h('div', { class: 'row', style: 'gap:6px' },
        btn('Remover drops (não deixa nada)', () => {
          c.drops = undefined;
          this.dirty = true;
          redraw();
        }, { class: 'small danger' }),
        btn('💎 Ver todos os materiais', () => this.ctx.scenes.go('materials'), { class: 'small' }),
      ),
    );
    showValue();
    return box;
  }

  private skillsSection(c: CreatureDef, section: (title: string, ...rows: (Node | null)[]) => HTMLElement): HTMLElement {
    const hooks = { changed: () => this.changed(), rerender: () => this.renderForm() };
    const cards = c.skills.map((s, i) =>
      skillCard(s, hooks, () => {
        c.skills.splice(i, 1);
        this.changed();
        this.renderForm();
      }),
    );
    return section(
      `Habilidades (${c.skills.length})`,
      ...cards,
      btn('+ Habilidade', () => {
        c.skills.push({ id: `${c.id}_hab${c.skills.length + 1}`, name: 'Nova habilidade', description: '', kind: 'physical', range: 1, power: 4, cooldown: 0 });
        this.changed();
        this.renderForm();
      }, { class: 'small' }),
    );
  }

  private appearanceSection(c: CreatureDef, section: (title: string, ...rows: (Node | null)[]) => HTMLElement): HTMLElement {
    const colors = h('div', { class: 'row', style: 'gap:10px' });
    for (const key of Object.keys(c.palette)) {
      const input = h('input', { type: 'color', value: c.palette[key]! });
      input.addEventListener('input', () => {
        c.palette[key] = input.value;
        this.changed();
      });
      colors.append(h('label', { class: 'row', style: 'gap:3px' }, h('code', { text: key }), input));
    }
    const area = h('textarea', {});
    area.value = c.sprite.join('\n');
    area.setAttribute('rows', String(Math.max(8, c.sprite.length)));
    area.setAttribute('spellcheck', 'false');
    area.style.cssText = 'width:100%;font-family:monospace;line-height:1.1;letter-spacing:2px';
    area.addEventListener('input', () => {
      c.sprite = area.value.split('\n').map((r) => r.replace(/\s/g, ''));
      for (const ch of new Set(c.sprite.join('').replace(/\./g, ''))) if (!c.palette[ch]) c.palette[ch] = '#ff00ff';
      this.changed();
    });
    area.addEventListener('change', () => this.renderForm());
    const art = artFor(c.id);
    return section(
      'Aparência (pixel art)',
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-bottom:6px' },
        btn('🖼 Importar sprite gerado', () => openSpriteImporter(c, () => this.refreshPreview()), { class: 'primary small', title: 'Converte uma imagem gerada (Ludo.ai etc.) em arte pronta do jogo.' }),
        h('span', { class: 'muted', style: 'font-size:11px', text: art ? `Arte pronta: ${art.base ? 'imagem parada' : 'sem imagem parada'}${Object.keys(art.clips).length ? ` + ${Object.keys(art.clips).length} animação(ões)` : ''}` : 'Sem arte pronta: usa a pixel art abaixo.' }),
        localSprites().some((s) => s.id === c.id)
          ? btn('↺ Tirar arte só deste navegador', () => {
              clearLocalSprites(c.id);
              toast('Removida. Recarregue a página para voltar à arte do projeto.');
            }, { class: 'small' })
          : null,
      ),
      h('div', { class: 'muted', style: 'font-size:11px', text: 'Cada letra é um pixel com a cor da paleta; “.” é transparente. O contorno escuro é automático.' }),
      colors,
      area,
    );
  }

  // ───────────────────────────── prévia (direita) ─────────────────────────────

  private buildSide(): void {
    this.canvas = h('canvas', {});
    this.canvas.width = 360;
    this.canvas.height = 300;
    this.canvas.style.cssText = 'width:100%;max-width:360px;image-rendering:pixelated;border:1px solid #5a4a32;border-radius:4px;display:block';
    this.portraitBox = h('div', { class: 'row' });
    this.poseBox = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin-top:4px' });
    this.statsBox = h('div', { class: 'col' });
    this.side.append(
      h('h3', { text: 'Em combate' }),
      this.canvas,
      h('div', { class: 'row' },
        btn('⟲ Girar', () => this.cam.rotate(-1), { class: 'small' }),
        btn('Girar ⟳', () => this.cam.rotate(1), { class: 'small' }),
        btn('−', () => (this.cam.zoom = Math.max(0.8, this.cam.zoom - 0.2)), { class: 'small' }),
        btn('+', () => (this.cam.zoom = Math.min(3, this.cam.zoom + 0.2)), { class: 'small' }),
      ),
      this.poseBox,
      h('h3', { style: 'margin-top:8px', text: 'Retrato na linha do tempo' }),
      this.portraitBox,
      h('h3', { style: 'margin-top:8px', text: 'Valores calculados' }),
      this.statsBox,
      h('div', { class: 'col', style: 'margin-top:8px' },
        btn('💾 Salvar e aplicar no jogo', () => this.save(), { class: 'primary' }),
        btn('⚔ Testar em batalha', () => this.testBattle()),
        btn('⬇ Exportar JSON', () => this.exportJson()),
        btn('📋 Copiar JSON', () => this.copyJson()),
        btn('↺ Descartar alterações', () => {
          this.list = loadBestiary();
          this.dirty = false;
          this.renderForm();
        }),
        btn('↩ Menu principal', () => this.leave()),
      ),
    );
  }

  /** Seletor de pose: mostra qual animação será usada (✓ própria, ↪ reserva, — só imagem parada). */
  private renderPoses(c: CreatureDef, unit: BattleUnit): void {
    const art = artFor(unit.look.art);
    const sel = h('select');
    const add = (value: string, label: string, p: UnitPose) => {
      const want = p.skill ? `skill:${p.skill}` : p.pose;
      const got = art ? pickClip(art, p)?.name : undefined;
      const mark = !art ? '' : got === want ? ' ✓' : got ? ` ↪ ${got}` : ' —';
      const opt = h('option', { text: label + mark });
      opt.value = value;
      sel.append(opt);
    };
    for (const pose of POSES) add(pose, POSE_LABEL[pose], { pose });
    for (const sk of c.skills) add(`skill:${sk.id}`, `Habilidade: ${sk.name}`, { pose: 'attack', skill: sk.id });
    const cur = this.previewPose.skill ? `skill:${this.previewPose.skill}` : this.previewPose.pose;
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'idle';
    const apply = () => {
      const v = sel.value;
      this.previewPose = v.startsWith('skill:') ? { pose: 'attack', skill: v.slice(6) } : { pose: v as Pose };
    };
    apply();
    sel.addEventListener('change', apply);
    this.poseBox.append(
      h('span', { class: 'muted', text: 'Animação' }),
      sel,
      h('span', { class: 'muted', style: 'font-size:11px', text: art ? 'Ações de uma vez repetem a cada 2 s.' : 'Sem arte pronta (data/sprite_art.json).' }),
    );
  }

  private refreshPreview(): void {
    const c = this.current;
    clear(this.portraitBox);
    clear(this.poseBox);
    clear(this.statsBox);
    if (!c) {
      this.previewUnit = null;
      return;
    }
    const def = creatureToEnemy(c);
    const unit = unitFromEnemy(def, this.previewLevel, new Rng(1));
    unit.x = 1;
    unit.y = 1;
    unit.facing = 1;
    unit.gauge = 100;
    this.previewUnit = unit;
    const biome = c.biomes[0] ?? 'neve';
    this.previewMap = createEmptyMap(3, 3, biome);
    this.cam.zoom = Math.max(this.cam.zoom, 2.2 / Math.max(1, c.size));
    this.renderPoses(c, unit);
    this.portraitBox.append(
      h('div', { class: 'chip enemy now' }, portraitCanvas(unitSpec(unit), 40), h('b', { text: c.name.split(' ')[0]!.slice(0, 9) }), h('span', { class: 'muted', text: 'Fera' })),
      h('span', { class: 'muted', style: 'font-size:11px', text: 'Assim ela aparece na fila de turnos.' }),
    );
    const slider = h('input', { type: 'range' });
    slider.min = String(c.levelMin);
    slider.max = String(c.levelMax);
    slider.value = String(this.previewLevel);
    slider.addEventListener('input', () => {
      this.previewLevel = Number(slider.value);
      this.refreshPreview();
    });
    const lvl = clampLevel(def, this.previewLevel);
    this.statsBox.append(
      h('div', { class: 'row' }, h('span', { text: `Nível ${lvl}` }), slider),
      h('div', { style: `color:${RARITY_COLOR[c.rarity]}`, text: `${RARITY_LABEL[c.rarity]} · ${ELEMENT_LABEL[c.element]} · ${habitatLabel(c)}` }),
      h('table', { class: 'stats' },
        ...[
          ['HP', unit.maxHp],
          ['XP ao derrotar', unit.xpReward ?? 0],
          ['Ataque base (FOR)', unit.weaponAtk],
          ['Deslocamento', `${unit.move} m`],
          ['Esquiva', Math.round(unit.evasion)],
          ['Acerto', Math.round(unit.accuracy)],
          ...ATTRS.map((a) => [ATTR_LABEL[a], unit.attrs[a]] as const),
        ].map(([k, v]) => h('tr', {}, h('td', { text: String(k) }), h('td', { text: String(v) }))),
      ),
    );
    if (c.size > 1) this.statsBox.append(h('div', { class: 'muted', style: 'font-size:11px', text: 'Tamanho maior que 1 tile ainda é só visual em combate.' }));
  }

  // ───────────────────────────── ações ─────────────────────────────

  private validate(): string | null {
    const ids = new Set<string>();
    for (const c of this.list) {
      if (!c.name.trim()) return 'Toda criatura precisa de nome.';
      if (ids.has(c.id)) return `Id repetido: ${c.id}`;
      ids.add(c.id);
      if (c.levelMax < c.levelMin) return `${c.name}: o NV máximo é menor que o mínimo.`;
      if (!c.biomes.length) return `${c.name}: escolha ao menos um bioma.`;
      for (const s of c.skills) if (DB.skills[s.id] && DB.skills[s.id]!.classId !== 'fera') return `${c.name}: o id de habilidade “${s.id}” já é de uma classe.`;
    }
    return null;
  }

  private save(): boolean {
    const err = this.validate();
    if (err) {
      toast(err);
      return false;
    }
    saveBestiary(this.list);
    this.dirty = false;
    toast('Bestiário salvo. Encontros e batalhas já usam estes valores.');
    this.renderForm();
    return true;
  }

  private restore(): void {
    this.list = resetBestiary();
    this.index = 0;
    this.dirty = false;
    toast('Bestiário restaurado do repositório.');
    this.renderForm();
  }

  private json(): string {
    return JSON.stringify(this.list, null, 2);
  }

  private exportJson(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.json()], { type: 'application/json' }));
    a.download = 'creatures.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Para fixar no jogo, substitua src/game/data/bestiary/creatures.json por este arquivo.');
  }

  private copyJson(): void {
    navigator.clipboard
      ?.writeText(this.json())
      .then(() => toast('JSON copiado.'))
      .catch(() => toast('Não foi possível copiar. Use Exportar JSON.'));
  }

  private testBattle(): void {
    const c = this.current;
    if (!c || (this.dirty && !this.save())) return;
    const rng = new Rng(Date.now() % 1e9);
    const def = DB.enemies[c.id]!;
    const biome = c.biomes[0] ?? 'neve';
    const level = clampLevel(def, this.previewLevel);
    this.ctx.scenes.go('battle', {
      setup: {
        map: generateMap({ biome, seed: rng.int(1, 1e9) }),
        players: devPlayerUnits(Math.max(1, level)),
        enemies: Array.from({ length: TEST_COUNT[c.rarity] }, () => unitFromEnemy(def, level, rng)),
        victory: { type: 'eliminate' },
        ambush: false,
        canFlee: true,
        seed: rng.int(1, 1e9),
        context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: `Teste do bestiário: ${c.name} (NV ${level})` },
      },
      returnTo: 'bestiary',
    });
  }

  private leave(): void {
    if (this.dirty) toast('Alterações não salvas foram descartadas.');
    this.ctx.scenes.go('main_menu');
  }
}

const POSE_LABEL: Record<Pose, string> = {
  idle: 'Parado',
  move: 'Andando',
  jump: 'Pulando',
  hurt: 'Sofrendo dano',
  fallen: 'Caído',
  dead: 'Morto',
  attack: 'Ataque',
  cast: 'Magia',
};
