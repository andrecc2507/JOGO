import { Scene } from '@core';
import { btn, h, layer, modal } from '@ui/dom';
import type { Biome, Rarity } from '../../data';
import { DevPanel } from '../../dev/dev_panel';
import { Audio } from '../../audio/audio';
import { devPlayerUnits } from '../../dev/dev_squad';
import { BIOME_LABEL, generateMap } from '../../mapgen/generator';
import { IsoCamera } from '../../render/iso';
import { drawBattle } from '../../render/battle_renderer';
import { SAVE_SLOTS, latestSlot, loadGame, saveGame, slotInfo, store } from '../../state/store';
import { DIFFICULTIES, IRONMAN_TEXT, type DifficultyId } from '../../world/difficulty';
import { openOptions } from '../shared/options_screen';
import { SLOT_NAME, openLoad } from '../shared/saves_screen';
import { newCampaign } from '../../world/campaign';
import { planEncounter } from '../../world/encounters';
import { unitFromEnemy } from '../../battle/units';
import { DB } from '../../data';
import { Rng } from '@core';
import type { BattleMap } from '../../battle/map';

export class MainMenuScene extends Scene {
  readonly id = 'main_menu';
  protected override readonly systems = ['debug_overlay'];
  private ui!: HTMLDivElement;
  private preview!: BattleMap;
  private cam = new IsoCamera(960, 540);
  private time = 0;

  protected override onEnter(): void {
    this.preview = generateMap({ biome: 'floresta', seed: 42, w: 12, h: 12 });
    this.cam.zoom = 1.1;
    this.cam.panY = 40;
    this.cam.panX = 170;
    Audio.music('menu');
    const hasSave = !!latestSlot(this.ctx.save);
    this.ui = layer();
    const item = (label: string, run: () => void, opts: { small?: boolean; disabled?: boolean } = {}) =>
      h('div', { class: `tm-item${opts.small ? ' tm-small' : ''}${opts.disabled ? ' disabled' : ''}`, text: label, onClick: run });
    const screen = h(
      'div',
      { class: 'title-screen' },
      h(
        'div',
        { class: 'title-block' },
        h('h1', { class: 'menu-title', text: 'JOGO' }),
        h('div', { class: 'title-sub', text: 'UMA GUERRA CIVIL QUE VIRA GUERRA INTERDIMENSIONAL' }),
        h(
          'div',
          { class: 'title-menu' },
          item('Continuar', () => {
            if (loadGame(this.ctx.save)) this.ctx.scenes.go('world_map');
          }, { disabled: !hasSave }),
          item('Novo jogo', () => this.newGame()),
          item('Carregar', () => openLoad(this.ctx.save, (slot) => loadGame(this.ctx.save, slot) && this.ctx.scenes.go('world_map')), { disabled: !hasSave }),
          item('Opções', () => openOptions()),
          h('div', { class: 'title-sep' }),
          item('Bestiário', () => this.ctx.scenes.go('bestiary'), { small: true }),
          item('Árvores de habilidades', () => this.ctx.scenes.go('skill_trees'), { small: true }),
          item('Arsenal', () => this.ctx.scenes.go('arsenal'), { small: true }),
          item('Materiais e drops', () => this.ctx.scenes.go('materials'), { small: true }),
          item('Editor de mapas', () => this.ctx.scenes.go('map_editor'), { small: true }),
          item('Batalha rápida (dev)', () => this.quickBattleDialog(), { small: true }),
        ),
      ),
      h('div', { class: 'title-foot', text: 'O VÉU ESTÁ SE ROMPENDO' }),
    );
    this.ui.append(screen);
    DevPanel.setGroups([
      { title: 'Atalhos', actions: [{ label: 'Batalha rápida', run: () => this.quickBattleDialog() }, { label: 'Editor de mapas', run: () => this.ctx.scenes.go('map_editor') }, { label: 'Bestiário', run: () => this.ctx.scenes.go('bestiary') }, { label: 'Árvores de habilidades', run: () => this.ctx.scenes.go('skill_trees') }, { label: 'Arsenal', run: () => this.ctx.scenes.go('arsenal') }, { label: 'Materiais e drops', run: () => this.ctx.scenes.go('materials') }] },
    ]);
  }

  protected override onExit(): void {
    this.ui.remove();
    DevPanel.setGroups([]);
  }

  protected override onUpdate(dt: number): void {
    this.time += dt;
    if (Math.floor(this.time / 4) !== Math.floor((this.time - dt) / 4)) this.cam.rotate(1);
  }

  protected override onRender(): void {
    const ctx = this.ctx.renderer.ctx;
    drawBattle(ctx, this.cam, this.preview, { time: this.time });
    drawTitleAtmosphere(ctx, this.cam.viewW, this.cam.viewH, this.time);
  }

