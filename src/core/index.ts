/** API pública do núcleo. O código de jogo importa daqui: `import { World, Scene } from '@core'`. */
export * from './assets/asset_store';
export type * from './context';
export * from './data/data_registry';
export * from './ecs';
export * from './engine';
export * from './events/event_bus';
export * from './input/input';
export * from './loop/game_loop';
export * from './render/renderer';
export * from './save/save_service';
export * from './scenes/scene';
export * from './scenes/scene_manager';
export * from './systems/system';
export * from './systems/system_registry';
export * from './utils/logger';
export * from './utils/math';
export * from './utils/rng';
