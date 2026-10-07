import { INPUT_BINDINGS } from '../config/input.config';

/**
 * Opções do jogador (guardadas no navegador, valem para todas as campanhas): velocidade da batalha,
 * texto, teclas, acessibilidade (daltonismo, tamanho da fonte) e dicas. Volume fica no `Audio`.
 */
export type ColorMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type TextSpeed = 'lento' | 'normal' | 'rapido' | 'instantaneo';

export interface Settings {
  /** Multiplicador do tempo da batalha (animações, barras, esperas da IA). */
  battleSpeed: number;
  /** Pula as encenações (golpes, projéteis) e as esperas da IA. */
  skipAnims: boolean;
  textSpeed: TextSpeed;
  /** Escala da interface (tamanho da fonte), 0,85–1,4. */
  fontScale: number;
  colorMode: ColorMode;
  /** Dicas no contexto (batalha e mapa). */
  hints: boolean;
  /** Dicas já vistas (não repetem). */
  seenHints: string[];
  /** Teclas por ação (sobrepõe `INPUT_BINDINGS`). */
  keys: Record<string, string[]>;
  language: 'pt' | 'en';
}

export const BATTLE_SPEEDS = [1, 1.5, 2, 3];
/** Letras por segundo do texto dos diálogos (0 = instantâneo). */
export const TEXT_SPEED: Record<TextSpeed, number> = { lento: 35, normal: 70, rapido: 160, instantaneo: 0 };
export const COLOR_MODE_LABEL: Record<ColorMode, string> = {
  normal: 'Normal',
  protanopia: 'Protanopia (vermelho)',
  deuteranopia: 'Deuteranopia (verde)',
  tritanopia: 'Tritanopia (azul)',
};

/**
 * Cores de time por modo de cor: aliados e inimigos sempre distinguíveis (azul × laranja para quem
 * não separa vermelho de verde; azul-escuro × amarelo para tritanopia).
 */
export const TEAM_COLORS: Record<ColorMode, { player: string; enemy: string; good: string; bad: string }> = {
  normal: { player: '#66bb6a', enemy: '#ef5350', good: '#66bb6a', bad: '#ef5350' },
  protanopia: { player: '#4fa3ff', enemy: '#ffb000', good: '#4fa3ff', bad: '#ffb000' },
  deuteranopia: { player: '#4fa3ff', enemy: '#ff8c00', good: '#4fa3ff', bad: '#ff8c00' },
  tritanopia: { player: '#2bb5a8', enemy: '#ff4f7a', good: '#2bb5a8', bad: '#ff4f7a' },
};

const KEY = 'jogo:settings';

export function defaultSettings(): Settings {
  return { battleSpeed: 1, skipAnims: false, textSpeed: 'normal', fontScale: 1, colorMode: 'normal', hints: true, seenHints: [], keys: {}, language: 'pt' };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* sem armazenamento */
  }
  return defaultSettings();
}

export const settings: Settings = load();

/** Input do motor (para aplicar teclas novas na hora). */
let input: { setBindings(b: Record<string, readonly string[]>): void } | null = null;
export function bindInput(i: { setBindings(b: Record<string, readonly string[]>): void }): void {
  input = i;
  i.setBindings(effectiveBindings());
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sem armazenamento */
  }
  applySettings();
  input?.setBindings(effectiveBindings());
}

/** Velocidade efetiva da batalha (pular animações acelera tudo). */
export function battleTimeScale(): number {
  return settings.skipAnims ? 6 : settings.battleSpeed;
}

/** Teclas efetivas: as do jogador por cima das padrão. */
export function effectiveBindings(): Record<string, readonly string[]> {
  return { ...INPUT_BINDINGS, ...settings.keys };
}

export function teamColors(): (typeof TEAM_COLORS)[ColorMode] {
  return TEAM_COLORS[settings.colorMode] ?? TEAM_COLORS.normal;
}

/** Aplica o que é visual na página: escala da fonte e classe do modo de cor. */
export function applySettings(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(settings.fontScale));
  root.dataset.colorMode = settings.colorMode;
}

/** Marca uma dica como vista; devolve se era nova. */
export function markHint(id: string): boolean {
  if (settings.seenHints.includes(id)) return false;
  settings.seenHints.push(id);
  saveSettings();
  return true;
}

/** Nome legível de uma tecla (`KeyQ` → Q, `ArrowUp` → ↑). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espaço', Escape: 'Esc', Enter: 'Enter' } as Record<string, string>)[code] ?? code;
}

export const ACTION_LABEL: Record<string, string> = {
  confirm: 'Confirmar',
  cancel: 'Cancelar / voltar',
  pause: 'Pausar o tempo (mapa)',
  speed_1: 'Velocidade 1 (mapa)',
  speed_2: 'Velocidade 2 (mapa)',
  speed_3: 'Velocidade 3 (mapa)',
  speed_4: 'Velocidade 4 (mapa)',
  rotate_left: 'Girar câmera ←',
  rotate_right: 'Girar câmera →',
  pan_up: 'Mover câmera ↑',
  pan_down: 'Mover câmera ↓',
  pan_left: 'Mover câmera ←',
  pan_right: 'Mover câmera →',
  undo_turn: 'Voltar turno (batalha)',
  debug_toggle: 'Depuração',
};
