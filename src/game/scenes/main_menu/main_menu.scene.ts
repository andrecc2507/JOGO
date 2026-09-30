import { Scene } from '@core';
import { GAME_CONFIG } from '../../config/game.config';
import { SAVE_SLOT } from '../gameplay/gameplay.scene';

export class MainMenuScene extends Scene {
  readonly id = 'main_menu';
  protected override readonly systems = ['debug_overlay'];

  protected override onUpdate(): void {
    const { input, scenes, save } = this.ctx;
    if (input.justPressed('confirm')) scenes.go('gameplay', { continue: false });
    if (input.justPressed('continue') && save.has(SAVE_SLOT)) scenes.go('gameplay', { continue: true });
  }

  protected override onRender(): void {
    const { renderer, save } = this.ctx;
    const cx = renderer.width / 2;
    const cy = renderer.height / 2;
    renderer.text(GAME_CONFIG.title, cx, cy - 60, { size: 48, align: 'center' });
    renderer.text('Enter — novo jogo', cx, cy + 10, { size: 18, align: 'center', color: '#b0bec5' });
    if (save.has(SAVE_SLOT)) {
      renderer.text('C — continuar', cx, cy + 40, { size: 18, align: 'center', color: '#b0bec5' });
    }
  }
}
