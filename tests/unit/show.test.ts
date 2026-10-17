import { describe, it, expect } from 'vitest';
import { Deck } from '../../src/model/deck';
import type { Animation, Slide } from '../../src/model/types';
import { buildSteps, stateAt, clickCount, EFFECTS, animationSummary, renderAnimatedSlide } from '../../src/render/animate';
import { TRANSITIONS, matchMorph } from '../../src/render/transitions';

function deckWith(anims: Omit<Animation, 'id'>[]): { deck: Deck; slide: Slide; a: string; b: string; c: string } {
  const deck = Deck.blank();
  const slide = deck.makeSlide(deck.data.layouts[1].id);
  deck.data.slides = [slide];
  const [title, body] = slide.elements as any[];
  title.text.paras = [{ level: 0, runs: [{ text: 'Title' }] }];
  body.text.paras = [0, 1, 2].map((i) => ({ level: 0, runs: [{ text: `Point ${i}` }] }));
  slide.elements.push({ id: 'pic', kind: 'shape', geom: 'rect', x: 10, y: 10, w: 50, h: 50 });
  slide.anims = anims.map((a, i) => ({ id: `a${i}`, ...a }));
  return { deck, slide, a: title.id, b: body.id, c: 'pic' };
}

describe('build steps', () => {
  it('groups click, with and after chains', () => {
    const { slide, a, c } = deckWith([]);
    slide.anims = [
      { id: '1', target: a, cls: 'entr', effect: 'fade', trigger: 'click', dur: 500 },
      { id: '2', target: c, cls: 'entr', effect: 'fly', trigger: 'with', dur: 400, delay: 100 },
      { id: '3', target: c, cls: 'emph', effect: 'spin', trigger: 'after', dur: 1000 },
      { id: '4', target: a, cls: 'exit', effect: 'fade', trigger: 'click', dur: 300 },
    ];
    const steps = buildSteps(slide);
    expect(steps).toHaveLength(3);
    expect(steps[0].effects).toHaveLength(0);
    expect(steps[1].effects.map((e) => [e.anim.id, e.start])).toEqual([['1', 0], ['2', 100], ['3', 500]]);
    expect(steps[1].length).toBe(1500);
    expect(clickCount(slide)).toBe(2);
    expect([...stateAt(slide, 0).hide].sort()).toEqual([a, c].sort());
    expect(stateAt(slide, 1).hide.size).toBe(2);
    expect(stateAt(slide, 2).hide.size).toBe(0);
    expect([...stateAt(slide, 3).hide]).toEqual([a]);
  });

  it('starts with-previous animations automatically', () => {
    const { slide, a } = deckWith([]);
    slide.anims = [{ id: '1', target: a, cls: 'entr', effect: 'appear', trigger: 'with' }];
    const steps = buildSteps(slide);
    expect(steps).toHaveLength(1);
    expect(steps[0].effects).toHaveLength(1);
    expect(stateAt(slide, 0).hide.has(a)).toBe(true);
    expect(stateAt(slide, 1).hide.has(a)).toBe(false);
  });

  it('builds text by paragraph, one click each', () => {
    const { slide, b } = deckWith([]);
    slide.anims = [{ id: '1', target: b, cls: 'entr', effect: 'fly', trigger: 'click', byPara: true }];
    const steps = buildSteps(slide);
    expect(steps).toHaveLength(4);
    expect(steps.slice(1).map((s) => s.effects[0].para)).toEqual([0, 1, 2]);
    expect([...stateAt(slide, 0).paraVisible.get(b)!]).toEqual([]);
    expect([...stateAt(slide, 3).paraVisible.get(b)!].sort()).toEqual([0, 1]);
    expect(stateAt(slide, 0).hide.has(b)).toBe(false);
  });

  it('chains by-paragraph after-previous builds in one step', () => {
    const { slide, b } = deckWith([]);
    slide.anims = [{ id: '1', target: b, cls: 'entr', effect: 'fade', trigger: 'after', byPara: true, dur: 200 }];
    const steps = buildSteps(slide);
    expect(steps).toHaveLength(1);
    expect(steps[0].effects.map((e) => e.start)).toEqual([0, 200, 400]);
  });

  it('ignores interactive triggers and missing targets', () => {
    const { slide, a } = deckWith([]);
    slide.anims = [{ id: '1', target: a, cls: 'entr', effect: 'fade', trigger: 'click', onShape: 'pic' }, { id: '2', target: 'gone', cls: 'entr', effect: 'fade', trigger: 'click' }];
    expect(buildSteps(slide)).toHaveLength(1);
  });

  it('renders paragraph layers for animation', () => {
    const { deck, slide, b } = deckWith([]);
    slide.anims = [{ id: '1', target: b, cls: 'entr', effect: 'fly', trigger: 'click', byPara: true }];
    const svg = renderAnimatedSlide(deck, slide, 1);
    const layers = svg.querySelectorAll(`g.qs-anim[data-for^="${b}#"]`);
    expect(layers).toHaveLength(3);
    expect([...layers].every((l) => (l as SVGGElement).style.visibility === 'hidden')).toBe(true);
    expect(svg.querySelector(`g.qs-anim[data-for="${b}"]`)).not.toBeNull();
  });
});

