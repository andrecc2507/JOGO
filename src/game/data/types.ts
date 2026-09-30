/** Tipos dos domínios de dados. Registre cada domínio novo aqui e em `data/index.ts`. */
export interface ActorDef {
  id: string;
  shape: 'rect' | 'circle';
  size: number;
  color: string;
  speed: number;
}

declare module '@core/data/data_registry' {
  interface DataCatalog {
    actors: ActorDef;
  }
}
