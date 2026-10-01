import type { SceneManager } from '@core';
import './scene_params';
import { BattleScene } from './battle/battle.scene';
import { BestiaryScene } from './bestiary/bestiary.scene';
import { BootScene } from './boot/boot.scene';
import { MainMenuScene } from './main_menu/main_menu.scene';
import { SkillTreesScene } from './skill_trees/skill_trees.scene';
import { MapEditorScene } from './map_editor/map_editor.scene';
import { WorldMapScene } from './world_map/world_map.scene';

export function registerScenes(scenes: SceneManager): void {
  scenes
    .register('boot', () => new BootScene())
    .register('main_menu', () => new MainMenuScene())
    .register('world_map', () => new WorldMapScene())
    .register('battle', () => new BattleScene())
    .register('map_editor', () => new MapEditorScene())
    .register('bestiary', () => new BestiaryScene())
    .register('skill_trees', () => new SkillTreesScene());
}
