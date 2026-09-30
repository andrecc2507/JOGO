import type { Services } from '@core';

/**
 * Camada de UI em DOM (HUD, inventário, diálogos...), sobreposta ao canvas.
 * Componentes de UI escutam o EventBus e nunca alteram o World diretamente:
 * para agir, emitem eventos que algum sistema trata.
 */
export function mountUi(root: HTMLElement, services: Services): void {
  services.events.on('scene:changed', ({ to }) => {
    root.dataset.scene = to;
  });
}
