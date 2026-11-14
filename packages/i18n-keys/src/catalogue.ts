// Message catalogues: nested key → message trees, one per locale. English is the reference: every other locale must
// have exactly its keys, none empty, with the same placeholders (F11-AC11, ARCHITECTURE.md §14).
import { LOCALES, type Locale } from '@hifz/contracts';

export interface MessageTree {
  readonly [key: string]: string | MessageTree;
}

export type Catalogues = Readonly<Record<Locale, MessageTree>>;

/** `{ a: { b: 'x' } }` → `{ 'a.b': 'x' }`. */
export function flatten(tree: MessageTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

/** The top-level argument names of a message, sorted: `'{n} of {total}'` → `['n', 'total']`. */
export function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)[},]/g)].map((m) => m[1]!))].sort();
}

export interface CatalogueIssue {
  locale: Locale;
  key: string;
  problem: 'MISSING' | 'EMPTY' | 'EXTRA' | 'PLACEHOLDERS';
}

/** Every gap between the locales; an empty list means the catalogues are complete. */
export function checkCatalogues(catalogues: Catalogues): CatalogueIssue[] {
  const issues: CatalogueIssue[] = [];
  const reference = flatten(catalogues.en);
  for (const locale of LOCALES) {
    const messages = flatten(catalogues[locale]);
    for (const [key, english] of Object.entries(reference)) {
      const text = messages[key];
      if (text === undefined) issues.push({ locale, key, problem: 'MISSING' });
      else if (text.trim() === '') issues.push({ locale, key, problem: 'EMPTY' });
      else if (placeholders(text).join() !== placeholders(english).join()) issues.push({ locale, key, problem: 'PLACEHOLDERS' });
    }
    for (const key of Object.keys(messages)) {
      if (!(key in reference)) issues.push({ locale, key, problem: 'EXTRA' });
    }
  }
  return issues;
}

/** Replaces `{name}` arguments. Server messages use plain arguments only, no ICU plural or select. */
export function fill(template: string, params: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * Looks a key up in the locale, falling back to English (F11 edge case: a missing translation). `onMissing` is told
 * about the gap; the caller logs it once.
 */
export function lookup(catalogues: Catalogues, locale: Locale, key: string, onMissing?: (locale: Locale, key: string) => void): string {
  const own = flatten(catalogues[locale])[key];
  if (own !== undefined && own.trim() !== '') return own;
  onMissing?.(locale, key);
  return flatten(catalogues.en)[key] ?? key;
}

/** Calls `log` once per distinct (locale, key) gap, however often it is reported. */
export function onceLogger(log: (message: string) => void): (locale: Locale, key: string) => void {
  const seen = new Set<string>();
  return (locale, key) => {
    const id = `${locale}:${key}`;
    if (seen.has(id)) return;
    seen.add(id);
    log(`i18n: missing ${locale} translation for "${key}"; showing English`);
  };
}
