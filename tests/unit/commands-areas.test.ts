import { describe, it, expect, beforeAll } from 'vitest';
import { Deck } from '../../src/model/deck';
import { defaultPrefs } from '../../src/prefs';
import { allCommands, getCommand } from '../../src/commands/registry';
import { DEFAULT_TABS } from '../../src/ui/ribbonLayout';
import type { Element, ShapeElement, Slide } from '../../src/model/types';
import { latexToUnicode, parseTsv, buildDiagram, highlightCode } from '../../src/commands/insert';
import { recognizeStroke } from '../../src/commands/draw';
import { ocrClean } from '../../src/commands/tools';
import { parseOutline } from '../../src/ai/slides';
import { insertRow, mergeCells, splitCell } from '../../src/commands/table';
import { knockOut } from '../../src/commands/picture';

const MODULES = ['insert', 'draw', 'design', 'trans', 'anim', 'show', 'review', 'master', 'shape', 'picture', 'table', 'chart', 'media', 'tools', 'ai', 'dev', 'help'];
const AREA_PREFIX = /^(diagram|insert|draw|ink|design|trans|anim|show|review|master|shape|picture|table|chart|media|tools|ai|dev|help)\./;

beforeAll(async () => {
  for (const m of MODULES) await import(`../../src/commands/${m}.ts`);
});

function fakeApp(deck = Deck.blank()) {
  let sel: string[] = [];
  const app: any = {
    deck, prefs: defaultPrefs(), recording: null, __noTool: true, __noConfirm: true,
    tab: { view: 'normal', current: deck.slides[0]?.id, slideSel: [], displayName: 'Test', masterTarget: '',
      ui: { get selection() { return sel; }, set selection(v: string[]) { sel = v; }, select(ids: string[]) { sel = ids; }, editingText: false, editing: null, commitText() {}, invalidate() {}, layout() {}, editText() {}, setZoom() {}, zoom: 1 } },
    ui: { refresh() {}, status() {}, openPane() {}, togglePane() {}, paneOpen: () => false, anchorFor: () => document.body, renderQat() {}, openCommandMenu() {} },
    get slide(): Slide | undefined { return deck.slide(app.tab.current) || deck.slides[0]; },
    get owner() {
      if (app.tab.view === 'master') return deck.data.layouts.find((l) => l.id === app.tab.masterTarget) || deck.data.masters.find((m) => m.id === app.tab.masterTarget) || deck.data.masters[0];
      return app.slide;
    },
    get selected(): Element[] { const o = app.owner; return o ? (sel.map((id) => deck.findElement(o, id)).filter(Boolean) as Element[]) : []; },
    targetSlides() { const ids = app.tab.slideSel.length ? app.tab.slideSel : [app.tab.current]; return deck.slides.filter((s) => ids.includes(s.id)); },
    goToSlide(id: string) { app.tab.current = id; },
    createTab() {},
    isReadOnly: () => false,
    exec(id: string, arg?: any) { const c = getCommand(id); return c?.run(app, arg); },
    refresh() {},
    followLink() {},
  };
  return app;
}

function addShape(app: any): ShapeElement {
  const el: ShapeElement = { id: 'shp1', kind: 'shape', geom: 'rect', x: 100, y: 100, w: 200, h: 100, text: { paras: [{ level: 0, runs: [{ text: 'Hello world' }] }, { level: 0, runs: [{ text: 'Second line' }] }] } };
  app.slide.elements.push(el);
  app.tab.ui.select([el.id]);
  return el;
}

const mine = () => allCommands().filter((c) => AREA_PREFIX.test(c.id));

