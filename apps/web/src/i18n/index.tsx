import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { setFormatLocale } from '../lib/format';
import { es, type Catalogue, type Messages } from './es';
import { eu } from './eu';
import { en } from './en';
import { ca } from './ca';
import { gl } from './gl';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import { pt } from './pt';
import { pl } from './pl';
import { cs } from './cs';
import { ru } from './ru';
import { nl } from './nl';
import { ja } from './ja';
import { ko } from './ko';
import { zh } from './zh';
import { zhTW } from './zhTW';

export const languages = [
  { code: 'es', label: 'Castellano', locale: 'es-ES' },
  { code: 'eu', label: 'Euskara', locale: 'eu-ES' },
  { code: 'en', label: 'English', locale: 'en-GB' },
  { code: 'ca', label: 'Català', locale: 'ca-ES' },
  { code: 'gl', label: 'Galego', locale: 'gl-ES' },
  { code: 'fr', label: 'Français', locale: 'fr-FR' },
  { code: 'de', label: 'Deutsch', locale: 'de-DE' },
  { code: 'it', label: 'Italiano', locale: 'it-IT' },
  { code: 'pt', label: 'Português', locale: 'pt-PT' },
  { code: 'pl', label: 'Polski', locale: 'pl-PL' },
  { code: 'cs', label: 'Čeština', locale: 'cs-CZ' },
  { code: 'ru', label: 'Русский', locale: 'ru-RU' },
  { code: 'nl', label: 'Nederlands', locale: 'nl-NL' },
  { code: 'ja', label: '日本語', locale: 'ja-JP' },
  { code: 'ko', label: '한국어', locale: 'ko-KR' },
  { code: 'zh', label: '简体中文', locale: 'zh-CN' },
  { code: 'zh-TW', label: '繁體中文', locale: 'zh-TW' },
] as const;
export type Lang = (typeof languages)[number]['code'];

const catalogues: Record<Lang, Catalogue> = { es, eu, en, ca, gl, fr, de, it, pt, pl, cs, ru, nl, ja, ko, zh, 'zh-TW': zhTW };
export type MsgKey = keyof Messages;
type Vars = Record<string, string | number>;
export type TFunction = (key: MsgKey, vars?: Vars) => string;
export type TnFunction = (key: string, n: number, vars?: Vars) => string;
const interpolate = (msg: string, vars: Vars) => msg.replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));

export const isLang = (v: unknown): v is Lang => languages.some((l) => l.code === v);
const localeOf = (lang: Lang) => languages.find((l) => l.code === lang)!.locale;

/** Current language for code outside React (API client header). */
let current: Lang = 'en';
export const currentLang = () => current;

/** Maps a BCP 47 tag from the browser to a supported language; Traditional Chinese regions get zh-TW. */
export function matchLang(tag: string): Lang | null {
  const t = tag.toLowerCase();
  if (t.startsWith('zh')) return /^zh-(tw|hk|mo|hant)/.test(t) ? 'zh-TW' : 'zh';
  const base = t.slice(0, 2);
  return isLang(base) ? base : null;
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (isLang(saved)) return saved;
  } catch {}
  return matchLang(navigator.language) ?? 'en';
}

function apply(lang: Lang) {
  current = lang;
  setFormatLocale(localeOf(lang));
  document.documentElement.lang = lang;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunction;
  /** Picks `${key}_one` / `_few` / `_many` / `_other` by the language's plural rules and passes `n`. */
  tn: TnFunction;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = initialLang();
    apply(l);
    return l;
  });

  const setLang = useCallback((l: Lang) => {
    apply(l);
    try {
      localStorage.setItem('lang', l);
    } catch {}
    setLangState(l);
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = catalogues[lang];
    const t: TFunction = (key, vars = {}) => interpolate(dict[key] ?? es[key] ?? key, vars);
    const rules = new Intl.PluralRules(localeOf(lang));
    const tn: TnFunction = (key, n, vars = {}) => {
      const pick = (src: Record<string, string | undefined>) => src[`${key}_${rules.select(n)}`] ?? src[`${key}_other`];
      const msg = pick(dict) ?? pick(es) ?? key;
      return interpolate(msg, { n, ...vars });
    };
    return { lang, setLang, t, tn };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
