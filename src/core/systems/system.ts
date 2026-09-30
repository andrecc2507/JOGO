import type { SystemContext } from '../context';

/**
 * Ordem de execução por fase. Dentro da mesma fase, a ordem segue as dependências.
 *  input   → lê input e converte em intenções (ex.: velocidade desejada)
 *  logic   → regras do jogo, IA, combate, economia
 *  physics → movimento, colisão
 *  late    → reações ao estado final do tick (câmera, limpeza)
 */
export const SYSTEM_PHASES = ['input', 'logic', 'physics', 'late'] as const;
export type SystemPhase = (typeof SYSTEM_PHASES)[number];

export interface System {
  /** Id único, igual à chave no catálogo. */
  readonly id: string;
  /** Ids de sistemas que precisam existir (e inicializar) antes deste. */
  readonly dependsOn?: readonly string[];
  /** Fase de update. Padrão: 'logic'. */
  readonly phase?: SystemPhase;

  init?(ctx: SystemContext): void;
  /** Tick fixo de simulação (dt em segundos). */
  update?(dt: number, ctx: SystemContext): void;
  /** Desenho por frame; alpha ∈ [0,1) é a interpolação entre ticks. */
  render?(alpha: number, ctx: SystemContext): void;
  dispose?(ctx: SystemContext): void;

  /** Estado persistente do sistema (para save). */
  serialize?(ctx: SystemContext): unknown;
  deserialize?(state: unknown, ctx: SystemContext): void;
}

export type SystemFactory = () => System;
