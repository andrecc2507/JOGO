/**
 * Roupas das subclasses: ao escolher uma subclasse (a teia com mais habilidades aprendidas), o
 * personagem troca de roupa. Cada roupa muda as cores do corpo, o chapéu/elmo/capuz e um detalhe
 * de destaque (cinto, faixa, emblema). Letras dos chapéus: T = cor da roupa, D = cor escura,
 * A = destaque, M = metal, L = osso/pano claro, W = madeira, Y = ouro, G = lente/brilho,
 * H = cabelo, S = pele, E = olhos.
 */

/** Chapéus de 4–5 linhas que cobrem o topo da cabeça (o sprite tem 12 colunas). */
const HAT = {
  hood: ['....DDDD....', '...DDDDDD...', '..DDDDDDDD..', '..DDSSSSDD..', '..DSESSESD..'],
  mask: ['....DDDD....', '...DDDDDD...', '..DDDDDDDD..', '..DDDDDDDD..', '..DDEDDEDD..'],
  helm: ['....MMMM....', '...MMMMMM...', '..MMMMMMMM..', '..MMSSSSMM..'],
  greatHelm: ['....MMMM....', '...MMMMMM...', '..MMMMMMMM..', '..MMMAAMMM..', '..MEMMMMEM..'],
  horned: ['.L........L.', '.LMMMMMMMML.', '..MMMMMMMM..', '...MSSSSM...'],
  wizard: ['.....TT.....', '....TTTT....', '...TAAAAT...', '..TTTTTTTT..'],
  tallWizard: ['.....T......', '.....TT.....', '....TTTT....', '...TAAAAT...', '..TTTTTTTT..'],
  circlet: ['............', '...Y.YY.Y...', '...YYAAYY...', '...HSSSSH...'],
  bandana: ['............', '....HHHH....', '..AAAAAAAA..', '...HSSSSH..A'],
  brim: ['............', '....TTTT....', '..TTTTTTTT..', '...HSSSSH...'],
  feather: ['.......A....', '....TTTA....', '..TTTTTTTT..', '...HSSSSH...'],
  mitre: ['.....YY.....', '....TTTT....', '....TYYT....', '...TTSSTT...'],
  skull: ['....LLLL....', '...LLLLLL...', '..DLEDDELD..', '..DSSSSSSD..'],
  antlers: ['.W.......W..', '..W.HHHH.W..', '...HHHHHH...', '...HSSSSH...'],
  goggles: ['............', '....HHHH....', '...HHHHHH...', '..AGGAAGGA..'],
  halo: ['...YYYYYY...', '............', '...HHHHHH...', '...HSSSSH...'],
  flame: ['....A..A....', '...AAYYAA...', '...AYYYYA...', '...HSSSSH...'],
  crystal: ['.....G......', '....GGG.....', '...TTTTTT...', '..TTSSSSTT..'],
  hourglass: ['....YYYY....', '.....AA.....', '....YYYY....', '..TTSSSSTT..'],
  orbit: ['.G........G.', '..TTTTTTTT..', '...TTTTTT...', '...TSSSST...'],
  topknot: ['.....HH.....', '.....HH.....', '...HHHHHH...', '...HSSSSH...'],
  veil: ['....LLLL....', '...LLLLLL...', '..LLSSSSLL..', '..LSESSESL..'],
} satisfies Record<string, string[]>;

export interface Outfit {
  /** Roupa (C) e sombra (D). */
  color: string;
  dark: string;
  /** Detalhe de destaque (A): cinto, faixa, emblema. */
  accent: string;
  hat?: string[];
}

const o = (color: string, dark: string, accent: string, hat?: string[]): Outfit => ({ color, dark, accent, hat });

