/** Insert tab: shapes, text boxes, pictures, tables, charts, diagrams, links, text fields, symbols, media. */
import { def, getCommand, type MenuEntry } from './registry';
import type { App } from '../app';
import type { ChartElement, Element, GroupElement, Hyperlink, MediaElement, PictureElement, Run, ShapeElement, TableCell, TableElement, ChartType, Paragraph } from '../model/types';
import { newId } from '../model/deck';
import { GEOMETRY, SHAPE_GROUPS } from '../model/geometry';
import { edit, insertElement, newShape, newTextBox, placeNew, selection, applyRun, textTargets } from '../edit/ops';
import { openDialog, toast, promptDialog, showMenu } from '../ui/dialog';
import { h, pickFile, readFileAsDataURL } from '../ui/dom';
import { slideTitle } from '../render/slide';

const canvasOf = (app: App): any => (app.tab?.ui as any)?.canvas;
const hasOwner = (app: App) => !!app.owner;

// ------------------------------------------------------------------------------------------
// Helpers shared with other modules

export function dataUrlParts(url: string): { mime: string; b64: string } {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return { mime: 'application/octet-stream', b64: '' };
  return { mime: m[1] || 'application/octet-stream', b64: m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3])))) };
}

export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || /jsdom/i.test(navigator.userAgent)) { resolve({ w: 400, h: 300 }); return; }
    const img = new Image();
    const t = setTimeout(() => resolve({ w: 400, h: 300 }), 5000);
    img.onload = () => { clearTimeout(t); resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 }); };
    img.onerror = () => { clearTimeout(t); resolve({ w: 400, h: 300 }); };
    img.src = url;
  });
}

/** Fits w×h (pixels) inside the slide (at most 80% of each side), keeping the aspect ratio; points at 96 ppi. */
export function fitBox(app: App, pw: number, ph: number, maxFrac = 0.8): { x: number; y: number; w: number; h: number } {
  const { w: SW, h: SH } = app.deck.size;
  let w = pw * 0.75, hh = ph * 0.75;
  const s = Math.min(1, (SW * maxFrac) / w, (SH * maxFrac) / hh);
  w *= s; hh *= s;
  return { x: (SW - w) / 2, y: (SH - hh) / 2, w, h: hh };
}

export async function pictureFromFile(app: App, f: Blob, name = ''): Promise<{ media: string; size: { w: number; h: number }; url: string }> {
  const url = await readFileAsDataURL(f);
  const { mime, b64 } = dataUrlParts(url);
  const media = app.deck.addMedia({ mime: f.type || mime, b64, name: name || (f as File).name });
  return { media, size: await imageSize(url), url };
}

/** Inserts text at the caret when text is being edited, otherwise in a new text box. */
export function insertTextOrBox(app: App, text: string, run: Partial<Run> = {}): void {
  if (app.tab.ui.editingText) {
    if (run.field) {
      // A field: commit, then add the field run to the end of the edited paragraph's text.
      const id = app.tab.ui.editing!;
      app.tab.ui.commitText();
      edit(app, 'Insert Field', (o) => {
        const s = o.elements.find((e) => e.id === id) as ShapeElement | undefined;
        if (!s) return;
        s.text ||= { paras: [{ level: 0, runs: [] }] };
        s.text.paras[s.text.paras.length - 1].runs.push({ text, ...run } as Run);
      });
      return;
    }
    document.execCommand('insertText', false, text);
    return;
  }
  const tb = newTextBox(app, '');
  tb.text!.paras = [{ level: 0, runs: [{ text, ...run } as Run] }];
  insertElement(app, tb, 'Insert Text');
}

function armOrInsert(app: App, label: string, make: (box: { x: number; y: number; w: number; h: number }) => Element, immediate: boolean, line = false): void {
  const c = canvasOf(app);
  if (!immediate && c?.setTool) { c.setTool({ kind: 'shape', make, label, line }); toast(`Drag on the slide to draw the ${label.toLowerCase()} (or click for the default size).`); return; }
  const isLine = line;
  insertElement(app, make(placeNew(app, isLine ? 200 : 144, isLine ? 0 : 108)), `Insert ${label}`);
}

// ------------------------------------------------------------------------------------------
// Tables, charts and diagrams (also used by table/chart modules)

export function makeTable(rows: number, cols: number, box: { x: number; y: number; w: number; h: number }): TableElement {
  const cw = box.w / cols, rh = Math.max(24, box.h / rows);
  const cell = (): TableCell => ({ text: { paras: [{ level: 0, runs: [] }] } });
  return { id: newId('tbl'), kind: 'table', name: 'Table', x: box.x, y: box.y, w: box.w, h: rh * rows, cols: Array(cols).fill(cw), rows: Array.from({ length: rows }, () => ({ h: rh, cells: Array.from({ length: cols }, cell) })), style: { firstRow: true, bandRow: true, accent: 'accent1' } };
}

export function parseTsv(text: string): { categories: string[]; series: { name: string; values: (number | null)[] }[] } {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(/\t|,(?=\S)|;/).map((c) => c.trim()));
  const head = rows[0] || [];
  const body = rows.slice(1);
  const series = head.slice(1).map((name, i) => ({ name: name || `Series ${i + 1}`, values: body.map((r) => { const v = parseFloat((r[i + 1] || '').replace(/[^\d.eE+-]/g, '')); return Number.isFinite(v) ? v : null; }) }));
  return { categories: body.map((r) => r[0] || ''), series };
}

export function chartTsv(c: ChartElement['chart']): string {
  return [['', ...c.series.map((s) => s.name)].join('\t'), ...c.categories.map((cat, i) => [cat, ...c.series.map((s) => (s.values[i] ?? ''))].join('\t'))].join('\n');
}

export const CHART_TYPES: { type: ChartType; label: string; icon: string }[] = [
  { type: 'column', label: 'Column', icon: 'bar_chart' }, { type: 'bar', label: 'Bar', icon: 'align_horizontal_left' }, { type: 'line', label: 'Line', icon: 'show_chart' },
  { type: 'area', label: 'Area', icon: 'area_chart' }, { type: 'pie', label: 'Pie', icon: 'pie_chart' }, { type: 'doughnut', label: 'Doughnut', icon: 'donut_large' },
  { type: 'scatter', label: 'Scatter', icon: 'scatter_plot' }, { type: 'radar', label: 'Radar', icon: 'radar' },
];