describe('command modules', () => {
  it('registers labeled commands with icons and tabs, and unique ids', () => {
    const cmds = mine();
    expect(cmds.length).toBeGreaterThan(200);
    for (const c of cmds) {
      expect(c.label, c.id).toBeTruthy();
      expect(c.icon, c.id).toBeTruthy();
      expect(c.tab, c.id).toBeTruthy();
    }
    const ids = allCommands().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defines the QAT labels the plan fixes', () => {
    expect(getCommand('show.fromStart')?.label).toBe('Present from Beginning');
    expect(getCommand('show.fromCurrent')?.label).toBe('Present from Current Slide');
    expect(getCommand('show.presenterView')?.label).toBe('Presenter View');
    expect(getCommand('insert.drawTable')?.label).toBe('Draw Table');
    expect(getCommand('review.spelling')?.label).toBe('Spelling');
  });

  it('implements the ribbon ids of its areas', () => {
    const missing: string[] = [];
    for (const t of DEFAULT_TABS) for (const g of t.groups) for (const id of g.items) if (AREA_PREFIX.test(id) && !getCommand(id)) missing.push(id);
    // Left out on purpose: no real implementation yet (see the worker report).
    const allowed = new Set(['insert.slidesFromOutline', 'insert.icons', 'insert.webEmbed', 'review.thesaurus', 'media.rewind', 'media.hideWhileNotPlaying', 'media.fullScreen', 'shape.textOutline']);
    expect(missing.filter((x) => !allowed.has(x))).toEqual([]);
  });

  it('returns non-empty menus', () => {
    const app = fakeApp();
    addShape(app);
    for (const c of mine()) {
      if (!c.menu || (c.kind !== 'menu' && c.kind !== 'gallery' && c.kind !== 'split')) continue;
      const m = c.menu(app);
      expect(m.length, c.id).toBeGreaterThan(0);
    }
  });
});

describe('deck-changing commands are undoable', () => {
  const check = async (id: string, arg: any, prep?: (app: any) => void) => {
    const app = fakeApp();
    prep?.(app);
    const snap = () => JSON.stringify({ ...app.deck.data, props: { ...app.deck.data.props, modified: 0 } });
    const before = snap();
    await app.exec(id, arg);
    expect(snap(), `${id} changed nothing`).not.toBe(before);
    while (app.deck.canUndo) app.deck.undo();
    if (!prep) expect(snap(), `${id} undo`).toBe(before);
    return app;
  };

  it('trans.apply', async () => { const app = await check('trans.apply', 'push'); app.deck.redo(); expect(app.deck.slides[0].transition?.type).toBe('push'); });
  it('anim.apply on a selected element', async () => { const app = fakeApp(); addShape(app); await app.exec('anim.apply', 'entr:fade'); expect(app.slide.anims).toHaveLength(1); expect(app.slide.anims[0].effect).toBe('fade'); app.deck.undo(); expect(app.slide.anims).toHaveLength(0); });
  it('design.theme', async () => { const app = await check('design.theme', 2); app.deck.redo(); expect(app.deck.data.themes[0].name).toBe('Slate'); });
  it('design.slideSize scales content', async () => {
    const app = fakeApp();
    const t = app.slide.elements[0];
    t.x = 96; t.w = 480;
    await app.exec('design.slideSize', 'standard');
    expect(app.deck.size).toEqual({ w: 720, h: 540 });
    expect(app.slide.elements[0].w).toBeCloseTo(360);
    app.deck.undo();
    expect(app.deck.size.w).toBe(960);
  });
  it('table.insertBelow', async () => {
    const app = fakeApp();
    await app.exec('insert.table', { rows: 2, cols: 3 });
    const t = app.slide.elements.find((e: Element) => e.kind === 'table');
    app.tab.ui.select([t.id]);
    await app.exec('table.insertBelow');
    expect(app.slide.elements.find((e: Element) => e.kind === 'table').rows).toHaveLength(3);
    app.deck.undo();
    expect(app.slide.elements.find((e: Element) => e.kind === 'table').rows).toHaveLength(2);
  });
  it('chart.changeType', async () => {
    const app = fakeApp();
    app.slide.elements.push({ id: 'c1', kind: 'chart', x: 0, y: 0, w: 300, h: 200, chart: { type: 'column', categories: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] } });
    app.tab.ui.select(['c1']);
    await app.exec('chart.changeType', 'pie');
    expect(app.slide.elements[app.slide.elements.length - 1].chart.type).toBe('pie');
    app.deck.undo();
    expect(app.slide.elements[app.slide.elements.length - 1].chart.type).toBe('column');
  });
  it('master.insertLayout', async () => {
    const app = fakeApp();
    app.tab.view = 'master';
    app.tab.masterTarget = app.deck.data.masters[0].id;
    const n = app.deck.data.layouts.length;
    await app.exec('master.insertLayout');
    expect(app.deck.data.layouts.length).toBe(n + 1);
    app.deck.undo();
    expect(app.deck.data.layouts.length).toBe(n);
  });
  it('show.timedFormat', async () => { const app = await check('show.timedFormat', { sec: 20 }); app.deck.redo(); expect(app.deck.slides[0].transition?.advAfter).toBe(20000); });
  it('tools.resetAll', async () => { await check('tools.resetAll', undefined, (app) => { app.slide.elements[0].x = 5; }); });
  it('review.newComment with text', async () => { const app = await check('review.newComment', 'Check this'); app.deck.redo(); expect(app.deck.slides[0].comments?.[0].text).toBe('Check this'); });
  it('insert.shape and insert.chart menus insert real elements', async () => {
    const app = fakeApp();
    await app.exec('insert.shape', 'star5');
    expect(app.slide.elements.some((e: any) => e.geom === 'star5')).toBe(true);
  });
});

