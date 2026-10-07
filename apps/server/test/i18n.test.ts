import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogues, languages, matchLang, yearsAgoText } from '../src/i18n.js';
import { es } from '../../web/src/i18n/es.js';
import { eu } from '../../web/src/i18n/eu.js';
import { en } from '../../web/src/i18n/en.js';
import { ca } from '../../web/src/i18n/ca.js';
import { gl } from '../../web/src/i18n/gl.js';
import { fr } from '../../web/src/i18n/fr.js';
import { de } from '../../web/src/i18n/de.js';
import { it as itCat } from '../../web/src/i18n/it.js';
import { pt } from '../../web/src/i18n/pt.js';
import { pl } from '../../web/src/i18n/pl.js';
import { cs } from '../../web/src/i18n/cs.js';
import { ru } from '../../web/src/i18n/ru.js';
import { nl } from '../../web/src/i18n/nl.js';
import { ja } from '../../web/src/i18n/ja.js';
import { ko } from '../../web/src/i18n/ko.js';
import { zh } from '../../web/src/i18n/zh.js';
import { zhTW } from '../../web/src/i18n/zhTW.js';

const web: Record<string, Record<string, string>> = {
  es, eu, en, ca, gl, fr, de, it: itCat, pt, pl, cs, ru, nl, ja, ko, zh, 'zh-TW': zhTW,
};

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const PLURAL_SUFFIX = /_(zero|two|few|many)$/;

describe('language lists', () => {
  it('web and server support the same languages', () => {
    const src = readFileSync(new URL('../../web/src/i18n/index.tsx', import.meta.url), 'utf8');
    const webCodes = [...src.matchAll(/\{ code: '([\w-]+)', label:/g)].map((m) => m[1]).sort();
    expect(webCodes).toEqual([...languages].sort());
    expect(Object.keys(web).sort()).toEqual([...languages].sort());
  });
});

describe.each(Object.keys(web))('web catalogue %s', (lang) => {
  const cat = web[lang];
  it('has every key of the reference and no stray ones', () => {
    const extra = Object.keys(cat).filter((k) => !(k in es));
    expect(extra.filter((k) => !PLURAL_SUFFIX.test(k))).toEqual([]);
    expect(Object.keys(es).filter((k) => !(k in cat))).toEqual([]);
  });
  it('keeps the placeholders of the reference', () => {
    for (const [k, v] of Object.entries(cat)) {
      const ref = (es as Record<string, string>)[k] ?? (es as Record<string, string>)[k.replace(PLURAL_SUFFIX, '_other')];
      // Words like "{n} photo" can drop {n} in languages that put the count elsewhere, but never invent variables.
      const extra = vars(v).split(',').filter((x) => x && !vars(ref).split(',').includes(x));
      expect(extra, `${lang} ${k}`).toEqual([]);
    }
  });
  it('provides every plural form the language needs', () => {
    const rules = new Intl.PluralRules(lang);
    const needed = new Set<string>();
    for (let n = 0; n <= 1000; n++) needed.add(rules.select(n));
    const bases = Object.keys(es).filter((k) => k.endsWith('_one')).map((k) => k.slice(0, -4));
    for (const base of bases) {
      for (const c of needed) {
        if (c === 'one' || c === 'other') continue;
        expect(`${base}_${c}` in cat, `${lang} ${base}_${c}`).toBe(true);
      }
    }
  });
});

describe.each(languages)('server catalogue %s', (lang) => {
  const cat = catalogues[lang] as Record<string, string>;
  const ref = catalogues.es as Record<string, string>;
  it('has every key and the same placeholders', () => {
    expect(Object.keys(ref).filter((k) => !(k in cat))).toEqual([]);
    for (const k of Object.keys(ref)) expect(vars(cat[k]), `${lang} ${k}`).toBe(vars(ref[k]));
  });
  it('has the plural forms of "years ago"', () => {
    for (let n = 2; n <= 40; n++) expect(yearsAgoText(lang, n)).toContain(String(n));
  });
});

describe('matchLang', () => {
  it('maps browser tags to supported languages', () => {
    expect(matchLang('es-ES')).toBe('es');
    expect(matchLang('zh-CN')).toBe('zh');
    expect(matchLang('zh-Hans')).toBe('zh');
    expect(matchLang('zh-TW')).toBe('zh-TW');
    expect(matchLang('zh-Hant-HK')).toBe('zh-TW');
    expect(matchLang('pt-BR')).toBe('pt');
    expect(matchLang('sv-SE')).toBeNull();
  });
  it('picks the right Russian and Polish forms', () => {
    expect(yearsAgoText('ru', 3)).toBe('В этот день 3 года назад');
    expect(yearsAgoText('ru', 5)).toBe('В этот день 5 лет назад');
    expect(yearsAgoText('ru', 21)).toBe('В этот день 21 год назад');
    expect(yearsAgoText('pl', 22)).toBe('Dokładnie 22 lata temu');
  });
});