const SAMPLE_TSV = '\tSeries 1\tSeries 2\tSeries 3\nCategory 1\t4.3\t2.4\t2\nCategory 2\t2.5\t4.4\t2\nCategory 3\t3.5\t1.8\t3\nCategory 4\t4.5\t2.8\t5';

export const DIAGRAM_KINDS = [
  { id: 'list', label: 'Basic List', icon: 'view_agenda' }, { id: 'process', label: 'Process', icon: 'arrow_forward' },
  { id: 'cycle', label: 'Cycle', icon: 'autorenew' }, { id: 'hierarchy', label: 'Hierarchy', icon: 'account_tree' },
  { id: 'pyramid', label: 'Pyramid', icon: 'change_history' }, { id: 'matrix', label: 'Matrix', icon: 'grid_view' },
  { id: 'timeline', label: 'Timeline', icon: 'timeline' },
];

/** Builds a diagram (grouped shapes) from outline items: level 0 items are the main shapes. */
export function buildDiagram(app: App, kind: string, items: { text: string; level: number }[], box = placeNew(app, app.deck.size.w * 0.8, app.deck.size.h * 0.6)): GroupElement {
  const tops = items.filter((i) => i.level === 0);
  const n = Math.max(1, tops.length);
  const kids: Element[] = [];
  const accent = (i: number) => `accent${(i % 6) + 1}`;
  const label = (x: number, y: number, w: number, hh: number, text: string, geom: string, i: number, sub: string[] = []): ShapeElement => ({
    id: newId('sp'), kind: 'shape', geom, name: text || `Shape ${i + 1}`, x, y, w, h: hh,
    fill: { type: 'solid', color: accent(kind === 'list' || kind === 'process' || kind === 'timeline' ? 0 : i) }, line: { fill: { type: 'solid', color: 'bg1' }, width: 1.5 },
    text: { anchor: 'ctr', autofit: 'shrink', paras: [{ level: 0, align: 'ctr', runs: [{ text, color: 'bg1', size: 18, b: true }] }, ...sub.map((s) => ({ level: 0, align: 'ctr' as const, runs: [{ text: s, color: 'bg1', size: 14 }] }))] },
  });
  const subsOf = (idx: number) => { const out: string[] = []; const start = items.indexOf(tops[idx]); for (let k = start + 1; k < items.length && items[k].level > 0; k++) out.push(items[k].text); return out; };
  const { x, y, w, h: hh } = box;
  if (kind === 'process' || kind === 'timeline') {
    const gap = 16, cw = (w - gap * (n - 1)) / n;
    tops.forEach((t, i) => {
      if (kind === 'timeline') {
        kids.push(label(x + i * (cw + gap), y + hh * 0.55, cw, hh * 0.4, t.text, 'roundRect', i, subsOf(i)));
        kids.push({ id: newId('sp'), kind: 'shape', geom: 'ellipse', x: x + i * (cw + gap) + cw / 2 - 9, y: y + hh * 0.35 - 9, w: 18, h: 18, fill: { type: 'solid', color: 'accent2' }, line: { fill: { type: 'none' } } });
      } else kids.push(label(x + i * (cw + gap), y + hh * 0.2, cw, hh * 0.6, t.text, 'chevron', i, subsOf(i)));
    });
    if (kind === 'timeline') kids.unshift({ id: newId('sp'), kind: 'shape', geom: 'line', x, y: y + hh * 0.35, w, h: 0, line: { fill: { type: 'solid', color: 'tx1' }, width: 3, tail: 'triangle' } });
  } else if (kind === 'cycle') {
    const r = Math.min(w, hh) / 2 - 40, cx = x + w / 2, cy = y + hh / 2, sw = Math.min(160, (2 * Math.PI * r) / n * 0.7), sh = sw * 0.6;
    tops.forEach((t, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; kids.push(label(cx + r * Math.cos(a) - sw / 2, cy + r * Math.sin(a) - sh / 2, sw, sh, t.text, 'ellipse', i, subsOf(i))); });
    kids.unshift({ id: newId('sp'), kind: 'shape', geom: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { type: 'none' }, line: { fill: { type: 'solid', color: { s: 'accent1', lum: 0.4 } }, width: 4, dash: 'dash' } });
  } else if (kind === 'hierarchy') {
    const root = tops[0];
    const rest = tops.slice(1).length ? tops.slice(1) : items.filter((i) => i.level === 1).map((i) => ({ ...i, level: 0 }));
    const rw = Math.min(220, w / 3), rh2 = hh / 4;
    if (root) kids.push(label(x + (w - rw) / 2, y, rw, rh2, root.text, 'roundRect', 0));
    const m = Math.max(1, rest.length), gap = 16, cw = (w - gap * (m - 1)) / m;
    rest.forEach((t, i) => {
      const bx = x + i * (cw + gap);
      kids.push({ id: newId('sp'), kind: 'shape', geom: 'bentConnector3', x: x + w / 2, y: y + rh2, w: bx + cw / 2 - (x + w / 2) || 0.01, h: hh * 0.6 - rh2, rot: 90, line: { fill: { type: 'solid', color: 'tx2' }, width: 1.5 } } as ShapeElement);
      kids.push(label(bx, y + hh * 0.6, cw, rh2, t.text, 'roundRect', i + 1));
    });
    // Elbow connectors drawn as simple lines: replace the rotated ones with straight vertical/horizontal lines.
    for (let k = kids.length - 1; k >= 0; k--) if ((kids[k] as ShapeElement).geom === 'bentConnector3') kids.splice(k, 1);
    if (root && rest.length) {
      const midY = y + rh2 + (hh * 0.6 - rh2) / 2;
      const ln = (x1: number, y1: number, x2: number, y2: number): ShapeElement => ({ id: newId('sp'), kind: 'shape', geom: 'line', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), line: { fill: { type: 'solid', color: 'tx2' }, width: 1.5 } });
      kids.push(ln(x + w / 2, y + rh2, x + w / 2, midY));
      const xs = rest.map((_, i) => x + i * (cw + gap) + cw / 2);
      kids.push(ln(Math.min(...xs), midY, Math.max(...xs), midY));
      for (const cx of xs) kids.push(ln(cx, midY, cx, y + hh * 0.6));
    }
  } else if (kind === 'pyramid') {
    const lh = hh / n;
    tops.forEach((t, i) => { const top = (i / n) * w / 2, bot = ((i + 1) / n) * w / 2; const s = label(x + w / 2 - bot, y + i * lh, 2 * bot, lh, t.text, i === 0 ? 'triangle' : 'trapezoid', i); if (i > 0) s.adj = { adj: Math.round(((bot - top) / Math.min(2 * bot, lh)) * 100000) }; kids.push(s); });
  } else if (kind === 'matrix') {
    const c = Math.ceil(Math.sqrt(n)), rws = Math.ceil(n / c), gap = 10, cw = (w - gap * (c - 1)) / c, ch = (hh - gap * (rws - 1)) / rws;
    tops.forEach((t, i) => kids.push(label(x + (i % c) * (cw + gap), y + Math.floor(i / c) * (ch + gap), cw, ch, t.text, 'rect', i, subsOf(i))));
  } else {
    const gap = 10, ch = (hh - gap * (n - 1)) / n;
    tops.forEach((t, i) => kids.push(label(x, y + i * (ch + gap), w, ch, t.text, 'roundRect', i, subsOf(i))));
  }
  return { id: newId('grp'), kind: 'group', name: `Diagram (${DIAGRAM_KINDS.find((d) => d.id === kind)?.label || kind})`, x, y, w, h: hh, children: kids };
}

