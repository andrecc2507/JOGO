/** Ação lógica → lista de códigos físicos (KeyboardEvent.code ou "Mouse0/1/2"). */
export type InputBindings = Readonly<Record<string, readonly string[]>>;

/**
 * Camada de input baseada em ações. O jogo nunca pergunta "a tecla W está apertada?",
 * e sim "a ação move_up está ativa?" — rebind vira só troca de configuração.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  private detach: (() => void) | null = null;
  readonly pointer = { x: 0, y: 0 };

  constructor(private bindings: InputBindings) {}

  setBindings(bindings: InputBindings): void {
    this.bindings = bindings;
  }

  /** Conecta aos eventos do DOM. `toLocal` converte coordenadas de tela para coordenadas do jogo. */
  attach(target: Window, toLocal?: (clientX: number, clientY: number) => { x: number; y: number }): void {
    this.detach?.();
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.repeat) this.press(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => this.release(e.code);
    const onMouseDown = (e: MouseEvent) => this.press(`Mouse${e.button}`);
    const onMouseUp = (e: MouseEvent) => this.release(`Mouse${e.button}`);
    const onMouseMove = (e: MouseEvent) => {
      const p = toLocal ? toLocal(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
      this.pointer.x = p.x;
      this.pointer.y = p.y;
    };
    const onBlur = () => this.down.clear();
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('mousedown', onMouseDown);
    target.addEventListener('mouseup', onMouseUp);
    target.addEventListener('mousemove', onMouseMove);
    target.addEventListener('blur', onBlur);
    this.detach = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('blur', onBlur);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  /** Entrada crua (também usada por testes). */
  press(code: string): void {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  release(code: string): void {
    this.down.delete(code);
    this.released.add(code);
  }

  isDown(action: string): boolean {
    return this.codes(action).some((c) => this.down.has(c));
  }

  /** Verdadeiro apenas no primeiro tick após o pressionamento. */
  justPressed(action: string): boolean {
    return this.codes(action).some((c) => this.pressed.has(c));
  }

  justReleased(action: string): boolean {
    return this.codes(action).some((c) => this.released.has(c));
  }

  /** Eixo -1..1 a partir de duas ações. */
  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /** Limpa os estados de borda. Chamado pelo Engine após cada tick. */
  endTick(): void {
    this.pressed.clear();
    this.released.clear();
  }

  private codes(action: string): readonly string[] {
    return this.bindings[action] ?? [];
  }
}
