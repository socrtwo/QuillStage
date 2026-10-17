/** Shape Format: change shape, styles, fill, outline, effects, text options, size, Format Shape pane. */
import { def, type MenuEntry } from './registry';
import type { App } from '../app';
import type { Color, Dash, Effects, Element, Fill, Line, ShapeElement, ArrowEnd } from '../model/types';
import { GEOMETRY, SHAPE_GROUPS } from '../model/geometry';
import { applyBody, applyFill, applyLine, applyRun, boxOf, edit, selection, setBox, textTargets } from '../edit/ops';
import { openDialog, toast } from '../ui/dialog';
import { h, clear, download, icon } from '../ui/dom';
import { registerPane, typingIn } from '../ui/panes';
import { cssColor } from '../model/theme';
import { slideSvg } from '../render/slide';
import { isSlide } from '../model/inherit';

const hasSel = (app: App) => app.selected.length > 0;
const shapes = (app: App) => app.selected.filter((e): e is ShapeElement => e.kind === 'shape');
const hasShape = (app: App) => shapes(app).length > 0;
const ACCENTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'tx1'];

async function pickColor(app: App, id: string, opts: { none?: string; auto?: string; title?: string } = {}): Promise<Color | null | undefined> {
  const { themeColorMenu } = await import('../ui/themeColors');
  return themeColorMenu(app, app.ui.anchorFor(id), opts);
}

export const QUICK_STYLES: { label: string; fill: (a: string) => Fill; line: (a: string) => Line; text?: string }[] = [
  { label: 'Colored Fill', fill: (a) => ({ type: 'solid', color: a }), line: (a) => ({ fill: { type: 'solid', color: { s: a, lum: -0.5 } }, width: 1 }), text: 'bg1' },
  { label: 'Subtle Effect', fill: (a) => ({ type: 'solid', color: { s: a, lum: 0.8 } }), line: (a) => ({ fill: { type: 'solid', color: a }, width: 1 }), text: 'tx1' },
  { label: 'Outline Only', fill: () => ({ type: 'none' }), line: (a) => ({ fill: { type: 'solid', color: a }, width: 2 }), text: 'tx1' },
  { label: 'Gradient', fill: (a) => ({ type: 'gradient', angle: 90, stops: [{ pos: 0, color: { s: a, lum: 0.3 } }, { pos: 1, color: { s: a, lum: -0.25 } }] }), line: () => ({ fill: { type: 'none' } }), text: 'bg1' },
  { label: 'Intense', fill: (a) => ({ type: 'solid', color: { s: a, lum: -0.25 } }), line: () => ({ fill: { type: 'solid', color: 'bg1' }, width: 3 }), text: 'bg1' },
];

export const EFFECT_PRESETS: { id: string; label: string; fx: Effects | null }[] = [
  { id: 'none', label: 'No Effects', fx: null },
  { id: 'shadowOuter', label: 'Shadow: Outer', fx: { shadow: { color: '#000000', blur: 6, dist: 4, dir: 45, alpha: 0.4 } } },
  { id: 'shadowSoft', label: 'Shadow: Soft', fx: { shadow: { color: '#000000', blur: 18, dist: 6, dir: 90, alpha: 0.25 } } },
  { id: 'shadowFar', label: 'Shadow: Offset', fx: { shadow: { color: '#000000', blur: 0, dist: 8, dir: 45, alpha: 0.35 } } },
  { id: 'glow', label: 'Glow: Accent', fx: { glow: { color: 'accent1', rad: 8 } } },
  { id: 'glowSoft', label: 'Glow: Soft', fx: { glow: { color: { s: 'accent2', lum: 0.4 }, rad: 14 } } },
  { id: 'soft', label: 'Soft Edges', fx: { softEdge: 6 } },
  { id: 'reflection', label: 'Reflection', fx: { reflection: true } },
];

const DASHES: Dash[] = ['solid', 'sysDot', 'sysDash', 'dash', 'dashDot', 'longDash', 'longDashDot'];
const ARROWS: [ArrowEnd, ArrowEnd, string][] = [['none', 'none', 'No Arrows'], ['none', 'triangle', 'Arrow at End'], ['triangle', 'none', 'Arrow at Start'], ['triangle', 'triangle', 'Arrows at Both Ends'], ['none', 'stealth', 'Stealth Arrow'], ['oval', 'oval', 'Round Ends'], ['diamond', 'triangle', 'Diamond to Arrow']];

