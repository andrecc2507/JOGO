import type { ComponentData, ComponentType } from './component';

export type Entity = number;

type QueryResult<T extends readonly ComponentType<unknown>[]> = [
  Entity,
  ...{ [K in keyof T]: ComponentData<T[K]> },
];

/**
 * Mundo ECS: entidades são números, componentes são dados, sistemas são lógica.
 * Armazenamento esparso por tipo de componente (Map), suficiente para milhares de entidades.
 */
export class World {
  private nextId: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<ComponentType<unknown>, Map<Entity, unknown>>();
  private readonly pendingDestroy = new Set<Entity>();

  spawn(): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    return e;
  }

  /** Marca para remoção ao final do frame (seguro durante iteração de queries). */
  destroy(e: Entity): void {
    if (this.alive.has(e)) this.pendingDestroy.add(e);
  }

  /** Aplica as remoções pendentes. Chamado pela cena ao final de cada update. */
  flush(): void {
    for (const e of this.pendingDestroy) {
      this.alive.delete(e);
      for (const store of this.stores.values()) store.delete(e);
    }
    this.pendingDestroy.clear();
  }

  isAlive(e: Entity): boolean {
    return this.alive.has(e) && !this.pendingDestroy.has(e);
  }

  get entityCount(): number {
    return this.alive.size;
  }

  add<T>(e: Entity, type: ComponentType<T>, data: T): this {
    this.store(type).set(e, data);
    return this;
  }

  remove<T>(e: Entity, type: ComponentType<T>): void {
    this.stores.get(type as ComponentType<unknown>)?.delete(e);
  }

  has<T>(e: Entity, type: ComponentType<T>): boolean {
    return this.stores.get(type as ComponentType<unknown>)?.has(e) ?? false;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    return this.stores.get(type as ComponentType<unknown>)?.get(e) as T | undefined;
  }

  /** Retorna todas as entidades vivas que possuem todos os componentes pedidos. */
  query<const T extends readonly ComponentType<any>[]>(...types: T): QueryResult<T>[] {
    if (types.length === 0) return [];
    const stores = types.map((t) => this.stores.get(t));
    if (stores.some((s) => !s)) return [];
    const all = stores as Map<Entity, unknown>[];
    // Itera pelo menor store para reduzir custo.
    const smallest = all.reduce((a, b) => (a.size <= b.size ? a : b));
    const out: QueryResult<T>[] = [];
    for (const e of smallest.keys()) {
      if (this.pendingDestroy.has(e)) continue;
      if (all.every((s) => s.has(e))) {
        out.push([e, ...all.map((s) => s.get(e))] as unknown as QueryResult<T>);
      }
    }
    return out;
  }

  clear(): void {
    this.alive.clear();
    this.stores.clear();
    this.pendingDestroy.clear();
  }

  private store<T>(type: ComponentType<T>): Map<Entity, T> {
    let s = this.stores.get(type as ComponentType<unknown>);
    if (!s) {
      s = new Map();
      this.stores.set(type as ComponentType<unknown>, s);
    }
    return s as Map<Entity, T>;
  }
}