describe('galleries', () => {
  it('lists labeled effects and transitions without duplicates', () => {
    expect(EFFECTS.every((e) => e.label && e.icon)).toBe(true);
    const keys = EFFECTS.map((e) => `${e.cls}.${e.effect}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of ['entr', 'exit', 'emph', 'path']) expect(EFFECTS.some((e) => e.cls === c)).toBe(true);
    const types = TRANSITIONS.map((t) => t.type);
    expect(new Set(types).size).toBe(types.length);
    for (const t of ['none', 'cut', 'fade', 'push', 'wipe', 'split', 'reveal', 'cover', 'uncover', 'zoom', 'morph', 'cube', 'flip', 'gallery', 'clock']) expect(types).toContain(t);
    expect(TRANSITIONS.every((t) => t.label && t.icon)).toBe(true);
  });

  it('summarizes an animation', () => {
    expect(animationSummary({ id: 'x', target: 't', cls: 'entr', effect: 'fly', trigger: 'after', dur: 750, dir: 'l' }, 'Title 1')).toBe('Title 1 · Fly In (Entrance) · After Previous · 0.75 s · from left');
  });
});

describe('smooth morph matching', () => {
  it('matches by name, then text, then media and kind', () => {
    const deck = Deck.blank();
    const a = deck.makeSlide(deck.data.layouts[6].id);
    const b = deck.makeSlide(deck.data.layouts[6].id);
    a.elements = [
      { id: 'a1', kind: 'shape', geom: 'ellipse', name: '!!Sun' },
      { id: 'a2', kind: 'shape', geom: 'rect', text: { paras: [{ level: 0, runs: [{ text: 'Hello' }] }] } },
      { id: 'a3', kind: 'picture', media: 'm1' },
      { id: 'a4', kind: 'shape', geom: 'star5' },
      { id: 'a5', kind: 'shape', geom: 'heart' },
    ];
    b.elements = [
      { id: 'b4', kind: 'shape', geom: 'star5' },
      { id: 'b3', kind: 'picture', media: 'm1' },
      { id: 'b2', kind: 'shape', geom: 'roundRect', text: { paras: [{ level: 0, runs: [{ text: 'Hello' }] }] } },
      { id: 'b1', kind: 'shape', geom: 'rect', name: '!!Sun' },
      { id: 'b6', kind: 'shape', geom: 'cloud' },
    ];
    const pairs = new Map(matchMorph(a, b));
    expect(pairs.get('a1')).toBe('b1');
    expect(pairs.get('a2')).toBe('b2');
    expect(pairs.get('a3')).toBe('b3');
    expect(pairs.get('a4')).toBe('b4');
    expect(pairs.has('a5')).toBe(false);
  });
});
