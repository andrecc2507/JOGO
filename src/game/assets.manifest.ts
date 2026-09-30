import type { AssetEntry } from '@core';

/**
 * Todos os assets carregados no boot. Arquivos ficam em /public/assets.
 * Ex.: { key: 'hero', kind: 'image', src: 'assets/sprites/hero.png' }
 */
export const ASSET_MANIFEST: readonly AssetEntry[] = [];
