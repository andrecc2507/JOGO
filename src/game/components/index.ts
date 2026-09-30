/**
 * Componentes compartilhados entre sistemas. Componentes usados por um único
 * sistema devem morar na pasta desse sistema.
 */
import { defineComponent } from '@core';

export const Transform = defineComponent<{ x: number; y: number }>('Transform');
export const Velocity = defineComponent<{ x: number; y: number }>('Velocity');
export const Shape = defineComponent<{ kind: 'rect' | 'circle'; size: number; color: string }>('Shape');
/** Entidade controlada pelo jogador. */
export const PlayerControlled = defineComponent<{ speed: number }>('PlayerControlled');
/** Marca a entidade como parte da definição `actors/<id>` em data/. */
export const ActorRef = defineComponent<{ defId: string }>('ActorRef');
