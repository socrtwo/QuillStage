/**
 * Editing operations shared by the commands and the canvas: transactions on the current slide,
 * inserting and removing elements, formatting text and shapes, arranging.
 */
import type { App } from '../app';
import type { Element, Fill, GroupElement, Layout, Line, Master, Paragraph, ParaProps, RunProps, ShapeElement, Slide, TextBody } from '../model/types';
import { clone, newId } from '../model/deck';
import { resolveBox, isSlide, type Box } from '../model/inherit';
import { toast } from '../ui/dialog';
import { activeTextEditor } from './textEdit';

export type Owner = Slide | Layout | Master;

/** Runs fn as one undoable step on the canvas owner (slide-scoped when editing a slide). */
export function edit<T>(app: App, label: string, fn: (owner: Owner) => T): T | undefined {
  const o = app.owner;
  if (!o) { toast('There is no slide to change. Add a slide first.'); return undefined; }
  return app.deck.transact(label, () => fn(o), isSlide(o) ? [o.id] : undefined);
}

/** Runs fn on each target slide (selected thumbnails, or the current slide). */
export function editSlides(app: App, label: string, fn: (s: Slide) => void): void {
  const slides = app.targetSlides();
  if (!slides.length) return;
  app.deck.transact(label, () => slides.forEach(fn), slides.map((s) => s.id));
}

export function boxOf(app: App, el: Element): Box {
  return resolveBox(app.deck, app.owner!, el);
}

