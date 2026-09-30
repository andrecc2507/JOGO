import { AssetStore } from './assets/asset_store';
import type { Clock, Services } from './context';
import { DataRegistry } from './data/data_registry';
import { EventBus, type GameEventBus } from './events/event_bus';
import { Input, type InputBindings } from './input/input';
import { GameLoop } from './loop/game_loop';
import { Renderer } from './render/renderer';
import { MemoryStorage, SaveService, type Migration, type StorageBackend } from './save/save_service';
import { SceneManager } from './scenes/scene_manager';
import type { SystemCatalog } from './systems/system_registry';
import { Rng } from './utils/rng';

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  background?: string;
  fixedDt?: number;
  seed?: number;
  bindings: InputBindings;
  catalog: SystemCatalog;
  save: { version: number; migrations?: Record<number, Migration> };
}

/** Monta os serviços globais e conecta loop → input → cena → render. */
export class Engine {
  readonly services: Services;
  private readonly loop: GameLoop;

  constructor(config: EngineConfig) {
    const events: GameEventBus = new EventBus();
    const renderer = new Renderer(config.canvas, config.width, config.height, config.background);
    const input = new Input(config.bindings);
    input.attach(window, (x, y) => renderer.toLocal(x, y));
    const scenes = new SceneManager(events);
    const clock: Clock = { time: 0, tick: 0 };

    this.services = {
      events,
      input,
      renderer,
      scenes,
      clock,
      assets: new AssetStore(),
      data: new DataRegistry(),
      save: new SaveService(pickStorage(), config.save.version, config.save.migrations),
      rng: new Rng(config.seed),
      catalog: config.catalog,
    };
    scenes.bind(this.services);

    this.loop = new GameLoop(
      {
        beginFrame: () => scenes.applyPending(),
        update: (dt) => {
          scenes.current?.update(dt);
          input.endTick();
          clock.time += dt;
          clock.tick++;
        },
        render: (alpha) => scenes.current?.render(alpha),
      },
      config.fixedDt,
    );
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }
}

function pickStorage(): StorageBackend {
  try {
    const probe = '__jogo_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return new MemoryStorage();
  }
}