export function outlineItems(paras: Paragraph[]): { text: string; level: number }[] {
  return paras.map((p) => ({ text: p.runs.map((r) => r.text).join('').trim(), level: p.level })).filter((i) => i.text);
}

// ------------------------------------------------------------------------------------------
// Code blocks and equations

const KEYWORDS: Record<string, RegExp> = {
  js: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|of|in|typeof|null|undefined|true|false|this)\b/,
  ts: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|of|in|typeof|null|undefined|true|false|this|interface|type|enum|implements|extends|readonly|public|private)\b/,
  py: /\b(def|return|if|elif|else|for|while|class|import|from|as|try|except|raise|with|lambda|None|True|False|and|or|not|in|is|pass|yield|async|await)\b/,
  css: /\b(color|background|margin|padding|display|flex|grid|font|border|width|height|position)\b/,
  html: /<\/?[a-z][a-z0-9-]*/,
  json: /"(?:[^"\\]|\\.)*"(?=\s*:)/,
};

export function highlightCode(code: string, lang: string): Paragraph[] {
  const kw = KEYWORDS[lang];
  return code.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    const runs: Run[] = [];
    const tokens = line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*$|#.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|<\/?[a-z][a-z0-9-]*)/);
    for (const t of tokens) {
      if (!t) continue;
      let color = '#D4D4D4';
      if (/^["']/.test(t)) color = '#CE9178';
      else if ((t.startsWith('//') && lang !== 'py') || (t.startsWith('#') && lang === 'py')) color = '#6A9955';
      else if (/^\d/.test(t)) color = '#B5CEA8';
      else if (kw && kw.test(t) && (kw.exec(t)?.[0] === t)) color = '#569CD6';
      const last = runs[runs.length - 1];
      if (last && last.color === color) last.text += t; else runs.push({ text: t, color, font: 'Cousine', size: 16 });
    }
    return { level: 0, align: 'l' as const, bullet: { kind: 'none' as const }, marL: 0, indent: 0, runs };
  });
}

const LATEX: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  sum: '∑', prod: '∏', int: '∫', oint: '∮', partial: '∂', nabla: '∇', infty: '∞', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', leq: '≤', geq: '≥', neq: '≠', approx: '≈', equiv: '≡', propto: '∝',
  le: '≤', ge: '≥', ne: '≠', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', sqrt: '√', degree: '°', ldots: '…', cdots: '⋯', angle: '∠', perp: '⊥',
};
const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', o: 'ₒ', x: 'ₓ' };

/** Converts common LaTeX notation to linear Unicode math. */
export function latexToUnicode(src: string): string {
  let s = src.trim().replace(/^\$+|\$+$/g, '');
  for (let k = 0; k < 4; k++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `(${a})/(${b})`);
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  s = s.replace(/\\([A-Za-z]+)/g, (m, w) => LATEX[w] ?? m);
  const conv = (map: Record<string, string>, t: string) => ([...t].every((ch) => map[ch]) ? [...t].map((ch) => map[ch]).join('') : null);
  s = s.replace(/\^\{([^{}]*)\}|\^(\S)/g, (m, a, b) => conv(SUP, a ?? b) ?? `^(${a ?? b})`);
  s = s.replace(/_\{([^{}]*)\}|_(\S)/g, (m, a, b) => conv(SUB, a ?? b) ?? `_(${a ?? b})`);
  return s.replace(/[{}]/g, '').replace(/\\,|\\;|\\ /g, ' ');
}

const SYMBOLS = '©®™§¶†‡•…–—‘’“”«»‹›°±×÷≈≠≤≥∞√∑∏∫∂∆∇πΩµαβγδθλσφψω€£¥¢₹₽←↑→↓↔⇐⇒⇔✓✔✗✘★☆♠♣♥♦♪♫☎✉☀☁☂☃⌘⌥⇧⏎½⅓¼¾⅛²³¹ºª¿¡'.split('');
const EMOJI = '😀😃😄😁😆😊😉😍🤔😎🥳😢😮👍👎👏🙌🙏💪👀🎉🎯🚀💡🔥⭐✨✅❌⚠️❓❗💬📈📉📊📌📎📅⏰🔒🔑🏆🎓🧠❤️💙💚💛🌍🌱☕🍎🎵📷🎬💻📱🖥️🛠️⚙️🔍'.match(/\p{Extended_Pictographic}️?/gu) || [];

async function gridPicker(title: string, chars: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let chosen: string | null = null;
    const grid = h('div', { class: 'ql-symbol-grid', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(36px,1fr));gap:4px;max-height:50vh;overflow:auto' },
      ...chars.map((c) => h('button', { class: 'ql-btn', style: 'font-size:20px;padding:4px', title: `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`, onclick: () => { chosen = c; (document.querySelector('.ql-overlay:last-of-type .ql-dialog-foot .ql-primary') as HTMLElement | null)?.click(); } }, c)));
    openDialog({ title, content: grid, ok: 'Insert', fields: [{ key: 'custom', label: 'Or type characters', type: 'text', value: '' }] }).then((r) => resolve(r ? (chosen || r.custom || null) : null));
  });
}

// ------------------------------------------------------------------------------------------
// Links and actions