/** Writes the resolved geometry into the element (placeholders store their own box once moved). */
export function setBox(app: App, el: Element, b: Partial<Box>): void {
  const cur = boxOf(app, el);
  const nb = { ...cur, ...b };
  if (el.kind === 'group') {
    // Move and scale children with the group.
    const sx = cur.w ? nb.w / cur.w : 1, sy = cur.h ? nb.h / cur.h : 1;
    const walk = (els: Element[]) => {
      for (const c of els) {
        const cb = { x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 0, h: c.h ?? 0 };
        c.x = nb.x + (cb.x - cur.x) * sx; c.y = nb.y + (cb.y - cur.y) * sy; c.w = cb.w * sx; c.h = cb.h * sy;
        if (c.kind === 'group') walk(c.children);
      }
    };
    walk(el.children);
  }
  el.x = round(nb.x); el.y = round(nb.y); el.w = round(Math.max(1, nb.w)); el.h = round(Math.max(1, nb.h));
  if (b.rot != null) el.rot = ((b.rot % 360) + 360) % 360 || undefined;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Position for a new element: centered, cascading so repeated inserts do not stack exactly. */
export function placeNew(app: App, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const { w: sw, h: sh } = app.deck.size;
  const n = (app.owner?.elements.length || 0) % 6;
  return { x: round((sw - w) / 2 + n * 12), y: round((sh - h) / 2 + n * 12), w, h };
}

export function insertElement(app: App, el: Element, label = 'Insert'): void {
  if (!el.id) el.id = newId('sp');
  edit(app, label, (o) => { o.elements.push(el); });
  app.tab.ui.select([el.id]);
}

export function newShape(app: App, geom: string, box?: { x: number; y: number; w: number; h: number }, extra: Partial<ShapeElement> = {}): ShapeElement {
  const b = box || placeNew(app, geom === 'line' || geom === 'straightConnector1' ? 200 : 144, geom === 'line' || geom === 'straightConnector1' ? 0 : 108);
  return { id: newId('sp'), kind: 'shape', geom, name: `${geom} ${(app.owner?.elements.length || 0) + 1}`, ...b, ...extra };
}

export function newTextBox(app: App, text = '', box?: { x: number; y: number; w: number; h: number }): ShapeElement {
  const b = box || placeNew(app, 300, 40);
  return { id: newId('sp'), kind: 'shape', geom: 'rect', textbox: true, name: `TextBox ${(app.owner?.elements.length || 0) + 1}`, ...b, text: { paras: [{ level: 0, runs: text ? [{ text }] : [] }], autofit: 'resize', wrap: true } };
}

/** Selected elements of the canvas owner (top level). */
export function selection(app: App): Element[] {
  return app.selected;
}

export function hasSelection(app: App): boolean { return !!app.tab?.ui && app.tab.ui.selection.length > 0; }

/** Shapes whose text a formatting command applies to: the one being edited, or the selected shapes. */
export function textTargets(app: App): ShapeElement[] {
  const out: ShapeElement[] = [];
  const walk = (els: Element[]) => { for (const e of els) { if (e.kind === 'shape') out.push(e); else if (e.kind === 'group') walk(e.children); } };
  walk(selection(app));
  return out;
}

function forEachRun(t: TextBody | undefined, fn: (r: RunProps) => void): void {
  if (!t) return;
  for (const p of t.paras) { for (const r of p.runs) fn(r); p.end = p.end || {}; fn(p.end); }
}

/** Applies character formatting to the selected text, or to all text of the selected shapes. */
export function applyRun(app: App, props: Partial<RunProps> | ((cur: RunProps) => Partial<RunProps>), label = 'Format Text'): void {
  const ui = app.tab.ui;
  if (ui.editingText) {
    activeTextEditor()?.applyRun(props);
    return;
  }
  const shapes = textTargets(app);
  if (!shapes.length) { toast('Select a shape or text first.'); return; }
  edit(app, label, () => {
    for (const s of shapes) {
      if (!s.text) s.text = { paras: [{ level: 0, runs: [] }] };
      forEachRun(s.text, (r) => Object.assign(r, typeof props === 'function' ? props(r) : props));
    }
    // Table cells
    for (const e of selection(app)) if (e.kind === 'table') for (const row of e.rows) for (const c of row.cells) forEachRun(c.text, (r) => Object.assign(r, typeof props === 'function' ? props(r) : props));
  });
}

/** Applies paragraph formatting to the paragraphs being edited, or to all paragraphs of the selected shapes. */
export function applyPara(app: App, props: Partial<ParaProps> | ((p: Paragraph) => Partial<Paragraph>), label = 'Format Paragraph'): void {
  const ui = app.tab.ui;
  if (ui.editingText) {
    activeTextEditor()?.applyPara(props);
    return;
  }
  const shapes = textTargets(app);
  if (!shapes.length) { toast('Select a shape or text first.'); return; }
  edit(app, label, () => {
    for (const s of shapes) {
      if (!s.text) s.text = { paras: [{ level: 0, runs: [] }] };
      for (const p of s.text.paras) Object.assign(p, typeof props === 'function' ? props(p) : props);
    }
    for (const e of selection(app)) if (e.kind === 'table') for (const row of e.rows) for (const c of row.cells) for (const p of c.text.paras) Object.assign(p, typeof props === 'function' ? props(p) : props);
  });
}

export function applyBody(app: App, props: Partial<TextBody>, label = 'Text Options'): void {
  const shapes = textTargets(app);
  if (!shapes.length) { toast('Select a shape first.'); return; }
  if (app.tab.ui.editingText) app.tab.ui.commitText();
  edit(app, label, () => { for (const s of shapes) { s.text = { ...(s.text || { paras: [{ level: 0, runs: [] }] }), ...props }; } });
}

/** The first run's properties of the text being edited or the first selected shape (for ribbon state). */
export function currentRun(app: App): RunProps {
  if (app.tab?.ui?.editingText) {
    // The text editor reports the formatting at the caret.
    const ed = activeTextEditor();
    if (ed) return ed.caretRun();
  }
  const s = textTargets(app)[0];
  const p = s?.text?.paras[0];
  return { ...(p?.runs[0] || p?.end || {}) };
}

export function currentPara(app: App): Partial<Paragraph> {
  if (app.tab?.ui?.editingText) {
    const ed = activeTextEditor();
    if (ed) return ed.caretPara();
  }
  return textTargets(app)[0]?.text?.paras[0] || {};
}

export function applyFill(app: App, fill: Fill, label = 'Shape Fill'): void {
  const sel = selection(app);
  if (!sel.length) {
    // No selection: the slide background.
    editSlides(app, 'Background', (s) => { s.bg = fill; });
    return;
  }
  edit(app, label, () => { for (const e of sel) if (e.kind === 'shape') e.fill = fill; else if (e.kind === 'group') for (const c of e.children) if (c.kind === 'shape') c.fill = fill; });
}

export function applyLine(app: App, line: Partial<Line> | null, label = 'Shape Outline'): void {
  const sel = selection(app);
  if (!sel.length) { toast('Select a shape first.'); return; }
  edit(app, label, () => {
    for (const e of sel) {
      if (e.kind !== 'shape' && e.kind !== 'picture') continue;
      e.line = line === null ? { fill: { type: 'none' } } : { ...(e.line || { fill: { type: 'solid', color: 'tx1' }, width: 1 }), ...line };
    }
  });
}

export function deleteSelection(app: App): void {
  const ids = new Set(app.tab.ui.selection);
  if (!ids.size) return;
  edit(app, 'Delete', (o) => {
    o.elements = o.elements.filter((e) => !ids.has(e.id));
    if (isSlide(o)) o.anims = o.anims.filter((a) => !ids.has(a.target));
  });
  app.tab.ui.select([]);
}

export function duplicateSelection(app: App, dx = 12, dy = 12): void {
  const sel = selection(app);
  if (!sel.length) return;
  const copies = sel.map((e) => reId(clone(e)));
  edit(app, 'Duplicate', (o) => {
    for (const c of copies) { if (c.x != null) c.x += dx; if (c.y != null) c.y += dy; if (c.ph) { const b = resolveBox(app.deck, o, sel[copies.indexOf(c)]); Object.assign(c, { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }); delete c.ph; } o.elements.push(c); }
  });
  app.tab.ui.select(copies.map((c) => c.id));
}

/** Gives an element (and its children) fresh ids. */
export function reId<T extends Element>(e: T): T {
  e.id = newId('sp');
  if (e.kind === 'group') e.children = e.children.map((c) => reId(c));
  return e;
}

export function zOrder(app: App, how: 'front' | 'back' | 'forward' | 'backward'): void {
  const ids = new Set(app.tab.ui.selection);
  if (!ids.size) return;
  edit(app, 'Arrange', (o) => {
    const els = o.elements;
    const sel = els.filter((e) => ids.has(e.id));
    const rest = els.filter((e) => !ids.has(e.id));
    if (how === 'front') o.elements = [...rest, ...sel];
    else if (how === 'back') o.elements = [...sel, ...rest];
    else if (how === 'forward') { for (let i = els.length - 2; i >= 0; i--) if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
    else { for (let i = 1; i < els.length; i++) if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
  });
}

export type AlignHow = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distH' | 'distV';

/** Aligns the selection to each other (2+ objects) or to the slide (one object, or toSlide). */
export function align(app: App, how: AlignHow, toSlide = false): void {
  const sel = selection(app);
  if (!sel.length) return;
  const boxes = sel.map((e) => boxOf(app, e));
  const useSlide = toSlide || sel.length === 1;
  const { w: SW, h: SH } = app.deck.size;
  const L = useSlide ? 0 : Math.min(...boxes.map((b) => b.x)), T = useSlide ? 0 : Math.min(...boxes.map((b) => b.y));
  const R = useSlide ? SW : Math.max(...boxes.map((b) => b.x + b.w)), B = useSlide ? SH : Math.max(...boxes.map((b) => b.y + b.h));
  edit(app, 'Align', () => {
    if (how === 'distH' || how === 'distV') {
      const order = sel.map((e, i) => ({ e, b: boxes[i] })).sort((a, b) => (how === 'distH' ? a.b.x - b.b.x : a.b.y - b.b.y));
      const total = order.reduce((s, o) => s + (how === 'distH' ? o.b.w : o.b.h), 0);
      const span = how === 'distH' ? R - L : B - T;
      const gap = order.length > 1 ? (span - total) / (order.length - 1) : 0;
      let pos = how === 'distH' ? L : T;
      for (const o of order) { setBox(app, o.e, how === 'distH' ? { x: pos } : { y: pos }); pos += (how === 'distH' ? o.b.w : o.b.h) + gap; }
      return;
    }
    sel.forEach((e, i) => {
      const b = boxes[i];
      const p: Partial<Box> = how === 'left' ? { x: L } : how === 'center' ? { x: (L + R) / 2 - b.w / 2 } : how === 'right' ? { x: R - b.w } : how === 'top' ? { y: T } : how === 'middle' ? { y: (T + B) / 2 - b.h / 2 } : { y: B - b.h };
      setBox(app, e, p);
    });
  });
}

export function group(app: App): void {
  const sel = selection(app);
  if (sel.length < 2) { toast('Select two or more objects to group.'); return; }
  const boxes = sel.map((e) => boxOf(app, e));
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w)), b2 = Math.max(...boxes.map((b) => b.y + b.h));
  const g: GroupElement = { id: newId('grp'), kind: 'group', name: `Group ${(app.owner?.elements.length || 0) + 1}`, x, y, w: r - x, h: b2 - y, children: [] };
  const ids = new Set(sel.map((e) => e.id));
  edit(app, 'Group', (o) => {
    const first = o.elements.findIndex((e) => ids.has(e.id));
    g.children = sel.map((e, i) => { const c = clone(e); Object.assign(c, { x: boxes[i].x, y: boxes[i].y, w: boxes[i].w, h: boxes[i].h }); delete c.ph; return c; });
    o.elements = o.elements.filter((e) => !ids.has(e.id));
    o.elements.splice(Math.max(0, first), 0, g);
  });
  app.tab.ui.select([g.id]);
}

export function ungroup(app: App): void {
  const groups = selection(app).filter((e): e is GroupElement => e.kind === 'group');
  if (!groups.length) { toast('Select a group to ungroup.'); return; }
  const ids: string[] = [];
  edit(app, 'Ungroup', (o) => {
    for (const g of groups) {
      const i = o.elements.indexOf(g);
      o.elements.splice(i, 1, ...g.children);
      ids.push(...g.children.map((c) => c.id));
    }
  });
  app.tab.ui.select(ids);
}

export function rotateSelection(app: App, deg: number | 'flipH' | 'flipV'): void {
  const sel = selection(app);
  if (!sel.length) return;
  edit(app, 'Rotate', () => {
    for (const e of sel) {
      if (deg === 'flipH') e.flipH = !e.flipH || undefined;
      else if (deg === 'flipV') e.flipV = !e.flipV || undefined;
      else { const b = boxOf(app, e); setBox(app, e, { rot: (b.rot || 0) + deg }); }
    }
  });
}

export function nudge(app: App, dx: number, dy: number): void {
  const sel = selection(app).filter((e) => !e.locked);
  if (!sel.length) return;
  edit(app, 'Move', () => { for (const e of sel) { const b = boxOf(app, e); setBox(app, e, { x: b.x + dx, y: b.y + dy }); } });
}

/** Plain text of a shape's text body. */
export function shapeText(e: Element): string {
  if (e.kind === 'shape') return (e.text?.paras || []).map((p) => p.runs.map((r) => (r.br ? '\n' : r.text)).join('')).join('\n');
  if (e.kind === 'table') return e.rows.map((r) => r.cells.map((c) => c.text.paras.map((p) => p.runs.map((x) => x.text).join('')).join(' ')).join('\t')).join('\n');
  if (e.kind === 'group') return e.children.map(shapeText).filter(Boolean).join('\n');
  return '';
}

/** Applies a function to every text body in the deck (find/replace, spelling, case). */
export function forEachText(slides: { elements: Element[]; notes?: Paragraph[] }[], fn: (paras: Paragraph[], el: Element | null) => void, notes = true): void {
  const walk = (els: Element[]) => {
    for (const e of els) {
      if (e.kind === 'shape' && e.text) fn(e.text.paras, e);
      else if (e.kind === 'table') for (const r of e.rows) for (const c of r.cells) fn(c.text.paras, e);
      else if (e.kind === 'group') walk(e.children);
    }
  };
  for (const s of slides) { walk(s.elements); if (notes && s.notes?.length) fn(s.notes, null); }
}
