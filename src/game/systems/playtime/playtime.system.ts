import type { System } from '@core';

declare module '@core/events/event_map' {
  interface EventMap {
    /** Emitido a cada minuto completo de jogo. */
    'playtime:minute': { minutes: number };
  }
}

export interface PlaytimeSystem extends System {
  readonly seconds: number;
}

/** Exemplo de sistema com estado persistente (serialize/deserialize) e evento próprio. */
export function createPlaytimeSystem(): PlaytimeSystem {
  let seconds = 0;
  return {
    id: 'playtime',
    get seconds() {
      return seconds;
    },
    update(dt, { events }) {
      const before = Math.floor(seconds / 60);
      seconds += dt;
      const after = Math.floor(seconds / 60);
      if (after > before) events.emit('playtime:minute', { minutes: after });
    },
    serialize: () => ({ seconds }),
    deserialize(state) {
      seconds = (state as { seconds: number }).seconds;
    },
  };
}