async function linkDialog(app: App, title: string, cur: Hyperlink | undefined, actions: boolean): Promise<Hyperlink | null | undefined> {
  const slides = app.deck.slides.map((s, i) => ({ value: s.id, label: `${i + 1}. ${slideTitle(s) || '(untitled)'}` }));
  const kinds = [{ value: 'none', label: 'None (remove link)' }, { value: 'url', label: 'Web page or file address' }, { value: 'slide', label: 'A slide in this presentation' },
    ...(actions ? [{ value: 'next', label: 'Next slide' }, { value: 'prev', label: 'Previous slide' }, { value: 'first', label: 'First slide' }, { value: 'last', label: 'Last slide' }, { value: 'end', label: 'End show' }] : [])];
  const kind = cur?.url ? 'url' : cur?.slide ? 'slide' : cur?.action || (actions ? 'next' : 'url');
  const r = await openDialog({
    title, fields: [
      { key: 'kind', label: 'Link to', type: 'select', options: kinds, value: kind },
      { key: 'url', label: 'Address', type: 'text', value: cur?.url || 'https://', visibleIf: (v) => v.kind === 'url' },
      { key: 'slide', label: 'Slide', type: 'select', options: slides, value: cur?.slide || slides[0]?.value, visibleIf: (v) => v.kind === 'slide' },
      { key: 'tip', label: 'ScreenTip', type: 'text', value: cur?.tip || '' },
    ],
  });
  if (!r) return undefined;
  if (r.kind === 'none') return null;
  if (r.kind === 'url') { const u = String(r.url).trim(); if (!/^(https?|mailto|tel|ftp):/i.test(u)) { toast('Enter an address that starts with https://, http://, mailto: or tel:.'); return undefined; } return { url: u, ...(r.tip ? { tip: r.tip } : {}) }; }
  if (r.kind === 'slide') return { slide: r.slide, ...(r.tip ? { tip: r.tip } : {}) };
  return { action: r.kind, ...(r.tip ? { tip: r.tip } : {}) };
}

const ACTION_BUTTONS: { geom: string; label: string; link: Hyperlink }[] = [
  { geom: 'actionButtonBackPrevious', label: 'Back or Previous', link: { action: 'prev' } },
  { geom: 'actionButtonForwardNext', label: 'Forward or Next', link: { action: 'next' } },
  { geom: 'actionButtonBeginning', label: 'Beginning', link: { action: 'first' } },
  { geom: 'actionButtonEnd', label: 'End', link: { action: 'last' } },
  { geom: 'actionButtonHome', label: 'Home', link: { action: 'first' } },
  { geom: 'actionButtonReturn', label: 'Return', link: { action: 'prev' } },
  { geom: 'actionButtonBlank', label: 'Blank', link: { action: 'next' } },
];

// ------------------------------------------------------------------------------------------
// Media

async function insertMediaFile(app: App, kind: 'video' | 'audio'): Promise<void> {
  const files = await pickFile(kind === 'video' ? 'video/*,.mp4,.webm,.mov,.m4v,.ogv' : 'audio/*,.mp3,.m4a,.wav,.ogg,.oga,.aac,.flac', false);
  const f = files[0];
  if (!f) return;
  if (f.size > 200 * 1024 * 1024) { toast('That file is larger than 200 MB; compress it first.'); return; }
  const url = await readFileAsDataURL(f);
  const { mime, b64 } = dataUrlParts(url);
  const media = app.deck.addMedia({ mime: f.type || mime, b64, name: f.name });
  let size = kind === 'video' ? { w: 640, h: 360 } : { w: 64, h: 64 };
  if (kind === 'video' && typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
    size = await new Promise((res) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res({ w: v.videoWidth || 640, h: v.videoHeight || 360 }); v.onerror = () => res({ w: 640, h: 360 }); v.src = url; setTimeout(() => res({ w: 640, h: 360 }), 4000); });
  }
  const box = kind === 'video' ? fitBox(app, size.w, size.h, 0.7) : { x: app.deck.size.w / 2 - 24, y: app.deck.size.h / 2 - 24, w: 48, h: 48 };
  const el: MediaElement = { id: newId('med'), kind: 'media', mediaKind: kind, media, name: f.name, ...box };
  insertElement(app, el, kind === 'video' ? 'Insert Video' : 'Insert Audio');
}

