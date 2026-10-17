/** Design tab: themes, colors, fonts, background styles, slide size, backgrounds, Design Ideas, Restyle. */
import { def, type MenuEntry } from './registry';
import type { App } from '../app';
import type { Element, Fill, Layout, Master, SchemeColor, ShapeElement, Slide, Theme } from '../model/types';
import { Deck, SLIDE_SIZES, clone, defaultLayouts, defaultMaster, newId } from '../model/deck';
import { THEME_PRESETS, SCHEME_KEYS, cssColor } from '../model/theme';
import { editSlides } from '../edit/ops';
import { openDialog, toast, promptDialog, confirmDialog } from '../ui/dialog';
import { h, clear, icon, pickFile, readFileAsDataURL, download } from '../ui/dom';
import { registerPane } from '../ui/panes';
import { slideSvg } from '../render/slide';
import { isSlide, resolveBox } from '../model/inherit';
import { kvSet } from '../util/store';
import { FONT_LIST } from '../fonts';
import { titleShape, bodyShape } from '../edit/workspace';
import { dataUrlParts } from './insert';



// ------------------------------------------------------------------------------------------
// Themes

/** Applies a theme preset's colors and fonts to every theme in the deck (or the given ones). */
export function applyThemePreset(deck: Deck, index: number, themes: Theme[] = deck.data.themes): void {
  const p = THEME_PRESETS[index];
  if (!p) return;
  for (const t of themes) { t.name = p.name; t.colors = { ...p.colors }; t.fonts = { ...p.fonts }; }
  for (const m of deck.data.masters) if (themes.some((t) => t.id === m.theme)) {
    m.name = p.name;
    if (p.bg) m.bg = { type: 'solid', color: p.bg };
    else if (m.bg?.type === 'solid' && typeof m.bg.color === 'string' && /^(dk2|tx2)$/.test(m.bg.color)) m.bg = { type: 'solid', color: 'bg1' };
    m.clrMap = p.bg === 'dk2' ? { bg1: 'dk1', tx1: 'lt1', bg2: 'dk2', tx2: 'lt2' } : { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  }
}

function currentTheme(app: App): Theme {
  return app.deck.themeOf(app.owner || app.deck.data.masters[0]);
}

/** A copy of the first master and its layouts using a new theme; returns the layout mapping old→new. */
function addMasterWithTheme(deck: Deck, preset: number): Map<string, string> {
  const t = { ...clone(deck.data.themes[0]), id: newId('thm') };
  deck.data.themes.push(t);
  applyThemePreset(deck, preset, [t]);
  const src = deck.data.masters[0];
  const m: Master = { ...clone(src), id: newId('mst'), theme: t.id, name: THEME_PRESETS[preset].name };
  if (THEME_PRESETS[preset].bg) { m.bg = { type: 'solid', color: THEME_PRESETS[preset].bg! }; m.clrMap = { bg1: 'dk1', tx1: 'lt1', bg2: 'dk2', tx2: 'lt2' }; }
  deck.data.masters.push(m);
  const map = new Map<string, string>();
  for (const l of deck.layoutsOf(src.id)) {
    const nl: Layout = { ...clone(l), id: newId('lay'), master: m.id };
    deck.data.layouts.push(nl);
    map.set(l.id, nl.id);
  }
  return map;
}

// ------------------------------------------------------------------------------------------
// Backgrounds

export function backgroundStyles(): { label: string; fill: Fill }[] {
  return [
    { label: 'Background 1', fill: { type: 'solid', color: 'bg1' } },
    { label: 'Background 2', fill: { type: 'solid', color: 'bg2' } },
    { label: 'Text 1', fill: { type: 'solid', color: 'tx1' } },
    { label: 'Text 2', fill: { type: 'solid', color: 'tx2' } },
    { label: 'Light Gradient', fill: { type: 'gradient', angle: 90, stops: [{ pos: 0, color: 'bg1' }, { pos: 1, color: 'bg2' }] } },
    { label: 'Dark Gradient', fill: { type: 'gradient', angle: 90, stops: [{ pos: 0, color: 'tx2' }, { pos: 1, color: 'tx1' }] } },
    { label: 'Accent Gradient', fill: { type: 'gradient', angle: 45, stops: [{ pos: 0, color: 'accent1' }, { pos: 1, color: 'accent2' }] } },
    { label: 'Soft Accent', fill: { type: 'solid', color: { s: 'accent1', lum: 0.85 } } },
    { label: 'Deep Accent', fill: { type: 'solid', color: { s: 'accent1', lum: -0.5 } } },
    { label: 'Radial Glow', fill: { type: 'gradient', path: 'radial', stops: [{ pos: 0, color: 'bg1' }, { pos: 1, color: { s: 'accent1', lum: 0.6 } }] } },
    { label: 'Paper', fill: { type: 'solid', color: '#FBF8F1' } },
    { label: 'Night', fill: { type: 'gradient', angle: 120, stops: [{ pos: 0, color: '#1B2333' }, { pos: 1, color: '#2D3A4A' }] } },
  ];
}

async function formatBackground(app: App): Promise<void> {
  const s = app.slide;
  if (!s) return;
  const cur = s.bg;
  const colorOf = (c: any) => (typeof c === 'string' && c.startsWith('#') ? c : cssColor(c, { theme: app.deck.themeOf(s), master: app.deck.masterOf(s) }, '#FFFFFF').slice(0, 7));
  let picture: string | null = cur?.type === 'image' ? cur.media : null;
  const r = await openDialog({
    title: 'Format Background', fields: [
      { key: 'kind', label: 'Fill', type: 'radio', options: [{ value: 'follow', label: 'Follow layout' }, { value: 'solid', label: 'Solid fill' }, { value: 'gradient', label: 'Gradient fill' }, { value: 'image', label: 'Picture fill' }, { value: 'pattern', label: 'Pattern fill' }], value: cur ? cur.type === 'none' ? 'follow' : cur.type : 'follow' },
      { key: 'c1', label: 'Color', type: 'color', value: cur?.type === 'solid' ? colorOf(cur.color) : cur?.type === 'gradient' ? colorOf(cur.stops[0]?.color) : cur?.type === 'pattern' ? colorOf(cur.fg) : '#FFFFFF', visibleIf: (v) => v.kind !== 'follow' && v.kind !== 'image' },
      { key: 'c2', label: 'Second color', type: 'color', value: cur?.type === 'gradient' ? colorOf(cur.stops[cur.stops.length - 1]?.color) : '#DDDDDD', visibleIf: (v) => v.kind === 'gradient' || v.kind === 'pattern' },
      { key: 'angle', label: 'Angle', type: 'number', value: cur?.type === 'gradient' ? cur.angle ?? 90 : 90, min: 0, max: 359, suffix: '°', visibleIf: (v) => v.kind === 'gradient' },
      { key: 'radial', label: 'Radial', type: 'checkbox', value: cur?.type === 'gradient' && cur.path === 'radial', visibleIf: (v) => v.kind === 'gradient' },
      { key: 'pattern', label: 'Pattern', type: 'select', options: ['dots', 'horizontal', 'vertical', 'downward diagonal', 'upward diagonal', 'cross'], value: 'dots', visibleIf: (v) => v.kind === 'pattern' },
      { key: 'pick', label: 'Picture', type: 'button', value: 'Choose Picture…', visibleIf: (v) => v.kind === 'image', onClick: async (_v, ctl) => { const f = (await pickFile('image/*'))[0]; if (!f) return; const { mime, b64 } = dataUrlParts(await readFileAsDataURL(f)); picture = app.deck.addMedia({ mime: f.type || mime, b64, name: f.name }); ctl.set('pickedName', f.name); } },
      { key: 'pickedName', label: 'Chosen', type: 'info', html: '', visibleIf: (v) => v.kind === 'image' },
      { key: 'tile', label: 'Tile picture as texture', type: 'checkbox', value: cur?.type === 'image' && cur.mode === 'tile', visibleIf: (v) => v.kind === 'image' },
      { key: 'hide', label: 'Hide background graphics', type: 'checkbox', value: !!s.hideMasterShapes },
      { key: 'all', label: 'Apply to all slides', type: 'checkbox', value: false },
    ],
  });
  if (!r) return;
  let fill: Fill | undefined;
  if (r.kind === 'solid') fill = { type: 'solid', color: r.c1 };
  else if (r.kind === 'gradient') fill = { type: 'gradient', angle: +r.angle || 0, ...(r.radial ? { path: 'radial' as const } : {}), stops: [{ pos: 0, color: r.c1 }, { pos: 1, color: r.c2 }] };
  else if (r.kind === 'image') { if (!picture) { toast('Choose a picture first.'); return; } fill = { type: 'image', media: picture, mode: r.tile ? 'tile' : 'stretch' }; }
  else if (r.kind === 'pattern') fill = { type: 'pattern', fg: r.c1, bg: r.c2, preset: String(r.pattern) };
  const targets = r.all ? app.deck.slides : app.targetSlides();
  app.deck.transact('Format Background', () => { for (const t of targets) { if (fill) t.bg = clone(fill); else delete t.bg; t.hideMasterShapes = r.hide || undefined; } }, targets.map((t) => t.id));
}

// ------------------------------------------------------------------------------------------
// Slide size

/** Changes the slide size, scaling every slide, layout and master. 'fit' keeps everything visible; 'max' fills the new size. */
export function resizeDeck(deck: Deck, w: number, h: number, mode: 'fit' | 'max' = 'fit'): void {
  const { w: W0, h: H0 } = deck.data.size;
  if (w === W0 && h === H0) return;
  const sx = w / W0, sy = h / H0;
  const s = mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy);
  const ox = (w - W0 * s) / 2, oy = (h - H0 * s) / 2;
  const scaleEl = (e: Element) => {
    if (e.x != null) e.x = Math.round((e.x * s + ox) * 100) / 100;
    if (e.y != null) e.y = Math.round((e.y * s + oy) * 100) / 100;
    if (e.w != null) e.w = Math.round(e.w * s * 100) / 100;
    if (e.h != null) e.h = Math.round(e.h * s * 100) / 100;
    if (e.kind === 'group') e.children.forEach(scaleEl);
    if (e.kind === 'table') { e.cols = e.cols.map((c) => c * s); e.rows.forEach((r) => (r.h *= s)); }
    if (e.kind === 'shape' && e.text) {
      for (const p of e.text.paras) for (const r of p.runs) if (r.size) r.size = Math.max(4, Math.round(r.size * s * 2) / 2);
    }
  };
  for (const o of [...deck.data.masters, ...deck.data.layouts, ...deck.data.slides]) o.elements.forEach(scaleEl);
  for (const m of deck.data.masters) for (const k of ['title', 'body', 'other'] as const) for (const lv of m.styles[k]) if (lv.run?.size) lv.run.size = Math.max(4, Math.round(lv.run.size * s * 2) / 2);
  for (const sl of deck.data.slides) if (sl.ink) sl.ink = sl.ink.map((i) => ({ ...i, d: i.d.replace(/-?\d+(?:\.\d+)?/g, (n, off, str) => { const idx = (str.slice(0, off).match(/-?\d+(?:\.\d+)?/g) || []).length; return String(+(idx % 2 ? +n * s + oy : +n * s + ox).toFixed(1)); }), width: i.width * s }));
  deck.data.size = { w, h };
}

