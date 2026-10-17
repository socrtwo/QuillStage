/** Draw tab: pens, highlighter, eraser, ink conversion, replay and visibility. */
import { def } from './registry';
import type { App } from '../app';
import type { ShapeElement, Slide } from '../model/types';
import { newId } from '../model/deck';
import { edit } from '../edit/ops';
import { colorMenu, openDialog, toast } from '../ui/dialog';
import { h } from '../ui/dom';
import { isSlide } from '../model/inherit';
import { slideSvg } from '../render/slide';

type Pen = 'pen' | 'pencil' | 'highlighter';
const pens: Record<Pen, { color: string; width: number }> = { pen: { color: '', width: 2.5 }, pencil: { color: '#444444', width: 1.25 }, highlighter: { color: '#FFEB3B', width: 14 } };
let lastPen: Pen = 'pen';

const canvasOf = (app: App): any => (app.tab?.ui as any)?.canvas;
const toolOf = (app: App) => canvasOf(app)?.tool as { kind: string; mode?: string } | null | undefined;
const onSlide = (app: App) => !!app.owner && isSlide(app.owner) && app.tab.view === 'normal';

function arm(app: App, pen: Pen | 'eraser'): void {
  const c = canvasOf(app);
  if (!c) return;
  if (pen === 'eraser') { c.setTool({ kind: 'ink', mode: 'eraser', color: '#000000', width: 8 }); return; }
  lastPen = pen;
  const p = pens[pen];
  c.setTool({ kind: 'ink', mode: pen === 'highlighter' ? 'highlighter' : 'pen', color: p.color || app.prefs.penColor, width: p.width });
}

/** Points of an SVG path made by the ink tool (M/Q/L absolute coordinates). */
export function pathPoints(d: string): [number, number][] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

/** Best-fitting simple shape for a stroke: line, rectangle, ellipse or triangle. */
export function recognizeStroke(pts: [number, number][]): { geom: string; x: number; y: number; w: number; h: number; flipH?: boolean; flipV?: boolean } | null {
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, hh = Math.max(...ys) - y;
  const diag = Math.hypot(w, hh) || 1;
  const [f, l] = [pts[0], pts[pts.length - 1]];
  const closed = Math.hypot(f[0] - l[0], f[1] - l[1]) / diag < 0.25;
  // Straightness: maximum distance of points from the first–last chord.
  const dx = l[0] - f[0], dy = l[1] - f[1], len = Math.hypot(dx, dy) || 1;
  const dev = Math.max(...pts.map(([px, py]) => Math.abs((px - f[0]) * dy - (py - f[1]) * dx) / len));
  if (!closed && dev / len < 0.12) return { geom: 'line', x, y, w, h: hh, flipH: dx < 0 !== dy < 0 ? true : undefined };
  if (!closed) return null;
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
  const ratio = Math.abs(area / 2) / Math.max(1, w * hh);
  const geom = ratio > 0.86 ? 'rect' : ratio > 0.62 ? 'ellipse' : 'triangle';
  return { geom, x, y, w: Math.max(w, 4), h: Math.max(hh, 4) };
}

