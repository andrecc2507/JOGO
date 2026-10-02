import TUTORIAL from '../data/story/tutorial.json';
import { ensureStory, type StoryHost } from './story';
import type { Campaign } from './campaign';

/**
 * Tutorial jogado dentro do Prólogo: cada missão ensina um conjunto de sistemas (cartas na batalha)
 * e o mapa libera um recurso a cada missão do Prólogo concluída (viagem → loja e taverna →
 * recrutamento → serviços). Sem tutorial (opção do Novo jogo) ou depois do Prólogo, tudo fica livre.
 */
export interface LessonCard {
  t: string;
  /** Verbete do glossário. */
  g?: string;
}
export interface Lesson {
  title: string;
  cards: LessonCard[];
}
export interface Unlock {
  after: number;
  feature: Feature;
  title: string;
  text: string;
  g?: string;
}
export type Feature = 'viagem' | 'loja' | 'recrutamento' | 'servicos';

export const LESSONS = TUTORIAL.lessons as Record<string, Lesson>;
export const UNLOCKS = TUTORIAL.unlocks as Unlock[];
export const HINTS = TUTORIAL.hints as Record<string, LessonCard>;

export interface TutorialHost extends StoryHost {
  tutorial?: boolean;
  /** Liberações do tutorial já apresentadas. */
  tutorialSeen?: string[];
}

export function tutorialOn(c: TutorialHost): boolean {
  return c.tutorial !== false && ensureStory(c).chapter === 0;
}

/** Missões do Prólogo concluídas. */
export function prologueDone(c: TutorialHost): number {
  return ensureStory(c).done.filter((id) => /^p\d$/.test(id)).length;
}

export function featureUnlocked(c: TutorialHost, f: Feature): boolean {
  if (!tutorialOn(c)) return true;
  const u = UNLOCKS.find((x) => x.feature === f);
  return !u || prologueDone(c) >= u.after;
}

/** Texto de "bloqueado" para menus. */
export function lockedReason(f: Feature): string {
  const u = UNLOCKS.find((x) => x.feature === f);
  return u ? `Liberado após ${u.after} missão(ões) do Prólogo.` : '';
}

/** Liberações alcançadas e ainda não apresentadas (marca como vistas). */
export function takeNewUnlocks(c: TutorialHost): Unlock[] {
  if (!tutorialOn(c)) return [];
  const seen = (c.tutorialSeen ??= []);
  const n = prologueDone(c);
  const fresh = UNLOCKS.filter((u) => n >= u.after && !seen.includes(u.feature));
  seen.push(...fresh.map((u) => u.feature));
  return fresh;
}

/** Lição da missão (só com o tutorial ligado). */
export function lessonFor(c: TutorialHost, missionId: string): string | undefined {
  return c.tutorial !== false && LESSONS[missionId] ? missionId : undefined;
}

/** Dicas do mapa que valem agora (a cena mostra a primeira ainda não vista). */
export function mapHints(c: Campaign): string[] {
  const out: string[] = [];
  const all = Object.values(c.roster);
  if (all.some((ch) => ch.skillPoints > 0 || ch.statPoints > 2)) out.push('m_skillpoints');
  if (all.some((ch) => ch.woundDays > 0)) out.push('m_wounded');
  if (c.veil) out.push('m_veil');
  if (all.some((ch) => ch.id !== c.commanderId && !ch.storyId && (ch.loyalty ?? 50) < 30)) out.push('m_disloyal');
  return out;
}