async function slideSize(app: App, preset?: string): Promise<void> {
  let w: number, hh: number;
  const p = SLIDE_SIZES.find((x) => x.id === preset);
  if (p) { w = p.w; hh = p.h; }
  else {
    const cur = app.deck.size;
    const r = await openDialog({ title: 'Slide Size', fields: [
      { key: 'preset', label: 'Slides sized for', type: 'select', options: [{ value: '', label: 'Custom' }, ...SLIDE_SIZES.map((x) => ({ value: x.id, label: x.label }))], value: SLIDE_SIZES.find((x) => x.w === cur.w && x.h === cur.h)?.id || '' },
      { key: 'w', label: 'Width (inches)', type: 'number', value: +(cur.w / 72).toFixed(2), step: 0.01, min: 1, max: 56, visibleIf: (v) => !v.preset },
      { key: 'h', label: 'Height (inches)', type: 'number', value: +(cur.h / 72).toFixed(2), step: 0.01, min: 1, max: 56, visibleIf: (v) => !v.preset },
      { key: 'portrait', label: 'Portrait orientation', type: 'checkbox', value: cur.h > cur.w },
      { key: 'mode', label: 'When scaling content', type: 'radio', options: [{ value: 'fit', label: 'Ensure Fit (scale down to keep everything visible)' }, { value: 'max', label: 'Maximize (fill the new size; some content may extend off the slide)' }], value: 'fit' },
    ] });
    if (!r) return;
    const pp = SLIDE_SIZES.find((x) => x.id === r.preset);
    w = pp ? pp.w : Math.round(+r.w * 72); hh = pp ? pp.h : Math.round(+r.h * 72);
    if (r.portrait !== hh > w) [w, hh] = [hh, w];
    app.deck.transact('Slide Size', () => resizeDeck(app.deck, w, hh, r.mode));
    app.tab.ui.layout();
    return;
  }
  app.deck.transact('Slide Size', () => resizeDeck(app.deck, w, hh, 'fit'));
  app.tab.ui.layout?.();
}

