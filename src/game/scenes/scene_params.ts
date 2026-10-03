import type { BattleSetup } from '../battle/types';
import type { CreationParams } from './creation/creation.scene';

export type BattleReturn = 'world_map' | 'map_editor' | 'main_menu' | 'bestiary' | 'skill_trees' | 'arsenal';

/** Ids das cenas e seus parâmetros. Toda cena nova precisa de uma entrada aqui. */
declare module '@core/scenes/scene_manager' {
  interface SceneParams {
    boot: void;
    main_menu: void;
    creation: CreationParams;
    world_map: void;
    battle: { setup: BattleSetup; returnTo: BattleReturn };
    map_editor: void;
    bestiary: void;
    skill_trees: void;
    arsenal: void;
    materials: void;
  }
}

export {};
