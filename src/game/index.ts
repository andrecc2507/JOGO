import { Engine, setLogLevel } from '@core';
import { GAME_CONFIG } from './config/game.config';
import { INPUT_BINDINGS } from './config/input.config';
import { registerScenes } from './scenes';
import { SYSTEM_CATALOG } from './systems/catalog';

/** Monta o jogo sobre o Engine e entra na cena de boot. */
export function startGame(canvas: HTMLCanvasElement): Engine {
  setLogLevel(import.meta.env.DEV ? 'debug' : 'warn');
  const engine = new Engine({
    canvas,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    background: GAME_CONFIG.background,
    fixedDt: GAME_CONFIG.fixedDt,
    bindings: INPUT_BINDINGS,
    catalog: SYSTEM_CATALOG,
    save: GAME_CONFIG.save,
  });
  registerScenes(engine.services.scenes);
  engine.services.scenes.go('boot');
  engine.start();
  return engine;
}