// ------------------------------------------------------------------------------------------
// Design Ideas and layout rules

interface Content { title: boolean; bullets: number; pictures: number; groups: number; words: number }

function contentOf(s: Slide): Content {
  const t = titleShape(s);
  const title = !!t?.text?.paras.some((p) => p.runs.some((r) => r.text.trim()));
  let bullets = 0, words = 0, groups = 0;
  for (const e of s.elements) {
    if (e.kind === 'shape' && e !== t && e.text) {
      const ps = e.text.paras.filter((p) => p.runs.some((r) => r.text.trim()));
      if (ps.length) groups++;
      bullets += ps.length;
      words += ps.reduce((a, p) => a + p.runs.map((r) => r.text).join('').split(/\s+/).filter(Boolean).length, 0);
    }
  }
  return { title, bullets, pictures: s.elements.filter((e) => e.kind === 'picture').length, groups, words };
}

/** The layout type that best fits a slide's content (Layout by Outline Level). */
export function suggestLayoutType(s: Slide, index: number): string {
  const c = contentOf(s);
  if (index === 0 && c.bullets <= 2 && !c.pictures) return 'title';
  if (c.pictures && c.bullets) return 'picTx';
  if (c.groups >= 2) return 'twoObj';
  if (c.title && !c.bullets && !c.pictures) return 'secHead';
  if (c.title && c.bullets) return 'obj';
  if (!c.title && !c.bullets) return 'blank';
  return 'obj';
}

