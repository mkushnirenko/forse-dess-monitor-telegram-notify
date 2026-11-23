import { DEFAULT_LANG, LANGS, type Lang } from '../types';
import { en, type Dict } from './en';
import { uk } from './uk';

export type { Dict };

const dictionaries: Record<Lang, Dict> = { en, uk };

/** Dictionary for a language; anything unknown falls back to English. */
export const dict = (lang: Lang | string | undefined): Dict =>
  dictionaries[(LANGS as string[]).includes(lang as string) ? (lang as Lang) : DEFAULT_LANG];

/**
 * Translates a status text that arrived from the cloud in English (for example "Line Mode").
 * Unknown texts are returned unchanged, so nothing is ever lost.
 */
export const translateStatus = (lang: Lang | string | undefined, text: string): string =>
  dict(lang).status[text.trim().toLowerCase()] ?? text;

/**
 * Picks the initial language from an OS locale such as "uk-UA" or "en-US".
 * Only used until the user chooses a language explicitly.
 */
export const langFromLocale = (locale: string | undefined): Lang =>
  locale?.toLowerCase().startsWith('uk') ? 'uk' : DEFAULT_LANG;