/** Roupa de cada subclasse, por `classe:subclasse`. */
export const OUTFITS: Record<string, Outfit> = {
  // Guerreiro
  'guerreiro:espadachim': o('#3f6fb5', '#22406e', '#e0e0e0', HAT.feather),
  'guerreiro:arcano': o('#5b3fa8', '#33226b', '#4fe3ff', HAT.crystal),
  'guerreiro:berserker': o('#8e2a1e', '#4a140e', '#d7a54b', HAT.horned),
  'guerreiro:escudeiro': o('#8a8f96', '#4c5157', '#c62828', HAT.helm),
  'guerreiro:duelista': o('#2b2b40', '#14141f', '#c0a0ff', HAT.feather),
  'guerreiro:mestre': o('#6d4c2a', '#3b2815', '#ffd54f', HAT.topknot),
  'guerreiro:defensor': o('#cfd8dc', '#78909c', '#4fc3f7', HAT.greatHelm),
  'guerreiro:campeao': o('#b8862b', '#6b4c12', '#c62828', HAT.greatHelm),
  // Arqueiro
  'arqueiro:sniper': o('#4b5a3a', '#2a331f', '#c9b17a', HAT.hood),
  'arqueiro:trapper': o('#7a5a3a', '#40301e', '#9ccc65', HAT.brim),
  'arqueiro:arcano': o('#3a5fa8', '#1f346b', '#b388ff', HAT.crystal),
  'arqueiro:druida': o('#3f7f34', '#204a1a', '#ffb74d', HAT.antlers),
  'arqueiro:especialista': o('#5c6670', '#30363c', '#ffca28', HAT.goggles),
  'arqueiro:ranger': o('#2e6b4a', '#173a28', '#d7ccc8', HAT.feather),
  'arqueiro:guardiao_runico': o('#2f5d5d', '#173232', '#80deea', HAT.circlet),
  'arqueiro:atirador_runico': o('#4a3a6b', '#261c3b', '#80deea', HAT.brim),
  // Clérigo
  'clerigo:monge': o('#e07a1f', '#8a4410', '#5d4037', HAT.topknot),
  'clerigo:sacerdote': o('#f5f5f5', '#b0a060', '#ffd54f', HAT.halo),
  'clerigo:inquisidor': o('#5a1f1f', '#2e0e0e', '#ffd54f', HAT.mitre),
  'clerigo:paladino': o('#cfd8dc', '#8a9aa4', '#ffd54f', HAT.helm),
  'clerigo:zelote': o('#b71c1c', '#5e0d0d', '#ffeb3b', HAT.flame),
  'clerigo:guardiao_fe': o('#e8e0c8', '#9a8c60', '#4fc3f7', HAT.greatHelm),
  'clerigo:taumaturgo': o('#3b2050', '#1e1029', '#9ccc65', HAT.veil),
  'clerigo:templario': o('#f0f0f0', '#9e9e9e', '#c62828', HAT.greatHelm),
  // Ladino
  'ladrao:assassino': o('#26262e', '#111116', '#b71c1c', HAT.hood),
  'ladrao:mercenario': o('#6d5a3a', '#3a2f1e', '#ffd54f', HAT.bandana),
  'ladrao:ninja': o('#1f2433', '#0d1018', '#90a4ae', HAT.mask),
  'ladrao:sabotador': o('#5d4a2a', '#30260f', '#ff7043', HAT.goggles),
  'ladrao:sicario': o('#3a1f3a', '#1d0f1d', '#ce93d8', HAT.mask),
  'ladrao:algoz': o('#4a4a5a', '#24242e', '#ef5350', HAT.hood),
  'ladrao:viper': o('#3f5a2a', '#1f2e14', '#aeea00', HAT.hood),
  'ladrao:contrabandista': o('#7a4a2a', '#3d2412', '#ffd54f', HAT.brim),
  // Mago
  'mago:elementalista': o('#3949ab', '#1a237e', '#ffd54f', HAT.wizard),
  'mago:eletricidade': o('#283593', '#141a4f', '#ffee58', HAT.tallWizard),
  'mago:fogo': o('#c62828', '#6d1414', '#ffb300', HAT.flame),
  'mago:ar': o('#80cbc4', '#3e7a74', '#ffffff', HAT.tallWizard),
  'mago:gelo': o('#81d4fa', '#3b7fa3', '#ffffff', HAT.crystal),
  'mago:agua': o('#1e88e5', '#0d4a85', '#b3e5fc', HAT.wizard),
  'mago:terra': o('#795548', '#3e2723', '#9ccc65', HAT.wizard),
  'mago:tempo': o('#4a3a6b', '#261c3b', '#ffd54f', HAT.hourglass),
  'mago:gravitacional': o('#212121', '#0a0a0a', '#b388ff', HAT.orbit),
  'mago:necro': o('#2e2e2e', '#121212', '#76ff03', HAT.skull),
  'mago:invocador': o('#4e342e', '#271a16', '#4fe3ff', HAT.tallWizard),
  'mago:cataclisma': o('#bf360c', '#5e1a06', '#ffeb3b', HAT.flame),
  'mago:manipulador': o('#00695c', '#003a33', '#ffd54f', HAT.orbit),
  'mago:entropia': o('#37474f', '#1c2429', '#ef5350', HAT.veil),
};

export function outfitFor(key: string | undefined): Outfit | undefined {
  return key ? OUTFITS[key] : undefined;
}