function geomMenu(cmd: string): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const g of SHAPE_GROUPS) { if (g === 'Lines') continue; out.push({ heading: g }); for (const [k, d] of Object.entries(GEOMETRY)) if (d.group === g) out.push({ id: cmd, arg: k, label: d.label }); }
  return out;
}

async function sizeDialog(app: App): Promise<void> {
  const e = app.selected[0];
  if (!e) return;
  const b = boxOf(app, e);
  const ratio = b.h ? b.w / b.h : 1;
  const r = await openDialog({ title: 'Size and Position', fields: [
    { key: 'w', label: 'Width (in)', type: 'number', value: +(b.w / 72).toFixed(2), step: 0.01, half: true },
    { key: 'h', label: 'Height (in)', type: 'number', value: +(b.h / 72).toFixed(2), step: 0.01, half: true },
    { key: 'lock', label: 'Lock aspect ratio', type: 'checkbox', value: e.kind === 'picture' },
    { key: 'rot', label: 'Rotation (°)', type: 'number', value: +(b.rot || 0).toFixed(1), min: -360, max: 360 },
    { key: 'x', label: 'Horizontal position from the left edge (in)', type: 'number', value: +(b.x / 72).toFixed(2), step: 0.01, half: true },
    { key: 'y', label: 'Vertical position from the top edge (in)', type: 'number', value: +(b.y / 72).toFixed(2), step: 0.01, half: true },
  ], onChange: (v, ctl, key) => { if (!v.lock) return; if (key === 'w') ctl.set('h', +(v.w / ratio).toFixed(2)); if (key === 'h') ctl.set('w', +(v.h * ratio).toFixed(2)); } });
  if (!r) return;
  edit(app, 'Size and Position', (o) => { const x = o.elements.find((q) => q.id === e.id)!; setBox(app, x, { x: +r.x * 72, y: +r.y * 72, w: Math.max(0.01, +r.w) * 72, h: Math.max(0.01, +r.h) * 72, rot: +r.rot || 0 }); });
}

function sizeCmd(dim: 'w' | 'h') {
  return {
    id: dim === 'w' ? 'shape.width' : 'shape.height', label: dim === 'w' ? 'Shape Width' : 'Shape Height', icon: dim === 'w' ? 'width' : 'height', tab: 'Shape Format', group: 'Size', kind: 'size' as const, edits: true, isEnabled: hasSel,
    tip: `${dim === 'w' ? 'Width' : 'Height'} in inches`,
    value: (app: App) => { const e = app.selected[0]; return e ? +(boxOf(app, e)[dim] / 72).toFixed(2) : null; },
    run: (app: App, v?: number) => {
      if (v == null || !(+v > 0)) return;
      edit(app, 'Size', () => { for (const e of selection(app)) { const b = boxOf(app, e); const keep = e.kind === 'picture'; const nv = +v * 72; setBox(app, e, dim === 'w' ? { w: nv, ...(keep && b.w ? { h: b.h * nv / b.w } : {}) } : { h: nv, ...(keep && b.h ? { w: b.w * nv / b.h } : {}) }); } });
    },
  };
}

