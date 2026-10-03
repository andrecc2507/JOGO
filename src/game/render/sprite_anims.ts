/**
 * Arte pronta (PNG) das unidades e suas animações. Parte pura: lê o manifesto
 * `data/sprite_art.json`, escolhe a animação de cada pose e o quadro da vez. Recortar e desenhar
 * as imagens fica em render/sprites.ts.
 *
 * Cada animação é uma tira horizontal de quadros do mesmo tamanho, olhando para a direita, com os
 * pés na borda de baixo. Sem `sheet`, o arquivo é `<pasta>/<animação>.png` (`skill:x` → `skill_x.png`).
 * Uma animação que falta cai para a mais próxima (ver `poseChain`) e, no fim, para a imagem `base`.
 */
import ARTWORK from '../data/sprite_art.json';

/** Poses que o jogo pede. `attack`/`cast` são o golpe e a magia genéricos de qualquer habilidade. */
export const POSES = ['idle', 'move', 'jump', 'hurt', 'fallen', 'dead', 'attack', 'cast'] as const;
export type Pose = (typeof POSES)[number];

export interface AnimClip {
  sheet: string;
  frames: number;
  fps: number;
  /** Repete (parado, andando); senão toca uma vez e segura o último quadro. */
  loop: boolean;
}

export interface SpriteArt {
  id: string;
  /** Imagem parada (retrato e reserva); sem ela, usa o 1º quadro de `idle`. */
  base?: string;
  /** Por nome: uma pose (`idle`, `move`...) ou `skill:<id da habilidade>`. */
  clips: Record<string, AnimClip>;
}

type ClipInput = number | { sheet?: string; frames?: number; fps?: number; loop?: boolean };
/** Entrada do manifesto: só o caminho da imagem parada, ou a ficha completa. */
export type ArtEntry = string | { base?: string; dir?: string; anims?: Record<string, ClipInput> };

export const ART_ROOT = 'assets/sprites/criaturas';
const DEFAULT_FPS: Record<Pose, number> = { idle: 6, move: 10, jump: 10, hurt: 12, fallen: 8, dead: 8, attack: 12, cast: 10 };
const LOOPING = new Set<string>(['idle', 'move']);
/** Tempo (s) que a pose "sofrendo dano" dura depois de um golpe. */
export const HURT_TIME = 0.4;

export function parseArt(id: string, entry: ArtEntry, root = ART_ROOT): SpriteArt {
  if (typeof entry === 'string') return { id, base: entry, clips: {} };
  const dir = entry.dir ?? `${root}/${id}`;
  const clips: Record<string, AnimClip> = {};
  for (const [name, input] of Object.entries(entry.anims ?? {})) {
    const o = typeof input === 'number' ? { frames: input } : input;
    const pose = (name.startsWith('skill:') ? 'attack' : name) as Pose;
    clips[name] = {
      sheet: o.sheet ?? `${dir}/${name.replace(':', '_')}.png`,
      frames: Math.max(1, Math.floor(o.frames ?? 1)),
      fps: o.fps ?? DEFAULT_FPS[pose] ?? 10,
      loop: o.loop ?? LOOPING.has(name),
    };
  }
  return { id, base: entry.base, clips };
}

const ART: Record<string, SpriteArt> = Object.fromEntries(
  Object.entries(ARTWORK as Record<string, ArtEntry>).map(([id, e]) => [id, parseArt(id, e)]),
);

/**
 * Registra (ou troca) a arte de uma criatura em tempo de execução — usado pelo importador de sprites
 * para mostrar na hora o que acabou de converter (e pelas artes guardadas só neste navegador).
 */
export function registerArt(id: string, entry: ArtEntry): SpriteArt {
  const art = parseArt(id, entry);
  ART[id] = art;
  return art;
}

/** Junta um espaço (imagem parada, pose ou habilidade) à arte que a criatura já tem. */
export function mergeArtSlot(id: string, slot: string, sheet: string, frames: number, fps?: number): SpriteArt {
  const cur = ART[id];
  const anims: Record<string, ClipInput> = {};
  for (const [name, c] of Object.entries(cur?.clips ?? {})) anims[name] = { sheet: c.sheet, frames: c.frames, fps: c.fps, loop: c.loop };
  const entry: ArtEntry = { base: cur?.base, anims };
  if (slot === 'base') entry.base = sheet;
  else anims[slot] = fps ? { sheet, frames, fps } : { sheet, frames };
  return registerArt(id, entry);
}

/** Arte de uma criatura/unidade pelo id (ou undefined: segue a pixel art). */
export function artFor(id: string | undefined): SpriteArt | undefined {
  return id ? ART[id] : undefined;
}

/** Todos os arquivos de imagem do manifesto (para pré-carregar). */
export function allArtFiles(): string[] {
  return Object.values(ART).flatMap((a) => [...(a.base ? [a.base] : []), ...Object.values(a.clips).map((c) => c.sheet)]);
}

/** Pose pedida para uma unidade num instante. `key` muda quando a mesma pose recomeça (outro golpe). */
export interface UnitPose {
  pose: Pose;
  /** Habilidade em uso (pose `attack`/`cast`): tenta antes a animação própria `skill:<id>`. */
  skill?: string;
  key?: string | number;
}

/** Ordem de tentativa das animações para uma pose. */
export function poseChain(p: UnitPose): string[] {
  const chain: string[] = p.skill ? [`skill:${p.skill}`] : [];
  switch (p.pose) {
    case 'jump':
      chain.push('jump', 'move');
      break;
    case 'dead':
      chain.push('dead', 'fallen');
      break;
    case 'cast':
      chain.push('cast', 'attack');
      break;
    default:
      chain.push(p.pose);
  }
  if (!chain.includes('idle')) chain.push('idle');
  return chain;
}

export function pickClip(art: SpriteArt, p: UnitPose): { name: string; clip: AnimClip } | null {
  for (const name of poseChain(p)) {
    const clip = art.clips[name];
    if (clip) return { name, clip };
  }
  return null;
}

/** Quadro da animação `t` segundos depois de começar. */
export function frameIndex(clip: AnimClip, t: number): number {
  const f = Math.floor(Math.max(0, t) * clip.fps);
  return clip.loop ? f % clip.frames : Math.min(clip.frames - 1, f);
}

/** O que a cena sabe sobre a unidade neste quadro. */
export interface PoseInfo {
  acting?: { skill: string; magic: boolean };
  /** Segundos desde o último dano sofrido. */
  hurtAge?: number;
  motion?: 'move' | 'jump';
}

/** Escolhe a pose: morto > usando habilidade > sofrendo dano > pulando/andando > caído > parado. */
export function resolvePose(u: { alive: boolean; statuses: Partial<Record<string, unknown>> }, info: PoseInfo = {}): UnitPose {
  if (!u.alive) return { pose: 'dead' };
  if (info.acting) return { pose: info.acting.magic ? 'cast' : 'attack', skill: info.acting.skill };
  if (info.hurtAge !== undefined && info.hurtAge < HURT_TIME) return { pose: 'hurt' };
  if (info.motion) return { pose: info.motion };
  if (u.statuses.derrubado) return { pose: 'fallen' };
  return { pose: 'idle' };
}
