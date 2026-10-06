import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { setFormatLocale } from '../lib/format';
import { es, type Messages } from './es';
import { eu } from './eu';
import { en } from './en';

export const languages = [
  { code: 'es', label: 'Castellano', locale: 'es-ES' },
  { code: 'eu', label: 'Euskara', locale: 'eu-ES' },
  { code: 'en', label: 'English', locale: 'en-GB' },
] as const;
export type Lang = (typeof languages)[number]['code'];

const catalogues: Record<Lang, Messages> = { es, eu, en };
export type MsgKey = keyof Messages;
type Vars = Record<string, string | number>;
export type TFunction = (key: MsgKey, vars?: Vars) => string;

export const isLang = (v: unknown): v is Lang => languages.some((l) => l.code === v);
const localeOf = (lang: Lang) => languages.find((l) => l.code === lang)!.locale;

/** Current language for code outside React (API client header). */
let current: Lang = 'en';
export const currentLang = () => current;

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (isLang(saved)) return saved;
  } catch {}
  const nav = navigator.language.slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
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
  /** Picks `${key}_one` / `${key}_other` by count and passes `n`. */
  tn: (key: string, n: number, vars?: Vars) => string;
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
    const t: TFunction = (key, vars = {}) => (dict[key] ?? es[key] ?? key).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));
    const tn = (key: string, n: number, vars: Vars = {}) => t(`${key}_${n === 1 ? 'one' : 'other'}` as MsgKey, { n, ...vars });
    return { lang, setLang, t, tn };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
