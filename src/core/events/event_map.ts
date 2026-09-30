/**
 * Catálogo global de eventos do jogo.
 *
 * Está vazio de propósito: cada módulo declara os próprios eventos via
 * declaration merging, mantendo o evento perto de quem o emite:
 *
 *   declare module '@core/events/event_map' {
 *     interface EventMap {
 *       'player:died': { entity: number };
 *     }
 *   }
 */
export interface EventMap {}

export type EventName = keyof EventMap;