/** Moves a slide's content onto another layout: title and text placeholders keep their text. */
export function relayout(deck: Deck, s: Slide, layoutId: string): void {
  const lay = deck.layout(layoutId);
  const title = titleShape(s), body = bodyShape(s);
  const others = s.elements.filter((e) => e !== title && e !== body && !(e.ph && e.kind === 'shape' && !(e as ShapeElement).text?.paras.some((p) => p.runs.some((r) => r.text))));
  const fresh = deck.makeSlide(lay.id);
  const nt = titleShape(fresh), nb = bodyShape(fresh);
  if (nt && title?.text) nt.text = clone(title.text);
  if (nb && body?.text) nb.text = clone(body.text);
  const keep: Element[] = [];
  if (title && !nt) keep.push({ ...clone(title), ph: undefined, ...resolveBox(deck, s, title) } as Element);
  if (body && !nb) keep.push({ ...clone(body), ph: undefined, ...resolveBox(deck, s, body) } as Element);
  // Pictures go into a picture placeholder's box when the new layout has one.
  const picPh = lay.elements.find((e) => e.ph?.type === 'pic');
  for (const o of others) {
    if (o.kind === 'picture' && picPh && picPh.w && picPh.h) { const k = clone(o); const b = resolveBox(deck, s, o); const sc = Math.min(picPh.w / b.w, picPh.h / b.h); Object.assign(k, { w: b.w * sc, h: b.h * sc, x: picPh.x! + (picPh.w - b.w * sc) / 2, y: picPh.y! + (picPh.h - b.h * sc) / 2 }); keep.push(k); }
    else keep.push(o);
  }
  s.layout = lay.id;
  s.elements = [...fresh.elements.filter((e) => e.ph?.type !== 'pic' || !keep.some((k) => k.kind === 'picture')), ...keep];
  s.anims = s.anims.filter((a) => s.elements.some((e) => e.id === a.target));
}

function designIdeas(app: App, s: Slide): { label: string; apply: (s: Slide) => void; preview: Slide }[] {
  const d = app.deck;
  const out: { label: string; apply: (s: Slide) => void; preview: Slide }[] = [];
  const master = d.masterOf(s).id;
  const idx = d.slideIndex(s.id);
  const best = d.layoutByType(suggestLayoutType(s, idx), master);
  const add = (label: string, fn: (x: Slide) => void) => { const p = clone(s); try { fn(p); out.push({ label, apply: fn, preview: p }); } catch { /* idea not applicable */ } };
  if (best && best.id !== s.layout) add(`Layout: ${best.name}`, (x) => relayout(d, x, best.id));
  for (const l of d.layoutsOf(master)) if (l.id !== s.layout && l.id !== best?.id && ['title', 'obj', 'twoObj', 'secHead', 'picTx', 'objTx', 'titleOnly'].includes(l.type || '')) add(`Layout: ${l.name}`, (x) => relayout(d, x, l.id));
  const styles = backgroundStyles();
  for (const k of [6, 5, 7, 9]) add(`Background: ${styles[k].label}`, (x) => { x.bg = clone(styles[k].fill); });
  const c = contentOf(s);
  if (c.pictures === 1) add('Full-bleed picture', (x) => {
    const p = x.elements.find((e) => e.kind === 'picture')!;
    Object.assign(p, { x: 0, y: 0, w: d.size.w, h: d.size.h });
    x.elements = [p, ...x.elements.filter((e) => e !== p)];
    const t = titleShape(x);
    if (t) { t.fill = { type: 'solid', color: { s: 'tx1', alpha: 0.55 } }; t.text = { ...(t.text || { paras: [] }), paras: (t.text?.paras || []).map((pp) => ({ ...pp, runs: pp.runs.map((r) => ({ ...r, color: '#FFFFFF' })) })) }; }
  });
  if (c.bullets >= 3 && c.bullets <= 6 && !c.pictures) add('Bullets as a process diagram', (x) => {
    const b = bodyShape(x);
    if (!b?.text) throw new Error('no body');
    const items = b.text.paras.map((p) => ({ text: p.runs.map((r) => r.text).join('').trim(), level: p.level })).filter((i) => i.text);
    const box = resolveBox(d, x, b);
    const gap = 12, n = items.filter((i) => i.level === 0).length || 1, cw = (box.w - gap * (n - 1)) / n;
    const shapes: Element[] = items.filter((i) => i.level === 0).map((it, i) => ({ id: newId('sp'), kind: 'shape', geom: 'chevron', x: box.x + i * (cw + gap), y: box.y + box.h * 0.25, w: cw, h: box.h * 0.5, fill: { type: 'solid', color: `accent${(i % 6) + 1}` }, line: { fill: { type: 'none' } }, text: { anchor: 'ctr', autofit: 'shrink', paras: [{ level: 0, align: 'ctr', runs: [{ text: it.text, color: 'bg1', b: true, size: 18 }] }] } } as ShapeElement));
    x.elements = [...x.elements.filter((e) => e !== b), ...shapes];
  });
  return out.slice(0, 10);
}

