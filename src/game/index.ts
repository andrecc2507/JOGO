import { Engine, setLogLevel } from '@core';
import { GAME_CONFIG } from './config/game.config';
import { INPUT_BINDINGS } from './config/input.config';
import { registerScenes } from './scenes';
import { SYSTEM_CATALOG } from './systems/catalog';
import { applyCreatures, applyItems, applyMaterials, applyTrees } from './data';
import { loadMaterials } from './materials/material_store';
import { loadBestiary } from './bestiary/bestiary_store';
import { loadTrees } from './skill_trees/tree_store';
import { loadItems } from './items/item_store';
import { preloadSpriteImages } from './render/sprites';
import { allArtFiles } from './render/sprite_anims';

/** Monta o jogo sobre o Engine e entra na cena de boot. */
/** Edições feitas nos editores (bestiário, árvores, arsenal, materiais) valem desde o início do jogo. */
function applyLocalEdits(): void {
  try {
    applyCreatures(loadBestiary());
    applyTrees(loadTrees());
    applyItems(loadItems());
    applyMaterials(loadMaterials());
  } catch (e) {
    console.warn('Edições locais ignoradas:', e);
  }
}

export function startGame(canvas: HTMLCanvasElement): Engine {
  applyLocalEdits();
  preloadSpriteImages(allArtFiles());
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