def([
  {
    id: 'draw.select', label: 'Select', icon: 'arrow_selector_tool', tab: 'Draw', group: 'Tools', kind: 'toggle', edits: false, noRecord: true,
    tip: 'Stop drawing and select objects', run: (app) => canvasOf(app)?.setTool(null), isActive: (app) => !toolOf(app),
  },
  {
    id: 'draw.pen', label: 'Pen', icon: 'ink_pen', tab: 'Draw', group: 'Pens', kind: 'toggle', edits: false, noRecord: true, isEnabled: onSlide,
    tip: 'Draw on the slide with a pen', run: (app) => arm(app, 'pen'), isActive: (app) => toolOf(app)?.mode === 'pen' && lastPen === 'pen',
  },
  {
    id: 'draw.pencil', label: 'Pencil', icon: 'edit', tab: 'Draw', group: 'Pens', kind: 'toggle', edits: false, noRecord: true, isEnabled: onSlide,
    tip: 'Draw thin gray lines', run: (app) => arm(app, 'pencil'), isActive: (app) => toolOf(app)?.mode === 'pen' && lastPen === 'pencil',
  },
  {
    id: 'draw.highlighter', label: 'Highlighter', icon: 'ink_highlighter', tab: 'Draw', group: 'Pens', kind: 'toggle', edits: false, noRecord: true, isEnabled: onSlide,
    tip: 'Draw see-through highlights', run: (app) => arm(app, 'highlighter'), isActive: (app) => toolOf(app)?.mode === 'highlighter',
  },
  {
    id: 'draw.eraser', label: 'Eraser', icon: 'ink_eraser', tab: 'Draw', group: 'Tools', kind: 'toggle', edits: false, noRecord: true, isEnabled: onSlide,
    tip: 'Drag across ink strokes to erase them', run: (app) => arm(app, 'eraser'), isActive: (app) => toolOf(app)?.mode === 'eraser',
  },
  {
    id: 'draw.penColor', label: 'Pen Color', icon: 'palette', tab: 'Draw', group: 'Pens', kind: 'color', edits: false, noRecord: true,
    tip: 'Color of the current pen',
    run: async (app, arg?: string) => {
      let c: string | null | undefined = arg && arg !== 'menu' ? arg : await colorMenu(app.ui.anchorFor('draw.penColor'), { highlight: lastPen === 'highlighter' });
      if (!c) return;
      pens[lastPen].color = c;
      if (lastPen === 'pen') { app.prefs.penColor = c; app.savePrefs(); }
      arm(app, lastPen);
    },
  },
  {
    id: 'draw.penWidth', label: 'Thickness', icon: 'line_weight', tab: 'Draw', group: 'Pens', kind: 'menu', edits: false, noRecord: true,
    run: (app, w?: number) => { if (!w) return; pens[lastPen].width = w; arm(app, lastPen); },
    menu: () => [0.75, 1.5, 2.5, 4, 6, 10, 14, 20].map((w) => ({ id: 'draw.penWidth', arg: w, label: `${w} pt`, checked: pens[lastPen].width === w })),
  },
  {
    id: 'draw.withTouch', label: 'Draw with Touch', icon: 'touch_app', tab: 'Draw', group: 'Tools', kind: 'toggle', edits: false, noRecord: true, isEnabled: onSlide,
    tip: 'Fingers draw with the current pen (turn off to select and move with touch again)',
    run: (app) => { if (toolOf(app)?.kind === 'ink') canvasOf(app)?.setTool(null); else arm(app, lastPen); },
    isActive: (app) => toolOf(app)?.kind === 'ink',
  },
  {
    id: 'ink.toShape', label: 'Ink to Shape', icon: 'interests', tab: 'Draw', group: 'Convert', edits: true, isEnabled: (app) => onSlide(app) && !!(app.owner as Slide).ink?.length,
    tip: 'Turn the ink strokes on this slide into lines, rectangles, ovals and triangles where they fit',
    run: (app) => {
      let made = 0;
      edit(app, 'Ink to Shape', (o) => {
        if (!isSlide(o) || !o.ink) return;
        const keep: typeof o.ink = [];
        for (const s of o.ink) {
          const r = recognizeStroke(pathPoints(s.d));
          if (!r || s.highlighter) { keep.push(s); continue; }
          const line = r.geom === 'line';
          const el: ShapeElement = { id: newId('sp'), kind: 'shape', geom: r.geom, name: `Ink ${r.geom}`, x: r.x, y: r.y, w: r.w, h: r.h, ...(r.flipH ? { flipH: true } : {}),
            fill: line ? { type: 'none' } : { type: 'none' }, line: { fill: { type: 'solid', color: s.color }, width: s.width } };
          o.elements.push(el);
          made++;
        }
        o.ink = keep.length ? keep : undefined;
      });
      toast(made ? `Converted ${made} stroke(s) to shapes.` : 'No strokes looked like a line, rectangle, oval or triangle.');
    },
  },
  {
    id: 'ink.toggleVisibility', label: 'Hide Ink', icon: 'visibility_off', tab: 'Review', group: 'Ink', kind: 'toggle', edits: false, noRecord: true,
    tip: 'Hide or show ink on the slides while editing', run: (app) => { (app.tab as any).hideInk = !(app.tab as any).hideInk; app.tab.ui.invalidate(); },
    isActive: (app) => !!(app.tab as any)?.hideInk,
  },
  {
    id: 'ink.deleteAll', label: 'Delete All Ink on Slide', icon: 'delete_sweep', tab: 'Draw', group: 'Ink', edits: true, isEnabled: (app) => onSlide(app) && !!(app.owner as Slide).ink?.length,
    run: (app) => edit(app, 'Delete Ink', (o) => { if (isSlide(o)) o.ink = undefined; }),
  },
  {
    id: 'ink.replay', label: 'Ink Replay', icon: 'replay', tab: 'Draw', group: 'Ink', edits: false, noRecord: true, isEnabled: (app) => onSlide(app) && !!(app.owner as Slide).ink?.length,
    tip: 'Watch the ink on this slide being drawn again, stroke by stroke',
    run: async (app) => {
      const s = app.owner as Slide;
      const box = h('div', { style: 'width:min(80vw,900px)' });
      box.innerHTML = slideSvg(app.deck, s, { mode: 'show' });
      const svg = box.querySelector('svg')!;
      svg.setAttribute('style', 'width:100%;height:auto;display:block');
      const paths = [...svg.querySelectorAll('path[stroke-linecap="round"]')] as SVGPathElement[];
      const play = () => {
        let t = 0;
        for (const p of paths) {
          const len = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 500;
          p.style.strokeDasharray = `${len}`;
          p.style.strokeDashoffset = `${len}`;
          const dur = Math.min(2000, 200 + len * 2);
          p.animate?.([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, delay: t, fill: 'forwards' });
          t += dur;
        }
      };
      requestAnimationFrame(play);
      await openDialog({ title: 'Ink Replay', content: box, ok: 'Close', cancel: false, buttons: [{ label: 'Replay', onClick: () => play() }] });
    },
  },
]);