registerPane({
  id: 'designIdeas', title: 'Design Ideas',
  render(app, el) { this.update!(app, el, {}); },
  update(app, el) {
    const s = app.slide;
    const sig = `${app.deck.version}:${s?.id}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    clear(el);
    if (!s) { el.appendChild(h('p', { class: 'ql-help' }, 'Add a slide to get design ideas.')); return; }
    el.appendChild(h('p', { class: 'ql-help' }, 'Suggestions for this slide, made on this device from its content. Click one to apply it (you can undo).'));
    for (const idea of designIdeas(app, s)) {
      const card = h('button', { class: 'qs-idea', title: idea.label, style: 'display:block;width:100%;margin:6px 0;padding:4px;background:none;border:1px solid var(--line,#ccc);border-radius:6px;cursor:pointer' }, h('div', { class: 'qs-idea-img' }), h('div', { class: 'ql-help' }, idea.label));
      (card.querySelector('.qs-idea-img') as HTMLElement).innerHTML = slideSvg(app.deck, idea.preview, { mode: 'thumb' });
      card.addEventListener('click', () => { const cur = app.slide; if (cur) app.deck.transact('Design Idea', () => idea.apply(cur), [cur.id]); });
      el.appendChild(card);
    }
  },
});

// ------------------------------------------------------------------------------------------

def([
  {
    id: 'design.theme', label: 'Themes', icon: 'palette', tab: 'Design', group: 'Themes', kind: 'gallery', edits: true, popular: true,
    tip: 'Change the colors, fonts and background of the whole presentation (original themes)',
    run: (app, i?: number) => { if (i == null) return; app.deck.transact('Theme', () => applyThemePreset(app.deck, +i)); },
    menu: (app) => {
      const cur = currentTheme(app).name;
      return [...THEME_PRESETS.map((p, i) => ({ id: 'design.theme', arg: i, label: p.name, checked: cur === p.name, preview: `font-family:"${p.fonts.major}";border-bottom:4px solid ${p.colors.accent1};background:${p.bg ? p.colors[p.bg as SchemeColor] : p.colors.lt1};color:${p.bg ? p.colors.lt1 : p.colors.dk1};padding:0 4px` })),
        { separator: true }, { id: 'design.applyThemeSelected', label: 'Apply to Selected Slides…' }, { id: 'design.browseThemes', label: 'Browse for Themes…' }, { id: 'design.saveTheme', label: 'Save Current Theme…' }];
    },
  },
  ...THEME_PRESETS.map((p, i) => ({ id: `design.theme.${p.name.toLowerCase()}`, label: `Theme: ${p.name}`, icon: 'palette', tab: 'Design', group: 'Themes', edits: true, run: (app: App) => app.exec('design.theme', i) })),
  {
    id: 'design.applyThemeAll', label: 'Apply Theme to All Slides', icon: 'select_all', tab: 'Design', group: 'Themes', edits: true,
    run: async (app, i?: number) => {
      if (i == null) { const r = await openDialog({ title: 'Apply Theme to All Slides', fields: [{ key: 't', label: 'Theme', type: 'select', options: THEME_PRESETS.map((p, k) => ({ value: k, label: p.name })) }] }); if (!r) return; i = +r.t; }
      app.deck.transact('Theme', () => applyThemePreset(app.deck, i!));
    },
  },
  {
    id: 'design.applyThemeSelected', label: 'Apply Theme to Selected Slides', icon: 'filter_center_focus', tab: 'Design', group: 'Themes', edits: true,
    tip: 'Give only the selected slides a different theme (adds a second slide master)',
    run: async (app, i?: number) => {
      if (i == null) { const r = await openDialog({ title: 'Apply Theme to Selected Slides', fields: [{ key: 't', label: 'Theme', type: 'select', options: THEME_PRESETS.map((p, k) => ({ value: k, label: p.name })) }] }); if (!r) return; i = +r.t; }
      const ids = app.targetSlides().map((s) => s.id);
      const d = app.deck;
      d.transact('Theme for Selected Slides', () => {
        const map = addMasterWithTheme(d, i!);
        for (const id of ids) { const s = d.slide(id)!; const to = map.get(s.layout) || [...map.values()][0]; if (to) s.layout = to; }
      });
    },
  },
  {
    id: 'design.browseThemes', label: 'Browse for Themes', icon: 'folder_open', tab: 'Design', group: 'Themes', edits: true,
    tip: 'Use the theme, masters and layouts of another presentation or template (.pptx, .potx, .odp, .otp, .qsp)',
    run: async (app) => {
      const f = (await pickFile('.pptx,.potx,.pptm,.odp,.otp,.fodp,.qsp,.json'))[0];
      if (!f) return;
      const { importDeck } = await import('../io');
      const src = (await importDeck(new Uint8Array(await f.arrayBuffer()), f.name)).deck;
      const d = app.deck;
      const replace = await confirmDialog('Browse for Themes', `Use the design of "${f.name}" for all slides? (Choose Cancel to keep the current design.)`, 'Apply to All');
      if (!replace) return;
      d.transact('Apply Design', () => {
        Object.assign(d.media, src.media);
        const oldLayouts = d.data.layouts;
        d.data.themes = clone(src.data.themes); d.data.masters = clone(src.data.masters); d.data.layouts = clone(src.data.layouts);
        for (const s of d.slides) {
          const t = oldLayouts.find((l) => l.id === s.layout)?.type;
          const nl = (t && d.data.layouts.find((l) => l.type === t)) || d.data.layouts.find((l) => l.type === 'obj') || d.data.layouts[0];
          s.layout = nl.id;
        }
        if (src.data.size.w !== d.size.w || src.data.size.h !== d.size.h) {
          // Masters come from the other size: scale the slides' own content to it.
          const keepM = d.data.masters, keepL = d.data.layouts;
          d.data.masters = []; d.data.layouts = [];
          const target = src.data.size;
          resizeDeck(d, target.w, target.h, 'fit');
          d.data.masters = keepM; d.data.layouts = keepL;
        }
      });
      app.tab.ui.layout();
    },
  },
  {
    id: 'design.saveTheme', label: 'Save Current Theme', icon: 'bookmark_add', tab: 'Design', group: 'Themes', edits: false,
    tip: 'Save this presentation\'s design (masters, layouts and theme) as a template under File ▸ New ▸ My Templates, or download it',
    run: async (app) => {
      const name = await promptDialog('Save Current Theme', 'Template name', currentTheme(app).name);
      if (!name) return;
      const t = new Deck(clone({ ...app.deck.data, slides: [], sections: [], customShows: [] }));
      const used = new Set<string>();
      for (const o of [...t.data.masters, ...t.data.layouts]) for (const e of o.elements) { if (e.kind === 'picture') used.add(e.media); if ((e as ShapeElement).fill?.type === 'image') used.add(((e as ShapeElement).fill as any).media); }
      for (const o of [...t.data.masters, ...t.data.layouts]) if (o.bg?.type === 'image') used.add(o.bg.media);
      for (const id of used) if (app.deck.media[id]) t.media[id] = app.deck.media[id];
      t.data.slides.push(t.makeSlide((t.layoutByType('title') || t.data.layouts[0]).id));
      await kvSet(`tpl:${newId('t')}`, { name, json: t.toJSON() });
      const blob = new Blob([JSON.stringify(t.toJSON())], { type: 'application/json' });
      toast(`Saved "${name}" to My Templates.`, { action: 'Download', onAction: () => download(blob, `${name}.json`) });
    },
  },
  {
    id: 'design.colors', label: 'Colors', icon: 'format_color_fill', tab: 'Design', group: 'Variants', kind: 'menu', edits: true,
    tip: 'Change the theme colors',
    run: (app, i?: number) => {
      if (i == null) { app.exec('design.customColors'); return; }
      const p = THEME_PRESETS[+i];
      app.deck.transact('Theme Colors', () => { for (const t of app.deck.data.themes) t.colors = { ...p.colors }; });
    },
    menu: () => [...THEME_PRESETS.map((p, i) => ({ id: 'design.colors', arg: i, label: p.name, preview: `background:linear-gradient(90deg,${['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k, j) => `${(p.colors as any)[k]} ${j * 16.6}% ${(j + 1) * 16.6}%`).join(',')});color:#fff;padding:0 6px` })), { separator: true }, { id: 'design.customColors', label: 'Customize Colors…' }],
  },
  {
    id: 'design.customColors', label: 'Customize Colors', icon: 'colorize', tab: 'Design', group: 'Variants', edits: true,
    run: async (app) => {
      const t = currentTheme(app);
      const names: Record<string, string> = { dk1: 'Text/Background – Dark 1', lt1: 'Text/Background – Light 1', dk2: 'Text/Background – Dark 2', lt2: 'Text/Background – Light 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6', hlink: 'Hyperlink', folHlink: 'Followed Hyperlink' };
      const r = await openDialog({ title: 'Customize Theme Colors', fields: SCHEME_KEYS.map((k) => ({ key: k, label: names[k], type: 'color' as const, value: t.colors[k], half: true })) });
      if (!r) return;
      app.deck.transact('Theme Colors', () => { for (const k of SCHEME_KEYS) t.colors[k] = String(r[k]).toUpperCase(); });
    },
  },
  {
    id: 'design.fonts', label: 'Fonts', icon: 'font_download', tab: 'Design', group: 'Variants', kind: 'menu', edits: true,
    tip: 'Change the theme fonts for headings and body text',
    run: (app, arg?: { major: string; minor: string }) => {
      if (!arg) { app.exec('design.customFonts'); return; }
      app.deck.transact('Theme Fonts', () => { for (const t of app.deck.data.themes) t.fonts = { ...arg }; });
    },
    menu: (app) => {
      const cur = currentTheme(app).fonts;
      const pairs = [...THEME_PRESETS.map((p) => p.fonts), { major: 'Tinos', minor: 'Arimo' }, { major: 'Caladea', minor: 'Carlito' }, { major: 'Gelasio', minor: 'Open Sans' }, { major: 'Lato', minor: 'Lato' }];
      const seen = new Set<string>();
      return [...pairs.filter((p) => { const k = p.major + '|' + p.minor; if (seen.has(k)) return false; seen.add(k); return true; }).map((p) => ({ id: 'design.fonts', arg: p, label: `${p.major} / ${p.minor}`, checked: cur.major === p.major && cur.minor === p.minor, preview: `font-family:"${p.major}"` })), { separator: true }, { id: 'design.customFonts', label: 'Customize Fonts…' }];
    },
  },
  {
    id: 'design.customFonts', label: 'Customize Fonts', icon: 'text_format', tab: 'Design', group: 'Variants', edits: true,
    run: async (app) => {
      const t = currentTheme(app);
      const r = await openDialog({ title: 'Customize Theme Fonts', fields: [{ key: 'major', label: 'Heading font', type: 'combo', options: FONT_LIST, value: t.fonts.major }, { key: 'minor', label: 'Body font', type: 'combo', options: FONT_LIST, value: t.fonts.minor }] });
      if (!r) return;
      app.deck.transact('Theme Fonts', () => { t.fonts = { major: r.major || t.fonts.major, minor: r.minor || t.fonts.minor }; });
    },
  },
  {
    id: 'design.backgroundStyles', label: 'Background Styles', icon: 'wallpaper', tab: 'Design', group: 'Variants', kind: 'menu', edits: true,
    tip: 'Background for the selected slides (or the slide master in Master view)',
    run: (app, i?: number) => {
      if (i == null) { app.exec('design.formatBackground'); return; }
      const st = backgroundStyles()[+i];
      if (!st) return;
      if (app.tab.view === 'master') {
        const o = app.owner!;
        app.deck.transact('Background Style', () => { o.bg = clone(st.fill); });
      } else editSlides(app, 'Background Style', (s) => { s.bg = clone(st.fill); });
    },
    menu: (app) => {
      const s = app.slide || app.deck.data.masters[0];
      const ctx = { theme: app.deck.themeOf(s as any), master: app.deck.masterOf(s as any) };
      return [...backgroundStyles().map((b, i) => ({ id: 'design.backgroundStyles', arg: i, label: b.label, swatch: b.fill.type === 'solid' ? cssColor(b.fill.color, ctx) : b.fill.type === 'gradient' ? cssColor(b.fill.stops[0].color, ctx) : undefined })), { separator: true }, { id: 'design.formatBackground', label: 'Format Background…' }, { id: 'design.backgroundReset', label: 'Reset Slide Background' }];
    },
  },
  {
    id: 'design.slideSize', label: 'Slide Size', icon: 'aspect_ratio', tab: 'Design', group: 'Customize', kind: 'menu', edits: true,
    tip: 'Widescreen, standard, paper, square, portrait or a custom size; content is scaled',
    run: (app, preset?: string) => slideSize(app, preset),
    menu: (app) => [...SLIDE_SIZES.map((s) => ({ id: 'design.slideSize', arg: s.id, label: `${s.label} – ${+(s.w / 72).toFixed(2)} × ${+(s.h / 72).toFixed(2)} in`, checked: app.deck.size.w === s.w && app.deck.size.h === s.h })), { separator: true }, { id: 'design.slideSize', label: 'Custom Slide Size…' }],
  },
  {
    id: 'design.resizeTo', label: 'Resize Presentation', icon: 'photo_size_select_large', tab: 'Design', group: 'Customize', edits: true, origin: 'Canva',
    tip: 'Change the slide size, choosing Maximize or Ensure Fit for the content',
    run: (app) => slideSize(app),
  },
  { id: 'design.formatBackground', label: 'Format Background', icon: 'format_color_fill', tab: 'Design', group: 'Customize', edits: true, isEnabled: (app) => !!app.slide, run: (app) => formatBackground(app) },
  {
    id: 'design.backgroundApplyAll', label: 'Apply Background to All', icon: 'select_all', tab: 'Design', group: 'Customize', edits: true, isEnabled: (app) => !!app.slide,
    tip: 'Give every slide the current slide\'s background',
    run: (app) => { const s = app.slide!; const bg = s.bg; app.deck.transact('Apply Background to All', () => { for (const t of app.deck.slides) { if (bg) t.bg = clone(bg); else delete t.bg; t.hideMasterShapes = s.hideMasterShapes; } }, app.deck.slides.map((x) => x.id)); },
  },
  {
    id: 'design.backgroundReset', label: 'Reset Background', icon: 'format_color_reset', tab: 'Design', group: 'Customize', edits: true, isEnabled: (app) => !!app.slide,
    tip: 'The selected slides follow their layout\'s background again', run: (app) => editSlides(app, 'Reset Background', (s) => { delete s.bg; delete s.hideMasterShapes; }),
  },
  {
    id: 'design.designIdeas', label: 'Design Ideas', icon: 'tips_and_updates', tab: 'Design', group: 'Designer', edits: false, noRecord: true, popular: true,
    tip: 'Layout and background suggestions for the current slide, made on this device', run: (app) => app.ui.togglePane('designIdeas'),
    isActive: (app) => app.ui.paneOpen('designIdeas'),
  },
  {
    id: 'design.restyle', label: 'Restyle Deck', icon: 'style', tab: 'Design', group: 'Designer', edits: true, origin: 'WPS, Gamma',
    tip: 'Apply a theme to every slide and remove fonts, colors and backgrounds set by hand so the deck looks consistent',
    run: async (app) => {
      const r = await openDialog({ title: 'Restyle Deck', fields: [
        { key: 't', label: 'Theme', type: 'select', options: THEME_PRESETS.map((p, k) => ({ value: k, label: p.name })), value: Math.max(0, THEME_PRESETS.findIndex((p) => p.name === currentTheme(app).name)) },
        { key: 'fonts', label: 'Remove fonts set by hand', type: 'checkbox', value: true },
        { key: 'sizes', label: 'Remove font sizes set by hand in placeholders', type: 'checkbox', value: true },
        { key: 'colors', label: 'Remove text colors set by hand', type: 'checkbox', value: false },
        { key: 'bg', label: 'Reset slide backgrounds to the theme', type: 'checkbox', value: true },
      ] });
      if (!r) return;
      app.deck.transact('Restyle Deck', () => {
        applyThemePreset(app.deck, +r.t);
        for (const s of app.deck.slides) {
          if (r.bg) { delete s.bg; delete s.hideMasterShapes; }
          const walk = (els: Element[]) => { for (const e of els) { if (e.kind === 'group') walk(e.children); if (e.kind !== 'shape' || !e.text) continue; for (const p of e.text.paras) for (const run of [...p.runs, ...(p.end ? [p.end] : [])]) { if (r.fonts) delete run.font; if (r.sizes && e.ph) delete run.size; if (r.colors) delete run.color; } } };
          walk(s.elements);
        }
      });
    },
  },
  {
    id: 'design.autoLayoutRules', label: 'Layout by Outline Level', icon: 'auto_awesome_mosaic', tab: 'Design', group: 'Designer', edits: true, origin: 'Persuasion AutoTemplates',
    tip: 'Choose a layout for each slide from its content: title slide, section header, title and content, two content, picture with caption',
    run: async (app) => {
      const d = app.deck;
      const plan = d.slides.map((s, i) => {
        const t = suggestLayoutType(s, i);
        const l = d.layoutByType(t, d.masterOf(s).id);
        return { s, l };
      }).filter((x) => x.l && x.l.id !== x.s.layout);
      if (!plan.length) { toast('Every slide already uses the layout that fits its content.'); return; }
      const ok = await confirmDialog('Layout by Outline Level', `${plan.length} slide(s) will get a new layout:\n${plan.slice(0, 12).map((x) => `Slide ${d.slideIndex(x.s.id) + 1}: ${x.l!.name}`).join('\n')}${plan.length > 12 ? '\n…' : ''}`, 'Apply');
      if (!ok) return;
      d.transact('Layout by Outline Level', () => { for (const x of plan) relayout(d, x.s, x.l!.id); });
    },
  },
]);

