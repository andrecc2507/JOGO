import { Rng, Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { DB, type Biome } from '../../data';
import { unitFromEnemy } from '../../battle/units';
import { CLOUDS, GROUP_LABEL, MAX_HEIGHT, PERMANENT, PROPS, SURFACES, TERRAIN, cloneMap, createEmptyMap, idx, inBounds, isFlammable, isWalkable, type BattleMap, type Cloud, type MapGroup, type Prop, type Spawn, type Surface, type Terrain } from '../../battle/map';
import { MapHistory, floodTerrain, rectTiles } from '../../mapgen/edit_ops';
import { STRUCTURES, stamp, toggleDoorway, toggleWindows, type StructureId } from '../../mapgen/structures';
import { HEADROOM, MAX_BUILD_HEIGHT, STOREY, columnTop, topLevel } from '../../battle/stack';
import { THEMES, generateTheme, type ThemeId } from '../../mapgen/themes';
import { DevPanel } from '../../dev/dev_panel';
import { Audio } from '../../audio/audio';
import { devPlayerUnits } from '../../dev/dev_squad';
import { BIOME_LABEL, ensureConnected, generateMap, markSpawns, mapConnected } from '../../mapgen/generator';
import { deleteMap, exportMap, isBattleMap, loadMaps, saveMap } from '../../mapgen/maps_store';
import { drawBattle } from '../../render/battle_renderer';
import { IsoCamera } from '../../render/iso';
import { CanvasPointer } from '../../render/pointer';
import { store } from '../../state/store';
import { planEncounter } from '../../world/encounters';

type Tool = 'terrain' | 'prop' | 'structure' | 'piece' | 'unpiece' | 'window' | 'ladder' | 'raise' | 'lower' | 'level' | 'surface' | 'cloud' | 'spawn' | 'door' | 'fill' | 'pick' | 'erase';

const TOOL_LABEL: Record<Tool, string> = {
  terrain: '🟩 Terreno',
  prop: '🌲 Objeto',
  structure: '🏠 Estrutura',
  piece: '🧱 Empilhar peça',
  unpiece: '⛏ Tirar peça',
  window: '🪟 Janela',
  ladder: '🪜 Escada',
  raise: '⬆ Subir',
  lower: '⬇ Descer',
  level: '📏 Nivelar',
  surface: '💧 Superfície',
  cloud: '☁ Nuvem',
  spawn: '🚩 Spawn',
  door: '🚪 Porta',
  fill: '🪣 Balde',
  pick: '💉 Conta-gotas',
  erase: '🧽 Borracha',
};

/** Ferramentas que aceitam o modo retângulo. */
const RECT_TOOLS = new Set<Tool>(['terrain', 'prop', 'level', 'surface', 'cloud', 'erase', 'raise', 'lower', 'piece', 'unpiece']);
const GROUPS = Object.keys(GROUP_LABEL) as MapGroup[];

/** Editor de mapas de batalha: pinta tile a tile terreno, altura, objetos, superfícies e spawns. */
export class MapEditorScene extends Scene {
  readonly id = 'map_editor';
  protected override readonly systems = ['debug_overlay'];

  private map!: BattleMap;
  private cam = new IsoCamera(960, 540);
  private pointer!: CanvasPointer;
  private ui!: HTMLDivElement;
  private toolbar!: HTMLDivElement;
  private meta!: HTMLDivElement;
  private info!: HTMLDivElement;
  private tool: Tool = 'terrain';
  private terrain: Terrain = 'grama';
  private prop: Prop = 'arvore';
  private surface: Surface = 'agua';
  private cloud: Cloud = 'fumaca';
  private spawn: Spawn = 'player';
  private levelValue = 2;
  private brush = 0;
  private structure: StructureId = 'casa_vila';
  private structW = STRUCTURES.casa_vila.w;
  private structH = STRUCTURES.casa_vila.h;
  private structFloors = STRUCTURES.casa_vila.floors?.def ?? 1;
  /** Altura de cada peça empilhada (1 = laje, 3 = um andar de parede). */
  private pieceH = 3;
  /** Corte de andar: esconde peças desta altura para cima (ver dentro dos prédios); null = tudo. */
  private cut: number | null = null;
  private theme: ThemeId = 'vila';
  /** Pincel ou retângulo (arrastar de um canto ao outro). */
  private shape: 'brush' | 'rect' = 'brush';
  private rectStart: [number, number] | null = null;
  /** Objetos: chance por tile do pincel (espalhar decoração). */
  private scatter = 100;
  private search = '';
  private history = new MapHistory();
  private wasDown = false;
  private keyHandler = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) this.undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) this.redo();
    else return;
    e.preventDefault();
  };
  private hover: [number, number] | null = null;
  private lastPainted = -1;
  private time = 0;
  private showSpawns = true;

  protected override onEnter(): void {
    Audio.music('editor');
    this.map = store.editorMap ?? generateMap({ biome: 'floresta', seed: 1 });
    store.editorMap = this.map;
    this.pointer = new CanvasPointer(this.ctx.renderer);
    this.fitZoom();
    this.ui = layer('editor-ui');
    this.toolbar = h('div', { class: 'panel', style: 'left:8px;top:8px;width:230px;max-height:calc(100vh - 16px);overflow:auto' });
    this.meta = h('div', { class: 'panel', style: 'right:8px;top:8px;width:250px;max-height:calc(100vh - 60px);overflow:auto' });
    this.info = h('div', { class: 'panel', style: 'left:50%;bottom:8px;transform:translateX(-50%);font-size:12px' });
    this.ui.append(this.toolbar, this.meta, this.info);
    this.renderToolbar();
    this.renderMeta();
    window.addEventListener('keydown', this.keyHandler);
    DevPanel.setGroups([
      {
        title: 'Editor',
        actions: [
          { label: 'Validar caminho', run: () => this.validate() },
          { label: 'Corrigir caminho', run: () => (ensureConnected(this.map), toast('Corredor aberto se necessário.')) },
          { label: 'Remarcar spawns', run: () => markSpawns(this.map) },
        ],
      },
    ]);
  }

  protected override onExit(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.pointer.dispose();
    this.ui.remove();
    DevPanel.setGroups([]);
  }

  private fitZoom(): void {
    this.cam.zoom = Math.min(1.4, 13 / Math.max(this.map.w, this.map.h));
    this.cam.panX = 0;
    this.cam.panY = 0;
  }

  protected override onUpdate(dt: number): void {
    this.time += dt;
    const { input } = this.ctx;
    if (input.justPressed('rotate_left')) this.cam.rotate(-1);
    if (input.justPressed('rotate_right')) this.cam.rotate(1);
    const wheel = this.pointer.takeWheel();
    if (wheel) this.cam.zoom = Math.max(0.4, Math.min(2.5, this.cam.zoom * (wheel > 0 ? 0.9 : 1.1)));
    const [dx, dy] = this.pointer.takeDrag();
    this.cam.panX += dx;
    this.cam.panY += dy;
    if (input.justPressed('floor_up')) this.setCut(this.cut === null ? null : this.cut + STOREY);
    if (input.justPressed('floor_down')) this.setCut(this.cut === null ? 1 + HEADROOM + 6 * STOREY : Math.max(HEADROOM, this.cut - STOREY));
    this.hover = this.pointer.inside ? this.cam.pick(this.map, this.pointer.x, this.pointer.y, this.cut ?? undefined) : null;
    const clicks = this.pointer.takeClicks().filter((c) => c.button === 0);
    const down = this.pointer.leftDown;
    const prevDown = this.wasDown;
    const pressed = down && !prevDown;
    const released = !down && prevDown;
    this.wasDown = down;
    const rect = this.shape === 'rect' && RECT_TOOLS.has(this.tool);
    const single = this.tool === 'structure' || this.tool === 'fill' || this.tool === 'pick' || this.tool === 'door' || this.tool === 'window' || this.tool === 'ladder';
    if (rect) {
      if (pressed && this.hover) this.rectStart = this.hover;
      if (released && this.rectStart && this.hover) {
        this.history.record(this.map);
        for (const [x, y] of rectTiles(this.map, this.rectStart, this.hover)) this.paintTile(x, y);
        this.rectStart = null;
      } else if (released) this.rectStart = null;
    } else if (this.hover) {
      const i = idx(this.map, this.hover[0], this.hover[1]);
      // Um registro no histórico por traço (do apertar ao soltar); o conta-gotas não muda o mapa.
      // (Clique rápido, apertado e solto no mesmo quadro, também conta.)
      if ((pressed || (clicks.length && !prevDown && !down)) && this.tool !== 'pick') this.history.record(this.map);
      const dragTool = !single && this.tool !== 'raise' && this.tool !== 'lower';
      if (clicks.length && (single || !dragTool)) {
        this.paint(this.hover[0], this.hover[1]);
        this.lastPainted = i;
      } else if (dragTool && (down || clicks.length) && i !== this.lastPainted) {
        this.paint(this.hover[0], this.hover[1]);
        this.lastPainted = i;
      }
    }
    if (!down) this.lastPainted = -1;
    this.renderInfo();
  }

  protected override onRender(): void {
    const area = new Set<number>();
    if (this.hover) {
      const tiles = this.rectStart ? rectTiles(this.map, this.rectStart, this.hover) : this.tool === 'structure' ? rectTiles(this.map, this.hover, [this.hover[0] + this.structW - 1, this.hover[1] + this.structH - 1]) : this.tool === 'fill' || this.tool === 'pick' || this.tool === 'door' || this.tool === 'window' || this.tool === 'ladder' ? [this.hover] : this.brushTiles(this.hover[0], this.hover[1]);
      for (const [x, y] of tiles) area.add(idx(this.map, x, y));
    }
    // Destaque no topo visível de cada coluna (acima do corte, as peças somem).
    const shown = (i: number) => {
      const t = this.map.tiles[i]!;
      let l = topLevel(t);
      while (l > 0 && this.cut !== null && t.up![l - 1]!.b >= this.cut) l--;
      return i + l * this.map.tiles.length;
    };
    drawBattle(this.ctx.renderer.ctx, this.cam, this.map, { hover: this.hover, time: this.time, showSpawns: this.showSpawns, cut: this.cut ?? undefined, highlights: new Map([...area].map((i) => [shown(i), 'rgba(255,255,120,0.25)'])) });
  }

  private brushTiles(cx: number, cy: number): [number, number][] {
    const out: [number, number][] = [];
    const r = this.brush;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(this.map, cx + dx, cy + dy)) out.push([cx + dx, cy + dy]);
    return out;
  }

  private paint(cx: number, cy: number): void {
    switch (this.tool) {
      case 'structure':
        stamp(this.map, this.structure, cx, cy, this.structW, this.structH, this.structFloors);
        return;
      case 'window': {
        const t = this.map.tiles[idx(this.map, cx, cy)]!;
        if (!toggleWindows(t)) toast('Janela vai numa parede de peças (casas, torres, prédios).');
        return;
      }
      case 'ladder': {
        const t = this.map.tiles[idx(this.map, cx, cy)]!;
        t.ladder = !t.ladder;
        if (!t.ladder) delete t.ladder;
        return;
      }
      case 'fill':
        floodTerrain(this.map, cx, cy, this.terrain);
        return;
      case 'pick': {
        const t = this.map.tiles[idx(this.map, cx, cy)]!;
        this.terrain = t.t;
        this.levelValue = t.h;
        if (t.p) this.prop = t.p;
        toast(`Conta-gotas: ${TERRAIN[t.t].name}${t.p ? ` + ${PROPS[t.p].name}` : ''} · altura ${t.h}`);
        this.tool = t.p ? 'prop' : 'terrain';
        this.renderToolbar();
        return;
      }
      case 'door': {
        toggleDoorway(this.map.tiles[idx(this.map, cx, cy)]!);
        return;
      }
      default:
        for (const [x, y] of this.brushTiles(cx, cy)) this.paintTile(x, y);
    }
  }

  private paintTile(x: number, y: number): void {
    const t = this.map.tiles[idx(this.map, x, y)]!;
    switch (this.tool) {
      case 'terrain':
        t.t = this.terrain;
        if (!TERRAIN[this.terrain].walkable) {
          t.p = null;
          t.spawn = null;
        }
        break;
      case 'piece': {
        // Empilha uma peça do terreno escolhido no topo da coluna (parede, laje, telhado).
        const top = columnTop(t);
        if (top + this.pieceH > MAX_BUILD_HEIGHT) break;
        (t.up ??= []).push({ b: top, h: top + this.pieceH, t: this.terrain });
        break;
      }
      case 'unpiece':
        t.up?.pop();
        if (t.up && !t.up.length) delete t.up;
        break;
      case 'raise':
        t.h = Math.min(MAX_HEIGHT, t.h + 1);
        break;
      case 'lower':
        t.h = Math.max(0, t.h - 1);
        break;
      case 'level':
        t.h = this.levelValue;
        break;
      case 'prop':
        // Espalhar: só uma parte dos tiles do pincel ganha o objeto.
        if (this.scatter >= 100 || Math.random() * 100 < this.scatter) t.p = this.prop;
        break;
      case 'surface':
        t.s = this.surface;
        t.sTtl = PERMANENT;
        break;
      case 'cloud':
        t.c = this.cloud;
        t.cTtl = PERMANENT;
        break;
      case 'spawn':
        t.spawn = this.spawn;
        break;
      case 'erase':
        t.p = null;
        t.s = null;
        t.c = null;
        t.spawn = null;
        delete t.door;
        break;
      default:
        break;
    }
  }

  /** Corte de andar do editor (PageUp/PageDown); null = tudo à mostra. */
  private setCut(v: number | null): void {
    this.cut = v === null || v > MAX_BUILD_HEIGHT ? null : v;
    toast(this.cut === null ? 'Corte de andar: tudo à mostra' : `Corte de andar: altura ${this.cut}`);
  }

  private undo(): void {
    if (this.history.undo(this.map)) toast('↶ Desfeito.');
  }

  private redo(): void {
    if (this.history.redo(this.map)) toast('↷ Refeito.');
  }

  // ───────────────────────────── UI ─────────────────────────────

  private renderToolbar(): void {
    const el = this.toolbar;
    clear(el);
    el.append(
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h3', { text: 'Ferramentas' }),
        h('span', { class: 'row', style: 'gap:4px' },
          btn('↶', () => this.undo(), { class: 'small', title: 'Desfazer (Ctrl+Z)' }),
          btn('↷', () => this.redo(), { class: 'small', title: 'Refazer (Ctrl+Y)' }),
        ),
      ),
    );
    const tools = h('div', { class: 'row', style: 'flex-wrap:wrap' });
    for (const t of Object.keys(TOOL_LABEL) as Tool[]) tools.append(btn(TOOL_LABEL[t], () => ((this.tool = t), this.renderToolbar()), { class: `small ${this.tool === t ? 'active' : ''}` }));
    el.append(tools);
    if (RECT_TOOLS.has(this.tool)) {
      const brush = h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('span', { class: 'muted', text: 'Pincel:' }));
      for (const b of [0, 1, 2, 3]) brush.append(btn(`${b * 2 + 1}×${b * 2 + 1}`, () => ((this.brush = b), (this.shape = 'brush'), this.renderToolbar()), { class: `small ${this.shape === 'brush' && this.brush === b ? 'active' : ''}` }));
      brush.append(btn('▭ Retângulo', () => ((this.shape = 'rect'), this.renderToolbar()), { class: `small ${this.shape === 'rect' ? 'active' : ''}`, title: 'Arraste de um canto ao outro.' }));
      el.append(brush);
    }
    if (this.tool === 'terrain' || this.tool === 'prop' || this.tool === 'fill') {
      const search = h('input', { placeholder: 'Buscar…', value: this.search, style: 'width:100%;margin-top:4px' }) as HTMLInputElement;
      search.addEventListener('input', () => {
        this.search = search.value;
        this.renderToolbar();
        const again = this.toolbar.querySelector('input[placeholder="Buscar…"]') as HTMLInputElement | null;
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      });
      el.append(search);
    }
    const matches = (name: string) => !this.search || name.toLowerCase().includes(this.search.toLowerCase());
    const palette = h('div', { class: 'col', style: 'margin-top:6px' });
    const option = (active: boolean, label: string, color: string | null, pick: () => void) =>
      h('div', { class: `item row ${active ? 'selected' : ''}`, onClick: () => (pick(), this.renderToolbar()) }, color ? h('span', { class: 'swatch', style: `background:${color}` }) : null, h('span', { text: label }));
    switch (this.tool) {
      case 'terrain':
      case 'fill':
        for (const g of GROUPS) {
          const list = Object.entries(TERRAIN).filter(([, v]) => v.group === g && matches(v.name));
          if (!list.length) continue;
          palette.append(h('div', { class: 'gold', style: 'font-size:12px;margin-top:4px', text: GROUP_LABEL[g] }));
          for (const [k, v] of list) palette.append(option(this.terrain === k, `${v.name}${v.flammable ? ' 🔥' : ''}${v.walkable ? '' : ' ⛔'}${v.light ? ' ✨' : ''}`, v.color, () => (this.terrain = k as Terrain)));
        }
        if (this.tool === 'fill') palette.prepend(h('div', { class: 'muted', style: 'font-size:11px', text: 'Pinta a região contígua do mesmo terreno e altura.' }));
        break;
      case 'prop': {
        const sc = h('label', { class: 'row', style: 'gap:6px' }, h('span', { class: 'muted', text: 'Espalhar' }));
        const range = h('input', { type: 'range', value: String(this.scatter) }) as HTMLInputElement;
        range.min = '5';
        range.max = '100';
        range.addEventListener('input', () => (this.scatter = Number(range.value)));
        range.addEventListener('change', () => this.renderToolbar());
        sc.append(range, h('span', { class: 'muted', text: `${this.scatter}%` }));
        palette.append(sc);
        for (const g of GROUPS) {
          const list = Object.entries(PROPS).filter(([, v]) => v.group === g && matches(v.name));
          if (!list.length) continue;
          palette.append(h('div', { class: 'gold', style: 'font-size:12px;margin-top:4px', text: GROUP_LABEL[g] }));
          for (const [k, v] of list)
            palette.append(option(this.prop === k, `${v.name}${v.blocksMove ? ' ⛔' : ''}${v.blocksLos ? ' 👁' : ''}${v.flammable ? ' 🔥' : ''}${v.light ? ' ✨' : ''}`, v.color, () => (this.prop = k as Prop)));
        }
        break;
      }
      case 'structure': {
        for (const [k, v] of Object.entries(STRUCTURES))
          palette.append(
            option(this.structure === k, v.name, null, () => {
              this.structure = k as StructureId;
              this.structW = v.w;
              this.structH = v.h;
              this.structFloors = v.floors?.def ?? 1;
            }),
          );
        const def = STRUCTURES[this.structure];
        const num = (val: number, set: (n: number) => void) => {
          const i = h('input', { type: 'number', value: String(val), style: 'width:52px' }) as HTMLInputElement;
          i.addEventListener('change', () => set(Math.max(def.min, Math.min(def.max, Number(i.value) || val))));
          return i;
        };
        palette.append(
          h('div', { class: 'muted', style: 'font-size:11px;margin-top:4px', text: def.hint }),
          h('div', { class: 'row', style: 'gap:4px' }, h('span', { text: 'Tamanho' }), num(this.structW, (n) => (this.structW = n)), h('span', { text: '×' }), num(this.structH, (n) => (this.structH = n))),
          ...(def.floors
            ? [
                h(
                  'div',
                  { class: 'row', style: 'gap:4px' },
                  h('span', { text: 'Andares' }),
                  (() => {
                    const i = h('input', { type: 'number', value: String(this.structFloors), style: 'width:52px' }) as HTMLInputElement;
                    i.addEventListener('change', () => (this.structFloors = Math.max(1, Math.min(def.floors!.max, Number(i.value) || 1))));
                    return i;
                  })(),
                  h('span', { class: 'muted', text: `(1–${def.floors.max})` }),
                ),
              ]
            : []),
          h('div', { class: 'muted', style: 'font-size:11px', text: 'Clique no canto de cima-esquerda. Casas são ocas: porta na frente, janelas, escada interna até o telhado. PageUp/PageDown cortam os andares para ver dentro.' }),
        );
        break;
      }
      case 'door':
        palette.append(h('div', { class: 'muted', text: 'Clique numa parede de peças: abre o vão no térreo e põe/tira a porta (abre e fecha na batalha). Em bloco maciço, só o desenho.' }));
        break;
      case 'window':
        palette.append(h('div', { class: 'muted', text: 'Clique numa parede de peças: abre (ou fecha) uma janela em cada andar. Dá para atirar pela janela, não para passar.' }));
        break;
      case 'ladder':
        palette.append(h('div', { class: 'muted', text: 'Escada encostada: sobe/desce desta coluna sem limite de salto (até o telhado vizinho) e liga os andares por dentro (alçapão).' }));
        break;
      case 'unpiece':
        palette.append(h('div', { class: 'muted', text: 'Tira a peça de cima da coluna (telhado, laje, parede).' }));
        break;
      case 'piece': {
        palette.append(
          h('div', { class: 'muted', text: 'Empilha uma peça do terreno escolhido (na aba Terreno) no topo da coluna.' }),
          h('div', { class: 'row', style: 'gap:4px' }, ...[1, 2, 3].map((n) => btn(n === 3 ? '3 (andar)' : n === 1 ? '1 (laje)' : '2', () => ((this.pieceH = n), this.renderToolbar()), { class: `small ${this.pieceH === n ? 'active' : ''}` }))),
          h('div', { class: 'muted', text: `Terreno: ${TERRAIN[this.terrain].name}` }),
        );
        break;
      }
      case 'pick':
        palette.append(h('div', { class: 'muted', text: 'Clique num tile para copiar terreno, altura e objeto.' }));
        break;
      case 'surface':
        for (const [k, v] of Object.entries(SURFACES)) palette.append(option(this.surface === k, v.name, v.color, () => (this.surface = k as Surface)));
        break;
      case 'cloud':
        for (const [k, v] of Object.entries(CLOUDS)) palette.append(option(this.cloud === k, `${v.name}${v.obscures ? ' 🌫' : ''}`, v.color, () => (this.cloud = k as Cloud)));
        break;
      case 'spawn':
        for (const [k, label, color] of [
          ['player', 'Jogador', '#4fc3f7'],
          ['enemy', 'Inimigo', '#ef5350'],
          ['extract', 'Zona de fuga', '#81c784'],
        ] as const)
          palette.append(option(this.spawn === k, label, color, () => (this.spawn = k)));
        break;
      case 'level': {
        const row = h('div', { class: 'row' }, h('span', { text: 'Altura:' }));
        for (let i = 0; i <= MAX_HEIGHT; i++) row.append(btn(String(i), () => ((this.levelValue = i), this.renderToolbar()), { class: `small ${this.levelValue === i ? 'active' : ''}` }));
        palette.append(row);
        break;
      }
      default:
        palette.append(h('div', { class: 'muted', text: this.tool === 'erase' ? 'Remove objeto, superfície, nuvem, porta e spawn.' : 'Clique nos tiles para alterar a altura.' }));
    }
    el.append(palette);
    el.append(h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px', text: '⛔ bloqueia movimento · 👁 bloqueia visão · 🔥 inflamável · ✨ brilha à noite. Q/E gira, roda dá zoom, botão direito arrastando move a câmera. Ctrl+Z / Ctrl+Y desfazem e refazem.' }));
    const toggle = h('label', { class: 'row' }, h('input', { type: 'checkbox' }), h('span', { text: 'Mostrar spawns' }));
    const cb = toggle.querySelector('input')!;
    cb.checked = this.showSpawns;
    cb.addEventListener('change', () => (this.showSpawns = cb.checked));
    el.append(toggle);
  }

  private renderMeta(): void {
    const el = this.meta;
    clear(el);
    const m = this.map;
    const name = h('input', { value: m.name });
    name.addEventListener('change', () => (m.name = name.value));
    const biome = h('select', {});
    for (const b of Object.keys(BIOME_LABEL)) biome.append(h('option', { value: b, text: BIOME_LABEL[b as Biome] }));
    biome.value = m.biome;
    biome.addEventListener('change', () => (m.biome = biome.value as Biome));
    const w = h('input', { type: 'number', value: String(m.w) });
    const hh = h('input', { type: 'number', value: String(m.h) });
    const seed = h('input', { type: 'number', value: String(Math.floor(Math.random() * 99999)) });
    for (const i of [w, hh, seed]) i.style.width = '64px';
    const themeSel = h('select', {}) as HTMLSelectElement;
    for (const [k, v] of Object.entries(THEMES)) themeSel.append(h('option', { value: k, text: v.name }));
    themeSel.value = this.theme;
    themeSel.addEventListener('change', () => {
      this.theme = themeSel.value as ThemeId;
      this.renderMeta();
    });
    const size = () => [Math.max(6, Math.min(24, Number(w.value) || 14)), Math.max(6, Math.min(24, Number(hh.value) || 14))] as const;
    el.append(
      h('h3', { text: 'Mapa' }),
      h('div', { class: 'col' },
        h('div', { class: 'row' }, h('span', { text: 'Nome' }), name),
        h('div', { class: 'row' }, h('span', { text: 'Bioma' }), biome),
        h('div', { class: 'row' }, h('span', { text: 'Tamanho' }), w, h('span', { text: '×' }), hh),
        btn('Novo mapa vazio', () => {
          const [W, H] = size();
          this.setMap(createEmptyMap(W, H, m.biome));
        }),
        h('div', { class: 'row' }, h('span', { text: 'Semente' }), seed),
        btn('🎲 Gerar pelo bioma', () => {
          const [W, H] = size();
          this.setMap(generateMap({ biome: biome.value as Biome, w: W, h: H, seed: Number(seed.value) || 1 }));
        }, { class: 'primary' }),
        h('h3', { style: 'margin-top:6px', text: 'Cenários da história' }),
        themeSel,
        h('div', { class: 'muted', style: 'font-size:11px', text: THEMES[this.theme].hint }),
        btn('🏗 Gerar cenário', () => {
          const [W, H] = size();
          this.setMap(generateTheme(this.theme, W, H, Number(seed.value) || 1));
        }, { class: 'primary' }),
        btn('💾 Salvar no navegador', () => {
          saveMap(cloneMap(this.map));
          toast('Mapa salvo.');
          this.renderMeta();
        }),
        btn('⬇ Exportar JSON', () => exportMap(this.map)),
        btn('⬆ Importar JSON', () => this.importJson()),
        btn('⚔ Testar batalha neste mapa', () => this.testBattle(), { class: 'primary' }),
        btn('↩ Menu principal', () => this.ctx.scenes.go('main_menu')),
        store.campaign ? btn('🗺 Voltar ao mapa-mundo', () => this.ctx.scenes.go('world_map')) : null,
      ),
    );
    const saved = Object.values(loadMaps());
    el.append(h('h3', { style: 'margin-top:8px', text: `Mapas salvos (${saved.length})` }));
    for (const s of saved)
      el.append(
        h('div', { class: 'item row', style: 'justify-content:space-between' },
          h('span', { text: `${s.name} (${s.w}×${s.h})` }),
          h('span', {}, btn('Abrir', () => this.setMap(cloneMap(s)), { class: 'small' }), btn('✕', () => (deleteMap(s.id), this.renderMeta()), { class: 'small danger' })),
        ),
      );
  }

  private setMap(map: BattleMap): void {
    this.history.clear();
    this.map = map;
    store.editorMap = map;
    this.fitZoom();
    this.renderMeta();
  }

  private renderInfo(): void {
    const el = this.info;
    const key = this.hover ? `${this.hover[0]},${this.hover[1]},${JSON.stringify(this.map.tiles[idx(this.map, this.hover[0], this.hover[1])])}` : `none:${this.map.name}:${this.map.w}x${this.map.h}:${this.map.biome}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    clear(el);
    if (!this.hover) {
      el.append(h('span', { class: 'muted', text: `${this.map.name} · ${this.map.w}×${this.map.h} · ${BIOME_LABEL[this.map.biome]}` }));
      return;
    }
    const [x, y] = this.hover;
    const t = this.map.tiles[idx(this.map, x, y)]!;
    const parts = [
      `(${x}, ${y})`,
      `altura ${t.h}`,
      TERRAIN[t.t].name,
      t.p ? PROPS[t.p].name : null,
      t.s ? SURFACES[t.s].name : null,
      t.c ? CLOUDS[t.c].name : null,
      t.spawn ? `spawn: ${t.spawn}` : null,
      t.door ? 'porta' : null,
      t.up?.length ? `${t.up.length} peça(s), topo ${columnTop(t)}` : null,
      t.ladder ? 'escada' : null,
      isWalkable(t) ? 'caminhável' : 'bloqueado',
      isFlammable(t) ? 'inflamável' : null,
    ].filter(Boolean);
    el.append(h('span', { text: parts.join(' · ') }));
  }

  private validate(): void {
    const a = this.map.tiles.findIndex((t) => t.spawn === 'player');
    const b = this.map.tiles.findIndex((t) => t.spawn === 'enemy');
    if (a < 0 || b < 0) return toast('Marque spawns de jogador e inimigo.');
    toast(mapConnected(this.map, a, b) ? '✔ Existe caminho entre os spawns (salto 1).' : '✖ Sem caminho entre os spawns!');
  }

  private importJson(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!isBattleMap(data)) throw new Error('formato inválido');
        this.setMap(data);
        toast('Mapa importado.');
      } catch (e) {
        toast(`Falha ao importar: ${(e as Error).message}`);
      }
    });
    input.click();
  }

  private testBattle(): void {
    const rng = new Rng(Date.now() % 1e9);
    const level = 5;
    const plan = planEncounter(rng, this.map.biome, level, 'comum');
    this.ctx.scenes.go('battle', {
      setup: {
        map: cloneMap(this.map),
        players: devPlayerUnits(level),
        enemies: plan.enemies.map((e) => unitFromEnemy(DB.enemies[e.id]!, e.level, rng)),
        victory: { type: 'eliminate' },
        ambush: false,
        canFlee: true,
        seed: rng.int(1, 1e9),
        context: { kind: 'editor', baseXp: 0, gold: 0, itemDrops: [], title: `Teste de mapa: ${this.map.name}` },
      },
      returnTo: 'map_editor',
    });
  }
}
