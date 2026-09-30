import type { SystemCatalog } from '@core';
import { createDebugOverlaySystem } from './debug_overlay/debug_overlay.system';
// <new-system-import>

/**
 * Catálogo de sistemas ECS por frame (id → fábrica).
 * A lógica de regras do jogo (batalha, campanha) vive em módulos puros em
 * `game/battle`, `game/world` e `game/rules`; sistemas ficam para efeitos contínuos.
 * `npm run new:system <nome>` adiciona entradas aqui sozinho.
 */
export const SYSTEM_CATALOG: SystemCatalog = {
  debug_overlay: createDebugOverlaySystem,
  // <new-system-entry>
};