async function recordAudio(app: App): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('This device cannot record audio here.'); return; }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('Microphone access was not allowed.'); return; }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const started = Date.now();
  const timer = h('div', { class: 'ql-msg', style: 'font-size:24px;text-align:center' }, '0:00');
  const iv = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); timer.textContent = `● ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 250);
  rec.start();
  const r = await openDialog({ title: 'Record Sound', content: timer, ok: 'Stop and Insert', cancel: 'Discard' });
  clearInterval(iv);
  await new Promise<void>((res) => { rec.onstop = () => res(); rec.stop(); });
  stream.getTracks().forEach((t) => t.stop());
  if (!r || !chunks.length) return;
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  const { b64 } = dataUrlParts(await readFileAsDataURL(blob));
  const media = app.deck.addMedia({ mime: blob.type, b64, name: 'Recorded sound' });
  insertElement(app, { id: newId('med'), kind: 'media', mediaKind: 'audio', media, name: 'Recorded Sound', x: app.deck.size.w / 2 - 24, y: app.deck.size.h / 2 - 24, w: 48, h: 48 }, 'Record Sound');
}

async function screenshot(app: App): Promise<void> {
  const md: any = navigator.mediaDevices;
  if (!md?.getDisplayMedia) { toast('Screen capture is not available on this device.'); return; }
  let stream: MediaStream;
  try { stream = await md.getDisplayMedia({ video: true }); } catch { return; }
  try {
    const v = document.createElement('video');
    v.srcObject = stream; v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 300));
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const url = c.toDataURL('image/png');
    const media = app.deck.addMedia({ mime: 'image/png', b64: url.split(',')[1], name: 'Screenshot' });
    insertElement(app, { id: newId('pic'), kind: 'picture', media, name: 'Screenshot', ...fitBox(app, c.width, c.height) } as PictureElement, 'Insert Screenshot');
  } finally { stream.getTracks().forEach((t) => t.stop()); }
}

// ------------------------------------------------------------------------------------------

async function insertPictures(app: App, files: File[]): Promise<void> {
  const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(f.name));
  if (!imgs.length) { if (files.length) toast('Those files are not pictures.'); return; }
  const els: PictureElement[] = [];
  for (const f of imgs) {
    const { media, size } = await pictureFromFile(app, f);
    const b = fitBox(app, size.w, size.h);
    const k = els.length * 16;
    els.push({ id: newId('pic'), kind: 'picture', media, name: f.name.replace(/\.[^.]+$/, ''), x: b.x + k, y: b.y + k, w: b.w, h: b.h });
  }
  edit(app, imgs.length > 1 ? 'Insert Pictures' : 'Insert Picture', (o) => { o.elements.push(...els); });
  app.tab.ui.select(els.map((e) => e.id));
}

def([
  {
    id: 'insert.shape', label: 'Shapes', icon: 'category', tab: 'Insert', group: 'Illustrations', kind: 'menu', edits: true, popular: true, isEnabled: hasOwner,
    tip: 'Draw a shape: pick one, then drag on the slide', keywords: 'rectangle oval arrow line star callout flowchart',
    run: (app, geom?: string) => {
      if (!geom) { app.ui.openCommandMenu(getCommand('insert.shape')!, app.ui.anchorFor('insert.shape')); return; }
      if (!GEOMETRY[geom]) { toast(`Unknown shape: ${geom}`); return; }
      const line = !!GEOMETRY[geom].open && /line|Connector/.test(geom);
      const interactive = !(app as any).recording && !(app as any).__noTool;
      armOrInsert(app, GEOMETRY[geom].label, (b) => newShape(app, geom, b, line ? { line: { fill: { type: 'solid', color: 'accent1' }, width: 1.5, ...(geom === 'straightConnector1' ? { tail: 'triangle' as const } : {}) } } : {}), !interactive, line);
    },
    menu: (app) => shapeMenu(app),
  },
  {
    id: 'insert.textBox', label: 'Text Box', icon: 'text_fields', tab: 'Insert', group: 'Text', edits: true, popular: true, isEnabled: hasOwner,
    tip: 'Draw a text box, then type',
    run: (app) => armOrInsert(app, 'Text Box', (b) => newTextBox(app, '', { ...b, h: Math.max(b.h, 30) }), !!app.recording),
  },
  {
    id: 'insert.picture', label: 'Pictures', icon: 'image', tab: 'Insert', group: 'Images', edits: true, popular: true, isEnabled: hasOwner,
    tip: 'Insert pictures from this device (PNG, JPEG, GIF, SVG, WebP)',
    run: async (app) => insertPictures(app, await pickFile('image/*', true)),
  },
  { id: 'insert.pictureFiles', label: 'Insert Dropped Pictures', icon: 'image', tab: 'Insert', group: 'Images', edits: true, internal: true, run: (app, files: File[]) => insertPictures(app, files || []) },
  {
    id: 'insert.photoAlbum', label: 'Photo Album', icon: 'photo_library', tab: 'Insert', group: 'Images', edits: true,
    tip: 'Pick several pictures: each one gets its own slide with its file name as the caption',
    run: async (app) => {
      const files = (await pickFile('image/*', true)).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      const r = await openDialog({ title: 'Photo Album', fields: [{ key: 'captions', label: 'Captions below pictures (file names)', type: 'checkbox', value: true }, { key: 'black', label: 'Black slide background', type: 'checkbox', value: false }] });
      if (!r) return;
      const d = app.deck;
      const blank = d.layoutByType('blank') || d.data.layouts[d.data.layouts.length - 1];
      const pics: { f: File; media: string; size: { w: number; h: number } }[] = [];
      for (const f of files) pics.push({ f, ...(await pictureFromFile(app, f)) });
      d.transact('Photo Album', () => {
        let at = Math.max(0, d.slideIndex(app.tab.current)) + 1;
        for (const p of pics) {
          const s = d.makeSlide(blank.id);
          const b = fitBox(app, p.size.w, p.size.h, r.captions ? 0.78 : 0.9);
          if (r.captions) b.y = Math.max(8, b.y - 20);
          s.elements.push({ id: newId('pic'), kind: 'picture', media: p.media, name: p.f.name, ...b } as PictureElement);
          if (r.captions) s.elements.push({ id: newId('sp'), kind: 'shape', geom: 'rect', textbox: true, x: 40, y: d.size.h - 50, w: d.size.w - 80, h: 30, text: { paras: [{ level: 0, align: 'ctr', runs: [{ text: p.f.name.replace(/\.[^.]+$/, ''), size: 18, ...(r.black ? { color: '#FFFFFF' } : {}) }] }] } });
          if (r.black) s.bg = { type: 'solid', color: '#000000' };
          d.data.slides.splice(at++, 0, s);
        }
      });
      app.goToSlide(d.slides[Math.max(0, d.slideIndex(app.tab.current)) + 1]?.id || app.tab.current);
    },
  },
  {
    id: 'insert.screenshot', label: 'Screenshot', icon: 'screenshot_monitor', tab: 'Insert', group: 'Images', edits: true,
    tip: 'Capture a screen or window and insert it as a picture', run: (app) => screenshot(app),
  },
  {
    id: 'insert.table', label: 'Table', icon: 'table', tab: 'Insert', group: 'Tables', edits: true, popular: true, isEnabled: hasOwner,
    tip: 'Insert a table',
    run: async (app, arg?: { rows: number; cols: number }) => {
      let rows = arg?.rows, cols = arg?.cols;
      if (!rows || !cols) {
        const r = await openDialog({ title: 'Insert Table', fields: [{ key: 'cols', label: 'Number of columns', type: 'number', value: 5, min: 1, max: 30 }, { key: 'rows', label: 'Number of rows', type: 'number', value: 2, min: 1, max: 100 }] });
        if (!r) return;
        rows = Math.max(1, Math.min(100, +r.rows || 2)); cols = Math.max(1, Math.min(30, +r.cols || 5));
      }
      const { w } = app.deck.size;
      insertElement(app, makeTable(rows, cols, { x: w * 0.07, y: app.deck.size.h * 0.27, w: w * 0.86, h: rows * 36 }), 'Insert Table');
    },
    menu: () => [...[2, 3, 4, 5, 6].map((r): MenuEntry => ({ id: 'insert.table', arg: { rows: r, cols: 3 }, label: `${r} × 3 table` })), { id: 'insert.table', label: 'Insert Table…' }],
  },
  {
    id: 'insert.drawTable', label: 'Draw Table', icon: 'border_all', tab: 'Insert', group: 'Tables', edits: true, isEnabled: hasOwner,
    tip: 'Drag on the slide to draw a 2 × 2 table', run: (app) => armOrInsert(app, 'Table', (b) => makeTable(2, 2, { ...b, w: Math.max(b.w, 96), h: Math.max(b.h, 48) }), !!app.recording),
  },
  {
    id: 'insert.chart', label: 'Chart', icon: 'bar_chart', tab: 'Insert', group: 'Illustrations', edits: true, popular: true, isEnabled: hasOwner,
    tip: 'Insert a chart; type or paste its data (first row: series names, first column: categories)',
    run: async (app, arg?: ChartType) => {
      const r = await openDialog({ title: 'Insert Chart', wide: true, fields: [
        { key: 'type', label: 'Chart type', type: 'select', options: CHART_TYPES.map((t) => ({ value: t.type, label: t.label })), value: arg || 'column' },
        { key: 'title', label: 'Chart title', type: 'text', value: 'Chart Title' },
        { key: 'data', label: 'Data (tab- or comma-separated)', type: 'textarea', rows: 7, value: SAMPLE_TSV },
      ] });
      if (!r) return;
      const { categories, series } = parseTsv(r.data);
      if (!series.length) { toast('The data needs a header row with at least one series.'); return; }
      const el: ChartElement = { id: newId('cht'), kind: 'chart', name: 'Chart', ...placeNew(app, app.deck.size.w * 0.6, app.deck.size.h * 0.6), chart: { type: r.type, title: r.title || undefined, categories, series, legend: 'b' } };
      insertElement(app, el, 'Insert Chart');
    },
    menu: () => CHART_TYPES.map((t) => ({ id: 'insert.chart', arg: t.type, label: t.label, icon: t.icon })),
  },
  {
    id: 'insert.diagram', label: 'Diagram', icon: 'account_tree', tab: 'Insert', group: 'Illustrations', edits: true, isEnabled: hasOwner,
    tip: 'Build a list, process, cycle, hierarchy, pyramid, matrix or timeline diagram from text (indent with Tab for details)',
    run: async (app, kind?: string) => {
      const sel = textTargets(app)[0];
      const items = sel?.text ? outlineItems(sel.text.paras) : [];
      const r = await openDialog({ title: 'Insert Diagram', fields: [
        { key: 'kind', label: 'Layout', type: 'select', options: DIAGRAM_KINDS.map((d) => ({ value: d.id, label: d.label })), value: kind || 'process' },
        { key: 'text', label: 'Items (one per line; a leading Tab makes a detail line)', type: 'textarea', rows: 8, value: items.length ? items.map((i) => '\t'.repeat(i.level) + i.text).join('\n') : 'Plan\nBuild\nTest\nLaunch' },
      ] });
      if (!r) return;
      const its = String(r.text).split('\n').map((l) => ({ level: /^\t*/.exec(l)![0].length || (/^ {2,}/.test(l) ? 1 : 0), text: l.trim() })).filter((i) => i.text);
      if (!its.length) return;
      insertElement(app, buildDiagram(app, r.kind, its), 'Insert Diagram');
    },
    menu: () => DIAGRAM_KINDS.map((d) => ({ id: 'insert.diagram', arg: d.id, label: d.label, icon: d.icon })),
  },
  {
    id: 'insert.slideZoom', label: 'Slide Zoom', icon: 'zoom_in_map', tab: 'Insert', group: 'Links', edits: true, isEnabled: (app) => app.deck.slides.length > 1,
    tip: 'Add a card that jumps to another slide during the show',
    run: async (app, slideId?: string) => {
      const d = app.deck;
      if (!slideId) {
        const r = await openDialog({ title: 'Slide Zoom', fields: [{ key: 's', label: 'Slide', type: 'select', options: d.slides.map((s, i) => ({ value: s.id, label: `${i + 1}. ${slideTitle(s) || '(untitled)'}` })) }] });
        if (!r) return;
        slideId = r.s;
      }
      const target = d.slide(slideId!);
      if (!target) return;
      const card = await zoomCard(app, target.id, placeNew(app, 240, 135));
      insertElement(app, card, 'Insert Slide Zoom');
    },
  },
  {
    id: 'insert.summaryZoom', label: 'Summary Zoom', icon: 'dashboard', tab: 'Insert', group: 'Links', edits: true, isEnabled: (app) => app.deck.slides.length > 1,
    tip: 'Add a new slide with a card for each section (or each titled slide) that jumps to it during the show',
    run: async (app) => {
      const d = app.deck;
      const targets = d.data.sections.length ? d.data.sections.map((s) => s.slides[0]).filter(Boolean) : d.slides.filter((s) => slideTitle(s)).slice(0, 12).map((s) => s.id);
      if (!targets.length) { toast('Add sections or slide titles first.'); return; }
      const lay = d.layoutByType('titleOnly') || d.data.layouts[0];
      const n = targets.length, c = Math.ceil(Math.sqrt(n * 16 / 9)), rws = Math.ceil(n / c);
      const W = d.size.w * 0.86, H = d.size.h * 0.62, gap = 14, cw = (W - gap * (c - 1)) / c, ch = Math.min((H - gap * (rws - 1)) / rws, cw * 9 / 16);
      const cards: Element[] = [];
      for (let i = 0; i < n; i++) cards.push(await zoomCard(app, targets[i], { x: d.size.w * 0.07 + (i % c) * (cw + gap), y: d.size.h * 0.3 + Math.floor(i / c) * (ch + gap), w: cw, h: ch }));
      d.transact('Summary Zoom', () => {
        const s = d.makeSlide(lay.id);
        const t = s.elements.find((e) => e.ph?.type === 'title') as ShapeElement | undefined;
        if (t) t.text = { paras: [{ level: 0, runs: [{ text: 'Summary' }] }] };
        s.elements.push(...cards);
        d.data.slides.splice(Math.max(0, d.slideIndex(app.tab.current)) + 1, 0, s);
        app.tab.current = s.id;
      });
    },
  },
  {
    id: 'insert.link', label: 'Link', icon: 'link', tab: 'Insert', group: 'Links', keys: ['Mod-k'], edits: true,
    tip: 'Link the selected text or object to a web page or a slide',
    isEnabled: (app) => app.selected.length > 0 || app.tab.ui.editingText,
    run: async (app) => {
      const editing = app.tab.ui.editingText;
      const el = app.selected[0];
      const cur = el?.link;
      const l = await linkDialog(app, 'Insert Link', cur, false);
      if (l === undefined) return;
      if (editing) { applyRun(app, { link: l?.url || (l?.slide ? `#slide:${l.slide}` : undefined) }, 'Insert Link'); return; }
      edit(app, 'Insert Link', () => { for (const e of app.selected) { if (l) e.link = l; else delete e.link; } });
    },
  },
  {
    id: 'insert.action', label: 'Action', icon: 'ads_click', tab: 'Insert', group: 'Links', edits: true, isEnabled: (app) => app.selected.length > 0,
    tip: 'What happens when the selected object is clicked during the show',
    run: async (app) => {
      const l = await linkDialog(app, 'Action Settings', app.selected[0]?.link, true);
      if (l === undefined) return;
      edit(app, 'Action', () => { for (const e of app.selected) { if (l) e.link = l; else delete e.link; } });
    },
  },
  {
    id: 'insert.actionButton', label: 'Action Buttons', icon: 'smart_button', tab: 'Insert', group: 'Links', kind: 'menu', edits: true, isEnabled: hasOwner,
    tip: 'Buttons that move through the show when clicked',
    run: (app, geom?: string) => {
      const ab = ACTION_BUTTONS.find((a) => a.geom === geom) || ACTION_BUTTONS[1];
      const { w: SW, h: SH } = app.deck.size;
      insertElement(app, newShape(app, ab.geom, { x: SW - 80, y: SH - 64, w: 54, h: 40 }, { link: { ...ab.link }, name: `Action Button: ${ab.label}`, alt: ab.label }), 'Insert Action Button');
    },
    menu: () => ACTION_BUTTONS.map((a) => ({ id: 'insert.actionButton', arg: a.geom, label: a.label })),
  },
  {
    id: 'insert.headerFooter', label: 'Header & Footer', icon: 'call_to_action', tab: 'Insert', group: 'Text', edits: true,
    tip: 'Date, slide number and footer text on slides',
    run: async (app) => {
      const hf = app.deck.data.hf || {};
      const r = await openDialog({ title: 'Header and Footer', fields: [
        { key: 'date', label: 'Date and time', type: 'checkbox', value: !!hf.date },
        { key: 'fixed', label: 'Fixed date (otherwise updates automatically)', type: 'checkbox', value: !!hf.dateFixed, visibleIf: (v) => v.date },
        { key: 'dateText', label: 'Fixed date text', type: 'text', value: hf.dateText || new Date().toLocaleDateString(), visibleIf: (v) => v.date && v.fixed },
        { key: 'num', label: 'Slide number', type: 'checkbox', value: !!hf.slideNum },
        { key: 'footer', label: 'Footer', type: 'checkbox', value: !!hf.footer },
        { key: 'footerText', label: 'Footer text', type: 'text', value: hf.footerText || '', visibleIf: (v) => v.footer },
        { key: 'hideTitle', label: "Don't show on title slide", type: 'checkbox', value: !!hf.hideOnTitle },
      ], ok: 'Apply to All' });
      if (!r) return;
      app.deck.transact('Header and Footer', () => {
        app.deck.data.hf = { date: !!r.date, dateFixed: !!r.fixed, dateText: r.dateText, slideNum: !!r.num, footer: !!r.footer, footerText: r.footerText, hideOnTitle: !!r.hideTitle };
      });
    },
  },
  {
    id: 'insert.decorativeText', label: 'Decorative Text', icon: 'format_shapes', tab: 'Insert', group: 'Text', edits: true, isEnabled: hasOwner,
    tip: 'Large styled text with a shadow',
    run: async (app, text?: string) => {
      const t = text ?? await promptDialog('Decorative Text', 'Text', 'Your text here');
      if (!t) return;
      const tb = newTextBox(app, '', placeNew(app, app.deck.size.w * 0.7, 90));
      tb.text = { autofit: 'resize', wrap: true, anchor: 'ctr', paras: [{ level: 0, align: 'ctr', runs: [{ text: t, size: 54, b: true, color: 'accent1' }] }] };
      tb.effects = { shadow: { color: '#000000', blur: 6, dist: 3, dir: 45, alpha: 0.35 } };
      tb.name = 'Decorative Text';
      insertElement(app, tb, 'Insert Decorative Text');
    },
  },
  {
    id: 'insert.dateTime', label: 'Date & Time', icon: 'event', tab: 'Insert', group: 'Text', edits: true, isEnabled: hasOwner,
    tip: 'Insert a date that updates automatically, or today\'s date as fixed text',
    run: async (app, how?: 'auto' | string) => {
      const now = new Date();
      const formats = [now.toLocaleDateString(), now.toLocaleDateString(undefined, { dateStyle: 'long' }), now.toLocaleDateString(undefined, { dateStyle: 'full' }), now.toISOString().slice(0, 10), now.toLocaleString(), now.toLocaleTimeString()];
      let pick = how;
      if (!pick) {
        const r = await openDialog({ title: 'Date and Time', fields: [{ key: 'f', label: 'Format', type: 'select', options: formats, value: formats[0] }, { key: 'auto', label: 'Update automatically', type: 'checkbox', value: true }] });
        if (!r) return;
        pick = r.auto ? 'auto' : r.f;
      }
      if (pick === 'auto') insertTextOrBox(app, now.toLocaleDateString(), { field: 'datetime' });
      else insertTextOrBox(app, pick!);
    },
  },
  {
    id: 'insert.slideNumber', label: 'Slide Number', icon: 'numbers', tab: 'Insert', group: 'Text', edits: true, isEnabled: hasOwner,
    tip: 'Insert the slide number as a field', run: (app) => insertTextOrBox(app, String(app.deck.slideIndex(app.tab.current) + 1), { field: 'slidenum' }),
  },
  {
    id: 'insert.codeBlock', label: 'Code Block', icon: 'code', tab: 'Insert', group: 'Text', edits: true, isEnabled: hasOwner, origin: 'reveal.js, Slidev',
    tip: 'Monospaced code on a dark panel with simple syntax coloring',
    run: async (app) => {
      const r = await openDialog({ title: 'Code Block', wide: true, fields: [
        { key: 'lang', label: 'Language', type: 'select', options: [{ value: 'js', label: 'JavaScript' }, { value: 'ts', label: 'TypeScript' }, { value: 'py', label: 'Python' }, { value: 'css', label: 'CSS' }, { value: 'html', label: 'HTML' }, { value: 'json', label: 'JSON' }, { value: 'text', label: 'Plain text' }], value: 'js' },
        { key: 'code', label: 'Code', type: 'textarea', rows: 12, value: 'function greet(name) {\n  return `Hello, ${name}!`;\n}' },
      ] });
      if (!r || !r.code) return;
      const paras = highlightCode(r.code, r.lang);
      const lines = paras.length;
      const box = placeNew(app, app.deck.size.w * 0.7, Math.min(app.deck.size.h * 0.8, lines * 20 + 24));
      insertElement(app, { id: newId('sp'), kind: 'shape', geom: 'roundRect', adj: { adj: 4000 }, name: `Code (${r.lang})`, ...box, fill: { type: 'solid', color: '#1E1E1E' }, line: { fill: { type: 'none' } }, text: { paras, anchor: 't', insets: [14, 12, 14, 12], autofit: 'shrink', wrap: false }, keep: { code: r.code, codeLang: r.lang } } as ShapeElement, 'Insert Code Block');
    },
  },
  {
    id: 'insert.stickyNote', label: 'Sticky Note', icon: 'sticky_note_2', tab: 'Insert', group: 'Text', edits: true, isEnabled: hasOwner, origin: 'Freeform, Miro',
    tip: 'A yellow note you can type on',
    run: (app) => {
      const el = newShape(app, 'rect', placeNew(app, 160, 160), { name: 'Sticky Note', fill: { type: 'solid', color: '#FFE97A' }, line: { fill: { type: 'none' } }, effects: { shadow: { color: '#000000', blur: 8, dist: 3, dir: 60, alpha: 0.25 } }, text: { anchor: 't', autofit: 'shrink', paras: [{ level: 0, runs: [] }], levels: [{ run: { size: 18, color: '#333333' } }] } });
      insertElement(app, el, 'Insert Sticky Note');
      app.tab.ui.editText?.(el.id);
    },
  },
  {
    id: 'insert.equation', label: 'Equation', icon: 'function', tab: 'Insert', group: 'Symbols', keys: ['Alt-='], edits: true, isEnabled: hasOwner,
    tip: 'Type an equation in LaTeX or linear notation; it is converted to Unicode math (linear layout, not a full 2-D equation editor)',
    run: async (app) => {
      const r = await openDialog({ title: 'Equation', fields: [{ key: 'src', label: 'LaTeX or linear math (e.g. E = mc^2, \\sum_{i=1}^n x_i, \\frac{a}{b})', type: 'text', value: '' }], onChange: (v, ctl) => ctl.setPreview(`<div style="font:28px 'Cambria Math','Caladea',serif;padding:8px">${latexToUnicode(v.src || '').replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</div>`), preview: true });
      if (!r || !r.src) return;
      const text = latexToUnicode(r.src);
      if (app.tab.ui.editingText) { document.execCommand('insertText', false, text); return; }
      const tb = newTextBox(app, '', placeNew(app, Math.min(app.deck.size.w * 0.8, 40 + text.length * 16), 50));
      tb.text!.paras = [{ level: 0, align: 'ctr', runs: [{ text, font: 'Cambria Math', i: false, size: 28 }] }];
      tb.name = 'Equation'; tb.alt = r.src;
      insertElement(app, tb, 'Insert Equation');
    },
  },
  {
    id: 'insert.symbol', label: 'Symbol', icon: 'special_character', tab: 'Insert', group: 'Symbols', edits: true, isEnabled: hasOwner,
    tip: 'Insert a symbol that is not on your keyboard',
    run: async (app) => { const c = await gridPicker('Symbol', SYMBOLS); if (c) insertTextOrBox(app, c); },
  },
  {
    id: 'insert.emoji', label: 'Emoji', icon: 'mood', tab: 'Insert', group: 'Symbols', edits: true, isEnabled: hasOwner,
    run: async (app) => { const c = await gridPicker('Emoji', EMOJI as string[]); if (c) insertTextOrBox(app, c); },
  },
  { id: 'insert.video', label: 'Video', icon: 'movie', tab: 'Insert', group: 'Media', edits: true, isEnabled: hasOwner, tip: 'Insert a video from this device', run: (app) => insertMediaFile(app, 'video') },
  { id: 'insert.audio', label: 'Audio', icon: 'music_note', tab: 'Insert', group: 'Media', edits: true, isEnabled: hasOwner, tip: 'Insert a sound from this device', run: (app) => insertMediaFile(app, 'audio') },
  { id: 'insert.recordAudio', label: 'Record Audio', icon: 'mic', tab: 'Insert', group: 'Media', edits: true, isEnabled: hasOwner, tip: 'Record from the microphone and insert the sound', run: (app) => recordAudio(app) },
]);

