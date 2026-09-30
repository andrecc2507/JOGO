import type { SceneManager } from '@core';
import './scene_params';
import { BootScene } from './boot/boot.scene';
import { GameplayScene } from './gameplay/gameplay.scene';
import { MainMenuScene } from './main_menu/main_menu.scene';

export function registerScenes(scenes: SceneManager): void {
  scenes
    .register('boot', () => new BootScene())
    .register('main_menu', () => new MainMenuScene())
    .register('gameplay', () => new GameplayScene());
}
