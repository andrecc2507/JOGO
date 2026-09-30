import type { Services } from '../context';
import type { GameEventBus } from '../events/event_bus';
import type { Scene } from './scene';

/**
 * Parâmetros de cada cena, declarados por augmentation:
 *   declare module '@core/scenes/scene_manager' { interface SceneParams { gameplay: { seed: number } } }
 */
export interface SceneParams {}

type SceneId = keyof SceneParams & string;
type SceneFactory = () => Scene<any>;

declare module '../events/event_map' {
  interface EventMap {
    'scene:changed': { from: string | null; to: string };
  }
}

/** Troca de cenas. A troca é aplicada entre ticks para nunca ocorrer no meio de um update. */
export class SceneManager {
  private readonly factories = new Map<string, SceneFactory>();
  private active: Scene<any> | null = null;
  private pending: { id: string; params: unknown } | null = null;
  private services: Services | null = null;

  constructor(private readonly events: GameEventBus) {}

  bind(services: Services): void {
    this.services = services;
  }

  register(id: SceneId, factory: SceneFactory): this {
    this.factories.set(id, factory);
    return this;
  }

  go<K extends SceneId>(id: K, ...params: SceneParams[K] extends void ? [] : [SceneParams[K]]): void {
    if (!this.factories.has(id)) throw new Error(`Cena não registrada: "${id}"`);
    this.pending = { id, params: params[0] };
  }

  get current(): Scene<any> | null {
    return this.active;
  }

  /** Chamado pelo Engine no início de cada frame. */
  applyPending(): void {
    if (!this.pending) return;
    if (!this.services) throw new Error('SceneManager sem serviços (chame bind)');
    const { id, params } = this.pending;
    this.pending = null;
    const from = this.active?.id ?? null;
    this.active?.exit();
    this.active = this.factories.get(id)!();
    this.active.enter(this.services, params);
    this.events.emit('scene:changed', { from, to: id });
  }
}
