import { Rng, Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { ATTRS, ATTR_LABEL, BIOMES, DB, ELEMENTS, RARITIES, creatureToEnemy, type CreatureDef, type CreatureSkill } from '../../data';
import { Audio } from '../../audio/audio';
import { blankCreature, hasLocalEdits, loadBestiary, resetBestiary, saveBestiary } from '../../bestiary/bestiary_store';
import { createEmptyMap, type BattleMap } from '../../battle/map';
import { clampLevel, unitFromEnemy } from '../../battle/units';
import type { BattleUnit } from '../../battle/types';
import { DevPanel } from '../../dev/dev_panel';
import { devPlayerUnits } from '../../dev/dev_squad';
import { BIOME_LABEL, generateMap } from '../../mapgen/generator';
import { drawBattle, unitSpec } from '../../render/battle_renderer';
import { IsoCamera } from '../../render/iso';
import { portraitCanvas } from '../../render/sprites';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';

const ELEMENT_LABEL: Record<string, string> = {
  neutro: 'Neutro',
  fogo: 'Fogo',
  agua: 'Água',
  gelo: 'Gelo',
  eletricidade: 'Eletricidade',
  vento: 'Vento',
  terra: 'Terra',
  veneno: 'Veneno',
  luz: 'Luz',
  sombra: 'Sombra',
};
const SKILL_KIND_LABEL: Record<CreatureSkill['kind'], string> = { physical: 'Ataque (alvo inimigo)', utility: 'Em si mesma', passive: 'Passiva' };
const EFFECT_LABEL: Record<string, string> = { '': 'nenhum', hide_in_snow: 'Esconder-se na neve (turnos)', snow_evasion: 'Esquiva na neve (+%)' };
const STATUS_OPTIONS = ['', 'cegado', 'molhado', 'queimando', 'congelado', 'eletrocutado', 'envenenado', 'enlameado'];

/** Bestiário editável: ficha à esquerda, prévia de combate e retrato à direita. */
export class BestiaryScene extends Scene {
  readonly id = 'bestiary';

  private list: CreatureDef[] = [];
  private index = 0;
  private dirty = false;
  private previewLevel = 1;
  private ui!: HTMLDivElement;
  private form!: HTMLDivElement;
  private side!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private statsBox!: HTMLDivElement;
  private portraitBox!: HTMLDivElement;
  private cam = new IsoCamera(360, 300);
  private previewMap!: BattleMap;
  private previewUnit: BattleUnit | null = null;
  private time = 0;

  protected override onEnter(): void {
    Audio.music('editor');
    this.list = loadBestiary();
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
    drawBattle(g, this.cam, this.previewMap, { units: [this.previewUnit], time: this.time, activeUid: this.previewUnit.uid });
  }

  // ───────────────────────────── ficha (esquerda) ─────────────────────────────

  private changed(): void {
    this.dirty = true;
    this.refreshPreview();
  }

  private renderForm(): void {
    const el = this.form;
    clear(el);
    const tabs = h('div', { class: 'row' });
    this.list.forEach((c, i) =>
      tabs.append(btn(c.name || '(sem nome)', () => ((this.index = i), (this.previewLevel = c.levelMin), this.renderForm()), { class: `small ${i === this.index ? 'active' : ''}` })),
    );
    tabs.append(
      btn('+ Nova criatura', () => {
        this.list.push(blankCreature(this.list.length + 1));
        this.index = this.list.length - 1;
        this.changed();
        this.renderForm();
      }, { class: 'small' }),
    );
    el.append(h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: '📖 Bestiário' }), h('span', { class: 'muted', text: hasLocalEdits() ? 'com edições locais' : 'versão do repositório' })), tabs);
    const c = this.current;
    if (!c) {
      el.append(h('p', { class: 'muted', text: 'Nenhuma criatura. Use “+ Nova criatura”.' }));
      this.refreshPreview();
      return;
    }
    this.previewLevel = Math.max(c.levelMin, Math.min(c.levelMax, this.previewLevel));

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
        ),
      ),
      section(
        'Balanceamento',
        h('div', { class: 'row', style: 'gap:6px' },
          num('Range de NV', c.levelMin, (v) => (c.levelMin = Math.max(1, Math.min(99, Math.round(v)))), { min: 1, max: 99 }),
          h('span', { text: 'até' }),
          (() => {
            const i = h('input', { type: 'number', value: String(c.levelMax) });
            i.style.width = '72px';
            i.addEventListener('input', () => {
              c.levelMax = Math.max(c.levelMin, Math.min(99, Math.round(Number(i.value) || c.levelMin)));
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
      this.skillsSection(c, section, text, num, select),
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

  private skillsSection(
    c: CreatureDef,
    section: (title: string, ...rows: (Node | null)[]) => HTMLElement,
    text: (label: string, value: string, set: (v: string) => void, area?: boolean) => HTMLElement,
    num: (label: string, value: number, set: (v: number) => void, opts?: { min?: number; max?: number; step?: number; suffix?: string }) => HTMLElement,
    select: (label: string, value: string, options: [string, string][], set: (v: string) => void) => HTMLElement,
  ): HTMLElement {
    const cards = c.skills.map((s, i) =>
      h(
        'div',
        { class: 'item col', style: 'cursor:default' },
        text('Nome', s.name, (v) => (s.name = v)),
        text('Descrição', s.description, (v) => (s.description = v), true),
        select('Tipo', s.kind, Object.entries(SKILL_KIND_LABEL), (v) => (s.kind = v as CreatureSkill['kind'])),
        h('div', { class: 'row', style: 'gap:10px' },
          num('Alcance', s.range, (v) => (s.range = Math.max(0, Math.round(v))), { min: 0, suffix: 'm' }),
          num('Poder', s.power, (v) => (s.power = Math.max(0, Math.round(v))), { min: 0 }),
          num('Recarga', s.cooldown, (v) => (s.cooldown = Math.max(0, Math.round(v))), { min: 0, suffix: 'turnos' }),
        ),
        select('Efeito especial', s.effect ?? '', Object.entries(EFFECT_LABEL), (v) => (s.effect = (v || undefined) as CreatureSkill['effect'])),
        s.effect ? num('Valor do efeito', s.value ?? 0, (v) => (s.value = Math.round(v))) : null,
        h('div', { class: 'row', style: 'gap:10px' },
          select('Status no alvo', s.status?.id ?? '', STATUS_OPTIONS.map((x) => [x, x || 'nenhum']), (v) => (s.status = v ? { id: v, turns: s.status?.turns ?? 2 } : undefined)),
          s.status ? num('Duração', s.status.turns, (v) => (s.status!.turns = Math.max(1, Math.round(v))), { min: 1, suffix: 'turnos' }) : null,
        ),
        btn('Remover habilidade', () => {
          c.skills.splice(i, 1);
          this.changed();
          this.renderForm();
        }, { class: 'small danger' }),
      ),
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
    return section(
      'Aparência (pixel art)',
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

  private refreshPreview(): void {
    const c = this.current;
    clear(this.portraitBox);
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
      h('div', { style: `color:${RARITY_COLOR[c.rarity]}`, text: `${RARITY_LABEL[c.rarity]} · ${ELEMENT_LABEL[c.element]} · ${c.biomes.map((b) => BIOME_LABEL[b]).join(', ') || 'sem bioma'}` }),
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
        enemies: [0, 1, 2].map(() => unitFromEnemy(def, level, rng)),
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
