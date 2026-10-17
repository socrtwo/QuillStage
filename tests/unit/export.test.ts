import { describe, it, expect } from 'vitest';
import { Deck } from '../../src/model/deck';
import { deckToPdf, jpegSize, pdfText, wrapText } from '../../src/export/pdf';
import { deckToHtmlShow, deckToStory } from '../../src/export/html';
import { parseRange, printPages } from '../../src/export/print';
import { slideOutline } from '../../src/export/outline';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const render = async () => JPEG;

function sample(n = 3): Deck {
  const d = Deck.blank();
  d.data.slides = [];
  for (let i = 0; i < n; i++) {
    const s = d.makeSlide(d.data.layouts[1].id);
    (s.elements[0] as any).text.paras = [{ level: 0, runs: [{ text: `Title ${i + 1} <b>&` }] }];
    (s.elements[1] as any).text.paras = [{ level: 0, runs: [{ text: 'First point' }] }, { level: 1, runs: [{ text: 'Detail' }] }];
    s.notes = [{ level: 0, runs: [{ text: `Notes for slide ${i + 1}` }] }];
    d.data.slides.push(s);
  }
  d.data.props.title = 'Quarterly “Review”';
  return d;
}

const latin = (b: Uint8Array) => { let s = ''; for (const c of b) s += String.fromCharCode(c); return s; };

function checkPdf(bytes: Uint8Array): { text: string; pages: number } {
  const text = latin(bytes);
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const sx = /startxref\n(\d+)\n%%EOF/.exec(text)!;
  const xrefAt = +sx[1];
  expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
  const m = /xref\n0 (\d+)\n/.exec(text.slice(xrefAt))!;
  const count = +m[1];
  const rows = text.slice(xrefAt + m[0].length).split('\n').slice(0, count);
  rows.slice(1).forEach((r, i) => {
    const off = +r.slice(0, 10);
    expect(text.slice(off, off + String(i + 1).length + 6)).toBe(`${i + 1} 0 obj`);
  });
  const pages = (text.match(/\/Type \/Page /g) || []).length;
  expect(text).toContain(`/Count ${pages}`);
  return { text, pages };
}