registerPane({
  id: 'formatShape', title: 'Format Shape',
  render(app, el) { this.update!(app, el, {}); },
  update(app, el) {
    const e = app.selected[0];
    const sig = `${app.deck.version}:${e?.id}`;
    if (el.dataset.sig === sig || typingIn(el)) return;
    el.dataset.sig = sig;
    clear(el);
    if (!e) { el.appendChild(h('p', { class: 'ql-help' }, 'Select an object to format it. With nothing selected, use Design ▸ Format Background for the slide.')); return; }
    const owner = app.owner!;
    const ctx = { theme: app.deck.themeOf(owner as any), master: app.deck.masterOf(owner as any) };
    const hex = (c: Color | undefined, d = '#4472C4') => (c ? cssColor(c, ctx, d).slice(0, 7) : d);
    const row = (label: string, ctl: HTMLElement) => h('div', { class: 'ql-field' }, h('label', null, label), ctl);
    const sec = (t: string) => el.appendChild(h('h3', { class: 'ql-pane-h' }, t));
    const s = e as ShapeElement;
    if (e.kind === 'shape' || e.kind === 'picture') {
      sec('Fill and Line');
      if (e.kind === 'shape') {
        const fk = h('select', null, ...['inherit', 'none', 'solid', 'gradient'].map((k) => h('option', { value: k, selected: (s.fill?.type || 'inherit') === k ? '' : null }, k === 'inherit' ? 'Automatic' : k === 'none' ? 'No fill' : k === 'solid' ? 'Solid fill' : 'Gradient fill'))) as HTMLSelectElement;
        const fc = h('input', { type: 'color', value: hex(s.fill?.type === 'solid' ? s.fill.color : s.fill?.type === 'gradient' ? s.fill.stops[0].color : undefined) }) as HTMLInputElement;
        const tr = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round((1 - ((s.fill?.type === 'solid' && typeof s.fill.color === 'object' ? s.fill.color.alpha : 1) ?? 1)) * 100)) }) as HTMLInputElement;
        const applyF = () => {
          const k = fk.value;
          const alpha = 1 - +tr.value / 100;
          const color: Color = alpha < 1 ? { s: fc.value, alpha } : fc.value;
          edit(app, 'Fill', (o) => { const x = o.elements.find((q) => q.id === e.id) as ShapeElement; if (k === 'inherit') delete x.fill; else if (k === 'none') x.fill = { type: 'none' }; else if (k === 'solid') x.fill = { type: 'solid', color }; else x.fill = { type: 'gradient', angle: 90, stops: [{ pos: 0, color }, { pos: 1, color: { s: fc.value, lum: -0.35 } }] }; });
        };
        fk.addEventListener('change', applyF); fc.addEventListener('change', applyF); tr.addEventListener('change', applyF);
        el.append(row('Fill', fk), row('Color', fc), row('Transparency', tr));
      }
      const ln = (e as ShapeElement).line;
      const lk = h('select', null, ...['inherit', 'none', 'solid'].map((k) => h('option', { value: k, selected: ((ln?.fill?.type === 'none' ? 'none' : ln?.fill ? 'solid' : 'inherit')) === k ? '' : null }, k === 'inherit' ? 'Automatic' : k === 'none' ? 'No line' : 'Solid line'))) as HTMLSelectElement;
      const lc = h('input', { type: 'color', value: hex(ln?.fill?.type === 'solid' ? ln.fill.color : undefined, '#000000') }) as HTMLInputElement;
      const lw = h('input', { type: 'number', min: '0', max: '100', step: '0.25', value: String(ln?.width ?? 1) }) as HTMLInputElement;
      const ld = h('select', null, ...DASHES.map((d) => h('option', { value: d, selected: (ln?.dash || 'solid') === d ? '' : null }, d))) as HTMLSelectElement;
      const applyL = () => edit(app, 'Line', (o) => { const x = o.elements.find((q) => q.id === e.id) as ShapeElement; if (lk.value === 'inherit') delete x.line; else if (lk.value === 'none') x.line = { fill: { type: 'none' } }; else x.line = { ...(x.line || {}), fill: { type: 'solid', color: lc.value }, width: +lw.value || 1, dash: ld.value as Dash }; });
      for (const c of [lk, lc, lw, ld]) c.addEventListener('change', applyL);
      el.append(row('Line', lk), row('Line color', lc), row('Width (pt)', lw), row('Dash', ld));
    }
    sec('Size and Position');
    const b = boxOf(app, e);
    const num = (v: number, k: 'x' | 'y' | 'w' | 'h' | 'rot') => { const i = h('input', { type: 'number', step: k === 'rot' ? '1' : '0.01', value: String(k === 'rot' ? +(v.toFixed(1)) : +(v / 72).toFixed(2)) }) as HTMLInputElement; i.addEventListener('change', () => edit(app, 'Size and Position', (o) => { const x = o.elements.find((q) => q.id === e.id)!; setBox(app, x, { [k]: k === 'rot' ? +i.value : +i.value * 72 }); })); return i; };
    el.append(row('Width (in)', num(b.w, 'w')), row('Height (in)', num(b.h, 'h')), row('Left (in)', num(b.x, 'x')), row('Top (in)', num(b.y, 'y')), row('Rotation (°)', num(b.rot || 0, 'rot')));
    if (e.kind === 'shape') {
      sec('Text Box');
      const t = s.text || { paras: [] };
      const anchor = h('select', null, ...[['t', 'Top'], ['ctr', 'Middle'], ['b', 'Bottom']].map(([v, l]) => h('option', { value: v, selected: (t.anchor || 't') === v ? '' : null }, l))) as HTMLSelectElement;
      const fit = h('select', null, ...[['none', 'Do not autofit'], ['shrink', 'Shrink text on overflow'], ['resize', 'Resize shape to fit text']].map(([v, l]) => h('option', { value: v, selected: (t.autofit || 'none') === v ? '' : null }, l))) as HTMLSelectElement;
      const wrap = h('input', { type: 'checkbox', checked: t.wrap !== false }) as HTMLInputElement;
      anchor.addEventListener('change', () => applyBody(app, { anchor: anchor.value as any }));
      fit.addEventListener('change', () => applyBody(app, { autofit: fit.value as any, fontScale: undefined }));
      wrap.addEventListener('change', () => applyBody(app, { wrap: wrap.checked }));
      el.append(row('Vertical alignment', anchor), row('Autofit', fit), row('Wrap text in shape', wrap));
    }
    sec('Alt Text');
    const alt = h('textarea', { rows: '3', style: 'width:100%' }) as HTMLTextAreaElement;
    alt.value = e.alt || '';
    alt.addEventListener('change', () => edit(app, 'Alt Text', (o) => { const x = o.elements.find((q) => q.id === e.id)!; x.alt = alt.value || undefined; }));
    const nm = h('input', { type: 'text', value: e.name || '' }) as HTMLInputElement;
    nm.addEventListener('change', () => edit(app, 'Rename Object', (o) => { const x = o.elements.find((q) => q.id === e.id)!; x.name = nm.value || undefined; }));
    el.append(alt, row('Name (used by Smooth Morph)', nm));
  },
});

