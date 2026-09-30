import { Rng, Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { DB, type Biome } from '../../data';
import { unitFromEnemy } from '../../battle/units';
import { CLOUDS, MAX_HEIGHT, PERMANENT, PROPS, SURFACES, TERRAIN, cloneMap, createEmptyMap, idx, inBounds, isFlammable, isWalkable, type BattleMap, type Cloud, type Prop, type Spawn, type Surface, type Terrain } from '../../battle/map';
import { DevPanel } from '../../dev/dev_panel';
import { devPlayerUnits } from '../../dev/dev_squad';
import { BIOME_LABEL, ensureConnected, generateMap, markSpawns, mapConnected } from '../../mapgen/generator';
import { deleteMap, exportMap, isBattleMap, loadMaps, saveMap } from '../../mapgen/maps_store';
import { drawBattle } from '../../render/battle_renderer';
import { IsoCamera } from '../../render/iso';
import { CanvasPointer } from '../../render/pointer';
import { store } from '../../state/store';
import { planEncounter } from '../../world/encounters';

type Tool = 'terrain' | 'raise' | 'lower' | 'level' | 'prop' | 'surface' | 'cloud' | 'spawn' | 'erase';

const TOOL_LABEL: Record<Tool, string> = {
  terrain: '🟩 Terreno',
  raise: '⬆ Subir',
  lower: '⬇ Descer',
  level: '📏 Nivelar',
  prop: '🌲 Objeto',
  surface: '💧 Superfície',
  cloud: '☁ Nuvem',
  spawn: '🚩 Spawn',
  erase: '🧽 Borracha',
};

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
  private hover: [number, number] | null = null;
  private lastPainted = -1;
  private time = 0;
  private showSpawns = true;

  protected override onEnter(): void {
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
    this.hover = this.pointer.inside ? this.cam.pick(this.map, this.pointer.x, this.pointer.y) : null;
    const clicks = this.pointer.takeClicks().filter((c) => c.button === 0);
    const dragTool = this.tool !== 'raise' && this.tool !== 'lower';
    if (this.hover) {
      const i = idx(this.map, this.hover[0], this.hover[1]);
      if (clicks.length) {
        this.paint(this.hover[0], this.hover[1]);
        this.lastPainted = i;
      } else if (dragTool && this.pointer.leftDown && i !== this.lastPainted) {
        this.paint(this.hover[0], this.hover[1]);
        this.lastPainted = i;
      }
    }
    if (!this.pointer.leftDown) this.lastPainted = -1;
    this.renderInfo();
  }

  protected override onRender(): void {
    const area = new Set<number>();
    if (this.hover) for (const [x, y] of this.brushTiles(this.hover[0], this.hover[1])) area.add(idx(this.map, x, y));
    drawBattle(this.ctx.renderer.ctx, this.cam, this.map, { hover: this.hover, time: this.time, showSpawns: this.showSpawns, highlights: new Map([...area].map((i) => [i, 'rgba(255,255,120,0.25)'])) });
  }

  private brushTiles(cx: number, cy: number): [number, number][] {
    const out: [number, number][] = [];
    const r = this.brush;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(this.map, cx + dx, cy + dy)) out.push([cx + dx, cy + dy]);
    return out;
  }

  private paint(cx: number, cy: number): void {
    for (const [x, y] of this.brushTiles(cx, cy)) {
      const t = this.map.tiles[idx(this.map, x, y)]!;
      switch (this.tool) {
        case 'terrain':
          t.t = this.terrain;
          if (this.terrain === 'agua_funda') {
            t.p = null;
            t.spawn = null;
          }
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
          t.p = this.prop;
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
          break;
      }
    }
  }

  // ───────────────────────────── UI ─────────────────────────────

  private renderToolbar(): void {
    const el = this.toolbar;
    clear(el);
    el.append(h('h3', { text: 'Ferramentas' }));
    const tools = h('div', { class: 'row' });
    for (const t of Object.keys(TOOL_LABEL) as Tool[]) tools.append(btn(TOOL_LABEL[t], () => ((this.tool = t), this.renderToolbar()), { class: `small ${this.tool === t ? 'active' : ''}` }));
    el.append(tools);
    const brush = h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Pincel:' }));
    for (const b of [0, 1, 2]) brush.append(btn(`${b * 2 + 1}×${b * 2 + 1}`, () => ((this.brush = b), this.renderToolbar()), { class: `small ${this.brush === b ? 'active' : ''}` }));
    el.append(brush);
    const palette = h('div', { class: 'col', style: 'margin-top:6px' });
    const option = (active: boolean, label: string, color: string | null, pick: () => void) =>
      h('div', { class: `item row ${active ? 'selected' : ''}`, onClick: () => (pick(), this.renderToolbar()) }, color ? h('span', { class: 'swatch', style: `background:${color}` }) : null, h('span', { text: label }));
    switch (this.tool) {
      case 'terrain':
        for (const [k, v] of Object.entries(TERRAIN)) palette.append(option(this.terrain === k, `${v.name}${v.flammable ? ' 🔥' : ''}${v.walkable ? '' : ' ⛔'}`, v.color, () => (this.terrain = k as Terrain)));
        break;
      case 'prop':
        for (const [k, v] of Object.entries(PROPS))
          palette.append(option(this.prop === k, `${v.name}${v.blocksMove ? ' ⛔' : ''}${v.blocksLos ? ' 👁' : ''}${v.flammable ? ' 🔥' : ''}`, v.color, () => (this.prop = k as Prop)));
        break;
      case 'surface':
        for (const [k, v] of Object.entries(SURFACES)) palette.append(option(this.surface === k, v.name, v.color, () => (this.surface = k as Surface)));
        break;
      case 'cloud':
        for (const [k, v] of Object.entries(CLOUDS)) palette.append(option(this.cloud === k, `${v.name}${v.blocksLos ? ' 👁' : ''}`, v.color, () => (this.cloud = k as Cloud)));
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
        palette.append(h('div', { class: 'muted', text: this.tool === 'erase' ? 'Remove objeto, superfície, nuvem e spawn.' : 'Clique nos tiles para alterar a altura.' }));
    }
    el.append(palette);
    el.append(h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px', text: '⛔ bloqueia movimento · 👁 bloqueia visão · 🔥 inflamável. Q/E gira, roda dá zoom, botão direito arrastando move a câmera.' }));
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
    this.map = map;
    store.editorMap = map;
    this.fitZoom();
    this.renderMeta();
  }

  private renderInfo(): void {
    const el = this.info;
    const key = this.hover ? `${this.hover[0]},${this.hover[1]},${JSON.stringify(this.map.tiles[idx(this.map, this.hover[0], this.hover[1])])}` : 'none';
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
