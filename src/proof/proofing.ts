/**
 * Spelling for slide text.
 *
 * Text being edited is checked as you type by the platform's spell checker (the editing island is
 * contenteditable); Review ▸ Spelling (F7) walks every paragraph of the slides and notes. Words are checked in a
 * background worker (spell.worker.ts: nspell with the SCOWL English dictionaries, or Hunspell for a
 * downloaded dictionary of another language, see dictionaries.ts).
 *
 * The walk itself (SpellSession) is independent of the worker and the UI: it takes any
 * SpellChecker and reads and writes paragraph text through a callback, so it can be tested directly.
 */
import type { Element, Paragraph, Slide } from '../model/types';
import { installedDictionaries, dictionaryFor, loadDictionary } from './dictionaries';

// --------------------------------------------------------------------------------------------
// Worker protocol (same messages as QuillPen's proofing engine)

let worker: Worker | null = null;
let workerFailures = 0;
let reqId = 0;
const pending = new Map<number, (v: any) => void>();
/** The answer to every request a failed (or missing) worker leaves unanswered. */
const FAILED = { bad: [], suggestions: [], failed: true };
/** Downloaded dictionaries already sent to the current worker. */
const inWorker = new Set<string>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerFailures >= 3 || typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const cb = pending.get(e.data.id); if (cb) { pending.delete(e.data.id); cb(e.data); } };
    w.onerror = () => {
      // A crashed worker never answers: settle every waiting request so the walk finishes.
      workerFailures++;
      if (worker === w) { worker = null; inWorker.clear(); }
      try { w.terminate(); } catch { /* */ }
      for (const cb of pending.values()) cb(FAILED);
      pending.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function call(msg: Record<string, any>): Promise<any> {
  const w = getWorker();
  if (!w) return Promise.resolve(FAILED);
  const id = ++reqId;
  return new Promise((res) => { pending.set(id, res); w.postMessage({ ...msg, id }); });
}

/** Send a downloaded dictionary to the worker once. Returns false if it is not available. */
async function ensureLoaded(id: string): Promise<boolean> {
  if (inWorker.has(id) && worker) return true;
  const d = await loadDictionary(id);
  if (!d) return false;
  const r = await call({ type: 'load', dialect: 'dict:' + id, aff: d.aff, dic: d.dic });
  if (r.failed || r.error) return false;
  inWorker.add(id);
  return true;
}

/** Forget a dictionary in the worker (after it is removed). */
export async function unloadDictionary(id: string): Promise<void> {
  inWorker.delete(id);
  if (worker) await call({ type: 'unload', dialect: 'dict:' + id });
}

// --------------------------------------------------------------------------------------------
// Dialects and languages

export type SpellDialect = 'any' | 'document' | 'en-US' | 'en-GB' | 'en-CA' | 'en-AU';

export const SPELL_DIALECTS: { value: SpellDialect; label: string }[] = [
  { value: 'any', label: 'English — all varieties (accept any standard spelling)' },
  { value: 'document', label: 'English — follow the presentation language' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom, including Oxford -ize spelling)' },
  { value: 'en-CA', label: 'English (Canada)' },
  { value: 'en-AU', label: 'English (Australia)' },
];

/** The English dictionary set for a preference and a language tag (BCP 47). */
export function dialectFor(pref: SpellDialect | undefined, lang: string | undefined): 'any' | 'en-US' | 'en-GB' | 'en-CA' | 'en-AU' {
  if (pref && pref !== 'document') return pref;
  const l = (lang || '').toLowerCase().replace(/_/g, '-').replace(/^en-[a-z]{4}(?=-|$)/, 'en');
  if (!l || !isEnglish(l)) return 'any';
  if (/^en-(us|as|gu|mp|pr|um|vi|ph)\b/.test(l)) return 'en-US';
  if (/^en-ca\b/.test(l)) return 'en-CA';
  if (/^en-(au|nz)\b/.test(l)) return 'en-AU';
  if (l === 'en') return 'any';
  return 'en-GB';
}

/** True for an English language tag ("en", "en-GB", "en-IN"...) or no tag. */
export function isEnglish(lang: string | null | undefined): boolean {
  return !lang || /^en([-_]|$)/i.test(lang);
}

/**
 * The dictionary key the worker checks words with for a presentation language: an English variety,
 * 'dict:<id>' for a downloaded dictionary, or null when no dictionary covers the language.
 */
export async function dictionaryKey(lang: string | undefined, pref: SpellDialect | undefined): Promise<string | null> {
  if (isEnglish(lang) && !/^en[-_]za\b/i.test(lang || '')) return dialectFor(pref, lang);
  const installed = await installedDictionaries();
  const id = dictionaryFor(lang, installed);
  if (id) return 'dict:' + id;
  return isEnglish(lang) ? dialectFor(pref, lang) : null;
}

// --------------------------------------------------------------------------------------------
// Checkers

export interface SpellChecker {
  /** The words (of those given) that are not in the dictionary. */
  check(words: string[], dict: string): Promise<Set<string>>;
  suggest(word: string, dict: string): Promise<string[]>;
  add?(word: string): Promise<void>;
}

/** The background worker checker. */
export const workerChecker: SpellChecker = {
  async check(words, dict) {
    if (dict.startsWith('dict:') && !(await ensureLoaded(dict.slice(5)))) throw new Error('The dictionary for this language could not be loaded.');
    const out = new Set<string>();
    for (let i = 0; i < words.length; i += 2000) {
      const r = await call({ type: 'check', words: words.slice(i, i + 2000), dialect: dict });
      if (r.failed) throw new Error('The spelling checker could not start on this device.');
      if (r.error) throw new Error(r.error);
      for (const w of r.bad || []) out.add(w);
    }
    return out;
  },
  async suggest(word, dict) { return (await call({ type: 'suggest', word, dialect: dict })).suggestions || []; },
  async add(word) { await call({ type: 'add', word }); },
};

export async function suggest(word: string, dialect?: string): Promise<string[]> { return workerChecker.suggest(word, dialect || 'any'); }
export async function addWord(word: string): Promise<void> { await workerChecker.add!(word); }

// --------------------------------------------------------------------------------------------
// Words in text

const WORD_RE = /[\p{L}][\p{L}\p{M}'’]*[\p{L}\p{M}]|[\p{L}]/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\w+|\b[\w-]+(?:\.[\w-]+)+\/\S*/gi;

export interface SpellOptions {
  ignoreUpper: boolean;
  ignoreDigits: boolean;
  ignoreUrls: boolean;
}
export const DEFAULT_SPELL_OPTIONS: SpellOptions = { ignoreUpper: true, ignoreDigits: true, ignoreUrls: true };

export interface WordAt { word: string; start: number; end: number }

/** The checkable words of a text (offsets into the text). */
export function wordsIn(text: string, opts: SpellOptions = DEFAULT_SPELL_OPTIONS): WordAt[] {
  const skip: [number, number][] = [];
  if (opts.ignoreUrls) { URL_RE.lastIndex = 0; let u: RegExpExecArray | null; while ((u = URL_RE.exec(text))) skip.push([u.index, u.index + u[0].length]); }
  const out: WordAt[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    const start = m.index, end = start + m[0].length;
    if (skip.some(([a, b]) => start >= a && start < b)) continue;
    // Words glued to digits ("A4", "2nd", "Q3x") are codes, not words.
    const before = text[start - 1] || '', after = text[end] || '';
    if (opts.ignoreDigits && (/\d/.test(before) || /\d/.test(after))) continue;
    let w = m[0].replace(/’/g, "'");
    let s = start, e = end;
    if (/'s$/i.test(w)) { w = w.slice(0, -2); e -= 2; }
    while (w.startsWith("'")) { w = w.slice(1); s++; }
    while (w.endsWith("'")) { w = w.slice(0, -1); e--; }
    if (w.length < 2) continue;
    if (opts.ignoreUpper && /^[\p{Lu}]{2,}$/u.test(w)) continue;
    out.push({ word: w, start: s, end: e });
  }
  return out;
}

// --------------------------------------------------------------------------------------------
// Text to check

/** One paragraph of slide text (in a shape, a table cell, or the speaker notes when el is null). */
export interface SpellTarget { slide: Slide; el: Element | null; para: Paragraph }

export function paraSpellText(p: Paragraph): string | null {
  const t = p.runs.map((r) => (r.br ? '\n' : r.field ? ' '.repeat(r.text.length) : r.text)).join('');
  return /\p{L}/u.test(t) ? t : null;
}

/**
 * Paragraphs of the slides in reading order (shapes in z-order, tables row by row, then the notes),
 * starting at the slide `fromSlide` when given (earlier slides come last when wrap is true).
 */
export function spellTargets(slides: Slide[], opts: { notes?: boolean; fromSlide?: string; wrap?: boolean } = {}): SpellTarget[] {
  const out: SpellTarget[] = [];
  const walk = (s: Slide, els: Element[]) => {
    for (const e of els) {
      if (e.kind === 'shape' && e.text) for (const p of e.text.paras) out.push({ slide: s, el: e, para: p });
      else if (e.kind === 'table') for (const r of e.rows) for (const c of r.cells) for (const p of c.text.paras) out.push({ slide: s, el: e, para: p });
      else if (e.kind === 'group') walk(s, e.children);
    }
  };
  let list = slides;
  if (opts.fromSlide) {
    const i = slides.findIndex((s) => s.id === opts.fromSlide);
    if (i > 0) list = opts.wrap === false ? slides.slice(i) : [...slides.slice(i), ...slides.slice(0, i)];
  }
  for (const s of list) {
    walk(s, s.elements);
    if (opts.notes !== false) for (const p of s.notes) out.push({ slide: s, el: null, para: p });
  }
  return out.filter((t) => paraSpellText(t.para) != null);
}

/** Replaces text[start, end) of a paragraph, keeping the formatting of the run where the change starts. */
export function replaceInParagraph(p: Paragraph, start: number, end: number, text: string): void {
  let pos = 0;
  let done = false;
  const runs: Paragraph['runs'] = [];
  for (const r of p.runs) {
    const len = r.br ? 1 : r.text.length;
    const a = pos, b = pos + len;
    pos = b;
    if (r.br || b <= start || a >= end) {
      if (!done && a >= end && start === end && a === start) { runs.push({ ...r, text, br: undefined }); done = true; }
      runs.push(r);
      continue;
    }
    const keep = r.text.slice(0, Math.max(0, start - a)) + (done ? '' : text) + r.text.slice(Math.max(0, end - a));
    done = true;
    if (keep) runs.push({ ...r, text: keep });
  }
  if (!done) runs.push({ text });
  p.runs = runs;
}

// --------------------------------------------------------------------------------------------
// The spelling walk

export interface SpellIssue { target: SpellTarget; word: string; start: number; end: number; text: string }

export interface SpellSessionOptions {
  dict: string;
  /** Words the user ignores (lowercase). Shared with preferences: Ignore All adds to it. */
  ignored: Set<string>;
  /** Personal dictionary (lowercase). Add to Dictionary adds to it. */
  dictionary: Set<string>;
  options?: SpellOptions;
  /** Replaces text[start, end) of a target (inside a transaction); returns false when it cannot be changed. */
  write: (t: SpellTarget, start: number, end: number, text: string) => boolean;
}

/**
 * Walks the targets one misspelling at a time. next() finds the next issue (applying Change All
 * replacements on the way); the action methods resolve the current issue and move on.
 */
export class SpellSession {
  private i = 0;
  private pos = 0;
  private bad = new Set<string>();
  private known = new Set<string>();
  private changeAllMap = new Map<string, string>();
  current: SpellIssue | null = null;
  changed = 0;

  constructor(public targets: SpellTarget[], private checker: SpellChecker, private o: SpellSessionOptions) {}

  private text(t: SpellTarget): string | null { return paraSpellText(t.para); }

  private async prime(words: string[]): Promise<void> {
    const fresh = [...new Set(words.filter((w) => !this.known.has(w)))];
    if (!fresh.length) return;
    const bad = await this.checker.check(fresh, this.o.dict);
    for (const w of fresh) { this.known.add(w); if (bad.has(w)) this.bad.add(w); }
  }

  /** Checks every word of the remaining targets in one batch (faster than paragraph by paragraph). */
  async start(): Promise<void> {
    const words: string[] = [];
    for (const t of this.targets) { const tx = this.text(t); if (tx) for (const w of wordsIn(tx, this.o.options)) words.push(w.word); }
    await this.prime(words);
  }

  private skip(w: string): boolean {
    const l = w.toLowerCase();
    return this.o.ignored.has(l) || this.o.dictionary.has(l);
  }

  /** Adds targets to the end of the walk. */
  extend(targets: SpellTarget[]): void { this.targets.push(...targets); }

  async next(): Promise<SpellIssue | null> {
    while (this.i < this.targets.length) {
      const t = this.targets[this.i];
      const text = this.text(t);
      if (text != null) {
        const words = wordsIn(text, this.o.options).filter((w) => w.start >= this.pos);
        await this.prime(words.map((w) => w.word));
        let restart = false;
        for (const w of words) {
          if (!this.bad.has(w.word) || this.skip(w.word)) continue;
          const auto = this.changeAllMap.get(w.word);
          if (auto != null) {
            if (this.apply(t, w.start, w.end, auto)) { this.pos = w.start + auto.length; restart = true; break; }
            continue;
          }
          this.current = { target: t, word: w.word, start: w.start, end: w.end, text };
          return this.current;
        }
        if (restart) continue;
      }
      this.i++;
      this.pos = 0;
    }
    this.current = null;
    return null;
  }

  private apply(t: SpellTarget, start: number, end: number, rep: string): boolean {
    const ok = this.o.write(t, start, end, rep);
    if (ok) this.changed++;
    return ok;
  }

  ignoreOnce(): void { if (this.current) this.pos = this.current.end; }
  ignoreAll(): void { if (this.current) { this.o.ignored.add(this.current.word.toLowerCase()); this.pos = this.current.end; } }
  async addToDictionary(): Promise<void> {
    if (!this.current) return;
    this.o.dictionary.add(this.current.word.toLowerCase());
    await this.checker.add?.(this.current.word);
    this.pos = this.current.end;
  }
  change(rep: string): boolean {
    const c = this.current;
    if (!c) return false;
    if (!this.apply(c.target, c.start, c.end, rep)) { this.pos = c.end; return false; }
    this.pos = c.start + rep.length;
    return true;
  }
  changeAll(rep: string): boolean {
    if (!this.current) return false;
    this.changeAllMap.set(this.current.word, rep);
    return this.change(rep);
  }
  /** Replaces the whole current paragraph (after an edit typed into the Not in Dictionary box). */
  replaceTargetText(text: string): boolean {
    const c = this.current;
    if (!c) return false;
    const ok = this.o.write(c.target, 0, c.text.length, text);
    if (ok) this.changed++;
    this.pos = 0;
    return ok;
  }
}
