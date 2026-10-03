import type { Biome } from '../data';
import { PERMANENT, type BattleMap, type Prop, type Terrain, type Tile } from '../battle/map';

/**
 * Mapas feitos à mão para as missões-chave da história (desenhados em texto, uma letra por casa).
 *
 * Legenda: `.` chão (terreno base do mapa) · `,` madeira/tapete · `:` terra · `s` areia · `*` neve
 * `#` muro · `R` rocha · `T` árvore · `Y` pinheiro · `b` arbusto · `c` caixa · `~` água funda
 * `w` poça · `f` chamas · `o` óleo · `P` início do esquadrão · `E` início dos inimigos · `X` zona de fuga.
 * A grade de alturas (opcional) usa dígitos 0–8 na mesma posição.
 */
interface StoryMapDef {
  name: string;
  biome: Biome;
  base: Terrain;
  rows: string[];
  heights?: string[];
}

const TERRAIN_OF: Record<string, Terrain> = { ',': 'madeira', ':': 'terra', s: 'areia', '*': 'neve', '~': 'agua_funda' };
const PROP_OF: Record<string, Prop> = { '#': 'muro', R: 'rocha', T: 'arvore', Y: 'pinheiro', b: 'arbusto', c: 'caixa' };

export const STORY_MAPS: Record<string, StoryMapDef> = {
  /** 1.7 — O Santuário Profundo: corredores sob o templo e o círculo do selo ao fundo. */
  santuario: {
    name: 'Santuário Profundo',
    biome: 'planicie',
    base: 'pedra',
    rows: [
      '##############',
      '#PP..#....c..#',
      '#PP..#.......#',
      '#PP..#..##...#',
      '#.......#....#',
      '###.###.#.####',
      '#.....c.#....#',
      '#..#..........',
      '#..#.###..##.#',
      '#....#.,,,,..#',
      '#.c..#.,EE,..#',
      '#......,EE,..#',
      '#....#.,,,,.E#',
      '##############',
    ],
    heights: [
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000001111000',
      '00000001221000',
      '00000001221000',
      '00000001111000',
      '00000000000000',
    ],
  },
  /** 3.8 — O Salão Oval: duas fileiras de colunas, tapete até o trono elevado. */
  salao_oval: {
    name: 'Salão Oval',
    biome: 'planicie',
    base: 'pedra',
    rows: [
      '##############',
      '#....,,,,....#',
      '#.#..,EE,..#.#',
      '#....,,,,....#',
      '#.#..,..,..#.#',
      '#....,..,..E.#',
      '#.#..,..,..#.#',
      '#....,..,....#',
      '#.#..,..,..#.#',
      '#c...,..,...c#',
      '#.#..,..,..#.#',
      '#....,PP,....#',
      '#....PPPP....#',
      '######..######',
    ],
    heights: [
      '00000000000000',
      '00002222220000',
      '00002222220000',
      '00001111110000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
    ],
  },
  /** 3.6 — A Porta: a plataforma do farol sobre o rochedo, cercada de mar. */
  farol: {
    name: 'Farol de Marenhal',
    biome: 'costa',
    base: 'pedra',
    rows: [
      '~~~~~~~~~~~~~~',
      '~~~~sss~~~~~~~',
      '~~~ss..R..~~~~',
      '~~s....#E..~~~',
      '~~s..c.#..E.~~',
      '~~.....##.R.~~',
      '~R..w.......~~',
      '~~.....R...s~~',
      '~~..c......s~~',
      '~~~...PP..~~~~',
      '~~~..PPP..~~~~',
      '~~~~.....~~~~~',
      '~~~~~sss~~~~~~',
      '~~~~~~~~~~~~~~',
    ],
    heights: [
      '00000000000000',
      '00001110000000',
      '00011223300000',
      '00122233330000',
      '00122233330000',
      '00122223330000',
      '01122222330000',
      '00112222220000',
      '00111222210000',
      '00011111100000',
      '00011111100000',
      '00001111000000',
      '00000111000000',
      '00000000000000',
    ],
  },
  /** 8.3 — O Caminho do Devorador: trilha estreita sobre o nada, fuga no fim. */
  caminho: {
    name: 'Caminho do Devorador',
    biome: 'planicie',
    base: 'pedra',
    rows: [
      '~~~~~~~~~~~~~~~~',
      '~PP~~~~~~~~~R~~~',
      '~PP...~~~~....X~',
      '~P..R..~~~.E..X~',
      '~~~...E....~..X~',
      '~~~~~~...R..~~~~',
      '~~~~~~~~E~~~~~~~',
      '~~~~~~~~~~~~~~~~',
    ],
  },
  /** 8.8 — O Último Selo: arena circular, anel de pedras e o círculo de luz no centro. */
  selo: {
    name: 'O Último Selo',
    biome: 'planicie',
    base: 'pedra',
    rows: [
      '~~~~~~~~~~~~~~',
      '~~~~E....E~~~~',
      '~~~..R..R..~~~',
      '~~..........~~',
      '~E.R..,,..R.E~',
      '~....,,,,....~',
      '~...,,PP,,...~',
      '~...,,PP,,...~',
      '~....,,,,....~',
      '~E.R..,,..R.E~',
      '~~..........~~',
      '~~~..R..R..~~~',
      '~~~~E....E~~~~',
      '~~~~~~~~~~~~~~',
    ],
  },
};

/** Monta o `BattleMap` de um mapa feito à mão (ou undefined se o id não existir). */
export function buildStoryMap(id: string): BattleMap | undefined {
  const def = STORY_MAPS[id];
  if (!def) return undefined;
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = def.rows[y]![x] ?? '~';
      const height = Number(def.heights?.[y]?.[x] ?? '0') || 0;
      const t: Tile = { h: ch === '~' ? 0 : height, t: TERRAIN_OF[ch] ?? def.base };
      if (PROP_OF[ch]) t.p = PROP_OF[ch];
      if (ch === 'w') t.s = 'agua';
      if (ch === 'f') t.s = 'fogo';
      if (ch === 'o') t.s = 'oleo';
      if (t.s) t.sTtl = PERMANENT;
      if (ch === 'P') t.spawn = 'player';
      if (ch === 'E') t.spawn = 'enemy';
      if (ch === 'X') t.spawn = 'extract';
      tiles.push(t);
    }
  return { id: `historia_${id}`, name: def.name, w, h, biome: def.biome, tiles };
}
