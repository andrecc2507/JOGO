import { Scene } from '@core';
import { spawnActor, spawnPlayer } from '../../prefabs';
import type { PlaytimeSystem } from '../../systems/playtime/playtime.system';
import { Wander } from '../../systems/wander';

export const SAVE_SLOT = 'auto';

/** Cena de jogo principal (placeholder): jogador + criaturas vagando. */
export class GameplayScene extends Scene<{ continue: boolean }> {
  readonly id = 'gameplay';
  protected override readonly systems = ['player_control', 'wander', 'movement', 'shape_render', 'playtime', 'debug_overlay'];
  private shouldLoad = false;

  protected override onEnter(params: { continue: boolean }): void {
    this.shouldLoad = params.continue;
    const { data, rng, renderer } = this.ctx;
    spawnPlayer(this.world, data, renderer.width / 2, renderer.height / 2);
    const wanderSpeed = data.get('actors', 'wanderer').speed;
    for (let i = 0; i < 12; i++) {
      const e = spawnActor(this.world, data, 'wanderer', rng.range(0, renderer.width), rng.range(0, renderer.height));
      this.world.add(e, Wander, { speed: wanderSpeed, timer: 0 });
    }
  }

  protected override onReady(): void {
    if (!this.shouldLoad) return;
    const state = this.ctx.save.load<Record<string, unknown>>(SAVE_SLOT);
    if (state) this.registry.deserialize(state, this.ctx);
  }

  protected override onUpdate(): void {
    const { input, save, scenes } = this.ctx;
    if (input.justPressed('cancel')) {
      save.save(SAVE_SLOT, this.registry.serialize(this.ctx));
      scenes.go('main_menu');
    }
  }

  protected override onRender(): void {
    const { renderer, systems } = this.ctx;
    const seconds = systems.get<PlaytimeSystem>('playtime').seconds;
    const hint = `Tempo ${seconds.toFixed(0)}s   ·   WASD mover   ·   Esc salvar e sair`;
    renderer.text(hint, renderer.width / 2, renderer.height - 20, { size: 14, align: 'center', color: '#78909c' });
  }
}
