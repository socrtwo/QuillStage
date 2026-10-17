import { describe, it, expect } from 'vitest';
import { Deck } from '../../src/model/deck';
import { slideSvg } from '../../src/render/slide';
import { levelStyle, resolveBox } from '../../src/model/inherit';
import { layoutText } from '../../src/render/text';
import { GEOMETRY, geometryPath } from '../../src/model/geometry';

describe('deck model', () => {
  it('creates a blank deck with a title slide built from the layout', () => {
    const d = Deck.blank();
    expect(d.slides).toHaveLength(1);
    const s = d.slides[0];
    expect(s.elements.map((e) => e.ph?.type)).toEqual(['ctrTitle', 'subTitle']);
    const box = resolveBox(d, s, s.elements[0]);
    expect(box.w).toBeGreaterThan(100);
  });

  it('inherits level styles from the master and layout', () => {
    const d = Deck.blank();
    const s = d.slides[0];
    const st = levelStyle(d, s, s.elements[0], 0);
    expect(st.run?.size).toBe(60);
    expect(st.align).toBe('ctr');
    const body = d.makeSlide(d.data.layouts[1].id);
    const bs = levelStyle(d, body, body.elements[1], 1);
    expect(bs.run?.size).toBe(24);
    expect(bs.bullet?.kind).toBe('char');
  });

  it('undoes and redoes slide-scoped and whole-document transactions', () => {
    const d = Deck.blank();
    const s = d.slides[0];
    d.transact('type', () => { (s.elements[0] as any).text.paras[0].runs = [{ text: 'Hello' }]; }, [s.id]);
    d.transact('add', () => { d.data.slides.push(d.makeSlide(d.data.layouts[1].id)); });
    expect(d.slides).toHaveLength(2);
    d.undo();
    expect(d.slides).toHaveLength(1);
    d.undo();
    expect((d.slides[0].elements[0] as any).text.paras[0].runs).toEqual([]);
    d.redo();
    expect((d.slides[0].elements[0] as any).text.paras[0].runs[0].text).toBe('Hello');
    d.redo();
    expect(d.slides).toHaveLength(2);
  });

  it('rolls back a failed transaction', () => {
    const d = Deck.blank();
    expect(() => d.transact('bad', () => { d.data.slides.length = 0; throw new Error('x'); })).toThrow();
    expect(d.slides).toHaveLength(1);
    expect(d.canUndo).toBe(false);
  });

  it('round-trips through JSON', () => {
    const d = Deck.blank();
    const j = JSON.parse(JSON.stringify(d.toJSON()));
    const e = Deck.fromJSON(j);
    expect(e.slides[0].id).toBe(d.slides[0].id);
  });
});

describe('rendering', () => {
  it('renders a slide to SVG with text', () => {
    const d = Deck.blank();
    const s = d.slides[0];
    (s.elements[0] as any).text.paras[0].runs = [{ text: 'Quarterly <Review> & Plan' }];
    const svg = slideSvg(d, s, { mode: 'show' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('Quarterly');
    expect(svg).toContain('&lt;Review&gt; &amp;');
    expect(svg).not.toContain('Click to add');
    expect(slideSvg(d, s, { mode: 'edit', prompts: true })).toContain('Click to add subtitle');
  });

  it('wraps and shrinks text', () => {
    const paras = [{ level: 0, runs: [{ text: 'word '.repeat(80) }] }];
    const r = layoutText(paras, { width: 200, height: 1000, styleFor: () => ({ run: { size: 20 } }), font: () => 'Carlito' });
    expect(r.lines.length).toBeGreaterThan(5);
    const s = layoutText(paras, { width: 200, height: 100, autofit: 'shrink', styleFor: () => ({ run: { size: 20 } }), font: () => 'Carlito' });
    expect(s.scale).toBeLessThan(1);
    expect(s.height).toBeLessThanOrEqual(100.5);
  });

  it('numbers paragraphs', () => {
    const paras = [1, 2, 3].map((i) => ({ level: 0, runs: [{ text: `Item ${i}` }] }));
    const r = layoutText(paras, { width: 400, height: 400, styleFor: () => ({ bullet: { kind: 'num', scheme: 'arabicPeriod' }, marL: 20, indent: -20, run: { size: 18 } }), font: () => 'Carlito' });
    expect(r.lines.map((l) => l.bullet?.text)).toEqual(['1.', '2.', '3.']);
  });

  it('draws every preset geometry', () => {
    for (const k of Object.keys(GEOMETRY)) {
      const { d } = geometryPath(k, 100, 60);
      expect(d, k).toMatch(/^M/);
      expect(d, k).not.toMatch(/NaN|undefined/);
    }
  });
});
