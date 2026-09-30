import type { SystemContext } from '../context';
import { SYSTEM_PHASES, type System, type SystemFactory } from './system';

/** Mapa id → fábrica de todos os sistemas conhecidos pelo jogo. */
export type SystemCatalog = Readonly<Record<string, SystemFactory>>;

/**
 * Conjunto de sistemas ativos de uma cena. Resolve dependências,
 * ordena por fase + topologia e executa o ciclo de vida.
 */
export class SystemRegistry {
  private readonly byId = new Map<string, System>();
  private ordered: System[] = [];
  private readonly disabled = new Set<string>();
  private initialized = false;

  /** Instancia os sistemas pedidos e, transitivamente, suas dependências. */
  static fromCatalog(catalog: SystemCatalog, ids: readonly string[]): SystemRegistry {
    const registry = new SystemRegistry();
    const visit = (id: string, from?: string) => {
      if (registry.byId.has(id)) return;
      const factory = catalog[id];
      if (!factory) {
        throw new Error(`Sistema "${id}" não está no catálogo${from ? ` (exigido por "${from}")` : ''}`);
      }
      const system = factory();
      if (system.id !== id) throw new Error(`Fábrica "${id}" criou sistema com id "${system.id}"`);
      registry.byId.set(id, system);
      for (const dep of system.dependsOn ?? []) visit(dep, id);
    };
    ids.forEach((id) => visit(id));
    return registry;
  }

  add(system: System): this {
    if (this.initialized) throw new Error('Não é possível adicionar sistemas após init()');
    if (this.byId.has(system.id)) throw new Error(`Sistema duplicado: "${system.id}"`);
    this.byId.set(system.id, system);
    return this;
  }

  get<T extends System = System>(id: string): T {
    const s = this.byId.get(id);
    if (!s) throw new Error(`Sistema "${id}" não está ativo nesta cena`);
    return s as T;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Ordem final de execução (útil para debug e testes). */
  get order(): readonly string[] {
    return this.ordered.map((s) => s.id);
  }

  setEnabled(id: string, enabled: boolean): void {
    if (enabled) this.disabled.delete(id);
    else this.disabled.add(id);
  }

  init(ctx: SystemContext): void {
    this.ordered = this.sort();
    for (const s of this.ordered) s.init?.(ctx);
    this.initialized = true;
  }

  update(dt: number, ctx: SystemContext): void {
    for (const s of this.ordered) if (!this.disabled.has(s.id)) s.update?.(dt, ctx);
  }

  render(alpha: number, ctx: SystemContext): void {
    for (const s of this.ordered) if (!this.disabled.has(s.id)) s.render?.(alpha, ctx);
  }

  dispose(ctx: SystemContext): void {
    for (const s of [...this.ordered].reverse()) s.dispose?.(ctx);
    this.initialized = false;
  }

  serialize(ctx: SystemContext): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const s of this.ordered) if (s.serialize) out[s.id] = s.serialize(ctx);
    return out;
  }

  deserialize(state: Record<string, unknown>, ctx: SystemContext): void {
    for (const s of this.ordered) if (s.deserialize && s.id in state) s.deserialize(state[s.id], ctx);
  }

  /** Ordenação topológica estável (Kahn), agrupada por fase. Dependências nunca apontam para fases posteriores. */
  private sort(): System[] {
    const phaseIndex = (s: System) => SYSTEM_PHASES.indexOf(s.phase ?? 'logic');
    for (const s of this.byId.values()) {
      for (const dep of s.dependsOn ?? []) {
        const target = this.byId.get(dep);
        if (!target) throw new Error(`Sistema "${s.id}" depende de "${dep}", que não está registrado`);
        if (phaseIndex(target) > phaseIndex(s)) {
          throw new Error(`Sistema "${s.id}" (${s.phase ?? 'logic'}) depende de "${dep}", de fase posterior`);
        }
      }
    }
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const s of this.byId.values()) {
      indegree.set(s.id, s.dependsOn?.length ?? 0);
      for (const dep of s.dependsOn ?? []) dependents.set(dep, [...(dependents.get(dep) ?? []), s.id]);
    }
    const queue = [...this.byId.keys()].filter((id) => indegree.get(id) === 0);
    const topo: System[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      topo.push(this.byId.get(id)!);
      for (const next of dependents.get(id) ?? []) {
        const d = indegree.get(next)! - 1;
        indegree.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    if (topo.length !== this.byId.size) {
      const stuck = [...indegree].filter(([, d]) => d > 0).map(([id]) => id);
      throw new Error(`Dependência circular entre sistemas: ${stuck.join(', ')}`);
    }
    const topoIndex = new Map(topo.map((s, i) => [s.id, i]));
    return topo.sort((a, b) => phaseIndex(a) - phaseIndex(b) || topoIndex.get(a.id)! - topoIndex.get(b.id)!);
  }
}
