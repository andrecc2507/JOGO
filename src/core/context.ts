import type { AssetStore } from './assets/asset_store';
import type { DataRegistry } from './data/data_registry';
import type { World } from './ecs/world';
import type { GameEventBus } from './events/event_bus';
import type { Input } from './input/input';
import type { Renderer } from './render/renderer';
import type { SaveService } from './save/save_service';
import type { SceneManager } from './scenes/scene_manager';
import type { SystemCatalog, SystemRegistry } from './systems/system_registry';
import type { Rng } from './utils/rng';

/** Serviços globais, vivos durante todo o jogo. */
export interface Services {
  readonly events: GameEventBus;
  readonly input: Input;
  readonly renderer: Renderer;
  readonly assets: AssetStore;
  readonly data: DataRegistry;
  readonly save: SaveService;
  readonly rng: Rng;
  readonly scenes: SceneManager;
  readonly catalog: SystemCatalog;
  readonly clock: Clock;
}

export interface Clock {
  /** Tempo simulado acumulado, em segundos. */
  time: number;
  /** Número de ticks fixos executados. */
  tick: number;
}

/** O que cada sistema recebe: serviços globais + mundo e sistemas da cena atual. */
export interface SystemContext extends Services {
  readonly world: World;
  readonly systems: SystemRegistry;
}