function shapeMenu(_app: App): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const g of SHAPE_GROUPS) {
    out.push({ heading: g });
    for (const [k, d] of Object.entries(GEOMETRY)) if (d.group === g) out.push({ id: 'insert.shape', arg: k, label: d.label });
  }
  return out;
}

async function zoomCard(app: App, slideId: string, box: { x: number; y: number; w: number; h: number }): Promise<ShapeElement> {
  const d = app.deck;
  const s = d.slide(slideId)!;
  const title = slideTitle(s) || `Slide ${d.slideIndex(slideId) + 1}`;
  const el: ShapeElement = { id: newId('sp'), kind: 'shape', geom: 'roundRect', adj: { adj: 6000 }, name: `Zoom: ${title}`, ...box, link: { slide: slideId, action: 'zoom', tip: title }, alt: `Go to ${title}`,
    fill: { type: 'solid', color: { s: 'accent1', lum: 0.8 } }, line: { fill: { type: 'solid', color: 'accent1' }, width: 1.5 },
    text: { anchor: 'b', autofit: 'shrink', paras: [{ level: 0, align: 'ctr', runs: [{ text: title, size: 16, b: true, color: 'tx1' }] }] } };
  // In a browser, the card shows a picture of the slide.
  try {
    if (typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
      const { slidePng } = await import('../export/images');
      const blob = await slidePng(d, s, { width: 480, type: 'image/jpeg', quality: 0.85 });
      const { b64 } = dataUrlParts(await readFileAsDataURL(blob));
      el.fill = { type: 'image', media: d.addMedia({ mime: 'image/jpeg', b64, name: `Zoom ${title}` }) };
      el.text = undefined;
    }
  } catch { /* keep the titled card */ }
  return el;
}

export { selection };
