import type { Services, SystemContext } from '../context';
import { World } from '../ecs/world';
import { SystemRegistry } from '../systems/system_registry';

/**
 * Uma cena é um "modo" do jogo (menu, mapa, combate...). Cada cena tem
 * o próprio World e o próprio conjunto de sistemas, declarado em `systems`.
 */
export abstract class Scene<Params = void> {
  abstract readonly id: string;
  /** Ids (do catálogo) dos sistemas usados por esta cena. Dependências entram sozinhas. */
  protected readonly systems: readonly string[] = [];

  protected world = new World();
  protected registry = new SystemRegistry();
  private context: SystemContext | null = null;

  protected get ctx(): SystemContext {
    if (!this.context) throw new Error(`Cena "${this.id}" não está ativa`);
    return this.context;
  }

  enter(services: Services, params: Params): void {
    this.world = new World();
    this.registry = SystemRegistry.fromCatalog(services.catalog, this.systems);
    this.context = { ...services, world: this.world, systems: this.registry };
    this.onEnter(params);
    this.registry.init(this.context);
    this.onReady();
  }

  exit(): void {
    this.onExit();
    this.registry.dispose(this.ctx);
    this.world.clear();
    this.context = null;
  }

  update(dt: number): void {
    this.registry.update(dt, this.ctx);
    this.onUpdate(dt);
    this.world.flush();
  }

  render(alpha: number): void {
    this.ctx.renderer.clear();
    this.registry.render(alpha, this.ctx);
    this.onRender(alpha);
  }

  /** Antes dos sistemas iniciarem: bom lugar para criar entidades iniciais. */
  protected onEnter(_params: Params): void {}
  /** Depois dos sistemas iniciarem. */
  protected onReady(): void {}
  protected onUpdate(_dt: number): void {}
  protected onRender(_alpha: number): void {}
  protected onExit(): void {}
}
