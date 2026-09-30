export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
let globalLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Logger com escopo: `createLogger('combat').info('turno', n)` → "[combat] turno 3". */
export function createLogger(scope: string): Logger {
  const tag = `[${scope}]`;
  const at = (level: Exclude<LogLevel, 'silent'>) => (...args: unknown[]) => {
    if (ORDER[level] >= ORDER[globalLevel]) console[level](tag, ...args);
  };
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}
