/**
 * Property inheritance: slide shape → layout placeholder → master placeholder → master text styles →
 * theme. Resolution is lazy; results are cached per deck version.
 */
import type { Deck } from './deck';
import type { Element, Layout, LevelStyle, Master, Placeholder, PlaceholderType, RunProps, ShapeElement, Slide, TextBody, Fill, Line } from './types';

export type Owner = Slide | Layout | Master;

export const isMaster = (o: Owner): o is Master => 'styles' in o;
export const isLayout = (o: Owner): o is Layout => 'master' in o && !('styles' in o);
export const isSlide = (o: Owner): o is Slide => 'layout' in o;

/** Master placeholder type a placeholder inherits from. */
export function masterPhType(t: PlaceholderType): PlaceholderType {
  if (t === 'ctrTitle' || t === 'title') return 'title';
  if (t === 'dt' || t === 'ftr' || t === 'sldNum' || t === 'hdr') return t;
  return 'body';
}

export function textKind(ph?: Placeholder): 'title' | 'body' | 'other' {
  if (!ph) return 'other';
  if (ph.type === 'title' || ph.type === 'ctrTitle') return 'title';
  if (ph.type === 'dt' || ph.type === 'ftr' || ph.type === 'sldNum' || ph.type === 'hdr') return 'other';
  return 'body';
}

const sameTitle = (a: PlaceholderType, b: PlaceholderType) => masterPhType(a) === 'title' && masterPhType(b) === 'title';

/** Finds the placeholder in `els` that `ph` inherits from. */
export function matchPlaceholder(els: Element[], ph: Placeholder, master = false): Element | undefined {
  const cands = els.filter((e) => e.ph);
  if (master) return cands.find((e) => e.ph!.type === masterPhType(ph.type)) || (masterPhType(ph.type) === 'body' ? cands.find((e) => e.ph!.type === 'obj') : undefined);
  if (ph.idx != null && ph.idx !== 0) {
    const byIdx = cands.find((e) => (e.ph!.idx ?? 0) === ph.idx);
    if (byIdx) return byIdx;
  }
  return cands.find((e) => e.ph!.type === ph.type) || cands.find((e) => sameTitle(e.ph!.type, ph.type));
}

/** The inheritance chain of an element: [element, layout placeholder?, master placeholder?]. */
export function chain(deck: Deck, owner: Owner, el: Element): Element[] {
  const out: Element[] = [el];
  if (!el.ph) return out;
  if (isSlide(owner)) {
    const lay = deck.layout(owner.layout);
    const lp = matchPlaceholder(lay.elements, el.ph);
    if (lp) out.push(lp);
    const mp = matchPlaceholder(deck.master(lay.master).elements, el.ph, true);
    if (mp) out.push(mp);
  } else if (isLayout(owner)) {
    const mp = matchPlaceholder(deck.master(owner.master).elements, el.ph, true);
    if (mp) out.push(mp);
  }
  return out;
}

export function masterOfOwner(deck: Deck, owner: Owner): Master {
  if (isMaster(owner)) return owner;
  if (isLayout(owner)) return deck.master(owner.master);
  return deck.master(deck.layout(owner.layout).master);
}

export interface Box { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean }

export function resolveBox(deck: Deck, owner: Owner, el: Element): Box {
  const c = chain(deck, owner, el);
  const pick = <K extends keyof Element>(k: K, d: any) => { for (const e of c) if (e[k] != null) return e[k]; return d; };
  return { x: pick('x', 0), y: pick('y', 0), w: pick('w', 100), h: pick('h', 50), rot: el.rot || 0, flipH: !!el.flipH, flipV: !!el.flipV };
}

/** Body properties (anchor, insets, autofit, wrap, vertical text) through the chain. */
export function resolveBody(deck: Deck, owner: Owner, el: Element): Omit<TextBody, 'paras' | 'levels'> {
  const c = chain(deck, owner, el).map((e) => (e as ShapeElement).text).filter(Boolean) as TextBody[];
  const out: any = {};
  for (const k of ['anchor', 'insets', 'autofit', 'fontScale', 'lineReduction', 'wrap', 'vert', 'columns'] as const) {
    for (const t of c) if (t[k] != null) { out[k] = t[k]; break; }
  }
  // fontScale is per shape, never inherited.
  out.fontScale = (el as ShapeElement).text?.fontScale;
  return out;
}

export function resolveFillLine(deck: Deck, owner: Owner, el: Element): { fill?: Fill; line?: Line } {
  const c = chain(deck, owner, el) as ShapeElement[];
  let fill: Fill | undefined, line: Line | undefined;
  for (const e of c) { if (fill == null && e.fill) fill = e.fill; if (line == null && e.line) line = e.line; }
  return { fill, line };
}

const merge = (a: LevelStyle, b: LevelStyle | undefined): LevelStyle => {
  if (!b) return a;
  const out: LevelStyle = { ...a, ...stripUndef(b) };
  out.run = { ...(a.run || {}), ...stripUndef(b.run || {}) };
  if (a.bullet || b.bullet) out.bullet = b.bullet ? { ...(a.bullet || {}), ...b.bullet } as any : a.bullet;
  return out;
};

function stripUndef<T extends object>(o: T): Partial<T> {
  const r: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== 'run') r[k] = v;
  return r;
}

/**
 * Effective paragraph style for a level of an element's text: master text style for its kind, then
 * the master placeholder's, layout placeholder's and the element's own list styles.
 */
export function levelStyle(deck: Deck, owner: Owner, el: Element, level: number): LevelStyle {
  const m = masterOfOwner(deck, owner);
  const kind = textKind(el.ph);
  const styles = m.styles[kind] || [];
  let st: LevelStyle = { ...(styles[Math.min(level, styles.length - 1)] || {}) };
  st.run = { ...(st.run || {}) };
  if (kind === 'other' && !el.ph) {
    // Ordinary shapes and text boxes: other style, no bullets, centered in shapes.
    st = merge(st, { bullet: { kind: 'none' }, marL: 0, indent: 0 });
  }
  const c = chain(deck, owner, el).reverse();
  for (const e of c) {
    const lv = (e as ShapeElement).text?.levels;
    if (lv?.[level]) st = merge(st, lv[level]);
  }
  return st;
}

export function runStyle(base: LevelStyle, run: RunProps): RunProps {
  const out: RunProps = { ...(base.run || {}) };
  for (const [k, v] of Object.entries(run)) if (v !== undefined && k !== 'text') (out as any)[k] = v;
  return out;
}

/** True when the element is a placeholder with no text of its own (shows its prompt in edit view). */
export function isEmptyPlaceholder(el: Element): boolean {
  if (!el.ph || el.kind !== 'shape') return false;
  const t = el.text;
  return !t || t.paras.every((p) => p.runs.every((r) => !r.text));
}

/** The prompt text of an empty placeholder, from its layout or master. */
export function promptText(deck: Deck, owner: Owner, el: Element): string {
  for (const e of chain(deck, owner, el).slice(1)) {
    const t = (e as ShapeElement).text;
    const s = t?.paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
    if (s) return s;
  }
  const t = el.ph?.type;
  const fixed: Record<string, string> = { title: 'Click to add title', ctrTitle: 'Click to add title', subTitle: 'Click to add subtitle', pic: 'Click to add picture', dt: 'Date', ftr: 'Footer', sldNum: '‹#›', hdr: 'Header', chart: 'Click to add chart', tbl: 'Click to add table', media: 'Click to add media' };
  return (t && fixed[t]) || 'Click to add text';
}