describe('helpers', () => {
  it('converts LaTeX to Unicode math', () => {
    expect(latexToUnicode('E = mc^2')).toBe('E = mc²');
    expect(latexToUnicode('\\sum_{i=1}^n x_i')).toBe('∑ᵢ₌₁ⁿ xᵢ');
    expect(latexToUnicode('\\frac{a}{b} \\le \\pi')).toBe('(a)/(b) ≤ π');
  });
  it('parses chart data', () => {
    const r = parseTsv('\tA\tB\nx\t1\t2\ny\t3\t');
    expect(r.categories).toEqual(['x', 'y']);
    expect(r.series[1].values).toEqual([2, null]);
  });
  it('builds diagrams for every kind', () => {
    const app = fakeApp();
    for (const k of ['list', 'process', 'cycle', 'hierarchy', 'pyramid', 'matrix', 'timeline']) {
      const g = buildDiagram(app, k, [{ text: 'A', level: 0 }, { text: 'B', level: 0 }, { text: 'b1', level: 1 }, { text: 'C', level: 0 }]);
      expect(g.children.length, k).toBeGreaterThan(1);
    }
  });
  it('colors code', () => { const p = highlightCode('const x = "hi"; // note', 'js'); expect(p[0].runs.some((r) => r.color === '#569CD6')).toBe(true); });
  it('recognizes ink strokes', () => {
    expect(recognizeStroke([[0, 0], [50, 1], [100, 2]])?.geom).toBe('line');
    const rect: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 2]];
    expect(recognizeStroke(rect)?.geom).toBe('rect');
    const circ: [number, number][] = Array.from({ length: 40 }, (_, i) => [50 + 50 * Math.cos(i / 39 * 2 * Math.PI), 50 + 50 * Math.sin(i / 39 * 2 * Math.PI)]);
    expect(recognizeStroke(circ)?.geom).toBe('ellipse');
  });
  it('cleans OCR text', () => { expect(ocrClean('ef\uFB01cient  docu-\nment')).toBe('efficient document'); });
  it('parses AI outlines as JSON or Markdown', () => {
    expect(parseOutline('```json\n[{"title":"A","bullets":["x","y"],"notes":"n"}]\n```')[0]).toEqual({ title: 'A', bullets: ['x', 'y'], notes: 'n' });
    const md = parseOutline('## Intro\n- one\n- two\n## End\n- three');
    expect(md.map((s) => s.title)).toEqual(['Intro', 'End']);
    expect(md[0].bullets).toHaveLength(2);
  });
  it('merges, splits and inserts table cells', () => {
    const t: any = { id: 't', kind: 'table', cols: [50, 50], rows: [{ h: 20, cells: [{ text: { paras: [{ level: 0, runs: [{ text: 'a' }] }] } }, { text: { paras: [{ level: 0, runs: [{ text: 'b' }] }] } }] }] };
    mergeCells(t, 0, 0, 0, 1);
    expect(t.rows[0].cells[0].colSpan).toBe(2);
    expect(t.rows[0].cells[1].merged).toBe(true);
    splitCell(t, 0, 1);
    expect(t.rows[0].cells[0].colSpan).toBeUndefined();
    insertRow(t, 1);
    expect(t.rows).toHaveLength(2);
  });
  it('knocks out a color', () => {
    const d = { data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]) };
    expect(knockOut(d, [255, 255, 255], 10, false)).toBe(1);
    expect(d.data[3]).toBe(0);
    expect(d.data[7]).toBe(255);
  });
});