describe('PDF export', () => {
  it('reads JPEG dimensions', () => { expect(jpegSize(JPEG)).toEqual({ w: 32, h: 16 }); });

  it('writes one page per slide at the slide size', async () => {
    const d = sample(3);
    const { text, pages } = checkPdf(await deckToPdf(d, { render }));
    expect(pages).toBe(3);
    expect(text).toContain('/MediaBox [0 0 960 540]');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toContain('/Width 32 /Height 16');
    expect(text).toContain('/Title <FEFF');
  });

  it('writes one page per build step', async () => {
    const d = sample(2);
    const s = d.slides[0];
    s.anims = [{ id: 'a', target: s.elements[1].id, cls: 'entr', effect: 'fade', trigger: 'click', byPara: true }];
    const { pages } = checkPdf(await deckToPdf(d, { render, buildSteps: true }));
    expect(pages).toBe(3 + 1);
  });

  it('lays out handouts and skips hidden slides', async () => {
    const d = sample(8);
    d.slides[7].hidden = true;
    expect(checkPdf(await deckToPdf(d, { kind: 'handouts', perPage: 6, render })).pages).toBe(2);
    expect(checkPdf(await deckToPdf(d, { kind: 'handouts', perPage: 3, render, hidden: true })).pages).toBe(3);
    const a4 = checkPdf(await deckToPdf(d, { kind: 'handouts', perPage: 9, render, paper: 'a4' }));
    expect(a4.pages).toBe(1);
    expect(a4.text).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('writes notes pages, continuing long notes', async () => {
    const d = sample(2);
    d.slides[1].notes = [{ level: 0, runs: [{ text: 'word '.repeat(3000) }] }];
    const { text, pages } = checkPdf(await deckToPdf(d, { kind: 'notes', render }));
    expect(pages).toBeGreaterThan(2);
    expect(text).toContain('(Notes for slide 1) Tj');
  });

  it('writes the outline as text without rendering slides', async () => {
    const d = sample(2);
    const { text, pages } = checkPdf(await deckToPdf(d, { kind: 'outline' }));
    expect(pages).toBe(1);
    expect(text).toContain('(1. Title 1 <b>&) Tj');
    expect(text).toContain('Helvetica-Bold');
    expect(text).not.toContain('/XObject');
  });

  it('encodes WinAnsi text and wraps lines', () => {
    expect(pdfText('a(b)\\c “q” – €')).toBe('(a\\(b\\)\\\\c \x93q\x94 \x96 \x80)');
    expect(pdfText('漢')).toBe('(?)');
    const lines = wrapText('alpha beta gamma delta epsilon', 12, 60);
    expect(lines.length).toBeGreaterThan(2);
    expect(wrapText('x'.repeat(200), 12, 50).length).toBeGreaterThan(3);
  });
});

describe('HTML exports', () => {
  it('writes a self-contained show with every visible slide', () => {
    const d = sample(3);
    d.slides[2].hidden = true;
    d.slides[0].transition = { type: 'fade', advAfter: 3000 };
    const html = deckToHtmlShow(d);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Quarterly “Review”</title>');
    expect((html.match(/<section class="slide"/g) || []).length).toBe(2);
    expect(html).toContain('Title 1 &lt;b&gt;&amp;');
    expect(html).not.toContain('Title 1 <b>');
    const plan = JSON.parse(/<script type="application\/json" id="plan">([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(plan).toHaveLength(2);
    expect(plan[0].adv).toBe(3000);
    expect(plan[0].notes).toBe('Notes for slide 1');
  });

  it('serializes build steps as hidden lists', () => {
    const d = sample(1);
    const s = d.slides[0];
    s.anims = [{ id: 'a', target: s.elements[1].id, cls: 'entr', effect: 'fly', trigger: 'click', byPara: true }];
    const html = deckToHtmlShow(d);
    const plan = JSON.parse(/id="plan">([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(plan[0].hidden).toHaveLength(3);
    expect(plan[0].hidden[0]).toHaveLength(2);
    expect(plan[0].hidden[2]).toHaveLength(0);
  });

  it('writes a story page', () => {
    const d = sample(2);
    const html = deckToStory(d);
    expect(html).toContain('<title>Quarterly “Review”</title>');
    expect((html.match(/<section id="slide-/g) || []).length).toBe(2);
    expect(html).toContain('<h2>Title 2 &lt;b&gt;&amp;</h2>');
    expect(html).toContain('<li class="l1">Detail</li>');
    expect(html).toContain('<aside>Notes for slide 2</aside>');
  });
});

describe('printing', () => {
  it('parses slide ranges', () => {
    expect([...parseRange('1-3, 5, 9-7, x', 8)!]).toEqual([1, 2, 3, 5, 7, 8]);
    expect(parseRange('', 5)).toBeNull();
  });

  it('builds print pages', () => {
    const d = sample(7);
    expect(printPages(d, { what: 'slides' }).pages).toHaveLength(7);
    expect(printPages(d, { what: 'slides', range: '2-3' }).pages).toHaveLength(2);
    expect(printPages(d, { what: 'handouts', perPage: 4 }).pages).toHaveLength(2);
    expect(printPages(d, { what: 'notes' }).pages).toHaveLength(7);
    const o = printPages(d, { what: 'outline' });
    expect(o.pages).toHaveLength(1);
    expect(o.pages[0]).toContain('Title 3 &lt;b&gt;');
    expect(printPages(d, { what: 'slides' }).css).toContain('size: 960pt 540pt');
  });

  it('extracts a slide outline', () => {
    const o = slideOutline(sample(1).slides[0]);
    expect(o.title).toBe('Title 1 <b>&');
    expect(o.body).toEqual([{ level: 0, text: 'First point' }, { level: 1, text: 'Detail' }]);
  });
});
