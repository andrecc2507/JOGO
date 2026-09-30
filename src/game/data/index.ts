import type { DataRegistry } from '@core';
import './types';
import actors from './actors/actors.json';
import type { ActorDef } from './types';

/**
 * Registra todo o conteúdo estático no DataRegistry.
 * Para um domínio novo: crie `data/<dominio>/*.json`, o tipo em `types.ts` e uma linha aqui.
 */
export function registerGameData(data: DataRegistry): void {
  data.register('actors', actors as ActorDef[]);
}