def([
  {
    id: 'shape.change', label: 'Change Shape', icon: 'interests', tab: 'Shape Format', group: 'Insert Shapes', kind: 'menu', edits: true, isEnabled: hasShape,
    run: (app, geom?: string) => { if (!geom || !GEOMETRY[geom]) return; edit(app, 'Change Shape', () => { for (const s of shapes(app)) { s.geom = geom; delete s.adj; delete s.path; } }); },
    menu: () => geomMenu('shape.change'),
  },
  {
    id: 'shape.quickStyle', label: 'Quick Styles', icon: 'style', tab: 'Shape Format', group: 'Shape Styles', kind: 'gallery', edits: true, isEnabled: hasShape,
    run: (app, arg?: string) => {
      if (!arg) return;
      const [si, ai] = arg.split(':').map(Number);
      const st = QUICK_STYLES[si], a = ACCENTS[ai] || 'accent1';
      if (!st) return;
      edit(app, 'Shape Style', () => { for (const s of shapes(app)) { s.fill = st.fill(a); s.line = st.line(a); if (st.text && s.text) for (const p of s.text.paras) for (const r of p.runs) r.color = st.text; } });
    },
    menu: (app) => {
      const ctx = { theme: app.deck.themeOf((app.owner || app.deck.data.masters[0]) as any) };
      return QUICK_STYLES.flatMap((st, si) => [{ heading: st.label } as MenuEntry, ...ACCENTS.map((a, ai) => ({ id: 'shape.quickStyle', arg: `${si}:${ai}`, label: `${st.label} – ${a === 'tx1' ? 'Dark' : `Accent ${ai + 1}`}`, preview: `background:${st.fill(a).type === 'none' ? 'transparent' : cssColor(a, ctx)};border:2px solid ${cssColor(a, ctx)};color:${st.text === 'bg1' ? '#fff' : '#000'};padding:0 4px` }))]);
    },
  },
  {
    id: 'shape.fill', label: 'Shape Fill', icon: 'format_color_fill', tab: 'Shape Format', group: 'Shape Styles', kind: 'color', edits: true, isEnabled: (app) => hasShape(app) || !!app.slide,
    tip: 'Fill the selected shapes (with nothing selected: the slide background)',
    run: async (app, arg?: any) => {
      if (arg && arg !== 'menu') { applyFill(app, typeof arg === 'object' && arg.type ? arg : { type: 'solid', color: arg }); return; }
      const c = await pickColor(app, 'shape.fill', { none: 'No Fill', title: 'Shape Fill' });
      if (c === undefined) return;
      applyFill(app, c === null ? { type: 'none' } : { type: 'solid', color: c });
    },
  },
  {
    id: 'shape.outline', label: 'Shape Outline', icon: 'border_color', tab: 'Shape Format', group: 'Shape Styles', kind: 'split', edits: true, isEnabled: (app) => app.selected.some((e) => e.kind === 'shape' || e.kind === 'picture'),
    tip: 'Outline color, weight, dashes and arrows',
    run: async (app, arg?: any) => {
      if (arg && typeof arg === 'object') { applyLine(app, arg); return; }
      if (arg === 'none') { applyLine(app, null); return; }
      const c = await pickColor(app, 'shape.outline', { none: 'No Outline', title: 'Shape Outline' });
      if (c === undefined) return;
      applyLine(app, c === null ? null : { fill: { type: 'solid', color: c } });
    },
    menu: () => [{ id: 'shape.outline', label: 'Color…' }, { id: 'shape.outline', arg: 'none', label: 'No Outline' }, { heading: 'Weight' }, ...[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ id: 'shape.outline', arg: { width: w }, label: `${w} pt` })), { heading: 'Dashes' }, ...DASHES.map((d) => ({ id: 'shape.outline', arg: { dash: d }, label: d })), { heading: 'Arrows' }, ...ARROWS.map(([hh, t, l]) => ({ id: 'shape.outline', arg: { head: hh, tail: t }, label: l }))],
  },
  {
    id: 'shape.effects', label: 'Shape Effects', icon: 'auto_fix_high', tab: 'Shape Format', group: 'Shape Styles', kind: 'menu', edits: true, isEnabled: (app) => app.selected.some((e) => e.kind === 'shape' || e.kind === 'picture'),
    run: (app, id?: string) => {
      const p = EFFECT_PRESETS.find((x) => x.id === id);
      if (!p) return;
      edit(app, 'Effects', () => { for (const e of app.selected) if (e.kind === 'shape' || e.kind === 'picture') { if (p.fx) e.effects = { ...(e.effects || {}), ...p.fx }; else delete e.effects; } });
    },
    menu: () => EFFECT_PRESETS.map((p) => ({ id: 'shape.effects', arg: p.id, label: p.label })),
  },
  { id: 'shape.formatPane', label: 'Format Shape', icon: 'format_shapes', tab: 'Shape Format', group: 'Shape Styles', edits: false, noRecord: true, run: (app) => app.ui.togglePane('formatShape'), isActive: (app) => app.ui.paneOpen('formatShape') },
  {
    id: 'shape.textFill', label: 'Text Fill', icon: 'format_color_text', tab: 'Shape Format', group: 'Decorative Text Styles', kind: 'color', edits: true, isEnabled: (app) => textTargets(app).length > 0 || app.tab.ui.editingText,
    run: async (app, arg?: any) => {
      let c: Color | null | undefined = arg && arg !== 'menu' ? arg : await pickColor(app, 'shape.textFill', { auto: 'Automatic', title: 'Text Fill' });
      if (c === undefined) return;
      applyRun(app, { color: c ?? undefined }, 'Text Fill');
    },
  },
  {
    id: 'shape.autofit', label: 'Text Autofit', icon: 'fit_screen', tab: 'Shape Format', group: 'Decorative Text Styles', kind: 'menu', edits: true, isEnabled: hasShape,
    run: (app, mode?: 'none' | 'shrink' | 'resize') => { if (mode) applyBody(app, { autofit: mode, fontScale: undefined, lineReduction: undefined }, 'Autofit'); },
    menu: (app) => { const m = shapes(app)[0]?.text?.autofit || 'none'; return [['none', 'Do Not Autofit'], ['shrink', 'Shrink Text on Overflow'], ['resize', 'Resize Shape to Fit Text']].map(([v, l]) => ({ id: 'shape.autofit', arg: v, label: l, checked: m === v })); },
  },
  {
    id: 'shape.wrapText', label: 'Wrap Text in Shape', icon: 'wrap_text', tab: 'Shape Format', group: 'Decorative Text Styles', kind: 'toggle', edits: true, isEnabled: hasShape,
    isActive: (app) => shapes(app)[0]?.text?.wrap !== false, run: (app) => applyBody(app, { wrap: shapes(app)[0]?.text?.wrap === false }, 'Wrap Text'),
  },
  {
    id: 'shape.textMargins', label: 'Text Margins', icon: 'padding', tab: 'Shape Format', group: 'Decorative Text Styles', edits: true, isEnabled: hasShape,
    run: async (app) => {
      const cur = shapes(app)[0]?.text?.insets || [7.2, 3.6, 7.2, 3.6];
      const r = await openDialog({ title: 'Text Margins', fields: (['Left', 'Top', 'Right', 'Bottom'] as const).map((l, i) => ({ key: String(i), label: `${l} (in)`, type: 'number' as const, value: +(cur[i] / 72).toFixed(2), step: 0.01, min: 0, half: true })) });
      if (!r) return;
      applyBody(app, { insets: [0, 1, 2, 3].map((i) => Math.max(0, +r[i] * 72)) as [number, number, number, number] }, 'Text Margins');
    },
  },
  {
    id: 'shape.decorative', label: 'Mark as Decorative', icon: 'hide_source', tab: 'Shape Format', group: 'Accessibility', kind: 'toggle', edits: true, isEnabled: hasSel,
    tip: 'Screen readers skip decorative objects, and Check Accessibility does not ask for alt text',
    isActive: (app) => !!app.selected[0]?.decorative,
    run: (app) => { const on = !app.selected[0]?.decorative; edit(app, 'Decorative', () => { for (const e of app.selected) e.decorative = on || undefined; }); },
  },
  sizeCmd('h'), sizeCmd('w'),
  { id: 'shape.sizeDialog', label: 'Size and Position', icon: 'photo_size_select_large', tab: 'Shape Format', group: 'Size', edits: true, isEnabled: hasSel, run: (app) => sizeDialog(app) },
  { id: 'shape.editText', label: 'Edit Text', icon: 'edit', tab: 'Shape Format', group: 'Insert Shapes', edits: true, isEnabled: (app) => app.selected.length === 1 && app.selected[0].kind === 'shape', run: (app) => app.tab.ui.editText(app.selected[0].id) },
  {
    id: 'shape.saveAsPicture', label: 'Save as Picture', icon: 'image', tab: 'Shape Format', group: 'Size', edits: false, noRecord: true, isEnabled: hasSel,
    tip: 'Save the selected objects as an SVG picture',
    run: (app) => {
      const o = app.owner;
      if (!o) return;
      const sel = app.selected;
      const boxes = sel.map((e) => boxOf(app, e));
      const x = Math.min(...boxes.map((b) => b.x)) - 4, y = Math.min(...boxes.map((b) => b.y)) - 4;
      const w = Math.max(...boxes.map((b) => b.x + b.w)) - x + 4, hh = Math.max(...boxes.map((b) => b.y + b.h)) - y + 4;
      const tmp = { ...(o as any), elements: sel, bg: { type: 'none' }, hideMasterShapes: true, ink: undefined };
      let svg = slideSvg(app.deck, tmp, { mode: 'show', ink: false });
      svg = svg.replace(/viewBox="[^"]*" width="[^"]*" height="[^"]*"/, `viewBox="${x} ${y} ${w} ${hh}" width="${w}" height="${hh}"`).replace(/<rect x="0" y="0"[^>]*class="qs-bg"\/>/, '');
      download(new Blob([svg], { type: 'image/svg+xml' }), `${(sel[0].name || 'picture').replace(/[^\w -]/g, '')}.svg`);
    },
  },
]);

