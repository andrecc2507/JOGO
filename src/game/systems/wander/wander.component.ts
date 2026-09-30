import { defineComponent } from '@core';

/** Privado do sistema wander: entidades que vagam aleatoriamente. */
export const Wander = defineComponent<{ speed: number; timer: number }>('Wander');