  /** Novo jogo: dificuldade, Modo Ferro e espaço do save. */
  private newGame(): void {
    let diff: DifficultyId = 'normal';
    let ironman = false;
    let tutorial = true;
    const free = SAVE_SLOTS.find((x) => !this.ctx.save.has(x));
    let slot = free ?? SAVE_SLOTS[0]!;
    modal('Novo jogo', (body, m) => {
      const render = () => {
        body.replaceChildren();
        body.append(h('div', { class: 'section-title', text: 'Dificuldade' }));
        const cards = h('div', { class: 'diff-cards' });
        for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
          const d = DIFFICULTIES[id];
          cards.append(h('div', { class: `diff-card ${diff === id ? 'active' : ''}`, onClick: () => ((diff = id), render()) }, h('b', { text: d.label }), h('div', { class: 'muted', text: d.desc })));
        }
        const iron = h('div', { class: `diff-card iron ${ironman ? 'active' : ''}`, onClick: () => ((ironman = !ironman), render()) }, h('b', { text: `${ironman ? '☑' : '☐'} Modo Ferro ⛓` }), h('div', { class: 'muted', text: IRONMAN_TEXT }));
        const tut = h('div', { class: `diff-card iron ${tutorial ? 'active' : ''}`, onClick: () => ((tutorial = !tutorial), render()) }, h('b', { text: `${tutorial ? '☑' : '☐'} Tutorial guiado 🎓` }), h('div', { class: 'muted', text: 'O Prólogo ensina um sistema por missão e libera os recursos do mapa aos poucos. Desligue se já conhece o jogo.' }));
        body.append(cards, iron, tut, h('div', { class: 'section-title', text: 'Espaço do save' }));
        const slots = h('div', { class: 'row' });
        for (const x of SAVE_SLOTS) {
          const info = slotInfo(this.ctx.save, x);
          slots.append(btn(`${SLOT_NAME[x]}${info ? ' (ocupado)' : ''}`, () => ((slot = x), render()), { class: `small ${slot === x ? 'active' : ''}`, title: info?.label ?? 'Vazio' }));
        }
        body.append(slots);
        const occupied = slotInfo(this.ctx.save, slot);
        if (occupied) body.append(h('div', { style: 'color:#e08a7a;font-size:12px;margin-top:4px', text: `Começar aqui apaga: ${occupied.label}` }));
        body.append(
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' },
            btn('Cancelar', () => m.close()),
            btn('⚔ Começar campanha', () => {
              m.close();
              store.campaign = newCampaign(undefined, { difficulty: diff, ironman, tutorial });
              store.slot = slot;
              saveGame(this.ctx.save, slot);
              this.ctx.scenes.go('world_map');
            }, { class: 'primary' }),
          ),
        );
      };
      render();
    }, { wide: true });
  }

  private quickBattleDialog(): void {
    modal('Batalha rápida (dev)', (body, m) => {
      const biome = h('select', {});
      for (const b of Object.keys(BIOME_LABEL)) biome.append(h('option', { value: b, text: BIOME_LABEL[b as Biome] }));
      const tier = h('select', {});
      for (const t of ['comum', 'raro', 'epico', 'lendario']) tier.append(h('option', { value: t, text: t }));
      const level = h('input', { type: 'number', value: '5' });
      level.style.width = '60px';
      const victory = h('select', {});
      for (const [v, label] of [
        ['eliminate', 'Eliminar todos'],
        ['target', 'Derrotar alvo'],
        ['escape', 'Fugir para a zona'],
        ['survive', 'Sobreviver 5 rodadas'],
      ])
        victory.append(h('option', { value: v, text: label }));
      const ambush = h('input', { type: 'checkbox' });
      body.append(
        h('div', { class: 'col' },
          h('div', { class: 'row' }, h('span', { text: 'Bioma' }), biome),
          h('div', { class: 'row' }, h('span', { text: 'Raridade do encontro' }), tier),
          h('div', { class: 'row' }, h('span', { text: 'Nível do esquadrão' }), level),
          h('div', { class: 'row' }, h('span', { text: 'Objetivo' }), victory),
          h('div', { class: 'row' }, ambush, h('span', { text: 'Emboscada' })),
          btn('Lutar!', () => {
            m.close();
            const lv = Math.max(1, Number(level.value) || 5);
            const rng = new Rng(Date.now() % 1e9);
            const plan = planEncounter(rng, biome.value as Biome, lv, tier.value as Rarity);
            const v = victory.value;
            this.ctx.scenes.go('battle', {
              setup: {
                map: generateMap({ biome: biome.value as Biome, seed: rng.int(1, 1e9) }),
                players: devPlayerUnits(lv),
                enemies: plan.enemies.map((e) => unitFromEnemy(DB.enemies[e.id]!, e.level, rng)),
                victory: v === 'survive' ? { type: 'survive', rounds: 5 } : ({ type: v } as { type: 'eliminate' }),
                ambush: ambush.checked,
                canFlee: true,
                seed: rng.int(1, 1e9),
                context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: `Batalha rápida — ${plan.description}` },
              },
              returnTo: 'main_menu',
            });
          }, { class: 'primary' }),
        ),
      );
    });
  }
}

/** Clima da tela de título: escurece a cena, névoa avermelhada embaixo e brasas subindo. */
function drawTitleAtmosphere(ctx: CanvasRenderingContext2D, w: number, hgt: number, t: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 4, 6, 0.55)';
  ctx.fillRect(0, 0, w, hgt);
  const fog = ctx.createLinearGradient(0, hgt * 0.45, 0, hgt);
  fog.addColorStop(0, 'rgba(60, 12, 8, 0)');
  fog.addColorStop(1, 'rgba(70, 14, 8, 0.55)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, w, hgt);
  for (let i = 0; i < 46; i++) {
    const seed = Math.sin(i * 91.3) * 43758.5453;
    const r = seed - Math.floor(seed);
    const speed = 12 + r * 26;
    const x = (r * w * 1.3 + Math.sin(t * 0.7 + i) * 18) % w;
    const y = hgt - (((t * speed + i * 37) % (hgt + 40)));
    const life = 1 - y / hgt;
    ctx.fillStyle = `rgba(255, ${120 + Math.round(r * 80)}, 50, ${Math.max(0, 0.75 - life * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + r * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const vig = ctx.createRadialGradient(w / 2, hgt / 2, hgt * 0.25, w / 2, hgt / 2, w * 0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, hgt);
  ctx.restore();
}
