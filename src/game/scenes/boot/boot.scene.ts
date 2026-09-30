import { Scene, createLogger } from '@core';
import { registerGameData } from '../../data';
import { ASSET_MANIFEST } from '../../assets.manifest';

const log = createLogger('boot');

/** Primeira cena: registra dados, carrega assets e segue para o menu. */
export class BootScene extends Scene {
  readonly id = 'boot';
  private progress = 0;

  protected override onReady(): void {
    registerGameData(this.ctx.data);
    this.ctx.assets
      .loadAll(ASSET_MANIFEST, (done, total) => (this.progress = done / total))
      .then(() => {
        log.info('pronto');
        this.ctx.scenes.go('main_menu');
      })
      .catch((err) => log.error('falha no carregamento', err));
  }

  protected override onRender(): void {
    const { renderer } = this.ctx;
    renderer.text(`Carregando… ${Math.round(this.progress * 100)}%`, renderer.width / 2, renderer.height / 2, {
      align: 'center',
    });
  }
}
