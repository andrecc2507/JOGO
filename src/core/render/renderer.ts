/**
 * Renderer Canvas 2D com resolução lógica fixa e escala para caber na janela.
 * Sistemas desenham em coordenadas lógicas; o letterbox é automático.
 * Para trocar de tecnologia (WebGL, Pixi...), mantenha esta interface pública.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    private readonly background = '#000000',
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D não suportado');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Converte coordenadas de tela (clientX/Y) para coordenadas lógicas do jogo. */
  toLocal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / this.scale, y: (clientY - rect.top) / this.scale };
  }

  clear(color = this.background): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale * devicePixelRatio, 0, 0, this.scale * devicePixelRatio, 0, 0);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  circle(x: number, y: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  text(
    value: string,
    x: number,
    y: number,
    opts: { color?: string; size?: number; align?: CanvasTextAlign; font?: string } = {},
  ): void {
    const { color = '#ffffff', size = 16, align = 'left', font = 'system-ui, sans-serif' } = opts;
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px ${font}`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(value, x, y);
  }

  image(img: CanvasImageSource, x: number, y: number, w?: number, h?: number): void {
    if (w !== undefined && h !== undefined) this.ctx.drawImage(img, x, y, w, h);
    else this.ctx.drawImage(img, x, y);
  }

  private resize(): void {
    const parent = this.canvas.parentElement ?? document.body;
    this.scale = Math.min(parent.clientWidth / this.width, parent.clientHeight / this.height);
    const cssW = Math.floor(this.width * this.scale);
    const cssH = Math.floor(this.height * this.scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.floor(cssW * devicePixelRatio);
    this.canvas.height = Math.floor(cssH * devicePixelRatio);
    this.ctx.imageSmoothingEnabled = false;
  }
}
