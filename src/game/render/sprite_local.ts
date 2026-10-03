/**
 * Sprites importados guardados só neste navegador (quando o jogo não está no `npm run dev` e não dá
 * para gravar no projeto). Ficam em localStorage como data URL e são registrados na largada.
 */
import { mergeArtSlot } from './sprite_anims';

const KEY = 'jogo:sprites_locais';

export interface LocalSprite {
  id: string;
  slot: string;
  dataUrl: string;
  frames: number;
  fps?: number;
}

function read(): LocalSprite[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LocalSprite[];
  } catch {
    return [];
  }
}

function write(list: LocalSprite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sem espaço ou bloqueado: a arte vale só até recarregar a página.
  }
}

export function localSprites(): LocalSprite[] {
  return read();
}

/** Guarda (troca o mesmo espaço) e registra na hora. */
export function saveLocalSprite(s: LocalSprite): void {
  write([...read().filter((o) => !(o.id === s.id && o.slot === s.slot)), s]);
  mergeArtSlot(s.id, s.slot, s.dataUrl, s.frames, s.fps);
}

/** Apaga as artes locais de uma criatura (volta à do projeto depois de recarregar). */
export function clearLocalSprites(id?: string): void {
  write(id ? read().filter((o) => o.id !== id) : []);
}

/** Registra as artes guardadas (chamado no início do jogo). */
export function loadLocalSprites(): void {
  for (const s of read()) mergeArtSlot(s.id, s.slot, s.dataUrl, s.frames, s.fps);
}
