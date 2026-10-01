import type { BattleSetup } from '../battle/types';

export type BattleReturn = 'world_map' | 'map_editor' | 'main_menu' | 'bestiary';

/** Ids das cenas e seus parâmetros. Toda cena nova precisa de uma entrada aqui. */
declare module '@core/scenes/scene_manager' {
  interface SceneParams {
    boot: void;
    main_menu: void;
    world_map: void;
    battle: { setup: BattleSetup; returnTo: BattleReturn };
    map_editor: void;
    bestiary: void;
  }
}

export {};
