import EN from './en.json';
import { settings } from '../state/settings';

/**
 * Tradução da interface (estrutura): `t('texto em português')` devolve a versão do idioma escolhido
 * nas opções, ou o próprio texto se ainda não houver tradução. O português é a fonte; os dicionários
 * dos outros idiomas ficam em `i18n/<idioma>.json` (chave = texto em português). Hoje: a interface
 * principal em inglês; textos da história seguem em português.
 */
const DICTS: Record<string, Record<string, string>> = { en: EN };

export function t(pt: string): string {
  if (settings.language === 'pt') return pt;
  return DICTS[settings.language]?.[pt] ?? pt;
}

/** Quanto do dicionário cobre uma lista de textos (para relatórios de tradução). */
export function coverage(lang: string, texts: string[]): number {
  const d = DICTS[lang] ?? {};
  return texts.length ? texts.filter((x) => d[x]).length / texts.length : 1;
}
