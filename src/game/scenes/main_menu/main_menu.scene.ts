import { Scene } from '@core';
import { btn, h, layer, modal } from '@ui/dom';
import type { Biome, Rarity } from '../../data';
import { DevPanel } from '../../dev/dev_panel';
import { Audio } from '../../audio/audio';
import { devPlayerUnits } from '../../dev/dev_squad';
import { BIOME_LABEL, generateMap } from '../../mapgen/generator';
import { IsoCamera } from '../../render/iso';
import { drawBattle } from '../../render/battle_renderer';
import { SAVE_SLOT, loadGame, saveGame, store } from '../../state/store';
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
    Audio.music('menu');
    const hasSave = this.ctx.save.has(SAVE_SLOT);
    this.ui = layer();
    const box = h(
      'div',
      { class: 'panel', style: 'left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;padding:24px 34px;background:rgba(12,10,14,0.85)' },
      h('h1', { class: 'menu-title', text: 'JOGO' }),
      h('div', { class: 'muted', style: 'margin-bottom:16px', text: 'Uma guerra civil que vira guerra interdimensional' }),
      h(
        'div',
        { class: 'col', style: 'align-items:stretch' },
        btn('Novo jogo', () => this.newGame(), { class: 'primary' }),
        btn('Continuar', () => {
          if (loadGame(this.ctx.save)) this.ctx.scenes.go('world_map');
        }, { disabled: !hasSave }),
        btn('Bestiário', () => this.ctx.scenes.go('bestiary')),
        btn('Editor de mapas', () => this.ctx.scenes.go('map_editor')),
        btn('Batalha rápida (dev)', () => this.quickBattleDialog()),
      ),
    );
    this.ui.append(box);
    DevPanel.setGroups([
      { title: 'Atalhos', actions: [{ label: 'Batalha rápida', run: () => this.quickBattleDialog() }, { label: 'Editor de mapas', run: () => this.ctx.scenes.go('map_editor') }, { label: 'Bestiário', run: () => this.ctx.scenes.go('bestiary') }] },
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
    drawBattle(this.ctx.renderer.ctx, this.cam, this.preview, { time: this.time });
  }

  private newGame(): void {
    const start = () => {
      store.campaign = newCampaign();
      saveGame(this.ctx.save);
      this.ctx.scenes.go('world_map');
    };
    if (this.ctx.save.has(SAVE_SLOT))
      modal('Novo jogo', (body, m) => {
        body.append(h('p', { text: 'Isso substitui o jogo salvo. Continuar?' }), btn('Sim, começar de novo', () => (m.close(), start()), { class: 'danger' }), btn('Cancelar', () => m.close()));
      });
    else start();
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
